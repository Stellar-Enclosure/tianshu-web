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
export const SI_READ = 'TIANSHU_SI_READ' as const
export const SI_WRITE = 'TIANSHU_SI_WRITE' as const
export const SI_PUBLISH = 'TIANSHU_SI_PUBLISH' as const
export const SI_PROMOTE = 'TIANSHU_SI_PROMOTE' as const
export const SI_ARCHIVE = 'TIANSHU_SI_ARCHIVE' as const
export const SI_BINDING_WRITE = 'TIANSHU_SI_BINDING_WRITE' as const
export const SI_INDEX_MANAGE = 'TIANSHU_SI_INDEX_MANAGE' as const

export const permissions = definePermissionReferences([READ, WRITE, PUBLISH, CACHE, AI_READ, AI_WRITE, AI_PUBLISH,
  NAMESPACE_TEMPLATE_SYSTEM, NAMESPACE_TEMPLATE_PERSONAL, NAMESPACE_EXPORT,
  SI_READ, SI_WRITE, SI_PUBLISH, SI_PROMOTE, SI_ARCHIVE, SI_BINDING_WRITE, SI_INDEX_MANAGE] as const)
