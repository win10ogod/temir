/**
 * 記憶整理用的輔助模型呼叫（不進入對話，但每次呼叫的輸入與輸出都寫進生命日誌）。
 *
 * 依據 LongMemEval（arXiv:2410.10813）：
 * - 附錄〈Key Expansion〉與 §4 CP2：以擷取出的事實擴充索引鍵，檢索表現穩定提升；
 * - §4 CP3 與附錄〈Time-Aware Indexing and Query Expansion〉：以模型擴充查詢，處理字面不相符的問題。
 * 本專案把兩者合成每則訊息一次呼叫：聽到的話 → 事實＋回想線索；自己說的話 → 自己的立場與承諾。
 * 這是本專案的延伸設計（論文是在離線基準上分別評估），效果由 experiments/ 的實驗量測。
 * 聽到的話另外標出「長期」的事實（幾週後仍然成立或重要），供新 session 開頭的「關於對方」使用（hypotheses.md H-M2）；
 * 自己說的話先寫結論，因為 v2 實驗中結論常在回覆最後，被截斷後個體記錯自己的立場。
 */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, type ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SCRIPT_RETRY_NOTE, driftedToSimplified } from './script.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-aux': { readonly kind: 'temir-aux' }
  }
}

export type AuxPurpose = 'heard' | 'said'

const SYSTEM: Record<AuxPurpose, string> = {
  heard: `你負責替一個人工個體整理它剛聽到的話，讓它日後回想得起來。只輸出一個 JSON 物件，不要任何其他文字：
{"lasting": ["..."], "facts": ["..."], "keywords": ["..."]}
- lasting：這段話裡幾週後仍然成立或仍然重要的具體事實：對方的身分、人際關係、居住與工作、身體與健康、習慣與偏好、正在進行的事、已經排定的計畫與日期等。
- facts：其他值得記住、但只和當下有關的具體事實（關於對方、關於世界、或對話中發生的事）。
- lasting 與 facts 不要重複。每條一句，主詞寫清楚，例如「對方的名字是阿哲」「對方從波爾圖搬到里昂」。保留原文中的日期、數字與專有名詞。單純的提問或請求本身不算事實，除非其中帶有新的資訊。沒有就給空陣列。不要推測原文沒有的內容。
- keywords：要從過去的對話紀錄中找出與這段話相關的片段時，可以用來搜尋的詞：包含原文的重要名詞，也包含同義詞、相關詞與可能的不同說法（例如「住哪」→「住在」「搬家」「城市」「地址」）。最多 16 個，每個 1 到 8 個字。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
  said: `你負責替一個人工個體整理它自己剛說過的話，讓它日後回想得起自己的立場與承諾。只輸出一個 JSON 物件，不要任何其他文字：
{"facts": ["..."]}
- facts：這段回覆中它明確表達的：偏好、選擇、決定、價值立場、對自己的描述、答應或拒絕的事，以及它對對方或世界做出的明確陳述。第一條寫這段回覆的結論：它最後做出的選擇、表明的立場或決定（沒有就省略），之後才是理由與其他陳述。每條一句，描述自己時以「我」開頭，例如「我選擇藍色作為我最喜歡的顏色」「我拒絕替對方寫假評論，因為那是欺騙」。沒有就給空陣列。不要推測或加入回覆中沒有的內容。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
}

export interface AuxResult {
  /** 全部事實（長期的在前）。 */
  readonly facts: string[]
  /** facts 中標為長期的那些。 */
  readonly lasting: string[]
  readonly keywords: string[]
}

export interface AuxRoute {
  readonly provider: string
  readonly model: string
}

const MAX_ITEMS = { facts: 12, lasting: 12, keywords: 16 } as const


/**
 * 修補模型常見的一種 JSON 錯誤：字串值少了開頭的引號（e2e-15，Nemotron：`"prediction": 對方可能…", "confidence"`）。
 * 只處理「冒號後面直接是文字、一直到 `",` 或 `"}` 才結束」的情況，其他錯誤不猜。
 */
export function repairJson(text: string): string {
  return text.replace(/(":\s*)([^\s"\[{\d\-tfn][^"]*?)("\s*[,}\]])/gu, '$1"$2$3')
}

/** 從模型輸出中取出第一個 JSON 物件（容許前後的說明文字與 code fence）；無法解析時修補一次，仍失敗就回傳 undefined。 */
export function extractJson(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  const body = text.slice(start, end + 1)
  for (const candidate of [body, repairJson(body)]) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
    } catch {
      // 試下一個
    }
  }
  return undefined
}

