import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input, InputNumber, List, Modal, Select, Tag } from 'antd'
import { useState } from 'react'
import { DdcApiError } from '../api/client'
import {
  changeSiLifecycle,
  deleteSiResource,
  listSiVersionReferences,
  promoteSiVersion,
  rollbackSiResource,
} from '../api/si'
import type { SiReferenceItem } from '../api/types'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'

export const siLifecycleDialogMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.dialog.promoteTitle', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '跨环境推广版本', 'en-US': 'Promote version across environments' } },
])

export type SiLifecycleMode = 'PROMOTE' | 'ROLLBACK' | 'DEPRECATE' | 'ARCHIVE'

type Props = {
  open: boolean
  mode: SiLifecycleMode
  resourceId: number
  expectedVersion: number
  currentVersionNo?: number
  onClose: () => void
  onCompleted: () => void
}

export default function SiLifecycleDialog({
  open,
  mode,
  resourceId,
  expectedVersion,
  currentVersionNo,
  onClose,
  onCompleted,
}: Props) {
  const { t } = usePageMessages('tianshu.si')
  const [targetEnvCode, setTargetEnvCode] = useState('prod')
  const [targetVersionNo, setTargetVersionNo] = useState<number>(currentVersionNo ?? 1)
  const [changeNote, setChangeNote] = useState('')
  const [blockers, setBlockers] = useState<SiReferenceItem[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorText(null)
      setBlockers([])
      if (mode === 'PROMOTE') {
        return promoteSiVersion(resourceId, { targetEnvCode, changeNote })
      }
      if (mode === 'ROLLBACK') {
        return rollbackSiResource(resourceId, { expectedVersion, targetVersionNo, changeNote })
      }
      if (mode === 'DEPRECATE') {
        return changeSiLifecycle(resourceId, { expectedVersion, action: 'DEPRECATE', changeNote })
      }
      return deleteSiResource(resourceId, expectedVersion)
    },
    onSuccess: () => {
      onCompleted()
      onClose()
    },
    onError: async (error) => {
      setErrorText(formatAdminError(error, t))
      if (mode === 'ARCHIVE' && error instanceof DdcApiError && error.status === 409) {
        try {
          const inbound = await listSiVersionReferences(resourceId, currentVersionNo ?? 1, 'INBOUND')
          setBlockers(inbound)
        } catch {
          setBlockers([])
        }
      }
    },
  })

  const modalTitle =
    mode === 'PROMOTE'
      ? t('si.dialog.promoteTitle')
      : mode === 'ROLLBACK'
        ? t('si.dialog.rollbackTitle')
        : mode === 'DEPRECATE'
          ? t('si.dialog.deprecateTitle')
          : t('si.dialog.archiveTitle')

  return (
    <Modal
      open={open}
      title={modalTitle}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          danger={mode === 'ARCHIVE' || mode === 'DEPRECATE'}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid="si-lifecycle-confirm-btn"
        >
          {t('si.dialog.confirmBtn')}
        </Button>,
      ]}
    >
      {errorText && <Alert type="error" title={errorText} style={{ marginBottom: 12 }} />}
      {blockers.length > 0 && (
        <div data-testid="si-blocking-references-list" style={{ marginBottom: 12 }}>
          <Alert type="warning" title={t('si.dialog.blockingTitle')} />
          <List
            size="small"
            bordered
            dataSource={blockers}
            renderItem={(ref) => (
              <List.Item>
                <Tag color="red">{ref.sourceType}</Tag> <span>{ref.sourceKey}</span>
              </List.Item>
            )}
          />
        </div>
      )}
      <Form layout="vertical">
        {mode === 'PROMOTE' && (
          <Form.Item label={t('si.dialog.targetEnvLabel')}>
            <Select
              value={targetEnvCode}
              onChange={setTargetEnvCode}
              options={[
                { value: 'test', label: 'test' },
                { value: 'staging', label: 'staging' },
                { value: 'prod', label: 'prod' },
              ]}
            />
          </Form.Item>
        )}
        {mode === 'ROLLBACK' && (
          <Form.Item label={t('si.dialog.targetVersionLabel')}>
            <InputNumber
              min={1}
              value={targetVersionNo}
              onChange={(val) => setTargetVersionNo(val ?? 1)}
              style={{ width: '100%' }}
            />
          </Form.Item>
        )}
        <Form.Item label={t('si.dialog.changeNoteLabel')}>
          <Input.TextArea rows={2} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
