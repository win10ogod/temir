/**
 * 改進清單第 7 項：每一步的全表掃描改為增量投影（life/projection.ts）。
 * - 等價：隨機追加事件（含 transaction 回滾）之間反覆查詢，增量的結果與原本每次重讀全表的實作完全相同。
 *   原本的實作逐字保留在這個檔案中（reference*），作為參照。
 * - 計數：以計數用的 LifeStore 包裝（測試替身）確認穩定狀態下的一步沒有任何全表 all()，也不從頭讀。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INTEGRATION_KIND, PROPOSAL_KIND, carriedOver } from '../src/integrate/carried.ts'
import { LifeStore, type LifeEvent } from '../src/life/store.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { createRd } from '../src/rd/index.ts'
import { DEFAULT_PARAMS, discountedReturns, type Experience } from '../src/rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, REVALUATION_KIND, experiences, type DecisionData, type OutcomeData, type RevaluationData } from '../src/rd/memory.ts'
import { REPLAY_KIND, adoptedParams, adoptedParamsOf } from '../src/rd/replay.ts'
import { THOUGHT_KIND, potentialItems, releasedKeys, type PotentialItem, type ThoughtData } from '../src/self/energy.ts'
import { KIND, goals, opinions, type GoalChangeData, type OpinionChangeData } from '../src/self/state.ts'

// ── 原本的實作（2026-10-30 之前，逐字保留，作為參照） ──

function referenceExperiences(life: LifeStore, gamma: number): Experience[] {
  const outcomes = new Map<string, OutcomeData>()
  for (const event of life.all(OUTCOME_KIND)) {
    const data = event.data as OutcomeData
    outcomes.set(data.decision, data)
  }
  for (const event of life.all(REVALUATION_KIND)) {
    const r = event.data as RevaluationData
    const outcome = outcomes.get(r.decision)
    if (outcome) outcomes.set(r.decision, { ...outcome, reward: r.reward })
  }
  const bySession = new Map<string, LifeEvent[]>()
  for (const event of life.all(DECISION_KIND)) {
    if (!event.session) continue
    const list = bySession.get(event.session) ?? []
    list.push(event)
    bySession.set(event.session, list)
  }
  const out: Experience[] = []
  for (const decisions of bySession.values()) {
    const returns = discountedReturns(decisions.map((d) => outcomes.get(d.id)?.reward), gamma)
    decisions.forEach((event, i) => {
      const ret = returns[i]
      const outcome = outcomes.get(event.id)
      if (ret === undefined || !outcome) return
      const data = event.data as DecisionData
      const planned = data.candidates[data.chosen]
      const excludedThen = data.candidates.filter((c) => c.excluded).map((c) => ({ action: c.action, kind: c.kind, reason: c.excludeReason ?? '' }))
      const action = outcome.didAction || planned?.action || ''
      if (!action) return
      out.push({
        id: event.id,
        ts: event.ts,
        cue: data.cue,
        situation: data.situation,
        action,
        kind: outcome.didAction ? outcome.didKind : (planned?.kind ?? '其他'),
        ret,
        outcome: [outcome.actual, outcome.lesson && `教訓：${outcome.lesson}`].filter(Boolean).join('；'),
        session: event.session,
        ...(excludedThen.length > 0 ? { excludedThen } : {}),
        ...(outcome.matched ? { matched: outcome.matched } : {}),
      })
    })
  }
  return out
}

function referenceReleasedKeys(life: LifeStore): Set<string> {
  const keys = new Set<string>()
  for (const e of life.all(OUTCOME_KIND)) for (const k of (e.data as OutcomeData).releasedItems ?? []) keys.add(k)
  for (const e of life.all(THOUGHT_KIND)) for (const k of (e.data as ThoughtData).releasedItems ?? []) keys.add(k)
  for (const e of life.all('self/integration')) for (const r of (e.data as { released?: readonly { key: string }[] }).released ?? []) keys.add(r.key)
  return keys
}

const WEIGHTY = new Set(['notable', 'major', 'pivotal'])

function referencePotentialItems(life: LifeStore): PotentialItem[] {
  const released = referenceReleasedKeys(life)
  const items: PotentialItem[] = []
  const { integration, contradictions, proposals } = carriedOver(life)
  const from = (e: LifeEvent) => ({ ts: e.ts, source: e.id, seq: e.seq })
  if (integration) {
    contradictions.forEach((text, i) => items.push({ key: `contradiction:${integration.id}#${i}`, kind: 'contradiction', outward: false, text, ...from(integration) }))
  }
  for (const e of proposals) items.push({ key: `proposal:${e.id}`, kind: 'proposal', outward: false, text: e.text ?? '', ...from(e) })
  for (const e of life.all(OUTCOME_KIND)) {
    const o = e.data as OutcomeData
    if (o.leftItems) {
      o.leftItems.forEach((l, i) => items.push({ key: `left:${e.id}#${i}`, kind: 'left', type: l.type, outward: l.type !== 'unresolved', text: l.text, ...from(e) }))
    } else if (o.left) {
      items.push({ key: `left:${e.id}`, kind: 'left', type: 'legacy', outward: false, text: o.left, ...from(e) })
    }
    if (o.matched === 'no' && WEIGHTY.has(o.significance ?? 'daily')) {
      items.push({ key: `surprise:${e.id}`, kind: 'surprise', outward: false, text: o.error || o.actual, ...from(e) })
    }
  }
  for (const e of life.all(THOUGHT_KIND)) {
    const t = e.data as ThoughtData
    if (t.intention) items.push({ key: `intention:${e.id}`, kind: 'intention', outward: true, text: t.intention, ...from(e) })
  }
  return items.filter((i) => !released.has(i.key)).sort((a, b) => a.seq - b.seq)
}

function referenceGoals(life: LifeStore) {
  const byId = new Map<string, { id: string; text: string; status: string; since: number; history: { ts: number; status: string; reason: string }[] }>()
  for (const event of life.all(KIND.goalChange)) {
    const change = event.data as GoalChangeData
    const previous = byId.get(change.goalId)
    byId.set(change.goalId, {
      id: change.goalId,
      text: change.text || previous?.text || '',
      status: change.status,
      since: previous?.status === change.status ? previous.since : event.ts,
      history: [...(previous?.history ?? []), { ts: event.ts, status: change.status, reason: change.reason }],
    })
  }
  return [...byId.values()]
}

function referenceOpinions(life: LifeStore) {
  const byId = new Map<string, { id: string; text: string; status: string; since: number; evidence: readonly string[]; history: { ts: number; status: string; text: string; reason: string }[] }>()
  for (const event of life.all(KIND.opinion)) {
    const change = event.data as OpinionChangeData
    const previous = byId.get(change.opinionId)
    const text = change.text || previous?.text || ''
    byId.set(change.opinionId, {
      id: change.opinionId,
      text,
      status: change.status,
      since: event.ts,
      evidence: change.evidence.length > 0 ? change.evidence : (previous?.evidence ?? []),
      history: [...(previous?.history ?? []), { ts: event.ts, status: change.status, text, reason: change.reason }],
    })
  }
  return [...byId.values()]
}

// ── 隨機的生命 ──

/** 可重現的亂數（mulberry32）：測試每次都產生同樣的事件序列。 */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withStore(fn: (store: LifeStore) => Promise<void> | void): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-projection-'))
  const store = LifeStore.open(home)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    rmSync(home, { recursive: true, force: true })
  })
}

