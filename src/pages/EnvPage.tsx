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
  InputNumber,
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
import type { DdcEnv } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { scopeOptionQueryKey } from '../components/scope/useScopeOptions'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

type EnvFormValues = {
  envCode: string
  description?: string
  sortOrder: number
  enabled: boolean
}

export default function EnvPage() {
  const { t, locale } = usePageMessages('tianshu.envs')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DdcEnv | null>(null)
  const [form] = Form.useForm<EnvFormValues>()

  const queryString = buildQuery({
    keyword,
    pageNo: pageState.page.pageNo,
    pageSize: pageState.page.pageSize,
  })
  const query = useQuery({
    queryKey: ['tianshu', 'envs', keyword, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcEnv>(
      `/api/v1/tianshu/envs/page?${queryString}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tianshu', 'envs'] })
    await queryClient.invalidateQueries({ queryKey: scopeOptionQueryKey })
  }

  const saveMutation = useMutation({
    mutationFn: ({ item, values }: {
      item: DdcEnv | null
      values: EnvFormValues
    }) => item
      ? ddcApi(`/api/v1/tianshu/envs/${encodeURIComponent(item.envCode)}`, {
        method: 'PUT',
        body: values,
      })
      : ddcApi('/api/v1/tianshu/envs', { method: 'POST', body: values }),
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
    mutationFn: ({ item, enabled }: { item: DdcEnv; enabled: boolean }) =>
      ddcApi(
        `/api/v1/tianshu/envs/${encodeURIComponent(item.envCode)}/enabled?enabled=${enabled}`,
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
    mutationFn: (item: DdcEnv) => ddcApi(
      `/api/v1/tianshu/envs/${encodeURIComponent(item.envCode)}`,
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
    setKeyword(draft.trim())
    pageState.resetPage()
  }

  const resetFilter = () => {
    setDraft('')
    setKeyword('')
    pageState.resetPage()
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (env: DdcEnv) => {
    setEditing(env)
    form.setFieldsValue({
      envCode: env.envCode,
      description: env.description ?? '',
      sortOrder: env.sortOrder,
      enabled: env.enabled,
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
      title: t('fields.envCode'),
      dataIndex: 'envCode',
      key: 'envCode',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: t('common.description'), dataIndex: 'description', key: 'description' },
    { title: t('fields.sortOrder'), dataIndex: 'sortOrder', key: 'sortOrder' },
    {
      title: t('common.enabled'),
      key: 'enabled',
      render: (_: unknown, row: DdcEnv) => (
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
      render: (_: unknown, row: DdcEnv) => (
        <Space wrap={false}>
          <Button size="small" onClick={() => openEdit(row)}>{t('common.edit')}</Button>
          <Popconfirm
            title={t('confirm.delete', { code: row.envCode })}
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
        extra={<Button type="primary" onClick={openCreate}>{t('actions.create')}</Button>}
      />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder={t('filters.keyword')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
          <Table<DdcEnv>
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
        <Form<EnvFormValues>
          form={form}
          layout="vertical"
          initialValues={{ enabled: true, sortOrder: 0 }}
        >
          <Form.Item name="envCode" label={t('fields.envCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input />
          </Form.Item>
          <Form.Item name="sortOrder" label={t('fields.sortOrder')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
