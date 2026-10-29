/**
 * temir-plugin：個體寫給自己的插件（ADR-0005；紀錄與驗證見 plugin.ts）。
 *
 * - plugin_write：寫下新增、修改或移除（程式碼存進生命日誌；不需要核准，因為還沒有執行）。
 * - plugin_activate：在這段對話中啟用某個插件的目前版本。
 *   - 這個版本還沒核准過時，`tools/pre-execute` 回傳 ask，核准畫面附上用途與程式碼，由創造者決定；
 *   - 核准後記下 plugin/approval，以 DSH 的 dynamicCordisRunner 定義並執行主程序的那一半。
 * - 每段對話的第一步（`agent/pre-step`）：核准過的版本自動重新啟用。DSH 的動態插件只屬於一段對話、重啟就消失。
 * - 移除：停止這段對話中的執行；之後的對話不再啟用。
 * - 執行器：Web 模式的設定檔本來就載入 dsh-cordis-host-runner；其他模式（headless、SDK）沒有。
 *   第一次需要時若找不到，就以子插件載入 DSH 自己的 DynamicCordisRunnerService（不 fork，也不會在 Web 模式重複載入）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import DynamicCordisRunnerService from '@deepseek-ai/dsh-cordis-host-runner'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '../life/index.ts'
import { PLUGIN_KIND, PLUGIN_OPS, approvalText, codeHash, idPrefix, ownPlugins, validatePlugin, type OwnPlugin, type PluginApprovalData, type PluginOp, type PluginProposalData, type PluginRunData } from './plugin.ts'

export const name = 'temir-plugin'
export const inject = ['life', 'tools']

/** dsh-cordis-host-runner 的 DynamicCordisRunnerService（只用到的部分）。 */
interface Runner {
  define(request: { sessionId: string; plugin: { kind: 'new'; idPrefix: string }; name: string; purpose: string; code: { host: string } }): { pluginId: string; packageId: string }
  run(agent: Agent, pluginId: string, packageId: string, mode: 'run' | 'update', signal?: AbortSignal): Promise<{ ok: boolean; status?: string; reason?: string; message?: string }>
  stop(agent: Agent, pluginId: string): Promise<unknown>
}

