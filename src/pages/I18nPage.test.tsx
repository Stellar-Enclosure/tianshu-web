import {authorizationFixture} from '../test/permissionFixture'
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
  replaceI18nDraft: vi.fn(), publishI18nPage: vi.fn(), getI18nSourcePage: vi.fn(), getI18nPublication: vi.fn(),
}))
const auth = vi.hoisted(() => ({
  tenantId: '1001', sessionGeneration: 0, authorization: undefined as ReturnType<typeof authorizationFixture> | undefined,
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
  catalogScope: {...authorizationFixture().binding.catalogScope, businessCode: scope.bizCode, namespaceCode: scope.namespaceCode, environment: scope.env, applicationCode: scope.appCode},
  catalogActivationVersion: '7', draftActivationVersion: '7', sourceDefaults: {'zh-CN': {title: '源订单'}, 'en-US': {title: 'Source orders'}},
  sourceHashes: {title: 'a'.repeat(64)}, draftSourceHashes: {title: 'a'.repeat(64)}, publishedSourceHashes: {}, publishedTranslations: {}, diagnostics: [],
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
    auth.authorization = authorizationFixture(auth.tenantId)
    auth.guards.clear()
    auth.registerUnsavedChangesGuard.mockReset().mockImplementation((guard: () => Promise<boolean>) => {
      auth.guards.add(guard)
      return () => auth.guards.delete(guard)
    })
    server = initialPage()
    api.pageI18nPages.mockReset().mockImplementation(async () => ({ records: [server],
      page: { total: 1, pageNo: 1, pageSize: 20, pages: 1, hasNext: false, hasPrevious: false } }))
    api.getI18nPage.mockReset().mockImplementation(async () => server)
    api.getI18nSourcePage.mockReset().mockImplementation(async (_target, pageCode: string) => ({...server, id: null, pageCode, name: pageCode, translations: {'zh-CN': {}}, draftSourceHashes: {}}))
    api.createI18nPage.mockReset().mockImplementation(async (command: DdcI18nCreateCommand) => {
      server = { ...server, ...command, id: '72', revision: '0', publishedVersion: null, draftSourceHashes: command.reviewedSourceHashes }
      return server
    })
    api.replaceI18nDraft.mockReset().mockImplementation(async (_id: string, command: DdcI18nDraftCommand) => {
      server = { ...server, name: command.name, defaultLocale: command.defaultLocale,
        translations: command.translations, revision: '4', draftSourceHashes: command.reviewedSourceHashes }
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
      expectedRevision: '3', catalogActivationVersion: '7', reviewedSourceHashes: {title: 'a'.repeat(64)}, name: '订单页面', defaultLocale: 'zh-CN',
      translations: { 'zh-CN': { title: '订单' }, 'en-US': {} },
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: '发布已保存草稿' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '发布已保存草稿' }))
    await waitFor(() => expect(api.publishI18nPage).toHaveBeenCalledWith('71', '4', expect.stringMatching(/^[a-f0-9-]{36}$/)))
    expect(await screen.findByText('已发布版本 1')).toBeInTheDocument()
    expect(screen.getByText('预览发布版本：1')).toBeInTheDocument()
  })

  it('loads source-owned keys before creating and requires explicit current-source review for overrides', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', {name: '新建页面'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button', {name: '新建页面'}))
    fireEvent.change(await screen.findByLabelText('页面标识'), {target: {value: 'common'}})
    expect(screen.getByRole('button', {name: '创建草稿'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button', {name: '加载代码源文案'}))
    await waitFor(() => expect(screen.getByLabelText('页面名称')).toHaveValue('common'))
    await waitFor(() => expect(screen.getByLabelText('第 1 条文案 key')).toBeDisabled())
    fireEvent.change(screen.getByLabelText('页面名称'), {target: {value: '公共文案'}})
    fireEvent.change(screen.getByLabelText('第 1 条 zh-CN 文案'), {target: {value: '自定义订单'}})
    fireEvent.click(screen.getByRole('button', {name: '创建草稿'}))
    expect(await screen.findByText('请逐项核对当前源文案后再保存。')).toBeInTheDocument()
    expect(api.createI18nPage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('确认已核对 title'))
    fireEvent.click(screen.getByRole('button', {name: '创建草稿'}))
    await waitFor(() => expect(api.createI18nPage).toHaveBeenCalledWith(expect.objectContaining({
      ...scope, catalogScopeId: '71001', catalogActivationVersion: '7', pageCode: 'common', name: '公共文案',
      reviewedSourceHashes: {title: 'a'.repeat(64)}, translations: {'zh-CN': {title: '自定义订单'}, 'en-US': {}},
    })))
    expect(screen.queryByRole('button', {name: '添加词条'})).not.toBeInTheDocument()
  })

  it('reviews every current source key even when only one key has an override', async () => {
    server = {...server, sourceHashes: {...server.sourceHashes, 'new.title': 'b'.repeat(64)},
      sourceDefaults: {...server.sourceDefaults, 'zh-CN': {...server.sourceDefaults['zh-CN'], 'new.title': '新源文案'}}}
    renderPage()
    await openPage()
    fireEvent.change(screen.getByLabelText('页面名称'), {target: {value: '新名称'}})
    fireEvent.click(screen.getByRole('button', {name: '保存草稿'}))
    expect(await screen.findByText('请逐项核对当前源文案后再保存。')).toBeInTheDocument()
    expect(api.replaceI18nDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('确认已核对 new.title'))
    fireEvent.click(screen.getByRole('button', {name: '保存草稿'}))
    await waitFor(() => expect(api.replaceI18nDraft).toHaveBeenCalledWith('71', expect.objectContaining({
      reviewedSourceHashes: {title: 'a'.repeat(64), 'new.title': 'b'.repeat(64)},
    })))
  })

  it('opens an existing override returned by source lookup instead of creating it again', async () => {
    api.getI18nSourcePage.mockResolvedValue(server)
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', {name: '新建页面'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button', {name: '新建页面'}))
    fireEvent.change(await screen.findByLabelText('页面标识'), {target: {value: 'order.list'}})
    fireEvent.click(screen.getByRole('button', {name: '加载代码源文案'}))
    await screen.findByDisplayValue('订单页面')
    expect(screen.getByLabelText('页面标识')).toBeDisabled()
    expect(screen.getByRole('button', {name: '保存草稿'})).toBeInTheDocument()
    expect(api.createI18nPage).not.toHaveBeenCalled()
  })

  it('retains the publication operation and only retries the same operation after an uncertain response', async () => {
    api.publishI18nPage.mockRejectedValueOnce(new DdcApiError(0, 'NETWORK', 'offline'))
    renderPage()
    await openPage()
    fireEvent.click(screen.getByRole('button', {name: '发布已保存草稿'}))
    await screen.findByText('发布结果尚未确认，请查询这次发布的结果。')
    const first = api.publishI18nPage.mock.calls[0]
    expect(first).toEqual(['71', '3', expect.stringMatching(/^[a-f0-9-]{36}$/)])
    expect(screen.getByRole('button', {name: '发布已保存草稿'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button', {name: '重试同一次发布'}))
    await waitFor(() => expect(api.publishI18nPage).toHaveBeenCalledTimes(2))
    expect(api.publishI18nPage.mock.calls[1]).toEqual(first)
    expect(await screen.findByText('已发布版本 1')).toBeInTheDocument()
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
    fireEvent.click(screen.getByLabelText('确认已核对 title'))
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
    fireEvent.click(screen.getByLabelText('确认已核对 title'))
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
    expect(queryClient.getQueriesData({queryKey: ['tianshu', '1001', 'i18n', 'page']})[0]?.[1]).toMatchObject({name: '订单页面', revision: '3'})
  })

  it('does not apply a late detail response after selecting a different page', async () => {
    let resolveFirst: (page: DdcI18nPage) => void = () => {}
    const second = { ...initialPage(), id: '72', pageCode: 'order.detail', name: '订单详情' }
    api.pageI18nPages.mockResolvedValue({ records: [server, second], page: { total: 2 } })
    api.getI18nPage.mockImplementation((id: string) => id === '71'
      ? new Promise<DdcI18nPage>((resolve) => { resolveFirst = resolve }) : Promise.resolve(second))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '编辑 order.list' }))
    await waitFor(() => expect(api.getI18nPage).toHaveBeenCalledWith('71', '7', expect.anything()))
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
