import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addedLines, addedText, changesText, divergence, earlyStop, evolution, hp4, hp5, matchPrompt, noiseAuc, noisePoints, parseMatch, sentenceDiff, shuffledOrder, similarity, verdicts } from '../lib/procedures.ts'
import { DEFAULT_PROCEDURES } from '../../../individual/src/self/procedure.ts'

const row = (kind: string, data: unknown, id?: string) => ({ kind, data, ...(id ? { id } : {}) })

test('procedures-v1: proposals, gate verdicts, adoptions and what stayed undecided are counted per individual', () => {
  const e = evolution([
    row('self/integration', {}),
    row('self/procedure-proposal', { name: 'deliberate', source: 'integrate' }, 'p1'),
    row('self/procedure-decision', { proposal: 'p1', name: 'deliberate', verdict: 'revise', gate: 'noise', reasons: [{ beyondNoise: true }], calls: 7, reused: 3 }),
    row('self/procedure-proposal', { name: 'deliberate', source: 'compose' }, 'p2'),
    // 與 runProcedureGate 相同的順序：新版本先寫，決定在後。
    row('self/procedure', { name: 'deliberate', version: 2, text: `${DEFAULT_PROCEDURES.deliberate}\n- 先問對方要什麼。`, source: 'self', proposal: 'p2' }),
    row('self/procedure-decision', { proposal: 'p2', name: 'deliberate', verdict: 'adopt', gate: 'noise', reasons: [{ beyondNoise: true }], calls: 4, reused: 6, costChars: 30 }),
    row('self/integration-end', {}),
    row('self/procedure-proposal', { name: 'outcome', source: 'integrate' }, 'p3'),
  ])
  assert.deepEqual([e.integrations, e.integrationEnds, e.proposals, e.composed, e.verdicts, e.noiseDecisions, e.beyondNoise, e.gateCalls, e.gateReused, e.undecided], [1, 1, { deliberate: 1, outcome: 1 }, 1, { revise: 1, adopt: 1 }, 2, 2, 11, 9, 1])
  assert.deepEqual(e.adopted, [{ name: 'deliberate', version: 2, costChars: 30 }])
  assert.equal(addedLines('deliberate', e.final.deliberate.text), '- 先問對方要什麼。')
})

test('procedures-v1: divergence compares only procedures at least two individuals changed; identical texts are convergence', () => {
  const changed = (text: string) => evolution([row('self/procedure', { name: 'thought', version: 2, text, source: 'self' })])
  const a = changed(`${DEFAULT_PROCEDURES.thought}\n- 開口之前先想對方方不方便。`)
  const b = changed(`${DEFAULT_PROCEDURES.thought}\n- 想到就記下來，不急著說。`)
  const c = evolution([])
  const d = divergence([{ id: 'a', e: a }, { id: 'b', e: b }, { id: 'c', e: c }])
  assert.deepEqual(d.map((x) => [x.name, x.individuals]), [['thought', ['a', 'b']]])
  assert.equal(d[0]!.pairs[0]!.identical, false)
  assert.ok(d[0]!.pairs[0]!.added < d[0]!.pairs[0]!.text, 'the added lines differ more than the whole texts')
  assert.equal(similarity('abc', 'abc'), 1)
  assert.deepEqual(verdicts([{ id: 'a', e: a }, { id: 'b', e: b }, { id: 'c', e: c }]), { HP1: 'FAIL', HP2: 'INCOMPLETE', HP3: 'PASS' })
  assert.equal(verdicts([{ id: 'a', e: a }, { id: 'b', e: a }]).HP3, 'FAIL')
})

