import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DdcApiError, setDdcExpectedTenantId } from '../api/client'
import type { SiResourceItem } from '../api/types'
import { createDdcQueryClient } from '../query/queryClient'
import SiResourceEditorPage from './SiResourceEditorPage'

const siApi = vi.hoisted(() => ({
  getSiResource: vi.fn(),
  createSiResource: vi.fn(),
  replaceSiDraft: vi.fn(),
  publishSiDraft: vi.fn(),
  pageSiResourceVersions: vi.fn(),
  listSiVersionReferences: vi.fn(),
  upsertSiServiceBinding: vi.fn(),
  unbindSiServiceBinding: vi.fn(),
  ddcSiQueryKeys: {
    all: () => ['tianshu', '1001', 'si'],
    detail: (id: string | number) => ['tianshu', '1001', 'si', 'detail', String(id)],
    versions: (id: string | number) => ['tianshu', '1001', 'si', 'versions', String(id)],
    references: (id: string | number, dir: string) => ['tianshu', '1001', 'si', 'references', String(id), dir],
  },
}))

vi.mock('../api/si', () => siApi)

const existingMcp: SiResourceItem = {
  id: 910002,
  bizCode: 'ai',
  namespaceId: 2001,
  namespaceCode: 'core',
  envCode: 'dev',
  appCode: 'tianji',
  kind: 'MCP',
  resourceKey: 'erp-mcp',
  displayName: 'ERP 工具集',
  description: 'ERP MCP endpoint',
  tags: ['erp'],
  lifecycleStatus: 'DRAFT',
  sourceType: 'CONSOLE',
  specJson: JSON.stringify({ transport: 'STDIO', command: 'npx', args: ['-y', 'erp-mcp'] }),
  contentSha256: 'b'.repeat(64),
  lastVersionNo: 0,
  currentVersionId: null,
  currentVersionNo: null,
  version: 2,
  createTime: '2026-11-16T09:00:00Z',
  updateTime: '2026-11-16T10:00:00Z',
}

const renderEditor = (path: string) => {
  const queryClient = createDdcQueryClient()
  const router = createMemoryRouter([
    { path: '/si/resources/new', element: <SiResourceEditorPage /> },
    { path: '/si/resources/:id', element: <SiResourceEditorPage /> },
    { path: '/si/catalog', element: <div>Catalog</div> },
  ], { initialEntries: [path] })
  return render(
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AntdApp>,
  )
}

describe('SiResourceEditorPage', () => {
  beforeEach(() => {
    setDdcExpectedTenantId('1001')
    siApi.getSiResource.mockReset().mockResolvedValue(existingMcp)
    siApi.replaceSiDraft.mockReset().mockResolvedValue(existingMcp)
    siApi.pageSiResourceVersions.mockReset().mockResolvedValue({
      success: true, code: 10000, status: 'SUCCESS', message: 'ok',
      records: [], page: { total: 0, pageNo: 1, pageSize: 20, pages: 0, hasNext: false, hasPrevious: false }, timestamp: 1,
    })
    siApi.listSiVersionReferences.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    setDdcExpectedTenantId(undefined)
  })

  it('switches MCP transport fields dynamically, guards plaintext secret leaks, sends expectedVersion and preserves edits on 409 conflict', async () => {
    renderEditor('/si/resources/910002')

    expect(await screen.findByDisplayValue('ERP 工具集')).toBeInTheDocument()
    const transportSelect = screen.getByTestId('si-mcp-transport-select')
    fireEvent.change(transportSelect, { target: { value: 'STREAMABLE_HTTP' } })

    const endpointInput = await screen.findByTestId('si-mcp-endpoint-input')
    fireEvent.change(endpointInput, { target: { value: 'https://mcp.example.com/sse' } })

    const headersInput = screen.getByTestId('si-mcp-headers-secret-check')
    fireEvent.change(headersInput, { target: { value: '{"Authorization":"Bearer sk-plaintext-leak"}' } })
    fireEvent.click(screen.getByTestId('si-save-draft-btn'))
    expect(await screen.findByTestId('si-secret-leak-alert')).toBeInTheDocument()
    expect(siApi.replaceSiDraft).not.toHaveBeenCalled()

    // Remove secret and hit 409 conflict: user input must be preserved
    fireEvent.change(headersInput, { target: { value: '{"X-Env":"dev"}' } })
    siApi.replaceSiDraft.mockRejectedValueOnce(
      new DdcApiError(409, 'TIANSHU_SI_CONFLICT', 'Concurrent version mismatch'),
    )
    fireEvent.click(screen.getByTestId('si-save-draft-btn'))

    await waitFor(() => expect(siApi.replaceSiDraft).toHaveBeenCalledWith(
      '910002',
      expect.objectContaining({ expectedVersion: 2 }),
    ))
    expect(await screen.findByTestId('si-conflict-alert')).toBeInTheDocument()
    expect((screen.getByTestId('si-mcp-endpoint-input') as HTMLInputElement).value).toBe('https://mcp.example.com/sse')
  })
})
