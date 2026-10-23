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
  Descriptions,
  Grid,
  Input,
  Modal,
  Select,
  Space,
  Spin,
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
import type { DdcPublishResult, DdcPublishTask } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

const POLL_INTERVAL_MS = 15_000

type PublishTaskFilter = ScopeValue & {
  status: string
  changeId: string
}

const emptyFilter: PublishTaskFilter = {
  bizCode: '',
  namespaceCode: '',
  env: '',
  appCode: '',
  status: '',
  changeId: '',
}

const statusColor = (status: string): string => {
  if (status === 'SUCCESS') return 'green'
  if (status === 'FAILED' || status === 'TIMEOUT') return 'red'
  if (status === 'PENDING' || status === 'DISPATCHED') return 'orange'
  return 'default'
}

export default function PublishTasksPage() {
  const { t, locale } = usePageMessages('tianshu.publishTasks')
  const taskStatusLabel = (status: string): string =>
    ['PENDING', 'DISPATCHED', 'PUBLISHING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'TIMEOUT', 'UNKNOWN'].includes(status)
      ? t(`status.${status}`)
      : status
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState<PublishTaskFilter>({ ...emptyFilter })
  const [submitted, setSubmitted] = useState<PublishTaskFilter>({
    ...emptyFilter,
  })
  const [detailTask, setDetailTask] = useState<DdcPublishTask | null>(null)

  const tasksQuery = useQuery({
    queryKey: ['tianshu', 'publish-tasks', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcPublishTask>(
      `/api/v1/tianshu/publish-tasks/page?${buildQuery({
        ...submitted,
        pageNo: pageState.page.pageNo,
        pageSize: pageState.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const detailQuery = useQuery({
    enabled: detailTask !== null,
    queryKey: ['tianshu', 'publish-task-detail', detailTask?.changeId],
    queryFn: ({ signal }) => ddcApi<DdcPublishTask>(
      `/api/v1/tianshu/publish-tasks/${encodeURIComponent(detailTask!.changeId)}`,
      { signal },
    ),
    staleTime: 0,
  })

  const retryMutation = useMutation({
    mutationFn: (task: DdcPublishTask) => ddcApi<DdcPublishResult>(
      `/api/v1/tianshu/publish-tasks/${encodeURIComponent(task.changeId)}/retry`,
      { method: 'POST' },
    ),
    onSuccess: async (result) => {
      message.success(t('feedback.retried', { changeId: result.changeId, status: taskStatusLabel(result.status) }))
      await queryClient.invalidateQueries({
        queryKey: ['tianshu', 'publish-tasks'],
      })
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const applyFilter = () => {
    setSubmitted({
      ...draft,
      changeId: draft.changeId.trim(),
    })
    pageState.resetPage()
  }

  const resetFilter = () => {
    setDraft({ ...emptyFilter })
    setSubmitted({ ...emptyFilter })
    pageState.resetPage()
  }

  const confirmRetry = (task: DdcPublishTask) => {
    modal.confirm({
      title: t('confirm.retry', { changeId: task.changeId }),
      okText: t('common.retry'),
      onOk: () => retryMutation.mutateAsync(task),
    })
  }

  const columns: TableColumnsType<DdcPublishTask> = [
    {
      title: t('fields.changeId'),
      dataIndex: 'changeId',
      key: 'changeId',
      render: (value: string, row) => (
        <Button type="link" size="small" onClick={() => setDetailTask(row)}>
          <Typography.Text code>{value}</Typography.Text>
        </Button>
      ),
    },
    {
      title: t('fields.scope'),
      key: 'scope',
      render: (_: unknown, row) =>
        [row.bizCode, row.env, row.appCode].filter(Boolean).join(' / ') || '—',
    },
    { title: t('fields.resourceName'), dataIndex: 'resourceName', key: 'resourceName' },
    { title: t('fields.targetVersion'), dataIndex: 'targetVersion', key: 'targetVersion' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColor(status)}>{taskStatusLabel(status)}</Tag>
      ),
    },
    { title: t('fields.attemptCount'), dataIndex: 'attemptCount', key: 'attemptCount' },
    {
      title: t('fields.counts'),
      key: 'counts',
      render: (_: unknown, row) =>
        `${row.ackCount ?? 0}/${row.failedCount ?? 0}/${row.timeoutCount ?? 0}`,
    },
    { title: t('fields.operator'), dataIndex: 'operator', key: 'operator' },
    {
      title: t('common.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value?: string) => formatTime(value, locale),
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (value?: string) => formatTime(value, locale),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      render: (_: unknown, row) => (
        <Button
          size="small"
          type="primary"
          loading={retryMutation.isPending
            && retryMutation.variables?.id === row.id}
          onClick={() => confirmRetry(row)}
        >
          {t('common.retry')}
        </Button>
      ),
    },
  ]

  const detail = detailQuery.data ?? detailTask
  const detailItems = detail
    ? [
        [t('fields.changeId'), detail.changeId],
        [
          t('fields.scope'),
          [detail.bizCode, detail.env, detail.appCode]
            .filter(Boolean)
            .join(' / '),
        ],
        [t('fields.resourceName'), detail.resourceName ?? '—'],
        [t('fields.targetVersion'), String(detail.targetVersion ?? '—')],
        [
          t('fields.publishMode'),
          detail.publishMode && ['ASYNC', 'STRONG_ALL_ACK', 'STRONG_QUORUM_ACK', 'SYNC_ALL_ACK'].includes(detail.publishMode)
            ? t(`publishMode.${detail.publishMode}`)
            : detail.publishMode ?? '—',
        ],
        [t('common.status'), taskStatusLabel(detail.status)],
        [t('fields.attemptCount'), String(detail.attemptCount ?? '—')],
        [t('fields.targetCount'), String(detail.targetCount ?? '—')],
        [t('fields.ackCount'), String(detail.ackCount ?? '—')],
        [t('fields.failedCount'), String(detail.failedCount ?? '—')],
        [t('fields.ignoredCount'), String(detail.ignoredCount ?? '—')],
        [t('fields.timeoutCount'), String(detail.timeoutCount ?? '—')],
        [t('fields.timeoutMs'), String(detail.timeoutMs ?? '—')],
        [t('fields.failureStage'), detail.failureStage ?? '—'],
        [t('fields.errorMessage'), detail.errorMessage ?? '—'],
        [t('fields.resourceChecksum'), detail.resourceChecksum ?? '—'],
        [t('fields.dispatchedAt'), formatTime(detail.dispatchedAt, locale)],
        [t('fields.completedAt'), formatTime(detail.completedAt, locale)],
        [t('common.createdAt'), formatTime(detail.createdAt, locale)],
      ].map(([label, value]) => ({ key: label, label, children: value }))
    : []

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={t('description')}
        extra={(
          <Button type="primary" onClick={() => { void tasksQuery.refetch() }}>
            {t('actions.refreshPage')}
          </Button>
        )}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <ScopeSelects
            value={draft}
            onChange={(scope) => setDraft({ ...draft, ...scope })}
          />
          <Select
            aria-label={t('common.status')}
            allowClear
            placeholder={t('common.status')}
            value={draft.status || undefined}
            options={['PENDING', 'DISPATCHED', 'SUCCESS', 'FAILED', 'TIMEOUT']
              .map((value) => ({ value, label: taskStatusLabel(value) }))}
            onChange={(status = '') => setDraft({ ...draft, status })}
            style={{ width: 150 }}
          />
          <Input
            placeholder={t('fields.changeId')}
            value={draft.changeId}
            onChange={(event) => setDraft({
              ...draft,
              changeId: event.target.value,
            })}
            onPressEnter={applyFilter}
            style={{ width: 220 }}
          />
          <Button type="primary" onClick={applyFilter}>{t('common.search')}</Button>
          <Button onClick={resetFilter}>{t('common.reset')}</Button>
        </Space>
      </Card>
      <Card size="small" title={t('list.title')}>
        <PageState
          loading={tasksQuery.isPending}
          error={tasksQuery.error}
          empty={(tasksQuery.data?.records.length ?? 0) === 0}
          showPartial={tasksQuery.data !== undefined}
          onRetry={() => { void tasksQuery.refetch() }}
        >
          <Table<DdcPublishTask>
            rowKey={(row) => row.id}
            columns={columns}
            dataSource={tasksQuery.data?.records ?? []}
            loading={tasksQuery.isFetching}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: tasksQuery.data?.page.pageNo ?? pageState.page.pageNo,
              pageSize: tasksQuery.data?.page.pageSize
                ?? pageState.page.pageSize,
              total: tasksQuery.data?.page.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t('common.total', { total }),
              onChange: pageState.onTableChange,
            }}
          />
        </PageState>
      </Card>
      <Modal
        open={detailTask !== null}
        title={t('detail.title', { changeId: detailTask?.changeId ?? '' })}
        onCancel={() => setDetailTask(null)}
        footer={null}
        width={screens.md ? 720 : 'calc(100vw - 24px)'}
      >
        <Spin spinning={detailQuery.isFetching}>
          <Descriptions
            bordered
            size="small"
            column={screens.md ? 2 : 1}
            items={detailItems}
          />
        </Spin>
      </Modal>
    </div>
  )
}
