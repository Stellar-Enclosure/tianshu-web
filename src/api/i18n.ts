import { createDdcTenantQueryKey } from '../query/queryClient'
import { buildQuery } from '../lib/query'
import { ddcApi, ddcMutationApi, ddcPageApi, requireDdcExpectedTenantId, type DdcRequestOptions } from './client'
import type { PageResultRecord } from './types'

export type DdcI18nScope = {
  bizCode: string
  namespaceCode: string
  env: string
  appCode: string
}

export type DdcI18nTranslations = Record<string, Record<string, string>>

export type DdcI18nPageSummary = DdcI18nScope & {
  id: string
  pageCode: string
  name: string
  defaultLocale: string
  revision: string
  publishedVersion: string | null
}

export type DdcI18nPage = DdcI18nPageSummary & {
  translations: DdcI18nTranslations
}

export type DdcI18nDraft = Pick<DdcI18nPage, 'name' | 'defaultLocale' | 'translations'>
export type DdcI18nCreateCommand = DdcI18nScope & DdcI18nDraft & { pageCode: string }
export type DdcI18nDraftCommand = DdcI18nDraft & { expectedRevision: string }
export type DdcI18nPageParams = DdcI18nScope & { pageNo?: number; pageSize?: number }
export type DdcI18nBundleParams = DdcI18nScope & { pageCode: string; locale: string }
export type DdcI18nBundle = {
  pageCode: string
  locale: string
  defaultLocale: string
  version: string
  messages: Record<string, string>
}

const I18N_PATH = '/api/v1/tianshu/i18n'
const LONG_MAX = '9223372036854775807'
type RequestOptions = Pick<DdcRequestOptions, 'signal'>

const assertLong = (value: string, name: string, allowZero = false): void => {
  if (!(allowZero ? /^(0|[1-9][0-9]{0,18})$/ : /^[1-9][0-9]{0,18}$/).test(value)
      || value.length > LONG_MAX.length || (value.length === LONG_MAX.length && value > LONG_MAX)) {
    throw new Error(`${name} must be a decimal Long string`)
  }
}

const pagePath = (id: string): string => {
  assertLong(id, 'pageId')
  return `${I18N_PATH}/pages/${encodeURIComponent(id)}`
}

export const ddcI18nQueryKeys = {
  all: () => createDdcTenantQueryKey(requireDdcExpectedTenantId(), 'i18n'),
  pages: (params: DdcI18nPageParams) =>
    createDdcTenantQueryKey(requireDdcExpectedTenantId(), 'i18n', 'pages', params),
  page: (id: string) => createDdcTenantQueryKey(requireDdcExpectedTenantId(), 'i18n', 'page', id),
  bundle: (params: DdcI18nBundleParams) =>
    createDdcTenantQueryKey(requireDdcExpectedTenantId(), 'i18n', 'bundle', params),
}

export const pageI18nPages = (
  params: DdcI18nPageParams, options: RequestOptions = {},
): Promise<PageResultRecord<DdcI18nPageSummary>> => {
  requireDdcExpectedTenantId()
  return ddcPageApi(`${I18N_PATH}/pages?${buildQuery({ ...params,
    pageNo: params.pageNo ?? 1, pageSize: params.pageSize ?? 20 })}`, options)
}

export const getI18nPage = (id: string, options: RequestOptions = {}): Promise<DdcI18nPage> => {
  requireDdcExpectedTenantId()
  return ddcApi(pagePath(id), options)
}

export const createI18nPage = (
  command: DdcI18nCreateCommand, options: RequestOptions = {},
): Promise<DdcI18nPage> => {
  requireDdcExpectedTenantId()
  return ddcMutationApi(`${I18N_PATH}/pages`, { ...options, method: 'POST', body: command })
}

export const replaceI18nDraft = (
  id: string, command: DdcI18nDraftCommand, options: RequestOptions = {},
): Promise<DdcI18nPage> => {
  requireDdcExpectedTenantId()
  assertLong(command.expectedRevision, 'expectedRevision', true)
  return ddcMutationApi(`${pagePath(id)}/draft`, { ...options, method: 'PUT', body: command })
}

export const publishI18nPage = (
  id: string, expectedRevision: string, options: RequestOptions = {},
): Promise<DdcI18nPage> => {
  requireDdcExpectedTenantId()
  assertLong(expectedRevision, 'expectedRevision', true)
  return ddcMutationApi(`${pagePath(id)}/publish`, {
    ...options, method: 'POST', body: { expectedRevision },
  })
}

export const getI18nBundle = (
  params: DdcI18nBundleParams, options: RequestOptions = {},
): Promise<DdcI18nBundle> => {
  requireDdcExpectedTenantId()
  return ddcApi(`${I18N_PATH}/bundle?${buildQuery(params)}`, options)
}
