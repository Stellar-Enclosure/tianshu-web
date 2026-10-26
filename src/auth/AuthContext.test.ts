import { createElement } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiClient from '../api/client'
import {ddcApi} from '../api/client'
import type {PermissionSnapshot} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {permissionSnapshot, gatewayIdentity, csrfFixture} from '../test/permissionFixture'
import { AuthProvider, gatewayAuth, useAuth } from './AuthContext'
import { renderWithQueryClient } from '../test/renderWithQueryClient'

type RequestContext = { tenantId?: string; sessionGeneration: number }

const requestContext = () => {
  const getter = (apiClient as unknown as Record<string, unknown>).getDdcRequestContext
  expect(getter).toBeTypeOf('function')
  if (typeof getter !== 'function') throw new Error('request context getter is unavailable')
  return (getter as () => RequestContext)()
}

const bootstrap = permissionSnapshot

function SessionProbe() {
  const auth = useAuth()
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'tenant' }, requestContext().tenantId ?? ''),
    createElement('span', { 'data-testid': 'generation' }, String(requestContext().sessionGeneration)),
    createElement('button', { onClick: () => void auth.login() }, 'start-login'),
    createElement('button', { onClick: () => void auth.logout() }, 'logout'),
  )
}

function GuardedSessionProbe({guard}: {guard: () => Promise<boolean>}) {
  const auth = useAuth()
  const guardedAuth = auth as unknown as {
    registerUnsavedChangesGuard: (callback: () => Promise<boolean>) => () => void
  }
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'tenant' }, auth.tenantId),
    createElement('span', { 'data-testid': 'generation' }, String(auth.sessionGeneration)),
    createElement('button', {
      onClick: () => guardedAuth.registerUnsavedChangesGuard(guard),
    }, 'register-guard'),
    createElement('button', {
      onClick: () => void auth.login(),
    }, 'guarded-login'),
    createElement('button', { onClick: () => void auth.logout() }, 'guarded-logout'),
  )
}

