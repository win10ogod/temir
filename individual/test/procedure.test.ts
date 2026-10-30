/**
 * 個體自己的做法（ADR-0008；hypotheses.md H-P）：第一版的寫入、取用、三段的系統提示、做法的閘門與整合中的提案。
 * 模型呼叫都是測試替身（單元測試專用，標明）；真實模型的檢查見 e2e 與 dev15。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore, type LifeEvent } from '../src/life/store.ts'
import { runIntegration } from '../src/integrate/index.ts'
import { COMPOSE_SYSTEM, composeRetryNote, probeSituations, runProcedureGate, systemWith, type GateCall } from '../src/integrate/procedure-gate.ts'
import type { ProcedureProposalData } from '../src/integrate/proposal.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { createRd } from '../src/rd/index.ts'
import { DECISION_KIND, type DecisionData } from '../src/rd/memory.ts'
import {
  DEFAULT_PROCEDURES,
  PROCEDURE_KIND,
  currentProcedure,
  procedurePrompt,
  seedProcedures,
  type ProcedureData,
  type ProcedureDecisionData,
} from '../src/self/procedure.ts'
import { THOUGHT_SYSTEM, thoughtSystem } from '../src/thought/thought.ts'

async function withStore(fn: (store: LifeStore) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-procedure-'))
  const store = LifeStore.open(home)
  try {
    await fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const quiet = { warn() {}, error() {} }

/** 測試替身（單元測試專用）：依序回傳預先寫好的輸出，記下每次的 system、input 與用途。 */
function scriptedGate(outputs: string[]): { call: GateCall; calls: { system: string; input: string; purpose: string }[] } {
  const calls: { system: string; input: string; purpose: string }[] = []
  return {
    calls,
    call: async (system, input, purpose) => {
      calls.push({ system, input, purpose })
      const next = outputs.shift()
      if (next === undefined) throw new Error('測試替身沒有準備輸出')
      return next
    },
  }
}

/** 一次念頭的真實呼叫（memory/aux）：做法閘門探測的處境。輸入保留換行。 */
function pastThought(store: LifeStore, n: number): LifeEvent {
  return store.append({ kind: 'memory/aux', origin: 'self', data: { purpose: 'thought', procedures: { thought: 1 }, input: `## 懸著的事\n- [P1] 答應提醒他關火（第 ${n} 次）`, output: '{"item":"P1"}' } })
}

function proposeThought(store: LifeStore, text: string): LifeEvent {
  const data: ProcedureProposalData = { name: 'thought', text, reason: '我常常想到就說，沒有先想對方方不方便', evidence: [], source: 'integrate', baseVersion: 1 }
  return store.append({ kind: PROCEDURE_KIND.proposal, origin: 'self', data })
}

const NEW_THOUGHT = `${DEFAULT_PROCEDURES.thought}\n- 開口之前，先想對方現在方不方便。`

test('procedures: version 1 is written once when the individual starts; an existing individual keeps its own text', () =>
  withStore(async (store) => {
    assert.equal(currentProcedure(store, 'deliberate').id, undefined, 'not seeded: the default text, not yet in the life log')
    const ids = seedProcedures(store)
    assert.equal(ids.length, 5)
    assert.deepEqual(seedProcedures(store), [], 'written only once')
    const seeded = store.get(ids[0]!)!
    assert.deepEqual(
      [seeded.kind, seeded.origin, (seeded.data as ProcedureData).source, (seeded.data as ProcedureData).version],
      [PROCEDURE_KIND.version, 'self', 'creator', 1],
    )
    assert.equal(currentProcedure(store, 'deliberate').id, ids[0])
    // 程式的預設文字之後再改，也只影響還沒有紀錄的個體：已經寫下的版本就是它自己的。
    store.append({ kind: PROCEDURE_KIND.version, origin: 'self', data: { name: 'thought', version: 2, text: '我自己的念頭做法', reason: 'r', source: 'self' } satisfies ProcedureData })
    assert.deepEqual([currentProcedure(store, 'thought').version, currentProcedure(store, 'thought').text], [2, '我自己的念頭做法'])
    assert.equal(seedProcedures(store).length, 0)
  }))

