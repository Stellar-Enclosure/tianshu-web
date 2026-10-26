import {Link} from 'react-router-dom'
import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Alert, Button, Card, Descriptions, Input, Select, Space, Table, Tag, Typography} from 'antd'
import type {TableColumnsType} from 'antd'
import {useAuth} from '../auth/AuthContext'
import {getResourceMetadata, type ResourceMetadata, type ResourceMetadataQuery} from '../api/resourceMetadata'
import ScopeSelects from '../components/scope/ScopeSelects'
import {CatalogTargetInputs, currentCatalogTarget} from '../components/scope/CatalogTargetInputs'
import AdminPageHeader from '../components/page/AdminPageHeader'
import {usePageMessages} from '../i18n/AdminI18nProvider'
import {formatAdminError} from '../i18n/errors'

export default function ResourceMetadataPage() {
  const {authorization} = useAuth()
  const {t} = usePageMessages('tianshu.metadata')
  const [filters, setFilters] = useState<ResourceMetadataQuery>(() => ({...currentCatalogTarget(authorization!.binding), pageNo: 1, pageSize: 20}))
  const [query, setQuery] = useState(filters)
  const result = useQuery({queryKey: ['resource-metadata', authorization?.binding, query],
    queryFn: ({signal}) => getResourceMetadata(query, signal), enabled: !!authorization})
  const columns: TableColumnsType<ResourceMetadata> = [
    {title: t('metadata.key'), dataIndex: 'definitionKey', render: value => <Typography.Text code>{value}</Typography.Text>},
    {title: t('metadata.type'), render: (_, row) => <Tag>{row.resourceType ?? row.metadataKind}</Tag>},
    {title: t('metadata.lifecycle'), dataIndex: 'lifecycle'},
    {title: t('metadata.producer'), render: (_, row) => `${row.producerId} · ${row.producerVersion}`},
    {title: t('metadata.permissions'), render: (_, row) => row.permissionCodes.map(code => <Tag key={code}>{code}</Tag>)},
    {title: t('metadata.label'), render: (_, row) => <Link to={`/metadata/i18n?${new URLSearchParams({
      bizCode: row.catalogScope.businessCode, namespaceCode: row.catalogScope.namespaceCode, env: row.catalogScope.environment,
      appCode: row.catalogScope.applicationCode, catalogScopeId: row.catalogScope.catalogScopeId,
      catalogActivationVersion: row.catalogActivationVersion, sourcePage: row.pageCode,
    })}`}>{row.pageCode}/{row.labelKey}</Link>},
  ]
  return <Space orientation="vertical" style={{width: '100%'}} size="large">
    <AdminPageHeader title={t('metadata.title')} description={t('metadata.description')} />
    <Card><Space orientation="vertical" style={{width: '100%'}}>
      <ScopeSelects value={filters} onChange={scope => setFilters({...filters, ...scope})} />
      <CatalogTargetInputs value={filters} onChange={target => setFilters({...filters, ...target})} />
      <Space wrap>
        <Select aria-label={t('metadata.type')} placeholder={t('metadata.type')} allowClear style={{minWidth: 150}}
          value={filters.resourceType} onChange={resourceType => setFilters({...filters, resourceType})}
          options={['APP', 'MENU', 'PAGE', 'BUTTON', 'API', 'METHOD', 'FIELD'].map(value => ({value, label: value}))} />
        <Select aria-label={t('metadata.kind')} placeholder={t('metadata.kind')} allowClear style={{minWidth: 150}}
          value={filters.metadataKind} onChange={metadataKind => setFilters({...filters, metadataKind})}
          options={['RESOURCE', 'PERMISSION'].map(value => ({value, label: value}))} />
        <Select aria-label={t('metadata.lifecycle')} placeholder={t('metadata.lifecycle')} allowClear style={{minWidth: 150}}
          value={filters.lifecycle} onChange={lifecycle => setFilters({...filters, lifecycle})}
          options={['ACTIVE', 'DEPRECATED'].map(value => ({value, label: value}))} />
        <Input aria-label={t('metadata.producer')} placeholder={t('metadata.producer')} value={filters.producerId}
          onChange={event => setFilters({...filters, producerId: event.target.value})} />
        <Input aria-label={t('metadata.permissions')} placeholder={t('metadata.permissions')} value={filters.permissionCode}
          onChange={event => setFilters({...filters, permissionCode: event.target.value})} />
        <Input.Search aria-label={t('metadata.search')} placeholder={t('metadata.search')} value={filters.query}
          onChange={event => setFilters({...filters, query: event.target.value})} onSearch={() => setQuery({...filters, pageNo: 1})} />
        <Button type="primary" onClick={() => setQuery({...filters, pageNo: 1})}>{t('metadata.search')}</Button>
      </Space>
    </Space></Card>
    {result.error && <Alert type="error" title={formatAdminError(result.error, t)} />}
    <Table<ResourceMetadata> rowKey={row => `${row.producerId}:${row.metadataKind}:${row.definitionKey}`}
      columns={columns} dataSource={result.data?.records ?? []} loading={result.isFetching}
      pagination={{current: query.pageNo, pageSize: 20, total: result.data?.page.total ?? 0, showSizeChanger: false,
        onChange: pageNo => setQuery({...query, pageNo})}}
      expandable={{expandedRowRender: row => <Descriptions column={1} size="small" bordered items={[
        {key: 'scope', label: t('catalog.scopeId'), children: row.catalogScope.catalogScopeId},
        {key: 'version', label: t('catalog.version'), children: row.catalogActivationVersion},
        {key: 'source', label: t('metadata.sourceVersion'), children: row.sourceVersion},
        {key: 'policy', label: t('metadata.policy'), children: <pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify({target: row.target, policy: row.policy, i18nRefs: row.i18nRefs}, null, 2)}</pre>},
      ]} />}} />
  </Space>
}
