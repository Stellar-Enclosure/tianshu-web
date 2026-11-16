import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DdcApiError, setDdcExpectedTenantId } from '../api/client'
import type { SiEnvMatrixItem } from '../api/types'
import { createDdcQueryClient } from '../query/queryClient'
import SiEnvMatrixPage from './SiEnvMatrixPage'

const siApi = vi.hoisted(() => ({
  getSiEnvMatrix: vi.fn(),
  promoteSiVersion: vi.fn(),
  rollbackSiResource: vi.fn(),
  changeSiLifecycle: vi.fn(),
  deleteSiResource: vi.fn(),
  listSiVersionReferences: vi.fn(),
  ddcSiQueryKeys: {
    all: () => ['tianshu', '1001', 'si'],
    matrix: (params: unknown) => ['tianshu', '1001', 'si', 'matrix', params],
  },
}))

vi.mock('../api/si', () => siApi)

const matrixItems: SiEnvMatrixItem[] = [
  {
    versionId: 920001,
    resourceId: 910001,
    envCode: 'dev',
    activeVersionNo: 2,
    digestSha256: 'a'.repeat(64),
    sourceEnvCode: 'dev',
    sourceVersionNo: 1,
    indexStatus: 'INDEXED',
    published: true,
    publishedTime: '2026-11-16T10:00:00Z',
  },
  {
    versionId: 920002,
    resourceId: 910001,
    envCode: 'prod',
    activeVersionNo: 1,
    digestSha256: 'b'.repeat(64),
    sourceEnvCode: 'staging',
    sourceVersionNo: 1,
    indexStatus: 'INDEXED',
    published: true,
    publishedTime: '2026-11-16T09:00:00Z',
  },
]

const renderMatrix = () => {
  const queryClient = createDdcQueryClient()
  const router = createMemoryRouter([
    { path: '/si/matrix', element: <SiEnvMatrixPage /> },
  ], { initialEntries: ['/si/matrix?bizCode=ai&namespaceCode=core&kind=AGENT&resourceKey=order-planner'] })
  return render(
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AntdApp>,
  )
}

describe('SiEnvMatrixPage', () => {
  beforeEach(() => {
    setDdcExpectedTenantId('1001')
    siApi.getSiEnvMatrix.mockReset().mockResolvedValue(matrixItems)
    siApi.promoteSiVersion.mockReset().mockResolvedValue(matrixItems[1])
    siApi.deleteSiResource.mockReset()
    siApi.listSiVersionReferences.mockReset().mockResolvedValue([
      {
        id: 501,
        sourceType: 'TIANJI_PROCESS',
        sourceKey: 'order-fulfillment-flow',
        targetType: 'AGENT',
        targetKind: 'AGENT',
        targetKey: 'order-planner',
        envCode: 'dev',
        required: true,
      },
    ])
  })

  afterEach(() => {
    cleanup()
    setDdcExpectedTenantId(undefined)
  })

  it('renders cross-env baselines with UTC title tooltip and shows blockingReferences on archive 409', async () => {
    renderMatrix()

    expect(await screen.findByText('dev')).toBeInTheDocument()
    const timeBadge = screen.getByTestId('si-matrix-time-920001')
    expect(timeBadge).toHaveAttribute('title', '2026-11-16T10:00:00Z')

    // Trigger promote flow
    fireEvent.click(screen.getByTestId('si-promote-btn-920001'))
    const confirmPromote = await screen.findByTestId('si-lifecycle-confirm-btn')
    fireEvent.click(confirmPromote)
    await waitFor(() => expect(siApi.promoteSiVersion).toHaveBeenCalled())

    // Trigger archive -> 409 blockingReferences displays Tianji Flowable blocker key
    siApi.deleteSiResource.mockRejectedValueOnce(
      new DdcApiError(409, 'TIANSHU_SI_ARCHIVE_BLOCKED', 'Blocked by active inbound reference'),
    )
    fireEvent.click(screen.getByTestId('si-archive-btn-920001'))
    const confirmArchive = await screen.findByTestId('si-lifecycle-confirm-btn')
    fireEvent.click(confirmArchive)

    expect(await screen.findByTestId('si-blocking-references-list')).toBeInTheDocument()
    expect(await screen.findByText('order-fulfillment-flow')).toBeInTheDocument()
  })
})
