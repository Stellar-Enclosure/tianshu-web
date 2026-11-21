import { PermissionButton } from '../permissions/access'
import { useEmbeddedWorkbench, useWorkbenchLeaveGuard } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Card, Form, Input, InputNumber, Space, Tabs } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DdcApiError } from '../api/client'
import { createSiResource, ddcSiQueryKeys, getSiResource, getSiResourceVersion, publishSiDraft, replaceSiDraft } from '../api/si'
import type { SiResourceKind } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import SiReferencesPanel from './SiReferencesPanel'
import SiServiceBindingPanel from './SiServiceBindingPanel'

export const siEditorMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.editor.editTitle', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '编辑超级智能原子资源', 'en-US': 'Edit SI Atomic Resource' } },
])

const SECRET_LEAK_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+(?!vault:\/\/)[A-Za-z0-9._-]+|"(?:apiKey|secret|password|token)"\s*:\s*"(?!vault:\/\/)[^"]+")/i

const newMcpDocument = JSON.stringify({
  schemaVersion: 'mcp-server-v2',
  sourceType: 'REMOTE_HTTPS',
  protocolVersion: '2025-11-25',
  transport: 'STREAMABLE_HTTP',
  endpoint: '',
  capabilityFingerprint: '',
  tools: [],
}, null, 2)

const readDocument = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MCP_DOCUMENT')
  return value as Record<string, unknown>
}

const capabilityFingerprint = (text?: string): string | undefined => {
  if (!text) return undefined
  try {
    const value = readDocument(text).capabilityFingerprint
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : undefined
  } catch { return undefined }
}

