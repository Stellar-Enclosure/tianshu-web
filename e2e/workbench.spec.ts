import { createSign, generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { expect, test, type BrowserContext, type Route } from '@playwright/test'
import catalogs from '../src/test/i18nCatalogs.json' with { type: 'json' }

interface OAuthClientFixture {
  readonly id: string
  readonly clientId: string
  readonly tenantId: string
  readonly issuer: string
  readonly resource: string
  readonly apiBaseUrl: string
  readonly scopes: readonly string[]
  readonly redirectUri: string
  readonly popupRedirectUri?: string
}

interface AppFixture {
  readonly key: string
  readonly origin: string
  readonly basePath: string
  readonly distDir: string
  readonly displayName: string
  readonly contractVersion: 'workbench-1' | 'xingyuan-1'
  readonly standaloneUrl: string
  readonly resource: string
  readonly oauth: OAuthClientFixture
}

interface WorkbenchBrowserFixture {
  readonly portal: {
    readonly origin: string
    readonly basePath: string
    readonly distDir: string
    readonly manifestEnv: string
    readonly oauth: OAuthClientFixture
  }
  readonly apps: Record<string, AppFixture>
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function loadFixture(): WorkbenchBrowserFixture {
  const fixturePath = process.env.STELLAR_WORKBENCH_BROWSER_FIXTURE_FILE
  if (!fixturePath) {
    throw new Error('STELLAR_WORKBENCH_BROWSER_FIXTURE_FILE is required; refusing implicit live environment fallback')
  }
  const parsed = JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) as WorkbenchBrowserFixture
  if (!parsed?.portal?.distDir || !existsSync(parsed.portal.distDir)) {
    throw new Error(`Invalid portal distDir in fixture: ${parsed?.portal?.distDir ?? 'missing'}`)
  }
  for (const [key, app] of Object.entries(parsed.apps ?? {})) {
    if (!app.distDir || !existsSync(app.distDir)) {
      throw new Error(`Invalid app distDir for ${key}: ${app.distDir}`)
    }
  }
  return parsed
}

function signJwt(
  privateKeyPem: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const encodeSegment = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  const unsigned = `${encodeSegment(header)}.${encodeSegment(payload)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(privateKeyPem).toString('base64url')}`
}

function resolveStaticAsset(distDir: string, basePath: string, pathname: string): { filePath: string; contentType: string } | undefined {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  if (!pathname.startsWith(normalizedBase) && `${pathname}/` !== normalizedBase) {
    return undefined
  }
  let relative = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length) : ''
  relative = relative.replace(/^\/+/, '')
  const candidate = relative ? resolve(distDir, relative) : resolve(distDir, 'index.html')
  if (!candidate.startsWith(resolve(distDir))) {
    return undefined
  }
  const finalPath = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : resolve(distDir, 'index.html')
  if (!existsSync(finalPath)) {
    return undefined
  }
  return {
    filePath: finalPath,
    contentType: CONTENT_TYPES[extname(finalPath)] ?? 'application/octet-stream',
  }
}