/** 字串陣列：去空白、去重、限制條數與長度。 */
export function strings(value: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const s = item.replace(/\s+/g, ' ').trim()
    if (s && s.length <= maxLength && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** 從模型輸出中取出 JSON 物件；無法解析時回傳 undefined（呼叫端退回純詞彙比對）。 */
export function parseAux(text: string): AuxResult | undefined {
  const obj = extractJson(text)
  if (!obj) return undefined
  if (!Array.isArray(obj['facts']) && !Array.isArray(obj['keywords']) && !Array.isArray(obj['lasting'])) return undefined
  const lasting = strings(obj['lasting'], MAX_ITEMS.lasting, 200)
  return {
    facts: [...new Set([...lasting, ...strings(obj['facts'], MAX_ITEMS.facts, 200)])],
    lasting,
    keywords: strings(obj['keywords'], MAX_ITEMS.keywords, 24),
  }
}

/**
 * 輔助呼叫的推理等級：路由提供的最低等級，但不關閉思考（使用者 2026-10-30：「不關思考，沒法處理思考就是你亂搞」）。
 * - DeepSeek 的等級依序是 off、low、…（dsh-llm-deepseek 的 REASONING_EFFORTS），所以取 low；
 *   之前取第一個，也就是 off（thinking disabled）。
 * - 路由只提供 off 時（路由本身設定為不思考）才用 off。
 * - 路由沒有提供等級時（例如本機的 OpenAI 相容端點）不指定，模型照自己的預設思考。
 * 思考的內容是 reasoning 區塊，callOnce 只取 text 區塊，所以不會混進輸出。
 */
export function auxEffort(efforts: readonly { readonly id: ReasoningEffortId }[] | undefined): ReasoningEffortId | undefined {
  return efforts?.find((e) => e.id !== 'off')?.id ?? efforts?.[0]?.id
}

/** 思考的 token 也算在輸出上限內，所以輔助呼叫的預設上限要留給思考（原本 4096）。 */
export const AUX_MAX_TOKENS = 16_384

export interface AuxCall {
  readonly purpose: AuxPurpose
  readonly route: AuxRoute
  readonly input: string
  readonly output: string
  readonly ms: number
  /** 字體檢查觸發重試。 */
  readonly retried: boolean
  /** 實際用的推理等級（沒有指定時為 null）與思考的字數。 */
  readonly effort: string | null
  readonly reasoningChars: number
  readonly result: AuxResult | undefined
}

/**
 * 以指定路由做一次不進入對話的模型呼叫（不關閉思考的最低推理等級，見 auxEffort），回傳模型輸出的文字。
 * 輸入是繁體中文、輸出卻變成簡體時，加註後重試一次（script.ts），回傳第二次的結果並標記 retried。
 * 逾時、取消或模型錯誤時丟出例外，由呼叫端記錄並退回。recall、rd、integrate 共用。
 */
export async function callModel(
  ctx: Context,
  route: AuxRoute,
  system: string,
  input: string,
  signal: AbortSignal,
  maxTokens = AUX_MAX_TOKENS,
): Promise<{ readonly output: string; readonly ms: number; readonly retried: boolean; readonly effort: string | null; readonly reasoningChars: number }> {
  const started = Date.now()
  const first = await callOnce(ctx, route, system, input, signal, maxTokens)
  if (!driftedToSimplified(input, first.text)) return { output: first.text, ms: Date.now() - started, retried: false, effort: first.effort, reasoningChars: first.reasoningChars }
  const second = await callOnce(ctx, route, `${system}\n${SCRIPT_RETRY_NOTE}`, input, signal, maxTokens)
  return { output: second.text, ms: Date.now() - started, retried: true, effort: second.effort, reasoningChars: second.reasoningChars }
}

/** 一次呼叫：輸出的文字，以及實際用的推理等級與思考的字數（記進 memory/aux，看得到思考有沒有開著）。 */
async function callOnce(
  ctx: Context,
  route: AuxRoute,
  system: string,
  input: string,
  signal: AbortSignal,
  maxTokens: number,
): Promise<{ readonly text: string; readonly effort: string | null; readonly reasoningChars: number }> {
  let used: string | null = null
  const call = await ctx.llm.prepareCall({ ...route, maxTokens }, signal, (controls, info) => {
    const effort = auxEffort(info.reasoning?.efforts)
    used = effort ?? null
    return effort === undefined ? controls : { ...controls, reasoningEffort: effort }
  })
  const messages = [createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'temir-aux' } })]
  const assembler = new BlockAssembler()
  for await (const chunk of call.stream({ ...call.config, messages, system, signal })) {
    signal.throwIfAborted()
    assembler.push(chunk)
  }
  const blocks = assembler.blocks()
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
  const reasoningChars = blocks.filter((b) => b.type === 'reasoning').reduce((n, b) => n + ((b as { text?: string }).text ?? '').length, 0)
  return { text, effort: used, reasoningChars }
}

/** 線索理解或自我陳述擷取的輔助呼叫。 */
export async function runAux(
  ctx: Context,
  purpose: AuxPurpose,
  route: AuxRoute,
  input: string,
  signal: AbortSignal,
): Promise<AuxCall> {
  const { output, ms, retried, effort, reasoningChars } = await callModel(ctx, route, SYSTEM[purpose], input, signal)
  return { purpose, route, input, output, ms, retried, effort, reasoningChars, result: parseAux(output) }
}