export default function SiResourceEditorPage() {
  const { t } = usePageMessages('tianshu.si')
  const { embedded, activeTabKey } = useEmbeddedWorkbench()
  const { message } = App.useApp()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const siTabKey = activeTabKey ?? (isNew ? '["tianshu","tianshu.page.siEditor.new"]' : JSON.stringify(['tianshu', 'tianshu.page.siEditor', id]))

  const [bizCode, setBizCode] = useState('ai')
  const [namespaceCode, setNamespaceCode] = useState('core')
  const [envCode, setEnvCode] = useState('dev')
  const [appCode, setAppCode] = useState('tianji')
  const [kind, setKind] = useState<SiResourceKind>('AGENT')
  const [resourceKey, setResourceKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [modelKey, setModelKey] = useState('gpt-6-luna')
  const [systemPromptKey, setSystemPromptKey] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30)
  const [mcpDocumentMode, setMcpDocumentMode] = useState(false)
  const [mcpTransport, setMcpTransport] = useState('STDIO')
  const [mcpEndpoint, setMcpEndpoint] = useState('')
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpHeadersJson, setMcpHeadersJson] = useState('{}')
  const [rawSpecJson, setRawSpecJson] = useState('{}')
  const [secretLeakDetected, setSecretLeakDetected] = useState(false)
  const [conflictDetected, setConflictDetected] = useState(false)
  const [savedMarker, setSavedMarker] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ddcSiQueryKeys.detail(id ?? 'new'),
    enabled: !isNew,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => getSiResource(id!, { signal }),
  })

  const publishedVersion = detailQuery.data?.currentVersionNo
  const publishedMcp = useQuery({
    queryKey: ddcSiQueryKeys.version(id ?? 'new', publishedVersion ?? ''),
    enabled: !isNew && detailQuery.data?.kind === 'MCP' && publishedVersion != null,
    queryFn: ({signal}) => getSiResourceVersion(id!, publishedVersion!, {signal}),
  })
  const draftFingerprint = capabilityFingerprint(rawSpecJson)
  const publishedFingerprint = capabilityFingerprint(publishedMcp.data?.specJson)
  const currentDraftSignature = JSON.stringify([kind, resourceKey, displayName, description, modelKey, systemPromptKey, timeoutSeconds, mcpTransport, mcpEndpoint, mcpCommand, mcpHeadersJson, rawSpecJson])
  const baselineSignature = detailQuery.data
    ? JSON.stringify([
        detailQuery.data.kind,
        detailQuery.data.resourceKey,
        detailQuery.data.displayName,
        detailQuery.data.description ?? '',
        'gpt-6-luna',
        '',
        30,
        'STDIO',
        '',
        '',
        '{}',
        detailQuery.data.specJson ?? '{}',
      ])
    : JSON.stringify(['AGENT', '', '', '', 'gpt-6-luna', '', 30, 'STDIO', '', '', '{}', '{}'])
  const isDirty = savedMarker !== null
    ? currentDraftSignature !== savedMarker
    : isNew
      ? currentDraftSignature !== baselineSignature
      : Boolean(detailQuery.data && (displayName !== detailQuery.data.displayName || description !== (detailQuery.data.description ?? '') || rawSpecJson !== (detailQuery.data.specJson ?? '{}')))

  useEffect(() => {
    if (!detailQuery.data) return
    const res = detailQuery.data
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setBizCode(res.bizCode)
      setNamespaceCode(res.namespaceCode ?? 'core')
      setEnvCode(res.envCode)
      setAppCode(res.appCode)
      setKind(res.kind)
      setResourceKey(res.resourceKey)
      setDisplayName(res.displayName)
      setDescription(res.description ?? '')
      setRawSpecJson(res.specJson ?? '{}')
      try {
        const parsed = readDocument(res.specJson ?? '{}')
        setMcpDocumentMode(res.kind === 'MCP' && 'schemaVersion' in parsed)
        if (typeof parsed.modelKey === 'string') setModelKey(parsed.modelKey)
        if (typeof parsed.systemPromptKey === 'string') setSystemPromptKey(parsed.systemPromptKey)
        if (typeof parsed.timeoutSeconds === 'number') setTimeoutSeconds(parsed.timeoutSeconds)
        if (typeof parsed.transport === 'string') setMcpTransport(parsed.transport)
        if (typeof parsed.endpoint === 'string') setMcpEndpoint(parsed.endpoint)
        if (typeof parsed.command === 'string') setMcpCommand(parsed.command)
        if (parsed.headers) setMcpHeadersJson(JSON.stringify(parsed.headers))
      } catch {
        setMcpDocumentMode(res.kind === 'MCP')
      }
    })
    return () => { active = false }
  }, [detailQuery.data])

  const buildSpecJson = (): string => {
    if (kind === 'AGENT') {
      return JSON.stringify({
        modelKey,
        systemPromptKey,
        agenticStrategy: 'REASONING',
        executionPolicy: { timeoutSeconds },
      })
    }
    if (kind === 'MCP') {
      const document = readDocument(rawSpecJson)
      if (mcpDocumentMode) return rawSpecJson
      if (document.transport === mcpTransport
        && (mcpTransport === 'STDIO' ? document.command === mcpCommand : document.endpoint === mcpEndpoint)
        && JSON.stringify(document.headers ?? {}) === JSON.stringify(readDocument(mcpHeadersJson))) return rawSpecJson
      const next: Record<string, unknown> = {...document, transport: mcpTransport, headers: readDocument(mcpHeadersJson)}
      if (mcpTransport === 'STDIO') {
        delete next.endpoint
        return JSON.stringify({...next, command: mcpCommand})
      }
      delete next.command
      delete next.args
      delete next.env
      return JSON.stringify({...next, endpoint: mcpEndpoint})
    }
    return rawSpecJson
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const composed = buildSpecJson()
      if (SECRET_LEAK_PATTERN.test(composed)) {
        setSecretLeakDetected(true)
        throw new Error('SECRET_LEAK_PRECHECK')
      }
      setSecretLeakDetected(false)
      setConflictDetected(false)
      if (isNew) {
        return createSiResource({
          bizCode,
          namespaceCode,
          envCode,
          appCode,
          kind,
          resourceKey,
          displayName,
          description,
          specJson: composed,
        })
      }
      return replaceSiDraft(id!, {
        expectedVersion: detailQuery.data?.version ?? 0,
        displayName,
        description,
        specJson: composed,
      })
    },
    onSuccess: (saved) => {
      setSavedMarker(currentDraftSignature)
      message.success(t('si.editor.saveSuccess'))
      if (isNew) {
        navigate(`/si/resources/${saved.id}`, { replace: true })
      } else {
        void detailQuery.refetch()
      }
    },
    onError: (error) => {
      if (error instanceof Error && error.message === 'SECRET_LEAK_PRECHECK') return
      if (error instanceof DdcApiError && error.status === 409) {
        setConflictDetected(true)
        return
      }
      message.error(formatAdminError(error, t))
    },
  })

  const publishMutation = useMutation({
    mutationFn: () =>
      publishSiDraft(id!, { expectedVersion: detailQuery.data?.version ?? 0, changeNote: displayName }),
    onSuccess: () => {
      message.success(t('si.editor.publishSuccess'))
      void detailQuery.refetch()
    },
    onError: (err) => message.error(formatAdminError(err, t)),
  })

  useWorkbenchLeaveGuard(siTabKey, {
    dirty: isDirty,
    pendingMutation: saveMutation.isPending || publishMutation.isPending,
  })

  return (
    <div style={{ width: '100%' }}>
      {!embedded ? (
        <AdminPageHeader
          title={isNew ? t('si.editor.createTitle') : t('si.editor.editTitle')}
          description=""
          extra={
            <Space>
              <Button onClick={() => navigate('/si/catalog')}>{t('common.back')}</Button>
              {!isNew && (
                <PermissionButton
                  resourceKey="tianshu.button.SiResourceEditorPage.publish"
                  loading={publishMutation.isPending}
                  onClick={() => publishMutation.mutate()}
                >
                  {t('si.editor.publishBtn')}
                </PermissionButton>
              )}
              <PermissionButton
                resourceKey="tianshu.button.SiResourceEditorPage.write"
                type="primary"
                data-testid="si-save-draft-btn"
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {t('si.editor.saveDraftBtn')}
              </PermissionButton>
            </Space>
          }
        />
      ) : (
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={() => navigate('/si/catalog')}>{t('common.back')}</Button>
          {!isNew && (
            <PermissionButton
              resourceKey="tianshu.button.SiResourceEditorPage.publish"
              loading={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {t('si.editor.publishBtn')}
            </PermissionButton>
          )}
          <PermissionButton
            resourceKey="tianshu.button.SiResourceEditorPage.write"
            type="primary"
            data-testid="si-save-draft-btn"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('si.editor.saveDraftBtn')}
          </PermissionButton>
        </Space>
      )}

      {secretLeakDetected && (
        <Alert data-testid="si-secret-leak-alert" type="error" title={t('si.editor.secretLeakError')} style={{ marginBottom: 12 }} />
      )}
      {conflictDetected && (
        <Alert
          data-testid="si-conflict-alert"
          type="warning"
          title={t('si.editor.conflictAlert')}
          action={
            <Button size="small" onClick={() => void detailQuery.refetch()}>
              {t('si.editor.reloadBtn')}
            </Button>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Form.Item label={t('si.editor.kindLabel')}>
            <select value={kind} onChange={(e) => {
              const next = e.target.value as SiResourceKind
              setKind(next)
              setMcpDocumentMode(next === 'MCP')
              setRawSpecJson(next === 'MCP' ? newMcpDocument : '{}')
            }} disabled={!isNew}>
              <option value="AGENT">{t('si.kind.AGENT')}</option>
              <option value="MCP">{t('si.kind.MCP')}</option>
              <option value="PROMPT">{t('si.kind.PROMPT')}</option>
              <option value="SKILL">{t('si.kind.SKILL')}</option>
            </select>
          </Form.Item>
          <Form.Item label={t('si.editor.resourceKeyLabel')}>
            <Input value={resourceKey} onChange={(e) => setResourceKey(e.target.value)} disabled={!isNew} />
          </Form.Item>
          <Form.Item label={t('si.editor.displayNameLabel')}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('si.editor.descriptionLabel')}>
            <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Form.Item>

          {kind === 'AGENT' && (
            <>
              <Form.Item label={t('si.editor.modelKeyLabel')}>
                <Input value={modelKey} onChange={(e) => setModelKey(e.target.value)} />
              </Form.Item>
              <Form.Item label={t('si.editor.promptKeyLabel')}>
                <Input value={systemPromptKey} onChange={(e) => setSystemPromptKey(e.target.value)} />
              </Form.Item>
              <Form.Item label={t('si.editor.timeoutSecondsLabel')}>
                <InputNumber min={1} max={3600} value={timeoutSeconds} onChange={(v) => setTimeoutSeconds(v ?? 30)} />
              </Form.Item>
            </>
          )}

          {kind === 'MCP' && !mcpDocumentMode && (
            <>
              <Form.Item label={t('si.editor.transportLabel')}>
                <select
                  data-testid="si-mcp-transport-select"
                  value={mcpTransport}
                  onChange={(e) => setMcpTransport(e.target.value)}
                >
                  <option value="STDIO">{t('si.transport.STDIO')}</option>
                  <option value="STREAMABLE_HTTP">{t('si.transport.STREAMABLE_HTTP')}</option>
                  <option value="SSE">{t('si.transport.SSE')}</option>
                </select>
              </Form.Item>
              {mcpTransport === 'STDIO' ? (
                <Form.Item label={t('si.editor.commandLabel')}>
                  <Input data-testid="si-mcp-command-input" value={mcpCommand} onChange={(e) => setMcpCommand(e.target.value)} />
                </Form.Item>
              ) : (
                <Form.Item label={t('si.editor.endpointLabel')}>
                  <Input data-testid="si-mcp-endpoint-input" value={mcpEndpoint} onChange={(e) => setMcpEndpoint(e.target.value)} />
                </Form.Item>
              )}
              <Form.Item label={t('si.editor.headersLabel')}>
                <Input.TextArea
                  data-testid="si-mcp-headers-secret-check"
                  rows={2}
                  value={mcpHeadersJson}
                  onChange={(e) => setMcpHeadersJson(e.target.value)}
                />
              </Form.Item>
            </>
          )}

          {(kind === 'PROMPT' || kind === 'SKILL' || (kind === 'MCP' && mcpDocumentMode)) && (
            <Form.Item label={t('si.editor.specJsonLabel')}>
              <Input.TextArea data-testid="si-spec-json" rows={kind === 'MCP' ? 15 : 6} spellCheck={false} value={rawSpecJson} onChange={(e) => setRawSpecJson(e.target.value)} />
            </Form.Item>
          )}
          {kind === 'MCP' && mcpDocumentMode && (
            <dl>
              <dt>{t('si.editor.draftFingerprint')}</dt>
              <dd><code>{draftFingerprint ?? '—'}</code></dd>
              {publishedVersion != null && <>
                <dt>{t('si.editor.publishedFingerprint')} / {publishedVersion}</dt>
                <dd><code>{publishedFingerprint ?? '—'}</code></dd>
                {draftFingerprint && publishedFingerprint && draftFingerprint !== publishedFingerprint && (
                  <dd>{t('si.editor.fingerprintChanged')}</dd>
                )}
              </>}
            </dl>
          )}
        </Form>
      </Card>

      {!isNew && detailQuery.data && (
        <Tabs
          items={[
            {
              key: 'references',
              label: t('si.editor.referencesTab'),
              children: <SiReferencesPanel resourceId={detailQuery.data.id} versionNo={detailQuery.data.currentVersionNo ?? 1} />,
            },
            {
              key: 'binding',
              label: t('si.editor.bindingTab'),
              children: <SiServiceBindingPanel resource={detailQuery.data} onUpdated={() => void detailQuery.refetch()} />,
            },
          ]}
        />
      )}
    </div>
  )
}
