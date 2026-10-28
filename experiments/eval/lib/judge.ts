/**
 * LLM judge：DeepSeek（OpenAI 相容 /chat/completions）＋快取＋重放。
 *
 * 機密：金鑰只從環境變數 DEEPSEEK_API_KEY 讀取，只放在 Authorization 標頭；
 * 不寫進快取、log、錯誤訊息或任何檔案（規格 §5.4、CLAUDE.md 規則 8）。
 *
 * 失敗處理（規格 §5.4）：
 * - 輸出無法解析、API 錯誤、超出預算 → status 不是 ok，呼叫端一律計為「錯誤（未得分）」，不丟棄；
 * - 每一次嘗試的原始輸出（含失敗）都寫進 judge-raw.jsonl；
 * - 只有 judge 被刻意關閉（--judge none）或重放時找不到紀錄，才是 unavailable（報告標示為未完成）。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { JudgePromptId, JudgeSpec } from './contract.ts'
import { sha256 } from './dataset.ts'
import type { ParseResult, PromptPair } from './prompts.ts'

export type JudgeStatus = 'ok' | 'unparseable' | 'api-error' | 'budget-exhausted' | 'unavailable'

export interface JudgeUsage {
  readonly promptCacheHitTokens: number
  readonly promptCacheMissTokens: number
  readonly completionTokens: number
}

export interface JudgeOutcome {
  readonly status: JudgeStatus
  readonly key: string
  readonly value?: Readonly<Record<string, string>>
  readonly raw: string
  readonly attempts: number
  readonly cached: boolean
  readonly error?: string
  readonly usage?: JudgeUsage
}

export interface JudgeRequest {
  readonly prompt: JudgePromptId
  readonly pair: PromptPair
  readonly parse: (raw: string) => ParseResult
  /** 方便追查：這次判定屬於哪個 cell／題目／樣本。 */
  readonly context: string
}

export interface Judge {
  readonly name: string
  judge(req: JudgeRequest): Promise<JudgeOutcome>
  /** 本次執行累計花費（美元，依契約價格估算）。 */
  spentUsd(): number
  /** 本次執行實際送出的 API 請求數。 */
  calls(): number
  /**
   * 摘要所依據的 judge 紀錄來源：哪個 judge、多少次 API 呼叫、估計花費。
   * 即時呼叫時就是本次執行；重放時由重放的 judge 紀錄檔重建（讓 `--judge replay` 能逐位元組重現原摘要）。
   */
  provenance(): JudgeProvenance
}

export interface JudgeProvenance {
  readonly name: string
  readonly calls: number
  readonly spentUsd: number
}

/**
 * 由 judge 紀錄檔（judge-raw.jsonl）重建呼叫數與花費：每一行是一次嘗試；`budget-exhausted` 那一行
 * 沒有送出請求，不計；有 usage 的行依檔案順序累加花費（與 DeepSeekJudge 執行時累加的順序相同）。
 * 同一個檔案路徑只算一次。
 */
export function recordStats(files: readonly string[], prices: JudgeSpec['pricesUsdPerMillion']): { calls: number; spentUsd: number; entries: number } {
  let calls = 0
  let spentUsd = 0
  let entries = 0
  for (const file of [...new Set(files.map((f) => resolve(f)))]) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      let e: CacheEntry
      try {
        e = JSON.parse(line) as CacheEntry
      } catch {
        continue
      }
      entries++
      if (e.status !== 'budget-exhausted') calls++
      if (e.usage) spentUsd += costUsd(e.usage, prices)
    }
  }
  return { calls, spentUsd, entries }
}

export function requestKey(spec: Pick<JudgeSpec, 'model' | 'temperature' | 'maxTokens' | 'thinking'>, pair: PromptPair): string {
  return sha256(JSON.stringify({ model: spec.model, temperature: spec.temperature, maxTokens: spec.maxTokens, thinking: spec.thinking, system: pair.system, user: pair.user }))
}

/** 快取檔中的一行。final＝這次判定的最終結果（重放時使用）。 */
export interface CacheEntry {
  readonly key: string
  readonly prompt: JudgePromptId
  readonly context: string
  readonly model: string
  readonly attempt: number
  readonly final: boolean
  readonly status: JudgeStatus
  readonly raw: string
  readonly value?: Readonly<Record<string, string>>
  readonly error?: string
  readonly usage?: JudgeUsage
  readonly httpStatus?: number
  readonly request: PromptPair
  readonly at: string
}

export function readCache(files: readonly string[]): Map<string, CacheEntry> {
  const finals = new Map<string, CacheEntry>()
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const e = JSON.parse(line) as CacheEntry
        if (e.final) finals.set(e.key, e)
      } catch {
        // 快取檔的壞行不影響計分：該 key 視為沒有快取，會重新呼叫或標示 unavailable。
      }
    }
  }
  return finals
}

export function costUsd(usage: JudgeUsage | undefined, prices: JudgeSpec['pricesUsdPerMillion']): number {
  if (!usage) return 0
  return (usage.promptCacheHitTokens * prices.cacheHit + usage.promptCacheMissTokens * prices.cacheMiss + usage.completionTokens * prices.output) / 1e6
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number
  ok: boolean
  text(): Promise<string>
}>

