/**
 * temir-thought：閒置時的念頭（hypotheses.md H0 的內部刺激、H-E 勢能轉為動能；ADR-0002 D11）。
 *
 * 每隔 checkMinutes 檢查一次。生命紀錄已有 idleMinutes 沒有新事件、而且有懸著的事或進行中的目標時，
 * 就給個體一段安靜的時間：以它最近使用的模型問它有沒有哪件事浮上心頭（thought.ts）。
 * 每段閒置最多一次：念頭本身也是新的事件，之後要等到有新的經歷、再度閒置，才會有下一次。
 * 計時器不讓程序多留（unref），所以一次性的 headless 執行與實驗的探針不會觸發。
 *
 * 自發行動（plan v2 M4）：念頭留下打算、而且個體決定現在就說（now）時，在最近一段對話中主動開口：
 * 以 DSH 的 `agent.followup`（dsh-tool-jobs 叫醒閒置 agent 的同一種方式）開始一個由念頭發起的回合。
 * 排程規則（mayInitiate）：上次主動開口之後對方要先說過話；24 小時內最多 INITIATIVE_PER_DAY 次。
 * 對話已經不在或正在進行時不開口，照實記下。
 *
 * IM（ADR-0006）：dsh-im 的會話同步不轉送由 temir-thought 發起的回合。設定 imTargets（從 dsh-im 設定頁複製的
 * botId＋targetId）時，主動開口那一回合結束後，把個體說的話以 dsh-im 的 dshIm.send 送過去，並記下結果。
 *
 * 設定：automatic（預設開）、checkMinutes（預設 5）、idleMinutes（預設 15）、timeoutMs（預設 180000）、spontaneous（預設開）、
 * imTargets（預設無）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '../life/index.ts'
import { latestRoute } from '../integrate/index.ts'
import { callModel } from '../recall/aux.ts'
import { clip } from '../recall/retrieve.ts'
import type { ThoughtData } from '../self/energy.ts'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { INITIATIVE_IM_KIND, INITIATIVE_KIND, InitiativeRelay, THOUGHT_SYSTEM, hasPotential, initiativeNote, mayInitiate, parseThought, recordThought, thoughtInput, type ImTarget, type InitiativeData } from './thought.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-thought': { readonly kind: 'temir-thought' }
  }
}

export const name = 'temir-thought'
export const inject = ['life', 'llm']

export interface Config {
  readonly automatic?: boolean
  readonly checkMinutes?: number
  readonly idleMinutes?: number
  readonly timeoutMs?: number
  /** 念頭決定現在就說時主動開口（M4，預設開）。 */
  readonly spontaneous?: boolean
  /** 主動開口也送到這些 IM 目標（dsh-im 的 botId＋targetId；ADR-0006）。 */
  readonly imTargets?: readonly ImTarget[]
}

/** dsh-im 的同 Host 服務（只用到的部分；PROACTIVE_DELIVERY.md）。 */
interface DshIm {
  send(botId: string, targetId: string, text: string, options?: { format?: 'plain' | 'markdown' }): Promise<unknown>
}

const relay = new InitiativeRelay()

/**
 * 對話的 agent：還在記憶體中就直接用；不在時（例如 DSH 重啟之後），透過 Web host 的 sessionController.resolveAgent 重新載入。
 * - 這是 DSH 給其他 Host API 領域用的方法（dsh-api-session-controller：「Resolve or resume one ordinary Session for another
 *   Host API domain」）。
 * - 擁有權仍屬於 session controller，dsh-im 之後送進來的訊息用的是同一個 agent。
 * - headless 與 SDK 沒有這個服務，照舊回報不在。
 * e2e-38：DSH 重啟之後，原本是「最近的對話已經不在，沒有地方可以開口」。
 */
async function liveAgent(ctx: Context, session: string): Promise<Agent | undefined> {
  const live = (ctx.get('agents') as { get(id: string): Agent | undefined } | undefined)?.get(session)
  if (live) return live
  const controller = ctx.get('sessionController') as { resolveAgent(id: string): Promise<{ readonly agent?: Agent; readonly error?: unknown }> } | undefined
  if (!controller) return undefined
  try {
    const result = await controller.resolveAgent(session)
    return result.agent
  } catch (error) {
    ctx.logger('temir-thought').warn('could not resume session %s: %s', session, error)
    return undefined
  }
}

/**
 * 主動開口：在最近一段對話中，以念頭發起一個回合；照實記下送出與否（self/initiative）。
 * agent 以 session id 取得、閒置時才 followup（與 dsh-tool-jobs 叫醒 agent 的方式相同）。
 */
