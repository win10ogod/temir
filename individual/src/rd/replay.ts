/**
 * 日誌重播：在已記錄的決定上，評估 JitRL 經驗估計的參數（plan v2 M2；ADR-0002 D16）。純函式，可單獨測試。
 *
 * 依據：
 * - Dream-RSI（arXiv:2609.14858 problem_formulation.tex）：把歷史當成可重播的環境，離線評估候選策略；
 *   重播只在已觀察的支撐集內有效，不能預測沒有發生過的事；現行策略也在候選中，部署的不會比現行差。
 * - RRSI（arXiv:2609.24972 附錄 Algorithm 2、`rrsi/calibrate.py`）：雜訊下限 δ。只有一次評估時以 bootstrap 估計，z＝2。
 *
 * 本專案的對應（與論文不同之處）：
 * - 每個決定只觀察到實際採取的那個做法的回報（bandit 回饋），換別的參數會選什麼做法、結果如何，是支撐集外的事。
 *   所以重播不評估「選擇」，只評估**估計**：以當時以前的經驗、某組參數算出的 Q̂（相符的經驗）或 V̂（相似的處境），
 *   能多準地預測這個決定實際的回報 G。估計越準，經驗修正的方向越可信。
 * - 可以這樣評估的只有決定鄰居與相符的參數：k、stateThreshold、actionThreshold。
 *   β、λ、α 影響的是選擇，γ 決定 G 本身，在支撐集內都評估不了，維持原值。
 * - 依時間切分：較早的 2/3 選參數，較新的 1/3 驗證；驗證上的改進超過 bootstrap 雜訊帶（z＝2）才採用。
 */
import { jaccard, neighbors, termSet, type Experience, type Params } from './jitrl.ts'

export const REPLAY_KIND = 'rd/replay'

/** 重播的候選格（本專案的選擇）；現行的參數一定在候選中。 */
export const REPLAY_GRID = {
  k: [5, 10, 20],
  stateThreshold: [0.1, 0.15, 0.2, 0.3],
  actionThreshold: [0.25, 0.35, 0.5],
} as const

/** 少於這麼多個可以預測的決定就不重播（本專案的選擇）。 */
export const MIN_REPLAY = 20

export type Tunable = Pick<Params, 'k' | 'stateThreshold' | 'actionThreshold'>

export interface ReplayCase {
  readonly experience: Experience
  /** 思考時模型判定為同一類處境的經驗（rd/decision 的 neighbors.judged）。 */
  readonly judged: readonly string[]
  /** 思考時模型判定做法相同的經驗（選中候選的 sameAs）。 */
  readonly sameAs: readonly string[]
}

/** 以 i 之前的經驗預測 G_i：有相符的經驗用 Q̂，有相似的處境用 V̂，都沒有就用過去全部回報的平均。 */
export function predict(cases: readonly ReplayCase[], i: number, params: Params): number {
  const c = cases[i]!
  const before = cases.slice(0, i).map((x) => x.experience)
  const near = neighbors(c.experience.situation, before, params, c.judged)
  const terms = termSet(c.experience.action)
  const matches = near.filter(
    (n) => c.sameAs.includes(n.experience.id) || (n.experience.kind === c.experience.kind && jaccard(terms, termSet(n.experience.action)) >= params.actionThreshold),
  )
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  if (matches.length > 0) return mean(matches.map((n) => n.experience.ret))
  if (near.length > 0) return mean(near.map((n) => n.experience.ret))
  return mean(before.map((e) => e.ret))
}

/** 每個決定（從第二個起）的平方誤差。 */
export function errors(cases: readonly ReplayCase[], params: Params, from = 1, to = cases.length): number[] {
  const out: number[] = []
  for (let i = Math.max(from, 1); i < to; i++) out.push((predict(cases, i, params) - cases[i]!.experience.ret) ** 2)
  return out
}

