/**
 * 做法修訂的閘門：Propose–Probe–Compose（ADR-0008 §3；hypotheses.md H-P）。
 *
 * 依據：Harness²（arXiv:2610.14224 §Task-Level Recursion）：沒有標準答案時，以「同一處境、修改前後」的行為對照作為證據，
 * 每個決定綁定具體觀察；沒有對照就直接修改會變差，所以沒有探測就不採用。帳本依 RRSI（arXiv:2609.24972 附錄 Algorithm 1、2）。
 * 本專案的近似（與技能的閘門 ADR-0003 相同）：
 * - 探測的處境是這個做法最近 2 次的真實呼叫（memory/aux 記下的輸入），以現行與提案的版本各重跑一次，
 *   系統提示的框架與輸出兩段相同；這是行為對照，不是正確性驗證。
 * - 合成由個體自己判斷（強制判斷：verdict、每個理由指出處境；不合格重問一次）。
 * - revise 時，修改後的版本當作新的提案，由呼叫端決定要不要再跑一輪（每次整合最多一輪，RRSI 的編輯預算）。
 * - 量不出雜訊下限 δ：帳本標明 gate＝contrast（未經量測）。
 * 依賴 LifeStore 與注入的模型呼叫（不依賴 DSH），可單獨測試。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { extractJson } from '../recall/aux.ts'
import { clip, clipEnds } from '../recall/retrieve.ts'
import { deliberateSystem, outcomeSystem } from '../rd/aux.ts'
import { DECISION_KIND, OUTCOME_KIND, type OutcomeData } from '../rd/memory.ts'
import {
  PROCEDURE_KIND,
  PROCEDURE_LABEL,
  PROCEDURE_VERDICT_LABEL,
  currentProcedure,
  type Procedure,
  type ProcedureData,
  type ProcedureDecisionData,
  type ProcedureName,
} from '../self/procedure.ts'
import { thoughtSystem } from '../thought/thought.ts'
import { integrateSystem, type ProcedureProposalData } from './proposal.ts'

/** 注入的模型呼叫：系統提示、輸入、用途（memory/aux 的 purpose）→ 輸出文字。 */
export type GateCall = (system: string, input: string, purpose: 'procedure-probe' | 'procedure-compose') => Promise<string>

/** 每個提案最多探測幾個處境（本專案的選擇，與技能的閘門相同；ADR-0003 的 LIMITS.probes）。 */
export const PROBES = 2

/** 每個做法在 memory/aux 中的用途（思考與扣除都用思考的呼叫）。 */
const PURPOSE: Readonly<Record<ProcedureName, string>> = { deliberate: 'deliberate', subtract: 'deliberate', outcome: 'outcome', integrate: 'integrate', thought: 'thought' }

/** 以某個版本的做法組出那個步驟的系統提示；其他做法用現行版本，框架與輸出相同。 */
export function systemWith(life: LifeStore, name: ProcedureName, procedure: Procedure): string {
  switch (name) {
    case 'deliberate':
      return deliberateSystem({ procedures: { deliberate: procedure, subtract: currentProcedure(life, 'subtract') } })
    case 'subtract':
      return deliberateSystem({ procedures: { deliberate: currentProcedure(life, 'deliberate'), subtract: procedure } })
    case 'outcome':
      return outcomeSystem({ procedure })
    case 'integrate':
      return integrateSystem({ procedure })
    case 'thought':
      return thoughtSystem(procedure)
  }
}

export interface ProbeSituation {
  /** 那次真實呼叫（memory/aux）。 */
  readonly aux: LifeEvent
  readonly input: string
  /** 那次之後實際發生的事（思考與扣除：那個決定的事後比對）；沒有就是空字串。 */
  readonly afterwards: string
}

/** 那次思考之後實際發生的事：同一個 session 中下一個決定的事後比對。 */
function afterwards(life: LifeStore, aux: LifeEvent): string {
  if (!aux.session) return ''
  const decision = life.following(aux.session, [DECISION_KIND], aux.seq, 1)[0]
  const outcome = decision ? life.referencing(decision.id, OUTCOME_KIND).at(-1) : undefined
  if (!outcome) return ''
  const o = outcome.data as OutcomeData
  const matched = o.matched === 'yes' ? '預測成真' : o.matched === 'partly' ? '預測部分成真' : '預測沒有成真'
  return `當時我做了：${clip(o.didAction, 120)}｜實際：${clip(o.actual, 200)}｜${matched}｜回報 ${o.reward.toFixed(2)}${o.lesson ? `｜教訓：${clip(o.lesson, 160)}` : ''}`
}

