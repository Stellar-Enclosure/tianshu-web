import {ApiError, createHttpClient, PublicOAuthError} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {gatewayAuth} from '../auth/gatewayAuth'
import type {PermissionSnapshot, PermissionSnapshotContext} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import type {PageResultRecord, ResultEnvelope} from './types'

type UnauthorizedHandler = () => void
type TenantMismatchHandler = () => void

export type DdcRequestContext = Readonly<{
  tenantId?: string
  sessionGeneration: number
}>

const TENANT_HEADER = 'X-Egon-Tianshu-Tenant'

let unauthorizedHandler: UnauthorizedHandler = () => {}
let tenantMismatchHandler: TenantMismatchHandler = () => {}
let requestContext: DdcRequestContext = { sessionGeneration: 0 }
let permissionContext: {snapshot: PermissionSnapshot; binding: PermissionSnapshotContext} | undefined

export const setDdcPermissionContext = (snapshot?: PermissionSnapshot, binding?: PermissionSnapshotContext): void => {
  permissionContext = snapshot && binding ? {snapshot, binding} : undefined
}
export const getDdcPermissionContext = () => permissionContext
export const requireDdcPermissionContext = () => {
  if (!permissionContext || permissionContext.binding.requestEpoch !== gatewayAuth.context.epoch
    || Date.parse(permissionContext.snapshot.snapshotExpiresAt) <= Date.now()) throw new Error('A current verified Tianshu permission view is required')
  return permissionContext
}
const fetchResponse: typeof fetch = (...args) => globalThis.fetch(...args)

function requestError(failure: unknown): never {
  if (failure instanceof DOMException && failure.name === 'AbortError') throw failure
  if (failure instanceof PublicOAuthError && failure.code === 'AUTHORIZATION_REQUIRED') {
    unauthorizedHandler()
    throw new DdcApiError(401, failure.code, 'TIANSHU_AUTHORIZATION_REQUIRED')
  }
  if (failure instanceof ApiError || failure instanceof DdcApiError) {
    if (failure.status === 403 && failure.code === 'TIANSHU_ADMIN_TENANT_MISMATCH') {
      gatewayAuth.invalidate()
      tenantMismatchHandler()
    }
    if (failure instanceof DdcApiError) throw failure
    throw new DdcApiError(failure.status, failure.code, failure.message, failure.requestId)
  }
  throw new DdcApiError(0, 'TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE', 'TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE')
}

export const setDdcUnauthorizedHandler = (handler: UnauthorizedHandler): void => {
  unauthorizedHandler = handler
}

export const setDdcTenantMismatchHandler = (handler: TenantMismatchHandler): void => {
  tenantMismatchHandler = handler
}

export const beginDdcSession = (): number => {
  requestContext = { sessionGeneration: requestContext.sessionGeneration + 1 }
  permissionContext = undefined
  gatewayAuth.context.invalidate()
  return requestContext.sessionGeneration
}

export const setDdcExpectedTenantId = (tenantId?: string): void => {
  requestContext = {
    ...requestContext,
    tenantId: tenantId || undefined,
  }
}

export const getDdcRequestContext = (): DdcRequestContext => ({ ...requestContext })

export const isCurrentDdcSession = (sessionGeneration: number): boolean =>
  requestContext.sessionGeneration === sessionGeneration

export const requireDdcExpectedTenantId = (): string => {
  if (!requestContext.tenantId) {
    throw new DdcApiError(401, 'AUTHORIZATION_REQUIRED', 'A verified Tianshu tenant is required')
  }
  return requestContext.tenantId
}

export class DdcApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly traceId?: string,
  ) {
    super(message)
    this.name = 'DdcApiError'
  }

  get category():
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'VALIDATION'
    | 'SERVER'
    | 'NETWORK'
    | 'UNKNOWN' {
    if (this.status === 0) return 'NETWORK'
    if (this.status === 401) return 'UNAUTHENTICATED'
    if (this.status === 403) return 'FORBIDDEN'
    if (this.status === 404) return 'NOT_FOUND'
    if (this.status === 409) return 'CONFLICT'
    if (this.status === 422) return 'VALIDATION'
    if (this.status >= 500) return 'SERVER'
    return 'UNKNOWN'
  }
}

