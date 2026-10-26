import {usePermission} from '@stellar-enclosure/stellar-enclosure-web-shared/react-permissions'
import {resources} from '../permissions/resources'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CloudOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  LinkOutlined,
  LogoutOutlined,
  PartitionOutlined,
} from '@ant-design/icons'
import { Badge, Space } from 'antd'
import {useMemo} from 'react'
import {usePageMessages, type AdminTranslate} from '../i18n/AdminI18nProvider'
import {LanguageSwitcher} from '../i18n/LanguageSwitcher'
import {
  EnterpriseLayout,
  type EnterpriseLayoutConfig,
  type EnterpriseNavigationItem,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import { Outlet } from 'react-router-dom'
import { version } from '../../package.json'
import { useAuth } from '../auth/AuthContext'

interface WujieRuntimeWindow extends Window {
  $wujie?: { props?: { embedded?: boolean } }
}

// 平台自己的导航树；shared 只负责左侧递归树的渲染与高亮。
const navigation: readonly EnterpriseNavigationItem[] = [
  { key: 'ai-resources', label: 'nav.aiResources', icon: <FileTextOutlined />, children: [
    { key: 'ai-prompts', label: 'nav.prompts', path: '/ai/prompts', icon: <FileTextOutlined /> },
    { key: 'ai-skills', label: 'nav.skills', path: '/ai/skills', icon: <FileTextOutlined /> },
  ] },
  { key: 'runtime', label: 'nav.runtime', icon: <ClusterOutlined />, children: [
    { key: 'registry', label: 'nav.registry', path: '/registry', icon: <ClusterOutlined /> },
    { key: 'instances', label: 'nav.instances', path: '/instances', icon: <ClusterOutlined /> },
    { key: 'publish-tasks', label: 'nav.publishTasks', path: '/publish-tasks', icon: <DeploymentUnitOutlined /> },
    { key: 'cache', label: 'nav.cache', path: '/cache', icon: <DatabaseOutlined /> },
  ] },
  { key: 'configuration', label: 'nav.configuration', icon: <FileTextOutlined />, children: [
    { key: 'configs', label: 'nav.configs', path: '/configs', icon: <FileTextOutlined /> },
  ] },
  { key: 'metadata', label: 'nav.metadata', icon: <PartitionOutlined />, children: [
    {key: 'resourceMetadata', label: 'nav.resourceMetadata', path: '/metadata/resources', icon: <DatabaseOutlined />},
    { key: 'i18n', label: 'nav.i18n', path: '/metadata/i18n', icon: <FileTextOutlined /> },
    { key: 'bizs', label: 'nav.bizs', path: '/bizs', icon: <PartitionOutlined /> },
    { key: 'envs', label: 'nav.envs', path: '/envs', icon: <CloudOutlined /> },
    { key: 'apps', label: 'nav.apps', path: '/apps', icon: <AppstoreOutlined /> },
    { key: 'namespaces', label: 'nav.namespaces', path: '/namespaces', icon: <ApartmentOutlined /> },
    { key: 'bindings', label: 'nav.bindings', path: '/bindings', icon: <LinkOutlined /> },
  ] },
]

const translateNavigation = (items: readonly EnterpriseNavigationItem[], t: AdminTranslate,
  allowed: (path: string) => boolean): EnterpriseNavigationItem[] => items.flatMap(item => {
  const children = item.children ? translateNavigation(item.children, t, allowed) : undefined
  if (item.path ? !allowed(item.path) : !children?.length) return []
  return [{...item, label: t(item.label), ...(children ? {children} : {})}]
})

export default function AdminLayout() {
  const {t} = usePageMessages('common')
  const {identity, logout, authorization} = useAuth()
  const permission = usePermission(authorization?.snapshot ?? null, authorization?.binding ?? null)
  const translatedNavigation = useMemo(() => translateNavigation(navigation, t, path => {
    const resource = resources.find(resource => resource.type === 'MENU' && 'route' in resource.target && resource.target.route === path)
    return !!resource && permission.allows('requirement' in resource ? resource.requirement : {access: resource.access})
  }), [permission, t])
  const embedded = (window as WujieRuntimeWindow).$wujie?.props?.embedded === true

  const config: EnterpriseLayoutConfig = {
    platformName: t('shell.platformName'),
    navigation: translatedNavigation,
    labels: {mainMenu: t('shell.mainMenu'), userMenu: t('shell.userMenu'),
      openNavigation: t('shell.openNavigation'), version: t('shell.version')},
    actions: <Space><LanguageSwitcher /><Badge status="success" text={t('shell.connected')} /></Space>,
    user: {
      name: identity,
      menu: [
        {
          key: 'logout',
          label: t('shell.logout'),
          icon: <LogoutOutlined />,
          onClick: () => {
            void logout()
          },
        },
      ],
    },
    footer: { version },
  }
  const layoutConfig: EnterpriseLayoutConfig = embedded
    ? {...config, hideHeader: true, hideFooter: true}
    : config

  return (
    <EnterpriseLayout config={layoutConfig}>
      <Outlet />
    </EnterpriseLayout>
  )
}
