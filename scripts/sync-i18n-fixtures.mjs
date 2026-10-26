import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const manifestOption = process.argv.indexOf('--manifest')
if (manifestOption < 0 || !process.argv[manifestOption + 1]) throw new Error('--manifest must identify a compiled Tianshu source manifest')
const manifest = JSON.parse(readFileSync(resolve(process.argv[manifestOption + 1]), 'utf8'))
if (manifest.producer?.id !== 'tianshu-java') throw new Error('Expected the tianshu-service source manifest')
const catalogs = {}
for (const message of manifest.messages) {
  if (message.pageCode === 'tianshu.permissions') continue
  catalogs[message.pageCode] ??= {}
  for (const [locale, value] of Object.entries(message.defaults)) {
    catalogs[message.pageCode][locale] ??= {}
    catalogs[message.pageCode][locale][message.key] = value
  }
}
// The front-end source declarations are static JSON arguments, just like the backend source catalogs.
const declarations = readFileSync(resolve(import.meta.dirname, '../src/permissions/messages.ts'), 'utf8')
const messages = JSON.parse(declarations.split('defineMessages(')[1].split(' as const)')[0])
for (const message of messages) {
  catalogs[message.pageCode] ??= {}
  for (const [locale, value] of Object.entries(message.defaults)) {
    catalogs[message.pageCode][locale] ??= {}
    catalogs[message.pageCode][locale][message.key] = value
  }
}
const output = resolve(import.meta.dirname, '../src/test/i18nCatalogs.json')
const previous = JSON.parse(readFileSync(output, 'utf8'))
const preserveOrder = (value, prior = {}) => Object.fromEntries([
  ...Object.keys(prior).filter(key => Object.hasOwn(value, key)),
  ...Object.keys(value).filter(key => !Object.hasOwn(prior, key)).sort(),
].map(key => [key, typeof value[key] === 'object' ? preserveOrder(value[key], prior[key]) : value[key]]))
const content = JSON.stringify(preserveOrder(catalogs, previous), null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== content) throw new Error('Translation test fixtures are out of sync with the server catalog')
} else {
  writeFileSync(output, content)
}
