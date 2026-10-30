/**
 * RD 階段的紀錄與經驗記憶（純函式，依賴 LifeStore 但不依賴 DSH，可單獨測試）。
 *
 * - `rd/decision`：行動前的處境描述、候選、口述信心、經驗修正的每一項數值、選擇與當時的自我模型版本。
 * - `rd/outcome`：對某個決定的事後比對：實際做了什麼、發生了什麼、是否符合預測、回報與教訓。
 * JitRL 的記憶 (s, a, G) 從這兩種事件推導，不另外保存，所以回報可以在之後重新評估。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import type { ReplayCase } from './replay.ts'
import { extractJson } from '../recall/aux.ts'
import { clip, clipEnds, heardText, isHeard, replyOf } from '../recall/retrieve.ts'
import { formatDay, type Significance } from '../self/state.ts'
import type { Deliberation } from './aux.ts'
import { discountedReturns, jaccard, termSet, type Candidate, type Correction, type Experience, type Neighbor, type Params, type Scored } from './jitrl.ts'

export const DECISION_KIND = 'rd/decision'
export const OUTCOME_KIND = 'rd/outcome'
/** 整合期依現在的自我重新評估某個結果的回報（H2；ADR-0002 D3 的衝突）。 */
export const REVALUATION_KIND = 'rd/revaluation'

export interface DecisionData {
  readonly cue: string
  readonly situation: string
  readonly candidates: readonly Scored[]
  /** 選出的候選；全部都被扣除時為 -1（2026-10-30 起；之前退回全部候選中分數最高的）。 */
  readonly chosen: number
  /** V̂(s)；沒有可用的經驗時為 null。 */
  readonly value: number | null
  readonly neighbors: readonly { readonly id: string; readonly similarity: number; readonly judged?: boolean; readonly ret: number }[]
  /** 提示中列出的經驗編號 → rd/decision id。 */
  readonly shown: Readonly<Record<string, string>>
  readonly jitrl: boolean
  readonly params: Params
  /** 思考當時的自我模型與人生敘事版本（PC 的狀態）。 */
  readonly selfVersion: number
  readonly narrativeVersion?: number
  /** 動能：此刻推動這次行動的是什麼（H-E），個體自己寫的；舊紀錄沒有這個欄位。 */
  readonly drive?: string
  /** 被這個處境觸發的勢能（self/energy.ts 的 key，或 goal:<目標 id>）。 */
  readonly activated?: readonly string[]
  /** 這次涉及的人與各自與這次有關的事（ADR-0002 D17）；舊紀錄沒有這個欄位。 */
  readonly people?: readonly { readonly who: string; readonly relevant: readonly string[] }[]
  /**
   * D20 第三版：需要強制判斷的扣除有幾個；判斷不合格或呼叫失敗時的原因（這時維持原本的扣除）。舊紀錄沒有這個欄位。
   * 重問過的，兩次的問題都留著（「第 1 次：…；第 2 次：…」）；2026-10-30 之前的紀錄只有第二次的問題。
   */
  readonly review?: { readonly required: number; readonly failed?: string }
}

/** 行動留下的懸念的種類（H-E 第三版）：答應的事、在等的事、還沒解開的不安。 */
export type LeftType = 'promise' | 'waiting' | 'unresolved'

export interface OutcomeData {
  readonly decision: string
  readonly didAction: string
  readonly didKind: string
  readonly actual: string
  readonly matched: 'yes' | 'partly' | 'no'
  readonly error: string
  readonly reward: number
  readonly reason: string
  readonly lesson: string
  readonly feeling?: string
  readonly significance?: Significance
  /** H-E：這次行動釋放了哪件懸著的事（說明與 key）、留下了什麼新的懸念（個體自己寫的）；舊紀錄沒有這些欄位。 */
  readonly released?: string
  readonly releasedItems?: readonly string[]
  /** 第一、二版：一句話（可能綁了幾件事）。第三版起另有 leftItems，逐件記錄，left 是它們的合併文字（顯示用）。 */
  readonly left?: string
  readonly leftItems?: readonly { readonly text: string; readonly type: LeftType }[]
  readonly selfVersion: number
  readonly heard: string
  /**
   * 暫時的比對：對方在我回覆之後沉默了一段時間，先以「對方沒有再說話」比對，讓這一回合答應的事也成為懸著的事。
   * 對方之後回話時會再正式比對一次；同一個決定以最新的比對為準（experiences）。舊紀錄沒有這個欄位。
   */
  readonly provisional?: boolean
}

