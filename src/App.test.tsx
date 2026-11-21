import {act, cleanup, screen, waitFor} from '@testing-library/react'
import type {ReactNode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {renderWithQueryClient} from './test/renderWithQueryClient'
import {authorizationFixture} from './test/permissionFixture'
import App from './App'
import {gatewayAuth} from './auth/gatewayAuth'

type TestAuthState = {
  authorized: boolean
  loading: boolean
  identity: string
  tenantId: string
  sessionGeneration: number
  authorization?: ReturnType<typeof authorizationFixture>
  error?: Error
  login: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  registerUnsavedChangesGuard: ReturnType<typeof vi.fn>
}

const auth: TestAuthState = vi.hoisted(() => ({
  authorized: false,
  loading: false,
  identity: 'admin',
  tenantId: '1001',
  sessionGeneration: 1,
  authorization: undefined,
  error: undefined,
  login: vi.fn(),
  logout: vi.fn(),
  registerUnsavedChangesGuard: vi.fn(() => () => {}),
}))

const resetAuth = () => {
  const fixture = authorizationFixture('1001')
  auth.authorized = false
  auth.loading = false
  auth.identity = 'admin'
  auth.tenantId = '1001'
  auth.sessionGeneration = 1
  auth.authorization = fixture
  auth.error = undefined
}

resetAuth()

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({children}: {children: ReactNode}) => children,
  useAuth: () => auth,
}))

type WujieWindow = Window & {
  $wujie?: {
    props?: {
      embedded?: boolean
      workbenchHost?: {
        attach: (port: {
          version: string
          present: (presentation: unknown) => Promise<{ok: boolean; code?: string}>
          checkLeave: (check: unknown) => Promise<{ok: boolean; dirty?: boolean; pendingMutation?: boolean; guardRevision?: number}>
        }) => {ok: boolean}
        reportCatalog: (update: {catalogRevision: number; status: string; pages: readonly {pattern: string}[]}) => {ok: boolean}
        requestNavigation: (request: unknown) => {ok: boolean}
      }
    }
  }
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetAuth()
    delete (window as WujieWindow).$wujie
  })

  it('renders the unified login page when silent refresh is unavailable', async () => {
    auth.authorized = false
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no session')))
    renderWithQueryClient(<App />)
    expect(await screen.findByText('Tianshu 管理端')).toBeInTheDocument()
  })

  it('completes the exact callback before mounting the authenticated application', async () => {
    window.history.replaceState({}, '', '/auth/oidc/callback/tianshu-1001?code=one-use&state=test-state')
    const callback = vi.spyOn(gatewayAuth, 'completeCallback').mockResolvedValue('/registry')
    auth.authorized = false
    renderWithQueryClient(<App />)
    await screen.findByText('Tianshu 管理端')
    expect(callback).toHaveBeenCalledWith(expect.stringContaining('?code=one-use&state=test-state'), false)
    expect(window.location.pathname).toBe('/registry')
  })

  it('renders configuration workload instances at the dedicated route', async () => {
    auth.authorized = true
    window.history.replaceState({}, '', '/instances')
    const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      if (url.includes('/instances/page')) {
        return Promise.resolve(jsonResponse({
          success: true,
          code: 0,
          status: 'SUCCESS',
          message: '',
          records: [],
          page: { total: 0, pageNo: 1, pageSize: 10, pages: 0, hasNext: false, hasPrevious: false },
          traceId: 'trace-instances',
          timestamp: 1,
        }))
      }
      return Promise.resolve(jsonResponse({
        success: true,
        code: 0,
        status: 'SUCCESS',
        message: '',
        data: [],
        traceId: 'trace-scope',
        timestamp: 1,
      }))
    }))

    renderWithQueryClient(<App />)

    expect(await screen.findByText('配置工作负载实例')).toBeInTheDocument()
  })

  it('binds workbench-1 port, publishes authorized catalog, hides app chrome, and rejects denied targets', async () => {
    auth.authorized = true
    const baseFixture = authorizationFixture('1001')
    auth.authorization = {
      ...baseFixture,
      snapshot: {
        ...baseFixture.snapshot,
        permissionCodes: ['TIANSHU_READ'],
      },
    }
    window.history.replaceState({}, '', '/instances')

    let attachedPort: {
      version: string
      present: (presentation: unknown) => Promise<{ok: boolean; code?: string}>
      checkLeave: (check: unknown) => Promise<{ok: boolean}>
    } | null = null
    const reportCatalog = vi.fn<
      (update: {catalogRevision: number; status: string; pages: readonly {pattern: string}[]}) => {ok: boolean}
    >(() => ({ok: true}))

    ;(window as WujieWindow).$wujie = {
      props: {
        embedded: true,
        workbenchHost: {
          attach: (port) => {
            attachedPort = port
            return {ok: true}
          },
          reportCatalog,
          requestNavigation: vi.fn(() => ({ok: true})),
        },
      },
    }

    const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      if (url.includes('/publish-tasks') || url.includes('/page')) {
        return Promise.resolve(jsonResponse({
          success: true,
          code: 0,
          status: 'SUCCESS',
          message: '',
          records: [],
          page: { total: 0, pageNo: 1, pageSize: 10, pages: 0, hasNext: false, hasPrevious: false },
          traceId: 'trace-tasks',
          timestamp: 1,
        }))
      }
      return Promise.resolve(jsonResponse({
        success: true,
        code: 0,
        status: 'SUCCESS',
        message: '',
        data: [],
        traceId: 'trace-default',
        timestamp: 1,
      }))
    }))

    renderWithQueryClient(<App />)

    await waitFor(() => {
      expect(attachedPort?.version).toBe('workbench-1')
      expect(reportCatalog).toHaveBeenCalledWith(expect.objectContaining({
        status: 'ready',
      }))
    })

    const lastCatalog = reportCatalog.mock.calls.at(-1)?.[0] as {pages: readonly {pattern: string}[]} | undefined
    expect(lastCatalog?.pages.some((p) => p.pattern === '/registry')).toBe(true)
    expect(lastCatalog?.pages.some((p) => p.pattern === '/cache')).toBe(false)
    expect(lastCatalog?.pages.some((p) => p.pattern === '/login')).toBe(false)

    // In workbench-1 before present(show), app does not auto-redirect to /registry or render standalone sidebar
    expect(screen.queryByRole('navigation', {name: '主菜单'})).not.toBeInTheDocument()
    expect(screen.queryByText('Tianshu Admin')).not.toBeInTheDocument()

    // Present denied route fails cleanly without navigating
    const deniedResult = await attachedPort!.present({
      mode: 'show',
      navigationId: 1,
      tabKey: '["tianshu","tianshu.page.cache"]',
      target: {path: '/cache', search: ''},
      signal: new AbortController().signal,
    })
    expect(deniedResult).toEqual(expect.objectContaining({ok: false, code: 'DENIED'}))

    // Present authorized route with query mounts the target page full-width
    await act(async () => {
      const showResult = await attachedPort!.present({
        mode: 'show',
        navigationId: 2,
        tabKey: '["tianshu","tianshu.page.publishTasks"]',
        target: {path: '/publish-tasks', search: '?changeId=CHG-42'},
        signal: new AbortController().signal,
      })
      expect(showResult).toEqual({ok: true})
    })
    expect(screen.queryByRole('navigation', {name: '主菜单'})).not.toBeInTheDocument()
  })
})
