/**
 * temir-integrate：整合期與自我修復（hypotheses.md H5、H4、H-N；ADR-0002 D4、D6）。
 *
 * 觸發：
 * - 閒置：每隔 checkMinutes 檢查一次；生命紀錄已有 idleMinutes 沒有新事件，且到期時就在背景整合。
 *   到期的條件：距離上次整合超過 intervalHours 且新回合達到 minRounds。計時器不讓程序多留（unref）。
 * - 轉折（性質 4：重大事件可能讓 PC 在短時間內劇烈轉變；H4）：上次整合以後，個體在事後比對、念頭或感受紀錄中
 *   決定要現在就重新檢視自己（reconsider；舊紀錄是被評為「轉折」）時，不等閒置，在那一回合結束時就以深度模式整合；
 *   程序在那之前結束的話，下次啟動時補做。要不要只由個體自己判斷，沒有數值門檻。
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
import { auxRecord, modelCaller, type AuxRoute, type CallModel, type Log } from '../recall/aux.ts'
import { clipKeepLines, isHeard } from '../recall/retrieve.ts'
import { currentProcedure, procedureVersions } from '../self/procedure.ts'
import { INTEGRATION_KIND, collect, integrationStart, reconsiderSince, renderEvidence, type IntegrationTrigger } from './evidence.ts'
import { applyProposal, integrateRetryNote, integrateSystem, parseProposal, proposalProblems, validate } from './proposal.ts'
import { describeGate, runProcedureGate, type GateCall } from './procedure-gate.ts'
import { DEFAULT_PARAMS } from '../rd/jitrl.ts'
import { replayCases } from '../rd/memory.ts'
import { REPLAY_KIND, adoptedParamsOf, replay } from '../rd/replay.ts'

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
  /** 轉折經歷後立即整合（預設開；H4）。 */
  readonly pivotal?: boolean
  /** 啟動時補做轉折整合前等待的秒數（預設 10）。 */
  readonly pivotalDelaySeconds?: number
  /** 能量（H-E，預設開）：證據中的「懸著的事」與 release。消融實驗可關閉。 */
  readonly energy?: boolean
  /** 整合之後的日誌重播（M2，預設開；rd/replay.ts）。 */
  readonly replay?: boolean
}

/** 個體最近使用的模型路由（生命日誌中最後一則回覆的 provider/model）。 */
export function latestRoute(life: LifeStore): AuxRoute | undefined {
  const model = life.latest('dsh/assistant/message')?.model
  const slash = model?.indexOf('/') ?? -1
  return model && slash > 0 ? { provider: model.slice(0, slash), model: model.slice(slash + 1) } : undefined
}

/** 上次整合以後，是否有讓個體想現在就重新檢視自己的經歷還沒有整合（H4；ADR-0008 §2 的 reconsider，舊紀錄的「轉折」）。 */
export function pendingPivotal(life: LifeStore): boolean {
  return reconsiderSince(life, integrationStart(life))
}

/** 是否到了整合的時候（H5 的排程；H4：轉折經歷讓整合提前並以深度模式進行）。 */
export function due(life: LifeStore, intervalHours: number, minRounds: number, now = Date.now()): { readonly due: boolean; readonly deep: boolean } {
  const last = life.latest(INTEGRATION_KIND)
  const from = integrationStart(life)
  const rounds = life.after(from, ['dsh/user/message'], 100_000).filter(isHeard).length
  const deep = reconsiderSince(life, from)
  const elapsed = !last || now - last.ts >= intervalHours * 3_600_000
  return { due: rounds > 0 && (deep || (rounds >= minRounds && elapsed)), deep }
}

/** 整合的依賴：生命日誌、輔助模型呼叫（正式執行是 modelCaller(ctx)；單元測試以測試替身注入）與記錄。 */
export interface IntegrateDeps {
  readonly life: LifeStore
  readonly call: CallModel
  readonly logger: Log
}

/**
 * 一次整合（流程見檔頭）。輸出解析不了、或 PC 修訂缺少穩定性與適應性的判斷時，附上問題重問一次（proposalProblems）；
 * 重問的輸出能解析就用它，否則用第一次的。呼叫失敗時不重問。回傳給工具與紀錄看的說明。
 */
