/**
 * temir-rd：PC 循環的 RD 階段——思考後回饋、行動準備與預測（hypotheses.md H0；ADR-0002 D2–D3）。
 *
 * 每個含有對方新訊息的步驟（DSH `agent/pre-step`）：
 * 1. 事後比對（背景，不阻塞回覆）：本 session 上一個決定的預測，對照我實際說的話與對方接著說的話，
 *    依我目前的自我模型評估回報與教訓，寫成 `rd/outcome`。必填的判斷不合格時附上問題重問一次，
 *    仍不合格（或呼叫失敗）就寫成 `rd/outcome-failed`，那個決定沒有回報（parseOutcome）。
 * 2. 思考與準備：以自我狀態、自動回憶與過去類似處境的經驗為條件，產生處境描述與 3 個候選做法
 *    （預期後果、口述信心），以 JitRL 經驗修正選出做法，寫成 `rd/decision`。
 * 3. 準備訊息（source.kind=temir-rd；ingest 不為 temir 來源建立回憶索引）放在對方的話之後，主模型據此行動，
 *    也可以在行動時改變主意，事後比對會記下實際做了什麼。
 * 監聽器以 prepend 註冊在最外層：等內層（temir-recall）放入回憶訊息後才思考，所以思考看得到回憶。
 * 對方沉默（silenceMinutes 沒有新事件）時，最後一個決定先以「對方沒有再說話」做暫時的比對：
 * 這一回合答應的事成為懸著的事，閒置時的念頭與主動開口才看得到它（對方之後回話時再正式比對）。
 *
 * 步驟本身在 createRd：只依賴生命日誌與可注入的模型呼叫（deps.call），DSH 的部分（訊息、工具、計時器）留在 apply，
 * 所以控制流可以用測試替身單獨測試（individual/test/rd-step.test.ts）。
 *
 * 設定（消融實驗用）：enabled＝整個 RD 階段；jitrl＝經驗修正（關閉時只依口述信心選擇）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LifeEvent, LifeStore } from '../life/store.ts'
import type {} from '../life/index.ts'
import { latestRoute } from '../integrate/index.ts'
import { auxRecord, modelCaller, promptHash, type AuxRoute, type CallModel, type Log } from '../recall/aux.ts'
import { clip, clipEnds, clipKeepLines, replyOf, sessionSoFar } from '../recall/retrieve.ts'
import { newLeftItems, potentialItems, presentPotential, resolvePotential, unlabel } from '../self/energy.ts'
import { KIND, appraisalText, currentNarrative, currentSelfModel, goals, renderSelfSnapshot, type AppraisalData } from '../self/state.ts'
import { currentProcedure, procedureVersions, type Procedure, type ProcedureVariant } from '../self/procedure.ts'
import {
  ALL_EXCLUDED_NOTE,
  DELIBERATE_TOOL,
  deliberateNotice,
  deliberateSystem,
  deliberationRetryNote,
  outcomeRetryNote,
  outcomeSystem,
  parseDeliberation,
  parseOutcome,
  mapDeliberationText,
  revisionNotice,
  revisionRetryNote,
  revisionSystem,
  withoutExclusions,
  type Deliberation,
} from './aux.ts'
import { DEFAULT_PARAMS, allExcluded, correct, neighbors, uncorrected, type Candidate, type Params } from './jitrl.ts'
import { adoptedParamsOf } from './replay.ts'
import {
  DECISION_KIND,
  OUTCOME_FAILED_KIND,
  DELIBERATION_FAILED_KIND,
  type DeliberationFailedData,
  OUTCOME_KIND,
  experiences,
  experiencesOfRecalled,
  decisionTurn,
  openDecision,
  applyJudgments,
  exclusionReviews,
  parseJudgments,
  relevantExperiences,
  renderExclusionReview,
  shownExperiences,
  renderExperiences,
  renderPreparation,
  type DecisionData,
  type OutcomeData,
  type OutcomeFailedData,
} from './memory.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-rd': { readonly kind: 'temir-rd' } & ContextFormed
  }
}

/** context 模式的處境（系統提示的一段）：只陳述這個身體怎麼運作，不規定怎麼想。 */
export const CONTEXT_SITUATION = `關於回應之前的思考：對方說話之後，系統會給你一則「回應之前先思考」的通知。你要先呼叫 ${DELIBERATE_TOOL} 工具，照你自己的思考與扣除做法思考（只在心裡想，不算），得到準備之後再對對方說話；需要的話可以先用 recall 查記憶。沒有思考就回應的回合，會照實記在你的生命紀錄裡。`

/** 暫時的比對中「對方接著說了什麼」。 */
const SILENT_OTHER = '（對方到現在都沒有再說話。）'

export const name = 'temir-rd'
export const inject = ['life', 'llm', 'tools', 'systemPrompt']

