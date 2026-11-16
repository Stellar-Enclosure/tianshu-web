import { PermissionButton } from '../permissions/access'
import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useMutation } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, InputNumber, Space } from 'antd'
import { useState } from 'react'
import { unbindSiServiceBinding, upsertSiServiceBinding } from '../api/si'
import type { SiResourceItem } from '../api/types'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'

export const siServiceBindingMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.binding.title', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '应用服务版本绑定', 'en-US': 'Application service binding' } },
])

type Props = {
  resource: SiResourceItem
  onUpdated?: () => void
}

export default function SiServiceBindingPanel({ resource, onUpdated }: Props) {
  const { t } = usePageMessages('tianshu.si')
  const { message } = App.useApp()
  const [appCode, setAppCode] = useState(resource.appCode)
  const [pinnedVersionNo, setPinnedVersionNo] = useState<number | null>(resource.currentVersionNo ?? null)

  const bindMutation = useMutation({
    mutationFn: () =>
      upsertSiServiceBinding(resource.id, {
        bizCode: resource.bizCode,
        namespaceCode: resource.namespaceCode ?? 'core',
        envCode: resource.envCode,
        appCode,
        kind: resource.kind,
        resourceKey: resource.resourceKey,
        pinnedVersionNo,
      }),
    onSuccess: () => {
      message.success(t('si.binding.savedNotice'))
      onUpdated?.()
    },
    onError: (err) => {
      message.error(formatAdminError(err, t))
    },
  })

  const unbindMutation = useMutation({
    mutationFn: () =>
      unbindSiServiceBinding(resource.id, {
        bizCode: resource.bizCode,
        namespaceCode: resource.namespaceCode ?? 'core',
        envCode: resource.envCode,
        appCode,
        kind: resource.kind,
        resourceKey: resource.resourceKey,
      }),
    onSuccess: () => {
      message.success(t('si.binding.unboundNotice'))
      onUpdated?.()
    },
    onError: (err) => {
      message.error(formatAdminError(err, t))
    },
  })

  return (
    <Card size="small" title={t('si.binding.title')}>
      <Form layout="vertical">
        <Form.Item label={t('si.binding.appCodeLabel')}>
          <Input
            data-testid="si-binding-appcode-input"
            value={appCode}
            onChange={(event) => setAppCode(event.target.value)}
          />
        </Form.Item>
        <Form.Item label={t('si.binding.pinnedVersionLabel')}>
          <InputNumber
            data-testid="si-binding-version-input"
            min={1}
            value={pinnedVersionNo}
            onChange={(val) => setPinnedVersionNo(val)}
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Space>
          <PermissionButton
            resourceKey="tianshu.button.SiServiceBindingPanel.binding"
            type="primary"
            loading={bindMutation.isPending}
            onClick={() => bindMutation.mutate()}
            data-testid="si-binding-save-btn"
          >
            {t('si.binding.saveBtn')}
          </PermissionButton>
          <Button
            danger
            loading={unbindMutation.isPending}
            onClick={() => unbindMutation.mutate()}
            data-testid="si-binding-unbind-btn"
          >
            {t('si.binding.unbindBtn')}
          </Button>
        </Space>
      </Form>
    </Card>
  )
}
