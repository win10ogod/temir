/**
 * RD 階段的輔助呼叫：行動前的思考與準備、事後比對（hypotheses.md H0；ADR-0002 D2）。
 *
 * 兩個呼叫都以個體目前的模型路由、不關閉思考的最低推理等級進行（recall/aux.ts 的 auxEffort），輸入與輸出寫進生命日誌。
 * 處境描述用固定欄位：JitRL method.tex〈State Construction〉把原始狀態抽象成精簡的結構化狀態、去掉無關細節，
 * 原則是「功能相同的處境映射到相似的表示」。e2e-13 中自由文字的處境混入個體自身狀態的套話，
 * 兩次相似的傾訴相似度只有 0.15–0.23。
 * 候選行動附 0–100 的口述信心，依 JitRL 論文 experiments.tex〈Verbalized Logit〉與 appendix.tex 的 Jericho
 * 行動產生提示（「For EACH action, provide your confidence as an integer from 0 to 100」「sum … MUST equal 100」）。
 */
import { extractJson, strings } from '../recall/aux.ts'
import { SIGNIFICANCE, type Significance } from '../self/state.ts'
import type { Candidate } from './jitrl.ts'
import type { LeftType } from './memory.ts'

export const KINDS = ['回答', '提問', '建議', '拒絕', '使用工具', '表達感受', '其他'] as const

/**
 * 思考的提示。energy＝能量（H-E）的欄位：drive（動能）與 activated（被觸發的勢能）。
 * 消融實驗（experiments/runner/patches/no-energy.yml）關閉時，提示中不出現這兩個欄位，其餘完全相同。
 * subtraction＝RD 的扣除（H0「−」，ADR-0002 D15）；消融（patches/no-subtraction.yml）關閉時見 withoutSubtraction。
 * perPerson＝相關的記憶逐一檢查每一個人（ADR-0002 D17；dev6 q11、q51：記得對方的過敏，思考時卻只寫了她在戒糖）。
 */
export function deliberateSystem(energy = true, subtraction = true, perPerson = true): string {
  const prompt = `你是一個人工個體，在回應之前先思考與準備：理解眼前的處境，想出幾個可能的做法，預測各自的後果；再依預測、過去類似處境的結果與你在乎的事，扣除不該做的做法，剩下的才會成為行動。依你自己的價值、目標與經驗判斷；你可以照對方的要求做，也可以提問、表達不同意或拒絕。只輸出一個 JSON 物件，不要任何其他文字：
{"situation": "...", "drive": "...", "activated": [], "similar": [], "people": [], "candidates": [{"action": "...", "kind": "...", "prediction": "...", "confidence": 50, "sameAs": [], "excluded": false, "reason": ""}]}
- situation：用固定的格式描述眼前的處境，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不要寫你自己的紀錄有多少、有沒有自我模型這類與處境無關的事。
  - 相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人：每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
- drive：此刻推動你行動的是什麼：對方的話裡的什麼，以及你的目標或「懸著的事」中被這個處境觸發的那幾件。一句話，用文字說明是哪一件，不要寫編號（編號寫在 activated）；寫的是動機，不是做法。
- activated：被這個處境觸發的「懸著的事」的編號（例如 "P2"）或目標的 id（例如 "g:3fa1c2d4"）；只是同一個話題但沒有推動你，不算；沒有就給空陣列。
- similar：「過去類似處境的經驗」中，處境與現在本質上是同一類的經驗編號（例如同樣是對方在抒發壓力、同樣是對方在請你推薦）；只是提到相同的人或詞，不算。沒有就給空陣列。
- people：這次涉及的人：對方自己（通常也在場），以及這次的話題實際涉及的人；沒有涉及的人不要列。每個人是 {"who": "稱呼與關係，例如「對方自己」「對方的媽媽」「對方的同事阿明」", "relevant": ["這個人與這次的問題直接有關的事實，取自回憶，每條一句；例如這次是吃東西，就寫飲食上的限制，無關的事不要寫"]}；沒有相關的事實就給空陣列。只涉及對方一個人時只寫對方。
- candidates：剛好 3 個彼此不同的做法。
  - action：用一句話寫你會怎麼做：是做法（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容；不要在這裡列舉具體的事實或細節。
  - kind：${KINDS.join('／')} 之一。
  - prediction：預期對方或結果會怎樣。
  - confidence：0 到 100 的整數，代表你有多傾向這樣做，三個加總為 100。
  - sameAs：「過去類似處境的經驗」中，當時採取的做法與這個做法實質上相同的經驗編號（例如 "E2"）。只是處境相似、或做法相反，都不算；沒有就給空陣列。
  - excluded：想過這個做法的預期後果、過去類似處境的結果，以及你在乎的事之後，是否要把它扣除、不做：true 或 false。至少保留一個不扣除的做法。
  - reason：扣除的理由，一句話；沒有扣除就給空字串。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`
  const withEnergy = energy ? prompt : withoutEnergy(prompt, ['drive', 'activated'])
  const withSubtraction = subtraction ? withEnergy : withoutSubtraction(withEnergy)
  return perPerson ? withSubtraction : withoutPerPerson(withSubtraction)
}