export type DdcRequestOptions = {
  method?: string
  body?: unknown
  signal?: AbortSignal
  headers?: HeadersInit
}

const requestEnvelope = async (
  path: string,
  options: DdcRequestOptions,
): Promise<(ResultEnvelope & Record<string, unknown>) | undefined> => {
  const requestContextAtStart = getDdcRequestContext()
  const headers = new Headers(options.headers)
  let body: string | undefined
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }
  let payload: Partial<ResultEnvelope> & Record<string, unknown>
  try {
    const tenant = requireDdcExpectedTenantId()
    headers.set(TENANT_HEADER, encodeURIComponent(tenant))
    const authority = gatewayAuth.authority(tenant)
    const transport = createHttpClient({baseUrl: authority.apiBaseUrl, authority, fetch: fetchResponse,
      onAuthError: status => { if (status === 401) unauthorizedHandler() }})
    payload = await transport.request(path, {method: options.method ?? 'GET', headers, body, signal: options.signal})
  } catch (failure) {
    requestError(failure)
  }
  if (!isCurrentDdcSession(requestContextAtStart.sessionGeneration)) {
    throw new DOMException('Response belongs to a previous Tianshu session', 'AbortError')
  }
  if (payload === undefined) return undefined
  if (!payload || payload.success === false) {
    throw new DdcApiError(500, String(payload?.code ?? payload?.status ?? 'INVALID_RESPONSE'),
      String(payload?.message ?? 'TIANSHU_INVALID_RESPONSE'), payload?.traceId)
  }
  return payload as ResultEnvelope & Record<string, unknown>
}

export async function ddcApi<T>(
  path: string,
  options: DdcRequestOptions = {},
): Promise<T> {
  const payload = await requestEnvelope(path, options)
  return payload?.data as T
}

/** Sends one Resource-authorized mutation under the current tenant. */
export async function ddcMutationApi<T>(path: string, options: DdcRequestOptions): Promise<T> {
  return ddcApi<T>(path, options)
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** The fixed binary endpoint uses the same Resource authority and epoch as JSON. */
export async function ddcDownload(path: '/api/v1/tianshu/namespaces/export', body: unknown): Promise<Blob> {
  try {
    if (path !== '/api/v1/tianshu/namespaces/export') throw new TypeError('Invalid export endpoint')
    const tenant = requireDdcExpectedTenantId()
    const authority = gatewayAuth.authority(tenant)
    const captured = authority.context.capture()
    const signal = AbortSignal.any([captured.signal, AbortSignal.timeout(30_000)])
    captured.assertCurrent()
    const response = await fetchResponse(authority.apiBaseUrl.replace(/\/$/, '') + path, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal, headers: {'Content-Type': 'application/json', Accept: XLSX + ', application/json',
        [TENANT_HEADER]: encodeURIComponent(tenant), Authorization: authority.authorizationHeader()},
      body: JSON.stringify(body),
    })
    captured.assertCurrent()
    signal.throwIfAborted()
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as
        {status?: string; code?: string; message?: string; traceId?: string} | null
      captured.assertCurrent()
      signal.throwIfAborted()
      if (response.status === 401) { authority.invalidate(); unauthorizedHandler() }
      throw new DdcApiError(response.status, payload?.status ?? payload?.code ?? 'REQUEST_FAILED',
        payload?.message ?? 'Export failed', payload?.traceId)
    }
    if (response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== XLSX) {
      throw new DdcApiError(response.status, 'INVALID_RESPONSE', 'Invalid export response')
    }
    const blob = await response.blob()
    captured.assertCurrent()
    signal.throwIfAborted()
    return blob
  } catch (failure) { return requestError(failure) }
}

export async function ddcPageApi<T>(
  path: string,
  options: DdcRequestOptions = {},
): Promise<PageResultRecord<T>> {
  const payload = await requestEnvelope(path, options)
  if (!payload || !Array.isArray(payload.records)
      || payload.page === null
      || typeof payload.page !== 'object') {
    throw new DdcApiError(
      500,
      'TIANSHU_INVALID_PAGE_RESPONSE',
      'TIANSHU_INVALID_PAGE_RESPONSE',
      payload?.traceId,
    )
  }
  return payload as PageResultRecord<T>
}
