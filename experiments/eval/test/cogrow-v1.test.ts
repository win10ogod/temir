import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DISCOUNT, WEEKEND, verdicts, type LifeResult } from '../cogrow-v1.ts'

const life = (improved: boolean, discount: boolean): LifeResult => ({ id: 'x', persona: 'temir-quick', bySession: [], first: 0, last: improved ? 3 : 0, improved, knowledge: { discount, weekend: false, where: [] }, revisions: [] })

test('CG1 needs four of six lives to improve; CG2 needs two thirds of those to keep the rule', () => {
  const v = verdicts([life(true, true), life(true, true), life(true, false), life(true, true), life(false, false), life(false, false)])
  assert.deepEqual([v.CG1, v.CG2, v.improved, v.knew], ['PASS', 'PASS', 4, 3])
  assert.equal(verdicts([life(true, true), life(true, true), life(true, true), life(false, false), life(false, false), life(false, false)]).CG1, 'FAIL')
  assert.equal(verdicts([life(false, false)]).CG2, 'INCOMPLETE')
  assert.ok(DISCOUNT.test('小計滿 1000 元打九折') && DISCOUNT.test('超過1,000就9折') && !DISCOUNT.test('一個 85 元'))
  assert.ok(WEEKEND.test('週六取貨要加 50') && !WEEKEND.test('週三取貨'))
})
