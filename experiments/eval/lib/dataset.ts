/**
 * 資料集格式（主代理的執行器讀這個格式；本檔只讀不改其欄位意義）與結構／洩漏檢查。
 *
 * 欄位：見規格 experiments/specs/memory-accuracy-v1.md §3 與 personality-consistency-v1.md §3。
 * 額外欄位一律放在 `meta`，意義在規格中說明。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { containsTerm, normalize } from './text.ts'

export interface DatasetHistory {
  readonly id: string
  readonly turns: readonly string[]
  readonly notes?: string
  readonly meta?: Readonly<Record<string, unknown>>
}

export interface Gold {
  readonly answer: string
  readonly aliases: readonly string[]
  readonly abstain: boolean
}

export interface CompareRef {
  readonly history: string
  readonly turn: number
}

export interface EvidenceRef {
  readonly history: string
  readonly text: string
}

/** 探針的 meta 欄位（全部可省略）。 */
export interface ProbeMeta {
  /** 同一題要在「歷史結束快照」上獨立重跑幾次（每次都是新 session）。預設 1。 */
  readonly repeats?: number
  /** 記憶：出現時讓確定性命中變成「不確定」、改由 judge 判定的字串（例如舊答案）。 */
  readonly conflicts?: readonly string[]
  /** 記憶：知識更新題的舊答案（必須出現在比新答案更早的歷史中）。 */
  readonly stale?: readonly string[]
  /** 記憶：證據原文，必須逐字出現在指定歷史的使用者發言中（構造正確性檢查）。 */
  readonly evidence?: readonly EvidenceRef[]
  /** 記憶：拒答題問到的、在所有歷史中都不得出現的詞。 */
  readonly absentTerms?: readonly string[]
  /** 記憶：拒答題的說明（給 judge，對應 LongMemEval 拒答 judge 的 explanation）。 */
  readonly explanation?: string
  /** 記憶：個人化應用題的評分準則（給 judge，對應 LongMemEval single-session-preference 的 rubric）。 */
  readonly rubric?: string
  /** 人格：選擇的型態。closed＝固定選項；open-text＝自由文字；open-number＝整數。 */
  readonly choiceType?: 'closed' | 'open-text' | 'open-number'
  /** 人格：固定選項清單（closed 時必填）。 */
  readonly options?: readonly string[]
  /** 人格：格式行標籤，例如「選擇」或「立場」。 */
  readonly formatLabel?: string
  /** 人格：comparesWith 各項的角色，與 comparesWith 依索引對齊。 */
  readonly compareRoles?: readonly ('initial' | 'latest' | 'story')[]
  /** 人格：自我回想題要求回想的內容（給 judge）。 */
  readonly askedFor?: string
  /** 人格：自我回想題是否要求回想理由（要求時，只答出選擇而缺理由記為 partial）。 */
  readonly requiresReason?: boolean
  /** 註記（不影響計分）。 */
  readonly note?: string
}

export interface DatasetProbe {
  readonly id: string
  readonly category: string
  readonly turns: readonly string[]
  readonly gold: Gold
  readonly refersTo: readonly string[]
  readonly comparesWith?: readonly CompareRef[]
  readonly meta?: ProbeMeta
}

export interface Dataset {
  readonly id: string
  readonly language: string
  readonly version?: string
  readonly meta?: Readonly<Record<string, unknown>>
  readonly histories: readonly DatasetHistory[]
  readonly probes: readonly DatasetProbe[]
}

