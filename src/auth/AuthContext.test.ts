import {webcrypto} from 'node:crypto'
import type {PublicOAuthRegistration} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {createTianshuAuth} from './gatewayAuth'
import { createElement } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiClient from '../api/client'
import {ddcApi} from '../api/client'
import type {PermissionSnapshot} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {permissionSnapshot, gatewayIdentity} from '../test/permissionFixture'
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
    const login = vi.spyOn(gatewayAuth, 'login').mockResolvedValue(undefined)

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
    expect(login).toHaveBeenCalledWith('/', expect.any(AbortSignal))
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
    vi.spyOn(gatewayAuth, 'logout').mockResolvedValue(undefined)
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
    const login = vi.spyOn(gatewayAuth, 'login').mockResolvedValue(undefined)
    const logout = vi.spyOn(gatewayAuth, 'logout').mockResolvedValue(undefined)
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
    const logout = vi.spyOn(gatewayAuth, 'logout').mockResolvedValue(undefined)
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


const webOrigin = 'https://tianshu.example.invalid'
const base = '/console/'
const resource = webOrigin + '/resource'
const registration = (tenantId: string): PublicOAuthRegistration => {
  const issuer = 'https://identity.example.invalid/tenants/' + tenantId
  const id = 'tianshu-' + tenantId
  return {id, tenantId, clientId: id, issuer, resource, apiBaseUrl: webOrigin, scopes: ['openid', 'tianshu:read'],
    redirectUri: webOrigin + base + 'auth/oidc/callback/' + id,
    popupRedirectUri: webOrigin + base + 'auth/oidc/popup/' + id,
    authorizationEndpoint: issuer + '/oauth2/authorize', tokenEndpoint: issuer + '/oauth2/token',
    jwksUri: issuer + '/.well-known/jwks.json', browserBound: false}
}
const tenant = registration('20')
const otherTenant = registration('21')
const config = JSON.stringify({webOrigin, activeResource: tenant.id, resource, apiBaseUrl: webOrigin,
  registrations: [tenant, otherTenant]})
const encodeJwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

