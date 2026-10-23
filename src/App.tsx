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
    { index: true, element: <Navigate to="/registry" replace /> },
    { path: 'registry', element: <PageLanguageBoundary pageCode="tianshu.registry"><RegistryPage /></PageLanguageBoundary> },
    { path: 'configs', element: <PageLanguageBoundary pageCode="tianshu.configs"><ConfigsPage /></PageLanguageBoundary> },
    { path: 'bizs', element: <PageLanguageBoundary pageCode="tianshu.bizs"><BizsPage /></PageLanguageBoundary> },
    { path: 'envs', element: <PageLanguageBoundary pageCode="tianshu.envs"><EnvPage /></PageLanguageBoundary> },
    { path: 'apps', element: <PageLanguageBoundary pageCode="tianshu.apps"><AppsPage /></PageLanguageBoundary> },
    { path: 'namespaces', element: <PageLanguageBoundary pageCode="tianshu.namespaces"><NamespacesPage /></PageLanguageBoundary> },
    { path: 'bindings', element: <PageLanguageBoundary pageCode="tianshu.bindings"><BindingsPage /></PageLanguageBoundary> },
    { path: 'publish-tasks', element: <PageLanguageBoundary pageCode="tianshu.publishTasks"><PublishTasksPage /></PageLanguageBoundary> },
    { path: 'cache', element: <PageLanguageBoundary pageCode="tianshu.cache"><CachePage /></PageLanguageBoundary> },
    { path: 'instances', element: <PageLanguageBoundary pageCode="tianshu.instances"><InstancesPage /></PageLanguageBoundary> },
    { path: 'ai/prompts', element: <PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="PROMPT" /></PageLanguageBoundary> },
    { path: 'ai/skills', element: <PageLanguageBoundary pageCode="tianshu.ai.resources"><AiResourcesPage kind="SKILL" /></PageLanguageBoundary> },
    { path: 'ai/resources/:id', element: <PageLanguageBoundary pageCode="tianshu.ai.editor"><AiResourceEditorPage /></PageLanguageBoundary> },
    { path: 'metadata/i18n', element: <PageLanguageBoundary pageCode="tianshu.i18n"><I18nPage /></PageLanguageBoundary> },
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
      <AdminI18nProvider><RouterProvider router={router} /></AdminI18nProvider>
    </AuthProvider>
  )
}
