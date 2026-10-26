import { describe, expect, it } from 'vitest'
import { AdminMessageError, formatAdminError } from '../i18n/errors'
import { fixtureT } from '../test/i18nFixture'
import { i18nBufferToDraft, i18nDraftToBuffer, normalizeI18nLocale, validateI18nPageCode } from './i18nDraft'

const draft = () => i18nDraftToBuffer({
  name: '订单页面', defaultLocale: 'zh-CN',
  translations: { 'zh-CN': { title: '您好 {{name}}', 'actions.create': '新建' }, 'en-US': { title: 'Hello {{name}}' } },
})

describe('page translation draft validation', () => {
  it('validates placeholders against the source default even when the default-locale override was edited', () => {
    const buffer = i18nDraftToBuffer({name: '页面', defaultLocale: 'zh-CN', translations: {'zh-CN': {title: '覆盖文案'}}})
    expect(() => i18nBufferToDraft(buffer, {'zh-CN': {title: '源文案 {{name}}'}})).toThrow(AdminMessageError)
  })

  it('allows removal of an obsolete override while rejecting text for a missing source key', () => {
    const buffer = i18nDraftToBuffer({name: '页面', defaultLocale: 'zh-CN', translations: {'zh-CN': {removed: '旧文案'}}})
    expect(() => i18nBufferToDraft(buffer, {'zh-CN': {current: '当前源文案'}})).toThrow(AdminMessageError)
    buffer.entries[0].values['zh-CN'] = ''
    expect(i18nBufferToDraft(buffer, {'zh-CN': {current: '当前源文案'}}).translations).toEqual({'zh-CN': {}})
  })

  it('keeps exact nonempty translations and omits missing locale values for fallback', () => {
    const buffer = draft()
    buffer.entries[0].values['en-US'] = '  '
    buffer.entries[1].values['en-US'] = '  Hello {{name}}\n'
    expect(i18nBufferToDraft(buffer).translations).toEqual({
      'zh-CN': { 'actions.create': '新建', title: '您好 {{name}}' },
      'en-US': { title: '  Hello {{name}}\n' },
    })
    expect(i18nBufferToDraft({ name: '空草稿', defaultLocale: 'zh-CN', locales: ['zh-CN'], entries: [] }).translations)
      .toEqual({ 'zh-CN': {} })
  })

  it('rejects duplicates, dangerous paths and missing default language values', () => {
    const buffer = draft()
    buffer.entries[1].key = buffer.entries[0].key
    expect(() => i18nBufferToDraft(buffer)).toThrow('validation.duplicateKey')
    buffer.entries[1].key = 'profile.__proto__.title'
    expect(() => i18nBufferToDraft(buffer)).toThrow('validation.key')
    buffer.entries[1].key = 'title'
    buffer.entries[1].values['zh-CN'] = ''
    expect(() => i18nBufferToDraft(buffer)).toThrow('validation.defaultText')
  })

  it('rejects mismatched placeholders and oversized values', () => {
    const buffer = draft()
    buffer.entries[1].values['en-US'] = 'Hello {{other}}'
    expect(() => i18nBufferToDraft(buffer)).toThrow('validation.placeholders')
    buffer.entries[1].values['en-US'] = 'x'.repeat(8193)
    expect(() => i18nBufferToDraft(buffer)).toThrow('validation.textLimit')
  })

  it('canonicalizes language tags and rejects invalid codes before a request', () => {
    expect(normalizeI18nLocale('zh-cn')).toBe('zh-CN')
    expect(normalizeI18nLocale('en-us')).toBe('en-US')
    expect(() => normalizeI18nLocale('en_US')).toThrow('validation.locale')
    expect(() => normalizeI18nLocale('und')).toThrow('validation.locale')
    expect(validateI18nPageCode('common')).toBe('common')
    expect(validateI18nPageCode('order.list')).toBe('order.list')
    expect(() => validateI18nPageCode('../orders')).toThrow('validation.pageCode')
    expect(() => validateI18nPageCode('constructor.title')).toThrow('validation.pageCode')
  })

  it('keeps validation errors translatable without interpreting placeholder examples as arguments', () => {
    const buffer = draft()
    buffer.entries[1].values['en-US'] = 'Hello {{user.name}}'
    let failure: unknown
    try { i18nBufferToDraft(buffer) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(AdminMessageError)
    expect(failure).toMatchObject({
      key: 'validation.placeholderSyntax', values: { example: '{{name}}', alternate: '{{first_name}}' },
    })
    expect(formatAdminError(failure, fixtureT('tianshu.i18n')))
      .toBe('占位符格式无效，请使用 {{name}} 或 {{first_name}}')
    expect(formatAdminError(failure, fixtureT('tianshu.i18n', 'en-US')))
      .toBe('Invalid placeholder syntax. Use {{name}} or {{first_name}}')
  })

  it.each(['Hello {{user.name}}', 'Hello {{first-name}}', 'Hello {{name', 'Hello name}}'])(
    'rejects unsupported or incomplete interpolation: %s', (text) => {
      const buffer = draft()
      buffer.entries[1].values['en-US'] = text
      expect(() => i18nBufferToDraft(buffer)).toThrow('validation.placeholderSyntax')
    },
  )
})
