import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import { createElement, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbeddedWorkbench, type WorkbenchHost, type WorkbenchPort } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { allowsSnapshotRequirement } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { createDdcQueryClient } from '../query/queryClient'
import { permissionSnapshot } from '../test/permissionFixture'
import { resources } from '../permissions/resources'
import {
  buildTianshuCatalogPages,
  matchTianshuRoute,
  tianshuWorkbenchRoutes,
} from './routes'
import RegistryPage from '../pages/RegistryPage'
import BizsPage from '../pages/BizsPage'
import EnvPage from '../pages/EnvPage'
import AppsPage from '../pages/AppsPage'
import NamespacesPage from '../pages/NamespacesPage'
import BindingsPage from '../pages/BindingsPage'
import CachePage from '../pages/CachePage'
import InstancesPage from '../pages/InstancesPage'
import AiResourcesPage from '../pages/AiResourcesPage'
import SiCatalogPage from '../pages/SiCatalogPage'
import SiEnvMatrixPage from '../pages/SiEnvMatrixPage'
import SiResourceEditorPage from '../pages/SiResourceEditorPage'
import ResourceMetadataPage from '../pages/ResourceMetadataPage'
import I18nPage from '../pages/I18nPage'

const mockAuthState = vi.hoisted(() => ({
  identity: 'admin',
  tenantId: '1001',
  sessionGeneration: 1,
  authorized: true,
  authorization: null as null | {
    snapshot: ReturnType<typeof permissionSnapshot>
    binding: ReturnType<typeof permissionSnapshot> & { requestEpoch: number }
  },
  registerUnsavedChangesGuard: vi.fn(() => () => {}),
}))

mockAuthState.authorization = (() => {
  const snapshot = permissionSnapshot('1001')
  return { snapshot, binding: { ...snapshot, requestEpoch: 1 } }
})()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('../i18n/AdminI18nProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/AdminI18nProvider')>()
  return {
    ...actual,
    useAdminI18n: () => ({
      locale: 'zh-CN',
      changing: false,
      changeLocale: vi.fn(),
      refresh: vi.fn(),
      bootstrap: undefined,
    }),
    usePageMessages: () => ({
      t: (key: string) => key,
      locale: 'zh-CN',
      messages: {},
      source: 'test',
    }),
  }
})

const evaluatorFor = (snapshot: ReturnType<typeof permissionSnapshot>) => ({
  allows: (requirement: unknown) => allowsSnapshotRequirement(snapshot, snapshot, requirement),
})

const SPEC_TIANSHU_PATTERNS = [
  '/registry',
  '/configs',
  '/bizs',
  '/envs',
  '/apps',
  '/namespaces',
  '/bindings',
  '/publish-tasks',
  '/cache',
  '/instances',
  '/ai/prompts',
  '/ai/skills',
  '/ai/resources/:id',
  '/si/catalog',
  '/si/matrix',
  '/si/resources/new',
  '/si/resources/:id',
  '/metadata/resources',
  '/metadata/i18n',
] as const

describe('tianshu workbench routes', () => {
  it('registers all 19 Spec §12.1 templates and excludes login/oauth callbacks', () => {
    const patterns = tianshuWorkbenchRoutes.map((route) => route.pattern)
    expect(patterns).toHaveLength(19)
    expect(new Set(patterns)).toEqual(new Set(SPEC_TIANSHU_PATTERNS))
    expect(patterns).not.toContain('/login')
    expect(patterns.some((pattern) => pattern.includes('oidc/callback'))).toBe(false)

    const publishTasks = tianshuWorkbenchRoutes.find((route) => route.pattern === '/publish-tasks')
    expect(publishTasks?.queryKeys).toContain('changeId')
  })

  it('prefers static /si/resources/new over /si/resources/:id and preserves wide string IDs', () => {
    const createMatch = matchTianshuRoute('/si/resources/new')
    expect(createMatch?.route.pattern).toBe('/si/resources/new')
    expect(createMatch?.params).toEqual({})

    const detailMatch = matchTianshuRoute('/si/resources/9007199254740993')
    expect(detailMatch?.route.pattern).toBe('/si/resources/:id')
    expect(detailMatch?.params).toEqual({ id: '9007199254740993' })

    const aiDetailMatch = matchTianshuRoute('/ai/resources/prompt-42')
    expect(aiDetailMatch?.route.pattern).toBe('/ai/resources/:id')
    expect(aiDetailMatch?.params).toEqual({ id: 'prompt-42' })
  })

  it('projects catalog descriptors strictly by permission without escalating write actions', () => {
    const fullSnapshot = permissionSnapshot('1001')
    const fullEvaluator = evaluatorFor(fullSnapshot)
    const allPages = buildTianshuCatalogPages(fullEvaluator, (key, fallback) => fallback ?? key)
    expect(allPages).toHaveLength(19)
    expect(allPages.filter((page) => Boolean(page.groupKey))).toHaveLength(16)
    expect(allPages.find((page) => page.pattern === '/si/resources/new')?.groupKey).toBeUndefined()

    const readOnlySnapshot = {
      ...fullSnapshot,
      permissionCodes: ['TIANSHU_READ'],
    }
    const readOnlyEvaluator = evaluatorFor(readOnlySnapshot)
    const readOnlyPages = buildTianshuCatalogPages(readOnlyEvaluator, (key, fallback) => fallback ?? key)
    expect(readOnlyPages.some((page) => page.pattern === '/registry')).toBe(true)
    expect(readOnlyPages.some((page) => page.pattern === '/cache')).toBe(false)
    expect(readOnlyPages.some((page) => page.pattern === '/ai/prompts')).toBe(false)
    expect(readOnlyPages.some((page) => page.pattern === '/si/catalog')).toBe(false)

    const writeConfigsButton = resources.find((entry) => entry.key === 'tianshu.button.ConfigsPage.write')
    expect(writeConfigsButton && 'requirement' in writeConfigsButton
      ? readOnlyEvaluator.allows(writeConfigsButton.requirement)
      : true).toBe(false)
  })
})