export async function deliverInitiative(ctx: Context, thoughtId: string): Promise<InitiativeData | undefined> {
  const life = ctx.life
  const t = life.get(thoughtId)?.data as ThoughtData | undefined
  if (!t?.now || !t.intention) return undefined
  const session = life.latest('dsh/user/message')?.session ?? null
  const record = (delivered: boolean, reason?: string): InitiativeData => {
    const data: InitiativeData = { thought: thoughtId, session, intention: t.intention, delivered, ...(reason ? { reason } : {}) }
    life.append({ kind: INITIATIVE_KIND, origin: 'self', session: session ?? undefined, data, ...(delivered ? { text: `我決定主動開口：${t.intention}` } : {}), causes: [thoughtId] })
    return data
  }
  const pace = mayInitiate(life)
  if (!pace.ok) return record(false, pace.reason)
  const agent = session ? await liveAgent(ctx, session) : undefined
  if (!life.isOpen) return undefined
  if (!agent) return record(false, '最近的對話已經不在，沒有地方可以開口')
  if (agent.status !== 'idle') return record(false, '對話正在進行中')
  const data = record(true)
  if (session) relay.expect(session, thoughtId)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: initiativeNote(t.thought, t.intention) }], source: { kind: 'temir-thought' } }))
  ctx.logger('temir-thought').info('initiative in session %s: %s', session, t.intention)
  return data
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  // 主動開口那一回合結束後，送到設定的 IM 目標（dsh-im 沒有載入時照實記下）。
  // automatic: false 只關閉閒置時的念頭，不關閉投遞：e2e-38 中關了 automatic，relay 也沒有註冊，主動開口沒有送到 IM。
  const targets = config?.imTargets ?? []
  if (targets.length > 0) {
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      const done = relay.observe(session.id, event)
      if (!done) return
      const im = ctx.get('dshIm') as DshIm | undefined
      for (const target of targets) {
        const write = (ok: boolean, error?: string) => {
          if (life.isOpen) life.append({ kind: INITIATIVE_IM_KIND, origin: 'self', session: session.id, data: { thought: done.thought, botId: target.botId, targetId: target.targetId, ok, ...(error ? { error } : {}) }, causes: [done.thought] })
        }
        if (!im) {
          write(false, '沒有載入 dsh-im（dshIm 服務不存在）')
          continue
        }
        im.send(target.botId, target.targetId, done.text, { format: 'markdown' }).then(
          () => write(true),
          (error: unknown) => write(false, error instanceof Error ? `${(error as { code?: string }).code ?? ''} ${error.message}`.trim() : String(error)),
        )
      }
    })
  }
  if (config?.automatic === false) return
  const logger = ctx.logger('temir-thought')
  const checkMs = (config?.checkMinutes ?? 5) * 60_000
  const idleMs = (config?.idleMinutes ?? 15) * 60_000
  // 輔助呼叫的逾時（思考開著時要留餘裕：本機的思考模型在負載下第 90 百分位 77 秒，DeepSeek low 最慢 52 秒；dev10）
  const timeoutMs = config?.timeoutMs ?? 180_000
  let running: Promise<void> | undefined
  /** 上一次念頭（或嘗試）之後生命紀錄的最後一個 seq：沒有新事件就不再想。 */
  let quietAfter = -1

  async function think(): Promise<void> {
    const route = latestRoute(life)
    if (!route) return
    const model = `${route.provider}/${route.model}`
    const { input, labels } = thoughtInput(life)
    try {
      const call = await callModel(ctx, route, THOUGHT_SYSTEM, input, AbortSignal.timeout(timeoutMs))
      if (!life.isOpen) return
      life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'thought', ms: call.ms, retried: call.retried, effort: call.effort, reasoningChars: call.reasoningChars, input: clip(input, 8000), output: call.output } })
      const judged = parseThought(call.output)
      const id = judged ? life.transaction(() => recordThought(life, judged, labels, model)) : undefined
      if (id && judged?.now && (config?.spontaneous ?? true)) await deliverInitiative(ctx, id)
    } catch (error) {
      if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'thought', error: String(error), input: clip(input, 8000) } })
      logger.warn('thought failed: %s', error)
    } finally {
      if (life.isOpen) quietAfter = life.lastSeq()
    }
  }

  const timer = setInterval(() => {
    try {
      if (running || !life.isOpen) return
      if (life.lastSeq() === quietAfter) return
      const last = life.recent(1)[0]
      if (!last || Date.now() - last.ts < idleMs) return
      if (!hasPotential(life)) {
        quietAfter = life.lastSeq()
        return
      }
      running = think().finally(() => {
        running = undefined
      })
    } catch (error) {
      logger.error('thought check failed: %s', error)
    }
  }, checkMs)
  timer.unref()
  ctx.effect(() => () => clearInterval(timer), 'temir-thought: stop idle check')
  ctx.effect(
    () => async () => {
      if (running) await running
    },
    'temir-thought: finish running thought',
  )
}
