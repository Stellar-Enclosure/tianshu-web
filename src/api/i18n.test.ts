import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDdcSession, setDdcExpectedTenantId } from './client'
import {
  createI18nPage, ddcI18nQueryKeys, getI18nBundle, getI18nPage, pageI18nPages,
  publishI18nPage, replaceI18nDraft,
} from './i18n'

const scope = { bizCode: 'retail', namespaceCode: 'office', env: 'prod', appCode: 'orders' }
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), {
  headers: { 'Content-Type': 'application/json' },
})

describe('Tianshu page translation REST client', () => {
  beforeEach(() => {
    beginDdcSession()
    setDdcExpectedTenantId('tenant-1')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => url.endsWith('/bff/csrf')
      ? new Response(JSON.stringify({headerName: 'X-CSRF-TOKEN', token: 'test-csrf'})) : response({})))
  })
  afterEach(() => {
    setDdcExpectedTenantId(undefined)
    vi.unstubAllGlobals()
  })

  it('sends the complete scope and tenant when paging, preserving page metadata', async () => {
    const page = { pageNo: 2, pageSize: 20, total: 21, pages: 2, hasNext: false, hasPrevious: true }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, records: [{ id: '71' }], page })))
    expect(await pageI18nPages({ ...scope, pageNo: 2 })).toMatchObject({ records: [{ id: '71' }], page })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    const request = new URL(String(url), 'https://test.local')
    expect(request.pathname).toBe('/api/v1/tianshu/i18n/pages')
    expect(Object.fromEntries(request.searchParams)).toEqual({ ...scope, pageNo: '2', pageSize: '20' })
    expect((init?.headers as Headers).get('X-Egon-Tianshu-Tenant')).toBe('tenant-1')
  })

  it('creates and reads drafts without converting large ids to numbers', async () => {
    const command = { ...scope, pageCode: 'common', name: '公共文案', defaultLocale: 'zh-CN', translations: { 'zh-CN': {} } }
    await createI18nPage(command)
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/tianshu/i18n/pages', expect.objectContaining({
      method: 'POST', body: JSON.stringify(command),
    }))
    await getI18nPage('9223372036854775807')
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/tianshu/i18n/pages/9223372036854775807', expect.anything())
  })

  it('saves and publishes using exact revision strings', async () => {
    const command = { expectedRevision: '9223372036854775807', name: '订单', defaultLocale: 'zh-CN',
      translations: { 'zh-CN': { title: '订单' } } }
    await replaceI18nDraft('71', command)
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/tianshu/i18n/pages/71/draft', expect.objectContaining({
      method: 'PUT', body: JSON.stringify(command),
    }))
    await publishI18nPage('71', command.expectedRevision)
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/tianshu/i18n/pages/71/publish', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ expectedRevision: command.expectedRevision }),
    }))
    expect(() => publishI18nPage('71', '1e3')).toThrow('decimal Long string')
    expect(() => getI18nPage('9223372036854775808')).toThrow('decimal Long string')
  })

  it('reads a published bundle by page and locale with a tenant-separated cache key', async () => {
    const params = { ...scope, pageCode: 'order.list', locale: 'en-US' }
    await getI18nBundle(params)
    const request = new URL(String(vi.mocked(fetch).mock.calls[0][0]), 'https://test.local')
    expect(request.pathname).toBe('/api/v1/tianshu/i18n/bundle')
    expect(Object.fromEntries(request.searchParams)).toEqual(params)
    const first = ddcI18nQueryKeys.bundle(params)
    setDdcExpectedTenantId('tenant-2')
    expect(ddcI18nQueryKeys.bundle(params)).not.toEqual(first)
    setDdcExpectedTenantId(undefined)
    expect(() => getI18nBundle(params)).toThrow('verified Tianshu tenant')
    expect(() => ddcI18nQueryKeys.all()).toThrow('verified Tianshu tenant')
  })
})
