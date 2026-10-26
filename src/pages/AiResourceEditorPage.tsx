import {useDdcWritable} from '../permissions/FieldCatalog'
import {PermissionButton, useDdcPermission} from '../permissions/access'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileTextOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Tabs,
  Tree,
  Typography,
} from 'antd'
import type { DataNode } from 'antd/es/tree'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { BlockerFunction } from 'react-router-dom'
import { DdcApiError } from '../api/client'
import {
  deleteAiResource,
  ddcAiQueryKeys,
  getAiResource,
  replaceAiDraft,
} from '../api/ai'
import type {
  DdcAiContent,
  DdcAiNode,
  DdcAiResourceResult,
  DdcAiResourceSummary,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import AdminPageHeader from '../components/page/AdminPageHeader'
import { usePageMessages, type AdminTranslate } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'
import { formatTime } from '../lib/query'
import AiFeedbackPanel from './AiFeedbackPanel'
import AiOptimizationPanel from './AiOptimizationPanel'
import AiVersionsPanel from './AiVersionsPanel'

type DraftBuffer = {
  displayName: string
  description: string
  draft: DdcAiContent
}

type NodeOperation = 'new-file' | 'new-directory' | 'rename' | 'move'

type NodeDialogState = {
  operation: NodeOperation
  sourcePath?: string
}

const toBuffer = (result: DdcAiResourceResult): DraftBuffer => ({
  displayName: result.resource.displayName,
  description: result.resource.description,
  draft: {
    promptText: result.draft.promptText,
    nodes: result.draft.nodes.map((node) => ({ ...node })),
  },
})

const sameBuffer = (left: DraftBuffer | null, right: DraftBuffer | null): boolean =>
  left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right)

const parentPath = (path: string): string => {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const isDirectory = (nodes: DdcAiNode[], path: string): boolean =>
  nodes.some((node) => node.path === path && node.nodeType === 'DIRECTORY')

const isValidPath = (path: string): boolean => {
  if (path === '' || path.startsWith('/') || path.endsWith('/') || path.includes('\\')) return false
  const segments = path.split('/')
  return segments.length <= 16
    && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'
      && !/[\u0000-\u001f\u007f]/.test(segment))
    && new TextEncoder().encode(path).length <= 1024
}

const replaceSubtreePrefix = (nodes: DdcAiNode[], from: string, to: string): DdcAiNode[] =>
  nodes.map((node) => {
    if (node.path === from) return { ...node, path: to }
    if (node.path.startsWith(`${from}/`)) {
      return { ...node, path: `${to}${node.path.slice(from.length)}` }
    }
    return node
  })

const subTreeSize = (nodes: DdcAiNode[], path: string): number =>
  nodes.filter((node) => node.path === path || node.path.startsWith(`${path}/`)).length

const treeData = (nodes: DdcAiNode[], t: AdminTranslate): DataNode[] => {
  const root: DataNode = {
    key: '',
    title: <span><FolderOpenOutlined aria-hidden="true" /> {t('editor.skillRoot')}</span>,
    isLeaf: false,
    children: [],
  }
  const entries = new Map<string, DataNode>()
  for (const node of nodes) {
    if (node.path === '') continue
    entries.set(node.path, {
      key: node.path,
      title: (
        <span>
          {node.nodeType === 'DIRECTORY'
            ? <FolderOutlined aria-hidden="true" />
            : <FileTextOutlined aria-hidden="true" />}
          {' '}{t('editor.treeNode', { name: basename(node.path), type: node.nodeType === 'DIRECTORY' ? t('editor.directory') : t('editor.file') })}
        </span>
      ),
      isLeaf: node.nodeType === 'FILE',
      children: node.nodeType === 'DIRECTORY' ? [] : undefined,
    })
  }
  const orderedNodes = nodes
    .filter((node) => node.path !== '')
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
  for (const node of orderedNodes) {
    const dataNode = entries.get(node.path)
    if (!dataNode) continue
    const parent = node.path.includes('/') ? entries.get(parentPath(node.path)) : root
    if (parent && Array.isArray(parent.children)) parent.children.push(dataNode)
  }
  return [root]
}

