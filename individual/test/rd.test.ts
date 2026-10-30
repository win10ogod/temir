import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { parseDeliberation, parseOutcome } from '../src/rd/aux.ts'
import { DEFAULT_PARAMS, correct, discountedReturns, jaccard, neighbors, stateTerms, termSet, uncorrected, type Candidate, type Experience } from '../src/rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, experiences, experiencesOfRecalled, openDecision, renderPreparation, shownExperiences, turnReply, type DecisionData, type OutcomeData } from '../src/rd/memory.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-rd-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const candidate = (action: string, confidence: number, kind = '建議', sameAs: string[] = []): Candidate => ({ action, kind, prediction: '對方會接受', confidence, sameAs })

const experience = (id: string, situation: string, action: string, ret: number, kind = '建議'): Experience => ({
  id,
  ts: 1_000,
  cue: situation,
  situation,
  action,
  kind,
  ret,
  outcome: '結果',
})

test('discounted returns follow G_t = r_t + γ G_{t+1} and stop at an unknown reward', () => {
  assert.deepEqual(discountedReturns([1, 0, -1], 0.5), [1 + 0.5 * (0 + 0.5 * -1), 0 + 0.5 * -1, -1])
  // 第三個決定還沒有結果：前兩個只累加到它之前，它本身沒有回報。
  assert.deepEqual(discountedReturns([1, 1, undefined, 1], 0.5), [1.5, 1, undefined, 1])
  assert.deepEqual(discountedReturns([], 0.5), [])
})

test('jaccard on index terms, and neighbors keep the k most similar above the threshold', () => {
  assert.equal(jaccard(termSet('對方想要推薦步道'), termSet('對方想要推薦步道')), 1)
  assert.equal(jaccard(termSet('步道'), termSet('咖啡')), 0)
  assert.equal(jaccard(new Set(), new Set()), 0)
  const memory = [
    experience('a', '對方腳踝受傷，想要推薦週末的戶外活動', '推薦坐著的活動', 1),
    experience('b', '對方想要推薦週末的戶外活動', '推薦爬山', -1),
    experience('c', '對方在問咖啡怎麼沖', '解釋手沖步驟', 1),
  ]
  const near = neighbors('對方腳踝受傷，想要週末的戶外活動', memory, DEFAULT_PARAMS)
  assert.deepEqual(near.map((n) => n.experience.id), ['a', 'b'])
  assert.equal(neighbors('對方腳踝受傷', memory, { ...DEFAULT_PARAMS, k: 1 }).length, 1)
})

test('without experience the choice is the model’s own preference and nothing is corrected', () => {
  const c = uncorrected([candidate('甲', 20), candidate('乙', 70), candidate('丙', 10)])
  assert.equal(c.chosen, 1)
  assert.equal(c.value, null)
  assert.ok(Math.abs(c.scored.reduce((n, s) => n + Math.exp(s.z), 0) - 1) < 1e-9, 'z = ln(c / Σc) are log-probabilities')
  assert.ok(c.scored.every((s) => s.zPrime === s.z && s.advantage === 0))
  assert.equal(correct([candidate('甲', 20), candidate('乙', 70)], [], DEFAULT_PARAMS).chosen, 1)
})

test('experience flips the choice: a known bad action loses, a known good one wins (z’ = z + β·Ã)', () => {
  const near = neighbors(
    '對方腳踝受傷，想要週末的戶外活動',
    [
      experience('good', '對方腳踝受傷，想要週末的戶外活動', '推薦可以坐著的活動', 1.5),
      experience('bad', '對方腳踝受傷，想要週末的戶外活動', '推薦長時間步行的步道', -1.5),
    ],
    DEFAULT_PARAMS,
  )
  assert.equal(near.length, 2)
  const result = correct([candidate('推薦長時間步行的步道', 60), candidate('推薦可以坐著的活動', 40)], near, DEFAULT_PARAMS, () => 0.99)
  assert.equal(result.value, 0) // V̂ = mean(1.5, −1.5)
  const [walk, sit] = result.scored
  assert.equal(walk!.q, -1.5)
  assert.equal(sit!.q, 1.5)
  assert.ok(Math.abs(walk!.normalized + 1) < 1e-5 && Math.abs(sit!.normalized - 1) < 1e-5, 'advantages normalized by max|A|')
  assert.ok(Math.abs(sit!.zPrime - (Math.log(0.4) + 1)) < 1e-5)
  assert.equal(result.chosen, 1, 'experience overrides the 60/40 preference')
})

