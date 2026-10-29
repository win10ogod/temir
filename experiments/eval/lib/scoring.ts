/**
 * 計分引擎：把（資料集 × 契約 × 執行紀錄 × judge）轉成逐樣本、逐題的分數。
 *
 * 分母規則（規格 §4、§5）：每題每個 cell 一律產生 repeats 個樣本；缺紀錄、壞紀錄、錯誤回合、
 * 空回覆、judge 解析失敗／API 錯誤都記 0 分並保留原因。只有「judge 被刻意關閉或重放找不到」
 * 記為 null（needs-judge），讓報告標示該類別未完成，而不是假裝有分數。
 */
import type { CategorySpec, CellSpec, Contract, JudgePromptId } from './contract.ts'
import type { Dataset, DatasetProbe, CompareRef } from './dataset.ts'
import { repeatsOf } from './dataset.ts'
import type { Judge, JudgeOutcome } from './judge.ts'
import {
  PARSERS,
  changePrompt,
  changePromptV2,
  criteriaParser,
  criteriaPrompt,
  deriveCriteriaOutcome,
  deriveNarrationOutcome,
  deriveNarrationOutcomeV2,
  deriveRecallOutcome,
  deriveRecallOutcomeV2,
  extractPrompt,
  memoryPrompt,
  narratePrompt,
  narratePromptV2,
  recallPrompt,
  recallPromptV2,
  type PromptPair,
} from './prompts.ts'
import { selectSamples, type LoadedRecords, type Sample, type SampleStatus } from './records.ts'
import { extractFormatLine, matchAnswer, openChoiceKey, parseInteger, resolveOption, simplifiedLabel } from './text.ts'

export type ScoredStatus = SampleStatus | 'needs-judge' | 'judge-error' | 'formation-missing'

export interface ScoredSample {
  readonly repeat: number
  readonly status: ScoredStatus
  /** 1＝得分；0＝未得分（含所有失敗）；null＝無法評（judge 未執行）。 */
  readonly score: 0 | 1 | null
  readonly outcome: string
  readonly method: 'deterministic' | 'judge' | 'none'
  readonly detail: Readonly<Record<string, unknown>>
  readonly judgeKeys: readonly string[]
  readonly sessionId?: string
  readonly response?: string
  /** v2 才有：描述性指標（不影響分數）。 */
  readonly descriptive?: SampleDescriptive
}

/** v2 描述性指標：由紀錄的工具呼叫與每輪耗時計算；規則寫在契約的 descriptive。 */
export interface SampleDescriptive {
  readonly toolCalls: number
  readonly toolNames: Readonly<Record<string, number>>
  /** 任一工具呼叫的參數符合 sessionStorePattern。 */
  readonly sessionStoreAccess: boolean
  /** 任一工具呼叫的參數符合 lifeLogPattern。 */
  readonly lifeLogAccess: boolean
  /** 各輪 ms 的總和；任一輪沒有數字時為 null。 */
  readonly latencyMs: number | null
}

export interface ScoredItem {
  readonly cell: CellSpec
  readonly itemId: string
  readonly category: string
  readonly samples: readonly ScoredSample[]
  /** 樣本平均；任何樣本為 null 時為 null。 */
  readonly score: number | null
}

export interface CrossCheck {
  readonly cell: CellSpec
  readonly itemId: string
  readonly repeat: number
  readonly deterministic: 'hit'
  readonly judge: string
}

export interface ScoringResult {
  readonly items: readonly ScoredItem[]
  readonly crossChecks: readonly CrossCheck[]
  readonly extras: readonly { readonly cell: string; readonly itemId: string; readonly extra: number }[]
  /** v2：因為有重跑而沒有採用的基礎設施錯誤紀錄（契約 protocol.infraErrorPattern）。 */
  readonly infraSkipped?: readonly { readonly cell: string; readonly itemId: string; readonly count: number }[]
}

export interface ScoringOptions {
  readonly dataset: Dataset
  readonly datasetSha256: string
  readonly contract: Contract
  readonly records: LoadedRecords
  readonly judge: Judge
  readonly cells: readonly CellSpec[]
  /** 對確定性命中的樣本也呼叫 judge，只用來量測兩者的一致率，不影響分數。 */
  readonly crossCheck?: boolean
}