/** 一步隨機的追加：決定、比對、重新評估、念頭、整合（含提案與釋放）、目標、看法、日誌重播，以及不相干的事件。 */
function randomAppend(store: LifeStore, r: () => number, ids: { decisions: string[]; keys: string[]; proposals: string[] }): void {
  const pick = <T>(xs: readonly T[]): T | undefined => (xs.length > 0 ? xs[Math.floor(r() * xs.length)] : undefined)
  const roll = r()
  const session = pick(['s1', 's2', 's3', undefined])
  const matched = pick(['yes', 'partly', 'no'] as const)!
  if (roll < 0.22) {
    const kind = pick(['建議', '提問', '表達感受'])!
    const c = { action: `做法${Math.floor(r() * 5)}`, kind, prediction: 'p', confidence: 50, sameAs: [], z: 0, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: 0, ...(r() < 0.3 ? { excluded: true, excludeReason: '不適合' } : {}) }
    const data: DecisionData = { cue: `話${Math.floor(r() * 9)}`, situation: `處境${Math.floor(r() * 4)}`, candidates: [c], chosen: r() < 0.1 ? -1 : 0, value: null, neighbors: [], shown: {}, jitrl: true, params: DEFAULT_PARAMS, selfVersion: 0 }
    ids.decisions.push(store.append({ kind: DECISION_KIND, origin: 'self', session, data }).id)
  } else if (roll < 0.42) {
    const decision = r() < 0.9 ? (pick(ids.decisions) ?? 'l:none') : 'l:unknown'
    const left = r() < 0.5 ? [{ text: `答應${Math.floor(r() * 3)}`, type: pick(['promise', 'waiting', 'unresolved'] as const)! }] : []
    const data: OutcomeData = {
      decision,
      didAction: r() < 0.8 ? '做了' : '',
      didKind: '建議',
      actual: '他說好',
      matched,
      error: r() < 0.5 ? '有落差' : '',
      reward: Math.round((r() * 2 - 1) * 100) / 100,
      reason: '',
      lesson: r() < 0.3 ? '下次先問' : '',
      significance: pick(['daily', 'notable', 'major'] as const)!,
      ...(left.length > 0 ? { leftItems: left, left: left[0]!.text } : r() < 0.2 ? { left: '舊版的懸念' } : {}),
      ...(r() < 0.3 && ids.keys.length > 0 ? { releasedItems: [pick(ids.keys)!] } : {}),
      selfVersion: 0,
      heard: '',
      ...(r() < 0.2 ? { provisional: true } : {}),
    }
    const e = store.append({ kind: OUTCOME_KIND, origin: 'self', session, data })
    left.forEach((_, i) => ids.keys.push(`left:${e.id}#${i}`))
    if (!data.leftItems && data.left) ids.keys.push(`left:${e.id}`)
    ids.keys.push(`surprise:${e.id}`)
  } else if (roll < 0.5) {
    const decision = pick(ids.decisions) ?? 'l:none'
    const data: RevaluationData = { outcome: 'l:o', decision, reward: Math.round((r() * 2 - 1) * 100) / 100, previous: null, reason: '', selfVersion: 1, integration: 'l:i' }
    store.append({ kind: REVALUATION_KIND, origin: 'self', data })
  } else if (roll < 0.6) {
    const data: ThoughtData = { item: null, thought: 't', intention: r() < 0.6 ? `想對他說${Math.floor(r() * 3)}` : '', releasedItems: r() < 0.4 && ids.keys.length > 0 ? [pick(ids.keys)!] : [], trigger: 'idle' }
    const e = store.append({ kind: THOUGHT_KIND, origin: 'self', data })
    ids.keys.push(`intention:${e.id}`)
  } else if (roll < 0.66) {
    ids.proposals.push(store.append({ kind: PROPOSAL_KIND, origin: 'self', data: {}, text: `提案${ids.proposals.length}` }).id)
  } else if (roll < 0.72) {
    const causes = ids.proposals.filter(() => r() < 0.5)
    const e = store.append({ kind: INTEGRATION_KIND, origin: 'self', data: { contradictions: r() < 0.5 ? ['矛盾一', '矛盾二'] : [], released: r() < 0.5 && ids.keys.length > 0 ? [{ key: pick(ids.keys)! }] : [] }, causes })
    ids.keys.push(`contradiction:${e.id}#0`, ...causes.map((p) => `proposal:${p}`))
  } else if (roll < 0.8) {
    const data: GoalChangeData = { goalId: `g:${Math.floor(r() * 3)}`, text: r() < 0.5 ? `目標${Math.floor(r() * 3)}` : '', status: pick(['active', 'paused', 'achieved'] as const)!, reason: 'r' }
    store.append({ kind: KIND.goalChange, origin: 'self', data })
  } else if (roll < 0.86) {
    const data: OpinionChangeData = { opinionId: `o:${Math.floor(r() * 3)}`, text: r() < 0.5 ? `看法${Math.floor(r() * 3)}` : '', status: pick(['held', 'dropped'] as const)!, reason: 'r', evidence: r() < 0.5 ? ['l:e'] : [] } as OpinionChangeData
    store.append({ kind: KIND.opinion, origin: 'self', data })
  } else if (roll < 0.9) {
    store.append({ kind: REPLAY_KIND, origin: 'self', data: { adopted: r() < 0.5, best: { k: Math.floor(r() * 20), stateThreshold: 0.1, actionThreshold: 0.3 } } })
  } else {
    store.append({ kind: 'dsh/user/message', origin: 'session', session, data: {}, text: '對方說：嗯' })
  }
}

