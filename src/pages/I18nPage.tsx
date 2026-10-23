import {useAdminI18n, usePageMessages} from '../i18n/AdminI18nProvider'
import {formatAdminError} from '../i18n/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ddcI18nQueryKeys, pageI18nPages, type DdcI18nPageSummary } from '../api/i18n'
import { useAuth } from '../auth/AuthContext'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { configuredInitialScope } from '../lib/scopeDefaults'
import I18nPageEditor from './I18nPageEditor'
import {initializeAdminI18n} from '../api/adminI18n'

const scopeIsComplete = (scope: ScopeValue): boolean => Object.values(scope).every((value) => value.trim() !== '')

function I18nPageContent() {
  const {t} = usePageMessages('tianshu.i18n')
  const {bootstrap, refresh} = useAdminI18n()
  const {message} = App.useApp()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [scope, setScope] = useState<ScopeValue>(() => ({
    bizCode: searchParams.get('bizCode') ?? configuredInitialScope.bizCode,
    namespaceCode: searchParams.get('namespaceCode') ?? configuredInitialScope.namespaceCode,
    env: searchParams.get('env') ?? configuredInitialScope.env,
    appCode: searchParams.get('appCode') ?? configuredInitialScope.appCode,
  }))
  const [submittedScope, setSubmittedScope] = useState(scope)
  const [pageNo, setPageNo] = useState(1)
  const [selectedPage, setSelectedPage] = useState<string | null>(null)
  const leaveGuard = useRef<() => Promise<boolean>>(async () => true)
  const onGuardChange = useCallback((guard: () => Promise<boolean>) => { leaveGuard.current = guard }, [])
  const initialize = useMutation({
    mutationFn: initializeAdminI18n,
    onSuccess: async (result) => {
      message.success(t('admin.initialized', result))
      await queryClient.invalidateQueries({queryKey: ddcI18nQueryKeys.all()})
      await refresh()
    },
    onError: (error) => message.error(formatAdminError(error, t)),
  })
  const completeScope = scopeIsComplete(submittedScope)
  const params = { ...submittedScope, pageNo, pageSize: 20 }
  const pagesQuery = useQuery({
    queryKey: completeScope ? ddcI18nQueryKeys.pages(params) : [...ddcI18nQueryKeys.all(), 'scope-required'],
    queryFn: ({ signal }) => pageI18nPages(params, { signal }),
    enabled: completeScope,
  })
  const selectPage = async (id: string) => {
    if (id === selectedPage || !(await leaveGuard.current())) return
    setSelectedPage(id)
  }
  const columns: TableColumnsType<DdcI18nPageSummary> = [
    { title: t('fields.pageCode'), dataIndex: 'pageCode', key: 'pageCode', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    { title: t('fields.name'), dataIndex: 'name', key: 'name' },
    { title: t('fields.defaultLocale'), dataIndex: 'defaultLocale', key: 'defaultLocale' },
    { title: t('fields.publishedVersion'), key: 'publishedVersion', render: (_, row) => row.publishedVersion === null
      ? <Tag>{t('status.unpublished')}</Tag> : <Tag color="green">{t('status.version', {version: row.publishedVersion})}</Tag> },
    { title: t('common.actions'), key: 'actions', render: (_, row) => <Button onClick={() => void selectPage(row.id)}
      aria-label={t('actions.editPage', { pageCode: row.pageCode })}>{t('common.edit')}</Button> },
  ]

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <Card title={t('admin.title')}>
        <Space direction="vertical">
          <Typography.Text type="secondary">{t('admin.description')}</Typography.Text>
          <Space wrap>
            <Button disabled={!bootstrap} onClick={() => void (async () => {
              if (!bootstrap || !(await leaveGuard.current())) return
              setSelectedPage(null)
              setScope(bootstrap.scope)
              setSubmittedScope(bootstrap.scope)
              setPageNo(1)
            })()}>{t('admin.open')}</Button>
            <Button disabled={!bootstrap?.canInitialize} loading={initialize.isPending}
              onClick={() => void (async () => {
                if (await leaveGuard.current()) initialize.mutate()
              })()}>{t('admin.initialize')}</Button>
          </Space>
        </Space>
      </Card>
      <Card title={t('scope.title')}>
        <Space wrap>
          <ScopeSelects value={scope} onChange={setScope} />
          <Button type="primary" disabled={!scopeIsComplete(scope)} onClick={() => {
            void (async () => {
              if (!(await leaveGuard.current())) return
              setSelectedPage(null)
              setSubmittedScope(scope)
              setPageNo(1)
            })()
          }}>{t('actions.searchPages')}</Button>
        </Space>
      </Card>
      {!completeScope && <Alert type="info" showIcon title={t('scope.required')} />}
      {completeScope && pagesQuery.isError && <Alert type="error" showIcon title={t('feedback.listFailed')}
        description={formatAdminError(pagesQuery.error, t)} action={<Button aria-label={t('common.retry')} onClick={() => void pagesQuery.refetch()}>{t('common.retry')}</Button>} />}
      {completeScope && !pagesQuery.isError && (
        <Card title={t('list.title')} extra={<Button type="primary" disabled={pagesQuery.isPending}
          onClick={() => void selectPage('new')}>{t('actions.createPage')}</Button>}>
          <Table<DdcI18nPageSummary> rowKey="id" columns={columns} dataSource={pagesQuery.data?.records ?? []}
            loading={pagesQuery.isPending || pagesQuery.isFetching} locale={{ emptyText: t('empty.pages') }}
            pagination={{ current: pageNo, pageSize: 20, total: pagesQuery.data?.page.total ?? 0,
              showSizeChanger: false, showTotal: (total) => t('list.total', { total }), onChange: setPageNo }} />
        </Card>
      )}
      {selectedPage && <I18nPageEditor key={selectedPage} pageId={selectedPage === 'new' ? null : selectedPage}
        scope={submittedScope} onGuardChange={onGuardChange} onCreated={(page) => setSelectedPage(page.id)} />}
    </Space>
  )
}

export default function I18nPage() {
  const { tenantId, sessionGeneration } = useAuth()
  return <I18nPageContent key={`${tenantId}:${sessionGeneration}`} />
}