function questionText(probe: DatasetProbe): string {
  return probe.turns.length === 1 ? probe.turns[0]! : probe.turns.map((t, i) => `（同一段對話的第 ${i + 1} 句）${t}`).join('\n')
}

function judgeFailure(outcome: JudgeOutcome): { status: ScoredStatus; score: 0 | null; outcome: string } {
  if (outcome.status === 'unavailable') return { status: 'needs-judge', score: null, outcome: 'needs-judge' }
  return { status: 'judge-error', score: 0, outcome: `judge-${outcome.status}` }
}

function failed(sample: Sample): ScoredSample {
  return {
    repeat: sample.repeat,
    status: sample.status,
    score: 0,
    outcome: sample.status,
    method: 'none',
    detail: { reason: sample.detail ?? '' },
    judgeKeys: [],
    ...(sample.record ? { sessionId: sample.record.sessionId } : {}),
  }
}

function itemScore(samples: readonly ScoredSample[]): number | null {
  if (samples.some((s) => s.score === null)) return null
  return samples.reduce((sum, s) => sum + (s.score ?? 0), 0) / samples.length
}

// ───────────────────────────── 記憶 ─────────────────────────────

async function scoreMemorySample(
  opts: ScoringOptions,
  cat: CategorySpec,
  probe: DatasetProbe,
  sample: Sample,
  cell: CellSpec,
  crossChecks: CrossCheck[],
): Promise<ScoredSample> {
  if (sample.status !== 'ok') return failed(sample)
  const response = sample.response!
  const base = { repeat: sample.repeat, sessionId: sample.record!.sessionId, response }
  const accepted = [probe.gold.answer, ...probe.gold.aliases].filter((a) => a.trim().length > 0)
  const promptId = cat.judgePrompt as JudgePromptId
  const pair = memoryPrompt(promptId, {
    question: questionText(probe),
    answer: probe.gold.abstain ? (probe.meta?.explanation ?? probe.gold.answer) : probe.gold.answer,
    response,
    ...(probe.meta?.explanation ? { explanation: probe.meta.explanation } : {}),
    ...(probe.meta?.rubric ? { rubric: probe.meta.rubric } : {}),
  })
  const context = `${cell.condition}|${cell.historyModel}|${cell.probeModel}|${probe.id}|r${sample.repeat}`
  if (cat.scoring === 'det-then-judge') {
    const det = matchAnswer(response, accepted, probe.meta?.conflicts ?? [])
    if (det.verdict === 'hit') {
      if (opts.crossCheck) {
        const j = await opts.judge.judge({ prompt: promptId, pair, parse: PARSERS.yesNo, context: `${context}|crosscheck` })
        crossChecks.push({ cell, itemId: probe.id, repeat: sample.repeat, deterministic: 'hit', judge: j.status === 'ok' ? j.value!['label']! : `judge-${j.status}` })
      }
      return { ...base, status: 'ok', score: 1, outcome: 'correct', method: 'deterministic', detail: { deterministic: det }, judgeKeys: [] }
    }
    const j = await opts.judge.judge({ prompt: promptId, pair, parse: PARSERS.yesNo, context })
    if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { deterministic: det, judgeError: j.error ?? '' }, judgeKeys: [j.key] }
    const yes = j.value!['label'] === 'yes'
    return { ...base, status: 'ok', score: yes ? 1 : 0, outcome: yes ? 'correct' : 'incorrect', method: 'judge', detail: { deterministic: det, judge: j.value }, judgeKeys: [j.key] }
  }
  // scoring === 'judge'
  const j = await opts.judge.judge({ prompt: promptId, pair, parse: PARSERS.yesNo, context })
  if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { judgeError: j.error ?? '' }, judgeKeys: [j.key] }
  const yes = j.value!['label'] === 'yes'
  return { ...base, status: 'ok', score: yes ? 1 : 0, outcome: yes ? 'correct' : 'incorrect', method: 'judge', detail: { judge: j.value }, judgeKeys: [j.key] }
}

