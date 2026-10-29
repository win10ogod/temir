/**
 * temir-integrate：整合期與自我修復（hypotheses.md H5、H4、H-N；ADR-0002 D4、D6）。
 *
 * 觸發：
 * - 閒置：每隔 checkMinutes 檢查一次；生命紀錄已有 idleMinutes 沒有新事件，且到期時就在背景整合。
 *   到期的條件：距離上次整合超過 intervalHours 且新回合達到 minRounds，或這段期間有被評為「轉折」的經歷（H4）。
 *   計時器不讓程序多留（unref），所以一次性的 headless 執行不會觸發。
 * - 主動：個體自己呼叫 `integrate` 工具。
 * 流程：
 * 1. 收集證據（evidence.ts）。
 * 2. 以個體最近使用的模型提出 proposal（proposal.ts）。
 * 3. 以確定性規則驗證。
 * 4. 在同一個 savepoint 內寫入修訂與 `self/integration`。
 * 中斷或失敗時不寫任何東西，下次重做。
 *
 * 設定：automatic＝閒置觸發（預設開；實驗中關閉，避免背景整合影響探針）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LifeStore } from '../life/store.ts'
import type {} from '../life/index.ts'
import { callModel, type AuxRoute } from '../recall/aux.ts'
import { clip, isHeard } from '../recall/retrieve.ts'
import { KIND, type AppraisalData } from '../self/state.ts'
import { INTEGRATION_KIND, collect, integrationStart, renderEvidence, type IntegrationTrigger } from './evidence.ts'
import { DEEP_SYSTEM, INTEGRATE_SYSTEM, applyProposal, parseProposal, validate } from './proposal.ts'

export const name = 'temir-integrate'
export const inject = ['life', 'llm', 'tools']

export interface Config {
  /** 閒置時自動整合（預設開）。 */
  readonly automatic?: boolean
  readonly checkMinutes?: number
  readonly idleMinutes?: number
  readonly intervalHours?: number
  readonly minRounds?: number
  /** 整合呼叫的逾時（毫秒，預設 180000）。 */
  readonly timeoutMs?: number
}

/** 個體最近使用的模型路由（生命日誌中最後一則回覆的 provider/model）。 */
export function latestRoute(life: LifeStore): AuxRoute | undefined {
  const model = life.latest('dsh/assistant/message')?.model
  const slash = model?.indexOf('/') ?? -1
  return model && slash > 0 ? { provider: model.slice(0, slash), model: model.slice(slash + 1) } : undefined
}

