import {expect, test} from '@playwright/test'
import catalogs from '../src/test/i18nCatalogs.json'

test('admin console offers passwordless login through the fixed Edge application', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('tianshu.admin.locale', 'zh-CN'))
  await page.route('**/apps/edge-tianshu/auth/identity', route => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({code: 'AUTHENTICATION_REQUIRED'}),
  }))
  await page.route('**/apps/edge-tianshu/api/v1/tianshu/i18n/public/bundle**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({success: true, data: {
      pageCode: 'tianshu.auth', locale: 'zh-CN', defaultLocale: 'zh-CN', version: 'public-fixture',
      messages: catalogs['tianshu.auth']['zh-CN'],
    }}),
  }))
  await page.route('**/apps/edge-tianshu/auth/login', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<html>OIDC fixture</html>',
  }))
  await page.goto('/')
  const login = page.getByRole('button', {name: '使用统一身份登录'})
  await expect(login).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await login.click()
  await expect(page).toHaveURL(/\/apps\/edge-tianshu\/auth\/login$/)
})
