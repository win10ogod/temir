import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { OUTCOME_SYSTEM, REVISION_SYSTEM, deliberationRetryNote, outcomeRetryNote, outcomeSystem, parseOutcome, revisionRetryNote } from '../src/rd/aux.ts'
import { createRd, type Config, type StepInput } from '../src/rd/index.ts'
import { DEFAULT_PARAMS } from '../src/rd/jitrl.ts'
import { DECISION_KIND, DELIBERATION_FAILED_KIND, OUTCOME_FAILED_KIND, OUTCOME_KIND, type DecisionData, type DeliberationFailedData, type OutcomeData, type OutcomeFailedData } from '../src/rd/memory.ts'
import { potentialItems } from '../src/self/energy.ts'

type Purpose = 'deliberate' | 'revise' | 'outcome'
type Reply = string | Error | ((input: string) => string | Promise<string>)

/**
 * 測試替身（單元測試專用）：取代 callModel。依 system 判斷是哪一種呼叫，依序回傳預先寫好的輸出；
 * Error 代表呼叫失敗；函式收到這次的 input，可以依輸入作答，也可以回傳由測試控制的 promise。記下每一次呼叫的目的、system 與 input。
 */
function scripted(script: Partial<Record<Purpose, Reply[]>>): { call: CallModel; calls: { purpose: Purpose; system: string; input: string }[] } {
  const calls: { purpose: Purpose; system: string; input: string }[] = []
  const call: CallModel = async (_route, system, input) => {
    const purpose: Purpose = system.startsWith(REVISION_SYSTEM) ? 'revise' : system.includes('回頭比對自己上一個決定') ? 'outcome' : 'deliberate'
    calls.push({ purpose, system, input })
    const next = script[purpose]?.shift()
    if (next === undefined) throw new Error(`測試替身沒有準備 ${purpose} 的輸出`)
    if (next instanceof Error) throw next
    const output = typeof next === 'function' ? await next(input) : next
    return { output, ms: 1, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
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

const DELIBERATION_BODY = {
  situation: '對方：她｜對方的意圖：抒發主管的責備｜對方的情緒：煩躁｜話題：主管｜相關的記憶：無',
  drive: '',
  activated: [],
  people: [],
  candidates: [
    { action: '直接給兩個具體的方法', prediction: '她會有方向', confidence: 60, excluded: true, reason: '她在抒發，不是求助' },
    { action: '先陪她', prediction: '她會放鬆', confidence: 30, excluded: false, reason: '' },
    { action: '問她想不想說', prediction: '她會說下去', confidence: 10, excluded: false, reason: '' },
  ],
}

/** 思考的輸入中列出的經驗編號（renderExperiences 的「E1｜…」）。 */
const listedExperiences = (input: string) => [...input.matchAll(/^(E\d+)｜/gmu)].map((m) => m[1]!)

/**
 * 測試替身的思考輸出：對輸入中列出的每一個經驗逐筆作答（D23；ADR-0008 的 sameExcluded），都判斷為不是同一類、
 * 沒有相同的做法（與以前 similar、sameAs 都是空陣列的意思相同）。
 */
const DELIBERATION = (input: string) =>
  JSON.stringify({ ...DELIBERATION_BODY, experiences: listedExperiences(input).map((id) => ({ id, sameSituation: false, sameAction: [], sameExcluded: [] })) })

/** 同上，但判斷第 1 個做法（被扣除的「直接給兩個具體的方法」）與每個列出的經驗那次做的相同：扣除需要強制判斷（ADR-0008 §2）。 */
const SAME_AS_PAST = (input: string) =>
  JSON.stringify({ ...DELIBERATION_BODY, experiences: listedExperiences(input).map((id) => ({ id, sameSituation: true, sameAction: [1], sameExcluded: [] })) })

/** 過去類似處境的一個經驗（舊紀錄，有做法種類）：給了說法，結果好、預測成真。思考判斷這次扣除的做法與它相同時，需要強制判斷。 */
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
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${deliberationRetryNote(['不是 JSON 物件'])}`)
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
    const broken = scripted({ deliberate: ['不是 JSON', '{"situation":"x","candidates":[{"action":"只有一個","kind":"回答"}]}'] })
    const rd = createRd({ life: store, call: broken.call, logger: recorder().logger }, CONFIG)
    assert.equal(await rd.step(input('主管又念我了')), undefined)
    assert.equal(broken.calls.length, 2)
    assert.deepEqual(decisions(store), [])
    assert.deepEqual(store.all(DELIBERATION_FAILED_KIND).map((e) => (e.data as DeliberationFailedData).problems), [['第 1 次：不是 JSON 物件', '第 2 次：可用的做法只有 1 個']], 'the failure is in the life log')
    const failed = scripted({ deliberate: [new Error('逾時')] })
    const { logger, logs } = recorder()
    const rd2 = createRd({ life: store, call: failed.call, logger }, CONFIG)
    assert.equal(await rd2.step(input('主管又念我了')), undefined)
    assert.equal(failed.calls.length, 1, 'a failed call is not retried')
    assert.deepEqual(decisions(store), [])
    assert.match(logs.join('\n'), /deliberate call failed/)
    assert.match(String((store.all('memory/aux').at(-1)!.data as { error?: string }).error), /逾時/)
  }))

test('deliberation (ADR-0008 revokes D22): there is no fixed list of kinds; a kind the model still writes is ignored, not asked again', () =>
  withStore(async (store) => {
    const withKind = (input: string) => JSON.stringify({ ...JSON.parse(DELIBERATION(input)), candidates: DELIBERATION_BODY.candidates.map((c) => ({ ...c, kind: '勸告' })) })
    const { call, calls } = scripted({ deliberate: [withKind] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { ...CONFIG, revision: false })
    assert.ok(await rd.step(input('主管又念我了')))
    assert.equal(calls.length, 1)
    assert.doesNotMatch(calls[0]!.system, /kind/u)
    assert.ok((decisions(store)[0]!.data as DecisionData).candidates.every((c) => c.kind === undefined))
    assert.deepEqual(store.all(DELIBERATION_FAILED_KIND), [])
  }))

test('ADR-0008: an experience that lists what was excluded then needs sameExcluded; a missing answer is asked again, and the answer finds the exclusion to review', () =>
  withStore(async (store) => {
    // 過去：扣除了「直接給她方法」，改成陪伴，結果不好、預測沒有成真。
    const c = (action: string, excluded: boolean) => ({ action, prediction: 'p', confidence: 50, sameAs: [], z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0, ...(excluded ? { excluded, excludeReason: '她在抒發' } : {}) })
    const data: DecisionData = { cue: '今天又被主管念了一頓', situation: '對方：她｜對方的意圖：抒發主管的責備', candidates: [c('只陪她', false), c('直接給她方法', true)], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
    const past = store.append({ kind: DECISION_KIND, origin: 'self', session: 'old', data, text: '處境：抒發' })
    const o: OutcomeData = { decision: past.id, didAction: '只陪她', actual: '她說算了', matched: 'no', error: '', reward: -0.4, reason: '', lesson: '', selfVersion: 0, heard: '' }
    store.append({ kind: OUTCOME_KIND, origin: 'self', session: 'old', data: o, causes: [past.id] })
    const unanswered = (input: string) => JSON.stringify({ ...DELIBERATION_BODY, experiences: listedExperiences(input).map((id) => ({ id, sameSituation: true, sameAction: [] })) })
    const answered = (input: string) => JSON.stringify({ ...DELIBERATION_BODY, experiences: listedExperiences(input).map((id) => ({ id, sameSituation: true, sameAction: [], sameExcluded: [1] })) })
    const keep = '{"judgments":[{"candidate":1,"decision":"lift","why":"X1 那次扣除之後她很失望","refs":["X1"]}]}'
    const { call, calls } = scripted({ deliberate: [unanswered, answered], revise: [keep] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    assert.ok(await rd.step(input('主管又念我了')))
    assert.match(calls[0]!.input, /^E1｜[^\n]*｜當時扣除：直接給她方法（她在抒發）｜扣除之後，當時的預測沒有成真$/mu)
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${deliberationRetryNote(['E1 的 sameExcluded 不是陣列'])}`)
    assert.deepEqual(calls.map((x) => x.purpose), ['deliberate', 'deliberate', 'revise'])
    assert.match(calls[2]!.input, /當時扣除了相同的「直接給她方法」，改做「只陪她」｜結果：她說算了｜預測沒有成真/u)
    const d = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(d.candidates[0]!.sameExcluded, [past.id])
    assert.equal(d.candidates[0]!.judgment?.decision, 'lift')
    assert.deepEqual(d.procedures, { deliberate: 1, subtract: 1 }, 'the procedure versions used are recorded')
  }))

