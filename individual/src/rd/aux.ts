/**
 * RD 階段的輔助呼叫：行動前的思考與準備、扣除的強制判斷、事後比對（hypotheses.md H0；ADR-0002 D2）。
 *
 * 兩個呼叫都以個體目前的模型路由、不關閉思考的最低推理等級進行（recall/aux.ts 的 auxEffort），輸入與輸出寫進生命日誌。
 * 系統提示＝框架（程式）＋個體自己的做法（self/procedure.ts；思考、扣除、比對）＋輸出（程式；ADR-0008 §1）。
 * 程式只規定機制需要的欄位與必答的判斷，不規定內容屬於哪一類：做法的種類（舊的 KINDS，撤回 ADR-0002 D22）、
 * 重要程度（舊的 SIGNIFICANCE）、懸念的類型都拿掉了，改成逐項的強制判斷（ADR-0008 §2）。
 * 候選行動附 0–100 的口述信心，依 JitRL 論文 experiments.tex〈Verbalized Logit〉與 appendix.tex 的 Jericho
 * 行動產生提示（「For EACH action, provide your confidence as an integer from 0 to 100」「sum … MUST equal 100」）。
 */
import { extractJson, strings } from '../recall/aux.ts'
import { DEFAULT_PROCEDURES, procedurePrompt, withoutLines, type Procedure } from '../self/procedure.ts'
import type { Candidate } from './jitrl.ts'

const DEFAULT = (name: 'deliberate' | 'subtract' | 'outcome'): Procedure => ({ name, version: 1, text: DEFAULT_PROCEDURES[name] })

/** 消融時，做法中提到被關掉的機制的那幾行（第一版的寫法；修訂過的做法只能盡力而為，ADR-0008）。 */
const ENERGY_WORDS = ['懸著的事']
const PER_PERSON_WORDS = ['逐一檢查對方自己']

export interface DeliberateOptions {
  /** 個體目前的思考與扣除做法；省略時用第一版。 */
  readonly procedures?: { readonly deliberate?: Procedure; readonly subtract?: Procedure }
  /** 能量（H-E）的欄位：drive（動能）與 activated（被觸發的勢能）。消融（experiments/runner/patches/no-energy.yml）時關閉。 */
  readonly energy?: boolean
  /** RD 的扣除（H0「−」，ADR-0002 D15）；消融（patches/no-subtraction.yml）時關閉。 */
  readonly subtraction?: boolean
  /** 逐一檢查每一個人（ADR-0002 D17；dev6 q11、q51）；消融（patches/no-perperson.yml）時關閉。 */
  readonly perPerson?: boolean
}

/** 從輸出段中拿掉指定的欄位：JSON 範例中的鍵，以及以「- 欄位：」「  - 欄位：」開頭的說明行。 */
function withoutFields(contract: string, fields: readonly string[]): string {
  let out = contract
  for (const f of fields) {
    out = out.replace(new RegExp(`, "${f}": (?:"[^"]*"|\\[\\]|false|true)`, 'u'), '')
    out = out
      .split('\n')
      .filter((line) => !line.startsWith(`- ${f}：`) && !line.startsWith(`  - ${f}：`))
      .join('\n')
  }
  return out
}