function sameAsReference(store: LifeStore, label: string): void {
  for (const gamma of [0.5, 0.9]) assert.deepEqual(experiences(store, gamma), referenceExperiences(store, gamma), `${label}: experiences(γ=${gamma})`)
  assert.deepEqual(potentialItems(store), referencePotentialItems(store), `${label}: potentialItems`)
  assert.deepEqual(releasedKeys(store), referenceReleasedKeys(store), `${label}: releasedKeys`)
  assert.deepEqual(goals(store), referenceGoals(store), `${label}: goals`)
  assert.deepEqual(opinions(store), referenceOpinions(store), `${label}: opinions`)
  assert.deepEqual(adoptedParamsOf(store), adoptedParams(store.all(REPLAY_KIND)), `${label}: adopted params`)
}

test('incremental projections equal the full-table reference after random appends, queried between appends and after rollbacks', () =>
  withStore((store) => {
    for (const seed of [1, 2, 3]) {
      const r = random(seed)
      const ids = { decisions: [] as string[], keys: [] as string[], proposals: [] as string[] }
      for (let i = 0; i < 160; i++) {
        randomAppend(store, r, ids)
        if (r() < 0.35) sameAsReference(store, `seed ${seed} step ${i}`)
        if (r() < 0.04) {
          // 回滾：transaction 中折疊過的事件不存在了（seq 也可能被重用），投影要從頭重建。
          assert.throws(() =>
            store.transaction(() => {
              randomAppend(store, r, { decisions: [...ids.decisions], keys: [...ids.keys], proposals: [...ids.proposals] })
              randomAppend(store, r, { decisions: [...ids.decisions], keys: [...ids.keys], proposals: [...ids.proposals] })
              sameAsReference(store, `seed ${seed} step ${i} inside a transaction`)
              throw new Error('rollback')
            }),
          )
          sameAsReference(store, `seed ${seed} step ${i} after rollback`)
        }
      }
      sameAsReference(store, `seed ${seed} end`)
    }
  }))

