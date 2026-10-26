import {Input, Space} from 'antd'
import {usePageMessages} from '../../i18n/AdminI18nProvider'
import type {DdcCatalogTarget} from '../../api/i18n'
import type {PermissionSnapshotContext} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

export function currentCatalogTarget(binding: PermissionSnapshotContext): DdcCatalogTarget {
  return {bizCode: binding.catalogScope.businessCode, namespaceCode: binding.catalogScope.namespaceCode,
    env: binding.catalogScope.environment, appCode: binding.catalogScope.applicationCode,
    catalogScopeId: binding.catalogScope.catalogScopeId, catalogActivationVersion: binding.catalogVersion}
}
export function CatalogTargetInputs({value, onChange}: {
  value: Pick<DdcCatalogTarget, 'catalogScopeId' | 'catalogActivationVersion'>
  onChange: (value: Pick<DdcCatalogTarget, 'catalogScopeId' | 'catalogActivationVersion'>) => void
}) {
  const {t} = usePageMessages('tianshu.metadata')
  return <Space wrap>
    <Input aria-label={t('catalog.scopeId')} placeholder={t('catalog.scopeId')} value={value.catalogScopeId}
      onChange={event => onChange({...value, catalogScopeId: event.target.value})} />
    <Input aria-label={t('catalog.version')} placeholder={t('catalog.version')} value={value.catalogActivationVersion}
      onChange={event => onChange({...value, catalogActivationVersion: event.target.value})} />
  </Space>
}
