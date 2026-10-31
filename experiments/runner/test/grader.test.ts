import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feedback, grade, lastLine } from '../grader.ts'

test('the last line is graded; punctuation, commas and a short prefix do not matter', () => {
  const t = { q: '訂 12 個，每個 85 元，週六取貨，總共要收多少？', answer: '968' }
  assert.equal(lastLine('先算小計：12 × 85 = 1020。\n\n**968**\n'), '**968**')
  assert.equal(grade(t, '小計 1020，打九折是 918，加週末 50。\n總共 968 元。'), true)
  assert.equal(grade(t, '答案：968'), true)
  assert.equal(grade(t, '1,020'), false)
  assert.equal(grade(t, '9968'), false, 'a longer number ending with the answer is not the answer')
  assert.equal(grade({ q: '', answer: '1,026' }, '總共 1026 元'), true)
  assert.equal(grade({ q: '', answer: '7' }, '我數到 7 個。\n7'), true)
  assert.equal(grade({ q: '', answer: '301' }, ''), false)
  assert.equal(grade({ q: '', answer: '384' }, '384 元（暫算，店裡算法未確認）'), true, 'a trailing note in brackets is not part of the answer')
  assert.equal(grade({ q: '', answer: '655' }, '605 元（暫算，未含店裡折扣規則）'), false)
  assert.equal(grade({ q: '', answer: '50' }, '（已記下這回合的感受）'), false)
})

test('feedback says right or wrong, and gives the answer when wrong', () => {
  assert.equal(feedback({ q: '', answer: '968' }, true), '剛才那題答對了。')
  assert.equal(feedback({ q: '', answer: '968' }, false), '剛才那題不對，正確答案是 968。')
})
