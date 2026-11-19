import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDdcUnauthorizedHandler } from '../api/client'
import { renderWithQueryClient } from '../test/renderWithQueryClient'
import InstancesPage from './InstancesPage'

const record = (data: unknown) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  data,
  traceId: 'trace-scope',
  timestamp: 1,
})

const pageRecord = (records: unknown[], total: number, pageNo = 1) => ({
  success: true,
  code: 0,
  status: 'SUCCESS',
  message: '',
  records,
  page: {
    total,
    pageNo,
    pageSize: 10,
    pages: Math.ceil(total / 10),
    hasNext: pageNo < Math.ceil(total / 10),
    hasPrevious: pageNo > 1,
  },
  traceId: 'trace-instances',
  timestamp: 1,
})

const jsonResponse = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)

const workload = () => ({
  targetBindingId: 'orders-primary',
  clusterId: 'prod-cluster',
  k8sNamespace: 'orders-app',
  workloadUid: 'deployment-uid',
  status: 'FRESH',
  observedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 60_000).toISOString(),
  desiredReplicas: 2,
  pods: [
    { podUid: 'pod-1', podName: 'orders-1', containerName: 'app', ready: true, restartCount: 0 },
    { podUid: 'pod-2', podName: 'orders-2', containerName: 'app', ready: false, restartCount: 1 },
  ],
})

const scopeInputs = (): HTMLInputElement[] =>
  Array.from(document.querySelectorAll('input.ant-select-input')) as HTMLInputElement[]

const typeAndEnter = (input: HTMLInputElement, value: string): void => {
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
}

const fillCompleteScope = async (): Promise<void> => {
  await waitFor(() => expect(scopeInputs()).toHaveLength(4))
  typeAndEnter(scopeInputs()[0], 'pay-biz')
  typeAndEnter(scopeInputs()[1], 'default')
  typeAndEnter(scopeInputs()[2], 'prod')
  typeAndEnter(scopeInputs()[3], 'orders')
}

const mockScopeEndpoints = (
  instances: (url: string) => Response | Promise<Response>,
): void => {
  vi.mocked(fetch).mockImplementation((input) => {
    const endpoint = new URL(String(input))
    const url = endpoint.pathname + endpoint.search
    if (url.includes('/instances/page')) return Promise.resolve(instances(url))
    if (url.includes('/bizs')) return Promise.resolve(jsonResponse(record([
      { bizCode: 'pay-biz', bizName: '支付域' },
    ])))
    if (url.includes('/namespaces')) return Promise.resolve(jsonResponse(record([
      { namespaceCode: 'default', namespace: '默认', bizCode: 'pay-biz' },
    ])))
    if (url.includes('/envs')) return Promise.resolve(jsonResponse(record([
      { envCode: 'prod', description: '生产环境' },
    ])))
    if (url.includes('/apps')) return Promise.resolve(jsonResponse(record([
      { appCode: 'orders', appName: '订单应用', bizCode: 'pay-biz' },
    ])))
    return Promise.resolve(jsonResponse(record(null)))
  })
}

beforeEach(() => {
  setDdcUnauthorizedHandler(() => {})
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InstancesPage', () => {
  it('shows observed readiness with the workload target and its two pods', async () => {
    mockScopeEndpoints(() => jsonResponse(pageRecord([workload()], 1)))
    renderWithQueryClient(<InstancesPage />)
    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    expect(await screen.findByText('orders-primary')).toBeInTheDocument()
    expect(screen.getByText('prod-cluster / orders-app')).toBeInTheDocument()
    expect(screen.getByText('orders-1')).toBeInTheDocument()
    expect(screen.getByText('orders-2')).toBeInTheDocument()
    expect(screen.getByText('已就绪')).toBeInTheDocument()
    expect(screen.getByText('未就绪')).toBeInTheDocument()
    expect(screen.queryByText('最近心跳')).not.toBeInTheDocument()
  })

  it('keeps expired observations separate from a fresh workload scaled to zero', async () => {
    mockScopeEndpoints(() => jsonResponse(pageRecord([
      { ...workload(), validUntil: new Date(Date.now() - 1).toISOString() },
      { ...workload(), targetBindingId: 'worker-zero', desiredReplicas: 0, pods: [] },
    ], 2)))
    renderWithQueryClient(<InstancesPage />)
    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))

    expect(await screen.findByText('观察已过期')).toBeInTheDocument()
    expect(screen.queryByText('orders-1')).not.toBeInTheDocument()
    expect(screen.getByText('worker-zero')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('expires a displayed observation without waiting for another server response', async () => {
    let requests = 0
    mockScopeEndpoints(() => {
      requests += 1
      return jsonResponse(pageRecord([
        { ...workload(), validUntil: new Date(Date.now() + 1_200).toISOString() },
      ], 1))
    })
    renderWithQueryClient(<InstancesPage />)
    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))

    expect(await screen.findByText('观察有效')).toBeInTheDocument()
    expect(await screen.findByText('观察已过期', undefined, { timeout: 3_000 })).toBeInTheDocument()
    expect(screen.queryByText('orders-1')).not.toBeInTheDocument()
    expect(requests).toBe(1)
  })

  it('requests instances with submitted scope and preserves server page metadata', async () => {
    mockScopeEndpoints(() => jsonResponse(pageRecord([workload()], 21)))
    renderWithQueryClient(<InstancesPage />)

    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))

    expect(await screen.findByText('orders-primary')).toBeInTheDocument()
    expect(screen.getByText('共 21 条')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/tianshu/instances/page?bizCode=pay-biz&env=prod&appCode=orders&pageNo=1&pageSize=10',
      ),
      expect.anything(),
    )
  })

  it('resets to the first server page when the scope is submitted again', async () => {
    mockScopeEndpoints((url) => {
      const pageNo = Number(new URL(url, 'http://tianshu.test').searchParams.get('pageNo') ?? '1')
      return jsonResponse(pageRecord([workload()], 21, pageNo))
    })
    renderWithQueryClient(<InstancesPage />)

    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    await screen.findByText('orders-primary')

    fireEvent.click(screen.getByTitle('2'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('pageNo=2&pageSize=10'),
      expect.anything(),
    ))

    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('pageNo=1&pageSize=10'),
      expect.anything(),
    ))
  })

  it('shows a retryable error without dropping the submitted scope', async () => {
    let attempts = 0
    mockScopeEndpoints(() => {
      attempts += 1
      if (attempts === 1) {
        return jsonResponse({
          success: false,
          code: 500,
          status: 'TIANSHU_INTERNAL_FAILURE',
          message: '实例列表加载失败',
          data: null,
          traceId: 'trace-instances-error',
          timestamp: 1,
        }, 500)
      }
      return jsonResponse(pageRecord([workload()], 1))
    })
    renderWithQueryClient(<InstancesPage />)

    await fillCompleteScope()
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    fireEvent.click(await screen.findByRole('button', { name: /重\s*试/ }))

    expect(await screen.findByText('orders-primary')).toBeInTheDocument()
    expect(attempts).toBe(2)
  })
})
