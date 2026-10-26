import {definePermissionReferences} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

export const READ = 'TIANSHU_READ' as const
export const WRITE = 'TIANSHU_WRITE' as const
export const PUBLISH = 'TIANSHU_PUBLISH' as const
export const CACHE = 'TIANSHU_CACHE' as const
export const AI_READ = 'TIANSHU_AI_READ' as const
export const AI_WRITE = 'TIANSHU_AI_WRITE' as const
export const AI_PUBLISH = 'TIANSHU_AI_PUBLISH' as const

export const permissions = definePermissionReferences([READ, WRITE, PUBLISH, CACHE, AI_READ, AI_WRITE, AI_PUBLISH] as const)
