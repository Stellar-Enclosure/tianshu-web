import {createInstance} from 'i18next'
import {gatewayAuth} from '../auth/gatewayAuth'
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Alert, App as AntdApp, Button, ConfigProvider, Space, Spin} from 'antd'
import {ReloadOutlined} from '@ant-design/icons'
import {createPageI18nLoader, type PageI18nResult, type PageI18nLoader} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {useAuth} from '../auth/AuthContext'
import {getDdcRequestContext} from '../api/client'
import {getAdminI18nBootstrap, getAdminI18nBundle, getPublicI18nBundle, type AdminI18nBootstrap} from '../api/adminI18n'
import {adminAntdLocale} from './antdLocale'

export type AdminTranslate = (key: string, values?: Readonly<Record<string, string | number>>) => string

const preferenceKey = 'tianshu.admin.locale'
const initialLocale = (): string => {
  let stored: string | null = null
  try { stored = localStorage.getItem(preferenceKey) } catch { /* Language preference is optional. */ }
  try {
    const requested = Intl.getCanonicalLocales(stored ?? navigator.language)[0]
    if (stored && requested) return requested === 'en' ? 'en-US' : requested === 'zh' ? 'zh-CN' : requested
    return requested?.startsWith('en') ? 'en-US' : 'zh-CN'
  } catch { return 'zh-CN' }
}

type AdminMessages = Pick<PageI18nResult, 't' | 'messages' | 'source'>

type MessagesContext = {
  identity: string
  authorized: boolean
  locale: string
  bootstrap?: AdminI18nBootstrap
  changing: boolean
  changeLocale: (locale: string) => Promise<void>
  refresh: () => Promise<void>
  load: (pageCode: string, locale: string, refresh?: boolean) => Promise<AdminMessages>
  register: (pageCode: string) => () => void
}

const Context = createContext<MessagesContext | null>(null)
const bundleKey = (identity: string, pageCode: string, locale: string) => ['tianshu-ui', identity, pageCode, locale] as const

export function AdminI18nProvider({children}: {children: ReactNode}) {
  const {tenantId, sessionGeneration, authorized, authorization} = useAuth()
  const identity = JSON.stringify([tenantId, sessionGeneration, authorized, authorization?.binding])
  return <SessionMessages key={identity} identity={identity} authorized={authorized}>
    {children}
  </SessionMessages>
}

function SessionMessages({identity, authorized, children}: {identity: string; authorized: boolean; children: ReactNode}) {
  const queryClient = useQueryClient()
  const {authorization} = useAuth()
  const [locale, setLocale] = useState(initialLocale)
  const [changing, setChanging] = useState(false)
  const [failure, setFailure] = useState(false)
  const [registrations] = useState(() => new Map<string, number>())
  const [session] = useState(getDdcRequestContext)
  const loader = useRef<PageI18nLoader | null>(null)
  const current = useCallback(() => {
    const context = getDdcRequestContext()
    return context.sessionGeneration === session.sessionGeneration && context.tenantId === session.tenantId
  }, [session])
  useEffect(() => () => { loader.current?.dispose(); loader.current = null }, [])

  const bootstrapQuery = useQuery({
    queryKey: ['tianshu-ui', identity, 'bootstrap'],
    queryFn: ({signal}) => getAdminI18nBootstrap(signal),
    enabled: authorized,
    staleTime: 60_000,
  })
  const {data: bootstrap, refetch: refetchBootstrap, error: bootstrapError} = bootstrapQuery
  const load = useCallback(async (pageCode: string, language: string, refresh = false): Promise<AdminMessages> => {
    if (authorized) {
      if (!authorization) throw new Error('AUTH_PERMISSION_VIEW_REQUIRED')
      if (!loader.current) {
        loader.current = createPageI18nLoader({requestContext: gatewayAuth.context,
          fetchBundle: (query, {signal}) => getAdminI18nBundle(query.pageCode, query.locale, signal)})
        loader.current.setIdentity({...authorization.binding, snapshotExpiresAt: authorization.snapshot.snapshotExpiresAt})
      }
      const {catalogScope, catalogVersion} = authorization.binding
      return loader.current.load({bizCode: catalogScope.businessCode, namespaceCode: catalogScope.namespaceCode,
        env: catalogScope.environment, appCode: catalogScope.applicationCode, catalogScopeId: catalogScope.catalogScopeId,
        catalogActivationVersion: catalogVersion, pageCode, locale: language}, {refresh})
    }
    const bundle = await getPublicI18nBundle(language)
    if (!current() || bundle.pageCode !== 'tianshu.auth' || bundle.locale !== language
      || !bundle.messages || Object.values(bundle.messages).some(value => typeof value !== 'string')) throw new Error('TIANSHU_UI_I18N_UNAVAILABLE')
    const publicI18n = createInstance()
    await publicI18n.init({lng: language, fallbackLng: false, keySeparator: false, nsSeparator: false,
      resources: {[language]: {translation: bundle.messages}}, interpolation: {escapeValue: false, skipOnVariables: true}})
    return {messages: bundle.messages, source: 'remote',
      t: (key, values) => current() ? publicI18n.t(key, {replace: values, nest: false}) : key}
  }, [authorized, authorization, loader, current])
  const register = useCallback((pageCode: string) => {
    registrations.set(pageCode, (registrations.get(pageCode) ?? 0) + 1)
    return () => {
      const count = (registrations.get(pageCode) ?? 1) - 1
      if (count <= 0) registrations.delete(pageCode)
      else registrations.set(pageCode, count)
    }
  }, [registrations])
  const reload = useCallback(async (language: string, force: boolean) => {
    const pageCodes = authorized ? [...new Set(['common', ...registrations.keys()])] : ['tianshu.auth']
    const results = await Promise.all(pageCodes.map(async (pageCode) => ({pageCode, result: await load(pageCode, language, force)})))
    if (!current()) return false
    // The SDK may retain a prior successful bundle after a failed refresh. Keep the visible language unchanged.
    if (results.some(({result}) => result.source === 'stale' || result.source === 'fallback')) throw new Error('TIANSHU_UI_I18N_REFRESH_FAILED')
    for (const {pageCode, result} of results) queryClient.setQueryData(bundleKey(identity, pageCode, language), result)
    return true
  }, [authorized, registrations, load, current, queryClient, identity])
  const changeLocale = useCallback(async (next: string) => {
    if (changing || next === locale) return
    setChanging(true)
    setFailure(false)
    try {
      if (await reload(next, true)) {
        setLocale(next)
        try { localStorage.setItem(preferenceKey, next) } catch { /* Translation content is never persisted. */ }
      }
    } catch {
      if (current()) setFailure(true)
    } finally { if (current()) setChanging(false) }
  }, [changing, locale, reload, current])
  const refresh = useCallback(async () => {
    setFailure(false)
    try {
      if (authorized) await refetchBootstrap()
      await reload(locale, true)
    } catch { if (current()) setFailure(true) }
  }, [authorized, refetchBootstrap, reload, locale, current])
  const value = useMemo(() => ({identity, authorized, locale, bootstrap, changing, changeLocale, refresh, load, register}),
    [identity, authorized, locale, bootstrap, changing, changeLocale, refresh, load, register])
  return <Context.Provider value={value}>
    <LanguageGate bootstrapError={bootstrapError} retryBootstrap={() => void refetchBootstrap()} failure={failure}>
      {children}
    </LanguageGate>
  </Context.Provider>
}