test('unseen actions get the optimistic value with probability λ, otherwise Q = 0 (eq:exploration)', () => {
  const near = neighbors('對方想聊電影', [experience('m', '對方想聊電影', '推薦科幻片', 0.5)], DEFAULT_PARAMS)
  const optimistic = correct([candidate('推薦紀錄片', 50, '建議'), candidate('推薦科幻片', 50, '建議')], near, DEFAULT_PARAMS, () => 0.1)
  assert.equal(optimistic.scored[0]!.optimistic, true)
  assert.equal(optimistic.scored[0]!.q, 0.5 + DEFAULT_PARAMS.alpha / 1)
  assert.equal(optimistic.scored[1]!.optimistic, null)
  const pessimistic = correct([candidate('推薦紀錄片', 50, '建議'), candidate('推薦科幻片', 50, '建議')], near, DEFAULT_PARAMS, () => 0.9)
  assert.equal(pessimistic.scored[0]!.optimistic, false)
  assert.equal(pessimistic.scored[0]!.q, 0)
})

test('the model’s sameAs judgement matches a past action that shares no words', () => {
  const near = neighbors('對方心情不好想聊聊', [experience('e1', '對方心情不好想聊聊', '先安靜聽對方說完', -1, '其他')], DEFAULT_PARAMS)
  const r = correct([candidate('陪伴傾聽', 50, '表達感受', ['e1']), candidate('給建議', 50)], near, DEFAULT_PARAMS, () => 0.99)
  assert.equal(r.scored[0]!.support, 1)
  assert.equal(r.scored[0]!.q, -1)
})

test('parseDeliberation maps experience labels, clamps confidence, and refuses fewer than two candidates', () => {
  const labels = new Map([['E1', 'l:abc']])
  const d = parseDeliberation(
    '```json\n{"situation":"對方想推薦步道","similar":["E1","E7"],"candidates":[{"action":"推薦坐著的活動","kind":"建議","prediction":"對方會喜歡","confidence":140,"sameAs":["e1","E9"]},{"action":"先問腳傷","kind":"奇怪","prediction":"對方說明","confidence":-5}]}\n```',
    labels,
  )
  assert.ok(d)
  assert.equal(d.candidates[0]!.confidence, 100)
  assert.deepEqual(d.candidates[0]!.sameAs, ['l:abc'], 'unknown labels are dropped')
  assert.deepEqual(d.similar, ['l:abc'])
  assert.equal(d.candidates[1]!.kind, '其他')
  assert.equal(d.candidates[1]!.confidence, 0)
  assert.equal(parseDeliberation('{"situation":"x","candidates":[{"action":"只有一個"}]}', labels), undefined)
  assert.equal(parseDeliberation('不是 JSON', labels), undefined)
})

/** 事後比對的必填欄位都合格時的解析結果（不合格時測試失敗）。 */
function judged(raw: string) {
  const parsed = parseOutcome(raw)
  assert.ok(parsed.ok, `expected a valid outcome: ${parsed.ok ? '' : parsed.problems.join('；')}`)
  return parsed.judgment
}
/** 必填欄位（didAction、matched、reward、significance）都合格的事後比對，加上要測的欄位。 */
const required = (fields: Record<string, unknown>) => JSON.stringify({ didAction: '先聽', matched: 'yes', reward: 0, significance: 'daily', ...fields })

test('parseOutcome: the judgment is mandatory; every missing or invalid required field is listed, and the reward is clamped to [-1, 1]', () => {
  const o = judged('{"didAction":"推薦坐竹筏","didKind":"建議","actual":"對方很開心","matched":"partly","reward":3,"reason":"符合我在乎的事","lesson":"","significance":"notable"}')
  assert.deepEqual([o.reward, o.matched, o.significance], [1, 'partly', 'notable'])
  assert.equal(judged(required({ didKind: '奇怪' })).didKind, '其他', 'didKind is not required')
  const problems = (raw: string) => {
    const parsed = parseOutcome(raw)
    return parsed.ok ? [] : parsed.problems
  }
  assert.deepEqual(problems('{"didAction":"推薦坐竹筏","matched":"maybe","reward":3,"significance":"daily"}'), ['matched 不是 yes、partly 或 no'], 'no default is filled in for the model')
  assert.deepEqual(problems(required({ reward: '好' })), ['reward 不是數'])
  assert.deepEqual(problems(required({ reward: Number.NaN })), ['reward 不是數'])
  assert.deepEqual(problems(required({ didAction: '  ' })), ['didAction 是空的'])
  assert.deepEqual(problems(required({ significance: 'huge' })), ['significance 不是 daily、notable、major、pivotal 之一'])
  assert.deepEqual(problems('{}'), ['reward 不是數', 'matched 不是 yes、partly 或 no', 'didAction 是空的', 'significance 不是 daily、notable、major、pivotal 之一'])
  assert.deepEqual(problems('不是 JSON'), ['不是 JSON 物件'])
})

