/**
 * E 中的能量：動能與勢能（hypotheses.md H-E；使用者 2026-10-29：「能量在理論中代表的是動能與勢能」）。
 *
 * 只從既有紀錄推導，不計算任何數值，也不設門檻：
 * - 勢能：儲存著、還沒有釋放的推動力。
 *   - 最近一次整合寫下的未解矛盾；
 *   - 那次整合沒有採用、保留下來的修訂提案；
 *   - 上次整合以後，行動留下的懸念（事後比對的 left）；
 *   - 上次整合以後，結果和預期不一樣的經歷（事後比對 matched＝no）。
 *   進行中的目標也是勢能，已經列在快照的「目標」一節，這裡不重複。整合期會看到這些（integrate/evidence.ts），
 *   可以解開、採用、繼續保留或放下；整合以後重新累積。
 * - 動能：此刻正在推動這次循環的是什麼。由個體在 RD 思考時自己寫下（rd/decision 的 drive），
 *   事後比對時寫下這次釋放了什麼、又留下了什麼（rd/outcome 的 released、left）。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { carriedOver, integrationStart } from '../integrate/evidence.ts'
import { OUTCOME_KIND, type OutcomeData } from '../rd/memory.ts'
import { clip } from '../recall/retrieve.ts'
import { formatTime } from './state.ts'

export interface Potential {
  /** 最近一次整合（若有）。 */
  readonly integration: LifeEvent | undefined
  readonly contradictions: readonly string[]
  /** 最近一次整合保留下來的修訂提案。 */
  readonly proposals: readonly LifeEvent[]
  /** 上次整合以後，事後比對寫下「留下了懸念」的紀錄。 */
  readonly left: readonly LifeEvent[]
  /** 上次整合以後，結果和預期不一樣（matched＝no）的事後比對。 */
  readonly surprises: readonly LifeEvent[]
}

export function potential(life: LifeStore): Potential {
  const { integration, contradictions, proposals } = carriedOver(life)
  const outcomes = life.after(integrationStart(life), [OUTCOME_KIND], 100_000)
  return {
    integration,
    contradictions,
    proposals,
    left: outcomes.filter((e) => ((e.data as OutcomeData).left ?? '') !== ''),
    surprises: outcomes.filter((e) => (e.data as OutcomeData).matched === 'no'),
  }
}

export function isEmpty(p: Potential): boolean {
  return p.contradictions.length + p.proposals.length + p.left.length + p.surprises.length === 0
}

/** 快照與思考輸入中的「懸著的事」一節；沒有就回傳空陣列。每類只列最近幾條，其餘記數量。 */
export function renderPotential(life: LifeStore): string[] {
  const p = potential(life)
  if (isEmpty(p)) return []
  const lines = ['', '## 懸著的事（勢能：儲存著、還沒有釋放的推動力；進行中的目標見上）']
  const at = p.integration ? `（最近一次整合，${formatTime(p.integration.ts)}）` : ''
  for (const c of p.contradictions.slice(0, 4)) lines.push(`- 未解的矛盾${at}：${clip(c, 160)}`)
  for (const e of p.proposals.slice(-3)) lines.push(`- 沒有採用、保留下來的修訂：${clip(e.text ?? '', 160)}`)
  for (const e of p.left.slice(-4)) lines.push(`- 行動留下的懸念（${formatTime(e.ts)}）：${clip((e.data as OutcomeData).left ?? '', 160)}`)
  for (const e of p.surprises.slice(-3)) {
    const o = e.data as OutcomeData
    lines.push(`- 和預期不一樣的事（${formatTime(e.ts)}）：${clip(o.error || o.actual, 160)}`)
  }
  const hidden = [
    p.contradictions.length > 4 && `矛盾 ${p.contradictions.length - 4} 條`,
    p.proposals.length > 3 && `提案 ${p.proposals.length - 3} 條`,
    p.left.length > 4 && `懸念 ${p.left.length - 4} 條`,
    p.surprises.length > 3 && `和預期不一樣的事 ${p.surprises.length - 3} 條`,
  ].filter(Boolean)
  if (hidden.length > 0) lines.push(`（沒有列出的：${hidden.join('、')}）`)
  return lines
}
