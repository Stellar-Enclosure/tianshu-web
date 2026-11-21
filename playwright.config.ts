import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/workbench.spec.ts'],
  outputDir: '.generated/playwright-results',
  use: {
    baseURL: 'https://tianshu.example.invalid',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 18154 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:18154',
    reuseExistingServer: false,
    env: {
      VITE_BASE_PATH: '/console/',
      VITE_PERMISSION_NAMESPACE: 'default',
      VITE_PERMISSION_ENVIRONMENT: 'local',
      VITE_TIANSHU_OAUTH_CONFIG: JSON.stringify({
        webOrigin: 'https://tianshu.example.invalid',
        apiBaseUrl: 'https://tianshu.example.invalid',
        resource: 'https://tianshu.example.invalid/resource',
        activeResource: 'tianshu-1001',
        registrations: [{
          id: 'tianshu-1001', clientId: 'tianshu-1001', tenantId: '1001', browserBound: false,
          issuer: 'https://identity.example.invalid/tenants/1001',
          authorizationEndpoint: 'https://identity.example.invalid/tenants/1001/oauth2/authorize',
          tokenEndpoint: 'https://identity.example.invalid/tenants/1001/oauth2/token',
          jwksUri: 'https://identity.example.invalid/tenants/1001/.well-known/jwks.json',
          redirectUri: 'https://tianshu.example.invalid/console/auth/oidc/callback/tianshu-1001',
          resource: 'https://tianshu.example.invalid/resource',
          apiBaseUrl: 'https://tianshu.example.invalid', scopes: ['openid', 'tianshu:read'],
        }],
      }),
    },
  },
})
