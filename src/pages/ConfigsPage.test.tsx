import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {QueryClientProvider} from '@tanstack/react-query'
import {App as AntdApp} from 'antd'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {EmbeddedWorkbench, type WorkbenchHost} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {setDdcUnauthorizedHandler} from '../api/client'
import {clearWorkbenchSnapshots} from '../lib/query'
import {createDdcQueryClient} from '../query/queryClient'
import {renderWithQueryClient} from '../test/renderWithQueryClient'
import ConfigsPage from './ConfigsPage'

const record = (data: unknown) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  data,
  traceId: 't',
  timestamp: 1,
})

const pageRecord = <T,>(records: T[], total: number) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  records,
  page: {
    total,
    pageNo: 1,
    pageSize: 10,
    pages: Math.ceil(total / 10),
    hasNext: total > 10,
    hasPrevious: false,
  },
  traceId: 't',
  timestamp: 1,
})

const jsonResponse = (body: unknown) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
)

const configRow = {
  id: 'cfg-1',
  bizCode: 'pay-biz',
  appCode: 'orders',
  env: 'dev',
  visibleNamespaces: ['default', 'ops'],
  resourceName: 'application.yml' as const,
  content: 'feature:\n  enabled: true\n',
  format: 'YAML' as const,
  currentVersion: 3,
  description: '业务配置',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-02T00:00:00Z',
}

const versionRow = {
  id: 'v3',
  configId: 'cfg-1',
  version: 3,
  resourceName: 'application.yml' as const,
  newContent: 'feature:\n  enabled: true\n',
  format: 'YAML' as const,
  changeType: 'UPDATE',
  changeReason: 'enable feature',
  operator: 'mario',
  createdAt: '2026-07-02T00:00:00Z',
}

const mockConfigEndpoints = (): void => {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const endpoint = new URL(String(input))
    const url = endpoint.pathname + endpoint.search
    if (url.includes('/configs/cfg-1/versions/page')) {
      return Promise.resolve(jsonResponse(pageRecord([versionRow], 11)))
    }
    if (url.includes('/configs/page')) {
      return Promise.resolve(jsonResponse(pageRecord([configRow], 13)))
    }
    if (url.includes('/bizs') || url.includes('/namespaces')
        || url.includes('/envs') || url.includes('/apps')) {
      return Promise.resolve(jsonResponse(record([])))
    }
    if (url.includes('/publish') && init?.method === 'POST') {
      return Promise.resolve(jsonResponse(record({
        changeId: 'change-1',
        status: 'SUCCESS',
      })))
    }
    return Promise.resolve(jsonResponse(record(null)))
  })
}

const clickLastButton = (name: RegExp): void => {
  const buttons = screen.getAllByRole('button', { name })
  fireEvent.click(buttons[buttons.length - 1])
}

