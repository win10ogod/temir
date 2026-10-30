/**
 * JitRL 經驗修正（純函式，不依賴 DSH，可單獨測試）。
 *
 * 論文：Just-In-Time Reinforcement Learning（arXiv:2601.18510）
 * - method.tex §3.2〈Test-Time Value Estimation〉：鄰居、V̂、Q̂、未見行動的樂觀值（eq:value_est、eq:exploration）、
 *   優勢（eq:test_time_advantage）；
 * - §3.3〈Policy Update〉：正規化優勢（eq:norm_advantage）與 z' = z + β·Ã（eq:logit_update）；
 * - eq:discounted_return：G_t = Σ_{u≥t} γ^{u−t} r_u；
 * - experiments.tex〈Verbalized Logit〉：模型不提供 logprob 時，以 0–100 的口述信心轉成 logit。
 * 超參數的出處與本專案改動的理由見 research/decisions/ADR-0002 D3；凡是論文沒有規定的值都標為本專案的選擇。
 */
import { indexTerms } from '../life/store.ts'

export interface Params {
  /** 折扣因子 γ（論文 Jericho 0.5）。 */
  readonly gamma: number
  /** 鄰居數 k（論文 10）。 */
  readonly k: number
  /** 處境相似度門檻（論文 0.95／0.8；自由文字的處境取 0.2，本專案的選擇）。 */
  readonly stateThreshold: number
  /** 行動描述的詞彙相似度門檻（本專案的選擇；模型判定的 sameAs 也算相符）。 */
  readonly actionThreshold: number
  /** 未見行動給樂觀值的機率 λ（論文 0.65）。 */
  readonly lambda: number
  /** 樂觀加成 α（論文 5；本專案的回報在 [−2, 2]，取 1）。 */
  readonly alpha: number
  /** logit 更新的強度 β（論文沒有給值，取 1）。 */
  readonly beta: number
}

export const DEFAULT_PARAMS: Params = {
  gamma: 0.5,
  k: 10,
  stateThreshold: 0.2,
  actionThreshold: 0.35,
  lambda: 0.65,
  alpha: 1,
  beta: 1,
}

const EPSILON = 1e-6
/** 口述信心為 0 時的下限，避免 ln(0)。 */
const CONFIDENCE_FLOOR = 0.5

export interface Candidate {
  /** 一句話描述的做法。 */
  readonly action: string
  /** 做法的類別（回答、提問、建議、拒絕……）。 */
  readonly kind: string
  /** 預期的後果。 */
  readonly prediction: string
  /** 口述信心 0–100。 */
  readonly confidence: number
  /** 模型判定為同一做法的過去經驗（rd/decision 事件 id）。 */
  readonly sameAs: readonly string[]
  /**
   * RD 扣除了這個做法（PC＝ST＋E−RD＝A；使用者 2026-10-29：「−」是扣除，ST＋E 減掉 RD 才進入 A）。
   * 由個體自己判斷：想過預期後果、過去類似處境的結果與自己在乎的事之後，不做這個。舊紀錄沒有這個欄位。
   */
  readonly excluded?: boolean
  readonly excludeReason?: string
  /**
   * 扣除本身會被經驗改變（使用者 2026-10-30；ADR-0002 D20）：這個做法的扣除與否，因為過去類似處境的經驗而與當時不同時，
   * 個體寫下是哪一次的經驗、為什麼改變。由個體自己判斷，沒有數值門檻。舊紀錄沒有這個欄位。
   */
  readonly revised?: string
  /**
   * D20 第三版：看過類似處境中同類的經驗之後，個體強制作出的判斷（keep＝維持扣除、lift＝解除扣除）、理由與依據的經驗（rd/decision id）。
   * 解除時，原本的扣除理由保留在 reason。
   */
  readonly judgment?: { readonly decision: 'keep' | 'lift'; readonly why: string; readonly refs: readonly string[]; readonly reason?: string }
}

