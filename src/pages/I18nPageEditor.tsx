import {useDdcWritable} from '../permissions/FieldCatalog'
import {useDdcPermission} from '../permissions/access'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Collapse, Form, Input, Modal, Space, Spin, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { BlockerFunction } from 'react-router-dom'
import {
  createI18nPage, ddcI18nQueryKeys, getI18nPage, getI18nSourcePage, getI18nPublication, publishI18nPage, replaceI18nDraft,
  type DdcI18nCreateCommand, type DdcI18nDraftCommand, type DdcI18nPage, type DdcCatalogTarget,
} from '../api/i18n'
import { DdcApiError, getDdcRequestContext, isCurrentDdcSession } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useAdminI18n, usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminMessageError, formatAdminError } from '../i18n/errors'
import { i18nBufferToDraft, i18nPageToBuffer, validateI18nPageCode, type I18nDraftBuffer } from '../lib/i18nDraft'
import I18nDraftForm from './I18nDraftForm'
import I18nBundlePreview from './I18nBundlePreview'

type Props = {
  pageId: string | null
  initialPageCode?: string
  scope: DdcCatalogTarget
  onGuardChange: (guard: () => Promise<boolean>) => void
  onCreated: (page: DdcI18nPage) => void
}

type Operation =
  | { kind: 'create'; command: DdcI18nCreateCommand }
  | { kind: 'save'; id: string; command: DdcI18nDraftCommand }
  | { kind: 'publish'; id: string; expectedRevision: string; operationId: string }

const emptyBuffer = (): I18nDraftBuffer => ({ name: '', defaultLocale: 'zh-CN', locales: ['zh-CN'], entries: [] })