const toListUrl = (resource: DdcAiResourceSummary): string => {
  const query = new URLSearchParams({
    bizCode: resource.scope.bizCode,
    namespaceCode: resource.scope.namespaceCode,
    env: resource.scope.env,
    appCode: resource.scope.appCode,
  })
  return `/ai/${resource.kind === 'PROMPT' ? 'prompts' : 'skills'}?${query}`
}

const failureText = (error: unknown, t: AdminTranslate): string => {
  if (error instanceof DdcApiError && error.status === 403) return t('editor.operationDenied')
  return formatAdminError(error, t)
}

export default function AiResourceEditorPage() {
  const { t, locale } = usePageMessages('tianshu.ai.editor')
  const fieldsWritable = useDdcWritable('DdcAiDraftCommand')
  const mayMutate = useDdcPermission('tianshu.button.AiResourceEditorPage.ai_write') && fieldsWritable
  const { message, modal } = App.useApp()
  const { error: authError, registerUnsavedChangesGuard } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => searchParams.has('versionNo') ? 'versions' : 'draft')
  const queryKey = ddcAiQueryKeys.resource(id)
  const resourceQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAiResource(id, { signal }),
    enabled: id !== '',
  })
  const [baseline, setBaseline] = useState<DdcAiResourceResult | null>(null)
  const [buffer, setBuffer] = useState<DraftBuffer | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [saveFailure, setSaveFailure] = useState<{ error: unknown }>()
  const [conflict, setConflict] = useState(false)
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState | null>(null)
  const [nodePathValue, setNodePathValue] = useState('')
  const [targetDirectoryPath, setTargetDirectoryPath] = useState('')
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const logoutConfirmationResolver = useRef<((allowed: boolean) => void) | null>(null)
  const [pendingVersionOperation, setPendingVersionOperation] = useState(false)
  const dirtyRef = useRef(false)

  const isDirty = baseline !== null && buffer !== null
    && !sameBuffer(buffer, toBuffer(baseline))
  dirtyRef.current = isDirty

  useEffect(() => {
    if (searchParams.has('versionNo')) setActiveTab('versions')
  }, [searchParams])

  useEffect(() => {
    const server = resourceQuery.data
    if (!server || dirtyRef.current) return
    setBaseline(server)
    setBuffer(toBuffer(server))
    const firstFile = server.draft.nodes.find((node) => node.nodeType === 'FILE')
    setSelectedPath(firstFile?.path ?? '')
  }, [resourceQuery.data])

  useEffect(() => {
    if (!isDirty && !pendingVersionOperation) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, pendingVersionOperation])

  const leaveGuard = useCallback((): Promise<boolean> => new Promise((resolve) => {
    logoutConfirmationResolver.current = resolve
    setLogoutConfirmationOpen(true)
  }), [])

  const answerLogoutConfirmation = (allowed: boolean) => {
    setLogoutConfirmationOpen(false)
    logoutConfirmationResolver.current?.(allowed)
    logoutConfirmationResolver.current = null
  }

  useEffect(() => {
    if (!isDirty && !pendingVersionOperation) return
    return registerUnsavedChangesGuard(leaveGuard)
  }, [isDirty, leaveGuard, pendingVersionOperation, registerUnsavedChangesGuard])

  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) =>
    (isDirty || pendingVersionOperation) && (
    currentLocation.pathname !== nextLocation.pathname
  ), [isDirty, pendingVersionOperation])
  const blocker = useBlocker(shouldBlock)

  const updateDraft = (update: (current: DraftBuffer) => DraftBuffer) => {
    if (!mayMutate) return
    setBuffer((current) => current ? update(current) : current)
    setSaveFailure(undefined)
  }

  const saveMutation = useMutation({
    mutationFn: ({ current, expectedRevision }: {
      current: DraftBuffer
      expectedRevision: string
    }) => replaceAiDraft(id, {
      expectedRevision,
      displayName: current.displayName,
      description: current.description,
      draft: current.draft,
    }),
    onSuccess: async (result) => {
      setBaseline(result)
      setBuffer(toBuffer(result))
      setConflict(false)
      setSaveFailure(undefined)
      queryClient.setQueryData(queryKey, result)
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
      message.success(t('editor.savedNotice'))
    },
    onError: async (error: unknown) => {
      if (error instanceof DdcApiError && error.status === 409) {
        setConflict(true)
        setSaveFailure(undefined)
        await resourceQuery.refetch()
      } else {
        setSaveFailure({ error })
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (resource: DdcAiResourceSummary) => deleteAiResource(resource.id, resource.revision),
    onSuccess: async () => {
      const current = baseline?.resource
      if (!current) return
      await queryClient.invalidateQueries({ queryKey: ddcAiQueryKeys.all() })
      message.success(t('editor.deletedNotice'))
      navigate(toListUrl(current))
    },
    onError: (error: unknown) => setSaveFailure({ error }),
  })

  const savedBuffer = baseline ? toBuffer(baseline) : null
  const selectedNode = buffer?.draft.nodes.find((node) => node.path === selectedPath)
  const directories = buffer?.draft.nodes.filter((node) => node.nodeType === 'DIRECTORY') ?? []
  const visibleTree = useMemo(() => treeData(buffer?.draft.nodes ?? [], t), [buffer?.draft.nodes, t])
  const writable = mayMutate && baseline !== null && buffer !== null && !resourceQuery.isError

  const selectedParent = selectedNode?.nodeType === 'DIRECTORY'
    ? selectedNode.path
    : parentPath(selectedPath)
  const openNewNode = (operation: 'new-file' | 'new-directory') => {
    const label = operation === 'new-file' ? t('editor.newFileDefaultName') : t('editor.newDirectoryDefaultName')
    let path = selectedParent ? `${selectedParent}/${label}` : label
    let suffix = 1
    while (buffer?.draft.nodes.some((node) => node.path === path)) {
      path = selectedParent ? `${selectedParent}/${label}-${suffix}` : `${label}-${suffix}`
      suffix += 1
    }
    setNodePathValue(path)
    setTargetDirectoryPath('')
    setNodeDialog({ operation })
  }

  const openRename = () => {
    if (!selectedNode || selectedNode.path === '') return
    setNodePathValue(selectedNode.path)
    setNodeDialog({ operation: 'rename', sourcePath: selectedNode.path })
  }

  const openMove = () => {
    if (!selectedNode || selectedNode.path === '') return
    setTargetDirectoryPath(parentPath(selectedNode.path))
    setNodeDialog({ operation: 'move', sourcePath: selectedNode.path })
  }

  const confirmDeleteNode = () => {
    if (!selectedNode || selectedNode.path === '') return
    const path = selectedNode.path
    const affectedCount = subTreeSize(buffer?.draft.nodes ?? [], path)
    modal.confirm({
      title: t('editor.deleteNodeTitle', { path }),
      content: t('editor.deleteNodeWarning', { count: affectedCount }),
      okText: t('editor.confirmDeleteNode'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        updateDraft((current) => ({
          ...current,
          draft: {
            ...current.draft,
            nodes: current.draft.nodes.filter((node) =>
              node.path !== path && !node.path.startsWith(`${path}/`)),
          },
        }))
        setSelectedPath('')
      },
    })
  }

  const applyNodeOperation = () => {
    if (!nodeDialog || !buffer) return
    let nextNodes = buffer.draft.nodes
    const { operation, sourcePath } = nodeDialog

    if (operation === 'new-file' || operation === 'new-directory') {
      const path = nodePathValue.trim()
      const parent = parentPath(path)
      if (!isValidPath(path) || !isDirectory(nextNodes, parent)
          || nextNodes.some((node) => node.path === path)) {
        message.error(t('editor.invalidNewPath'))
        return
      }
      nextNodes = [...nextNodes, {
        path,
        nodeType: operation === 'new-directory' ? 'DIRECTORY' : 'FILE',
        content: operation === 'new-directory' ? null : '',
      }]
      setSelectedPath(path)
    } else if (operation === 'rename' && sourcePath) {
      const path = nodePathValue.trim()
      const parent = parentPath(path)
      const movingIntoOwnSubtree = buffer.draft.nodes.some((node) =>
        node.path === sourcePath && node.nodeType === 'DIRECTORY'
        && (path === sourcePath || path.startsWith(`${sourcePath}/`)))
      const transformed = replaceSubtreePrefix(nextNodes, sourcePath, path)
      const otherPaths = new Set(transformed.filter((node) =>
        node.path !== path && !node.path.startsWith(`${path}/`)).map((node) => node.path))
      const transformedPaths = transformed.map((node) => node.path)
      const hasDuplicates = new Set(transformedPaths).size !== transformedPaths.length
      if (!isValidPath(path) || !isDirectory(nextNodes, parent) || movingIntoOwnSubtree
          || hasDuplicates || otherPaths.has(path)) {
        message.error(t('editor.invalidRenamePath'))
        return
      }
      nextNodes = transformed
      setSelectedPath(path)
    } else if (operation === 'move' && sourcePath) {
      const target = targetDirectoryPath.trim()
      const targetNode = nextNodes.find((node) => node.path === target)
      const sourceNode = nextNodes.find((node) => node.path === sourcePath)
      const path = target ? `${target}/${basename(sourcePath)}` : basename(sourcePath)
      const movingIntoOwnSubtree = sourceNode?.nodeType === 'DIRECTORY'
        && (target === sourcePath || target.startsWith(`${sourcePath}/`))
      const transformed = replaceSubtreePrefix(nextNodes, sourcePath, path)
      const hasDuplicates = new Set(transformed.map((node) => node.path)).size !== transformed.length
      if (!isValidPath(path) || !targetNode || targetNode.nodeType !== 'DIRECTORY'
          || movingIntoOwnSubtree || hasDuplicates) {
        message.error(t('editor.invalidMoveTarget'))
        return
      }
      nextNodes = transformed
      setSelectedPath(path)
    }

    updateDraft((current) => ({ ...current, draft: { ...current.draft, nodes: nextNodes } }))
    setNodeDialog(null)
  }

  const saveDraft = () => {
    if (!mayMutate) return
    if (!buffer || !baseline || resourceQuery.isError || saveMutation.isPending || !isDirty) return
    setSaveFailure(undefined)
    saveMutation.mutate({ current: buffer, expectedRevision: baseline.resource.revision })
  }

  const confirmDeleteResource = () => {
    if (!baseline) return
    modal.confirm({
      title: t('editor.deleteTitle', { name: baseline.resource.displayName }),
      content: isDirty
        ? t('editor.deleteDirtyWarning')
        : t('editor.deleteWarning'),
      okText: t('editor.confirmDelete'),
      okButtonProps: { danger: true, loading: deleteMutation.isPending },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(baseline.resource),
    })
  }

  const updatePublishedResource = (updated: DdcAiResourceResult) => {
    setBaseline(updated)
    queryClient.setQueryData(queryKey, updated)
    if (!dirtyRef.current) setBuffer(toBuffer(updated))
  }

  if (resourceQuery.isPending && !resourceQuery.data) {
    return <Spin fullscreen description={t('editor.loading')} />
  }
  if (resourceQuery.isError && (!resourceQuery.data || !baseline || !buffer)) {
    return <Alert type="error" showIcon title={t('editor.readFailed')} description={failureText(resourceQuery.error, t)} />
  }
  if (!resourceQuery.data || !baseline || !buffer) {
    return <Alert type="error" showIcon title={t('editor.unavailable')} />
  }

  const resource = resourceQuery.data.resource
  const latestServer = resourceQuery.data
  const canAcknowledgeConflict = conflict && latestServer.resource.revision !== baseline.resource.revision
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    const next = new URLSearchParams(searchParams)
    if (key === 'draft' || key === 'optimization') {
      next.delete('versionNo')
    } else if (!next.has('versionNo') && resource.currentVersionNo !== null) {
      next.set('versionNo', resource.currentVersionNo)
    }
    setSearchParams(next)
  }

  return (
    <Space orientation="vertical" size="large" className="tianshu-ai-page">
      <AdminPageHeader
        title={resource.kind === 'PROMPT' ? t('editor.promptTitle') : t('editor.skillTitle')}
        description={t('editor.description')}
        extra={(
          <Space wrap>
            <Button onClick={() => navigate(toListUrl(resource))}>{t('editor.backToList')}</Button>
            <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" danger onClick={confirmDeleteResource} disabled={!writable || resourceQuery.isError || pendingVersionOperation || saveMutation.isPending || deleteMutation.isPending}>
              {t('editor.deleteResource')}
            </PermissionButton>
          </Space>
        )}
      />

      <Card>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label={t('editor.resourceKey')}><Typography.Text code>{resource.resourceKey}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label={t('editor.fullScope')}>
            {`${resource.scope.bizCode} / ${resource.scope.namespaceCode} / ${resource.scope.env} / ${resource.scope.appCode}`}
          </Descriptions.Item>
          <Descriptions.Item label={t('editor.currentVersion')}>
            {resource.currentVersionNo ?? t('editor.unpublished')}
          </Descriptions.Item>
          <Descriptions.Item label={t('editor.draftRevision')}>{baseline.resource.revision}</Descriptions.Item>
          <Descriptions.Item label={t('editor.lastModified')}>{formatTime(resource.updatedAt, locale)}</Descriptions.Item>
          <Descriptions.Item label={t('editor.draftStatus')}>
            {isDirty ? <Typography.Text type="warning">{t('editor.unsaved')}</Typography.Text> : t('editor.saved')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {saveFailure && <Alert type="error" showIcon title={t('editor.operationFailed')} description={failureText(saveFailure.error, t)} />}
      {authError && <Alert type="error" showIcon title={t('editor.sessionFailed')} description={formatAdminError(authError, t)} />}
      {resourceQuery.isError && resourceQuery.data && (
        <Alert
          type="warning"
          showIcon
          title={t('editor.refreshUnavailable')}
          description={failureText(resourceQuery.error, t)}
        />
      )}
      {conflict && (
        <Alert
          type="warning"
          showIcon
          title={canAcknowledgeConflict
            ? t('editor.conflictLoaded', { revision: latestServer.resource.revision })
            : t('editor.loadingConflict')}
          description={(
            <div className="tianshu-ai-conflict">
              <Typography.Paragraph>{t('editor.compareInstructions')}</Typography.Paragraph>
              <pre>{latestServer.draft.promptText ?? latestServer.draft.nodes.map((node) => `${node.nodeType} ${node.path}\n${node.content ?? ''}`).join('\n')}</pre>
              <Button
                type="primary"
                disabled={!canAcknowledgeConflict}
                onClick={() => {
                  setBaseline(latestServer)
                  setConflict(false)
                }}
              >
                {t('editor.acknowledgeConflict')}
              </Button>
            </div>
          )}
        />
      )}

      {(isDirty || pendingVersionOperation) && activeTab === 'versions' && (
        <Alert type="info" showIcon title={t('editor.historyPreservesDraft')} />
      )}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'draft',
            label: t('editor.draftTab'),
            children: (
              <Space orientation="vertical" size="large" className="tianshu-ai-page">
                {resource.kind === 'PROMPT' ? (
                  <Card title={t('editor.promptPlainText')}>
                    <Input.TextArea readOnly={!mayMutate}
                      aria-label={t('editor.promptContent')}
                      rows={20}
                      value={buffer.draft.promptText ?? ''}
                      onChange={(event) => updateDraft((current) => ({
                        ...current,
                        draft: { ...current.draft, promptText: event.target.value },
                      }))}
                    />
                  </Card>
                ) : (
                  <div className="tianshu-ai-skill-editor">
                    <Card title={t('editor.skillTree')} className="tianshu-ai-skill-editor__tree">
                      <Space wrap className="tianshu-ai-skill-editor__actions">
                        <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" onClick={() => openNewNode('new-file')}>{t('editor.addFile')}</PermissionButton>
                        <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" onClick={() => openNewNode('new-directory')}>{t('editor.addDirectory')}</PermissionButton>
                        <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" onClick={openMove} disabled={!selectedNode || selectedNode.path === ''}>{t('editor.move')}</PermissionButton>
                        <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" onClick={openRename} disabled={!selectedNode || selectedNode.path === ''}>{t('editor.rename')}</PermissionButton>
                        <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write" danger onClick={confirmDeleteNode} disabled={!selectedNode || selectedNode.path === ''}>{t('editor.deleteNode')}</PermissionButton>
                      </Space>
                      <Tree
                        aria-label={t('editor.skillTree')}
                        treeData={visibleTree}
                        selectedKeys={selectedPath ? [selectedPath] : []}
                        defaultExpandAll
                        onSelect={(keys) => {
                          const nextPath = String(keys[0] ?? '')
                          if (nextPath === selectedPath) return
                          if (!isDirty) {
                            setSelectedPath(nextPath)
                            return
                          }
                          modal.confirm({
                            title: t('editor.unsavedChanges'),
                            content: t('editor.switchFileWarning'),
                            okText: t('editor.keepAndSwitch'),
                            cancelText: t('editor.stayInFile'),
                            onOk: () => setSelectedPath(nextPath),
                          })
                        }}
                      />
                    </Card>
                    <Card title={selectedNode?.nodeType === 'FILE' ? selectedPath : t('editor.selectFile')} className="tianshu-ai-skill-editor__content">
                      {selectedNode?.nodeType === 'FILE' ? (
                        <Input.TextArea readOnly={!mayMutate}
                          aria-label={t('editor.fileContent', { path: selectedPath })}
                          rows={22}
                          value={selectedNode.content ?? ''}
                          onChange={(event) => updateDraft((current) => ({
                            ...current,
                            draft: {
                              ...current.draft,
                              nodes: current.draft.nodes.map((node) => node.path === selectedPath
                                ? { ...node, content: event.target.value }
                                : node),
                            },
                          }))}
                        />
                      ) : (
                        <Typography.Text type="secondary">{t('editor.directoryHint')}</Typography.Text>
                      )}
                    </Card>
                  </div>
                )}
                <Space>
                  <PermissionButton resourceKey="tianshu.button.AiResourceEditorPage.ai_write"
                    type="primary"
                    onClick={saveDraft}
                    disabled={!mayMutate || !isDirty || resourceQuery.isError || pendingVersionOperation || saveMutation.isPending || conflict}
                    loading={saveMutation.isPending}
                  >
                    {t('editor.saveDraft')}
                  </PermissionButton>
                  <Button
                    disabled={!isDirty || saveMutation.isPending}
                    onClick={() => {
                      const saved = savedBuffer
                      if (!saved) return
                      modal.confirm({
                        title: t('editor.discardTitle'),
                        content: t('editor.discardWarning'),
                        okText: t('editor.discardChanges'),
                        cancelText: t('editor.continueEditing'),
                        onOk: () => {
                          setBuffer(saved)
                          setBaseline(resourceQuery.data)
                          setConflict(false)
                          setSaveFailure(undefined)
                        },
                      })
                    }}
                  >
                    {t('editor.discardChanges')}
                  </Button>
                </Space>
              </Space>
            ),
          },
          {
            key: 'versions',
            label: t('editor.versionsTab'),
            children: (
              <AiVersionsPanel
                resource={resource}
                draftDirty={isDirty}
                resourceUnavailable={resourceQuery.isError}
                onResourceChanged={updatePublishedResource}
                onPendingOperationChange={setPendingVersionOperation}
              />
            ),
          },
          {
            key: 'optimization',
            label: t('editor.optimizationTab'),
            children: (
              <Space orientation="vertical" size="large" className="tianshu-ai-page">
                <AiOptimizationPanel resourceId={resource.id} />
                <AiFeedbackPanel resourceId={resource.id} />
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={nodeDialog?.operation === 'new-file' ? t('editor.addTextFile')
          : nodeDialog?.operation === 'new-directory' ? t('editor.addDirectory')
            : nodeDialog?.operation === 'rename' ? t('editor.renameNode') : t('editor.moveNode')}
        open={nodeDialog !== null}
        onCancel={() => setNodeDialog(null)}
        onOk={applyNodeOperation}
        okText={nodeDialog?.operation === 'new-file' || nodeDialog?.operation === 'new-directory'
          ? t('editor.confirmAdd') : nodeDialog?.operation === 'rename' ? t('editor.confirmRename') : t('editor.confirmMove')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        {nodeDialog?.operation === 'move' ? (
          <Form disabled={!mayMutate} layout="vertical">
            <Form.Item label={t('editor.targetDirectory')} help={t('editor.targetDirectoryHint')}>
              <Input
                aria-label={t('editor.targetDirectory')}
                value={targetDirectoryPath}
                onChange={(event) => setTargetDirectoryPath(event.target.value)}
              />
            </Form.Item>
            <Typography.Text type="secondary">
              {t('editor.availableDirectories', { directories: directories.map((directory) => directory.path || t('editor.rootDirectory')).join(t('editor.directorySeparator')) })}
            </Typography.Text>
          </Form>
        ) : (
          <Form disabled={!mayMutate} layout="vertical">
            <Form.Item
              label={nodeDialog?.operation === 'rename' ? t('editor.newPath')
                : nodeDialog?.operation === 'new-directory' ? t('editor.directoryPath') : t('editor.filePath')}
              required
            >
              <Input
                aria-label={nodeDialog?.operation === 'rename' ? t('editor.newPath')
                  : nodeDialog?.operation === 'new-directory' ? t('editor.directoryPath') : t('editor.filePath')}
                maxLength={1024}
                value={nodePathValue}
                onChange={(event) => setNodePathValue(event.target.value)}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title={pendingVersionOperation ? t('editor.publicationUnverified') : t('editor.draftUnsaved')}
        open={logoutConfirmationOpen}
        onOk={() => answerLogoutConfirmation(!pendingVersionOperation)}
        onCancel={() => answerLogoutConfirmation(false)}
        okText={pendingVersionOperation ? t('editor.returnToVerification') : t('editor.discardAndContinue')}
        cancelText={pendingVersionOperation ? t('editor.stayInSession') : t('editor.continueEditing')}
      >
        {pendingVersionOperation
          ? t('editor.pendingSessionWarning')
          : t('editor.leaveSessionWarning')}
      </Modal>

      <Modal
        title={pendingVersionOperation ? t('editor.publicationUnverified') : t('editor.leaveTitle')}
        open={blocker.state === 'blocked'}
        onOk={() => {
          if (!pendingVersionOperation) blocker.proceed?.()
        }}
        onCancel={() => blocker.reset?.()}
        okButtonProps={{ disabled: pendingVersionOperation }}
        okText={t('editor.leaveAndDiscard')}
        cancelText={pendingVersionOperation ? t('editor.verifyBeforeLeaving') : t('editor.continueEditing')}
      >
        {pendingVersionOperation
          ? t('editor.pendingLeaveWarning')
          : t('editor.unsavedLeaveWarning')}
      </Modal>
    </Space>
  )
}