function decision(store: LifeStore, session: string, situation: string, action: string): ReturnType<LifeStore['append']> {
  const c = { ...candidate(action, 60), z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0 }
  const data: DecisionData = { cue: situation, situation, candidates: [c], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
  return store.append({ kind: DECISION_KIND, origin: 'self', session, data, text: `處境：${situation}` })
}

function outcome(store: LifeStore, decisionId: string, reward: number, didAction = ''): void {
  const data: OutcomeData = { decision: decisionId, didAction, didKind: '建議', actual: '對方回應', matched: 'yes', error: '', reward, reason: '', lesson: '', selfVersion: 0, heard: '' }
  store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data, text: '預測', causes: [decisionId] })
}

test('experiences come from decisions with known outcomes; returns are discounted within the session', () => {
  withStore((store) => {
    const d1 = decision(store, 's1', '處境一', '做法一')
    const d2 = decision(store, 's1', '處境二', '做法二')
    const d3 = decision(store, 's1', '處境三', '做法三')
    outcome(store, d1.id, 1)
    outcome(store, d2.id, -1, '實際上我改成先提問')
    // d3 還沒有結果，不是經驗；d1 的回報只累加到 d3 之前。
    const memory = experiences(store, 0.5)
    assert.deepEqual(memory.map((e) => [e.id, e.ret]), [
      [d1.id, 1 + 0.5 * -1],
      [d2.id, -1],
    ])
    assert.equal(memory[1]!.action, '實際上我改成先提問', 'the action actually taken, not the plan')
    // d3 回應的那句話已經寫進日誌：下一句話來時，它就是要比對的決定。
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：第三句' })
    assert.equal(openDecision(store, 's1')?.id, d3.id)
    assert.equal(openDecision(store, 's2'), undefined)
    // 已經隔了兩句話（中間的思考失敗）：現在的話不是它的結果。
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：第四句' })
    assert.equal(openDecision(store, 's1'), undefined)
  })
})

test('turnReply finds what I actually said after the decision, skipping injected context', () => {
  withStore((store) => {
    const d = decision(store, 's1', '對方問推薦', '推薦')
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：推薦一本書' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '[runtime-context] 環境' })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我想：想一下\n我說：推薦《雲朵郵差》' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：謝謝' })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：不客氣' })
    assert.equal(turnReply(store, d), '推薦《雲朵郵差》')
  })
})

test('the preparation lists candidates, the experience correction, the choice and past outcomes', () => {
  const near = neighbors('對方腳踝受傷想出門', [experience('good', '對方腳踝受傷想出門', '推薦可以坐著的活動', 1)], DEFAULT_PARAMS)
  const delib = { situation: '對方腳踝受傷想出門', drive: '對方想出門，我在乎對方的腳傷', activated: [], similar: [], people: [], candidates: [candidate('推薦爬山', 70), candidate('推薦可以坐著的活動', 30)] }
  const correction = correct(delib.candidates, near, DEFAULT_PARAMS, () => 0.99)
  const text = renderPreparation(delib, correction, near)
  assert.match(text, /不是對方說的話/)
  assert.match(text, /推動你的：對方想出門，我在乎對方的腳傷/, 'the kinetic energy the individual named (H-E)')
  // V̂ = 1：與經驗相符的做法 Q̂ = V̂（優勢 0）；未見過的做法依 1−λ 給 Q = 0，優勢 −1，所以被壓下去。
  assert.match(text, /推薦爬山（建議）.*經驗修正 -1\.00（沒有相符的經驗）/)
  assert.match(text, /推薦可以坐著的活動（建議）.*經驗修正 \+0\.00（1 個相符的經驗）/)
  assert.match(text, /你準備：第 2 個做法/)
  assert.match(text, /過去類似處境的經驗：\n- .*回報 1\.00/)
})

