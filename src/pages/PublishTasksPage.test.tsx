import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClientProvider} from '@tanstack/react-query'
import {App as AntdApp} from 'antd'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {EmbeddedWorkbench, type WorkbenchHost} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {setDdcUnauthorizedHandler} from '../api/client'
import {clearWorkbenchSnapshots} from '../lib/query'
import {createDdcQueryClient} from '../query/queryClient'
import {renderWithQueryClient} from '../test/renderWithQueryClient'
import PublishTasksPage from './PublishTasksPage'

const record = (data: unknown) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  data,
  traceId: 't',
  timestamp: 1,
})

const pageRecord = (total = 12) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  records: [task],
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

const failure = {
  success: false,
  code: 56999,
  status: 'TIANSHU_INTERNAL_FAILURE',
  message: '发布任务加载失败',
  data: null,
  timestamp: 1,
}

const jsonResponse = (body: unknown) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
)

const task = {
  id: 't-1',
  changeId: 'change-9',
  configId: 'cfg-1',
  bizCode: 'pay-biz',
  appCode: 'orders',
  env: 'dev',
  resourceName: 'application.yml',
  targetVersion: 4,
  publishMode: 'SYNC',
  resourceChecksum: 'abc',
  attemptCount: 1,
  dispatchedAt: '2026-07-31T10:00:00Z',
  completedAt: '2026-07-31T10:00:05Z',
  failureStage: null,
  status: 'FAILED',
  targetCount: 3,
  ackCount: 2,
  failedCount: 1,
  ignoredCount: 0,
  timeoutCount: 0,
  timeoutMs: 30000,
  operator: 'local-admin',
  errorMessage: 'one failure',
  createdAt: '2026-07-31T10:00:00Z',
  updatedAt: '2026-07-31T10:00:05Z',
}

const mockEndpoints = (details: unknown = task): void => {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const endpoint = new URL(String(input))
    const url = endpoint.pathname + endpoint.search
    if (url.includes('/publish-tasks/page')) {
      return Promise.resolve(jsonResponse(pageRecord()))
    }
    if (url.endsWith('/publish-tasks/change-9')) {
      return Promise.resolve(jsonResponse(record(details)))
    }
    if (url.includes('/retry') && init?.method === 'POST') {
      return Promise.resolve(jsonResponse(record({
        changeId: 'change-9',
        status: 'SUCCESS',
      })))
    }
    if (url.includes('/bizs') || url.includes('/namespaces')
        || url.includes('/envs') || url.includes('/apps')) {
      return Promise.resolve(jsonResponse(record([])))
    }
    return Promise.resolve(jsonResponse(record(null)))
  })
}