describe('AuthContext tenant session isolation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PERMISSION_NAMESPACE', 'default')
    vi.stubEnv('VITE_PERMISSION_ENVIRONMENT', 'local')
    vi.spyOn(gatewayAuth, 'identity').mockResolvedValue(gatewayIdentity())
    vi.spyOn(gatewayAuth, 'csrf').mockResolvedValue(csrfFixture())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects an otherwise well-formed permission view for a different verified subject', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue({...bootstrap('1001'), subject: 'other-subject'})
    const {unmount} = renderWithQueryClient(createElement(AuthProvider, null, createElement(SessionProbe)))
    await waitFor(() => expect(gatewayAuth.bootstrap).toHaveBeenCalledOnce())
    expect(requestContext().tenantId).toBeUndefined()
    unmount()
  })

  it('requires an explicit matching deployment catalog instead of accepting a missing namespace binding', async () => {
    vi.stubEnv('VITE_PERMISSION_NAMESPACE', '')
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))
    const {unmount} = renderWithQueryClient(createElement(AuthProvider, null, createElement(SessionProbe)))
    await waitFor(() => expect(gatewayAuth.bootstrap).toHaveBeenCalledOnce())
    expect(requestContext().tenantId).toBeUndefined()
    unmount()
  })

  it('derives the expected request tenant from the verified bootstrap', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))

    const { unmount } = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(SessionProbe)),
    )

    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    unmount()
  })

  it('clears local tenant state before OIDC navigation and trusts the returned bootstrap', async () => {
    const bootstraps = [bootstrap('1001'), bootstrap('2002')]
    vi.mocked(gatewayAuth.identity).mockResolvedValueOnce(gatewayIdentity('1001')).mockResolvedValueOnce(gatewayIdentity('2002'))
    vi.spyOn(gatewayAuth, 'bootstrap').mockImplementation(async () => bootstraps.shift() as PermissionSnapshot)
    const login = vi.spyOn(gatewayAuth, 'login').mockImplementation(() => {})

    const { queryClient, unmount } = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(SessionProbe)),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    const firstGeneration = requestContext().sessionGeneration
    const oldTenantQueryKey = ['tianshu', 'tenant', '1001', 'ai', 'resources'] as const
    queryClient.setQueryData(oldTenantQueryKey, { privateResource: 'tenant-1001' })
    let pendingSignal: AbortSignal | undefined
    const pendingQuery = queryClient.fetchQuery({
      queryKey: ['tianshu', 'tenant', '1001', 'ai', 'in-flight'],
      queryFn: ({signal}) => new Promise<never>((_resolve, reject) => {
        pendingSignal = signal
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), {once: true})
      }),
    }).catch(() => undefined)
    await waitFor(() => expect(pendingSignal).toBeDefined())

    fireEvent.click(screen.getByText('start-login'))

    await waitFor(() => expect(requestContext().tenantId).toBeUndefined())
    expect(requestContext().sessionGeneration).toBeGreaterThan(firstGeneration)
    expect(pendingSignal?.aborted).toBe(true)
    expect(queryClient.getQueryData(oldTenantQueryKey)).toBeUndefined()
    expect(login).toHaveBeenCalledWith()
    await pendingQuery
    unmount()

    renderWithQueryClient(
      createElement(AuthProvider, null, createElement(SessionProbe)),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('2002'))
  })

  it('rebootstraps on tenant mismatch without replaying the request', async () => {
    const bootstraps = [bootstrap('1001'), bootstrap('2002')]
    vi.mocked(gatewayAuth.identity).mockResolvedValueOnce(gatewayIdentity('1001')).mockResolvedValueOnce(gatewayIdentity('2002'))
    vi.spyOn(gatewayAuth, 'bootstrap').mockImplementation(
      async () => bootstraps.shift() as PermissionSnapshot,
    )
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(SessionProbe)),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    const firstGeneration = requestContext().sessionGeneration
    const oldTenantKey = ['tianshu', 'tenant', '1001', 'ai', 'resource', '810001'] as const
    queryClient.setQueryData(oldTenantKey, {privateValue: 'tenant-1001'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'TIANSHU_ADMIN_TENANT_MISMATCH',
      message: 'TIANSHU_ADMIN_TENANT_MISMATCH',
    }), {status: 403, headers: {'Content-Type': 'application/json'}})))

    await expect(ddcApi('/api/v1/tianshu/ai/resources/810001/draft', {
      method: 'PUT',
      body: {expectedRevision: '1'},
    })).rejects.toMatchObject({status: 403, code: 'TIANSHU_ADMIN_TENANT_MISMATCH'})
    await waitFor(() => expect(requestContext().tenantId).toBe('2002'))

    expect(requestContext().sessionGeneration).toBeGreaterThan(firstGeneration)
    expect(queryClient.getQueryData(oldTenantKey)).toBeUndefined()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('clears an expired session even when a dirty editor declines voluntary transitions', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))
    const guard = vi.fn().mockResolvedValue(false)
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(GuardedSessionProbe, {guard})),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    fireEvent.click(screen.getByText('register-guard'))
    const generation = requestContext().sessionGeneration
    const key = ['tianshu', 'tenant', '1001', 'private']
    queryClient.setQueryData(key, {privateValue: 'A'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {status: 401})))
    await expect(ddcApi('/api/v1/tianshu/registry')).rejects.toMatchObject({status: 401})
    await waitFor(() => expect(requestContext().tenantId).toBeUndefined())
    expect(requestContext().sessionGeneration).toBeGreaterThan(generation)
    expect(queryClient.getQueryData(key)).toBeUndefined()
    expect(guard).not.toHaveBeenCalled()
    unmount()
  })

  it('clears tenant query state and advances generation on logout', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))
    vi.spyOn(gatewayAuth, 'logout').mockResolvedValue({remoteState: 'CONFIRMED', status: 'LOCAL_CLOSED', operationId: '00000000-0000-0000-0000-000000000001', ssoLogoutUri: 'https://idp.example/tenants/1001/logout'})
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(SessionProbe)),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    const generation = requestContext().sessionGeneration
    const tenantKey = ['tianshu', 'tenant', '1001', 'ai', 'resources'] as const
    queryClient.setQueryData(tenantKey, [{id: '810001'}])

    fireEvent.click(screen.getByText('logout'))

    await waitFor(() => expect(requestContext().tenantId).toBeUndefined())
    expect(requestContext().sessionGeneration).toBeGreaterThan(generation)
    expect(queryClient.getQueryData(tenantKey)).toBeUndefined()
    expect(gatewayAuth.logout).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('keeps tenant session and query data when an unsaved-change guard declines login and logout', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))
    const login = vi.spyOn(gatewayAuth, 'login').mockImplementation(() => {})
    const logout = vi.spyOn(gatewayAuth, 'logout').mockResolvedValue({remoteState: 'CONFIRMED', status: 'LOCAL_CLOSED', operationId: '00000000-0000-0000-0000-000000000001', ssoLogoutUri: 'https://idp.example/tenants/1001/logout'})
    const guard = vi.fn().mockResolvedValue(false)
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(GuardedSessionProbe, {guard})),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    fireEvent.click(screen.getByText('register-guard'))
    const generation = requestContext().sessionGeneration
    const tenantKey = ['tianshu', 'tenant', '1001', 'ai', 'resources'] as const
    queryClient.setQueryData(tenantKey, [{id: '810001'}])

    fireEvent.click(screen.getByText('guarded-login'))

    await waitFor(() => expect(guard).toHaveBeenCalledTimes(1))
    expect(requestContext().tenantId).toBe('1001')
    expect(requestContext().sessionGeneration).toBe(generation)
    expect(queryClient.getQueryData(tenantKey)).toEqual([{id: '810001'}])
    expect(login).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('guarded-logout'))

    await waitFor(() => expect(guard).toHaveBeenCalledTimes(2))
    expect(requestContext().tenantId).toBe('1001')
    expect(requestContext().sessionGeneration).toBe(generation)
    expect(queryClient.getQueryData(tenantKey)).toEqual([{id: '810001'}])
    expect(logout).not.toHaveBeenCalled()
    unmount()
  })

  it('clears session once after a dirty guard approves logout', async () => {
    vi.spyOn(gatewayAuth, 'bootstrap').mockResolvedValue(bootstrap('1001'))
    const logout = vi.spyOn(gatewayAuth, 'logout').mockResolvedValue({remoteState: 'CONFIRMED', status: 'LOCAL_CLOSED', operationId: '00000000-0000-0000-0000-000000000001', ssoLogoutUri: 'https://idp.example/tenants/1001/logout'})
    const guard = vi.fn().mockResolvedValue(true)
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(GuardedSessionProbe, {guard})),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    fireEvent.click(screen.getByText('register-guard'))
    const generation = requestContext().sessionGeneration
    const tenantKey = ['tianshu', 'tenant', '1001', 'ai', 'resources'] as const
    queryClient.setQueryData(tenantKey, [{id: '810001'}])

    fireEvent.click(screen.getByText('guarded-logout'))

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(guard).toHaveBeenCalledTimes(1)
    expect(requestContext().tenantId).toBeUndefined()
    expect(requestContext().sessionGeneration).toBeGreaterThan(generation)
    expect(queryClient.getQueryData(tenantKey)).toBeUndefined()
    unmount()
  })

  it('clears mismatched tenant state immediately despite a declined dirty guard and never replays', async () => {
    const bootstraps = [bootstrap('1001'), bootstrap('2002')]
    vi.mocked(gatewayAuth.identity).mockResolvedValueOnce(gatewayIdentity('1001')).mockResolvedValueOnce(gatewayIdentity('2002'))
    const bootstrapMock = vi.spyOn(gatewayAuth, 'bootstrap').mockImplementation(
      async () => bootstraps.shift() as PermissionSnapshot,
    )
    const guard = vi.fn().mockResolvedValue(false)
    const {queryClient, unmount} = renderWithQueryClient(
      createElement(AuthProvider, null, createElement(GuardedSessionProbe, {guard})),
    )
    await waitFor(() => expect(requestContext().tenantId).toBe('1001'))
    fireEvent.click(screen.getByText('register-guard'))
    const generation = requestContext().sessionGeneration
    const tenantKey = ['tianshu', 'tenant', '1001', 'ai', 'resources'] as const
    const cachedResources = [{id: '810001', draft: 'private'}]
    queryClient.setQueryData(tenantKey, cachedResources)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'TIANSHU_ADMIN_TENANT_MISMATCH',
      message: 'TIANSHU_ADMIN_TENANT_MISMATCH',
    }), {status: 403, headers: {'Content-Type': 'application/json'}})))

    await expect(ddcApi('/api/v1/tianshu/ai/resources/810001/draft', {
      method: 'PUT',
      body: {expectedRevision: '3'},
    })).rejects.toMatchObject({status: 403, code: 'TIANSHU_ADMIN_TENANT_MISMATCH'})

    await waitFor(() => expect(requestContext().tenantId).toBe('2002'))
    expect(guard).not.toHaveBeenCalled()
    expect(requestContext().tenantId).toBe('2002')
    expect(requestContext().sessionGeneration).toBeGreaterThan(generation)
    expect(queryClient.getQueryData(tenantKey)).toBeUndefined()
    expect(bootstrapMock).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    unmount()
  })
})