test('D23: a listed experience left unjudged is asked again; the judgment is what JitRL matches on', () =>
  withStore(async (store) => {
    const old = pastAdvice(store)
    const unjudged = JSON.stringify(DELIBERATION_BODY)
    const { call, calls } = scripted({ deliberate: [unjudged, SAME_AS_PAST] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { ...CONFIG, revision: false })
    assert.ok(await rd.step(input('主管又念我了')))
    assert.deepEqual(listedExperiences(calls[0]!.input), ['E1'], 'the past decision is listed')
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${deliberationRetryNote(['沒有 experiences', '沒有判斷 E1'])}`)
    const d = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(d.candidates.map((c) => c.sameAs), [[old], [], []])
    assert.equal(d.candidates[0]!.support, 1, 'the judged same action is matched')
  }))

test('mandatory judgment: a missing answer is asked again with the problems; the valid answer is written as the judgment', () =>
  withStore(async (store) => {
    const past = pastAdvice(store)
    const lift = '{"judgments":[{"candidate":1,"decision":"lift","why":"X1 給說法她覺得有幫助","refs":["X1"]}]}'
    const { call, calls } = scripted({ deliberate: [SAME_AS_PAST], revise: ['{"judgments":[]}', lift] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    const prepared = await rd.step(input('主管又念我了'))
    assert.deepEqual(calls.map((c) => c.purpose), ['deliberate', 'revise', 'revise'])
    assert.equal(calls[1]!.system, REVISION_SYSTEM)
    assert.equal(calls[2]!.system, `${REVISION_SYSTEM}\n${revisionRetryNote(['做法 1 沒有判斷'])}`)
    assert.match(calls[1]!.input, /1\. 直接給兩個具體的方法｜你扣除的理由：她在抒發，不是求助\n {3}- X1｜[^\n]*當時做了相同的「給了兩個說法」/u)
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1 })
    assert.equal(data.candidates[0]!.excluded, undefined, 'lifted')
    assert.deepEqual(data.candidates[0]!.judgment, { decision: 'lift', why: 'X1 給說法她覺得有幫助', refs: [past], reason: '她在抒發，不是求助' })
    assert.match(prepared!.text, /你看過經驗之後解除了扣除：X1 給說法她覺得有幫助/)
  }))

test('mandatory judgment: two invalid answers are recorded as review.failed and the exclusion stays', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [SAME_AS_PAST], revise: ['{"judgments":[]}', '{"judgments":[{"candidate":1,"decision":"maybe","why":"","refs":[]}]}'] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 2, 'asked again only once')
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '第 1 次：做法 1 沒有判斷；第 2 次：做法 1 的 decision 不是 keep 或 lift；第 2 次：做法 1 沒有寫理由；第 2 次：做法 1 沒有引用列出的經驗' }, 'the problems of both answers are kept (item 4)')
    assert.equal(data.candidates[0]!.excluded, true)
    assert.equal(data.candidates[0]!.judgment, undefined)
    assert.notEqual(data.chosen, 0, 'the excluded candidate is not chosen')
  }))

test('mandatory judgment: a failed call is recorded as review.failed and the exclusion stays', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [SAME_AS_PAST], revise: [new Error('連線中斷')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 1, 'a failed call is not asked again')
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '判斷的呼叫失敗' })
    assert.equal(data.candidates[0]!.excluded, true)
  }))

test('mandatory judgment (item 4): when the second call fails, the problems of the first answer are kept', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [SAME_AS_PAST], revise: ['{"judgments":[]}', new Error('連線中斷')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 2)
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '第 1 次：做法 1 沒有判斷；第 2 次：判斷的呼叫失敗' })
    assert.equal(data.candidates[0]!.excluded, true)
  }))

test('mandatory judgment: when no excluded candidate is judged the same as a past action, there is no judgment call', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [DELIBERATION] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.deepEqual(calls.map((c) => c.purpose), ['deliberate'])
    assert.equal((decisions(store)[0]!.data as DecisionData).review, undefined)
  }))

const OUTCOME = (actual: string, reward = 0) =>
  JSON.stringify({ didAction: '答應想好名字再告訴他', declined: false, actual, matched: 'partly', error: '', reward, reason: 'r', lesson: '', feeling: '', reconsider: false, released: [], left: [] })

/** 測試替身（單元測試專用）：由測試決定何時完成的 promise。 */
function gate(): { promise: Promise<string>; open: (output: string) => void } {
  let open!: (output: string) => void
  const promise = new Promise<string>((resolve) => (open = resolve))
  return { promise, open }
}

/** 上一回合：決定、它回應的那句話、我的回覆（latestRoute 從回覆取得模型）。 */
function lastTurn(store: LifeStore): string {
  const c = { action: '答應想好名字再告訴他', kind: '回答', prediction: '他會等', confidence: 100, sameAs: [], z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0 }
  const data: DecisionData = { cue: '想好名字再告訴我', situation: '對方請我想名字', candidates: [c], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
  const d = store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data, text: '處境：對方請我想名字' })
  store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：想好名字再告訴我' })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', model: 'test/double', data: {}, text: '我說：好，我想好再告訴你' })
  return d.id
}

const outcomesOf = (store: LifeStore, id: string) => store.referencing(id, OUTCOME_KIND).map((e) => e.data as OutcomeData)
const SILENT_LATER = () => Date.now() + 11 * 60_000

test('race (item 1): the other replies while the provisional comparison is running; the real comparison runs after it', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const slow = gate()
    const { call, calls } = scripted({ outcome: [() => slow.promise, OUTCOME('他說謝謝，名字很好', 0.5)], deliberate: [DELIBERATION] })
    const { logger, logs } = recorder()
    const rd = createRd({ life: store, call, logger }, { silenceMinutes: 10 })
    rd.checkSilence(SILENT_LATER())
    assert.deepEqual(calls.map((c) => c.purpose), ['outcome'], 'the provisional comparison is waiting for the model')
    // 對方回話：pre-step 的正式比對不能因為暫時的比對還在進行就被丟掉；同一步寫入新的決定。
    await rd.step(input('謝謝你，名字很好'))
    assert.equal(decisions(store).length, 2)
    assert.deepEqual(calls.map((c) => c.purpose), ['outcome', 'deliberate'], 'the real comparison waits for the provisional one')
    slow.open(OUTCOME('對方到現在都沒有再說話'))
    await rd.settle()
    assert.deepEqual(calls.map((c) => c.purpose), ['outcome', 'deliberate', 'outcome'])
    assert.match(calls[2]!.input, /## 對方接著說了什麼\n謝謝你，名字很好$/u)
    const outcomes = outcomesOf(store, old)
    assert.deepEqual(outcomes.map((o) => [o.provisional ?? false, o.reward]), [[true, 0], [false, 0.5]], 'a real (not provisional) outcome is recorded after the provisional one')
    assert.equal(outcomes[1]!.heard, '謝謝你，名字很好')
    assert.deepEqual(logs, [])
  }))

test('race (item 1): without a reply there is only the provisional comparison, once', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const slow = gate()
    const { call, calls } = scripted({ outcome: [() => slow.promise] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { silenceMinutes: 10 })
    rd.checkSilence(SILENT_LATER())
    rd.checkSilence(SILENT_LATER())
    slow.open(OUTCOME('對方到現在都沒有再說話'))
    await rd.settle()
    rd.checkSilence(SILENT_LATER())
    await rd.settle()
    assert.equal(calls.length, 1, 'the silence check does not start a second comparison')
    assert.deepEqual(outcomesOf(store, old).map((o) => o.provisional), [true])
    assert.equal(outcomesOf(store, old)[0]!.heard, '（對方到現在都沒有再說話。）')
  }))

test('race (item 1): the real comparison is never duplicated', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const decision = store.get(old)!
    const slow = gate()
    const real = gate()
    const { call, calls } = scripted({ outcome: [() => slow.promise, () => real.promise] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { silenceMinutes: 10 })
    rd.checkSilence(SILENT_LATER())
    rd.evaluate(decision, '謝謝', ROUTE)
    rd.evaluate(decision, '謝謝', ROUTE)
    rd.evaluate(decision, '（對方到現在都沒有再說話。）', ROUTE, true)
    slow.open(OUTCOME('對方到現在都沒有再說話'))
    await new Promise((resolve) => setImmediate(resolve))
    rd.evaluate(decision, '謝謝', ROUTE)
    real.open(OUTCOME('他說謝謝', 0.5))
    await rd.settle()
    rd.evaluate(decision, '謝謝', ROUTE)
    await rd.settle()
    assert.equal(calls.length, 2, 'one provisional and one real comparison')
    assert.deepEqual(outcomesOf(store, old).map((o) => o.provisional ?? false), [true, false])
  }))

const failuresOf = (store: LifeStore, id: string) => store.referencing(id, OUTCOME_FAILED_KIND).map((e) => e.data as OutcomeFailedData)

test('outcome (item 2): an incomplete comparison is asked again with its problems; the valid answer is the one outcome', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const incomplete = JSON.stringify({ didAction: '', declined: false, actual: '他說謝謝', matched: 'maybe', reward: 0.5, reconsider: false })
    const { call, calls } = scripted({ outcome: [incomplete, OUTCOME('他說謝謝', 0.5)] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    rd.evaluate(store.get(old)!, '謝謝', ROUTE)
    await rd.settle()
    assert.equal(calls.length, 2)
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${outcomeRetryNote(['matched 不是 yes、partly 或 no', 'didAction 是空的'])}`)
    assert.equal(calls[0]!.input, calls[1]!.input)
    assert.deepEqual(outcomesOf(store, old).map((o) => [o.didAction, o.matched, o.reward]), [['答應想好名字再告訴他', 'partly', 0.5]])
    assert.deepEqual(failuresOf(store, old), [])
  }))

