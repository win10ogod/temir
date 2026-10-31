/**
 * 做法修訂的閘門：Propose–Probe–Compose（ADR-0008 §3；hypotheses.md H-P）。
 *
 * 依據：Harness²（arXiv:2610.14224 §Task-Level Recursion）：沒有標準答案時，以「同一處境、修改前後」的行為對照作為證據，
 * 每個決定綁定具體觀察；沒有對照就直接修改會變差，所以沒有探測就不採用。帳本與「改進要大於雜訊才接受」依 RRSI
 * （arXiv:2609.24972 附錄 Algorithm 1、2）。本專案的近似（與技能的閘門 ADR-0003 相同的部分）：
 * - 探測的處境是這個做法的真實呼叫（memory/aux 記下的輸入）：先取提案依據的經歷所在的那幾次，再取最近的，最多 PROBES 個；
 *   系統提示的框架與輸出兩段相同。這是行為對照，不是正確性驗證。
 * - 雜訊（第二版）：每個處境有照現行做法的兩個輸出。同一個做法跑兩次本來就不一樣，個體逐項判斷提案造成的差異
 *   是否大於這兩個輸出之間的差異（beyondNoise）；採用至少要有一項是。個體沒有可重複評估的任務集，量不出數值的 δ，
 *   這是同一個處境上的定性比較。
 * - 成本（第二版）：照現行做法的輸出能重用就不重跑：那次真實呼叫的輸出（系統提示的雜湊、模型與輸入都相同時，它就是
 *   現行做法的一個樣本），以及之前的探測照同一個現行做法跑過的輸出（同一個提案的第二輪、或之後的提案用到同一個處境）。
 * - 合成由個體自己判斷（強制判斷：verdict、每個理由指出處境與是否大於雜訊；不合格重問一次）。
 * - revise 時，修改後的版本當作新的提案，由呼叫端決定要不要再跑一輪（每次整合最多一輪，RRSI 的編輯預算）。
 * 依賴 LifeStore 與注入的模型呼叫（不依賴 DSH），可單獨測試。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { extractJson, promptHash } from '../recall/aux.ts'
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
  type ProcedureVariant,
} from '../self/procedure.ts'
import { thoughtSystem } from '../thought/thought.ts'
import { integrateSystem, type ProcedureProposalData } from './proposal.ts'

/** 注入的模型呼叫：系統提示、輸入、用途（memory/aux 的 purpose）→ 輸出文字。 */
export type GateCall = (system: string, input: string, purpose: 'procedure-probe' | 'procedure-compose') => Promise<string>

/** 每個提案最多探測幾個處境（本專案的選擇；第一版是 2，與技能的閘門相同）。 */
export const PROBES = 3

/** 每個處境照現行做法要有幾個輸出（兩個：一個當對照，兩個之間的差異當雜訊）。 */
export const REFERENCES = 2

/** 每個做法在 memory/aux 中的用途（思考與扣除都用思考的呼叫）。 */
const PURPOSE: Readonly<Record<ProcedureName, string>> = { deliberate: 'deliberate', subtract: 'deliberate', outcome: 'outcome', integrate: 'integrate', thought: 'thought' }

/** 以某個版本的做法組出那個步驟的系統提示；其他做法用現行版本，框架與輸出照那次呼叫的設定（variant）。 */
export function systemWith(life: LifeStore, name: ProcedureName, procedure: Procedure, variant: ProcedureVariant = {}): string {
  const flags = { ...(variant.energy === false ? { energy: false } : {}), ...(variant.subtraction === false ? { subtraction: false } : {}), ...(variant.perPerson === false ? { perPerson: false } : {}) }
  switch (name) {
    case 'deliberate':
      return deliberateSystem({ procedures: { deliberate: procedure, subtract: currentProcedure(life, 'subtract') }, ...flags })
    case 'subtract':
      return deliberateSystem({ procedures: { deliberate: currentProcedure(life, 'deliberate'), subtract: procedure }, ...flags })
    case 'outcome':
      return outcomeSystem({ procedure, ...flags })
    case 'integrate':
      return integrateSystem({ procedure, ...(variant.deep ? { deep: true } : {}) })
    case 'thought':
      return thoughtSystem(procedure)
  }
}