/**
 * 事後比對的提示。energy 關閉時沒有 released、left（勢能的釋放與留下）。
 */
export function outcomeSystem(energy = true): string {
  const prompt = `你是一個人工個體，回頭比對自己上一個決定：當時的預測，和實際發生的事一不一樣。依你自己在乎的事評估結果，不以對方滿不滿意為唯一標準。只輸出一個 JSON 物件，不要任何其他文字：
{"didAction": "...", "didKind": "...", "actual": "...", "matched": "yes", "error": "", "reward": 0, "reason": "...", "lesson": "", "feeling": "", "significance": "daily", "released": [], "left": []}
- didAction：用一句話寫你實際採取的做法；didKind：${KINDS.join('／')} 之一。
- actual：實際發生了什麼：你做了什麼、對方接著怎麼回應。
- matched：結果是否符合你當時的預測：yes／partly／no。
- error：預測與實際的差異；符合就給空字串。
- reward：-1 到 1 之間的數，依你的自我模型與目標，評估這個結果對你而言好不好。
- reason：一句話說明 reward 的理由。
- lesson：如果有值得帶到以後的教訓，寫一句；沒有就給空字串。
- feeling：你對這段經歷的感受，用你自己的話；沒有特別的感受就給空字串。
- significance：這段經歷對你的重要程度：daily（日常）／notable（值得注意）／major（重大）／pivotal（轉折）。
- released：輸入中「懸著的事」裡，這次行動之後被釋放的那幾件：答應的事做到了、等的回答等到了、矛盾解開了、先前的落差想通了，或你決定不再掛心。每條 {"item": "P1", "how": "怎麼釋放的"}；沒有就給空陣列。只是提到、還沒解決的不算。
- left：這一回合**新產生**、會一直掛在你心上、之後會推動你行動的事。輸入中「懸著的事」已經列出的會繼續懸著，不要再寫。一件事寫一條，不要把幾件事寫在同一條；大多數回合沒有，就給空陣列。每條 {"text": "一句話", "type": "promise|waiting|unresolved"}：
  - promise：你答應了對方、或對方託付給你、還沒做到的事（例如答應下次提醒他回覆房東）；
  - waiting：只算兩種：對方明確說之後會告訴你的事，或對方生活中重要事件的結果（例如他下週要動手術）；
  - unresolved：新出現、還沒解開的矛盾或不安。
  - 不算：你問對方、對方還沒回答的問題（例如問他哪裡痠、班表怎麼排）；對方問你的問題（不論你回答了沒有，你都會在對話中回答）；一般的後續。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`
  return energy ? prompt : withoutEnergy(prompt, ['released', 'left'])
}

/** 從提示中拿掉指定的欄位：JSON 範例中的鍵，以及以「- 欄位：」開頭的說明行。 */
function withoutEnergy(prompt: string, fields: readonly string[]): string {
  let out = prompt
  for (const f of fields) {
    out = out.replace(new RegExp(`, "${f}": (?:"[^"]*"|\\[\\])`, 'u'), '')
    out = out
      .split('\n')
      .filter((line) => !line.startsWith(`- ${f}：`))
      .join('\n')
  }
  return out
}

/** 消融（patches/no-perperson.yml）：拿掉「逐一檢查每一個人」與 people 欄位，回到 dev6 以前的寫法；其餘完全相同。 */
export function withoutPerPerson(prompt: string): string {
  return prompt
    .replace(', "people": []', '')
    .split('\n')
    .filter((line) => !line.startsWith('  - 相關的記憶：逐一檢查') && !line.startsWith('- people：'))
    .join('\n')
}

