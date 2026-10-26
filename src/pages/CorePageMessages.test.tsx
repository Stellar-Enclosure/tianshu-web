import {gatewayAuth} from '../auth/gatewayAuth'
import {csrfFixture} from '../test/permissionFixture'
import {fireEvent, screen, waitFor} from '@testing-library/react'
import {useState} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {setDdcUnauthorizedHandler} from '../api/client'
import type {DdcConfig} from '../api/types'
import {fixtureT} from '../test/i18nFixture'
import {renderWithQueryClient} from '../test/renderWithQueryClient'
import BizsPage from './BizsPage'
import ConfigEditorDialog from './ConfigEditorDialog'

const language = vi.hoisted(() => ({locale: 'en-US'}))

vi.mock('../i18n/AdminI18nProvider', async (importOriginal) => ({
  ...await importOriginal<typeof import('../i18n/AdminI18nProvider')>(),
  usePageMessages: (pageCode: string) => ({
    locale: language.locale,
    t: (key: string, values?: Record<string, string | number>) =>
      pageCode === 'tianshu.bizs' && key === 'title'
        ? 'Enterprise business domains'
        : fixtureT(pageCode, language.locale)(key, values),
  }),
}))

vi.mock('../components/scope/ScopeSelects', () => ({default: () => null}))

const scope = {bizCode: 'pay', namespaceCode: 'default', env: 'dev', appCode: 'orders'}
const config: DdcConfig = {
  id: 'cfg-1', bizCode: 'pay', appCode: 'orders', env: 'dev', visibleNamespaces: ['default'],
  resourceName: 'application.yml', content: 'feature:\n  enabled: true\n', format: 'YAML',
  currentVersion: 3, description: '业务配置', updatedAt: '2026-08-08T00:00:00Z',
}

const response = (data: unknown) => new Response(JSON.stringify({
  success: true, code: 0, status: 'SUCCESS', message: '', data, traceId: 'test', timestamp: 1,
}), {status: 200, headers: {'Content-Type': 'application/json'}})

function EditorHarness({onSaved}: {onSaved: () => void}) {
  const [, setRevision] = useState(0)
  return <>
    <button onClick={() => { language.locale = 'zh-CN'; setRevision((value) => value + 1) }}>Switch language</button>
    <ConfigEditorDialog open config={config} defaultScope={scope} onClose={() => {}} onSaved={onSaved} />
  </>
}

describe('core page language bundles', () => {
  beforeEach(() => {
    language.locale = 'en-US'
    setDdcUnauthorizedHandler(() => {})
    vi.spyOn(gatewayAuth, 'csrf').mockResolvedValue(csrfFixture())
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders a tenant-provided title and translated CRUD labels from the page bundle', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      success: true, code: 0, status: 'SUCCESS', records: [],
      page: {total: 0, pageNo: 1, pageSize: 10, pages: 0, hasNext: false, hasPrevious: false},
    }), {status: 200, headers: {'Content-Type': 'application/json'}}))
    renderWithQueryClient(<BizsPage />)

    expect(screen.getByRole('heading', {name: 'Enterprise business domains'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Create business domain'}))
    expect(await screen.findByLabelText('Business domain code')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Save'})).toBeInTheDocument()
    expect(screen.queryByText('业务域管理')).not.toBeInTheDocument()
  })

  it('switches editor labels without resetting unsaved YAML or changing the update payload', async () => {
    const onSaved = vi.fn()
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(response(config)))
    renderWithQueryClient(<EditorHarness onSaved={onSaved} />)
    const editor = await screen.findByLabelText('YAML content')
    await waitFor(() => expect(editor).toHaveValue(config.content))
    fireEvent.change(editor, {target: {value: 'feature:\n  enabled: false\n'}})
    fireEvent.change(screen.getByLabelText('Change reason'), {target: {value: 'Keep this user text'}})

    fireEvent.click(screen.getByRole('button', {name: 'Switch language'}))
    expect(await screen.findByLabelText('YAML 内容')).toHaveValue('feature:\n  enabled: false\n')
    expect(screen.getByLabelText('变更原因')).toHaveValue('Keep this user text')
    fireEvent.click(screen.getByRole('button', {name: /保\s*存/}))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const update = vi.mocked(fetch).mock.calls.find(([input, init]) =>
      String(input) === '/apps/edge-tianshu/api/v1/tianshu/configs/cfg-1' && init?.method === 'PUT')
    expect(JSON.parse(String(update?.[1]?.body))).toEqual({
      content: 'feature:\n  enabled: false\n', changeReason: 'Keep this user text', currentVersion: 3,
    })
  })
})
