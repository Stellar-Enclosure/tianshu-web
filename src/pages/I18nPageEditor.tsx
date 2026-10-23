import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Collapse, Form, Input, Modal, Space, Spin, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { BlockerFunction } from 'react-router-dom'
import {
  createI18nPage, ddcI18nQueryKeys, getI18nPage, publishI18nPage, replaceI18nDraft,
  type DdcI18nCreateCommand, type DdcI18nDraftCommand, type DdcI18nPage, type DdcI18nScope,
} from '../api/i18n'
import { DdcApiError, getDdcRequestContext, isCurrentDdcSession } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useAdminI18n, usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminMessageError, formatAdminError } from '../i18n/errors'
import { i18nBufferToDraft, i18nDraftToBuffer, validateI18nPageCode, type I18nDraftBuffer } from '../lib/i18nDraft'
import I18nDraftForm from './I18nDraftForm'
import I18nBundlePreview from './I18nBundlePreview'

type Props = {
  pageId: string | null
  scope: DdcI18nScope
  onGuardChange: (guard: () => Promise<boolean>) => void
  onCreated: (page: DdcI18nPage) => void
}

type Operation =
  | { kind: 'create'; command: DdcI18nCreateCommand }
  | { kind: 'save'; id: string; command: DdcI18nDraftCommand }
  | { kind: 'publish'; id: string; expectedRevision: string }

const emptyBuffer = (): I18nDraftBuffer => ({ name: '', defaultLocale: 'zh-CN', locales: ['zh-CN'], entries: [] })

export default function I18nPageEditor({ pageId, scope, onGuardChange, onCreated }: Props) {
  const {t} = usePageMessages('tianshu.i18n')
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
  const [pageCode, setPageCode] = useState('')
  const [failure, setFailure] = useState<unknown>()
  const [conflict, setConflict] = useState(false)
  const [conflictServer, setConflictServer] = useState<DdcI18nPage | null>(null)
  const conflictRef = useRef(false)
  const dirtyRef = useRef(false)
  const pendingRef = useRef(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const confirmationResolver = useRef<((allowed: boolean) => void) | null>(null)
  const queryKey = useMemo(() => pageId ? ddcI18nQueryKeys.page(pageId) : [...ddcI18nQueryKeys.all(), 'new'], [pageId])
  const pageQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getI18nPage(pageId!, { signal }),
    enabled: !!pageId && isCurrentDdcSession(requestContext.sessionGeneration)
      && getDdcRequestContext().tenantId === requestContext.tenantId,
  })
  const dirty = JSON.stringify(buffer) !== JSON.stringify(baseline ? i18nDraftToBuffer(baseline) : emptyBuffer())
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
    setBaseline(pageQuery.data)
    setBuffer(i18nDraftToBuffer(pageQuery.data))
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
    mutationFn: (operation: Operation) => {
      if (operation.kind === 'create') return createI18nPage(operation.command)
      if (operation.kind === 'save') return replaceI18nDraft(operation.id, operation.command)
      return publishI18nPage(operation.id, operation.expectedRevision)
    },
    onSuccess: (result, operation) => {
      if (!currentSession()) return
      setBaseline(result)
      setBuffer(i18nDraftToBuffer(result))
      setPageCode(result.pageCode)
      setFailure(undefined)
      setConflict(false)
      conflictRef.current = false
      setConflictServer(null)
      queryClient.setQueryData(ddcI18nQueryKeys.page(result.id), result)
      void queryClient.invalidateQueries({ queryKey: ddcI18nQueryKeys.all() })
      message.success(operation.kind === 'publish' ? t('feedback.published') : t('feedback.saved'))
      if (operation.kind === 'publish' && bootstrap && result.bizCode === bootstrap.scope.bizCode
          && result.namespaceCode === bootstrap.scope.namespaceCode && result.env === bootstrap.scope.env
          && result.appCode === bootstrap.scope.appCode) void refreshInterface()
      if (operation.kind === 'create') onCreated(result)
    },
    onError: async (error: unknown) => {
      if (!currentSession()) return
      if (error instanceof DdcApiError && error.status === 409 && pageId) {
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
  useEffect(() => { pendingRef.current = pending }, [pending])
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => (dirty || pending)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), [dirty, pending])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!dirty && !pending) return
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [dirty, pending])

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
    if (pending || conflict) return
    try {
      const draft = i18nBufferToDraft(buffer)
      if (pageId && baseline) {
        operationMutation.mutate({ kind: 'save', id: pageId, command: { ...draft, expectedRevision: baseline.revision } })
      } else if (!pageId) {
        operationMutation.mutate({ kind: 'create', command: { ...scope, ...draft, pageCode: validateI18nPageCode(pageCode) } })
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
  const canPublish = baseline && !dirty && !pending && !conflict && buffer.entries.length > 0 && !pageQuery.isError

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
                    setBaseline(conflictServer)
                    setBuffer(i18nDraftToBuffer(conflictServer))
                    conflictRef.current = false
                    setConflict(false)
                  }}>{t('conflict.loadServer')}</Button>
                  <Button disabled={pending} onClick={() => {
                    setBaseline(conflictServer)
                    conflictRef.current = false
                    setConflict(false)
                  }}>{t('conflict.keepLocal')}</Button>
                </Space>
              </>}
            </Space>
          )} />
        )}
        <Form layout="vertical">
          <Form.Item label={t('fields.pageCode')} required help={t('help.pageCode')}>
            <Input aria-label={t('fields.pageCode')} value={pageCode} maxLength={128} disabled={!!pageId || pending}
              placeholder={t('placeholders.pageCode')} onChange={(event) => setPageCode(event.target.value)} />
          </Form.Item>
        </Form>
        <I18nDraftForm value={buffer} disabled={pending || (!!pageId && !baseline)} onError={setFailure}
          onChange={(next) => { setBuffer(next); setFailure(undefined) }} />
        <Space wrap>
          <Button type="primary" loading={pending && operationMutation.variables?.kind !== 'publish'}
            disabled={pending || conflict || (!!pageId && (!dirty || !baseline || pageQuery.isError))} onClick={save}>
            {pageId ? t('actions.saveDraft') : t('actions.createDraft')}
          </Button>
          <Button disabled={!canPublish} loading={pending && operationMutation.variables?.kind === 'publish'}
            onClick={() => {
              if (canPublish && baseline) operationMutation.mutate({ kind: 'publish', id: baseline.id, expectedRevision: baseline.revision })
            }}>{t('actions.publishDraft')}</Button>
          <Typography.Text type="secondary">{t('help.publish')}</Typography.Text>
        </Space>
        {baseline && <I18nBundlePreview scope={scope} pageCode={baseline.pageCode}
          defaultLocale={baseline.defaultLocale} locales={Object.keys(baseline.translations)}
          publishedVersion={baseline.publishedVersion} />}
      </Space>
      <Modal title={pending ? t('leave.pendingTitle') : t('leave.title')}
        open={confirmationOpen || blocker.state === 'blocked'} onOk={() => answerLeave(true)}
        onCancel={() => answerLeave(false)} okText={t('leave.discard')} cancelText={t('leave.continue')}
        okButtonProps={{ disabled: pending, danger: true }}>
        {pending ? t('leave.pendingDescription') : t('leave.description')}
      </Modal>
    </Card>
  )
}
