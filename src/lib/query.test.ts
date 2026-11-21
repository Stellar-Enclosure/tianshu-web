import { describe, expect, it } from 'vitest'
import { buildQuery, formatTime } from './query'

describe('tianshu query and time boundary', () => {
  it('formats the same instant accurately in explicit UTC, Asia/Shanghai, and America/New_York zones', () => {
    const instant = '2026-07-31T23:30:00Z'

    expect(formatTime(instant, 'en-GB', 'UTC')).toContain('31/07/2026')
    expect(formatTime(instant, 'en-GB', 'UTC')).toContain('23:30:00')

    expect(formatTime(instant, 'zh-CN', 'Asia/Shanghai')).toContain('2026/08/01')
    expect(formatTime(instant, 'zh-CN', 'Asia/Shanghai')).toContain('07:30:00')

    expect(formatTime(instant, 'en-US', 'America/New_York')).toContain('07/31/2026')
    expect(formatTime(instant, 'en-US', 'America/New_York')).toContain('19:30:00')
  })

  it('preserves pure calendar dates across negative offsets and rejects timezone-less ambiguous datetimes', () => {
    expect(formatTime('2026-07-31', 'en-US', 'America/New_York')).toBe('2026-07-31')
    expect(formatTime('2026-07-31', 'zh-CN', 'Asia/Shanghai')).toBe('2026-07-31')
    expect(formatTime('2026-07-31T10:00:00', 'zh-CN', 'Asia/Shanghai')).toBe('—')
    expect(formatTime('not-a-timestamp', 'zh-CN', 'UTC')).toBe('—')
    expect(formatTime('2026-08-01T07:30:00+08:00', 'en-GB', 'UTC')).toContain('23:30:00')
  })

  it('builds query strings with trimmed strings without inventing extra date fields', () => {
    expect(buildQuery({ bizCode: ' pay-biz ', status: '', changeId: ' chg-1 ', empty: undefined })).toBe(
      'bizCode=pay-biz&changeId=chg-1',
    )
  })
})
