import { createDdcTenantQueryKey } from '../query/queryClient'
import { ddcApi, ddcMutationApi, ddcPageApi, requireDdcExpectedTenantId, type DdcRequestOptions } from './client'
import type {
  PageResultRecord,
  SiBindingCommand,
  SiBindingItem,
  SiCreateCommand,
  SiDraftCommand,
  SiEnvMatrixItem,
  SiLifecycleCommand,
  SiReferenceItem,
  SiResourceItem,
  SiResourceKind,
  SiSearchParams,
  SiSemanticSearchResult,
  SiVersionItem,
} from './types'

const SI_BASE_PATH = '/api/v1/tianshu/si/resources'
type RequestOptions = Pick<DdcRequestOptions, 'signal'>

const toQueryString = (values: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value))
    }
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

const requireTenant = (): string => requireDdcExpectedTenantId()

export const ddcSiQueryKeys = {
  all: () => createDdcTenantQueryKey('si'),
  catalog: (params: SiSearchParams) => [...createDdcTenantQueryKey('si'), 'catalog', params] as const,
  matrix: (params: { bizCode: string; namespaceCode: string; kind: SiResourceKind; resourceKey: string }) =>
    [...createDdcTenantQueryKey('si'), 'matrix', params] as const,
  detail: (id: string | number) => [...createDdcTenantQueryKey('si'), 'detail', String(id)] as const,
  versions: (id: string | number) => [...createDdcTenantQueryKey('si'), 'versions', String(id)] as const,
  references: (id: string | number, versionNo: number | string, direction: 'OUTBOUND' | 'INBOUND') =>
    [...createDdcTenantQueryKey('si'), 'references', String(id), String(versionNo), direction] as const,
}

export async function searchSiResources(
  params: SiSearchParams,
  options: RequestOptions = {},
): Promise<PageResultRecord<SiResourceItem>> {
  requireTenant()
  return ddcPageApi<SiResourceItem>(
    `${SI_BASE_PATH}${toQueryString(params as Record<string, string | number | undefined>)}`,
    { method: 'GET', ...options },
  )
}

export async function getSiEnvMatrix(
  params: { bizCode: string; namespaceCode: string; kind: SiResourceKind; resourceKey: string },
  options: RequestOptions = {},
): Promise<SiEnvMatrixItem[]> {
  requireTenant()
  return ddcApi<SiEnvMatrixItem[]>(
    `${SI_BASE_PATH}/env-matrix${toQueryString(params)}`,
    { method: 'GET', ...options },
  )
}

export async function semanticSearchSiResources(
  query: { bizCode?: string; namespaceCode?: string; envCode?: string; kind?: SiResourceKind; queryText: string; topK?: number },
  options: RequestOptions = {},
): Promise<SiSemanticSearchResult> {
  requireTenant()
  return ddcApi<SiSemanticSearchResult>(`${SI_BASE_PATH}/semantic-search`, {
    method: 'POST',
    body: query,
    ...options,
  })
}

export async function getSiResource(id: string | number, options: RequestOptions = {}): Promise<SiResourceItem> {
  requireTenant()
  return ddcApi<SiResourceItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}`, { method: 'GET', ...options })
}

export async function createSiResource(command: SiCreateCommand): Promise<SiResourceItem> {
  return ddcMutationApi<SiResourceItem>(SI_BASE_PATH, { method: 'POST', body: command })
}

export async function replaceSiDraft(id: string | number, command: SiDraftCommand): Promise<SiResourceItem> {
  return ddcMutationApi<SiResourceItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/draft`, {
    method: 'PUT',
    body: command,
  })
}

export async function publishSiDraft(id: string | number, command: SiLifecycleCommand): Promise<SiVersionItem> {
  return ddcMutationApi<SiVersionItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/publications`, {
    method: 'POST',
    body: command,
  })
}

export async function promoteSiVersion(id: string | number, command: SiLifecycleCommand): Promise<SiVersionItem> {
  return ddcMutationApi<SiVersionItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/promotions`, {
    method: 'POST',
    body: command,
  })
}

export async function rollbackSiResource(id: string | number, command: SiLifecycleCommand): Promise<SiVersionItem> {
  return ddcMutationApi<SiVersionItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/rollbacks`, {
    method: 'POST',
    body: command,
  })
}

export async function changeSiLifecycle(id: string | number, command: SiLifecycleCommand): Promise<SiResourceItem> {
  return ddcMutationApi<SiResourceItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/lifecycle`, {
    method: 'POST',
    body: command,
  })
}

export async function deleteSiResource(id: string | number, expectedVersion: number): Promise<void> {
  await ddcMutationApi<void>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}${toQueryString({ expectedVersion })}`,
    { method: 'DELETE' },
  )
}

export async function pageSiResourceVersions(
  id: string | number,
  params: { pageNo?: number; pageSize?: number } = {},
  options: RequestOptions = {},
): Promise<PageResultRecord<SiVersionItem>> {
  requireTenant()
  return ddcPageApi<SiVersionItem>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}/versions${toQueryString(params)}`,
    { method: 'GET', ...options },
  )
}

export async function getSiResourceVersion(
  id: string | number,
  versionNo: number,
  options: RequestOptions = {},
): Promise<SiVersionItem> {
  requireTenant()
  return ddcApi<SiVersionItem>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}/versions/${encodeURIComponent(String(versionNo))}`,
    { method: 'GET', ...options },
  )
}

export async function listSiVersionReferences(
  id: string | number,
  versionNo: number,
  direction: 'OUTBOUND' | 'INBOUND' = 'OUTBOUND',
  options: RequestOptions = {},
): Promise<SiReferenceItem[]> {
  requireTenant()
  return ddcApi<SiReferenceItem[]>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}/versions/${encodeURIComponent(String(versionNo))}/references${toQueryString({ direction })}`,
    { method: 'GET', ...options },
  )
}

export async function upsertSiServiceBinding(id: string | number, command: SiBindingCommand): Promise<SiBindingItem> {
  return ddcMutationApi<SiBindingItem>(`${SI_BASE_PATH}/${encodeURIComponent(String(id))}/service-binding`, {
    method: 'PUT',
    body: command,
  })
}

export async function unbindSiServiceBinding(
  id: string | number,
  params: { bizCode: string; namespaceCode: string; envCode: string; appCode: string; kind: SiResourceKind; resourceKey: string },
): Promise<void> {
  await ddcMutationApi<void>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}/service-binding${toQueryString(params)}`,
    { method: 'DELETE' },
  )
}

export async function reindexSiResource(id: string | number, versionId?: number): Promise<void> {
  await ddcMutationApi<void>(
    `${SI_BASE_PATH}/${encodeURIComponent(String(id))}/reindex${toQueryString({ versionId })}`,
    { method: 'POST' },
  )
}