/** 一個有回報的過去決定 (s, a, G)。 */
export interface Experience {
  readonly id: string
  readonly ts: number
  /** 當時對方說的話（思考提示中挑選相關經驗用）。 */
  readonly cue: string
  /** 當時的處境描述 s。 */
  readonly situation: string
  /** 實際採取的做法 a。 */
  readonly action: string
  readonly kind: string
  /** 折扣回報 G。 */
  readonly ret: number
  /** 實際發生的事與教訓。 */
  readonly outcome: string
  /** 決定所在的 session（把回憶帶進來的經歷對應回當時的決定用）。 */
  readonly session?: string | null
  /** 當時扣除、沒有做的做法與理由（D20：扣除之後發生了什麼，就是這筆經驗的結果）。 */
  readonly excludedThen?: readonly { readonly action: string; readonly kind?: string; readonly reason: string }[]
  /** 事後比對時，個體自己判斷當時的預測有沒有成真（D20 第二版：比回報少一層價值判斷）。 */
  readonly matched?: 'yes' | 'partly' | 'no'
}

export function termSet(text: string): Set<string> {
  return new Set(indexTerms(text))
}

/** 處境描述中用來比對相似度的欄位（rd/aux.ts 的固定格式）。 */
const STATE_FIELDS = ['對方的意圖', '對方的情緒', '話題'] as const

/**
 * 處境的檢索詞：固定格式時只取意圖、情緒、話題三個欄位的內容。
 * 欄位標籤每個處境都有，對方的描述與相關記憶在同一個人身上也大同小異，算進去會讓無關的處境顯得相似
 * （e2e-14：「請你整合」與「抒發壓力」相似度 0.21–0.23）。不是固定格式時用全文。
 */
export function stateTerms(situation: string): Set<string> {
  const values: string[] = []
  for (const part of situation.split('｜')) {
    const [label, ...rest] = part.split('：')
    if (rest.length > 0 && (STATE_FIELDS as readonly string[]).includes((label ?? '').trim())) values.push(rest.join('：'))
  }
  return termSet(values.length > 0 ? values.join(' ') : situation)
}

