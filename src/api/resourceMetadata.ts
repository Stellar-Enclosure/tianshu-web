import type {CatalogScope} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {ddcPageApi, requireDdcExpectedTenantId} from './client'
import type {DdcCatalogTarget} from './i18n'
import {buildQuery} from '../lib/query'

export type ResourceMetadata = {
  catalogScope: CatalogScope
  catalogActivationVersion: string
  producerId: string
  producerVersion: string
  sourceVersion: string
  metadataKind: 'RESOURCE' | 'PERMISSION'
  definitionKey: string
  resourceId: string | null
  permissionId: string | null
  resourceType: string | null
  lifecycle: string
  pageCode: string
  labelKey: string
  descriptionKey: string | null
  target: Record<string, unknown>
  policy: Record<string, unknown>
  i18nRefs: Record<string, unknown>
  permissionCodes: string[]
}
export type ResourceMetadataQuery = DdcCatalogTarget & {
  producerId?: string; metadataKind?: string; resourceType?: string; lifecycle?: string
  permissionCode?: string; query?: string; pageNo?: number; pageSize?: number
}
export function getResourceMetadata(query: ResourceMetadataQuery, signal?: AbortSignal) {
  requireDdcExpectedTenantId()
  return ddcPageApi<ResourceMetadata>(`/api/v1/tianshu/resource-metadata?${buildQuery(query)}`, {signal})
}
