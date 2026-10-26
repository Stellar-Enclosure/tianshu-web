import {gatewayAuth} from '../auth/gatewayAuth'
import {ddcApi, ddcMutationApi, requireDdcExpectedTenantId, requireDdcPermissionContext} from './client'
import type {DdcI18nBundle, DdcI18nScope} from './i18n'

export type AdminI18nBootstrap = {
  scope: DdcI18nScope
  defaultLocale: string
  locales: string[]
  pages: {pageCode: string; name: string}[]
  canInitialize: boolean
}

const path = '/api/v1/tianshu/i18n'

export const getAdminI18nBootstrap = (signal?: AbortSignal): Promise<AdminI18nBootstrap> => {
  requireDdcExpectedTenantId()
  return ddcApi(`${path}/admin/bootstrap`, {signal})
}

export const getAdminI18nBundle = (pageCode: string, locale: string, signal?: AbortSignal): Promise<DdcI18nBundle> => {
  requireDdcExpectedTenantId()
  const {binding} = requireDdcPermissionContext()
  return ddcApi(`${path}/admin/bundle?${new URLSearchParams({pageCode, locale, catalogScopeId: binding.catalogScope.catalogScopeId, catalogActivationVersion: binding.catalogVersion})}`, {signal})
}

export const initializeAdminI18n = (): Promise<{created: number; skipped: number}> => {
  requireDdcExpectedTenantId()
  return ddcMutationApi(`${path}/admin/initialize`, {method: 'POST'})
}

export const getPublicI18nBundle = async (locale: string, signal?: AbortSignal): Promise<Pick<DdcI18nBundle, 'pageCode' | 'locale' | 'defaultLocale' | 'version' | 'messages'>> => {
  const response = await fetch(`${gatewayAuth.applicationBaseUrl}${path}/public/bundle?${new URLSearchParams({locale})}`, {
    credentials: 'omit', signal,
  })
  const envelope = await response.json()
  if (!response.ok || envelope.success !== true || !envelope.data) throw new Error('TIANSHU_UI_I18N_UNAVAILABLE')
  return envelope.data as DdcI18nBundle
}