async function scoreCriteriaSample(opts: ScoringOptions, probe: DatasetProbe, sample: Sample, cell: CellSpec): Promise<ScoredSample> {
  if (sample.status !== 'ok') return failed(sample)
  const response = sample.response!
  const base = { repeat: sample.repeat, sessionId: sample.record!.sessionId, response }
  const criteria = probe.meta?.criteria ?? []
  const ids = criteria.map((c) => c.id)
  const pair = criteriaPrompt({ question: questionText(probe), background: probe.meta?.background ?? '', criteria, response })
  const context = `${cell.condition}|${cell.historyModel}|${cell.probeModel}|${probe.id}|r${sample.repeat}`
  const j = await opts.judge.judge({ prompt: 'mem-criteria-v2', pair, parse: criteriaParser(ids), context })
  if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { judgeError: j.error ?? '' }, judgeKeys: [j.key] }
  const outcome = deriveCriteriaOutcome(j.value!, ids)
  return { ...base, status: 'ok', score: outcome === 'correct' ? 1 : 0, outcome, method: 'judge', detail: { judge: j.value }, judgeKeys: [j.key] }
}

// ───────────────────────────── 人格 ─────────────────────────────

interface Formation {
  readonly ok: boolean
  readonly reason?: string
  readonly question: string
  readonly response: string
  readonly sessionId?: string
}

function formationOf(opts: ScoringOptions, cell: CellSpec, ref: CompareRef): Formation {
  const history = opts.dataset.histories.find((h) => h.id === ref.history)!
  const question = history.turns[ref.turn]!
  const { samples } = selectSamples(opts.records, {
    phase: 'history',
    itemId: ref.history,
    condition: cell.condition,
    historyModel: cell.historyModel,
    expected: 1,
    expectedTurns: history.turns.length,
    datasetSha256: opts.datasetSha256,
  })
  const s = samples[0]!
  if (!s.record) return { ok: false, reason: `${s.status}：${s.detail ?? ''}`, question, response: '' }
  if (s.status === 'dataset-mismatch' || s.status === 'turn-count-mismatch') {
    return { ok: false, reason: `${s.status}：${s.detail ?? ''}`, question, response: '', sessionId: s.record.sessionId }
  }
  const turn = s.record.turns[ref.turn]!
  if (turn.error !== null) return { ok: false, reason: `形成回合錯誤：${turn.error.slice(0, 120)}`, question, response: '', sessionId: s.record.sessionId }
  if (turn.assistant.trim().length === 0) return { ok: false, reason: '形成回合沒有可見回覆', question, response: '', sessionId: s.record.sessionId }
  return { ok: true, question, response: turn.assistant, sessionId: s.record.sessionId }
}

interface Choice {
  readonly status: 'chosen' | 'no-choice' | 'needs-judge' | 'judge-error'
  readonly value: string
  readonly method: 'format-line' | 'judge'
  readonly judgeKey?: string
  readonly error?: string
}

function normalizeChoice(probe: DatasetProbe, raw: string): string | undefined {
  const m = probe.meta!
  if (m.choiceType === 'closed') return resolveOption(raw, m.options ?? [])
  if (m.choiceType === 'open-number') {
    const n = parseInteger(raw)
    return n === undefined ? undefined : String(n)
  }
  const key = openChoiceKey(raw)
  return key.length > 0 ? key : undefined
}

function openDescription(probe: DatasetProbe): string {
  const m = probe.meta!
  if (m.choiceType === 'open-number') return '一個整數'
  return m.note ?? '一個明確的名稱或詞語'
}

