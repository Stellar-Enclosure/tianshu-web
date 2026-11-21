import {Result} from 'antd'
import {cloudDeliveryMessages} from './permissions/messages'
import {gatewayAuth, LOGIN_CALLBACK, POPUP_CALLBACK} from './auth/gatewayAuth'
import {FieldCatalogProvider} from './permissions/FieldCatalog'
import {RequirePermission} from './permissions/access'
import ResourceMetadataPage from './pages/ResourceMetadataPage'
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {createBrowserRouter, createMemoryRouter, Link, Navigate, RouterProvider, useNavigate} from 'react-router-dom'
import {
  EmbeddedWorkbench,
  useEmbeddedWorkbench,
  type AppCatalogStatus,
  type BridgeResult,
  type Presentation,
  type RouteTarget,
  type WorkbenchHost,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {usePermission} from '@stellar-enclosure/stellar-enclosure-web-shared/react-permissions'
import {AuthProvider, useAuth} from './auth/AuthContext'
import {RequireAuth} from './auth/RouteGuards'
import AdminLayout from './layouts/AdminLayout'
import RegistryPage from './pages/RegistryPage'
import ConfigsPage from './pages/ConfigsPage'
import BizsPage from './pages/BizsPage'
import EnvPage from './pages/EnvPage'
import AppsPage from './pages/AppsPage'
import NamespacesPage from './pages/NamespacesPage'
import PublishTasksPage from './pages/PublishTasksPage'
import CachePage from './pages/CachePage'
import InstancesPage from './pages/InstancesPage'
import BindingsPage from './pages/BindingsPage'
import AiResourcesPage from './pages/AiResourcesPage'
import AiResourceEditorPage from './pages/AiResourceEditorPage'
import SiCatalogPage from './pages/SiCatalogPage'
import SiEnvMatrixPage from './pages/SiEnvMatrixPage'
import SiResourceEditorPage from './pages/SiResourceEditorPage'
import I18nPage from './pages/I18nPage'
import {AdminI18nProvider, PageLanguageBoundary, usePageMessages} from './i18n/AdminI18nProvider'
import {buildTianshuCatalogPages, canAccessTianshuRoute, matchTianshuRoute} from './workbench/routes'

interface WujieRuntimeWindow extends Window {
  $wujie?: {props?: {embedded?: boolean; workbenchHost?: WorkbenchHost}}
}

const configuredBase: string = import.meta.env.VITE_BASE_PATH ?? '/'
if (!configuredBase.startsWith('/') || configuredBase.startsWith('//')
  || /[\\?#%]/.test(configuredBase) || Array.from(configuredBase).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /\/{2,}/.test(configuredBase)
  || configuredBase.split('/').some((segment) => segment === '.' || segment === '..')) {
  throw new Error('Invalid VITE_BASE_PATH')
}
const basePath = configuredBase === '/' ? '/' : configuredBase.replace(/\/?$/, '/')

function OAuthCallback({popup}: {popup: boolean}) {
  const [url] = useState(() => window.location.href)
  const [state, setState] = useState<'pending' | 'done' | 'failed'>('pending')
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    void gatewayAuth.completeCallback(url, popup).then(returnTo => {
      if (!active) return
      if (returnTo) void navigate(returnTo, {replace: true})
      else setState('done')
    }, () => { if (active) setState('failed') })
    return () => { active = false }
  }, [url, navigate, popup])
  const locale = navigator.language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  const message = (key: string) => cloudDeliveryMessages.find(entry => entry.pageCode === 'tianshu.auth' && entry.key === key)?.defaults[locale]
  const key = state === 'failed' ? 'auth.callbackFailed' : state === 'done' ? 'auth.callbackDone' : 'auth.callbackPending'
  return <Result status={state === 'failed' ? 'error' : 'info'} title={message(key)}
    extra={state === 'failed' && !popup ? <Link to="/">{message('auth.callbackBack')}</Link> : undefined} />
}

