/**
 * temir-rd：PC 循環的 RD 階段——思考後回饋、行動準備與預測（hypotheses.md H0；ADR-0002 D2–D3）。
 *
 * 每個含有對方新訊息的步驟（DSH `agent/pre-step`）：
 * 1. 事後比對（背景，不阻塞回覆）：本 session 上一個決定的預測，對照我實際說的話與對方接著說的話，
 *    依我目前的自我模型評估回報與教訓，寫成 `rd/outcome`。
 * 2. 思考與準備：以自我狀態、自動回憶與過去類似處境的經驗為條件，產生處境描述與 3 個候選做法
 *    （預期後果、口述信心），以 JitRL 經驗修正選出做法，寫成 `rd/decision`。
 * 3. 準備訊息（source.kind=temir-rd；ingest 不為 temir 來源建立回憶索引）放在對方的話之後，主模型據此行動，
 *    也可以在行動時改變主意，事後比對會記下實際做了什麼。
 * 監聽器以 prepend 註冊在最外層：等內層（temir-recall）放入回憶訊息後才思考，所以思考看得到回憶。
 * 對方沉默（silenceMinutes 沒有新事件）時，最後一個決定先以「對方沒有再說話」做暫時的比對：
 * 這一回合答應的事成為懸著的事，閒置時的念頭與主動開口才看得到它（對方之後回話時再正式比對）。
 *
 * 設定（消融實驗用）：enabled＝整個 RD 階段；jitrl＝經驗修正（關閉時只依口述信心選擇）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { LifeEvent } from '../life/store.ts'
import type {} from '../life/index.ts'
import { latestRoute } from '../integrate/index.ts'
import { callModel, type AuxRoute } from '../recall/aux.ts'
import { clip, clipEnds } from '../recall/retrieve.ts'
import { newLeftItems, potentialItems, presentPotential, resolvePotential, unlabel } from '../self/energy.ts'
import { KIND, SIGNIFICANCE_LABEL, currentNarrative, currentSelfModel, goals, renderSelfSnapshot, type AppraisalData } from '../self/state.ts'
import { deliberateSystem, outcomeSystem, parseDeliberation, parseOutcome, mapDeliberationText, withoutExclusions } from './aux.ts'
import { DEFAULT_PARAMS, correct, neighbors, uncorrected, type Params } from './jitrl.ts'
import { REPLAY_KIND, adoptedParams } from './replay.ts'
import {
  DECISION_KIND,
  OUTCOME_KIND,
  experiences,
  decisionTurn,
  openDecision,
  relevantExperiences,
  renderExperiences,
  renderPreparation,
  type DecisionData,
  type OutcomeData,
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
  /** 輔助呼叫逾時（毫秒，預設 90000）。 */
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
}

