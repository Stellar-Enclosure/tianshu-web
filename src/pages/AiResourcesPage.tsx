import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DdcApiError } from '../api/client'
import {
  createAiResource,
  deleteAiResource,
  ddcAiQueryKeys,
  pageAiResources,
} from '../api/ai'
import type {
  DdcAiContent,
  DdcAiCreateCommand,
  DdcAiKind,
  DdcAiResourcePageParams,
  DdcAiResourceSummary,
} from '../api/types'
import AdminPageHeader from '../components/page/AdminPageHeader'
import ScopeSelects, { type ScopeValue } from '../components/scope/ScopeSelects'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'

type Props = { kind: DdcAiKind }

const emptyScope: ScopeValue = { bizCode: '', namespaceCode: '', env: '', appCode: '' }
const PAGE_SIZE = 20

const scopeFromSearch = (params: URLSearchParams): ScopeValue => ({
  bizCode: params.get('bizCode') ?? '',
  namespaceCode: params.get('namespaceCode') ?? '',
  env: params.get('env') ?? '',
  appCode: params.get('appCode') ?? '',
})

const scopeIsComplete = (scope: ScopeValue): boolean =>
  Object.values(scope).every((value) => value.trim() !== '')

const pageNumberFromSearch = (params: URLSearchParams): number => {
  const value = Number(params.get('pageNo') ?? 1)
  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

const isForbidden = (error: unknown): boolean =>
  error instanceof DdcApiError && error.status === 403

const initialDraft = (kind: DdcAiKind): DdcAiContent => kind === 'PROMPT'
  ? { promptText: '', nodes: [] }
  : {
    promptText: null,
    nodes: [
      { path: '', nodeType: 'DIRECTORY', content: null },
      { path: 'SKILL.md', nodeType: 'FILE', content: '' },
    ],
  }

export default function AiResourcesPage({ kind }: Props) {
  const { t, locale } = usePageMessages('tianshu.ai.resources')
  const fieldsWritable = useDdcWritable('DdcAiCreateCommand')
  const mayMutate = useDdcPermission('tianshu.button.AiResourcesPage.ai_write') && fieldsWritable
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draftScope, setDraftScope] = useState(() => scopeFromSearch(searchParams))
  const [resourceKeyPrefix, setResourceKeyPrefix] = useState(searchParams.get('resourceKeyPrefix') ?? '')
  const [createOpen, setCreateOpen] = useState(false)
  const [createFailure, setCreateFailure] = useState<{ error: unknown }>()
  const [resourceKey, setResourceKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [promptText, setPromptText] = useState('')
  const [skillFileText, setSkillFileText] = useState('')
  useEffect(() => {
    setDraftScope(scopeFromSearch(searchParams))
    setResourceKeyPrefix(searchParams.get('resourceKeyPrefix') ?? '')
  }, [searchParams])

  const submittedScope = useMemo(() => scopeFromSearch(searchParams), [searchParams])
  const pageNo = pageNumberFromSearch(searchParams)
  const params: DdcAiResourcePageParams = {
    ...submittedScope,
    kind,
    resourceKeyPrefix: searchParams.get('resourceKeyPrefix') || undefined,
    pageNo,
    pageSize: PAGE_SIZE,
  }
  const completeScope = scopeIsComplete(submittedScope)
  const resourcesQuery = useQuery({
    queryKey: completeScope
      ? ddcAiQueryKeys.resources(params)
      : [...ddcAiQueryKeys.all(), 'resources', 'scope-required', kind],
    queryFn: ({ signal }) => pageAiResources(params, { signal }),
    enabled: completeScope,
  })

  const createMutation = useMutation({
    mutationFn: (command: DdcAiCreateCommand) => createAiResource(command),
    onSuccess: async (result) => {
      message.success(t('resources.created'))
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
      setCreateOpen(false)
      navigate(`/ai/resources/${encodeURIComponent(result.resource.id)}`)
    },
    onError: (error: unknown) => setCreateFailure({ error }),
  })

  const deleteMutation = useMutation({
    mutationFn: (resource: DdcAiResourceSummary) =>
      deleteAiResource(resource.id, resource.revision),
    onSuccess: async () => {
      message.success(t('resources.deleted'))
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
    },
    onError: (error: unknown) => message.error(
      isForbidden(error) ? t('resources.deleteDenied') : formatAdminError(error, t),
    ),
  })

  const updateUrl = (scope: ScopeValue, prefix: string, nextPage = 1) => {
    const next = new URLSearchParams()
    Object.entries(scope).forEach(([key, value]) => {
      if (value.trim() !== '') next.set(key, value.trim())
    })
    if (prefix.trim() !== '') next.set('resourceKeyPrefix', prefix.trim())
    if (nextPage > 1) next.set('pageNo', String(nextPage))
    setSearchParams(next)
  }

  const openCreate = () => {
    if (!mayMutate) return
    setResourceKey('')
    setDisplayName('')
    setDescription('')
    setPromptText('')
    setSkillFileText('')
    setCreateFailure(undefined)
    createMutation.reset()
    setCreateOpen(true)
  }

  const confirmDelete = (resource: DdcAiResourceSummary) => {
    if (!mayMutate) return
    modal.confirm({
      title: t('resources.deleteTitle', { name: resource.displayName }),
      content: t('resources.deleteWarning'),
      okText: t('resources.confirmDelete'),
      okButtonProps: { danger: true, loading: deleteMutation.isPending },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(resource),
    })
  }

  const columns: TableColumnsType<DdcAiResourceSummary> = [
    {
      title: t('resources.resourceKey'),
      dataIndex: 'resourceKey',
      key: 'resourceKey',
      render: (value: string, row) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: t('common.name'), dataIndex: 'displayName', key: 'displayName' },
    {
      title: t('common.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string) => value || '—',
    },
    {
      title: t('resources.publicationStatus'),
      key: 'currentVersionNo',
      render: (_: unknown, row) => row.currentVersionNo === null
        ? <Tag>{t('resources.unpublished')}</Tag>
        : <Tag color="green">{t('resources.currentVersion', { version: row.currentVersionNo })}</Tag>,
    },
    {
      title: t('resources.lastModified'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (value: string) => formatTime(value, locale),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, row) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/ai/resources/${encodeURIComponent(row.id)}`)}>
            {t('common.edit')}
          </Button>
          <PermissionButton resourceKey="tianshu.button.AiResourcesPage.ai_write" danger type="link" onClick={() => confirmDelete(row)}>
            {t('common.delete')}
          </PermissionButton>
        </Space>
      ),
    },
  ]

  const submitCreate = () => {
    setCreateFailure(undefined)
    const draft = initialDraft(kind)
    if (kind === 'PROMPT') {
      draft.promptText = promptText
    } else {
      draft.nodes = draft.nodes.map((node) => node.path === 'SKILL.md'
        ? { ...node, content: skillFileText }
        : node)
    }
    createMutation.mutate({
      scope: submittedScope,
      kind,
      resourceKey,
      displayName,
      description,
      draft,
    })
  }

  const denied = isForbidden(resourcesQuery.error)
  const queryFailure = resourcesQuery.isError && !denied

  return (
    <Space orientation="vertical" size="large" className="tianshu-ai-page">
      <AdminPageHeader
        title={kind === 'PROMPT' ? t('resources.promptTitle') : t('resources.skillTitle')}
        description={t('resources.description')}
      />

      <Card>
        <Space orientation="vertical" size="middle" className="tianshu-ai-page__filters">
          <ScopeSelects value={draftScope} onChange={setDraftScope} />
          <Space wrap>
            <Input
              aria-label={t('resources.keyPrefix')}
              placeholder={t('resources.keyPrefix')}
              maxLength={128}
              value={resourceKeyPrefix}
              onChange={(event) => setResourceKeyPrefix(event.target.value)}
              onPressEnter={() => updateUrl(draftScope, resourceKeyPrefix)}
            />
            <Button
              type="primary"
              disabled={!scopeIsComplete(draftScope)}
              onClick={() => updateUrl(draftScope, resourceKeyPrefix)}
            >
              {t('common.search')}
            </Button>
            <Button onClick={() => {
              setDraftScope({ ...emptyScope })
              setResourceKeyPrefix('')
              updateUrl(emptyScope, '')
            }}>
              {t('common.reset')}
            </Button>
          </Space>
        </Space>
      </Card>

      {!completeScope && (
        <Alert type="info" showIcon title={t('resources.scopeRequired')} />
      )}
      {denied && (
        <Alert type="error" showIcon title={t('resources.readDenied')} description={formatAdminError(resourcesQuery.error, t)} />
      )}
      {queryFailure && (
        <Alert type="error" showIcon title={t('resources.readFailed')} description={formatAdminError(resourcesQuery.error, t)} />
      )}

      {completeScope && !denied && !queryFailure && (
        <Card
          title={kind === 'PROMPT' ? t('resources.promptDrafts') : t('resources.skillDrafts')}
          extra={(
            <PermissionButton resourceKey="tianshu.button.AiResourcesPage.ai_write" type="primary" disabled={resourcesQuery.isPending} onClick={openCreate}>
              {t('resources.createKind', { kind: t(`resources.kind.${kind}`) })}
            </PermissionButton>
          )}
        >
          <Table<DdcAiResourceSummary>
            rowKey="id"
            columns={columns}
            dataSource={resourcesQuery.data?.records ?? []}
            loading={resourcesQuery.isPending || resourcesQuery.isFetching}
            locale={{ emptyText: t('resources.emptyKind', { kind: t(`resources.kind.${kind}`) }) }}
            pagination={{
              current: pageNo,
              pageSize: PAGE_SIZE,
              total: resourcesQuery.data?.page.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => t('common.total', { total }),
              onChange: (nextPage) => updateUrl(submittedScope, params.resourceKeyPrefix ?? '', nextPage),
            }}
          />
        </Card>
      )}

      <Modal
        title={t('resources.createKindDraft', { kind: t(`resources.kind.${kind}`) })}
        open={createOpen}
        onCancel={() => {
          if (!createMutation.isPending) setCreateOpen(false)
        }}
        onOk={() => { if (mayMutate) submitCreate() }}
        okButtonProps={{disabled: !mayMutate}}
        okText={t('resources.createDraft')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form disabled={!mayMutate} layout="vertical">
          {createFailure && <Alert type="error" showIcon title={isForbidden(createFailure.error) ? t('resources.createDenied') : formatAdminError(createFailure.error, t)} />}
          <Form.Item label={t('resources.resourceKey')} required>
            <Input
              aria-label={t('resources.resourceKey')}
              maxLength={128}
              value={resourceKey}
              onChange={(event) => setResourceKey(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('resources.displayName')} required>
            <Input
              aria-label={t('resources.displayName')}
              maxLength={128}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('common.description')}>
            <Input.TextArea
              aria-label={t('common.description')}
              maxLength={2048}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Form.Item>
          {kind === 'PROMPT' ? (
            <Form.Item label={t('resources.promptContent')} required>
              <Input.TextArea
                aria-label={t('resources.promptContent')}
                rows={12}
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
              />
            </Form.Item>
          ) : (
            <Form.Item label={t('resources.skillInitialContent')}>
              <Input.TextArea
                aria-label={t('resources.skillInitialContent')}
                rows={8}
                value={skillFileText}
                onChange={(event) => setSkillFileText(event.target.value)}
              />
              <Typography.Text type="secondary">{t('resources.initialFileHint')}</Typography.Text>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  )
}
