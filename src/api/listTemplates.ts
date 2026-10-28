import {ddcApi, ddcMutationApi, requireDdcExpectedTenantId} from './client'
import type {ListTemplate, ListTemplateColumn, ListTemplateSave, ListTemplateView} from '@stellar-enclosure/stellar-enclosure-web-shared'

export type {ListTemplate}
export type ListColumn = ListTemplateColumn
export type ListView = ListTemplateView
export type SaveListTemplate = ListTemplateSave

const base = '/api/v1/tianshu/list-views/tianshu.page.namespaces/main'

export function loadNamespaceListView(catalogVersion: string, includeSystemMetadata = false, signal?: AbortSignal) {
  requireDdcExpectedTenantId()
  const query = new URLSearchParams({catalogVersion, includeSystemMetadata: String(includeSystemMetadata)})
  return ddcApi<ListView>(`${base}?${query}`, {signal})
}

export function saveNamespaceTemplate(type: ListTemplate['type'], command: SaveListTemplate) {
  return ddcMutationApi<ListTemplate>(`${base}/${type.toLowerCase()}`, {method: 'POST', body: command})
}

export function deleteNamespaceTemplate(template: ListTemplate, catalogVersion: string) {
  const query = new URLSearchParams({catalogVersion, version: template.version})
  return ddcMutationApi<boolean>(`${base}/${template.type.toLowerCase()}/${encodeURIComponent(template.id)}?${query}`, {method: 'DELETE'})
}

export function selectNamespaceTemplate(templateId: string, view: ListView) {
  return ddcMutationApi<boolean>(`${base}/selection`, {method: 'POST', body: {
    templateId, catalogVersion: view.catalogVersion, definitionDigest: view.definitionDigest,
  }})
}