const businessChildren = [
  {path: 'metadata/resources', element: <RequirePermission resourceKey="tianshu.page.resourceMetadata"><PageLanguageBoundary pageCode="tianshu.metadata"><ResourceMetadataPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'registry', element: <RequirePermission resourceKey="tianshu.page.registry"><PageLanguageBoundary pageCode="tianshu.registry"><RegistryPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'configs', element: <RequirePermission resourceKey="tianshu.page.configs"><PageLanguageBoundary pageCode="tianshu.configs"><ConfigsPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'bizs', element: <RequirePermission resourceKey="tianshu.page.bizs"><PageLanguageBoundary pageCode="tianshu.bizs"><BizsPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'envs', element: <RequirePermission resourceKey="tianshu.page.envs"><PageLanguageBoundary pageCode="tianshu.envs"><EnvPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'apps', element: <RequirePermission resourceKey="tianshu.page.apps"><PageLanguageBoundary pageCode="tianshu.apps"><AppsPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'namespaces', element: <RequirePermission resourceKey="tianshu.page.namespaces"><PageLanguageBoundary pageCode="tianshu.namespaces"><NamespacesPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'bindings', element: <RequirePermission resourceKey="tianshu.page.bindings"><PageLanguageBoundary pageCode="tianshu.bindings"><BindingsPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'publish-tasks', element: <RequirePermission resourceKey="tianshu.page.publishTasks"><PageLanguageBoundary pageCode="tianshu.publishTasks"><PublishTasksPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'cache', element: <RequirePermission resourceKey="tianshu.page.cache"><PageLanguageBoundary pageCode="tianshu.cache"><CachePage /></PageLanguageBoundary></RequirePermission>},
  {path: 'instances', element: <RequirePermission resourceKey="tianshu.page.instances"><PageLanguageBoundary pageCode="tianshu.instances"><InstancesPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'ai/prompts', element: <RequirePermission resourceKey="tianshu.page.prompts"><PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="PROMPT" /></PageLanguageBoundary></RequirePermission>},
  {path: 'ai/skills', element: <RequirePermission resourceKey="tianshu.page.skills"><PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="SKILL" /></PageLanguageBoundary></RequirePermission>},
  {path: 'ai/resources/:id', element: <RequirePermission resourceKey="tianshu.page.aiEditor"><PageLanguageBoundary pageCode="tianshu.ai.editor"><AiResourceEditorPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'si/catalog', element: <RequirePermission resourceKey="tianshu.page.siCatalog"><PageLanguageBoundary pageCode="tianshu.si"><SiCatalogPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'si/matrix', element: <RequirePermission resourceKey="tianshu.page.siMatrix"><PageLanguageBoundary pageCode="tianshu.si"><SiEnvMatrixPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'si/resources/new', element: <RequirePermission resourceKey="tianshu.page.siEditor"><PageLanguageBoundary pageCode="tianshu.si"><SiResourceEditorPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'si/resources/:id', element: <RequirePermission resourceKey="tianshu.page.siEditor"><PageLanguageBoundary pageCode="tianshu.si"><SiResourceEditorPage /></PageLanguageBoundary></RequirePermission>},
  {path: 'metadata/i18n', element: <RequirePermission resourceKey="tianshu.page.i18n"><PageLanguageBoundary pageCode="tianshu.i18n"><I18nPage /></PageLanguageBoundary></RequirePermission>},
]

const routes = [
  {path: LOGIN_CALLBACK, caseSensitive: true, element: <OAuthCallback popup={false} />},
  {path: POPUP_CALLBACK, caseSensitive: true, element: <OAuthCallback popup />},
  {
    path: '/',
    element: (
      <AuthProvider>
        <FieldCatalogProvider><AdminI18nProvider><RequireAuth>
          <AdminLayout />
        </RequireAuth></AdminI18nProvider></FieldCatalogProvider>
      </AuthProvider>
    ),
    children: [
      {index: true, element: <Navigate to="/registry" replace />},
      ...businessChildren,
    ],
  },
]

