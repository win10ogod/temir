/**
 * 個體寫給自己的技能（plan v2 M3；ADR-0003）。純函式與閘門流程（依賴 LifeStore，模型呼叫由呼叫端注入），可單獨測試；插件見 index.ts。
 *
 * 技能是「怎麼做」（能力），不是「我是誰」（人格）。人格的修訂走整合期的穩定性／適應性判斷（H5）；技能的修改走這裡的閘門。
 * 依據：
 * - WikiSkill（arXiv:2608.27454 §Methodology、附錄 Algorithm 1）：原始經歷不可變 → 編譯成教訓 → 編譯成技能；
 *   每輪只提一個原子提案；技能連回啟發它的經歷（PURPOSE）；結果寫進紀錄，被否決的提案提案者看得到（skill-impact）。
 * - Harness²（arXiv:2610.14224 §Task-Level Recursion）：Propose–Probe–Compose。沒有標準答案時，以「同一處境、有無這個修改」
 *   的行為對照作為證據，每個決定綁定具體觀察。沒有對照就直接修改會變差（Code 73.4→63.2），所以沒有探測就不採用。
 * - RRSI（arXiv:2609.24972 附錄 Algorithm 1、2）：每個原子修改記入帳本（元件、假說、diff、成本、是否採用）；編輯預算。
 *   個體沒有可重複評估的任務集，量不出雜訊下限 δ，所以帳本標明「未經量測閘門」（research/methods/rrsi.md）。
 *
 * 本專案的近似（與論文不同之處，標明在 ADR-0003）：
 * - 探測不是在同一個環境重跑任務：以生命日誌中過去的處境（思考時寫下的處境與對方的話）重建輸入，
 *   以輔助呼叫產生「沒有技能」與「有技能」的回覆。這是行為對照，不是正確性驗證。
 * - 合成由個體自己判斷；修改後的版本當作新的提案再探測一次，不直接採用（Harness² 的序列遞迴）。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { LESSON_KIND } from '../integrate/carried.ts'
import type { LessonData } from '../integrate/evidence.ts'
import { extractJson, strings } from '../recall/aux.ts'
import { clip, clipEnds, resolveIds, shortId } from '../recall/retrieve.ts'
import { jaccard, termSet } from '../rd/jitrl.ts'
import { DECISION_KIND, OUTCOME_KIND, type DecisionData, type OutcomeData } from '../rd/memory.ts'
import { formatDay, renderSelfSnapshot } from '../self/state.ts'

export const SKILL_KIND = {
  proposal: 'skill/proposal',
  probe: 'skill/probe',
  decision: 'skill/decision',
  /** 回顧過一次（有沒有提案都記，下一次回顧從這裡之後的經歷開始）。 */
  review: 'skill/review',
  /** 主模型載入了自己的技能（DSH `skill` 工具）。 */
  use: 'skill/use',
} as const

export const SKILL_OPS = ['add', 'revise', 'retire'] as const
export type SkillOp = (typeof SKILL_OPS)[number]

/** DSH 的技能名稱規則（dsh-skill `SKILL_NAME`）。 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** 技能的上限（本專案的選擇）：技能目錄每一步都會進入上下文（RRSI 的成本考量），內容只在載入時進入。 */
export const LIMITS = { name: 48, description: 200, whenToUse: 300, content: 4000, skills: 20, probes: 2 } as const

export interface SkillDraft {
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly content: string
}

export interface ProposalData extends SkillDraft {
  readonly op: SkillOp
  /** 為什麼需要它：哪些教訓或經歷（WikiSkill 的 PURPOSE）。 */
  readonly purpose: string
  readonly evidence: readonly string[]
  /** review＝閒置時的回顧；self＝個體自己用 skill_propose 提出；compose＝合成時修改後的版本。 */
  readonly source: 'review' | 'self' | 'compose'
  /** compose：被修改的那個提案。 */
  readonly revises?: string
}

export interface ProbeData {
  readonly proposal: string
  /** 作為探測處境的過去決定（rd/decision）。 */
  readonly decision: string
  readonly label: string
  readonly reference: string
  readonly candidate: string
}