describe('ConfigsPage', () => {
  beforeEach(() => {
    clearWorkbenchSnapshots()
    setDdcUnauthorizedHandler(() => {})
    vi.stubGlobal('fetch', vi.fn())
  })

  it('pages configs and lazily pages version history', async () => {
    mockConfigEndpoints()
    renderWithQueryClient(<ConfigsPage />)

    expect(await screen.findByText('业务配置')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: '业务域 / 环境 / 应用'})).toBeInTheDocument()
    expect(screen.getByText('pay-biz / dev / orders')).toBeInTheDocument()
    expect(screen.getByText('共 13 条')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/tianshu/configs/page?includeDeleted=false&pageNo=1&pageSize=10',
      ),
      expect.anything(),
    )
    expect(vi.mocked(fetch).mock.calls.some(([input]) =>
      String(input).includes('/versions/page'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /更\s*多\s*操\s*作/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /查\s*看\s*版\s*本/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/tianshu/configs/cfg-1/versions/page?pageNo=1&pageSize=10',
      ),
      expect.anything(),
    ))
    expect(await screen.findByText('enable feature')).toBeInTheDocument()
    expect(screen.getByText('共 11 条')).toBeInTheDocument()
  })

  it('publishes only after the Ant Design confirmation', async () => {
    mockConfigEndpoints()
    renderWithQueryClient(<ConfigsPage />)
    await screen.findByText('业务配置')

    fireEvent.click(screen.getByRole('button', { name: /发\s*布/ }))
    expect(await screen.findAllByText('确认发布 application.yml 当前版本？'))
      .not.toHaveLength(0)
    expect(within(screen.getAllByRole('dialog').at(-1)!).getByText('作用域：pay-biz / dev / orders')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/publish') && init?.method === 'POST')).toBe(false)

    clickLastButton(/发\s*布/)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/publish') && init?.method === 'POST')).toBe(true))
  })

  it('deletes and rolls back only after confirmation', async () => {
    mockConfigEndpoints()
    renderWithQueryClient(<ConfigsPage />)
    await screen.findByText('业务配置')

    fireEvent.click(screen.getByRole('button', { name: /更\s*多\s*操\s*作/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /删\s*除/ }))
    expect(await screen.findAllByText('确认删除 application.yml？'))
      .not.toHaveLength(0)
    expect(within(screen.getAllByRole('dialog').at(-1)!).getByText('作用域：pay-biz / dev / orders')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input) === 'https://tianshu.example.invalid/api/v1/tianshu/configs/cfg-1'
      && init?.method === 'DELETE')).toBe(false)
    clickLastButton(/删\s*除/)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input) === 'https://tianshu.example.invalid/api/v1/tianshu/configs/cfg-1'
      && init?.method === 'DELETE')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /更\s*多\s*操\s*作/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /查\s*看\s*版\s*本/ }))
    await screen.findByText('enable feature')
    fireEvent.click(screen.getByRole('button', { name: /回\s*滚/ }))
    expect(await screen.findAllByText('确认回滚到版本 3？'))
      .not.toHaveLength(0)
    expect(within(screen.getAllByRole('dialog').at(-1)!).getByText('作用域：pay-biz / dev / orders')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/rollback') && init?.method === 'POST')).toBe(false)
    clickLastButton(/回\s*滚/)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/rollback') && init?.method === 'POST')).toBe(true))
  }, 10_000)

  it('renders WorkspaceList four regions and restores submitted page state after switching away and back', async () => {
    mockConfigEndpoints()
    let attachedPort: Parameters<WorkbenchHost['attach']>[0] | null = null
    const host: WorkbenchHost = {
      attach: (port) => {
        attachedPort = port
        return { ok: true }
      },
      reportCatalog: () => ({ ok: true }),
      requestNavigation: () => ({ ok: true }),
    }
    const queryClient = createDdcQueryClient()

    const renderPage = (showConfigs: boolean) => (
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/configs']}>
            <EmbeddedWorkbench
              host={host}
              status="ready"
              pages={[{
                pageId: 'tianshu.page.configs',
                pattern: '/configs',
                label: '配置资源',
                groupKey: 'configuration',
                groupLabel: '配置管理',
                identityParams: [],
                queryKeys: [],
              }]}
              onPresent={async () => ({ ok: true })}
            >
              {showConfigs ? <ConfigsPage /> : <div>other page</div>}
            </EmbeddedWorkbench>
          </MemoryRouter>
        </QueryClientProvider>
      </AntdApp>
    )

    const view = render(renderPage(true))
    expect(await screen.findByText('业务配置')).toBeInTheDocument()
    expect(document.querySelector('[data-region="query"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="toolbar"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="table"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="pagination"]')).toBeInTheDocument()

    await act(async () => {
      await attachedPort?.present({
        mode: 'show',
        navigationId: 1,
        tabKey: '["tianshu","tianshu.page.configs"]',
        target: { path: '/configs', search: '' },
        signal: new AbortController().signal,
      })
    })

    // Navigate to page 2, switch out to another internal page, then return to page 2
    fireEvent.click(screen.getByRole('listitem', { name: '2' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/configs/page?includeDeleted=false&pageNo=2&pageSize=10'),
      expect.anything(),
    ))

    view.rerender(renderPage(false))
    view.rerender(renderPage(true))

    await waitFor(() => {
      expect(screen.getByRole('listitem', { name: '2' })).toHaveClass('ant-pagination-item-active')
    })
  })
})
