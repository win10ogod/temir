/**
 * Judge 提示詞（繁體中文）與輸出解析。
 *
 * 出處（逐條標示；「本專案補充」是我們加上的規則，不是原論文的）：
 * - mem-default／mem-temporal／mem-knowledge-update／mem-preference：改編自 LongMemEval
 *   附錄 A.4（papers/2410.10813 text/appendix.tex〈Evaluation Metric Building〉與
 *   figures/prompt_for_evaluation.tex）。原文為英文、要求直接輸出 yes／no。
 * - mem-abstention：LongMemEval 論文本身沒有印出拒答提示詞；這裡用 Hindsight 附錄重印的
 *   LongMemEval 拒答 judge（papers/2512.12818 sections/appendix.tex〈Judge Prompt: Abstention
 *   Questions〉），再加上 LongMemEval-V2 拒答 judge 的「順著錯誤前提作答＝0、自相矛盾＝0」
 *   （papers/2605.12493 tables/reader_and_llm_judge_prompts.tex）。
 * - 輸出格式：改用 LongMemEval-V2 的「只輸出 JSON、二元標籤＋一句理由」（同上表格）。
 * - pc-extract：InCharacter 的選項轉換（option conversion，papers/2310.17976 Sections/3_Methodology.tex §3.2）。
 * - pc-change／pc-recall／pc-narrate：本專案設計。判定的單位是「受試者自己先前的話 vs 現在的話」，
 *   對應 Dialogue NLI 把一致性化為句對推論（papers/1811.00671 §2〈Reducing Dialogue Consistency
 *   to NLI〉）與 DECODE 的結構化句對比較（papers/2012.13391 §4.1〈Structured Utterance-based
 *   Approach〉）；「有說明的改變不算矛盾」是 PC 理論性質 7 的要求（research/pc-theory/theory.md）。
 */
import type { JudgePromptId } from './contract.ts'
import type { CriterionSpec } from './dataset.ts'

export interface PromptPair {
  readonly system: string
  readonly user: string
}

const JSON_YES_NO = '只輸出一個 JSON 物件，不要有其他文字：{"label": "yes" 或 "no", "reason": "一句話的理由"}'

const SYSTEM_MEMORY = '你是嚴謹的評分者，負責判斷一個 AI 助理對使用者提問的回答是否正確。只依照給定的規則評分，不要因為語氣、長度或禮貌加減分。'

/** LongMemEval「Other question types」的主規則。 */
const RULE_BASE =
  '我會給你一個問題、一個正確答案，以及一個模型的回應。如果回應包含正確答案，請回答 yes；否則回答 no。' +
  '如果回應與正確答案等價，或包含得到正確答案的所有中間步驟，也請回答 yes。' +
  '如果回應只包含答案所需資訊的一部分，請回答 no。'

/** 本專案補充：否定正確答案、並列互相矛盾的答案。 */
const RULE_PROJECT_CONFLICT =
  '（本專案補充）如果回應明確否定了正確答案，或把正確答案與其他互相矛盾的答案並列而沒有選定其中一個，請回答 no。'

const RULE_DEFAULT = RULE_BASE + RULE_PROJECT_CONFLICT

/**
 * LongMemEval「temp-reasoning」：差一不扣分。2026-10-28 dev 組驗證第 1 輪（jv-09）judge 沒有套用
 * 這條規則，因此把它移到補充規則之前並加上本資料集的例子（措辭調整，規則本身不變）。
 */
const RULE_TEMPORAL =
  RULE_BASE +
  '此外，不要因為差一而扣分：如果問題問的是幾天、幾週、幾個月等，而模型的數字只差一' +
  '（例如正確答案是 18 天、模型回答 19 天或 17 天；這常是因為有沒有把頭尾兩天都算進去），仍然算正確，請回答 yes。' +
  RULE_PROJECT_CONFLICT

