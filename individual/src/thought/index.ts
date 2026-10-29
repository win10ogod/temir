/**
 * temir-thought：閒置時的念頭（hypotheses.md H0 的內部刺激、H-E 勢能轉為動能；ADR-0002 D11）。
 *
 * 每隔 checkMinutes 檢查一次。生命紀錄已有 idleMinutes 沒有新事件、而且有懸著的事或進行中的目標時，
 * 就給個體一段安靜的時間：以它最近使用的模型問它有沒有哪件事浮上心頭（thought.ts）。
 * 每段閒置最多一次：念頭本身也是新的事件，之後要等到有新的經歷、再度閒置，才會有下一次。
 * 計時器不讓程序多留（unref），所以一次性的 headless 執行與實驗的探針不會觸發。
 *
 * 設定：automatic（預設開）、checkMinutes（預設 5）、idleMinutes（預設 15）、timeoutMs（預設 90000）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../life/index.ts'
import { latestRoute } from '../integrate/index.ts'
import { callModel } from '../recall/aux.ts'
import { clip } from '../recall/retrieve.ts'
import { THOUGHT_SYSTEM, hasPotential, parseThought, recordThought, thoughtInput } from './thought.ts'

export const name = 'temir-thought'
export const inject = ['life', 'llm']

export interface Config {
  readonly automatic?: boolean
  readonly checkMinutes?: number
  readonly idleMinutes?: number
  readonly timeoutMs?: number
}

export function apply(ctx: Context, config: Config | undefined): void {
  if (config?.automatic === false) return
  const life = ctx.life
  const logger = ctx.logger('temir-thought')
  const checkMs = (config?.checkMinutes ?? 5) * 60_000
  const idleMs = (config?.idleMinutes ?? 15) * 60_000
  const timeoutMs = config?.timeoutMs ?? 90_000
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
      life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'thought', ms: call.ms, retried: call.retried, input: clip(input, 8000), output: call.output } })
      const judged = parseThought(call.output)
      if (judged) life.transaction(() => recordThought(life, judged, labels, model))
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