export interface Config {
  /** RD 階段（預設開）。 */
  readonly enabled?: boolean
  /** JitRL 經驗修正（預設開；關閉時只依口述信心選擇）。 */
  readonly jitrl?: boolean
  /** JitRL 超參數（預設見 jitrl.ts）。 */
  readonly params?: Partial<Params>
  /** 輔助呼叫逾時（毫秒，預設 180000）。 */
  readonly timeoutMs?: number
  /**
   * 能量（H-E，預設開）。關閉時（消融）：思考的輸入沒有「懸著的事」、不寫 drive 與 activated；
   * 事後比對不寫 released 與 left。其餘的 RD 與 JitRL 完全相同。
   */
  readonly energy?: boolean
  /** 對方在我回覆後沉默多久（分鐘），就先做一次暫時的事後比對（預設 10；0＝關閉）。 */
  readonly silenceMinutes?: number
  /**
   * RD 的扣除（H0「−」，ADR-0002 D15，預設開）。關閉時（消融）：思考不寫 excluded 與理由，
   * 選擇回到全部候選中分數最高的，準備訊息不提扣除。其餘完全相同。
   */
  readonly subtraction?: boolean
  /** 相關的記憶逐一檢查每一個人（ADR-0002 D17，預設開；消融時關閉）。 */
  readonly perPerson?: boolean
  /**
   * 扣除本身會被經驗改變（使用者 2026-10-30；ADR-0002 D20，預設開）：思考時列出過去類似處境中當時扣除的做法；
   * 被扣除的做法在類似處境中做過或扣除過相同的做法時，強制個體逐一判斷維持或解除（revisionSystem）。消融（patches/no-revision.yml）時回到 D19。
   */
  readonly revision?: boolean
  /**
   * 誰在思考（synthesis §3 第 3 點：判斷放回個體自己的脈絡，先做成可切換的條件，用實驗比較）：
   * - aux（預設）：另外的輔助呼叫思考，主 agent 收到準備訊息；
   * - context：主 agent 在自己的回合中、帶著全部的脈絡，以 deliberate 工具思考；程式驗證同樣的強制判斷，
   *   思考完成之前只能用 recall（guard），沒有思考就結束回合的照實記下（rd/deliberation-failed，mode＝context）。
   */
  readonly mode?: 'aux' | 'context'
}

function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

/** RD 階段的依賴：生命日誌、輔助模型呼叫（正式執行是 modelCaller(ctx)；單元測試以測試替身注入）與記錄。 */
export interface RdDeps {
  readonly life: LifeStore
  readonly call: CallModel
  readonly logger: Log
}

/** 一個含有對方新訊息的步驟中，思考需要的輸入（由 apply 從 DSH 的 pre-step 取出）。 */
export interface StepInput {
  readonly session: string
  readonly route: AuxRoute
  /** 對方剛說的話。 */
  readonly cue: string
  /** 同一步之中 temir-recall 放進來的回憶訊息的文字。 */
  readonly recalled: string
  /** 主模型現在可以使用的工具名稱。 */
  readonly tools: readonly string[]
  readonly signal: AbortSignal
}

/** 準備訊息的文字，以及選出的做法（訊息摘要用）。 */
export interface Preparation {
  readonly text: string
  readonly action: string
}

export interface Rd {
  /** 沉默多久之後做暫時的比對（毫秒；0＝關閉）。 */
  readonly silenceMs: number
  /** 事後比對（背景）：上一個決定的預測 vs 實際。provisional＝對方還沒有回話（暫時的比對）。 */
  evaluate(decision: LifeEvent, heard: string, route: AuxRoute, provisional?: boolean): void
  /** pre-step：先比對上一個決定（背景），再思考與準備；沒有準備時（思考失敗、輸出不合格）回傳 undefined。 */
  step(input: StepInput): Promise<Preparation | undefined>
  /** context 模式的 pre-step：先比對上一個決定（背景），回傳要放進主 agent 脈絡的思考通知。 */
  begin(input: StepInput): string
  /** context 模式的 deliberate 工具（session＝呼叫它的那段對話）：回傳工具結果的文字。 */
  deliberateTool(session: string | undefined, args: Record<string, unknown>): string
  /** context 模式：回合要結束時，照實記下還在等的思考。 */
  endTurn(session: string): void
  /** context 模式：這段對話是否還在等思考。 */
  awaiting(session: string): boolean
  /** 對方沉默時的暫時比對（計時器每次觸發時呼叫）。 */
  checkSilence(now?: number): void
  /** 等背景的事後比對完成。 */
  settle(): Promise<void>
}

