import {expect, test} from '@playwright/test'
import catalogs from '../src/test/i18nCatalogs.json' with {type: 'json'}

test('offers PUBLIC PKCE login at the approved tenant issuer', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('tianshu.admin.locale', 'zh-CN'))
  await page.route('https://tianshu.example.invalid/**', async route => {
    const target = new URL(route.request().url())
    if (target.pathname.startsWith('/console/')) {
      const response = await route.fetch({url: 'http://127.0.0.1:18154' + target.pathname})
      await route.fulfill({response})
      return
    }
    if (target.pathname === '/api/v1/tianshu/i18n/public/bundle') {
      expect(route.request().headers()).not.toHaveProperty('authorization')
      expect(route.request().headers()).not.toHaveProperty('cookie')
      await route.fulfill({json: {success: true, data: {
        pageCode: 'tianshu.auth', locale: 'zh-CN', defaultLocale: 'zh-CN', version: 'public-fixture',
        messages: catalogs['tianshu.auth']['zh-CN'],
      }}})
      return
    }
    throw new Error('Unexpected Tianshu request ' + target.pathname)
  })
  await page.route('https://identity.example.invalid/tenants/1001/oauth2/authorize?*', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<html>OIDC fixture</html>',
  }))
  await page.goto('/console/')
  const login = page.getByRole('button', {name: '使用统一身份登录'})
  await expect(login).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await login.click()
  await expect(page).toHaveURL(/^https:\/\/identity\.example\.invalid\/tenants\/1001\/oauth2\/authorize\?/)
  const params = new URL(page.url()).searchParams
  expect(params.get('response_type')).toBe('code')
  expect(params.get('code_challenge_method')).toBe('S256')
  expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(params.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(params.get('client_id')).toBe('tianshu-1001')
  expect(params.get('resource')).toBe('https://tianshu.example.invalid/resource')
  expect(params.get('redirect_uri')).toBe('https://tianshu.example.invalid/console/auth/oidc/callback/tianshu-1001')
  expect(params.has('client_secret')).toBe(false)
})
