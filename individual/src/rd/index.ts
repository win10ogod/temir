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
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { LifeEvent, LifeStore } from '../life/store.ts'
import type {} from '../life/index.ts'
import { latestRoute } from '../integrate/index.ts'
import { modelCaller, type AuxRoute, type CallModel, type Log } from '../recall/aux.ts'
import { clip, clipEnds, sessionSoFar } from '../recall/retrieve.ts'
import { newLeftItems, potentialItems, presentPotential, resolvePotential, unlabel } from '../self/energy.ts'
import { KIND, SIGNIFICANCE_LABEL, currentNarrative, currentSelfModel, goals, renderSelfSnapshot, type AppraisalData } from '../self/state.ts'
import { DELIBERATION_RETRY_NOTE, REVISION_SYSTEM, deliberateSystem, outcomeRetryNote, outcomeSystem, parseDeliberation, parseOutcome, mapDeliberationText, revisionRetryNote, withoutExclusions } from './aux.ts'
import { DEFAULT_PARAMS, correct, neighbors, uncorrected, type Params } from './jitrl.ts'
import { REPLAY_KIND, adoptedParams } from './replay.ts'
import {
  DECISION_KIND,
  OUTCOME_FAILED_KIND,
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

/** 暫時的比對中「對方接著說了什麼」。 */
const SILENT_OTHER = '（對方到現在都沒有再說話。）'

export const name = 'temir-rd'
export const inject = ['life', 'llm', 'tools']

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
   * 被扣除的做法在類似處境中有同類的經驗時，強制個體逐一判斷維持或解除（REVISION_SYSTEM）。消融（patches/no-revision.yml）時回到 D19。
   */
  readonly revision?: boolean
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
  /** 對方沉默時的暫時比對（計時器每次觸發時呼叫）。 */
  checkSilence(now?: number): void
  /** 等背景的事後比對完成。 */
  settle(): Promise<void>
}