test('the system prompt is frame + the individual’s own procedure + the output contract; no fixed categories remain', () => {
  assert.equal(THOUGHT_SYSTEM, thoughtSystem())
  const prompt = procedurePrompt('框架', [{ name: 'thought', version: 3, text: '我的做法' }], '輸出')
  assert.equal(prompt, '框架\n\n## 我的念頭做法（第 3 版；這是我自己的做法，可以在整合時修訂）\n我的做法\n\n## 輸出（每一項都要照格式作答）\n輸出')
  // ADR-0008 §2：不再有寫死的類別。
  for (const text of [...Object.values(DEFAULT_PROCEDURES), THOUGHT_SYSTEM]) {
    assert.doesNotMatch(text, /daily|notable|major|pivotal|promise|waiting|unresolved|回答／提問|significance/u)
  }
})

test('the deliberation uses the version the individual adopted, and the life log records which versions were used and the input as it was', () =>
  withStore(async (store) => {
    seedProcedures(store)
    store.append({ kind: PROCEDURE_KIND.version, origin: 'self', data: { name: 'deliberate', version: 2, text: '- 我先問自己：對方真正要的是什麼？', reason: 'r', source: 'self' } satisfies ProcedureData })
    const systems: string[] = []
    // 測試替身（單元測試專用）：思考的輸出。
    const call: CallModel = async (_route, system) => {
      systems.push(system)
      const output = JSON.stringify({ situation: 'x', candidates: [{ action: '先聽', prediction: 'p', confidence: 60 }, { action: '問她', prediction: 'p', confidence: 40 }], experiences: [] })
      return { output, ms: 1, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
    }
    const rd = createRd({ life: store, call, logger: quiet }, { silenceMinutes: 0 })
    assert.ok(await rd.step({ session: 's1', route: { provider: 'test', model: 'double' }, cue: '我好累', recalled: '', tools: [], signal: new AbortController().signal }))
    assert.match(systems[0]!, /## 我的思考做法（第 2 版；[^\n]*\n- 我先問自己：對方真正要的是什麼？\n\n## 我的扣除做法（第 1 版；/u)
    assert.deepEqual((store.all(DECISION_KIND)[0]!.data as DecisionData).procedures, { deliberate: 2, subtract: 1 })
    const aux = store.all('memory/aux')[0]!.data as { procedures: Record<string, number>; input: string }
    assert.deepEqual(aux.procedures, { deliberate: 2, subtract: 1 })
    assert.match(aux.input, /\n## 對方剛說的話\n我好累$/u, 'newlines are kept so the gate can run the same input again')
  }))

test('procedure gate: no real call to compare on means unprobed, not adopted (Harness²: no change without a contrast)', () =>
  withStore(async (store) => {
    const p = proposeThought(store, NEW_THOUGHT)
    const { call, calls } = scriptedGate([])
    const { decision, next } = await runProcedureGate(store, p, call)
    assert.equal((decision.data as ProcedureDecisionData).verdict, 'unprobed')
    assert.equal(next, undefined)
    assert.equal(calls.length, 0)
    assert.equal(currentProcedure(store, 'thought').version, 1)
  }))

test('procedure gate: each recent real call is run again with the current and the proposed procedure; the individual adopts on the contrast', () =>
  withStore(async (store) => {
    seedProcedures(store)
    pastThought(store, 1)
    pastThought(store, 2)
    // 同一個輸入的重問只當一個處境。
    pastThought(store, 2)
    assert.equal(probeSituations(store, 'thought').length, 2)
    const p = proposeThought(store, NEW_THOUGHT)
    const before = systemWith(store, 'thought', currentProcedure(store, 'thought'))
    const adopt = '{"verdict":"adopt","reasons":[{"situation":"S1","observation":"提案的版本先想了他在不在，沒有一想到就說"}],"revised":null}'
    const { call, calls } = scriptedGate(['現行 S1', '提案 S1', '現行 S2', '提案 S2', adopt])
    const { decision } = await runProcedureGate(store, p, call)
    assert.deepEqual(calls.map((c) => c.purpose), ['procedure-probe', 'procedure-probe', 'procedure-probe', 'procedure-probe', 'procedure-compose'])
    assert.equal(calls[0]!.system, before)
    assert.match(calls[1]!.system, /## 我的念頭做法（第 2 版；[^]*開口之前，先想對方現在方不方便。/u)
    assert.equal(calls[0]!.input, calls[1]!.input, 'the same real input for both versions')
    assert.match(calls[4]!.input, /### 照現行做法的輸出\n現行 S1\n\n### 照提案做法的輸出\n提案 S1/u)
    const d = decision.data as ProcedureDecisionData
    assert.deepEqual([d.verdict, d.probes.length, d.gate, d.costChars], ['adopt', 2, 'contrast', NEW_THOUGHT.length - DEFAULT_PROCEDURES.thought.length])
    const now = currentProcedure(store, 'thought')
    assert.deepEqual([now.version, now.text, now.id], [2, NEW_THOUGHT, d.adopted])
    assert.deepEqual((store.get(d.adopted!)!.data as ProcedureData).proposal, p.id)
  }))

test('procedure gate: an incomplete judgment is asked again once; still incomplete is recorded as reject with both problems', () =>
  withStore(async (store) => {
    pastThought(store, 1)
    const p = proposeThought(store, NEW_THOUGHT)
    const { call, calls } = scriptedGate(['a', 'b', '{"verdict":"adopt","reasons":[]}', '{"verdict":"maybe","reasons":[{"situation":"S9","observation":"x"}]}'])
    const { decision } = await runProcedureGate(store, p, call)
    assert.equal(calls[3]!.system, `${COMPOSE_SYSTEM}\n${composeRetryNote(['沒有理由'])}`)
    const d = decision.data as ProcedureDecisionData
    assert.equal(d.verdict, 'reject')
    assert.deepEqual(d.problems, ['第 1 次：沒有理由', '第 2 次：verdict 不是 adopt、revise 或 reject', '第 2 次：理由的處境「S9」不是列出的處境'])
    assert.equal(currentProcedure(store, 'thought').version, 1, 'not adopted')
  }))

test('procedure gate: revise writes the revised text as a new proposal to be compared again; the same text is rejected without probing', () =>
  withStore(async (store) => {
    pastThought(store, 1)
    const p = proposeThought(store, NEW_THOUGHT)
    const revise = JSON.stringify({ verdict: 'revise', reasons: [{ situation: 'S1', observation: '方向對，但寫得太死' }], revised: `${DEFAULT_PROCEDURES.thought}\n- 開口之前，想一想對方方不方便。` })
    const first = scriptedGate(['a', 'b', revise])
    const { decision, next } = await runProcedureGate(store, p, first.call)
    assert.equal((decision.data as ProcedureDecisionData).verdict, 'revise')
    assert.ok(next)
    assert.deepEqual([(next.data as ProcedureProposalData).source, (next.data as ProcedureProposalData).revises], ['compose', p.id])
    const same = proposeThought(store, DEFAULT_PROCEDURES.thought)
    const none = scriptedGate([])
    assert.equal(((await runProcedureGate(store, same, none.call)).decision.data as ProcedureDecisionData).verdict, 'reject')
    assert.equal(none.calls.length, 0)
  }))

/** 一段可以整合的生活：一個回合，以及一次念頭的真實呼叫（回覆帶有模型，latestRoute 從這裡取得路由）。 */
function lived(store: LifeStore): string {
  const q = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：你昨天半夜傳訊息給我，我在睡覺' })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：抱歉，我下次會注意', model: 'test/double' })
  pastThought(store, 1)
  return q.id
}

const holds = (evidence: readonly string[]) => ({ holds: true, reason: 'r', evidence })

/** 測試替身（單元測試專用）：取代 callModel，依序回傳預先寫好的輸出，記下每次的 system。 */
function scripted(outputs: string[]): { call: CallModel; systems: string[] } {
  const systems: string[] = []
  return {
    systems,
    call: async (_route, system) => {
      systems.push(system)
      const output = outputs.shift()
      if (output === undefined) throw new Error('測試替身沒有準備輸出')
      return { output, ms: 1, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
    },
  }
}

test('integration: a procedure revision with both criteria goes through the gate and is adopted; a second one waits as a proposal', () =>
  withStore(async (store) => {
    const [, , , , thoughtV1] = seedProcedures(store)
    const q = lived(store)
    const item = (name: string, text: string) => ({ name, text, reason: '半夜傳訊息吵醒了對方', evidence: [q], stability: holds([thoughtV1!]), adaptability: holds([q]) })
    const integration = JSON.stringify({ procedures: [item('thought', NEW_THOUGHT), item('outcome', `${DEFAULT_PROCEDURES.outcome}\n- x`)], change: '我開始想對方方不方便' })
    const adopt = '{"verdict":"adopt","reasons":[{"situation":"S1","observation":"提案的版本沒有在半夜開口"}],"revised":null}'
    const { call, systems } = scripted([integration, '現行', '提案', adopt])
    const result = await runIntegration({ life: store, call, logger: quiet }, { replay: false }, 'voluntary', false)
    assert.match(systems[0]!, /"procedures": \[\]/u, 'the integration contract offers procedure revisions')
    assert.match(result, /保留為提案 1 項（procedure：這次整合已經有一個做法的修訂進入對照）/u)
    assert.match(result, /念頭做法的修改採用（第 2 版）：S1：提案的版本沒有在半夜開口/u)
    assert.equal(currentProcedure(store, 'thought').text, NEW_THOUGHT)
    assert.equal(currentProcedure(store, 'outcome').version, 1)
    assert.equal(store.all(PROCEDURE_KIND.proposal).length, 1)
    assert.deepEqual(store.all('memory/aux').map((e) => (e.data as { purpose: string }).purpose), ['thought', 'integrate', 'procedure-probe', 'procedure-probe', 'procedure-compose'])
  }))

test('integration: a procedure revision without the criteria holding is kept as a proposal and never probed', () =>
  withStore(async (store) => {
    seedProcedures(store)
    const q = lived(store)
    const integration = JSON.stringify({ procedures: [{ name: 'thought', text: NEW_THOUGHT, reason: 'r', evidence: [q], stability: { holds: false, reason: '太突然', evidence: [] }, adaptability: holds([q]) }], change: '' })
    const { call, systems } = scripted([integration])
    const result = await runIntegration({ life: store, call, logger: quiet }, { replay: false }, 'voluntary', false)
    assert.equal(systems.length, 1)
    assert.match(result, /保留為提案 1 項（procedure：穩定性不成立）/u)
    assert.equal(currentProcedure(store, 'thought').version, 1)
  }))

test('integration: a proposal whose gate was interrupted (no decision) is compared at the next integration', () =>
  withStore(async (store) => {
    seedProcedures(store)
    lived(store)
    const pending = proposeThought(store, NEW_THOUGHT)
    const adopt = '{"verdict":"adopt","reasons":[{"situation":"S1","observation":"提案的版本先想了他方不方便"}],"revised":null}'
    const { call } = scripted([JSON.stringify({ change: '' }), '現行', '提案', adopt])
    const result = await runIntegration({ life: store, call, logger: quiet }, { replay: false }, 'voluntary', false)
    assert.match(result, /念頭做法的修改採用（第 2 版）/u)
    assert.equal((store.all(PROCEDURE_KIND.decision)[0]!.data as ProcedureDecisionData).proposal, pending.id)
  }))
