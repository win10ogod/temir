/**
 * 內在狀態的唯讀檢視（文字）：自我模型、人生敘事、目標、看法、能量、念頭、技能與帳本、插件、教訓、最近一次整合、
 * 日誌重播、最近的 PC 循環。CLI（cli/state.ts）與 Web 面板（panel/index.ts）共用；不呼叫模型，也不寫入生命日誌。
 */
import type { LifeStore } from '../life/store.ts'
import { INTEGRATION_KIND, LESSON_KIND, PROPOSAL_KIND, type IntegrationData, type LessonData } from '../integrate/evidence.ts'
import { renderOwnPlugins } from '../plugin/plugin.ts'
import type { DecisionData, OutcomeData } from '../rd/memory.ts'
import { REPLAY_KIND, type ReplayData } from '../rd/replay.ts'
import { COMPACTION_KIND, STM_PAGES, clipEnds, knownFacts, recentPages, replyOf } from '../recall/retrieve.ts'
import { SKILL_KIND, renderLedger, renderOwnSkills } from '../skill/skill.ts'
import { renderThoughts } from '../thought/thought.ts'
import { recentCycles, type Cycle } from './cycle.ts'
import { describeKeys, renderPotential, type ThoughtData } from './energy.ts'
import { formatTime, renderSelfSnapshot } from './state.ts'

/** 一次 PC 循環的文字（E、ST、−RD、RD、A 與回饋）。 */
export function renderCycle(life: LifeStore, c: Cycle): string[] {
  if (c.source === 'internal') {
    const t = c.thought.data as ThoughtData
    const about = t.item ? describeKeys(life, [t.item])[0] : '（沒有）'
    const lines = [`- ${formatTime(c.ts)}｜內部刺激（念頭）`]
    lines.push(`    E   浮上心頭：${about}`)
    lines.push(`    ST  ${clipEnds(t.thought, 160)}`)
    if (t.intention) lines.push(`    RD  打算：${clipEnds(t.intention, 120)}`)
    lines.push(`    A   寫下念頭${t.releasedItems.length > 0 ? '｜放下了這件事' : ''}`)
    return lines
  }
  const lines = [`- ${formatTime(c.start.ts)}｜${c.session.slice(-8)}｜四段${c.complete.E && c.complete.STRD && c.complete.A ? '齊全' : `缺 ${[!c.complete.E && 'E', !c.complete.STRD && 'ST/RD', !c.complete.A && 'A'].filter(Boolean).join('、')}`}${c.ending === 'completed' ? '' : `｜回合結束：${c.ending}`}`]
  const heard = c.heard.map((e) => (e.text ?? '').replace(/^對方說：/, '')).join(' ')
  if (heard) lines.push(`    E   對方說：${clipEnds(heard, 120)}${c.recall ? `（回憶 ${((c.recall.data as { hits?: unknown[] }).hits ?? []).length} 筆）` : ''}`)
  if (c.decision) {
    const d = c.decision.data as DecisionData
    const chosen = d.candidates[d.chosen]
    lines.push(`    ST  ${clipEnds(d.situation, 160)}${d.drive ? `｜動能：${clipEnds(d.drive, 100)}` : ''}${d.activated?.length ? `（觸發：${describeKeys(life, d.activated).join('、')}）` : ''}`)
    const subtracted = d.candidates.filter((c) => c.excluded)
    if (subtracted.length > 0) lines.push(`    −RD 扣除：${subtracted.map((c) => `${clipEnds(c.action, 40)}${c.excludeReason ? `（${clipEnds(c.excludeReason, 40)}）` : ''}`).join('；')}`)
    lines.push(`    RD  準備：${clipEnds(chosen?.action ?? '', 100)}｜預期：${clipEnds(chosen?.prediction ?? '', 100)}${d.value === null ? '' : `｜V̂ ${d.value.toFixed(2)}，${d.neighbors.length} 個相似經驗`}`)
  }
  const said = c.replies.map((e) => replyOf(e)).join(' ')
  if (said || c.tools.length > 0) lines.push(`    A   ${said ? `我說：${clipEnds(said, 140)}` : ''}${c.tools.length > 0 ? `${said ? '｜' : ''}工具：${c.tools.join('、')}` : ''}`)
  if (c.outcome) {
    const o = c.outcome.data as OutcomeData
    const matched = o.matched === 'yes' ? '符合' : o.matched === 'partly' ? '部分符合' : '不符'
    lines.push(
      `    回饋 ${matched}｜回報 ${o.reward.toFixed(2)}${o.lesson ? `｜教訓：${clipEnds(o.lesson, 100)}` : ''}${o.feeling ? `｜感受：${clipEnds(o.feeling, 80)}` : ''}` +
        `${o.releasedItems?.length ? `｜釋放：${describeKeys(life, o.releasedItems).join('、')}` : o.released ? `｜釋放：${clipEnds(o.released, 80)}` : ''}${o.left ? `｜留下：${clipEnds(o.left, 80)}` : ''}`,
    )
  }
  return lines
}

