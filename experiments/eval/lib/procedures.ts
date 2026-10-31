/**
 * 做法的演化（procedures-v1 規格；hypotheses.md H-P 的可觀測量）：每個個體的整合、做法的提案、閘門的判斷、採用的版本，
 * 以及不同個體之間做法的分化。純函式：輸入是一個生命中依 seq 排序的事件（rd-mechanism.ts 的 lifeGroups 的 history），只讀。
 */
import { DEFAULT_PROCEDURES, PROCEDURE_NAMES, type ProcedureName } from '../../../individual/src/self/procedure.ts'
import type { LifeRow } from './rd-mechanism.ts'

export const PROCEDURE_KINDS = ['self/integration', 'self/integration-end', 'self/procedure', 'self/procedure-proposal', 'self/procedure-decision'] as const

export interface Evolution {
  integrations: number
  integrationEnds: number
  /** 做法的提案：整合時提出的（依做法）、合成時修改的版本。 */
  proposals: Partial<Record<ProcedureName, number>>
  composed: number
  /** 閘門的判斷：verdict 的分布、有雜訊基準的判斷中至少一個理由大於雜訊的、模型呼叫與重用的合計。 */
  verdicts: Record<string, number>
  noiseDecisions: number
  beyondNoise: number
  gateCalls: number
  gateReused: number
  /** 整合時提出、到最後都沒有決定的提案。 */
  undecided: number
  /** 最後的做法：版本與全文；採用的修改（第 2 版以後）與字數增減。 */
  final: Record<ProcedureName, { readonly version: number; readonly text: string }>
  adopted: { readonly name: ProcedureName; readonly version: number; readonly costChars: number }[]
}

interface ProposalLike {
  readonly name: ProcedureName
  readonly source?: string
}
interface DecisionLike {
  readonly proposal: string
  readonly name: ProcedureName
  readonly verdict: string
  readonly gate?: string
  readonly reasons?: readonly { readonly beyondNoise?: boolean }[]
  readonly calls?: number
  readonly reused?: number
  readonly costChars?: number
}
interface VersionLike {
  readonly name: ProcedureName
  readonly version: number
  readonly text: string
  readonly source?: string
  readonly proposal?: string
}

/** rows 要帶 id（proposal 與 decision 的對應）；lifeGroups 不給 id，所以這裡另外接受 { id?, kind, data }。 */
export function evolution(rows: readonly (LifeRow & { readonly id?: string })[]): Evolution {
  const e: Evolution = {
    integrations: 0, integrationEnds: 0, proposals: {}, composed: 0, verdicts: {}, noiseDecisions: 0, beyondNoise: 0, gateCalls: 0, gateReused: 0, undecided: 0,
    final: Object.fromEntries(PROCEDURE_NAMES.map((n) => [n, { version: 1, text: DEFAULT_PROCEDURES[n] }])) as Evolution['final'],
    adopted: [],
  }
  const fromIntegration = new Set<string>()
  const decided = new Set<string>()
  const costOf = new Map<string, number>()
  for (const row of rows) {
    if (row.kind === 'self/integration') e.integrations++
    else if (row.kind === 'self/integration-end') e.integrationEnds++
    else if (row.kind === 'self/procedure-proposal') {
      const p = row.data as ProposalLike
      if (p.source === 'compose') e.composed++
      else {
        e.proposals[p.name] = (e.proposals[p.name] ?? 0) + 1
        if (row.id) fromIntegration.add(row.id)
      }
    } else if (row.kind === 'self/procedure-decision') {
      const d = row.data as DecisionLike
      decided.add(d.proposal)
      e.verdicts[d.verdict] = (e.verdicts[d.verdict] ?? 0) + 1
      if (d.gate === 'noise') {
        e.noiseDecisions++
        if ((d.reasons ?? []).some((r) => r.beyondNoise === true)) e.beyondNoise++
      }
      e.gateCalls += d.calls ?? 0
      e.gateReused += d.reused ?? 0
      if (d.verdict === 'adopt') costOf.set(d.proposal, d.costChars ?? 0)
    } else if (row.kind === 'self/procedure') {
      const v = row.data as VersionLike
      e.final[v.name] = { version: v.version, text: v.text }
      if (v.source === 'self') e.adopted.push({ name: v.name, version: v.version, costChars: v.proposal ? (costOf.get(v.proposal) ?? 0) : 0 })
    }
  }
  e.undecided = [...fromIntegration].filter((id) => !decided.has(id)).length
  return e
}

