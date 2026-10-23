import {readFileSync, readdirSync} from 'node:fs'
import {resolve, relative} from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const catalogs = JSON.parse(readFileSync(resolve(root, 'src/test/i18nCatalogs.json'), 'utf8'))
const failures = []
const variables = (text) => [...new Set([...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)]
  .map((match) => match[1]))].sort().join(',')
for (const [page, languages] of Object.entries(catalogs)) {
  const chinese = languages['zh-CN']
  const english = languages['en-US']
  if (JSON.stringify(Object.keys(chinese).sort()) !== JSON.stringify(Object.keys(english).sort())) {
    failures.push(`${page}: language keys differ`)
  }
  for (const [key, value] of Object.entries(chinese)) {
    if (!value.trim() || !english[key]?.trim() || variables(value) !== variables(english[key] ?? '')) {
      failures.push(`${page}.${key}: missing text or mismatched interpolation`)
    }
  }
}

const files = []
const collect = (directory) => {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && entry.name !== 'test') collect(path)
    if (entry.isFile() && /\.tsx?$/.test(path) && !path.includes('.test.')) files.push(path)
  }
}
collect(resolve(root, 'src'))
const technicalText = new Set(['application.yml', 'YAML', '/'])
const attributes = new Set(['title', 'label', 'placeholder', 'aria-label', 'description', 'emptyText', 'okText', 'cancelText'])
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const path = relative(root, file)
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const pages = [...source.matchAll(/usePageMessages\(['"]([^'"]+)['"]\)/g)].map((match) => match[1])
  if (path === 'src/lib/i18nDraft.ts') pages.push('tianshu.i18n')
  const known = new Set(Object.keys(catalogs.common['zh-CN']))
  for (const page of pages) {
    if (!catalogs[page]) failures.push(`${path}: unknown page ${page}`)
    Object.keys(catalogs[page]?.['zh-CN'] ?? {}).forEach((key) => known.add(key))
  }
  const report = (node, message) => failures.push(`${path}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${message}`)
  const visit = (node) => {
    let visible = null
    if (ts.isJsxText(node) && node.text.trim()) visible = node.text.trim()
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(tree)) && node.initializer
        && ts.isStringLiteral(node.initializer)) visible = node.initializer.text
    // A cold-start network failure cannot obtain its retry accessibility label from the unreachable service.
    const bootstrapRetry = path === 'src/i18n/AdminI18nProvider.tsx' && visible === 'Retry'
    if (visible && !technicalText.has(visible) && !bootstrapRetry) report(node, `untranslated UI text ${JSON.stringify(visible)}`)
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[\u4e00-\u9fff]/.test(node.text)) {
      report(node, 'Chinese literal outside the central catalog')
    }
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 't'
        || ts.isNewExpression(node) && node.expression.getText(tree) === 'AdminMessageError') {
      const key = node.arguments?.[0]
      if (key && ts.isStringLiteral(key) && !known.has(key.text)) report(node, `unknown translation key ${key.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}
if (failures.length) throw new Error(failures.join('\n'))
process.stdout.write(`Validated ${Object.keys(catalogs).length} catalogs and ${files.length} source files; no missing literal keys or business text.\n`)
