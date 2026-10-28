/**
 * 讀取主代理執行器的紀錄（experiments/runs/<runId>/records.jsonl）。
 *
 * 契約（規格 §4）：損壞的行、缺少欄位、逾時或錯誤的回合都「計入分母、算失敗」，不靜默丟棄。
 * 能辨認出屬於哪一題的損壞紀錄，會掛在那一題上記為 malformed-record；完全無法辨認的行
 * 只能列在 protocolIssues，而那一題會因為缺紀錄被記為 missing-record（同樣算失敗）。
 */
import { readFileSync } from 'node:fs'

export interface ToolCall {
  readonly name: string
  readonly arguments: string
}

export interface RecordTurn {
  readonly user: string
  readonly assistant: string
  readonly toolCalls: readonly ToolCall[]
  readonly recallInjected: number | null
  readonly error: string | null
  /** 選用（執行器的額外欄位）：這一輪花了幾毫秒；只用於 v2 的描述性指標。 */
  readonly ms?: unknown
}

export interface RunRecord {
  readonly runId: string
  readonly dataset: string
  readonly datasetSha256: string
  readonly condition: string
  readonly historyModel: string
  readonly probeModel: string
  readonly phase: 'history' | 'probe'
  readonly itemId: string
  readonly sessionId: string
  readonly turns: readonly RecordTurn[]
  readonly startedAt: string
  readonly endedAt: string
  /** 選用：同一題第幾次重複（0 起算）。沒有時依 startedAt 排序。 */
  readonly repeat?: number
}

/** 能辨認出所屬題目、但內容不合格式的紀錄。 */
export interface MalformedRecord {
  readonly file: string
  readonly line: number
  readonly reason: string
  readonly runId?: string
  readonly condition?: string
  readonly historyModel?: string
  readonly probeModel?: string
  readonly phase?: string
  readonly itemId?: string
  readonly startedAt?: string
  readonly repeat?: number
}

export interface ProtocolIssue {
  readonly file: string
  readonly line: number
  readonly reason: string
}

export interface LoadedRecords {
  readonly records: readonly (RunRecord & { readonly file: string; readonly line: number })[]
  readonly malformed: readonly MalformedRecord[]
  readonly issues: readonly ProtocolIssue[]
}

const isString = (v: unknown): v is string => typeof v === 'string'

function validateTurn(t: unknown, i: number): string | undefined {
  if (!t || typeof t !== 'object') return `turns[${i}] 不是物件`
  const o = t as Record<string, unknown>
  if (!isString(o['user'])) return `turns[${i}].user 不是字串`
  if (!isString(o['assistant'])) return `turns[${i}].assistant 不是字串`
  if (!Array.isArray(o['toolCalls'])) return `turns[${i}].toolCalls 不是陣列`
  for (const [j, c] of (o['toolCalls'] as unknown[]).entries()) {
    if (!c || typeof c !== 'object' || !isString((c as Record<string, unknown>)['name'])) return `turns[${i}].toolCalls[${j}] 缺少 name`
  }
  const ri = o['recallInjected']
  if (!(ri === null || (typeof ri === 'number' && Number.isFinite(ri)))) return `turns[${i}].recallInjected 必須是數字或 null`
  const err = o['error']
  if (!(err === null || isString(err))) return `turns[${i}].error 必須是字串或 null`
  return undefined
}

/** 驗證一筆已解析的 JSON；回傳錯誤原因或 undefined。 */
export function validateRecord(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '不是 JSON 物件'
  const o = obj as Record<string, unknown>
  for (const k of ['runId', 'dataset', 'datasetSha256', 'condition', 'historyModel', 'probeModel', 'itemId', 'sessionId', 'startedAt', 'endedAt']) {
    if (!isString(o[k])) return `缺少字串欄位 ${k}`
  }
  if (o['phase'] !== 'history' && o['phase'] !== 'probe') return 'phase 必須是 history 或 probe'
  if (!Array.isArray(o['turns'])) return 'turns 不是陣列'
  for (const [i, t] of (o['turns'] as unknown[]).entries()) {
    const e = validateTurn(t, i)
    if (e) return e
  }
  if (o['repeat'] !== undefined && !(Number.isInteger(o['repeat']) && (o['repeat'] as number) >= 0)) return 'repeat 必須是非負整數'
  return undefined
}

