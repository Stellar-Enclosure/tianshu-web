import {useEffect, useState} from 'react'
import {Alert, Button, Card, Select, Space, Spin, Table, Typography} from 'antd'
import {getI18nBundle, type DdcCatalogTarget, type DdcI18nBundle} from '../api/i18n'
import {useAuth} from '../auth/AuthContext'
import {usePageMessages} from '../i18n/AdminI18nProvider'
import {AdminMessageError, formatAdminError} from '../i18n/errors'

type Props = {
  scope: DdcCatalogTarget
  pageCode: string
  defaultLocale: string
  locales: string[]
  publishedVersion: string | null
}

type PreviewOutcome = {
  requestKey: string
  result?: DdcI18nBundle
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
  const {tenantId} = useAuth()
  const {bizCode, namespaceCode, env, appCode} = scope
  const requestKey = JSON.stringify([pageCode, locale, publishedVersion, refresh])

  useEffect(() => {
    if (publishedVersion === null) return
    const controller = new AbortController()
    void getI18nBundle({...scope, pageCode, locale}, {signal: controller.signal}).then(result => {
      if (controller.signal.aborted) return
      if (result.pageCode !== pageCode || result.locale !== locale || result.catalogActivationVersion !== scope.catalogActivationVersion
        || result.catalogScope.catalogScopeId !== scope.catalogScopeId || result.catalogScope.tenantId !== tenantId
        || result.catalogScope.businessCode !== bizCode || result.catalogScope.namespaceCode !== namespaceCode
        || result.catalogScope.applicationCode !== appCode || result.catalogScope.environment !== env) throw new Error('AUTH_CATALOG_SCOPE_MISMATCH')
      setOutcome({requestKey, result})
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setOutcome({requestKey, error: error instanceof Error ? error : new AdminMessageError('preview.loadFailed')})
    })
    return () => controller.abort()
  }, [identity, scope, tenantId, bizCode, namespaceCode, env, appCode, pageCode, locale, publishedVersion, requestKey])

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
            {result && (
              <>
                <Table size="small" rowKey="key" pagination={{pageSize: 10, showSizeChanger: false}}
                  dataSource={Object.keys(result.messages).sort().map((key) => ({key, text: result.messages[key]}))}
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