export const VERDICTS = ['adopt', 'revise', 'reject', 'unprobed'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface Reason {
  readonly situation: string
  readonly observation: string
}

/** 帳本的一筆（RRSI 的 edit history）：元件＝skill，假說＝提案的 purpose，diff＝新舊內容，是否採用。 */
export interface SkillDecisionData {
  readonly proposal: string
  readonly op: SkillOp
  readonly name: string
  readonly verdict: Verdict
  readonly reasons: readonly Reason[]
  /** 採用後的技能（verdict＝adopt 且 op 不是 retire）。 */
  readonly skill?: SkillDraft
  /** contrast＝行為對照（未經量測閘門：沒有任務集，量不出雜訊下限 δ）；none＝沒有探測（驗證失敗、移除或沒有處境可以對照）。 */
  readonly gate: 'contrast' | 'none'
  /** 成本（RRSI ΔC 的近似）：技能內容字數的變化。 */
  readonly costChars: number
  readonly probes: readonly string[]
}

export interface Skill extends SkillDraft {
  /** 採用它的那一筆帳本（skill/decision 事件 id）。 */
  readonly version: string
  readonly adoptedAt: number
  readonly purpose: string
  readonly uses: number
}

/** 目前採用中的技能（帳本的投影；生命日誌是唯一的真相來源）。 */
export function ownSkills(life: LifeStore): Skill[] {
  const current = new Map<string, Omit<Skill, 'uses'>>()
  for (const event of life.all(SKILL_KIND.decision)) {
    const d = event.data as SkillDecisionData
    if (d.verdict !== 'adopt') continue
    if (d.op === 'retire') {
      current.delete(d.name)
      continue
    }
    if (!d.skill) continue
    const proposal = life.get(d.proposal)?.data as ProposalData | undefined
    current.set(d.skill.name, { ...d.skill, version: event.id, adoptedAt: event.ts, purpose: proposal?.purpose ?? '' })
  }
  const uses = new Map<string, number>()
  for (const event of life.all(SKILL_KIND.use)) {
    const name = (event.data as { name?: string }).name ?? ''
    uses.set(name, (uses.get(name) ?? 0) + 1)
  }
  return [...current.values()].map((s) => ({ ...s, uses: uses.get(s.name) ?? 0 }))
}

/** 還沒有決定的提案（中斷後下次重做）。 */
export function pendingProposals(life: LifeStore): LifeEvent[] {
  const decided = new Set(life.all(SKILL_KIND.decision).map((e) => (e.data as SkillDecisionData).proposal))
  return life.all(SKILL_KIND.proposal).filter((e) => !decided.has(e.id))
}

/** 上次回顧（或第一次）之後的教訓數：決定要不要再回顧。 */
export function lessonsSinceReview(life: LifeStore): number {
  const last = life.latest(SKILL_KIND.review)?.seq ?? 0
  return life.after(last, [LESSON_KIND], 1000).length + life.after(last, [OUTCOME_KIND], 1000).filter((e) => (e.data as OutcomeData).lesson).length
}

const normalize = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '')