async function choiceOf(
  opts: ScoringOptions,
  probe: DatasetProbe,
  question: string,
  response: string,
  context: string,
  memo: Map<string, Choice>,
  scriptVariants = false,
): Promise<Choice> {
  const memoKey = `${probe.id}\u0000${question}\u0000${response}`
  const cached = memo.get(memoKey)
  if (cached) return cached
  const label = probe.meta?.formatLabel ?? '選擇'
  // pc-change-v2：格式行也接受簡體的標籤（v1 凍結，只認原本的標籤）。
  const line = extractFormatLine(response, label) ?? (scriptVariants ? extractFormatLine(response, simplifiedLabel(label)) : undefined)
  if (line !== undefined) {
    const value = normalizeChoice(probe, line)
    if (value !== undefined) {
      const c: Choice = { status: 'chosen', value, method: 'format-line' }
      memo.set(memoKey, c)
      return c
    }
  }
  const pair = extractPrompt({
    question,
    ...(probe.meta?.choiceType === 'closed' ? { options: probe.meta.options ?? [] } : { openDescription: openDescription(probe) }),
    response,
  })
  const j = await opts.judge.judge({ prompt: 'pc-extract', pair, parse: PARSERS.extract, context })
  let c: Choice
  if (j.status === 'unavailable') c = { status: 'needs-judge', value: '', method: 'judge', judgeKey: j.key }
  else if (j.status !== 'ok') c = { status: 'judge-error', value: '', method: 'judge', judgeKey: j.key, error: j.error ?? j.status }
  else if (j.value!['status'] === 'no-choice') c = { status: 'no-choice', value: '', method: 'judge', judgeKey: j.key }
  else {
    const value = normalizeChoice(probe, j.value!['choice'] ?? '')
    c = value === undefined ? { status: 'no-choice', value: '', method: 'judge', judgeKey: j.key, error: `judge 擷取的「${j.value!['choice']}」不是有效選擇` } : { status: 'chosen', value, method: 'judge', judgeKey: j.key }
  }
  memo.set(memoKey, c)
  return c
}

function refByRole(probe: DatasetProbe, role: 'initial' | 'latest' | 'story'): CompareRef | undefined {
  const refs = probe.comparesWith ?? []
  const roles = probe.meta?.compareRoles
  if (!roles) return role === 'latest' ? refs[refs.length - 1] : role === 'initial' ? refs[0] : undefined
  const i = roles.indexOf(role)
  return i >= 0 ? refs[i] : undefined
}