export function useAdminI18n(): MessagesContext {
  const context = useContext(Context)
  if (!context) throw new Error('AdminI18nProvider is required')
  return context
}

export function usePageMessages(pageCode: string) {
  const context = useAdminI18n()
  const {register} = context
  const code = context.authorized ? pageCode : 'tianshu.auth'
  useEffect(() => register(code), [register, code])
  const query = useQuery({
    queryKey: bundleKey(context.identity, code, context.locale),
    queryFn: ({signal}) => {
      signal.throwIfAborted()
      return context.load(code, context.locale)
    },
    enabled: !context.authorized || !!context.bootstrap,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
  const t = useCallback<AdminTranslate>((key, values) => query.data?.t(key, values) ?? key, [query.data])
  return {t, locale: context.locale, loading: !query.data, error: query.error,
    refresh: () => query.refetch(), messages: query.data?.messages}
}

function LanguageGate({children, bootstrapError, retryBootstrap, failure}: {
  children: ReactNode; bootstrapError: unknown; retryBootstrap: () => void; failure: boolean
}) {
  const {authorized, refresh: refreshInterface} = useAdminI18n()
  const {t, loading, error, refresh, locale, messages} = usePageMessages(authorized ? 'common' : 'tianshu.auth')
  if (loading) return <Space direction="vertical" style={{padding: 32}}>
    {error || bootstrapError ? <Button icon={<ReloadOutlined />} aria-label="Retry"
      onClick={() => { if (bootstrapError) retryBootstrap(); else void refresh() }} /> : <Spin />}
  </Space>
  return <ConfigProvider locale={adminAntdLocale(locale, t, messages ?? {})}>
    {failure && <Alert type="warning" showIcon title={t('i18n.refreshFailed')}
      action={<Button onClick={() => void refreshInterface()}>{t('common.retry')}</Button>} />}
    <AntdApp>{children}</AntdApp>
  </ConfigProvider>
}

export function PageLanguageBoundary({pageCode, children}: {pageCode: string; children: ReactNode}) {
  const {t, loading, error, refresh} = usePageMessages(pageCode)
  const common = usePageMessages('common')
  if (loading) return error ? <Alert type="error" title={common.t('i18n.loadFailed')}
    action={<Button onClick={() => void refresh()}>{common.t('common.retry')}</Button>} /> : <Spin description={common.t('common.loading')} />
  return <>{error && <Alert type="warning" title={t('i18n.refreshFailed')} />}{children}</>
}
