import {fireEvent, screen, waitFor, within} from '@testing-library/react'
import {beforeEach, expect, it, vi} from 'vitest'
import {ddcDownload} from '../../api/client'
import {saveNamespaceTemplate, selectNamespaceTemplate, type ListView} from '../../api/listTemplates'
import {renderWithQueryClient} from '../../test/renderWithQueryClient'
import {NamespaceListControls} from './NamespaceListControls'

vi.mock('../../api/client', () => ({ddcDownload: vi.fn()}))
vi.mock('../../api/listTemplates', () => ({saveNamespaceTemplate: vi.fn(), deleteNamespaceTemplate: vi.fn(), selectNamespaceTemplate: vi.fn()}))

const view: ListView = {definitionDigest: 'digest', catalogVersion: '3', selectedTemplateId: '9',
  columns: [{columnKey: 'bizCode', labelPage: 'tianshu.namespaces', labelKey: 'fields.bizCode'},
    {columnKey: 'namespace', labelPage: 'common', labelKey: 'common.name'},
    {columnKey: 'description', labelPage: 'common', labelKey: 'common.description'}],
  templates: [{id: '9', type: 'SYSTEM', name: 'default', defaultTemplate: true, version: '5', columnKeys: ['bizCode', 'namespace']}],
  visibleColumns: ['bizCode', 'namespace']}

beforeEach(() => {vi.clearAllMocks()})

it('defaults export to filtered results and carries the applied template version', async () => {
  vi.mocked(ddcDownload).mockResolvedValue(new Blob(['workbook']))
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn()}))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  renderWithQueryClient(<NamespaceListControls view={view} maySystem={false} mayPersonal={false} mayExport selectionWritable dataUnavailable={false}
    filter={{bizCode: 'trade', keyword: 'one'}} page={{pageNo: 2, pageSize: 10}} />)
  fireEvent.click(screen.getByRole('button', {name: '导出 Excel'}))
  await waitFor(() => expect(ddcDownload).toHaveBeenCalledWith('/api/v1/tianshu/namespaces/export', expect.objectContaining({
    range: 'FILTERED', bizCode: 'trade', keyword: 'one', templateId: '9', templateVersion: '5', catalogVersion: '3',
  })))
  expect(click).toHaveBeenCalledOnce()
  click.mockRestore()
})

it('saves a personal template using the currently available fields', async () => {
  vi.mocked(saveNamespaceTemplate).mockResolvedValue({...view.templates[0], id: '10', type: 'PERSONAL'})
  renderWithQueryClient(<NamespaceListControls view={view} maySystem={false} mayPersonal mayExport={false} selectionWritable dataUnavailable={false}
    filter={{bizCode: '', keyword: ''}} page={{pageNo: 1, pageSize: 10}} />)
  fireEvent.click(screen.getByRole('button', {name: '新建个人模板'}))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByRole('textbox', {name: '模板名称'}), {target: {value: 'My view'}})
  fireEvent.click(within(dialog).getByRole('checkbox', {name: '描述'}))
  fireEvent.click(within(dialog).getByRole('button', {name: /保\s*存/}))
  await waitFor(() => expect(saveNamespaceTemplate).toHaveBeenCalledWith('PERSONAL', expect.objectContaining({
    name: 'My view', columnKeys: ['bizCode', 'namespace', 'description'], catalogVersion: '3', definitionDigest: 'digest',
  })))
  await waitFor(() => expect(selectNamespaceTemplate).toHaveBeenCalledWith('10', view))
})

it('reports when a saved template could not be selected', async () => {
  vi.mocked(saveNamespaceTemplate).mockResolvedValue({...view.templates[0], id: '10', type: 'PERSONAL'})
  vi.mocked(selectNamespaceTemplate).mockRejectedValueOnce(new Error('selection failed'))
  renderWithQueryClient(<NamespaceListControls view={view} maySystem={false} mayPersonal mayExport={false} selectionWritable dataUnavailable={false}
    filter={{bizCode: '', keyword: ''}} page={{pageNo: 1, pageSize: 10}} />)
  fireEvent.click(screen.getByRole('button', {name: '新建个人模板'}))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByRole('textbox', {name: '模板名称'}), {target: {value: 'My view'}})
  fireEvent.click(within(dialog).getByRole('button', {name: /保\s*存/}))
  expect(await screen.findByText('模板已保存，但未能切换，请重新选择。')).toBeInTheDocument()
})