type NavigationRequestFn = (mode: 'push' | 'replace', target: {readonly path: string; readonly search?: string}) => BridgeResult

function WorkbenchNavigationSync({
  requestNavRef,
}: {
  requestNavRef: {current: NavigationRequestFn | null}
}) {
  const {requestNavigation} = useEmbeddedWorkbench()
  useEffect(() => {
    requestNavRef.current = requestNavigation
    return () => {
      if (requestNavRef.current === requestNavigation) {
        requestNavRef.current = null
      }
    }
  }, [requestNavigation, requestNavRef])
  return null
}

type TranslateFn = (key: string, fallback?: string) => string

function TianshuTranslatorSync({
  onTranslate,
}: {
  onTranslate: (fn: TranslateFn) => void
}) {
  const {t} = usePageMessages('common')
  useEffect(() => {
    onTranslate((key, fallback) => {
      const value = t(key)
      return value && value !== key ? value : fallback ?? key
    })
  }, [onTranslate, t])
  return null
}

function TianshuWorkbenchBridge({
  workbenchHost,
  onPresent,
  requestNavRef,
  translate,
  children,
}: {
  workbenchHost: WorkbenchHost
  onPresent: (presentation: Presentation, permission: ReturnType<typeof usePermission>, authorized: boolean) => Promise<BridgeResult> | BridgeResult
  requestNavRef: {current: NavigationRequestFn | null}
  translate?: TranslateFn
  children: ReactNode
}) {
  const {authorization, authorized, loading, error} = useAuth()
  const permission = usePermission(authorization?.snapshot ?? null, authorization?.binding ?? null)

  const status: AppCatalogStatus = loading
    ? 'authorizing'
    : error
      ? 'failed'
      : authorized
        ? 'ready'
        : 'denied'

  const pages = useMemo(() => {
    if (status !== 'ready') return []
    return buildTianshuCatalogPages(permission, translate)
  }, [permission, status, translate])

  const handlePresent = useCallback(
    (presentation: Presentation) => onPresent(presentation, permission, authorized),
    [authorized, onPresent, permission],
  )

  return (
    <EmbeddedWorkbench host={workbenchHost} status={status} pages={pages} onPresent={handlePresent}>
      <WorkbenchNavigationSync requestNavRef={requestNavRef} />
      {children}
    </EmbeddedWorkbench>
  )
}

function TianshuWorkbenchShell({
  workbenchHost,
  onPresent,
  requestNavRef,
}: {
  workbenchHost: WorkbenchHost
  onPresent: (presentation: Presentation, permission: ReturnType<typeof usePermission>, authorized: boolean) => Promise<BridgeResult> | BridgeResult
  requestNavRef: {current: NavigationRequestFn | null}
}) {
  const [translate, setTranslate] = useState<TranslateFn | undefined>(undefined)
  const handleTranslate = useCallback((fn: TranslateFn) => {
    setTranslate(() => fn)
  }, [])

  return (
    <AuthProvider>
      <TianshuWorkbenchBridge
        workbenchHost={workbenchHost}
        onPresent={onPresent}
        requestNavRef={requestNavRef}
        translate={translate}
      >
        <FieldCatalogProvider><AdminI18nProvider>
          <TianshuTranslatorSync onTranslate={handleTranslate} />
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        </AdminI18nProvider></FieldCatalogProvider>
      </TianshuWorkbenchBridge>
    </AuthProvider>
  )
}

