import {useDdcWritable} from '../permissions/FieldCatalog'
import {useDdcPermission} from '../permissions/access'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'
import { DdcApiError } from '../api/client'
import {
  ddcAiQueryKeys,
  getAiResource,
  getAiVersion,
  pageAiPublications,
  pageAiResources,
  promoteAiVersion,
} from '../api/ai'
import type {
  DdcAiContent,
  DdcAiPromotionCommand,
  DdcAiPublicationResult,
  DdcAiResourcePageParams,
  DdcAiResourceSummary,
  DdcAiScope,
  DdcAiVersionSummary,
} from '../api/types'
import ScopeSelects from '../components/scope/ScopeSelects'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { uuidV7 } from '../lib/uuid'

type Props = {
  open: boolean
  sourceResource: DdcAiResourceSummary
  sourceVersion: DdcAiVersionSummary
  onCancel: () => void
  onPublished: (result: DdcAiPublicationResult) => void
  onPendingChange?: (pending: boolean) => void
}

type PendingPromotion = Readonly<{
  requestId: string
  command: Readonly<DdcAiPromotionCommand>
}>

const emptyScope: DdcAiScope = { bizCode: '', namespaceCode: '', env: '', appCode: '' }

const scopeIsComplete = (scope: DdcAiScope): boolean =>
  Object.values(scope).every((value) => value.trim() !== '')

const sameContent = (left: DdcAiContent, right: DdcAiContent): boolean => {
  const normalize = (content: DdcAiContent) => JSON.stringify({
    promptText: content.promptText,
    nodes: content.nodes.slice().sort((a, b) => a.path.localeCompare(b.path)),
  })
  return normalize(left) === normalize(right)
}

const isUnknownCommit = (error: unknown): boolean =>
  error instanceof DdcApiError && (error.status === 0 || error.status === 503)

const findTargetResource = async (
  scope: DdcAiScope,
  kind: DdcAiResourceSummary['kind'],
  resourceKey: string,
  signal?: AbortSignal,
): Promise<DdcAiResourceSummary | null> => {
  const query: DdcAiResourcePageParams = {
    ...scope,
    kind,
    resourceKeyPrefix: resourceKey,
    pageNo: 1,
    pageSize: 100,
  }
  let pageNo = 1
  let hasNext = true
  while (hasNext) {
    const result = await pageAiResources({ ...query, pageNo }, { signal })
    const exact = result.records.find((record) => record.resourceKey === resourceKey)
    if (exact) return exact
    hasNext = result.page.hasNext
    pageNo += 1
  }
  return null
}