/** 以固定種子的 bootstrap 估計平均值的標準差（mulberry32）。 */
export function bootstrapSd(values: readonly number[], resamples = 1000, seed = 20261029): number {
  if (values.length < 2) return Number.POSITIVE_INFINITY
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const means: number[] = []
  for (let r = 0; r < resamples; r++) {
    let sum = 0
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(random() * values.length)]!
    means.push(sum / values.length)
  }
  const m = means.reduce((a, b) => a + b, 0) / means.length
  return Math.sqrt(means.reduce((a, b) => a + (b - m) ** 2, 0) / (means.length - 1))
}

export interface ReplayData {
  readonly n: number
  readonly train: number
  readonly test: number
  readonly current: Tunable & { readonly trainMse: number; readonly testMse: number }
  readonly best: Tunable & { readonly trainMse: number; readonly testMse: number }
  /** 驗證上平均平方誤差的減少（現行 − 最佳，逐決定配對）。 */
  readonly gain: number
  /** 雜訊帶：z × bootstrap 標準差（z＝2）。 */
  readonly noise: number
  readonly adopted: boolean
  readonly reason: string
}

const tunable = (p: Params): Tunable => ({ k: p.k, stateThreshold: p.stateThreshold, actionThreshold: p.actionThreshold })
const meanOf = (xs: readonly number[]) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length)

/** 重播一次：較早的 2/3 選參數、較新的 1/3 驗證；決定太少時回傳 undefined。 */
export function replay(cases: readonly ReplayCase[], current: Params): ReplayData | undefined {
  const sorted = [...cases].sort((a, b) => a.experience.ts - b.experience.ts)
  if (sorted.length - 1 < MIN_REPLAY) return undefined
  const split = Math.floor(sorted.length * (2 / 3))
  const candidates: Params[] = [current]
  for (const k of REPLAY_GRID.k) for (const stateThreshold of REPLAY_GRID.stateThreshold) for (const actionThreshold of REPLAY_GRID.actionThreshold) candidates.push({ ...current, k, stateThreshold, actionThreshold })
  const scored = candidates.map((p) => ({ p, train: meanOf(errors(sorted, p, 1, split)) }))
  // 同分時取和現行差最少的（現行排在第一個）：沒有證據的參數不跟著改。
  const changed = (p: Params) => (Object.keys(REPLAY_GRID) as (keyof Tunable)[]).filter((key) => p[key] !== current[key]).length
  const best = scored.reduce((a, b) => (b.train < a.train - 1e-12 || (Math.abs(b.train - a.train) <= 1e-12 && changed(b.p) < changed(a.p)) ? b : a))
  const curTest = errors(sorted, current, split)
  const bestTest = errors(sorted, best.p, split)
  const deltas = curTest.map((e, i) => e - bestTest[i]!)
  const gain = meanOf(deltas)
  const noise = 2 * bootstrapSd(deltas)
  const same = JSON.stringify(tunable(best.p)) === JSON.stringify(tunable(current))
  const adopted = !same && gain > 0 && gain > noise
  const reason = same ? '現行的參數在較早的決定上已經最好' : adopted ? '較新的決定上，預測誤差的減少超過雜訊帶' : '較新的決定上，預測誤差的減少沒有超過雜訊帶'
  return {
    n: sorted.length,
    train: split,
    test: sorted.length - split,
    current: { ...tunable(current), trainMse: scored[0]!.train, testMse: meanOf(curTest) },
    best: { ...tunable(best.p), trainMse: best.train, testMse: meanOf(bestTest) },
    gain,
    noise,
    adopted,
    reason,
  }
}

/** 最近一次採用的參數（沒有就是空的）；RD 以 DEFAULT_PARAMS ⊕ 這裡 ⊕ 設定檔的順序決定參數。 */
export function adoptedParams(all: readonly { readonly data: unknown }[]): Partial<Tunable> {
  for (let i = all.length - 1; i >= 0; i--) {
    const d = all[i]!.data as ReplayData
    if (d.adopted) return { k: d.best.k, stateThreshold: d.best.stateThreshold, actionThreshold: d.best.actionThreshold }
  }
  return {}
}
