/**
 * context 模式的思考在主 agent 的脈絡中重跑（rd/context-replay.ts；ADR-0009 已知的限制第 1 項的修正）：
 * 快照的存取、只換最後一則思考通知中的做法段落、重跑輸出的取法，以及做法閘門的重跑與退回近似。
 * 模型呼叫都是測試替身（單元測試專用，標明）；真實模型的檢查見 e2e。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LifeStore, type LifeEvent } from '../src/life/store.ts'
import { runProcedureGate, type GateCall, type GateReplay } from '../src/integrate/procedure-gate.ts'
import type { ProcedureProposalData } from '../src/integrate/proposal.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { procedureSections } from '../src/rd/aux.ts'
import { MAX_SNAPSHOTS, loadSnapshot, replayOutput, saveSnapshot, swapNotice, type ReplayRequest } from '../src/rd/context-replay.ts'
import { createRd, type Config } from '../src/rd/index.ts'
import { DEFAULT_PROCEDURES, PROCEDURE_KIND, currentProcedure, procedureSection, seedProcedures, type ProcedureDecisionData } from '../src/self/procedure.ts'

async function withStore(fn: (store: LifeStore) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-replay-'))
  const store = LifeStore.open(home)
  try {
    await fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const quiet = { warn() {}, error() {} }
/** 測試替身（單元測試專用）：context 模式不呼叫輔助模型。 */
const noCall: CallModel = async () => {
  throw new Error('context 模式不應該有輔助呼叫')
}

/** 一則思考通知（temir-rd）：照指定的做法版本組出做法段落。 */
function notice(sections: readonly string[]): Record<string, unknown> {
  return { role: 'user', id: `n${sections.length}`, source: { kind: 'temir-rd', form: 'notice', summary: '回應之前先思考' }, content: [{ type: 'text', text: `（這不是對方說的話。）\n\n${sections.join('\n\n')}\n\n## 輸出` }] }
}

/** 主 agent 的請求（測試用的形狀與 DSH 的 GenerateOptions 相同：provider、model、messages、tools）。 */
function request(current: readonly string[], earlier: readonly string[] = current): ReplayRequest {
  return {
    provider: 'test',
    model: 'double',
    reasoningEffort: 'high',
    tools: [{ name: 'deliberate' }],
    messages: [
      { role: 'system', content: [{ type: 'text', text: '你的處境' }] },
      notice(earlier),
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '主管又念我了' }] },
      notice(current),
    ],
  }
}

const sectionsNow = (store: LifeStore) => procedureSections({ procedures: { deliberate: currentProcedure(store, 'deliberate'), subtract: currentProcedure(store, 'subtract') } })
const textOf = (m: Record<string, unknown>) => ((m['content'] as { text: string }[])[0]!).text

test('snapshot: the request is stored without its signal and session, read back the same, and the oldest are pruned', () =>
  withStore(async (store) => {
    const id = saveSnapshot(store, { ...request(sectionsNow(store)), signal: new AbortController().signal, sessionId: 's1' })!
    assert.match(id, /^[0-9a-f]{16}$/u)
    assert.deepEqual(loadSnapshot(store, id), JSON.parse(JSON.stringify(request(sectionsNow(store)))))
    assert.equal(saveSnapshot(store, request(sectionsNow(store))), id, 'the same request is the same snapshot')
    assert.equal(loadSnapshot(store, 'missing'), undefined)
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) saveSnapshot(store, { provider: 'test', model: 'double', messages: [{ n: i }] })
    assert.equal(readdirSync(join(dirname(store.path), 'replay')).length, MAX_SNAPSHOTS)
  }))

