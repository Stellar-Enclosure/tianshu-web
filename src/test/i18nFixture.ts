import catalogs from './i18nCatalogs.json'
import type {AdminTranslate} from '../i18n/AdminI18nProvider'

const dictionaries = catalogs as Record<string, Record<string, Record<string, string>>>
const translators = new Map<string, AdminTranslate>()

export function fixtureT(pageCode: string, locale = 'zh-CN'): AdminTranslate {
  const identity = `${pageCode}:${locale}`
  const cached = translators.get(identity)
  if (cached) return cached
  const messages = {...dictionaries.common?.['zh-CN'], ...dictionaries.common?.[locale],
    ...dictionaries[pageCode]?.['zh-CN'], ...dictionaries[pageCode]?.[locale]}
  const translate: AdminTranslate = (key, values = {}) => (messages[key] ?? key)
    .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match)
  translators.set(identity, translate)
  return translate
}