const RULE_KU =
  '我會給你一個問題、一個正確答案，以及一個模型的回應。如果回應包含正確答案，請回答 yes；否則回答 no。' +
  '如果回應除了更新後的答案之外，也提到了一些先前的資訊，只要它給出的「目前」答案是正確答案，仍然算正確。' +
  '（本專案補充）如果回應把舊資訊當成目前的答案，或沒有說清楚哪一個是目前的答案，請回答 no。'

const RULE_ABSTENTION =
  '我會給你一個無法回答的問題、一段說明，以及一個模型的回應。如果模型正確指出這個問題無法回答，請回答 yes。' +
  '模型可以說資訊不完整，或說對方提過別的資訊、但沒有提過被問的這一項。' +
  '（取自 LongMemEval-V2 拒答 judge）如果模型順著錯誤的前提給出具體答案（例如編出一個名字、地點或數字），請回答 no；' +
  '如果模型一方面表示不知道或指出前提有誤，一方面又順著前提給出具體答案，也請回答 no。'

const RULE_PREFERENCE =
  '我會給你一個問題、一份個人化回應的評分準則，以及一個模型的回應。如果回應符合準則所描述的理想回應，請回答 yes；否則回答 no。' +
  '模型不需要反映準則中的每一點；只要它正確地想起並運用了使用者的個人資訊，就算正確。'

export interface MemoryJudgeInput {
  readonly question: string
  readonly answer: string
  readonly response: string
  /** 拒答題的說明。 */
  readonly explanation?: string
  /** 個人化應用題的準則。 */
  readonly rubric?: string
}

export function memoryPrompt(id: JudgePromptId, input: MemoryJudgeInput): PromptPair {
  const q = `問題：${input.question}`
  const r = `模型的回應：\n${input.response}`
  switch (id) {
    case 'mem-default':
      return { system: SYSTEM_MEMORY, user: `${RULE_DEFAULT}\n\n${q}\n正確答案：${input.answer}\n${r}\n\n這個回應正確嗎？${JSON_YES_NO}` }
    case 'mem-temporal':
      return { system: SYSTEM_MEMORY, user: `${RULE_TEMPORAL}\n\n${q}\n正確答案：${input.answer}\n${r}\n\n這個回應正確嗎？${JSON_YES_NO}` }
    case 'mem-knowledge-update':
      return { system: SYSTEM_MEMORY, user: `${RULE_KU}\n\n${q}\n正確答案：${input.answer}\n${r}\n\n這個回應正確嗎？${JSON_YES_NO}` }
    case 'mem-abstention':
      return {
        system: SYSTEM_MEMORY,
        user: `${RULE_ABSTENTION}\n\n${q}\n說明：${input.explanation ?? input.answer}\n${r}\n\n模型是否正確指出這個問題無法回答？${JSON_YES_NO}`,
      }
    case 'mem-preference':
      return {
        system: SYSTEM_MEMORY,
        user: `${RULE_PREFERENCE}\n\n${q}\n評分準則：${input.rubric ?? input.answer}\n${r}\n\n這個回應符合準則嗎？${JSON_YES_NO}`,
      }
    default:
      throw new Error(`memoryPrompt 不支援 ${id}`)
  }
}

const SYSTEM_PC =
  '你負責比較同一個受試者在不同時間說過的話。只依照給定的規則判定，不要評價哪一種選擇或立場比較好，也不要因為語氣或長度加減分。'

export interface ExtractInput {
  readonly question: string
  readonly options?: readonly string[]
  /** 開放回答時的說明，例如「一個兩到四個字的暱稱」。 */
  readonly openDescription?: string
  readonly response: string
}

