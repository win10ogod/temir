import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { OUTCOME_KIND } from '../src/rd/memory.ts'
import { recentCycles } from '../src/self/cycle.ts'
import { THOUGHT_KIND, potentialItems, type ThoughtData } from '../src/self/energy.ts'
import { KIND } from '../src/self/state.ts'
import { hasPotential, lastThoughtSeq, newExperienceSince, parseThought, recordThought, renderThoughts, thoughtInput } from '../src/thought/thought.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-thought-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

function heldPromise(store: LifeStore) {
  store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我在考慮轉職' })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：下次我提醒你問履歷' })
  return store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { decision: 'l:d', didAction: 'a', didKind: '回答', actual: 'b', matched: 'partly', error: '', reward: 0, reason: '', lesson: '', left: '答應下次提醒對方問履歷', selfVersion: 0, heard: '' } })
}

/** 合格的念頭（不合格時測試失敗）。 */
function thought(raw: string) {
  const parsed = parseThought(raw)
  assert.ok(parsed.ok, `expected a valid thought: ${parsed.ok ? '' : parsed.problems.join('；')}`)
  return parsed.judgment
}

test('parseThought: nothing surfaces is a valid answer; fields are cleaned and bounded; the judgments are mandatory when something surfaced', () => {
  assert.deepEqual(thought('{"item":"","thought":"","release":false}'), { item: '', thought: '', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '', replaces: [], now: false })
  const t = thought('好的 {"item":"P1","thought":"我其實  在意他會不會怕","feeling":"有點擔心","keepFeeling":true,"reconsider":false,"release":false,"intention":"下次先問他還怕不怕","replaces":[],"now":false}')
  assert.deepEqual([t.item, t.thought, t.keepFeeling, t.release], ['P1', '我其實 在意他會不會怕', true, false])
  // ADR-0008：重要程度拿掉了，改成逐項的強制判斷；字串 "true" 不算布林。
  const problems = (raw: string) => {
    const parsed = parseThought(raw)
    return parsed.ok ? [] : parsed.problems
  }
  assert.deepEqual(problems('{"item":"P1","thought":"x","feeling":"擔心","significance":"notable","release":"true","intention":"問他"}'), [
    'reconsider 不是 true 或 false',
    'release 不是 true 或 false',
    '有 feeling，但 keepFeeling 不是 true 或 false',
    '有 intention，但 now 不是 true 或 false',
    '有 intention，但 replaces 不是陣列',
  ])
  assert.deepEqual(problems('沒有 JSON'), ['不是 JSON 物件'])
  // replaces 只能指名列出的懸著的事。
  const labels = new Map([['P1', 'left:x'], ['P2', 'intention:y']])
  const unknown = parseThought('{"item":"P1","thought":"x","reconsider":false,"release":false,"intention":"問他","now":false,"replaces":["p2","P9"]}', labels)
  assert.deepEqual(unknown.ok ? [] : unknown.problems, ['replaces 的「P9」不是列出的懸著的事'])
  const ok = parseThought('{"item":"P1","thought":"x","reconsider":false,"release":false,"intention":"問他","now":false,"replaces":["p2","P2"]}', labels)
  assert.ok(ok.ok)
  assert.deepEqual(ok.judgment.replaces, ['P2'])
})

