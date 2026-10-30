import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { DELIBERATION_RETRY_NOTE, REVISION_SYSTEM, revisionRetryNote } from '../src/rd/aux.ts'
import { createRd, type Config, type StepInput } from '../src/rd/index.ts'
import { DEFAULT_PARAMS } from '../src/rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, type DecisionData, type OutcomeData } from '../src/rd/memory.ts'

type Purpose = 'deliberate' | 'revise' | 'outcome'
type Reply = string | Error | (() => Promise<string>)

/**
 * 測試替身（單元測試專用）：取代 callModel。依 system 判斷是哪一種呼叫，依序回傳預先寫好的輸出；
 * Error 代表呼叫失敗，函式可以回傳由測試控制的 promise。記下每一次呼叫的目的、system 與 input。
 */
function scripted(script: Partial<Record<Purpose, Reply[]>>): { call: CallModel; calls: { purpose: Purpose; system: string; input: string }[] } {
  const calls: { purpose: Purpose; system: string; input: string }[] = []
  const call: CallModel = async (_route, system, input) => {
    const purpose: Purpose = system.startsWith(REVISION_SYSTEM) ? 'revise' : system.includes('回頭比對自己上一個決定') ? 'outcome' : 'deliberate'
    calls.push({ purpose, system, input })
    const next = script[purpose]?.shift()
    if (next === undefined) throw new Error(`測試替身沒有準備 ${purpose} 的輸出`)
    if (next instanceof Error) throw next
    const output = typeof next === 'function' ? await next() : next
    return { output, ms: 1, retried: false, effort: 'low', reasoningChars: 0 }
  }
  return { call, calls }
}

/** 測試替身（單元測試專用）：記下 warn 與 error，取代 cordis 的 Logger。 */
function recorder(): { logger: { warn: (f: string, ...a: unknown[]) => void; error: (f: string, ...a: unknown[]) => void }; logs: string[] } {
  const logs: string[] = []
  const push = (level: string) => (format: string, ...param: unknown[]) => {
    let i = 0
    logs.push(`${level} ${format.replace(/%[sd]/g, () => String(param[i++]))}`)
  }
  return { logger: { warn: push('warn'), error: push('error') }, logs }
}