it('uses the installed SDK for PKCE, signed Resource authorization and direct permission bootstrap', async () => {
  sessionStorage.clear()
  const fetcher = vi.fn<typeof fetch>()
  const navigate = vi.fn<(url: string) => void>()
  const options = {crypto: webcrypto as unknown as Crypto, sessionStorage, fetch: fetcher, navigate,
    replaceLocation: vi.fn<(url: string) => void>()}
  const browser = {location: {origin: webOrigin}} as Window
  const create = () => createTianshuAuth(config, base, browser, options)
  const start = create()
  const algorithm = 'RSASSA-PKCS1-v1_5'
  const keys = await webcrypto.subtle.generateKey({name: algorithm, modulusLength: 2048, hash: 'SHA-256',
    publicExponent: new Uint8Array([1, 0, 1])}, true, ['verify', 'sign'])
  const publicKey = {...await webcrypto.subtle.exportKey('jwk', keys.publicKey), alg: 'RS256', kid: 'test-key'}
  const now = Math.floor(Date.now() / 1000)
  const sign = async (typ: 'JWT' | 'at+jwt', claims: object) => {
    const content = encodeJwtPart({alg: 'RS256', typ, kid: 'test-key'}) + '.'
      + encodeJwtPart({iss: tenant.issuer, sub: 'verified-user', iat: now, exp: now + 300, ...claims})
    const signature = await webcrypto.subtle.sign(algorithm, keys.privateKey, new TextEncoder().encode(content))
    return content + '.' + Buffer.from(signature).toString('base64url')
  }
  const issue = async (authorization: URL, audience: string) => {
    const id_token = await sign('JWT', {aud: [tenant.clientId], nonce: authorization.searchParams.get('nonce')})
    const access_token = await sign('at+jwt', {aud: [audience], tenant_id: tenant.tenantId,
      client_id: tenant.clientId, principal_type: 'USER', scope_context: 'TENANT', scope: tenant.scopes.join(' ')})
    fetcher.mockResolvedValueOnce(Response.json({id_token, access_token, token_type: 'Bearer', expires_in: 300}))
      .mockResolvedValueOnce(Response.json({keys: [publicKey]}))
    return access_token
  }
  const callbackFor = (authorization: URL) => {
    const callback = new URL(tenant.redirectUri)
    callback.search = new URLSearchParams({state: authorization.searchParams.get('state')!, code: 'test-one-use-code'}).toString()
    return callback.href
  }

  await start.login('/configs')
  const authorization = new URL(navigate.mock.lastCall![0])
  expect(authorization.origin + authorization.pathname).toBe(tenant.authorizationEndpoint)
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  expect(authorization.searchParams.get('resource')).toBe(resource)
  const accessToken = await issue(authorization, resource)

  const reloaded = create()
  const callback = callbackFor(authorization)
  const finishing = reloaded.completeCallback(callback, false)
  expect(reloaded.completeCallback(callback, false)).toBe(finishing)
  await expect(finishing).resolves.toBe('/configs')
  await expect(reloaded.identity()).resolves.toMatchObject({tenantId: '20', subject: 'verified-user', resource})
  expect(options.replaceLocation).toHaveBeenCalledWith(tenant.redirectUri)
  await expect(reloaded.completeCallback(callback, false)).rejects.toMatchObject({code: 'INVALID_CALLBACK'})
  expect(() => reloaded.authority('21')).toThrow(expect.objectContaining({status: 403, code: 'TIANSHU_ADMIN_TENANT_MISMATCH'}))
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([tenant.tokenEndpoint, tenant.jwksUri])

  const permissionPath = '/api/v1/authorization/effective-permissions'
  fetcher.mockResolvedValueOnce(Response.json({success: true, data: {subject: 'verified-user'}}))
  await expect(reloaded.bootstrap(permissionPath)).resolves.toEqual({subject: 'verified-user'})
  const [url, request] = fetcher.mock.lastCall!
  expect(url).toBe(webOrigin + permissionPath)
  expect(request?.credentials).toBe('omit')
  expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer ' + accessToken)
  const oldRequest = reloaded.context.capture()
  await reloaded.logout(true)
  expect(oldRequest.signal.aborted).toBe(true)
  expect(navigate.mock.lastCall![0]).toBe(tenant.issuer + '/logout')

  await reloaded.login('/')
  const second = new URL(navigate.mock.lastCall![0])
  await issue(second, webOrigin + '/other-resource')
  await expect(reloaded.completeCallback(callbackFor(second), false)).rejects.toMatchObject({code: 'INVALID_TOKEN'})
  await expect(reloaded.identity()).resolves.toBeUndefined()
  expect(sessionStorage.length).toBe(0)
})

it('accepts only the configured tenant and Resource hints for an embedded popup', async () => {
  const open = vi.fn().mockReturnValue(null)
  const browser = {origin: webOrigin, location: {origin: webOrigin}, open, __POWERED_BY_WUJIE__: true,
    $wujie: {props: {resourceContext: {issuer: otherTenant.issuer, tenantId: '21', resource}}}}
  const auth = createTianshuAuth(config, base, browser as unknown as Window, {crypto: webcrypto as unknown as Crypto})
  expect(auth.standaloneUrl()).toBe(webOrigin + base)
  await expect(auth.login('/')).rejects.toMatchObject({code: 'POPUP_UNAVAILABLE'})
  expect(open).toHaveBeenCalledTimes(1)

  browser.$wujie.props.resourceContext.resource = webOrigin + '/other-resource'
  await expect(auth.login('/')).rejects.toMatchObject({code: 'INVALID_CONFIGURATION'})
  expect(open).toHaveBeenCalledTimes(1)
  browser.$wujie.props.resourceContext.resource = resource
  browser.origin = 'https://different-portal.example.invalid'
  await expect(auth.login('/')).rejects.toMatchObject({code: 'POPUP_UNAVAILABLE'})
  expect(open).toHaveBeenCalledTimes(1)
})