/** 拿掉 RD 的扣除：「扣除不該做的做法」那一句與 excluded、reason 兩個欄位，回到 D15 之前的寫法；其餘完全相同。 */
function withoutSubtraction(prompt: string): string {
  return prompt
    .replace('；再依預測、過去類似處境的結果與你在乎的事，扣除不該做的做法，剩下的才會成為行動。', '，再決定傾向哪一個。')
    .replace(', "excluded": false, "reason": ""', '')
    .split('\n')
    .filter((line) => !line.startsWith('  - excluded：') && !line.startsWith('  - reason：'))
    .join('\n')
}

/** 消融：關閉扣除時丟掉模型仍可能寫出的扣除，選擇回到全部候選中分數最高的。 */
export function withoutExclusions(d: Deliberation): Deliberation {
  return { ...d, candidates: d.candidates.map((c) => ({ action: c.action, kind: c.kind, prediction: c.prediction, confidence: c.confidence, sameAs: c.sameAs })) }
}

export const DELIBERATE_SYSTEM = deliberateSystem(true)

/**
 * D20 第三版：扣除本身會被經驗改變，由模型判斷，但**強制判斷**（使用者 2026-10-30「應該交給模型判斷設計沒問題,
 * 有問題的是沒有作強制要求判斷」）。程式找出需要判斷的扣除（memory.ts 的 exclusionReviews），這個提示要求逐一作答，
 * 答案由 parseJudgments 驗證；缺了就附上缺少的部分再問一次。
 */
export const REVISION_SYSTEM = `你是一個人工個體。你剛才在行動前的思考中扣除了一些做法。扣除本身會被經驗改變：下面列出每一個被扣除的做法，以及類似處境中與它同一類的經驗（當時扣除了同類做法、或做了同類做法，之後發生了什麼、當時的預測有沒有成真）。
對每一個列出的做法，你都必須明確判斷：維持扣除（keep），或依經驗解除扣除（lift）。依你自己的價值與經驗判斷；兩種答案都可以，但不能不判斷。
只輸出一個 JSON 物件，不要任何其他文字：
{"judgments": [{"candidate": 1, "decision": "keep", "why": "一句話", "refs": ["X1"]}]}
- candidate：做法的編號（列表中的數字）。每一個列出的做法剛好一筆。
- decision：keep 或 lift。
- why：一句話的理由，說明你依據哪一次經驗、為什麼這樣判斷。
- refs：你依據的經驗編號（列表中的 X 編號），至少一個。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文。`

