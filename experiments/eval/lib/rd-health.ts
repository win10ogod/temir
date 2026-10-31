/**
 * RD 機制的健康度（dev14 規格）：強制判斷之後，思考與事後比對有多少次要重問、重問的理由、最後有多少次沒有結果；
 * 思考時列出的經驗有沒有逐筆判斷（D23）、判斷的結果；輔助呼叫的 finish 與用量有沒有記下。
 * 純函式：輸入是一個生命中依 seq 排序的事件（rd-mechanism.ts 的 lifeGroups），只讀，不呼叫 API。
 *
 * 重問的辨認：同一個目的（deliberate／outcome）連續兩次呼叫的輸入相同（rd/index.ts 重問時輸入不變，只在 system 加上說明）。
 * 重問的理由：用個體自己的解析（individual/src/rd/aux.ts）重新解析前一次的輸出，依 problems 歸類。
 *   列出的經驗編號取自重問之後的決定（rd/decision 的 shown）；沒有決定時才從紀錄的輸入找。
 *   紀錄的輸入經過 clip（換行壓成空白、最多 8000 字），經驗可能被截掉（dev14：只看行首時一個編號也找不到）。
 */
import { parseDeliberation, parseOutcome } from '../../../individual/src/rd/aux.ts'
import type { LifeRow } from './rd-mechanism.ts'

export interface Health {
  /** 思考：呼叫次數（含重問）、呼叫失敗、重問次數與理由、寫下的決定、沒有結果（rd/deliberation-failed）。 */
  deliberateCalls: number
  deliberateErrors: number
  deliberateRetries: number
  deliberateRetryReasons: Record<string, number>
  decisions: number
  deliberationFailed: number
  /** 事後比對：同上（rd/outcome、rd/outcome-failed）。 */
  outcomeCalls: number
  outcomeErrors: number
  outcomeRetries: number
  outcomeRetryReasons: Record<string, number>
  outcomes: number
  outcomeFailed: number
  /** D23：列出了經驗的決定、列出的經驗數、其中被判斷為同一類而成為鄰居的、產生它的輸出沒有逐筆判斷全部列出的經驗的決定數。 */
  withShown: number
  shown: number
  judgedNeighbors: number
  uncovered: number
  /** 候選：總數、sameAs 非空、sameExcluded 非空（ADR-0008）、JitRL 有相符的鄰居（support > 0）。 */
  candidates: number
  sameAs: number
  sameExcluded: number
  supported: number
  /** 需要強制判斷的扣除（D20 第三版）：有需要判斷的決定數、需要判斷的扣除數。 */
  reviewedDecisions: number
  reviewsRequired: number
  /**
   * ADR-0008 的強制判斷（dev15 規格，描述性）：有感受的比對與其中要記下的、要重新檢視自己的、預測落空與其中會掛心的、
   * 拒絕或不同意的、留下的懸念與其中推動我對對方做什麼的。
   */
  feelings: number
  keptFeelings: number
  reconsider: number
  missed: number
  gapOnMind: number
  declined: number
  leftItems: number
  forOther: number
  /**
   * context 模式（主 agent 以 deliberate 工具思考；context-v1 規格）：寫下的決定、寫下決定之前已經對對方說了話的、
   * 沒有在回應之前思考的回合（rd/deliberation-failed 的「沒有在回應之前」）。
   */
  contextDecisions: number
  repliedBefore: number
  skipped: number
  /** 紀錄中沿用寫死類別的欄位（候選的 kind、比對的 didKind 與 significance、懸念的 type、感受的 significance）；dev15 起應為 0。 */
  legacyFields: number
  /** 輔助呼叫（全部目的）：次數、有 usage 的、finish 的分布、usage 有思考 token 的次數與合計、思考的字數（reasoningChars）合計。 */
  auxCalls: number
  auxWithUsage: number
  finish: Record<string, number>
  withReasoningTokens: number
  reasoningTokens: number
  reasoningChars: number
}

export function emptyHealth(): Health {
  return {
    deliberateCalls: 0, deliberateErrors: 0, deliberateRetries: 0, deliberateRetryReasons: {}, decisions: 0, deliberationFailed: 0,
    outcomeCalls: 0, outcomeErrors: 0, outcomeRetries: 0, outcomeRetryReasons: {}, outcomes: 0, outcomeFailed: 0,
    withShown: 0, shown: 0, judgedNeighbors: 0, uncovered: 0, candidates: 0, sameAs: 0, sameExcluded: 0, supported: 0, reviewedDecisions: 0, reviewsRequired: 0,
    feelings: 0, keptFeelings: 0, reconsider: 0, missed: 0, gapOnMind: 0, declined: 0, leftItems: 0, forOther: 0, contextDecisions: 0, repliedBefore: 0, skipped: 0, legacyFields: 0,
    auxCalls: 0, auxWithUsage: 0, finish: {}, withReasoningTokens: 0, reasoningTokens: 0, reasoningChars: 0,
  }
}