export async function runIntegration(deps: IntegrateDeps, config: Config | undefined, trigger: IntegrationTrigger, deepRequested: boolean): Promise<string> {
  const { life, logger } = deps
  const timeoutMs = config?.timeoutMs ?? 180_000
  const since = integrationStart(life)
  const pivotal = collect(life, since).pivotal
  const deep = deepRequested || pivotal
  // 深度整合（H4）重新檢視核心價值、人生敘事與長期目標，需要整段生命的經歷（仍受各類上限約束），
  // 不只是上次整合之後的新事件；一般整合只看新的經歷。排程都推進到現在。
  const ev = collect(life, deep ? 0 : since, undefined, config?.energy ?? true)
  if (ev.rounds.length === 0 && ev.appraisals.length === 0 && ev.outcomes.length === 0) return '上次整合以後沒有新的經歷，這次沒有整合。'
  const route = latestRoute(life)
  if (!route) return '找不到可用的模型路由，這次沒有整合。'
  const model = `${route.provider}/${route.model}`
  const input = renderEvidence(life, ev)
  const procedure = currentProcedure(life, 'integrate')
  const system = integrateSystem({ procedure, deep })
  // 輸入保留換行：做法的閘門以真實的輸入重跑（ADR-0008 §3）。
  const used = { procedures: procedureVersions([procedure]), input: clipKeepLines(input, 60_000) }
  async function ask(prompt: string): Promise<{ readonly output: string } | { readonly error: unknown }> {
    try {
      // 會推理的模型可能把大部分 token 用在推理（e2e-13 中 Nemotron 在 8192 上限下只輸出 287 字的殘缺 JSON），所以上限放寬。
      const call = await deps.call(route!, prompt, input, AbortSignal.timeout(timeoutMs), 32_000)
      life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'integrate', ...auxRecord(call), ...used, output: call.output } })
      return { output: call.output }
    } catch (error) {
      if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose: 'integrate', error: String(error), ...used } })
      return { error }
    }
  }
  const first = await ask(system)
  if ('error' in first) return `整合的模型呼叫失敗（${String(first.error)}），這次沒有修改任何紀錄。`
  let output = first.output
  const problems = proposalProblems(output)
  if (problems.length > 0 && life.isOpen) {
    const again = await ask(`${system}\n${integrateRetryNote(problems)}`)
    if ('output' in again && parseProposal(again.output)) output = again.output
  }
  const proposal = parseProposal(output)
  if (!proposal) return '整合的輸出無法解析（重問一次之後仍無法解析），這次沒有修改任何紀錄。'
  const { accepted, rejected, deferred } = validate(life, ev, proposal)
  const result = life.transaction(() => applyProposal(life, ev, accepted, rejected, deferred, { trigger, deep, model, output }))
  // 做法的修訂（ADR-0008 §3）：通過兩項判準的提案進入閘門（探測、合成）；revise 時修改後的版本再對照一輪。失敗時提案留著，沒有決定。
  const gated: string[] = []
  const gateCall: GateCall = async (prompt, probeInput, purpose) => {
    const call = await deps.call(route, prompt, probeInput, AbortSignal.timeout(timeoutMs), purpose === 'procedure-probe' ? 32_000 : undefined)
    if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose, ...auxRecord(call), input: clipKeepLines(probeInput, 20_000), output: call.output } })
    return call.output
  }
  for (const id of result.procedureProposals) {
    try {
      let proposalEvent = life.get(id)
      for (let round = 0; proposalEvent && round < 2 && life.isOpen; round++) {
        const { decision, next } = await runProcedureGate(life, proposalEvent, gateCall)
        gated.push(describeGate(life, decision))
        proposalEvent = next
      }
    } catch (error) {
      logger.warn('procedure gate failed: %s', error)
      gated.push(`做法的對照中斷（${String(error)}），提案保留，之後可以再對照。`)
    }
  }
  if (config?.replay ?? true) {
    // 日誌重播（M2，ADR-0002 D16）：整合之後，在已記錄的決定上評估 JitRL 經驗估計的參數；純計算，不呼叫模型。
    try {
      const replayed = replay(replayCases(life, DEFAULT_PARAMS.gamma), { ...DEFAULT_PARAMS, ...adoptedParamsOf(life) })
      if (replayed) life.append({ kind: REPLAY_KIND, origin: 'self', data: replayed, causes: [result.integration] })
    } catch (error) {
      logger.warn('replay failed: %s', error)
    }
  }
  const parts = [
    `${deep ? '深度' : ''}整合完成（${result.integration}）：`,
    `教訓 ${accepted.lessons.length}、重新評價 ${accepted.reappraisals.length}、自我模型${accepted.selfRevision ? '已修訂' : '未修訂'}、人生敘事${accepted.story ? '已改寫' : '未改寫'}、目標變更 ${accepted.goals.length}、過時事實 ${accepted.outdated.length}；`,
    `未解的矛盾 ${accepted.contradictions.length} 條；`,
    `保留為提案 ${deferred.length} 項${deferred.length > 0 ? `（${deferred.map((d) => `${d.kind}：${d.reason}`).join('；')}）` : ''}；`,
    `丟棄 ${rejected.length} 項${rejected.length > 0 ? `（${rejected.map((r) => `${r.item}：${r.reason}`).join('；')}）` : ''}。`,
  ]
  if (gated.length > 0) parts.push(`\n${gated.join('\n')}`)
  if (accepted.change) parts.push(`\n${accepted.change}`)
  return parts.join('')
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const logger = ctx.logger('temir-integrate')
  const deps: IntegrateDeps = { life, call: modelCaller(ctx), logger }
  let running: Promise<string> | undefined

  function start(trigger: IntegrationTrigger, deep: boolean): Promise<string> {
    if (running) return running
    running = runIntegration(deps, config, trigger, deep)
      .catch((error: unknown) => {
        logger.error('integration failed: %s', error)
        return `整合失敗：${String(error)}`
      })
      .finally(() => {
        running = undefined
      })
    return running
  }

  // 轉折：回合結束時整合；啟動時若有還沒整合的轉折，稍後補做（不阻塞啟動）。
  if (config?.pivotal ?? true) {
    ctx.on('session/event', (_session: unknown, event: { readonly type: string }) => {
      try {
        if (event.type === 'turn/end' && !running && life.isOpen && pendingPivotal(life)) void start('pivotal', true)
      } catch (error) {
        logger.error('pivotal check failed: %s', error)
      }
    })
    const startup = setTimeout(() => {
      try {
        if (!running && life.isOpen && pendingPivotal(life)) void start('pivotal', true)
      } catch (error) {
        logger.error('pivotal check failed: %s', error)
      }
    }, (config?.pivotalDelaySeconds ?? 10) * 1000)
    startup.unref()
    ctx.effect(() => () => clearTimeout(startup), 'temir-integrate: cancel startup pivotal check')
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