test('state similarity uses only intent, emotion and topic; judged experiences are neighbors regardless of wording', () => {
  const venting = '對方：同一個人｜對方的意圖：抒發工作壓力｜對方的情緒：煩躁、疲憊｜話題：工作加班｜相關的記憶：之前說只想抒發'
  const ventingAgain = '對方：同一個人｜對方的意圖：抒發壓力｜對方的情緒：煩躁｜話題：工作又出狀況｜相關的記憶：無'
  const request = '對方：同一個人｜對方的意圖：請我整理對話｜對方的情緒：平靜｜話題：整理經歷｜相關的記憶：之前說只想抒發'
  assert.ok(jaccard(stateTerms(venting), stateTerms(ventingAgain)) > jaccard(stateTerms(venting), stateTerms(request)))
  assert.equal(jaccard(stateTerms(request), stateTerms('對方：同一個人｜對方的意圖：問天氣｜對方的情緒：平靜｜話題：天氣｜相關的記憶：之前說只想抒發')) < 0.2, true, 'shared labels and memory do not count')
  assert.deepEqual([...stateTerms('沒有格式的處境描述')], [...termSet('沒有格式的處境描述')], 'free text falls back to all terms')
  const memory = [experience('v', venting, '只聽不給建議', 1), experience('r', request, '整理', 1)]
  const lexical = neighbors(ventingAgain, memory, { ...DEFAULT_PARAMS, stateThreshold: 0.9 })
  assert.equal(lexical.length, 0)
  const judged = neighbors(ventingAgain, memory, { ...DEFAULT_PARAMS, stateThreshold: 0.9 }, ['v'])
  assert.deepEqual(judged.map((n) => [n.experience.id, n.judged]), [['v', true]])
})

test('the preparation leaves out the summarized memory, so the reply uses the full recall', async () => {
  const { preparedSituation } = await import('../src/rd/memory.ts')
  const s = '對方：子珩｜對方的意圖：想知道醫囑｜對方的情緒：平靜｜話題：醫囑｜相關的記憶：只記得膝傷'
  assert.equal(preparedSituation(s), '對方：子珩｜對方的意圖：想知道醫囑｜對方的情緒：平靜｜話題：醫囑')
  const delib = { situation: s, drive: '', activated: [], similar: [], people: [], candidates: [candidate('完整列出我記得的所有醫囑', 60), candidate('先問膝蓋', 40)] }
  const text = renderPreparation(delib, uncorrected(delib.candidates), [])
  assert.doesNotMatch(text, /只記得膝傷/)
  assert.match(text, /回應的內容以回憶與對話為準/)
  assert.doesNotMatch(text, /推動你的/, 'no drive line when the individual did not name one')
})

test('the deliberation and the outcome carry kinetic energy and the release or creation of potential (H-E)', () => {
  const d = parseDeliberation('{"situation":"x","drive":"對方又在抒發；我懸著的「先分清楚要建議還是傾聽」被觸發","candidates":[{"action":"先聽","confidence":60},{"action":"給建議","confidence":40}]}', new Map())
  assert.equal(d?.drive, '對方又在抒發；我懸著的「先分清楚要建議還是傾聽」被觸發')
  assert.equal(parseDeliberation('{"situation":"x","candidates":[{"action":"a"},{"action":"b"}]}', new Map())?.drive, '', 'older outputs without a drive still parse')
  const o = judged('{"didAction":"先聽","actual":"對方說謝謝","matched":"yes","reward":0.6,"reason":"r","significance":"daily","released":"先分清楚對方要什麼的目標有了進展","left":"答應下次問對方想不想聽建議"}')
  assert.deepEqual([o.released, o.releasedRefs, o.left], ['先分清楚對方要什麼的目標有了進展', [], [{ text: '答應下次問對方想不想聽建議', type: 'unresolved' }]], 'the first format (one sentence) still parses, as one item')
  assert.deepEqual([judged(required({})).released, judged(required({})).left], ['', []])
})

test('the second energy format names items: activated in the deliberation, released in the outcome', () => {
  const d = parseDeliberation('{"situation":"x","drive":"對方又提到轉職，我答應過要提醒他","activated":["P2","g:3fa1c2d4"],"candidates":[{"action":"a"},{"action":"b"}]}', new Map())
  assert.deepEqual(d?.activated, ['P2', 'g:3fa1c2d4'], 'labels are kept as written; the caller resolves them to keys')
  const o = judged(required({ reward: 0.5, released: [{ item: 'P2', how: '我提醒了他，他說謝謝' }, { item: '', how: '沒有編號的略過' }, { how: '缺 item' }], left: '' }))
  assert.deepEqual([o.releasedRefs, o.released], [['P2'], 'P2：我提醒了他，他說謝謝'])
})