export interface DeepSeekJudgeOptions {
  readonly spec: JudgeSpec
  readonly cacheFile: string
  /** 額外讀取的快取檔（例如先前執行的 judge-raw.jsonl），只讀。 */
  readonly readCacheFiles?: readonly string[]
  readonly maxUsd: number
  readonly fetchImpl?: FetchLike
  readonly apiKey?: string
  readonly sleep?: (ms: number) => Promise<void>
  readonly timeoutMs?: number
}

export class DeepSeekJudge implements Judge {
  readonly name = 'deepseek'
  readonly #spec: JudgeSpec
  readonly #cacheFile: string
  readonly #cache: Map<string, CacheEntry>
  readonly #maxUsd: number
  readonly #fetch: FetchLike
  readonly #apiKey: string | undefined
  readonly #sleep: (ms: number) => Promise<void>
  readonly #timeoutMs: number
  #spent = 0
  #calls = 0

  constructor(options: DeepSeekJudgeOptions) {
    this.#spec = options.spec
    this.#cacheFile = options.cacheFile
    this.#cache = readCache([...(options.readCacheFiles ?? []), options.cacheFile])
    this.#maxUsd = options.maxUsd
    this.#fetch = options.fetchImpl ?? (fetch as unknown as FetchLike)
    this.#apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY']
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.#timeoutMs = options.timeoutMs ?? 120_000
  }

  spentUsd(): number {
    return this.#spent
  }

  calls(): number {
    return this.#calls
  }

