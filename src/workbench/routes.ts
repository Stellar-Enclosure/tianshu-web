import {
  validateRelativeRoutePath,
  type AppPageDescriptor,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import { resources, resourceMessages } from '../permissions/resources'

export interface TianshuPermissionChecker {
  readonly allows: (requirement: unknown) => boolean
}

export interface TianshuRouteDefinition {
  readonly pageId: string
  readonly pattern: string
  readonly pageResourceKey: string
  readonly menuResourceKey?: string
  readonly navLabelKey?: string
  readonly defaultLabel: string
  readonly groupKey?: 'runtime' | 'configuration' | 'metadata' | 'ai-resources' | 'si-resources'
  readonly groupLabelKey?: string
  readonly defaultGroupLabel?: string
  readonly identityParams?: readonly string[]
  readonly queryKeys?: readonly string[]
}

const GROUP_LABELS: Readonly<
  Record<NonNullable<TianshuRouteDefinition['groupKey']>, { labelKey: string; fallback: string }>
> = {
  'si-resources': { labelKey: 'nav.siResources', fallback: 'Super Intelligence (SI)' },
  'ai-resources': { labelKey: 'nav.aiResources', fallback: 'AI resources' },
  runtime: { labelKey: 'nav.runtime', fallback: 'Runtime' },
  configuration: { labelKey: 'nav.configuration', fallback: 'Configuration' },
  metadata: { labelKey: 'nav.metadata', fallback: 'Metadata' },
}

export const tianshuWorkbenchRoutes: readonly TianshuRouteDefinition[] = [
  // Runtime (matches AdminLayout menu order & groups; static before dynamic)
  {
    pageId: 'tianshu.page.registry',
    pattern: '/registry',
    pageResourceKey: 'tianshu.page.registry',
    menuResourceKey: 'tianshu.menu.registry',
    navLabelKey: 'nav.registry',
    defaultLabel: 'Service registry',
    groupKey: 'runtime',
    groupLabelKey: GROUP_LABELS.runtime.labelKey,
    defaultGroupLabel: GROUP_LABELS.runtime.fallback,
  },
  {
    pageId: 'tianshu.page.instances',
    pattern: '/instances',
    pageResourceKey: 'tianshu.page.instances',
    menuResourceKey: 'tianshu.menu.instances',
    navLabelKey: 'nav.instances',
    defaultLabel: 'Configuration clients',
    groupKey: 'runtime',
    groupLabelKey: GROUP_LABELS.runtime.labelKey,
    defaultGroupLabel: GROUP_LABELS.runtime.fallback,
  },
  {
    pageId: 'tianshu.page.publishTasks',
    pattern: '/publish-tasks',
    pageResourceKey: 'tianshu.page.publishTasks',
    menuResourceKey: 'tianshu.menu.publishTasks',
    navLabelKey: 'nav.publishTasks',
    defaultLabel: 'Publication tasks',
    groupKey: 'runtime',
    groupLabelKey: GROUP_LABELS.runtime.labelKey,
    defaultGroupLabel: GROUP_LABELS.runtime.fallback,
    queryKeys: ['changeId'],
  },
  {
    pageId: 'tianshu.page.cache',
    pattern: '/cache',
    pageResourceKey: 'tianshu.page.cache',
    menuResourceKey: 'tianshu.menu.cache',
    navLabelKey: 'nav.cache',
    defaultLabel: 'Cache consistency',
    groupKey: 'runtime',
    groupLabelKey: GROUP_LABELS.runtime.labelKey,
    defaultGroupLabel: GROUP_LABELS.runtime.fallback,
  },
  // Configuration
  {
    pageId: 'tianshu.page.configs',
    pattern: '/configs',
    pageResourceKey: 'tianshu.page.configs',
    menuResourceKey: 'tianshu.menu.configs',
    navLabelKey: 'nav.configs',
    defaultLabel: 'Configuration resources',
    groupKey: 'configuration',
    groupLabelKey: GROUP_LABELS.configuration.labelKey,
    defaultGroupLabel: GROUP_LABELS.configuration.fallback,
  },
  // Metadata
  {
    pageId: 'tianshu.page.resourceMetadata',
    pattern: '/metadata/resources',
    pageResourceKey: 'tianshu.page.resourceMetadata',
    menuResourceKey: 'tianshu.menu.resourceMetadata',
    navLabelKey: 'nav.resourceMetadata',
    defaultLabel: 'Resource catalog',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.i18n',
    pattern: '/metadata/i18n',
    pageResourceKey: 'tianshu.page.i18n',
    menuResourceKey: 'tianshu.menu.i18n',
    navLabelKey: 'nav.i18n',
    defaultLabel: 'Enterprise metadata center',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.bizs',
    pattern: '/bizs',
    pageResourceKey: 'tianshu.page.bizs',
    menuResourceKey: 'tianshu.menu.bizs',
    navLabelKey: 'nav.bizs',
    defaultLabel: 'Business domains',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.envs',
    pattern: '/envs',
    pageResourceKey: 'tianshu.page.envs',
    menuResourceKey: 'tianshu.menu.envs',
    navLabelKey: 'nav.envs',
    defaultLabel: 'Environments',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.apps',
    pattern: '/apps',
    pageResourceKey: 'tianshu.page.apps',
    menuResourceKey: 'tianshu.menu.apps',
    navLabelKey: 'nav.apps',
    defaultLabel: 'Applications',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.namespaces',
    pattern: '/namespaces',
    pageResourceKey: 'tianshu.page.namespaces',
    menuResourceKey: 'tianshu.menu.namespaces',
    navLabelKey: 'nav.namespaces',
    defaultLabel: 'Namespaces',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  {
    pageId: 'tianshu.page.bindings',
    pattern: '/bindings',
    pageResourceKey: 'tianshu.page.bindings',
    menuResourceKey: 'tianshu.menu.bindings',
    navLabelKey: 'nav.bindings',
    defaultLabel: 'Scope bindings',
    groupKey: 'metadata',
    groupLabelKey: GROUP_LABELS.metadata.labelKey,
    defaultGroupLabel: GROUP_LABELS.metadata.fallback,
  },
  // AI Resources
  {
    pageId: 'tianshu.page.prompts',
    pattern: '/ai/prompts',
    pageResourceKey: 'tianshu.page.prompts',
    menuResourceKey: 'tianshu.menu.prompts',
    navLabelKey: 'nav.prompts',
    defaultLabel: 'Prompts',
    groupKey: 'ai-resources',
    groupLabelKey: GROUP_LABELS['ai-resources'].labelKey,
    defaultGroupLabel: GROUP_LABELS['ai-resources'].fallback,
  },
  {
    pageId: 'tianshu.page.skills',
    pattern: '/ai/skills',
    pageResourceKey: 'tianshu.page.skills',
    menuResourceKey: 'tianshu.menu.skills',
    navLabelKey: 'nav.skills',
    defaultLabel: 'Skills',
    groupKey: 'ai-resources',
    groupLabelKey: GROUP_LABELS['ai-resources'].labelKey,
    defaultGroupLabel: GROUP_LABELS['ai-resources'].fallback,
  },
  {
    pageId: 'tianshu.page.aiEditor',
    pattern: '/ai/resources/:id',
    pageResourceKey: 'tianshu.page.aiEditor',
    defaultLabel: 'Prompt and Skill editor',
    identityParams: ['id'],
  },
  // SI Resources (static /si/resources/new before /si/resources/:id)
  {
    pageId: 'tianshu.page.siCatalog',
    pattern: '/si/catalog',
    pageResourceKey: 'tianshu.page.siCatalog',
    menuResourceKey: 'tianshu.menu.siCatalog',
    navLabelKey: 'nav.siCatalog',
    defaultLabel: 'SI Resource Catalog',
    groupKey: 'si-resources',
    groupLabelKey: GROUP_LABELS['si-resources'].labelKey,
    defaultGroupLabel: GROUP_LABELS['si-resources'].fallback,
  },
  {
    pageId: 'tianshu.page.siMatrix',
    pattern: '/si/matrix',
    pageResourceKey: 'tianshu.page.siMatrix',
    menuResourceKey: 'tianshu.menu.siMatrix',
    navLabelKey: 'nav.siMatrix',
    defaultLabel: 'SI Environment Matrix',
    groupKey: 'si-resources',
    groupLabelKey: GROUP_LABELS['si-resources'].labelKey,
    defaultGroupLabel: GROUP_LABELS['si-resources'].fallback,
  },
  {
    pageId: 'tianshu.page.siEditor.new',
    pattern: '/si/resources/new',
    pageResourceKey: 'tianshu.page.siEditor',
    defaultLabel: 'New SI resource',
  },
  {
    pageId: 'tianshu.page.siEditor',
    pattern: '/si/resources/:id',
    pageResourceKey: 'tianshu.page.siEditor',
    defaultLabel: 'SI atomic resource editor',
    identityParams: ['id'],
  },
] as const

const resourceByKey = new Map<string, (typeof resources)[number]>(
  resources.map((resource) => [resource.key, resource]),
)
const resourceMessageByKey = new Map<string, string>(
  resourceMessages.map((entry) => [entry.key, entry.defaults['zh-CN']]),
)

const isResourceAllowed = (permission: TianshuPermissionChecker, resourceKey: string): boolean => {
  const resource = resourceByKey.get(resourceKey)
  if (!resource) return false
  return permission.allows('requirement' in resource ? resource.requirement : { access: resource.access })
}

export const canAccessTianshuRoute = (
  permission: TianshuPermissionChecker,
  route: TianshuRouteDefinition,
): boolean => {
  if (!isResourceAllowed(permission, route.pageResourceKey)) return false
  if (route.menuResourceKey && !isResourceAllowed(permission, route.menuResourceKey)) return false
  return true
}

const matchPattern = (
  pattern: string,
  path: string,
): Readonly<Record<string, string>> | null => {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]
    if (patternPart.startsWith(':')) {
      const paramName = patternPart.slice(1)
      try {
        params[paramName] = decodeURIComponent(pathPart)
      } catch {
        return null
      }
      continue
    }
    if (patternPart !== pathPart) return null
  }
  return params
}

