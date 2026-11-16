import { PermissionButton } from '../permissions/access'
import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ddcSiQueryKeys, getSiEnvMatrix } from '../api/si'
import type { SiEnvMatrixItem, SiResourceKind } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'
import SiLifecycleDialog, { type SiLifecycleMode } from './SiLifecycleDialog'

export const siEnvMatrixMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.matrix.title', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '多环境版本基线矩阵', 'en-US': 'Multi-Env Baseline Matrix' } },
])

export default function SiEnvMatrixPage() {
  const { t } = usePageMessages('tianshu.si')
  const [params] = useSearchParams()
  const bizCode = params.get('bizCode') ?? 'ai'
  const namespaceCode = params.get('namespaceCode') ?? 'core'
  const kind = (params.get('kind') ?? 'AGENT') as SiResourceKind
  const resourceKey = params.get('resourceKey') ?? ''

  const [dialogState, setDialogState] = useState<{
    open: boolean
    mode: SiLifecycleMode
    item?: SiEnvMatrixItem
  }>({ open: false, mode: 'PROMOTE' })

  const matrixQuery = useQuery({
    queryKey: ddcSiQueryKeys.matrix({ bizCode, namespaceCode, kind, resourceKey }),
    enabled: resourceKey.trim() !== '',
    queryFn: ({ signal }) => getSiEnvMatrix({ bizCode, namespaceCode, kind, resourceKey }, { signal }),
  })

  const columns: TableColumnsType<SiEnvMatrixItem> = [
    { title: t('si.matrix.envCol'), dataIndex: 'envCode', key: 'envCode', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: t('si.matrix.versionCol'),
      dataIndex: 'activeVersionNo',
      key: 'activeVersionNo',
      render: (v: number) => `v${v}`,
    },
    {
      title: t('si.matrix.digestCol'),
      dataIndex: 'digestSha256',
      key: 'digestSha256',
      render: (v: string) => <code>{v?.slice(0, 12)}</code>,
    },
    {
      title: t('si.matrix.sourceCol'),
      key: 'source',
      render: (_: unknown, row: SiEnvMatrixItem) =>
        row.sourceEnvCode ? `${row.sourceEnvCode}@v${row.sourceVersionNo ?? ''}` : '-',
    },
    { title: t('si.matrix.indexStatusCol'), dataIndex: 'indexStatus', key: 'indexStatus' },
    {
      title: t('si.matrix.publishedAtCol'),
      dataIndex: 'publishedTime',
      key: 'publishedTime',
      render: (val: string | null | undefined, row: SiEnvMatrixItem) => (
        <span data-testid={`si-matrix-time-${row.versionId}`} title={val ?? ''}>
          {formatTime(val ?? null)}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, row: SiEnvMatrixItem) => (
        <Space>
          <PermissionButton
            size="small"
            resourceKey="tianshu.button.SiEnvMatrixPage.promote"
            data-testid={`si-promote-btn-${row.versionId}`}
            onClick={() => setDialogState({ open: true, mode: 'PROMOTE', item: row })}
          >
            {t('si.matrix.promoteBtn')}
          </PermissionButton>
          <Button
            size="small"
            data-testid={`si-rollback-btn-${row.versionId}`}
            onClick={() => setDialogState({ open: true, mode: 'ROLLBACK', item: row })}
          >
            {t('si.matrix.rollbackBtn')}
          </Button>
          <PermissionButton
            size="small"
            danger
            resourceKey="tianshu.button.SiEnvMatrixPage.archive"
            data-testid={`si-archive-btn-${row.versionId}`}
            onClick={() => setDialogState({ open: true, mode: 'ARCHIVE', item: row })}
          >
            {t('si.matrix.archiveBtn')}
          </PermissionButton>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader title={t('si.matrix.title')} description={t('si.matrix.subtitle')} />
      {matrixQuery.isError && (
        <Alert type="error" title={formatAdminError(matrixQuery.error, t)} style={{ marginBottom: 12 }} />
      )}
      <Table
        rowKey="versionId"
        loading={matrixQuery.isLoading}
        dataSource={matrixQuery.data ?? []}
        columns={columns}
        pagination={false}
        locale={{ emptyText: t('common.empty') }}
      />
      {dialogState.item && (
        <SiLifecycleDialog
          open={dialogState.open}
          mode={dialogState.mode}
          resourceId={dialogState.item.resourceId}
          expectedVersion={dialogState.item.activeVersionNo}
          currentVersionNo={dialogState.item.activeVersionNo}
          onClose={() => setDialogState({ open: false, mode: 'PROMOTE' })}
          onCompleted={() => void matrixQuery.refetch()}
        />
      )}
    </div>
  )
}
