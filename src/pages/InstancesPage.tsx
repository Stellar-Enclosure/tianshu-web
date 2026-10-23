import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { ddcPageApi } from '../api/client'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type { DdcInstance } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

const emptyScope: ScopeValue = {
  bizCode: '',
  namespaceCode: '',
  env: '',
  appCode: '',
}

const scopeReady = (scope: ScopeValue): boolean =>
  scope.bizCode.trim() !== ''
  && scope.env.trim() !== ''
  && scope.appCode.trim() !== ''

export default function InstancesPage() {
  const { t, locale } = usePageMessages('tianshu.instances')
  const instanceStatusLabel = (status?: string): string => {
    const value = status || 'UNKNOWN'
    return ['ONLINE', 'OFFLINE', 'UNKNOWN'].includes(value) ? t(`status.${value}`) : value
  }
  const pageState = usePageState()
  const [draft, setDraft] = useState<ScopeValue>({ ...emptyScope })
  const [submitted, setSubmitted] = useState<ScopeValue | null>(null)
  const [scopeError, setScopeError] = useState(false)

  const instancesQuery = useQuery({
    enabled: submitted !== null,
    queryKey: ['tianshu', 'instances', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcInstance>(
      `/api/v1/tianshu/instances/page?${buildQuery({
        bizCode: submitted!.bizCode,
        env: submitted!.env,
        appCode: submitted!.appCode,
        pageNo: pageState.page.pageNo,
        pageSize: pageState.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const applyFilter = () => {
    const next = { ...draft }
    if (!scopeReady(next)) {
      setScopeError(true)
      return
    }
    setScopeError(false)
    setSubmitted(next)
    pageState.resetPage()
  }

  const resetFilter = () => {
    setDraft({ ...emptyScope })
    setSubmitted(null)
    setScopeError(false)
    pageState.resetPage()
  }

  const rows = instancesQuery.data?.records ?? []
  const columns: TableColumnsType<DdcInstance> = [
    {
      title: t('fields.instanceId'),
      dataIndex: 'instanceId',
      key: 'instanceId',
      render: (value: string) => <Typography.Text code copyable={{ text: value }}>{value}</Typography.Text>,
    },
    {
      title: t('fields.scope'),
      key: 'scope',
      render: (_: unknown, row) => `${row.bizCode} / ${row.env} / ${row.appCode}`,
    },
    {
      title: t('fields.address'),
      key: 'address',
      render: (_: unknown, row) => <Typography.Text code>{row.port == null ? row.host : `${row.host}:${row.port}`}</Typography.Text>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={value === 'ONLINE' ? 'green' : 'default'}>{instanceStatusLabel(value)}</Tag>,
    },
    { title: t('fields.leaseId'), dataIndex: 'leaseId', key: 'leaseId', render: (value?: string) => value ?? '—' },
    { title: t('fields.leaseExpireAt'), dataIndex: 'leaseExpireAt', key: 'leaseExpireAt', render: (value?: string) => formatTime(value, locale) },
    { title: t('fields.lastHeartbeatAt'), dataIndex: 'lastHeartbeatAt', key: 'lastHeartbeatAt', render: (value?: string) => formatTime(value, locale) },
    { title: t('fields.sdkVersion'), dataIndex: 'sdkVersion', key: 'sdkVersion', render: (value?: string) => value ?? '—' },
    { title: t('fields.pid'), dataIndex: 'pid', key: 'pid', render: (value?: string) => value ?? '—' },
  ]

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={t('description')}
        extra={(
          <Button disabled={submitted === null} loading={instancesQuery.isFetching} onClick={() => { void instancesQuery.refetch() }}>
            {t('actions.refreshPage')}
          </Button>
        )}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <ScopeSelects
            value={draft}
            onChange={(scope) => {
              setScopeError(false)
              setDraft(scope)
            }}
          />
          <Button type="primary" onClick={applyFilter}>{t('common.search')}</Button>
          <Button onClick={resetFilter}>{t('common.reset')}</Button>
        </Space>
        {scopeError && (
          <Alert
            className="section-row"
            type="warning"
            showIcon
            message={t('validation.scopeRequired')}
          />
        )}
      </Card>
      <Card size="small" title={t('list.title')}>
        {submitted === null ? (
          <Typography.Text type="secondary">{t('empty.selectScope')}</Typography.Text>
        ) : (
          <PageState
            loading={instancesQuery.isPending && !instancesQuery.error}
            error={instancesQuery.error}
            empty={rows.length === 0}
            emptyDescription={t('empty.instances')}
            showPartial={instancesQuery.data !== undefined}
            onRetry={() => { void instancesQuery.refetch() }}
          >
            <Table<DdcInstance>
              rowKey={(row) => row.instanceId}
              columns={columns}
              dataSource={rows}
              loading={instancesQuery.isFetching}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{
                current: instancesQuery.data?.page.pageNo ?? pageState.page.pageNo,
                pageSize: instancesQuery.data?.page.pageSize ?? pageState.page.pageSize,
                total: instancesQuery.data?.page.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => t('common.total', { total }),
                onChange: pageState.onTableChange,
              }}
            />
          </PageState>
        )}
      </Card>
    </div>
  )
}