test('a thought is a cycle that starts from an internal stimulus: it can release what surfaced, leave an intention, and record a feeling', () => {
  withStore((store) => {
    assert.equal(hasPotential(store), false, 'nothing held, no goals: nothing can surface')
    const promise = heldPromise(store)
    assert.equal(hasPotential(store), true)
    const { input, labels } = thoughtInput(store)
    assert.match(input, /\[P1\] 行動留下的懸念（[^）]+）：答應下次提醒對方問履歷/)
    assert.match(input, /## 最近一次對話\n對方說：我在考慮轉職\n我說：下次我提醒你問履歷/)
    assert.match(input, /## 主動開口\n- 你還沒有主動開口過。/)
    assert.equal(recordThought(store, { item: '', thought: '', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '', replaces: [], now: false }, labels, 'm'), undefined, 'nothing surfaced: nothing written')
    assert.equal(recordThought(store, { item: 'P7', thought: 'x', feeling: '', keepFeeling: false, reconsider: false, release: true, intention: '', replaces: [], now: false }, labels, 'm'), undefined, 'an unknown label is not guessed')
    const id = store.transaction(() =>
      recordThought(store, { item: 'P1', thought: '他其實還沒決定要不要轉，我不該只惦記履歷', feeling: '有點擔心他', keepFeeling: true, reconsider: false, release: true, intention: '下次先問他還想不想轉職', replaces: [], now: false }, labels, 'm'),
    )
    assert.ok(id)
    const thought = store.get(id!)!
    assert.deepEqual(thought.causes, [promise.id], 'the thought points at what surfaced')
    assert.deepEqual((thought.data as ThoughtData).releasedItems, [`left:${promise.id}`])
    assert.deepEqual(potentialItems(store).map((p) => p.key), [`intention:${id}`], 'the promise is released; the intention is now held')
    const [feeling] = store.all(KIND.appraisal)
    assert.deepEqual(feeling?.causes, [id])
    assert.match(renderThoughts(store).join('\n'), /## 最近的念頭[\s\S]*他其實還沒決定要不要轉/)
    const cycles = recentCycles(store, 5)
    assert.deepEqual(cycles.map((c) => c.source), ['internal'])
    assert.deepEqual(cycles[0]?.complete, { E: true, STRD: true, A: true })
  })
})

test('an intention that rewrites one already held replaces it, so the same intention does not pile up (e2e-40)', () => {
  withStore((store) => {
    heldPromise(store)
    const first = store.transaction(() =>
      recordThought(store, { item: 'P1', thought: '要記得提醒', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '下次提醒他問履歷', replaces: [], now: false }, thoughtInput(store).labels, 'm'),
    )
    assert.equal(potentialItems(store).length, 2, 'the promise and the intention')
    const { labels, input } = thoughtInput(store)
    assert.match(input, /\[P1\] 我想對對方做的事[^\n]*下次提醒他問履歷/, 'outward items are listed first')
    const second = store.transaction(() =>
      recordThought(store, { item: 'P1', thought: '先問他想不想轉，再提履歷', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '下次先問他還想不想轉職，再提履歷', replaces: ['P1'], now: false }, labels, 'm'),
    )
    const data = store.get(second!)!.data as ThoughtData
    assert.deepEqual(data.replacedItems, [`intention:${first}`])
    assert.match(store.get(second!)!.text ?? '', /這個打算取代了：下次提醒他問履歷/)
    assert.deepEqual(potentialItems(store).map((p) => p.text), ['答應下次提醒對方問履歷', '下次先問他還想不想轉職，再提履歷'])
  })
})

test('the idle thought waits for a new experience: probes, aux calls and its own records do not count (e2e-40)', () => {
  withStore((store) => {
    heldPromise(store)
    assert.equal(lastThoughtSeq(store), -1)
    store.append({ kind: 'memory/aux', origin: 'self', data: { purpose: 'thought', output: '{}' } })
    const after = lastThoughtSeq(store)
    assert.equal(after, store.lastSeq(), 'an attempt counts as the last thought')
    assert.equal(newExperienceSince(store, after), false)
    store.append({ kind: 'memory/aux', origin: 'self', data: { purpose: 'procedure-probe', output: 'x' } })
    store.append({ kind: 'self/procedure-probe', origin: 'self', data: {} })
    store.append({ kind: KIND.appraisal, origin: 'self', data: { feeling: 'x', reappraisal: false } })
    store.append({ kind: THOUGHT_KIND, origin: 'self', data: { item: null, thought: '', intention: '', releasedItems: [], trigger: 'idle' } })
    assert.equal(newExperienceSince(store, after), false, 'nothing new was experienced')
    store.append({ kind: 'self/integration', origin: 'self', data: {} })
    assert.equal(newExperienceSince(store, after), true, 'an integration changes what can surface')
    const later = store.lastSeq()
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：嗨' })
    assert.equal(newExperienceSince(store, later), true)
  })
})

test('a goal can surface but is not released by a thought (goals change through the goal tool or the integration)', () => {
  withStore((store) => {
    store.append({ kind: KIND.goalChange, origin: 'self', data: { goalId: 'g:1234abcd', text: '親自聞聞薄荷', status: 'active', reason: 'r' } })
    const { labels } = thoughtInput(store)
    const id = store.transaction(() => recordThought(store, { item: 'g:1234abcd', thought: '我還沒有機會聞薄荷', feeling: '', keepFeeling: false, reconsider: false, release: true, intention: '', replaces: [], now: false }, labels, 'm'))
    const data = store.get(id!)!.data as ThoughtData
    assert.deepEqual([data.item, data.releasedItems], ['goal:g:1234abcd', []])
    assert.equal(store.all(THOUGHT_KIND).length, 1)
  })
})

test('the cycle view interleaves conversation turns and thoughts in time order', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/turn/start', origin: 'session', session: 's1', data: {} })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：你好' })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：你好' })
    store.append({ kind: 'dsh/turn/end', origin: 'session', session: 's1', data: { data: { reason: { kind: 'completed' } } } })
    store.append({ kind: THOUGHT_KIND, origin: 'self', data: { item: null, thought: '', intention: '', releasedItems: [], trigger: 'idle' } })
    const cycles = recentCycles(store, 5)
    assert.deepEqual(cycles.map((c) => c.source), ['external', 'internal'])
    assert.equal(cycles[0]?.source === 'external' && cycles[0].complete.STRD, false, 'no RD stage recorded in this turn')
    assert.deepEqual(cycles[1]?.complete, { E: false, STRD: false, A: true })
  })
})