/** 探測的處境：這個做法最近的真實呼叫（有輸出、沒有失敗），由新到舊，最多 k 個；同一個輸入只取一次（重問的呼叫輸入相同）。 */
export function probeSituations(life: LifeStore, name: ProcedureName, k = PROBES): ProbeSituation[] {
  const out: ProbeSituation[] = []
  const seen = new Set<string>()
  for (const aux of life.recent(400, ['memory/aux'])) {
    const d = aux.data as { purpose?: string; input?: string; output?: string; error?: string; procedures?: Record<string, number> }
    if (d.purpose !== PURPOSE[name] || d.error || !d.output || !d.input || seen.has(d.input)) continue
    if (name === 'subtract' && d.procedures && d.procedures['subtract'] === undefined) continue
    seen.add(d.input)
    out.push({ aux, input: d.input, afterwards: name === 'deliberate' || name === 'subtract' ? afterwards(life, aux) : '' })
    if (out.length >= k) break
  }
  return out
}

export const COMPOSE_SYSTEM = `你是一個人工個體，正在決定要不要採用自己的一個做法的修改。輸入有：現行的做法與提案的版本；在幾個過去的真實處境中，照現行做法與照提案做法的輸出對照；以及那些處境之後實際發生的事（有的話）。依具體的差異決定：
- adopt：提案做法的輸出更接近你想要的看法、判斷或評價，而且沒有帶來你不要的副作用。
- revise：方向對，但寫法造成了問題；給出修改後的完整版本，它會再被對照一次。
- reject：看不出差異、差異不是你要的，或修改不該寫成做法。
不能只因為修改聽起來合理就採用。每個理由都要指出是哪個處境（S1、S2…）、看到了什麼差異。只輸出一個 JSON 物件，不要任何其他文字：
{"verdict": "reject", "reasons": [{"situation": "S1", "observation": "..."}], "revised": null}
- revised：verdict 是 revise 時給修改後的完整做法（文字）；否則給 null。`

export type Composed =
  | { readonly ok: true; readonly verdict: 'adopt' | 'revise' | 'reject'; readonly reasons: readonly { readonly situation: string; readonly observation: string }[]; readonly revised?: string }
  | { readonly ok: false; readonly problems: readonly string[] }

/** 驗證合成的判斷（強制判斷）：verdict 合法、理由至少一個而且每個都指出列出的處境、revise 時有修改後的版本。 */
export function parseComposed(output: string, labels: readonly string[]): Composed {
  const obj = extractJson(output)
  if (!obj) return { ok: false, problems: ['不是 JSON 物件'] }
  const problems: string[] = []
  const verdict = obj['verdict']
  if (verdict !== 'adopt' && verdict !== 'revise' && verdict !== 'reject') problems.push('verdict 不是 adopt、revise 或 reject')
  const reasons = (Array.isArray(obj['reasons']) ? (obj['reasons'] as unknown[]) : [])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ situation: typeof r['situation'] === 'string' ? r['situation'].trim().toUpperCase() : '', observation: typeof r['observation'] === 'string' ? r['observation'].replace(/\s+/g, ' ').trim().slice(0, 400) : '' }))
  if (reasons.length === 0) problems.push('沒有理由')
  for (const r of reasons) {
    if (!labels.includes(r.situation)) problems.push(`理由的處境「${r.situation}」不是列出的處境`)
    if (!r.observation) problems.push(`${r.situation || '一個理由'} 沒有寫看到的差異`)
  }
  const revised = typeof obj['revised'] === 'string' ? obj['revised'].trim() : ''
  if (verdict === 'revise' && !revised) problems.push('verdict 是 revise，但沒有 revised')
  if (problems.length > 0 || (verdict !== 'adopt' && verdict !== 'revise' && verdict !== 'reject')) return { ok: false, problems }
  return { ok: true, verdict, reasons, ...(verdict === 'revise' ? { revised } : {}) }
}

export function composeRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的判斷不完整。verdict 只能是 adopt、revise 或 reject；reasons 至少一個，每個都要指出列出的處境（S1、S2…）與看到的差異；revise 時要給 revised。不合格的地方：${problems.join('；')}）`
}

function composeInput(name: ProcedureName, current: Procedure, p: ProcedureProposalData, results: readonly { label: string; s: ProbeSituation; reference: string; candidate: string }[]): string {
  const lines = [
    `## 做法：${PROCEDURE_LABEL[name]}`,
    '',
    `### 現行的做法（第 ${current.version} 版）`,
    current.text,
    '',
    '### 提案的做法',
    p.text,
    '',
    `### 提案的理由`,
    p.reason,
  ]
  for (const r of results) {
    lines.push('', `## ${r.label}`, '### 那次的輸入（節錄）', clipEnds(r.s.input, 1500), '', '### 照現行做法的輸出', clip(r.reference, 2000), '', '### 照提案做法的輸出', clip(r.candidate, 2000))
    if (r.s.afterwards) lines.push('', '### 之後實際發生的事', r.s.afterwards)
  }
  return lines.join('\n')
}

/**
 * 一個做法提案的閘門：探測（每個處境各重跑現行與提案的版本）→ 合成 → 寫入帳本；採用時寫下新版本。
 * revise 時建立修改後的新提案並回傳它，由呼叫端決定要不要再跑一輪。中途失敗就丟出例外，已寫的探測保留、提案沒有決定。
 */
