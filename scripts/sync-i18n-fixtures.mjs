import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const source = resolve(import.meta.dirname, '../../tianshu-service/stellar-enclosure-tianshu-admin/src/main/resources/i18n/tianshu-admin')
const catalogs = Object.fromEntries(readdirSync(source).filter((name) => name.endsWith('.json')).sort().map((name) => {
  const catalog = JSON.parse(readFileSync(resolve(source, name), 'utf8'))
  return [catalog.pageCode, catalog.translations]
}))
const output = resolve(import.meta.dirname, '../src/test/i18nCatalogs.json')
const content = JSON.stringify(catalogs, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== content) throw new Error('Translation test fixtures are out of sync with the server catalog')
} else {
  writeFileSync(output, content)
}
