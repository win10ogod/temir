/**
 * 成本彙總（改進清單第 5 項）：以價表把用量換成花費，每個 run 分開算，並行的批次不再互相重疊。只做算術，不呼叫任何 API。
 *
 * 用量的來源：
 * - 主模型：records.jsonl 每一回合的 `usage`（執行器從 DSH 的 assistant/message 事件取得，每則訊息一筆）。
 * - 輔助呼叫：生命日誌的 `memory/aux`（2026-10-30 起記下 `usage` 與 `finish`；individual/src/recall/aux.ts 的 auxRecord）。
 * - 模擬使用者：records.jsonl 每一個 simulated 回合的 `simulatorUsage`（2026-10-30 起；experiments/runner/simulator.ts）。
 *   judge 的用量不在這裡。
 *
 * 價表（美元／每百萬 token）的來源：
 * - deepseek-flash：research/log/2026-10-28-s02.md 第 9 行，DeepSeek 價格頁（api-docs.deepseek.com/quick_start/pricing，2026-10-28 讀取）：
 *   輸入未命中 $0.15／$0.30（離峰／尖峰）、命中 $0.003／$0.006、輸出 $0.60／$1.20。
 * - deepseek-v4-pro：查不到（repo 中沒有記錄；2026-10-30 在雲端整理時不查網頁）。留空，花費標為未知。
 * - 尖峰與離峰的時段 repo 中沒有記錄，所以每一筆都算離峰與尖峰兩個數（下限與上限），不猜時段。
 * - 快取寫入（cacheWriteTokens）沒有價格：大於 0 時那一筆的花費標為未知。
 */

/** 一筆用量，各欄互不重疊（input＝未命中快取的輸入）；reasoning 是 output 的細項，不另外計價。 */
export interface Tokens {
  readonly input: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly output: number
  readonly reasoning: number
}

/** 美元／每百萬 token。 */
export interface Rate {
  readonly input: number
  readonly cacheRead: number
  readonly output: number
}

export interface PriceEntry {
  readonly offPeak: Rate
  readonly peak: Rate
  readonly source: string
}

export const PRICES: Readonly<Record<string, PriceEntry | null>> = {
  'deepseek-flash': {
    offPeak: { input: 0.15, cacheRead: 0.003, output: 0.6 },
    peak: { input: 0.3, cacheRead: 0.006, output: 1.2 },
    source: 'research/log/2026-10-28-s02.md:9（api-docs.deepseek.com/quick_start/pricing，2026-10-28 讀取）',
  },
  'deepseek-v4-pro': null,
}

const ZERO: Tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }

const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)

/**
 * 把一筆用量轉成 Tokens；認不得時回傳 undefined。兩種格式：
 * - DSH 的 TokenUsage（dsh-llm lib/types/types.d.ts：「Counts are DISJOINT: inputTokens is uncached input only」）。
 *   reasoning 算在 outputTokens 裡：DeepSeek 的轉接器把 totalTokens 算成 input＋output＋cacheRead＋cacheWrite，沒有另加思考
 *   （dsh-llm-deepseek@0.2.2-alpha.2 lib/index.js:2019）。
 * - OpenAI 相容的 /chat/completions（模擬使用者）：prompt_tokens、completion_tokens、prompt_cache_hit_tokens、
 *   prompt_cache_miss_tokens、completion_tokens_details.reasoning_tokens。欄位名依 DeepSeek API 的文件，
 *   repo 中還沒有實際的回應可以對照（未驗證）；未命中的輸入優先用 prompt_cache_miss_tokens，沒有時以 prompt_tokens 減去命中。
 */
export function normalizeUsage(usage: unknown): Tokens | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined
  const u = usage as Record<string, unknown>
  const input = count(u['inputTokens'])
  const output = count(u['outputTokens'])
  if (input !== undefined && output !== undefined) {
    return { input, output, cacheRead: count(u['cacheReadTokens']) ?? 0, cacheWrite: count(u['cacheWriteTokens']) ?? 0, reasoning: count(u['reasoningTokens']) ?? 0 }
  }
  const prompt = count(u['prompt_tokens'])
  const completion = count(u['completion_tokens'])
  if (prompt === undefined || completion === undefined) return undefined
  const hit = count(u['prompt_cache_hit_tokens']) ?? 0
  const details = u['completion_tokens_details'] as Record<string, unknown> | undefined
  return { input: count(u['prompt_cache_miss_tokens']) ?? Math.max(prompt - hit, 0), cacheRead: hit, cacheWrite: 0, output: completion, reasoning: count(details?.['reasoning_tokens']) ?? 0 }
}

export type UsageSource = 'main' | 'aux' | 'simulator'

export interface UsageLine {
  /** 模型名稱，可以帶 provider 前綴（例如 deepseek-official/deepseek-flash）。 */
  readonly model: string
  readonly source: UsageSource
  /** 原樣的用量；null／undefined＝那次呼叫沒有用量紀錄（舊紀錄、呼叫失敗）。 */
  readonly usage: unknown
}

/** 價表的鍵：去掉 provider 前綴。 */
export function modelKey(model: string): string {
  return model.slice(model.lastIndexOf('/') + 1)
}

/** 一筆用量的花費（美元）；沒有價格或有沒有價格的部分（快取寫入）時為 null。 */
export function costOf(tokens: Tokens, price: PriceEntry | null | undefined): { readonly offPeak: number; readonly peak: number } | null {
  if (!price || tokens.cacheWrite > 0) return null
  const at = (r: Rate) => (tokens.input * r.input + tokens.cacheRead * r.cacheRead + tokens.output * r.output) / 1_000_000
  return { offPeak: at(price.offPeak), peak: at(price.peak) }
}