/** 是否到了整合的時候（H5 的排程；H4：轉折經歷讓整合提前並以深度模式進行）。 */
export function due(life: LifeStore, intervalHours: number, minRounds: number, now = Date.now()): { readonly due: boolean; readonly deep: boolean } {
  const last = life.latest(INTEGRATION_KIND)
  const from = integrationStart(life)
  const rounds = life.after(from, ['dsh/user/message'], 100_000).filter(isHeard).length
  const deep = life.after(from, [KIND.appraisal], 100_000).some((e) => (e.data as AppraisalData).significance === 'pivotal')
  const elapsed = !last || now - last.ts >= intervalHours * 3_600_000
  return { due: rounds > 0 && (deep || (rounds >= minRounds && elapsed)), deep }
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const logger = ctx.logger('temir-integrate')
  const timeoutMs = config?.timeoutMs ?? 180_000
  let running: Promise<string> | undefined

  async function integrate(trigger: IntegrationTrigger, deepRequested: boolean): Promise<string> {
    const since = integrationStart(life)
    const pivotal = collect(life, since).pivotal
    const deep = deepRequested || pivotal
    // 深度整合（H4）重新檢視核心價值、人生敘事與長期目標，需要整段生命的經歷（仍受各類上限約束），
    // 不只是上次整合之後的新事件；一般整合只看新的經歷。排程都推進到現在。
    const ev = collect(life, deep ? 0 : since)
    if (ev.rounds.length === 0 && ev.appraisals.length === 0 && ev.outcomes.length === 0) return '上次整合以後沒有新的經歷，這次沒有整合。'
    const route = latestRoute(life)
    if (!route) return '找不到可用的模型路由，這次沒有整合。'
    const model = `${route.provider}/${route.model}`
    const input = renderEvidence(life, ev)
    let output: string
    try {
      // 會推理的模型可能把大部分 token 用在推理（e2e-13 中 Nemotron 在 8192 上限下只輸出 287 字的殘缺 JSON），所以上限放寬。
      const call = await callModel(ctx, route, deep ? DEEP_SYSTEM : INTEGRATE_SYSTEM, input, AbortSignal.timeout(timeoutMs), 32_000)
      output = call.output
      life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'integrate', ms: call.ms, retried: call.retried, input: clip(input, 12_000), output } })
    } catch (error) {
      if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'integrate', error: String(error), input: clip(input, 12_000) } })
      return `整合的模型呼叫失敗（${String(error)}），這次沒有修改任何紀錄。`
    }
    const proposal = parseProposal(output)
    if (!proposal) return '整合的輸出無法解析，這次沒有修改任何紀錄。'
    const { accepted, rejected, deferred } = validate(life, ev, proposal)
    const result = life.transaction(() => applyProposal(life, ev, accepted, rejected, deferred, { trigger, deep, model, output }))
    const parts = [
      `${deep ? '深度' : ''}整合完成（${result.integration}）：`,
      `教訓 ${accepted.lessons.length}、重新評價 ${accepted.reappraisals.length}、自我模型${accepted.selfRevision ? '已修訂' : '未修訂'}、人生敘事${accepted.story ? '已改寫' : '未改寫'}、目標變更 ${accepted.goals.length}、過時事實 ${accepted.outdated.length}；`,
      `未解的矛盾 ${accepted.contradictions.length} 條；`,
      `保留為提案 ${deferred.length} 項${deferred.length > 0 ? `（${deferred.map((d) => `${d.kind}：${d.reason}`).join('；')}）` : ''}；`,
      `丟棄 ${rejected.length} 項${rejected.length > 0 ? `（${rejected.map((r) => `${r.item}：${r.reason}`).join('；')}）` : ''}。`,
    ]
    if (accepted.change) parts.push(`\n${accepted.change}`)
    return parts.join('')
  }

  function start(trigger: IntegrationTrigger, deep: boolean): Promise<string> {
    if (running) return running
    running = integrate(trigger, deep)
      .catch((error: unknown) => {
        logger.error('integration failed: %s', error)
        return `整合失敗：${String(error)}`
      })
      .finally(() => {
        running = undefined
      })
    return running
  }

  if (config?.automatic ?? true) {
    const checkMs = (config?.checkMinutes ?? 30) * 60_000
    const idleMs = (config?.idleMinutes ?? 30) * 60_000
    const intervalHours = config?.intervalHours ?? 24
    const minRounds = config?.minRounds ?? 10
    const timer = setInterval(() => {
      try {
        if (running || !life.isOpen) return
        const lastEvent = life.recent(1)[0]
        if (lastEvent && Date.now() - lastEvent.ts < idleMs) return
        const check = due(life, intervalHours, minRounds)
        if (check.due) void start(check.deep ? 'pivotal' : 'idle', check.deep)
      } catch (error) {
        logger.error('integration check failed: %s', error)
      }
    }, checkMs)
    timer.unref()
    ctx.effect(() => () => clearInterval(timer), 'temir-integrate: stop idle check')
  }
  ctx.effect(
    () => async () => {
      if (running) await running
    },
    'temir-integrate: finish running integration',
  )

  ctx.tools.register(
    defineTool({
      name: 'integrate',
      description:
        '進行一次整合：回顧上次整合以後的經歷（對話、感受、行動前的預測與實際結果、目標），整理出教訓，並視需要重新評價過去、修訂自我模型、改寫人生敘事、調整目標。可以在你覺得需要沉澱時使用；結果只會新增紀錄。',
      parameters: {
        deep: { type: 'boolean', description: '深度整合：重新檢視核心價值、人生敘事與長期目標（遇到轉折時可用）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return start('voluntary', args.deep ?? false)
      },
    }),
  )
}
