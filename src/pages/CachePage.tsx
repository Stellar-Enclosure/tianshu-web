import {PermissionButton} from '../permissions/access'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { ddcApi, ddcPageApi } from '../api/client'
import { formatAdminError } from '../i18n/errors'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type { DdcCacheCheckRow } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageState } from '../hooks/usePageState'
import { buildQuery } from '../lib/query'

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

export default function CachePage() {
  const { t } = usePageMessages('tianshu.cache')
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState<ScopeValue>({ ...emptyScope })
  const [submitted, setSubmitted] = useState<ScopeValue | null>(null)

  const checkQuery = useQuery({
    enabled: submitted !== null,
    queryKey: ['tianshu', 'cache-check', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcCacheCheckRow>(
      `/api/v1/tianshu/cache/check/page?${buildQuery({
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

  const rebuildMutation = useMutation({
    mutationFn: (scope: ScopeValue) => ddcApi<number>(
      `/api/v1/tianshu/cache/rebuild?${buildQuery({
        bizCode: scope.bizCode,
        env: scope.env,
        appCode: scope.appCode,
      })}`,
      { method: 'POST' },
    ),
    onSuccess: async (count) => {
      message.success(t('feedback.rebuilt', { count: count ?? 0 }))
      await queryClient.invalidateQueries({ queryKey: ['tianshu', 'cache-check'] })
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const check = () => {
    const next = { ...draft }
    if (!scopeReady(next)) {
      message.warning(t('validation.scopeRequired'))
      return
    }
    setSubmitted(next)
    pageState.resetPage()
  }

  const confirmRebuild = () => {
    const scope = submitted ?? draft
    if (!scopeReady(scope)) {
      message.warning(t('validation.checkScope'))
      return
    }
    modal.confirm({
      title: t('confirm.rebuild'),
      okText: t('actions.rebuild'),
      okButtonProps: { danger: true },
      onOk: () => rebuildMutation.mutateAsync(scope),
    })
  }

  const rows = checkQuery.data?.records ?? []
  const matched = rows.filter((row) => row.matched).length
  const mismatched = rows.length - matched

  const columns: TableColumnsType<DdcCacheCheckRow> = [
    {
      title: t('fields.resourceName'),
      dataIndex: 'resourceName',
      key: 'resourceName',
      render: (value: string) => (
        <Typography.Text code>{value}</Typography.Text>
      ),
    },
    {
      title: t('fields.matched'),
      dataIndex: 'matched',
      key: 'matched',
      render: (value: boolean) => (
        <Tag color={value ? 'green' : 'red'}>{value ? t('status.matched') : t('status.mismatched')}</Tag>
      ),
    },
    { title: t('fields.databaseVersion'), dataIndex: 'databaseVersion', key: 'databaseVersion' },
    { title: t('fields.redisVersion'), dataIndex: 'redisVersion', key: 'redisVersion' },
    {
      title: t('fields.databaseValue'),
      dataIndex: 'databaseValue',
      key: 'databaseValue',
      render: (value?: string) => (
        <Typography.Text code ellipsis style={{ maxWidth: 240 }}>
          {value ?? '—'}
        </Typography.Text>
      ),
    },
    {
      title: t('fields.redisValue'),
      dataIndex: 'redisValue',
      key: 'redisValue',
      render: (value?: string) => (
        <Typography.Text code ellipsis style={{ maxWidth: 240 }}>
          {value ?? '—'}
        </Typography.Text>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={t('description')}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <ScopeSelects value={draft} onChange={setDraft} />
          <Button
            type="primary"
            loading={checkQuery.isFetching}
            onClick={check}
          >
            {t('actions.check')}
          </Button>
          <PermissionButton resourceKey="tianshu.button.CachePage.cache"
            danger
            loading={rebuildMutation.isPending}
            onClick={confirmRebuild}
          >
            {t('actions.rebuild')}
          </PermissionButton>
        </Space>
      </Card>
      {submitted !== null && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12}>
            <Card size="small">
              <Statistic title={t('stats.matched')} value={matched} />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card size="small">
              <Statistic title={t('stats.mismatched')} value={mismatched} />
            </Card>
          </Col>
        </Row>
      )}
      <Card size="small" title={t('list.title')}>
        {submitted === null ? (
          <Typography.Text type="secondary">
            {t('empty.selectScope')}
          </Typography.Text>
        ) : (
          <PageState
            loading={checkQuery.isPending}
            error={checkQuery.error}
            empty={rows.length === 0}
            onRetry={() => { void checkQuery.refetch() }}
          >
            <Table<DdcCacheCheckRow>
              rowKey={(row) => row.resourceName}
              columns={columns}
              dataSource={rows}
              loading={checkQuery.isFetching}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{
                current: checkQuery.data?.page.pageNo
                  ?? pageState.page.pageNo,
                pageSize: checkQuery.data?.page.pageSize
                  ?? pageState.page.pageSize,
                total: checkQuery.data?.page.total ?? 0,
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