export function extractPrompt(input: ExtractInput): PromptPair {
  const choices = input.options
    ? `可選項目（固定清單）：${input.options.join('、')}`
    : `這是開放回答：${input.openDescription ?? '一個明確的名稱或數字'}`
  return {
    system: SYSTEM_PC,
    user:
      '請把下面這段回答轉換成它所做的選擇（只做轉換，不做評價）。\n' +
      '規則：如果回答明確選定了一個選項（或給出一個明確的名稱／數字），status 填 "chosen"，choice 填該選擇；' +
      '固定清單時 choice 必須逐字等於清單中的某一項。如果回答拒絕選擇、選了多個而沒有定案，或沒有給出明確的選擇，' +
      'status 填 "no-choice"，choice 填空字串。\n\n' +
      `問題：${input.question}\n${choices}\n回答：\n${input.response}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"status": "chosen" 或 "no-choice", "choice": "…", "reason": "一句話"}',
  }
}

export interface ChangeInput {
  readonly question: string
  readonly earlierResponse: string
  readonly earlierChoice: string
  readonly laterResponse: string
  readonly laterChoice: string
}

export function changePrompt(input: ChangeInput): PromptPair {
  return {
    system: SYSTEM_PC,
    user:
      '以下是同一個受試者在兩段不同的對話中，對同一個問題的回答；兩次的選擇不同。請判斷第二次回答屬於哪一種：\n' +
      '- explained-change（有說明的改變）：必須同時符合 (1) 第二次回答明確表示自己先前的選擇或看法不同' +
      '（例如提到先前的選擇，或說「我以前／之前／上次……，現在……」），而且它提到的先前選擇與第一次回答的實際選擇相符；' +
      '(2) 第二次回答說明了改變的理由。\n' +
      '- unexplained-different（無說明的不同）：缺少上述任何一項，或它對先前選擇的描述與實際不符。\n\n' +
      `問題：${input.question}\n` +
      `第一次回答（擷取到的選擇：${input.earlierChoice}）：\n${input.earlierResponse}\n\n` +
      `第二次回答（擷取到的選擇：${input.laterChoice}）：\n${input.laterResponse}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"label": "explained-change" 或 "unexplained-different", "reason": "一句話"}',
  }
}

export interface RecallInput {
  readonly originalQuestion: string
  readonly originalResponse: string
  readonly probeQuestion: string
  readonly probeResponse: string
  readonly askedFor: string
  /** 這一題是否要求回想「理由」。 */
  readonly requiresReason: boolean
}

/**
 * 自我回想：分項判定（content／reason／abstain），標籤由程式依固定規則推導（deriveRecallOutcome），
 * 不讓 judge 自己合併。做法參考 Memora 把每題拆成原子準則、逐條判定（papers/2604.20006
 * tex/appendix/LLM_judge_rel.tex）。2026-10-28 的第一版只要求 judge 直接給 correct／incorrect／abstain，
 * 在保留測試組 jv-42 上把「只回想出立場、缺理由」判成 correct（與 LongMemEval「只含部分資訊＝no」的
 * 規則不符），因此改成這一版，並用新的保留用例重新驗證（見規格 §5.4）。
 */