test('the energy ablation removes exactly the energy fields from both prompts; the default prompts are unchanged', async () => {
  const { deliberateSystem, outcomeSystem, DELIBERATE_SYSTEM, OUTCOME_SYSTEM } = await import('../src/rd/aux.ts')
  assert.equal(deliberateSystem(), DELIBERATE_SYSTEM)
  assert.equal(outcomeSystem(), OUTCOME_SYSTEM)
  const d = deliberateSystem(false)
  const o = outcomeSystem(false)
  for (const f of ['"drive"', '"activated"', '- drive：', '- activated：']) assert.ok(!d.includes(f), `deliberation without energy still has ${f}`)
  for (const f of ['"released"', '"left"', '- released：', '- left：']) assert.ok(!o.includes(f), `outcome without energy still has ${f}`)
  // 其餘內容逐行相同：只少了能量的那幾行。
  const lines = (s: string) => s.split('\n')
  assert.equal(lines(DELIBERATE_SYSTEM).length - lines(d).length, 2)
  assert.equal(lines(OUTCOME_SYSTEM).length - lines(o).length, 2)
  assert.ok(lines(d).slice(2).every((l) => DELIBERATE_SYSTEM.includes(l)))
  assert.match(d, /\{"situation": "\.\.\.", "similar": \[\], "people": \[\], "candidates"/)
  assert.match(o, /"significance": "daily"\}/)
})

test('energy v3: what an action leaves is recorded item by item, each with its kind; unknown kinds become unresolved', () => {
  const o = judged(required({ reward: 0.5, left: [{ text: '答應婚禮後問他致詞順不順利', type: 'promise' }, { text: '等他胃鏡的結果', type: 'waiting' }, { text: '不確定該不該一直追問', type: 'worry' }, { text: '' }] }))
  assert.deepEqual(o.left, [
    { text: '答應婚禮後問他致詞順不順利', type: 'promise' },
    { text: '等他胃鏡的結果', type: 'waiting' },
    { text: '不確定該不該一直追問', type: 'unresolved' },
  ])
  assert.deepEqual(judged(required({ left: [] })).left, [])
})

test('PC = ST + E − RD = A: RD subtracts candidates the individual rules out; the action is chosen from what remains', async () => {
  const { chooseAmong } = await import('../src/rd/jitrl.ts')
  const d = parseDeliberation(
    '{"situation":"x","candidates":[{"action":"直接給建議","confidence":70,"excluded":true,"reason":"上次對方說只想抒發"},{"action":"先聽對方說完","confidence":20},{"action":"轉移話題","confidence":10,"excluded":"true","reason":"字串不算"}]}',
    new Map(),
  )!
  assert.deepEqual(d.candidates.map((c) => [c.excluded ?? false, c.excludeReason ?? '']), [[true, '上次對方說只想抒發'], [false, ''], [false, '']], 'only the boolean true subtracts')
  const plain = uncorrected(d.candidates)
  assert.equal(plain.chosen, 1, 'the highest inclination was subtracted, so the action comes from what remains')
  const text = renderPreparation(d, plain, [])
  assert.match(text, /1\. 直接給建議.*你扣除了這個做法：上次對方說只想抒發/)
  assert.match(text, /你準備：第 2 個做法（扣除不做的之後剩下的）/)
  // 全部都被扣除時，扣除照實保留，選擇退回全部候選。
  const all = [candidate('a', 60), candidate('b', 40)].map((c) => ({ ...c, excluded: true }))
  assert.equal(chooseAmong([0.1, 0.9], all), 1)
  assert.equal(chooseAmong([0.9, 0.1], [{ ...candidate('a', 60), excluded: true }, candidate('b', 40)]), 1)
})

test('deliberation text that reaches records carries no per-call potential labels (dev5: the main model echoed "P1、P2")', async () => {
  const { mapDeliberationText } = await import('../src/rd/aux.ts')
  const { unlabel } = await import('../src/self/energy.ts')
  const held = [
    { key: 'left:a#0', kind: 'left', type: 'waiting', outward: true, text: '她對蝦蟹過敏的嚴重程度還沒回覆', ts: 0, source: 'a', seq: 1 },
    { key: 'left:b#0', kind: 'left', type: 'promise', outward: true, text: '答應幫她找不含蝦蟹的料理', ts: 0, source: 'b', seq: 2 },
  ] as const
  const labels = new Map([['P1', 'left:a#0'], ['P2', 'left:b#0']])
  const d = parseDeliberation(
    '{"situation":"她欠我回覆的：過敏程度（P1）","drive":"P2 一直懸著","candidates":[{"action":"先問 P1","prediction":"P2 會被放下","confidence":60,"excluded":true,"reason":"P1 問過太多次"},{"action":"推薦清蒸魚","confidence":40}]}',
    new Map(),
  )!
  const plain = mapDeliberationText(d, (s) => unlabel(s, labels, held))
  const all = [plain.situation, plain.drive, ...plain.candidates.flatMap((c) => [c.action, c.prediction, c.excludeReason ?? ''])].join('\n')
  assert.doesNotMatch(all, /\bP\d+\b/u)
  assert.match(plain.situation, /「她對蝦蟹過敏的嚴重程度還沒回覆」/u)
  assert.match(plain.candidates[0]!.excludeReason!, /「她對蝦蟹過敏/u)
  assert.equal(plain.candidates[1]!.excludeReason, undefined)
})

