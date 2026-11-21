import { describe, expect, it } from 'vitest'
import { allowsSnapshotRequirement } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { permissionSnapshot } from '../test/permissionFixture'
import { resources } from '../permissions/resources'
import {
  buildTianshuCatalogPages,
  matchTianshuRoute,
  tianshuWorkbenchRoutes,
} from './routes'

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