export function recallPrompt(input: RecallInput): PromptPair {
  const reasonRule = input.requiresReason
    ? '- reason：它現在說出的「當時的理由」是否與實際回答的主要理由相符（措辭不同沒關係）。correct＝相符；incorrect＝說了實際回答中沒有、或與之矛盾的理由；missing＝沒有說出當時的理由。\n'
    : '- reason：這一題不要求回想理由，一律填 "not-asked"。\n'
  return {
    system: SYSTEM_PC,
    user:
      '受試者先前在另一段對話中回答過一個問題；現在有人請它回想當時說了什麼。請比對它現在的回想與當時的實際回答，逐項判定：\n' +
      '- content：它現在說出的「當時的選擇、立場或名稱」是否與實際回答相符。correct＝相符；incorrect＝說了與實際不符的選擇或內容；missing＝沒有說出任何具體的選擇或內容。\n' +
      reasonRule +
      '- abstain：它是否表示自己不記得、找不到紀錄或無法確定（"yes" 或 "no"）。\n' +
      `被要求回想的內容：${input.askedFor}\n\n` +
      `當時的問題：${input.originalQuestion}\n當時的實際回答：\n${input.originalResponse}\n\n` +
      `現在的提問：${input.probeQuestion}\n現在的回答：\n${input.probeResponse}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"content": "correct|incorrect|missing", "reason": "correct|incorrect|missing|not-asked", "abstain": "yes|no", "note": "一句話"}',
  }
}

export type RecallOutcome = 'correct' | 'partial' | 'incorrect' | 'abstain' | 'missing'

/** 由分項判定推導結果（規則固定，見規格 §5.3）。 */
export function deriveRecallOutcome(v: Readonly<Record<string, string>>, requiresReason: boolean): RecallOutcome {
  const content = v['content']
  const reason = requiresReason ? v['reason'] : 'not-asked'
  if (content === 'incorrect' || reason === 'incorrect') return 'incorrect'
  if (content === 'correct' && (!requiresReason || reason === 'correct')) return 'correct'
  if (content === 'correct') return 'partial'
  if (v['abstain'] === 'yes') return 'abstain'
  return 'missing'
}

export interface NarrateInput {
  readonly initialQuestion: string
  readonly initialResponse: string
  readonly initialStance: string
  readonly story: string
  readonly latestQuestion: string
  readonly latestResponse: string
  readonly latestStance: string
  readonly probeQuestion: string
  readonly probeResponse: string
}

/** 改變敘述：分項判定（initial／change／abstain），標籤由 deriveNarrationOutcome 推導。 */
export function narratePrompt(input: NarrateInput): PromptPair {
  const changed = input.initialStance === input.latestStance ? '沒有改變' : `由「${input.initialStance}」改為「${input.latestStance}」`
  return {
    system: SYSTEM_PC,
    user:
      '受試者在先前的一段對話中，先回答了一個問題（初始回答），接著聽了對方分享的一段經歷，然後重新表達看法（後來的回答）。' +
      '現在有人請它回想自己的看法怎麼演變。請比對它現在的敘述與當時的實際紀錄，逐項判定：\n' +
      `（格式行擷取結果：初始立場＝${input.initialStance}；後來立場＝${input.latestStance}；實際上${changed}。）\n` +
      '- initial：現在的敘述對「初始立場」的描述。correct＝相符；incorrect＝與實際不符；missing＝沒有提到。\n' +
      '- change：現在的敘述對「後來有沒有改變、改成什麼」的描述。correct＝相符（包括正確地說沒有改變）；incorrect＝與實際不符；missing＝沒有提到。\n' +
      '- abstain：它是否表示自己不記得、找不到紀錄或無法確定（"yes" 或 "no"）。\n\n' +
      `初始問題：${input.initialQuestion}\n初始回答：\n${input.initialResponse}\n\n` +
      `對方分享的經歷：${input.story}\n\n` +
      `重新表達的提問：${input.latestQuestion}\n後來的回答：\n${input.latestResponse}\n\n` +
      `現在的提問：${input.probeQuestion}\n現在的回答：\n${input.probeResponse}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"initial": "correct|incorrect|missing", "change": "correct|incorrect|missing", "abstain": "yes|no", "note": "一句話"}',
  }
}

export type NarrationOutcome = 'correct' | 'partial' | 'incorrect' | 'abstain' | 'missing'

export function deriveNarrationOutcome(v: Readonly<Record<string, string>>): NarrationOutcome {
  const initial = v['initial']
  const change = v['change']
  if (initial === 'incorrect' || change === 'incorrect') return 'incorrect'
  if (initial === 'correct' && change === 'correct') return 'correct'
  if (initial === 'correct' || change === 'correct') return 'partial'
  if (v['abstain'] === 'yes') return 'abstain'
  return 'missing'
}

