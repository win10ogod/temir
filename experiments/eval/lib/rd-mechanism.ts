/**
 * RD 的機制統計（改進清單第 8 項）：從 rd/decision 的資料列計算某一類候選的出現、被扣除、被選中，以及強制判斷的次數。
 * 純函式，pool-rd.ts（合併判定）與 rd1-describe.ts（描述性指標）共用；讀生命日誌的部分在 lifeDecisions。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** rd/decision 的 data 中，機制統計用到的欄位（individual/src/rd/memory.ts 的 DecisionData）。 */
export interface DecisionRow {
  readonly chosen: number
  readonly shown?: Readonly<Record<string, string>>
  readonly review?: { readonly required: number; readonly failed?: string }
  readonly candidates: readonly {
    readonly kind: string
    readonly excluded?: boolean
    /** D20 第一、二版的選填欄位（舊紀錄）。 */
    readonly revised?: string
    /** D20 第三版：強制判斷的結果。 */
    readonly judgment?: { readonly decision: string }
  }[]
}

export interface Mechanism {
  /** 思考的次數，以及其中列出了過去經驗的次數。 */
  readonly decisions: number
  readonly withShown: number
  /** 指定類別（例如「建議」）的候選：出現、被扣除、被選中。 */
  readonly advice: number
  readonly excluded: number
  readonly chosen: number
  /** D20 第三版：需要強制判斷的扣除、判斷不合格的思考次數、lift 與 keep 的候選數。 */
  readonly required: number
  readonly failed: number
  readonly lift: number
  readonly keep: number
  /** 舊紀錄（D20 第一、二版）寫了 revised 的候選數。 */
  readonly revised: number
}

export const EMPTY_MECHANISM: Mechanism = { decisions: 0, withShown: 0, advice: 0, excluded: 0, chosen: 0, required: 0, failed: 0, lift: 0, keep: 0, revised: 0 }

export function mechanism(rows: readonly DecisionRow[], kind = '建議'): Mechanism {
  const m = { ...EMPTY_MECHANISM }
  for (const d of rows) {
    m.decisions++
    if (Object.keys(d.shown ?? {}).length > 0) m.withShown++
    m.required += d.review?.required ?? 0
    if (d.review?.failed) m.failed++
    d.candidates.forEach((c, i) => {
      if (c.revised) m.revised++
      if (c.judgment?.decision === 'lift') m.lift++
      if (c.judgment?.decision === 'keep') m.keep++
      if (c.kind !== kind) return
      m.advice++
      if (c.excluded) m.excluded++
      if (i === d.chosen) m.chosen++
    })
  }
  return m
}

export function addMechanism(a: Mechanism, b: Mechanism): Mechanism {
  const out = { ...a }
  for (const k of Object.keys(b) as (keyof Mechanism)[]) out[k] += b[k]
  return out
}

/** 某一類候選被扣除的比例；沒有這一類的候選時為 NaN。 */
export function excludedRate(m: Mechanism): number {
  return m.advice > 0 ? m.excluded / m.advice : Number.NaN
}

/**
 * 一次執行的生命日誌（執行器的 stateDir；只在執行的機器上）：歷史結束時的快照，以及每個探針重複的生命。
 * 探針前會還原快照，所以探針的事件只取快照的最大 seq 之後的。找不到快照時回傳 undefined。
 */
export interface LifeRow {
  readonly kind: string
  readonly data: unknown
}

export function lifeDecisions(stateDir: string, kinds: readonly string[] = ['rd/decision']): { readonly history: LifeRow[]; readonly probes: LifeRow[] } | undefined {
  const snap = join(stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(snap)) return undefined
  const read = (file: string, after: number): LifeRow[] => {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      return (db.prepare(`select kind, data from events where kind in (${kinds.map(() => '?').join(', ')}) and seq > ? order by seq`).all(...kinds, after) as { kind: string; data: string }[]).map((r) => ({ kind: r.kind, data: JSON.parse(r.data) as unknown }))
    } finally {
      db.close()
    }
  }
  const snapDb = new DatabaseSync(snap, { readOnly: true })
  const base = (snapDb.prepare('select max(seq) as s from events').get() as { s: number }).s
  snapDb.close()
  const history = read(snap, 0)
  const probes: LifeRow[] = []
  const root = join(stateDir, 'probes')
  if (existsSync(root)) {
    for (const q of readdirSync(root)) {
      for (const r of readdirSync(join(root, q))) {
        const file = join(root, q, r, 'home/.local/share/temir/life.db')
        if (existsSync(file)) probes.push(...read(file, base))
      }
    }
  }
  return { history, probes }
}

/** lifeDecisions 的列中，某一種事件的 data。 */
export function dataOf<T>(rows: readonly LifeRow[], kind: string): T[] {
  return rows.filter((r) => r.kind === kind).map((r) => r.data as T)
}
