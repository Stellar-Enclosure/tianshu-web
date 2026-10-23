import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Input, InputNumber, Radio, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMemo, useState } from 'react'
import { DdcApiError } from '../api/client'
import { ddcAiQueryKeys, pageAiUsageFeedback } from '../api/ai'
import type {
  DdcAiJudgeState,
  DdcAiOutcome,
  DdcAiScoreSource,
  DdcAiUsageFeedbackPageParams,
  DdcAiUsageFeedbackResult,
} from '../api/types'
import { usePageMessages, type AdminTranslate } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'

type Props = {
  resourceId: string
}

type Filters = {
  versionNo: string
  outcome: DdcAiOutcome | 'ALL'
  scoreSource: DdcAiScoreSource | 'ALL'
  maxScore: number | null
}

const PAGE_SIZE = 20
const EMPTY_FILTERS: Filters = { versionNo: '', outcome: 'ALL', scoreSource: 'ALL', maxScore: null }
const OUTCOME_COLORS: Record<DdcAiOutcome, string> = { SUCCESS: 'success', FAILURE: 'error', UNKNOWN: 'default' }

const failureText = (error: unknown, t: AdminTranslate): string => {
  if (error instanceof DdcApiError && error.status === 403) return t('feedback.readDenied')
  return formatAdminError(error, t)
}

const toParams = (filters: Filters, pageNo: number): DdcAiUsageFeedbackPageParams => ({
  versionNo: /^[1-9][0-9]{0,18}$/.test(filters.versionNo.trim()) ? filters.versionNo.trim() : undefined,
  outcome: filters.outcome === 'ALL' ? undefined : filters.outcome,
  scoreSource: filters.scoreSource === 'ALL' ? undefined : filters.scoreSource,
  maxScore: filters.maxScore ?? undefined,
  pageNo,
  pageSize: PAGE_SIZE,
})

const excerpt = (label: string, value: string | null, t: AdminTranslate) => (
  <div>
    <Typography.Text strong>{label}</Typography.Text>
    {value === null
      ? <Typography.Paragraph type="secondary">{t('feedback.notReported')}</Typography.Paragraph>
      : <pre className="tianshu-ai-excerpt" aria-label={label} style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{value}</pre>}
  </div>
)

export default function AiFeedbackPanel({ resourceId }: Props) {
  const { t, locale } = usePageMessages('tianshu.ai.editor')
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [pageNo, setPageNo] = useState(1)
  const params = useMemo(() => toParams(applied, pageNo), [applied, pageNo])
  const feedbackQuery = useQuery({
    queryKey: ddcAiQueryKeys.usageFeedback(resourceId, params),
    queryFn: ({ signal }) => pageAiUsageFeedback(resourceId, params, { signal }),
  })

  const columns: TableColumnsType<DdcAiUsageFeedbackResult> = [
    {
      title: t('feedback.occurredAt'),
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      render: (value: string) => <span title={t('feedback.utcTime', { value })}>{formatTime(value, locale)}</span>,
    },
    { title: t('feedback.version'), dataIndex: 'versionNo', key: 'versionNo', render: (value: string | null) => value ?? '—' },
    { title: t('feedback.outcome'), dataIndex: 'outcome', key: 'outcome', render: (value: DdcAiOutcome) => <Tag color={OUTCOME_COLORS[value]}>{t(`feedback.outcome.${value}`)}</Tag> },
    { title: t('feedback.score'), dataIndex: 'effectiveScore', key: 'effectiveScore', render: (value: number | null) => value ?? '—' },
    { title: t('feedback.scoreSource'), dataIndex: 'scoreSource', key: 'scoreSource', render: (value: DdcAiScoreSource) => t(`feedback.source.${value}`) },
    { title: t('feedback.judgeState'), dataIndex: 'judgeState', key: 'judgeState', render: (value: DdcAiJudgeState, row) =>
      row.judgeError ? <span title={row.judgeError}>{t(`feedback.judgeState.${value}`)}</span> : t(`feedback.judgeState.${value}`) },
    { title: t('feedback.latency'), dataIndex: 'latencyMs', key: 'latencyMs', render: (value: number | null) => value ?? '—' },
    { title: t('feedback.caller'), key: 'caller', render: (_, row) => `${row.appCode} · ${row.env}` },
    { title: t('feedback.usageId'), dataIndex: 'usageId', key: 'usageId', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
  ]

  return (
    <Card title={t('feedback.title')}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Space wrap>
          <Input aria-label={t('feedback.versionNo')} style={{ width: 100 }} placeholder={t('feedback.versionNo')} value={draft.versionNo}
            onChange={(event) => setDraft({ ...draft, versionNo: event.target.value })} />
          <Radio.Group
            optionType="button"
            aria-label={t('feedback.outcomeFilter')}
            value={draft.outcome}
            onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}
            options={[
              { label: t('feedback.allOutcomes'), value: 'ALL' },
              { label: t('feedback.outcome.SUCCESS'), value: 'SUCCESS' },
              { label: t('feedback.outcome.FAILURE'), value: 'FAILURE' },
              { label: t('feedback.outcome.UNKNOWN'), value: 'UNKNOWN' },
            ]}
          />
          <Radio.Group
            optionType="button"
            aria-label={t('feedback.scoreSourceFilter')}
            value={draft.scoreSource}
            onChange={(event) => setDraft({ ...draft, scoreSource: event.target.value })}
            options={[
              { label: t('feedback.allScoreSources'), value: 'ALL' },
              { label: t('feedback.source.EXPLICIT'), value: 'EXPLICIT' },
              { label: t('feedback.source.JUDGE'), value: 'JUDGE' },
              { label: t('feedback.source.NONE'), value: 'NONE' },
            ]}
          />
          <InputNumber aria-label={t('feedback.maxScore')} min={0} max={100} placeholder={t('feedback.maxScorePlaceholder')} value={draft.maxScore}
            onChange={(value) => setDraft({ ...draft, maxScore: value === null ? null : Number(value) })} />
          <Button type="primary" onClick={() => { setApplied(draft); setPageNo(1) }}>{t('feedback.filter')}</Button>
          <Button onClick={() => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPageNo(1) }}>{t('common.reset')}</Button>
        </Space>
        {feedbackQuery.isError && <Alert type="error" showIcon title={failureText(feedbackQuery.error, t)} />}
        <Table<DdcAiUsageFeedbackResult>
          rowKey="id"
          size="small"
          loading={feedbackQuery.isPending}
          columns={columns}
          dataSource={feedbackQuery.data?.records ?? []}
          expandable={{
            expandedRowRender: (row) => (
              <Space orientation="vertical" style={{ width: '100%' }}>
                {excerpt(t('feedback.inputExcerpt'), row.inputExcerpt, t)}
                {excerpt(t('feedback.outputExcerpt'), row.outputExcerpt, t)}
                <Typography.Text type="secondary">
                  {t('feedback.traceAndJudgedAt', {
                    traceId: row.traceId ?? '—',
                    judgedAt: formatTime(row.judgedAt ?? undefined, locale),
                  })}
                </Typography.Text>
              </Space>
            ),
          }}
          pagination={{
            current: pageNo,
            pageSize: PAGE_SIZE,
            total: feedbackQuery.data?.page.total ?? 0,
            onChange: setPageNo,
          }}
        />
      </Space>
    </Card>
  )
}