function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function apply(ctx: Context, config: Config | undefined): void {
  if (config?.enabled === false) return
  const life = ctx.life
  const jitrl = config?.jitrl ?? true
  // 參數：預設 ⊕ 日誌重播採用的（rd/replay.ts；整合期之後）⊕ 設定檔（實驗與消融固定參數）。每次思考時重新決定。
  const paramsNow = (): Params => ({ ...DEFAULT_PARAMS, ...adoptedParams(life.all(REPLAY_KIND)), ...config?.params })
  const timeoutMs = config?.timeoutMs ?? 90_000
  const energy = config?.energy ?? true
  const subtraction = config?.subtraction ?? true
  const perPerson = config?.perPerson ?? true
  const silenceMs = (config?.silenceMinutes ?? 10) * 60_000
  const logger = ctx.logger('temir-rd')

  /** 背景的事後比對；卸載前等它們完成。 */
  const background = new Set<Promise<void>>()
  const evaluating = new Set<string>()
  ctx.effect(
    () => async () => {
      await Promise.allSettled([...background])
    },
    'temir-rd: finish outcome evaluation',
  )

  async function call(
    purpose: 'deliberate' | 'outcome',
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
      const { output, ms, retried } = await callModel(ctx, route, system, input, deadline)
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, ms, retried, input: clip(input, 8000), output }, causes })
      return output
    } catch (error) {
      if (!life.isOpen) return undefined
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, error: String(error), input: clip(input, 8000) }, causes })
      logger.warn('%s call failed: %s', purpose, error)
      return undefined
    }
  }

  /** 事後比對：上一個決定的預測 vs 實際。provisional＝對方還沒有回話（暫時的比對）。 */
  function evaluate(decision: LifeEvent, heard: string, route: AuxRoute, provisional = false): void {
    if (evaluating.has(decision.id)) return
    evaluating.add(decision.id)
    const task = (async () => {
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
      const output = await call('outcome', route, outcomeSystem(energy), input, decision.session ?? undefined, [decision.id])
      const judged = output === undefined ? undefined : parseOutcome(output)
      if (!judged || !life.isOpen) return
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
        session: decision.session ?? undefined,
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
          session: decision.session ?? undefined,
          data: { ...appraisal, source: OUTCOME_KIND },
          text: `我的感受（${SIGNIFICANCE_LABEL[judged.significance]}）：${judged.feeling}`,
          causes: [...(turn.heard ? [turn.heard.id] : []), ...(turn.reply ? [turn.reply.id] : []), recorded.id],
        })
      }
    })()
      .catch((error: unknown) => logger.error('outcome evaluation failed: %s', error))
      .finally(() => evaluating.delete(decision.id))
    background.add(task)
    void task.finally(() => background.delete(task))
  }

  // 對方沉默：最後一個決定先做暫時的比對（計時器不讓程序多留，一次性的執行與實驗不會觸發）。
  if (silenceMs > 0) {
    const timer = setInterval(() => {
      try {
        if (!life.isOpen) return
        const last = life.recent(1)[0]
        if (!last || Date.now() - last.ts < silenceMs) return
        const session = life.latest(DECISION_KIND)?.session
        const decision = session ? openDecision(life, session) : undefined
        if (!decision || life.referencing(decision.id, OUTCOME_KIND).length > 0) return
        const route = latestRoute(life)
        if (route) evaluate(decision, SILENT_OTHER, route, true)
      } catch (error) {
        logger.error('silence check failed: %s', error)
      }
    }, Math.min(silenceMs, 60_000))
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
      const session = payload.agent.session.id
      const route = { provider: payload.modelSelection.provider, model: payload.modelSelection.model }
      try {
        const previous = openDecision(life, session)
        if (previous) evaluate(previous, cue, route)

        const params = paramsNow()
        const memory = jitrl ? experiences(life, params.gamma) : []
        const shown = relevantExperiences(cue, memory, 5)
        const labels = new Map(shown.map((e, i) => [`E${i + 1}`, e.id]))
        const recalled = decision.messages
          .filter((m) => m.source.kind === 'temir-recall')
          .map((m) => textOf(m.content))
          .join('\n')
        // ST 想像得到的行動要包括真的能做的事：e2e-15 中思考不知道有 integrate 工具，準備了「告知沒有這個工具」。
        const tools = ctx.tools.definitions(payload.agent).map((t) => t.name)
        // 懸著的事加上編號，思考才能指名被觸發的是哪一件（self/energy.ts）。
        const potentialView = energy ? presentPotential(life, { labels: true }) : undefined
        const heldNow = potentialView?.shown ?? []
        const potentialLabels = potentialView?.labels ?? new Map<string, string>()
        const goalIds = new Set(goals(life).filter((g) => g.status === 'active' || g.status === 'paused').map((g) => g.id))
        const input = [
          '## 你目前的自我狀態',
          renderSelfSnapshot(life, potentialView?.lines ?? []),
          '',
          '## 你現在可以使用的工具',
          tools.length > 0 ? tools.join('、') : '（沒有）',
          '',
          '## 自動回憶',
          recalled ? clipEnds(recalled, 5000) : '（沒有）',
          '',
          '## 過去類似處境的經驗',
          renderExperiences(shown),
          '',
          '## 對方剛說的話',
          clip(cue, 3000),
        ].join('\n')
        const output = await call('deliberate', route, deliberateSystem(energy, subtraction, perPerson), input, session, [], payload.signal)
        const parsed = output === undefined ? undefined : parseDeliberation(output, labels)
        if (!parsed) return decision
        // 處境、drive、候選與扣除理由都會進入準備訊息與紀錄：把編號換成那件事的描述（編號只在這次思考的輸入中有意義）。
        // dev5：處境寫著「她欠我回覆的：…（P1」，主模型的推理跟著寫「不該再讓 P1、P2 無限懸著」。
        const deliberation = mapDeliberationText(subtraction ? parsed : withoutExclusions(parsed), (s) => unlabel(s, potentialLabels, heldNow))

        const near = jitrl ? neighbors(deliberation.situation, memory, params, deliberation.similar) : []
        const correction = jitrl ? correct(deliberation.candidates, near, params) : uncorrected(deliberation.candidates)
        const chosen = correction.scored[correction.chosen]
        const data: DecisionData = {
          cue: clip(cue, 500),
          situation: deliberation.situation,
          ...(deliberation.drive ? { drive: deliberation.drive } : {}),
          ...(deliberation.people.length > 0 ? { people: deliberation.people } : {}),
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
        const preparation = createUserMessage({
          content: [{ type: 'text', text: renderPreparation(deliberation, correction, near, subtraction) }],
          source: { kind: 'temir-rd', form: 'notice', summary: `行動準備：${clip(chosen?.action ?? '', 60)}` },
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