export default function AiPromotionDialog({
  open,
  sourceResource,
  sourceVersion,
  onCancel,
  onPublished,
  onPendingChange = () => {},
}: Props) {
  const { t } = usePageMessages('tianshu.ai.editor')
  const fieldsWritable = useDdcWritable('DdcAiPromotionCommand')
  const mayMutate = useDdcPermission('tianshu.button.AiPromotionDialog.ai_write') && fieldsWritable
  const { message } = App.useApp()
  const [targetScope, setTargetScope] = useState<DdcAiScope>({ ...emptyScope })
  const [targetResourceKey, setTargetResourceKey] = useState(sourceResource.resourceKey)
  const [changeNote, setChangeNote] = useState<string | null>(null)
  const effectiveChangeNote = changeNote ?? t('promotion.defaultNote', { version: sourceVersion.versionNo })
  const [failure, setFailure] = useState<{ key?: string; error?: unknown }>()
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [verifying, setVerifying] = useState(false)

  const targetQuery = useMemo<DdcAiResourcePageParams | null>(() => {
    if (!scopeIsComplete(targetScope) || targetResourceKey.trim() === '') return null
    return {
      ...targetScope,
      kind: sourceResource.kind,
      resourceKeyPrefix: targetResourceKey.trim(),
      pageNo: 1,
      pageSize: 100,
    }
  }, [sourceResource.kind, targetResourceKey, targetScope])

  const targetIdentityMatchesSource = scopeIsComplete(targetScope)
    && targetScope.bizCode.trim() === sourceResource.scope.bizCode
    && targetScope.namespaceCode.trim() === sourceResource.scope.namespaceCode
    && targetScope.env.trim() === sourceResource.scope.env
    && targetScope.appCode.trim() === sourceResource.scope.appCode
    && targetResourceKey.trim() === sourceResource.resourceKey

  const targetLookupQuery = useQuery({
    queryKey: targetQuery
      ? ddcAiQueryKeys.resources(targetQuery)
      : [...ddcAiQueryKeys.all(), 'promotion-target', sourceResource.id, sourceVersion.versionNo],
    queryFn: ({ signal }) => findTargetResource(
      targetScope,
      sourceResource.kind,
      targetResourceKey.trim(),
      signal,
    ),
    enabled: open && targetQuery !== null && !targetIdentityMatchesSource && pendingPromotion === null,
  })

  const targetResource = targetLookupQuery.data ?? null
  const targetResourceQuery = useQuery({
    queryKey: targetResource
      ? ddcAiQueryKeys.resource(targetResource.id)
      : [...ddcAiQueryKeys.all(), 'promotion-target-detail', sourceResource.id, sourceVersion.versionNo],
    queryFn: ({ signal }) => getAiResource(targetResource!.id, { signal }),
    enabled: open && targetResource !== null && pendingPromotion === null,
  })
  const targetCurrentVersionNo = targetResourceQuery.data?.resource.currentVersionNo ?? null
  const targetVersionQuery = useQuery({
    queryKey: targetCurrentVersionNo
      ? ddcAiQueryKeys.version(targetResource!.id, targetCurrentVersionNo)
      : [...ddcAiQueryKeys.all(), 'promotion-target-version', targetResource?.id ?? 'none'],
    queryFn: ({ signal }) => getAiVersion(targetResource!.id, targetCurrentVersionNo!, { signal }),
    enabled: open && targetResource !== null && targetCurrentVersionNo !== null && pendingPromotion === null,
  })

  const targetPreviewError = targetLookupQuery.error
    ?? targetResourceQuery.error
    ?? targetVersionQuery.error
  const targetPreviewLoading = targetLookupQuery.isFetching
    || (targetResource !== null && targetResourceQuery.isFetching)
    || (targetCurrentVersionNo !== null && targetVersionQuery.isFetching)
  const targetResourceResult = targetResourceQuery.data
  const targetHasUnpublishedChanges = targetResourceResult && targetVersionQuery.data
    ? targetResourceResult.resource.displayName !== targetVersionQuery.data.version.displayName
      || targetResourceResult.resource.description !== targetVersionQuery.data.version.description
      || !sameContent(targetResourceResult.draft, targetVersionQuery.data.content)
    : false

  const promotionMutation = useMutation({
    mutationFn: (request: PendingPromotion) => promoteAiVersion(
      sourceResource.id,
      request.requestId,
      request.command,
    ),
    onSuccess: (result) => {
      setPendingPromotion(null)
      onPendingChange(false)
      setFailure(undefined)
      message.success(t('promotion.published', { version: result.targetVersionNo }))
      onPublished(result)
    },
    onError: (error: unknown) => {
      setFailure({ key: isUnknownCommit(error) ? 'versions.commitUnknown' : undefined, error })
      if (isUnknownCommit(error)) {
        onPendingChange(true)
      } else {
        setPendingPromotion(null)
        onPendingChange(false)
      }
    },
  })

  const sameTarget = targetIdentityMatchesSource
  const targetLookupComplete = targetLookupQuery.isSuccess
  const targetSnapshotReady = targetResource === null
    || (targetResourceResult !== undefined
      && (targetCurrentVersionNo === null || targetVersionQuery.data !== undefined))
  const canSubmit = open
    && targetQuery !== null
    && !sameTarget
    && targetLookupComplete
    && !targetPreviewError
    && !targetPreviewLoading
    && targetSnapshotReady
    && pendingPromotion === null
    && !promotionMutation.isPending

  const command = (): DdcAiPromotionCommand => ({
    sourceVersionNo: sourceVersion.versionNo,
    targetScope: {
      bizCode: targetScope.bizCode.trim(),
      namespaceCode: targetScope.namespaceCode.trim(),
      env: targetScope.env.trim(),
      appCode: targetScope.appCode.trim(),
    },
    targetResourceKey: targetResourceKey.trim(),
    expectedTargetRevision: targetResourceResult?.resource.revision ?? null,
    changeNote: effectiveChangeNote,
  })

  const submit = () => {
    if (!canSubmit) return
    setFailure(undefined)
    const request: PendingPromotion = pendingPromotion ?? {
      requestId: uuidV7(),
      command: command(),
    }
    setPendingPromotion(request)
    onPendingChange(true)
    promotionMutation.mutate(request)
  }

  const verifyOriginalRequest = async () => {
    if (!pendingPromotion || !targetQuery) return
    setVerifying(true)
    setFailure(undefined)
    try {
      const currentTarget = await findTargetResource(
        targetScope,
        sourceResource.kind,
        targetResourceKey.trim(),
      )
      if (!currentTarget) {
        setFailure({ key: 'promotion.receiptOrTargetMissing' })
        return
      }
      const audit = await pageAiPublications(currentTarget.id, {
        requestId: pendingPromotion.requestId,
        pageNo: 1,
        pageSize: 20,
      })
      const receipt = audit.records.find((record) =>
        record.operation === 'PROMOTE' && record.sourceVersionId === sourceVersion.id)
      if (!receipt) {
        setFailure({ key: 'versions.receiptMissing' })
        return
      }
      setPendingPromotion(null)
      onPendingChange(false)
      message.success(t('promotion.verified', { version: receipt.targetVersionNo }))
      onPublished(receipt)
    } catch (error) {
      setFailure({ key: 'promotion.verifyFailed', error })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Modal
      title={t('promotion.title', { version: sourceVersion.versionNo })}
      open={open}
      onCancel={() => {
        if (!pendingPromotion) onCancel()
      }}
      onOk={() => { if (mayMutate) { if (pendingPromotion) promotionMutation.mutate(pendingPromotion); else submit() } }}
      okText={pendingPromotion ? t('versions.retryRequest') : t('promotion.copyAndPublish')}
      cancelText={t('common.cancel')}
      confirmLoading={promotionMutation.isPending}
      okButtonProps={{disabled: !mayMutate || pendingPromotion === null && !canSubmit }}
      closable={pendingPromotion === null}
      mask={{ closable: pendingPromotion === null }}
      keyboard={pendingPromotion === null}
      destroyOnHidden={pendingPromotion === null}
    >
      <Space orientation="vertical" size="middle" className="tianshu-ai-page">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label={t('promotion.sourceResource')}>
            {`${sourceResource.scope.bizCode} / ${sourceResource.scope.namespaceCode} / ${sourceResource.scope.env} / ${sourceResource.scope.appCode} / ${sourceResource.resourceKey}`}
          </Descriptions.Item>
          <Descriptions.Item label={t('promotion.fixedSourceVersion')}>
            {`${sourceVersion.versionNo} · ${sourceVersion.displayName} · ${sourceVersion.contentSha256}`}
          </Descriptions.Item>
        </Descriptions>
        {failure && <Alert type="error" showIcon title={t('promotion.status')}
          description={failure.key ? t(failure.key, { error: formatAdminError(failure.error, t) }) : formatAdminError(failure.error, t)} />}
        {pendingPromotion && (
          <Button onClick={() => void verifyOriginalRequest()} loading={verifying} disabled={promotionMutation.isPending}>
            {t('versions.verifyRequest')}
          </Button>
        )}
        <Form disabled={!mayMutate} layout="vertical">
          <Form.Item label={t('promotion.targetScope')} required>
            <ScopeSelects
              value={targetScope}
              onChange={setTargetScope}
              disabled={pendingPromotion !== null}
            />
          </Form.Item>
          <Form.Item label={t('promotion.targetKey')} required>
            <Input
              aria-label={t('promotion.targetKey')}
              maxLength={128}
              value={targetResourceKey}
              disabled={pendingPromotion !== null}
              onChange={(event) => setTargetResourceKey(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('promotion.changeNote')}>
            <Input.TextArea
              aria-label={t('promotion.changeNote')}
              maxLength={512}
              value={pendingPromotion?.command.changeNote ?? effectiveChangeNote}
              disabled={pendingPromotion !== null}
              onChange={(event) => setChangeNote(event.target.value)}
            />
          </Form.Item>
        </Form>
        {!scopeIsComplete(targetScope) && <Alert type="info" title={t('promotion.scopeRequired')} />}
        {sameTarget && <Alert type="error" title={t('promotion.sameIdentity')} />}
        {targetPreviewLoading && <Spin size="small" description={t('promotion.verifyingTarget')} />}
        {targetPreviewError && (
          <Alert type="error" title={t('promotion.targetReadFailed')} description={formatAdminError(targetPreviewError, t)} />
        )}
        {targetQuery && targetLookupComplete && !targetPreviewError && !targetPreviewLoading && (
          targetResourceResult
            ? <Alert
                type="info"
                title={t('promotion.targetRevision', {
                  revision: targetResourceResult.resource.revision,
                  version: targetResourceResult.resource.currentVersionNo ?? t('editor.unpublished'),
                })}
                description={targetCurrentVersionNo === null
                  ? t('promotion.targetUnpublished')
                  : targetHasUnpublishedChanges
                    ? t('promotion.targetHasDraft')
                    : t('promotion.targetDraftUnchanged')}
              />
            : <Alert type="info" title={t('promotion.newTarget')} />
        )}
        <Typography.Text type="secondary">
          {t('promotion.immutableSourceHint')}
        </Typography.Text>
      </Space>
    </Modal>
  )
}
