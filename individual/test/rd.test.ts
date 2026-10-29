import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { parseDeliberation, parseOutcome } from '../src/rd/aux.ts'
import { DEFAULT_PARAMS, correct, discountedReturns, jaccard, neighbors, stateTerms, termSet, uncorrected, type Candidate, type Experience } from '../src/rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, experiences, openDecision, renderPreparation, turnReply, type DecisionData, type OutcomeData } from '../src/rd/memory.ts'

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

test('parseOutcome requires a finite reward and clamps it to [-1, 1]', () => {
  const o = parseOutcome('{"didAction":"推薦坐竹筏","didKind":"建議","actual":"對方很開心","matched":"maybe","reward":3,"reason":"符合我在乎的事","lesson":""}')
  assert.equal(o?.reward, 1)
  assert.equal(o?.matched, 'partly')
  assert.equal(parseOutcome('{"reward":"好"}'), undefined)
  assert.equal(parseOutcome('{}'), undefined)
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
  const delib = { situation: '對方腳踝受傷想出門', drive: '對方想出門，我在乎對方的腳傷', similar: [], candidates: [candidate('推薦爬山', 70), candidate('推薦可以坐著的活動', 30)] }
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
  const delib = { situation: s, drive: '', similar: [], candidates: [candidate('完整列出我記得的所有醫囑', 60), candidate('先問膝蓋', 40)] }
  const text = renderPreparation(delib, uncorrected(delib.candidates), [])
  assert.doesNotMatch(text, /只記得膝傷/)
  assert.match(text, /回應的內容以回憶與對話為準/)
  assert.doesNotMatch(text, /推動你的/, 'no drive line when the individual did not name one')
})

test('the deliberation and the outcome carry kinetic energy and the release or creation of potential (H-E)', () => {
  const d = parseDeliberation('{"situation":"x","drive":"對方又在抒發；我懸著的「先分清楚要建議還是傾聽」被觸發","candidates":[{"action":"先聽","confidence":60},{"action":"給建議","confidence":40}]}', new Map())
  assert.equal(d?.drive, '對方又在抒發；我懸著的「先分清楚要建議還是傾聽」被觸發')
  assert.equal(parseDeliberation('{"situation":"x","candidates":[{"action":"a"},{"action":"b"}]}', new Map())?.drive, '', 'older outputs without a drive still parse')
  const o = parseOutcome('{"didAction":"先聽","actual":"對方說謝謝","matched":"yes","reward":0.6,"reason":"r","released":"先分清楚對方要什麼的目標有了進展","left":"答應下次問對方想不想聽建議"}')
  assert.deepEqual([o?.released, o?.left], ['先分清楚對方要什麼的目標有了進展', '答應下次問對方想不想聽建議'])
  assert.deepEqual([parseOutcome('{"reward":0}')?.released, parseOutcome('{"reward":0}')?.left], ['', ''])
})