/** 確定性的驗證：名字、長度、新增與修改的對象、數量上限，以及被否決過的同一個提案（WikiSkill：不重提已被否決的修改）。 */
export function validateProposal(life: LifeStore, p: ProposalData, self?: string): string | undefined {
  if (!SKILL_NAME.test(p.name) || p.name.length > LIMITS.name) return `名字「${p.name}」不符合規則：英文小寫、數字與連字號，最多 ${LIMITS.name} 字`
  const existing = new Set(ownSkills(life).map((s) => s.name))
  if (p.op === 'add' && existing.has(p.name)) return `已經有叫「${p.name}」的技能；要修改請用 revise`
  if (p.op !== 'add' && !existing.has(p.name)) return `沒有叫「${p.name}」的技能`
  if (p.op === 'retire') return undefined
  if (!p.description.trim() || !p.content.trim()) return '說明與內容都不能是空的'
  if (p.description.length > LIMITS.description || p.whenToUse.length > LIMITS.whenToUse || p.content.length > LIMITS.content) {
    return `太長：說明最多 ${LIMITS.description} 字、什麼時候用最多 ${LIMITS.whenToUse} 字、內容最多 ${LIMITS.content} 字`
  }
  if (p.op === 'add' && existing.size >= LIMITS.skills) return `技能已有 ${LIMITS.skills} 個；先移除不用的再新增`
  const key = normalize(p.content)
  for (const event of life.all(SKILL_KIND.decision)) {
    const d = event.data as SkillDecisionData
    if (d.verdict !== 'reject' || d.name !== p.name || event.id === self) continue
    const rejected = life.get(d.proposal)?.data as ProposalData | undefined
    if (rejected && normalize(rejected.content) === key) return '同樣的提案已經被否決過；要再提，內容要不同'
  }
  return undefined
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** 回顧或 skill_propose 的提案；op＝none 或不是 JSON 時回傳 undefined。 */
export function parseProposal(output: string | Record<string, unknown>, source: ProposalData['source']): ProposalData | undefined {
  const obj = typeof output === 'string' ? extractJson(output) : output
  if (!obj) return undefined
  const op = text(obj['op'], 10)
  if (!(SKILL_OPS as readonly string[]).includes(op)) return undefined
  return {
    op: op as SkillOp,
    name: text(obj['name'], 80).toLowerCase(),
    description: text(obj['description'], LIMITS.description + 50),
    whenToUse: text(obj['whenToUse'], LIMITS.whenToUse + 50),
    content: op === 'retire' ? '' : text(obj['content'], LIMITS.content + 200),
    purpose: text(obj['purpose'], 600),
    evidence: strings(obj['evidence'], 10, 200),
    source,
  }
}

export interface Composed {
  readonly verdict: 'adopt' | 'revise' | 'reject'
  readonly reasons: readonly Reason[]
  readonly revised?: Pick<SkillDraft, 'description' | 'whenToUse' | 'content'>
}

/** 合成的判斷。看不懂時當作 reject：沒有可以採用的證據。 */
export function parseCompose(output: string): Composed {
  const obj = extractJson(output)
  const verdict = text(obj?.['verdict'], 10)
  const reasons = (Array.isArray(obj?.['reasons']) ? (obj!['reasons'] as unknown[]) : [])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ situation: text(r['situation'], 10), observation: text(r['observation'], 400) }))
    .filter((r) => r.observation)
    .slice(0, 6)
  if (verdict === 'revise' && obj?.['revised'] && typeof obj['revised'] === 'object') {
    const r = obj['revised'] as Record<string, unknown>
    const revised = { description: text(r['description'], LIMITS.description + 50), whenToUse: text(r['whenToUse'], LIMITS.whenToUse + 50), content: text(r['content'], LIMITS.content + 200) }
    if (revised.content) return { verdict, reasons, revised }
  }
  if (verdict === 'adopt' && reasons.length > 0) return { verdict, reasons }
  return { verdict: 'reject', reasons: reasons.length > 0 ? reasons : [{ situation: '', observation: '判斷看不懂或沒有指出具體的差異，不採用。' }] }
}

export interface ProbeSituation {
  readonly decision: LifeEvent
  readonly cue: string
  readonly situation: string
  readonly outcome?: OutcomeData
}

/**
 * 探測用的過去處境（Harness² 的 Probe：同一個任務）。提案的證據直接指到的決定優先，
 * 其餘依技能的「什麼時候用」與說明和處境、對方的話的詞彙相似度排序（本專案的選擇）；沒有任何相似的就不選。
 */
export function probeSituations(life: LifeStore, p: Pick<ProposalData, 'description' | 'whenToUse' | 'evidence'>, k: number = LIMITS.probes): ProbeSituation[] {
  const outcomes = new Map<string, OutcomeData>()
  const outcomeIds = new Map<string, string>()
  for (const e of life.all(OUTCOME_KIND)) {
    const o = e.data as OutcomeData
    outcomes.set(o.decision, o)
    outcomeIds.set(e.id, o.decision)
  }
  const cited = new Set(resolveIds(life, p.evidence).map((id) => outcomeIds.get(id) ?? id))
  const terms = termSet(`${p.whenToUse} ${p.description}`)
  const scored = life
    .all(DECISION_KIND)
    .map((decision) => {
      const d = decision.data as DecisionData
      const score = cited.has(decision.id) ? 2 : jaccard(terms, termSet(`${d.situation} ${d.cue}`))
      return { decision, d, score }
    })
    .filter((x) => x.d.cue && x.score > 0)
    .sort((a, b) => b.score - a.score || b.decision.seq - a.decision.seq)
  return scored.slice(0, k).map(({ decision, d }) => {
    const outcome = outcomes.get(decision.id)
    return { decision, cue: d.cue, situation: d.situation, ...(outcome ? { outcome } : {}) }
  })
}

