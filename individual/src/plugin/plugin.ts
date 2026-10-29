/**
 * 個體寫給自己的插件（plan v2 M3「個體可以寫自己的插件」；ADR-0005）。純函式，可單獨測試；插件見 index.ts。
 *
 * 技能是說明，主模型讀了照做；插件是程式碼，在主程序中執行：新的工具、對事件的反應。
 * Harness² 的元件表中，middleware plugin 是「強制」而不是「指示」行為（research/methods/harness2.md）。
 *
 * 執行：DSH 的 dynamicCordisRunner（dsh-cordis-host-runner）在 node:vm 中執行主程序的那一半。
 * 它的說明明寫「這不是隔離：主程序的輔助函式仍是逃逸的路」（sandbox.d.ts），
 * 所以**每個版本啟用前都要經過創造者核准**（DSH `tools/pre-execute` 回傳 ask，由使用者在 DSH 的核准介面決定；
 * 沒有核准管道的環境，ask 會變成拒絕）。
 *
 * 生命日誌是唯一的真相來源：程式碼、核准、每次執行都記下。
 * DSH 的動態插件只屬於一段對話、重啟就消失，所以核准過的版本在每段新的對話中重新啟用；修改後的版本要重新核准。
 */
import { createHash } from 'node:crypto'
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { formatDay } from '../self/state.ts'

export const PLUGIN_KIND = {
  proposal: 'plugin/proposal',
  /** 創造者核准了某個版本（plugin_activate 的核准通過之後）。 */
  approval: 'plugin/approval',
  /** 在某段對話中啟用（成功或失敗）。 */
  run: 'plugin/run',
} as const

export const PLUGIN_OPS = ['add', 'revise', 'retire'] as const
export type PluginOp = (typeof PLUGIN_OPS)[number]

/** 上限（本專案的選擇）：程式碼長度、用途說明、同時存在的插件數。 */
export const PLUGIN_LIMITS = { code: 20_000, purpose: 300, plugins: 10 } as const
const PLUGIN_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export interface PluginProposalData {
  readonly op: PluginOp
  readonly name: string
  readonly purpose: string
  /** DSH 動態插件的主程序一半：一段 async 函式本體，要 `return` 一個插件（函式或帶 apply(ctx) 的物件）。 */
  readonly code: string
  readonly sha256: string
}

export interface PluginApprovalData {
  readonly proposal: string
  readonly name: string
  readonly sha256: string
}

export interface PluginRunData {
  readonly proposal: string
  readonly name: string
  readonly ok: boolean
  readonly status?: string
  readonly pluginId?: string
  readonly packageId?: string
  readonly error?: string
}

export interface OwnPlugin {
  readonly name: string
  readonly purpose: string
  readonly code: string
  readonly sha256: string
  /** 目前版本的 plugin/proposal 事件 id。 */
  readonly version: string
  readonly approved: boolean
  readonly writtenAt: number
}

export function codeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** 目前的插件（每個名字最新的版本；移除的不列）與核准狀態。 */
export function ownPlugins(life: LifeStore): OwnPlugin[] {
  const current = new Map<string, LifeEvent>()
  for (const event of life.all(PLUGIN_KIND.proposal)) {
    const p = event.data as PluginProposalData
    if (p.op === 'retire') current.delete(p.name)
    else current.set(p.name, event)
  }
  const approved = new Set(life.all(PLUGIN_KIND.approval).map((e) => (e.data as PluginApprovalData).proposal))
  return [...current.values()].map((event) => {
    const p = event.data as PluginProposalData
    return { name: p.name, purpose: p.purpose, code: p.code, sha256: p.sha256, version: event.id, approved: approved.has(event.id), writtenAt: event.ts }
  })
}

/** 確定性的驗證：名字、新增與修改的對象、長度、數量上限，以及程式碼能不能解析（只編譯、不執行）。 */
export function validatePlugin(life: LifeStore, p: Pick<PluginProposalData, 'op' | 'name' | 'purpose' | 'code'>): string | undefined {
  if (!PLUGIN_NAME.test(p.name) || p.name.length < 3 || p.name.length > 40) return `名字「${p.name}」不符合規則：英文小寫開頭，小寫英文、數字與連字號，3～40 字`
  const existing = new Set(ownPlugins(life).map((x) => x.name))
  if (p.op === 'add' && existing.has(p.name)) return `已經有叫「${p.name}」的插件；要修改請用 revise`
  if (p.op !== 'add' && !existing.has(p.name)) return `沒有叫「${p.name}」的插件`
  if (p.op === 'retire') return undefined
  if (!p.purpose.trim() || p.purpose.length > PLUGIN_LIMITS.purpose) return `用途要寫，最多 ${PLUGIN_LIMITS.purpose} 字`
  if (!p.code.trim() || p.code.length > PLUGIN_LIMITS.code) return `程式碼不能是空的，最多 ${PLUGIN_LIMITS.code} 字`
  if (p.op === 'add' && existing.size >= PLUGIN_LIMITS.plugins) return `插件已有 ${PLUGIN_LIMITS.plugins} 個；先移除不用的再新增`
  try {
    // 只編譯、不執行：與 DSH 執行時相同，程式碼是 async 函式的本體，harness 是全域的輔助物件。
    new Function('harness', `return (async () => {\n${p.code}\n})`)
  } catch (error) {
    return `程式碼無法解析：${error instanceof Error ? error.message : String(error)}`
  }
  return undefined
}

/** DSH 動態插件 id 的前綴規則：3～6 個小寫英文字母。 */
export function idPrefix(name: string): string {
  const letters = name.replace(/[^a-z]/g, '')
  return (letters.length >= 3 ? letters : `${letters}tmr`).slice(0, 6)
}

/** 核准畫面上給創造者看的說明：名字、用途、雜湊與程式碼（過長時截斷，雜湊對應完整的程式碼）。 */
export function approvalText(p: Pick<OwnPlugin, 'name' | 'purpose' | 'code' | 'sha256'>): string {
  const lines = p.code.split('\n')
  const shown = lines.slice(0, 80).join('\n')
  return [
    `個體想啟用它自己寫的插件「${p.name}」（sha256 ${p.sha256.slice(0, 12)}）。`,
    `用途：${p.purpose}`,
    '插件的程式碼會在 DSH 的主程序中執行（DSH 的沙盒不是隔離），請看過再決定。',
    '',
    shown,
    ...(lines.length > 80 ? [`……（共 ${lines.length} 行，只顯示前 80 行）`] : []),
  ].join('\n')
}

/** 自我快照中的一段：自己寫的插件與核准狀態。 */
export function renderOwnPlugins(life: LifeStore): string[] {
  const own = ownPlugins(life)
  if (own.length === 0) return []
  return [
    '## 你寫給自己的插件（程式碼；每個版本啟用前都要經過創造你的人核准）',
    ...own.map((p) => `- ${p.name}：${p.purpose}（${formatDay(p.writtenAt)} 寫的版本，${p.approved ? '已核准，每段對話都會啟用' : '還沒有核准'}）`),
  ]
}