export function parseRecordsText(text: string, file: string): LoadedRecords {
  const records: (RunRecord & { file: string; line: number })[] = []
  const malformed: MalformedRecord[] = []
  const issues: ProtocolIssue[] = []
  const lines = text.split('\n')
  for (const [index, raw] of lines.entries()) {
    const line = index + 1
    if (raw.trim().length === 0) continue
    let obj: unknown
    try {
      obj = JSON.parse(raw)
    } catch (error) {
      issues.push({ file, line, reason: `JSON 解析失敗：${(error as Error).message.slice(0, 120)}` })
      continue
    }
    const reason = validateRecord(obj)
    if (!reason) {
      records.push({ ...(obj as RunRecord), file, line })
      continue
    }
    const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>
    const partial: MalformedRecord = {
      file,
      line,
      reason,
      ...(isString(o['runId']) ? { runId: o['runId'] } : {}),
      ...(isString(o['condition']) ? { condition: o['condition'] } : {}),
      ...(isString(o['historyModel']) ? { historyModel: o['historyModel'] } : {}),
      ...(isString(o['probeModel']) ? { probeModel: o['probeModel'] } : {}),
      ...(isString(o['phase']) ? { phase: o['phase'] } : {}),
      ...(isString(o['itemId']) ? { itemId: o['itemId'] } : {}),
      ...(isString(o['startedAt']) ? { startedAt: o['startedAt'] } : {}),
      ...(Number.isInteger(o['repeat']) ? { repeat: o['repeat'] as number } : {}),
    }
    if (partial.condition && partial.phase && partial.itemId) malformed.push(partial)
    else issues.push({ file, line, reason: `無法辨認所屬題目的損壞紀錄：${reason}` })
  }
  return { records, malformed, issues }
}

export function loadRecords(files: readonly string[]): LoadedRecords {
  const all: LoadedRecords[] = []
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      all.push({ records: [], malformed: [], issues: [{ file, line: 0, reason: `無法讀取：${(error as Error).message}` }] })
      continue
    }
    all.push(parseRecordsText(text, file))
  }
  return {
    records: all.flatMap((x) => x.records),
    malformed: all.flatMap((x) => x.malformed),
    issues: all.flatMap((x) => x.issues),
  }
}

/** 一個樣本在計分前的狀態。 */
export type SampleStatus =
  | 'ok'
  | 'missing-record'
  | 'malformed-record'
  | 'dataset-mismatch'
  | 'turn-count-mismatch'
  | 'turn-error'
  | 'empty-response'

export interface Sample {
  readonly repeat: number
  readonly status: SampleStatus
  readonly detail?: string
  readonly record?: RunRecord
  /** 最後一輪的可見回覆（status 為 ok 時一定是非空字串）。 */
  readonly response?: string
}

type Entry = { kind: 'ok'; rec: RunRecord & { file: string; line: number } } | { kind: 'bad'; bad: MalformedRecord }

function sortKey(e: Entry): [number, string, string, number] {
  const repeat = e.kind === 'ok' ? e.rec.repeat : e.bad.repeat
  const started = (e.kind === 'ok' ? e.rec.startedAt : e.bad.startedAt) ?? '9999'
  const file = e.kind === 'ok' ? e.rec.file : e.bad.file
  const line = e.kind === 'ok' ? e.rec.line : e.bad.line
  return [repeat ?? Number.MAX_SAFE_INTEGER, started, file, line]
}

function compareEntries(x: Entry, y: Entry): number {
  const a = sortKey(x)
  const b = sortKey(y)
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1
  return a[3] - b[3]
}

export interface SelectQuery {
  readonly phase: 'history' | 'probe'
  readonly itemId: string
  readonly condition: string
  readonly historyModel: string
  /** 探針才比對 probeModel；歷史紀錄不看 probeModel。 */
  readonly probeModel?: string
  readonly expected: number
  readonly expectedTurns: number
  readonly datasetSha256: string
  /**
   * v2（契約 `protocol.infraErrorPattern`）：回合錯誤訊息符合這個樣式的紀錄視為基礎設施錯誤（限流、配額），
   * 同一個重複位置有其他紀錄時不採用它（由重跑取代）；沒有其他紀錄時仍以錯誤計分。
   * 設定時改用依 repeat 對位的選取（見 selectV2）。省略時行為與 v1 完全相同。
   */
  readonly infraError?: RegExp
}

export interface Selection {
  readonly samples: Sample[]
  /** 多出、沒有被採用的紀錄數（不計分，但列入 protocol issues）。 */
  readonly extras: number
  /** v2：因為同一位置另有紀錄而沒有採用的基礎設施錯誤紀錄數。 */
  readonly infraSkipped: number
}