export function apply(ctx: Context): void {
  const life = ctx.life
  const logger = ctx.logger('temir-plugin')
  let loading: Promise<Runner | undefined> | undefined
  /** DSH 的插件執行器：已經有就用；沒有就以子插件載入（第一次需要時）。 */
  async function runner(): Promise<Runner | undefined> {
    const existing = ctx.get('dynamicCordisRunner') as Runner | undefined
    if (existing) return existing
    loading ??= (async () => {
      ;(ctx.plugin as (plugin: unknown, config?: unknown) => unknown)(DynamicCordisRunnerService, {})
      for (let i = 0; i < 100; i++) {
        const loaded = ctx.get('dynamicCordisRunner') as Runner | undefined
        if (loaded) return loaded
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      return undefined
    })()
    return loading
  }
  /** 這個程序中，每段對話已啟用的版本：session → 名字 → { 版本, DSH plugin id }。 */
  const active = new Map<string, Map<string, { readonly version: string; readonly pluginId: string }>>()
  const initialized = new Set<string>()

  function record(agent: Agent, data: PluginRunData): PluginRunData {
    if (life.isOpen) life.append({ kind: PLUGIN_KIND.run, origin: 'self', session: agent.session.id, data, causes: [data.proposal] })
    return data
  }

  async function start(agent: Agent, plugin: OwnPlugin): Promise<PluginRunData> {
    const r = await runner()
    const base = { proposal: plugin.version, name: plugin.name }
    if (!r) return record(agent, { ...base, ok: false, error: '這個執行環境沒有 DSH 的插件執行器（dynamicCordisRunner）' })
    const session = agent.session.id
    const running = active.get(session)?.get(plugin.name)
    if (running?.version === plugin.version) return { ...base, ok: true, status: 'running', pluginId: running.pluginId }
    try {
      if (running) await r.stop(agent, running.pluginId)
      const receipt = r.define({ sessionId: agent.id, plugin: { kind: 'new', idPrefix: idPrefix(plugin.name) }, name: plugin.name, purpose: plugin.purpose, code: { host: plugin.code } })
      const result = await r.run(agent, receipt.pluginId, receipt.packageId, 'run')
      if (result.ok) {
        const map = active.get(session) ?? new Map()
        map.set(plugin.name, { version: plugin.version, pluginId: receipt.pluginId })
        active.set(session, map)
      }
      return record(agent, {
        ...base,
        ok: result.ok,
        ...(result.status ? { status: result.status } : {}),
        pluginId: receipt.pluginId,
        packageId: receipt.packageId,
        ...(result.ok ? {} : { error: result.message ?? result.reason ?? '啟用失敗' }),
      })
    } catch (error) {
      return record(agent, { ...base, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // 每段對話的第一步：重新啟用核准過的版本。
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const agent = payload.agent
    if (initialized.has(agent.session.id)) return decision
    initialized.add(agent.session.id)
    for (const plugin of ownPlugins(life).filter((p) => p.approved)) {
      const result = await start(agent, plugin)
      if (!result.ok) logger.warn('plugin %s did not start: %s', plugin.name, result.error)
    }
    return decision
  })

  // 啟用前的核准：還沒核准過的版本一律要問創造者。
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'plugin_activate') return next()
    const wanted = String((exec.arguments as { name?: unknown } | undefined)?.name ?? '')
    const plugin = ownPlugins(life).find((p) => p.name === wanted)
    if (!plugin) return { kind: 'deny', reason: `沒有叫「${wanted}」的插件；先用 plugin_write 寫下` }
    if (plugin.approved) return next()
    const text = approvalText(plugin)
    return {
      kind: 'ask',
      reason: `temir plugin activation: ${plugin.name} (sha256 ${plugin.sha256.slice(0, 12)})`,
      displayReason: { en: `The individual wants to activate a plugin it wrote: "${plugin.name}" (sha256 ${plugin.sha256.slice(0, 12)}). Its code runs in the DSH host process (the DSH sandbox is not containment).\n\n${plugin.code.split('\n').slice(0, 80).join('\n')}`, zh: text },
    }
  })

  ctx.tools.register(
    defineTool({
      name: 'plugin_write',
      description: [
        '寫下一個給自己的插件（程式碼）：新增、修改或移除。插件在 DSH 的主程序中執行，可以為你加上新的工具或對事件的反應；技能是說明，插件是程式碼。',
        '寫下不會執行；要用 plugin_activate 啟用，而每個新版本啟用前都要經過創造你的人核准。核准過的版本之後每段對話都會自動啟用。',
        'code 是一段 async 函式的本體，要 return 一個插件，例如：',
        "return { apply(ctx) { ctx.tools.register(harness.defineTool({ name: 'day_of_year', description: '今天是今年的第幾天', parameters: {}, output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] }, async execute() { const now = new Date(); const start = new Date(now.getFullYear(), 0, 1); return String(Math.floor((now - start) / 86400000) + 1) } })) } }",
        '可用的只有 ctx.tools.register、ctx.on、ctx.provide 與 harness 的輔助函式；不要用 import 或 require。',
      ].join('\n'),
      parameters: {
        op: { type: 'string', enum: PLUGIN_OPS, required: true, description: 'add＝新增；revise＝修改既有的插件（要重新核准）；retire＝移除' },
        name: { type: 'string', required: true, description: '插件的名字：英文小寫開頭，小寫英文、數字與連字號，例如 day-counter' },
        purpose: { type: 'string', description: '這個插件做什麼、為什麼需要它（新增或修改時必填；核准畫面會給創造你的人看）' },
        code: { type: 'string', description: '插件的程式碼（新增或修改時必填）' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, exec) {
        const proposal = { op: args.op as PluginOp, name: args.name.trim(), purpose: (args.purpose ?? '').trim(), code: args.op === 'retire' ? '' : (args.code ?? '') }
        const invalid = validatePlugin(life, proposal)
        if (invalid) throw new Error(invalid)
        const data: PluginProposalData = { ...proposal, sha256: codeHash(proposal.code) }
        const event = life.append({ kind: PLUGIN_KIND.proposal, origin: 'self', session: exec.agent?.session.id, data, text: `我${proposal.op === 'retire' ? '移除了' : proposal.op === 'revise' ? '修改了' : '寫了'}插件 ${proposal.name}${proposal.purpose ? `：${proposal.purpose}` : ''}` })
        if (proposal.op === 'retire') {
          const agent = exec.agent
          const running = agent ? active.get(agent.session.id)?.get(proposal.name) : undefined
          if (agent && running) {
            await (await runner())?.stop(agent, running.pluginId)
            active.get(agent.session.id)?.delete(proposal.name)
          }
          return `已移除插件 ${proposal.name}（${event.id}）。之後的對話不會再啟用它。`
        }
        return `已寫下插件 ${proposal.name}（${event.id}，sha256 ${data.sha256.slice(0, 12)}）。要使用就呼叫 plugin_activate；這個版本啟用前要經過創造你的人核准。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'plugin_activate',
      description: '在這段對話中啟用你寫的某個插件的目前版本。還沒核准過的版本，會先請創造你的人看過程式碼再決定；核准過的版本之後每段對話都會自動啟用。啟用失敗時會回傳錯誤訊息，你可以依它修改程式碼（plugin_write revise）再試。',
      parameters: {
        name: { type: 'string', required: true, description: '插件的名字' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, exec) {
        const agent = exec.agent
        if (!agent) throw new Error('只能在對話中啟用')
        const plugin = ownPlugins(life).find((p) => p.name === args.name)
        if (!plugin) throw new Error(`沒有叫「${args.name}」的插件`)
        // 能走到這裡，代表這個版本已經核准過，或剛剛通過了核准（pre-execute 的 ask）。
        if (!plugin.approved) {
          const approval: PluginApprovalData = { proposal: plugin.version, name: plugin.name, sha256: plugin.sha256 }
          life.append({ kind: PLUGIN_KIND.approval, origin: 'body', session: agent.session.id, data: approval, text: `創造我的人核准了插件 ${plugin.name} 的這個版本`, causes: [plugin.version] })
        }
        const result = await start(agent, { ...plugin, approved: true })
        if (!result.ok) return `插件 ${plugin.name} 沒有啟用：${result.error}`
        return `插件 ${plugin.name} 已啟用（${result.status ?? 'running'}）。它提供的工具從下一步起可以使用；之後每段對話都會自動啟用這個版本。`
      },
    }),
  )
}
