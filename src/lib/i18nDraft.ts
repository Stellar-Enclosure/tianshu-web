import type { DdcI18nDraft, DdcI18nTranslations } from '../api/i18n'
import { AdminMessageError } from '../i18n/errors'

export type I18nEntry = { id: number; key: string; values: Record<string, string> }
export type I18nDraftBuffer = {
  name: string
  defaultLocale: string
  locales: string[]
  entries: I18nEntry[]
}

export const normalizeI18nLocale = (value: string): string => {
  try {
    const locale = Intl.getCanonicalLocales(value.trim())[0]
    if (locale && locale !== 'und' && !locale.startsWith('und-') && locale.length <= 64) return locale
  } catch {
    // Intl rejects malformed BCP 47 tags before they enter the draft.
  }
  throw new AdminMessageError('validation.locale')
}

export const i18nDraftToBuffer = (draft: DdcI18nDraft): I18nDraftBuffer => {
  const locales = [draft.defaultLocale, ...Object.keys(draft.translations)
    .filter((locale) => locale !== draft.defaultLocale)]
  const keys = [...new Set(Object.values(draft.translations).flatMap(Object.keys))].sort()
  return {
    name: draft.name,
    defaultLocale: draft.defaultLocale,
    locales,
    entries: keys.map((key, id) => ({
      id,
      key,
      values: Object.fromEntries(locales.map((locale) => [locale, draft.translations[locale]?.[key] ?? ''])),
    })),
  }
}

const placeholders = (value: string): string => {
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
  const remaining = value.replace(pattern, '')
  if (remaining.includes('{{') || remaining.includes('}}')) {
    throw new AdminMessageError('validation.placeholderSyntax', { example: '{{name}}', alternate: '{{first_name}}' })
  }
  return [...new Set([...value.matchAll(pattern)].map((match) => match[1]))].sort().join('|')
}

export const i18nBufferToDraft = (buffer: I18nDraftBuffer): DdcI18nDraft => {
  if (buffer.name.trim() === '' || buffer.name.trim().length > 128) {
    throw new AdminMessageError('validation.name')
  }
  const locales = buffer.locales.map(normalizeI18nLocale)
  const defaultLocale = normalizeI18nLocale(buffer.defaultLocale)
  if (locales.length > 32) throw new AdminMessageError('validation.localeLimit')
  if (buffer.entries.length > 2000) throw new AdminMessageError('validation.entryLimit')
  if (new Set(locales).size !== locales.length || !locales.includes(defaultLocale)) {
    throw new AdminMessageError('validation.defaultLocale')
  }
  const keys = new Set<string>()
  const translations: DdcI18nTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]))
  for (const entry of buffer.entries) {
    const key = entry.key.trim()
    if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(key) || key.length > 128
        || key.split('.').some((segment) => ['__proto__', 'constructor', 'prototype'].includes(segment))) {
      throw new AdminMessageError('validation.key', { key })
    }
    if (keys.has(key)) throw new AdminMessageError('validation.duplicateKey', { key })
    keys.add(key)
    const source = entry.values[buffer.defaultLocale] ?? ''
    if (!source.trim()) throw new AdminMessageError('validation.defaultText', { locale: defaultLocale, key })
    for (const [index, locale] of locales.entries()) {
      const text = entry.values[buffer.locales[index]] ?? ''
      if (!text.trim()) continue
      if (text.length > 8192) throw new AdminMessageError('validation.textLimit', { key, locale })
      if (placeholders(text) !== placeholders(source)) {
        throw new AdminMessageError('validation.placeholders', { key, locale, example: '{{name}}' })
      }
      translations[locale][key] = text
    }
  }
  if (new TextEncoder().encode(JSON.stringify(translations)).length > 2 * 1024 * 1024) {
    throw new AdminMessageError('validation.bundleSize')
  }
  return { name: buffer.name.trim(), defaultLocale, translations }
}

export const validateI18nPageCode = (value: string): string => {
  const pageCode = value.trim()
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(pageCode) || pageCode.length > 128
      || pageCode.split('.').some((segment) => ['__proto__', 'constructor', 'prototype'].includes(segment))) {
    throw new AdminMessageError('validation.pageCode')
  }
  return pageCode
}