interface AuxData {
  readonly purpose?: string
  readonly input?: string
  readonly output?: string
  readonly error?: string
  readonly finish?: string
  readonly usage?: { readonly reasoningTokens?: number } | null
  readonly reasoningChars?: number
}

interface DecisionLike {
  readonly shown?: Readonly<Record<string, string>>
  readonly neighbors?: readonly { readonly judged?: boolean }[]
  readonly candidates: readonly { readonly sameAs?: readonly string[]; readonly sameExcluded?: readonly string[]; readonly support?: number; readonly kind?: string }[]
  readonly review?: { readonly required: number }
  readonly mode?: string
  readonly repliedBefore?: boolean
}

interface OutcomeLike {
  readonly feeling?: string
  readonly keepFeeling?: boolean
  readonly reconsider?: boolean
  readonly matched?: string
  readonly gapOnMind?: boolean
  readonly declined?: boolean
  readonly didKind?: string
  readonly significance?: string
  readonly leftItems?: readonly { readonly forOther?: boolean; readonly type?: string }[]
}

/** 經驗編號對應到假的 id（只為了重新解析）。 */
function asLabels(ids: readonly string[]): Map<string, string> {
  return new Map(ids.map((id) => [id, `label:${id}`]))
}

/** 思考的輸入中列出的經驗編號（renderExperiences 的「E1｜…」；紀錄的輸入換行已壓成空白，不能只看行首）。 */
export function listedLabels(input: string): Map<string, string> {
  return asLabels([...input.matchAll(/(?:^|\s)(E\d+)｜/gu)].map((m) => m[1]!))
}

/**
 * 思考不合格的理由，歸成幾類。用的是個體現在的解析：ADR-0008 撤回了做法種類（D22），所以舊紀錄中因為種類而重問的，
 * 現在重新解析會是合格的，歸為「其他」（dev14 之前的紀錄）。
 */
export function deliberateReason(output: string, labels: ReadonlyMap<string, string>): string {
  const parsed = parseDeliberation(output, labels)
  if (parsed.ok) return parsed.deliberation.candidates.every((c) => c.excluded) ? '全部扣除' : '其他'
  const p = parsed.problems.join('；')
  if (/不是 JSON|沒有 candidates/u.test(p)) return 'JSON 不完整'
  if (/experiences|沒有判斷|sameSituation|sameAction|sameExcluded/u.test(p)) return '經驗判斷'
  if (/可用的做法/u.test(p)) return '做法不足'
  return '其他'
}