const DELIBERATE_CONTRACT = `只輸出一個 JSON 物件，不要任何其他文字：
{"situation": "...", "drive": "...", "activated": [], "people": [], "candidates": [{"action": "...", "prediction": "...", "confidence": 50, "excluded": false, "reason": ""}], "experiences": [{"id": "E1", "sameSituation": false, "sameAction": [], "sameExcluded": []}]}
- situation：眼前的處境。
- drive：此刻推動你行動的是什麼，一句話；寫動機，不是做法；用文字說明是哪一件，不寫編號（編號寫在 activated）。
- activated：被這個處境觸發的「懸著的事」的編號（例如 "P2"）或目標的 id（例如 "g:3fa1c2d4"）；沒有就給空陣列。
- people：這次涉及的人：對方自己（通常也在場），以及這次的話題實際涉及的人。每個人是 {"who": "稱呼與關係，例如「對方自己」「對方的媽媽」", "relevant": ["這個人與這次直接有關的事實，每條一句"]}；沒有相關的事實就給空陣列。
- candidates：2 到 4 個彼此不同的做法。
  - action：一句話的做法。
  - prediction：預期對方或結果會怎樣。
  - confidence：0 到 100 的整數，代表你有多傾向這樣做，全部加總為 100。
  - excluded：是否扣除、不做這個做法：true 或 false。至少保留一個不扣除的做法。
  - reason：扣除的理由，一句話；沒有扣除就給空字串。
- experiences：「過去類似處境的經驗」列出的每一個經驗都要剛好一筆，逐一判斷，不能略過；沒有列出經驗時給空陣列。
  - id：經驗的編號（例如 "E1"）。
  - sameSituation：那次的處境與現在是不是同一類：true 或 false。
  - sameAction：candidates 中，做法與那次「我當時」的做法相同的那幾個的編號（依 candidates 的順序：1、2、3）；沒有就給空陣列。
  - sameExcluded：那筆經驗寫了「當時扣除」時必答：candidates 中，做法與那次扣除的做法相同的那幾個的編號；沒有就給空陣列。經驗沒有寫「當時扣除」時可以省略。`

/** 思考的系統提示（框架＋思考做法＋扣除做法＋輸出）。 */
export function deliberateSystem(options: DeliberateOptions = {}): string {
  const energy = options.energy ?? true
  const subtraction = options.subtraction ?? true
  const perPerson = options.perPerson ?? true
  let deliberate = options.procedures?.deliberate ?? DEFAULT('deliberate')
  if (!energy) deliberate = withoutLines(deliberate, ENERGY_WORDS)
  if (!perPerson) deliberate = withoutLines(deliberate, PER_PERSON_WORDS)
  // 這一步沒有工具（dev15 q17：模型兩次都寫出 recall 的工具呼叫，而不是 JSON）；輸入列出的工具是回應時才能用的。
  const frame = `你是一個人工個體。對方剛說了話，你在回應之前先思考與準備：理解眼前的處境，想出幾個可能的做法，預測各自的後果${subtraction ? '；再扣除不該做的做法，剩下的才會成為行動' : '，再決定傾向哪一個'}。這一步只思考，不能呼叫工具；「你現在可以使用的工具」是你回應時可以用的，例如要先查記憶，就把它寫成一個做法。照下面你自己的做法思考，輸出照最後一段的格式。`
  let contract = DELIBERATE_CONTRACT
  if (!energy) contract = withoutFields(contract, ['drive', 'activated'])
  if (!perPerson) contract = withoutFields(contract, ['people'])
  if (!subtraction) contract = withoutFields(contract, ['excluded', 'reason', 'sameExcluded'])
  return procedurePrompt(frame, subtraction ? [deliberate, options.procedures?.subtract ?? DEFAULT('subtract')] : [deliberate], contract)
}

/** 消融：關閉扣除時丟掉模型仍可能寫出的扣除，選擇回到全部候選中分數最高的。 */
export function withoutExclusions(d: Deliberation): Deliberation {
  return { ...d, candidates: d.candidates.map((c) => ({ action: c.action, prediction: c.prediction, confidence: c.confidence, sameAs: c.sameAs })) }
}

export const DELIBERATE_SYSTEM = deliberateSystem()

const OUTCOME_CONTRACT = `只輸出一個 JSON 物件，不要任何其他文字：
{"didAction": "...", "declined": false, "actual": "...", "matched": "yes", "error": "", "reward": 0, "reason": "...", "lesson": "", "feeling": "", "keepFeeling": false, "reconsider": false, "gapOnMind": false, "released": [], "left": []}
- didAction：一句話，你實際採取的做法。
- declined：必答：這次你有沒有拒絕對方的要求，或對對方表達不同意：true 或 false。
- actual：實際發生了什麼：你做了什麼、對方接著怎麼回應。
- matched：結果是否符合你當時的預測：yes／partly／no。
- error：預測與實際的差異；符合就給空字串。
- reward：-1 到 1 之間的數：依你的自我模型與目標，這個結果對你而言好不好。
- reason：一句話說明 reward 的理由。
- lesson：值得帶到以後的教訓，一句；沒有就給空字串。
- feeling：你對這段經歷的感受；沒有就給空字串。
- keepFeeling：feeling 不是空的時必答：要不要把這個感受記下來，日後回憶到這段經歷時會一起想起：true 或 false。
- reconsider：必答：這段經歷要不要讓你現在就重新檢視自己（核心價值、人生敘事與長期目標）：true 或 false。
- gapOnMind：matched 是 no 時必答：預測與實際的落差會不會一直掛在你心上：true 或 false。
- released：輸入中「懸著的事」裡，這次被釋放的那幾件。每條 {"item": "P1", "how": "怎麼釋放的"}；沒有就給空陣列。
- left：這一回合新產生、會掛在你心上的事。每條 {"text": "一句話", "forOther": true}；沒有就給空陣列。
  - forOther：每條必答：這件事推動你對對方做什麼（true），還是推動你自己的反省（false）。`

