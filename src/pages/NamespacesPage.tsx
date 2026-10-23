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
  Drawer,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import { useState } from 'react'
import { ddcApi, ddcPageApi } from '../api/client'
import { formatAdminError } from '../i18n/errors'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminPageState as PageState } from '../components/page/AdminPageState'
import type {
  DdcApp,
  DdcEnv,
  DdcNamespace,
  DdcNamespaceEnvAppBinding,
} from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import BizSelect from '../components/scope/BizSelect'
import { scopeOptionQueryKey } from '../components/scope/useScopeOptions'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

type NamespaceFilter = { bizCode: string; keyword: string }

const emptyFilter: NamespaceFilter = { bizCode: '', keyword: '' }

type NamespaceFormValues = {
  bizCode: string
  namespaceCode: string
  namespace: string
  description?: string
  enabled: boolean
}

export default function NamespacesPage() {
  const { t, locale } = usePageMessages('tianshu.namespaces')
  const { message } = App.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState<NamespaceFilter>({ ...emptyFilter })
  const [submitted, setSubmitted] = useState<NamespaceFilter>({ ...emptyFilter })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DdcNamespace | null>(null)
  const [form] = Form.useForm<NamespaceFormValues>()
  const [bindingNamespace, setBindingNamespace] =
    useState<DdcNamespace | null>(null)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [bindingSaving, setBindingSaving] = useState(false)
  const [bindings, setBindings] =
    useState<DdcNamespaceEnvAppBinding[]>([])
  const [bindingApps, setBindingApps] = useState<DdcApp[]>([])
  const [bindingEnvs, setBindingEnvs] = useState<DdcEnv[]>([])
  const [bindingDraft, setBindingDraft] =
    useState<Record<string, string[]>>({})

  const queryString = buildQuery({
    bizCode: submitted.bizCode,
    keyword: submitted.keyword,
    pageNo: pageState.page.pageNo,
    pageSize: pageState.page.pageSize,
  })
  const query = useQuery({
    queryKey: ['tianshu', 'namespaces', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcNamespace>(
      `/api/v1/tianshu/namespaces/page?${queryString}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tianshu', 'namespaces'] })
    await queryClient.invalidateQueries({ queryKey: scopeOptionQueryKey })
  }

  const saveMutation = useMutation({
    mutationFn: ({ item, values }: {
      item: DdcNamespace | null
      values: NamespaceFormValues
    }) => item
      ? ddcApi(`/api/v1/tianshu/namespaces/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: values,
      })
      : ddcApi('/api/v1/tianshu/namespaces', { method: 'POST', body: values }),
    onSuccess: async () => {
      setOpen(false)
      await invalidate()
      message.success(t('feedback.saved'))
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ item, enabled }: {
      item: DdcNamespace
      enabled: boolean
    }) => ddcApi(
      `/api/v1/tianshu/namespaces/${encodeURIComponent(item.id)}/enabled?enabled=${enabled}`,
      { method: 'PUT' },
    ),
    onSuccess: async () => {
      await invalidate()
      message.success(t('feedback.statusUpdated'))
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const removeMutation = useMutation({
    mutationFn: (item: DdcNamespace) => ddcApi(
      `/api/v1/tianshu/namespaces/${encodeURIComponent(item.id)}`,
      { method: 'DELETE' },
    ),
    onSuccess: async () => {
      if ((query.data?.records.length ?? 0) === 1
          && pageState.page.pageNo > 1) {
        pageState.onTableChange(
          pageState.page.pageNo - 1,
          pageState.page.pageSize,
        )
      }
      await invalidate()
      message.success(t('feedback.deleted'))
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const applyFilter = () => {
    setSubmitted({
      bizCode: draft.bizCode.trim(),
      keyword: draft.keyword.trim(),
    })
    pageState.resetPage()
  }

  const resetFilter = () => {
    setDraft({ ...emptyFilter })
    setSubmitted({ ...emptyFilter })
    pageState.resetPage()
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (item: DdcNamespace) => {
    setEditing(item)
    form.setFieldsValue({
      bizCode: item.bizCode,
      namespaceCode: item.namespaceCode,
      namespace: item.namespace,
      description: item.description ?? '',
      enabled: item.enabled,
    })
    setOpen(true)
  }

  const save = async () => {
    try {
      const values = await form.validateFields()
      saveMutation.mutate({ item: editing, values })
    } catch {
      return
    }
  }

  const closeBindings = () => {
    setBindingNamespace(null)
    setBindings([])
    setBindingApps([])
    setBindingEnvs([])
    setBindingDraft({})
  }

  const openBindings = async (item: DdcNamespace) => {
    setBindingNamespace(item)
    setBindingLoading(true)
    try {
      const params = new URLSearchParams({
        bizCode: item.bizCode,
        namespaceCode: item.namespaceCode,
      })
      const [currentBindings, envs, apps] = await Promise.all([
        ddcApi<DdcNamespaceEnvAppBinding[]>(
          `/api/v1/tianshu/namespace-env-app-bindings?${params.toString()}`,
        ),
        ddcApi<DdcEnv[]>('/api/v1/tianshu/envs'),
        ddcApi<DdcApp[]>(
          `/api/v1/tianshu/apps?bizCode=${encodeURIComponent(item.bizCode)}`,
        ),
      ])
      const nextDraft: Record<string, string[]> = {}
      envs.forEach((env) => {
        nextDraft[env.envCode] = currentBindings
          .filter((binding) => binding.enabled && binding.env === env.envCode)
          .map((binding) => binding.appCode)
      })
      setBindings(currentBindings)
      setBindingEnvs(envs)
      setBindingApps(apps)
      setBindingDraft(nextDraft)
    } catch (error) {
      closeBindings()
      message.error(formatAdminError(error, t))
    } finally {
      setBindingLoading(false)
    }
  }

  const saveBindings = async () => {
    if (!bindingNamespace) return
    setBindingSaving(true)
    try {
      const changes: Promise<unknown>[] = []
      bindingEnvs.forEach((env) => {
        const desired = new Set(bindingDraft[env.envCode] ?? [])
        const current = bindings.filter((binding) => binding.env === env.envCode)
        desired.forEach((appCode) => {
          const existing = current.find((binding) => binding.appCode === appCode)
          const body = {
            bizCode: bindingNamespace.bizCode,
            namespaceCode: bindingNamespace.namespaceCode,
            env: env.envCode,
            appCode,
            enabled: true,
          }
          if (!existing) {
            changes.push(ddcApi('/api/v1/tianshu/namespace-env-app-bindings', {
              method: 'POST',
              body,
            }))
          } else if (!existing.enabled) {
            changes.push(ddcApi(
              `/api/v1/tianshu/namespace-env-app-bindings/${encodeURIComponent(existing.id)}`,
              { method: 'PUT', body },
            ))
          }
        })
        current
          .filter((binding) => binding.enabled && !desired.has(binding.appCode))
          .forEach((binding) => changes.push(ddcApi(
            `/api/v1/tianshu/namespace-env-app-bindings/${encodeURIComponent(binding.id)}`,
            { method: 'DELETE' },
          )))
      })
      await Promise.all(changes)
      message.success(t('feedback.bindingsSaved'))
      closeBindings()
    } catch (error) {
      message.error(formatAdminError(error, t))
    } finally {
      setBindingSaving(false)
    }
  }

  const columns = [
    {
      title: t('fields.bizCode'),
      dataIndex: 'bizCode',
      key: 'bizCode',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: t('fields.namespaceCode'),
      dataIndex: 'namespaceCode',
      key: 'namespaceCode',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: t('common.name'), dataIndex: 'namespace', key: 'namespace' },
    { title: t('common.description'), dataIndex: 'description', key: 'description' },
    {
      title: t('common.enabled'),
      key: 'enabled',
      render: (_: unknown, row: DdcNamespace) => (
        <Switch
          checked={row.enabled}
          disabled={toggleMutation.isPending
            && toggleMutation.variables?.item.id === row.id}
          onChange={(enabled) => toggleMutation.mutate({ item: row, enabled })}
        />
      ),
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
      fixed: 'right' as const,
      render: (_: unknown, row: DdcNamespace) => (
        <Space wrap={false}>
          <Button size="small" onClick={() => openEdit(row)}>{t('common.edit')}</Button>
          <Button size="small" onClick={() => { void openBindings(row) }}>
            {t('actions.manageBindings')}
          </Button>
          <Popconfirm
            title={t('confirm.delete', { name: row.namespace })}
            onConfirm={() => removeMutation.mutateAsync(row)}
          >
            <Button size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title={t('title')}
        description={t('description')}
        extra={(
          <Button type="primary" onClick={openCreate}>{t('actions.create')}</Button>
        )}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span style={{ width: 220, display: 'inline-block' }}>
            <BizSelect
              value={draft.bizCode}
              onChange={(bizCode) => setDraft({ ...draft, bizCode })}
            />
          </span>
          <Input
            placeholder={t('filters.keyword')}
            value={draft.keyword}
            onChange={(event) => setDraft({
              ...draft,
              keyword: event.target.value,
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
          loading={query.isPending}
          error={query.error}
          empty={(query.data?.records.length ?? 0) === 0}
          onRetry={() => { void query.refetch() }}
        >
          <Table<DdcNamespace>
            rowKey={(row) => row.id}
            columns={columns}
            dataSource={query.data?.records ?? []}
            loading={query.isFetching}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: query.data?.page.pageNo ?? pageState.page.pageNo,
              pageSize: query.data?.page.pageSize ?? pageState.page.pageSize,
              total: query.data?.page.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t('common.total', { total }),
              onChange: pageState.onTableChange,
            }}
          />
        </PageState>
      </Card>
      <Modal
        open={open}
        title={editing ? t('actions.edit') : t('actions.create')}
        onCancel={() => setOpen(false)}
        onOk={() => { void save() }}
        okText={t('common.save')}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<NamespaceFormValues>
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
        >
          <Form.Item name="bizCode" label={t('fields.bizCode')} rules={[{ required: true }]}>
            <BizSelect disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="namespaceCode" label={t('fields.namespaceCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} placeholder={t('placeholders.namespaceCode')} />
          </Form.Item>
          <Form.Item name="namespace" label={t('common.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input />
          </Form.Item>
          <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        open={bindingNamespace !== null}
        title={t('bindings.title', { bizCode: bindingNamespace?.bizCode ?? '', namespaceCode: bindingNamespace?.namespaceCode ?? '' })}
        size={screens.md ? 860 : '100%'}
        onClose={closeBindings}
        extra={(
          <Button
            type="primary"
            loading={bindingSaving}
            onClick={() => { void saveBindings() }}
          >
            {t('actions.saveBindings')}
          </Button>
        )}
      >
        <Table<DdcEnv>
          rowKey={(row) => row.envCode}
          loading={bindingLoading}
          dataSource={bindingEnvs}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: t('fields.env'),
              dataIndex: 'envCode',
              key: 'envCode',
              width: 160,
              render: (value: string) => (
                <Typography.Text code>{value}</Typography.Text>
              ),
            },
            {
              title: t('fields.visibleApps'),
              key: 'apps',
              width: 520,
              render: (_: unknown, env: DdcEnv) => (
                <Select
                  mode="multiple"
                  showSearch
                  maxTagCount="responsive"
                  optionFilterProp="label"
                  value={bindingDraft[env.envCode] ?? []}
                  options={bindingApps.map((app) => ({
                    value: app.appCode,
                    label: t('bindings.appLabel', { code: app.appCode, name: app.appName }),
                  }))}
                  onChange={(values) => setBindingDraft((current) => ({
                    ...current,
                    [env.envCode]: values,
                  }))}
                  style={{ width: '100%' }}
                />
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  )
}
