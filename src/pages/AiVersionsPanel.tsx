import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Descriptions, Input, Modal, Space, Spin, Table, Tag, Tree, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { FileTextOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DdcApiError } from '../api/client'
import {
  ddcAiQueryKeys,
  getAiResource,
  getAiVersion,
  pageAiPublications,
  pageAiVersions,
  publishAiDraft,
  rollbackAiPublication,
} from '../api/ai'
import type {
  DdcAiContent,
  DdcAiNode,
  DdcAiPublicationResult,
  DdcAiPublishCommand,
  DdcAiResourceResult,
  DdcAiResourceSummary,
  DdcAiRollbackCommand,
  DdcAiVersionResult,
  DdcAiVersionSummary,
} from '../api/types'
import { usePageMessages, type AdminTranslate } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'
import { uuidV7 } from '../lib/uuid'
import AiPromotionDialog from './AiPromotionDialog'

type Props = {
  resource: DdcAiResourceSummary
  draftDirty: boolean
  resourceUnavailable?: boolean
  onResourceChanged: (resource: DdcAiResourceResult) => void
  onPendingOperationChange?: (pending: boolean) => void
}

type PendingPublicationRequest =
  | Readonly<{ operation: 'PUBLISH'; requestId: string; command: Readonly<DdcAiPublishCommand> }>
  | Readonly<{ operation: 'ROLLBACK'; requestId: string; command: Readonly<DdcAiRollbackCommand> }>

const VERSION_PAGE_SIZE = 20
const PUBLICATION_PAGE_SIZE = 20

const isUnknownCommit = (error: unknown): boolean =>
  error instanceof DdcApiError && (error.status === 0 || error.status === 503)

const isForbidden = (error: unknown): boolean =>
  error instanceof DdcApiError && error.status === 403

const treeData = (nodes: DdcAiNode[], t: AdminTranslate): DataNode[] => {
  const root: DataNode = {
    key: '',
    title: <span><FolderOpenOutlined aria-hidden="true" /> {t('editor.skillRoot')}</span>,
    isLeaf: false,
    children: [],
  }
  const entries = new Map<string, DataNode>()
  for (const node of nodes) {
    if (node.path === '') continue
    entries.set(node.path, {
      key: node.path,
      title: (
        <span>
          {node.nodeType === 'DIRECTORY'
            ? <FolderOutlined aria-hidden="true" />
            : <FileTextOutlined aria-hidden="true" />}
          {' '}{t('editor.treeNode', { name: node.path.slice(node.path.lastIndexOf('/') + 1), type: node.nodeType === 'DIRECTORY' ? t('editor.directory') : t('editor.file') })}
        </span>
      ),
      isLeaf: node.nodeType === 'FILE',
      children: node.nodeType === 'DIRECTORY' ? [] : undefined,
    })
  }
  for (const node of nodes.filter((item) => item.path !== '').slice().sort((a, b) => a.path.localeCompare(b.path))) {
    const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
    const parent = parentPath ? entries.get(parentPath) : root
    const current = entries.get(node.path)
    if (parent && current && Array.isArray(parent.children)) parent.children.push(current)
  }
  return [root]
}

const sameContent = (left: DdcAiContent, right: DdcAiContent): boolean => {
  const normalize = (content: DdcAiContent) => JSON.stringify({
    promptText: content.promptText,
    nodes: content.nodes.slice().sort((a, b) => a.path.localeCompare(b.path)),
  })
  return normalize(left) === normalize(right)
}

const versionPageSummary = (version: DdcAiVersionSummary, t: AdminTranslate): string =>
  t('versions.pageSummary', { version: version.versionNo, name: version.displayName })