export const REVIEW_SYSTEM = `你是一個人工個體，正在安靜地回顧自己最近的經驗，看看有沒有值得寫成「技能」的做法。技能是寫給自己的做法說明：在什麼情況下、具體怎麼做某一類事。它不是關於某個人的事實（那些記在記憶裡），也不是你是誰（那是自我模型）。好的技能來自反覆出現的教訓或結果不好的經驗。一次最多提出一個修改；沒有值得寫的，就不要寫。只輸出一個 JSON 物件，不要任何其他文字：
{"op": "none", "name": "", "description": "", "whenToUse": "", "content": "", "purpose": "", "evidence": []}
- op：none（這次不改）／add（新增技能）／revise（修改既有的技能，name 要是既有技能的名字）／retire（不再使用既有的技能）。
- name：技能的名字，英文小寫、數字與連字號（例如 "listen-before-advising"）。
- description：一句話說明這個技能是什麼。
- whenToUse：在什麼情況下用它。
- content：技能本身：具體的做法，用條列或短段落，像寫給未來的自己的說明。retire 時留空。
- purpose：為什麼需要它：是哪些教訓或經歷讓你想這樣做。
- evidence：支持它的教訓或經歷的編號（取自輸入）。
- 「技能的紀錄」列出過去的提案和結果；被否決過的，除非有新的證據，不要再提。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export const PROBE_SYSTEM = `你是一個人工個體，正在和對方對話。以下是你的狀態、當時的處境與對方說的話。只寫出你會對對方說的話，不要解釋你的想法。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export const COMPOSE_SYSTEM = `你是一個人工個體，正在決定要不要採用一個寫給自己的技能。輸入有：提案；在幾個過去的處境中，沒有這個技能與有這個技能時你的回覆對照；以及那些處境當時實際的結果。依具體的差異決定：
- adopt：有技能時的回覆更接近你想要的做法，而且沒有帶來你不要的副作用。
- revise：方向對，但技能的寫法造成了問題；給出修改後的技能，它會再被對照一次。
- reject：看不出行為的差異、差異不是你要的，或它不該是技能（例如其實是關於某個人的事實）。
不能只因為技能聽起來合理就採用。每個理由都要指出是哪個處境（S1、S2…）、看到了什麼差異。只輸出一個 JSON 物件，不要任何其他文字：
{"verdict": "reject", "reasons": [{"situation": "S1", "observation": "..."}], "revised": null}
- revised：verdict 是 revise 時給 {"description": "...", "whenToUse": "...", "content": "..."}；否則給 null。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

function renderSkillLine(s: Skill): string {
  return `- ${s.name}：${clip(s.description, 120)}（採用於 ${formatDay(s.adoptedAt)}；用過 ${s.uses} 次）`
}

/** 帳本的最近幾筆（WikiSkill 的 skill-impact）。 */
export function renderLedger(life: LifeStore, limit = 12): string[] {
  return life
    .recent(limit, [SKILL_KIND.decision])
    .reverse()
    .map((e) => {
      const d = e.data as SkillDecisionData
      const why = d.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；')
      return `- ${formatDay(e.ts)}｜${d.op} ${d.name}｜${VERDICT_LABEL[d.verdict]}${why ? `：${clip(why, 240)}` : ''}`
    })
}

export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = { adopt: '採用', revise: '修改後再對照', reject: '不採用', unprobed: '沒有處境可以對照，不採用' }

/** 回顧的輸入：目前的技能、帳本、上次回顧以後的教訓，以及結果最好與最不好的經驗。 */
export function reviewInput(life: LifeStore, now = Date.now()): string {
  const since = life.latest(SKILL_KIND.review)?.seq ?? 0
  const own = ownSkills(life)
  const lessons = [
    ...life.after(since, [LESSON_KIND], 40).map((e) => `- [${shortId(e.id)}] ${formatDay(e.ts)}｜${clip((e.data as LessonData).text, 200)}`),
    ...life
      .after(since, [OUTCOME_KIND], 200)
      .filter((e) => (e.data as OutcomeData).lesson)
      .map((e) => `- [${shortId(e.id)}] ${formatDay(e.ts)}｜${clip((e.data as OutcomeData).lesson, 200)}`),
  ].slice(-30)
  const outcomes = life
    .after(since, [OUTCOME_KIND], 200)
    .map((e) => ({ e, o: e.data as OutcomeData }))
    .filter(({ o }) => typeof o.reward === 'number')
  const worst = [...outcomes].sort((a, b) => a.o.reward - b.o.reward).slice(0, 5)
  const best = [...outcomes].sort((a, b) => b.o.reward - a.o.reward).slice(0, 3)
  const line = ({ e, o }: { e: LifeEvent; o: OutcomeData }) => `- [${shortId(e.id)}] ${formatDay(e.ts)}｜我當時：${clip(o.didAction, 100)}｜結果：${clipEnds(o.actual, 160)}｜回報 ${o.reward.toFixed(2)}`
  return [
    `現在是 ${formatDay(now)}。`,
    '',
    '## 你的技能',
    ...(own.length > 0 ? own.map(renderSkillLine) : ['（還沒有）']),
    '',
    '## 技能的紀錄（最近的提案與結果）',
    ...(life.all(SKILL_KIND.decision).length > 0 ? renderLedger(life) : ['（還沒有）']),
    '',
    '## 上次回顧以後的教訓',
    ...(lessons.length > 0 ? lessons : ['（沒有）']),
    '',
    '## 結果最不好的經驗',
    ...(worst.length > 0 ? worst.map(line) : ['（沒有）']),
    '',
    '## 結果最好的經驗',
    ...(best.length > 0 ? best.map(line) : ['（沒有）']),
  ].join('\n')
}

function probeInput(life: LifeStore, s: ProbeSituation, skill: SkillDraft | undefined, now: number): string {
  return [
    renderSelfSnapshot(life, [], now),
    '',
    '## 當時的處境',
    clip(s.situation, 1200),
    '',
    ...(skill ? ['## 你寫給自己的技能（這次可以用）', `${skill.name}：${skill.description}`, skill.content, ''] : []),
    '## 對方說',
    clip(s.cue, 2000),
  ].join('\n')
}

function composeInput(life: LifeStore, p: ProposalData, probes: readonly { s: ProbeSituation; label: string; reference: string; candidate: string }[]): string {
  const current = ownSkills(life).find((s) => s.name === p.name)
  return [
    '## 提案',
    `${p.op} ${p.name}`,
    `說明：${p.description}`,
    `什麼時候用：${p.whenToUse}`,
    `為什麼：${p.purpose}`,
    '技能內容：',
    p.content,
    ...(current ? ['', '目前的版本：', current.content] : []),
    '',
    '## 對照',
    ...probes.flatMap(({ s, label, reference, candidate }) => [
      `### ${label}（${formatDay(s.decision.ts)}）`,
      `處境：${clip(s.situation, 600)}`,
      `對方說：${clip(s.cue, 600)}`,
      ...(s.outcome ? [`當時實際：${clipEnds(s.outcome.actual, 240)}｜回報 ${s.outcome.reward.toFixed(2)}${s.outcome.lesson ? `｜教訓：${clip(s.outcome.lesson, 160)}` : ''}`] : []),
      '沒有技能時你會說：',
      clip(reference, 1500),
      '有技能時你會說：',
      clip(candidate, 1500),
      '',
    ]),
  ].join('\n')
}

