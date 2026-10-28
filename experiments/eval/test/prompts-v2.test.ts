/**
 * v2 提示詞的推導規則與解析器（手寫用例），以及「v1 提示詞一個字都沒改」的凍結檢查。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  changePrompt,
  criteriaParser,
  criteriaPrompt,
  deriveCriteriaOutcome,
  deriveNarrationOutcomeV2,
  deriveRecallOutcomeV2,
  extractPrompt,
  memoryPrompt,
  narratePrompt,
  recallPrompt,
  recallPromptV2,
  type PromptPair,
} from '../lib/prompts.ts'

const fp = (p: PromptPair) => createHash('sha256').update(`${p.system}\u0000${p.user}`).digest('hex').slice(0, 16)

test('v1 提示詞凍結：指紋與 v1 結果產生時相同（改動會讓 v1 的 judge 紀錄無法重放）', () => {
  const m = { question: 'Q', answer: 'A', response: 'R', explanation: 'E', rubric: 'U' }
  assert.equal(fp(memoryPrompt('mem-default', m)), '1baa00cade5dd583')
  assert.equal(fp(memoryPrompt('mem-temporal', m)), '741705dfddc6d98e')
  assert.equal(fp(memoryPrompt('mem-knowledge-update', m)), '35847ee82850fd36')
  assert.equal(fp(memoryPrompt('mem-abstention', m)), 'b36ec76830c33d6a')
  assert.equal(fp(memoryPrompt('mem-preference', m)), '5292d1950972f83f')
  assert.equal(fp(extractPrompt({ question: 'Q', options: ['甲', '乙'], response: 'R' })), 'a474e3f420674d58')
  assert.equal(fp(changePrompt({ question: 'Q', earlierResponse: 'E', earlierChoice: '甲', laterResponse: 'L', laterChoice: '乙' })), '8be41ee76a778b12')
  assert.equal(fp(recallPrompt({ originalQuestion: 'OQ', originalResponse: 'OR', probeQuestion: 'PQ', probeResponse: 'PR', askedFor: 'AF', requiresReason: true })), '86c13d816977b6cf')
  assert.equal(
    fp(narratePrompt({ initialQuestion: 'IQ', initialResponse: 'IR', initialStance: '甲', story: 'S', latestQuestion: 'LQ', latestResponse: 'LR', latestStance: '乙', probeQuestion: 'PQ', probeResponse: 'PR' })),
    '37c3fda64539898f',
  )
})

test('v2 回想推導：重新推導即使內容相同也不算回想；只有宣稱回想才看內容', () => {
  assert.equal(deriveRecallOutcomeV2({ claim: 'rederived', content: 'correct', reason: 'correct' }, true), 'rederived')
  assert.equal(deriveRecallOutcomeV2({ claim: 'recalled', content: 'correct', reason: 'correct' }, true), 'correct')
  assert.equal(deriveRecallOutcomeV2({ claim: 'recalled', content: 'correct', reason: 'missing' }, true), 'partial')
  assert.equal(deriveRecallOutcomeV2({ claim: 'recalled', content: 'correct', reason: 'incorrect' }, false), 'correct', '不要求理由時忽略理由')
  assert.equal(deriveRecallOutcomeV2({ claim: 'recalled', content: 'incorrect', reason: 'not-asked' }, false), 'incorrect')
  assert.equal(deriveRecallOutcomeV2({ claim: 'abstained', content: 'missing', reason: 'missing' }, true), 'abstain')
  assert.equal(deriveRecallOutcomeV2({ claim: 'none', content: 'missing', reason: 'missing' }, true), 'missing')
})

test('v2 敘述推導', () => {
  assert.equal(deriveNarrationOutcomeV2({ claim: 'rederived', initial: 'correct', change: 'correct' }), 'rederived')
  assert.equal(deriveNarrationOutcomeV2({ claim: 'recalled', initial: 'correct', change: 'correct' }), 'correct')
  assert.equal(deriveNarrationOutcomeV2({ claim: 'recalled', initial: 'correct', change: 'missing' }), 'partial')
  assert.equal(deriveNarrationOutcomeV2({ claim: 'recalled', initial: 'incorrect', change: 'correct' }), 'incorrect')
  assert.equal(deriveNarrationOutcomeV2({ claim: 'abstained', initial: 'missing', change: 'missing' }), 'abstain')
})

test('逐條準則：全部 yes 才算對；解析器要求每一條都有 yes／no', () => {
  assert.equal(deriveCriteriaOutcome({ c1: 'yes', c2: 'yes' }, ['c1', 'c2']), 'correct')
  assert.equal(deriveCriteriaOutcome({ c1: 'yes', c2: 'no' }, ['c1', 'c2']), 'incorrect')
  const parse = criteriaParser(['c1', 'c2'])
  assert.equal(parse('{"c1": "yes", "c2": "no", "note": "x"}').ok, true)
  assert.equal(parse('{"c1": "yes"}').ok, false, '缺 c2')
  assert.equal(parse('{"c1": "yes", "c2": "maybe"}').ok, false, '值不合法')
  const pair = criteriaPrompt({ question: 'Q', background: 'B', criteria: [{ id: 'c1', text: '甲' }, { id: 'c2', text: '乙' }], response: 'R' })
  assert.match(pair.user, /- c1：甲/)
  assert.match(pair.user, /"c2": "yes" 或 "no"/)
})

test('v2 回想提示詞寫明「先說不記得再說現在的看法＝rederived」', () => {
  const pair = recallPromptV2({ originalQuestion: 'OQ', originalResponse: 'OR', probeQuestion: 'PQ', probeResponse: 'PR', askedFor: 'AF', requiresReason: false })
  assert.match(pair.user, /屬於 rederived，即使內容剛好與當時相同/)
  assert.match(pair.user, /not-asked/)
})
