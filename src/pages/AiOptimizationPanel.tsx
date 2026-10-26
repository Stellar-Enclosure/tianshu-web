import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Radio,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { DdcApiError } from '../api/client'
import {
  ddcAiQueryKeys,
  getAiOptimizationPolicy,
  getAiOptimizationRun,
  pageAiOptimizationRuns,
  replaceAiOptimizationPolicy,
  triggerAiOptimizationRun,
} from '../api/ai'
import type {
  DdcAiOptimizationPolicyFields,
  DdcAiOptimizationPolicyResult,
  DdcAiOptimizationRunResult,
  DdcAiPolicyState,
  DdcAiRunState,
} from '../api/types'
import { usePageMessages, type AdminTranslate } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'
import { uuidV7 } from '../lib/uuid'

type Props = {
  resourceId: string
  pollIntervalMs?: number
}

const TERMINAL_STATES: readonly DdcAiRunState[] = ['SUCCEEDED', 'FAILED', 'SKIPPED']
const RUN_PAGE_SIZE = 10
const ALIAS_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

const POLICY_STATE_LABELS: Record<DdcAiPolicyState, string> = {
  ARMED: 'optimization.policyState.ARMED',
  AWAITING_PUBLISH: 'optimization.policyState.AWAITING_PUBLISH',
  CONVERGED: 'optimization.policyState.CONVERGED',
  EXHAUSTED: 'optimization.policyState.EXHAUSTED',
  PAUSED: 'optimization.policyState.PAUSED',
}

const RUN_STATE_LABELS: Record<DdcAiRunState, string> = {
  PENDING: 'optimization.runState.PENDING',
  RUNNING: 'optimization.runState.RUNNING',
  SUCCEEDED: 'optimization.runState.SUCCEEDED',
  FAILED: 'optimization.runState.FAILED',
  SKIPPED: 'optimization.runState.SKIPPED',
}

const RUN_STATE_COLORS: Record<DdcAiRunState, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
}

