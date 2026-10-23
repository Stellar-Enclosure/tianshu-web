import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
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
import { useState } from 'react'
import { ddcPageApi } from '../api/client'
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
  const instanceStatusLabel = (status?: string): string => {
    const value = status || 'UNKNOWN'
    return ['ONLINE', 'OFFLINE', 'UNKNOWN'].includes(value) ? t(`status.${value}`) : value
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
        group: selectedService!.group,
        version: selectedService!.version,
        pageNo: instancePage.page.pageNo,
        pageSize: instancePage.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

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
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ONLINE' ? 'green' : 'default'}>
          {instanceStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: t('fields.instanceId'),
      dataIndex: 'instanceId',
      key: 'instanceId',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: t('fields.address'),
      key: 'address',
      render: (_: unknown, row) => (
        <Typography.Text code>
          {`${row.secure ? 'tls://' : ''}${row.host}:${row.port}`}
        </Typography.Text>
      ),
    },
    {
      title: t('fields.lastHeartbeatAt'),
      dataIndex: 'lastHeartbeatAt',
      key: 'lastHeartbeatAt',
      render: (value?: string) => formatTime(value, locale),
    },
    {
      title: t('fields.expireAt'),
      dataIndex: 'expireAt',
      key: 'expireAt',
      render: (value?: string) => formatTime(value, locale),
    },
  ]

  const onlineOnPage = (instancesQuery.data?.records ?? [])
    .filter((instance) => instance.status === 'ONLINE').length

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={t('description')}
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
              value={servicesQuery.data?.page.total ?? 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Statistic title={t('stats.onlineOnPage')} value={onlineOnPage} />
          </Card>
        </Col>
      </Row>
      <Card className="tianshu-admin-table-card" size="small" title={t('list.title')}>
        <PageState
          loading={servicesQuery.isPending}
          error={servicesQuery.error}
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
          error={instancesQuery.error}
          empty={(instancesQuery.data?.records.length ?? 0) === 0}
          onRetry={() => { void instancesQuery.refetch() }}
        >
          <Table<RegistryInstance>
            rowKey={(row) => row.instanceId}
            size="small"
            loading={instancesQuery.isFetching}
            dataSource={instancesQuery.data?.records ?? []}
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