describe('tianshu remaining pages workbench integration', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const renderInWorkbench = (path: string, routePattern: string, element: ReactElement) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 0,
      status: 'SUCCESS',
      message: '',
      data: null,
      records: [],
      page: { total: 0, pageNo: 1, pageSize: 10, pages: 0, hasNext: false, hasPrevious: false },
      traceId: 'trace-routes-test',
      timestamp: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const host: WorkbenchHost = {
      attach: () => ({ ok: true }),
      reportCatalog: () => ({ ok: true }),
      requestNavigation: () => ({ ok: true }),
    }
    const queryClient = createDdcQueryClient()
    return render(
      createElement(
        AntdApp,
        null,
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(
              EmbeddedWorkbench,
              {
                host,
                status: 'ready',
                pages: [],
                onPresent: async () => ({ ok: true as const }),
                children: createElement(
                  Routes,
                  null,
                  createElement(Route, { path: routePattern, element }),
                ),
              },
            ),
          ),
        ),
      ),
    )
  }

  it.each([
    { label: 'RegistryPage', path: '/registry', pattern: '/registry', element: createElement(RegistryPage) },
    { label: 'BizsPage', path: '/bizs', pattern: '/bizs', element: createElement(BizsPage) },
    { label: 'EnvPage', path: '/envs', pattern: '/envs', element: createElement(EnvPage) },
    { label: 'AppsPage', path: '/apps', pattern: '/apps', element: createElement(AppsPage) },
    { label: 'NamespacesPage', path: '/namespaces', pattern: '/namespaces', element: createElement(NamespacesPage) },
    { label: 'BindingsPage', path: '/bindings', pattern: '/bindings', element: createElement(BindingsPage) },
    { label: 'CachePage', path: '/cache', pattern: '/cache', element: createElement(CachePage) },
    { label: 'InstancesPage', path: '/instances', pattern: '/instances', element: createElement(InstancesPage) },
    { label: 'AiResourcesPage (PROMPT)', path: '/ai/prompts', pattern: '/ai/prompts', element: createElement(AiResourcesPage, { kind: 'PROMPT' }) },
    { label: 'SiCatalogPage', path: '/si/catalog', pattern: '/si/catalog', element: createElement(SiCatalogPage) },
    { label: 'ResourceMetadataPage', path: '/metadata/resources', pattern: '/metadata/resources', element: createElement(ResourceMetadataPage) },
  ])('renders $label inside WorkspaceList without standalone PageHeader when embedded', ({ path, pattern, element }) => {
    const { container } = renderInWorkbench(path, pattern, element)
    expect(container.querySelector('[data-region="query"]')).toBeInTheDocument()
    expect(container.querySelector('[data-region="table"]')).toBeInTheDocument()
    expect(container.querySelector('h3.ant-typography')).not.toBeInTheDocument()
  })

  it('omits standalone PageHeader on embedded SiEnvMatrixPage, SiResourceEditorPage, and I18nPage and tracks SI draft leave guard', async () => {
    for (const entry of [
      { path: '/si/matrix', pattern: '/si/matrix', element: createElement(SiEnvMatrixPage) },
      { path: '/metadata/i18n', pattern: '/metadata/i18n', element: createElement(I18nPage) },
    ]) {
      const { container } = renderInWorkbench(entry.path, entry.pattern, entry.element)
      expect(container.querySelector('h3.ant-typography')).not.toBeInTheDocument()
      cleanup()
    }

    const capturedPorts: WorkbenchPort[] = []
    const host: WorkbenchHost = {
      attach: (port) => {
        capturedPorts.push(port)
        return { ok: true }
      },
      reportCatalog: () => ({ ok: true }),
      requestNavigation: () => ({ ok: true }),
    }
    const queryClient = createDdcQueryClient()
    const { container } = render(
      createElement(
        AntdApp,
        null,
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MemoryRouter,
            { initialEntries: ['/si/resources/new'] },
            createElement(
              EmbeddedWorkbench,
              {
                host,
                status: 'ready',
                pages: [],
                onPresent: async () => ({ ok: true as const }),
                children: createElement(
                  Routes,
                  null,
                  createElement(Route, { path: '/si/resources/new', element: createElement(SiResourceEditorPage) }),
                ),
              },
            ),
          ),
        ),
      ),
    )
    expect(container.querySelector('h3.ant-typography')).not.toBeInTheDocument()
    const port = capturedPorts[0]
    await port?.present({
      mode: 'show',
      navigationId: 1,
      tabKey: '["tianshu","tianshu.page.siEditor.new"]',
      target: { path: '/si/resources/new', search: '' },
      signal: new AbortController().signal,
    })
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0]!, { target: { value: 'draft-si-key' } })
    const check = await port!.checkLeave({ reason: 'close', tabKey: '["tianshu","tianshu.page.siEditor.new"]' })
    expect(check).toEqual(expect.objectContaining({ ok: true, dirty: true }))
  })
})