export function createRd(deps: RdDeps, config: Config | undefined): Rd {
  const { life, logger } = deps
  const jitrl = config?.jitrl ?? true
  // 參數：預設 ⊕ 日誌重播採用的（rd/replay.ts；整合期之後）⊕ 設定檔（實驗與消融固定參數）。每次思考時重新決定。
  const paramsNow = (): Params => ({ ...DEFAULT_PARAMS, ...adoptedParamsOf(life), ...config?.params })
  // 輔助呼叫的逾時（思考開著時要留餘裕：本機的思考模型在負載下第 90 百分位 77 秒，DeepSeek low 最慢 52 秒；dev10）
  const timeoutMs = config?.timeoutMs ?? 180_000
  const energy = config?.energy ?? true
  const subtraction = config?.subtraction ?? true
  const perPerson = config?.perPerson ?? true
  const revision = (config?.revision ?? true) && subtraction
  const silenceMs = (config?.silenceMinutes ?? 10) * 60_000
  // 消融關掉的機制（memory/aux 的 variant）：做法的閘門照同樣的設定重跑（integrate/procedure-gate.ts）。
  const variant: ProcedureVariant = { ...(energy ? {} : { energy: false }), ...(subtraction ? {} : { subtraction: false }), ...(perPerson ? {} : { perPerson: false }) }

  /** 背景的事後比對；卸載前等它們完成。 */
  const background = new Set<Promise<void>>()
  /**
   * 進行中的比對（決定 id → 是否為暫時的比對、完成時的 promise），同一個決定同時只做一次。
   * 暫時的比對進行中（呼叫最多 timeoutMs）對方回話時，正式比對排在它之後，不能被吃掉：
   * 否則同一步寫入的新決定成為 openDecision，舊決定永遠只剩「對方到現在都沒有再說話」的暫時回報（改進清單第 1 項）。
   */
  const evaluating = new Map<string, { readonly provisional: boolean; readonly done: Promise<void> }>()

  async function call(
    purpose: 'deliberate' | 'outcome' | 'revise',
    route: AuxRoute,
    system: string,
    input: string,
    session: string | undefined,
    causes: readonly string[],
    procedures: readonly Procedure[],
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    const model = `${route.provider}/${route.model}`
    // 輸入保留換行、最多 20000 字：做法的閘門以這些真實的輸入重跑（integrate/procedure-gate.ts；ADR-0008 §3）；
    // 系統提示的雜湊讓閘門認得出這次的輸出是不是照現行做法的樣本。
    const used = { procedures: procedureVersions(procedures), input: clipKeepLines(input, 20_000), systemHash: promptHash(system), ...(Object.keys(variant).length > 0 ? { variant } : {}) }
    try {
      const result = await deps.call(route, system, input, deadline)
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, ...auxRecord(result), ...used, output: result.output }, causes })
      return result.output
    } catch (error) {
      if (!life.isOpen) return undefined
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, error: String(error), ...used }, causes })
      logger.warn('%s call failed: %s', purpose, error)
      return undefined
    }
  }

  function evaluate(decision: LifeEvent, heard: string, route: AuxRoute, provisional = false): void {
    const running = evaluating.get(decision.id)
    // 正式比對進行中、或已經排在後面時，不再重複；暫時的比對進行中時，正式比對等它完成再做。
    if (running && (provisional || !running.provisional)) return
    const task = (async () => {
      if (running) await running.done
      if (!life.isOpen) return
      // 已經正式比對過的決定不再比對（openDecision 也會排除；這裡防的是排隊期間的重複）。
      if (!provisional && life.referencing(decision.id, OUTCOME_KIND).some((o) => !(o.data as OutcomeData).provisional)) return
      const data = decision.data as DecisionData
      const planned = data.candidates[data.chosen]
      const self = currentSelfModel(life)
      const turn = decisionTurn(life, decision)
      // 懸著的事加上編號，事後比對才能指名釋放了哪一件（self/energy.ts）。
      const view = energy ? presentPotential(life, { labels: true }) : undefined
      const held = view?.shown ?? []
      const labels = view?.labels ?? new Map<string, string>()
      const heldLines = view?.lines ?? []
      const active = goals(life).filter((g) => g.status === 'active')
      const input = [
        '## 你目前的自我模型',
        self ? self.text : '（尚未書寫）',
        '',
        energy ? '## 你的目標與懸著的事' : '## 你的目標',
        ...(active.length > 0 ? active.map((g) => `- [${g.id}] 目標：${g.text}`) : ['（沒有進行中的目標）']),
        ...(energy ? (heldLines.length > 0 ? heldLines.slice(2) : ['（沒有懸著的事）']) : []),
        '',
        '## 你當時對處境的判斷',
        data.situation,
        ...(data.drive ? ['', '## 當時推動你的', data.drive] : []),
        '',
        '## 你當時準備的做法與預測',
        planned ? `做法：${planned.action}\n預測：${planned.prediction}` : '（沒有）',
        '',
        '## 你實際說了什麼',
        clipEnds(turn.replyText, 1500) || '（沒有說出口的回覆）',
        '',
        '## 對方接著說了什麼',
        clip(heard, 1500),
      ].join('\n')
      const procedure = currentProcedure(life, 'outcome')
      const system = outcomeSystem({ procedure, energy })
      const session = decision.session ?? undefined
      const output = await call('outcome', route, system, input, session, [decision.id], [procedure])
      // 能量開時，released 只能指名輸入中列出的懸著的事（認不得的編號也要重問）。
      const options = energy ? { labels, energy } : { energy }
      let parsed = output === undefined ? undefined : parseOutcome(output, options)
      const problems: string[] = output === undefined ? ['比對的呼叫失敗'] : []
      // 強制判斷：不合格時附上問題重問一次（呼叫失敗時不重問，與思考相同）；仍不合格就記下失敗，不寫 rd/outcome。
      if (parsed && !parsed.ok && life.isOpen) {
        problems.push(...parsed.problems.map((p) => `第 1 次：${p}`))
        const again = await call('outcome', route, `${system}\n${outcomeRetryNote(parsed.problems)}`, input, session, [decision.id], [procedure])
        parsed = again === undefined ? undefined : parseOutcome(again, options)
        if (!parsed) problems.push('第 2 次：比對的呼叫失敗')
        else if (!parsed.ok) problems.push(...parsed.problems.map((p) => `第 2 次：${p}`))
      }
      if (!life.isOpen) return
      if (!parsed?.ok) {
        const failed: OutcomeFailedData = { decision: decision.id, problems, ...(provisional ? { provisional: true } : {}) }
        life.append({ kind: OUTCOME_FAILED_KIND, origin: 'self', session, data: failed, text: `事後比對沒有結果：${problems.join('；')}`, causes: [decision.id] })
        return
      }
      const judged = parsed.judgment
      const { releasedRefs, left, gapOnMind, ...rest } = judged
      const releasedItems = resolvePotential(releasedRefs, labels).filter((k) => !k.startsWith('goal:'))
      const outcome: OutcomeData = {
        decision: decision.id,
        ...rest,
        ...(judged.matched === 'no' && energy ? { gapOnMind } : {}),
        released: unlabel(rest.released, labels, held),
        left: left.map((l) => unlabel(l.text, labels, held)).join('；'),
        ...(() => {
          // 只留新的懸念：與目前懸著的事文字相同的略過（v2：同一件事每次比對都再寫一次，累積到 15 件）。
          const items = newLeftItems(left.map((l) => ({ text: unlabel(l.text, labels, held), forOther: l.forOther })), potentialItems(life))
          return items.length > 0 ? { leftItems: items } : {}
        })(),
        ...(releasedItems.length > 0 ? { releasedItems } : {}),
        selfVersion: self?.version ?? 0,
        heard: clip(heard, 500),
        ...(provisional ? { provisional: true } : {}),
      }
      const recorded = life.append({
        kind: OUTCOME_KIND,
        origin: 'self',
        session,
        data: outcome,
        text: [provisional && '（暫時的比對：對方還沒有回話）', `預測：${planned?.prediction ?? ''}`, `實際：${judged.actual}`, judged.lesson && `教訓：${judged.lesson}`].filter(Boolean).join('\n'),
        causes: [decision.id],
      })
      // 行動後果留下的感受（性質 2：經驗評價受 PC 影響；H-M1：情感是被記住的感受）。個體決定要記下的（keepFeeling）
      // 寫成感受紀錄，指向那一回合（對方的話與我的回覆），回憶時會一起帶出；其餘只留在比對紀錄裡（ADR-0008 §2）。
      // 要不要重新檢視自己（reconsider，H4）記在比對紀錄上，整合依它決定是否以深度模式提前進行。
      if (judged.feeling && judged.keepFeeling) {
        const appraisal: AppraisalData = { feeling: judged.feeling, reappraisal: false, ...(judged.reconsider ? { reconsider: true } : {}) }
        life.append({
          kind: KIND.appraisal,
          origin: 'self',
          session,
          data: { ...appraisal, source: OUTCOME_KIND },
          text: appraisalText(appraisal),
          causes: [...(turn.heard ? [turn.heard.id] : []), ...(turn.reply ? [turn.reply.id] : []), recorded.id],
        })
      }
    })()
      .catch((error: unknown) => logger.error('outcome evaluation failed: %s', error))
      .finally(() => {
        if (evaluating.get(decision.id)?.done === task) evaluating.delete(decision.id)
      })
    evaluating.set(decision.id, { provisional, done: task })
    background.add(task)
    void task.finally(() => background.delete(task))
  }

  // 對方沉默：最後一個決定先做暫時的比對。
  function checkSilence(now = Date.now()): void {
    try {
      if (!life.isOpen) return
      const last = life.recent(1)[0]
      if (!last || now - last.ts < silenceMs) return
      const session = life.latest(DECISION_KIND)?.session
      const decision = session ? openDecision(life, session) : undefined
      // 已經比對過（包括沒有結果的比對：rd/outcome-failed）就不再做暫時的比對，免得每分鐘重做一次。
      if (!decision || life.referencing(decision.id).some((e) => e.kind === OUTCOME_KIND || e.kind === OUTCOME_FAILED_KIND)) return
      const route = latestRoute(life)
      if (route) evaluate(decision, SILENT_OTHER, route, true)
    } catch (error) {
      logger.error('silence check failed: %s', error)
    }
  }

  /** 思考需要的一切（輔助呼叫與 context 模式共用）：列出的經驗與編號、懸著的事與編號、做法、輔助呼叫格式的輸入。 */
  function prepare({ session, route, cue, recalled, tools }: StepInput) {
    const params = paramsNow()
    const memory = jitrl ? experiences(life, params.gamma) : []
    // 這一步的自動回憶（temir-recall 在同一步之中先寫下）帶進來的經歷：當時做過的決定與結果排在前面。
    const recall = life.allInSession(session, 'memory/recall').at(-1)
    const recallData = recall?.data as { mode?: string; cue?: string } | undefined
    const recalledIds = recall && recallData?.mode === 'automatic' && recallData.cue === clip(cue, 500) ? recall.causes : []
    const shown = shownExperiences(experiencesOfRecalled(life, memory, recalledIds), relevantExperiences(cue, memory, 5), 5)
    const labels = new Map(shown.map((e, i) => [`E${i + 1}`, e.id]))
    // 列出了當時扣除的做法的經驗（renderExperiences 在 revision 開時才列）：思考要逐筆判斷哪個做法與那次扣除的相同（ADR-0008 §2）。
    const withExcluded = new Set(revision ? shown.flatMap((e, i) => ((e.excludedThen ?? []).length > 0 ? [`E${i + 1}`] : [])) : [])
    const shownIds = new Set(shown.map((e) => e.id))
    // 懸著的事加上編號，思考才能指名被觸發的是哪一件（self/energy.ts）。
    const potentialView = energy ? presentPotential(life, { labels: true }) : undefined
    const heldNow = potentialView?.shown ?? []
    const potentialLabels = potentialView?.labels ?? new Map<string, string>()
    const goalIds = new Set(goals(life).filter((g) => g.status === 'active' || g.status === 'paused').map((g) => g.id))
    const soFar = sessionSoFar(life, session, cue)
    const experienceText = renderExperiences(shown, revision)
    const input = [
      '## 你目前的自我狀態',
      renderSelfSnapshot(life, potentialView?.lines ?? []),
      '',
      // ST 想像得到的行動要包括真的能做的事：e2e-15 中思考不知道有 integrate 工具，準備了「告知沒有這個工具」。
      '## 你現在可以使用的工具',
      tools.length > 0 ? tools.join('、') : '（沒有）',
      '',
      '## 自動回憶',
      recalled ? clipEnds(recalled, 5000) : '（沒有）',
      '',
      '## 這段對話到目前為止（不含對方剛說的話）',
      soFar.length > 0 ? soFar.join('\n') : '（這段對話剛開始）',
      '',
      '## 過去類似處境的經驗',
      experienceText,
      '',
      '## 對方剛說的話',
      clip(cue, 3000),
    ].join('\n')
    const procedures = { deliberate: currentProcedure(life, 'deliberate'), subtract: currentProcedure(life, 'subtract') }
    const used = subtraction ? [procedures.deliberate, procedures.subtract] : [procedures.deliberate]
    return {
      session,
      route,
      cue,
      params,
      memory,
      shown,
      labels,
      withExcluded,
      shownIds,
      heldNow,
      potentialLabels,
      heldLines: potentialView?.lines ?? [],
      goalIds,
      experienceText,
      input,
      procedures,
      used,
      system: deliberateSystem({ procedures, energy, subtraction, perPerson }),
    }
  }
  type Prepared = ReturnType<typeof prepare>

  /**
   * 思考之後的步驟（輔助呼叫與 context 模式共用）：每次餵進一個思考或判斷的輸出（呼叫失敗時是 undefined），回傳下一步要什麼。
   * 與原本的流程相同：思考不合格重問一次，仍不合格就照實記下失敗；全部扣除時重問一次；需要判斷的扣除強制判斷（不合格重問一次）；
   * 最後以 JitRL 經驗修正選出做法，寫下 rd/decision。
   */
  function deliberating(prep: Prepared & { readonly cueSeq: number }, mode: 'aux' | 'context') {
    type Next =
      | { readonly kind: 'retry'; readonly note: string }
      | { readonly kind: 'review'; readonly text: string; readonly note?: string }
      | { readonly kind: 'done'; readonly preparation: Preparation }
      | { readonly kind: 'failed'; readonly problems: readonly string[] }
    let phase: 'deliberate' | 'excluded' | 'review' | 'over' = 'deliberate'
    let attempts = 0
    const problems: string[] = []
    let first: Deliberation | undefined
    let deliberation: Deliberation | undefined
    let near: ReturnType<typeof neighbors> = []
    let reviews: ReturnType<typeof exclusionReviews> = []
    let refLabels = new Map<string, string>()
    let reviewAttempts = 0
    const reviewProblems: string[] = []

    function fail(): Next {
      phase = 'over'
      if (life.isOpen) {
        const failed: DeliberationFailedData = { cue: clip(prep.cue, 500), problems, ...(mode === 'context' ? { mode } : {}) }
        life.append({ kind: DELIBERATION_FAILED_KIND, origin: 'self', session: prep.session, data: failed, text: `思考沒有結果：${problems.join('；')}` })
      }
      return { kind: 'failed', problems }
    }

    function proceed(parsed: Deliberation): Next {
      // 處境、drive、候選與扣除理由都會進入準備訊息與紀錄：把編號換成那件事的描述（編號只在這次思考的輸入中有意義）。
      // dev5：處境寫著「她欠我回覆的：…（P1」，主模型的推理跟著寫「不該再讓 P1、P2 無限懸著」。
      deliberation = mapDeliberationText(subtraction ? parsed : withoutExclusions(parsed), (s) => unlabel(s, prep.potentialLabels, prep.heldNow))
      near = jitrl ? neighbors(deliberation.situation, prep.memory, prep.params, deliberation.similar) : []
      // D20 第三版：扣除本身會被經驗改變，由個體判斷，但強制判斷（memory.ts 的 exclusionReviews）。
      // 類似處境的經驗：思考時列出的（回憶帶進來的＋詞彙相近的），加上 JitRL 依處境找到的鄰居。
      reviews = revision ? exclusionReviews(deliberation.candidates, [...prep.shown, ...near.map((n) => n.experience)], prep.params, prep.shownIds) : []
      if (reviews.length === 0) return finish(deliberation.candidates, undefined)
      const rendered = renderExclusionReview(deliberation.situation, deliberation.candidates, reviews)
      refLabels = rendered.labels
      phase = 'review'
      return { kind: 'review', text: rendered.text }
    }

    function finish(candidates: readonly Candidate[], review: DecisionData['review']): Next {
      phase = 'over'
      const d = deliberation!
      const correction = jitrl ? correct(candidates, near, prep.params, Math.random, prep.shownIds) : uncorrected(candidates)
      const chosen = correction.scored[correction.chosen]
      const repliedBefore = mode === 'context' && life.allInSession(prep.session, 'dsh/assistant/message').some((e) => e.seq > prep.cueSeq && replyOf(e) !== '')
      const data: DecisionData = {
        cue: clip(prep.cue, 500),
        situation: d.situation,
        ...(d.drive ? { drive: d.drive } : {}),
        ...(d.people.length > 0 ? { people: d.people } : {}),
        ...(review ? { review } : {}),
        ...(() => {
          const activated = resolvePotential(d.activated, prep.potentialLabels, prep.goalIds)
          return activated.length > 0 ? { activated } : {}
        })(),
        candidates: correction.scored,
        chosen: correction.chosen,
        value: correction.value,
        neighbors: near.map((n) => ({ id: n.experience.id, similarity: n.similarity, judged: n.judged, ret: n.experience.ret })),
        shown: Object.fromEntries(prep.labels),
        jitrl,
        params: prep.params,
        selfVersion: currentSelfModel(life)?.version ?? 0,
        narrativeVersion: currentNarrative(life)?.version ?? 0,
        procedures: procedureVersions(prep.used),
        ...(mode === 'context' ? { mode, repliedBefore } : {}),
      }
      life.append({
        kind: DECISION_KIND,
        origin: 'self',
        session: prep.session,
        model: `${prep.route.provider}/${prep.route.model}`,
        data,
        text: `處境：${d.situation}\n我準備：${chosen?.action ?? ''}\n我預期：${chosen?.prediction ?? ''}`,
        causes: near.map((n) => n.experience.id),
      })
      return { kind: 'done', preparation: { text: renderPreparation(d, correction, near, subtraction), action: chosen?.action ?? '' } }
    }

    return {
      get phase() {
        return phase
      },
      /** 思考的輸出（呼叫失敗時是 undefined）。 */
      answer(output: string | undefined): Next {
        if (phase === 'excluded') {
          // 全部扣除時的重問：輸出不合格就保留第一次的（程式不替個體改選）。
          const retried = output === undefined ? undefined : parseDeliberation(output, prep.labels, prep.withExcluded)
          return proceed(retried?.ok ? retried.deliberation : first!)
        }
        attempts++
        if (output === undefined) {
          // 呼叫失敗：第一次不重問（與原本相同），第二次照實記下。
          if (attempts === 1) {
            phase = 'over'
            return { kind: 'failed', problems: ['思考的呼叫失敗'] }
          }
          problems.push('第 2 次：思考的呼叫失敗')
          return fail()
        }
        const parsed = parseDeliberation(output, prep.labels, prep.withExcluded)
        if (!parsed.ok) {
          problems.push(...parsed.problems.map((p) => `第 ${attempts} 次：${p}`))
          // 輸出不合格時附上問題重試一次（e2e-37；列出的經驗沒有逐筆判斷也是不合格，D23）；仍不合格就不做準備。
          return attempts === 1 ? { kind: 'retry', note: deliberationRetryNote(parsed.problems) } : fail()
        }
        // 全部的做法都被扣除時，附上說明重問一次；仍全部扣除，就照實記下：沒有準備好的做法（chosen＝-1）。
        if (subtraction && allExcluded(parsed.deliberation.candidates)) {
          first = parsed.deliberation
          phase = 'excluded'
          return { kind: 'retry', note: ALL_EXCLUDED_NOTE }
        }
        return proceed(parsed.deliberation)
      },
      /** 扣除的判斷的輸出（呼叫失敗時是 undefined）。判斷不合格時重問一次；仍不合格就照實記下，維持原本的扣除。 */
      review(output: string | undefined): Next {
        reviewAttempts++
        const judged = output === undefined ? undefined : parseJudgments(output, reviews, refLabels)
        if (judged?.ok) return finish(applyJudgments(deliberation!.candidates, judged.judgments), { required: reviews.length })
        if (!judged) reviewProblems.push(reviewAttempts === 1 ? '判斷的呼叫失敗' : '第 2 次：判斷的呼叫失敗')
        else reviewProblems.push(...judged.problems.map((p) => `第 ${reviewAttempts} 次：${p}`))
        if (judged && reviewAttempts === 1) return { kind: 'review', text: renderExclusionReview(deliberation!.situation, deliberation!.candidates, reviews).text, note: revisionRetryNote(judged.problems) }
        return finish(deliberation!.candidates, { required: reviews.length, failed: reviewProblems.join('；') })
      },
      /** context 模式：主 agent 沒有完成就結束了這一回合（或對方又說了話）。 */
      abandon(): void {
        if (phase === 'deliberate') {
          problems.push(`沒有在回應之前用 ${DELIBERATE_TOOL} 思考`)
          fail()
        } else if (phase === 'excluded') proceed(first!)
        if (phase === 'review') finish(deliberation!.candidates, { required: reviews.length, failed: [...reviewProblems, '沒有作答'].join('；') })
        phase = 'over'
      },
    }
  }

  async function step(stepInput: StepInput): Promise<Preparation | undefined> {
    const { session, route, cue, signal } = stepInput
    try {
      const previous = openDecision(life, session)
      if (previous) evaluate(previous, cue, route)
      const prep = { ...prepare(stepInput), cueSeq: life.lastSeq() }
      const machine = deliberating(prep, 'aux')
      const revising = revisionSystem(prep.procedures.subtract)
      let next = machine.answer(await call('deliberate', route, prep.system, prep.input, session, [], prep.used, signal))
      // 最多：思考兩次（或全部扣除時重問一次）、判斷兩次。中途被取消就不再呼叫，也不記失敗。
      for (let round = 0; round < 4; round++) {
        if (next.kind === 'done') return next.preparation
        if (next.kind === 'failed' || signal.aborted || !life.isOpen) return undefined
        const output =
          next.kind === 'retry'
            ? await call('deliberate', route, `${prep.system}\n${next.note}`, prep.input, session, [], prep.used, signal)
            : await call('revise', route, next.note ? `${revising}\n${next.note}` : revising, next.text, session, [], [prep.procedures.subtract], signal)
        if (signal.aborted || !life.isOpen) return undefined
        next = next.kind === 'retry' ? machine.answer(output) : machine.review(output)
      }
      return next.kind === 'done' ? next.preparation : undefined
    } catch (error) {
      logger.error('rd stage failed: %s', error)
      return undefined
    }
  }

  /** context 模式（synthesis §3 第 3 點）：每段對話中等主 agent 以 deliberate 工具思考的那一個（對方說話之後）。 */
  const pending = new Map<string, { readonly prep: Prepared & { readonly cueSeq: number }; readonly machine: ReturnType<typeof deliberating> }>()

  /** context 模式的 pre-step：先比對上一個決定（背景），準備思考需要的東西，回傳給主 agent 的通知。 */
  function begin(stepInput: StepInput): string {
    const { session, route, cue } = stepInput
    pending.get(session)?.machine.abandon()
    pending.delete(session)
    const previous = openDecision(life, session)
    if (previous) evaluate(previous, cue, route)
    // 上一次在這段對話中沒有先思考就回應了：照實告訴它（dsh-memory-evolve 的置頂提醒，直到做到為止）。
    const lastRd = life.inSession(session, DECISION_KIND, 'desc', 1)[0]
    const skipped = life.inSession(session, DELIBERATION_FAILED_KIND, 'desc', 1)[0]
    const reminder =
      skipped && (!lastRd || skipped.seq > lastRd.seq) && (skipped.data as DeliberationFailedData).problems.some((p) => p.startsWith('沒有在回應之前'))
        ? `上一次對方說話之後，你沒有先用 ${DELIBERATE_TOOL} 思考就回應了。`
        : undefined
    const prep = { ...prepare(stepInput), cueSeq: life.lastSeq() }
    pending.set(session, { prep, machine: deliberating(prep, 'context') })
    return deliberateNotice({ procedures: prep.procedures, energy, subtraction, perPerson, held: prep.heldLines, experiences: prep.experienceText, ...(reminder ? { reminder } : {}) })
  }

  /**
   * context 模式的 deliberate 工具：驗證主 agent 的思考（與輔助呼叫相同的強制判斷），回傳下一步：重寫、判斷扣除，或準備。
   * 每次的參數照輔助呼叫的格式記進 memory/aux（purpose＝deliberate、mode＝context），做法的閘門可以拿這些輸入重跑（近似）。
   */
  function deliberateTool(session: string | undefined, args: Record<string, unknown>): string {
    const entry = session ? pending.get(session) : undefined
    if (!entry || entry.machine.phase === 'over') return '現在沒有需要思考的事：對方說話之後、回應之前才需要。'
    const { prep, machine } = entry
    const reviewing = machine.phase === 'review'
    const output = JSON.stringify(reviewing ? { judgments: args['judgments'] } : args)
    const model = `${prep.route.provider}/${prep.route.model}`
    life.append({
      kind: 'memory/aux',
      origin: 'self',
      session: prep.session,
      model,
      data: { purpose: reviewing ? 'revise' : 'deliberate', mode: 'context', procedures: procedureVersions(reviewing ? [prep.procedures.subtract] : prep.used), input: clipKeepLines(prep.input, 20_000), output },
    })
    const next = reviewing ? machine.review(output) : machine.answer(output)
    if (next.kind === 'done' || next.kind === 'failed') pending.delete(prep.session)
    switch (next.kind) {
      case 'retry':
        return `思考還沒有完成，再呼叫一次 ${DELIBERATE_TOOL}：${next.note}`
      case 'review':
        return `${revisionNotice(prep.procedures.subtract, next.text)}${next.note ? `\n${next.note}` : ''}`
      case 'done':
        return `${next.preparation.text}\n\n（這是你自己的準備。接著回應對方；實際怎麼做由你決定。）`
      case 'failed':
        return `思考沒有結果（${next.problems.join('；')}）。直接回應對方。`
    }
  }

  /** context 模式：回合要結束時，還在等思考的就照實記下（沒有思考，或判斷沒有作答）。 */
  function endTurn(session: string): void {
    const entry = pending.get(session)
    if (!entry) return
    pending.delete(session)
    if (life.isOpen) entry.machine.abandon()
  }

  /** context 模式：這段對話是否還在等思考（guard 用：思考之前只能用 recall）。 */
  function awaiting(session: string): boolean {
    return pending.has(session)
  }

  return {
    silenceMs,
    evaluate,
    step,
    begin,
    deliberateTool,
    endTurn,
    awaiting,
    checkSilence,
    settle: async () => {
      await Promise.allSettled([...background])
    },
  }
}

