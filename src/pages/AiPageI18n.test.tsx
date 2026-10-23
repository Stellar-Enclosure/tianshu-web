import { createContext, useContext, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DdcApiError, setDdcExpectedTenantId } from '../api/client'
import type { DdcAiResourceResult, DdcAiScope, DdcAiVersionSummary } from '../api/types'
import * as adminI18n from '../i18n/AdminI18nProvider'
import { createDdcQueryClient } from '../query/queryClient'
import { fixtureT } from '../test/i18nFixture'
import AiPromotionDialog from './AiPromotionDialog'
import AiResourceEditorPage from './AiResourceEditorPage'

const aiApi = vi.hoisted(() => ({
  getAiResource: vi.fn(),
  replaceAiDraft: vi.fn(),
  pageAiResources: vi.fn(),
  getAiVersion: vi.fn(),
  promoteAiVersion: vi.fn(),
  pageAiPublications: vi.fn(),
  ddcAiQueryKeys: {
    all: () => ['tianshu', 'tenant-1', 'ai'],
    resource: (id: string) => ['tianshu', 'tenant-1', 'ai', 'resource', id],
    resources: (params: unknown) => ['tianshu', 'tenant-1', 'ai', 'resources', params],
    version: (id: string, versionNo: string) => ['tianshu', 'tenant-1', 'ai', 'version', id, versionNo],
  },
}))
vi.mock('../api/ai', () => aiApi)
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ registerUnsavedChangesGuard: () => () => {} }),
}))
vi.mock('../components/scope/ScopeSelects', () => ({
  default: ({ onChange }: { onChange: (scope: DdcAiScope) => void }) => (
    <button onClick={() => onChange({ bizCode: 'retail', namespaceCode: 'prod', env: 'prod', appCode: 'assistant' })}>
      Select target
    </button>
  ),
}))

const LocaleContext = createContext('zh-CN')
const source: DdcAiResourceResult = {
  resource: {
    id: '810001',
    scope: { bizCode: 'retail', namespaceCode: 'dev', env: 'dev', appCode: 'assistant' },
    kind: 'PROMPT',
    resourceKey: 'review-order',
    displayName: '订单审核',
    description: 'User-owned description',
    revision: '3',
    lastVersionNo: '2',
    currentVersionId: '9002',
    currentVersionNo: '2',
    updatedAt: '2026-09-21T10:00:00Z',
  },
  draft: { promptText: 'User-owned prompt', nodes: [] },
}
const version: DdcAiVersionSummary = {
  id: '9002', resourceId: '810001', versionNo: '2', kind: 'PROMPT', displayName: '订单审核',
  description: '', contentSha256: 'sha-source', contentBytes: 20, nodeCount: 0,
  sourceVersionId: null, changeNote: 'User-owned note', createdAt: '2026-09-21T10:00:00Z', createdBy: 'admin',
}

function LanguageHarness({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState('zh-CN')
  return (
    <LocaleContext.Provider value={locale}>
      <button onClick={() => setLocale((current) => current === 'zh-CN' ? 'en-US' : 'zh-CN')}>Switch language</button>
      {children}
    </LocaleContext.Provider>
  )
}

function renderLocalized(ui: ReactNode) {
  const queryClient = createDdcQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AntdApp><LanguageHarness>{ui}</LanguageHarness></AntdApp>
    </QueryClientProvider>,
  )
}

describe('AI page language changes', () => {
  beforeEach(() => {
    setDdcExpectedTenantId('tenant-1')
    vi.clearAllMocks()
    vi.spyOn(adminI18n, 'usePageMessages').mockImplementation(function useMessages(pageCode: string) {
      const locale = useContext(LocaleContext)
      return { t: fixtureT(pageCode, locale), locale, loading: false, error: null, refresh: vi.fn(), messages: {} }
    })
    aiApi.getAiResource.mockResolvedValue(source)
    aiApi.pageAiResources.mockResolvedValue({ records: [], page: { hasNext: false } })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setDdcExpectedTenantId(undefined)
  })

  it('changes editor labels without replacing unsaved text or the expected revision', async () => {
    const router = createMemoryRouter([{ path: '/ai/resources/:id', element: <AiResourceEditorPage /> }], {
      initialEntries: ['/ai/resources/810001'],
    })
    renderLocalized(<RouterProvider router={router} />)
    fireEvent.change(await screen.findByLabelText('Prompt 正文'), { target: { value: '未保存 {{value}} <b>raw</b>' } })

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))

    expect(screen.getByText('Edit Prompt draft')).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt content')).toHaveValue('未保存 {{value}} <b>raw</b>')
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByText('review-order')).toBeInTheDocument()
    aiApi.replaceAiDraft.mockResolvedValue({ ...source, draft: { promptText: '未保存 {{value}} <b>raw</b>', nodes: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(aiApi.replaceAiDraft).toHaveBeenCalledWith('810001', {
      expectedRevision: '3', displayName: '订单审核', description: 'User-owned description',
      draft: { promptText: '未保存 {{value}} <b>raw</b>', nodes: [] },
    }))
  })

  it('localizes the default promotion note and preserves edited notes and pending retry payloads', async () => {
    aiApi.promoteAiVersion.mockRejectedValueOnce(new DdcApiError(0, 'NETWORK', 'network lost'))
      .mockResolvedValue({ resourceId: '810002', targetVersionNo: '1' })
    renderLocalized(<AiPromotionDialog open sourceResource={source.resource} sourceVersion={version}
      onCancel={vi.fn()} onPublished={vi.fn()} />)
    expect(screen.getByLabelText('变更说明')).toHaveValue('推广版本 2')

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
    expect(screen.getByLabelText('Change notes')).toHaveValue('Promote version 2')
    fireEvent.change(screen.getByLabelText('Change notes'), { target: { value: '用户填写的变更说明' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select target' }))
    await screen.findByText(/The target resource does not exist/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy and publish' }))
    await screen.findByText(/The submission result is unknown/)

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
    expect(screen.getByLabelText('变更说明')).toHaveValue('用户填写的变更说明')
    expect(screen.getByLabelText('变更说明')).toBeDisabled()
    expect(screen.getByText(/提交结果未知。请先核验原请求回执/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /使用原请求号重试/ }))

    await waitFor(() => expect(aiApi.promoteAiVersion).toHaveBeenCalledTimes(2))
    expect(aiApi.promoteAiVersion.mock.calls[0]).toEqual(aiApi.promoteAiVersion.mock.calls[1])
    expect(aiApi.promoteAiVersion.mock.calls[1][2]).toMatchObject({ changeNote: '用户填写的变更说明', sourceVersionNo: '2' })
  })
})
