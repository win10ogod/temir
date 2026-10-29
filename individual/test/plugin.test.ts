import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { PLUGIN_KIND, approvalText, codeHash, idPrefix, ownPlugins, renderOwnPlugins, validatePlugin, type PluginProposalData } from '../src/plugin/plugin.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-plugin-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const CODE = "return { apply(ctx) { ctx.tools.register(harness.defineTool({ name: 'day_of_year', description: 'd', parameters: {}, async execute() { return '1' } })) } }"

function write(store: LifeStore, op: PluginProposalData['op'], name: string, code = CODE, purpose = '查今天是今年的第幾天') {
  return store.append({ kind: PLUGIN_KIND.proposal, origin: 'self', data: { op, name, purpose, code: op === 'retire' ? '' : code, sha256: codeHash(op === 'retire' ? '' : code) } satisfies PluginProposalData })
}

test('validatePlugin: names, targets, limits, and code that does not parse is refused without running it', () =>
  withStore((store) => {
    assert.match(validatePlugin(store, { op: 'add', name: 'Day Counter', purpose: 'p', code: CODE })!, /不符合規則/)
    assert.match(validatePlugin(store, { op: 'revise', name: 'day-counter', purpose: 'p', code: CODE })!, /沒有叫/)
    assert.match(validatePlugin(store, { op: 'add', name: 'day-counter', purpose: '', code: CODE })!, /用途要寫/)
    assert.match(validatePlugin(store, { op: 'add', name: 'day-counter', purpose: 'p', code: 'return { apply(ctx) {' })!, /程式碼無法解析/)
    let ran = false
    ;(globalThis as { __ran?: () => void }).__ran = () => (ran = true)
    assert.equal(validatePlugin(store, { op: 'add', name: 'day-counter', purpose: 'p', code: 'globalThis.__ran(); return () => {}' }), undefined)
    assert.equal(ran, false, 'validation only compiles the code')
    assert.equal(validatePlugin(store, { op: 'add', name: 'day-counter', purpose: 'p', code: 'const x = await Promise.resolve(1); return () => x' }), undefined, 'the body is async, like in DSH')
    write(store, 'add', 'day-counter')
    assert.match(validatePlugin(store, { op: 'add', name: 'day-counter', purpose: 'p', code: CODE })!, /已經有/)
    assert.equal(validatePlugin(store, { op: 'retire', name: 'day-counter', purpose: '', code: '' }), undefined)
  }))

test('ownPlugins: the latest version per name; a new version needs its own approval; retire removes it', () =>
  withStore((store) => {
    const v1 = write(store, 'add', 'day-counter')
    assert.deepEqual(ownPlugins(store).map((p) => [p.name, p.version, p.approved]), [['day-counter', v1.id, false]])
    store.append({ kind: PLUGIN_KIND.approval, origin: 'body', data: { proposal: v1.id, name: 'day-counter', sha256: codeHash(CODE) }, causes: [v1.id] })
    assert.equal(ownPlugins(store)[0]!.approved, true)
    assert.match(renderOwnPlugins(store).join('\n'), /day-counter：查今天是今年的第幾天（.*已核准，每段對話都會啟用）/u)
    const v2 = write(store, 'revise', 'day-counter', `${CODE}\n// v2`)
    assert.deepEqual(ownPlugins(store).map((p) => [p.version, p.approved]), [[v2.id, false]], 'the revised code is not covered by the old approval')
    write(store, 'retire', 'day-counter')
    assert.deepEqual(ownPlugins(store), [])
    assert.deepEqual(renderOwnPlugins(store), [])
  }))

test('idPrefix follows the DSH rule (3–6 lower-case letters); the approval text shows purpose, hash and code', () => {
  assert.equal(idPrefix('day-counter'), 'daycou')
  assert.equal(idPrefix('a1'), 'atmr')
  assert.match(idPrefix('x'), /^[a-z]{3,6}$/)
  const long = Array.from({ length: 100 }, (_, i) => `// line ${i}`).join('\n')
  const text = approvalText({ name: 'day-counter', purpose: '查日期', code: long, sha256: codeHash(long) })
  assert.match(text, /個體想啟用它自己寫的插件「day-counter」（sha256 [0-9a-f]{12}）/u)
  assert.match(text, /沙盒不是隔離/u)
  assert.match(text, /共 100 行，只顯示前 80 行/u)
})
