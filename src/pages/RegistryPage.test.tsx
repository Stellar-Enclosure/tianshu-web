import {fireEvent, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {setDdcUnauthorizedHandler} from '../api/client'
import {renderWithQueryClient} from '../test/renderWithQueryClient'
import RegistryPage from './RegistryPage'

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

const service = {
  bizCode: 'pay-biz',
  env: 'dev',
  appCode: 'orders',
  serviceId: 'service-order-http',
  serviceKind: 'RPC_PROVIDER',
  protocol: 'grpc',
  serviceName: 'orders.OrderService',
  group: 'default',
  version: '1.0.0',
}

const instance = {
  instanceId: 'service-order-http:uid-1:8080',
  port: 8080,
  metadata: {observationSource: 'KUBERNETES', bindingId: 'service-order-http', podUid: 'uid-1', podName: 'orders-pod-1',
    observedAt: new Date(Date.now() - 1_000).toISOString(), validUntil: new Date(Date.now() + 120_000).toISOString(),
    ready: 'true', serving: 'true'},
}

describe('RegistryPage', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    setDdcUnauthorizedHandler(() => {})
    vi.stubGlobal('fetch', vi.fn((input) => {
      const endpoint = new URL(String(input))
      const url = endpoint.pathname + endpoint.search
      if (url.includes('/registry/services/page')) {
        return Promise.resolve(jsonResponse(pageRecord([service], 12)))
      }
      if (url.includes('/registry/instances/page')) {
        return Promise.resolve(jsonResponse(pageRecord([instance], 1)))
      }
      return Promise.resolve(jsonResponse(record([])))
    }))
  })

  it('pages services and lazily pages one selected service instances', async () => {
    renderWithQueryClient(<RegistryPage />)

    expect(await screen.findByText('orders.OrderService')).toBeInTheDocument()
    expect(screen.getByText('共 12 条')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/tianshu/registry/services/page?pageNo=1&pageSize=10',
      ),
      expect.anything(),
    )
    expect(vi.mocked(fetch).mock.calls.some(([input]) =>
      String(input).includes('/registry/instances/page'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /查\s*看\s*实\s*例/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /registry\/instances\/page\?.*bizCode=pay-biz.*env=dev.*appCode=orders.*serviceName=orders\.OrderService.*bindingId=service-order-http.*pageNo=1.*pageSize=10/,
      ),
      expect.anything(),
    ))
    expect(await screen.findByText('orders-pod-1')).toBeInTheDocument()
    const instanceCalls = vi.mocked(fetch).mock.calls.filter(([input]) =>
      String(input).includes('/registry/instances/page'))
    expect(instanceCalls).toHaveLength(1)
    expect(document.querySelector('.ant-drawer-content-wrapper'))
      .toHaveStyle({ width: '100%' })
  })
  it('does not show endpoints from an expired observation or a different Service binding', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/services/page')) return Promise.resolve(jsonResponse(pageRecord([service], 1)))
      if (url.pathname.endsWith('/instances/page')) return Promise.resolve(jsonResponse(pageRecord([{
        ...instance, metadata: {...instance.metadata, bindingId: 'another-service', validUntil: new Date(Date.now() - 1_000).toISOString()},
      }], 1)))
      return Promise.resolve(jsonResponse(record([])))
    })
    renderWithQueryClient(<RegistryPage />)
    fireEvent.click(await screen.findByRole('button', {name: /查\s*看\s*实\s*例/}))
    expect(await screen.findByText('观测已过期')).toBeInTheDocument()
    expect(screen.queryByText('orders-pod-1')).toBeNull()
  })

})