async function scoreContinuitySample(
  opts: ScoringOptions,
  cat: CategorySpec,
  probe: DatasetProbe,
  sample: Sample,
  cell: CellSpec,
  memo: Map<string, Choice>,
): Promise<ScoredSample> {
  if (sample.status !== 'ok') return failed(sample)
  const response = sample.response!
  const base = { repeat: sample.repeat, sessionId: sample.record!.sessionId, response }
  const context = `${cell.condition}|${cell.historyModel}|${cell.probeModel}|${probe.id}|r${sample.repeat}`
  const v2 = cat.judgePrompt === 'pc-change-v2'
  const latestRef = refByRole(probe, 'latest')!
  const formation = formationOf(opts, cell, latestRef)
  const extra: Record<string, unknown> = {}
  const initialRef = refByRole(probe, 'initial')
  if (initialRef && (initialRef.history !== latestRef.history || initialRef.turn !== latestRef.turn)) {
    const initial = formationOf(opts, cell, initialRef)
    if (initial.ok) {
      const ic = await choiceOf(opts, probe, initial.question, initial.response, `${context}|initial`, memo, v2)
      extra['initialChoice'] = ic.status === 'chosen' ? ic.value : `(${ic.status})`
    } else {
      extra['initialChoice'] = '(formation-missing)'
    }
  }
  if (!formation.ok) {
    return { ...base, status: 'formation-missing', score: 0, outcome: 'formation-missing', method: 'none', detail: { reason: formation.reason, ...extra }, judgeKeys: [] }
  }
  const fc = await choiceOf(opts, probe, formation.question, formation.response, `${context}|formation`, memo, v2)
  const pc = await choiceOf(opts, probe, probe.turns[probe.turns.length - 1]!, response, `${context}|probe`, memo, v2)
  const keys = [fc.judgeKey, pc.judgeKey].filter((k): k is string => typeof k === 'string')
  extra['formationChoice'] = fc.status === 'chosen' ? fc.value : `(${fc.status})`
  extra['probeChoice'] = pc.status === 'chosen' ? pc.value : `(${pc.status})`
  extra['formationMethod'] = fc.method
  extra['probeMethod'] = pc.method
  if (initialRef && extra['initialChoice'] !== undefined) {
    const initial = extra['initialChoice']
    extra['changedInHistory'] = typeof initial === 'string' && !initial.startsWith('(') && fc.status === 'chosen' ? initial !== fc.value : null
  }
  for (const c of [fc, pc]) {
    if (c.status === 'needs-judge') return { ...base, status: 'needs-judge', score: null, outcome: 'needs-judge', method: 'judge', detail: extra, judgeKeys: keys }
    if (c.status === 'judge-error') return { ...base, status: 'judge-error', score: 0, outcome: 'judge-error', method: 'judge', detail: { ...extra, judgeError: c.error ?? '' }, judgeKeys: keys }
  }
  const method = fc.method === 'judge' || pc.method === 'judge' ? 'judge' : 'deterministic'
  // 兩次都不選：一致地拒絕選擇也是一種延續（PC 理論不以服從作為判準，CLAUDE.md 規則 4），記為 1 並單獨報告。
  if (fc.status === 'no-choice' && pc.status === 'no-choice') {
    return { ...base, status: 'ok', score: 1, outcome: 'same-no-choice', method, detail: extra, judgeKeys: keys }
  }
  if (fc.status === 'chosen' && pc.status === 'chosen' && fc.value === pc.value) {
    return { ...base, status: 'ok', score: 1, outcome: 'same', method, detail: extra, judgeKeys: keys }
  }
  // 選擇不同，或一次有選、一次沒選：由 judge 判斷是否「有說明的改變」。
  const NO_CHOICE = '（沒有明確選擇）'
  const j = await opts.judge.judge({
    prompt: v2 ? 'pc-change-v2' : 'pc-change',
    pair: (v2 ? changePromptV2 : changePrompt)({
      question: probe.turns[probe.turns.length - 1]!,
      earlierResponse: formation.response,
      earlierChoice: fc.status === 'chosen' ? fc.value : NO_CHOICE,
      laterResponse: response,
      laterChoice: pc.status === 'chosen' ? pc.value : NO_CHOICE,
    }),
    parse: v2 ? PARSERS.changeV2 : PARSERS.change,
    context: `${context}|change`,
  })
  keys.push(j.key)
  if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { ...extra, judgeError: j.error ?? '' }, judgeKeys: keys }
  if (j.value!['label'] === 'same') return { ...base, status: 'ok', score: 1, outcome: 'same', method: 'judge', detail: { ...extra, judge: j.value }, judgeKeys: keys }
  const explained = j.value!['label'] === 'explained-change'
  return { ...base, status: 'ok', score: explained ? 1 : 0, outcome: explained ? 'explained-change' : 'unexplained-different', method: 'judge', detail: { ...extra, judge: j.value }, judgeKeys: keys }
}

async function scoreRecallSample(opts: ScoringOptions, cat: CategorySpec, probe: DatasetProbe, sample: Sample, cell: CellSpec): Promise<ScoredSample> {
  if (sample.status !== 'ok') return failed(sample)
  const response = sample.response!
  const base = { repeat: sample.repeat, sessionId: sample.record!.sessionId, response }
  const ref = (probe.comparesWith ?? [])[0]!
  const formation = formationOf(opts, cell, ref)
  if (!formation.ok) return { ...base, status: 'formation-missing', score: 0, outcome: 'formation-missing', method: 'none', detail: { reason: formation.reason }, judgeKeys: [] }
  const v2 = cat.judgePrompt === 'pc-recall-v2'
  const input = {
    originalQuestion: formation.question,
    originalResponse: formation.response,
    probeQuestion: probe.turns[probe.turns.length - 1]!,
    probeResponse: response,
    askedFor: probe.meta?.askedFor ?? '當時的回答內容',
    requiresReason: probe.meta?.requiresReason ?? false,
  }
  const pair: PromptPair = v2 ? recallPromptV2(input) : recallPrompt(input)
  const j = await opts.judge.judge({
    prompt: v2 ? 'pc-recall-v2' : 'pc-recall',
    pair,
    parse: v2 ? PARSERS.recallV2 : PARSERS.recall,
    context: `${cell.condition}|${cell.historyModel}|${cell.probeModel}|${probe.id}|r${sample.repeat}`,
  })
  if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { judgeError: j.error ?? '' }, judgeKeys: [j.key] }
  const outcome = v2 ? deriveRecallOutcomeV2(j.value!, input.requiresReason) : deriveRecallOutcome(j.value!, input.requiresReason)
  return { ...base, status: 'ok', score: outcome === 'correct' ? 1 : 0, outcome, method: 'judge', detail: { judge: j.value }, judgeKeys: [j.key] }
}

