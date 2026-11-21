import {PermissionButton} from '../permissions/access'
import { WorkspaceList, useEmbeddedWorkbench } from '@stellar-enclosure/stellar-enclosure-web-shared'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Alert,
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
import { useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_LocationContext } from 'react-router-dom'
import { ddcApi, ddcPageApi, getDdcRequestContext } from '../api/client'
import { formatAdminError } from '../i18n/errors'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type { DdcPublishProcessEvidence, DdcPublishResult, DdcPublishTask } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import {
  buildQuery,
  formatTime,
  makeWorkbenchSnapshotKey,
  readWorkbenchSnapshot,
  syncWorkbenchSnapshotSession,
  writeWorkbenchSnapshot,
} from '../lib/query'

const POLL_INTERVAL_MS = 15_000

type PublishTaskFilter = ScopeValue & {
  status: string
  changeId: string
}

type PublishTasksSnapshot = {
  draft: PublishTaskFilter
  submitted: PublishTaskFilter
  page: { pageNo: number; pageSize: number }
  scrollTop: number
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
  const { embedded, active, activeTabKey } = useEmbeddedWorkbench()
  const locationContext = useContext(UNSAFE_LocationContext)
  const searchString = locationContext?.location?.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const rawChangeIdParam = new URLSearchParams(searchString).get('changeId')?.trim() ?? ''
  const changeIdParam = rawChangeIdParam.length > 0 && rawChangeIdParam.length <= 128 ? rawChangeIdParam : ''

  const reqCtx = getDdcRequestContext()
  const sessionScope = `${reqCtx.tenantId}:${reqCtx.sessionGeneration}`
  syncWorkbenchSnapshotSession(sessionScope)
  const snapshotKey = makeWorkbenchSnapshotKey(sessionScope, activeTabKey ?? 'tianshu.page.publishTasks')
  const savedSnapshot = readWorkbenchSnapshot<PublishTasksSnapshot>(snapshotKey)

  const taskStatusLabel = (status: string): string =>
    ['PENDING', 'DISPATCHED', 'PUBLISHING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'TIMEOUT', 'UNKNOWN'].includes(status)
      ? t(`status.${status}`)
      : status
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(() => savedSnapshot?.page ?? { pageNo: 1, pageSize: 10 })
  const pageState = {
    page,
    resetPage: () => setPage((current) => ({ ...current, pageNo: 1 })),
    onTableChange: (pageNo: number, pageSize: number) => {
      setPage((current) => ({
        pageNo: current.pageSize === pageSize ? pageNo : 1,
        pageSize,
      }))
    },
  }
  const [draft, setDraft] = useState<PublishTaskFilter>(() =>
    savedSnapshot?.draft ?? { ...emptyFilter, ...(changeIdParam ? { changeId: changeIdParam } : {}) },
  )
  const [submitted, setSubmitted] = useState<PublishTaskFilter>(() =>
    savedSnapshot?.submitted ?? { ...emptyFilter },
  )
  const [detailTask, setDetailTask] = useState<DdcPublishTask | null>(() =>
    changeIdParam
      ? ({
          id: changeIdParam,
          changeId: changeIdParam,
          configId: '',
          bizCode: '',
          appCode: '',
          env: '',
          resourceName: '',
          targetVersion: 0,
          publishMode: '',
          status: 'PENDING',
          targetCount: 0,
          ackCount: 0,
          failedCount: 0,
          ignoredCount: 0,
          timeoutCount: 0,
          attemptCount: 0,
          operator: '',
        } as DdcPublishTask)
      : null,
  )
  const [lastExpiry, setLastExpiry] = useState(() => Date.now())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const initialScrollTopRef = useRef(savedSnapshot?.scrollTop ?? 0)
  const snapshotRef = useRef<PublishTasksSnapshot>({
    draft,
    submitted,
    page,
    scrollTop: savedSnapshot?.scrollTop ?? 0,
  })

  useEffect(() => {
    snapshotRef.current = {
      draft,
      submitted,
      page,
      scrollTop: snapshotRef.current.scrollTop,
    }
    writeWorkbenchSnapshot(snapshotKey, snapshotRef.current)
  }, [draft, submitted, page, snapshotKey])

  useEffect(() => {
    const el = containerRef.current
    if (el && initialScrollTopRef.current > 0) {
      el.scrollTop = initialScrollTopRef.current
    }
  }, [])

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
    refetchInterval: active ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: active,
    staleTime: 0,
  })

  const detailQuery = useQuery({
    enabled: detailTask !== null,
    queryKey: ['tianshu', 'publish-task-detail', detailTask?.changeId],
    queryFn: ({ signal }) => ddcApi<DdcPublishTask>(
      `/api/v1/tianshu/publish-tasks/${encodeURIComponent(detailTask!.changeId)}`,
      { signal },
    ),
    refetchInterval: active && detailTask !== null ? POLL_INTERVAL_MS : false,
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
        <Button type="link" size="small" onClick={() => { setLastExpiry(Date.now()); setDetailTask(row) }}>
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
        <PermissionButton resourceKey="tianshu.button.PublishTasksPage.publish"
          size="small"
          type="primary"
          loading={retryMutation.isPending
            && retryMutation.variables?.id === row.id}
          onClick={() => confirmRetry(row)}
        >
          {t('common.retry')}
        </PermissionButton>
      ),
    },
  ]

  const evidence = detailQuery.error ? undefined : detailQuery.data
  const expiry = Date.parse(evidence?.observationValidUntil ?? '')
  const clock = Math.max(lastExpiry, detailQuery.dataUpdatedAt)
  const evidenceFresh = Number.isFinite(expiry) && expiry > clock && evidence?.historyOnly === false
  useEffect(() => {
    if (!evidenceFresh) return
    const timer = window.setTimeout(() => setLastExpiry(Date.now()), Math.min(2_147_483_647, Math.max(0, expiry - Date.now())))
    return () => window.clearTimeout(timer)
  }, [evidenceFresh, expiry])
  const label = {
    title: t('evidence.title'),
    target: t('evidence.target'),
    platform: t('evidence.platform'),
    rollout: t('evidence.rollout'),
    process: t('evidence.process'),
    counts: t('evidence.counts'),
    observed: t('evidence.observed'),
    unknown: t('evidence.unknown'),
    expired: t('evidence.expired'),
    history: t('evidence.history'),
    waiting: t('evidence.waiting'),
    partial: t('evidence.partial'),
    receipt: t('evidence.receipt'),
    applied: t('evidence.applied'),
    pod: t('evidence.pod'),
    state: t('evidence.state'),
  }
  const stateLabel = (state?: string | null) => {
    if (state === 'PUBLISHED_WAITING_FOR_CONSUMERS') return label.waiting
    if (state === 'PARTIAL_FAILURE' || state === 'PARTIAL') return label.partial
    return !state || state === 'UNKNOWN' ? label.unknown : state
  }
  const processColumns: TableColumnsType<DdcPublishProcessEvidence> = [
    {title: label.pod, key: 'process', render: (_, row) => [row.podName, row.containerName].filter(Boolean).join(' / ') || '—'},
    {title: label.state, key: 'status', render: (_, row) => [stateLabel(row.status), row.errorCode].filter(Boolean).join(' · ')},
    {title: label.applied, dataIndex: 'appliedRevision', render: value => value ?? '—'},
    {title: label.receipt, dataIndex: 'lastReportedAt', render: value => formatTime(value, locale)},
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
    <div
      ref={containerRef}
      onScroll={(event) => {
        snapshotRef.current.scrollTop = Math.max(0, event.currentTarget.scrollTop)
        writeWorkbenchSnapshot(snapshotKey, snapshotRef.current)
      }}
    >
      {!embedded && (
        <AdminPageHeader
          title={t('title')}
          description={t('description')}
        />
      )}
      <WorkspaceList
        ariaLabel={t('title')}
        filters={(
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
        )}
        toolbar={(
          <Button type="primary" onClick={() => { void tasksQuery.refetch() }}>
            {t('actions.refreshPage')}
          </Button>
        )}
        pageState={{ loading: false, error: undefined, empty: false }}
        table={(
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
              pagination={false}
            />
          </PageState>
        )}
        pagination={{
          mode: 'page',
          current: tasksQuery.data?.page.pageNo ?? pageState.page.pageNo,
          pageSize: tasksQuery.data?.page.pageSize ?? pageState.page.pageSize,
          total: tasksQuery.data?.page.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          onChange: pageState.onTableChange,
        }}
        footer={tasksQuery.data ? t('common.total', { total: tasksQuery.data.page.total }) : undefined}
      />
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
          {detailQuery.error && <Alert type="warning" message={formatAdminError(detailQuery.error, t)} />}
          {evidence && <Card size="small" title={label.title} style={{marginTop: 16}}>
            <Descriptions size="small" column={screens.md ? 2 : 1} items={[
              {key: 'revision', label: label.target, children: evidence.desiredRevision ?? '—'},
              {key: 'platform', label: label.platform, children: stateLabel(evidence.platformState)},
              {key: 'rollout', label: label.rollout, children: stateLabel(evidenceFresh ? evidence.rolloutState
                : evidence.rolloutState === 'SUPERSEDED' ? 'SUPERSEDED' : undefined)},
              {key: 'process', label: label.process, children: stateLabel(evidenceFresh ? evidence.processState
                : evidence.processState === 'SUPERSEDED' ? 'SUPERSEDED' : undefined)},
              {key: 'observed', label: label.observed, children: formatTime(evidence.observedAt, locale)},
            ]} />
            {evidence.historyOnly === true && <Alert type="info" message={label.history} />}
            {Number.isFinite(expiry) && !evidenceFresh && evidence.historyOnly === false
              && <Alert type="warning" message={label.expired} />}
            {evidence.reasonCode && <Typography.Text type="secondary">{evidence.reasonCode}</Typography.Text>}
            {(evidence.targets ?? []).map((target, index) => {
              const location = [target.clusterId, target.k8sNamespace, target.targetBindingId].filter(Boolean).join(' / ')
              return <Card key={target.targetBindingId ?? index} size="small" title={location || label.unknown} style={{marginTop: 12}}>
                <Descriptions size="small" column={screens.md ? 2 : 1} items={[
                  {key: 'target', label: label.target, children: target.desiredRevision ?? '—'},
                  {key: 'platform', label: label.platform, children: stateLabel(target.platformState)},
                  {key: 'rollout', label: label.rollout, children: stateLabel(evidenceFresh ? target.rolloutState : undefined)},
                  {key: 'process', label: label.process, children: stateLabel(evidenceFresh ? target.processState : undefined)},
                  {key: 'count', label: label.counts, children: evidenceFresh
                    ? [target.desiredReplicas, target.currentCount, target.appliedCount, target.failedCount, target.waitingCount]
                      .map(value => value ?? '—').join(' / ') : '—'},
                ]} />
                {evidenceFresh && !!target.currentProcesses?.length && <Table size="small" pagination={false}
                  rowKey={(row) => JSON.stringify([row.podUid, row.containerName, row.containerId, row.bootId])}
                  dataSource={target.currentProcesses} columns={processColumns} />}
              </Card>
            })}
          </Card>}
        </Spin>
      </Modal>
    </div>
  )
}