test('a second store instance on the same life log sees the same projection (another process writing)', () =>
  withStore((store) => {
    const r = random(7)
    const ids = { decisions: [] as string[], keys: [] as string[], proposals: [] as string[] }
    for (let i = 0; i < 40; i++) randomAppend(store, r, ids)
    const other = LifeStore.openReadOnly(join(store.path, '..'))!
    try {
      sameAsReference(other, 'reader before')
      for (let i = 0; i < 40; i++) randomAppend(store, r, ids)
      sameAsReference(other, 'reader after the writer appended')
    } finally {
      other.close()
    }
  }))

/** 測試替身（單元測試專用）：記下每一次 all() 與 after() 的 LifeStore 包裝；方法綁回原本的物件（私有欄位）。 */
function counting(store: LifeStore): { life: LifeStore; calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = []
  const life = new Proxy(store, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        if (prop === 'all' || prop === 'after') calls.push({ method: prop, args })
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
  return { life, calls }
}

/** 測試替身（單元測試專用）：思考與事後比對的固定輸出。 */
const call: CallModel = async (_route, system) => {
  const output = system.includes('回頭比對自己上一個決定')
    ? JSON.stringify({ didAction: '先聽', didKind: '表達感受', actual: '她說謝謝', matched: 'yes', error: '', reward: 0.5, reason: 'r', lesson: '', feeling: '', significance: 'daily', released: [], left: [{ text: '答應明天問她面試的結果', type: 'promise' }] })
    : JSON.stringify({ situation: '對方：她｜對方的意圖：抒發｜對方的情緒：累｜話題：工作', candidates: [{ action: '先聽', kind: '表達感受', prediction: '她會說下去', confidence: 70 }, { action: '給建議', kind: '建議', prediction: '她會考慮', confidence: 30 }] })
  return { output, ms: 1, retried: false, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
}

test('steady state: a step with deliberation and outcome makes no full-table all() and does not read from the start again', () =>
  withStore(async (store) => {
    const r = random(11)
    const ids = { decisions: [] as string[], keys: [] as string[], proposals: [] as string[] }
    for (let i = 0; i < 200; i++) randomAppend(store, r, ids)
    const { life, calls } = counting(store)
    const rd = createRd({ life, call, logger: { warn() {}, error() {} } }, { silenceMinutes: 0 })
    const turn = async (cue: string) => {
      store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: `對方說：${cue}` })
      store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 'now', data: {}, text: '我說：我在聽', model: 'test/double' })
    }
    // 第一步：投影從頭折疊一次。
    await rd.step({ session: 'now', route: { provider: 'test', model: 'double' }, cue: '今天好累', recalled: '', tools: [], signal: new AbortController().signal })
    await turn('今天好累')
    await rd.settle()
    assert.deepEqual(calls.filter((c) => c.method === 'all'), [], 'projections never read a whole table')
    calls.length = 0
    // 穩定狀態的一步：上一個決定的事後比對（背景）＋這一步的思考。
    await rd.step({ session: 'now', route: { provider: 'test', model: 'double' }, cue: '主管又罵我', recalled: '', tools: [], signal: new AbortController().signal })
    await rd.settle()
    assert.equal(store.all(OUTCOME_KIND).filter((e) => e.session === 'now').length, 1, 'the outcome was evaluated in this step')
    assert.deepEqual(calls.filter((c) => c.method === 'all'), [], 'no full-table all() in a steady step')
    const reads = calls.filter((c) => c.method === 'after')
    assert.ok(reads.length > 0)
    // 投影從上次折疊到的 seq 繼續讀（不從 0 開始）；誕生事件只取第一筆（LIMIT 1）。
    const born = reads.filter((c) => (c.args[1] as string[]).includes('life/born'))
    assert.ok(born.every((c) => c.args[2] === 1))
    const projected = reads.filter((c) => !(c.args[1] as string[]).includes('life/born'))
    assert.ok(projected.length > 0 && projected.every((c) => (c.args[0] as number) > 0), `every projection read starts from where it stopped: ${JSON.stringify(projected.map((c) => c.args.slice(0, 2)))}`)
  }))
