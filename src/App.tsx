import {FieldCatalogProvider} from './permissions/FieldCatalog'
import {RequirePermission} from './permissions/access'
import ResourceMetadataPage from './pages/ResourceMetadataPage'
import {useEffect, useState} from 'react'
import {createBrowserRouter, Navigate, RouterProvider} from 'react-router-dom'
import {AuthProvider} from './auth/AuthContext'
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
import I18nPage from './pages/I18nPage'
import {AdminI18nProvider, PageLanguageBoundary} from './i18n/AdminI18nProvider'

const configuredBase: string = import.meta.env.VITE_BASE_PATH ?? '/'
if (!configuredBase.startsWith('/') || configuredBase.startsWith('//')
  || /[\\?#%]/.test(configuredBase) || Array.from(configuredBase).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /\/{2,}/.test(configuredBase)
  || configuredBase.split('/').some((segment) => segment === '.' || segment === '..')) {
  throw new Error('Invalid VITE_BASE_PATH')
}
const basePath = configuredBase === '/' ? '/' : configuredBase.replace(/\/?$/, '/')

const routes = [{
  path: '/',
  element: (
    <RequireAuth>
      <AdminLayout />
    </RequireAuth>
  ),
  children: [
    {path: 'metadata/resources', element: <RequirePermission resourceKey="tianshu.page.resourceMetadata"><PageLanguageBoundary pageCode="tianshu.metadata"><ResourceMetadataPage /></PageLanguageBoundary></RequirePermission>},
    { index: true, element: <Navigate to="/registry" replace /> },
    { path: 'registry', element: <RequirePermission resourceKey="tianshu.page.registry"><PageLanguageBoundary pageCode="tianshu.registry"><RegistryPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'configs', element: <RequirePermission resourceKey="tianshu.page.configs"><PageLanguageBoundary pageCode="tianshu.configs"><ConfigsPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'bizs', element: <RequirePermission resourceKey="tianshu.page.bizs"><PageLanguageBoundary pageCode="tianshu.bizs"><BizsPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'envs', element: <RequirePermission resourceKey="tianshu.page.envs"><PageLanguageBoundary pageCode="tianshu.envs"><EnvPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'apps', element: <RequirePermission resourceKey="tianshu.page.apps"><PageLanguageBoundary pageCode="tianshu.apps"><AppsPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'namespaces', element: <RequirePermission resourceKey="tianshu.page.namespaces"><PageLanguageBoundary pageCode="tianshu.namespaces"><NamespacesPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'bindings', element: <RequirePermission resourceKey="tianshu.page.bindings"><PageLanguageBoundary pageCode="tianshu.bindings"><BindingsPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'publish-tasks', element: <RequirePermission resourceKey="tianshu.page.publishTasks"><PageLanguageBoundary pageCode="tianshu.publishTasks"><PublishTasksPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'cache', element: <RequirePermission resourceKey="tianshu.page.cache"><PageLanguageBoundary pageCode="tianshu.cache"><CachePage /></PageLanguageBoundary></RequirePermission> },
    { path: 'instances', element: <RequirePermission resourceKey="tianshu.page.instances"><PageLanguageBoundary pageCode="tianshu.instances"><InstancesPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'ai/prompts', element: <RequirePermission resourceKey="tianshu.page.prompts"><PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="PROMPT" /></PageLanguageBoundary></RequirePermission> },
    { path: 'ai/skills', element: <RequirePermission resourceKey="tianshu.page.skills"><PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="SKILL" /></PageLanguageBoundary></RequirePermission> },
    { path: 'ai/resources/:id', element: <RequirePermission resourceKey="tianshu.page.aiEditor"><PageLanguageBoundary pageCode="tianshu.ai.editor"><AiResourceEditorPage /></PageLanguageBoundary></RequirePermission> },
    { path: 'metadata/i18n', element: <RequirePermission resourceKey="tianshu.page.i18n"><PageLanguageBoundary pageCode="tianshu.i18n"><I18nPage /></PageLanguageBoundary></RequirePermission> },
  ],
}]

export default function App() {
  const [router, setRouter] = useState<ReturnType<typeof createBrowserRouter> | null>(null)

  useEffect(() => {
    const currentRouter = createBrowserRouter(routes, {basename: basePath})
    setRouter(currentRouter)
    return () => currentRouter.dispose()
  }, [])

  if (!router) return null
  return (
    <AuthProvider>
      <FieldCatalogProvider><AdminI18nProvider><RouterProvider router={router} /></AdminI18nProvider></FieldCatalogProvider>
    </AuthProvider>
  )
}