test('outcome (ADR-0008): a prediction that did not come true needs gapOnMind, a feeling needs keepFeeling; missing answers are asked again', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const missed = OUTCOME('他說名字太長了', -0.2).replace('"matched":"partly"', '"matched":"no"').replace('"feeling":""', '"feeling":"有點失落"')
    const answered = missed.replace('"reconsider":false', '"reconsider":false,"gapOnMind":true,"keepFeeling":true')
    const { call, calls } = scripted({ outcome: [missed, answered] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    rd.evaluate(store.get(old)!, '名字太長了', ROUTE)
    await rd.settle()
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${outcomeRetryNote(['有 feeling，但 keepFeeling 不是 true 或 false', 'matched 是 no，但 gapOnMind 不是 true 或 false'])}`)
    const [o] = outcomesOf(store, old)
    assert.deepEqual([o!.gapOnMind, o!.keepFeeling, o!.reconsider], [true, true, false])
    assert.ok(potentialItems(store).some((p) => p.key.startsWith('surprise:')), 'the gap stays on my mind as a surprise (H-E)')
    const [feeling] = store.all('appraisal')
    assert.match(feeling!.text ?? '', /^我的感受：有點失落$/u, 'the kept feeling is an appraisal, without a fixed significance label')
  }))

test('outcome (item 2): two invalid answers write a failure record with both problems and no outcome', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const { call, calls } = scripted({ outcome: ['我覺得還不錯', JSON.stringify({ didAction: 'a', declined: false, matched: 'yes', reward: 'good', reconsider: false })] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    rd.evaluate(store.get(old)!, '謝謝', ROUTE)
    await rd.settle()
    assert.equal(calls.length, 2)
    assert.deepEqual(outcomesOf(store, old), [])
    assert.deepEqual(failuresOf(store, old), [{ decision: old, problems: ['第 1 次：不是 JSON 物件', '第 2 次：reward 不是數'] }])
  }))

test('outcome (item 2): a failed call is not asked again and is recorded; a failed provisional comparison is not redone every minute', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const { call, calls } = scripted({ outcome: [new Error('逾時')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { silenceMinutes: 10 })
    rd.checkSilence(SILENT_LATER())
    await rd.settle()
    rd.checkSilence(SILENT_LATER())
    await rd.settle()
    assert.equal(calls.length, 1)
    assert.deepEqual(failuresOf(store, old), [{ decision: old, problems: ['比對的呼叫失敗'], provisional: true }])
    // 對方之後回話時仍會正式比對。
    const again = scripted({ outcome: [OUTCOME('他說謝謝', 0.5)], deliberate: [DELIBERATION] })
    const rd2 = createRd({ life: store, call: again.call, logger: recorder().logger }, CONFIG)
    await rd2.step(input('謝謝你'))
    await rd2.settle()
    assert.deepEqual(outcomesOf(store, old).map((o) => o.provisional ?? false), [false])
  }))

/** context 模式（synthesis §3 第 3 點）：主 agent 以 deliberate 工具思考；同樣的強制判斷，由工具結果要求重寫或判斷。 */
const CONTEXT: Config = { silenceMinutes: 0, mode: 'context' }

/** 通知中列出的經驗編號。 */
const noticeExperiences = (notice: string) => [...notice.matchAll(/(?:^|\s)(E\d+)｜/gmu)].map((m) => m[1]!)

test('context mode: the main agent gets a notice with its own procedures and the listed experiences; a valid deliberate call returns the preparation', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({})
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONTEXT)
    assert.equal(rd.deliberateTool('s1', {}), '現在沒有需要思考的事：對方說話之後、回應之前才需要。')
    const notice = rd.begin(input('主管又念我了'))
    assert.match(notice, /^（這不是對方說的話。）[^\n]*先呼叫 deliberate 工具思考與準備（只在心裡想，不算）/u)
    assert.match(notice, /## 我的思考做法（第 1 版；[^]*## 我的扣除做法（第 1 版；/u)
    assert.match(notice, /呼叫 deliberate 工具，參數就是下面這個物件的各個欄位：/u)
    assert.match(notice, /## 過去類似處境的經驗\n[^]*E1｜/u)
    assert.equal(rd.awaiting('s1'), true)
    const ids = noticeExperiences(notice)
    const missing = rd.deliberateTool('s1', { ...DELIBERATION_BODY })
    assert.match(missing, /^思考還沒有完成，再呼叫一次 deliberate：（重寫一次[^]*沒有 experiences/u)
    const done = rd.deliberateTool('s1', { ...DELIBERATION_BODY, experiences: ids.map((id) => ({ id, sameSituation: false, sameAction: [], sameExcluded: [] })) })
    assert.match(done, /（這是你自己的準備。接著回應對方；實際怎麼做由你決定。）$/u)
    assert.equal(rd.awaiting('s1'), false)
    assert.equal(calls.length, 0, 'no auxiliary call: the main agent did the thinking')
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual([data.mode, data.repliedBefore, data.procedures], ['context', false, { deliberate: 1, subtract: 1 }])
    const aux = store.all('memory/aux').map((e) => e.data as { purpose: string; mode?: string; input: string })
    assert.deepEqual(aux.map((a) => [a.purpose, a.mode]), [['deliberate', 'context'], ['deliberate', 'context']])
    assert.match(aux[0]!.input, /## 對方剛說的話\n主管又念我了$/u, 'recorded in the auxiliary format so the gate can probe it')
  }))

test('context mode: an exclusion that needs a judgment is asked through the tool result; the judgment is validated the same way', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const rd = createRd({ life: store, call: scripted({}).call, logger: recorder().logger }, CONTEXT)
    const ids = noticeExperiences(rd.begin(input('主管又念我了')))
    const asked = rd.deliberateTool('s1', { ...DELIBERATION_BODY, experiences: ids.map((id) => ({ id, sameSituation: true, sameAction: [1], sameExcluded: [] })) })
    assert.match(asked, /再呼叫一次 deliberate 工具，只給 judgments 參數：[^]*1\. 直接給兩個具體的方法｜你扣除的理由：她在抒發，不是求助/u)
    const again = rd.deliberateTool('s1', { judgments: [] })
    assert.match(again, /（重寫一次：上一次的判斷不完整。[^]*做法 1 沒有判斷/u)
    const done = rd.deliberateTool('s1', { judgments: [{ candidate: 1, decision: 'keep', why: 'X1 有幫助，但她現在只想抒發', refs: ['X1'] }] })
    assert.match(done, /這是你自己的準備/u)
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1 })
    assert.equal(data.candidates[0]!.excluded, true)
  }))

test('context mode: ending the turn without deliberating is recorded as a failure; a reply before the decision is recorded', () =>
  withStore(async (store) => {
    const rd = createRd({ life: store, call: scripted({}).call, logger: recorder().logger }, CONTEXT)
    assert.doesNotMatch(rd.begin(input('你好')), /你沒有先用 deliberate 思考就回應了/u)
    rd.endTurn('s1')
    const [failed] = store.all(DELIBERATION_FAILED_KIND).map((e) => e.data as DeliberationFailedData)
    assert.deepEqual(failed, { cue: '你好', problems: ['沒有在回應之前用 deliberate 思考'], mode: 'context' })
    assert.equal(rd.awaiting('s1'), false)
    // 下一次的通知照實提醒（直到做到為止）。
    assert.match(rd.begin(input('在嗎')), /^（這不是對方說的話。）上一次對方說話之後，你沒有先用 deliberate 思考就回應了。/u)
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: { data: { message: { content: [{ type: 'text', text: '在喔' }] } } }, text: '我說：在喔' })
    rd.deliberateTool('s1', { ...DELIBERATION_BODY, experiences: [] })
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual([data.mode, data.repliedBefore], ['context', true], 'it spoke before it thought')
  }))

test('context mode: the decision is written after the words it answers; the next turn still compares it with what was said and heard', () =>
  withStore(async (store) => {
    const { call, calls } = scripted({ outcome: [OUTCOME('對方說他明天會試試看', 0.5)] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONTEXT)
    rd.begin(input('明天要跟主管談，我很緊張'))
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：明天要跟主管談，我很緊張' })
    rd.deliberateTool('s1', { ...DELIBERATION_BODY, experiences: [] })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', model: 'test/double', data: { data: { message: { content: [{ type: 'text', text: '先寫下你想說的三句話' }] } } }, text: '我說：先寫下你想說的三句話' })
    rd.begin(input('好，我明天試試看'))
    await rd.settle()
    assert.deepEqual(calls.map((c) => c.purpose), ['outcome'])
    assert.match(calls[0]!.input, /## 你實際說了什麼\n先寫下你想說的三句話\n\n## 對方接著說了什麼\n好，我明天試試看/u)
    const [decision] = decisions(store)
    assert.equal(outcomesOf(store, decision!.id).length, 1)
  }))

/** 事後比對的歸因（hypotheses.md H-AT）：預測不符、對方回了話時，要逐一判斷幾種解讀，教訓依據有原話支持的那一個。 */
const ATTRIBUTION: Config = { ...CONFIG, attribution: true }
const MISREAD = (fields: Record<string, unknown>) =>
  JSON.stringify({ didAction: '先陪她、沒有給方法', declined: false, actual: '她說算了，說了也沒用', matched: 'no', error: '她沒有放鬆', reward: -0.4, reason: 'r', lesson: '她要的是能做的方法', feeling: '', reconsider: false, gapOnMind: false, released: [], left: [], ...fields })

test('attribution (H-AT): a missed prediction needs at least two readings quoting what the other said; the lesson rests on a quoted one', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const one = MISREAD({ readings: [{ reading: '她需要更多陪伴', quote: '算了' }], basis: 1 })
    const ok = MISREAD({
      readings: [
        { reading: '她需要更多陪伴', quote: '算了' },
        { reading: '陪伴沒有用，她要的是能做的方法', quote: '說了也沒用' },
      ],
      basis: 2,
    })
    const { call, calls } = scripted({ outcome: [one, ok] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, ATTRIBUTION)
    rd.evaluate(store.get(old)!, '算了，說了也沒用。', ROUTE)
    await rd.settle()
    assert.match(calls[0]!.system, /- readings：matched 是 partly 或 no 時必答：對方為什麼會這樣回應我實際做的事，至少兩種彼此不同的解讀/u)
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${outcomeRetryNote(['預測不符，但 readings 少於兩種彼此不同的解讀'], true)}`)
    const [o] = outcomesOf(store, old)
    assert.deepEqual([o!.lesson, o!.basis, o!.readings?.length], ['她要的是能做的方法', 2, 2])
    assert.equal((store.all('memory/aux')[0]!.data as { variant?: unknown }).variant !== undefined, true, 'the gate rebuilds the same prompt')
  }))

