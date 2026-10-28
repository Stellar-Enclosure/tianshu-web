import {useQueryClient} from '@tanstack/react-query'
import {ListTemplateSettings} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {App, Button, Select} from 'antd'
import {useState} from 'react'
import {deleteNamespaceTemplate, saveNamespaceTemplate, selectNamespaceTemplate, type ListView} from '../../api/listTemplates'
import {ddcDownload} from '../../api/client'
import {formatAdminError} from '../../i18n/errors'
import {usePageMessages} from '../../i18n/AdminI18nProvider'

type Props = {
  view: ListView; managementView?: ListView; maySystem: boolean; mayPersonal: boolean; mayExport: boolean; selectionWritable: boolean; dataUnavailable: boolean
  filter: {bizCode: string; keyword: string}; page: {pageNo: number; pageSize: number}
}

export function NamespaceListControls({view, managementView, maySystem, mayPersonal, mayExport, selectionWritable, dataUnavailable, filter, page}: Props) {
  const {t, locale} = usePageMessages('tianshu.namespaces')
  const {message} = App.useApp()
  const client = useQueryClient()
  const [range, setRange] = useState<'FILTERED' | 'PAGE'>('FILTERED')
  const [downloading, setDownloading] = useState(false)
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({queryKey: ['namespace-list-view']}),
      client.invalidateQueries({queryKey: ['namespace-list-view-management']})])
  }
  const selected = view.templates.find(template => template.id === view.selectedTemplateId)
  const download = async () => {
    setDownloading(true)
    try {
      const blob = await ddcDownload('/api/v1/tianshu/namespaces/export', {
        ...filter, ...page, range, locale, catalogVersion: view.catalogVersion, definitionDigest: view.definitionDigest,
        templateId: selected?.id ?? null, templateVersion: selected?.version ?? null,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'namespaces.xlsx'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { message.error(formatAdminError(error, t)) }
    finally { setDownloading(false) }
  }
  return <ListTemplateSettings view={view} managementView={managementView} maySystem={maySystem} mayPersonal={mayPersonal}
    selectionWritable={selectionWritable} refresh={refresh} labelColumn={column => t(column.labelKey)}
    actions={{save: saveNamespaceTemplate, select: selectNamespaceTemplate, remove: deleteNamespaceTemplate}}
    onError={error => message.error(formatAdminError(error, t))}
    onNotice={notice => notice === 'savedApplyFailed' ? message.warning(t('templates.savedApplyFailed'))
      : message.success(notice === 'saved' ? t('templates.saved') : t('templates.deleted'))}
    labels={{selected: t('templates.selected'), defaultView: t('templates.defaultView'), system: t('templates.system'),
      personal: t('templates.personal'), newPersonal: t('templates.newPersonal'), newSystem: t('templates.newSystem'),
      edit: t('templates.edit'), name: t('templates.name'), setDefault: t('templates.setDefault'), save: t('common.save'),
      delete: t('common.delete'), deleteConfirm: t('templates.deleteConfirm'), moveUp: t('templates.moveUp'),
      moveDown: t('templates.moveDown'), unavailable: count => t('templates.unavailable', {count})}}
    renderExtra={busy => mayExport && <><Select aria-label={t('templates.exportRange')} value={range} onChange={setRange} options={[
      {value: 'FILTERED', label: t('templates.filtered')}, {value: 'PAGE', label: t('templates.currentPage')},
    ]} /><Button loading={downloading} disabled={dataUnavailable || view.visibleColumns.length === 0 || busy}
      onClick={() => {void download()}}>{t('templates.export')}</Button></>} />
}