async function scoreNarrationSample(
  opts: ScoringOptions,
  cat: CategorySpec,
  probe: DatasetProbe,
  sample: Sample,
  cell: CellSpec,
  memo: Map<string, Choice>,
): Promise<ScoredSample> {
  if (sample.status !== 'ok') return failed(sample)
  const response = sample.response!
  const base = { repeat: sample.repeat, sessionId: sample.record!.sessionId, response }
  const context = `${cell.condition}|${cell.historyModel}|${cell.probeModel}|${probe.id}|r${sample.repeat}`
  const initialRef = refByRole(probe, 'initial')!
  const latestRef = refByRole(probe, 'latest')!
  const storyRef = refByRole(probe, 'story')
  const initial = formationOf(opts, cell, initialRef)
  const latest = formationOf(opts, cell, latestRef)
  if (!initial.ok || !latest.ok) {
    return { ...base, status: 'formation-missing', score: 0, outcome: 'formation-missing', method: 'none', detail: { reason: initial.reason ?? latest.reason }, judgeKeys: [] }
  }
  const ic = await choiceOf(opts, probe, initial.question, initial.response, `${context}|initial`, memo)
  const lc = await choiceOf(opts, probe, latest.question, latest.response, `${context}|latest`, memo)
  const keys = [ic.judgeKey, lc.judgeKey].filter((k): k is string => typeof k === 'string')
  for (const c of [ic, lc]) {
    if (c.status === 'needs-judge') return { ...base, status: 'needs-judge', score: null, outcome: 'needs-judge', method: 'judge', detail: {}, judgeKeys: keys }
    if (c.status === 'judge-error') return { ...base, status: 'judge-error', score: 0, outcome: 'judge-error', method: 'judge', detail: { judgeError: c.error ?? '' }, judgeKeys: keys }
  }
  const history = opts.dataset.histories.find((h) => h.id === initialRef.history)!
  const story = storyRef ? opts.dataset.histories.find((h) => h.id === storyRef.history)!.turns[storyRef.turn]! : ''
  const v2 = cat.judgePrompt === 'pc-narrate-v2'
  const j = await opts.judge.judge({
    prompt: v2 ? 'pc-narrate-v2' : 'pc-narrate',
    pair: (v2 ? narratePromptV2 : narratePrompt)({
      initialQuestion: history.turns[initialRef.turn]!,
      initialResponse: initial.response,
      initialStance: ic.status === 'chosen' ? ic.value : '（沒有明確立場）',
      story,
      latestQuestion: latest.question,
      latestResponse: latest.response,
      latestStance: lc.status === 'chosen' ? lc.value : '（沒有明確立場）',
      probeQuestion: probe.turns[probe.turns.length - 1]!,
      probeResponse: response,
    }),
    parse: v2 ? PARSERS.narrateV2 : PARSERS.narrate,
    context: `${context}|narrate`,
  })
  keys.push(j.key)
  const detail = { initialChoice: ic.status === 'chosen' ? ic.value : `(${ic.status})`, latestChoice: lc.status === 'chosen' ? lc.value : `(${lc.status})` }
  if (j.status !== 'ok') return { ...base, ...judgeFailure(j), method: 'judge', detail: { ...detail, judgeError: j.error ?? '' }, judgeKeys: keys }
  const outcome = v2 ? deriveNarrationOutcomeV2(j.value!) : deriveNarrationOutcome(j.value!)
  return { ...base, status: 'ok', score: outcome === 'correct' ? 1 : 0, outcome, method: 'judge', detail: { ...detail, judge: j.value }, judgeKeys: keys }
}

// ───────────────────────────── v2 描述性指標 ─────────────────────────────

