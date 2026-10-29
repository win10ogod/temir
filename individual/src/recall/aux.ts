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

function strings(value: unknown, max: number, maxLength: number): string[] {
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
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj['facts']) && !Array.isArray(obj['keywords']) && !Array.isArray(obj['lasting'])) return undefined
  const lasting = strings(obj['lasting'], MAX_ITEMS.lasting, 200)
  return {
    facts: [...new Set([...lasting, ...strings(obj['facts'], MAX_ITEMS.facts, 200)])],
    lasting,
    keywords: strings(obj['keywords'], MAX_ITEMS.keywords, 24),
  }
}

/** 選模型可用的最低推理等級；沒有推理等級的模型維持原設定。 */
function lowestEffort(efforts: readonly { readonly id: ReasoningEffortId }[] | undefined): ReasoningEffortId | undefined {
  return efforts?.[0]?.id
}

export interface AuxCall {
  readonly purpose: AuxPurpose
  readonly route: AuxRoute
  readonly input: string
  readonly output: string
  readonly ms: number
  readonly result: AuxResult | undefined
}

/**
 * 以目前的模型路由做一次輔助呼叫。逾時、取消或模型錯誤時丟出例外，由呼叫端記錄並退回。
 */
export async function runAux(
  ctx: Context,
  purpose: AuxPurpose,
  route: AuxRoute,
  input: string,
  signal: AbortSignal,
): Promise<AuxCall> {
  const started = Date.now()
  const call = await ctx.llm.prepareCall({ ...route, maxTokens: 4096 }, signal, (controls, info) => {
    const effort = lowestEffort(info.reasoning?.efforts)
    return effort === undefined ? controls : { ...controls, reasoningEffort: effort }
  })
  const messages = [createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'temir-aux' } })]
  const assembler = new BlockAssembler()
  for await (const chunk of call.stream({ ...call.config, messages, system: SYSTEM[purpose], signal })) {
    signal.throwIfAborted()
    assembler.push(chunk)
  }
  const output = assembler
    .blocks()
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
  return { purpose, route, input, output, ms: Date.now() - started, result: parseAux(output) }
}