test('attribution (H-AT): a quote that is not the other’s words, or a lesson resting on an unquoted reading, is asked again', () => {
  const heard = { heard: '嗯，好吧，就這樣吧。' }
  const readings = (quote2: string) => [
    { reading: '她累了不想多說', quote: '就這樣吧' },
    { reading: '我給的建議太空泛', quote: quote2 },
  ]
  const invented = parseOutcome(MISREAD({ readings: readings('你說的都沒用'), basis: 1 }), { energy: false, attribution: heard })
  assert.deepEqual(invented.ok ? [] : invented.problems, ['readings 第 2 條的 quote 不是對方接著說的話的原文'])
  const unquoted = parseOutcome(MISREAD({ readings: readings(''), basis: 2 }), { energy: false, attribution: heard })
  assert.deepEqual(unquoted.ok ? [] : unquoted.problems, ['lesson 依據的解讀沒有對方原話的支持（quote 是空的）'])
  const noBasis = parseOutcome(MISREAD({ readings: readings('') }), { energy: false, attribution: heard })
  assert.deepEqual(noBasis.ok ? [] : noBasis.problems, ['有 lesson，但 basis 不是 readings 中的一個編號'])
  // 標點與空白的增減不算改了原話；沒有教訓時不需要 basis。
  const fine = parseOutcome(MISREAD({ readings: readings(''), lesson: '', basis: 0 }), { energy: false, attribution: heard })
  assert.equal(fine.ok && fine.judgment.basis, undefined)
  const punctuated = parseOutcome(MISREAD({ readings: [{ reading: 'a', quote: '嗯 好吧' }, { reading: 'b', quote: '' }], basis: 1 }), { energy: false, attribution: heard })
  assert.equal(punctuated.ok, true)
  // 預測成真時不需要解讀；attribution 關閉時與之前完全相同。
  assert.equal(parseOutcome(MISREAD({ matched: 'yes' }), { energy: false, attribution: heard }).ok, true)
  assert.equal(parseOutcome(MISREAD({}), { energy: false }).ok, true)
  assert.equal(outcomeSystem({ attribution: false }), OUTCOME_SYSTEM)
  assert.doesNotMatch(outcomeRetryNote(['x']), /readings/u)
})

test('attribution (H-AT): a provisional comparison (the other has not replied) has no words to quote, so no readings are required', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const { call } = scripted({ outcome: [MISREAD({ actual: '對方沒有再說話', lesson: '' })] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, ATTRIBUTION)
    rd.evaluate(store.get(old)!, '（對方到現在都沒有再說話。）', ROUTE, true)
    await rd.settle()
    const [o] = outcomesOf(store, old)
    assert.deepEqual([o!.provisional, o!.readings], [true, undefined])
  }))