interface AuxData {
  readonly purpose?: string
  readonly input?: string
  readonly output?: string
  readonly error?: string
  readonly procedures?: Record<string, number>
  readonly systemHash?: string
  readonly variant?: ProcedureVariant
}

export interface ProbeSituation {
  /** 那次真實呼叫（memory/aux）。 */
  readonly aux: LifeEvent
  readonly input: string
  readonly variant: ProcedureVariant
  /** 那次之後實際發生的事（思考與扣除：那個決定的事後比對）；沒有就是空字串。 */
  readonly afterwards: string
  /** 提案依據的經歷所在的那一次（不是只因為最近才被選上）。 */
  readonly fromEvidence: boolean
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

function usable(aux: LifeEvent, name: ProcedureName): boolean {
  const d = aux.data as AuxData
  if (d.purpose !== PURPOSE[name] || d.error || !d.output || !d.input) return false
  return !(name === 'subtract' && d.procedures && d.procedures['subtract'] === undefined)
}

/**
 * 提案依據的一筆經歷所在的那次真實呼叫：
 * - 事後比對的做法：那個決定的比對呼叫（它的 causes 指向決定）；
 * - 其他：同一個 session 中，在那筆經歷（事後比對指向的決定、或經歷本身）之前最近的一次。
 * 沒有 session 的經歷（整合、念頭）不對應。
 */
function evidenceAux(life: LifeStore, name: ProcedureName, id: string): LifeEvent | undefined {
  const event = life.get(id)
  if (!event) return undefined
  const decision = event.kind === DECISION_KIND ? event : event.kind === OUTCOME_KIND ? life.get((event.data as OutcomeData).decision) : undefined
  const anchor = decision ?? event
  if (!anchor.session) return undefined
  const calls = life.allInSession(anchor.session, 'memory/aux').filter((a) => usable(a, name))
  if (name === 'outcome' && decision) return calls.find((a) => a.causes.includes(decision.id))
  return calls.filter((a) => a.seq < anchor.seq).at(-1)
}

/**
 * 探測的處境：先取提案依據的經歷（evidence）所在的那幾次真實呼叫，再取最近的，最多 k 個；同一個輸入只取一次
 * （重問的呼叫輸入相同）。
 */
export function probeSituations(life: LifeStore, name: ProcedureName, k = PROBES, evidence: readonly string[] = []): ProbeSituation[] {
  const out: ProbeSituation[] = []
  const seen = new Set<string>()
  const add = (aux: LifeEvent, fromEvidence: boolean) => {
    const d = aux.data as AuxData
    if (out.length >= k || seen.has(d.input!)) return
    seen.add(d.input!)
    out.push({ aux, input: d.input!, variant: d.variant ?? {}, afterwards: name === 'deliberate' || name === 'subtract' ? afterwards(life, aux) : '', fromEvidence })
  }
  for (const id of evidence) {
    const aux = evidenceAux(life, name, id)
    if (aux) add(aux, true)
  }
  for (const aux of life.recent(400, ['memory/aux'])) {
    if (out.length >= k) break
    if (usable(aux, name)) add(aux, false)
  }
  return out
}

interface ProbeData {
  readonly proposal: string
  readonly aux: string
  readonly label: string
  /** 照現行做法的輸出（第二版：REFERENCES 個；第一版的紀錄是一個 reference）。 */
  readonly references?: readonly string[]
  readonly reference?: string
  readonly candidate: string
  readonly inputHash?: string
  readonly referenceHash?: string
  readonly candidateHash?: string
  /** references 中有幾個是重用的（不是這一輪跑的）。 */
  readonly reused?: number
}

/**
 * 照現行做法、已經有的輸出（不必重跑）：
 * - 那次真實呼叫本身：系統提示的雜湊、模型都相同，而且那個輸入只呼叫過一次（重問過的話，第一次的輸出不合格，不當樣本）；
 * - 之前的探測：同一個輸入、照同一個現行系統提示跑過的輸出。
 */
function knownReferences(life: LifeStore, s: ProbeSituation, hash: string, model: string | undefined): string[] {
  const out: string[] = []
  const d = s.aux.data as AuxData
  const nearby = s.aux.session ? life.allInSession(s.aux.session, 'memory/aux') : life.recent(400, ['memory/aux'])
  const sameInput = nearby.filter((a) => (a.data as AuxData).purpose === d.purpose && (a.data as AuxData).input === s.input)
  if (d.systemHash === hash && (!model || s.aux.model === model) && sameInput.length <= 1) out.push(d.output!)
  const inputHash = promptHash(s.input)
  for (const probe of life.all(PROCEDURE_KIND.probe)) {
    const p = probe.data as ProbeData
    if (p.inputHash === inputHash && p.referenceHash === hash) out.push(...(p.references ?? []).slice(p.reused ?? 0))
  }
  return [...new Set(out)]
}

export const COMPOSE_SYSTEM = `你是一個人工個體，正在決定要不要採用自己的一個做法的修改。輸入有：現行的做法與提案的版本；在幾個過去的真實處境中，照現行做法的兩個輸出與照提案做法的輸出；以及那些處境之後實際發生的事（有的話）。
同一個做法、同一個輸入跑兩次，輸出本來就會不一樣：照現行做法的兩個輸出之間的差異，就是隨機的變化，不是做法造成的。只有比那更大的差異，才算是提案造成的。
依具體的差異決定：
- adopt：提案做法的輸出更接近你想要的看法、判斷或評價，差異大於現行做法兩個輸出之間的差異，而且沒有帶來你不要的副作用。
- revise：方向對，但寫法造成了問題；給出修改後的完整版本，它會再被對照一次。
- reject：看不出差異、差異不比現行做法兩次之間的大、差異不是你要的，或修改不該寫成做法。
不能只因為修改聽起來合理就採用。每個理由都要指出是哪個處境（S1、S2…）、看到了什麼差異，以及這個差異是否大於那個處境中照現行做法兩個輸出之間的差異。只輸出一個 JSON 物件，不要任何其他文字：
{"verdict": "reject", "reasons": [{"situation": "S1", "observation": "...", "beyondNoise": false}], "revised": null}
- beyondNoise：每個理由必答：true 或 false。verdict 是 adopt 時，至少要有一個理由是 true。
- revised：verdict 是 revise 時給修改後的完整做法（文字）；否則給 null。`

export type Composed =
  | {
      readonly ok: true
      readonly verdict: 'adopt' | 'revise' | 'reject'
      readonly reasons: readonly { readonly situation: string; readonly observation: string; readonly beyondNoise: boolean }[]
      readonly revised?: string
    }
  | { readonly ok: false; readonly problems: readonly string[] }

/**
 * 驗證合成的判斷（強制判斷）：verdict 合法、理由至少一個、每個都指出列出的處境並判斷是否大於雜訊、
 * adopt 至少有一個理由大於雜訊、revise 時有修改後的版本。
 */
export function parseComposed(output: string, labels: readonly string[]): Composed {
  const obj = extractJson(output)
  if (!obj) return { ok: false, problems: ['不是 JSON 物件'] }
  const problems: string[] = []
  const verdict = obj['verdict']
  if (verdict !== 'adopt' && verdict !== 'revise' && verdict !== 'reject') problems.push('verdict 不是 adopt、revise 或 reject')
  const raw = (Array.isArray(obj['reasons']) ? (obj['reasons'] as unknown[]) : []).filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
  const reasons = raw.map((r) => ({
    situation: typeof r['situation'] === 'string' ? r['situation'].trim().toUpperCase() : '',
    observation: typeof r['observation'] === 'string' ? r['observation'].replace(/\s+/g, ' ').trim().slice(0, 400) : '',
    beyondNoise: r['beyondNoise'] === true,
  }))
  if (reasons.length === 0) problems.push('沒有理由')
  for (const [i, r] of reasons.entries()) {
    if (!labels.includes(r.situation)) problems.push(`理由的處境「${r.situation}」不是列出的處境`)
    if (!r.observation) problems.push(`${r.situation || '一個理由'} 沒有寫看到的差異`)
    if (typeof raw[i]!['beyondNoise'] !== 'boolean') problems.push(`${r.situation || '一個理由'} 的 beyondNoise 不是 true 或 false`)
  }
  if (verdict === 'adopt' && reasons.length > 0 && !reasons.some((r) => r.beyondNoise)) problems.push('verdict 是 adopt，但沒有一個理由的差異大於現行做法兩個輸出之間的差異')
  const revised = typeof obj['revised'] === 'string' ? obj['revised'].trim() : ''
  if (verdict === 'revise' && !revised) problems.push('verdict 是 revise，但沒有 revised')
  if (problems.length > 0 || (verdict !== 'adopt' && verdict !== 'revise' && verdict !== 'reject')) return { ok: false, problems }
  return { ok: true, verdict, reasons, ...(verdict === 'revise' ? { revised } : {}) }
}

export function composeRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的判斷不完整。verdict 只能是 adopt、revise 或 reject；reasons 至少一個，每個都要指出列出的處境（S1、S2…）、看到的差異，以及 beyondNoise（true 或 false）；adopt 至少要有一個理由的 beyondNoise 是 true；revise 時要給 revised。不合格的地方：${problems.join('；')}）`
}

interface ProbeResult {
  readonly label: string
  readonly s: ProbeSituation
  readonly references: readonly string[]
  readonly candidate: string
}

function composeInput(name: ProcedureName, current: Procedure, p: ProcedureProposalData, results: readonly ProbeResult[]): string {
  const lines = [`## 做法：${PROCEDURE_LABEL[name]}`, '', `### 現行的做法（第 ${current.version} 版）`, current.text, '', '### 提案的做法', p.text, '', `### 提案的理由`, p.reason]
  for (const r of results) {
    lines.push('', `## ${r.label}${r.s.fromEvidence ? '（提案依據的經歷）' : ''}`, '### 那次的輸入（節錄）', clipEnds(r.s.input, 1500))
    r.references.forEach((ref, i) => lines.push('', `### 照現行做法的輸出（第 ${i + 1} 個）`, clip(ref, 1500)))
    lines.push('', '### 照提案做法的輸出', clip(r.candidate, 1500))
    if (r.s.afterwards) lines.push('', '### 之後實際發生的事', r.s.afterwards)
  }
  return lines.join('\n')
}