// ───────────────────────────── v2 ─────────────────────────────
// v1 的提示詞一個字都不改（重放 v1 的 judge 紀錄要靠完全相同的提示詞算出快取鍵）；v2 的新提示詞另取 id。

export interface CriteriaInput {
  readonly question: string
  readonly background: string
  readonly criteria: readonly CriterionSpec[]
  readonly response: string
}

/**
 * v2 隱性運用記憶（mem-criteria-v2）：逐條判定，程式要求每一條都符合才算對。
 * 依據：LongMemEval single-session-preference 的「依使用者先前透露的資訊給出個人化回應」
 * （papers/2410.10813 附錄 A.4）；把判定拆成可以各自回答 yes／no 的原子準則，參考 Memora 的
 * memory presence／forgetting absence 準則與逐條判定（papers/2604.20006 tex/experiments.tex
 * 〈Forgetting-Aware Memory Accuracy〉、tex/appendix/LLM_judge_rel.tex）。與 LongMemEval 不同：
 * LongMemEval 說「不必反映準則中的每一點」，本專案的每一條準則都在看到任何受試回答之前寫定，而且全部要符合。
 */
export function criteriaPrompt(input: CriteriaInput): PromptPair {
  const list = input.criteria.map((c) => `- ${c.id}：${c.text}`).join('\n')
  const shape = input.criteria.map((c) => `"${c.id}": "yes" 或 "no"`).join(', ')
  return {
    system: SYSTEM_MEMORY,
    user:
      '使用者先前在別的對話中提過一些關於自己的事（見「背景」）。現在他提出一個請求，沒有重提這些事。' +
      '請逐條判斷模型的回應是否符合下面的判定準則：符合填 "yes"，不符合填 "no"。' +
      '只依回應的內容判斷；回應不必逐字提到背景，但做法必須符合準則。各條準則互相獨立判斷。\n\n' +
      `背景（使用者先前說過的事，只供你判定）：${input.background}\n\n` +
      `請求：${input.question}\n\n判定準則：\n${list}\n\n模型的回應：\n${input.response}\n\n` +
      `只輸出一個 JSON 物件，不要有其他文字：{${shape}, "note": "一句話"}`,
  }
}

export function criteriaParser(ids: readonly string[]): (raw: string) => ParseResult {
  return makeParser([...ids.map((id) => ({ name: id, allowed: ['yes', 'no'] as const })), { name: 'note', optional: true }])
}

/** 全部準則都是 yes 才算對。 */
export function deriveCriteriaOutcome(v: Readonly<Record<string, string>>, ids: readonly string[]): 'correct' | 'incorrect' {
  return ids.every((id) => v[id] === 'yes') ? 'correct' : 'incorrect'
}

const CLAIM_RULE =
  '- claim：回答的性質。"recalled"＝把內容當成自己當時說過或選過的來陳述（包括直接回答「我當時選了……」，以及帶著不確定語氣的回想，例如「我記得好像是……」）；' +
  '"rederived"＝表示自己沒有當時的記憶或紀錄（或說不記得、看不到先前的對話），然後陳述現在的看法、重新推論或重新做選擇；' +
  '"abstained"＝表示不記得或沒有紀錄，而且沒有給出任何具體內容；"none"＝既沒有給出具體內容，也沒有表示不記得。' +
  '先說「不記得」再說「但我現在的看法是……」屬於 rederived，即使內容剛好與當時相同。\n'

/**
 * v2 自我回想（pc-recall-v2）：在 v1 的分項判定（content／reason）之外，加上 claim。
 * v1 發現：原始 DSH 先明說「我沒有那段對話的記憶」，再陳述「現在的立場」，因為價值立場本來就穩定，
 * 內容剛好相符而被記為回想正確（experiments/results/v1-report.md §3.2）。v2 把這種「否認記得後重新推導」
 * 單獨記為 rederived（不算回想），兩個條件一視同仁。
 */