/** ISO-8601 时长（仅 D/H/M/S）换算为秒；无效返回 null。 / ISO-8601 duration (D/H/M/S only) in seconds, or null. */
export const durationSeconds = (value: string): number | null => {
  const match = DURATION_PATTERN.exec(value.trim())
  if (!match || value.trim() === 'P' || value.trim().endsWith('T')) return null
  const [, days, hours, minutes, seconds] = match
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

const policyFields = (policy: DdcAiOptimizationPolicyResult): DdcAiOptimizationPolicyFields => ({
  enabled: policy.enabled,
  scoreThreshold: policy.scoreThreshold,
  minSamples: policy.minSamples,
  evaluationWindow: policy.evaluationWindow,
  maxIterations: policy.maxIterations,
  cooldown: policy.cooldown,
  autoPublish: policy.autoPublish,
  judgeEnabled: policy.judgeEnabled,
  optimizerModelAlias: policy.optimizerModelAlias,
  judgeModelAlias: policy.judgeModelAlias,
  optimizerInstruction: policy.optimizerInstruction,
})

const validationErrors = (fields: DdcAiOptimizationPolicyFields, t: AdminTranslate): string[] => {
  const errors: string[] = []
  const window = durationSeconds(fields.evaluationWindow)
  const cooldown = durationSeconds(fields.cooldown)
  if (window === null || window < 300 || window > 2_592_000) errors.push(t('optimization.validation.evaluationWindow'))
  if (cooldown === null || cooldown < 60 || cooldown > 604_800) errors.push(t('optimization.validation.cooldown'))
  if (!ALIAS_PATTERN.test(fields.optimizerModelAlias)) errors.push(t('optimization.validation.optimizerAlias'))
  if (!ALIAS_PATTERN.test(fields.judgeModelAlias)) errors.push(t('optimization.validation.judgeAlias'))
  if (fields.optimizerInstruction.length > 4096) errors.push(t('optimization.validation.instruction'))
  return errors
}

const errorCode = (error: unknown): string | undefined => error instanceof DdcApiError ? error.code : undefined

const failureText = (error: unknown, t: AdminTranslate): string => {
  if (error instanceof DdcApiError && error.status === 403) return t('editor.operationDenied')
  return formatAdminError(error, t)
}

const utcTime = (value: string | null | undefined, locale: string, t: AdminTranslate) => value
  ? <span title={t('feedback.utcTime', { value })}>{formatTime(value, locale)}</span>
  : '—'

export default function AiOptimizationPanel({ resourceId, pollIntervalMs = 2000 }: Props) {
  const { t, locale } = usePageMessages('tianshu.ai.editor')
  const fieldsWritable = useDdcWritable('DdcAiOptimizationPolicyCommand')
  const triggerWritable = useDdcWritable('DdcAiOptimizationTriggerCommand')
  const mayMutate = useDdcPermission('tianshu.button.AiOptimizationPanel.ai_publish') && fieldsWritable
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [edits, setEdits] = useState<Partial<DdcAiOptimizationPolicyFields>>({})
  const [conflict, setConflict] = useState(false)
  const [channelDisabled, setChannelDisabled] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown }>()
  const [note, setNote] = useState('')
  const [triggeredRunId, setTriggeredRunId] = useState<string | null>(null)
  const [runStateFilter, setRunStateFilter] = useState<DdcAiRunState | 'ALL'>('ALL')
  const [runPageNo, setRunPageNo] = useState(1)

  const policyKey = ddcAiQueryKeys.optimizationPolicy(resourceId)
  const policyQuery = useQuery({
    queryKey: policyKey,
    queryFn: ({ signal }) => getAiOptimizationPolicy(resourceId, { signal }),
  })
  const policy = policyQuery.data
  const runParams = useMemo(() => ({
    state: runStateFilter === 'ALL' ? undefined : runStateFilter,
    pageNo: runPageNo,
    pageSize: RUN_PAGE_SIZE,
  }), [runStateFilter, runPageNo])
  const runsQuery = useQuery({
    queryKey: ddcAiQueryKeys.optimizationRuns(resourceId, runParams),
    queryFn: ({ signal }) => pageAiOptimizationRuns(resourceId, runParams, { signal }),
  })
  const trackedRunId = triggeredRunId ?? policy?.activeRunId ?? null
  const runQuery = useQuery({
    queryKey: ddcAiQueryKeys.optimizationRun(resourceId, trackedRunId ?? 'none'),
    queryFn: ({ signal }) => getAiOptimizationRun(resourceId, trackedRunId!, { signal }),
    enabled: trackedRunId !== null,
    staleTime: 0,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state && TERMINAL_STATES.includes(state) ? false : pollIntervalMs
    },
  })
  const trackedRun = runQuery.data
  const runActive = trackedRun !== undefined && !TERMINAL_STATES.includes(trackedRun.state)
  const trackedTerminalState = trackedRun && TERMINAL_STATES.includes(trackedRun.state) ? trackedRun.state : null

  useEffect(() => {
    if (trackedTerminalState === null) return
    void queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.optimizationPolicy(resourceId) })
    void queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.optimizationRunsAll(resourceId) })
  }, [trackedRunId, trackedTerminalState, queryClient, resourceId])

  const fields = policy ? { ...policyFields(policy), ...edits } : null
  const errors = fields ? validationErrors(fields, t) : []

  const saveMutation = useMutation({
    mutationFn: (rearm: boolean) => replaceAiOptimizationPolicy(resourceId, {
      ...fields!,
      expectedRevision: policy!.revision,
      rearm,
    }),
    onSuccess: (saved) => {
      queryClient.setQueryData(policyKey, saved)
      setEdits({})
      setConflict(false)
      setFailure(undefined)
      message.success(t('optimization.saved'))
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === '56303') setConflict(true)
      else if (code === '56323') message.warning(t('optimization.rearmBlocked'))
      else if (code === '56322') setChannelDisabled(true)
      else setFailure({ error })
    },
  })

  const triggerMutation = useMutation({
    mutationFn: () => triggerAiOptimizationRun(resourceId, uuidV7(), { note }),
    onSuccess: (run) => {
      queryClient.setQueryData(ddcAiQueryKeys.optimizationRun(resourceId, run.id), run)
      setTriggeredRunId(run.id)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.optimizationRunsAll(resourceId) })
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === '56322') setChannelDisabled(true)
      else if (code === '56323') message.warning(t('optimization.alreadyRunning'))
      else if (code === '56321') message.warning(t('optimization.unpublishedResource'))
      else setFailure({ error })
    },
  })

  const updateField = <K extends keyof DdcAiOptimizationPolicyFields>(key: K, value: DdcAiOptimizationPolicyFields[K]) =>
    setEdits((current) => ({ ...current, [key]: value }))

  if (policyQuery.isPending) return <Spin />
  if (policyQuery.isError || !policy || !fields) {
    return <Alert type="error" showIcon title={t('optimization.unavailable', { error: failureText(policyQuery.error, t) })} />
  }

  const runColumns: TableColumnsType<DdcAiOptimizationRunResult> = [
    { title: t('optimization.runNo'), dataIndex: 'runNo', key: 'runNo' },
    { title: t('optimization.trigger'), dataIndex: 'trigger', key: 'trigger', render: (value: string) => value === 'MANUAL' ? t('optimization.manual') : t('optimization.scheduled') },
    { title: t('common.status'), dataIndex: 'state', key: 'state', render: (value: DdcAiRunState) => <Tag color={RUN_STATE_COLORS[value]}>{t(RUN_STATE_LABELS[value])}</Tag> },
    { title: t('optimization.baseVersion'), dataIndex: 'baseVersionNo', key: 'baseVersionNo', render: (value: string | null) => value ?? '—' },
    { title: t('optimization.sampleAndAverage'), key: 'score', render: (_, run) => `${run.sampleCount} / ${run.averageScore ?? '—'}` },
    { title: t('optimization.producedVersion'), dataIndex: 'producedVersionNo', key: 'producedVersionNo', render: (value: string | null, run) =>
      value ? t('optimization.producedVersionLabel', { version: value, status: run.autoPublished ? t('optimization.autoPublishedSuffix') : t('optimization.draftSuffix') }) : '—' },
    { title: t('optimization.error'), dataIndex: 'errorCode', key: 'errorCode', render: (value: string | null, run) =>
      value ? <span title={run.errorMessage ?? undefined}>{value}</span> : '—' },
    { title: t('common.createdAt'), dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => utcTime(value, locale, t) },
  ]

  return (
    <Space orientation="vertical" size="large" className="tianshu-ai-page">
      {channelDisabled && (
        <Alert type="warning" showIcon title={t('optimization.channelDisabled')} />
      )}
      {conflict && (
        <Alert
          type="warning"
          showIcon
          title={t('optimization.conflict')}
          action={<Button size="small" onClick={() => { setConflict(false); void policyQuery.refetch() }}>{t('optimization.refreshRevision')}</Button>}
        />
      )}
      {failure && <Alert type="error" showIcon closable title={failureText(failure.error, t)} onClose={() => setFailure(undefined)} />}

      <Card title={t('optimization.snapshot')}>
        <Descriptions
          size="small"
          column={3}
          items={[
            { key: 'state', label: t('optimization.policyState'), children: <Tag>{t(POLICY_STATE_LABELS[policy.state])}</Tag> },
            { key: 'iterations', label: t('optimization.iterations'), children: `${policy.iterationsDone} / ${policy.maxIterations}` },
            { key: 'failures', label: t('optimization.consecutiveFailures'), children: policy.consecutiveFailures },
            { key: 'evaluatedAt', label: t('optimization.lastEvaluated'), children: utcTime(policy.evaluation?.evaluatedAt, locale, t) },
            { key: 'version', label: t('optimization.evaluatedVersion'), children: policy.evaluation?.versionNo ?? '—' },
            { key: 'samples', label: t('optimization.samplesAndPending'), children:
              `${policy.evaluation?.sampleCount ?? 0} / ${policy.evaluation?.pendingJudgeCount ?? 0}` },
            { key: 'average', label: t('optimization.averageScore'), children: policy.evaluation?.averageScore ?? '—' },
            { key: 'revision', label: t('optimization.revision'), children: policy.persisted ? policy.revision : t('optimization.unsavedDefaults') },
            { key: 'converged', label: t('optimization.convergedAt'), children: utcTime(policy.convergedAt, locale, t) },
          ]}
        />
      </Card>

      <Card title={t('optimization.policy')}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Switch disabled={!mayMutate} aria-label={t('optimization.enable')} checked={fields.enabled} onChange={(value) => updateField('enabled', value)} />
            <span>{t('optimization.enable')}</span>
            <Switch disabled={!mayMutate} aria-label={t('optimization.enableJudge')} checked={fields.judgeEnabled} onChange={(value) => updateField('judgeEnabled', value)} />
            <span>{t('optimization.enableJudge')}</span>
            <Switch disabled={!mayMutate} aria-label={t('optimization.autoPublish')} checked={fields.autoPublish} onChange={(value) => updateField('autoPublish', value)} />
            <span>{t('optimization.autoPublish')}</span>
          </Space>
          <Space wrap>
            <label>{t('optimization.scoreThreshold')} <InputNumber disabled={!mayMutate} aria-label={t('optimization.scoreThreshold')} min={1} max={100} value={fields.scoreThreshold}
              onChange={(value) => updateField('scoreThreshold', Number(value ?? 1))} /></label>
            <label>{t('optimization.minSamples')} <InputNumber disabled={!mayMutate} aria-label={t('optimization.minSamples')} min={1} max={100000} value={fields.minSamples}
              onChange={(value) => updateField('minSamples', Number(value ?? 1))} /></label>
            <label>{t('optimization.maxIterations')} <InputNumber disabled={!mayMutate} aria-label={t('optimization.maxIterations')} min={1} max={50} value={fields.maxIterations}
              onChange={(value) => updateField('maxIterations', Number(value ?? 1))} /></label>
          </Space>
          <Space wrap>
            <label>{t('optimization.evaluationWindow')} <Input disabled={!mayMutate} aria-label={t('optimization.evaluationWindow')} style={{ width: 120 }} value={fields.evaluationWindow}
              onChange={(event) => updateField('evaluationWindow', event.target.value)} /></label>
            <label>{t('optimization.cooldown')} <Input disabled={!mayMutate} aria-label={t('optimization.cooldown')} style={{ width: 120 }} value={fields.cooldown}
              onChange={(event) => updateField('cooldown', event.target.value)} /></label>
            <label>{t('optimization.optimizerModel')} <Input disabled={!mayMutate} aria-label={t('optimization.optimizerAlias')} style={{ width: 180 }} value={fields.optimizerModelAlias}
              onChange={(event) => updateField('optimizerModelAlias', event.target.value)} /></label>
            <label>{t('optimization.judgeModel')} <Input disabled={!mayMutate} aria-label={t('optimization.judgeAlias')} style={{ width: 180 }} value={fields.judgeModelAlias}
              onChange={(event) => updateField('judgeModelAlias', event.target.value)} /></label>
          </Space>
          <Input.TextArea readOnly={!mayMutate} aria-label={t('optimization.instruction')} rows={3} maxLength={4096} value={fields.optimizerInstruction}
            placeholder={t('optimization.instructionPlaceholder')}
            onChange={(event) => updateField('optimizerInstruction', event.target.value)} />
          {errors.map((error) => <Typography.Text key={error} type="danger">{error}</Typography.Text>)}
          <Space wrap>
            <PermissionButton resourceKey="tianshu.button.AiOptimizationPanel.ai_publish" type="primary" loading={saveMutation.isPending} disabled={!mayMutate || errors.length > 0}
              onClick={() => saveMutation.mutate(false)}>{t('optimization.savePolicy')}</PermissionButton>
            <PermissionButton resourceKey="tianshu.button.AiOptimizationPanel.ai_publish" loading={saveMutation.isPending} disabled={!mayMutate || errors.length > 0 || runActive || !policy.persisted
              || policy.activeRunId !== null || policy.state === 'ARMED'}
              onClick={() => saveMutation.mutate(true)}>{t('optimization.saveAndRearm')}</PermissionButton>
          </Space>
        </Space>
      </Card>

      <Card title={t('optimization.manualOptimization')}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Input disabled={!mayMutate} aria-label={t('optimization.runNote')} style={{ width: 320 }} maxLength={512} value={note} placeholder={t('optimization.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)} />
            <PermissionButton resourceKey="tianshu.button.AiOptimizationPanel.ai_publish" type="primary" loading={triggerMutation.isPending} disabled={!mayMutate || !triggerWritable || runActive || !policy.persisted}
              onClick={() => triggerMutation.mutate()}>{t('optimization.runNow')}</PermissionButton>
          </Space>
          {trackedRun && (
            <Descriptions
              size="small"
              column={4}
              items={[
                { key: 'run', label: t('optimization.currentRun'), children: trackedRun.runNo },
                { key: 'state', label: t('common.status'), children: <Tag color={RUN_STATE_COLORS[trackedRun.state]}>{t(RUN_STATE_LABELS[trackedRun.state])}</Tag> },
                { key: 'produced', label: t('optimization.producedVersion'), children: trackedRun.producedVersionNo ?? '—' },
                { key: 'error', label: t('optimization.error'), children: trackedRun.errorCode ?? '—' },
              ]}
            />
          )}
        </Space>
      </Card>

      <Card title={t('optimization.runs')}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Radio.Group
            optionType="button"
            value={runStateFilter}
            onChange={(event) => { setRunStateFilter(event.target.value); setRunPageNo(1) }}
            options={[
              { label: t('optimization.all'), value: 'ALL' },
              ...(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'] as const)
                .map((state) => ({ label: t(RUN_STATE_LABELS[state]), value: state })),
            ]}
          />
          <Table<DdcAiOptimizationRunResult>
            rowKey="id"
            size="small"
            loading={runsQuery.isPending}
            columns={runColumns}
            dataSource={runsQuery.data?.records ?? []}
            pagination={{
              current: runPageNo,
              pageSize: RUN_PAGE_SIZE,
              total: runsQuery.data?.page.total ?? 0,
              onChange: setRunPageNo,
            }}
          />
        </Space>
      </Card>
    </Space>
  )
}