/** 事後比對的系統提示（框架＋比對做法＋輸出）。energy 關閉時沒有 released、left、gapOnMind（勢能的釋放與留下）。 */
export function outcomeSystem(options: { readonly procedure?: Procedure; readonly energy?: boolean } = {}): string {
  const energy = options.energy ?? true
  const procedure = options.procedure ?? DEFAULT('outcome')
  const frame = '你是一個人工個體，回頭比對自己上一個決定：當時的預測，和實際發生的事一不一樣。照下面你自己的做法比對，輸出照最後一段的格式。'
  return procedurePrompt(frame, [energy ? procedure : withoutLines(procedure, ENERGY_WORDS)], energy ? OUTCOME_CONTRACT : withoutFields(OUTCOME_CONTRACT, ['gapOnMind', 'released', 'left', 'forOther']))
}

export const OUTCOME_SYSTEM = outcomeSystem()

const REVISION_CONTRACT = `只輸出一個 JSON 物件，不要任何其他文字：
{"judgments": [{"candidate": 1, "decision": "keep", "why": "一句話", "refs": ["X1"]}]}
- candidate：做法的編號（列表中的數字）。每一個列出的做法剛好一筆。
- decision：keep 或 lift。
- why：一句話的理由，說明你依據哪一次經驗、為什麼這樣判斷。
- refs：你依據的經驗編號（列表中的 X 編號），至少一個。`

/**
 * D20 第三版：扣除本身會被經驗改變，由個體判斷，但**強制判斷**（使用者 2026-10-30「應該交給模型判斷設計沒問題,
 * 有問題的是沒有作強制要求判斷」）。程式找出需要判斷的扣除（memory.ts 的 exclusionReviews），這個提示要求逐一作答，
 * 答案由 parseJudgments 驗證；缺了就附上缺少的部分再問一次。框架＋扣除做法＋輸出。
 */
export function revisionSystem(procedure: Procedure = DEFAULT('subtract')): string {
  const frame =
    '你是一個人工個體。你剛才在行動前的思考中扣除了一些做法。下面列出每一個被扣除的做法，以及類似處境中與它相同的做法的經驗（當時扣除了相同的做法、或做了相同的做法，之後發生了什麼、當時的預測有沒有成真）。照你自己的扣除做法，對每一個列出的做法都明確判斷：維持扣除（keep），或依經驗解除扣除（lift）。兩種答案都可以，但不能不判斷。'
  return procedurePrompt(frame, [procedure], REVISION_CONTRACT)
}

export const REVISION_SYSTEM = revisionSystem()

/** 判斷不合格時重問一次所附的說明，列出缺少或不合格的部分。 */
export function revisionRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的判斷不完整。每一個列出的做法都要剛好一筆判斷，decision 只能是 keep 或 lift，why 不能是空的，refs 要引用列出的 X 編號。不合格的地方：${problems.join('；')}）`
}

/**
 * 思考的輸出不合格時，重試一次所附的說明，列出不合格的地方（不同模型照格式的能力不同；插件不能只對某些模型有效）。
 * 不合格：不是完整的 JSON、少於兩個可用的做法、列出的經驗沒有逐筆判斷（parseDeliberation 的 problems）。
 */
export function deliberationRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的輸出不合格。只輸出一個完整的 JSON 物件，candidates 要有 2 到 4 個做法；「過去類似處境的經驗」列出的每一個經驗，experiences 都要剛好一筆（sameSituation 是 true 或 false，sameAction 是做法編號的陣列，可以是空的；那筆經驗寫了「當時扣除」時，sameExcluded 也是做法編號的陣列）。不合格的地方：${problems.join('；')}）`
}

