import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {StrictMode, useEffect, useState} from 'react'
import {App as AntdApp} from 'antd'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {beginDdcSession, getDdcRequestContext, setDdcExpectedTenantId} from '../api/client'
import type {AdminI18nBootstrap} from '../api/adminI18n'
import type {DdcI18nBundle} from '../api/i18n'
import {
  AdminI18nProvider, PageLanguageBoundary, useAdminI18n, usePageMessages, type AdminTranslate,
} from './AdminI18nProvider'

const auth = vi.hoisted(() => ({tenantId: undefined as string | undefined, sessionGeneration: 0, authorized: false}))
const api = vi.hoisted(() => ({
  getAdminI18nBootstrap: vi.fn(), getAdminI18nBundle: vi.fn(), getPublicI18nBundle: vi.fn(),
}))

vi.unmock('../i18n/AdminI18nProvider')
vi.mock('../auth/AuthContext', () => ({useAuth: () => auth}))
vi.mock('../api/adminI18n', () => api)

const adminScope = {bizCode: 'platform', namespaceCode: 'admin', env: 'prod', appCode: 'tianshu'}
const bootstrap = (): AdminI18nBootstrap => ({
  scope: {...adminScope}, defaultLocale: 'zh-CN', locales: ['zh-CN', 'en-US'],
  pages: [{pageCode: 'tianshu.bizs', name: 'Business domains'}], canInitialize: false,
})

const bundle = (pageCode: string, locale: string, tenant = 'tenant-a', version = '1'): DdcI18nBundle => ({
  pageCode, locale, defaultLocale: 'zh-CN', version,
  messages: {
    title: pageCode === 'tianshu.auth'
      ? (locale === 'zh-CN' ? '登录' : 'Sign in')
      : `${tenant} ${locale === 'zh-CN' ? '企业文案' : 'Enterprise text'} ${version}`,
    welcome: locale === 'zh-CN' ? '你好 {{name}}' : 'Hello {{name}}',
    'common.save': locale === 'zh-CN' ? '保存' : 'Save',
    'common.retry': locale === 'zh-CN' ? '重试' : 'Retry',
    'common.loading': locale === 'zh-CN' ? '加载中' : 'Loading',
    'i18n.refreshFailed': locale === 'zh-CN' ? '语言包刷新失败' : 'Language bundle refresh failed',
    'i18n.loadFailed': locale === 'zh-CN' ? '语言包加载失败' : 'Language bundle loading failed',
    ...(version === '1' ? {obsolete: 'Removed in the next publication'} : {}),
  },
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, resolve, reject}
}

function establishSession(tenantId?: string) {
  auth.sessionGeneration = beginDdcSession()
  setDdcExpectedTenantId(tenantId)
  auth.tenantId = tenantId
  auth.authorized = tenantId !== undefined
}

function Probe({capture}: {capture?: (translate: AdminTranslate) => void}) {
  const {modal} = AntdApp.useApp()
  const {locale, changing, changeLocale, refresh, bootstrap: configuration} = useAdminI18n()
  const {t} = usePageMessages('tianshu.bizs')
  const common = usePageMessages('common')
  const [draft, setDraft] = useState('')
  const [businessScope, setBusinessScope] = useState('business-app-a')
  useEffect(() => { capture?.(t) }, [capture, t])
  return <>
    <output data-testid="page-title">{t('title')}</output>
    <output data-testid="welcome">{t('welcome', {name: 'Alice'})}</output>
    <output data-testid="common-save">{common.t('common.save')}</output>
    <output data-testid="removed-key">{t('obsolete')}</output>
    <output data-testid="locale">{locale}</output>
    <output data-testid="changing">{String(changing)}</output>
    <output data-testid="admin-scope">{JSON.stringify(configuration?.scope ?? null)}</output>
    <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <input aria-label="Business scope" value={businessScope} onChange={(event) => setBusinessScope(event.target.value)} />
    <button disabled={changing} onClick={() => void changeLocale('en-US')}>English</button>
    <button disabled={changing} onClick={() => void changeLocale('zh-CN')}>Chinese</button>
    <button onClick={() => void refresh()}>Refresh bundles</button>
    <button onClick={() => modal.confirm({title: 'Confirm operation'})}>Open confirmation</button>
  </>
}

