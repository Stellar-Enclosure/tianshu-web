import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  beginDdcSession,
  ddcApi,
  ddcDownload,
  DdcApiError,
  ddcPageApi,
  setDdcExpectedTenantId,
  setDdcTenantMismatchHandler,
  setDdcUnauthorizedHandler,
} from './client'

const record = (data: unknown) => ({
  success: true, code: 0, status: 'SUCCESS', message: '', data,
  traceId: 'trace-1', timestamp: 1,
})

const pageRecord = <T,>(records: T[], total = records.length) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  records,
  page: {
    total,
    pageNo: 2,
    pageSize: 20,
    pages: 2,
    hasNext: false,
    hasPrevious: true,
  },
  traceId: 'trace-page',
  timestamp: 1,
})

describe('ddcApi', () => {
  beforeEach(() => {
    setDdcUnauthorizedHandler(() => {})
    setDdcTenantMismatchHandler(() => {})
    beginDdcSession()
    setDdcExpectedTenantId('1001')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    setDdcExpectedTenantId(undefined)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('downloads XLSX with the verified tenant and the TianShu Resource Bearer', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('xlsx', {status: 200,
      headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}))
    await expect(ddcDownload('/api/v1/tianshu/namespaces/export', {range: 'FILTERED'})).resolves.toBeInstanceOf(Blob)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://tianshu.example.invalid/api/v1/tianshu/namespaces/export')
    expect(new Headers(init?.headers).get('X-Egon-Tianshu-Tenant')).toBe('1001')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tianshu-resource-token')
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBeNull()
    expect(init?.credentials).toBe('omit')
  })

  it('aborts an in-flight export and rejects its late result after the tenant changes', async () => {
    let finish!: (value: Response) => void
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = ddcDownload('/api/v1/tianshu/namespaces/export', {})
    const request = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(request?.signal?.aborted).toBe(false)
    beginDdcSession()
    setDdcExpectedTenantId('2002')
    expect(request?.signal?.aborted).toBe(true)
    finish(new Response('xlsx', {headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}))
    await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reads JSON at the deployed Resource with a Bearer and returns the response data', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record({ list: [1] })))
    await expect(ddcApi<{ list: number[] }>('/api/v1/tianshu/apps')).resolves.toEqual({ list: [1] })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://tianshu.example.invalid/api/v1/tianshu/apps')
    expect(init?.credentials).toBe('omit')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer tianshu-resource-token')
    expect(headers.get('X-Egon-Tianshu-Tenant')).toBe('1001')
  })

  it('stringifies JSON bodies with content type', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record(null)))
    await ddcApi('/api/v1/tianshu/configs', { method: 'POST', body: { resourceName: 'application.yml' } })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(init!.body).toBe(JSON.stringify({ resourceName: 'application.yml' }))
  })

  it('returns page records and forwards AbortSignal', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(pageRecord([{ id: 'b1' }], 21)),
    )

    await expect(ddcPageApi<{ id: string }>(
      '/api/v1/tianshu/bizs/page',
      { signal: controller.signal },
    )).resolves.toMatchObject({
      records: [{ id: 'b1' }],
      page: { total: 21, pageNo: 2, pageSize: 20 },
    })

    expect(vi.mocked(fetch).mock.calls[0][1]?.signal)
      .toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('accepts ResultRecord failures from the global exception handler', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      success: false,
      code: 422,
      status: 'INVALID_REQUEST',
      message: '请求参数无效',
      data: null,
      traceId: 'trace-error',
      timestamp: 1,
    }))

    await expect(ddcPageApi('/api/v1/tianshu/bizs/page'))
      .rejects.toMatchObject({ code: '422', traceId: 'trace-error' })
  })

    it('keeps the original AbortSignal after a 401', async () => {
    const controller = new AbortController()
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(record(null), 401))

        await expect(ddcApi(
      '/api/v1/tianshu/apps',
      { signal: controller.signal },
        )).rejects.toMatchObject({status: 401})

        expect(vi.mocked(fetch).mock.calls[0][1]?.signal)
      .toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('throws DdcApiError with backend message on success=false', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, code: 500, status: 'FAIL', message: '配置格式无效', data: null, traceId: 't', timestamp: 1 }, 200))
    const error = await ddcApi('/api/v1/tianshu/apps').catch((e) => e as DdcApiError) as DdcApiError
    expect(error).toBeInstanceOf(DdcApiError)
    expect(error.message).toBe('配置格式无效')
    expect(error.category).toBe('SERVER')
  })

  it('on 401 calls the unauthorized handler and throws', async () => {
    const handler = vi.fn()
    setDdcUnauthorizedHandler(handler)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, code: 401, status: 'UNAUTHORIZED', message: 'jwt expired', data: null, traceId: 't', timestamp: 1 }, 401))
    const error = await ddcApi('/api/v1/tianshu/apps').catch((e) => e as DdcApiError) as DdcApiError
    expect(handler).toHaveBeenCalledTimes(1)
    expect(error.message).toBe('jwt expired')
    expect(error.category).toBe('UNAUTHENTICATED')
  })

  it('maps network failures to NETWORK category', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))
    const error = await ddcApi('/api/v1/tianshu/apps').catch((e) => e as DdcApiError) as DdcApiError
    expect(error.status).toBe(0)
    expect(error.category).toBe('NETWORK')
    expect(error.code).toBe('TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE')
  })

  it('keeps page metadata for configuration client instances', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(pageRecord([
      { instanceId: 'instance-1' },
    ], 41)))

    await expect(ddcPageApi<{ instanceId: string }>(
      '/api/v1/tianshu/instances/page?pageNo=1&pageSize=20',
    )).resolves.toMatchObject({
      records: [{ instanceId: 'instance-1' }],
      page: { total: 41, pageNo: 2, pageSize: 20, pages: 2 },
    })
  })

  it('classifies a missing audit endpoint instead of returning an empty success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      success: false,
      code: 404,
      status: 'NOT_FOUND',
      message: '审计接口不存在',
      data: null,
      traceId: 'trace-audit-missing',
      timestamp: 1,
    }, 404))

    await expect(ddcPageApi('/api/v1/tianshu/audits/page'))
      .rejects.toMatchObject({
        status: 404,
        category: 'NOT_FOUND',
        traceId: 'trace-audit-missing',
      })
  })

  it('sends the URI-encoded tenant supplied by the verified bootstrap', async () => {
    setDdcExpectedTenantId('tenant/1001')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record({ id: '810001' })))

    await ddcApi('/api/v1/tianshu/ai/resources')

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.get('X-Egon-Tianshu-Tenant')).toBe(encodeURIComponent('tenant/1001'))
  })

  it('does not allow request options to override the bootstrap tenant', async () => {
    setDdcExpectedTenantId('1001')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record(null)))

    await ddcApi('/api/v1/tianshu/apps', {
      headers: {'X-Egon-Tianshu-Tenant': '2002'},
    })

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
    expect(headers.get('X-Egon-Tianshu-Tenant')).toBe('1001')
  })

  it('requires a verified tenant before a business request can be dispatched', async () => {
    setDdcExpectedTenantId(undefined)
    await expect(ddcApi('/api/v1/tianshu/apps')).rejects.toMatchObject({status: 401, code: 'AUTHORIZATION_REQUIRED'})
    expect(fetch).not.toHaveBeenCalled()
  })

  it('distinguishes authority unavailability from a rejected identity and does not replay the write', async () => {
    const unauthorized = vi.fn()
    setDdcUnauthorizedHandler(unauthorized)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({status: 'AUTHORITY_UNAVAILABLE'}, 503))
    await expect(ddcApi('/api/v1/tianshu/configs', {method: 'POST', body: {}})).rejects.toMatchObject({status: 503})
    expect(unauthorized).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('drops a response completed under an older session generation', async () => {
    beginDdcSession()
    setDdcExpectedTenantId('1001')
    let resolveResponse: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))

    const pending = ddcApi('/api/v1/tianshu/ai/resources')
    beginDdcSession()
    setDdcExpectedTenantId('2002')
    resolveResponse?.(jsonResponse(record({ id: '810001' })))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('handles tenant mismatch without resending the original request', async () => {
    setDdcExpectedTenantId('1001')
    const recover = vi.fn()
    setDdcTenantMismatchHandler(recover)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      code: 'TIANSHU_ADMIN_TENANT_MISMATCH',
      message: 'TIANSHU_ADMIN_TENANT_MISMATCH',
    }, 403))

    await expect(ddcApi('/api/v1/tianshu/ai/resources'))
      .rejects.toMatchObject({ status: 403, code: 'TIANSHU_ADMIN_TENANT_MISMATCH' })
    expect(recover).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