/** 一筆紀錄 → 樣本（檢查資料集版本、回合數、錯誤回合、空回覆）。 */
function toSample(e: Entry | undefined, i: number, q: SelectQuery): Sample {
  if (!e) return { repeat: i, status: 'missing-record', detail: '沒有對應的紀錄' }
  if (e.kind === 'bad') return { repeat: i, status: 'malformed-record', detail: `${e.bad.file}:${e.bad.line} ${e.bad.reason}` }
  const rec = e.rec
  if (rec.datasetSha256 !== q.datasetSha256) {
    return { repeat: i, status: 'dataset-mismatch', detail: `紀錄的 datasetSha256=${rec.datasetSha256.slice(0, 12)}…`, record: rec }
  }
  if (rec.turns.length !== q.expectedTurns) {
    return { repeat: i, status: 'turn-count-mismatch', detail: `預期 ${q.expectedTurns} 輪，紀錄 ${rec.turns.length} 輪`, record: rec }
  }
  const errored = rec.turns.findIndex((t) => t.error !== null)
  if (errored >= 0) {
    return { repeat: i, status: 'turn-error', detail: `第 ${errored} 輪錯誤：${String(rec.turns[errored]!.error).slice(0, 200)}`, record: rec }
  }
  const response = rec.turns[rec.turns.length - 1]!.assistant
  if (response.trim().length === 0) return { repeat: i, status: 'empty-response', detail: '最後一輪沒有可見回覆', record: rec }
  return { repeat: i, status: 'ok', record: rec, response }
}

/**
 * 依契約為一題選出 expected 個樣本：先依 repeat、再依 startedAt 排序取前 expected 筆；
 * 不足的補 missing-record。多出的紀錄回報在 extras（不計分，但列入 protocol issues）。
 */
export function selectSamples(loaded: LoadedRecords, q: SelectQuery): Selection {
  const matches = (x: { phase?: string; itemId?: string; condition?: string; historyModel?: string; probeModel?: string }) =>
    x.phase === q.phase &&
    x.itemId === q.itemId &&
    x.condition === q.condition &&
    x.historyModel === q.historyModel &&
    (q.probeModel === undefined || x.probeModel === q.probeModel)
  const entries: Entry[] = [
    ...loaded.records.filter(matches).map((rec) => ({ kind: 'ok' as const, rec })),
    ...loaded.malformed.filter(matches).map((bad) => ({ kind: 'bad' as const, bad })),
  ].sort(compareEntries)
  if (q.infraError) return selectV2(entries, q, q.infraError)
  const samples: Sample[] = []
  for (let i = 0; i < q.expected; i++) samples.push(toSample(entries[i], i, q))
  return { samples, extras: Math.max(0, entries.length - q.expected), infraSkipped: 0 }
}

/**
 * v2 的選取（只在契約有 `protocol.infraErrorPattern` 時使用）：
 * 1. 第 i 個位置採用標明 repeat＝i 的紀錄中最早的一筆（依 startedAt）；沒有標明 repeat 的紀錄依時間順序補進空位。
 * 2. 回合錯誤符合基礎設施錯誤樣式的紀錄，先不參與；某個位置沒有其他紀錄時，才用它（仍以錯誤計分）。
 * 3. 非基礎設施的錯誤（逾時、模型錯誤……）照常參與「最早的一筆」規則——重跑不能取代它，只會變成多出的紀錄。
 */
function selectV2(entries: readonly Entry[], q: SelectQuery, infraError: RegExp): Selection {
  const repeatOf = (e: Entry): number | undefined => (e.kind === 'ok' ? e.rec.repeat : e.bad.repeat)
  const isInfra = (e: Entry): boolean => e.kind === 'ok' && e.rec.turns.some((t) => t.error !== null && infraError.test(String(t.error)))
  const regular = entries.filter((e) => !isInfra(e))
  const infra = entries.filter(isInfra)
  const slots: (Entry | undefined)[] = Array.from({ length: q.expected }, () => undefined)
  const used = new Set<Entry>()
  const fill = (pool: readonly Entry[]): void => {
    for (let i = 0; i < q.expected; i++) {
      if (slots[i]) continue
      const e = pool.find((x) => !used.has(x) && repeatOf(x) === i)
      if (e) {
        slots[i] = e
        used.add(e)
      }
    }
    for (let i = 0; i < q.expected; i++) {
      if (slots[i]) continue
      const e = pool.find((x) => !used.has(x) && repeatOf(x) === undefined)
      if (e) {
        slots[i] = e
        used.add(e)
      }
    }
  }
  fill(regular)
  fill(infra)
  const samples = slots.map((e, i) => toSample(e, i, q))
  return {
    samples,
    extras: regular.filter((e) => !used.has(e)).length,
    infraSkipped: infra.filter((e) => !used.has(e)).length,
  }
}