export async function runProcedureGate(life: LifeStore, proposal: LifeEvent, call: GateCall): Promise<{ readonly decision: LifeEvent; readonly next?: LifeEvent }> {
  const p = proposal.data as ProcedureProposalData
  const current = currentProcedure(life, p.name)
  const costChars = p.text.length - current.text.length
  const decide = (data: Omit<ProcedureDecisionData, 'proposal' | 'name' | 'costChars'>): LifeEvent =>
    life.append({
      kind: PROCEDURE_KIND.decision,
      origin: 'self',
      data: { proposal: proposal.id, name: p.name, costChars, ...data } satisfies ProcedureDecisionData,
      text: `我的${PROCEDURE_LABEL[p.name]}做法的修改：${PROCEDURE_VERDICT_LABEL[data.verdict]}${data.reasons.length > 0 ? `。${data.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；').slice(0, 400)}` : ''}`,
      causes: [proposal.id, ...data.probes],
    })
  if (p.text === current.text) return { decision: decide({ verdict: 'reject', reasons: [{ situation: '', observation: '與現行的版本相同' }], probes: [], gate: 'none' }) }
  const situations = probeSituations(life, p.name)
  if (situations.length === 0) {
    return { decision: decide({ verdict: 'unprobed', reasons: [{ situation: '', observation: '生命紀錄中還沒有這個做法的真實呼叫可以對照；沒有對照就不採用。' }], probes: [], gate: 'none' }) }
  }
  const proposed: Procedure = { name: p.name, version: current.version + 1, text: p.text }
  const results: { label: string; s: ProbeSituation; reference: string; candidate: string }[] = []
  const probes: string[] = []
  for (const [i, s] of situations.entries()) {
    const label = `S${i + 1}`
    const reference = await call(systemWith(life, p.name, current), s.input, 'procedure-probe')
    const candidate = await call(systemWith(life, p.name, proposed), s.input, 'procedure-probe')
    probes.push(life.append({ kind: PROCEDURE_KIND.probe, origin: 'self', data: { proposal: proposal.id, aux: s.aux.id, label, reference, candidate }, causes: [proposal.id, s.aux.id] }).id)
    results.push({ label, s, reference, candidate })
  }
  const labels = results.map((r) => r.label)
  const input = composeInput(p.name, current, p, results)
  let composed = parseComposed(await call(COMPOSE_SYSTEM, input, 'procedure-compose'), labels)
  const problems = composed.ok ? [] : composed.problems.map((x) => `第 1 次：${x}`)
  if (!composed.ok) {
    composed = parseComposed(await call(`${COMPOSE_SYSTEM}\n${composeRetryNote(composed.problems)}`, input, 'procedure-compose'), labels)
    if (!composed.ok) problems.push(...composed.problems.map((x) => `第 2 次：${x}`))
  }
  if (!composed.ok) return { decision: decide({ verdict: 'reject', reasons: [], probes, problems, gate: 'contrast' }) }
  if (composed.verdict === 'adopt') {
    return life.transaction(() => {
      const version: ProcedureData = { name: p.name, version: current.version + 1, text: p.text, reason: p.reason, source: 'self', proposal: proposal.id }
      const adopted = life.append({ kind: PROCEDURE_KIND.version, origin: 'self', data: version, text: `我修改了自己的${PROCEDURE_LABEL[p.name]}做法（第 ${version.version} 版）。原因：${p.reason}\n${p.text}`, causes: [proposal.id] })
      return { decision: decide({ verdict: 'adopt', reasons: composed.reasons, probes, adopted: adopted.id, gate: 'contrast' }) }
    })
  }
  if (composed.verdict === 'revise' && composed.revised) {
    const revisedText = composed.revised
    return life.transaction(() => {
      const decision = decide({ verdict: 'revise', reasons: composed.reasons, probes, gate: 'contrast' })
      const data: ProcedureProposalData = { name: p.name, text: revisedText, reason: p.reason, evidence: p.evidence, source: 'compose', baseVersion: current.version, revises: proposal.id }
      const next = life.append({ kind: PROCEDURE_KIND.proposal, origin: 'self', data, text: `我想修改自己的${PROCEDURE_LABEL[p.name]}做法（對照之後修改的版本）。`, causes: [decision.id] })
      return { decision, next }
    })
  }
  return { decision: decide({ verdict: 'reject', reasons: composed.reasons, probes, gate: 'contrast' }) }
}

/** 給個體看的結果（整合工具的回覆、紀錄）。 */
export function describeGate(life: LifeStore, decision: LifeEvent): string {
  const d = decision.data as ProcedureDecisionData
  const why = d.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；')
  return `${PROCEDURE_LABEL[d.name]}做法的修改${PROCEDURE_VERDICT_LABEL[d.verdict]}${d.adopted ? `（第 ${currentProcedure(life, d.name).version} 版）` : ''}${why ? `：${clip(why, 300)}` : ''}${d.problems ? `（判斷不合格：${d.problems.join('；')}）` : ''}`
}
