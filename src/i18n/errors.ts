import {DdcApiError} from '../api/client'
import type {AdminTranslate} from './AdminI18nProvider'

export class AdminMessageError extends Error {
  constructor(readonly key: string, readonly values?: Readonly<Record<string, string | number>>) {
    super(key)
    this.name = 'AdminMessageError'
  }
}

export const formatAdminError = (error: unknown, t: AdminTranslate): string => {
  if (error instanceof AdminMessageError) return t(error.key, error.values)
  if (error instanceof DdcApiError) {
    const keys: Record<string, string> = {
      TIANSHU_ADMIN_TENANT_MISMATCH: 'error.tenantChanged',
      TIANSHU_ADMIN_WEB_UPSTREAM_UNAVAILABLE: 'error.network',
      TIANSHU_INVALID_PAGE_RESPONSE: 'error.invalidResponse',
      UNAUTHORIZED: 'error.unauthorized',
      TIANSHU_CSRF_UNAVAILABLE: 'error.csrf',
    }
    const key = keys[error.code]
    if (key) return t(key)
    return error.message || t('error.request', {status: error.status})
  }
  if (error instanceof DOMException && error.name === 'AbortError') return t('error.cancelled')
  if (error instanceof TypeError) return t('error.network')
  return error instanceof Error ? error.message : t('error.unknown')
}
