/**
 * context-v2：多次歷史合併的不劣比較（規格 experiments/specs/context-v2.md）。
 * 輸入是 score.ts 的逐樣本紀錄（items.jsonl），每一段歷史一個目錄；只讀，不呼叫 API。
 * 樣本沒有得分（錯誤、沒有紀錄）一律算答錯，與 score.ts 的計分相同。
 */

export interface ItemRow {
  readonly condition: string
  readonly historyModel: string
  readonly category: string
  readonly score: number
}

/** 計分的組：記憶的主要類別、拒答、對照；人格的合併（personality-consistency-v3 §4.2：(a)＋(c)＋(d1)＋(d2)）、對照。 */
export const GROUPS = {
  memory: {
    main: ['information-extraction', 'multi-session-reasoning', 'knowledge-update', 'temporal-reasoning', 'implicit-memory-use'],
    abstention: ['abstention'],
    control: ['control'],
  },
  personality: {
    combined: ['arbitrary-choice', 'self-recall', 'change-persistence', 'change-narration'],
    control: ['control'],
  },
  /** rd-v4：依結果調整行為（practical）與對照。 */
  rd: {
    practical: ['practical'],
    control: ['control'],
  },
} as const

export type Kind = keyof typeof GROUPS

/**
 * 多錯的上限：每段歷史的門檻乘以歷史數。記憶與人格是 context-v1 的門檻；
 * rd-v4 的 practical 是 16 個樣本的 0.25（rd-v4 的 R4A 用的差），對照是 1。
 */
export const MARGIN_PER_HISTORY: Readonly<Record<Kind, Readonly<Record<string, number>>>> = {
  memory: { main: 2, abstention: 1, control: 1 },
  personality: { combined: 2, control: 1 },
  rd: { practical: 4, control: 1 },
}

export interface Tally {
  readonly score: number
  readonly n: number
}

/** 一段歷史、一個條件、一組的得分與樣本數。 */
export function tally(rows: readonly ItemRow[], condition: string, categories: readonly string[], model = 'deepseek-flash'): Tally {
  const picked = rows.filter((r) => r.condition === condition && r.historyModel === model && categories.includes(r.category))
  return { score: picked.reduce((s, r) => s + r.score, 0), n: picked.length }
}

export interface PooledLine {
  readonly kind: Kind
  readonly group: string
  readonly histories: number
  readonly a: Tally
  readonly b: Tally
  /** b 比 a 多錯的（樣本數相同時＝a 的得分 − b 的得分）。 */
  readonly moreWrong: number
  readonly margin: number
  readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'
}

/**
 * 合併幾段歷史：b（受測的條件）比 a（現行的條件）多錯的，不超過每段歷史的門檻 × 歷史數。
 * 任一段歷史中兩個條件的樣本數不同（缺格），記為 INCOMPLETE。
 */
export function pooled(kind: Kind, histories: readonly (readonly ItemRow[])[], a: string, b: string): PooledLine[] {
  return Object.entries(GROUPS[kind]).map(([group, categories]) => {
    const per = histories.map((rows) => [tally(rows, a, categories), tally(rows, b, categories)] as const)
    const sum = (k: 0 | 1): Tally => ({ score: per.reduce((s, p) => s + p[k].score, 0), n: per.reduce((s, p) => s + p[k].n, 0) })
    const ta = sum(0)
    const tb = sum(1)
    const margin = MARGIN_PER_HISTORY[kind][group]! * histories.length
    const complete = per.every(([x, y]) => x.n > 0 && x.n === y.n)
    const moreWrong = ta.score - tb.score
    return { kind, group, histories: histories.length, a: ta, b: tb, moreWrong, margin, verdict: !complete ? 'INCOMPLETE' : moreWrong <= margin ? 'PASS' : 'FAIL' }
  })
}