async function withStore(fn: (store: LifeStore) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-rd-step-'))
  const store = LifeStore.open(home)
  try {
    await fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const ROUTE = { provider: 'test', model: 'double' }
/** 沉默計時器在這些測試中不需要；silenceMinutes 0 也讓 createRd 的設定與正式執行相同之外沒有計時器。 */
const CONFIG: Config = { silenceMinutes: 0 }

function input(cue: string, session = 's1', signal = new AbortController().signal): StepInput {
  return { session, route: ROUTE, cue, recalled: '', tools: ['recall'], signal }
}

const DELIBERATION = JSON.stringify({
  situation: '對方：她｜對方的意圖：抒發主管的責備｜對方的情緒：煩躁｜話題：主管｜相關的記憶：無',
  drive: '',
  activated: [],
  similar: [],
  people: [],
  candidates: [
    { action: '直接給兩個具體的方法', kind: '建議', prediction: '她會有方向', confidence: 60, sameAs: [], excluded: true, reason: '她在抒發，不是求助' },
    { action: '先陪她', kind: '表達感受', prediction: '她會放鬆', confidence: 30, sameAs: [], excluded: false, reason: '' },
    { action: '問她想不想說', kind: '提問', prediction: '她會說下去', confidence: 10, sameAs: [], excluded: false, reason: '' },
  ],
})

/** 過去類似處境的一個經驗：做了「建議」這一類，結果好、預測成真。之後扣除「建議」時需要強制判斷。 */
function pastAdvice(store: LifeStore): string {
  const c = { action: '給她兩個跟主管談的說法', kind: '建議', prediction: '她會有方向', confidence: 60, sameAs: [], z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0 }
  const data: DecisionData = { cue: '今天又被主管念了一頓', situation: '對方：她｜對方的意圖：抒發主管的責備｜對方的情緒：煩躁｜話題：主管', candidates: [c], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
  const d = store.append({ kind: DECISION_KIND, origin: 'self', session: 'old', data, text: '處境：抒發' })
  const o: OutcomeData = { decision: d.id, didAction: '給了兩個說法', didKind: '建議', actual: '她說有幫助', matched: 'yes', error: '', reward: 0.6, reason: '', lesson: '', selfVersion: 0, heard: '' }
  store.append({ kind: OUTCOME_KIND, origin: 'self', session: 'old', data: o, causes: [d.id] })
  return d.id
}

const decisions = (store: LifeStore) => store.all(DECISION_KIND).filter((e) => e.session === 's1')

test('deliberation: output that is not JSON is asked again once; the second answer is used', () =>
  withStore(async (store) => {
    const { call, calls } = scripted({ deliberate: ['我想想……', DELIBERATION] })
    const { logger, logs } = recorder()
    const rd = createRd({ life: store, call, logger }, { ...CONFIG, revision: false })
    const prepared = await rd.step(input('主管又念我了'))
    assert.deepEqual(calls.map((c) => c.purpose), ['deliberate', 'deliberate'])
    assert.ok(!calls[0]!.system.includes(DELIBERATION_RETRY_NOTE) && calls[1]!.system.endsWith(`\n${DELIBERATION_RETRY_NOTE}`))
    assert.equal(calls[0]!.input, calls[1]!.input, 'the same input is asked again')
    assert.ok(prepared)
    assert.match(prepared.text, /你考慮過的做法/)
    const [d] = decisions(store)
    assert.equal((d!.data as DecisionData).candidates.length, 3)
    assert.equal(store.all('memory/aux').length, 2, 'both calls are in the life log')
    assert.deepEqual(logs, [])
  }))

test('deliberation: two broken answers write no decision and prepare nothing; a failed call is not retried', () =>
  withStore(async (store) => {
    const broken = scripted({ deliberate: ['不是 JSON', '{"situation":"x","candidates":[{"action":"只有一個"}]}'] })
    const rd = createRd({ life: store, call: broken.call, logger: recorder().logger }, CONFIG)
    assert.equal(await rd.step(input('主管又念我了')), undefined)
    assert.equal(broken.calls.length, 2)
    assert.deepEqual(decisions(store), [])
    const failed = scripted({ deliberate: [new Error('逾時')] })
    const { logger, logs } = recorder()
    const rd2 = createRd({ life: store, call: failed.call, logger }, CONFIG)
    assert.equal(await rd2.step(input('主管又念我了')), undefined)
    assert.equal(failed.calls.length, 1, 'a failed call is not retried')
    assert.deepEqual(decisions(store), [])
    assert.match(logs.join('\n'), /deliberate call failed/)
    assert.match(String((store.all('memory/aux').at(-1)!.data as { error?: string }).error), /逾時/)
  }))

test('mandatory judgment: a missing answer is asked again with the problems; the valid answer is written as the judgment', () =>
  withStore(async (store) => {
    const past = pastAdvice(store)
    const lift = '{"judgments":[{"candidate":1,"decision":"lift","why":"X1 給說法她覺得有幫助","refs":["X1"]}]}'
    const { call, calls } = scripted({ deliberate: [DELIBERATION], revise: ['{"judgments":[]}', lift] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    const prepared = await rd.step(input('主管又念我了'))
    assert.deepEqual(calls.map((c) => c.purpose), ['deliberate', 'revise', 'revise'])
    assert.equal(calls[1]!.system, REVISION_SYSTEM)
    assert.equal(calls[2]!.system, `${REVISION_SYSTEM}\n${revisionRetryNote(['做法 1 沒有判斷'])}`)
    assert.match(calls[1]!.input, /1\. 直接給兩個具體的方法（建議）｜你扣除的理由：她在抒發，不是求助\n {3}- X1｜/u)
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1 })
    assert.equal(data.candidates[0]!.excluded, undefined, 'lifted')
    assert.deepEqual(data.candidates[0]!.judgment, { decision: 'lift', why: 'X1 給說法她覺得有幫助', refs: [past], reason: '她在抒發，不是求助' })
    assert.match(prepared!.text, /你看過經驗之後解除了扣除：X1 給說法她覺得有幫助/)
  }))

test('mandatory judgment: two invalid answers are recorded as review.failed and the exclusion stays', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [DELIBERATION], revise: ['{"judgments":[]}', '{"judgments":[{"candidate":1,"decision":"maybe","why":"","refs":[]}]}'] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 2, 'asked again only once')
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '做法 1 的 decision 不是 keep 或 lift；做法 1 沒有寫理由；做法 1 沒有引用列出的經驗' })
    assert.equal(data.candidates[0]!.excluded, true)
    assert.equal(data.candidates[0]!.judgment, undefined)
    assert.notEqual(data.chosen, 0, 'the excluded candidate is not chosen')
  }))

test('mandatory judgment: a failed call is recorded as review.failed and the exclusion stays', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [DELIBERATION], revise: [new Error('連線中斷')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 1, 'a failed call is not asked again')
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '判斷的呼叫失敗' })
    assert.equal(data.candidates[0]!.excluded, true)
  }))

test('mandatory judgment: no exclusion with same-kind experience means no judgment call', () =>
  withStore(async (store) => {
    const { call, calls } = scripted({ deliberate: [DELIBERATION] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.deepEqual(calls.map((c) => c.purpose), ['deliberate'])
    assert.equal((decisions(store)[0]!.data as DecisionData).review, undefined)
  }))