test('swap: only the last notice is changed; a section that is not there means no swap at all', () => {
  const old = ['## 我的思考做法（第 1 版）\n- 舊的', '## 我的扣除做法（第 1 版）\n- 扣除']
  const req = request(old)
  const swapped = swapNotice(req, [[old[0]!, '## 我的思考做法（第 2 版）\n- 新的'], [old[1]!, old[1]!]])!
  assert.match(textOf(swapped.messages[3]!), /第 2 版）\n- 新的[^]*## 我的扣除做法（第 1 版）/u)
  assert.equal(textOf(swapped.messages[1]!), textOf(req.messages[1]!), 'an earlier turn keeps what it was')
  assert.deepEqual(swapped.messages.slice(0, 3), req.messages.slice(0, 3))
  assert.equal(swapNotice(req, [['## 不存在的段落', 'x']]), undefined)
  assert.equal(swapNotice({ ...req, messages: req.messages.slice(0, 1) }, [[old[0]!, 'x']]), undefined, 'no notice')
})

test('replay output: the deliberate arguments; otherwise what the agent did instead', () => {
  assert.equal(replayOutput([{ type: 'reasoning', text: '想' }, { type: 'tool-call', name: 'deliberate', arguments: '{"situation":"s"}' }]), '{"situation":"s"}')
  assert.equal(replayOutput([{ type: 'tool-call', name: 'recall', arguments: '{}' }]), '（沒有呼叫 deliberate，呼叫了 recall）')
  assert.equal(replayOutput([{ type: 'text', text: '辛苦了' }]), '（沒有呼叫 deliberate，直接說：辛苦了）')
})

const CONTEXT: Config = { silenceMinutes: 0, mode: 'context' }

test('context mode: the first answer records the snapshot of the main agent request; a rewrite does not', () =>
  withStore(async (store) => {
    const taken: string[] = []
    const rd = createRd({ life: store, call: noCall, logger: quiet, snapshot: (s) => (taken.push(s), 'abcd') }, { ...CONTEXT, energy: false })
    rd.begin({ session: 's1', route: { provider: 'test', model: 'double' }, cue: '主管又念我了', recalled: '', tools: ['recall'], signal: new AbortController().signal })
    assert.match(rd.deliberateTool('s1', { situation: '只有處境' }), /^思考還沒有完成/u)
    rd.deliberateTool('s1', {
      situation: '對方：她｜話題：主管',
      people: [],
      candidates: [
        { action: '先陪她', prediction: '她會放鬆', confidence: 60, excluded: false, reason: '' },
        { action: '問她想不想說', prediction: '她會說下去', confidence: 40, excluded: false, reason: '' },
      ],
      experiences: [],
    })
    assert.deepEqual(taken, ['s1'], 'only the first answer: a rewrite already carries the first answer in its request')
    const aux = store.all('memory/aux').map((e) => e.data as { context?: string; variant?: unknown })
    assert.deepEqual(aux.map((a) => a.context), ['abcd', undefined])
    assert.deepEqual(aux[0]!.variant, { energy: false }, 'the ablation setting is recorded, so the gate can rebuild the same notice')
  }))

/** 一次 context 模式的真實思考（memory/aux）：snapshot 是快照 id（null＝那一步沒有存下來）。 */
function contextCall(store: LifeStore, snapshot: string | null, session = 'old'): LifeEvent {
  return store.append({
    kind: 'memory/aux',
    origin: 'self',
    session,
    model: 'test/double',
    data: { purpose: 'deliberate', mode: 'context', procedures: { deliberate: 1, subtract: 1 }, input: `## 對方剛說的話\n主管又念我了（${session}）`, output: '{"situation":"真實的作答"}', ...(snapshot ? { context: snapshot } : {}) },
  })
}

const NEW_DELIBERATE = `${DEFAULT_PROCEDURES.deliberate}\n- 對方說「說了也沒用」時，先想想我剛才做的是不是她要的。`

function proposeDeliberate(store: LifeStore): LifeEvent {
  const data: ProcedureProposalData = { name: 'deliberate', text: NEW_DELIBERATE, reason: '我把她的失望讀成要更多安慰', evidence: [], source: 'integrate', baseVersion: 1 }
  return store.append({ kind: PROCEDURE_KIND.proposal, origin: 'self', data })
}

/** 測試替身（單元測試專用）：閘門的模型呼叫與重跑，依序回傳預先寫好的輸出，記下每一次。 */
function scripted(outputs: string[], replays: string[]) {
  const calls: { system: string; input: string; purpose: string }[] = []
  const requests: ReplayRequest[] = []
  const call: GateCall = async (system, input, purpose) => {
    calls.push({ system, input, purpose })
    return outputs.shift() ?? assert.fail('測試替身沒有準備輸出')
  }
  const replay: GateReplay = async (r) => {
    requests.push(r)
    return replays.shift() ?? assert.fail('測試替身沒有準備重跑的輸出')
  }
  return { call, replay, calls, requests }
}

const REJECT = '{"verdict":"reject","reasons":[{"situation":"S1","observation":"差不多","beyondNoise":false}],"revised":null}'

test('procedure gate: a context-mode deliberation is rerun in the main agent’s own context with only the procedure section changed', () =>
  withStore(async (store) => {
    seedProcedures(store)
    const id = saveSnapshot(store, request(sectionsNow(store)))!
    const real = contextCall(store, id)
    const { call, replay, calls, requests } = scripted([REJECT], ['{"situation":"重跑 現行"}', '{"situation":"重跑 提案"}'])
    const { decision } = await runProcedureGate(store, proposeDeliberate(store), call, 'test/double', replay)
    // 那次真實的作答照的是現行的做法、沒有重寫過：它就是一個樣本，只再跑一次現行、一次提案。
    assert.equal(requests.length, 2)
    assert.deepEqual(calls.map((c) => c.purpose), ['procedure-compose'], 'no auxiliary-format probe')
    assert.deepEqual(requests[0]!.messages, loadSnapshot(store, id)!.messages, 'the reference is the request as it was')
    const proposedSection = procedureSection({ name: 'deliberate', version: 2, text: NEW_DELIBERATE })
    assert.ok(textOf(requests[1]!.messages[3]!).includes(proposedSection), 'the candidate carries the proposal in this turn’s notice')
    assert.ok(!textOf(requests[1]!.messages[1]!).includes(proposedSection), 'earlier turns are untouched')
    assert.deepEqual([requests[1]!.provider, requests[1]!.model, requests[1]!['reasoningEffort']], ['test', 'double', 'high'], 'same model and reasoning effort as that step')
    const probe = store.all(PROCEDURE_KIND.probe)[0]!.data as { replay?: string; references: string[]; reused: number; aux: string; approximation?: string }
    assert.deepEqual([probe.replay, probe.references, probe.reused, probe.aux, probe.approximation], ['context', ['{"situation":"真實的作答"}', '{"situation":"重跑 現行"}'], 1, real.id, undefined])
    assert.match(calls[0]!.input, /## S1（在我當時對話的脈絡中重跑）/u)
    assert.deepEqual([(decision.data as ProcedureDecisionData).calls, (decision.data as ProcedureDecisionData).reused], [3, 1])
  }))

test('procedure gate: after the procedure changed, the old section is found by its version and replaced by the current one for the reference', () =>
  withStore(async (store) => {
    seedProcedures(store)
    const id = saveSnapshot(store, request(sectionsNow(store)))!
    contextCall(store, id)
    // 之後思考做法改到第 2 版：那次的作答不再是現行做法的樣本，兩個 reference 都要重跑。
    store.append({ kind: PROCEDURE_KIND.version, origin: 'self', data: { name: 'deliberate', version: 2, text: `${DEFAULT_PROCEDURES.deliberate}\n- 第 2 版`, reason: 'r', source: 'self' } })
    const { call, replay, requests } = scripted([REJECT], ['a', 'b', 'c'])
    await runProcedureGate(store, proposeDeliberate(store), call, 'test/double', replay)
    assert.equal(requests.length, 3)
    const v2 = procedureSection(currentProcedure(store, 'deliberate'))
    assert.ok(textOf(requests[0]!.messages[3]!).includes(v2))
    assert.ok(!textOf(requests[0]!.messages[3]!).includes(procedureSection({ name: 'deliberate', version: 1, text: DEFAULT_PROCEDURES.deliberate })))
  }))

test('procedure gate: without a snapshot (or without the replay) a context-mode deliberation falls back to the auxiliary format, and says so', () =>
  withStore(async (store) => {
    seedProcedures(store)
    contextCall(store, null)
    const first = scripted(['現行 a', '現行 b', '提案', REJECT], [])
    await runProcedureGate(store, proposeDeliberate(store), first.call, 'test/double', first.replay)
    assert.deepEqual(first.calls.map((c) => c.purpose), ['procedure-probe', 'procedure-probe', 'procedure-probe', 'procedure-compose'])
    assert.equal((store.all(PROCEDURE_KIND.probe)[0]!.data as { approximation?: string }).approximation, '那一步沒有存下主 agent 的請求')
    const id = saveSnapshot(store, request(sectionsNow(store)))!
    contextCall(store, id, 'other')
    const second = scripted(['a', 'b', 'c', 'd', 'e', 'f', REJECT], [])
    await runProcedureGate(store, proposeDeliberate(store), second.call, 'test/double')
    const approximations = store.all(PROCEDURE_KIND.probe).slice(1).map((e) => (e.data as { approximation?: string }).approximation)
    assert.deepEqual(approximations, ['這次的閘門沒有重跑主 agent 請求的能力', '這次的閘門沒有重跑主 agent 請求的能力'])
  }))