test('initiative: a thought can decide to speak now; the program only prevents double-texting, how often is the individual’s own procedure (ADR-0008 §4)', async () => {
  const { INITIATIVE_KIND, initiativeNote, mayInitiate } = await import('../src/thought/thought.ts')
  assert.equal(parseThought('{"item":"P1","thought":"x","reconsider":false,"release":false,"intention":"提醒他關火","now":"true"}').ok, false, 'only a boolean counts')
  withStore((store) => {
    heldPromise(store)
    const { labels } = thoughtInput(store)
    const id = store.transaction(() => recordThought(store, { item: 'P1', thought: '他說一分鐘後提醒他關火，已經過了', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '提醒他關火', replaces: [], now: true }, labels, 'm'))
    assert.equal((store.get(id!)!.data as ThoughtData).now, true)
    const quiet = store.transaction(() => recordThought(store, { item: 'P1', thought: '再等等', feeling: '', keepFeeling: false, reconsider: false, release: false, intention: '', replaces: [], now: true }, labels, 'm'))
    assert.equal((store.get(quiet!)!.data as ThoughtData).now, undefined, 'nothing to say: now is dropped')
    assert.match(initiativeNote('他說一分鐘後提醒他關火', '提醒他關火'), /^（這不是對方說的話：.*你決定現在主動對對方說：提醒他關火/su)
    assert.deepEqual(mayInitiate(store), { ok: true })
    store.append({ kind: INITIATIVE_KIND, origin: 'self', data: { thought: id, session: 's1', intention: '提醒他關火', delivered: true } })
    assert.equal(mayInitiate(store).ok, false, 'no second initiative before the other replies')
    assert.match(thoughtInput(store).input, /## 主動開口\n- 最近一次主動開口：[^；]+；之後對方還沒有回話。\n- 過去 24 小時內主動開口 1 次。/)
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：關了，謝謝' })
    assert.equal(mayInitiate(store).ok, true)
    // 以前的每 24 小時最多 3 次拿掉了：對方回話之後就可以再開口，次數列在念頭的輸入中，由個體自己判斷。
    for (let i = 0; i < 3; i++) {
      store.append({ kind: INITIATIVE_KIND, origin: 'self', data: { thought: id, session: 's1', intention: 'x', delivered: true } })
      store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：嗯' })
    }
    assert.equal(mayInitiate(store).ok, true)
    assert.match(thoughtInput(store).input, /之後對方回過話。\n- 過去 24 小時內主動開口 4 次。/)
  })
})

test('initiative relay: collects what the individual said in the turn its thought started, and only that turn', async () => {
  const { InitiativeRelay } = await import('../src/thought/thought.ts')
  const r = new InitiativeRelay()
  const say = (turn: number, text: string) => ({ type: 'assistant/message', data: { turn, message: { content: [{ type: 'reasoning', text: '…' }, { type: 'text', text }] } } })
  assert.equal(r.observe('s1', say(3, '沒有在等')), undefined, 'nothing expected yet')
  r.expect('s1', 'l:thought')
  assert.equal(r.observe('s2', { type: 'turn/start', data: { turn: 1 } }), undefined, 'another session')
  assert.equal(r.observe('s1', { type: 'turn/start', data: { turn: 4 } }), undefined)
  assert.equal(r.observe('s1', say(4, '我想到一個名字：柳丁。')), undefined)
  assert.equal(r.observe('s1', say(4, '你覺得呢？')), undefined)
  assert.deepEqual(r.observe('s1', { type: 'turn/end', data: { turn: 4 } }), { thought: 'l:thought', text: '我想到一個名字：柳丁。\n\n你覺得呢？' })
  assert.equal(r.observe('s1', { type: 'turn/end', data: { turn: 4 } }), undefined, 'delivered once')
})

test('temir-thought: automatic false only stops idle thoughts; the IM relay for initiatives is still registered (e2e-38)', async () => {
  const { apply } = await import('../src/thought/index.ts')
  const home = mkdtempSync(join(tmpdir(), 'temir-thought-'))
  const life = LifeStore.open(home)
  try {
    // 測試替身（單元測試專用）：只記下註冊了哪些事件的最小 ctx。
    const events: string[] = []
    const ctx = { life, on: (name: string) => void events.push(name), get: () => undefined, logger: () => ({ info() {}, warn() {}, error() {} }), effect() {} }
    apply(ctx as never, { automatic: false, imTargets: [{ botId: 'b', targetId: 't' }] })
    assert.deepEqual(events, ['session/event'])
    events.length = 0
    apply(ctx as never, { automatic: false })
    assert.deepEqual(events, [], 'no targets, no relay')
  } finally {
    life.close()
    rmSync(home, { recursive: true, force: true })
  }
})
