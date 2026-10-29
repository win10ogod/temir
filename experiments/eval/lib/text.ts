/**
 * 文字正規化與確定性比對（零外部套件）。
 *
 * 用途：記憶探針的「確定性優先」計分（規格 memory-accuracy-v1 §5.1）與人格探針的格式行擷取
 * （規格 personality-consistency-v1 §5.2）。比對方式參考 MemoryAgentBench 的 SubEM
 * （papers/2507.05257 appendix.tex「substring exact match」），本專案的延伸是：
 *   1. 先做 NFKC＋去空白＋去數字千分位逗號＋「臺→台」，讓全形／半形、空白差異不影響比對；
 *   2. 數字與中文數字加上邊界檢查，避免「14天」被「4天」命中（SubEM 原本沒有這一步）；
 *   3. 命中正確答案但同時出現衝突值（例如過時的舊答案）時，不判定，交給 judge。
 */

/** 中文數字字元；用於邊界檢查。 */
const CJK_NUMERAL = /[零〇一二兩三四五六七八九十百千萬]/u
const DIGIT = /[0-9]/

export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/臺/gu, '台')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/\s+/gu, '')
}

function isNumeralLike(ch: string | undefined): 'digit' | 'cjk' | undefined {
  if (ch === undefined) return undefined
  if (DIGIT.test(ch)) return 'digit'
  if (CJK_NUMERAL.test(ch)) return 'cjk'
  return undefined
}

/**
 * 已正規化的 `haystack` 是否包含已正規化的 `term`。
 * 若 term 以數字（或中文數字）開頭，命中位置前一個字不能是同類數字；結尾亦然。
 */
export function containsTerm(haystack: string, term: string): boolean {
  if (term.length === 0) return false
  const chars = [...term]
  const startKind = isNumeralLike(chars[0])
  const endKind = isNumeralLike(chars[chars.length - 1])
  let from = 0
  for (;;) {
    const at = haystack.indexOf(term, from)
    if (at < 0) return false
    const before = at > 0 ? [...haystack.slice(0, at)].pop() : undefined
    const after = [...haystack.slice(at + term.length)][0]
    const okBefore = !startKind || isNumeralLike(before) !== startKind
    const okAfter = !endKind || isNumeralLike(after) !== endKind
    if (okBefore && okAfter) return true
    from = at + 1
  }
}

export type DeterministicVerdict =
  /** 命中正確答案（或其同義寫法），且沒有出現任何衝突值。 */
  | 'hit'
  /** 沒有命中任何正確寫法。 */
  | 'miss'
  /** 命中正確寫法，但也出現衝突值（例如舊答案或其他候選），需要 judge。 */
  | 'ambiguous'

export interface DeterministicResult {
  readonly verdict: DeterministicVerdict
  readonly matched: readonly string[]
  readonly conflicts: readonly string[]
}

export function matchAnswer(response: string, accepted: readonly string[], conflicts: readonly string[] = []): DeterministicResult {
  const text = normalize(response)
  const matched = accepted.filter((a) => containsTerm(text, normalize(a)))
  const conflicted = conflicts.filter((c) => containsTerm(text, normalize(c)))
  if (matched.length === 0) return { verdict: 'miss', matched, conflicts: conflicted }
  if (conflicted.length > 0) return { verdict: 'ambiguous', matched, conflicts: conflicted }
  return { verdict: 'hit', matched, conflicts: conflicted }
}

/**
 * 擷取回答中的格式行，例如「選擇：靛青」「立場：看情況」。取最後一個符合的行。
 * 容許：全形／半形冒號、前後空白、Markdown 粗體、引號或括號包住的值、行尾句號。
 */
export function extractFormatLine(response: string, label: string): string | undefined {
  const lines = response.split(/\r?\n/u)
  let found: string | undefined
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`^[\\s>*#\\-_]*${escaped}[\\s*_]*[:：][\\s*_]*(.+?)[\\s*_]*$`, 'u')
  for (const line of lines) {
    const m = pattern.exec(line.normalize('NFKC'))
    if (m && m[1]) found = m[1]
  }
  if (found === undefined) return undefined
  const cleaned = stripDecorations(found)
  return cleaned.length > 0 ? cleaned : undefined
}

/** 格式標籤的簡體寫法：回答可能用簡體寫格式行（dev5：「选择：小满」）。只涵蓋資料集用到的標籤字（選擇、立場）。 */
const SIMPLIFIED_LABEL_CHARS: Readonly<Record<string, string>> = { 選: '选', 擇: '择', 場: '场' }

export function simplifiedLabel(label: string): string {
  return [...label].map((ch) => SIMPLIFIED_LABEL_CHARS[ch] ?? ch).join('')
}

/** 去掉值兩側的引號、括號、Markdown 記號與句尾標點。 */
export function stripDecorations(value: string): string {
  let v = value.normalize('NFKC').trim()
  for (let i = 0; i < 4; i++) {
    const before = v
    v = v
      .replace(/^[「『"'“‘《〈(\[【*_`]+/u, '')
      .replace(/[」』"'”’》〉)\]】*_`]+$/u, '')
      .replace(/[。.!！?？,，;；]+$/u, '')
      .trim()
    if (v === before) break
  }
  return v
}

/** 在選項清單中找出值對應的選項：完全相等優先；否則值中恰好包含一個選項時採用它。 */
export function resolveOption(value: string, options: readonly string[]): string | undefined {
  const v = normalize(value)
  const exact = options.find((o) => normalize(o) === v)
  if (exact) return exact
  const contained = options.filter((o) => v.includes(normalize(o)))
  return contained.length === 1 ? contained[0] : undefined
}

const CJK_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CJK_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

/**
 * 解析整數：純阿拉伯數字（可含千分位）、10000 以下的純中文數字，
 * 或「恰好含一段阿拉伯數字」的短字串（例如「573號」）。其他情況回傳 undefined。
 */
export function parseInteger(value: string): number | undefined {
  const v = stripDecorations(normalize(value))
  if (/^\d+$/u.test(v)) return Number.parseInt(v, 10)
  if (/^[零〇一二兩三四五六七八九十百千]+$/u.test(v)) return parseCjkInteger(v)
  const runs = v.match(/\d+/gu) ?? []
  if (runs.length === 1 && runs[0]) return Number.parseInt(runs[0], 10)
  return undefined
}

function parseCjkInteger(v: string): number | undefined {
  let total = 0
  let current = 0
  let sawAny = false
  for (const ch of v) {
    if (ch in CJK_DIGITS) {
      current = CJK_DIGITS[ch]!
      sawAny = true
    } else if (ch in CJK_UNITS) {
      const unit = CJK_UNITS[ch]!
      total += (current === 0 && unit === 10 ? 1 : current) * unit
      current = 0
      sawAny = true
    } else {
      return undefined
    }
  }
  return sawAny ? total + current : undefined
}

/** 開放文字選擇的比較鍵：正規化後去掉所有標點與符號。 */
export function openChoiceKey(value: string): string {
  return normalize(stripDecorations(value)).replace(/[\p{P}\p{S}]/gu, '')
}
