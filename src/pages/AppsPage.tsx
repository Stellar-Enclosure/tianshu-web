import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
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
  Form,
  Input,
  Modal,
  Popconfirm,
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
import type { DdcApp } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import BizSelect from '../components/scope/BizSelect'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { scopeOptionQueryKey } from '../components/scope/useScopeOptions'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

type AppFilter = ScopeValue & { keyword: string }

const emptyFilter: AppFilter = {
  bizCode: '',
  namespaceCode: '',
  env: '',
  appCode: '',
  keyword: '',
}

type AppFormValues = {
  bizCode: string
  appCode: string
  appName: string
  owner?: string
  description?: string
  enabled: boolean
}

export default function AppsPage() {
  const { t, locale } = usePageMessages('tianshu.apps')
  const fieldsWritable = useDdcWritable('DdcAppBO')
  const mayMutate = useDdcPermission('tianshu.button.AppsPage.write') && fieldsWritable
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState<AppFilter>({ ...emptyFilter })
  const [submitted, setSubmitted] = useState<AppFilter>({ ...emptyFilter })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DdcApp | null>(null)
  const [form] = Form.useForm<AppFormValues>()

  const queryString = buildQuery({
    bizCode: submitted.bizCode,
    namespaceCode: submitted.namespaceCode,
    env: submitted.env,
    keyword: submitted.keyword,
    pageNo: pageState.page.pageNo,
    pageSize: pageState.page.pageSize,
  })
  const query = useQuery({
    queryKey: ['tianshu', 'apps', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcApp>(
      `/api/v1/tianshu/apps/page?${queryString}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tianshu', 'apps'] })
    await queryClient.invalidateQueries({ queryKey: scopeOptionQueryKey })
  }

  const saveMutation = useMutation({
    mutationFn: ({ item, values }: {
      item: DdcApp | null
      values: AppFormValues
    }) => item
      ? ddcApi(`/api/v1/tianshu/apps/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: values,
      })
      : ddcApi('/api/v1/tianshu/apps', { method: 'POST', body: values }),
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
    mutationFn: ({ item, enabled }: { item: DdcApp; enabled: boolean }) =>
      ddcApi(
        `/api/v1/tianshu/apps/${encodeURIComponent(item.id)}/enabled?enabled=${enabled}`,
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
    mutationFn: (item: DdcApp) => ddcApi(
      `/api/v1/tianshu/apps/${encodeURIComponent(item.id)}`,
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
      ...draft,
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

  const openEdit = (app: DdcApp) => {
    setEditing(app)
    form.setFieldsValue({
      bizCode: app.bizCode,
      appCode: app.appCode,
      appName: app.appName,
      owner: app.owner ?? '',
      description: app.description ?? '',
      enabled: app.enabled,
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

  const columns = [
    {
      title: t('fields.bizCode'),
      dataIndex: 'bizCode',
      key: 'bizCode',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: t('fields.appCode'),
      dataIndex: 'appCode',
      key: 'appCode',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: t('fields.appName'), dataIndex: 'appName', key: 'appName' },
    { title: t('fields.owner'), dataIndex: 'owner', key: 'owner' },
    {
      title: t('common.enabled'),
      key: 'enabled',
      render: (_: unknown, row: DdcApp) => (
        <Switch
          checked={row.enabled}
          disabled={!mayMutate || toggleMutation.isPending
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
      render: (_: unknown, row: DdcApp) => (
        <Space wrap={false}>
          <PermissionButton resourceKey="tianshu.button.AppsPage.write" size="small" onClick={() => openEdit(row)}>{t('common.edit')}</PermissionButton>
          <Popconfirm disabled={!mayMutate}
            title={t('confirm.delete', { code: row.appCode })}
            onConfirm={() => removeMutation.mutateAsync(row)}
          >
            <PermissionButton resourceKey="tianshu.button.AppsPage.write" size="small" danger>{t('common.delete')}</PermissionButton>
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
        extra={<PermissionButton resourceKey="tianshu.button.AppsPage.write" type="primary" onClick={openCreate}>{t('actions.create')}</PermissionButton>}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <ScopeSelects
            value={draft}
            includeApp={false}
            onChange={(scope) => setDraft({ ...draft, ...scope })}
          />
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
          <Table<DdcApp>
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
        onOk={() => { if (mayMutate) void save() }}
        okButtonProps={{disabled: !mayMutate}}
        okText={t('common.save')}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<AppFormValues> disabled={!mayMutate}
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
        >
          <Form.Item name="bizCode" label={t('fields.bizCode')} rules={[{ required: true }]}>
            <BizSelect disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="appCode" label={t('fields.appCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="appName" label={t('fields.appName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="owner" label={t('fields.owner')}>
            <Input placeholder={t('placeholders.owner')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input />
          </Form.Item>
          <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
