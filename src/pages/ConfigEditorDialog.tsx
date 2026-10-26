import {useDdcWritable} from '../permissions/FieldCatalog'
import {useDdcPermission} from '../permissions/access'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { App, Form, Grid, Input, Modal, Space, Tag, Typography } from 'antd'
import { ddcApi } from '../api/client'
import { formatAdminError } from '../i18n/errors'
import { usePageMessages, type AdminTranslate } from '../i18n/AdminI18nProvider'
import type { DdcConfig, DdcNamespaceEnvAppBinding } from '../api/types'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { scopeOptionQueryKey } from '../components/scope/useScopeOptions'

export type ConfigScope = ScopeValue

type Props = {
  open: boolean
  config: DdcConfig | null
  defaultScope: ConfigScope
  onClose: () => void
  onSaved: () => void
}

type FormValues = {
  content: string
  description?: string
  changeReason?: string
}

const ensureBinding = async (scope: ConfigScope, t: AdminTranslate) => {
  const params = new URLSearchParams({
    bizCode: scope.bizCode,
    namespaceCode: scope.namespaceCode,
    env: scope.env,
    appCode: scope.appCode,
  })
  const bindings = await ddcApi<DdcNamespaceEnvAppBinding[]>(
    `/api/v1/tianshu/namespace-env-app-bindings?${params.toString()}`,
  )
  if (!bindings.some((binding) => binding.enabled)) {
    throw new Error(t('validation.bindingRequired'))
  }
}

export default function ConfigEditorDialog({ open, config, defaultScope, onClose, onSaved }: Props) {
  const { t } = usePageMessages('tianshu.configs')
  const createWritable = useDdcWritable('DdcConfigCreateRequest')
  const updateWritable = useDdcWritable('DdcConfigUpdateRequest')
  const mayMutate = useDdcPermission('tianshu.button.ConfigEditorDialog.write') && (config?.id ? updateWritable : createWritable)
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<ConfigScope>(defaultScope)
  const [saving, setSaving] = useState(false)
  const editing = Boolean(config?.id)

  useEffect(() => {
    if (!open) return
    const scope = editing && config
      ? {
          bizCode: config.bizCode,
          namespaceCode: config.visibleNamespaces[0] ?? '',
          env: config.env,
          appCode: config.appCode,
        }
      : defaultScope
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setScope(scope)
      form.setFieldsValue({
        content: config?.content ?? '',
        description: config?.description ?? '',
        changeReason: '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, config, defaultScope, editing, form])

  const save = async () => {
    if (!mayMutate) return
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return // antd 表单校验失败已就地展示
    }
    if (scope.bizCode.trim() === '' || scope.namespaceCode.trim() === '' || scope.env.trim() === '' || scope.appCode.trim() === '') {
      message.warning(t('validation.scopeRequired'))
      return
    }
    setSaving(true)
    try {
      if (editing && config) {
        await ddcApi(`/api/v1/tianshu/configs/${encodeURIComponent(config.id)}`, {
          method: 'PUT',
          body: {
            content: values.content,
            changeReason: values.changeReason || 'Tianshu Admin Web update',
            currentVersion: config.currentVersion,
          },
        })
      } else {
        await ensureBinding(scope, t)
        await ddcApi('/api/v1/tianshu/configs', {
          method: 'POST',
          body: {
            ...scope,
            resourceName: 'application.yml',
            content: values.content,
            format: 'YAML',
            description: values.description,
          },
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['tianshu', 'configs'] })
      await queryClient.invalidateQueries({ queryKey: scopeOptionQueryKey })
      message.success(t('feedback.saved'))
      onSaved()
    } catch (error) {
      message.error(formatAdminError(error, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? t('actions.edit') : t('actions.create')}
      onCancel={onClose}
      onOk={() => void save()}
      okButtonProps={{disabled: !mayMutate}}
      okText={t('common.save')}
      confirmLoading={saving}
      destroyOnHidden
      width={screens.md ? 860 : 'calc(100vw - 24px)'}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 180px)',
          overflowX: 'hidden',
          overflowY: 'auto',
        },
      }}
    >
      <Form<FormValues> disabled={!mayMutate} form={form} layout="vertical">
        <Form.Item label={t('fields.editorScope')} required shouldUpdate>
          {() => (
            <ScopeSelects
              value={scope}
              onChange={setScope}
              disabled={editing}
            />
          )}
        </Form.Item>
        <Space style={{ marginBottom: 12 }}>
          <Typography.Text code>application.yml</Typography.Text>
          <Tag color="blue">YAML</Tag>
        </Space>
        <Form.Item
          name="content"
          label={t('fields.content')}
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea
            rows={16}
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
        {!editing && (
          <Form.Item name="description" label={t('common.description')}>
            <Input />
          </Form.Item>
        )}
        {editing && (
          <Form.Item name="changeReason" label={t('fields.changeReason')}>
            <Input placeholder={t('placeholders.changeReason')} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
