/**
 * 改進清單第 6 項：其他「程式替模型決定」的地方改成驗證與重問。驗證器的測試，以及第 3 項風格的控制流測試（測試替身）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { INTEGRATION_KIND, collect } from '../src/integrate/evidence.ts'
import { runIntegration } from '../src/integrate/index.ts'
import { INTEGRATE_SYSTEM, integrateRetryNote, parseProposal, proposalProblems, validate } from '../src/integrate/proposal.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { ALL_EXCLUDED_NOTE } from '../src/rd/aux.ts'
import { createRd } from '../src/rd/index.ts'
import { DEFAULT_PARAMS } from '../src/rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, type DecisionData, type OutcomeData } from '../src/rd/memory.ts'
import { currentSelfModel } from '../src/self/state.ts'
import { COMPOSE_SYSTEM, composeProblems, composeRetryNote, parseCompose, recordProposal, runGate, type ModelCall, type ProposalData, type SkillDecisionData } from '../src/skill/skill.ts'

async function withStore(fn: (store: LifeStore) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-judgments-'))
  const store = LifeStore.open(home)
  try {
    await fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

/** 測試替身（單元測試專用）：取代 callModel，依序回傳預先寫好的輸出（Error＝呼叫失敗），記下每次的 system 與 input。 */
function scripted(outputs: (string | Error)[]): { call: CallModel; calls: { system: string; input: string }[] } {
  const calls: { system: string; input: string }[] = []
  const call: CallModel = async (_route, system, input) => {
    calls.push({ system, input })
    const next = outputs.shift()
    if (next === undefined) throw new Error('測試替身沒有準備輸出')
    if (next instanceof Error) throw next
    return { output: next, ms: 1, retried: false, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
  }
  return { call, calls }
}

const quiet = { warn() {}, error() {} }
const ROUTE = { provider: 'test', model: 'double' }
const signal = () => new AbortController().signal

// ── RD：全部的做法都被扣除 ──

const deliberation = (excluded: readonly boolean[]) =>
  JSON.stringify({
    situation: '對方：她｜對方的意圖：問晚餐｜對方的情緒：平靜｜話題：晚餐',
    candidates: excluded.map((x, i) => ({ action: `做法 ${i + 1}`, kind: '建議', prediction: '她會考慮', confidence: [50, 30, 20][i], sameAs: [], excluded: x, reason: x ? '不適合' : '' })),
  })

test('all excluded: the deliberation is asked again with a note; the answer that keeps one is used', () =>
  withStore(async (store) => {
    const { call, calls } = scripted([deliberation([true, true, true]), deliberation([true, false, true])])
    const rd = createRd({ life: store, call, logger: quiet }, { silenceMinutes: 0 })
    const prepared = await rd.step({ session: 's1', route: ROUTE, cue: '晚餐吃什麼', recalled: '', tools: [], signal: signal() })
    assert.equal(calls.length, 2)
    assert.ok(calls[1]!.system.endsWith(`\n${ALL_EXCLUDED_NOTE}`))
    const d = store.all(DECISION_KIND)[0]!.data as DecisionData
    assert.equal(d.chosen, 1)
    assert.match(prepared!.text, /你準備：第 2 個做法/)
  }))

test('all excluded twice: recorded as it is, no prepared action and no silent re-choice; an unusable retry keeps the first answer', () =>
  withStore(async (store) => {
    const twice = scripted([deliberation([true, true, true]), deliberation([true, true, true])])
    const rd = createRd({ life: store, call: twice.call, logger: quiet }, { silenceMinutes: 0 })
    const prepared = await rd.step({ session: 's1', route: ROUTE, cue: '晚餐吃什麼', recalled: '', tools: [], signal: signal() })
    const d = store.all(DECISION_KIND)[0]!.data as DecisionData
    assert.equal(d.chosen, -1)
    assert.ok(d.candidates.every((c) => c.excluded))
    assert.match(prepared!.text, /你扣除了全部的做法，沒有準備好的做法/)
    assert.equal(prepared!.action, '')
    const broken = scripted([deliberation([true, true, true]), '不是 JSON'])
    const rd2 = createRd({ life: store, call: broken.call, logger: quiet }, { silenceMinutes: 0 })
    await rd2.step({ session: 's2', route: ROUTE, cue: '晚餐吃什麼', recalled: '', tools: [], signal: signal() })
    assert.equal((store.all(DECISION_KIND).find((e) => e.session === 's2')!.data as DecisionData).candidates.length, 3, 'the first answer is kept')
    const off = scripted([deliberation([true, true, true])])
    await createRd({ life: store, call: off.call, logger: quiet }, { silenceMinutes: 0, subtraction: false }).step({ session: 's3', route: ROUTE, cue: '晚餐吃什麼', recalled: '', tools: [], signal: signal() })
    assert.equal(off.calls.length, 1, 'without subtraction there is nothing to ask again')
  }))

// ── 事後比對：認不得的懸念編號 ──

test('outcome: an unknown potential label in released is asked again instead of being dropped silently', () =>
  withStore(async (store) => {
    const earlier = store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's0', data: { decision: 'l:x', didAction: 'a', didKind: '回答', actual: 'b', matched: 'yes', error: '', reward: 0, reason: '', lesson: '', leftItems: [{ text: '答應提醒他關火', type: 'promise' }], selfVersion: 0, heard: '' } })
    const c = { action: '提醒他關火', kind: '回答', prediction: '他會關', confidence: 100, sameAs: [], z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0 }
    const data: DecisionData = { cue: '一分鐘後提醒我關火', situation: 'x', candidates: [c], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
    const decision = store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data, text: '處境' })
    const outcome = (item: string) => JSON.stringify({ didAction: '提醒了他', didKind: '回答', actual: '他說關了', matched: 'yes', error: '', reward: 0.5, reason: 'r', lesson: '', feeling: '', significance: 'daily', released: [{ item, how: '提醒了' }], left: [] })
    const { call, calls } = scripted([outcome('P3'), outcome('P1')])
    const rd = createRd({ life: store, call, logger: quiet }, { silenceMinutes: 0 })
    rd.evaluate(decision, '關了，謝謝', ROUTE)
    await rd.settle()
    assert.equal(calls.length, 2)
    assert.match(calls[1]!.system, /released 的「P3」不是輸入中列出的懸著的事的編號/)
    const [o] = store.referencing(decision.id, OUTCOME_KIND)
    assert.deepEqual((o!.data as OutcomeData).releasedItems, [`left:${earlier.id}#0`])
  }))