/** Jaccard 相似度 |A∩B| / |A∪B|。 */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const term of a) if (b.has(term)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * 依時間順序的回報 r（缺值為 undefined）→ 折扣回報 G。缺值處截斷：G_t 只累加到下一個缺值之前，
 * 缺值本身的 G 也是 undefined（還不知道結果的決定不能當經驗）。
 */
export function discountedReturns(rewards: readonly (number | undefined)[], gamma: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array.from({ length: rewards.length })
  let following: number | undefined
  for (let t = rewards.length - 1; t >= 0; t--) {
    const r = rewards[t]
    following = r === undefined ? undefined : r + gamma * (following ?? 0)
    out[t] = following
  }
  return out
}

export interface Neighbor {
  readonly experience: Experience
  readonly similarity: number
  /** 由思考時的模型判定為同一類處境（不論詞彙相似度）。 */
  readonly judged: boolean
}

/**
 * 處境相似的前 k 個經驗 N(s)：詞彙相似度達門檻者，加上模型判定為同一類處境者（judged）。
 * 對話的處境用字變化大，字面的二字組相似度在 e2e-14 中區分不了「同一類的傾訴」（0.09–0.16）與無關的請求（≤ 0.06），
 * 所以跟行動相符（sameAs）一樣，讓模型對列出的經驗做語意判斷；這是本專案的選擇（ADR-0002 D3）。
 */
export function neighbors(situation: string, memory: readonly Experience[], params: Params, judged: readonly string[] = []): Neighbor[] {
  const terms = stateTerms(situation)
  return memory
    .map((experience) => ({ experience, similarity: jaccard(terms, stateTerms(experience.situation)), judged: judged.includes(experience.id) }))
    .filter((n) => n.judged || n.similarity >= params.stateThreshold)
    .sort((a, b) => Number(b.judged) - Number(a.judged) || b.similarity - a.similarity || b.experience.ts - a.experience.ts)
    .slice(0, params.k)
}

export interface Scored extends Candidate {
  /** 基礎 logit：ln(c / Σc)。 */
  readonly z: number
  /** Q̂(s, a)；沒有鄰居時為 null。 */
  readonly q: number | null
  /** 相符的鄰居數 |N(s, a)|。 */
  readonly support: number
  /** 未見過的行動：true＝依 λ 給了樂觀值，false＝給 0；見過的行動或沒有鄰居時為 null。 */
  readonly optimistic: boolean | null
  readonly advantage: number
  readonly normalized: number
  readonly zPrime: number
}

export interface Correction {
  readonly scored: readonly Scored[]
  /** V̂(s)；沒有鄰居時為 null。 */
  readonly value: number | null
  /** 沒有被 RD 扣除的候選中，修正後分數最高的（同分取模型原本的順序）；全部都被扣除時為 -1（沒有準備好的做法）。 */
  readonly chosen: number
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 全部的候選都被 RD 扣除了（思考的提示要求至少保留一個不扣除的做法）。 */
export function allExcluded(candidates: readonly Candidate[]): boolean {
  return candidates.length > 0 && candidates.every((c) => c.excluded)
}

/**
 * 在沒有被 RD 扣除的候選中，取分數最高的（本專案的延伸：論文在全部候選中選擇）。
 * 全部都被扣除時回傳 -1：程式不替個體改選（改進清單第 6 項；之前退回全部候選中分數最高的）。
 * 思考會先附上說明重問一次（rd/index.ts）；仍全部扣除，就照實記下沒有準備好的做法，由主模型在回應時決定。
 */
export function chooseAmong(values: readonly number[], candidates: readonly Candidate[]): number {
  const allowed = values.map((_, i) => i).filter((i) => !candidates[i]?.excluded)
  if (allowed.length === 0) return -1
  return allowed.reduce((best, i) => (values[i]! > values[best]! ? i : best), allowed[0]!)
}

/** 只用口述信心的選擇（關閉經驗修正，或沒有鄰居時）。 */
export function uncorrected(candidates: readonly Candidate[]): Correction {
  const z = baseLogits(candidates)
  const scored = candidates.map((c, i) => ({ ...c, z: z[i]!, q: null, support: 0, optimistic: null, advantage: 0, normalized: 0, zPrime: z[i]! }))
  return { scored, value: null, chosen: chooseAmong(z, candidates) }
}

function baseLogits(candidates: readonly Candidate[]): number[] {
  const floored = candidates.map((c) => Math.max(c.confidence, CONFIDENCE_FLOOR))
  const total = floored.reduce((a, b) => a + b, 0)
  return floored.map((c) => Math.log(c / total))
}

/** 經驗修正：V̂、Q̂、優勢、正規化與 logit 更新，選出修正後分數最高的候選。 */
export function correct(
  candidates: readonly Candidate[],
  near: readonly Neighbor[],
  params: Params,
  random: () => number = Math.random,
): Correction {
  if (candidates.length === 0) return { scored: [], value: null, chosen: 0 }
  if (near.length === 0) return uncorrected(candidates)
  const z = baseLogits(candidates)
  const value = mean(near.map((n) => n.experience.ret))
  const estimates = candidates.map((c) => {
    const terms = termSet(c.action)
    const matches = near.filter(
      (n) =>
        c.sameAs.includes(n.experience.id) ||
        (n.experience.kind === c.kind && jaccard(terms, termSet(n.experience.action)) >= params.actionThreshold),
    )
    if (matches.length > 0) return { q: mean(matches.map((n) => n.experience.ret)), support: matches.length, optimistic: null }
    const optimistic = random() < params.lambda
    return { q: optimistic ? value + params.alpha / near.length : 0, support: 0, optimistic }
  })
  const advantages = estimates.map((e) => e.q - value)
  const scale = Math.max(...advantages.map((a) => Math.abs(a))) + EPSILON
  const scored = candidates.map((c, i) => {
    const normalized = advantages[i]! / scale
    return { ...c, z: z[i]!, ...estimates[i]!, advantage: advantages[i]!, normalized, zPrime: z[i]! + params.beta * normalized }
  })
  return { scored, value, chosen: chooseAmong(scored.map((s) => s.zPrime), candidates) }
}
