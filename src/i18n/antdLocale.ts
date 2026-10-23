import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import type {AdminTranslate} from './AdminI18nProvider'

export function adminAntdLocale(locale: string, t: AdminTranslate, messages: Readonly<Record<string, string>>) {
  const base = locale.startsWith('zh') ? zhCN : enUS
  const translate = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') return Object.hasOwn(messages, `antd.${path}`) ? t(`antd.${path}`) : value
    if (Array.isArray(value)) return value.map((item, index) => translate(item, `${path}.${index}`))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, translate(item, path ? `${path}.${key}` : key)]))
    return value
  }
  return translate(base, '') as typeof enUS
}