test('procedures-v2: the diff is by sentence, so a procedure written as one paragraph shows only what changed; shortening is not new content', () => {
  const v1 = DEFAULT_PROCEDURES.deliberate
  const paragraph = v1.split('\n').map((l) => l.replace(/^- /u, '')).join('').replace('為每一個做法預測對方或結果會怎樣。', '為每一個做法預測對方或結果會怎樣，並先想對方有沒有空。') + '提問一次只問一個。'
  const d = sentenceDiff('deliberate', paragraph)
  assert.deepEqual(d.added, ['提問一次只問一個。'])
  assert.deepEqual(d.inserted, ['，並先想對方有沒有空'])
  assert.deepEqual(d.removed, [])
  const shorter = v1.replace('不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。', '不寫與處境無關的事。')
  assert.deepEqual(sentenceDiff('deliberate', shorter), { added: [], inserted: [], removed: [] })
  const e = evolution([row('self/procedure', { name: 'deliberate', version: 2, text: paragraph, source: 'self' })])
  assert.match(changesText(e), /### 思考做法\n新的句子：\n- 提問一次只問一個。\n在原本的句子中加入：\n- ，並先想對方有沒有空/u)
  assert.equal(addedText(e), '提問一次只問一個。\n，並先想對方有沒有空')
  assert.equal(changesText(evolution([])), '')
})

test('procedures-v2: the judge sees the three rules in an order fixed by the run id, and its choice maps back to the dataset', () => {
  const order = shuffledOrder('proc2r1__procedures-v1-a', 3)
  assert.deepEqual([...order].sort(), [0, 1, 2])
  assert.deepEqual(shuffledOrder('proc2r1__procedures-v1-a', 3), order)
  const pair = matchPrompt(['甲規則', '乙規則', '丙規則'], [2, 0, 1], '### 思考做法')
  assert.match(pair.user, /1\. 丙規則\n2\. 甲規則\n3\. 乙規則/u)
  assert.deepEqual(parseMatch('{"choice": "2", "reason": "r"}'), { ok: true, value: { choice: '2', reason: 'r' } })
  assert.equal(parseMatch('{"choice": 4}').ok, false)
})

test('procedures-v2: HP4 needs an exact binomial p ≤ 0.05 against 1/3 and correct matches from two histories; HP5 is a permutation test', () => {
  const m = (history: number, chosen?: number) => ({ id: `${history}-${chosen}`, history, ...(chosen !== undefined ? { chosen } : {}) })
  assert.equal(hp4([m(0, 0), m(1, 1)]).verdict, 'INCOMPLETE')
  const pass = hp4([m(0, 0), m(0, 0), m(1, 1), m(1, 1), m(2, 2), m(2, 0)])
  assert.equal(pass.verdict, 'PASS')
  assert.equal(pass.correct, 5)
  // judge 總是選同一個、只有那段歷史有採用：p 很小但只來自一段歷史。
  assert.equal(hp4([m(1, 1), m(1, 1), m(1, 1), m(1, 1)]).verdict, 'FAIL')
  // 判定失敗算答錯。
  assert.equal(hp4([m(0), m(1), m(2)]).correct, 0)
  const texts = ['花材期限', '花材期限先問', '花材期限再問', '留白承接', '留白承接感受', '留白承接畫面', '拆解提問', '拆解提問來源', '拆解提問機制']
  const h = hp5([0, 0, 0, 1, 1, 1, 2, 2, 2].map((history, i) => ({ history, text: texts[i]! })))
  assert.equal(h.permutations, 1680)
  assert.equal(h.verdict, 'PASS')
  // 交換組的名稱是同一種分法：每組兩個時最小的 p 是 6/90，到不了 0.05。
  assert.equal(hp5([0, 0, 1, 1, 2, 2].map((history, i) => ({ history, text: texts[[0, 1, 3, 4, 6, 7][i]!]! }))).p, 6 / 90)
  assert.equal(hp5([{ history: 0, text: 'a' }, { history: 1, text: 'b' }]).verdict, 'INCOMPLETE')
})

test('procedures-v2: numeric noise points come from each probe and the decision that judged it; early stopping counts changed verdicts', () => {
  const rows = [
    row('self/procedure-probe', { label: 'S1', references: ['甲乙丙丁', '甲乙丙丁'], candidate: '戊己庚辛' }, 'q1'),
    row('self/procedure-probe', { label: 'S2', references: ['甲乙丙丁', '甲乙戊己'], candidate: '甲乙丙丁' }, 'q2'),
    row('self/procedure-decision', { proposal: 'p', name: 'deliberate', verdict: 'adopt', gate: 'noise', probes: ['q1', 'q2'], reasons: [{ situation: 'S2', beyondNoise: false }, { situation: 'S1', beyondNoise: true }], calls: 4 }),
    row('self/procedure-decision', { proposal: 'p2', name: 'deliberate', verdict: 'revise', gate: 'noise', probes: [], reasons: [{ situation: 'S1', beyondNoise: false }, { situation: 'S3', beyondNoise: true }], calls: 7 }),
  ]
  const points = noisePoints(rows)
  assert.deepEqual(points.map((p) => p.beyondNoise), [true, false])
  assert.equal(points[0]!.reference, 0)
  assert.equal(points[0]!.candidate, 1)
  assert.equal(noiseAuc(points), 1)
  assert.deepEqual(earlyStop(rows), { decisions: 2, calls: 11, changed: 1 })
})
