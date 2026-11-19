import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Grid,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import { DdcApiError, ddcPageApi } from '../api/client'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type { RegistryInstance, RegistryService } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'
import { emptyScope } from '../lib/scopeDefaults'

export default function RegistryPage() {
  const { t, locale } = usePageMessages('tianshu.registry')
  const label = {
    source: t('observation.source'),
    ready: t('observation.ready'),
    serving: t('observation.serving'),
    terminating: t('observation.terminating'),
    yes: t('observation.yes'),
    no: t('observation.no'),
    stale: t('observation.stale'),
    condition: t('observation.condition'),
    port: t('observation.port'),
    observed: t('observation.observed'),
    validUntil: t('observation.validUntil'),
    unavailable: t('observation.unavailable'),
    denied: t('observation.denied'),
  }
  const status = (value?: string) => value === 'true' ? label.yes : value === 'false' ? label.no : t('status.UNKNOWN')
  const observationError = (error: Error | null) => {
    if (error instanceof DdcApiError && error.status === 403) return new Error(label.denied)
    if (error instanceof DdcApiError && error.status === 503) return new Error(label.unavailable)
    return error
  }
  const screens = Grid.useBreakpoint()
  const servicePage = usePageState()
  const instancePage = usePageState()
  const [draft, setDraft] = useState<ScopeValue>(() => ({ ...emptyScope }))
  const [submitted, setSubmitted] = useState<ScopeValue>(() => ({
    ...emptyScope,
  }))
  const [selectedService, setSelectedService] =
    useState<RegistryService | null>(null)
  const [lastExpiry, setLastExpiry] = useState(() => Date.now())

  const servicesQuery = useQuery({
    queryKey: ['tianshu', 'registry-services', submitted, servicePage.page],
    queryFn: ({ signal }) => ddcPageApi<RegistryService>(
      `/api/v1/tianshu/registry/services/page?${buildQuery({
        ...submitted,
        pageNo: servicePage.page.pageNo,
        pageSize: servicePage.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const instancesQuery = useQuery({
    enabled: selectedService !== null,
    queryKey: [
      'tianshu',
      'registry-instances',
      selectedService?.serviceId,
      instancePage.page,
    ],
    queryFn: ({ signal }) => ddcPageApi<RegistryInstance>(
      `/api/v1/tianshu/registry/instances/page?${buildQuery({
        bizCode: selectedService!.bizCode,
        env: selectedService!.env,
        appCode: selectedService!.appCode,
        serviceKind: selectedService!.serviceKind,
        protocol: selectedService!.protocol,
        serviceName: selectedService!.serviceName,
        bindingId: selectedService!.serviceId,
        group: selectedService!.group,
        version: selectedService!.version,
        pageNo: instancePage.page.pageNo,
        pageSize: instancePage.page.pageSize,
      })}`,
      { signal },
    ),
    staleTime: 0,
  })

  const endpointRows = instancesQuery.data?.records
  const clock = Math.max(lastExpiry, instancesQuery.dataUpdatedAt)
  const expiry = Math.min(...(endpointRows ?? []).map(row => Date.parse(row.metadata?.validUntil ?? '')))
  const currentRows = (endpointRows ?? []).filter(row => row.metadata?.observationSource === 'KUBERNETES'
    && row.metadata.bindingId === selectedService?.serviceId && !!row.metadata.podUid
    && Date.parse(row.metadata.validUntil ?? '') > clock)
  const invalidEvidence = !!endpointRows?.length && currentRows.length !== endpointRows.length
  useEffect(() => {
    if (!Number.isFinite(expiry) || expiry <= clock) return
    const timer = window.setTimeout(() => setLastExpiry(Date.now()), Math.min(2_147_483_647, Math.max(0, expiry - Date.now())))
    return () => window.clearTimeout(timer)
  }, [clock, expiry])

  const applyFilter = () => {
    setSubmitted({ ...draft })
    servicePage.resetPage()
  }

  const resetFilter = () => {
    setDraft({ ...emptyScope })
    setSubmitted({ ...emptyScope })
    servicePage.resetPage()
  }

  const openInstances = (service: RegistryService) => {
    instancePage.resetPage()
    setLastExpiry(Date.now())
    setSelectedService(service)
  }

  const closeInstances = () => {
    setSelectedService(null)
    instancePage.onTableChange(1, 10)
  }

  const serviceColumns: TableColumnsType<RegistryService> = [
    {
      title: t('fields.scope'),
      key: 'scope',
      render: (_: unknown, row) => (
        <Typography.Text code>
          {row.bizCode} / {row.env} / {row.appCode}
        </Typography.Text>
      ),
    },
    {
      title: t('fields.transport'),
      key: 'transport',
      render: (_: unknown, row) => (
        <Space>
          <Tag>{row.serviceKind}</Tag>
          <Tag color="blue">{row.protocol}</Tag>
        </Space>
      ),
    },
    { title: t('fields.serviceName'), dataIndex: 'serviceName', key: 'serviceName' },
    {
      title: t('fields.version'),
      key: 'version',
      render: (_: unknown, row) =>
        `${row.group ?? '—'} / ${row.version ?? '—'}`,
    },
    {
      title: t('fields.serviceId'),
      dataIndex: 'serviceId',
      key: 'serviceId',
      render: (value: string) => (
        <Typography.Text code copyable={{ text: value }} title={value}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      render: (_: unknown, row) => (
        <Button size="small" type="primary" onClick={() => openInstances(row)}>
          {t('actions.viewInstances')}
        </Button>
      ),
    },
  ]

  const instanceColumns: TableColumnsType<RegistryInstance> = [
    {title: 'Pod', key: 'pod', render: (_, row) => <Typography.Text code>{row.metadata?.podName ?? '—'}</Typography.Text>},
    {title: label.port, dataIndex: 'port', key: 'port'},
    {title: label.condition, key: 'condition', render: (_, row) => <Space wrap>
      <Tag color={row.metadata?.ready === 'true' ? 'green' : undefined}>{label.ready} / {status(row.metadata?.ready)}</Tag>
      <Tag>{label.serving} / {status(row.metadata?.serving)}</Tag>
      <Tag>{label.terminating} / {status(row.metadata?.terminating)}</Tag>
    </Space>},
    {title: label.observed, key: 'observed', render: (_, row) => formatTime(row.metadata?.observedAt, locale)},
    {title: label.validUntil, key: 'expiry', render: (_, row) => formatTime(row.metadata?.validUntil, locale)},
  ]

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={label.source}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <ScopeSelects value={draft} onChange={setDraft} />
          <Button type="primary" onClick={applyFilter}>{t('common.search')}</Button>
          <Button onClick={resetFilter}>{t('common.reset')}</Button>
        </Space>
      </Card>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Statistic
              title={t('stats.services')}
              value={servicesQuery.error ? '—' : servicesQuery.data?.page.total ?? '—'}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Statistic title={label.ready} value={instancesQuery.error || invalidEvidence || !endpointRows ? '—' :
              currentRows.filter(row => row.metadata?.ready === 'true').length} />
          </Card>
        </Col>
      </Row>
      <Card className="tianshu-admin-table-card" size="small" title={t('list.title')}>
        <PageState
          loading={servicesQuery.isPending}
          error={observationError(servicesQuery.error)}
          empty={(servicesQuery.data?.records.length ?? 0) === 0}
          onRetry={() => { void servicesQuery.refetch() }}
        >
          <Table<RegistryService>
            rowKey={(row) => row.serviceId}
            columns={serviceColumns}
            dataSource={servicesQuery.data?.records ?? []}
            loading={servicesQuery.isFetching}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: servicesQuery.data?.page.pageNo
                ?? servicePage.page.pageNo,
              pageSize: servicesQuery.data?.page.pageSize
                ?? servicePage.page.pageSize,
              total: servicesQuery.data?.page.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t('common.total', { total }),
              onChange: servicePage.onTableChange,
            }}
          />
        </PageState>
      </Card>
      <Drawer
        open={selectedService !== null}
        title={t('instances.title', { name: selectedService?.serviceName ?? '' })}
        onClose={closeInstances}
        size={screens.md ? 860 : '100%'}
      >
        <PageState
          loading={instancesQuery.isPending}
          error={observationError(instancesQuery.error)}
          empty={!invalidEvidence && currentRows.length === 0}
          onRetry={() => { void instancesQuery.refetch() }}
        >
          {invalidEvidence && <Alert type="warning" showIcon
            message={Number.isFinite(expiry) && expiry <= clock ? label.stale : label.unavailable} />}
          <Table<RegistryInstance>
            rowKey={(row) => row.instanceId}
            size="small"
            loading={instancesQuery.isFetching}
            dataSource={invalidEvidence || instancesQuery.error ? [] : currentRows}
            columns={instanceColumns}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: instancesQuery.data?.page.pageNo
                ?? instancePage.page.pageNo,
              pageSize: instancesQuery.data?.page.pageSize
                ?? instancePage.page.pageSize,
              total: instancesQuery.data?.page.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t('common.total', { total }),
              onChange: instancePage.onTableChange,
            }}
          />
        </PageState>
      </Drawer>
    </div>
  )
}
