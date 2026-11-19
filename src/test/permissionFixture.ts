import {snapshotContext, type PermissionSnapshot} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import type {PublicOAuthIdentity} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {gatewayAuth} from '../auth/gatewayAuth'

export const permissionSnapshot = (tenantId = '1001'): PermissionSnapshot => ({
  issuer: `https://idp.example/tenants/${tenantId}`, subject: `subject-${tenantId}`,
  catalogScope: {catalogScopeId: '71001', tenantId, businessCode: 'xingyuan', applicationCode: 'tianshu', namespaceCode: 'default', environment: 'local'},
  catalogVersion: '7', authVersion: '2', policyVersion: '3',
  activeRoleContext: {applicationCode: 'tianshu', rootRoleIds: ['11'], effectiveRoleIds: ['11']},
  permissionCodes: ['TIANSHU_READ', 'TIANSHU_WRITE', 'TIANSHU_PUBLISH', 'TIANSHU_CACHE', 'TIANSHU_AI_READ', 'TIANSHU_AI_WRITE', 'TIANSHU_AI_PUBLISH', 'TIANSHU_SI_READ', 'TIANSHU_SI_WRITE', 'TIANSHU_SI_PUBLISH', 'TIANSHU_SI_PROMOTE', 'TIANSHU_SI_ARCHIVE', 'TIANSHU_SI_BINDING_WRITE', 'TIANSHU_SI_INDEX_MANAGE'],
  snapshotExpiresAt: new Date(Date.now() + 120_000).toISOString(),
})
export const gatewayIdentity = (tenantId = '1001'): PublicOAuthIdentity => ({
  issuer: `https://idp.example/tenants/${tenantId}`, subject: `subject-${tenantId}`, tenantId,
  clientId: 'tianshu-web', resource: 'https://tianshu.example.invalid/resource', accessExpiresAt: Date.now() + 120_000,
})
export const authorizationFixture = (tenantId = '1001') => {
  const snapshot = permissionSnapshot(tenantId)
  return {identity: gatewayIdentity(tenantId), snapshot, binding: snapshotContext(snapshot, gatewayAuth.context.epoch)}
}
