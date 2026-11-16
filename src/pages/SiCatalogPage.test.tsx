import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp, Button } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDdcExpectedTenantId } from '../api/client'
import type { ReactNode } from 'react'
import type { PageResultRecord, SiResourceItem, SiSemanticSearchResult } from '../api/types'
import { createDdcQueryClient } from '../query/queryClient'
import SiCatalogPage from './SiCatalogPage'

const siApi = vi.hoisted(() => ({
  searchSiResources: vi.fn(),
  semanticSearchSiResources: vi.fn(),
  reindexSiResource: vi.fn(),
  upsertSiServiceBinding: vi.fn(),
  unbindSiServiceBinding: vi.fn(),
  ddcSiQueryKeys: {
    all: () => ['tianshu', '1001', 'si'],
    catalog: (params: unknown) => ['tianshu', '1001', 'si', 'catalog', params],
    search: (params: unknown) => ['tianshu', '1001', 'si', 'search', params],
  },
}))

const mockAuthState = vi.hoisted(() => ({
  codes: ['TIANSHU_SI_READ', 'TIANSHU_SI_WRITE', 'TIANSHU_SI_BINDING_WRITE', 'TIANSHU_SI_INDEX_MANAGE'],
  allow: (resourceKey: string) => {
    if (resourceKey.endsWith('.write')) return mockAuthState.codes.includes('TIANSHU_SI_WRITE')
    if (resourceKey.endsWith('.binding')) return mockAuthState.codes.includes('TIANSHU_SI_BINDING_WRITE')
    if (resourceKey.endsWith('.reindex')) return mockAuthState.codes.includes('TIANSHU_SI_INDEX_MANAGE')
    return mockAuthState.codes.includes('TIANSHU_SI_READ')
  },
}))

vi.mock('../api/si', () => siApi)
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    authorization: {
      snapshot: {
        issuer: 'https://idp.example/tenants/1001',
        subject: 'subject-1001',
        catalogScope: { catalogScopeId: '71001', tenantId: '1001', businessCode: 'ai', applicationCode: 'tianshu', namespaceCode: 'core', environment: 'dev' },
        catalogVersion: '7',
        authVersion: '2',
        policyVersion: '3',
        activeRoleContext: { applicationCode: 'tianshu', rootRoleIds: ['11'], effectiveRoleIds: ['11'] },
        permissionCodes: mockAuthState.codes,
        snapshotExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
      binding: { requestEpoch: 1 },
    },
  }),
}))
vi.mock('../permissions/access', () => ({
  useDdcPermission: (resourceKey: string) => mockAuthState.allow(resourceKey),
  RequirePermission: ({ children }: { children: ReactNode }) => children,
  PermissionButton: ({
    resourceKey,
    disabled,
    ...props
  }: import('antd').ButtonProps & { resourceKey: string }) => (
    <Button {...props} disabled={!mockAuthState.allow(resourceKey) || disabled} />
  ),
}))

const resourceItem: SiResourceItem = {
  id: 910001,
  bizCode: 'ai',
  namespaceId: 2001,
  namespaceCode: 'core',
  envCode: 'dev',
  appCode: 'tianji',
  kind: 'AGENT',
  resourceKey: 'order-planner',
  displayName: '订单规划智能体',
  description: '原子订单规划',
  tags: ['planner'],
  lifecycleStatus: 'PUBLISHED',
  sourceType: 'CONSOLE',
  specJson: '{"modelKey":"gpt-6-luna"}',
  contentSha256: 'a'.repeat(64),
  lastVersionNo: 2,
  currentVersionId: 920002,
  currentVersionNo: 2,
  version: 3,
  publishedTime: '2026-11-16T10:00:00Z',
  createTime: '2026-11-16T09:00:00Z',
  updateTime: '2026-11-16T10:00:00Z',
}

const pageResponse = (records: SiResourceItem[]): PageResultRecord<SiResourceItem> => ({
  success: true,
  code: 10000,
  status: 'SUCCESS',
  message: 'success',
  records,
  page: { total: records.length, pageNo: 1, pageSize: 20, pages: 1, hasNext: false, hasPrevious: false },
  timestamp: 1,
})

const searchResponse = (degradedToFtsOnly: boolean): SiSemanticSearchResult => ({
  degradedToFtsOnly,
  totalHits: 1,
  hits: [
    {
      resource: {
        tenantId: 1001,
        bizCode: 'ai',
        namespaceCode: 'core',
        envCode: 'dev',
        resourceId: 910001,
        kind: 'AGENT',
        resourceKey: 'order-planner',
        displayName: '订单规划智能体',
        status: 'PUBLISHED',
        sourceType: 'CONSOLE',
        activeVersionNo: 2,
      },
      hybridScore: 0.92,
      vectorScore: 0.88,
      ftsScore: 0.75,
      matchedChunkText: 'order planner agent',
      degradedToFtsOnly,
      rank: 1,
    },
  ],
})

const renderPage = () => {
  const queryClient = createDdcQueryClient()
  const router = createMemoryRouter([
    { path: '/si/catalog', element: <SiCatalogPage /> },
    { path: '/si/resources/new', element: <div>New SI Resource</div> },
    { path: '/si/resources/:id', element: <div>SI Editor</div> },
  ], { initialEntries: ['/si/catalog'] })
  return render(
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AntdApp>,
  )
}

describe('SiCatalogPage', () => {
  beforeEach(() => {
    setDdcExpectedTenantId('1001')
    mockAuthState.codes = ['TIANSHU_SI_READ', 'TIANSHU_SI_WRITE', 'TIANSHU_SI_BINDING_WRITE', 'TIANSHU_SI_INDEX_MANAGE']
    siApi.searchSiResources.mockReset().mockResolvedValue(pageResponse([resourceItem]))
    siApi.semanticSearchSiResources.mockReset().mockResolvedValue(searchResponse(true))
    siApi.reindexSiResource.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    setDdcExpectedTenantId(undefined)
  })

  it('renders catalog items, displays FTS degradation banner on semantic fallback, triggers reindex, and guards write permissions', async () => {
    renderPage()

    expect(await screen.findByText('order-planner')).toBeInTheDocument()
    const queryInput = screen.getByTestId('si-semantic-query-input')
    fireEvent.change(queryInput, { target: { value: 'order planner' } })
    fireEvent.click(screen.getByTestId('si-semantic-search-btn'))

    expect(await screen.findByTestId('si-fts-degraded-alert')).toBeInTheDocument()
    expect(await screen.findByText(/0\.92/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('si-reindex-btn-910001'))
    await waitFor(() => expect(siApi.reindexSiResource).toHaveBeenCalledWith(910001))

    cleanup()
    mockAuthState.codes = ['TIANSHU_SI_READ']
    renderPage()
    expect(await screen.findByText('order-planner')).toBeInTheDocument()
    expect(screen.getByTestId('si-create-btn')).toBeDisabled()
  })
})
