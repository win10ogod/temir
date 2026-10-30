/**
 * 技能與插件的增量投影（skill.ts 的 ownSkills、plugin.ts 的 ownPlugins；改進清單第 7 項的延續）。
 * 等價：隨機追加事件（含 transaction 回滾、另一個讀取的實例）之間反覆查詢，結果與原本每次重讀全表的實作完全相同。
 * 原本的實作逐字保留在這個檔案中（reference*），作為參照。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore, type LifeEvent } from '../src/life/store.ts'
import { PLUGIN_KIND, ownPlugins, type OwnPlugin, type PluginApprovalData, type PluginProposalData } from '../src/plugin/plugin.ts'
import { SKILL_KIND, ownSkills, type ProposalData, type Skill, type SkillDecisionData } from '../src/skill/skill.ts'

// ── 原本的實作（2026-10-30 之前，逐字保留，作為參照） ──

function referenceOwnSkills(life: LifeStore): Skill[] {
  const current = new Map<string, Omit<Skill, 'uses'>>()
  for (const event of life.all(SKILL_KIND.decision)) {
    const d = event.data as SkillDecisionData
    if (d.verdict !== 'adopt') continue
    if (d.op === 'retire') {
      current.delete(d.name)
      continue
    }
    if (!d.skill) continue
    const proposal = life.get(d.proposal)?.data as ProposalData | undefined
    current.set(d.skill.name, { ...d.skill, version: event.id, adoptedAt: event.ts, purpose: proposal?.purpose ?? '' })
  }
  const uses = new Map<string, number>()
  for (const event of life.all(SKILL_KIND.use)) {
    const name = (event.data as { name?: string }).name ?? ''
    uses.set(name, (uses.get(name) ?? 0) + 1)
  }
  return [...current.values()].map((s) => ({ ...s, uses: uses.get(s.name) ?? 0 }))
}

function referenceOwnPlugins(life: LifeStore): OwnPlugin[] {
  const current = new Map<string, LifeEvent>()
  for (const event of life.all(PLUGIN_KIND.proposal)) {
    const p = event.data as PluginProposalData
    if (p.op === 'retire') current.delete(p.name)
    else current.set(p.name, event)
  }
  const approved = new Set(life.all(PLUGIN_KIND.approval).map((e) => (e.data as PluginApprovalData).proposal))
  return [...current.values()].map((event) => {
    const p = event.data as PluginProposalData
    return { name: p.name, purpose: p.purpose, code: p.code, sha256: p.sha256, version: event.id, approved: approved.has(event.id), writtenAt: event.ts }
  })
}

// ── 測試夾具 ──

/** 可重現的亂數（mulberry32）。 */
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

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-projection-skills-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const NAMES = ['listen-first', 'plan-week', 'recall-people']
const PLUGINS = ['note-taker', 'timer', 'weather']

/** 隨機追加一個技能或插件的事件：提案、決定（採用、不採用、移除）、使用、插件的提案與核准。 */
function randomAppend(store: LifeStore, r: () => number, proposals: string[], plugins: string[]): void {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
  const x = r()
  const name = pick(NAMES)
  const ops = ['add', 'modify', 'retire'] as const
  if (x < 0.2) {
    const data = { op: pick(ops), name, description: `d${Math.floor(r() * 9)}`, whenToUse: 'w', content: `c${Math.floor(r() * 9)}`, purpose: `目的 ${Math.floor(r() * 9)}`, evidence: [], source: 'review' }
    proposals.push(store.append({ kind: SKILL_KIND.proposal, origin: 'self', data }).id)
  } else if (x < 0.45 && proposals.length > 0) {
    const op = pick(ops)
    const verdict = r() < 0.7 ? 'adopt' : pick(['reject', 'revise', 'unprobed'] as const)
    const skill = op === 'retire' || r() < 0.1 ? undefined : { name, description: `d${Math.floor(r() * 9)}`, whenToUse: 'w', content: `c${Math.floor(r() * 9)}` }
    const data = { proposal: pick(proposals), op, name, verdict, reasons: [], ...(skill ? { skill } : {}), gate: 'none', costChars: 0, probes: [] }
    store.append({ kind: SKILL_KIND.decision, origin: 'self', data })
  } else if (x < 0.6) {
    store.append({ kind: SKILL_KIND.use, origin: 'self', data: r() < 0.1 ? {} : { name } })
  } else if (x < 0.8) {
    const plugin = pick(PLUGINS)
    const data: PluginProposalData = { op: r() < 0.15 ? 'retire' : 'add', name: plugin, purpose: `p${Math.floor(r() * 9)}`, code: `export default ${Math.floor(r() * 9)}`, sha256: 'x' } as PluginProposalData
    plugins.push(store.append({ kind: PLUGIN_KIND.proposal, origin: 'self', data }).id)
  } else if (plugins.length > 0) {
    store.append({ kind: PLUGIN_KIND.approval, origin: 'self', data: { proposal: pick(plugins), name: 'n', sha256: 'x' } })
  }
}

/** 比較過程中看過的：有採用中的技能、有使用次數、有核准過的插件（確認隨機的生命不是空的）。 */
const seen = { skills: false, uses: false, approved: false }

function sameAsReference(store: LifeStore, label: string): void {
  const skills = ownSkills(store)
  const plugins = ownPlugins(store)
  assert.deepEqual(skills, referenceOwnSkills(store), `${label}: ownSkills`)
  assert.deepEqual(plugins, referenceOwnPlugins(store), `${label}: ownPlugins`)
  seen.skills ||= skills.length > 0
  seen.uses ||= skills.some((s) => s.uses > 0)
  seen.approved ||= plugins.some((p) => p.approved)
}

test('skills and plugins: the incremental projections equal the full-table reference, also after rollbacks', () =>
  withStore((store) => {
    for (const seed of [11, 12, 13]) {
      const r = random(seed)
      const proposals: string[] = []
      const plugins: string[] = []
      for (let i = 0; i < 200; i++) {
        randomAppend(store, r, proposals, plugins)
        if (r() < 0.35) sameAsReference(store, `seed ${seed} step ${i}`)
        if (r() < 0.04) {
          assert.throws(() =>
            store.transaction(() => {
              randomAppend(store, r, [...proposals], [...plugins])
              randomAppend(store, r, [...proposals], [...plugins])
              sameAsReference(store, `seed ${seed} step ${i} inside a transaction`)
              throw new Error('rollback')
            }),
          )
          sameAsReference(store, `seed ${seed} step ${i} after rollback`)
        }
      }
      sameAsReference(store, `seed ${seed} end`)
    }
    assert.deepEqual(seen, { skills: true, uses: true, approved: true }, 'the random lives had adopted skills, uses and approved plugins')
  }))

test('skills and plugins: a second store instance on the same life log sees the same projection', () =>
  withStore((store) => {
    const r = random(21)
    const proposals: string[] = []
    const plugins: string[] = []
    for (let i = 0; i < 60; i++) randomAppend(store, r, proposals, plugins)
    const other = LifeStore.openReadOnly(join(store.path, '..'))!
    try {
      sameAsReference(other, 'reader before')
      for (let i = 0; i < 60; i++) randomAppend(store, r, proposals, plugins)
      sameAsReference(other, 'reader after the writer appended')
    } finally {
      other.close()
    }
  }))
