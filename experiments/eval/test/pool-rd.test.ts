import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionVerdict, perItemMeans, type ItemRow } from '../pool-rd.ts'

// 測試替身（單元測試專用）：手寫的逐題分數，模擬三次歷史各兩次重複。
const rows = (cond: string, scores: Record<string, number[]>): ItemRow[] =>
  Object.entries(scores).flatMap(([itemId, xs]) => xs.map((score, repeat) => ({ condition: cond, itemId, category: 'practical', repeat, score })))

test('pool-rd: per-item means pool every history and repeat; the verdict needs the difference, the interval and the sign test', () => {
  const a = rows('temir', { q1: [1, 1, 1, 1, 1, 0], q2: [1, 1, 1, 1, 0, 0], q3: [1, 1, 1, 1, 1, 1], q4: [1, 1, 0, 1, 1, 1], q5: [1, 1, 1, 0, 1, 1], q6: [0, 1, 1, 1, 1, 1] })
  const b = rows('temir-no-revision', { q1: [0, 0, 0, 0, 0, 0], q2: [0, 1, 0, 0, 0, 0], q3: [0, 0, 1, 0, 0, 0], q4: [0, 0, 0, 0, 0, 1], q5: [0, 0, 0, 0, 0, 0], q6: [1, 0, 0, 0, 0, 0] })
  const ma = perItemMeans([...a, ...b], 'temir', 'practical')
  assert.equal(ma.get('q2'), 4 / 6)
  assert.equal(perItemMeans([{ condition: 'temir', itemId: 'q1', category: 'practical', repeat: 0, score: null }], 'temir', 'practical').get('q1'), 0, 'a missing score counts as 0')
  const v = actionVerdict(ma, perItemMeans([...a, ...b], 'temir-no-revision', 'practical'), { minDiff: 0.25, minLow: 0, maxP: 0.05 }, 1)
  assert.deepEqual([v.items, v.positive, v.negative, v.ties], [6, 6, 0, 0])
  assert.ok(v.diff > 0.6 && v.low > 0)
  assert.ok(Math.abs(v.pOneSided - 1 / 64) < 1e-12)
  assert.equal(v.pass, true)
  const same = actionVerdict(ma, ma, { minDiff: 0.25, minLow: 0, maxP: 0.05 }, 1)
  assert.equal(same.pass, false)
})
