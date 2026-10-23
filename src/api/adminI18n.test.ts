import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {beginDdcSession, setDdcExpectedTenantId} from './client'
import {getAdminI18nBootstrap, getAdminI18nBundle, getPublicI18nBundle, initializeAdminI18n} from './adminI18n'

const envelope = (data: unknown) => new Response(JSON.stringify({success: true, data}), {headers: {'Content-Type': 'application/json'}})

describe('administration language endpoints', () => {
  beforeEach(() => {
    beginDdcSession()
    setDdcExpectedTenantId('tenant-a')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    setDdcExpectedTenantId(undefined)
    vi.unstubAllGlobals()
  })

  it('reads a public login bundle without session credentials or a tenant header', async () => {
    setDdcExpectedTenantId(undefined)
    vi.mocked(fetch).mockResolvedValue(envelope({pageCode: 'tianshu.auth', locale: 'en-US', messages: {title: 'Sign in'}}))
    expect(await getPublicI18nBundle('en-US')).toMatchObject({pageCode: 'tianshu.auth'})
    expect(fetch).toHaveBeenCalledWith('/api/v1/tianshu/i18n/public/bundle?locale=en-US', {credentials: 'omit', signal: undefined})
  })

  it('sends only the page and language for the server-owned administration scope', async () => {
    vi.mocked(fetch).mockImplementation(async () => envelope({}))
    await getAdminI18nBootstrap()
    await getAdminI18nBundle('tianshu.bizs', 'en-US')
    const [url, request] = vi.mocked(fetch).mock.calls[1]
    const parsed = new URL(String(url), 'https://test.example')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({pageCode: 'tianshu.bizs', locale: 'en-US'})
    expect(new Headers(request?.headers).get('X-Egon-Tianshu-Tenant')).toBe('tenant-a')
  })

  it('initializes explicitly with a current CSRF challenge and no caller-supplied scope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({headerName: 'X-CSRF-TOKEN', token: 'test-challenge'})))
      .mockResolvedValueOnce(envelope({created: 15, skipped: 0}))
    expect(await initializeAdminI18n()).toEqual({created: 15, skipped: 0})
    expect(fetch).toHaveBeenNthCalledWith(1, '/bff/csrf', {credentials: 'include', signal: undefined})
    const [url, request] = vi.mocked(fetch).mock.calls[1]
    expect(url).toBe('/api/v1/tianshu/i18n/admin/initialize')
    expect(request).toMatchObject({method: 'POST', credentials: 'include', body: undefined})
    expect(new Headers(request?.headers).get('X-CSRF-TOKEN')).toBe('test-challenge')
    expect(new Headers(request?.headers).get('X-Egon-Tianshu-Tenant')).toBe('tenant-a')
  })

  it('never sends the mutation when the challenge is invalid or the tenant changed while waiting', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({headerName: 'Authorization', token: 'invalid'})))
    await expect(initializeAdminI18n()).rejects.toMatchObject({code: 'TIANSHU_CSRF_UNAVAILABLE'})
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.mocked(fetch).mockClear().mockImplementation(async () => {
      beginDdcSession()
      setDdcExpectedTenantId('tenant-b')
      return new Response(JSON.stringify({headerName: 'X-CSRF-TOKEN', token: 'old-challenge'}))
    })
    await expect(initializeAdminI18n()).rejects.toMatchObject({name: 'AbortError'})
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
