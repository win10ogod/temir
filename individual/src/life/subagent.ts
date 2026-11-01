/**
 * 子代理：DSH 的 dsh-subagent 建立的子 session（agent-team 的隊友也是），session header 的 origin 是 'subagent'
 * （dsh-session 0.2.2-alpha.2 `SessionHeader.origin`）。交給子代理的任務也以 source.kind 'user' 送進子 session，
 * 所以不能只看訊息來源。
 *
 * 子代理是個體手上的工具，不是個體本人，也不知道自己屬於個體（使用者 2026-11-01：「子代理不該知道自己是個體的一部分」）：
 * - 個體的處境、自我狀態、技能與工具只給主 agent。段落與動態脈絡在子代理的組合中是空的（DSH 丟掉空的段落），
 *   工具以 `when` 排除（同時排除宣告與執行），技能只註冊在主 agent 的範圍。
 * - 回憶、思考、沉默提醒、事實擷取、插件的自動啟用都不作用在子代理；組合原本的提示與工具不動。
 * - 子代理的事件照記進生命日誌，但 kind 是 `subagent/…`、不建立回憶索引：不算對方說的話，也不算自己說的話。
 *   它做完的結果以工具結果回到主對話，照常記下。
 */
import type { Agent } from '@deepseek-ai/dsh-agent'

/** 子代理事件在生命日誌中的 kind 前綴（取代 `dsh/`）。 */
export const SUBAGENT_KIND_PREFIX = 'subagent/'

interface SessionLike {
  readonly header?: { readonly origin?: string } | undefined
}

export function isSubagentSession(session: SessionLike | undefined): boolean {
  return session?.header?.origin === 'subagent'
}

export function isSubagent(agent: { readonly session: SessionLike } | undefined): boolean {
  return isSubagentSession(agent?.session)
}

/** 工具的註冊選項：只給主 agent（dsh-tools `ToolRegistrationOptions.when`）。 */
export const SELF_ONLY = { when: ({ agent }: { readonly agent: Agent }): boolean => !isSubagent(agent) }

/** 提示段落或動態脈絡的文字：子代理的組合得到空字串；沒有 agent 的組合（診斷）照常。 */
export function selfOnly(text: string | (() => string)): (context: { readonly agent?: Agent | undefined }) => string {
  return (context) => (isSubagent(context.agent) ? '' : typeof text === 'string' ? text : text())
}
