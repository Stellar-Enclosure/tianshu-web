import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
import { WorkspaceList, useEmbeddedWorkbench } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { DownOutlined } from '@ant-design/icons'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  App,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { MenuProps, TableColumnsType } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ddcApi, ddcPageApi, getDdcRequestContext } from '../api/client'
import { formatAdminError } from '../i18n/errors'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type {
  DdcConfig,
  DdcConfigVersion,
  DdcPublishResult,
} from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageState } from '../hooks/usePageState'
import {
  buildQuery,
  formatTime,
  makeWorkbenchSnapshotKey,
  readWorkbenchSnapshot,
  syncWorkbenchSnapshotSession,
  writeWorkbenchSnapshot,
} from '../lib/query'
import { uuidV7 } from '../lib/uuid'
import ConfigEditorDialog, { type ConfigScope } from './ConfigEditorDialog'

type ConfigsSnapshot = {
  draftScope: ScopeValue
  submittedScope: ScopeValue
  page: { pageNo: number; pageSize: number }
  scrollTop: number
}

const emptyScope: ScopeValue = {
  bizCode: '',
  namespaceCode: '',
  env: '',
  appCode: '',
}

const configScopeLabel = (config: DdcConfig): string => `${config.bizCode} / ${config.env} / ${config.appCode}`