/**
 * 事後比對沒有結果（改進清單第 2 項）：兩次的輸出都不合格（parseOutcome 的 problems），或比對的呼叫失敗。
 * 這時不寫 rd/outcome，那個決定沒有回報，不成為經驗；problems 依序是第一次與第二次的問題。
 */
export const OUTCOME_FAILED_KIND = 'rd/outcome-failed'

export interface OutcomeFailedData {
  readonly decision: string
  readonly problems: readonly string[]
  /** 暫時的比對（對方還沒有回話）；沉默計時器不再為這個決定重做暫時的比對。 */
  readonly provisional?: true
}

export interface RevaluationData {
  readonly outcome: string
  readonly decision: string
  readonly reward: number
  /** 被取代的回報（原本的事後比對）。 */
  readonly previous: number | null
  readonly reason: string
  /** 重新評估時的自我模型版本。 */
  readonly selfVersion: number
  readonly integration: string
}

/**
 * 從生命日誌推導 JitRL 的記憶：每個 session 內依時間計算折扣回報，只保留回報已知的決定。
 * 回報以最新的評估為準：事後比對之後，整合期可能依改變後的自我重新評估（rd/revaluation）。
 * JitRL 論文的回報來自固定的評估者；這裡的評估者是個體自己，它的價值會改變，所以舊的回報可以重新評估（本專案的延伸）。
 */
export function experiences(life: LifeStore, gamma: number): Experience[] {
  const outcomes = new Map<string, OutcomeData>()
  for (const event of life.all(OUTCOME_KIND)) {
    const data = event.data as OutcomeData
    outcomes.set(data.decision, data) // 同一個決定若被評估多次，以最新的為準
  }
  for (const event of life.all(REVALUATION_KIND)) {
    const r = event.data as RevaluationData
    const outcome = outcomes.get(r.decision)
    if (outcome) outcomes.set(r.decision, { ...outcome, reward: r.reward })
  }
  const bySession = new Map<string, LifeEvent[]>()
  for (const event of life.all(DECISION_KIND)) {
    if (!event.session) continue
    const list = bySession.get(event.session) ?? []
    list.push(event)
    bySession.set(event.session, list)
  }
  const out: Experience[] = []
  for (const decisions of bySession.values()) {
    const returns = discountedReturns(decisions.map((d) => outcomes.get(d.id)?.reward), gamma)
    decisions.forEach((event, i) => {
      const ret = returns[i]
      const outcome = outcomes.get(event.id)
      if (ret === undefined || !outcome) return
      const data = event.data as DecisionData
      const planned = data.candidates[data.chosen]
      const excludedThen = data.candidates.filter((c) => c.excluded).map((c) => ({ action: c.action, kind: c.kind, reason: c.excludeReason ?? '' }))
      // 經驗中的行動是實際採取的做法；主模型可能沒有照準備去做。
      const action = outcome.didAction || planned?.action || ''
      if (!action) return
      out.push({
        id: event.id,
        ts: event.ts,
        cue: data.cue,
        situation: data.situation,
        action,
        kind: outcome.didAction ? outcome.didKind : (planned?.kind ?? '其他'),
        ret,
        outcome: [outcome.actual, outcome.lesson && `教訓：${outcome.lesson}`].filter(Boolean).join('；'),
        session: event.session,
        ...(excludedThen.length > 0 ? { excludedThen } : {}),
        ...(outcome.matched ? { matched: outcome.matched } : {}),
      })
    })
  }
  return out
}