export default function AiVersionsPanel({
  resource,
  draftDirty,
  resourceUnavailable = false,
  onResourceChanged,
  onPendingOperationChange = () => {},
}: Props) {
  const { t, locale } = usePageMessages('tianshu.ai.editor')
  const publishWritable = useDdcWritable('DdcAiPublishCommand')
  const rollbackWritable = useDdcWritable('DdcAiRollbackCommand')
  const mayMutate = useDdcPermission('tianshu.button.AiVersionsPanel.ai_publish')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [versionPageNo, setVersionPageNo] = useState(1)
  const [publicationPageNo, setPublicationPageNo] = useState(1)
  const [changeNote, setChangeNote] = useState('')
  const [requestIdInput, setRequestIdInput] = useState('')
  const [appliedRequestId, setAppliedRequestId] = useState<string>()
  const [actionFailure, setActionFailure] = useState<{ key?: string; error?: unknown }>()
  const [pendingRequest, setPendingRequest] = useState<PendingPublicationRequest | null>(null)
  const [confirmedAction, setConfirmedAction] = useState<PendingPublicationRequest | null>(null)
  const [verifyingRequest, setVerifyingRequest] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<DdcAiPublicationResult | null>(null)
  const [promotionSource, setPromotionSource] = useState<DdcAiVersionSummary | null>(null)

  const versionParams = useMemo(() => ({ pageNo: versionPageNo, pageSize: VERSION_PAGE_SIZE }), [versionPageNo])
  const publicationParams = useMemo(() => ({
    requestId: appliedRequestId,
    pageNo: publicationPageNo,
    pageSize: PUBLICATION_PAGE_SIZE,
  }), [appliedRequestId, publicationPageNo])
  const selectedVersionNo = searchParams.get('versionNo')

  const versionsQuery = useQuery({
    queryKey: ddcAiQueryKeys.versions(resource.id, versionParams),
    queryFn: ({ signal }) => pageAiVersions(resource.id, versionParams, { signal }),
  })
  const selectedVersionQuery = useQuery({
    queryKey: ddcAiQueryKeys.version(resource.id, selectedVersionNo ?? ''),
    queryFn: ({ signal }) => getAiVersion(resource.id, selectedVersionNo!, { signal }),
    enabled: selectedVersionNo !== null,
  })
  const publicationsQuery = useQuery({
    queryKey: ddcAiQueryKeys.publications(resource.id, publicationParams),
    queryFn: ({ signal }) => pageAiPublications(resource.id, publicationParams, { signal }),
  })

  const refreshResource = async (): Promise<void> => {
    try {
      const latest = await getAiResource(resource.id)
      queryClient.setQueryData(ddcAiQueryKeys.resource(resource.id), latest)
      onResourceChanged(latest)
    } catch (error) {
      setActionFailure({ key: 'versions.refreshFailed', error })
    }
  }

  const publicationMutation = useMutation({
    mutationFn: (request: PendingPublicationRequest) => {
      return request.operation === 'PUBLISH'
        ? publishAiDraft(resource.id, request.requestId, request.command)
        : rollbackAiPublication(resource.id, request.requestId, request.command)
    },
    onSuccess: async (result) => {
      setPendingRequest(null)
      onPendingOperationChange(false)
      setLastReceipt(result)
      setActionFailure(undefined)
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
      await refreshResource()
      message.success(result.operation === 'PUBLISH'
        ? t('versions.published', { version: result.targetVersionNo })
        : t('versions.rolledBack', { version: result.targetVersionNo }))
    },
    onError: async (error: unknown) => {
      if (isUnknownCommit(error)) {
        onPendingOperationChange(true)
        setActionFailure({ key: 'versions.commitUnknown' })
        return
      }
      setPendingRequest(null)
      onPendingOperationChange(false)
      setActionFailure({ key: isForbidden(error) ? 'versions.operationDenied' : undefined, error })
      if (error instanceof DdcApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
        await refreshResource()
      }
    },
  })

  const changeVersionUrl = (versionNo: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (versionNo === null) next.delete('versionNo')
    else next.set('versionNo', versionNo)
    setSearchParams(next)
  }

  const selectedHistoryVersion = (version: DdcAiVersionSummary) => {
    changeVersionUrl(version.versionNo)
  }

  const submitRequest = async (request: PendingPublicationRequest): Promise<void> => {
    if (!mayMutate || !(request.operation === 'PUBLISH' ? publishWritable : rollbackWritable)) return
    setPendingRequest(request)
    onPendingOperationChange(true)
    setActionFailure(undefined)
    try {
      await publicationMutation.mutateAsync(request)
    } catch {
      // The mutation error handler retains an idempotency key only when the result is unknown.
    }
  }

  const confirmPublish = () => {
    if (draftDirty || resourceUnavailable || pendingRequest) return
    setConfirmedAction({
      operation: 'PUBLISH',
      requestId: uuidV7(),
      command: { expectedRevision: resource.revision, changeNote },
    })
  }

  const confirmRollback = (version: DdcAiVersionSummary) => {
    if (resourceUnavailable || pendingRequest) return
    setConfirmedAction({
      operation: 'ROLLBACK',
      requestId: uuidV7(),
      command: { expectedRevision: resource.revision, versionNo: version.versionNo, changeNote },
    })
  }

  const submitConfirmedAction = () => {
    const request = confirmedAction
    setConfirmedAction(null)
    if (request) void submitRequest(request)
  }

  const verifyPendingRequest = async () => {
    if (!pendingRequest) return
    setVerifyingRequest(true)
    setActionFailure(undefined)
    try {
      const receipts = await pageAiPublications(resource.id, {
        requestId: pendingRequest.requestId,
        pageNo: 1,
        pageSize: PUBLICATION_PAGE_SIZE,
      })
      const receipt = receipts.records.find((record) => record.operation === pendingRequest.operation)
      if (!receipt) {
        setActionFailure({ key: 'versions.receiptMissing' })
        return
      }
      setPendingRequest(null)
      onPendingOperationChange(false)
      setLastReceipt(receipt)
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
      await refreshResource()
    } catch (error) {
      setActionFailure({ key: 'versions.verifyFailed', error })
    } finally {
      setVerifyingRequest(false)
    }
  }

  const versionColumns: TableColumnsType<DdcAiVersionSummary> = [
    {
      title: t('versions.version'),
      dataIndex: 'versionNo',
      key: 'versionNo',
      render: (value: string, row) => (
        <Space>
          <Typography.Text code>{value}</Typography.Text>
          {value === resource.currentVersionNo && <Tag color="green">{t('versions.currentPublication')}</Tag>}
          {row.sourceVersionId && <Tag>{t('versions.sourceVersion')}</Tag>}
        </Space>
      ),
    },
    { title: t('common.name'), dataIndex: 'displayName', key: 'displayName' },
    { title: t('versions.changeNote'), dataIndex: 'changeNote', key: 'changeNote', render: (value: string) => value || '—' },
    { title: t('versions.contentHash'), dataIndex: 'contentSha256', key: 'contentSha256', render: (value: string) => <Typography.Text code>{value.slice(0, 12)}</Typography.Text> },
    { title: t('versions.nodeCount'), dataIndex: 'nodeCount', key: 'nodeCount' },
    { title: t('versions.createdByAndAt'), key: 'createdAt', render: (_: unknown, row) => `${row.createdBy} · ${formatTime(row.createdAt, locale)}` },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, row) => (
        <Space wrap>
          <Button type="link" onClick={() => selectedHistoryVersion(row)}>
            {t('versions.readVersion', { version: row.versionNo })}
          </Button>
          <PermissionButton resourceKey="tianshu.button.AiVersionsPanel.ai_publish"
            type="link"
            disabled={!rollbackWritable || resourceUnavailable || row.versionNo === resource.currentVersionNo || pendingRequest !== null}
            onClick={() => confirmRollback(row)}
          >
            {t('versions.rollbackTo', { version: row.versionNo })}
          </PermissionButton>
          <PermissionButton resourceKey="tianshu.button.AiVersionsPanel.ai_write" type="link" disabled={resourceUnavailable || pendingRequest !== null} onClick={() => setPromotionSource(row)}>
            {t('versions.promote')}
          </PermissionButton>
        </Space>
      ),
    },
  ]

  const publicationColumns: TableColumnsType<DdcAiPublicationResult> = [
    { title: t('common.actions'), dataIndex: 'operation', key: 'operation', render: (value: DdcAiPublicationResult['operation']) => <Tag>{t(`versions.operation.${value}`)}</Tag> },
    { title: t('versions.targetVersion'), dataIndex: 'targetVersionNo', key: 'targetVersionNo', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    { title: t('versions.previousVersionId'), dataIndex: 'previousVersionId', key: 'previousVersionId', render: (value: string | null) => value ?? '—' },
    { title: t('versions.sourceVersionId'), dataIndex: 'sourceVersionId', key: 'sourceVersionId', render: (value: string | null) => value ?? t('versions.localPublication') },
    { title: t('versions.occurredAt'), dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => formatTime(value, locale) },
  ]

  const historicalContent = selectedVersionQuery.data?.content
  const historicalNodes = historicalContent?.nodes ?? []
  const readOnlyTree = useMemo(() => treeData(historicalNodes, t), [historicalNodes, t])
  const [selectedHistoryPath, setSelectedHistoryPath] = useState('')
  const selectedHistoryNode = historicalNodes.find((node) => node.path === selectedHistoryPath)

  return (
    <Space orientation="vertical" size="large" className="tianshu-ai-page">
      {actionFailure && <Alert type="error" showIcon title={t('versions.operationIncomplete')}
        description={actionFailure.key
          ? t(actionFailure.key, { error: formatAdminError(actionFailure.error, t) })
          : formatAdminError(actionFailure.error, t)} />}
      {resourceUnavailable && (
        <Alert type="warning" showIcon title={t('versions.resourceUnavailable')} />
      )}
      {lastReceipt && (
        <Alert
          type="success"
          showIcon
          title={t('versions.submitted', { operation: t(`versions.operation.${lastReceipt.operation}`), version: lastReceipt.targetVersionNo })}
          description={(
            <Space wrap>
              <Typography.Text>
                {t('versions.receiptDetails', {
                  receipt: lastReceipt.id,
                  resource: lastReceipt.resourceId,
                  revision: lastReceipt.resourceRevision,
                  sourceVersion: lastReceipt.sourceVersionId ?? t('versions.localPublication'),
                })}
              </Typography.Text>
              {lastReceipt.operation === 'PROMOTE' && (
                <Tag>{lastReceipt.targetCreated ? t('versions.targetCreated') : t('versions.targetUpdated')}</Tag>
              )}
              <Button
                type="link"
                onClick={() => navigate(`/ai/resources/${encodeURIComponent(lastReceipt.resourceId)}?versionNo=${encodeURIComponent(lastReceipt.targetVersionNo)}`)}
              >
                {t('versions.viewTarget')}
              </Button>
            </Space>
          )}
        />
      )}
      {pendingRequest && (
        <Alert
          type="warning"
          showIcon
          title={t('versions.pendingRequestRetained')}
          description={(
            <Space wrap>
              <Typography.Text code>{pendingRequest.requestId}</Typography.Text>
              <Button loading={verifyingRequest} onClick={() => void verifyPendingRequest()}>{t('versions.verifyRequest')}</Button>
              <PermissionButton resourceKey="tianshu.button.AiVersionsPanel.ai_publish"
                type="primary"
                loading={publicationMutation.isPending}
                onClick={() => void submitRequest(pendingRequest)}
              >
                {t('versions.retryRequest')}
              </PermissionButton>
            </Space>
          )}
        />
      )}

      <Card
        title={t('versions.history')}
        extra={(
          <Space wrap>
            <Input
              aria-label={t('versions.versionNote')}
              placeholder={t('versions.versionNotePlaceholder')}
              maxLength={512}
              value={changeNote}
              disabled={!mayMutate || pendingRequest !== null}
              onChange={(event) => setChangeNote(event.target.value)}
            />
            <PermissionButton resourceKey="tianshu.button.AiVersionsPanel.ai_publish"
              type="primary"
              disabled={!publishWritable || draftDirty || resourceUnavailable || pendingRequest !== null}
              loading={publicationMutation.isPending}
              onClick={confirmPublish}
            >
              {t('versions.publishDraft')}
            </PermissionButton>
          </Space>
        )}
      >
        {draftDirty && <Alert type="info" showIcon title={t('versions.saveBeforePublishing')} />}
        {versionsQuery.isError && (
          <Alert type="error" showIcon title={t('versions.listFailed')} description={isForbidden(versionsQuery.error) ? t('versions.readDenied') : formatAdminError(versionsQuery.error, t)} />
        )}
        <Table<DdcAiVersionSummary>
          rowKey="versionNo"
          columns={versionColumns}
          dataSource={versionsQuery.data?.records ?? []}
          loading={versionsQuery.isPending || versionsQuery.isFetching}
          locale={{ emptyText: versionsQuery.isError ? t('versions.listFailed') : t('versions.noVersions') }}
          pagination={{
            current: versionPageNo,
            pageSize: VERSION_PAGE_SIZE,
            total: versionsQuery.data?.page.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => t('versions.totalVersions', { total }),
            onChange: setVersionPageNo,
          }}
        />
      </Card>

      {selectedVersionNo !== null && (
        <Card title={t('versions.snapshotTitle', { version: selectedVersionNo })} extra={(
          <Button onClick={() => changeVersionUrl(null)}>{t('versions.closeSnapshot')}</Button>
        )}>
          {selectedVersionQuery.isPending && <Spin description={t('versions.loadingSnapshot')} />}
          {selectedVersionQuery.isError && (
            <Alert type="error" showIcon title={t('versions.snapshotUnavailable')} description={formatAdminError(selectedVersionQuery.error, t)} />
          )}
          {selectedVersionQuery.data && (
            <>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label={t('versions.resourceId')}>{selectedVersionQuery.data.version.resourceId}</Descriptions.Item>
                <Descriptions.Item label={t('versions.fixedVersion')}>{selectedVersionQuery.data.version.versionNo}</Descriptions.Item>
                <Descriptions.Item label={t('versions.contentHash')}>{selectedVersionQuery.data.version.contentSha256}</Descriptions.Item>
                <Descriptions.Item label={t('versions.changeNote')}>{selectedVersionQuery.data.version.changeNote || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('versions.sourceVersionId')}>{selectedVersionQuery.data.version.sourceVersionId ?? '—'}</Descriptions.Item>
                <Descriptions.Item label={t('versions.createdByAndAt')}>
                  {`${selectedVersionQuery.data.version.createdBy} · ${formatTime(selectedVersionQuery.data.version.createdAt, locale)}`}
                </Descriptions.Item>
              </Descriptions>
              {resource.kind === 'PROMPT' ? (
                <Input.TextArea
                  aria-label={t('versions.historyPrompt', { version: selectedVersionNo })}
                  value={historicalContent?.promptText ?? ''}
                  rows={16}
                  disabled
                />
              ) : (
                <div className="tianshu-ai-skill-editor">
                  <Card title={t('versions.historySkillTree')} className="tianshu-ai-skill-editor__tree">
                    <Tree
                      aria-label={t('versions.historyTree', { version: selectedVersionNo })}
                      treeData={readOnlyTree}
                      selectedKeys={selectedHistoryPath ? [selectedHistoryPath] : []}
                      defaultExpandAll
                      onSelect={(keys) => setSelectedHistoryPath(String(keys[0] ?? ''))}
                    />
                  </Card>
                  <Card title={selectedHistoryNode?.path || t('versions.selectHistoryFile')} className="tianshu-ai-skill-editor__content">
                    {selectedHistoryNode?.nodeType === 'FILE' ? (
                      <Input.TextArea
                        aria-label={t('versions.historyFile', { path: selectedHistoryNode.path })}
                        value={selectedHistoryNode.content ?? ''}
                        rows={20}
                        disabled
                      />
                    ) : <Typography.Text type="secondary">{t('versions.readOnlyHint')}</Typography.Text>}
                  </Card>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <Card title={t('versions.audit')}>
        <Space wrap>
          <Input
            aria-label={t('versions.auditRequestId')}
            placeholder={t('versions.auditPlaceholder')}
            maxLength={64}
            value={requestIdInput}
            onChange={(event) => setRequestIdInput(event.target.value)}
          />
          <Button onClick={() => {
            setAppliedRequestId(requestIdInput.trim() || undefined)
            setPublicationPageNo(1)
          }}>
            {t('versions.searchAudit')}
          </Button>
        </Space>
        {publicationsQuery.isError && (
          <Alert type="error" showIcon title={t('versions.auditFailed')} description={formatAdminError(publicationsQuery.error, t)} />
        )}
        <Table<DdcAiPublicationResult>
          rowKey="id"
          columns={publicationColumns}
          dataSource={publicationsQuery.data?.records ?? []}
          loading={publicationsQuery.isPending || publicationsQuery.isFetching}
          locale={{ emptyText: publicationsQuery.isError ? t('versions.auditFailed') : t('versions.noPublications') }}
          pagination={{
            current: publicationPageNo,
            pageSize: PUBLICATION_PAGE_SIZE,
            total: publicationsQuery.data?.page.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => t('versions.totalPublications', { total }),
            onChange: setPublicationPageNo,
          }}
        />
      </Card>

      {promotionSource && (
        <AiPromotionDialog
          open
          sourceResource={resource}
          sourceVersion={promotionSource}
          onCancel={() => setPromotionSource(null)}
          onPendingChange={onPendingOperationChange}
          onPublished={(result) => {
            setPromotionSource(null)
            onPendingOperationChange(false)
            setLastReceipt(result)
            setActionFailure(undefined)
            void queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
          }}
        />
      )}

      <Modal
        title={confirmedAction?.operation === 'PUBLISH' ? t('versions.confirmPublishTitle')
          : confirmedAction ? t('versions.confirmRollbackTitle', { version: confirmedAction.command.versionNo }) : ''}
        open={confirmedAction !== null}
        onCancel={() => setConfirmedAction(null)}
        onOk={() => { if (mayMutate) submitConfirmedAction() }}
        okText={confirmedAction?.operation === 'PUBLISH' ? t('versions.confirmPublish') : t('versions.confirmRollback')}
        cancelText={t('common.cancel')}
      >
        {confirmedAction?.operation === 'PUBLISH'
          ? t('versions.publishWarning', { revision: confirmedAction.command.expectedRevision })
          : confirmedAction?.operation === 'ROLLBACK'
            ? t('versions.rollbackWarning', { revision: confirmedAction.command.expectedRevision })
            : null}
      </Modal>
    </Space>
  )
}
