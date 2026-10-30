/**
 * 預先登記的評估契約（machine-readable）。必要類別、計分方式、比較與驗收線都寫在契約裡，
 * 不從資料反推（規格 §2、§6）。契約檔與規格 Markdown 一起在第一次受試執行前凍結。
 */
import { readFileSync } from 'node:fs'

/** 與 experiments/runner/run.ts 的 CONDITIONS 相同（v3 起加入 2026-10-29 的條件；v1、v2 的契約只用前四個）。 */
export const CONDITIONS = ['baseline', 'temir', 'temir-no-autorecall', 'temir-no-snapshot', 'temir-progressive', 'temir-full', 'temir-no-rd', 'temir-no-jitrl', 'temir-no-energy', 'temir-no-subtraction', 'temir-no-perperson', 'temir-no-skill', 'temir-no-revision'] as const
export type Condition = (typeof CONDITIONS)[number]

export const MODELS = ['deepseek-flash', 'EVE-27B', 'Qwen3.8-Flash-Next'] as const

/** 計分方式。 */
export type Scoring =
  /** 確定性比對命中且無衝突 → 對；其餘（未命中、不確定）交給 judge。 */
  | 'det-then-judge'
  /** 全部由 judge 判定。 */
  | 'judge'
  /** 人格：與受試者自己在 comparesWith 的選擇／立場比較（同／有說明的改變／無說明的不同）。 */
  | 'continuity'
  /** 人格：受試者回想自己說過的話（judge 對照原話）。 */
  | 'self-recall'
  /** 人格：受試者敘述自己立場的演變（judge 對照形成 session）。 */
  | 'narration'
  /** v2：逐條判定準則（全部符合才算對），用於隱性運用記憶的題目。 */
  | 'judge-criteria'

export type JudgePromptId =
  | 'mem-default'
  | 'mem-temporal'
  | 'mem-knowledge-update'
  | 'mem-abstention'
  | 'mem-preference'
  | 'pc-extract'
  | 'pc-change'
  | 'pc-recall'
  | 'pc-narrate'
  /** v2：隱性運用記憶的逐條準則判定（Memora 式原子準則）。 */
  | 'mem-criteria-v2'
  /** v2：自我回想，區分「宣稱回想」與「否認記得後重新推導」。 */
  | 'pc-recall-v2'
  /** v2：改變敘述，同樣區分宣稱回想與重新推導。 */
  | 'pc-narrate-v2'
  /** v2：連續性的改變判定多一個 same（同一個選擇、只是寫法不同）；格式行也接受簡體的標籤。省略＝pc-change（v1，凍結）。 */
  | 'pc-change-v2'

export interface CategorySpec {
  readonly id: string
  /** 規格中的名稱與論文出處（只供報告）。 */
  readonly label: string
  readonly source: string
  readonly min: number
  readonly scoring: Scoring
  /** det-then-judge／judge 使用的 judge 提示詞。 */
  readonly judgePrompt?: JudgePromptId
  /** 這個類別屬於哪個報告群組（例如 memory、abstention、control、a、b、c、d）。 */
  readonly group: string
}

export interface CellSpec {
  readonly condition: Condition
  readonly historyModel: string
  readonly probeModel: string
}

export interface ContrastSpec {
  readonly id: string
  readonly a: CellSpec
  readonly b: CellSpec
  /** 這個比較涵蓋的類別（合併計算）。 */
  readonly categories: readonly string[]
  readonly description: string
}

export type AcceptanceRule =
  | {
      readonly kind: 'superiority'
      /** A − B 的點估計至少要這麼大。 */
      readonly minDiff: number
      /** 成對 bootstrap 95% 區間下界至少要這麼大。 */
      readonly minCiLow: number
      /** 精確檢定（McNemar 或符號檢定）的 p 值上限。 */
      readonly maxP: number
      /** 使用單尾或雙尾 p 值。 */
      readonly sided: 'one' | 'two'
      readonly minRateA?: number
      readonly maxRateB?: number
    }
  | {
      readonly kind: 'no-harm'
      /** A 的失敗（未得分）樣本數不得超過 B 的失敗數＋此值。 */
      readonly maxExtraFailures: number
    }
  | {
      readonly kind: 'max-rate'
      /** 單一 cell 的比率上限（例如虛構回憶比率）。 */
      readonly metric: 'fabrication' | 'unexplained-different'
      readonly max: number
    }

export interface AcceptanceSpec {
  readonly id: string
  readonly contrast: string
  readonly rule: AcceptanceRule
  readonly claim: string
  readonly negation: string
}

export interface JudgeSpec {
  readonly model: string
  readonly endpoint: string
  readonly temperature: number
  readonly maxTokens: number
  readonly thinking: 'disabled' | 'enabled'
  readonly maxAttempts: number
  /** 每百萬 token 的價格（美元，尖峰時段，保守估計）。 */
  readonly pricesUsdPerMillion: { readonly cacheHit: number; readonly cacheMiss: number; readonly output: number }
  readonly maxUsdPerRun: number
}

/** v2：執行協定中評估器能檢查的部分（來自每個 run 目錄的 config.json）。 */
export interface ProtocolSpec {
  /** 執行器的目錄配置；v2 要求 "home"。不符的 cell 照常計分與顯示，但相關驗收線記為 INCOMPLETE。 */
  readonly layout?: string
  /**
   * 基礎設施錯誤（限流、每日配額）的判定樣式（正規表示式，不分大小寫，比對回合錯誤訊息）。
   * 探針樣本若因此出錯，可在同一份快照上重跑，評估器採用重跑的紀錄（見 lib/records.ts selectV2）。
   */
  readonly infraErrorPattern?: string
}

