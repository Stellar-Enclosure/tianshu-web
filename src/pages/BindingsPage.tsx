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
import type {
  DdcNamespaceEnvAppBinding,
  DdcNamespaceEnvAppBindingRequest,
} from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageState } from '../hooks/usePageState'
import { buildQuery } from '../lib/query'

type BindingFilter = {
  bizCode: string
  namespaceCode: string
  env: string
  appCode: string
}

const emptyFilter: BindingFilter = {
  bizCode: '',
  namespaceCode: '',
  env: '',
  appCode: '',
}

export default function BindingsPage() {
  const { t } = usePageMessages('tianshu.bindings')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState<BindingFilter>({ ...emptyFilter })
  const [submitted, setSubmitted] = useState<BindingFilter>({ ...emptyFilter })
  const [editing, setEditing] = useState<DdcNamespaceEnvAppBinding | null>(null)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<DdcNamespaceEnvAppBindingRequest>()

  const queryString = buildQuery({
    ...submitted,
    pageNo: pageState.page.pageNo,
    pageSize: pageState.page.pageSize,
  })
  const query = useQuery({
    queryKey: ['tianshu', 'bindings', submitted, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcNamespaceEnvAppBinding>(
      `/api/v1/tianshu/namespace-env-app-bindings/page?${queryString}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const queryKey = ['tianshu', 'bindings']
  const invalidate = async () => queryClient.invalidateQueries({ queryKey })

  const saveMutation = useMutation({
    mutationFn: ({ id, values }: {
      id?: string
      values: DdcNamespaceEnvAppBindingRequest
    }) => id
      ? ddcApi<DdcNamespaceEnvAppBinding>(
        `/api/v1/tianshu/namespace-env-app-bindings/${encodeURIComponent(id)}`,
        { method: 'PUT', body: values },
      )
      : ddcApi<DdcNamespaceEnvAppBinding>(
        '/api/v1/tianshu/namespace-env-app-bindings',
        { method: 'POST', body: values },
      ),
    onSuccess: async () => {
      setOpen(false)
      setEditing(null)
      await invalidate()
      message.success(t('feedback.saved'))
    },
    onError: (error) => message.error(
      formatAdminError(error, t),
    ),
  })

  const removeMutation = useMutation({
    mutationFn: (item: DdcNamespaceEnvAppBinding) => ddcApi<void>(
      `/api/v1/tianshu/namespace-env-app-bindings/${encodeURIComponent(item.id)}`,
      { method: 'DELETE' },
    ),
    onSuccess: async () => {
      if ((query.data?.records.length ?? 0) === 1 && pageState.page.pageNo > 1) {
        pageState.onTableChange(pageState.page.pageNo - 1, pageState.page.pageSize)
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
      namespaceCode: draft.namespaceCode.trim(),
      env: draft.env.trim(),
      appCode: draft.appCode.trim(),
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
    form.setFieldValue('enabled', true)
    setOpen(true)
  }

  const openEdit = (item: DdcNamespaceEnvAppBinding) => {
    setEditing(item)
    form.setFieldsValue({
      bizCode: item.bizCode,
      namespaceCode: item.namespaceCode,
      env: item.env,
      appCode: item.appCode,
      enabled: item.enabled,
    })
    setOpen(true)
  }

  const save = async () => {
    try {
      const values = await form.validateFields()
      saveMutation.mutate({ id: editing?.id, values })
    } catch {
      return
    }
  }

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
            aria-label={t('fields.bizCode')}
            placeholder={t('fields.bizCode')}
            value={draft.bizCode}
            onChange={(event) => setDraft({ ...draft, bizCode: event.target.value })}
          />
          <Input
            aria-label={t('fields.namespaceCode')}
            placeholder={t('fields.namespaceCode')}
            value={draft.namespaceCode}
            onChange={(event) => setDraft({ ...draft, namespaceCode: event.target.value })}
          />
          <Input
            aria-label={t('fields.env')}
            placeholder={t('fields.env')}
            value={draft.env}
            onChange={(event) => setDraft({ ...draft, env: event.target.value })}
          />
          <Input
            aria-label={t('fields.appCode')}
            placeholder={t('fields.appCode')}
            value={draft.appCode}
            onChange={(event) => setDraft({ ...draft, appCode: event.target.value })}
            onPressEnter={applyFilter}
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
          <Table<DdcNamespaceEnvAppBinding>
            rowKey={(row) => row.id}
            size="small"
            scroll={{ x: 'max-content' }}
            loading={query.isFetching}
            dataSource={query.data?.records ?? []}
            columns={[
              { title: t('fields.bizCode'), dataIndex: 'bizCode', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
              { title: t('fields.namespace'), dataIndex: 'namespaceCode', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
              { title: t('fields.env'), dataIndex: 'env' },
              { title: t('fields.app'), dataIndex: 'appCode', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
              { title: t('fields.appName'), dataIndex: 'appName' },
              { title: t('common.enabled'), dataIndex: 'enabled', render: (enabled: boolean) => <Switch checked={enabled} disabled /> },
              {
                title: t('common.actions'),
                fixed: 'right' as const,
                render: (_value: unknown, item: DdcNamespaceEnvAppBinding) => (
                  <Space>
                    <Button size="small" onClick={() => openEdit(item)}>{t('common.edit')}</Button>
                    <Popconfirm
                      title={t('confirm.delete', { namespaceCode: item.namespaceCode, env: item.env, appCode: item.appCode })}
                      onConfirm={() => removeMutation.mutate(item)}
                    >
                      <Button size="small" danger loading={removeMutation.isPending && removeMutation.variables?.id === item.id}>
                        {t('common.delete')}
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
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
        title={editing ? t('dialog.edit') : t('dialog.create')}
        onCancel={() => { setOpen(false); setEditing(null) }}
        onOk={() => { void save() }}
        okText={t('common.save')}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<DdcNamespaceEnvAppBindingRequest>
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
        >
          <Form.Item name="bizCode" label={t('fields.bizCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="namespaceCode" label={t('fields.namespaceCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="env" label={t('fields.env')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="appCode" label={t('fields.appCode')} rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