export interface MatchedTianshuRoute {
  readonly route: TianshuRouteDefinition
  readonly params: Readonly<Record<string, string>>
}

const sortedRoutesForMatching = [...tianshuWorkbenchRoutes].sort((a, b) => {
  const aDynamic = a.pattern.split('/').filter((segment) => segment.startsWith(':')).length
  const bDynamic = b.pattern.split('/').filter((segment) => segment.startsWith(':')).length
  if (aDynamic !== bDynamic) return aDynamic - bDynamic
  return b.pattern.length - a.pattern.length
})

export const matchTianshuRoute = (rawPath: string): MatchedTianshuRoute | null => {
  if (!validateRelativeRoutePath(rawPath)) return null
  for (const route of sortedRoutesForMatching) {
    const params = matchPattern(route.pattern, rawPath)
    if (params) return { route, params }
  }
  return null
}

export const resolveRouteLabel = (
  route: TianshuRouteDefinition,
  translate?: (key: string, fallback?: string) => string,
): string => {
  if (translate && route.navLabelKey) {
    const translated = translate(route.navLabelKey, route.defaultLabel)
    if (translated && translated !== route.navLabelKey) return translated
  }
  return resourceMessageByKey.get(route.pageResourceKey) ?? route.defaultLabel
}

export const buildTianshuCatalogPages = (
  permission: TianshuPermissionChecker,
  translate?: (key: string, fallback?: string) => string,
): readonly AppPageDescriptor[] =>
  tianshuWorkbenchRoutes
    .filter((route) => canAccessTianshuRoute(permission, route))
    .map((route) => {
      const label = resolveRouteLabel(route, translate)
      const groupLabel = route.groupKey && route.groupLabelKey
        ? (() => {
            const candidate = translate?.(route.groupLabelKey, route.defaultGroupLabel)
            return candidate && candidate !== route.groupLabelKey ? candidate : route.defaultGroupLabel
          })()
        : route.defaultGroupLabel
      return {
        pageId: route.pageId,
        pattern: route.pattern,
        label,
        ...(route.groupKey ? { groupKey: route.groupKey, groupLabel: groupLabel ?? route.groupKey } : {}),
        identityParams: route.identityParams ?? [],
        queryKeys: route.queryKeys ?? [],
      }
    })
