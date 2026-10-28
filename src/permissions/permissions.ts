import {definePermissionReferences} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

export const READ = 'TIANSHU_READ' as const
export const WRITE = 'TIANSHU_WRITE' as const
export const PUBLISH = 'TIANSHU_PUBLISH' as const
export const CACHE = 'TIANSHU_CACHE' as const
export const AI_READ = 'TIANSHU_AI_READ' as const
export const AI_WRITE = 'TIANSHU_AI_WRITE' as const
export const AI_PUBLISH = 'TIANSHU_AI_PUBLISH' as const
export const NAMESPACE_TEMPLATE_SYSTEM = 'TIANSHU_NAMESPACE_TEMPLATE_SYSTEM' as const
export const NAMESPACE_TEMPLATE_PERSONAL = 'TIANSHU_NAMESPACE_TEMPLATE_PERSONAL' as const
export const NAMESPACE_EXPORT = 'TIANSHU_NAMESPACE_EXPORT' as const

export const permissions = definePermissionReferences([READ, WRITE, PUBLISH, CACHE, AI_READ, AI_WRITE, AI_PUBLISH,
  NAMESPACE_TEMPLATE_SYSTEM, NAMESPACE_TEMPLATE_PERSONAL, NAMESPACE_EXPORT] as const)
