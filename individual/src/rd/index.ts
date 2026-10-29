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
 *
 * 設定（消融實驗用）：enabled＝整個 RD 階段；jitrl＝經驗修正（關閉時只依口述信心選擇）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { LifeEvent } from '../life/store.ts'
import type {} from '../life/index.ts'
import { callModel, type AuxRoute } from '../recall/aux.ts'
import { clip, clipEnds } from '../recall/retrieve.ts'
import { currentSelfModel, renderSelfSnapshot } from '../self/state.ts'
import { DELIBERATE_SYSTEM, OUTCOME_SYSTEM, parseDeliberation, parseOutcome } from './aux.ts'
import { DEFAULT_PARAMS, correct, neighbors, uncorrected, type Params } from './jitrl.ts'
import {
  DECISION_KIND,
  OUTCOME_KIND,
  experiences,
  openDecision,
  relevantExperiences,
  renderExperiences,
  renderPreparation,
  turnReply,
  type DecisionData,
  type OutcomeData,
} from './memory.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-rd': { readonly kind: 'temir-rd' } & ContextFormed
  }
}

export const name = 'temir-rd'
export const inject = ['life', 'llm']

export interface Config {
  /** RD 階段（預設開）。 */
  readonly enabled?: boolean
  /** JitRL 經驗修正（預設開；關閉時只依口述信心選擇）。 */
  readonly jitrl?: boolean
  /** JitRL 超參數（預設見 jitrl.ts）。 */
  readonly params?: Partial<Params>
  /** 輔助呼叫逾時（毫秒，預設 90000）。 */
  readonly timeoutMs?: number
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
  const params: Params = { ...DEFAULT_PARAMS, ...config?.params }
  const timeoutMs = config?.timeoutMs ?? 90_000
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

  /** 事後比對：上一個決定的預測 vs 實際。 */
  function evaluate(decision: LifeEvent, heard: string, route: AuxRoute): void {
    if (evaluating.has(decision.id)) return
    evaluating.add(decision.id)
    const task = (async () => {
      const data = decision.data as DecisionData
      const planned = data.candidates[data.chosen]
      const self = currentSelfModel(life)
      const input = [
        '## 你目前的自我模型',
        self ? self.text : '（尚未書寫）',
        '',
        '## 你當時對處境的判斷',
        data.situation,
        '',
        '## 你當時準備的做法與預測',
        planned ? `做法：${planned.action}（${planned.kind}）\n預測：${planned.prediction}` : '（沒有）',
        '',
        '## 你實際說了什麼',
        clipEnds(turnReply(life, decision), 1500) || '（沒有說出口的回覆）',
        '',
        '## 對方接著說了什麼',
        clip(heard, 1500),
      ].join('\n')
      const output = await call('outcome', route, OUTCOME_SYSTEM, input, decision.session ?? undefined, [decision.id])
      const judged = output === undefined ? undefined : parseOutcome(output)
      if (!judged || !life.isOpen) return
      const outcome: OutcomeData = { decision: decision.id, ...judged, selfVersion: self?.version ?? 0, heard: clip(heard, 500) }
      life.append({
        kind: OUTCOME_KIND,
        origin: 'self',
        session: decision.session ?? undefined,
        data: outcome,
        text: [`預測：${planned?.prediction ?? ''}`, `實際：${judged.actual}`, judged.lesson && `教訓：${judged.lesson}`].filter(Boolean).join('\n'),
        causes: [decision.id],
      })
    })()
      .catch((error: unknown) => logger.error('outcome evaluation failed: %s', error))
      .finally(() => evaluating.delete(decision.id))
    background.add(task)
    void task.finally(() => background.delete(task))
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

        const memory = jitrl ? experiences(life, params.gamma) : []
        const shown = relevantExperiences(cue, memory, 5)
        const labels = new Map(shown.map((e, i) => [`E${i + 1}`, e.id]))
        const recalled = decision.messages
          .filter((m) => m.source.kind === 'temir-recall')
          .map((m) => textOf(m.content))
          .join('\n')
        const input = [
          '## 你目前的自我狀態',
          renderSelfSnapshot(life),
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
        const output = await call('deliberate', route, DELIBERATE_SYSTEM, input, session, [], payload.signal)
        const deliberation = output === undefined ? undefined : parseDeliberation(output, labels)
        if (!deliberation) return decision

        const near = jitrl ? neighbors(deliberation.situation, memory, params, deliberation.similar) : []
        const correction = jitrl ? correct(deliberation.candidates, near, params) : uncorrected(deliberation.candidates)
        const chosen = correction.scored[correction.chosen]
        const data: DecisionData = {
          cue: clip(cue, 500),
          situation: deliberation.situation,
          candidates: correction.scored,
          chosen: correction.chosen,
          value: correction.value,
          neighbors: near.map((n) => ({ id: n.experience.id, similarity: n.similarity, judged: n.judged, ret: n.experience.ret })),
          shown: Object.fromEntries(labels),
          jitrl,
          params,
          selfVersion: currentSelfModel(life)?.version ?? 0,
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
          content: [{ type: 'text', text: renderPreparation(deliberation, correction, near) }],
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