test('ablation without subtraction: no subtraction wording or fields; the action is chosen among all candidates', async () => {
  const { deliberateSystem, DELIBERATE_SYSTEM, withoutExclusions } = await import('../src/rd/aux.ts')
  const off = deliberateSystem(true, false)
  assert.doesNotMatch(off, /扣除|excluded|reason/u)
  assert.match(off, /預測各自的後果，再決定傾向哪一個。/u)
  assert.equal(deliberateSystem(true, true), DELIBERATE_SYSTEM)
  assert.equal(off.split('\n').length, DELIBERATE_SYSTEM.split('\n').length - 2, 'only the two subtraction fields are removed')
  assert.doesNotMatch(deliberateSystem(false, false), /drive|activated|扣除/u)
  const d = parseDeliberation('{"situation":"x","candidates":[{"action":"給建議","confidence":70,"excluded":true,"reason":"她說過不要"},{"action":"聽她說","confidence":30}]}', new Map())!
  const plain = withoutExclusions(d)
  assert.ok(plain.candidates.every((c) => c.excluded === undefined && c.excludeReason === undefined))
  const chosen = uncorrected(plain.candidates)
  assert.equal(chosen.chosen, 0, 'without subtraction the highest inclination is chosen')
  assert.doesNotMatch(renderPreparation(plain, chosen, [], false), /扣除/u)
  assert.match(renderPreparation(d, uncorrected(d.candidates), []), /扣除不做的之後剩下的/u)
})

test('a provisional outcome (the other went silent) keeps the decision open for the real comparison when the other replies', () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-rd-silent-'))
  const store = LifeStore.open(home)
  try {
    const d = store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data: { cue: '想好名字再告訴我', situation: 'x', candidates: [], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }, text: '處境：對方請我想好名字再告訴他' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：想好名字再告訴我' })
    assert.equal(openDecision(store, 's1')?.id, d.id)
    const base = { decision: d.id, didAction: 'a', didKind: '回答', actual: '對方沒有再說話', matched: 'partly', error: '', reward: 0, reason: '', lesson: '', selfVersion: 0, heard: '' }
    store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { ...base, provisional: true }, causes: [d.id] })
    assert.equal(openDecision(store, 's1')?.id, d.id, 'only a provisional comparison so far')
    store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { ...base, actual: '對方說謝謝', reward: 0.5 }, causes: [d.id] })
    assert.equal(openDecision(store, 's1'), undefined)
    assert.equal(experiences(store, 0.5).find((e) => e.id === d.id)?.ret, 0.5, 'the latest comparison wins')
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('per-person check: the situation lists each person the other mentions; the ablation removes exactly that line', async () => {
  const { deliberateSystem, DELIBERATE_SYSTEM } = await import('../src/rd/aux.ts')
  assert.match(DELIBERATE_SYSTEM, /逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人/u)
  const off = deliberateSystem(true, true, false)
  assert.doesNotMatch(off, /逐一檢查/u)
  assert.equal(off.split('\n').length, DELIBERATE_SYSTEM.split('\n').length - 2, 'the per-person line and the people field')
  assert.doesNotMatch(off, /people/u)
  const d = parseDeliberation('{"situation":"x","people":[{"who":"對方自己","relevant":["對蝦蟹過敏","在戒含糖飲料"]},{"who":"對方的媽媽","relevant":["有糖尿病"]},"對方的兒子"],"candidates":[{"action":"分開講","confidence":60},{"action":"只講媽媽","confidence":40}]}', new Map())!
  assert.deepEqual(d.people, [{ who: '對方自己', relevant: ['對蝦蟹過敏', '在戒含糖飲料'] }, { who: '對方的媽媽', relevant: ['有糖尿病'] }, { who: '對方的兒子', relevant: [] }])
  const prep = renderPreparation(d, uncorrected(d.candidates), [])
  assert.match(prep, /回應時每一項都要顧到，包括題目沒有問到、但也在場的人/u)
  assert.match(prep, /- 對方自己：對蝦蟹過敏；在戒含糖飲料\n- 對方的媽媽：有糖尿病\n- 對方的兒子\n/u)
  const alone = parseDeliberation('{"situation":"x","people":[{"who":"對方自己","relevant":["膝傷"]}],"candidates":[{"action":"a","confidence":60},{"action":"b","confidence":40}]}', new Map())!
  assert.doesNotMatch(renderPreparation(alone, uncorrected(alone.candidates), []), /這次涉及的人/u, 'one person: no reminder')
})