export default function ConfigsPage() {
  const { t, locale } = usePageMessages('tianshu.configs')
  const { embedded, activeTabKey } = useEmbeddedWorkbench()
  const reqCtx = getDdcRequestContext()
  const sessionScope = `${reqCtx.tenantId}:${reqCtx.sessionGeneration}`
  syncWorkbenchSnapshotSession(sessionScope)
  const snapshotKey = makeWorkbenchSnapshotKey(sessionScope, activeTabKey ?? 'tianshu.page.configs')
  const savedSnapshot = readWorkbenchSnapshot<ConfigsSnapshot>(snapshotKey)

  const publishWritable = useDdcWritable('DdcPublishRequest')
  const rollbackWritable = useDdcWritable('DdcConfigRollbackRequest')
  const mayMutate = useDdcPermission('tianshu.button.ConfigsPage.write')
  const taskStatusLabel = (status: string): string =>
    ['PENDING', 'DISPATCHED', 'PUBLISHING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'TIMEOUT', 'UNKNOWN'].includes(status)
      ? t(`status.${status}`)
      : status
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const [configPageState, setConfigPageState] = useState(() => savedSnapshot?.page ?? { pageNo: 1, pageSize: 10 })
  const configPage = {
    page: configPageState,
    resetPage: () => setConfigPageState((current) => ({ ...current, pageNo: 1 })),
    onTableChange: (pageNo: number, pageSize: number) => {
      setConfigPageState((current) => ({
        pageNo: current.pageSize === pageSize ? pageNo : 1,
        pageSize,
      }))
    },
  }
  const versionPage = usePageState()
  const [draftScope, setDraftScope] = useState<ScopeValue>(() => savedSnapshot?.draftScope ?? { ...emptyScope })
  const [submittedScope, setSubmittedScope] = useState<ScopeValue>(() =>
    savedSnapshot?.submittedScope ?? { ...emptyScope },
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<DdcConfig | null>(null)
  const [versionsConfig, setVersionsConfig] = useState<DdcConfig | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const initialScrollTopRef = useRef(savedSnapshot?.scrollTop ?? 0)
  const snapshotRef = useRef<ConfigsSnapshot>({
    draftScope,
    submittedScope,
    page: configPageState,
    scrollTop: savedSnapshot?.scrollTop ?? 0,
  })

  useEffect(() => {
    snapshotRef.current = {
      draftScope,
      submittedScope,
      page: configPageState,
      scrollTop: snapshotRef.current.scrollTop,
    }
    writeWorkbenchSnapshot(snapshotKey, snapshotRef.current)
  }, [draftScope, submittedScope, configPageState, snapshotKey])

  useEffect(() => {
    const el = containerRef.current
    if (el && initialScrollTopRef.current > 0) {
      el.scrollTop = initialScrollTopRef.current
    }
  }, [])

  const configsQuery = useQuery({
    queryKey: ['tianshu', 'configs', submittedScope, configPage.page],
    queryFn: ({ signal }) => ddcPageApi<DdcConfig>(
      `/api/v1/tianshu/configs/page?${buildQuery({
        ...submittedScope,
        includeDeleted: false,
        pageNo: configPage.page.pageNo,
        pageSize: configPage.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const versionsQuery = useQuery({
    enabled: versionsConfig !== null,
    queryKey: [
      'tianshu',
      'config-versions',
      versionsConfig?.id,
      versionPage.page,
    ],
    queryFn: ({ signal }) => ddcPageApi<DdcConfigVersion>(
      `/api/v1/tianshu/configs/${encodeURIComponent(versionsConfig!.id)}/versions/page?${buildQuery({
        pageNo: versionPage.page.pageNo,
        pageSize: versionPage.page.pageSize,
      })}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const invalidateConfigs = () => queryClient.invalidateQueries({
    queryKey: ['tianshu', 'configs'],
  })

  const publishMutation = useMutation({
    mutationFn: (config: DdcConfig) => ddcApi<DdcPublishResult>(
      `/api/v1/tianshu/configs/${encodeURIComponent(config.id)}/publish`,
      {
        method: 'POST',
        body: {
          changeId: uuidV7(),
          content: config.content,
          expectedVersion: config.currentVersion,
          timeoutMs: 30000,
        },
      },
    ),
    onSuccess: async (result) => {
      message.success(t('feedback.published', { changeId: result.changeId, status: taskStatusLabel(result.status) }))
      await invalidateConfigs()
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const deleteMutation = useMutation({
    mutationFn: (config: DdcConfig) => ddcApi(
      `/api/v1/tianshu/configs/${encodeURIComponent(config.id)}`,
      { method: 'DELETE' },
    ),
    onSuccess: async () => {
      if ((configsQuery.data?.records.length ?? 0) === 1
          && configPage.page.pageNo > 1) {
        configPage.onTableChange(
          configPage.page.pageNo - 1,
          configPage.page.pageSize,
        )
      }
      message.success(t('feedback.deleted'))
      await invalidateConfigs()
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const rollbackMutation = useMutation({
    mutationFn: ({ config, version }: {
      config: DdcConfig
      version: DdcConfigVersion
    }) => ddcApi(
      `/api/v1/tianshu/configs/${encodeURIComponent(config.id)}/rollback`,
      {
        method: 'POST',
        body: {
          configId: config.id,
          version: version.version,
          reason: 'rollback from Tianshu Admin Web',
        },
      },
    ),
    onSuccess: async () => {
      message.success(t('feedback.rolledBack'))
      closeVersions()
      await invalidateConfigs()
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const applyFilter = () => {
    setSubmittedScope({ ...draftScope })
    configPage.resetPage()
  }

  const resetFilter = () => {
    setDraftScope({ ...emptyScope })
    setSubmittedScope({ ...emptyScope })
    configPage.resetPage()
  }

  const openNewDialog = () => {
    setEditingConfig(null)
    setDialogOpen(true)
  }

  const openEditDialog = (config: DdcConfig) => {
    setEditingConfig(config)
    setDialogOpen(true)
  }

  const openVersions = (config: DdcConfig) => {
    versionPage.resetPage()
    setVersionsConfig(config)
  }

  const closeVersions = () => {
    setVersionsConfig(null)
    versionPage.onTableChange(1, 10)
  }

  const confirmPublish = (config: DdcConfig) => {
    modal.confirm({
      title: t('confirm.publish', { name: config.resourceName }),
      content: t('confirm.scope', { scope: configScopeLabel(config) }),
      okText: t('actions.publish'),
      onOk: () => publishMutation.mutateAsync(config),
    })
  }

  const confirmDelete = (config: DdcConfig) => {
    modal.confirm({
      title: t('confirm.delete', { name: config.resourceName }),
      content: t('confirm.scope', { scope: configScopeLabel(config) }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(config),
    })
  }

  const confirmRollback = (
    config: DdcConfig,
    version: DdcConfigVersion,
  ) => {
    modal.confirm({
      title: t('confirm.rollback', { version: version.version }),
      content: t('confirm.scope', { scope: configScopeLabel(config) }),
      okText: t('actions.rollback'),
      onOk: () => rollbackMutation.mutateAsync({ config, version }),
    })
  }

  const defaultScope: ConfigScope = useMemo(() => ({
    ...draftScope,
  }), [draftScope])

  const configColumns: TableColumnsType<DdcConfig> = [
    {
      title: t('fields.scope'),
      key: 'scope',
      render: (_: unknown, row) => <Typography.Text code>{configScopeLabel(row)}</Typography.Text>,
    },
    {
      title: t('fields.resourceName'),
      dataIndex: 'resourceName',
      key: 'resourceName',
      render: (value: string, row) => (
        <Space>
          <Typography.Text code>{value}</Typography.Text>
          <Tag color="blue">{row.format}</Tag>
        </Space>
      ),
    },
    {
      title: t('fields.visibleNamespaces'),
      dataIndex: 'visibleNamespaces',
      key: 'visibleNamespaces',
      render: (values: string[] = []) => (
        <Space size={[4, 4]} wrap>
          {values.length === 0
            ? '—'
            : values.map((value) => <Tag key={value}>{value}</Tag>)}
        </Space>
      ),
    },
    {
      title: t('fields.content'),
      key: 'value',
      width: 360,
      ellipsis: true,
      render: (_: unknown, row) => {
        const content = row.content.replace(/\s+/g, ' ').trim()
        return (
          <div style={{ maxWidth: 340 }}>
            <Typography.Text code ellipsis title={content}>
              {content}
            </Typography.Text>
            {row.description && (
              <Typography.Text
                type="secondary"
                ellipsis
                title={row.description}
                style={{ display: 'block', fontSize: 12 }}
              >
                {row.description}
              </Typography.Text>
            )}
          </div>
        )
      },
    },
    { title: t('fields.currentVersion'), dataIndex: 'currentVersion', key: 'currentVersion' },
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
      render: (_: unknown, row) => {
        const items: MenuProps['items'] = [
          { key: 'versions', label: t('actions.viewVersions') },
          { key: 'delete', label: t('common.delete'), danger: true, disabled: !mayMutate },
        ]
        return (
          <Space.Compact>
            <PermissionButton resourceKey="tianshu.button.ConfigsPage.write" size="small" onClick={() => openEditDialog(row)}>
              {t('common.edit')}
            </PermissionButton>
            <PermissionButton disabled={!publishWritable} resourceKey="tianshu.button.ConfigsPage.publish"
              size="small"
              type="primary"
              loading={publishMutation.isPending
                && publishMutation.variables?.id === row.id}
              onClick={() => confirmPublish(row)}
            >
              {t('actions.publish')}
            </PermissionButton>
            <Dropdown
              trigger={['click']}
              menu={{
                items,
                onClick: ({ key }) => {
                  if (key === 'versions') openVersions(row)
                  if (key === 'delete') confirmDelete(row)
                },
              }}
            >
              <Button size="small">
                {t('actions.more')} <DownOutlined />
              </Button>
            </Dropdown>
          </Space.Compact>
        )
      },
    },
  ]

  const versionColumns: TableColumnsType<DdcConfigVersion> = [
    { title: t('fields.version'), dataIndex: 'version', key: 'version' },
    {
      title: t('fields.changeType'),
      dataIndex: 'changeType',
      key: 'changeType',
      render: (value?: string) => value && ['CREATE', 'UPDATE', 'DELETE', 'ROLLBACK'].includes(value)
        ? t(`changeType.${value}`)
        : value ?? '—',
    },
    { title: t('fields.changeReason'), dataIndex: 'changeReason', key: 'changeReason' },
    { title: t('fields.operator'), dataIndex: 'operator', key: 'operator' },
    {
      title: t('fields.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value?: string) => formatTime(value, locale),
    },
    {
      title: t('fields.newContent'),
      dataIndex: 'newContent',
      key: 'newContent',
      render: (value: string) => (
        <Typography.Text code ellipsis style={{ maxWidth: 220 }}>
          {value?.replace(/\s+/g, ' ').slice(0, 60) ?? '—'}
        </Typography.Text>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      render: (_: unknown, row) => versionsConfig && (
        <PermissionButton disabled={!rollbackWritable} resourceKey="tianshu.button.ConfigsPage.publish"
          size="small"
          onClick={() => confirmRollback(versionsConfig, row)}
        >
          {t('actions.rollback')}
        </PermissionButton>
      ),
    },
  ]

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
              value={draftScope}
              onChange={setDraftScope}
            />
            <Button type="primary" onClick={applyFilter}>{t('common.search')}</Button>
            <Button onClick={resetFilter}>{t('common.reset')}</Button>
          </Space>
        )}
        toolbar={(
          <PermissionButton resourceKey="tianshu.button.ConfigsPage.write" type="primary" onClick={openNewDialog}>
            {t('actions.create')}
          </PermissionButton>
        )}
        pageState={{ loading: false, error: undefined, empty: false }}
        table={(
          <PageState
            loading={configsQuery.isPending}
            error={configsQuery.error}
            empty={(configsQuery.data?.records.length ?? 0) === 0}
            onRetry={() => { void configsQuery.refetch() }}
          >
            <Table<DdcConfig>
              rowKey={(row) => row.id}
              columns={configColumns}
              dataSource={configsQuery.data?.records ?? []}
              loading={configsQuery.isFetching}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={false}
            />
          </PageState>
        )}
        pagination={{
          mode: 'page',
          current: configPage.page.pageNo,
          pageSize: configPage.page.pageSize,
          total: configsQuery.data?.page.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          onChange: configPage.onTableChange,
        }}
        footer={configsQuery.data ? t('common.total', { total: configsQuery.data.page.total }) : undefined}
      />
      <ConfigEditorDialog
        open={dialogOpen}
        config={editingConfig}
        defaultScope={defaultScope}
        onClose={() => setDialogOpen(false)}
        onSaved={() => setDialogOpen(false)}
      />
      <Drawer
        open={versionsConfig !== null}
        title={t('versions.title')}
        onClose={closeVersions}
        size={screens.md ? 860 : '100%'}
      >
        <PageState
          loading={versionsQuery.isPending}
          error={versionsQuery.error}
          empty={(versionsQuery.data?.records.length ?? 0) === 0}
          onRetry={() => { void versionsQuery.refetch() }}
        >
          <Table<DdcConfigVersion>
            rowKey={(row) => row.id}
            dataSource={versionsQuery.data?.records ?? []}
            loading={versionsQuery.isFetching}
            size="small"
            scroll={{ x: 'max-content' }}
            columns={versionColumns}
            pagination={{
              current: versionsQuery.data?.page.pageNo
                ?? versionPage.page.pageNo,
              pageSize: versionsQuery.data?.page.pageSize
                ?? versionPage.page.pageSize,
              total: versionsQuery.data?.page.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t('common.total', { total }),
              onChange: versionPage.onTableChange,
            }}
          />
        </PageState>
      </Drawer>
    </div>
  )
}
