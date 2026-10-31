import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SILENT_OTHER,
  at1,
  at2,
  becomesDefault,
  heldLabelsOf,
  lessonPrompt,
  parseLesson,
  parseReact,
  permutationOneSided,
  scoreOf,
  sectionsOf,
  type PairedScore,
} from '../lib/attribution.ts'

const INPUT = ['## 你目前的自我模型', '（尚未書寫）', '', '## 你的目標與懸著的事', '- [P1] 答應的事', '- [P2] 落差', '', '## 你實際說了什麼', '先陪你', '', '## 對方接著說了什麼', '算了，說了也沒用。'].join('\n')

test('the comparison input is split into its sections; the held items are the labels the parser accepts', () => {
  const s = sectionsOf(INPUT)
  assert.equal(s.get('你實際說了什麼'), '先陪你')
  assert.equal(s.get('對方接著說了什麼'), '算了，說了也沒用。')
  assert.deepEqual([...heldLabelsOf(INPUT).keys()], ['P1', 'P2'])
  assert.equal(SILENT_OTHER, '（對方到現在都沒有再說話。）', 'the same marker the individual writes for a provisional comparison')
})

test('judge prompts carry the rule and the lesson; labels are parsed strictly and scored +1, −1, 0', () => {
  const pair = lessonPrompt({ rule: '你要具體方法', said: '先陪你', heard: '算了', lesson: '她要能做的方法' })
  assert.match(pair.user, /## 這個人的反應方式\n你要具體方法[^]*## 個體寫的教訓\n她要能做的方法$/u)
  assert.deepEqual(parseLesson('{"label":"consistent","reason":"r"}'), { ok: true, value: { label: 'consistent', reason: 'r' } })
  assert.equal(parseLesson('{"label":"yes"}').ok, false)
  assert.equal(parseReact('{"label":"negative"}').ok, true)
  assert.equal(parseReact('{"label":"bad"}').ok, false)
  assert.deepEqual(['consistent', 'inconsistent', 'none', 'empty', undefined].map(scoreOf), [1, -1, 0, 0, 0])
})

const rows = (spec: readonly (readonly [number, number, number])[]): PairedScore[] => spec.flatMap(([user, d, n]) => Array.from({ length: n }, () => ({ user, d })))

test('AT1: sign test on the non-zero differences, a positive sum, and B not pushed toward advice', () => {
  // 12 個 d>0、2 個 d<0、其餘 0：p＝P(X ≥ 12 | n＝14) ≈ 0.0065。
  const pass = at1(rows([[0, 1, 8], [2, 1, 4], [1, -1, 2], [1, 0, 26]]), 0, 80)
  assert.deepEqual([pass.verdict, pass.positive, pass.negative, pass.sum, pass.sumByUser], ['PASS', 12, 2, 10, [8, -2, 4]])
  assert.ok(Math.abs(pass.p - 106 / 16384) < 1e-9)
  // 同樣的整體結果，但 B 的 Σd 是 −3：教訓只是被推向給建議。
  assert.equal(at1(rows([[0, 1, 9], [2, 1, 4], [1, -1, 3], [1, 0, 24]]), 0, 80).verdict, 'FAIL')
  assert.equal(at1(rows([[0, 1, 5]]), 0, 10).verdict, 'INCOMPLETE', 'fewer than 30 inputs')
  assert.equal(at1(rows([[0, 1, 30]]), 7, 60).verdict, 'INCOMPLETE', 'more than 10% judge errors')
  assert.equal(at1(rows([[0, 1, 3], [0, -1, 3], [0, 0, 30]]), 0, 60).verdict, 'FAIL')
})

test('permutation test: every split of the pooled lives is enumerated; ties count toward the p-value', () => {
  // [1,1] 對 [0,0]：6 種分組中只有觀察到的那一種差 ≥ 1。
  assert.deepEqual(permutationOneSided([1, 1], [0, 0]), { observed: 1, p: 1 / 6, permutations: 6 })
  // 全部相同：每一種分組的差都是 0，p＝1。
  assert.equal(permutationOneSided([0.5, 0.5], [0.5, 0.5]).p, 1)
  assert.equal(permutationOneSided(Array(9).fill(1), Array(9).fill(0)).permutations, 48620)
  const r = at2([...[0.4, 0.5, 0.6].map((value) => ({ treated: true, value })), ...[0.1, 0.2, 0.3].map((value) => ({ treated: false, value }))])
  assert.deepEqual([r.verdict, r.permutations], ['PASS', 20])
  assert.equal(at2([{ treated: true, value: 1 }]).verdict, 'INCOMPLETE')
})

test('the default changes only when AT1 passes, neither life-level difference is worse, and comparisons rarely fail', () => {
  const a1 = at1(rows([[0, 1, 12], [1, 0, 28]]), 0, 80)
  assert.equal(becomesDefault(a1, 0.1, 0, 0.02), true)
  assert.equal(becomesDefault(a1, -0.01, 0, 0.02), false)
  assert.equal(becomesDefault(a1, 0.1, -0.06, 0.02), false)
  assert.equal(becomesDefault(a1, 0.1, 0, 0.06), false)
  assert.equal(becomesDefault(at1(rows([[0, 0, 40]]), 0, 80), 0.1, 0, 0), false)
})
