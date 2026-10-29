/**
 * 唯讀檢視個體的內在狀態：自我模型、人生敘事、目標、重要感受、教訓、最近一次整合、最近的 PC 循環。
 * 不呼叫模型，也不寫入生命日誌（個體還沒誕生時不會讓它誕生）。
 *
 * 用法：scripts/temir.sh state [--cycles 3]
 *       TEMIR_HOME=/path scripts/temir.sh state      指定個體的生命資料目錄
 */
import { parseArgs } from 'node:util'
import { resolveHome } from '../individual/src/life/index.ts'
import { LifeStore } from '../individual/src/life/store.ts'
import { INTEGRATION_KIND, LESSON_KIND, PROPOSAL_KIND, type IntegrationData, type LessonData } from '../individual/src/integrate/evidence.ts'
import type { DecisionData, OutcomeData } from '../individual/src/rd/memory.ts'
import { clipEnds, replyOf } from '../individual/src/recall/retrieve.ts'
import { recentCycles, type Cycle } from '../individual/src/self/cycle.ts'
import { renderPotential } from '../individual/src/self/energy.ts'
import { formatTime, renderSelfSnapshot } from '../individual/src/self/state.ts'

function renderCycle(c: Cycle): string[] {
  const lines = [`- ${formatTime(c.start.ts)}｜${c.session.slice(-8)}｜四段${c.complete.E && c.complete.STRD && c.complete.A ? '齊全' : `缺 ${[!c.complete.E && 'E', !c.complete.STRD && 'ST/RD', !c.complete.A && 'A'].filter(Boolean).join('、')}`}${c.ending === 'completed' ? '' : `｜回合結束：${c.ending}`}`]
  const heard = c.heard.map((e) => (e.text ?? '').replace(/^對方說：/, '')).join(' ')
  if (heard) lines.push(`    E   對方說：${clipEnds(heard, 120)}${c.recall ? `（回憶 ${((c.recall.data as { hits?: unknown[] }).hits ?? []).length} 筆）` : ''}`)
  if (c.decision) {
    const d = c.decision.data as DecisionData
    const chosen = d.candidates[d.chosen]
    lines.push(`    ST  ${clipEnds(d.situation, 160)}${d.drive ? `｜動能：${clipEnds(d.drive, 100)}` : ''}`)
    lines.push(`    RD  準備：${clipEnds(chosen?.action ?? '', 100)}｜預期：${clipEnds(chosen?.prediction ?? '', 100)}${d.value === null ? '' : `｜V̂ ${d.value.toFixed(2)}，${d.neighbors.length} 個相似經驗`}`)
  }
  const said = c.replies.map((e) => replyOf(e)).join(' ')
  if (said || c.tools.length > 0) lines.push(`    A   ${said ? `我說：${clipEnds(said, 140)}` : ''}${c.tools.length > 0 ? `${said ? '｜' : ''}工具：${c.tools.join('、')}` : ''}`)
  if (c.outcome) {
    const o = c.outcome.data as OutcomeData
    const matched = o.matched === 'yes' ? '符合' : o.matched === 'partly' ? '部分符合' : '不符'
    lines.push(
      `    回饋 ${matched}｜回報 ${o.reward.toFixed(2)}${o.lesson ? `｜教訓：${clipEnds(o.lesson, 100)}` : ''}${o.feeling ? `｜感受：${clipEnds(o.feeling, 80)}` : ''}` +
        `${o.released ? `｜釋放：${clipEnds(o.released, 80)}` : ''}${o.left ? `｜留下：${clipEnds(o.left, 80)}` : ''}`,
    )
  }
  return lines
}

function main(): void {
  const { values } = parseArgs({ options: { cycles: { type: 'string', default: '3' } } })
  const home = resolveHome(undefined)
  const life = LifeStore.openReadOnly(home)
  if (!life) {
    console.log(`個體還沒有誕生（${home} 沒有生命日誌）。第一次對話時才會誕生。`)
    return
  }
  try {
    const lines = [`個體 ${life.individualId}（${life.path}）`, '', renderSelfSnapshot(life, renderPotential(life)).replace(/^（以下是你的生命紀錄中目前的自我狀態，由系統自動附上。）\n\n/, '')]
    const lessons = life.recent(5, [LESSON_KIND]).reverse()
    lines.push('', '## 教訓（最近）')
    if (lessons.length === 0) lines.push('還沒有。')
    for (const e of lessons) lines.push(`- ${formatTime(e.ts)}｜${(e.data as LessonData).text}`)
    const integration = life.latest(INTEGRATION_KIND)
    lines.push('', '## 最近一次整合')
    if (!integration) lines.push('還沒有整合過。')
    else {
      const d = integration.data as IntegrationData & { change?: string; contradictions?: string[] }
      const o = d.observables
      lines.push(
        `${formatTime(integration.ts)}｜觸發：${d.trigger}${d.deep ? '（深度）' : ''}｜套用 ${d.applied.length} 項、丟棄 ${d.rejected.length} 項、保留為提案 ${o.deferred ?? 0} 項`,
        `觀測量（H5，只記錄）：預測不符 ${o.predictionMismatch === null ? '—' : o.predictionMismatch.toFixed(2)}、平均回報 ${o.meanReward === null ? '—' : o.meanReward.toFixed(2)}、未解矛盾 ${o.contradictions}、修訂引用的經歷 ${o.citedExperiences}`,
      )
      if (d.change) lines.push(`改變：${d.change}`)
      for (const c of d.contradictions ?? []) lines.push(`未解的矛盾：${c}`)
    }
    const proposals = life.all(PROPOSAL_KIND)
    if (proposals.length > 0) lines.push('', `未採用的修訂提案：${proposals.length} 項（最近：${clipEnds(proposals.at(-1)?.text ?? '', 120)}）`)
    const cycles = recentCycles(life, Number(values.cycles))
    lines.push('', `## 最近的 PC 循環（PC＝ST＋E−RD＝A；E 刺激、ST 思考、RD 準備與預測、A 行動）`)
    if (cycles.length === 0) lines.push('還沒有。')
    for (const c of cycles) lines.push(...renderCycle(c))
    console.log(lines.join('\n'))
  } finally {
    life.close()
  }
}

main()
