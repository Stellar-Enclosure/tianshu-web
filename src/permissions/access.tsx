import {usePageMessages} from '../i18n/AdminI18nProvider'
import type {ReactNode} from 'react'
import {Alert, Button} from 'antd'
import {usePermission} from '@stellar-enclosure/stellar-enclosure-web-shared/react-permissions'
import type {ResourceKey} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {useAuth} from '../auth/AuthContext'
import {resources} from './resources'

export type DdcResourceKey = ResourceKey<typeof resources>

export function useDdcPermission(resourceKey: DdcResourceKey): boolean {
  const {authorization} = useAuth()
  const permission = usePermission(authorization?.snapshot ?? null, authorization?.binding ?? null)
  const resource = resources.find(value => value.key === resourceKey)
  return resource ? permission.allows('requirement' in resource ? resource.requirement : {access: resource.access}) : false
}

export function RequirePermission({resourceKey, children}: {resourceKey: DdcResourceKey; children: ReactNode}) {
  const {t} = usePageMessages('common')
  return useDdcPermission(resourceKey) ? children : <Alert type="warning" title={t('error.forbidden')} />
}

export function PermissionButton({resourceKey, disabled, ...props}: import('antd').ButtonProps & {resourceKey: DdcResourceKey}) {
  const allowed = useDdcPermission(resourceKey)
  return <Button {...props} disabled={!allowed || disabled} />
}