export function createRd(deps: RdDeps, config: Config | undefined): Rd {
  const { life, logger } = deps
  const jitrl = config?.jitrl ?? true
  // 參數：預設 ⊕ 日誌重播採用的（rd/replay.ts；整合期之後）⊕ 設定檔（實驗與消融固定參數）。每次思考時重新決定。
  const paramsNow = (): Params => ({ ...DEFAULT_PARAMS, ...adoptedParams(life.all(REPLAY_KIND)), ...config?.params })
  // 輔助呼叫的逾時（思考開著時要留餘裕：本機的思考模型在負載下第 90 百分位 77 秒，DeepSeek low 最慢 52 秒；dev10）
  const timeoutMs = config?.timeoutMs ?? 180_000
  const energy = config?.energy ?? true
  const subtraction = config?.subtraction ?? true
  const perPerson = config?.perPerson ?? true
  const revision = (config?.revision ?? true) && subtraction
  const silenceMs = (config?.silenceMinutes ?? 10) * 60_000

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
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    const model = `${route.provider}/${route.model}`
    try {
      const { output, ms, retried, effort, reasoningChars } = await deps.call(route, system, input, deadline)
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, ms, retried, effort, reasoningChars, input: clip(input, 8000), output }, causes })
      return output
    } catch (error) {
      if (!life.isOpen) return undefined
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, error: String(error), input: clip(input, 8000) }, causes })
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
        planned ? `做法：${planned.action}（${planned.kind}）\n預測：${planned.prediction}` : '（沒有）',
        '',
        '## 你實際說了什麼',
        clipEnds(turn.replyText, 1500) || '（沒有說出口的回覆）',
        '',
        '## 對方接著說了什麼',
        clip(heard, 1500),
      ].join('\n')
      const system = outcomeSystem(energy)
      const session = decision.session ?? undefined
      const output = await call('outcome', route, system, input, session, [decision.id])
      let parsed = output === undefined ? undefined : parseOutcome(output)
      const problems: string[] = output === undefined ? ['比對的呼叫失敗'] : []
      // 強制判斷：不合格時附上問題重問一次（呼叫失敗時不重問，與思考相同）；仍不合格就記下失敗，不寫 rd/outcome。
      if (parsed && !parsed.ok && life.isOpen) {
        problems.push(...parsed.problems.map((p) => `第 1 次：${p}`))
        const again = await call('outcome', route, `${system}\n${outcomeRetryNote(parsed.problems)}`, input, session, [decision.id])
        parsed = again === undefined ? undefined : parseOutcome(again)
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
      const { releasedRefs, ...rest } = judged
      const releasedItems = resolvePotential(releasedRefs, labels).filter((k) => !k.startsWith('goal:'))
      const outcome: OutcomeData = {
        decision: decision.id,
        ...rest,
        released: unlabel(rest.released, labels, held),
        left: rest.left.map((l) => unlabel(l.text, labels, held)).join('；'),
        ...(() => {
          // 只留新的懸念：與目前懸著的事文字相同的略過（v2：同一件事每次比對都再寫一次，累積到 15 件）。
          const items = newLeftItems(rest.left.map((l) => ({ text: unlabel(l.text, labels, held), type: l.type })), potentialItems(life))
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
      // 行動後果留下的感受（性質 2：經驗評價受 PC 影響；H-M1：情感是被記住的感受）。日常的感受只留在比對紀錄裡；
      // 值得注意以上的寫成感受紀錄，指向那一回合（對方的話與我的回覆），回憶時會一起帶出；轉折會讓整合以深度模式進行（H4）。
      if (judged.feeling && judged.significance !== 'daily') {
        const appraisal: AppraisalData = { feeling: judged.feeling, significance: judged.significance, reappraisal: false }
        life.append({
          kind: KIND.appraisal,
          origin: 'self',
          session,
          data: { ...appraisal, source: OUTCOME_KIND },
          text: `我的感受（${SIGNIFICANCE_LABEL[judged.significance]}）：${judged.feeling}`,
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

  async function step({ session, route, cue, recalled, tools, signal }: StepInput): Promise<Preparation | undefined> {
    try {
      const previous = openDecision(life, session)
      if (previous) evaluate(previous, cue, route)

      const params = paramsNow()
      const memory = jitrl ? experiences(life, params.gamma) : []
      // 這一步的自動回憶（temir-recall 在同一步之中先寫下）帶進來的經歷：當時做過的決定與結果排在前面。
      const recall = life.allInSession(session, 'memory/recall').at(-1)
      const recallData = recall?.data as { mode?: string; cue?: string } | undefined
      const recalledIds = recall && recallData?.mode === 'automatic' && recallData.cue === clip(cue, 500) ? recall.causes : []
      const shown = shownExperiences(experiencesOfRecalled(life, memory, recalledIds), relevantExperiences(cue, memory, 5), 5)
      const labels = new Map(shown.map((e, i) => [`E${i + 1}`, e.id]))
      // 懸著的事加上編號，思考才能指名被觸發的是哪一件（self/energy.ts）。
      const potentialView = energy ? presentPotential(life, { labels: true }) : undefined
      const heldNow = potentialView?.shown ?? []
      const potentialLabels = potentialView?.labels ?? new Map<string, string>()
      const goalIds = new Set(goals(life).filter((g) => g.status === 'active' || g.status === 'paused').map((g) => g.id))
      const soFar = sessionSoFar(life, session, cue)
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
        renderExperiences(shown, revision),
        '',
        '## 對方剛說的話',
        clip(cue, 3000),
      ].join('\n')
      const system = deliberateSystem(energy, subtraction, perPerson)
      const output = await call('deliberate', route, system, input, session, [], signal)
      let parsed = output === undefined ? undefined : parseDeliberation(output, labels)
      // 輸出不完整時重試一次（e2e-37：本機模型有一次只寫了處境與 people，沒有 candidates）。呼叫失敗時不重試。
      if (output !== undefined && !parsed && !signal.aborted) {
        const again = await call('deliberate', route, `${system}\n${DELIBERATION_RETRY_NOTE}`, input, session, [], signal)
        parsed = again === undefined ? undefined : parseDeliberation(again, labels)
      }
      if (!parsed) return undefined
      // 處境、drive、候選與扣除理由都會進入準備訊息與紀錄：把編號換成那件事的描述（編號只在這次思考的輸入中有意義）。
      // dev5：處境寫著「她欠我回覆的：…（P1」，主模型的推理跟著寫「不該再讓 P1、P2 無限懸著」。
      const deliberation = mapDeliberationText(subtraction ? parsed : withoutExclusions(parsed), (s) => unlabel(s, potentialLabels, heldNow))

      const near = jitrl ? neighbors(deliberation.situation, memory, params, deliberation.similar) : []
      // D20 第三版：扣除本身會被經驗改變，由個體判斷，但強制判斷（memory.ts 的 exclusionReviews）。
      // 類似處境的經驗：思考時列出的（回憶帶進來的＋詞彙相近的），加上 JitRL 依處境找到的鄰居。
      const reviews = revision ? exclusionReviews(deliberation.candidates, [...shown, ...near.map((n) => n.experience)]) : []
      let candidates = deliberation.candidates
      let review: DecisionData['review']
      if (reviews.length > 0) {
        const { text, labels: refLabels } = renderExclusionReview(deliberation.situation, deliberation.candidates, reviews)
        let answer = await call('revise', route, REVISION_SYSTEM, text, session, [], signal)
        let judged = answer === undefined ? undefined : parseJudgments(answer, reviews, refLabels)
        // 判斷不合格時，附上缺少的部分重問一次；仍不合格就照實記下，維持原本的扣除。
        if (judged && !judged.ok && !signal.aborted) {
          answer = await call('revise', route, `${REVISION_SYSTEM}\n${revisionRetryNote(judged.problems)}`, text, session, [], signal)
          judged = answer === undefined ? undefined : parseJudgments(answer, reviews, refLabels)
        }
        if (judged?.ok) candidates = applyJudgments(candidates, judged.judgments)
        review = { required: reviews.length, ...(judged?.ok ? {} : { failed: judged ? judged.problems.join('；') : '判斷的呼叫失敗' }) }
      }
      const correction = jitrl ? correct(candidates, near, params) : uncorrected(candidates)
      const chosen = correction.scored[correction.chosen]
      const data: DecisionData = {
        cue: clip(cue, 500),
        situation: deliberation.situation,
        ...(deliberation.drive ? { drive: deliberation.drive } : {}),
        ...(deliberation.people.length > 0 ? { people: deliberation.people } : {}),
        ...(review ? { review } : {}),
        ...(() => {
          const activated = resolvePotential(deliberation.activated, potentialLabels, goalIds)
          return activated.length > 0 ? { activated } : {}
        })(),
        candidates: correction.scored,
        chosen: correction.chosen,
        value: correction.value,
        neighbors: near.map((n) => ({ id: n.experience.id, similarity: n.similarity, judged: n.judged, ret: n.experience.ret })),
        shown: Object.fromEntries(labels),
        jitrl,
        params,
        selfVersion: currentSelfModel(life)?.version ?? 0,
        narrativeVersion: currentNarrative(life)?.version ?? 0,
      }
      life.append({
        kind: DECISION_KIND,
        origin: 'self',
        session,
        model: `${route.provider}/${route.model}`,
        data,
        text: `處境：${deliberation.situation}\n我準備：${chosen?.action ?? ''}\n我預期：${chosen?.prediction ?? ''}`,
        causes: near.map((n) => n.experience.id),
      })
      return { text: renderPreparation(deliberation, correction, near, subtraction), action: chosen?.action ?? '' }
    } catch (error) {
      logger.error('rd stage failed: %s', error)
      return undefined
    }
  }

  return {
    silenceMs,
    evaluate,
    step,
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
        const prepared = await rd.step({
          session: payload.agent.session.id,
          route: { provider: payload.modelSelection.provider, model: payload.modelSelection.model },
          cue,
          recalled: decision.messages
            .filter((m) => m.source.kind === 'temir-recall')
            .map((m) => textOf(m.content))
            .join('\n'),
          tools: ctx.tools.definitions(payload.agent).map((t) => t.name),
          signal: payload.signal,
        })
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