/** 判斷不合格時重問一次所附的說明，列出缺少或不合格的部分。 */
export function revisionRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的判斷不完整。每一個列出的做法都要剛好一筆判斷，decision 只能是 keep 或 lift，why 不能是空的，refs 要引用列出的 X 編號。不合格的地方：${problems.join('；')}）`
}

/** 思考的輸出無法解析時，重試一次所附的說明（不同模型照格式的能力不同；插件不能只對某些模型有效）。 */
export const DELIBERATION_RETRY_NOTE = '（重寫一次：上一次的輸出不是完整的 JSON 物件，或缺少 candidates。只輸出一個完整的 JSON 物件，candidates 剛好 3 個做法。）'
export const OUTCOME_SYSTEM = outcomeSystem(true)

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
  /** 模型判定處境本質上相同的過去經驗（rd/decision 事件 id）。 */
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
      ...(c.revised ? { revised: f(c.revised) } : {}),
    })),
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function kindOf(value: unknown): string {
  const k = text(value, 10)
  return (KINDS as readonly string[]).includes(k) ? k : '其他'
}

/**
 * 解析思考結果。labels 把提示中的經驗編號（E1、E2……）對應到 rd/decision 事件 id；
 * 無法辨識的編號直接略過。少於兩個可用的候選時回傳 undefined（呼叫端不做準備，直接讓主模型回應）。
 */
export function parseDeliberation(output: string, labels: ReadonlyMap<string, string>): Deliberation | undefined {
  const obj = extractJson(output)
  if (!obj || !Array.isArray(obj['candidates'])) return undefined
  const ids = (value: unknown) =>
    strings(value, 10, 8)
      .map((label) => labels.get(label.toUpperCase()))
      .filter((id): id is string => id !== undefined)
  const candidates: Candidate[] = []
  for (const raw of obj['candidates'] as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue
    const c = raw as Record<string, unknown>
    const action = text(c['action'], 200)
    if (!action) continue
    const confidence = typeof c['confidence'] === 'number' && Number.isFinite(c['confidence']) ? Math.min(Math.max(c['confidence'], 0), 100) : 0
    const excluded = c['excluded'] === true
    const revised = text(c['revised'], 200)
    candidates.push({
      action,
      kind: kindOf(c['kind']),
      prediction: text(c['prediction'], 300),
      confidence,
      sameAs: ids(c['sameAs']),
      ...(excluded ? { excluded, excludeReason: text(c['reason'], 200) } : {}),
      ...(revised ? { revised } : {}),
    })
    if (candidates.length >= 4) break
  }
  if (candidates.length < 2) return undefined
  return {
    situation: text(obj['situation'], 600),
    drive: text(obj['drive'], 300),
    activated: strings(obj['activated'], 8, 40),
    similar: [...new Set(ids(obj['similar']))],
    people: (Array.isArray(obj['people']) ? (obj['people'] as unknown[]) : []).flatMap((p): Person[] => {
      const person: Person | undefined =
        typeof p === 'string'
          ? { who: text(p, 40), relevant: [] }
          : typeof p === 'object' && p !== null
            ? { who: text((p as Record<string, unknown>)['who'], 40), relevant: strings((p as Record<string, unknown>)['relevant'], 6, 120) }
            : undefined
      return person && person.who ? [person] : []
    }).slice(0, 6),
    candidates,
  }
}

export interface OutcomeJudgement {
  readonly didAction: string
  readonly didKind: string
  readonly actual: string
  readonly matched: 'yes' | 'partly' | 'no'
  readonly error: string
  readonly reward: number
  readonly reason: string
  readonly lesson: string
  /** 對這段經歷的感受（性質 2：經驗評價受 PC 影響；H-M1：情感是被記住的感受）。 */
  readonly feeling: string
  readonly significance: Significance
  /** H-E：釋放了什麼（說明，以及模型寫的編號，由呼叫端轉成 key）、留下了什麼（逐件）。 */
  readonly released: string
  readonly releasedRefs: readonly string[]
  readonly left: readonly { readonly text: string; readonly type: LeftType }[]
}

const LEFT_TYPES: readonly LeftType[] = ['promise', 'waiting', 'unresolved']

/** left 可以是第三版的陣列（[{text, type}]），也可以是第一、二版的一句話（當成一件 unresolved）。 */
function lefts(value: unknown): { text: string; type: LeftType }[] {
  if (typeof value === 'string') return value.trim() ? [{ text: text(value, 300), type: 'unresolved' }] : []
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? { text: text(v, 300), type: 'unresolved' as LeftType } : typeof v === 'object' && v !== null ? { text: text((v as Record<string, unknown>)['text'], 300), type: (LEFT_TYPES as readonly unknown[]).includes((v as Record<string, unknown>)['type']) ? ((v as Record<string, unknown>)['type'] as LeftType) : ('unresolved' as LeftType) } : { text: '', type: 'unresolved' as LeftType }))
    .filter((v) => v.text)
    .slice(0, 6)
}

/** released 可以是新格式的陣列（[{item, how}]），也可以是第一版的一句話。 */
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

/** 解析事後比對；reward 不是有限數值時回傳 undefined（不當成經驗）。 */
export function parseOutcome(output: string): OutcomeJudgement | undefined {
  const obj = extractJson(output)
  if (!obj) return undefined
  const reward = obj['reward']
  if (typeof reward !== 'number' || !Number.isFinite(reward)) return undefined
  const matched = obj['matched'] === 'yes' || obj['matched'] === 'partly' || obj['matched'] === 'no' ? obj['matched'] : 'partly'
  return {
    didAction: text(obj['didAction'], 200),
    didKind: kindOf(obj['didKind']),
    actual: text(obj['actual'], 400),
    matched,
    error: text(obj['error'], 300),
    reward: Math.min(Math.max(reward, -1), 1),
    reason: text(obj['reason'], 300),
    lesson: text(obj['lesson'], 300),
    feeling: text(obj['feeling'], 300),
    significance: (SIGNIFICANCE as readonly string[]).includes(text(obj['significance'], 10)) ? (text(obj['significance'], 10) as Significance) : 'daily',
    released: releases(obj['released']).text,
    releasedRefs: releases(obj['released']).refs,
    left: lefts(obj['left']),
  }
}
