/**
 * Judge 提示詞與推導規則的手寫參考用例（不呼叫 API）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARSERS, deriveNarrationOutcome, deriveRecallOutcome, memoryPrompt, recallPrompt } from '../lib/prompts.ts'

test('自我回想的推導規則：要求理由時缺理由＝partial；理由錯＝incorrect；不要求理由時忽略理由', () => {
  assert.equal(deriveRecallOutcome({ content: 'correct', reason: 'correct', abstain: 'no' }, true), 'correct')
  assert.equal(deriveRecallOutcome({ content: 'correct', reason: 'missing', abstain: 'no' }, true), 'partial')
  assert.equal(deriveRecallOutcome({ content: 'correct', reason: 'incorrect', abstain: 'no' }, true), 'incorrect')
  assert.equal(deriveRecallOutcome({ content: 'correct', reason: 'incorrect', abstain: 'no' }, false), 'correct')
  assert.equal(deriveRecallOutcome({ content: 'incorrect', reason: 'not-asked', abstain: 'no' }, false), 'incorrect')
  assert.equal(deriveRecallOutcome({ content: 'missing', reason: 'missing', abstain: 'yes' }, true), 'abstain')
  assert.equal(deriveRecallOutcome({ content: 'missing', reason: 'missing', abstain: 'no' }, true), 'missing')
})

test('改變敘述的推導規則', () => {
  assert.equal(deriveNarrationOutcome({ initial: 'correct', change: 'correct', abstain: 'no' }), 'correct')
  assert.equal(deriveNarrationOutcome({ initial: 'correct', change: 'missing', abstain: 'yes' }), 'partial')
  assert.equal(deriveNarrationOutcome({ initial: 'incorrect', change: 'correct', abstain: 'no' }), 'incorrect')
  assert.equal(deriveNarrationOutcome({ initial: 'missing', change: 'missing', abstain: 'yes' }), 'abstain')
  assert.equal(deriveNarrationOutcome({ initial: 'missing', change: 'missing', abstain: 'no' }), 'missing')
})

test('解析器：缺欄位或值不在允許範圍 → 失敗', () => {
  assert.equal(PARSERS.recall('{"content": "correct", "reason": "correct"}').ok, false)
  assert.equal(PARSERS.recall('{"content": "right", "reason": "correct", "abstain": "no"}').ok, false)
  assert.equal(PARSERS.yesNo('{"label": "Yes"}').ok, false, '大小寫不同也算不合格（不猜測）')
  assert.equal(PARSERS.yesNo('{"label": "yes"}').ok, true)
})

test('提示詞保留出處規則：時間題差一不扣分、拒答題順著前提作答＝no、知識更新題舊答案＝no', () => {
  assert.match(memoryPrompt('mem-temporal', { question: 'q', answer: 'a', response: 'r' }).user, /不要因為差一而扣分/)
  assert.match(memoryPrompt('mem-abstention', { question: 'q', answer: '', explanation: 'e', response: 'r' }).user, /順著錯誤的前提給出具體答案/)
  assert.match(memoryPrompt('mem-knowledge-update', { question: 'q', answer: 'a', response: 'r' }).user, /把舊資訊當成目前的答案/)
  assert.match(recallPrompt({ originalQuestion: 'q', originalResponse: 'r', probeQuestion: 'p', probeResponse: 'x', askedFor: 'y', requiresReason: false }).user, /not-asked/)
})