export interface CostRow {
  readonly model: string
  readonly source: UsageSource
  /** 有用量的呼叫數。 */
  readonly calls: number
  /** 沒有用量紀錄的呼叫數（花費因此低估）。 */
  readonly withoutUsage: number
  readonly tokens: Tokens
  /** 花費的下限（離峰）與上限（尖峰）；有任何一筆無法計價時為 null。 */
  readonly usd: { readonly offPeak: number; readonly peak: number } | null
}

export interface CostSummary {
  readonly rows: readonly CostRow[]
  /** 能計價的部分合計。 */
  readonly total: { readonly offPeak: number; readonly peak: number }
  /** 每一筆都有用量、也都能計價。 */
  readonly complete: boolean
  readonly notes: readonly string[]
}

/** 依模型與來源彙總。 */
export function summarize(lines: readonly UsageLine[], prices: Readonly<Record<string, PriceEntry | null>> = PRICES): CostSummary {
  const groups = new Map<string, { model: string; source: UsageSource; calls: number; withoutUsage: number; tokens: Tokens; usd: { offPeak: number; peak: number } | null }>()
  for (const line of lines) {
    const model = modelKey(line.model)
    const key = `${model}\u0000${line.source}`
    const g = groups.get(key) ?? { model, source: line.source, calls: 0, withoutUsage: 0, tokens: ZERO, usd: { offPeak: 0, peak: 0 } }
    groups.set(key, g)
    const t = normalizeUsage(line.usage)
    if (!t) {
      g.withoutUsage++
      continue
    }
    g.calls++
    g.tokens = { input: g.tokens.input + t.input, cacheRead: g.tokens.cacheRead + t.cacheRead, cacheWrite: g.tokens.cacheWrite + t.cacheWrite, output: g.tokens.output + t.output, reasoning: g.tokens.reasoning + t.reasoning }
    const c = costOf(t, prices[model])
    g.usd = c && g.usd ? { offPeak: g.usd.offPeak + c.offPeak, peak: g.usd.peak + c.peak } : null
  }
  const rows = [...groups.values()].sort((a, b) => a.model.localeCompare(b.model) || a.source.localeCompare(b.source))
  const notes: string[] = []
  for (const r of rows) {
    if (r.withoutUsage > 0) notes.push(`${r.model}（${r.source}）有 ${r.withoutUsage} 次呼叫沒有用量紀錄，花費低估`)
    if (!prices[r.model]) notes.push(`${r.model} 沒有價格（價表查不到），花費未知`)
    else if (r.tokens.cacheWrite > 0) notes.push(`${r.model}（${r.source}）有快取寫入，價表沒有這一項，花費未知`)
  }
  const total = rows.reduce((t, r) => (r.usd ? { offPeak: t.offPeak + r.usd.offPeak, peak: t.peak + r.usd.peak } : t), { offPeak: 0, peak: 0 })
  return { rows, total, complete: notes.length === 0, notes }
}

/** records.jsonl 的一筆紀錄中與用量有關的欄位。 */
export interface UsageRecord {
  readonly model: string
  readonly turns: readonly { readonly usage?: readonly unknown[]; readonly simulated?: boolean; readonly simulatorUsage?: unknown }[]
}

/**
 * records.jsonl 的用量：主模型每則訊息一筆；模擬使用者每個 simulated 回合一筆（舊紀錄沒有 simulatorUsage，算沒有用量）。
 * simulatorModel＝模擬使用者的模型（執行紀錄 config.json 的 simulatedUser.model；simulator.ts 的 SIMULATOR_MODEL）。
 */
export function recordUsage(records: readonly UsageRecord[], simulatorModel = 'deepseek-flash'): UsageLine[] {
  return records.flatMap((r) =>
    r.turns.flatMap((t) => [
      ...(t.usage ?? []).map((usage): UsageLine => ({ model: r.model, source: 'main', usage })),
      ...(t.simulated ? [{ model: simulatorModel, source: 'simulator' as const, usage: t.simulatorUsage ?? null }] : []),
    ]),
  )
}

/** 生命日誌中 memory/aux 事件的用量（model 欄是 provider/model；失敗的呼叫與舊紀錄沒有 usage）。 */
export function auxUsage(rows: readonly { readonly model: string | null; readonly data: unknown }[]): UsageLine[] {
  return rows.map((r) => ({ model: r.model ?? 'unknown', source: 'aux', usage: (r.data as { usage?: unknown } | null)?.usage ?? null }))
}

/** 純文字表格（CLI 用）。 */
export function renderCost(summary: CostSummary): string {
  const usd = (v: { offPeak: number; peak: number } | null) => (v ? `$${v.offPeak.toFixed(4)}–$${v.peak.toFixed(4)}` : '未知')
  const lines = ['| 模型 | 來源 | 呼叫 | 沒有用量 | 輸入（未命中） | 快取命中 | 輸出（含思考） | 思考 | 花費（離峰–尖峰） |', '|---|---|---|---|---|---|---|---|---|']
  for (const r of summary.rows) lines.push(`| ${r.model} | ${r.source} | ${r.calls} | ${r.withoutUsage} | ${r.tokens.input} | ${r.tokens.cacheRead} | ${r.tokens.output} | ${r.tokens.reasoning} | ${usd(r.usd)} |`)
  lines.push('', `能計價的部分合計：${usd(summary.total)}${summary.complete ? '' : '（不完整）'}`, ...summary.notes.map((n) => `- ${n}`))
  return lines.join('\n')
}
