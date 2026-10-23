import {ReloadOutlined} from '@ant-design/icons'
import {Button, Select, Space, Tooltip} from 'antd'
import {useAdminI18n, usePageMessages} from './AdminI18nProvider'

export function LanguageSwitcher() {
  const {locale, bootstrap, changing, changeLocale, refresh} = useAdminI18n()
  const {t} = usePageMessages('common')
  const choices = [...new Set([...(bootstrap?.locales ?? ['zh-CN', 'en-US']), locale])]
  const names = new Intl.DisplayNames([locale], {type: 'language'})
  return <Space>
    <Select aria-label={t('language.label')} value={locale} loading={changing} disabled={changing}
      style={{minWidth: 140}} options={choices.map((value) => ({value, label: names.of(value) ?? value}))}
      onChange={(value) => void changeLocale(value)} />
    <Tooltip title={t('language.refresh')}>
      <Button type="text" icon={<ReloadOutlined />} aria-label={t('language.refresh')}
        disabled={changing} onClick={() => void refresh()} />
    </Tooltip>
  </Space>
}
