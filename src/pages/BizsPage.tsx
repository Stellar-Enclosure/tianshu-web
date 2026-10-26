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
import type { DdcBiz } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { scopeOptionQueryKey } from '../components/scope/useScopeOptions'
import { usePageState } from '../hooks/usePageState'
import { buildQuery, formatTime } from '../lib/query'

type BizFormValues = {
  bizCode: string
  bizName: string
  description?: string
  enabled: boolean
}

export default function BizsPage() {
  const { t, locale } = usePageMessages('tianshu.bizs')
  const fieldsWritable = useDdcWritable('DdcBizBO')
  const mayMutate = useDdcPermission('tianshu.button.BizsPage.write') && fieldsWritable
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const pageState = usePageState()
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DdcBiz | null>(null)
  const [form] = Form.useForm<BizFormValues>()

  const queryString = buildQuery({
    keyword,
    pageNo: pageState.page.pageNo,
    pageSize: pageState.page.pageSize,
  })
  const query = useQuery({
    queryKey: ['tianshu', 'bizs', keyword, pageState.page],
    queryFn: ({ signal }) => ddcPageApi<DdcBiz>(
      `/api/v1/tianshu/bizs/page?${queryString}`,
      { signal },
    ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tianshu', 'bizs'] })
    await queryClient.invalidateQueries({ queryKey: scopeOptionQueryKey })
  }

  const saveMutation = useMutation({
    mutationFn: ({ item, values }: {
      item: DdcBiz | null
      values: BizFormValues
    }) => item
      ? ddcApi(`/api/v1/tianshu/bizs/${encodeURIComponent(item.bizCode)}`, {
        method: 'PUT',
        body: values,
      })
      : ddcApi('/api/v1/tianshu/bizs', { method: 'POST', body: values }),
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
    mutationFn: ({ item, enabled }: { item: DdcBiz; enabled: boolean }) =>
      ddcApi(
        `/api/v1/tianshu/bizs/${encodeURIComponent(item.bizCode)}/enabled?enabled=${enabled}`,
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
    mutationFn: (item: DdcBiz) => ddcApi(
      `/api/v1/tianshu/bizs/${encodeURIComponent(item.bizCode)}`,
      { method: 'DELETE' },
    ),
    onSuccess: async () => {
      const moveBack = (query.data?.records.length ?? 0) === 1
        && pageState.page.pageNo > 1
      if (moveBack) {
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

  const openEdit = (biz: DdcBiz) => {
    setEditing(biz)
    form.setFieldsValue({
      bizCode: biz.bizCode,
      bizName: biz.bizName,
      description: biz.description ?? '',
      enabled: biz.enabled,
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
    { title: t('common.name'), dataIndex: 'bizName', key: 'bizName' },
    { title: t('common.description'), dataIndex: 'description', key: 'description' },
    {
      title: t('common.enabled'),
      key: 'enabled',
      render: (_: unknown, row: DdcBiz) => (
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
      render: (_: unknown, row: DdcBiz) => (
        <Space wrap={false}>
          <PermissionButton resourceKey="tianshu.button.BizsPage.write" size="small" onClick={() => openEdit(row)}>{t('common.edit')}</PermissionButton>
          <Popconfirm disabled={!mayMutate}
            title={t('confirm.delete', { code: row.bizCode })}
            onConfirm={() => removeMutation.mutateAsync(row)}
          >
            <PermissionButton resourceKey="tianshu.button.BizsPage.write" size="small" danger loading={removeMutation.isPending
              && removeMutation.variables?.id === row.id}>{t('common.delete')}</PermissionButton>
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
        extra={<PermissionButton resourceKey="tianshu.button.BizsPage.write" type="primary" onClick={openCreate}>{t('actions.create')}</PermissionButton>}
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
          <Table<DdcBiz>
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
        <Form<BizFormValues> disabled={!mayMutate}
          form={form}
          layout="vertical"
          initialValues={{ enabled: true }}
        >
          <Form.Item
            name="bizCode"
            label={t('fields.bizCode')}
            rules={[{ required: true }]}
          >
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="bizName" label={t('common.name')} rules={[{ required: true }]}>
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
    </div>
  )
}