/** 字元二元組（去掉空白）。 */
function bigrams(text: string): Set<string> {
  const s = text.replace(/\s+/gu, '')
  const out = new Set<string>()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  return out
}

export function similarity(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  if (x.size === 0 && y.size === 0) return 1
  let both = 0
  for (const g of x) if (y.has(g)) both++
  return both / (x.size + y.size - both)
}

/** 與第一版相比新增的行（修改的內容）。 */
export function addedLines(name: ProcedureName, text: string): string {
  const base = new Set(DEFAULT_PROCEDURES[name].split('\n').map((l) => l.trim()))
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !base.has(l))
    .join('\n')
}

export interface Divergence {
  readonly name: ProcedureName
  /** 修改過這個做法的個體。 */
  readonly individuals: readonly string[]
  /** 每一對：全文相同與否、全文的相似度、新增內容的相似度。 */
  readonly pairs: readonly { readonly a: string; readonly b: string; readonly identical: boolean; readonly text: number; readonly added: number }[]
}

/** 不同個體之間的分化：只看至少兩個個體修改過的做法（第 2 版以後）。 */
export function divergence(individuals: readonly { readonly id: string; readonly e: Evolution }[]): Divergence[] {
  const out: Divergence[] = []
  for (const name of PROCEDURE_NAMES) {
    const changed = individuals.filter((i) => i.e.final[name].version > 1)
    if (changed.length < 2) continue
    const pairs: Divergence['pairs'][number][] = []
    for (let i = 0; i < changed.length; i++) {
      for (let j = i + 1; j < changed.length; j++) {
        const a = changed[i]!
        const b = changed[j]!
        const ta = a.e.final[name].text
        const tb = b.e.final[name].text
        pairs.push({ a: a.id, b: b.id, identical: ta === tb, text: similarity(ta, tb), added: similarity(addedLines(name, ta), addedLines(name, tb)) })
      }
    }
    out.push({ name, individuals: changed.map((c) => c.id), pairs })
  }
  return out
}

/**
 * 預先登記的判定（procedures-v1 規格）：
 * - HP1 提出：至少兩個個體提出過做法的修改 PASS；都沒有 FAIL；只有一個 PARTIAL。
 * - HP2 對照看得出差異：有雜訊基準的判斷中，至少一次有理由大於雜訊 PASS；有判斷但都沒有 FAIL；沒有判斷 INCOMPLETE。
 * - HP3 分化：至少兩個個體修改過同一個做法時，任何一對全文相同 FAIL（收斂成相同的文字），否則 PASS；沒有這樣的做法 INCOMPLETE。
 */
export function verdicts(individuals: readonly { readonly id: string; readonly e: Evolution }[]): { readonly HP1: string; readonly HP2: string; readonly HP3: string } {
  const proposing = individuals.filter((i) => Object.values(i.e.proposals).some((n) => (n ?? 0) > 0)).length
  const noise = individuals.reduce((n, i) => n + i.e.noiseDecisions, 0)
  const beyond = individuals.reduce((n, i) => n + i.e.beyondNoise, 0)
  const div = divergence(individuals)
  return {
    HP1: proposing >= 2 ? 'PASS' : proposing === 0 ? 'FAIL' : 'PARTIAL',
    HP2: noise === 0 ? 'INCOMPLETE' : beyond > 0 ? 'PASS' : 'FAIL',
    HP3: div.length === 0 ? 'INCOMPLETE' : div.some((d) => d.pairs.some((p) => p.identical)) ? 'FAIL' : 'PASS',
  }
}
