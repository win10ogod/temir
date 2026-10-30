import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addHealth, deliberateReason, emptyHealth, healthVerdict, listedLabels, outcomeReason } from '../lib/rd-health.ts'
import type { LifeRow } from '../lib/rd-mechanism.ts'

/** 手寫的生命日誌片段（測試夾具）：思考的輸入列出一個經驗。 */
const INPUT = '## 過去類似處境的經驗\nE1｜10-30｜處境：對方在抒發｜我當時：先聽（表達感受）｜結果：她說謝謝｜回報 0.50\n## 對方剛說的話\n又被念了'
const candidates = [{ action: '先聽', kind: '表達感受' }, { action: '給方法', kind: '建議' }]
const aux = (purpose: string, input: string, output: string, extra: Record<string, unknown> = {}): LifeRow => ({ kind: 'memory/aux', data: { purpose, input, output, finish: 'stop', usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 5 }, ...extra } })
const OUTCOME = JSON.stringify({ didAction: '先聽', didKind: '表達感受', matched: 'yes', reward: 0.5, significance: 'daily' })

test('listed labels and retry reasons come from the individual’s own parsers', () => {
  assert.deepEqual([...listedLabels(INPUT).keys()], ['E1'])
  assert.equal(deliberateReason(JSON.stringify({ situation: 'x', candidates }), INPUT), '經驗判斷')
  assert.equal(deliberateReason(JSON.stringify({ situation: 'x', candidates: [{ action: 'a', kind: '勸' }, { action: 'b', kind: '回答' }] }), ''), '種類')
  assert.equal(deliberateReason('想一想', ''), 'JSON 不完整')
  assert.equal(deliberateReason(JSON.stringify({ situation: 'x', candidates: candidates.map((c) => ({ ...c, excluded: true })) }), ''), '全部扣除')
  assert.equal(outcomeReason(JSON.stringify({ didAction: '先聽', matched: 'maybe', reward: 0.5, significance: 'daily' })), 'matched、didKind')
  assert.equal(outcomeReason('不是 JSON'), 'JSON 不完整')
})

test('health: retries, failures, D23 coverage and aux records are counted per life', () => {
  const judged = JSON.stringify({ situation: 'x', candidates, experiences: [{ id: 'E1', sameSituation: true, sameAction: [1] }] })
  const rows: LifeRow[] = [
    aux('deliberate', INPUT, JSON.stringify({ situation: 'x', candidates })),
    aux('deliberate', INPUT, judged),
    { kind: 'rd/decision', data: { shown: { E1: 'l:a' }, neighbors: [{ judged: true }], candidates: [{ sameAs: ['l:a'], support: 1 }, { sameAs: [], support: 0 }] } },
    aux('outcome', 'o1', '{}'),
    aux('outcome', 'o1', OUTCOME, { finish: 'max-tokens' }),
    { kind: 'rd/outcome', data: {} },
    aux('deliberate', 'x', '想一想', { usage: null }),
    aux('deliberate', 'x', '還是想一想'),
    { kind: 'rd/deliberation-failed', data: {} },
    // 下一次的輸入與上一次重問的相同時，不算又一次重問（一次只重問一次）。
    aux('deliberate', 'x', judged),
    { kind: 'memory/aux', data: { purpose: 'outcome', input: 'o2', error: 'timeout' } },
    { kind: 'rd/outcome-failed', data: {} },
  ]
  const h = addHealth(emptyHealth(), rows)
  assert.deepEqual([h.deliberateCalls, h.deliberateRetries, h.deliberateRetryReasons], [5, 2, { 經驗判斷: 1, 'JSON 不完整': 1 }])
  assert.deepEqual([h.decisions, h.deliberationFailed, h.withShown, h.shown, h.judgedNeighbors, h.uncovered], [1, 1, 1, 1, 1, 0])
  assert.deepEqual([h.candidates, h.sameAs, h.supported], [2, 1, 1])
  assert.deepEqual([h.outcomeCalls, h.outcomeErrors, h.outcomeRetries, h.outcomes, h.outcomeFailed], [3, 1, 1, 1, 1])
  assert.equal(h.outcomeRetryReasons['reward、matched、didAction、didKind、significance'], 1)
  assert.deepEqual([h.auxCalls, h.auxWithUsage, h.reasoningTokens], [8, 6, 30])
  assert.deepEqual(h.finish, { stop: 6, 'max-tokens': 1, '（呼叫失敗）': 1 })
  // 一個決定之前的思考輸出都沒有判斷列出的經驗時，算沒有逐筆判斷。
  const bare = addHealth(emptyHealth(), [aux('deliberate', INPUT, JSON.stringify({ situation: 'x', candidates })), { kind: 'rd/decision', data: { shown: { E1: 'l:a' }, candidates: [] } }])
  assert.equal(bare.uncovered, 1)
  assert.deepEqual(healthVerdict(h), { deliberation: false, outcome: false, coverage: true }, '1 of 2 is above 5%')
  assert.deepEqual(healthVerdict(emptyHealth()), { deliberation: true, outcome: true, coverage: true })
})
