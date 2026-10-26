import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {authorizationFixture} from '../test/permissionFixture'
import ResourceMetadataPage from './ResourceMetadataPage'

const api = vi.hoisted(() => ({query: vi.fn()}))
vi.mock('../api/resourceMetadata', () => ({getResourceMetadata: api.query}))
vi.mock('../auth/AuthContext', () => ({useAuth: () => ({authorization: authorizationFixture()})}))
vi.mock('../components/scope/ScopeSelects', () => ({default: () => null}))
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({defaultOptions: {queries: {retry: false}}})
  api.query.mockReset().mockResolvedValue({records: [{
    catalogScope: authorizationFixture().binding.catalogScope, catalogActivationVersion: '7',
    producerId: 'tianshu-java', producerVersion: '0.0.1', sourceVersion: 'a'.repeat(64),
    metadataKind: 'RESOURCE', definitionKey: 'tianshu.field.DdcAppBO.appName', resourceType: 'FIELD', lifecycle: 'ACTIVE',
    pageCode: 'tianshu.permissions', labelKey: 'field.appName', permissionCodes: ['TIANSHU_WRITE'],
    target: {dto: 'DdcAppBO', property: 'appName'}, policy: {access: 'PROTECTED'}, i18nRefs: {},
  }], page: {pageNo: 1, pageSize: 20, total: 1}})
})
afterEach(() => {cleanup(); client.clear()})

it('reads a versioned catalog and opens the message source with its complete immutable target', async () => {
  render(<QueryClientProvider client={client}><MemoryRouter><ResourceMetadataPage /></MemoryRouter></QueryClientProvider>)
  const reference = await screen.findByRole('link', {name: 'tianshu.permissions/field.appName'})
  const target = new URL(reference.getAttribute('href')!, 'https://console.example').searchParams
  expect(Object.fromEntries(target)).toEqual({bizCode: 'xingyuan', namespaceCode: 'default', env: 'local', appCode: 'tianshu',
    catalogScopeId: '71001', catalogActivationVersion: '7', sourcePage: 'tianshu.permissions'})
  expect(api.query).toHaveBeenCalledWith(expect.objectContaining({catalogScopeId: '71001', catalogActivationVersion: '7'}), expect.any(AbortSignal))
  expect(screen.getByText('tianshu.field.DdcAppBO.appName')).toBeInTheDocument()
  expect(screen.queryByRole('button', {name: /创建|保存|删除/})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('目录激活版本'), {target: {value: '8'}})
  fireEvent.click(screen.getAllByRole('button', {name: /查\s*询/}).at(-1)!)
  await waitFor(() => expect(api.query).toHaveBeenLastCalledWith(expect.objectContaining({catalogActivationVersion: '8', pageNo: 1}), expect.any(AbortSignal)))
})
