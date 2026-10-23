import { Button, Form, Input, Pagination, Select, Space, Typography } from 'antd'
import { useState } from 'react'
import type { I18nDraftBuffer, I18nEntry } from '../lib/i18nDraft'
import { normalizeI18nLocale } from '../lib/i18nDraft'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { AdminMessageError } from '../i18n/errors'

type Props = {
  value: I18nDraftBuffer
  onChange: (value: I18nDraftBuffer) => void
  disabled: boolean
  onError: (error: unknown) => void
}

export default function I18nDraftForm({ value, onChange, disabled, onError }: Props) {
  const {t} = usePageMessages('tianshu.i18n')
  const [newLocale, setNewLocale] = useState('')
  const [entryPage, setEntryPage] = useState(1)
  const currentPage = Math.min(entryPage, Math.max(1, Math.ceil(value.entries.length / 20)))
  const entryOffset = (currentPage - 1) * 20
  const updateEntry = (id: number, update: (entry: I18nEntry) => I18nEntry) => {
    onChange({ ...value, entries: value.entries.map((entry) => entry.id === id ? update(entry) : entry) })
  }
  const addLocale = () => {
    try {
      const locale = normalizeI18nLocale(newLocale)
      if (value.locales.includes(locale)) throw new AdminMessageError('validation.localeExists', { locale })
      if (value.locales.length >= 32) throw new AdminMessageError('validation.localeLimit')
      onChange({ ...value, locales: [...value.locales, locale] })
      setNewLocale('')
    } catch (error) {
      onError(error)
    }
  }
  const removeLocale = (locale: string) => {
    onChange({
      ...value,
      locales: value.locales.filter((item) => item !== locale),
      entries: value.entries.map((entry) => ({
        ...entry,
        values: Object.fromEntries(Object.entries(entry.values).filter(([key]) => key !== locale)),
      })),
    })
  }
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Form layout="vertical" disabled={disabled}>
        <Form.Item label={t('fields.name')} required>
          <Input aria-label={t('fields.name')} maxLength={128} value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })} />
        </Form.Item>
        <Form.Item label={t('fields.defaultLocale')} required>
          <Select aria-label={t('fields.defaultLocale')} value={value.defaultLocale}
            options={value.locales.map((locale) => ({ value: locale, label: locale }))}
            onChange={(defaultLocale) => onChange({ ...value, defaultLocale })} />
        </Form.Item>
        <Space wrap>
          <Input aria-label={t('fields.newLocale')} placeholder={t('placeholders.locale')} value={newLocale} maxLength={64}
            onChange={(event) => setNewLocale(event.target.value)} onPressEnter={addLocale} />
          <Button onClick={addLocale}>{t('actions.addLocale')}</Button>
        </Space>
      </Form>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('help.entries', {example: '{{name}}'})}
      </Typography.Paragraph>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table aria-label={t('entries.label')} className="tianshu-i18n-entries" style={{ minWidth: 320 + value.locales.length * 280 }}>
          <thead><tr>
            <th scope="col" style={{ width: 220 }}>{t('fields.key')}</th>
            {value.locales.map((locale) => <th key={locale} scope="col" style={{ width: 280 }}>
              <Space>
                <span>{locale}{locale === value.defaultLocale ? t('locale.defaultSuffix') : ''}</span>
                {locale !== value.defaultLocale && <Button size="small" type="text" danger disabled={disabled}
                  aria-label={t('actions.removeLocale', { locale })} onClick={() => removeLocale(locale)}>{t('actions.remove')}</Button>}
              </Space>
            </th>)}
            <th scope="col" style={{ width: 100 }}>{t('common.actions')}</th>
          </tr></thead>
          <tbody>
            {value.entries.slice(entryOffset, entryOffset + 20).map((entry, index) => <tr key={entry.id}>
              <td><Input aria-label={t('entries.keyLabel', { index: entryOffset + index + 1 })} placeholder={t('placeholders.key')} maxLength={128}
                disabled={disabled} value={entry.key}
                onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, key: event.target.value }))} /></td>
              {value.locales.map((locale) => <td key={locale}>
                <Input.TextArea aria-label={t('entries.textLabel', { index: entryOffset + index + 1, locale })} rows={2} maxLength={8192}
                  disabled={disabled} value={entry.values[locale] ?? ''}
                  placeholder={locale === value.defaultLocale ? t('placeholders.defaultText') : t('placeholders.translatedText')}
                  onChange={(event) => updateEntry(entry.id, (current) => ({
                    ...current, values: { ...current.values, [locale]: event.target.value },
                  }))} />
              </td>)}
              <td><Button danger disabled={disabled} aria-label={t('entries.deleteLabel', { index: entryOffset + index + 1 })}
                onClick={() => onChange({ ...value, entries: value.entries.filter((item) => item.id !== entry.id) })}>
                {t('common.delete')}
              </Button></td>
            </tr>)}
            {value.entries.length === 0 && <tr><td colSpan={value.locales.length + 2}>
              <Typography.Text type="secondary">{t('empty.entries')}</Typography.Text>
            </td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination current={currentPage} pageSize={20} total={value.entries.length} showSizeChanger={false}
        hideOnSinglePage onChange={setEntryPage} showTotal={(total) => t('entries.total', { total })} />
      <Button disabled={disabled || value.entries.length >= 2000} onClick={() => {
        setEntryPage(Math.ceil((value.entries.length + 1) / 20))
        onChange({
          ...value,
          entries: [...value.entries, {
            id: value.entries.reduce((max, entry) => Math.max(max, entry.id), -1) + 1,
            key: '', values: {},
          }],
        })
      }}>{t('actions.addEntry')}</Button>
    </Space>
  )
}