// ── 整合：缺少穩定性與適應性的判斷、解析不了 ──

test('proposalProblems lists every PC revision without both criteria; a judgment that does not hold is not a problem', () => {
  const holds = { holds: true, reason: 'r', evidence: [] }
  const no = { holds: false, reason: '不連貫', evidence: [] }
  const out = JSON.stringify({
    selfRevision: { text: '新的我', stability: holds },
    story: null,
    goals: [{ op: 'add', text: 'g', stability: holds, adaptability: { holds: 'true' } }, { op: 'nonsense' }],
    opinions: [{ op: 'add', text: 'o', stability: no, adaptability: no }],
  })
  assert.deepEqual(proposalProblems(out), ['selfRevision 缺少 adaptability 的判斷', 'goals 第 1 項 缺少 adaptability 的判斷'])
  assert.deepEqual(proposalProblems('不是 JSON'), ['不是 JSON 物件'])
  assert.deepEqual(proposalProblems('{"lessons":[],"selfRevision":null}'), [])
  assert.match(integrateRetryNote(['x']), /不合格的地方：x）$/)
})

test('validate: a missing criterion is reported as no judgment, not as a judgment that does not hold', () =>
  withStore(async (store) => {
    const q = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我搬家了' })
    const ev = collect(store, 0)
    const p = parseProposal(JSON.stringify({ selfRevision: { text: '我在乎對方的生活', reason: 'r', causes: [q.id], stability: { holds: true, reason: 'r', evidence: [q.id] } } }))!
    const { deferred } = validate(store, ev, p)
    assert.deepEqual(deferred.map((d) => d.reason), ['沒有判斷適應性'])
  }))

/** 一段可以整合的生活：一個回合（回覆帶有模型，latestRoute 從這裡取得路由）。 */
function lived(store: LifeStore): string {
  const q = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我上週搬到花蓮了' })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：花蓮很安靜', model: 'test/double' })
  return q.id
}

const revision = (q: string, adaptability: unknown) =>
  JSON.stringify({ lessons: [], selfRevision: { text: '我在乎對方生活的變化', reason: '對方搬家', causes: [q], trigger: 'external', stability: { holds: true, reason: '延續', evidence: [q] }, ...(adaptability ? { adaptability } : {}) }, change: '我更留意對方的變化' })

test('integration: a revision without both criteria is asked again with the problems; the complete answer is applied', () =>
  withStore(async (store) => {
    const q = lived(store)
    const { call, calls } = scripted([revision(q, undefined), revision(q, { holds: true, reason: '回應搬家', evidence: [q] })])
    const result = await runIntegration({ life: store, call, logger: quiet }, { replay: false }, 'voluntary', false)
    assert.equal(calls.length, 2)
    assert.equal(calls[1]!.system, `${INTEGRATE_SYSTEM}\n${integrateRetryNote(['selfRevision 缺少 adaptability 的判斷'])}`)
    assert.match(result, /自我模型已修訂/)
    assert.equal(currentSelfModel(store)?.text, '我在乎對方生活的變化')
    assert.equal(store.all('memory/aux').length, 2)
  }))