describe('PublishTasksPage', () => {
  beforeEach(() => {
    clearWorkbenchSnapshots()
    setDdcUnauthorizedHandler(() => {})
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pages filtered tasks and opens a viewport-safe detail modal', async () => {
    mockEndpoints()
    renderWithQueryClient(<PublishTasksPage />)

    expect(await screen.findByText('change-9')).toBeInTheDocument()
    expect(screen.getByText('共 12 条')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/tianshu/publish-tasks/page?pageNo=1&pageSize=10',
      ),
      expect.anything(),
    )

    fireEvent.mouseDown(screen.getByLabelText('状态'))
    const failedOptions = await screen.findAllByText('失败')
    fireEvent.click(failedOptions[failedOptions.length - 1])
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/publish-tasks\/page\?.*status=FAILED/),
      expect.anything(),
    ))

    fireEvent.click(screen.getByRole('button', { name: 'change-9' }))
    await screen.findByText('one failure')
    expect(document.querySelector('.ant-modal'))
      .toHaveStyle({ width: 'calc(100vw - 24px)' })
  })

  it('shows a fresh process receipt separately from the historical task and hides it at expiry', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true})
    mockEndpoints({...task, historyOnly: false, desiredRevision: '4', platformState: 'APPLIED',
      rolloutState: 'APPLIED', processState: 'PARTIAL_FAILURE',
      observationValidUntil: new Date(Date.now() + 3_000).toISOString(),
      targets: [{targetBindingId: 'config-target-a', desiredRevision: '4', platformState: 'APPLIED',
        rolloutState: 'APPLIED', processState: 'PARTIAL_FAILURE', desiredReplicas: 2, currentCount: 2,
        appliedCount: 1, failedCount: 1, waitingCount: 0, currentProcesses: [
          {podUid: 'pod-uid-current', podName: 'orders-new', containerName: 'app',
            status: 'APPLIED', appliedRevision: '4', lastReportedAt: new Date().toISOString()},
        ]}],
    })
    renderWithQueryClient(<PublishTasksPage />)
    fireEvent.click(await screen.findByRole('button', {name: 'change-9'}))
    expect(await screen.findByText('orders-new / app')).toBeInTheDocument()
    expect(screen.getAllByText('部分失败')).toHaveLength(2)
    expect(screen.getByText('2 / 2 / 1 / 1 / 0')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(await screen.findByText('观测已过期')).toBeInTheDocument()
    expect(screen.queryByText('orders-new / app')).toBeNull()
  })

  it('presents published zero replicas as waiting without an invented receipt', async () => {
    mockEndpoints({...task, historyOnly: false, desiredRevision: '4', platformState: 'APPLIED',
      processState: 'PUBLISHED_WAITING_FOR_CONSUMERS', observationValidUntil: new Date(Date.now() + 60_000).toISOString(),
      targets: [{targetBindingId: 'config-target-zero', desiredReplicas: 0, currentCount: 0,
        appliedCount: 0, failedCount: 0, waitingCount: 0, currentProcesses: []}],
    })
    renderWithQueryClient(<PublishTasksPage />)
    fireEvent.click(await screen.findByRole('button', {name: 'change-9'}))
    expect(await screen.findByText('已发布，等待副本')).toBeInTheDocument()
    expect(screen.getByText('0 / 0 / 0 / 0 / 0')).toBeInTheDocument()
    expect(screen.queryByText('最后回执时间')).toBeNull()
  })

  it('keeps the current page visible when a background poll fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let pageAttempts = 0
    vi.mocked(fetch).mockImplementation((input) => {
      const endpoint = new URL(String(input))
      const url = endpoint.pathname + endpoint.search
      if (url.includes('/publish-tasks/page')) {
        pageAttempts += 1
        return Promise.resolve(jsonResponse(
          pageAttempts === 1 ? pageRecord(1) : failure,
        ))
      }
      return Promise.resolve(jsonResponse(record([])))
    })
    renderWithQueryClient(<PublishTasksPage />)
    expect(await screen.findByText('change-9')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    await waitFor(() => expect(pageAttempts).toBeGreaterThanOrEqual(2))
    expect(screen.getByText('change-9')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('retries only after the Ant Design confirmation', async () => {
    mockEndpoints()
    renderWithQueryClient(<PublishTasksPage />)
    await screen.findByText('change-9')

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findAllByText('确认重试任务 change-9？'))
      .not.toHaveLength(0)
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/retry') && init?.method === 'POST')).toBe(false)

    const retryButtons = screen.getAllByRole('button', { name: /重\s*试/ })
    fireEvent.click(retryButtons[retryButtons.length - 1])
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/retry') && init?.method === 'POST')).toBe(true))
  })

  it('locates a deep-linked ?changeId= task via detail API, restores draft/submitted/scroll in four-region layout, and pauses 15s polling when suspended', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let pageCalls = 0
    vi.mocked(fetch).mockImplementation((input) => {
      const endpoint = new URL(String(input))
      const url = endpoint.pathname + endpoint.search
      if (url.includes('/publish-tasks/page')) {
        pageCalls += 1
        return Promise.resolve(jsonResponse(pageRecord(1)))
      }
      if (url.endsWith('/publish-tasks/change-deep')) {
        return Promise.resolve(jsonResponse(record({
          ...task,
          id: 't-deep',
          changeId: 'change-deep',
          errorMessage: 'deep link failure',
        })))
      }
      return Promise.resolve(jsonResponse(record([])))
    })

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

    const ui = (visible: boolean) => (
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/publish-tasks?changeId=change-deep']}>
            <EmbeddedWorkbench
              host={host}
              status="ready"
              pages={[{
                pageId: 'tianshu.page.publishTasks',
                pattern: '/publish-tasks',
                label: '发布任务',
                groupKey: 'runtime',
                groupLabel: '运行状态',
                identityParams: [],
                queryKeys: ['changeId'],
              }]}
              onPresent={async () => ({ ok: true })}
            >
              {visible ? <PublishTasksPage /> : <div>other tab</div>}
            </EmbeddedWorkbench>
          </MemoryRouter>
        </QueryClientProvider>
      </AntdApp>
    )

    const view = render(ui(true))
    expect(document.querySelector('[data-region="query"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="toolbar"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="table"]')).toBeInTheDocument()
    expect(document.querySelector('[data-region="pagination"]')).toBeInTheDocument()

    // Deep-linked changeId opens detail modal via existing detail API without searching full list
    expect(await screen.findByText('deep link failure')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Change ID')).toHaveValue('change-deep')

    // Activate tab via present(show), edit draft filter and scroll position, then suspend
    await act(async () => {
      await attachedPort?.present({
        mode: 'show',
        navigationId: 1,
        tabKey: '["tianshu","tianshu.page.publishTasks"]',
        target: { path: '/publish-tasks', search: '?changeId=change-deep' },
        signal: new AbortController().signal,
      })
    })
    fireEvent.change(screen.getByPlaceholderText('Change ID'), { target: { value: 'draft-id-only' } })
    const callsWhileActive = pageCalls

    await act(async () => {
      await attachedPort?.present({
        mode: 'suspend',
        navigationId: 2,
        signal: new AbortController().signal,
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(pageCalls).toBe(callsWhileActive)

    // Unmount (switch to another internal route) and remount restores draft filter
    view.rerender(ui(false))
    view.rerender(ui(true))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Change ID')).toHaveValue('draft-id-only')
    })
  })
})
