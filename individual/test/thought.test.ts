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
import { hasPotential, parseThought, recordThought, renderThoughts, thoughtInput } from '../src/thought/thought.ts'

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

test('parseThought: nothing surfaces is a valid answer; fields are cleaned and bounded', () => {
  assert.deepEqual(parseThought('{"item":"","thought":"","release":false}'), { item: '', thought: '', feeling: '', significance: 'daily', release: false, intention: '', now: false })
  const t = parseThought('好的 {"item":"P1","thought":"我其實  在意他會不會怕","feeling":"有點擔心","significance":"notable","release":"true","intention":"下次先問他還怕不怕"}')
  assert.deepEqual([t?.item, t?.thought, t?.release, t?.significance], ['P1', '我其實 在意他會不會怕', false, 'notable'], 'release must be the boolean true')
  assert.equal(parseThought('沒有 JSON'), undefined)
})

test('a thought is a cycle that starts from an internal stimulus: it can release what surfaced, leave an intention, and record a feeling', () => {
  withStore((store) => {
    assert.equal(hasPotential(store), false, 'nothing held, no goals: nothing can surface')
    const promise = heldPromise(store)
    assert.equal(hasPotential(store), true)
    const { input, labels } = thoughtInput(store)
    assert.match(input, /\[P1\] 行動留下的懸念（[^）]+）：答應下次提醒對方問履歷/)
    assert.match(input, /## 最近一次對話\n對方說：我在考慮轉職\n我說：下次我提醒你問履歷/)
    assert.equal(recordThought(store, { item: '', thought: '', feeling: '', significance: 'daily', release: false, intention: '', now: false }, labels, 'm'), undefined, 'nothing surfaced: nothing written')
    assert.equal(recordThought(store, { item: 'P7', thought: 'x', feeling: '', significance: 'daily', release: true, intention: '', now: false }, labels, 'm'), undefined, 'an unknown label is not guessed')
    const id = store.transaction(() =>
      recordThought(store, { item: 'P1', thought: '他其實還沒決定要不要轉，我不該只惦記履歷', feeling: '有點擔心他', significance: 'notable', release: true, intention: '下次先問他還想不想轉職', now: false }, labels, 'm'),
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

test('a goal can surface but is not released by a thought (goals change through the goal tool or the integration)', () => {
  withStore((store) => {
    store.append({ kind: KIND.goalChange, origin: 'self', data: { goalId: 'g:1234abcd', text: '親自聞聞薄荷', status: 'active', reason: 'r' } })
    const { labels } = thoughtInput(store)
    const id = store.transaction(() => recordThought(store, { item: 'g:1234abcd', thought: '我還沒有機會聞薄荷', feeling: '', significance: 'daily', release: true, intention: '', now: false }, labels, 'm'))
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

test('initiative: a thought can decide to speak now; pacing allows no double-texting and at most a few per day', async () => {
  const { INITIATIVE_KIND, INITIATIVE_PER_DAY, initiativeNote, mayInitiate } = await import('../src/thought/thought.ts')
  assert.equal(parseThought('{"item":"P1","thought":"x","intention":"提醒他關火","now":"true"}')?.now, false, 'only the boolean true counts')
  withStore((store) => {
    heldPromise(store)
    const { labels } = thoughtInput(store)
    const id = store.transaction(() => recordThought(store, { item: 'P1', thought: '他說一分鐘後提醒他關火，已經過了', feeling: '', significance: 'daily', release: false, intention: '提醒他關火', now: true }, labels, 'm'))
    assert.equal((store.get(id!)!.data as ThoughtData).now, true)
    const quiet = store.transaction(() => recordThought(store, { item: 'P1', thought: '再等等', feeling: '', significance: 'daily', release: false, intention: '', now: true }, labels, 'm'))
    assert.equal((store.get(quiet!)!.data as ThoughtData).now, undefined, 'nothing to say: now is dropped')
    assert.match(initiativeNote('他說一分鐘後提醒他關火', '提醒他關火'), /^（這不是對方說的話：.*你決定現在主動對對方說：提醒他關火/su)
    const t0 = Date.now()
    assert.deepEqual(mayInitiate(store, t0), { ok: true })
    store.append({ kind: INITIATIVE_KIND, origin: 'self', data: { thought: id, session: 's1', intention: '提醒他關火', delivered: true } })
    assert.equal(mayInitiate(store, t0).ok, false, 'no second initiative before the other replies')
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：關了，謝謝' })
    assert.equal(mayInitiate(store, t0).ok, true)
    for (let i = 1; i < INITIATIVE_PER_DAY; i++) {
      store.append({ kind: INITIATIVE_KIND, origin: 'self', data: { thought: id, session: 's1', intention: 'x', delivered: true } })
      store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：嗯' })
    }
    assert.match(mayInitiate(store, t0).reason ?? '', /24 小時內已經主動開口/)
    assert.equal(mayInitiate(store, t0 + 25 * 3_600_000).ok, true, 'the limit is per 24 hours')
  })
})