describe('fixed deployment registration', () => {
  it('passes the configured alias to the installed client without tenant or issuer selectors', async () => {
    const navigate = vi.fn()
    vi.stubEnv('VITE_OAUTH_APP_ALIAS', 'edge-deployment-child')
    vi.stubEnv('VITE_YUHENG_ORIGIN', '')
    vi.resetModules()
    vi.doUnmock('./AuthContext')
    vi.doMock('@stellar-enclosure/stellar-enclosure-web-shared', async () => {
      const actual = await vi.importActual<typeof import('@stellar-enclosure/stellar-enclosure-web-shared')>('@stellar-enclosure/stellar-enclosure-web-shared')
      return {...actual, createGatewayAuthClient: (options: Parameters<typeof actual.createGatewayAuthClient>[0]) =>
        actual.createGatewayAuthClient({...options, navigate})}
    })
    try {
      const {gatewayAuth: configured} = await import('./AuthContext')
      configured.login()
      expect(navigate.mock.calls[0]?.[0]).toBe('/apps/edge-deployment-child/auth/login')
      expect(String(navigate.mock.calls[0]?.[0])).not.toMatch(/tenant|issuer|resource/)
    } finally {
      vi.doUnmock('@stellar-enclosure/stellar-enclosure-web-shared')
      vi.unstubAllEnvs()
    }
  })
})
