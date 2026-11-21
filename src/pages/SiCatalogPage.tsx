import { PermissionButton } from '../permissions/access'
import { WorkspaceList, useEmbeddedWorkbench } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Card, Input, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ddcSiQueryKeys, reindexSiResource, searchSiResources, semanticSearchSiResources } from '../api/si'
import type { SiLifecycleStatus, SiResourceItem, SiResourceKind, SiSemanticSearchResult } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'

export const siCatalogMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.catalog.title', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '超级智能资产目录', 'en-US': 'SI Resource Catalog' } },
])

export default function SiCatalogPage() {
  const { t } = usePageMessages('tianshu.si')
  const { embedded } = useEmbeddedWorkbench()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [envCode, setEnvCode] = useState<string | undefined>(undefined)
  const [kind, setKind] = useState<SiResourceKind | undefined>(undefined)
  const [lifecycleStatus, setLifecycleStatus] = useState<SiLifecycleStatus | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [semanticResult, setSemanticResult] = useState<SiSemanticSearchResult | null>(null)
  const [pageNo, setPageNo] = useState(1)

  const catalogQuery = useQuery({
    queryKey: ddcSiQueryKeys.catalog({ envCode, kind, lifecycleStatus, keyword, pageNo, pageSize: 20 }),
    queryFn: ({ signal }) =>
      searchSiResources({ envCode, kind, lifecycleStatus, keyword, pageNo, pageSize: 20 }, { signal }),
  })

  const semanticMutation = useMutation({
    mutationFn: (queryText: string) =>
      semanticSearchSiResources({ envCode, kind, queryText, topK: 20 }),
    onSuccess: (result) => {
      setSemanticResult(result)
    },
    onError: (err) => {
      message.error(formatAdminError(err, t))
    },
  })

  const reindexMutation = useMutation({
    mutationFn: (resourceId: number) => reindexSiResource(resourceId),
    onSuccess: () => {
      message.success(t('si.catalog.reindexedNotice'))
    },
    onError: (err) => {
      message.error(formatAdminError(err, t))
    },
  })

  const columns: TableColumnsType<SiResourceItem> = [
    {
      title: 'Key',
      dataIndex: 'resourceKey',
      key: 'resourceKey',
      render: (val: string, record: SiResourceItem) => (
        <Button type="link" onClick={() => navigate(`/si/resources/${record.id}`)}>
          {val}
        </Button>
      ),
    },
    { title: t('common.name'), dataIndex: 'displayName', key: 'displayName' },
    {
      title: 'Kind',
      dataIndex: 'kind',
      key: 'kind',
      render: (val: SiResourceKind) => <Tag color="blue">{val}</Tag>,
    },
    { title: 'Env', dataIndex: 'envCode', key: 'envCode' },
    {
      title: t('common.status'),
      dataIndex: 'lifecycleStatus',
      key: 'lifecycleStatus',
      render: (val: SiLifecycleStatus) => <Tag>{val}</Tag>,
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'publishedTime',
      key: 'publishedTime',
      render: (val?: string | null) => <span title={val ?? ''}>{formatTime(val ?? null)}</span>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: SiResourceItem) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/si/resources/${record.id}`)}>
            {t('common.edit')}
          </Button>
          <PermissionButton
            size="small"
            resourceKey="tianshu.button.SiCatalogPage.reindex"
            data-testid={`si-reindex-btn-${record.id}`}
            onClick={() => reindexMutation.mutate(record.id)}
          >
            {t('si.catalog.reindexBtn')}
          </PermissionButton>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {!embedded && (
        <AdminPageHeader
          title={t('si.catalog.title')}
          description={t('si.catalog.subtitle')}
        />
      )}
      <WorkspaceList
        ariaLabel={t('si.catalog.title')}
        filters={(
          <>
            <Space wrap style={{ width: '100%', marginBottom: 12 }}>
              <Select
                allowClear
                placeholder={t('si.catalog.envPlaceholder')}
                style={{ width: 120 }}
                value={envCode}
                onChange={setEnvCode}
                options={['dev', 'test', 'staging', 'prod'].map((env) => ({ value: env, label: env }))}
              />
              <Select
                allowClear
                placeholder={t('si.catalog.kindPlaceholder')}
                style={{ width: 120 }}
                value={kind}
                onChange={setKind}
                options={['AGENT', 'MCP', 'PROMPT', 'SKILL'].map((k) => ({ value: k, label: k }))}
              />
              <Select
                allowClear
                placeholder={t('common.status')}
                style={{ width: 140 }}
                value={lifecycleStatus}
                onChange={setLifecycleStatus}
                options={['DRAFT', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED'].map((s) => ({ value: s, label: s }))}
              />
              <Input
                placeholder={t('si.catalog.keywordFilterPlaceholder')}
                style={{ width: 220 }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </Space>

            <Space.Compact style={{ width: '100%' }}>
              <Input
                data-testid="si-semantic-query-input"
                placeholder={t('si.catalog.searchPlaceholder')}
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
              />
              <Button
                type="primary"
                data-testid="si-semantic-search-btn"
                loading={semanticMutation.isPending}
                onClick={() => semanticQuery.trim() && semanticMutation.mutate(semanticQuery.trim())}
              >
                {t('si.catalog.semanticSearchBtn')}
              </Button>
            </Space.Compact>
          </>
        )}
        toolbar={(
          <PermissionButton
            resourceKey="tianshu.button.SiCatalogPage.write"
            type="primary"
            data-testid="si-create-btn"
            onClick={() => navigate('/si/resources/new')}
          >
            {t('si.catalog.createButton')}
          </PermissionButton>
        )}
        pageState={{ loading: false, error: undefined, empty: false }}
        table={(
          <>
            {semanticResult && (
              <Card style={{ marginBottom: 16 }}>
                {semanticResult.degradedToFtsOnly && (
                  <Alert
                    data-testid="si-fts-degraded-alert"
                    type="warning"
                    title={t('si.catalog.ftsDegradedAlert')}
                    style={{ marginBottom: 12 }}
                  />
                )}
                <Space orientation="vertical" style={{ width: '100%' }}>
                  {semanticResult.hits.map((hit) => (
                    <Card key={hit.resource.resourceKey} size="small">
                      <Space>
                        <Tag color="geekblue">{t('si.catalog.rankBadge', { rank: hit.rank })}</Tag>
                        <Button type="link" onClick={() => navigate(`/si/resources/${hit.resource.resourceId}`)}>
                          {hit.resource.resourceKey}
                        </Button>
                        <span>{hit.resource.displayName}</span>
                        <Tag color="green">
                          {t('si.catalog.scoreValue', { score: hit.hybridScore.toFixed(2) })}
                        </Tag>
                      </Space>
                    </Card>
                  ))}
                </Space>
              </Card>
            )}

            {catalogQuery.isError && (
              <Alert
                type="error"
                title={formatAdminError(catalogQuery.error, t)}
                action={
                  <Button size="small" onClick={() => void catalogQuery.refetch()}>
                    {t('common.retry')}
                  </Button>
                }
                style={{ marginBottom: 16 }}
              />
            )}

            <Table
              rowKey="id"
              loading={catalogQuery.isLoading}
              dataSource={catalogQuery.data?.records ?? []}
              columns={columns}
              locale={{ emptyText: t('common.empty') }}
              pagination={false}
            />
          </>
        )}
        pagination={{
          mode: 'page',
          current: pageNo,
          pageSize: 20,
          total: catalogQuery.data?.page.total ?? 0,
          onChange: (next) => setPageNo(next),
        }}
      />
    </div>
  )
}
