import {ApiError, createHttpClient} from '@stellar-enclosure/stellar-enclosure-web-shared'
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
const transport = createHttpClient({baseUrl: gatewayAuth.applicationBaseUrl, credentials: 'include',
  context: gatewayAuth.context, getCsrf: signal => gatewayAuth.csrf(signal), fetch: (...args) => globalThis.fetch(...args),
  onAuthError: status => { if (status === 401) unauthorizedHandler(); else tenantMismatchHandler() },
})

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
    throw new Error('A verified Tianshu tenant is required before calling an AI endpoint')
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
  headers.delete(TENANT_HEADER)
  if (requestContextAtStart.tenantId) {
    headers.set(TENANT_HEADER, encodeURIComponent(requestContextAtStart.tenantId))
  }
  let payload: Partial<ResultEnvelope> & Record<string, unknown>
  try {
    payload = await transport.request(path, {method: options.method ?? 'GET', headers, body, signal: options.signal})
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (error instanceof ApiError) {
      throw new DdcApiError(error.status, error.code, error.message, error.requestId)
    }
    throw new DdcApiError(0, 'TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE', 'TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE')
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

/** The shared same-application transport obtains one CSRF proof and never replays a business mutation. */
export async function ddcMutationApi<T>(path: string, options: DdcRequestOptions): Promise<T> {
  requireDdcExpectedTenantId()
  return ddcApi<T>(path, options)
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