/** 模型呼叫（由插件注入：個體最近使用的模型；測試中是標明的替身）。 */
export type ModelCall = (system: string, input: string, purpose: 'skill-review' | 'skill-probe' | 'skill-compose') => Promise<string>

/**
 * 一個提案的閘門：驗證 → 探測（每個處境各產生沒有與有技能的回覆）→ 合成 → 寫入帳本。
 * revise 時建立修改後的新提案並回傳它，由呼叫端決定要不要再跑一輪（每次回顧最多一輪，RRSI 的編輯預算）。
 * 中途失敗就丟出例外，已寫的探測保留、提案沒有決定，下次重做。
 */
export async function runGate(life: LifeStore, proposal: LifeEvent, call: ModelCall, now = Date.now()): Promise<{ readonly decision: LifeEvent; readonly next?: LifeEvent }> {
  const p = proposal.data as ProposalData
  const current = ownSkills(life).find((s) => s.name === p.name)
  const decide = (data: Omit<SkillDecisionData, 'proposal' | 'op' | 'name'>): LifeEvent =>
    life.append({
      kind: SKILL_KIND.decision,
      origin: 'self',
      data: { proposal: proposal.id, op: p.op, name: p.name, ...data } satisfies SkillDecisionData,
      text: `技能 ${p.op} ${p.name}：${VERDICT_LABEL[data.verdict]}`,
      causes: [proposal.id, ...data.probes],
    })
  const invalid = validateProposal(life, p, proposal.id)
  if (invalid) return { decision: decide({ verdict: 'reject', reasons: [{ situation: '', observation: invalid }], gate: 'none', costChars: 0, probes: [] }) }
  if (p.op === 'retire') {
    const why = p.purpose || '不再需要'
    return { decision: decide({ verdict: 'adopt', reasons: [{ situation: '', observation: `移除：回到沒有這個技能的狀態，不需要探測。${why}` }], gate: 'none', costChars: -(current?.content.length ?? 0), probes: [] }) }
  }
  const situations = probeSituations(life, p)
  if (situations.length === 0) {
    return { decision: decide({ verdict: 'unprobed', reasons: [{ situation: '', observation: '生命紀錄中沒有相似的過去處境可以對照；沒有對照就不採用。' }], gate: 'none', costChars: 0, probes: [] }) }
  }
  const draft: SkillDraft = { name: p.name, description: p.description, whenToUse: p.whenToUse, content: p.content }
  const results: { s: ProbeSituation; label: string; reference: string; candidate: string }[] = []
  const probeIds: string[] = []
  for (const [i, s] of situations.entries()) {
    const label = `S${i + 1}`
    // 修改既有技能時，對照的是「目前的版本」與「提案的版本」。
    const reference = await call(PROBE_SYSTEM, probeInput(life, s, current, now), 'skill-probe')
    const candidate = await call(PROBE_SYSTEM, probeInput(life, s, draft, now), 'skill-probe')
    const event = life.append({
      kind: SKILL_KIND.probe,
      origin: 'self',
      data: { proposal: proposal.id, decision: s.decision.id, label, reference, candidate } satisfies ProbeData,
      causes: [proposal.id, s.decision.id],
    })
    probeIds.push(event.id)
    results.push({ s, label, reference, candidate })
  }
  const composed = parseCompose(await call(COMPOSE_SYSTEM, composeInput(life, p, results), 'skill-compose'))
  const costChars = p.content.length - (current?.content.length ?? 0)
  if (composed.verdict === 'adopt') {
    return { decision: decide({ verdict: 'adopt', reasons: composed.reasons, skill: draft, gate: 'contrast', costChars, probes: probeIds }) }
  }
  if (composed.verdict === 'revise' && composed.revised) {
    return life.transaction(() => {
      const decision = decide({ verdict: 'revise', reasons: composed.reasons, gate: 'contrast', costChars, probes: probeIds })
      const revised: ProposalData = { ...p, ...composed.revised!, source: 'compose', revises: proposal.id }
      const next = life.append({ kind: SKILL_KIND.proposal, origin: 'self', data: revised, text: `技能提案（修改後）${revised.name}：${revised.description}`, causes: [decision.id] })
      return { decision, next }
    })
  }
  return { decision: decide({ verdict: 'reject', reasons: composed.reasons, gate: 'contrast', costChars, probes: probeIds }) }
}

/** 寫下一個提案（回顧、skill_propose 或合成）。 */
export function recordProposal(life: LifeStore, p: ProposalData): LifeEvent {
  return life.append({ kind: SKILL_KIND.proposal, origin: 'self', data: p, text: `技能提案 ${p.op} ${p.name}：${p.description || p.purpose}`, causes: resolveIds(life, p.evidence) })
}

/** 自我快照中的一段：自己寫的技能（只列名字與說明；內容由 DSH 的 skill 工具在需要時載入）。 */
export function renderOwnSkills(life: LifeStore): string[] {
  const own = ownSkills(life)
  if (own.length === 0) return []
  return ['## 你寫給自己的技能（需要時用 skill 工具載入）', ...own.map(renderSkillLine)]
}