async function installWorkbenchRoutes(
  context: BrowserContext,
  fixture: WorkbenchBrowserFixture,
  manifestOverride?: (key: string, app: AppFixture) => Record<string, unknown>,
) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'workbench-e2e-key', use: 'sig', alg: 'RS256' }
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const authCodes = new Map<string, { oauth: OAuthClientFixture; nonce: string }>()

  const oauthByClient = new Map<string, OAuthClientFixture>()
  oauthByClient.set(fixture.portal.oauth.clientId, fixture.portal.oauth)
  for (const app of Object.values(fixture.apps)) {
    oauthByClient.set(app.oauth.clientId, app.oauth)
  }

  const allApps = Object.values(fixture.apps)
  const manifestBody = () => Object.fromEntries(
    allApps.map((app) => [
      app.key,
      manifestOverride
        ? manifestOverride(app.key, app)
        : {
            key: app.key,
            displayName: app.displayName,
            url: `${app.origin}${app.basePath}`,
            standaloneUrl: app.standaloneUrl,
            resource: app.resource,
            version: '0.1.1',
            contractVersion: app.contractVersion,
            compatibleHostRange: '>=0.0.1 <0.1.0',
            requiredCapabilities: [],
          },
    ]),
  )

  const handleRoute = async (route: Route) => {
    const request = route.request()
    const parsedUrl = new URL(request.url())
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': '*',
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }

    // OIDC Issuer endpoints
    if (parsedUrl.origin === new URL(fixture.portal.oauth.issuer).origin) {
      if (parsedUrl.pathname.endsWith('/oauth2/authorize')) {
        const clientId = parsedUrl.searchParams.get('client_id') ?? ''
        const redirectUri = parsedUrl.searchParams.get('redirect_uri') ?? ''
        const state = parsedUrl.searchParams.get('state') ?? ''
        const nonce = parsedUrl.searchParams.get('nonce') ?? 'nonce-1'
        const matchedClient = oauthByClient.get(clientId)
        if (!matchedClient) {
          await route.fulfill({ status: 400, body: 'Unknown OAuth client' })
          return
        }
        const code = `code-${clientId}-${Math.random().toString(36).slice(2, 8)}`
        authCodes.set(code, { oauth: matchedClient, nonce })
        const callbackUrl = new URL(redirectUri)
        callbackUrl.searchParams.set('code', code)
        callbackUrl.searchParams.set('state', state)
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><body><script>location.replace(${JSON.stringify(callbackUrl.toString())})</script></body></html>`,
        })
        return
      }
      if (parsedUrl.pathname.endsWith('/oauth2/token')) {
        const params = new URLSearchParams(request.postData() ?? '')
        const code = params.get('code') ?? ''
        const grant = authCodes.get(code)
        if (!grant) {
          await route.fulfill({ status: 400, json: { error: 'invalid_grant' }, headers: corsHeaders })
          return
        }
        authCodes.delete(code)
        const now = Math.floor(Date.now() / 1000)
        const idToken = signJwt(
          privateKeyPem,
          { alg: 'RS256', typ: 'JWT', kid: jwk.kid },
          {
            iss: grant.oauth.issuer,
            sub: 'workbench-user',
            aud: grant.oauth.clientId,
            nonce: grant.nonce,
            iat: now,
            exp: now + 300,
          },
        )
        const accessToken = signJwt(
          privateKeyPem,
          { alg: 'RS256', typ: 'at+jwt', kid: jwk.kid },
          {
            iss: grant.oauth.issuer,
            sub: 'workbench-user',
            aud: grant.oauth.resource,
            iat: now,
            exp: now + 300,
            principal_type: 'USER',
            scope_context: 'TENANT',
            tenant_id: grant.oauth.tenantId,
            client_id: grant.oauth.clientId,
            scope: [...grant.oauth.scopes].sort().join(' '),
          },
        )
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            token_type: 'Bearer',
            expires_in: 300,
            access_token: accessToken,
            id_token: idToken,
          },
        })
        return
      }
      if (parsedUrl.pathname.endsWith('/.well-known/jwks.json')) {
        await route.fulfill({ status: 200, headers: corsHeaders, json: { keys: [jwk] } })
        return
      }
    }

    // Manifest endpoint served cleanly
    const manifestPath = `${fixture.portal.basePath}portal-manifest/${fixture.portal.manifestEnv}.json`
    if (parsedUrl.origin === fixture.portal.origin && parsedUrl.pathname === manifestPath) {
      await route.fulfill({ status: 200, headers: corsHeaders, json: manifestBody() })
      return
    }

    // Controlled authorization & business API fixtures
    if (parsedUrl.pathname.startsWith('/api/v1/')) {
      if (parsedUrl.pathname === '/api/v1/tianshu/i18n/public/bundle') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            success: true,
            data: {
              pageCode: 'tianshu.auth',
              locale: 'zh-CN',
              defaultLocale: 'zh-CN',
              version: 'public-fixture',
              messages: catalogs['tianshu.auth']['zh-CN'],
            },
          },
        })
        return
      }
      if (parsedUrl.pathname.includes('/authorization-snapshots/current') || parsedUrl.pathname.includes('/me/authorization')) {
        const allCodes = [
          'tianshu:registry:read',
          'tianshu:config:read',
          'tianshu:config:write',
          'tianshu:publish:read',
          'yuheng:gateway:read',
          'yuheng:api:read',
          'yuheng:knowledge:read',
          'TIANJI_AGENT_READ',
          'TIANJI_PROCESS_READ',
          'TIANQUAN_SHOUBING_OVERVIEW_READ',
        ]
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            success: true,
            data: {
              tenantId: fixture.portal.oauth.tenantId,
              subject: 'workbench-user',
              permissionCodes: allCodes,
              catalogScope: { namespaceCode: 'default', environment: 'local' },
            },
          },
        })
        return
      }
      if (parsedUrl.pathname.includes('/configs')) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            success: true,
            data: {
              items: [{ key: 'app.feature.workbench', environment: 'local', revision: 3, updatedAt: '2026-11-20T00:00:00Z' }],
              total: 1,
            },
          },
        })
        return
      }
      if (parsedUrl.pathname.includes('/apis')) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            success: true,
            data: {
              items: [{ apiCode: 'yuheng.knowledge.ask', name: '知识问答接口', status: 'PUBLISHED' }],
              total: 1,
            },
          },
        })
        return
      }
      if (parsedUrl.pathname.includes('/knowledge-bases')) {
        if (parsedUrl.pathname.endsWith('/answers')) {
          await route.fulfill({
            status: 200,
            headers: corsHeaders,
            json: {
              success: true,
              data: {
                outcome: 'ANSWERED',
                answer: '已通过统一工作台完成授权知识汇总。',
                model: 'chat-main',
                citations: [
                  {
                    documentRevisionId: 'rev-1',
                    chunkId: 'chunk-1',
                    sourceHash: 'hash-1',
                    documentId: 'doc-1',
                    fileName: 'workbench-guide.md',
                    pageId: 'wiki-1',
                    excerpt: '引用工作台治理章节',
                    score: 0.94,
                  },
                ],
              },
            },
          })
          return
        }
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            success: true,
            data: {
              items: [{
                id: 'kb-1',
                name: '研发规范知识库',
                description: '统一工作台文档',
                ownerActorId: 'owner-1',
                myRole: 'READER',
                egressPolicy: 'LOCAL_ONLY',
                chatModel: 'chat-main',
                embeddingModel: 'embed-local',
                embeddingSpaceId: 'space-1',
                dimensions: 1024,
                revision: 1,
              }],
              page: 1,
              size: 50,
              total: 1,
            },
          },
        })
        return
      }
      await route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { items: [], total: 0 } } })
      return
    }

    // Serve real child app Vite assets first so same-origin subpaths (/children/<app>/) win over Portal's '/' SPA fallback
    for (const app of allApps) {
      if (parsedUrl.origin === app.origin) {
        const asset = resolveStaticAsset(app.distDir, app.basePath, parsedUrl.pathname)
        if (asset) {
          await route.fulfill({
            status: 200,
            contentType: asset.contentType,
            headers: corsHeaders,
            body: readFileSync(asset.filePath),
          })
          return
        }
      }
    }

    // Serve real Portal static Vite assets
    if (parsedUrl.origin === fixture.portal.origin) {
      const asset = resolveStaticAsset(fixture.portal.distDir, fixture.portal.basePath, parsedUrl.pathname)
      if (asset) {
        await route.fulfill({
          status: 200,
          contentType: asset.contentType,
          headers: corsHeaders,
          body: readFileSync(asset.filePath),
        })
        return
      }
    }

    throw new Error(`Unexpected unmocked request in workbench browser test: ${request.url()}`)
  }

  await context.route((url) => url.protocol === 'https:' || url.protocol === 'http:', handleRoute)
}

test.describe('Cross-repo Portal workbench browser verification (Step 24)', () => {
  test('verifies Portal shell, OAuth PKCE login, launcher Esc focus, responsive widths, and browser history over real Vite dist artifacts', async ({ browser }) => {
    const fixture = loadFixture()
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await installWorkbenchRoutes(context, fixture)
    const page = await context.newPage()

    await page.goto(`${fixture.portal.origin}${fixture.portal.basePath}`)
    await expect(page.getByText('星垣工作台')).toBeVisible()

    // Trigger PUBLIC OAuth PKCE S256 login flow through Portal user menu
    await page.getByRole('button', { name: /用户菜单/ }).click()
    await page.getByRole('menuitem', { name: /登录/ }).click()

    await expect(page.getByRole('button', { name: 'Agent 助手' })).toBeVisible()
    await expect(page.getByRole('button', { name: '门户首页' })).toBeVisible()

    // Verify launcher drawer domain grouping + Esc restores focus
    const launcherButton = page.getByRole('button', { name: '应用目录' })
    await launcherButton.click()
    await expect(page.getByRole('textbox', { name: '搜索应用或业务域' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('textbox', { name: '搜索应用或业务域' })).toBeHidden()

    // Fixed /agent view without occupying closable tab
    await page.getByRole('button', { name: 'Agent 助手' }).click()
    await expect(page.getByTestId('agent-page')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /进入配置发布/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /进入API 接口/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /进入角色权限/ })).toBeVisible()

    // Open child app route via deep link -> real built Tianshu Wujie child mounts and renders content
    await page.getByRole('button', { name: /进入配置发布/ }).click()
    await expect(page.getByTestId('wujie-host-tianshu')).toBeVisible({ timeout: 15000 })

    // Browser Back/Forward synchronization between /xingyuan/tianshu/publish-tasks and /agent
    await page.goBack()
    await expect(page.getByTestId('agent-page')).toBeVisible()
    await page.goForward()
    await expect(page.getByTestId('wujie-host-tianshu')).toBeVisible()

    // Responsive check across 1280 / 720 / 420 px widths
    for (const width of [1280, 720, 420] as const) {
      await page.setViewportSize({ width, height: 840 })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    }

    await context.close()
  })

  test('verifies compatibility matrix (xingyuan-1 legacy mount, standalone child entry, and invalid manifest rejection)', async ({ browser }) => {
    const fixture = loadFixture()

    // 1. Standalone Tianshu entry renders independently of Portal
    const standaloneApp = fixture.apps.tianshu
    if (!standaloneApp) {
      throw new Error('Fixture must include tianshu app entry')
    }
    const standaloneContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await installWorkbenchRoutes(standaloneContext, fixture)
    const standalonePage = await standaloneContext.newPage()
    await standalonePage.addInitScript(() => localStorage.setItem('tianshu.admin.locale', 'zh-CN'))
    await standalonePage.goto(`${standaloneApp.origin}${standaloneApp.basePath}`)
    await expect(standalonePage.getByRole('button', { name: '使用统一身份登录' })).toBeVisible()
    await standaloneContext.close()

    // 2. Rejected manifest (mismatched URL + unsupported contractVersion) fails closed in Portal
    const rejectedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await installWorkbenchRoutes(rejectedContext, fixture, (key, app) => ({
      key,
      displayName: app.displayName,
      url: 'https://untrusted.example.invalid/evil/',
      standaloneUrl: app.standaloneUrl,
      resource: app.resource,
      version: '0.1.1',
      contractVersion: 'future-unsupported-99',
      compatibleHostRange: '>=0.0.1 <0.1.0',
      requiredCapabilities: [],
    }))
    const rejectedPage = await rejectedContext.newPage()
    await rejectedPage.goto(`${fixture.portal.origin}${fixture.portal.basePath}`)
    await rejectedPage.getByRole('button', { name: /用户菜单/ }).click()
    await rejectedPage.getByRole('menuitem', { name: /登录/ }).click()
    await expect(rejectedPage.getByText(/workbench-user/)).toBeVisible()
    await rejectedPage.getByRole('button', { name: 'Agent 助手' }).click()
    await rejectedPage.getByRole('button', { name: /进入配置发布/ }).click()
    await expect(rejectedPage.getByText('子应用版本不兼容，暂未挂载')).toBeVisible()
    await rejectedContext.close()
  })
})
