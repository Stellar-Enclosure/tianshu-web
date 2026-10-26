import {authorizationFixture} from '../test/permissionFixture'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {App as AntdApp} from 'antd'
import {createMemoryRouter, RouterProvider} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {beginDdcSession, setDdcExpectedTenantId} from '../api/client'
import {fixtureT} from '../test/i18nFixture'
import I18nPage from './I18nPage'

const state = vi.hoisted(() => ({
  canInitialize: true, refresh: vi.fn(), initialize: vi.fn(), page: vi.fn(),
}))
const adminScope = {bizCode: 'xingyuan', namespaceCode: 'default', env: 'local', appCode: 'tianshu'}
vi.mock('../auth/AuthContext', () => ({useAuth: () => ({tenantId: '1001', sessionGeneration: 1, authorization: authorizationFixture()})}))
vi.mock('../api/adminI18n', () => ({initializeAdminI18n: state.initialize}))
vi.mock('../api/i18n', async (original) => ({...await original<typeof import('../api/i18n')>(), pageI18nPages: state.page}))
vi.mock('../components/scope/ScopeSelects', () => ({default: () => null}))
vi.mock('../i18n/AdminI18nProvider', () => ({
  usePageMessages: (page: string) => ({t: fixtureT(page), locale: 'zh-CN'}),
  useAdminI18n: () => ({bootstrap: {scope: adminScope, canInitialize: state.canInitialize}, refresh: state.refresh}),
}))

const show = () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
  const router = createMemoryRouter([{path: '/', element: <I18nPage />}], {
    initialEntries: ['/?bizCode=retail&namespaceCode=shop&env=prod&appCode=orders'],
  })
  return render(<QueryClientProvider client={client}><AntdApp><RouterProvider router={router} /></AntdApp></QueryClientProvider>)
}

describe('administration catalog initialization', () => {
  beforeEach(() => {
    beginDdcSession()
    setDdcExpectedTenantId('tenant-a')
    state.canInitialize = true
    state.page.mockReset().mockResolvedValue({records: [], page: {total: 0, pageNo: 1, pageSize: 20}})
    state.initialize.mockReset().mockResolvedValue({created: 3, skipped: 12})
    state.refresh.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => { cleanup(); setDdcExpectedTenantId(undefined) })

  it('switches to the server-provided scope and initializes only after an explicit action', async () => {
    show()
    await waitFor(() => expect(state.page).toHaveBeenCalled())
    expect(state.initialize).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', {name: '查看管理台语言包'}))
    await waitFor(() => expect(state.page).toHaveBeenLastCalledWith({...adminScope, pageNo: 1, pageSize: 20}, expect.anything()))
    fireEvent.click(screen.getByRole('button', {name: '初始化默认文案'}))
    expect(await screen.findByText('已创建 3 个语言包，跳过 12 个已有页面')).toBeInTheDocument()
    expect(state.initialize).toHaveBeenCalledTimes(1)
    expect(state.refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps initialization disabled when permissions or the bound scope are unavailable', async () => {
    state.canInitialize = false
    show()
    expect(screen.getByRole('button', {name: '初始化默认文案'})).toBeDisabled()
    expect(state.initialize).not.toHaveBeenCalled()
  })
})