export interface LoadedDataset {
  readonly dataset: Dataset
  readonly sha256: string
  readonly path: string
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function loadDataset(path: string): LoadedDataset {
  const bytes = readFileSync(path)
  const dataset = JSON.parse(bytes.toString('utf8')) as Dataset
  return { dataset, sha256: sha256(bytes), path }
}

export function repeatsOf(probe: DatasetProbe): number {
  const r = probe.meta?.repeats
  return typeof r === 'number' && Number.isInteger(r) && r >= 1 ? r : 1
}

const isString = (v: unknown): v is string => typeof v === 'string'

/** 結構檢查：回傳錯誤訊息清單（空清單＝通過）。 */
export function validateStructure(ds: Dataset): string[] {
  const errors: string[] = []
  if (!isString(ds.id) || ds.id.length === 0) errors.push('dataset.id 缺少或不是字串')
  if (ds.language !== 'zh-TW') errors.push(`dataset.language 應為 zh-TW，實際為 ${String(ds.language)}`)
  if (!Array.isArray(ds.histories)) errors.push('histories 不是陣列')
  if (!Array.isArray(ds.probes)) errors.push('probes 不是陣列')
  if (errors.length > 0) return errors
  const historyIds = new Set<string>()
  for (const h of ds.histories) {
    if (!isString(h.id) || !/^h\d{2}$/u.test(h.id)) errors.push(`歷史 id 格式錯誤：${String(h.id)}`)
    if (historyIds.has(h.id)) errors.push(`歷史 id 重複：${h.id}`)
    historyIds.add(h.id)
    if (!Array.isArray(h.turns) || h.turns.length === 0 || !h.turns.every((t) => isString(t) && t.trim().length > 0)) {
      errors.push(`歷史 ${h.id} 的 turns 必須是非空字串陣列`)
    }
  }
  const probeIds = new Set<string>()
  for (const p of ds.probes) {
    if (!isString(p.id) || !/^q\d{2}$/u.test(p.id)) errors.push(`探針 id 格式錯誤：${String(p.id)}`)
    if (probeIds.has(p.id)) errors.push(`探針 id 重複：${p.id}`)
    probeIds.add(p.id)
    if (!isString(p.category) || p.category.length === 0) errors.push(`探針 ${p.id} 缺少 category`)
    if (!Array.isArray(p.turns) || p.turns.length === 0 || !p.turns.every((t) => isString(t) && t.trim().length > 0)) {
      errors.push(`探針 ${p.id} 的 turns 必須是非空字串陣列`)
    }
    const g = p.gold as Gold | undefined
    if (!g || !isString(g.answer) || !Array.isArray(g.aliases) || typeof g.abstain !== 'boolean') {
      errors.push(`探針 ${p.id} 的 gold 必須有 answer（字串）、aliases（陣列）、abstain（布林）`)
    }
    if (!Array.isArray(p.refersTo)) errors.push(`探針 ${p.id} 的 refersTo 必須是陣列`)
    for (const ref of p.refersTo ?? []) {
      if (!historyIds.has(ref)) errors.push(`探針 ${p.id} 的 refersTo 指向不存在的歷史 ${ref}`)
    }
    for (const c of p.comparesWith ?? []) {
      const h = ds.histories.find((x) => x.id === c.history)
      if (!h) errors.push(`探針 ${p.id} 的 comparesWith 指向不存在的歷史 ${c.history}`)
      else if (!Number.isInteger(c.turn) || c.turn < 0 || c.turn >= h.turns.length) {
        errors.push(`探針 ${p.id} 的 comparesWith ${c.history}#${c.turn} 超出範圍`)
      }
    }
    const m = p.meta
    if (m?.repeats !== undefined && !(Number.isInteger(m.repeats) && m.repeats >= 1 && m.repeats <= 5)) {
      errors.push(`探針 ${p.id} 的 meta.repeats 必須是 1–5 的整數`)
    }
    if (m?.compareRoles && m.compareRoles.length !== (p.comparesWith ?? []).length) {
      errors.push(`探針 ${p.id} 的 meta.compareRoles 長度與 comparesWith 不一致`)
    }
    if (m?.choiceType === 'closed' && (!m.options || m.options.length < 2)) {
      errors.push(`探針 ${p.id} 是 closed 選擇題但沒有 options`)
    }
  }
  return errors
}

function historyText(ds: Dataset, id: string): string {
  return ds.histories.find((h) => h.id === id)?.turns.join('\n') ?? ''
}

function historyIndex(ds: Dataset, id: string): number {
  return ds.histories.findIndex((h) => h.id === id)
}

/**
 * 構造與洩漏檢查（規格 §3.3）：
 * 1. 黃金答案與同義寫法不得出現在探針自己的提問裡；
 * 2. meta.evidence 的原文必須逐字出現在指定歷史；
 * 3. 拒答題的 absentTerms 不得出現在任何歷史；
 * 4. 知識更新題：stale 必須出現在某段歷史，且該歷史早於第一段含新答案證據的歷史；
 * 5. 黃金答案（非拒答題）必須能在 refersTo 指定的歷史中找到構成它的證據（由 evidence 表達）。
 */
export function leakCheck(ds: Dataset): string[] {
  const errors: string[] = []
  for (const p of ds.probes) {
    // 對照題可以在同一 session 的前幾輪給資訊（測 session 內記憶），所以只檢查最後一輪的提問；
    // 其他類別的整個探針都不得含有答案。
    const asked = p.category === 'control' ? p.turns.slice(-1) : p.turns
    const probeText = normalize(asked.join('\n'))
    const answers = [p.gold.answer, ...p.gold.aliases].filter((a) => a.trim().length > 0)
    for (const a of answers) {
      if (containsTerm(probeText, normalize(a))) errors.push(`探針 ${p.id} 的提問含有黃金答案「${a}」`)
    }
    for (const ev of p.meta?.evidence ?? []) {
      const h = ds.histories.find((x) => x.id === ev.history)
      if (!h) errors.push(`探針 ${p.id} 的證據指向不存在的歷史 ${ev.history}`)
      else if (!h.turns.some((t) => t.includes(ev.text))) {
        errors.push(`探針 ${p.id} 的證據「${ev.text}」沒有逐字出現在 ${ev.history}`)
      }
      if (!p.refersTo.includes(ev.history)) errors.push(`探針 ${p.id} 的證據歷史 ${ev.history} 不在 refersTo 中`)
    }
    if (p.gold.abstain) {
      // 拒答題可以 refersTo 相關（但不含答案）的歷史；absentTerms 則在所有歷史中都不得出現。
      for (const term of p.meta?.absentTerms ?? []) {
        for (const h of ds.histories) {
          if (containsTerm(normalize(h.turns.join('\n')), normalize(term))) {
            errors.push(`拒答題 ${p.id} 的 absentTerm「${term}」出現在歷史 ${h.id}`)
          }
        }
      }
      if ((p.meta?.absentTerms ?? []).length === 0 && p.category === 'abstention') {
        errors.push(`拒答題 ${p.id} 沒有 absentTerms，無法檢查答案確實不存在`)
      }
    }
    if (p.meta?.stale && p.meta.stale.length > 0) {
      const newEvidence = (p.meta.evidence ?? []).map((e) => historyIndex(ds, e.history)).filter((i) => i >= 0)
      const firstNew = newEvidence.length > 0 ? Math.min(...newEvidence) : -1
      for (const s of p.meta.stale) {
        const where = ds.histories.findIndex((h) => containsTerm(normalize(h.turns.join('\n')), normalize(s)))
        if (where < 0) errors.push(`知識更新題 ${p.id} 的舊答案「${s}」沒有出現在任何歷史`)
        else if (firstNew >= 0 && where >= firstNew) errors.push(`知識更新題 ${p.id} 的舊答案「${s}」沒有早於新答案的證據`)
      }
      for (const a of answers) {
        for (let i = 0; i < firstNew && i < ds.histories.length; i++) {
          if (containsTerm(normalize(ds.histories[i]!.turns.join('\n')), normalize(a))) {
            errors.push(`知識更新題 ${p.id} 的新答案「${a}」在更新之前的歷史 ${ds.histories[i]!.id} 就出現了`)
          }
        }
      }
    }
    if (!p.gold.abstain && p.category !== 'control' && !p.comparesWith && (p.meta?.evidence ?? []).length === 0) {
      errors.push(`探針 ${p.id} 不是拒答題也不是對照題，卻沒有 meta.evidence`)
    }
  }
  return errors
}

export { historyText }