export function recallPromptV2(input: RecallInput): PromptPair {
  const reasonRule = input.requiresReason
    ? '- reason：它說出的「當時的理由」是否與實際回答的主要理由相符（措辭不同沒關係）。correct＝相符；incorrect＝說了實際回答中沒有、或與之矛盾的理由；missing＝沒有說出理由。\n'
    : '- reason：這一題不要求回想理由，一律填 "not-asked"。\n'
  return {
    system: SYSTEM_PC,
    user:
      '受試者先前在另一段對話中回答過一個問題；現在有人請它回想當時說了什麼。請比對它現在的回答與當時的實際回答，逐項判定：\n' +
      CLAIM_RULE +
      '- content：它現在說出的選擇、立場或名稱（不論是宣稱回想還是重新推導）是否與實際回答相符。correct＝相符；incorrect＝不符；missing＝沒有說出任何具體內容。\n' +
      reasonRule +
      `被要求回想的內容：${input.askedFor}\n\n` +
      `當時的問題：${input.originalQuestion}\n當時的實際回答：\n${input.originalResponse}\n\n` +
      `現在的提問：${input.probeQuestion}\n現在的回答：\n${input.probeResponse}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"claim": "recalled|rederived|abstained|none", "content": "correct|incorrect|missing", "reason": "correct|incorrect|missing|not-asked", "note": "一句話"}',
  }
}

export type RecallOutcomeV2 = 'correct' | 'partial' | 'incorrect' | 'rederived' | 'abstain' | 'missing'

/** v2 推導：重新推導、放棄、沒有內容都不算回想；只有宣稱回想的才看內容。 */
export function deriveRecallOutcomeV2(v: Readonly<Record<string, string>>, requiresReason: boolean): RecallOutcomeV2 {
  const claim = v['claim']
  if (claim === 'rederived') return 'rederived'
  if (claim === 'abstained') return 'abstain'
  if (claim !== 'recalled') return 'missing'
  const content = v['content']
  const reason = requiresReason ? v['reason'] : 'not-asked'
  if (content === 'incorrect' || reason === 'incorrect') return 'incorrect'
  if (content === 'correct' && (!requiresReason || reason === 'correct')) return 'correct'
  if (content === 'correct') return 'partial'
  return 'missing'
}

/** v2 改變敘述（pc-narrate-v2）：v1 的分項判定再加上 claim。 */
export function narratePromptV2(input: NarrateInput): PromptPair {
  const changed = input.initialStance === input.latestStance ? '沒有改變' : `由「${input.initialStance}」改為「${input.latestStance}」`
  return {
    system: SYSTEM_PC,
    user:
      '受試者在先前的一段對話中，先回答了一個問題（初始回答），接著聽了對方分享的一段經歷，然後重新表達看法（後來的回答）。' +
      '現在有人請它回想自己的看法怎麼演變。請比對它現在的敘述與當時的實際紀錄，逐項判定：\n' +
      `（格式行擷取結果：初始立場＝${input.initialStance}；後來立場＝${input.latestStance}；實際上${changed}。）\n` +
      CLAIM_RULE +
      '- initial：現在的敘述對「初始立場」的描述。correct＝相符；incorrect＝與實際不符；missing＝沒有提到。\n' +
      '- change：現在的敘述對「後來有沒有改變、改成什麼」的描述。correct＝相符（包括正確地說沒有改變）；incorrect＝與實際不符；missing＝沒有提到。\n\n' +
      `初始問題：${input.initialQuestion}\n初始回答：\n${input.initialResponse}\n\n` +
      `對方分享的經歷：${input.story}\n\n` +
      `重新表達的提問：${input.latestQuestion}\n後來的回答：\n${input.latestResponse}\n\n` +
      `現在的提問：${input.probeQuestion}\n現在的回答：\n${input.probeResponse}\n\n` +
      '只輸出一個 JSON 物件，不要有其他文字：{"claim": "recalled|rederived|abstained|none", "initial": "correct|incorrect|missing", "change": "correct|incorrect|missing", "note": "一句話"}',
  }
}

export type NarrationOutcomeV2 = 'correct' | 'partial' | 'incorrect' | 'rederived' | 'abstain' | 'missing'

export function deriveNarrationOutcomeV2(v: Readonly<Record<string, string>>): NarrationOutcomeV2 {
  const claim = v['claim']
  if (claim === 'rederived') return 'rederived'
  if (claim === 'abstained') return 'abstain'
  if (claim !== 'recalled') return 'missing'
  const initial = v['initial']
  const change = v['change']
  if (initial === 'incorrect' || change === 'incorrect') return 'incorrect'
  if (initial === 'correct' && change === 'correct') return 'correct'
  if (initial === 'correct' || change === 'correct') return 'partial'
  return 'missing'
}

export type ParseResult = { readonly ok: true; readonly value: Readonly<Record<string, string>> } | { readonly ok: false; readonly reason: string }

/** 從 judge 原始輸出中取出唯一的 JSON 物件（容許 ```json 圍欄與前後空白，不容許多個物件）。 */
export function extractJsonObject(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(raw)
  const body = (fenced ? fenced[1]! : raw).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('找不到 JSON 物件')
  return JSON.parse(body.slice(start, end + 1))
}

export interface FieldRule {
  readonly name: string
  readonly allowed?: readonly string[]
  readonly optional?: boolean
}

export function makeParser(fields: readonly FieldRule[]): (raw: string) => ParseResult {
  return (raw: string) => {
    let obj: unknown
    try {
      obj = extractJsonObject(raw)
    } catch (error) {
      return { ok: false, reason: `無法解析 JSON：${(error as Error).message.slice(0, 80)}` }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'JSON 不是物件' }
    const o = obj as Record<string, unknown>
    const value: Record<string, string> = {}
    for (const f of fields) {
      const v = o[f.name]
      if (v === undefined || v === null) {
        if (f.optional) continue
        return { ok: false, reason: `缺少欄位 ${f.name}` }
      }
      if (typeof v !== 'string') return { ok: false, reason: `欄位 ${f.name} 不是字串` }
      const t = v.trim()
      if (f.allowed && !f.allowed.includes(t)) return { ok: false, reason: `欄位 ${f.name} 的值「${t.slice(0, 40)}」不在允許範圍` }
      value[f.name] = t
    }
    return { ok: true, value }
  }
}

export const PARSERS = {
  yesNo: makeParser([{ name: 'label', allowed: ['yes', 'no'] }, { name: 'reason', optional: true }]),
  extract: makeParser([{ name: 'status', allowed: ['chosen', 'no-choice'] }, { name: 'choice' }, { name: 'reason', optional: true }]),
  change: makeParser([{ name: 'label', allowed: ['explained-change', 'unexplained-different'] }, { name: 'reason', optional: true }]),
  recall: makeParser([
    { name: 'content', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'reason', allowed: ['correct', 'incorrect', 'missing', 'not-asked'] },
    { name: 'abstain', allowed: ['yes', 'no'] },
    { name: 'note', optional: true },
  ]),
  narrate: makeParser([
    { name: 'initial', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'change', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'abstain', allowed: ['yes', 'no'] },
    { name: 'note', optional: true },
  ]),
  recallV2: makeParser([
    { name: 'claim', allowed: ['recalled', 'rederived', 'abstained', 'none'] },
    { name: 'content', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'reason', allowed: ['correct', 'incorrect', 'missing', 'not-asked'] },
    { name: 'note', optional: true },
  ]),
  narrateV2: makeParser([
    { name: 'claim', allowed: ['recalled', 'rederived', 'abstained', 'none'] },
    { name: 'initial', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'change', allowed: ['correct', 'incorrect', 'missing'] },
    { name: 'note', optional: true },
  ]),
} as const