export default function I18nPageEditor({ pageId, initialPageCode = '', scope, onGuardChange, onCreated }: Props) {
  const {t} = usePageMessages('tianshu.i18n')
  const createWritable = useDdcWritable('DdcI18nCreateCommand')
  const draftWritable = useDdcWritable('DdcI18nDraftCommand')
  const publishWritable = useDdcWritable('DdcI18nPublishCommand')
  const mayWrite = useDdcPermission('tianshu.button.I18nPageEditor.write') && (pageId ? draftWritable : createWritable)
  const mayPublish = useDdcPermission('tianshu.button.I18nPageEditor.publish') && publishWritable
  const {bootstrap, refresh: refreshInterface} = useAdminI18n()
  const { message } = App.useApp()
  const { registerUnsavedChangesGuard } = useAuth()
  const queryClient = useQueryClient()
  const [requestContext] = useState(getDdcRequestContext)
  const activeRef = useRef(true)
  const currentSession = useCallback(() => activeRef.current
    && isCurrentDdcSession(requestContext.sessionGeneration)
    && getDdcRequestContext().tenantId === requestContext.tenantId, [requestContext])
  const [baseline, setBaseline] = useState<DdcI18nPage | null>(null)
  const [buffer, setBuffer] = useState<I18nDraftBuffer>(emptyBuffer)
  const [pageCode, setPageCode] = useState(initialPageCode)
  const [reviewedSourceHashes, setReviewedSourceHashes] = useState<Record<string, string>>({})
  const [sourcePending, setSourcePending] = useState(false)
  const [uncertainPublish, setUncertainPublish] = useState<Extract<Operation, {kind: 'publish'}>>()
  const [failure, setFailure] = useState<unknown>()
  const [conflict, setConflict] = useState(false)
  const [conflictServer, setConflictServer] = useState<DdcI18nPage | null>(null)
  const conflictRef = useRef(false)
  const dirtyRef = useRef(false)
  const pendingRef = useRef(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const confirmationResolver = useRef<((allowed: boolean) => void) | null>(null)
  const queryKey = useMemo(() => pageId ? ddcI18nQueryKeys.page(pageId, scope) : [...ddcI18nQueryKeys.all(), 'new'], [pageId, scope])
  const pageQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getI18nPage(pageId!, scope.catalogActivationVersion, { signal }),
    enabled: !!pageId && isCurrentDdcSession(requestContext.sessionGeneration)
      && getDdcRequestContext().tenantId === requestContext.tenantId,
  })
  const dirty = JSON.stringify(buffer) !== JSON.stringify(baseline ? i18nPageToBuffer(baseline) : emptyBuffer())
    || (!!baseline?.id && baseline.draftActivationVersion !== baseline.catalogActivationVersion)
    || JSON.stringify(reviewedSourceHashes) !== JSON.stringify(baseline?.draftSourceHashes ?? {})
    || (!pageId && pageCode !== '')
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      confirmationResolver.current?.(false)
    }
  }, [])

  useEffect(() => {
    if (!pageQuery.data || dirtyRef.current || conflictRef.current || !currentSession()) return
    setReviewedSourceHashes(pageQuery.data.draftSourceHashes)
    setBaseline(pageQuery.data)
    setBuffer(i18nPageToBuffer(pageQuery.data))
    setPageCode(pageQuery.data.pageCode)
  }, [pageQuery.data, currentSession])

  const leaveGuard = useCallback(async (): Promise<boolean> => {
    if (pendingRef.current) {
      message.warning(t('feedback.pending'))
      return false
    }
    if (!dirtyRef.current) return true
    if (confirmationResolver.current) return false
    return new Promise((resolve) => {
      confirmationResolver.current = resolve
      setConfirmationOpen(true)
    })
  }, [message, t])

  useEffect(() => {
    onGuardChange(leaveGuard)
    const unregister = registerUnsavedChangesGuard(leaveGuard)
    return () => {
      onGuardChange(async () => true)
      unregister()
    }
  }, [leaveGuard, onGuardChange, registerUnsavedChangesGuard])

  const refreshConflict = async () => {
    setConflictServer(null)
    const refreshed = await pageQuery.refetch()
    if (!currentSession()) return
    if (refreshed.error) {
      setFailure(new AdminMessageError('feedback.latestDraftFailed', { error: formatAdminError(refreshed.error, t) }))
    } else {
      setConflictServer(refreshed.data ?? null)
      setFailure(undefined)
    }
  }

  const operationMutation = useMutation({
    mutationFn: async (operation: Operation) => {
      if (operation.kind === 'create') return createI18nPage(operation.command)
      if (operation.kind === 'save') return replaceI18nDraft(operation.id, operation.command)
      await publishI18nPage(operation.id, operation.expectedRevision, operation.operationId)
      return getI18nPage(operation.id, scope.catalogActivationVersion)
    },
    onSuccess: (result, operation) => {
      if (!currentSession()) return
      setUncertainPublish(undefined)
      setReviewedSourceHashes(result.draftSourceHashes)
      setBaseline(result)
      setBuffer(i18nPageToBuffer(result))
      setPageCode(result.pageCode)
      setFailure(undefined)
      setConflict(false)
      conflictRef.current = false
      setConflictServer(null)
      if (result.id) queryClient.setQueryData(ddcI18nQueryKeys.page(result.id, scope), result)
      void queryClient.invalidateQueries({ queryKey: ddcI18nQueryKeys.all() })
      message.success(operation.kind === 'publish' ? t('feedback.published') : t('feedback.saved'))
      if (operation.kind === 'publish' && bootstrap && result.bizCode === bootstrap.scope.bizCode
          && result.namespaceCode === bootstrap.scope.namespaceCode && result.env === bootstrap.scope.env
          && result.appCode === bootstrap.scope.appCode) void refreshInterface()
      if (operation.kind === 'create') onCreated(result)
    },
    onError: async (error: unknown, operation: Operation) => {
      if (!currentSession()) return
      if (operation.kind === 'publish' && (!(error instanceof DdcApiError) || error.status === 0 || error.status >= 500)) setUncertainPublish(operation)
      if (error instanceof DdcApiError && error.status === 409 && pageId) {
        setUncertainPublish(undefined)
        conflictRef.current = true
        setConflict(true)
        setFailure(undefined)
        await refreshConflict()
      } else {
        setFailure(error)
      }
    },
  })
  const pending = operationMutation.isPending
  const operationBlocked = pending || !!uncertainPublish
  useEffect(() => { pendingRef.current = pending || !!uncertainPublish }, [pending, uncertainPublish])
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => (dirty || pending || !!uncertainPublish)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), [dirty, pending, uncertainPublish])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!dirty && !pending && !uncertainPublish) return
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [dirty, pending, uncertainPublish])

  const answerLeave = (allowed: boolean) => {
    setConfirmationOpen(false)
    confirmationResolver.current?.(allowed)
    confirmationResolver.current = null
    if (blocker.state === 'blocked') {
      if (allowed) blocker.proceed()
      else blocker.reset()
    }
  }

  const save = () => {
    if (!mayWrite || operationBlocked || conflict || !baseline) return
    try {
      const draft = i18nBufferToDraft(buffer, baseline.sourceDefaults)
      const submittedKeys = new Set(Object.values(draft.translations).flatMap(Object.keys))
      if ([...submittedKeys].some(key => !baseline.sourceHashes[key]) || Object.keys(baseline.sourceHashes).some(key => reviewedSourceHashes[key] !== baseline.sourceHashes[key])) throw new Error(t('source.reviewRequired'))
      const reviewed = Object.fromEntries(Object.keys(baseline.sourceHashes).map(key => [key, reviewedSourceHashes[key]]))
      if (pageId && baseline) {
        operationMutation.mutate({ kind: 'save', id: pageId, command: { ...draft, expectedRevision: baseline.revision, catalogActivationVersion: baseline.catalogActivationVersion, reviewedSourceHashes: reviewed } })
      } else if (!pageId) {
        operationMutation.mutate({ kind: 'create', command: { ...scope, ...draft, pageCode: validateI18nPageCode(pageCode), reviewedSourceHashes: reviewed } })
      }
    } catch (error) {
      setFailure(error)
    }
  }

  if (pageId && pageQuery.isPending) return <Card><Spin description={t('loading.draft')}><div style={{ minHeight: 120 }} /></Spin></Card>
  if (pageId && !baseline && pageQuery.isError) return (
    <Alert type="error" showIcon title={t('feedback.draftFailed')} description={formatAdminError(pageQuery.error, t)}
      action={<Button aria-label={t('common.retry')} onClick={() => void pageQuery.refetch()}>{t('common.retry')}</Button>} />
  )
  const sourceCurrent = baseline && baseline.draftActivationVersion === baseline.catalogActivationVersion
    && Object.keys(baseline.draftSourceHashes).length === Object.keys(baseline.sourceHashes).length
    && Object.keys(baseline.sourceHashes).every(key => baseline.draftSourceHashes[key] === baseline.sourceHashes[key])
  const canPublish = sourceCurrent && mayPublish && !uncertainPublish && baseline?.id && baseline && !dirty && !pending && !conflict && (Object.values(baseline.translations).some(values => Object.keys(values).length > 0) || baseline.publishedVersion !== null) && !pageQuery.isError

  return (
    <Card title={baseline ? t('actions.editPage', { pageCode: baseline.pageCode }) : t('editor.create')} extra={(
      <Space wrap>
        <Tag>{baseline ? t('status.revision', { revision: baseline.revision }) : t('status.newDraft')}</Tag>
        <Tag color={baseline?.publishedVersion ? 'green' : undefined}>
          {baseline?.publishedVersion ? t('status.publishedVersion', { version: baseline.publishedVersion }) : t('status.notPublished')}
        </Tag>
        {dirty && <Tag color="orange">{t('status.unsaved')}</Tag>}
      </Space>
    )}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {failure !== undefined && <Alert type="error" showIcon title={formatAdminError(failure, t)} />}
        {pageQuery.isError && baseline && <Alert type="error" showIcon title={t('feedback.refreshFailed')}
          description={formatAdminError(pageQuery.error, t)} action={<Button aria-label={t('common.retry')} onClick={() => void (conflict
            ? refreshConflict() : pageQuery.refetch())}>{t('common.retry')}</Button>} />}
        {conflict && (
          <Alert type="warning" showIcon title={t('conflict.title')} description={(
            <Space orientation="vertical" style={{ width: '100%' }}>
              <span>{t('conflict.description')}</span>
              {conflictServer && <>
                <Collapse items={[{ key: 'server', label: t('conflict.serverRevision', { revision: conflictServer.revision }),
                  children: <pre style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify({ name: conflictServer.name, defaultLocale: conflictServer.defaultLocale,
                      translations: conflictServer.translations }, null, 2)}
                  </pre> }]} />
                <Space wrap>
                  <Button disabled={pending} onClick={() => {
                    setReviewedSourceHashes(conflictServer.draftSourceHashes)
                    setBaseline(conflictServer)
                    setBuffer(i18nPageToBuffer(conflictServer))
                    conflictRef.current = false
                    setConflict(false)
                  }}>{t('conflict.loadServer')}</Button>
                  <Button disabled={pending} onClick={() => {
                    setReviewedSourceHashes({})
                    setBaseline(conflictServer)
                    conflictRef.current = false
                    setConflict(false)
                  }}>{t('conflict.keepLocal')}</Button>
                </Space>
              </>}
            </Space>
          )} />
        )}
        {uncertainPublish && <Alert type="warning" title={t('source.publishUncertain')}
          action={<Space><Button disabled={pending} onClick={() => void (async () => {
            try {
              await getI18nPublication(uncertainPublish.id, uncertainPublish.operationId)
              const page = await getI18nPage(uncertainPublish.id, scope.catalogActivationVersion)
              if (!currentSession()) return
              setBaseline(page); setBuffer(i18nPageToBuffer(page)); setReviewedSourceHashes(page.draftSourceHashes)
              setUncertainPublish(undefined); setFailure(undefined)
            } catch (error) { if (currentSession()) setFailure(error) }
          })()}>{t('source.checkPublication')}</Button>
            <Button disabled={!mayPublish || pending} onClick={() => operationMutation.mutate(uncertainPublish)}>{t('source.retryPublication')}</Button></Space>} />}
        <Form layout="vertical">
          <Form.Item label={t('fields.pageCode')} required help={t('help.pageCode')}>
            <Input aria-label={t('fields.pageCode')} value={pageCode} maxLength={128} disabled={!!pageId || pending || sourcePending}
              placeholder={t('placeholders.pageCode')} onChange={(event) => {setPageCode(event.target.value); setBaseline(null); setBuffer(emptyBuffer()); setReviewedSourceHashes({})}} />
          </Form.Item>
        </Form>
        {!pageId && <Button loading={sourcePending} disabled={!pageCode || sourcePending} onClick={() => void (async () => {
          setSourcePending(true)
          try {
            const page = await getI18nSourcePage(scope, validateI18nPageCode(pageCode))
            if (!currentSession()) return
            if (page.id) { onCreated(page); return }
            setBaseline(page); setBuffer(i18nPageToBuffer(page)); setReviewedSourceHashes(page.draftSourceHashes); setFailure(undefined)
          } catch (error) { if (currentSession()) setFailure(error) }
          finally { if (currentSession()) setSourcePending(false) }
        })()}>{t('source.load')}</Button>}
        {baseline && <Alert type="info" title={t('source.version', {version: baseline.catalogActivationVersion})}
          description={baseline.diagnostics.map(value => `${value.key}: ${value.reason}`).join('; ')} />}
        <I18nDraftForm value={buffer} source={baseline} reviewedSourceHashes={reviewedSourceHashes}
          onReview={setReviewedSourceHashes} disabled={!mayWrite || operationBlocked || !baseline} onError={setFailure}
          onChange={(next) => { setBuffer(next); setFailure(undefined) }} />
        <Space wrap>
          <Button type="primary" loading={pending && operationMutation.variables?.kind !== 'publish'}
            disabled={!mayWrite || !baseline || operationBlocked || conflict || (!!pageId && (!dirty || !baseline || pageQuery.isError))} onClick={save}>
            {pageId ? t('actions.saveDraft') : t('actions.createDraft')}
          </Button>
          <Button disabled={!canPublish} loading={pending && operationMutation.variables?.kind === 'publish'}
            onClick={() => {
              if (canPublish && baseline?.id) operationMutation.mutate({ kind: 'publish', id: baseline.id, expectedRevision: baseline.revision, operationId: crypto.randomUUID() })
            }}>{t('actions.publishDraft')}</Button>
          <Typography.Text type="secondary">{t('help.publish')}</Typography.Text>
        </Space>
        {baseline && <I18nBundlePreview scope={scope} pageCode={baseline.pageCode}
          defaultLocale={baseline.defaultLocale} locales={Object.keys(baseline.translations)}
          publishedVersion={baseline.publishedVersion} />}
      </Space>
      <Modal title={operationBlocked ? t('leave.pendingTitle') : t('leave.title')}
        open={confirmationOpen || blocker.state === 'blocked'} onOk={() => answerLeave(true)}
        onCancel={() => answerLeave(false)} okText={t('leave.discard')} cancelText={t('leave.continue')}
        okButtonProps={{ disabled: pending || !!uncertainPublish, danger: true }}>
        {operationBlocked ? t('leave.pendingDescription') : t('leave.description')}
      </Modal>
    </Card>
  )
}
