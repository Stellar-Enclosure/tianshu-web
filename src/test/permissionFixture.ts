import {snapshotContext, type PermissionSnapshot} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import type {GatewayIdentityResult} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {gatewayAuth} from '../auth/gatewayAuth'

export const permissionSnapshot = (tenantId = '1001'): PermissionSnapshot => ({
  issuer: `https://idp.example/tenants/${tenantId}`, subject: `subject-${tenantId}`,
  catalogScope: {catalogScopeId: '71001', tenantId, businessCode: 'xingyuan', applicationCode: 'tianshu', namespaceCode: 'default', environment: 'local'},
  catalogVersion: '7', authVersion: '2', policyVersion: '3',
  activeRoleContext: {applicationCode: 'tianshu', rootRoleIds: ['11'], effectiveRoleIds: ['11']},
  permissionCodes: ['TIANSHU_READ', 'TIANSHU_WRITE', 'TIANSHU_PUBLISH', 'TIANSHU_CACHE', 'TIANSHU_AI_READ', 'TIANSHU_AI_WRITE', 'TIANSHU_AI_PUBLISH'],
  snapshotExpiresAt: new Date(Date.now() + 120_000).toISOString(),
})
export const gatewayIdentity = (tenantId = '1001'): GatewayIdentityResult => ({
  issuer: `https://idp.example/tenants/${tenantId}`, subject: `subject-${tenantId}`, tenantId,
  appAlias: 'edge-tianshu', clientId: 'tianshu-web', authorizationExpiresAt: Math.floor(Date.now() / 1000) + 120,
  authenticationExpiresAt: Math.floor(Date.now() / 1000) + 120,
  securityVersion: {realm: '1', client: '1', subject: '1'}, ssoLogoutUri: `https://idp.example/tenants/${tenantId}/logout`,
})
export const authorizationFixture = (tenantId = '1001') => {
  const snapshot = permissionSnapshot(tenantId)
  return {identity: gatewayIdentity(tenantId), snapshot, binding: snapshotContext(snapshot, gatewayAuth.context.epoch)}
}
export const csrfFixture = () => ({headerName: 'X-CSRF-TOKEN' as const, token: 'test-csrf', expiresAt: new Date(Date.now() + 60_000).toISOString()})