test('integration: unparsable output is asked again; twice unparsable changes nothing; a failed call is not asked again', () =>
  withStore(async (store) => {
    const q = lived(store)
    const ok = scripted(['我想想', revision(q, { holds: true, reason: '回應搬家', evidence: [q] })])
    assert.match(await runIntegration({ life: store, call: ok.call, logger: quiet }, { replay: false }, 'voluntary', false), /整合完成/)
    assert.equal(ok.calls.length, 2)
    lived(store)
    const bad = scripted(['我想想', '還是不知道'])
    assert.match(await runIntegration({ life: store, call: bad.call, logger: quiet }, { replay: false }, 'voluntary', false), /無法解析/)
    assert.equal(store.all(INTEGRATION_KIND).length, 1, 'only the first integration was written')
    const failed = scripted([new Error('逾時')])
    assert.match(await runIntegration({ life: store, call: failed.call, logger: quiet }, { replay: false }, 'voluntary', false), /模型呼叫失敗/)
    assert.equal(failed.calls.length, 1)
  }))

test('integration: a revision still without criteria after the retry is kept as a proposal, reported as no judgment', () =>
  withStore(async (store) => {
    const q = lived(store)
    const { call } = scripted([revision(q, undefined), revision(q, undefined)])
    const result = await runIntegration({ life: store, call, logger: quiet }, { replay: false }, 'voluntary', false)
    assert.match(result, /保留為提案 1 項（selfRevision：沒有判斷適應性）/)
    assert.equal(currentSelfModel(store), undefined)
  }))

// ── 技能閘門：合成的判斷看不懂 ──

test('composeProblems: unreadable, unknown verdict, adopt without a concrete difference, revise without content', () => {
  const cases: [string, string[]][] = [
    ['看不懂', ['不是 JSON 物件']],
    ['{"verdict":"maybe"}', ['verdict 不是 adopt、revise 或 reject']],
    ['{"verdict":"adopt","reasons":[]}', ['adopt 沒有指出是哪個處境、看到了什麼差異']],
    ['{"verdict":"revise","reasons":[{"situation":"S1","observation":"太冷淡"}],"revised":null}', ['revise 沒有給修改後的技能內容（revised.content）']],
    ['{"verdict":"adopt","reasons":[{"situation":"S1","observation":"先回應了感受"}]}', []],
    ['{"verdict":"reject","reasons":[]}', []],
  ]
  for (const [raw, expected] of cases) assert.deepEqual(composeProblems(raw), expected, raw)
  assert.match(parseCompose('{"verdict":"adopt","reasons":[]}').reasons[0]!.observation, /（adopt 沒有指出是哪個處境、看到了什麼差異）/, 'the reject records why')
})

const LISTEN: ProposalData = { op: 'add', name: 'listen-before-advising', description: '對方抒發時先聽', whenToUse: '對方在抒發工作上的壓力', content: '- 先回應感受', purpose: '幾次給建議都換來對方說只想被聽', evidence: [], source: 'review' }

/** 測試替身（單元測試專用）：探測回固定的回覆，合成依序回傳預先寫好的輸出。 */
function gateCall(composes: string[]): { call: ModelCall; systems: string[] } {
  const systems: string[] = []
  const call: ModelCall = async (system, _input, purpose) => {
    if (purpose === 'skill-probe') return '我在聽。'
    systems.push(system)
    return composes.shift() ?? ''
  }
  return { call, systems }
}

function vent(store: LifeStore): void {
  const data = { cue: '今天又被主管念了一頓', situation: '對方在抒發工作上的壓力', candidates: [], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: {}, selfVersion: 0 }
  store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data, text: '處境：對方在抒發工作上的壓力' })
}

test('skill gate: an unreadable compose is asked again; the readable answer decides', () =>
  withStore(async (store) => {
    vent(store)
    const { call, systems } = gateCall(['看不懂', '{"verdict":"adopt","reasons":[{"situation":"S1","observation":"有技能時先回應了感受"}]}'])
    const { decision } = await runGate(store, recordProposal(store, LISTEN), call)
    assert.deepEqual(systems, [COMPOSE_SYSTEM, `${COMPOSE_SYSTEM}\n${composeRetryNote(['不是 JSON 物件'])}`])
    assert.equal((decision.data as SkillDecisionData).verdict, 'adopt')
  }))

test('skill gate: unreadable twice is recorded as a reject with the problems', () =>
  withStore(async (store) => {
    vent(store)
    const { call, systems } = gateCall(['看不懂', '{"verdict":"adopt","reasons":[]}'])
    const { decision } = await runGate(store, recordProposal(store, LISTEN), call)
    assert.equal(systems.length, 2)
    const data = decision.data as SkillDecisionData
    assert.equal(data.verdict, 'reject')
    assert.match(data.reasons[0]!.observation, /adopt 沒有指出是哪個處境/)
  }))