/** 思考把全部做法都扣除時，重問一次所附的說明（輸出段本來就要求「至少保留一個不扣除的做法」；改進清單第 6 項）。 */
export const ALL_EXCLUDED_NOTE = '（重寫一次：上一次的輸出把全部的做法都扣除了。至少保留一個不扣除的做法：candidates 中至少一個的 excluded 是 false。要扣除哪些、保留哪一個，仍由你判斷。）'

export interface Person {
  readonly who: string
  readonly relevant: readonly string[]
}

export interface Deliberation {
  readonly situation: string
  /** 動能（H-E）：此刻推動這次行動的是什麼；模型沒有寫就是空字串。 */
  readonly drive: string
  /** 被觸發的勢能（模型寫的編號，原樣保留；由呼叫端轉成 key）。 */
  readonly activated: readonly string[]
  /** 模型判定處境本質上相同的過去經驗（rd/decision 事件 id）：experiences 中 sameSituation 為 true 的（D23）。 */
  readonly similar: readonly string[]
  /** 這次涉及的人（包括對方自己）與各自與這次有關的事實（ADR-0002 D17）。 */
  readonly people: readonly Person[]
  readonly candidates: readonly Candidate[]
}

/** 逐一轉換思考結果中會進入準備訊息與紀錄的文字：處境、drive、候選的做法、預期與扣除理由。 */
export function mapDeliberationText(d: Deliberation, f: (s: string) => string): Deliberation {
  return {
    ...d,
    situation: f(d.situation),
    drive: f(d.drive),
    candidates: d.candidates.map((c) => ({
      ...c,
      action: f(c.action),
      prediction: f(c.prediction),
      ...(c.excludeReason ? { excludeReason: f(c.excludeReason) } : {}),
      // 舊版的 revised（D20 第一、二版；見 jitrl.ts 的 Candidate.revised）。
      ...(c.revised ? { revised: f(c.revised) } : {}),
    })),
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** 模型自己寫出的工具呼叫（dev15 q17：`<tool_call name="recall">`、`<tool_call>{"name":"recall",…}`）。 */
const TOOL_CALL = /<\/?tool_call\b|<\|tool_call|"name"\s*:\s*"(?:recall|integrate|appraise)"/u

export type DeliberationParse = { readonly ok: true; readonly deliberation: Deliberation } | { readonly ok: false; readonly problems: readonly string[] }

/** 做法編號的陣列 → candidates 中的位置；認不得的列為問題。 */
function candidateNumbers(value: unknown, field: string, label: string, numbered: ReadonlyMap<number, number>, problems: string[]): number[] {
  if (!Array.isArray(value)) {
    problems.push(`${label} 的 ${field} 不是陣列`)
    return []
  }
  const out: number[] = []
  for (const n of value as unknown[]) {
    const number = typeof n === 'number' ? n : typeof n === 'string' && /^\d+$/.test(n.trim()) ? Number(n.trim()) : Number.NaN
    const at = numbered.get(number)
    if (at === undefined) problems.push(`${label} 的 ${field} 有「${String(n)}」，不是做法的編號`)
    else if (!out.includes(at)) out.push(at)
  }
  return out
}

/**
 * 經驗的逐筆判斷（ADR-0002 D23；ADR-0008 §2；使用者 2026-10-30「有問題的是沒有作強制要求判斷」）：列出的每一個經驗剛好一筆，
 * sameSituation 是 true 或 false，sameAction 是做法編號（candidates 的順序，從 1 起）的陣列；
 * 那筆經驗列出了當時扣除的做法時（withExcluded），sameExcluded 也必答。
 * JitRL 的鄰居（jitrl.ts 的 neighbors）、行動相符（correct 的 sameAs），以及哪些扣除需要判斷（memory.ts 的 exclusionReviews）都靠它們。
 * 缺的、重複的、認不得的都列為問題；判斷的內容由模型決定。
 * numbered：做法編號 → candidates 中的位置（沒有 action 而略過的做法不在其中）。
 */
function experienceJudgments(
  value: unknown,
  labels: ReadonlyMap<string, string>,
  withExcluded: ReadonlySet<string>,
  numbered: ReadonlyMap<number, number>,
  problems: string[],
): { similar: string[]; sameAs: Map<number, string[]>; sameExcluded: Map<number, string[]> } {
  const similar: string[] = []
  const sameAs = new Map<number, string[]>()
  const sameExcluded = new Map<number, string[]>()
  const add = (map: Map<number, string[]>, at: number, id: string) => map.set(at, [...(map.get(at) ?? []), id])
  if (labels.size === 0) return { similar, sameAs, sameExcluded }
  if (!Array.isArray(value)) problems.push('沒有 experiences')
  const seen = new Set<string>()
  for (const raw of Array.isArray(value) ? (value as unknown[]) : []) {
    if (typeof raw !== 'object' || raw === null) {
      problems.push('experiences 中有一筆不是物件')
      continue
    }
    const e = raw as Record<string, unknown>
    const label = text(e['id'], 10).toUpperCase()
    const id = labels.get(label)
    if (!id) {
      problems.push(`experiences 的「${text(e['id'], 10)}」不是列出的經驗編號`)
      continue
    }
    if (seen.has(label)) {
      problems.push(`${label} 判斷了不只一次`)
      continue
    }
    seen.add(label)
    if (typeof e['sameSituation'] !== 'boolean') problems.push(`${label} 的 sameSituation 不是 true 或 false`)
    else if (e['sameSituation']) similar.push(id)
    for (const at of candidateNumbers(e['sameAction'], 'sameAction', label, numbered, problems)) add(sameAs, at, id)
    if (withExcluded.has(label)) for (const at of candidateNumbers(e['sameExcluded'], 'sameExcluded', label, numbered, problems)) add(sameExcluded, at, id)
  }
  for (const label of labels.keys()) if (!seen.has(label)) problems.push(`沒有判斷 ${label}`)
  return { similar, sameAs, sameExcluded }
}

/**
 * 解析思考結果。labels 把提示中的經驗編號（E1、E2……）對應到 rd/decision 事件 id；withExcluded＝列出了當時扣除的做法的那幾個編號。
 * 不合格（列出 problems，呼叫端附上 deliberationRetryNote 重問；仍不合格就不做準備，直接讓主模型回應）：
 * 不是 JSON 物件、沒有 candidates、少於兩個可用的做法、列出的經驗沒有逐筆判斷（experienceJudgments）。
 */
export function parseDeliberation(output: string, labels: ReadonlyMap<string, string>, withExcluded: ReadonlySet<string> = new Set()): DeliberationParse {
  const obj = extractJson(output)
  if (!obj) return { ok: false, problems: [TOOL_CALL.test(output) ? '輸出的是工具呼叫，不是 JSON 物件：這一步不能呼叫工具' : '不是 JSON 物件'] }
  if (!Array.isArray(obj['candidates'])) return { ok: false, problems: [TOOL_CALL.test(output) ? '輸出的是工具呼叫，不是思考的結果：這一步不能呼叫工具' : '沒有 candidates'] }
  const problems: string[] = []
  const candidates: Candidate[] = []
  const numbered = new Map<number, number>()
  for (const [i, raw] of (obj['candidates'] as unknown[]).entries()) {
    if (typeof raw !== 'object' || raw === null) continue
    const c = raw as Record<string, unknown>
    const action = text(c['action'], 200)
    if (!action) continue
    const confidence = typeof c['confidence'] === 'number' && Number.isFinite(c['confidence']) ? Math.min(Math.max(c['confidence'], 0), 100) : 0
    const excluded = c['excluded'] === true
    // 舊版提示（D20 第一、二版）的選填欄位，現行的提示已經沒有；照舊解析，只為了相容（jitrl.ts 的 Candidate.revised）。
    const revised = text(c['revised'], 200)
    candidates.push({
      action,
      prediction: text(c['prediction'], 300),
      confidence,
      sameAs: [],
      ...(excluded ? { excluded, excludeReason: text(c['reason'], 200) } : {}),
      ...(revised ? { revised } : {}),
    })
    numbered.set(i + 1, candidates.length - 1)
    if (candidates.length >= 4) break
  }
  if (candidates.length < 2) problems.push(`可用的做法只有 ${candidates.length} 個`)
  const judged = experienceJudgments(obj['experiences'], labels, withExcluded, numbered, problems)
  if (problems.length > 0) return { ok: false, problems }
  const deliberation: Deliberation = {
    situation: text(obj['situation'], 600),
    drive: text(obj['drive'], 300),
    activated: strings(obj['activated'], 8, 40),
    similar: judged.similar,
    people: (Array.isArray(obj['people']) ? (obj['people'] as unknown[]) : []).flatMap((p): Person[] => {
      const person: Person | undefined =
        typeof p === 'string'
          ? { who: text(p, 40), relevant: [] }
          : typeof p === 'object' && p !== null
            ? { who: text((p as Record<string, unknown>)['who'], 40), relevant: strings((p as Record<string, unknown>)['relevant'], 6, 120) }
            : undefined
      return person && person.who ? [person] : []
    }).slice(0, 6),
    candidates: candidates.map((c, i) => {
      const excludedSame = judged.sameExcluded.get(i) ?? []
      return { ...c, sameAs: judged.sameAs.get(i) ?? [], ...(excludedSame.length > 0 ? { sameExcluded: excludedSame } : {}) }
    }),
  }
  return { ok: true, deliberation }
}

/** 這一回合新產生的懸念：個體自己的話，以及它推動的方向（ADR-0008 §2；取代舊的三種類型）。 */
export interface LeftItem {
  readonly text: string
  readonly forOther: boolean
}

export interface OutcomeJudgement {
  readonly didAction: string
  /** 這次有沒有拒絕對方的要求或表達不同意（拒絕與異議的紀錄，plan v2 M4；取代舊的做法種類「拒絕」）。 */
  readonly declined: boolean
  readonly actual: string
  readonly matched: 'yes' | 'partly' | 'no'
  readonly error: string
  readonly reward: number
  readonly reason: string
  readonly lesson: string
  /** 對這段經歷的感受（性質 2：經驗評價受 PC 影響；H-M1：情感是被記住的感受）。 */
  readonly feeling: string
  /** 要不要把感受記成感受紀錄（取代「不是日常的才記」）。沒有感受時為 false。 */
  readonly keepFeeling: boolean
  /** 要不要現在就重新檢視自己（深度整合，H4；取代「轉折」）。 */
  readonly reconsider: boolean
  /** matched 是 no 時：落差會不會一直掛在心上（意外的勢能，H-E；取代「值得注意以上」）。其他情形為 false。 */
  readonly gapOnMind: boolean
  /** H-E：釋放了什麼（說明，以及模型寫的編號，由呼叫端轉成 key）、留下了什麼（逐件）。 */
  readonly released: string
  readonly releasedRefs: readonly string[]
  readonly left: readonly LeftItem[]
}

/** released 是陣列（[{item, how}]）；第一版的一句話也接受。 */
function releases(value: unknown): { text: string; refs: string[] } {
  if (typeof value === 'string') return { text: text(value, 300), refs: [] }
  if (!Array.isArray(value)) return { text: '', refs: [] }
  const items = value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({ item: text(v['item'], 40), how: text(v['how'], 200) }))
    .filter((v) => v.item)
    .slice(0, 8)
  return { text: items.map((v) => (v.how ? `${v.item}：${v.how}` : v.item)).join('；'), refs: items.map((v) => v.item) }
}

/** left 是陣列，每條必答 forOther（ADR-0008 §2）。 */
function lefts(value: unknown, problems: string[]): LeftItem[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    problems.push('left 不是陣列')
    return []
  }
  const out: LeftItem[] = []
  for (const [i, v] of (value as unknown[]).entries()) {
    const item = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
    const body = item ? text(item['text'], 300) : text(v, 300)
    if (!body) continue
    if (typeof item?.['forOther'] !== 'boolean') {
      problems.push(`left 第 ${i + 1} 條的 forOther 不是 true 或 false`)
      continue
    }
    out.push({ text: body, forOther: item['forOther'] })
  }
  return out.slice(0, 6)
}

