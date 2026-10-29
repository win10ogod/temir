/**
 * 整合期的事件種類，以及最近一次整合留下、還沒有處理的東西（H-E 的勢能之一，見 self/energy.ts）。
 * 獨立成一個檔案，讓 evidence.ts 與 self/energy.ts 都能使用而不互相依賴。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'

export const INTEGRATION_KIND = 'self/integration'
export const LESSON_KIND = 'memory/lesson'
/** 整合期中沒有通過穩定性與適應性判斷、保留下來的修訂提案。 */
export const PROPOSAL_KIND = 'self/proposal'

/**
 * 最近一次整合留下、還沒有處理的：未解的矛盾與保留下來的修訂提案。
 * 下一次整合會在證據中看到它們，可以解開、重新提出或放下。
 */
export function carriedOver(life: LifeStore): { readonly integration: LifeEvent | undefined; readonly contradictions: readonly string[]; readonly proposals: readonly LifeEvent[] } {
  const integration = life.latest(INTEGRATION_KIND)
  const contradictions = (integration?.data as { contradictions?: readonly string[] } | undefined)?.contradictions ?? []
  const proposals = (integration?.causes ?? []).map((id) => life.get(id)).filter((e): e is LifeEvent => e?.kind === PROPOSAL_KIND)
  return { integration, contradictions, proposals }
}
