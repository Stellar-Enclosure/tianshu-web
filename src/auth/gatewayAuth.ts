import {createGatewayAuthClient} from '@stellar-enclosure/stellar-enclosure-web-shared'

export const gatewayAuth = createGatewayAuthClient({
  appAlias: import.meta.env.VITE_OAUTH_APP_ALIAS ?? 'edge-tianshu',
  baseUrl: import.meta.env.VITE_YUHENG_ORIGIN ?? '',
  fetch: (...args) => globalThis.fetch(...args),
})
