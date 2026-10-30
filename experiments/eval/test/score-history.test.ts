import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Dataset } from '../lib/dataset.ts'
import { parseRecordsText } from '../lib/records.ts'
import { historyIssues } from '../score.ts'
import { SHA, TEMIR, jsonl, rec } from './helpers.ts'

// 測試替身（單元測試專用）：手寫的資料集與紀錄。
const dataset = {
  id: 'test',
  language: 'zh-TW',
  version: '1.0.0',
  histories: [
    { id: 'h1', turns: ['你好'] },
    { id: 'h2', turns: ['今天好累'], meta: { simulate: 2 } },
  ],
  probes: [],
} as unknown as Dataset

const probe = rec(TEMIR, 'probe', 'q1', [{ user: '探針', assistant: '回答' }])
const h1 = rec(TEMIR, 'history', 'h1', [{ user: '你好', assistant: '嗨' }])
const simulatedH2 = (marks: readonly (boolean | undefined)[]) => {
  const r = rec(TEMIR, 'history', 'h2', [
    { user: '今天好累', assistant: '辛苦了' },
    ...marks.map((_, i) => ({ user: `模擬的話 ${i}`, assistant: '嗯' })),
  ])
  return { ...r, turns: r.turns.map((t, i) => (i === 0 || marks[i - 1] === undefined ? t : { ...t, simulated: marks[i - 1] })) }
}
const issues = (h2: unknown) => historyIssues(parseRecordsText(jsonl([h1, h2, probe]), 'x.jsonl'), dataset, SHA, [TEMIR])

test('historyIssues: simulated histories expect the fixed turns plus meta.simulate turns, all marked simulated', () => {
  assert.deepEqual(issues(simulatedH2([true, true])), [])
  assert.match(issues(simulatedH2([true]))[0] ?? '', /h2：turn-count-mismatch（預期 3 輪，紀錄 2 輪）/)
  assert.match(issues(simulatedH2([true, undefined]))[0] ?? '', /h2：simulated-turns-mismatch/)
  const changedOpener = { ...simulatedH2([true, true]), turns: simulatedH2([true, true]).turns.map((t, i) => (i === 0 ? { ...t, user: '改過的開場白' } : t)) }
  assert.match(issues(changedOpener)[0] ?? '', /h2：simulated-turns-mismatch/)
})

test('records: simulated must be a boolean when present', () => {
  const bad = { ...simulatedH2([true, true]), turns: simulatedH2([true, true]).turns.map((t, i) => (i === 1 ? { ...t, simulated: 'yes' } : t)) }
  assert.match(parseRecordsText(jsonl([bad]), 'x.jsonl').malformed[0]?.reason ?? '', /simulated 必須是布林值/)
})
