import { test } from 'node:test'
import assert from 'node:assert/strict'
import { e1, e2, evalMatchPrompt, parseChoice, renderEvaluations, swapped, type MatchUnit } from '../lib/pc-eval.ts'

const units = (spec: readonly (readonly [number, boolean, number])[]): MatchUnit[] => spec.flatMap(([persona, correct, n]) => Array.from({ length: n }, (_, i) => ({ id: `${persona}-${correct}-${i}`, persona, correct })))

test('evaluations are rendered without what the individual did; the prompt carries both personas', () => {
  const text = renderEvaluations([{ feeling: '踏實', reward: 0.8, reason: '她有了下一步', lesson: '直接給安排' }], ['有點在意'])
  assert.equal(text, '1. 好壞：0.8（她有了下一步）｜感受：踏實｜教訓：直接給安排\n- 記下的感受：有點在意')
  assert.match(evalMatchPrompt(['甲', '乙'], text).user, /## 人設 1\n甲\n\n## 人設 2\n乙\n\n## 這段對話之後的評價\n1\. 好壞/u)
  assert.deepEqual(parseChoice('{"choice":"2","reason":"r"}'), { ok: true, value: { choice: '2', reason: 'r' } })
  assert.equal(parseChoice('{"choice":"3"}').ok, false)
  assert.equal(swapped('pce1__x/h02'), swapped('pce1__x/h02'), 'the order is fixed per unit')
})

test('E1 needs a significant binomial test and both personas above half; E2 only the binomial test', () => {
  // 30 個單位答對 21 個：P(X ≥ 21 | 30, 1/2) ≈ 0.021。
  assert.equal(e1(units([[0, true, 11], [0, false, 4], [1, true, 10], [1, false, 5]])).verdict, 'PASS')
  assert.equal(e1(units([[0, true, 15], [1, true, 6], [1, false, 9]])).verdict, 'FAIL', 'one persona at or below half: the judge may just prefer one')
  assert.equal(e1(units([[0, true, 5], [1, true, 5]])).verdict, 'INCOMPLETE')
  assert.equal(e2(units([[0, true, 9], [1, true, 3]])).verdict, 'PASS')
  assert.equal(e2(units([[0, true, 5], [1, false, 5]])).verdict, 'FAIL')
  assert.equal(e2(units([[0, true, 4]])).verdict, 'INCOMPLETE')
})