export function apply(ctx: Context, config: Config | undefined): void {
  if (config?.enabled === false) return
  const logger = ctx.logger('temir-rd')
  const rd = createRd({ life: ctx.life, call: modelCaller(ctx), logger }, config)
  ctx.effect(() => () => rd.settle(), 'temir-rd: finish outcome evaluation')

  // 對方沉默：最後一個決定先做暫時的比對（計時器不讓程序多留，一次性的執行與實驗不會觸發）。
  if (rd.silenceMs > 0) {
    const timer = setInterval(() => rd.checkSilence(), Math.min(rd.silenceMs, 60_000))
    timer.unref()
    ctx.effect(() => () => clearInterval(timer), 'temir-rd: stop silence check')
  }

  const context = config?.mode === 'context'
  if (context) {
    // 處境的事實：這個身體在 context 模式下怎麼運作（e2e-42b：只有通知時，第二、三回合在推理中照做法想過，卻沒有呼叫工具）。
    ctx.systemPrompt.section({ name: 'temir:deliberate', order: 2, text: CONTEXT_SITUATION })
    // context 模式：deliberate 工具一直註冊（工具清單不隨步驟變動，前綴快取才不會失效），沒有要思考的事時回覆說明。
    ctx.tools.register(
      defineTool({
        name: DELIBERATE_TOOL,
        description:
          '對方說話之後、回應之前，照你自己的思考與扣除做法思考與準備：描述處境、想出幾個做法並預測後果、扣除不該做的，並逐一判斷列出的過去經驗。參數的格式寫在思考的通知中。思考完成後會得到你的準備。',
        parameters: {
          situation: { type: 'string', description: '眼前的處境' },
          drive: { type: 'string', description: '此刻推動你行動的是什麼' },
          activated: { type: 'array', items: { type: 'string' }, description: '被觸發的懸著的事的編號或目標 id' },
          people: { type: 'array', items: { type: 'json' }, description: '這次涉及的人與相關事實' },
          candidates: { type: 'array', items: { type: 'json' }, description: '2 到 4 個做法' },
          experiences: { type: 'array', items: { type: 'json' }, description: '對列出的每一個過去經驗的判斷' },
          judgments: { type: 'array', items: { type: 'json' }, description: '扣除的判斷（只在被要求判斷扣除時給）' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, exec) {
          return rd.deliberateTool(exec.agent?.session.id, args as Record<string, unknown>)
        },
      }),
    )
    // 思考完成之前只能用 recall 查記憶（dsh-memory-evolve 的「weak followers cannot skip a review silently」：由程式強制）。
    ctx.tools.guard((execution) => {
      const session = execution.agent?.session.id
      if (!session || !rd.awaiting(session) || execution.name === DELIBERATE_TOOL || execution.name === 'recall') return undefined
      return `回應之前先用 ${DELIBERATE_TOOL} 思考（需要的話可以先用 recall 查記憶）。`
    })
    ctx.on('agent/turn-stopping', ({ agent }) => {
      try {
        rd.endTurn(agent.session.id)
      } catch (error) {
        logger.error('rd turn end failed: %s', error)
      }
    })
  }

  ctx.on(
    'agent/pre-step',
    async (payload, next) => {
      const decision = await next()
      if (decision.kind !== 'enter' || payload.signal.aborted) return decision
      const cue = decision.messages
        .filter((m) => m.source.kind === 'user')
        .map((m) => textOf(m.content))
        .join('\n')
        .trim()
      if (!cue) return decision
      try {
        const stepInput: StepInput = {
          session: payload.agent.session.id,
          route: { provider: payload.modelSelection.provider, model: payload.modelSelection.model },
          cue,
          recalled: decision.messages
            .filter((m) => m.source.kind === 'temir-recall')
            .map((m) => textOf(m.content))
            .join('\n'),
          tools: ctx.tools.definitions(payload.agent).map((t) => t.name),
          signal: payload.signal,
        }
        if (context) {
          const notice = createUserMessage({
            content: [{ type: 'text', text: rd.begin(stepInput) }],
            source: { kind: 'temir-rd', form: 'notice', summary: '回應之前先思考' },
          })
          return { ...decision, messages: [...decision.messages, notice] }
        }
        const prepared = await rd.step(stepInput)
        if (!prepared) return decision
        const preparation = createUserMessage({
          content: [{ type: 'text', text: prepared.text }],
          source: { kind: 'temir-rd', form: 'notice', summary: `行動準備：${clip(prepared.action, 60)}` },
        })
        return { ...decision, messages: [...decision.messages, preparation] }
      } catch (error) {
        logger.error('rd stage failed: %s', error)
        return decision
      }
    },
    { prepend: true },
  )
}
