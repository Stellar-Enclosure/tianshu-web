import {describe, expect, it} from 'vitest'
import {DdcApiError} from '../api/client'
import {fixtureT} from '../test/i18nFixture'
import {AdminMessageError, formatAdminError} from './errors'

describe('administration error text', () => {
  it('translates transport errors using the currently loaded central catalog', () => {
    const error = new DdcApiError(401, 'UNAUTHORIZED', 'UNAUTHORIZED')
    expect(formatAdminError(error, fixtureT('common'))).toBe('统一身份登录已过期，请重新登录')
    expect(formatAdminError(error, fixtureT('common', 'en-US'))).toBe('Your session has expired. Sign in again.')
  })

  it('keeps business diagnostic details without treating them as translation keys', () => {
    const error = new DdcApiError(409, 'RESOURCE_CHANGED', 'Resource 17 was modified by another editor', 'trace-17')
    expect(formatAdminError(error, fixtureT('common', 'en-US'))).toBe(error.message)
    expect(error.traceId).toBe('trace-17')
  })

  it('resolves structured validation failures at render time', () => {
    const error = new AdminMessageError('validation.duplicateKey', {key: 'order.title'})
    expect(formatAdminError(error, fixtureT('tianshu.i18n'))).toContain('order.title')
    expect(formatAdminError(error, fixtureT('tianshu.i18n', 'en-US'))).not.toEqual(
      formatAdminError(error, fixtureT('tianshu.i18n')),
    )
  })
})