const clients: QueryClient[] = []
function renderProvider({strict = false, capture}: {strict?: boolean; capture?: (translate: AdminTranslate) => void} = {}) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})
  clients.push(client)
  const tree = () => {
    const content = <QueryClientProvider client={client}>
      <AdminI18nProvider>
        <PageLanguageBoundary pageCode="tianshu.bizs"><Probe capture={capture} /></PageLanguageBoundary>
      </AdminI18nProvider>
    </QueryClientProvider>
    return strict ? <StrictMode>{content}</StrictMode> : content
  }
  const view = render(tree())
  return {...view, client, rerenderSession: () => view.rerender(tree())}
}

describe('AdminI18nProvider with the real page SDK', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('tianshu.admin.locale', 'zh-CN')
    establishSession('tenant-a')
    api.getAdminI18nBootstrap.mockReset().mockImplementation(async () => bootstrap())
    api.getAdminI18nBundle.mockReset().mockImplementation(async (pageCode: string, locale: string) =>
      bundle(pageCode, locale, getDdcRequestContext().tenantId))
    api.getPublicI18nBundle.mockReset().mockImplementation(async (locale: string) => bundle('tianshu.auth', locale))
  })

  afterEach(() => {
    cleanup()
    clients.splice(0).forEach((client) => client.clear())
    establishSession()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('uses the supported English default for an English browser region', async () => {
    localStorage.removeItem('tianshu.admin.locale')
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB')
    renderProvider()
    expect(await screen.findByTestId('locale')).toHaveTextContent('en-US')
    expect(screen.getByTestId('common-save')).toHaveTextContent('Save')
  })

  it('loads only the public package before authentication', async () => {
    establishSession()
    renderProvider()

    expect(await screen.findByTestId('page-title')).toHaveTextContent('登录')
    expect(screen.getByTestId('common-save')).toHaveTextContent('保存')
    expect(api.getPublicI18nBundle).toHaveBeenCalledWith('zh-CN', expect.any(AbortSignal))
    expect(api.getAdminI18nBootstrap).not.toHaveBeenCalled()
    expect(api.getAdminI18nBundle).not.toHaveBeenCalled()
  })

  it('waits for the authorized scope and renders common and page messages through the real SDK', async () => {
    const configuration = deferred<AdminI18nBootstrap>()
    api.getAdminI18nBootstrap.mockImplementation(() => configuration.promise)
    renderProvider()
    await waitFor(() => expect(api.getAdminI18nBootstrap).toHaveBeenCalledOnce())
    expect(api.getAdminI18nBundle).not.toHaveBeenCalled()
    expect(screen.queryByTestId('page-title')).not.toBeInTheDocument()

    await act(async () => { configuration.resolve(bootstrap()) })
    expect(await screen.findByTestId('page-title')).toHaveTextContent('tenant-a 企业文案 1')
    expect(screen.getByTestId('common-save')).toHaveTextContent('保存')
    expect(screen.getByTestId('welcome')).toHaveTextContent('你好 Alice')
    expect(api.getAdminI18nBundle).toHaveBeenCalledWith('common', 'zh-CN', expect.any(AbortSignal))
    expect(api.getAdminI18nBundle).toHaveBeenCalledWith('tianshu.bizs', 'zh-CN', expect.any(AbortSignal))
    expect(api.getPublicI18nBundle).not.toHaveBeenCalled()
  })

  it('finishes its initial page and common loads under StrictMode', async () => {
    renderProvider({strict: true})

    expect(await screen.findByTestId('page-title')).toHaveTextContent('tenant-a 企业文案 1')
    expect(screen.getByTestId('common-save')).toHaveTextContent('保存')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('commits a language switch only after every visible bundle loads and preserves local input', async () => {
    const commonEnglish = deferred<DdcI18nBundle>()
    const pageEnglish = deferred<DdcI18nBundle>()
    api.getAdminI18nBundle.mockImplementation((pageCode: string, locale: string) => locale === 'en-US'
      ? (pageCode === 'common' ? commonEnglish.promise : pageEnglish.promise)
      : Promise.resolve(bundle(pageCode, locale)))
    renderProvider()
    await screen.findByTestId('page-title')
    fireEvent.change(screen.getByLabelText('Draft'), {target: {value: 'Unsaved tenant configuration'}})
    fireEvent.click(screen.getByRole('button', {name: 'English'}))
    await waitFor(() => expect(api.getAdminI18nBundle).toHaveBeenCalledWith('tianshu.bizs', 'en-US', expect.any(AbortSignal)))

    await act(async () => { commonEnglish.resolve(bundle('common', 'en-US')) })
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
    expect(screen.getByTestId('page-title')).toHaveTextContent('tenant-a 企业文案 1')
    expect(screen.getByTestId('common-save')).toHaveTextContent('保存')
    expect(screen.getByTestId('changing')).toHaveTextContent('true')
    expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved tenant configuration')

    await act(async () => { pageEnglish.resolve(bundle('tianshu.bizs', 'en-US')) })
    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('en-US'))
    expect(screen.getByTestId('page-title')).toHaveTextContent('tenant-a Enterprise text 1')
    expect(screen.getByTestId('common-save')).toHaveTextContent('Save')
    expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved tenant configuration')
    expect(localStorage.getItem('tianshu.admin.locale')).toBe('en-US')
  })

  it('keeps the current language and draft when a requested language fails, and allows another attempt', async () => {
    let failEnglish = true
    api.getAdminI18nBundle.mockImplementation(async (pageCode: string, locale: string) => {
      if (failEnglish && pageCode === 'tianshu.bizs' && locale === 'en-US') throw new Error('offline')
      return bundle(pageCode, locale)
    })
    renderProvider()
    await screen.findByTestId('page-title')
    fireEvent.change(screen.getByLabelText('Draft'), {target: {value: 'Keep draft'}})
    fireEvent.click(screen.getByRole('button', {name: 'English'}))

    expect(await screen.findByRole('alert')).toHaveTextContent('语言包刷新失败')
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
    expect(screen.getByTestId('page-title')).toHaveTextContent('tenant-a 企业文案 1')
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep draft')
    expect(localStorage.getItem('tianshu.admin.locale')).toBe('zh-CN')

    failEnglish = false
    fireEvent.click(screen.getByRole('button', {name: 'English'}))
    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('en-US'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep draft')
  })

  it('refreshes the published version and removes deleted messages without resetting the draft', async () => {
    let version = '1'
    api.getAdminI18nBundle.mockImplementation(async (pageCode: string, locale: string) => bundle(pageCode, locale, 'tenant-a', version))
    renderProvider()
    await screen.findByTestId('page-title')
    fireEvent.change(screen.getByLabelText('Draft'), {target: {value: 'Keep draft'}})
    expect(screen.getByTestId('removed-key')).toHaveTextContent('Removed in the next publication')

    version = '2'
    fireEvent.click(screen.getByRole('button', {name: 'Refresh bundles'}))
    await waitFor(() => expect(screen.getByTestId('page-title')).toHaveTextContent('tenant-a 企业文案 2'))
    expect(screen.getByTestId('removed-key')).toHaveTextContent(/^obsolete$/)
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep draft')
  })

  it('supplies central component text to contextual confirmation dialogs', async () => {
    api.getAdminI18nBundle.mockImplementation(async (pageCode: string, locale: string) => ({
      ...bundle(pageCode, locale),
      messages: {...bundle(pageCode, locale).messages,
        'antd.Modal.okText': 'Company confirm', 'antd.Modal.cancelText': 'Company cancel'},
    }))
    renderProvider()
    await screen.findByTestId('page-title')
    fireEvent.click(screen.getByRole('button', {name: 'Open confirmation'}))
    expect(await screen.findByRole('button', {name: 'Company confirm'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Company cancel'}))
  })

  it.each(['tenant-b', 'tenant-a'])('discards old translators and late language changes after a new session for %s', async (nextTenant) => {
    const oldEnglish = deferred<DdcI18nBundle>()
    const capture = vi.fn<(translate: AdminTranslate) => void>()
    const initialGeneration = auth.sessionGeneration
    api.getAdminI18nBundle.mockImplementation(async (pageCode: string, locale: string) => {
      const session = getDdcRequestContext()
      if (session.sessionGeneration === initialGeneration && locale === 'en-US' && pageCode === 'tianshu.bizs') return oldEnglish.promise
      return bundle(pageCode, locale, session.tenantId, session.sessionGeneration === initialGeneration ? '1' : '2')
    })
    const view = renderProvider({capture})
    await screen.findByTestId('page-title')
    const previousTranslate = capture.mock.lastCall![0]
    fireEvent.change(screen.getByLabelText('Draft'), {target: {value: 'Private old-session input'}})
    fireEvent.click(screen.getByRole('button', {name: 'English'}))
    await waitFor(() => expect(api.getAdminI18nBundle).toHaveBeenCalledWith('tianshu.bizs', 'en-US', expect.any(AbortSignal)))

    establishSession(nextTenant)
    view.rerenderSession()
    expect(await screen.findByTestId('page-title')).toHaveTextContent(`${nextTenant} 企业文案 2`)
    expect(screen.getByLabelText('Draft')).toHaveValue('')
    expect(previousTranslate('title')).toBe('title')

    await act(async () => { oldEnglish.resolve(bundle('tianshu.bizs', 'en-US', 'tenant-a')) })
    expect(screen.getByTestId('page-title')).toHaveTextContent(`${nextTenant} 企业文案 2`)
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem('tianshu.admin.locale')).toBe('zh-CN')
  })

  it('does not install a late initial page response into the next tenant', async () => {
    const oldPage = deferred<DdcI18nBundle>()
    api.getAdminI18nBundle.mockImplementation((pageCode: string, locale: string) => {
      const tenant = getDdcRequestContext().tenantId
      return tenant === 'tenant-a' && pageCode === 'tianshu.bizs'
        ? oldPage.promise : Promise.resolve(bundle(pageCode, locale, tenant))
    })
    const view = renderProvider()
    await waitFor(() => expect(api.getAdminI18nBundle).toHaveBeenCalledWith('tianshu.bizs', 'zh-CN', expect.any(AbortSignal)))
    expect(screen.queryByTestId('page-title')).not.toBeInTheDocument()

    establishSession('tenant-b')
    view.rerenderSession()
    expect(await screen.findByTestId('page-title')).toHaveTextContent('tenant-b 企业文案 1')
    await act(async () => { oldPage.resolve(bundle('tianshu.bizs', 'zh-CN', 'tenant-a')) })
    expect(screen.getByTestId('page-title')).toHaveTextContent('tenant-b 企业文案 1')
  })

  it('keeps the language scope on bootstrap configuration when business filters change', async () => {
    renderProvider()
    await screen.findByTestId('page-title')
    expect(screen.getByTestId('admin-scope')).toHaveTextContent(JSON.stringify(adminScope))
    const callsBeforeFilter = api.getAdminI18nBundle.mock.calls.length
    fireEvent.change(screen.getByLabelText('Business scope'), {target: {value: 'another-business-app'}})
    expect(api.getAdminI18nBundle).toHaveBeenCalledTimes(callsBeforeFilter)
    fireEvent.click(screen.getByRole('button', {name: 'Refresh bundles'}))
    await waitFor(() => expect(api.getAdminI18nBundle.mock.calls.length).toBeGreaterThan(callsBeforeFilter))

    expect(screen.getByTestId('admin-scope')).toHaveTextContent(JSON.stringify(adminScope))
    expect(api.getAdminI18nBundle.mock.calls.every(([pageCode, locale, signal, ...extra]) =>
      ['common', 'tianshu.bizs'].includes(pageCode as string) && locale === 'zh-CN'
        && signal instanceof AbortSignal && extra.length === 0)).toBe(true)
    expect(api.getPublicI18nBundle).not.toHaveBeenCalled()
  })
})
