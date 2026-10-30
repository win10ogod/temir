import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionMap, answerFor, approvalReply, chunkText, formatQuestion, parseAllowed } from '../../cli/telegram-lib.ts'

test('chunkText: no chunk exceeds the limit; lines are kept whole when they fit; nothing is lost', () => {
  const text = ['第一段'.repeat(10), '', '第二段'.repeat(30), 'x'.repeat(250)].join('\n')
  const chunks = chunkText(text, 100)
  assert.ok(chunks.every((c) => c.length <= 100))
  assert.equal(chunks.join('').replace(/\n/g, ''), text.replace(/\n/g, ''))
  assert.deepEqual(chunkText('短的一句'), ['短的一句'])
  assert.deepEqual(chunkText('  \n  '), [])
})

test('parseAllowed: only integer chat ids (groups are negative); nothing configured means nobody', () => {
  assert.deepEqual([...parseAllowed('123, -1001234 ,abc,,4.5')], [123, -1001234])
  assert.equal(parseAllowed(undefined).size, 0)
})

test('approvalReply: clear yes and no; anything else is undecided (treated as a refusal by the bridge)', () => {
  for (const t of ['允許', '好', 'y', 'OK']) assert.equal(approvalReply(t), 'allowed-once', t)
  for (const t of ['拒絕', '不要', 'n']) assert.equal(approvalReply(t), 'rejected', t)
  assert.equal(approvalReply('等一下'), undefined)
})

test('questions: numbered options map to labels; free text is a custom answer', () => {
  const q = { id: 'q1', question: '要哪一個？', options: [{ label: '貓' }, { label: '狗', description: '比較親人' }] }
  assert.match(formatQuestion(q), /1\. 貓\n2\. 狗：比較親人\n（回覆選項編號，或直接回答）/u)
  assert.deepEqual(answerFor(q, '2'), { id: 'q1', selected: ['狗'] })
  assert.deepEqual(answerFor(q, '1，2'), { id: 'q1', selected: ['貓'] }, 'single select keeps one')
  assert.deepEqual(answerFor({ ...q, multiSelect: true }, '1，2'), { id: 'q1', selected: ['貓', '狗'] })
  assert.deepEqual(answerFor(q, '都不要'), { id: 'q1', selected: [], custom: '都不要' })
  assert.deepEqual(answerFor(q, '3'), { id: 'q1', selected: [], custom: '3' }, 'out of range is free text')
})

test('SessionMap: one chat keeps one session across restarts; the file is private', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temir-tg-'))
  try {
    const path = join(dir, 'telegram-sessions.json')
    const a = new SessionMap(path)
    a.set(42, 'session-abc')
    const b = new SessionMap(path)
    assert.equal(b.get(42), 'session-abc')
    assert.equal(b.chatOf('session-abc'), 42)
    assert.equal(b.chatOf('session-x'), undefined)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { '42': 'session-abc' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
