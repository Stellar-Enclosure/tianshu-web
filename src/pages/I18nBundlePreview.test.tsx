import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import I18nBundlePreview from './I18nBundlePreview'
import {getI18nBundle, type DdcI18nBundle} from '../api/i18n'

const auth = vi.hoisted(() => ({tenantId: '1001', sessionGeneration: 1}))
vi.mock('../auth/AuthContext', () => ({useAuth: () => auth}))
vi.mock('../api/i18n', () => ({getI18nBundle: vi.fn()}))

const props = {
  scope: {bizCode: 'retail', namespaceCode: 'web', env: 'dev', appCode: 'orders'},
  pageCode: 'order.list',
  defaultLocale: 'zh-CN',
  locales: ['zh-CN', 'en-US'],
  publishedVersion: '1',
}
const bundle = (text = '订单列表', locale = 'zh-CN'): DdcI18nBundle => ({
  pageCode: 'order.list', locale, defaultLocale: 'zh-CN', version: text,
  messages: {'page.title': text},
})

describe('I18nBundlePreview', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    auth.tenantId = '1001'
    auth.sessionGeneration = 1
  })

  it('renders the published flat-key language bundle through the shared SDK', async () => {
    vi.mocked(getI18nBundle).mockResolvedValue(bundle())
    render(<I18nBundlePreview {...props} />)
    expect(await screen.findByRole('cell', {name: '订单列表'})).toBeInTheDocument()
    expect(getI18nBundle).toHaveBeenCalledWith(
      {...props.scope, pageCode: 'order.list', locale: 'zh-CN'},
      expect.objectContaining({signal: expect.any(AbortSignal)}),
    )
    expect(screen.getByText(/"page.title": "订单列表"/)).toBeInTheDocument()
  })

  it('does not request a draft before its first publication', () => {
    render(<I18nBundlePreview {...props} publishedVersion={null} />)
    expect(screen.getByText('发布后可预览语言包')).toBeInTheDocument()
    expect(getI18nBundle).not.toHaveBeenCalled()
  })

  it('retains the last successful text if refreshing the same identity fails', async () => {
    vi.mocked(getI18nBundle).mockResolvedValueOnce(bundle()).mockRejectedValueOnce(new Error('offline'))
    render(<I18nBundlePreview {...props} />)
    await screen.findByRole('cell', {name: '订单列表'})
    fireEvent.click(screen.getByRole('button', {name: '刷新语言包'}))
    expect(await screen.findByText('刷新失败，当前显示上次成功加载的已发布文案')).toBeInTheDocument()
    expect(screen.getByRole('cell', {name: '订单列表'})).toBeInTheDocument()
  })

  it('drops a late response after changing tenant and session', async () => {
    let resolveOld!: (value: DdcI18nBundle) => void
    vi.mocked(getI18nBundle)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(bundle('新企业订单'))
    const view = render(<I18nBundlePreview {...props} />)
    await waitFor(() => expect(getI18nBundle).toHaveBeenCalledTimes(1))
    auth.tenantId = '1002'
    auth.sessionGeneration = 2
    view.rerender(<I18nBundlePreview {...props} />)
    expect(await screen.findByRole('cell', {name: '新企业订单'})).toBeInTheDocument()
    await act(async () => { resolveOld(bundle('旧企业私有文案')) })
    expect(screen.queryByText('旧企业私有文案')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', {name: '新企业订单'})).toBeInTheDocument()
  })

  it('starts a fresh request on publication and ignores the older response', async () => {
    let resolveOld!: (value: DdcI18nBundle) => void
    vi.mocked(getI18nBundle)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(bundle('新发布文案'))
    const view = render(<I18nBundlePreview {...props} />)
    await waitFor(() => expect(getI18nBundle).toHaveBeenCalledTimes(1))
    view.rerender(<I18nBundlePreview {...props} publishedVersion="2" />)
    expect(await screen.findByRole('cell', {name: '新发布文案'})).toBeInTheDocument()
    await act(async () => { resolveOld(bundle('上次发布文案')) })
    expect(getI18nBundle).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('上次发布文案')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', {name: '新发布文案'})).toBeInTheDocument()
  })
})