/**
 * 本 session 最近一個還沒有事後比對、而且就是上一回合的決定。
 * 決定之後只該有它所回應的那一句對方的話；若已經隔了更多回合（例如中間的思考失敗），
 * 現在這句話不是它的結果，就不比對。
 */
export function openDecision(life: LifeStore, session: string): LifeEvent | undefined {
  const last = life.inSession(session, DECISION_KIND, 'desc', 1)[0]
  // 只有暫時的比對時，對方回話後仍要正式比對一次。
  if (!last || life.referencing(last.id, OUTCOME_KIND).some((o) => !(o.data as OutcomeData).provisional)) return undefined
  const heard = life.following(session, ['dsh/user/message'], last.seq, 10).filter(isHeard)
  return heard.length === 1 ? last : undefined
}

/**
 * 決定所在的那一回合：決定之後對方的第一句話（決定在它被寫進日誌之前就做出），
 * 以及到對方下一句話之前我最後說出口的回覆。
 */
export function decisionTurn(life: LifeStore, decision: LifeEvent): { heard?: LifeEvent; reply?: LifeEvent; replyText: string } {
  if (!decision.session) return { replyText: '' }
  let heard: LifeEvent | undefined
  let reply: LifeEvent | undefined
  let replyText = ''
  for (const event of life.following(decision.session, ['dsh/user/message', 'dsh/assistant/message'], decision.seq, 200)) {
    if (isHeard(event)) {
      if (heard) break
      heard = event
    } else if (event.kind === 'dsh/assistant/message' && heard) {
      const said = replyOf(event)
      if (said) {
        reply = event
        replyText = said
      }
    }
  }
  return { ...(heard ? { heard } : {}), ...(reply ? { reply } : {}), replyText }
}

/** 決定之後那一回合我實際說出口的話。 */
export function turnReply(life: LifeStore, decision: LifeEvent): string {
  return decisionTurn(life, decision).replyText
}