test('experiencesOfRecalled: decisions made in the turns recall brought in, even without shared words', () => {
  withStore((store) => {
    const heard = store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '對方說：護理長又臨時叫我加班。' })
    const d = decision(store, 'old', '護理長又臨時叫我加班。', '直接給她兩個跟護理長談的說法')
    outcome(store, d.id, 0.6, '給了兩個說法')
    const other = decision(store, 'elsewhere', '護理長又臨時叫我加班。', '只陪伴')
    outcome(store, other.id, -0.4, '只陪伴')
    const memory = experiences(store, DEFAULT_PARAMS.gamma)
    // 新的開場白「過年又排到連續的班」與舊的處境沒有共同的詞，詞彙比對找不到；回憶帶進了那個回合，就找得到。
    const fromRecall = experiencesOfRecalled(store, memory, [heard.id, 'missing-id'])
    assert.deepEqual(fromRecall.map((e) => e.id), [d.id])
    assert.equal(fromRecall[0]!.ret, 0.6)
    assert.deepEqual(experiencesOfRecalled(store, memory, []), [])
    const lexical = [memory.find((e) => e.id === other.id)!, memory.find((e) => e.id === d.id)!]
    assert.deepEqual(shownExperiences(fromRecall, lexical, 5).map((e) => e.id), [d.id, other.id])
    assert.deepEqual(shownExperiences(fromRecall, lexical, 1).map((e) => e.id), [d.id])
  })
})

test('D20: the deliberation prompt has no optional revision field; past exclusions and whether the prediction came true are shown', async () => {
  const { DELIBERATE_SYSTEM, deliberateSystem } = await import('../src/rd/aux.ts')
  const { renderExperiences } = await import('../src/rd/memory.ts')
  // 第三版：選填的 revised 與「由你判斷」那一句拿掉了，改為另一步強制判斷。
  assert.doesNotMatch(DELIBERATE_SYSTEM, /revised|扣除本身也會被經驗改變/u)
  assert.match(DELIBERATE_SYSTEM, /"excluded": false, "reason": ""\}\]\}/u)
  assert.doesNotMatch(deliberateSystem(true, false), /excluded/u)
  // 舊紀錄的 revised 仍可解析。
  const d = parseDeliberation('{"situation":"x","candidates":[{"action":"直接給她兩個方法","revised":"舊版寫的"},{"action":"只陪伴","excluded":true,"reason":"r"}]}', new Map())
  assert.equal(d?.candidates[0]?.revised, '舊版寫的')
  withStore((store) => {
    const c = (action: string, excluded: boolean, excludeReason = '') => ({ ...candidate(action, 50), z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0, ...(excluded ? { excluded, excludeReason } : {}) })
    const data: DecisionData = { cue: '又被罵了', situation: '對方在抒發', candidates: [{ ...c('只陪伴', false), kind: '表達感受' }, c('給兩個方法', true, '她是在抒發，不是求助')], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
    const e = store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data, text: '處境：對方在抒發' })
    outcome(store, e.id, -0.5, '只陪伴')
    const [x] = experiences(store, DEFAULT_PARAMS.gamma)
    assert.deepEqual(x?.excludedThen, [{ action: '給兩個方法', kind: '建議', reason: '她是在抒發，不是求助' }])
    assert.match(renderExperiences([x!]), /我當時：只陪伴（[^）]+）｜結果：[^｜]+｜回報 -0\.50｜當時扣除：給兩個方法（她是在抒發，不是求助）$/u)
    assert.match(renderExperiences([{ ...x!, matched: 'no' }]), /當時扣除：給兩個方法（她是在抒發，不是求助）｜扣除之後，當時的預測沒有成真$/u)
    assert.doesNotMatch(renderExperiences([x!], false), /當時扣除/u)
  })
})

