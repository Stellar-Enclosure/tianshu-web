import { useQuery } from '@tanstack/react-query'
import { WorkspaceList, useEmbeddedWorkbench } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { Alert, Button, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import { ddcPageApi } from '../api/client'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type { DdcWorkloadObservation, DdcWorkloadObservationStatus } from '../api/types'
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

const observationStatus = (row: DdcWorkloadObservation, now: number): DdcWorkloadObservationStatus => {
  if (row.status !== 'FRESH') return row.status ?? 'UNKNOWN'
  const expiry = Date.parse(row.validUntil ?? '')
  if (!Number.isFinite(expiry)) return 'UNKNOWN'
  return expiry > now ? 'FRESH' : 'STALE'
}

export default function InstancesPage() {
  const { t, locale } = usePageMessages('tianshu.instances')
  const { embedded } = useEmbeddedWorkbench()
  const pageState = usePageState()
  const [draft, setDraft] = useState<ScopeValue>({ ...emptyScope })
  const [submitted, setSubmitted] = useState<ScopeValue | null>(null)
  const [scopeError, setScopeError] = useState(false)
  const [lastExpiry, setLastExpiry] = useState(() => Date.now())

  const instancesQuery = useQuery({
    enabled: submitted !== null,
    queryKey: ['tianshu', 'instances', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcWorkloadObservation>(
      `/api/v1/tianshu/instances/page?${buildQuery({
        bizCode: submitted!.bizCode,
        env: submitted!.env,
        appCode: submitted!.appCode,
        pageNo: pageState.page.pageNo,
        pageSize: pageState.page.pageSize,
      })}`,
      { signal },
    ),
    staleTime: 0,
  })

  const observations = instancesQuery.data?.records
  const observedClock = Math.max(lastExpiry, instancesQuery.dataUpdatedAt)
  useEffect(() => {
    const nextExpiry = Math.min(...(observations ?? [])
      .filter((row) => row.status === 'FRESH')
      .map((row) => Date.parse(row.validUntil ?? ''))
      .filter((expiry) => Number.isFinite(expiry) && expiry > observedClock))
    if (!Number.isFinite(nextExpiry)) return
    const delay = Math.min(2_147_483_647, Math.max(0, nextExpiry - Date.now()))
    const timer = window.setTimeout(() => setLastExpiry(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [observations, observedClock])

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

  const rows = observations ?? []
  const columns: TableColumnsType<DdcWorkloadObservation> = [
    {
      title: t('fields.target'),
      dataIndex: 'targetBindingId',
      key: 'targetBindingId',
      render: (value: string) => <Typography.Text code copyable={{ text: value }}>{value}</Typography.Text>,
    },
    {
      title: t('fields.location'),
      key: 'location',
      render: (_: unknown, row) => `${row.clusterId} / ${row.k8sNamespace}`,
    },
    {
      title: t('common.status'),
      key: 'status',
      render: (_: unknown, row) => {
        const status = observationStatus(row, observedClock)
        return (
          <Space orientation="vertical" size={0}>
            <Tag color={status === 'FRESH' ? 'blue' : 'default'}>{t(`status.${status}`)}</Tag>
            {row.reasonCode && <Typography.Text type="secondary" code>{row.reasonCode}</Typography.Text>}
          </Space>
        )
      },
    },
    {
      title: t('fields.desiredReplicas'),
      key: 'desiredReplicas',
      render: (_: unknown, row) => observationStatus(row, observedClock) === 'FRESH'
        ? row.desiredReplicas ?? '—'
        : '—',
    },
    {
      title: t('fields.pods'),
      key: 'pods',
      render: (_: unknown, row) => {
        if (observationStatus(row, observedClock) !== 'FRESH' || !row.pods?.length) return '—'
        return (
          <Space orientation="vertical" size={2}>
            {row.pods.map((pod) => (
              <Space key={pod.podUid}>
                <Typography.Text code>{pod.podName}</Typography.Text>
                <Tag color={pod.ready ? 'green' : 'orange'}>{t(pod.ready ? 'pod.ready' : 'pod.notReady')}</Tag>
              </Space>
            ))}
          </Space>
        )
      },
    },
    {
      title: t('fields.observedAt'),
      dataIndex: 'observedAt',
      key: 'observedAt',
      render: (value?: string | null) => formatTime(value, locale),
    },
    {
      title: t('fields.validUntil'),
      dataIndex: 'validUntil',
      key: 'validUntil',
      render: (value?: string | null) => formatTime(value, locale),
    },
  ]

  return (
    <div>
      {!embedded && (
        <AdminPageHeader
          title={t('title')}
          description={t('description')}
        />
      )}
      <WorkspaceList
        ariaLabel={t('title')}
        filters={(
          <>
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
          </>
        )}
        toolbar={(
          <Button disabled={submitted === null} loading={instancesQuery.isFetching} onClick={() => { void instancesQuery.refetch() }}>
            {t('actions.refreshPage')}
          </Button>
        )}
        pageState={{ loading: false, error: undefined, empty: false }}
        table={submitted === null ? (
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
            <Table<DdcWorkloadObservation>
              rowKey="targetBindingId"
              columns={columns}
              dataSource={rows}
              loading={instancesQuery.isFetching}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={false}
            />
          </PageState>
        )}
        pagination={submitted !== null ? {
          mode: 'page',
          current: instancesQuery.data?.page.pageNo ?? pageState.page.pageNo,
          pageSize: instancesQuery.data?.page.pageSize ?? pageState.page.pageSize,
          total: instancesQuery.data?.page.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          onChange: pageState.onTableChange,
        } : undefined}
        footer={submitted !== null && instancesQuery.data ? t('common.total', { total: instancesQuery.data.page.total }) : undefined}
      />
    </div>
  )
}