/**
 * 拒絕與異議（plan v2 M4「拒絕與異議的紀錄分析」）：個體實際採取的做法是拒絕的決定（事後比對的 didKind），
 * 以及思考時被選中、類別是拒絕的做法。只列事實，不評價。
 */
export function refusalLines(life: LifeStore, limit = 5): string[] {
  const outcomes = new Map(life.all('rd/outcome').map((e) => [(e.data as OutcomeData).decision, e.data as OutcomeData]))
  const refusals = life.all('rd/decision').filter((e) => {
    const d = e.data as DecisionData
    const o = outcomes.get(e.id)
    return o ? o.didKind === '拒絕' : d.candidates[d.chosen]?.kind === '拒絕'
  })
  if (refusals.length === 0) return []
  const lines = ['', `## 拒絕與異議（共 ${refusals.length} 次；最近的在後）`]
  for (const e of refusals.slice(-limit)) {
    const d = e.data as DecisionData
    const o = outcomes.get(e.id)
    lines.push(`- ${formatTime(e.ts)}｜對方說：${clipEnds(d.cue, 80)}｜我：${clipEnds(o?.didAction ?? d.candidates[d.chosen]?.action ?? '', 100)}${o ? `｜結果：${clipEnds(o.actual, 80)}｜回報 ${o.reward.toFixed(2)}` : ''}`)
  }
  return lines
}

/** 內在狀態的全部段落（不含標頭）。cycleCount＝列出最近幾個 PC 循環。 */
/**
 * 記憶分區（ADR-0007）：短期記憶是下一段新對話開頭會帶入的最近回合（這段對話本身在 DSH 的上下文中）；
 * 長期記憶是生命日誌與從中整理出的紀錄。
 */
export function memoryLines(life: LifeStore): string[] {
  const pages = recentPages(life, undefined, STM_PAGES)
  const lines = ['', '## 記憶分區', `短期（下一段新對話開頭帶入的最近 ${pages.length} 個回合；對話之中，這段對話本身就在上下文中）：`]
  if (pages.length === 0) lines.push('還沒有。')
  for (const p of pages) lines.push(`- ${formatTime(p.heard.ts)}｜${clipEnds((p.heard.text ?? '').replace(/^對方說：/, ''), 40)}`)
  lines.push(
    `長期（生命日誌，只增不改，以檢索帶回）：事件 ${life.count()} 則，其中對方說的話 ${life.countOf('dsh/user/message', '對方說：')} 則；` +
      `關於對方的長期事實 ${knownFacts(life).length} 條；教訓 ${life.countOf(LESSON_KIND)} 條`,
    `上下文壓縮：${life.countOf(COMPACTION_KIND)} 次（被壓掉的部分仍可檢索）`,
  )
  return lines
}

export function stateLines(life: LifeStore, cycleCount = 3): string[] {
  const lines = [renderSelfSnapshot(life, [...renderPotential(life), ...renderThoughts(life), ...renderOwnSkills(life), ...renderOwnPlugins(life)]).replace(/^（以下是你的生命紀錄中目前的自我狀態，由系統自動附上。）\n\n/, '')]
  if (life.latest(SKILL_KIND.decision)) lines.push('', '## 技能的帳本（最近；閘門＝行為對照，未經量測）', ...renderLedger(life, 8))
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
  const replayed = life.latest(REPLAY_KIND)
  if (replayed) {
    const r = replayed.data as ReplayData
    const p = (x: ReplayData['current']) => `k=${x.k}、處境門檻 ${x.stateThreshold}、行動門檻 ${x.actionThreshold}（較新決定的預測誤差 ${x.testMse.toFixed(3)}）`
    lines.push('', '## 日誌重播（JitRL 經驗估計的參數；只在已記錄的決定上）', `${formatTime(replayed.ts)}｜${r.n} 個決定｜現行：${p(r.current)}｜最好：${p(r.best)}｜${r.adopted ? '採用' : '不採用'}：${r.reason}（減少 ${r.gain.toFixed(3)}，雜訊帶 ${r.noise.toFixed(3)}）`)
  }
  lines.push(...memoryLines(life))
  lines.push(...refusalLines(life))
  const proposals = life.all(PROPOSAL_KIND)
  if (proposals.length > 0) lines.push('', `未採用的修訂提案：${proposals.length} 項（最近：${clipEnds(proposals.at(-1)?.text ?? '', 120)}）`)
  const cycles = recentCycles(life, cycleCount)
  lines.push('', `## 最近的 PC 循環（PC＝ST＋E−RD＝A；E 刺激、ST 思考、RD 準備與預測、A 行動）`)
  if (cycles.length === 0) lines.push('還沒有。')
  for (const c of cycles) lines.push(...renderCycle(life, c))
  return lines
}