/**
 * 一個做法提案的閘門：探測（每個處境補齊照現行做法的兩個輸出、跑一次提案的版本）→ 合成 → 寫入帳本；採用時寫下新版本。
 * revise 時建立修改後的新提案並回傳它，由呼叫端決定要不要再跑一輪。中途失敗就丟出例外，已寫的探測保留、提案沒有決定。
 * model＝閘門呼叫用的模型（provider/model）：那次真實呼叫的模型不同時，它的輸出不當現行做法的樣本。
 */
export async function runProcedureGate(life: LifeStore, proposal: LifeEvent, call: GateCall, model?: string): Promise<{ readonly decision: LifeEvent; readonly next?: LifeEvent }> {
  const p = proposal.data as ProcedureProposalData
  const current = currentProcedure(life, p.name)
  const costChars = p.text.length - current.text.length
  let calls = 0
  let reused = 0
  const counted: GateCall = async (system, input, purpose) => {
    calls++
    return call(system, input, purpose)
  }
  const decide = (data: Omit<ProcedureDecisionData, 'proposal' | 'name' | 'costChars'>): LifeEvent =>
    life.append({
      kind: PROCEDURE_KIND.decision,
      origin: 'self',
      data: { proposal: proposal.id, name: p.name, costChars, ...data } satisfies ProcedureDecisionData,
      text: `我的${PROCEDURE_LABEL[p.name]}做法的修改：${PROCEDURE_VERDICT_LABEL[data.verdict]}${data.reasons.length > 0 ? `。${data.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；').slice(0, 400)}` : ''}`,
      causes: [proposal.id, ...data.probes],
    })
  if (p.text === current.text) return { decision: decide({ verdict: 'reject', reasons: [{ situation: '', observation: '與現行的版本相同' }], probes: [], gate: 'none' }) }
  const situations = probeSituations(life, p.name, PROBES, p.evidence)
  if (situations.length === 0) {
    return { decision: decide({ verdict: 'unprobed', reasons: [{ situation: '', observation: '生命紀錄中還沒有這個做法的真實呼叫可以對照；沒有對照就不採用。' }], probes: [], gate: 'none' }) }
  }
  const proposed: Procedure = { name: p.name, version: current.version + 1, text: p.text }
  const results: ProbeResult[] = []
  const probes: string[] = []
  for (const [i, s] of situations.entries()) {
    const label = `S${i + 1}`
    const referenceSystem = systemWith(life, p.name, current, s.variant)
    const referenceHash = promptHash(referenceSystem)
    const known = knownReferences(life, s, referenceHash, model).slice(0, REFERENCES)
    reused += known.length
    const references = [...known]
    while (references.length < REFERENCES) references.push(await counted(referenceSystem, s.input, 'procedure-probe'))
    const candidateSystem = systemWith(life, p.name, proposed, s.variant)
    const candidate = await counted(candidateSystem, s.input, 'procedure-probe')
    const data: ProbeData = { proposal: proposal.id, aux: s.aux.id, label, references, candidate, inputHash: promptHash(s.input), referenceHash, candidateHash: promptHash(candidateSystem), reused: known.length }
    probes.push(life.append({ kind: PROCEDURE_KIND.probe, origin: 'self', data, causes: [proposal.id, s.aux.id] }).id)
    results.push({ label, s, references, candidate })
  }
  const labels = results.map((r) => r.label)
  const input = composeInput(p.name, current, p, results)
  let composed = parseComposed(await counted(COMPOSE_SYSTEM, input, 'procedure-compose'), labels)
  const problems = composed.ok ? [] : composed.problems.map((x) => `第 1 次：${x}`)
  if (!composed.ok) {
    composed = parseComposed(await counted(`${COMPOSE_SYSTEM}\n${composeRetryNote(composed.problems)}`, input, 'procedure-compose'), labels)
    if (!composed.ok) problems.push(...composed.problems.map((x) => `第 2 次：${x}`))
  }
  const ledger = { probes, gate: 'noise' as const, calls, reused }
  if (!composed.ok) return { decision: decide({ verdict: 'reject', reasons: [], problems, ...ledger }) }
  const reasons = composed.reasons
  if (composed.verdict === 'adopt') {
    return life.transaction(() => {
      const version: ProcedureData = { name: p.name, version: current.version + 1, text: p.text, reason: p.reason, source: 'self', proposal: proposal.id }
      const adopted = life.append({ kind: PROCEDURE_KIND.version, origin: 'self', data: version, text: `我修改了自己的${PROCEDURE_LABEL[p.name]}做法（第 ${version.version} 版）。原因：${p.reason}\n${p.text}`, causes: [proposal.id] })
      return { decision: decide({ verdict: 'adopt', reasons, adopted: adopted.id, ...ledger }) }
    })
  }
  if (composed.verdict === 'revise' && composed.revised) {
    const revisedText = composed.revised
    return life.transaction(() => {
      const decision = decide({ verdict: 'revise', reasons, ...ledger })
      const data: ProcedureProposalData = { name: p.name, text: revisedText, reason: p.reason, evidence: p.evidence, source: 'compose', baseVersion: current.version, revises: proposal.id }
      const next = life.append({ kind: PROCEDURE_KIND.proposal, origin: 'self', data, text: `我想修改自己的${PROCEDURE_LABEL[p.name]}做法（對照之後修改的版本）。`, causes: [decision.id] })
      return { decision, next }
    })
  }
  return { decision: decide({ verdict: 'reject', reasons, ...ledger }) }
}

/** 給個體看的結果（整合工具的回覆、紀錄）。 */
export function describeGate(life: LifeStore, decision: LifeEvent): string {
  const d = decision.data as ProcedureDecisionData
  const why = d.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；')
  return `${PROCEDURE_LABEL[d.name]}做法的修改${PROCEDURE_VERDICT_LABEL[d.verdict]}${d.adopted ? `（第 ${currentProcedure(life, d.name).version} 版）` : ''}${why ? `：${clip(why, 300)}` : ''}${d.problems ? `（判斷不合格：${d.problems.join('；')}）` : ''}`
}