const createWorkbenchRoutes = (
  workbenchHost: WorkbenchHost,
  onPresent: (presentation: Presentation, permission: ReturnType<typeof usePermission>, authorized: boolean) => Promise<BridgeResult> | BridgeResult,
  requestNavRef: {current: NavigationRequestFn | null},
) => [
  {path: LOGIN_CALLBACK, caseSensitive: true, element: <OAuthCallback popup={false} />},
  {path: POPUP_CALLBACK, caseSensitive: true, element: <OAuthCallback popup />},
  {
    path: '/',
    element: (
      <TianshuWorkbenchShell
        workbenchHost={workbenchHost}
        onPresent={onPresent}
        requestNavRef={requestNavRef}
      />
    ),
    children: [
      {path: '__workbench/idle', element: null},
      ...businessChildren,
    ],
  },
]

export default function App() {
  const [router, setRouter] = useState<ReturnType<typeof createBrowserRouter> | ReturnType<typeof createMemoryRouter> | null>(null)
  const isHostNavigationRef = useRef(false)
  const lastHostUrlRef = useRef('/__workbench/idle')
  const requestNavRef = useRef<NavigationRequestFn | null>(null)

  useEffect(() => {
    let currentRouter: ReturnType<typeof createBrowserRouter> | ReturnType<typeof createMemoryRouter> | undefined
    let unsubscribe: (() => void) | undefined
    let active = true

    queueMicrotask(() => {
      if (!active) return
      const workbenchHost = (window as WujieRuntimeWindow).$wujie?.props?.workbenchHost
      if (!workbenchHost) {
        currentRouter = createBrowserRouter(routes, {basename: basePath})
        setRouter(currentRouter)
        return
      }

      const navigateFromHost = async (nextUrl: string) => {
        if (!currentRouter) return
        lastHostUrlRef.current = nextUrl
        isHostNavigationRef.current = true
        try {
          await currentRouter.navigate(nextUrl, {replace: true})
        } finally {
          isHostNavigationRef.current = false
        }
      }

      const memRouter = createMemoryRouter(
        createWorkbenchRoutes(
          workbenchHost,
          async (presentation, permission, authorized): Promise<BridgeResult> => {
            if (presentation.signal.aborted) {
              return {ok: false, code: 'SUPERSEDED'}
            }
            if (presentation.mode === 'suspend') {
              return {ok: true}
            }
            if (presentation.mode === 'close') {
              const currentPath = currentRouter?.state.location.pathname ?? '/__workbench/idle'
              if (currentPath !== '/__workbench/idle') {
                const matchedCurrent = matchTianshuRoute(currentPath)
                if (matchedCurrent && presentation.tabKey.includes(matchedCurrent.route.pageId)) {
                  await navigateFromHost('/__workbench/idle')
                }
              }
              return {ok: true}
            }
            const matched = matchTianshuRoute(presentation.target.path)
            if (!matched) {
              return {ok: false, code: 'NOT_FOUND'}
            }
            if (!authorized || !canAccessTianshuRoute(permission, matched.route)) {
              return {ok: false, code: 'DENIED'}
            }
            await navigateFromHost(`${presentation.target.path}${presentation.target.search}`)
            return {ok: true}
          },
          requestNavRef,
        ),
        {initialEntries: ['/__workbench/idle']},
      )

      unsubscribe = memRouter.subscribe((state) => {
        if (isHostNavigationRef.current) return
        if (state.location.pathname === '/__workbench/idle') return
        if (!matchTianshuRoute(state.location.pathname)) return
        const mode = state.historyAction === 'REPLACE' ? 'replace' : 'push'
        const target: RouteTarget = {
          path: state.location.pathname,
          search: state.location.search,
        }
        isHostNavigationRef.current = true
        void memRouter.navigate(lastHostUrlRef.current, {replace: true}).finally(() => {
          isHostNavigationRef.current = false
          requestNavRef.current?.(mode, target)
        })
      })

      currentRouter = memRouter
      setRouter(memRouter)
    })

    return () => {
      active = false
      unsubscribe?.()
      currentRouter?.dispose()
    }
  }, [])

  if (!router) return null
  return <RouterProvider router={router} />
}