/** 思考提示中列出的相關經驗：依對方的話與當時的話的相似度，取前 n 個。 */
export function relevantExperiences(cue: string, memory: readonly Experience[], n: number): Experience[] {
  const terms = termSet(cue)
  return memory
    .map((e) => ({ e, s: jaccard(terms, termSet(`${e.cue} ${e.situation}`)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.ts - a.e.ts)
    .slice(0, n)
    .map((x) => x.e)
}

/**
 * 回憶帶進這一步的經歷中，我當時做過的決定：同一個 session、決定的 cue 就是對方那句話，由新到舊。
 * 自動回憶是個體自己對「相關的過往」的判斷，那些回合中做了什麼、結果如何，就是過去類似處境的結果，也是 H0「−RD」扣除的依據。
 * relevantExperiences 只比對剛說的那一句；新的說法與舊的處境常常沒有共同的詞。
 * rd-v1 重跑（rd2）的探針中，17 次思考有 4 次沒有列出任何經驗，例如 q04：歷史中有 21 次事後比對，思考時卻「沒有找到類似的經驗」。
 */
export function experiencesOfRecalled(life: LifeStore, memory: readonly Experience[], recalledIds: readonly string[]): Experience[] {
  const wanted = new Set<string>()
  for (const id of recalledIds) {
    const e = life.get(id)
    if (e?.session && isHeard(e)) wanted.add(`${e.session}\u0000${heardText(e)}`)
  }
  if (wanted.size === 0) return []
  return memory.filter((x) => x.session && wanted.has(`${x.session}\u0000${x.cue.trim()}`)).sort((a, b) => b.ts - a.ts)
}

/** 思考時列出的經驗：回憶帶進來的經歷中做過的決定在前，其次是與剛說的話用詞相近的；不重複，最多 n 個。 */
export function shownExperiences(fromRecall: readonly Experience[], lexical: readonly Experience[], n: number): Experience[] {
  const out: Experience[] = []
  for (const e of [...fromRecall, ...lexical]) {
    if (out.length >= n) break
    if (!out.some((x) => x.id === e.id)) out.push(e)
  }
  return out
}

/**
 * D20 第三版：扣除本身會被經驗改變，由模型判斷，但**強制判斷**（使用者 2026-10-30「應該交給模型判斷設計沒問題,
 * 有問題的是沒有作強制要求判斷」）。第一、二版的 revised 是選填的：本機模型從不寫，過去的扣除反而成了先例（rd-v3、dev11）。
 *
 * 程式只決定「何時」需要判斷：被扣除的候選，在類似處境的經驗中有同一類（kind）的紀錄（當時扣除了同類做法，或做了同類做法）。
 * 判斷的內容由模型決定（REVISION_SYSTEM），答案由 parseJudgments 驗證。
 */
export interface ExclusionReview {
  /** 候選在思考結果中的位置（0 起算）。 */
  readonly index: number
  /** 類似處境中同一類的經驗，由新到舊。 */
  readonly evidence: readonly Experience[]
}

export function exclusionReviews(candidates: readonly Candidate[], related: readonly Experience[], max = 4): ExclusionReview[] {
  const recent = [...new Map(related.map((e) => [e.id, e])).values()].sort((a, b) => b.ts - a.ts)
  return candidates.flatMap((c, index) => {
    if (!c.excluded) return []
    const evidence = recent.filter((e) => e.kind === c.kind || (e.excludedThen ?? []).some((x) => x.kind === c.kind)).slice(0, max)
    return evidence.length > 0 ? [{ index, evidence }] : []
  })
}

/** 判斷的輸入：處境、每一個需要判斷的扣除與它的同類經驗（X 編號對應 rd/decision id）。 */
export function renderExclusionReview(situation: string, candidates: readonly Candidate[], reviews: readonly ExclusionReview[]): { readonly text: string; readonly labels: Map<string, string> } {
  const labels = new Map<string, string>()
  const label = (id: string): string => {
    for (const [k, v] of labels) if (v === id) return k
    const k = `X${labels.size + 1}`
    labels.set(k, id)
    return k
  }
  const predicted = (m: Experience['matched']) => (m === 'no' ? '預測沒有成真' : m === 'partly' ? '預測只部分成真' : m === 'yes' ? '預測成真' : '預測成真與否沒有記錄')
  const lines = [`## 眼前的處境`, clip(situation, 400), '', '## 你扣除的做法，以及類似處境中同一類的經驗']
  for (const r of reviews) {
    const c = candidates[r.index]!
    lines.push('', `${r.index + 1}. ${c.action}（${c.kind}）｜你扣除的理由：${c.excludeReason ?? '（沒有寫）'}`)
    for (const e of r.evidence) {
      const excluded = (e.excludedThen ?? []).filter((x) => x.kind === c.kind).map((x) => x.action)
      const what = excluded.length > 0 ? `當時扣除了同類的「${clip(excluded[0]!, 60)}」，改做「${clip(e.action, 60)}」` : `當時做了同類的「${clip(e.action, 60)}」`
      lines.push(`   - ${label(e.id)}｜${formatDay(e.ts)}｜${what}｜結果：${clip(e.outcome, 120)}｜${predicted(e.matched)}｜回報 ${e.ret.toFixed(2)}`)
    }
  }
  return { text: lines.join('\n'), labels }
}

export interface Judgment {
  readonly index: number
  readonly decision: 'keep' | 'lift'
  readonly why: string
  /** 依據的經驗（rd/decision id）。 */
  readonly refs: readonly string[]
}

/** 驗證判斷：每一個需要判斷的做法剛好一筆，decision 是 keep 或 lift，why 不是空的，refs 至少引用一個列出的經驗。 */
export function parseJudgments(raw: string, reviews: readonly ExclusionReview[], labels: ReadonlyMap<string, string>): { readonly ok: true; readonly judgments: readonly Judgment[] } | { readonly ok: false; readonly problems: readonly string[] } {
  const obj = extractJson(raw) as { judgments?: unknown } | undefined
  const list = Array.isArray(obj?.judgments) ? (obj!.judgments as unknown[]) : undefined
  if (!list) return { ok: false, problems: ['不是含有 judgments 的 JSON 物件'] }
  const problems: string[] = []
  const judgments: Judgment[] = []
  for (const r of reviews) {
    const n = r.index + 1
    const own = new Set(r.evidence.map((e) => e.id))
    const found = list.filter((j): j is Record<string, unknown> => typeof j === 'object' && j !== null && Number((j as Record<string, unknown>)['candidate']) === n)
    if (found.length !== 1) {
      problems.push(found.length === 0 ? `做法 ${n} 沒有判斷` : `做法 ${n} 有 ${found.length} 筆判斷`)
      continue
    }
    const j = found[0]!
    const decision = j['decision']
    const why = typeof j['why'] === 'string' ? j['why'].replace(/\s+/g, ' ').trim().slice(0, 300) : ''
    const refs = (Array.isArray(j['refs']) ? j['refs'] : []).map((x) => labels.get(String(x).trim().toUpperCase())).filter((id): id is string => id !== undefined && own.has(id))
    if (decision !== 'keep' && decision !== 'lift') problems.push(`做法 ${n} 的 decision 不是 keep 或 lift`)
    if (!why) problems.push(`做法 ${n} 沒有寫理由`)
    if (refs.length === 0) problems.push(`做法 ${n} 沒有引用列出的經驗`)
    if ((decision === 'keep' || decision === 'lift') && why && refs.length > 0) judgments.push({ index: r.index, decision, why, refs: [...new Set(refs)] })
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, judgments }
}

/** 套用判斷：lift 解除扣除（原本的理由保留在 judgment.reason），keep 維持；兩者都記下判斷。 */
export function applyJudgments<C extends Candidate>(candidates: readonly C[], judgments: readonly Judgment[]): C[] {
  return candidates.map((c, i): C => {
    const j = judgments.find((x) => x.index === i)
    if (!j) return c
    if (j.decision === 'keep') return { ...c, judgment: { decision: 'keep', why: j.why, refs: j.refs } }
    const { excluded: _excluded, excludeReason, ...rest } = c
    return { ...rest, judgment: { decision: 'lift', why: j.why, refs: j.refs, ...(excludeReason ? { reason: excludeReason } : {}) } } as unknown as C
  })
}

/** revision＝D20：每筆經驗附上當時扣除、沒有做的做法與理由；消融（patches/no-revision.yml）時不附。 */
export function renderExperiences(shown: readonly Experience[], revision = true): string {
  if (shown.length === 0) return '沒有找到類似的經驗。'
  return shown
    .map((e, i) => {
      const line = `E${i + 1}｜${formatDay(e.ts)}｜處境：${clip(e.situation, 160)}｜我當時：${clip(e.action, 100)}（${e.kind}）｜結果：${clip(e.outcome, 160)}｜回報 ${e.ret.toFixed(2)}`
      const excluded = revision ? (e.excludedThen ?? []).slice(0, 2) : []
      if (excluded.length === 0) return line
      // D20 第二版：附上當時的預測有沒有成真（個體自己在事後比對時判斷的）。rd-v3 的本機模型把對方的失望評為 0～+0.78，
      // 只看回報時，當時的扣除都像是「結果很好」，成了照舊扣除的先例；它自己卻寫了預測沒有成真。
      const predicted = e.matched === 'no' ? '｜扣除之後，當時的預測沒有成真' : e.matched === 'partly' ? '｜扣除之後，當時的預測只部分成真' : ''
      return `${line}｜當時扣除：${excluded.map((x) => `${clip(x.action, 60)}${x.reason ? `（${clip(x.reason, 60)}）` : ''}`).join('；')}${predicted}`
    })
    .join('\n')
}

/**
 * 準備訊息裡的處境不帶「相關的記憶」欄：那是思考時的摘要，可能不完整。
 * dev2 中，它把一個要列出全部醫囑的問題框成只有膝傷，主模型照著回答，漏掉了回憶裡有的另一項（memory-v2 q13）。
 * 決定紀錄（rd/decision）仍保留完整的處境。
 */
export function preparedSituation(situation: string): string {
  return situation
    .split('｜')
    .filter((part) => !part.trim().startsWith('相關的記憶'))
    .join('｜')
}

/** 準備訊息：處境、候選（含經驗修正）、選擇與相關經驗。放在對方的話之後，主模型據此行動。 */
export function renderPreparation(delib: Deliberation, correction: Correction, near: readonly Neighbor[], subtraction = true): string {
  const lines = [
    '（準備：這是你在回應之前的思考與行動準備，不是對方說的話，對方看不到。準備只是方向；回應的內容以回憶與對話為準，不要只用這裡提到的細節。）',
    `處境：${preparedSituation(delib.situation)}`,
    // 涉及兩個人以上時（ADR-0002 D17）：列出每個人，以及思考時想到、各自與這次有關的事，當作「至少要顧到」的底線；
    // 摘要可能不完整（見 preparedSituation），所以明寫回憶中還有的也要用。只涉及一個人時不列，避免把回應框窄。
    ...(delib.people.length >= 2
      ? [
          '這次涉及的人，以及你思考時想到、各自與這次有關的事。回應時每一項都要顧到，包括題目沒有問到、但也在場的人（例如對方自己）；回憶中還有的也要用：',
          ...delib.people.map((p) => `- ${p.who}${p.relevant.length > 0 ? `：${p.relevant.join('；')}` : ''}`),
        ]
      : []),
    ...(delib.drive ? [`推動你的：${delib.drive}`] : []),
    '你考慮過的做法：',
  ]
  correction.scored.forEach((c, i) => {
    const basis = c.support > 0 ? `${c.support} 個相符的經驗` : c.optimistic ? '沒有相符的經驗，傾向嘗試' : '沒有相符的經驗'
    const adjust = c.q === null ? '' : `｜經驗修正 ${c.normalized >= 0 ? '+' : ''}${c.normalized.toFixed(2)}（${basis}）`
    const subtracted = c.excluded ? `｜你扣除了這個做法${c.excludeReason ? `：${c.excludeReason}` : ''}` : ''
    const revised =
      c.judgment?.decision === 'lift'
        ? `｜你看過經驗之後解除了扣除：${c.judgment.why}${c.judgment.reason ? `（原本扣除的理由：${c.judgment.reason}）` : ''}`
        : c.judgment?.decision === 'keep'
          ? `｜看過經驗之後維持扣除：${c.judgment.why}`
          : c.revised
            ? `｜你依經驗改變了扣除：${c.revised}`
            : ''
    lines.push(`${i + 1}. ${c.action}（${c.kind}）——預期：${c.prediction}｜你的傾向 ${Math.round(c.confidence)}%${adjust}${subtracted}${revised}`)
  })
  const chosen = correction.scored[correction.chosen]
  if (chosen) lines.push(`你準備：第 ${correction.chosen + 1} 個做法${subtraction ? '（扣除不做的之後剩下的）' : ''}。你預期：${chosen.prediction}`)
  else if (correction.scored.length > 0) lines.push('你扣除了全部的做法，沒有準備好的做法；怎麼回應，由你在回應時決定。')
  const shown = near.slice(0, 3)
  if (shown.length > 0) {
    lines.push('過去類似處境的經驗：')
    for (const n of shown) {
      const e = n.experience
      lines.push(`- ${formatDay(e.ts)}｜我當時：${clip(e.action, 100)}｜結果：${clipEnds(e.outcome, 160)}｜回報 ${e.ret.toFixed(2)}`)
    }
  }
  lines.push('（這只是準備；實際怎麼做，由你在回應時決定。）')
  return lines.join('\n')
}

/** 日誌重播的輸入（rd/replay.ts）：每個有回報的決定，連同思考時模型判定的同類處境與相同做法。 */
export function replayCases(life: LifeStore, gamma: number): ReplayCase[] {
  return experiences(life, gamma).map((experience) => {
    const d = life.get(experience.id)?.data as DecisionData | undefined
    return { experience, judged: (d?.neighbors ?? []).filter((n) => n.judged).map((n) => n.id), sameAs: d?.candidates[d.chosen]?.sameAs ?? [] }
  })
}
