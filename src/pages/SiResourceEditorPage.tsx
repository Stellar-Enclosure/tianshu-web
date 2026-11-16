import { PermissionButton } from '../permissions/access'
import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Card, Form, Input, InputNumber, Space, Tabs } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DdcApiError } from '../api/client'
import { createSiResource, ddcSiQueryKeys, getSiResource, publishSiDraft, replaceSiDraft } from '../api/si'
import type { SiResourceKind } from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import SiReferencesPanel from './SiReferencesPanel'
import SiServiceBindingPanel from './SiServiceBindingPanel'

export const siEditorMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.editor.editTitle', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '编辑超级智能原子资源', 'en-US': 'Edit SI Atomic Resource' } },
])

const SECRET_LEAK_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+(?!vault:\/\/)[A-Za-z0-9._-]+|\"(?:apiKey|secret|password|token)\"\s*:\s*\"(?!vault:\/\/)[^\"]+\")/i

export default function SiResourceEditorPage() {
  const { t } = usePageMessages('tianshu.si')
  const { message } = App.useApp()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()

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
  const [mcpTransport, setMcpTransport] = useState('STDIO')
  const [mcpEndpoint, setMcpEndpoint] = useState('')
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpHeadersJson, setMcpHeadersJson] = useState('{}')
  const [rawSpecJson, setRawSpecJson] = useState('{}')
  const [secretLeakDetected, setSecretLeakDetected] = useState(false)
  const [conflictDetected, setConflictDetected] = useState(false)

  const detailQuery = useQuery({
    queryKey: ddcSiQueryKeys.detail(id ?? 'new'),
    enabled: !isNew,
    queryFn: ({ signal }) => getSiResource(id!, { signal }),
  })

  useEffect(() => {
    if (!detailQuery.data) return
    const res = detailQuery.data
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
      const parsed = JSON.parse(res.specJson ?? '{}') as Record<string, unknown>
      if (typeof parsed.modelKey === 'string') setModelKey(parsed.modelKey)
      if (typeof parsed.systemPromptKey === 'string') setSystemPromptKey(parsed.systemPromptKey)
      if (typeof parsed.timeoutSeconds === 'number') setTimeoutSeconds(parsed.timeoutSeconds)
      if (typeof parsed.transport === 'string') setMcpTransport(parsed.transport)
      if (typeof parsed.endpoint === 'string') setMcpEndpoint(parsed.endpoint)
      if (typeof parsed.command === 'string') setMcpCommand(parsed.command)
      if (parsed.headers) setMcpHeadersJson(JSON.stringify(parsed.headers))
    } catch {
      // Keep raw string fallback intact
    }
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
      const headersObj = JSON.parse(mcpHeadersJson || '{}') as Record<string, string>
      return JSON.stringify(
        mcpTransport === 'STDIO'
          ? { transport: 'STDIO', command: mcpCommand, headers: headersObj }
          : { transport: mcpTransport, endpoint: mcpEndpoint, headers: headersObj },
      )
    }
    return rawSpecJson
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const composed = buildSpecJson()
      if (SECRET_LEAK_PATTERN.test(composed) || SECRET_LEAK_PATTERN.test(mcpHeadersJson)) {
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

  return (
    <div>
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
            <select value={kind} onChange={(e) => setKind(e.target.value as SiResourceKind)} disabled={!isNew}>
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

          {kind === 'MCP' && (
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

          {(kind === 'PROMPT' || kind === 'SKILL') && (
            <Form.Item label={t('si.editor.specJsonLabel')}>
              <Input.TextArea rows={6} value={rawSpecJson} onChange={(e) => setRawSpecJson(e.target.value)} />
            </Form.Item>
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