export type OutcomeParse = { readonly ok: true; readonly judgment: OutcomeJudgement } | { readonly ok: false; readonly problems: readonly string[] }

/**
 * 事後比對的強制判斷（使用者 2026-10-30「有問題的是沒有作強制要求判斷」）：程式不替模型填預設值。
 * 必填：reward 是數（夾到 [-1, 1]）、matched 是 yes／partly／no、didAction 不是空的、declined 與 reconsider 是布林；
 * 有感受時 keepFeeling 是布林；能量開而 matched 是 no 時 gapOnMind 是布林；每條 left 的 forOther 是布林。
 * matched 會進入 D20「預測有沒有成真」（memory.ts），keepFeeling 決定感受紀錄，reconsider 決定深度整合，gapOnMind 決定意外的勢能，
 * 所以缺了就列出問題，由呼叫端附上 outcomeRetryNote 重問；仍不合格就記下失敗，不當成經驗。
 * labels＝輸入中懸著的事的編號（能量開時）：released 寫了認不得的編號也是問題，不靜默丟掉（改進清單第 6 項）。
 */
export function parseOutcome(output: string, options: { readonly labels?: ReadonlyMap<string, string>; readonly energy?: boolean } = {}): OutcomeParse {
  const energy = options.energy ?? true
  const obj = extractJson(output)
  if (!obj) return { ok: false, problems: ['不是 JSON 物件'] }
  const problems: string[] = []
  const reward = obj['reward']
  if (typeof reward !== 'number' || !Number.isFinite(reward)) problems.push('reward 不是數')
  const matched = obj['matched']
  if (matched !== 'yes' && matched !== 'partly' && matched !== 'no') problems.push('matched 不是 yes、partly 或 no')
  const didAction = text(obj['didAction'], 200)
  if (!didAction) problems.push('didAction 是空的')
  const feeling = text(obj['feeling'], 300)
  if (feeling && typeof obj['keepFeeling'] !== 'boolean') problems.push('有 feeling，但 keepFeeling 不是 true 或 false')
  if (typeof obj['reconsider'] !== 'boolean') problems.push('reconsider 不是 true 或 false')
  if (typeof obj['declined'] !== 'boolean') problems.push('declined 不是 true 或 false')
  if (energy && matched === 'no' && typeof obj['gapOnMind'] !== 'boolean') problems.push('matched 是 no，但 gapOnMind 不是 true 或 false')
  const released = energy ? releases(obj['released']) : { text: '', refs: [] }
  if (options.labels) for (const ref of released.refs) if (!options.labels.has(ref.trim().toUpperCase())) problems.push(`released 的「${ref}」不是輸入中列出的懸著的事的編號`)
  const left = energy ? lefts(obj['left'], problems) : []
  if (problems.length > 0 || typeof reward !== 'number' || (matched !== 'yes' && matched !== 'partly' && matched !== 'no')) return { ok: false, problems }
  return {
    ok: true,
    judgment: {
      didAction,
      declined: obj['declined'] === true,
      actual: text(obj['actual'], 400),
      matched,
      error: text(obj['error'], 300),
      reward: Math.min(Math.max(reward, -1), 1),
      reason: text(obj['reason'], 300),
      lesson: text(obj['lesson'], 300),
      feeling,
      keepFeeling: feeling !== '' && obj['keepFeeling'] === true,
      reconsider: obj['reconsider'] === true,
      gapOnMind: energy && matched === 'no' && obj['gapOnMind'] === true,
      released: released.text,
      releasedRefs: released.refs,
      left,
    },
  }
}

/** 事後比對不合格時重問一次所附的說明，列出缺少或不合格的部分（輸出段本來就要求這些欄位）。 */
export function outcomeRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的比對不完整。只輸出一個完整的 JSON 物件；didAction 不能是空的，matched 只能是 yes、partly 或 no，reward 是 -1 到 1 之間的數，declined 與 reconsider 是 true 或 false；有 feeling 時 keepFeeling 是 true 或 false，matched 是 no 時 gapOnMind 是 true 或 false，left 的每一條都要有 forOther（true 或 false）。不合格的地方：${problems.join('；')}）`
}