  provenance(): JudgeProvenance {
    return { name: this.name, calls: this.#calls, spentUsd: this.#spent }
  }

  #record(entry: Omit<CacheEntry, 'at' | 'model'>): void {
    const full: CacheEntry = { ...entry, model: this.#spec.model, at: new Date().toISOString() }
    appendFileSync(this.#cacheFile, `${JSON.stringify(full)}\n`)
    if (full.final) this.#cache.set(full.key, full)
  }

  async judge(req: JudgeRequest): Promise<JudgeOutcome> {
    const key = requestKey(this.#spec, req.pair)
    const hit = this.#cache.get(key)
    if (hit && hit.status === 'ok' && hit.value) {
      return { status: 'ok', key, value: hit.value, raw: hit.raw, attempts: 0, cached: true }
    }
    if (!this.#apiKey) {
      return { status: 'unavailable', key, raw: '', attempts: 0, cached: false, error: '沒有 DEEPSEEK_API_KEY' }
    }
    let lastRaw = ''
    let lastError = ''
    let lastStatus: JudgeStatus = 'api-error'
    let usageTotal: JudgeUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0 }
    for (let attempt = 1; attempt <= this.#spec.maxAttempts; attempt++) {
      if (this.#spent >= this.#maxUsd) {
        const outcome: JudgeOutcome = { status: 'budget-exhausted', key, raw: '', attempts: attempt - 1, cached: false, error: `已達 judge 預算上限 US$${this.#maxUsd}` }
        this.#record({ key, prompt: req.prompt, context: req.context, attempt, final: true, status: 'budget-exhausted', raw: '', error: outcome.error!, request: req.pair })
        return outcome
      }
      const body = {
        model: this.#spec.model,
        messages: [
          { role: 'system', content: req.pair.system },
          { role: 'user', content: req.pair.user },
        ],
        temperature: this.#spec.temperature,
        max_tokens: this.#spec.maxTokens,
        thinking: { type: this.#spec.thinking },
        response_format: { type: 'json_object' },
        stream: false,
      }
      let httpStatus: number | undefined
      let usage: JudgeUsage | undefined
      this.#calls++
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
        let res: Awaited<ReturnType<FetchLike>>
        try {
          res = await this.#fetch(this.#spec.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#apiKey}` },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
        httpStatus = res.status
        const text = await res.text()
        if (!res.ok) {
          lastStatus = 'api-error'
          lastError = `HTTP ${res.status}：${redact(text, this.#apiKey).slice(0, 300)}`
          lastRaw = ''
        } else {
          const json = JSON.parse(text) as {
            choices?: { message?: { content?: string } }[]
            usage?: { prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number; completion_tokens?: number; prompt_tokens?: number }
          }
          const u = json.usage
          if (u) {
            const hitTokens = u.prompt_cache_hit_tokens ?? 0
            const missTokens = u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - hitTokens)
            usage = { promptCacheHitTokens: hitTokens, promptCacheMissTokens: missTokens, completionTokens: u.completion_tokens ?? 0 }
            usageTotal = {
              promptCacheHitTokens: usageTotal.promptCacheHitTokens + usage.promptCacheHitTokens,
              promptCacheMissTokens: usageTotal.promptCacheMissTokens + usage.promptCacheMissTokens,
              completionTokens: usageTotal.completionTokens + usage.completionTokens,
            }
            this.#spent += costUsd(usage, this.#spec.pricesUsdPerMillion)
          }
          lastRaw = json.choices?.[0]?.message?.content ?? ''
          const parsed = req.parse(lastRaw)
          if (parsed.ok) {
            this.#record({ key, prompt: req.prompt, context: req.context, attempt, final: true, status: 'ok', raw: lastRaw, value: parsed.value, ...(usage ? { usage } : {}), httpStatus, request: req.pair })
            return { status: 'ok', key, value: parsed.value, raw: lastRaw, attempts: attempt, cached: false, usage: usageTotal }
          }
          lastStatus = 'unparseable'
          lastError = parsed.reason
        }
      } catch (error) {
        lastStatus = 'api-error'
        lastError = redact(`${(error as Error).name}: ${(error as Error).message}`, this.#apiKey).slice(0, 300)
      }
      const final = attempt === this.#spec.maxAttempts
      this.#record({ key, prompt: req.prompt, context: req.context, attempt, final, status: lastStatus, raw: lastRaw, error: lastError, ...(usage ? { usage } : {}), ...(httpStatus !== undefined ? { httpStatus } : {}), request: req.pair })
      if (!final) await this.#sleep(lastStatus === 'api-error' ? 2000 * attempt : 0)
    }
    return { status: lastStatus, key, raw: lastRaw, attempts: this.#spec.maxAttempts, cached: false, error: lastError, usage: usageTotal }
  }
}

function redact(text: string, key: string | undefined): string {
  return key ? text.split(key).join('<redacted>') : text
}

/** 只從快取重放，不呼叫 API。找不到 → unavailable。 */
export class ReplayJudge implements Judge {
  readonly name = 'replay'
  readonly #spec: JudgeSpec
  readonly #cache: Map<string, CacheEntry>
  readonly #stats: { calls: number; spentUsd: number; entries: number }

  constructor(spec: JudgeSpec, cacheFiles: readonly string[]) {
    const files = [...new Set(cacheFiles.map((f) => resolve(f)))]
    this.#spec = spec
    this.#cache = readCache(files)
    this.#stats = recordStats(files, spec.pricesUsdPerMillion)
  }

  spentUsd(): number {
    return 0
  }

  calls(): number {
    return 0
  }

  /** 重放的紀錄來自 DeepSeek judge（只有它會寫紀錄檔）；沒有任何紀錄時標為 replay。 */
  provenance(): JudgeProvenance {
    return this.#stats.entries > 0
      ? { name: 'deepseek', calls: this.#stats.calls, spentUsd: this.#stats.spentUsd }
      : { name: this.name, calls: 0, spentUsd: 0 }
  }

  async judge(req: JudgeRequest): Promise<JudgeOutcome> {
    const key = requestKey(this.#spec, req.pair)
    const hit = this.#cache.get(key)
    if (!hit) return { status: 'unavailable', key, raw: '', attempts: 0, cached: false, error: '快取中沒有這個判定' }
    const reparsed = hit.status === 'ok' ? req.parse(hit.raw) : undefined
    if (reparsed && reparsed.ok) return { status: 'ok', key, value: reparsed.value, raw: hit.raw, attempts: 0, cached: true }
    return { status: hit.status === 'ok' ? 'unparseable' : hit.status, key, raw: hit.raw, attempts: 0, cached: true, error: hit.error ?? '重放時解析失敗' }
  }
}

/** 不使用 judge：需要 judge 的樣本標示為 unavailable（報告中該類別標示為未完成）。 */
export class NoJudge implements Judge {
  readonly name = 'none'
  spentUsd(): number {
    return 0
  }
  calls(): number {
    return 0
  }
  provenance(): JudgeProvenance {
    return { name: this.name, calls: 0, spentUsd: 0 }
  }
  async judge(req: JudgeRequest): Promise<JudgeOutcome> {
    return { status: 'unavailable', key: requestKey({ model: 'none', temperature: 0, maxTokens: 0, thinking: 'disabled' }, req.pair), raw: '', attempts: 0, cached: false, error: 'judge 已關閉' }
  }
}

/**
 * 單元測試用的測試替身（明確標示）：依提示詞內容回傳預先寫好的原始輸出，然後走真正的解析流程。
 * 不能用在正式評估（score.ts 不接受它）。
 */
export class ScriptedJudge implements Judge {
  readonly name = 'scripted-test-double'
  readonly #respond: (req: JudgeRequest) => string
  readonly seen: JudgeRequest[] = []

  constructor(respond: (req: JudgeRequest) => string) {
    this.#respond = respond
  }

  spentUsd(): number {
    return 0
  }

  calls(): number {
    return this.seen.length
  }

  provenance(): JudgeProvenance {
    return { name: this.name, calls: this.seen.length, spentUsd: 0 }
  }

  async judge(req: JudgeRequest): Promise<JudgeOutcome> {
    this.seen.push(req)
    const raw = this.#respond(req)
    const key = requestKey({ model: 'scripted', temperature: 0, maxTokens: 0, thinking: 'disabled' }, req.pair)
    const parsed = req.parse(raw)
    if (parsed.ok) return { status: 'ok', key, value: parsed.value, raw, attempts: 1, cached: false }
    return { status: 'unparseable', key, raw, attempts: 1, cached: false, error: parsed.reason }
  }
}
