import {authorizationFixture} from '../test/permissionFixture'
import {setDdcPermissionContext} from './client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {beginDdcSession, setDdcExpectedTenantId} from './client'
import {getAdminI18nBootstrap, getAdminI18nBundle, getPublicI18nBundle, initializeAdminI18n} from './adminI18n'

const envelope = (data: unknown) => new Response(JSON.stringify({success: true, data}), {headers: {'Content-Type': 'application/json'}})

describe('administration language endpoints', () => {
  beforeEach(() => {
    beginDdcSession()
    setDdcExpectedTenantId('1001')
    const authorization = authorizationFixture()
    setDdcPermissionContext(authorization.snapshot, authorization.binding)
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
    expect(fetch).toHaveBeenCalledWith('https://tianshu.example.invalid/api/v1/tianshu/i18n/public/bundle?locale=en-US', expect.objectContaining({credentials: 'omit', redirect: 'error'}))
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('X-Egon-Tianshu-Tenant')).toBe(false)
  })

  it('sends the page, locale and verified catalog binding for the server-owned administration scope', async () => {
    vi.mocked(fetch).mockImplementation(async () => envelope({}))
    await getAdminI18nBootstrap()
    await getAdminI18nBundle('tianshu.bizs', 'en-US')
    const [url, request] = vi.mocked(fetch).mock.calls[1]
    const parsed = new URL(String(url), 'https://test.example')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({pageCode: 'tianshu.bizs', locale: 'en-US', catalogScopeId: '71001', catalogActivationVersion: '7'})
    expect(new Headers(request?.headers).get('X-Egon-Tianshu-Tenant')).toBe('1001')
  })

  it('initializes under the Resource Bearer with no caller-supplied scope or CSRF', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(envelope({created: 15, skipped: 0}))
    expect(await initializeAdminI18n()).toEqual({created: 15, skipped: 0})
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://tianshu.example.invalid/api/v1/tianshu/i18n/admin/initialize')
    expect(request).toMatchObject({method: 'POST', credentials: 'omit', body: undefined})
    const headers = new Headers(request?.headers)
    expect(headers.get('Authorization')).toBe('Bearer tianshu-resource-token')
    expect(headers.get('X-CSRF-TOKEN')).toBeNull()
    expect(headers.get('X-Egon-Tianshu-Tenant')).toBe('1001')
  })

  it('discards an in-flight initialization result that arrives after a tenant switch', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      beginDdcSession()
      setDdcExpectedTenantId('tenant-b')
      return envelope({created: 15, skipped: 0})
    })
    await expect(initializeAdminI18n()).rejects.toMatchObject({name: 'AbortError'})
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