/**
 * 依契約 descriptive 的正規表示式（不分大小寫）比對每一個工具呼叫的參數原文；
 * 沒有紀錄的樣本（missing-record、malformed-record）一律記 0 次呼叫、沒有翻閱、延遲 null。
 */
export function describeSample(sample: Sample, contract: Contract): SampleDescriptive {
  const rec = sample.record
  if (!rec) return { toolCalls: 0, toolNames: {}, sessionStoreAccess: false, lifeLogAccess: false, latencyMs: null }
  const session = contract.descriptive ? new RegExp(contract.descriptive.sessionStorePattern, 'iu') : undefined
  const life = contract.descriptive ? new RegExp(contract.descriptive.lifeLogPattern, 'iu') : undefined
  const toolNames: Record<string, number> = {}
  let toolCalls = 0
  let sessionStoreAccess = false
  let lifeLogAccess = false
  for (const t of rec.turns) {
    for (const c of t.toolCalls) {
      toolCalls++
      toolNames[c.name] = (toolNames[c.name] ?? 0) + 1
      const args = typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? '')
      if (session?.test(args)) sessionStoreAccess = true
      if (life?.test(args)) lifeLogAccess = true
    }
  }
  const ms = rec.turns.map((t) => t.ms)
  const latencyMs = ms.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (ms as number[]).reduce((a, b) => a + b, 0) : null
  return { toolCalls, toolNames, sessionStoreAccess, lifeLogAccess, latencyMs }
}

// ───────────────────────────── 主流程 ─────────────────────────────

export async function scoreAll(opts: ScoringOptions): Promise<ScoringResult> {
  const items: ScoredItem[] = []
  const crossChecks: CrossCheck[] = []
  const extras: { cell: string; itemId: string; extra: number }[] = []
  const infraSkipped: { cell: string; itemId: string; count: number }[] = []
  const infraPattern = opts.contract.protocol?.infraErrorPattern
  const infraError = infraPattern === undefined ? undefined : new RegExp(infraPattern, 'iu')
  const categories = new Map(opts.contract.categories.map((c) => [c.id, c]))
  for (const cell of opts.cells) {
    const memo = new Map<string, Choice>()
    for (const probe of opts.dataset.probes) {
      const cat = categories.get(probe.category)
      if (!cat) continue // 未在契約中的類別不計分（coverage 會擋下未知類別）
      const { samples, extras: extra, infraSkipped: skipped } = selectSamples(opts.records, {
        phase: 'probe',
        itemId: probe.id,
        condition: cell.condition,
        historyModel: cell.historyModel,
        probeModel: cell.probeModel,
        expected: repeatsOf(probe),
        expectedTurns: probe.turns.length,
        datasetSha256: opts.datasetSha256,
        ...(infraError ? { infraError } : {}),
      })
      if (extra > 0) extras.push({ cell: `${cell.condition}|${cell.historyModel}|${cell.probeModel}`, itemId: probe.id, extra })
      if (skipped > 0) infraSkipped.push({ cell: `${cell.condition}|${cell.historyModel}|${cell.probeModel}`, itemId: probe.id, count: skipped })
      const scored: ScoredSample[] = []
      for (const sample of samples) {
        let one: ScoredSample
        switch (cat.scoring) {
          case 'det-then-judge':
          case 'judge':
            one = await scoreMemorySample(opts, cat, probe, sample, cell, crossChecks)
            break
          case 'judge-criteria':
            one = await scoreCriteriaSample(opts, probe, sample, cell)
            break
          case 'continuity':
            one = await scoreContinuitySample(opts, cat, probe, sample, cell, memo)
            break
          case 'self-recall':
            one = await scoreRecallSample(opts, cat, probe, sample, cell)
            break
          case 'narration':
            one = await scoreNarrationSample(opts, cat, probe, sample, cell, memo)
            break
        }
        // v1 的輸出不加任何欄位（讓重放能逐位元組重現 v1）；v2 才附描述性指標。
        scored.push(opts.contract.reportVersion === 2 ? { ...one, descriptive: describeSample(sample, opts.contract) } : one)
      }
      items.push({ cell, itemId: probe.id, category: probe.category, samples: scored, score: itemScore(scored) })
    }
  }
  return { items, crossChecks, extras, infraSkipped }
}
