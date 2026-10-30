import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { REVISION_SYSTEM, deliberationRetryNote, outcomeRetryNote, revisionRetryNote } from '../src/rd/aux.ts'
import { createRd, type Config, type StepInput } from '../src/rd/index.ts'
import { DEFAULT_PARAMS } from '../src/rd/jitrl.ts'
import { DECISION_KIND, DELIBERATION_FAILED_KIND, OUTCOME_FAILED_KIND, OUTCOME_KIND, type DecisionData, type DeliberationFailedData, type OutcomeData, type OutcomeFailedData } from '../src/rd/memory.ts'

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
    return { output, ms: 1, retried: false, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
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

/** DELIBERATION 中第一個做法的 kind 換成認不得的值。 */
const withKind = (kind: string) => DELIBERATION.replace('"kind":"建議"', `"kind":"${kind}"`)

test('deliberation: an unknown kind is not filled in as 其他; it is asked again with the problem (user 2026-10-30)', () =>
  withStore(async (store) => {
    const { call, calls } = scripted({ deliberate: [withKind('勸告'), DELIBERATION] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { ...CONFIG, revision: false })
    assert.ok(await rd.step(input('主管又念我了')))
    assert.equal(calls.length, 2)
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${deliberationRetryNote(['做法「直接給兩個具體的方法」的 kind「勸告」不是 回答／提問／建議／拒絕／使用工具／表達感受／其他 之一'])}`)
    assert.deepEqual((decisions(store)[0]!.data as DecisionData).candidates.map((c) => c.kind), ['建議', '表達感受', '提問'])
    assert.deepEqual(store.all(DELIBERATION_FAILED_KIND), [])
  }))

test('deliberation: an unknown kind twice prepares nothing and is recorded as a failure', () =>
  withStore(async (store) => {
    const { call, calls } = scripted({ deliberate: [withKind('勸告'), withKind('')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, { ...CONFIG, revision: false })
    assert.equal(await rd.step(input('主管又念我了')), undefined)
    assert.equal(calls.length, 2)
    assert.deepEqual(decisions(store), [])
    const [failed] = store.all(DELIBERATION_FAILED_KIND)
    assert.equal(failed?.session, 's1')
    assert.deepEqual((failed!.data as DeliberationFailedData).problems, [
      '第 1 次：做法「直接給兩個具體的方法」的 kind「勸告」不是 回答／提問／建議／拒絕／使用工具／表達感受／其他 之一',
      '第 2 次：做法「直接給兩個具體的方法」的 kind「」不是 回答／提問／建議／拒絕／使用工具／表達感受／其他 之一',
    ])
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
    assert.deepEqual(data.review, { required: 1, failed: '第 1 次：做法 1 沒有判斷；第 2 次：做法 1 的 decision 不是 keep 或 lift；第 2 次：做法 1 沒有寫理由；第 2 次：做法 1 沒有引用列出的經驗' }, 'the problems of both answers are kept (item 4)')
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

test('mandatory judgment (item 4): when the second call fails, the problems of the first answer are kept', () =>
  withStore(async (store) => {
    pastAdvice(store)
    const { call, calls } = scripted({ deliberate: [DELIBERATION], revise: ['{"judgments":[]}', new Error('連線中斷')] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    await rd.step(input('主管又念我了'))
    assert.equal(calls.filter((c) => c.purpose === 'revise').length, 2)
    const data = decisions(store)[0]!.data as DecisionData
    assert.deepEqual(data.review, { required: 1, failed: '第 1 次：做法 1 沒有判斷；第 2 次：判斷的呼叫失敗' })
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

const OUTCOME = (actual: string, reward = 0) =>
  JSON.stringify({ didAction: '答應想好名字再告訴他', didKind: '回答', actual, matched: 'partly', error: '', reward, reason: 'r', lesson: '', feeling: '', significance: 'daily', released: [], left: [] })

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
    const incomplete = JSON.stringify({ didAction: '', didKind: '回答', actual: '他說謝謝', matched: 'maybe', reward: 0.5, significance: 'daily' })
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

test('outcome: an unknown didKind is not filled in as 其他; it is asked again (user 2026-10-30)', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const unknown = OUTCOME('他說謝謝', 0.5).replace('"didKind":"回答"', '"didKind":"承諾"')
    const { call, calls } = scripted({ outcome: [unknown, OUTCOME('他說謝謝', 0.5)] })
    const rd = createRd({ life: store, call, logger: recorder().logger }, CONFIG)
    rd.evaluate(store.get(old)!, '謝謝', ROUTE)
    await rd.settle()
    assert.equal(calls[1]!.system, `${calls[0]!.system}\n${outcomeRetryNote(['didKind 不是 回答／提問／建議／拒絕／使用工具／表達感受／其他 之一'])}`)
    assert.deepEqual(outcomesOf(store, old).map((o) => o.didKind), ['回答'])
  }))

test('outcome (item 2): two invalid answers write a failure record with both problems and no outcome', () =>
  withStore(async (store) => {
    const old = lastTurn(store)
    const { call, calls } = scripted({ outcome: ['我覺得還不錯', JSON.stringify({ didAction: 'a', didKind: '回答', matched: 'yes', reward: 'good', significance: 'daily' })] })
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
