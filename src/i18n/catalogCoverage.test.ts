import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {expect, it} from 'vitest'

it('keeps administration text and translation references covered by the central catalogs', () => {
  const output = execFileSync(process.execPath, [resolve('scripts/check-i18n.mjs')], {encoding: 'utf8'})
  expect(output).toContain('no missing literal keys or business text')
})
