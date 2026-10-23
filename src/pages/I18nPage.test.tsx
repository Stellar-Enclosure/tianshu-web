import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginDdcSession, DdcApiError, setDdcExpectedTenantId } from '../api/client'
import type { DdcI18nCreateCommand, DdcI18nDraftCommand, DdcI18nPage } from '../api/i18n'
import { createDdcQueryClient } from '../query/queryClient'
import I18nPage from './I18nPage'

const api = vi.hoisted(() => ({
  pageI18nPages: vi.fn(), getI18nPage: vi.fn(), createI18nPage: vi.fn(),
  replaceI18nDraft: vi.fn(), publishI18nPage: vi.fn(),
}))
const auth = vi.hoisted(() => ({
  tenantId: 'tenant-1', sessionGeneration: 0,
  guards: new Set<() => Promise<boolean>>(),
  registerUnsavedChangesGuard: vi.fn(),
}))

vi.mock('../api/i18n', async (importOriginal) => ({ ...await importOriginal<typeof import('../api/i18n')>(), ...api }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('./I18nBundlePreview', () => ({
  default: ({ publishedVersion }: { publishedVersion: string | null }) => <div>预览发布版本：{publishedVersion ?? '未发布'}</div>,
}))
vi.mock('../components/scope/ScopeSelects', () => ({
  default: () => <div>应用范围选择器</div>,
}))

const scope = { bizCode: 'retail', namespaceCode: 'office', env: 'prod', appCode: 'orders' }
const initialPage = (): DdcI18nPage => ({
  ...scope, id: '71', pageCode: 'order.list', name: '订单页面', defaultLocale: 'zh-CN',
  revision: '3', publishedVersion: null, translations: { 'zh-CN': { title: '订单' }, 'en-US': { title: 'Orders' } },
})
let server: DdcI18nPage

const renderPage = () => {
  const router = createMemoryRouter([{
    path: '/', element: <><Link to="/away">离开页面</Link><Outlet /></>, children: [
      { path: 'metadata/i18n', element: <I18nPage /> },
      { path: 'away', element: <div>其他页面</div> },
    ],
  }], { initialEntries: [`/metadata/i18n?${new URLSearchParams(scope)}`] })
  const queryClient = createDdcQueryClient()
  const view = render(<AntdApp><QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider></AntdApp>)
  return { ...view, router, queryClient }
}

const openPage = async () => {
  fireEvent.click(await screen.findByRole('button', { name: '编辑 order.list' }))
  await screen.findByDisplayValue('订单页面')
}

describe('page translation administration', () => {
  beforeEach(() => {
    auth.sessionGeneration = beginDdcSession()
    setDdcExpectedTenantId(auth.tenantId)
    auth.guards.clear()
    auth.registerUnsavedChangesGuard.mockReset().mockImplementation((guard: () => Promise<boolean>) => {
      auth.guards.add(guard)
      return () => auth.guards.delete(guard)
    })
    server = initialPage()
    api.pageI18nPages.mockReset().mockImplementation(async () => ({ records: [server],
      page: { total: 1, pageNo: 1, pageSize: 20, pages: 1, hasNext: false, hasPrevious: false } }))
    api.getI18nPage.mockReset().mockImplementation(async () => server)
    api.createI18nPage.mockReset().mockImplementation(async (command: DdcI18nCreateCommand) => {
      server = { ...command, id: '72', revision: '0', publishedVersion: null }
      return server
    })
    api.replaceI18nDraft.mockReset().mockImplementation(async (_id: string, command: DdcI18nDraftCommand) => {
      server = { ...server, name: command.name, defaultLocale: command.defaultLocale,
        translations: command.translations, revision: '4' }
      return server
    })
    api.publishI18nPage.mockReset().mockImplementation(async () => {
      server = { ...server, revision: '5', publishedVersion: '1' }
      return server
    })
  })
  afterEach(() => { cleanup(); setDdcExpectedTenantId(undefined) })

  it('lists the complete application scope and saves before publishing the exact latest revision', async () => {
    renderPage()
    await openPage()
    expect(api.pageI18nPages).toHaveBeenCalledWith({ ...scope, pageNo: 1, pageSize: 20 }, expect.anything())
    fireEvent.change(screen.getByLabelText('第 1 条 en-US 文案'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: '发布已保存草稿' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenCalledWith('71', {
      expectedRevision: '3', name: '订单页面', defaultLocale: 'zh-CN',
      translations: { 'zh-CN': { title: '订单' }, 'en-US': {} },
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: '发布已保存草稿' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '发布已保存草稿' }))
    await waitFor(() => expect(api.publishI18nPage).toHaveBeenCalledWith('71', '4'))
    expect(await screen.findByText('已发布版本 1')).toBeInTheDocument()
    expect(screen.getByText('预览发布版本：1')).toBeInTheDocument()
  })

  it('creates an empty common draft and enables language and word entry editing', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: '新建页面' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }))
    fireEvent.change(await screen.findByLabelText('页面标识'), { target: { value: 'common' } })
    fireEvent.change(screen.getByLabelText('页面名称'), { target: { value: '公共文案' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    await waitFor(() => expect(api.createI18nPage).toHaveBeenCalledWith({
      ...scope, pageCode: 'common', name: '公共文案', defaultLocale: 'zh-CN', translations: { 'zh-CN': {} },
    }))
    await screen.findByText('编辑 common')
    expect(screen.getByLabelText('页面标识')).toBeDisabled()
    expect(screen.getByRole('button', { name: '发布已保存草稿' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('新增语言代码'), { target: { value: 'en-us' } })
    fireEvent.click(screen.getByRole('button', { name: '添加语言' }))
    fireEvent.click(screen.getByRole('button', { name: '添加词条' }))
    fireEvent.change(screen.getByLabelText('第 1 条文案 key'), { target: { value: 'actions.save' } })
    fireEvent.change(screen.getByLabelText('第 1 条 zh-CN 文案'), { target: { value: '保存' } })
    fireEvent.change(screen.getByLabelText('第 1 条 en-US 文案'), { target: { value: 'Save' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenCalledWith('72', expect.objectContaining({
      expectedRevision: '0', translations: { 'zh-CN': { 'actions.save': '保存' }, 'en-US': { 'actions.save': 'Save' } },
    })))
  })

  it('keeps local content after a revision conflict until the user explicitly adopts the server revision', async () => {
    api.replaceI18nDraft.mockImplementationOnce(async () => {
      server = { ...server, revision: '4', translations: { 'zh-CN': { title: '服务器文案' } } }
      throw new DdcApiError(409, 'REVISION_CONFLICT', 'revision conflict')
    })
    renderPage()
    await openPage()
    fireEvent.change(screen.getByLabelText('第 1 条 zh-CN 文案'), { target: { value: '本地文案' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    expect(await screen.findByText('草稿已被其他人修改，本地编辑已保留')).toBeInTheDocument()
    expect(screen.getByLabelText('第 1 条 zh-CN 文案')).toHaveValue('本地文案')
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled()
    fireEvent.click(await screen.findByRole('button', { name: '我已比较，保留本地内容继续编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenLastCalledWith('71', expect.objectContaining({
      expectedRevision: '4', translations: { 'zh-CN': { title: '本地文案' }, 'en-US': { title: 'Orders' } },
    })))
  })

  it('protects unsaved edits when switching pages, leaving the route and changing the authentication session', async () => {
    const { router } = renderPage()
    await openPage()
    fireEvent.change(screen.getByLabelText('页面名称'), { target: { value: '未保存名称' } })
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('离开并放弃未保存的修改')
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText('页面名称')).toHaveValue('未保存名称')
    let answer: Promise<boolean> = Promise.resolve(true)
    await act(async () => { answer = [...auth.guards][0]() })
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(await answer).toBe(false)
    fireEvent.click(screen.getByRole('link', { name: '离开页面' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '放弃修改并离开' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
  })

  it('does not expose a stale server revision when conflict refresh fails, and recovers through retry', async () => {
    api.replaceI18nDraft.mockRejectedValueOnce(new DdcApiError(409, 'REVISION_CONFLICT', 'revision conflict'))
    api.getI18nPage.mockResolvedValueOnce(initialPage())
      .mockRejectedValueOnce(new Error('刷新暂时失败'))
      .mockResolvedValue({ ...initialPage(), revision: '8', name: '服务器名称' })
    renderPage()
    await openPage()
    fireEvent.change(screen.getByLabelText('页面名称'), { target: { value: '本地名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    expect(await screen.findByText('读取最新草稿失败：刷新暂时失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '我已比较，保留本地内容继续编辑' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    fireEvent.click(await screen.findByRole('button', { name: '我已比较，保留本地内容继续编辑' }))
    expect(screen.getByLabelText('页面名称')).toHaveValue('本地名称')
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenLastCalledWith('71', expect.objectContaining({
      expectedRevision: '8', name: '本地名称',
    })))
  })

  it('ignores a completed save from an expired session', async () => {
    let resolveSave: (page: DdcI18nPage) => void = () => {}
    api.replaceI18nDraft.mockImplementation(() => new Promise<DdcI18nPage>((resolve) => { resolveSave = resolve }))
    const { queryClient } = renderPage()
    await openPage()
    fireEvent.change(screen.getByLabelText('页面名称'), { target: { value: '新名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenCalledTimes(1))
    beginDdcSession()
    await act(async () => { resolveSave({ ...server, revision: '4', name: '旧会话响应' }) })
    expect(screen.getByLabelText('页面名称')).toHaveValue('新名称')
    expect(queryClient.getQueryData(['tianshu', 'tenant-1', 'i18n', 'page', '71']))
      .toMatchObject({ name: '订单页面', revision: '3' })
  })

  it('does not apply a late detail response after selecting a different page', async () => {
    let resolveFirst: (page: DdcI18nPage) => void = () => {}
    const second = { ...initialPage(), id: '72', pageCode: 'order.detail', name: '订单详情' }
    api.pageI18nPages.mockResolvedValue({ records: [server, second], page: { total: 2 } })
    api.getI18nPage.mockImplementation((id: string) => id === '71'
      ? new Promise<DdcI18nPage>((resolve) => { resolveFirst = resolve }) : Promise.resolve(second))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '编辑 order.list' }))
    await waitFor(() => expect(api.getI18nPage).toHaveBeenCalledWith('71', expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: '编辑 order.detail' }))
    await screen.findByDisplayValue('订单详情')
    await act(async () => { resolveFirst({ ...server, name: '旧页面的迟到响应' }) })
    expect(screen.getByLabelText('页面名称')).toHaveValue('订单详情')
    expect(screen.queryByDisplayValue('旧页面的迟到响应')).not.toBeInTheDocument()
  })

  it('shows a list error without treating the failed response as an empty list', async () => {
    api.pageI18nPages.mockRejectedValue(new DdcApiError(403, 'FORBIDDEN', '无权限读取'))
    renderPage()
    expect(await screen.findByText('读取页面列表失败')).toBeInTheDocument()
    expect(screen.getByText('无权限读取')).toBeInTheDocument()
    expect(screen.queryByText('当前应用暂无页面语言包')).not.toBeInTheDocument()
  })
})