test('D20 v3: the judgment is the model\'s, but it is mandatory: the program finds which exclusions need one and validates every answer', async () => {
  const { exclusionReviews, renderExclusionReview, parseJudgments, applyJudgments } = await import('../src/rd/memory.ts')
  const { revisionRetryNote, REVISION_SYSTEM } = await import('../src/rd/aux.ts')
  const day = 86_400_000
  const exp = (id: string, ts: number, kind: string, matched: 'yes' | 'partly' | 'no', ret: number, excludedThen: { action: string; kind: string; reason: string }[] = []): Experience => ({
    id, ts, cue: '抒發', situation: '對方在抒發', action: `做了${kind}`, kind, ret, outcome: '她說算了', matched, ...(excludedThen.length > 0 ? { excludedThen } : {}),
  })
  const advice = { ...candidate('直接給兩個具體的方法', 20, '建議'), excluded: true, excludeReason: '她是在抒發，不是求助' }
  const question = { ...candidate('問她想不想說', 10, '提問'), excluded: true, excludeReason: '她累了' }
  const comfort = candidate('先陪她', 70, '表達感受')
  const failed = exp('E1', 1 * day, '表達感受', 'no', -0.4, [{ action: '給她方法', kind: '建議', reason: '她在抒發' }])
  const worked = exp('E2', 2 * day, '建議', 'yes', 0.6)
  // 何時需要判斷：被扣除、而且類似處境中有同一類的紀錄（扣除過或做過）。沒有同類紀錄的扣除不需要判斷。
  const reviews = exclusionReviews([advice, comfort, question], [failed, worked])
  assert.deepEqual(reviews.map((r) => [r.index, r.evidence.map((e) => e.id)]), [[0, ['E2', 'E1']]])
  assert.deepEqual(exclusionReviews([advice], []), [])
  // 呈現：做法、扣除理由、每一筆同類經驗（X 編號）、預測有沒有成真。
  const { text, labels } = renderExclusionReview('對方在抒發', [advice, comfort, question], reviews)
  assert.match(text, /1\. 直接給兩個具體的方法（建議）｜你扣除的理由：她是在抒發，不是求助\n   - X1｜[^｜]+｜當時做了同類的「做了建議」｜結果：她說算了｜預測成真｜回報 0\.60\n   - X2｜[^｜]+｜當時扣除了同類的「給她方法」，改做「做了表達感受」｜結果：她說算了｜預測沒有成真｜回報 -0\.40/u)
  assert.deepEqual([...labels], [['X1', 'E2'], ['X2', 'E1']])
  assert.match(REVISION_SYSTEM, /都必須明確判斷：維持扣除（keep），或依經驗解除扣除（lift）/u)
  // 驗證：每一個需要判斷的做法剛好一筆，decision、why、refs 都要合格；否則列出問題，重問時附上。
  const ok = parseJudgments('{"judgments":[{"candidate":1,"decision":"lift","why":"X2 扣除後她很失望，X1 給方法她有精神","refs":["X1","x2"]}]}', reviews, labels)
  assert.deepEqual(ok, { ok: true, judgments: [{ index: 0, decision: 'lift', why: 'X2 扣除後她很失望，X1 給方法她有精神', refs: ['E2', 'E1'] }] })
  assert.deepEqual(parseJudgments('{"judgments":[]}', reviews, labels), { ok: false, problems: ['做法 1 沒有判斷'] })
  assert.deepEqual(parseJudgments('{"judgments":[{"candidate":1,"decision":"maybe","why":"","refs":["X9"]}]}', reviews, labels), {
    ok: false,
    problems: ['做法 1 的 decision 不是 keep 或 lift', '做法 1 沒有寫理由', '做法 1 沒有引用列出的經驗'],
  })
  assert.deepEqual(parseJudgments('不是 JSON', reviews, labels), { ok: false, problems: ['不是含有 judgments 的 JSON 物件'] })
  assert.match(revisionRetryNote(['做法 1 沒有判斷']), /不合格的地方：做法 1 沒有判斷）$/u)
  // 套用：lift 解除扣除並保留原本的理由；keep 維持扣除；兩者都記下判斷。
  const [lifted, untouched, kept] = applyJudgments([advice, comfort, question], [ok.ok ? ok.judgments[0]! : (undefined as never), { index: 2, decision: 'keep', why: '她累的時候問會讓她退開', refs: ['E9'] }])
  assert.equal(lifted!.excluded, undefined)
  assert.deepEqual(lifted!.judgment, { decision: 'lift', why: 'X2 扣除後她很失望，X1 給方法她有精神', refs: ['E2', 'E1'], reason: '她是在抒發，不是求助' })
  assert.equal(untouched, comfort)
  assert.equal(kept!.excluded, true)
  assert.equal(kept!.judgment?.decision, 'keep')
  // 準備訊息寫出判斷。
  const prep = renderPreparation({ situation: 'x', drive: '', activated: [], similar: [], people: [], candidates: [lifted!, comfort, kept!] }, uncorrected([lifted!, comfort, kept!]), [])
  assert.match(prep, /直接給兩個具體的方法（建議）——預期：[^\n]*｜你看過經驗之後解除了扣除：X2 扣除後她很失望，X1 給方法她有精神（原本扣除的理由：她是在抒發，不是求助）/u)
  assert.match(prep, /問她想不想說（提問）——預期：[^\n]*｜你扣除了這個做法：她累了｜看過經驗之後維持扣除：她累的時候問會讓她退開/u)
})