/** 事後比對不合格的理由（不檢查懸念編號；那一類由能量開時的 labels 決定，這裡歸為「其他」）。 */
export function outcomeReason(output: string): string {
  const parsed = parseOutcome(output)
  if (parsed.ok) return '其他（例如懸念編號）'
  const p = parsed.problems
  if (p.includes('不是 JSON 物件')) return 'JSON 不完整'
  return p.map((x) => x.split(' ')[0]!).join('、')
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

/** 一個生命（依 seq 排序）的健康度，累加到 h。 */
export function addHealth(h: Health, rows: readonly LifeRow[]): Health {
  const last: Partial<Record<string, AuxData>> = {}
  // 上一個決定之後的思考輸出（第一次、重問、全部扣除的重問）；決定由其中一次產生。
  let sinceDecision: string[] = []
  // 重問了、還沒歸類的前一次輸出：等到決定（用它的 shown）或沒有結果（用紀錄的輸入）時再歸類。
  let pending: AuxData[] = []
  const classify = (labels: (a: AuxData) => ReadonlyMap<string, string>) => {
    for (const a of pending) bump(h.deliberateRetryReasons, deliberateReason(a.output!, labels(a)))
    pending = []
  }
  for (const row of rows) {
    if (row.kind === 'memory/aux') {
      const a = row.data as AuxData
      h.auxCalls++
      if (a.usage) h.auxWithUsage++
      if (a.usage?.reasoningTokens !== undefined) {
        h.withReasoningTokens++
        h.reasoningTokens += a.usage.reasoningTokens
      }
      h.reasoningChars += a.reasoningChars ?? 0
      if (a.finish) bump(h.finish, a.finish)
      else if (a.error) bump(h.finish, '（呼叫失敗）')
      else bump(h.finish, '（沒有記下）')
      const purpose = a.purpose ?? ''
      if (purpose === 'deliberate' || purpose === 'outcome') {
        const before = last[purpose]
        const retry = before !== undefined && before.input === a.input && before.output !== undefined
        if (purpose === 'deliberate') {
          h.deliberateCalls++
          if (a.error) h.deliberateErrors++
          if (retry) {
            h.deliberateRetries++
            pending.push(before)
          }
          if (a.output !== undefined) sinceDecision.push(a.output)
        } else {
          h.outcomeCalls++
          if (a.error) h.outcomeErrors++
          if (retry) {
            h.outcomeRetries++
            bump(h.outcomeRetryReasons, outcomeReason(before.output!))
          }
        }
        // 重問之後的下一次呼叫不再算重問（一次只重問一次）。
        last[purpose] = retry ? undefined : a
      }
    } else if (row.kind === 'rd/decision') {
      const d = row.data as DecisionLike
      h.decisions++
      if (d.mode === 'context') {
        h.contextDecisions++
        if (d.repliedBefore) h.repliedBefore++
      }
      const labels = Object.keys(d.shown ?? {})
      classify(() => asLabels(labels))
      if (labels.length > 0) {
        h.withShown++
        h.shown += labels.length
        h.judgedNeighbors += (d.neighbors ?? []).filter((n) => n.judged).length
        // 產生這個決定的輸出要逐筆判斷了全部列出的經驗（D23）：這一步的思考輸出中，至少有一次涵蓋全部。
        if (!sinceDecision.some((o) => { const answered = experiencesIn(o); return labels.every((l) => answered.has(l)) })) h.uncovered++
      }
      sinceDecision = []
      if ((d.review?.required ?? 0) > 0) {
        h.reviewedDecisions++
        h.reviewsRequired += d.review!.required
      }
      for (const c of d.candidates) {
        h.candidates++
        if ((c.sameAs ?? []).length > 0) h.sameAs++
        if ((c.sameExcluded ?? []).length > 0) h.sameExcluded++
        if ((c.support ?? 0) > 0) h.supported++
        if (c.kind !== undefined) h.legacyFields++
      }
    } else if (row.kind === 'rd/deliberation-failed') {
      h.deliberationFailed++
      if ((row.data as { problems?: readonly string[] }).problems?.some((p) => p.startsWith('沒有在回應之前'))) h.skipped++
      classify((a) => listedLabels(a.input ?? ''))
      sinceDecision = []
    }
    else if (row.kind === 'rd/outcome') {
      const o = row.data as OutcomeLike
      h.outcomes++
      if (o.feeling) {
        h.feelings++
        if (o.keepFeeling) h.keptFeelings++
      }
      if (o.reconsider) h.reconsider++
      if (o.matched === 'no') {
        h.missed++
        if (o.gapOnMind) h.gapOnMind++
      }
      if (o.declined) h.declined++
      for (const l of o.leftItems ?? []) {
        h.leftItems++
        if (l.forOther) h.forOther++
        if (l.type !== undefined) h.legacyFields++
      }
      if (o.didKind !== undefined) h.legacyFields++
      if (o.significance !== undefined) h.legacyFields++
    } else if (row.kind === 'appraisal' && (row.data as { significance?: string }).significance !== undefined) h.legacyFields++
    else if (row.kind === 'rd/outcome-failed') h.outcomeFailed++
  }
  classify((a) => listedLabels(a.input ?? ''))
  return h
}

/** 思考輸出的 experiences 中判斷過的編號。 */
function experiencesIn(output: string): Set<string> {
  const match = output.match(/\{[\s\S]*\}/u)
  if (!match) return new Set()
  try {
    const obj = JSON.parse(match[0]) as { experiences?: { id?: unknown }[] }
    return new Set((obj.experiences ?? []).map((e) => String(e.id ?? '').toUpperCase()))
  } catch {
    return new Set()
  }
}

export const HEALTH_KINDS = ['memory/aux', 'rd/decision', 'rd/deliberation-failed', 'rd/outcome', 'rd/outcome-failed', 'appraisal'] as const

/** 預先登記的機制門檻（dev14 規格）：沒有結果的思考與事後比對，各不超過 5%。 */
export function healthVerdict(h: Health): { readonly deliberation: boolean; readonly outcome: boolean; readonly coverage: boolean } {
  const attempts = h.decisions + h.deliberationFailed
  const evaluations = h.outcomes + h.outcomeFailed
  return {
    deliberation: attempts === 0 || h.deliberationFailed / attempts <= 0.05,
    outcome: evaluations === 0 || h.outcomeFailed / evaluations <= 0.05,
    coverage: h.uncovered === 0,
  }
}
