import {useEffect, useRef, useState} from 'react'
import {Alert, Button, Card, Select, Space, Spin, Table, Typography} from 'antd'
import {
  createPageI18nLoader,
  type PageI18nLoader,
  type PageI18nResult,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {getI18nBundle, type DdcI18nScope} from '../api/i18n'
import {useAuth} from '../auth/AuthContext'
import {usePageMessages} from '../i18n/AdminI18nProvider'
import {AdminMessageError, formatAdminError} from '../i18n/errors'

type Props = {
  scope: DdcI18nScope
  pageCode: string
  defaultLocale: string
  locales: string[]
  publishedVersion: string | null
}

type PreviewOutcome = {
  requestKey: string
  result?: PageI18nResult
  error?: unknown
}

export default function I18nBundlePreview(props: Props) {
  const {tenantId, sessionGeneration} = useAuth()
  const identity = JSON.stringify([tenantId, sessionGeneration])
  const {bizCode, namespaceCode, env, appCode} = props.scope
  const key = JSON.stringify([identity, bizCode, namespaceCode, env, appCode, props.pageCode])
  return <PublishedBundlePreview key={key} {...props} identity={identity} />
}

function PublishedBundlePreview({
  scope, pageCode, defaultLocale, locales, publishedVersion, identity,
}: Props & {identity: string}) {
  const {t} = usePageMessages('tianshu.i18n')
  const [locale, setLocale] = useState(defaultLocale)
  const [refresh, setRefresh] = useState(0)
  const [outcome, setOutcome] = useState<PreviewOutcome>()
  const loaderRef = useRef<PageI18nLoader | null>(null)
  const {bizCode, namespaceCode, env, appCode} = scope
  const requestKey = JSON.stringify([pageCode, locale, publishedVersion, refresh])

  useEffect(() => {
    const loader = createPageI18nLoader({fetchBundle: getI18nBundle})
    loader.setIdentity(identity)
    loaderRef.current = loader
    return () => {
      loaderRef.current = null
      loader.dispose()
    }
  }, [identity])

  useEffect(() => {
    const loader = loaderRef.current
    if (!loader || publishedVersion === null) return
    let active = true
    void loader.load(
      {bizCode, namespaceCode, env, appCode, pageCode, locale},
      {refresh: true},
    ).then((result) => {
      if (active) setOutcome({requestKey, result})
    }, (error: unknown) => {
      if (active) setOutcome({requestKey, error: error instanceof Error ? error : new AdminMessageError('preview.loadFailed')})
    })
    return () => { active = false }
  }, [identity, bizCode, namespaceCode, env, appCode, pageCode, locale, publishedVersion, requestKey])

  const current = outcome?.requestKey === requestKey ? outcome : undefined
  const result = current?.result
  const choices = [...new Set([defaultLocale, ...locales, locale])]
  return (
    <Card title={t('preview.title')} size="small">
      <Space direction="vertical" style={{width: '100%'}}>
        <Typography.Text type="secondary">
          {t('preview.description')}
        </Typography.Text>
        <Space wrap>
          <Select aria-label={t('preview.locale')} value={locale} onChange={setLocale} style={{minWidth: 160}}
            options={choices.map((value) => ({value, label: value}))} />
          <Button onClick={() => setRefresh((value) => value + 1)}
            disabled={publishedVersion === null || !current}>{t('preview.refresh')}</Button>
        </Space>
        {publishedVersion === null ? <Alert type="info" message={t('preview.unpublished')} /> : (
          <>
            {!current && <Spin aria-label={t('preview.loading')} />}
            {current?.error !== undefined && <Alert type="error" showIcon message={formatAdminError(current.error, t)} />}
            {result?.source === 'stale' && (
              <Alert type="warning" showIcon message={t('preview.stale')} />
            )}
            {result && (
              <>
                <Table size="small" rowKey="key" pagination={{pageSize: 10, showSizeChanger: false}}
                  dataSource={Object.keys(result.messages).sort().map((key) => ({key, text: result.t(key)}))}
                  columns={[
                    {title: t('fields.key'), dataIndex: 'key'},
                    {title: t('preview.renderedText'), dataIndex: 'text'},
                  ]} />
                <details>
                  <summary>{t('preview.showJson')}</summary>
                  <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify({
                    pageCode: result.pageCode,
                    locale: result.locale,
                    defaultLocale: result.defaultLocale,
                    version: result.version,
                    messages: result.messages,
                  }, null, 2)}</pre>
                </details>
              </>
            )}
          </>
        )}
      </Space>
    </Card>
  )
}