/** v2：描述性指標的判定規則（事先寫定的正規表示式，比對工具呼叫的參數原文）。 */
export interface DescriptiveSpec {
  /** 翻閱 DSH session 存放區。 */
  readonly sessionStorePattern: string
  /** 翻閱個體的生命日誌檔。 */
  readonly lifeLogPattern: string
}

export interface Contract {
  readonly id: string
  readonly version: string
  readonly dataset: string
  readonly kind: 'memory' | 'personality'
  /** 摘要格式版本。省略＝v1（為了能逐位元組重現 v1 的摘要，v1 的輸出完全不變）；2＝加上描述性指標與協定檢查。 */
  readonly reportVersion?: 2
  readonly protocol?: ProtocolSpec
  readonly descriptive?: DescriptiveSpec
  readonly categories: readonly CategorySpec[]
  readonly requiredCells: readonly CellSpec[]
  readonly optionalCells: readonly CellSpec[]
  readonly contrasts: readonly ContrastSpec[]
  readonly acceptance: readonly AcceptanceSpec[]
  readonly judge: JudgeSpec
  readonly bootstrap: { readonly resamples: number; readonly seed: number }
}

export function loadContract(path: string): Contract {
  const contract = JSON.parse(readFileSync(path, 'utf8')) as Contract
  const errors = validateContract(contract)
  if (errors.length > 0) throw new Error(`契約 ${path} 無效：\n${errors.join('\n')}`)
  return contract
}

export function validateContract(c: Contract): string[] {
  const errors: string[] = []
  if (!c.id || !c.dataset) errors.push('契約缺少 id 或 dataset')
  if (!Array.isArray(c.categories) || c.categories.length === 0) errors.push('契約沒有必要類別')
  const ids = new Set<string>()
  for (const cat of c.categories ?? []) {
    if (ids.has(cat.id)) errors.push(`類別重複：${cat.id}`)
    ids.add(cat.id)
    if (!Number.isInteger(cat.min) || cat.min < 1) errors.push(`類別 ${cat.id} 的 min 必須是正整數`)
    if ((cat.scoring === 'det-then-judge' || cat.scoring === 'judge') && !cat.judgePrompt) {
      errors.push(`類別 ${cat.id} 使用 ${cat.scoring} 但沒有指定 judgePrompt`)
    }
    if (cat.scoring === 'judge-criteria' && cat.judgePrompt !== 'mem-criteria-v2') {
      errors.push(`類別 ${cat.id} 使用 judge-criteria，judgePrompt 必須是 mem-criteria-v2`)
    }
    if (cat.scoring === 'continuity' && cat.judgePrompt && cat.judgePrompt !== 'pc-change-v2') {
      errors.push(`類別 ${cat.id} 的 judgePrompt 只能是 pc-change-v2（省略＝pc-change）`)
    }
    if (cat.scoring === 'self-recall' && cat.judgePrompt && cat.judgePrompt !== 'pc-recall' && cat.judgePrompt !== 'pc-recall-v2') {
      errors.push(`類別 ${cat.id} 的 judgePrompt 只能是 pc-recall 或 pc-recall-v2`)
    }
    if (cat.scoring === 'narration' && cat.judgePrompt && cat.judgePrompt !== 'pc-narrate' && cat.judgePrompt !== 'pc-narrate-v2') {
      errors.push(`類別 ${cat.id} 的 judgePrompt 只能是 pc-narrate 或 pc-narrate-v2`)
    }
  }
  if (c.reportVersion !== undefined && c.reportVersion !== 2) errors.push('reportVersion 只能省略或是 2')
  if (c.protocol?.infraErrorPattern !== undefined) {
    try {
      new RegExp(c.protocol.infraErrorPattern, 'iu')
    } catch {
      errors.push('protocol.infraErrorPattern 不是合法的正規表示式')
    }
  }
  if (c.descriptive) {
    for (const [k, v] of Object.entries(c.descriptive)) {
      try {
        new RegExp(v as string, 'iu')
      } catch {
        errors.push(`descriptive.${k} 不是合法的正規表示式`)
      }
    }
  }
  const contrastIds = new Set((c.contrasts ?? []).map((x) => x.id))
  for (const k of c.contrasts ?? []) {
    for (const cat of k.categories) if (!ids.has(cat)) errors.push(`比較 ${k.id} 用到未定義的類別 ${cat}`)
    for (const cell of [k.a, k.b]) {
      if (!(CONDITIONS as readonly string[]).includes(cell.condition)) errors.push(`比較 ${k.id} 的條件 ${cell.condition} 不存在`)
    }
  }
  for (const a of c.acceptance ?? []) {
    if (!contrastIds.has(a.contrast)) errors.push(`驗收 ${a.id} 指向不存在的比較 ${a.contrast}`)
  }
  return errors
}

export function cellKey(cell: CellSpec): string {
  return `${cell.condition}|${cell.historyModel}|${cell.probeModel}`
}

export function cellLabel(cell: CellSpec): string {
  return cell.historyModel === cell.probeModel
    ? `${cell.condition}（${cell.historyModel}）`
    : `${cell.condition}（歷史 ${cell.historyModel} → 探針 ${cell.probeModel}）`
}
