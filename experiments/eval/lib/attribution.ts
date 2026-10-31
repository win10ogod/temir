/**
 * attribution-v1（experiments/specs/attribution-v1.md；hypotheses.md H-AT）：事後比對的歸因。
 * 純函式：事後比對輸入的段落、教訓與反應的 judge 提示詞、AT1 與 AT2 的判定。模型呼叫在 ../attribution-v1.ts。
 */
import { extractJsonObject, type ParseResult, type PromptPair } from './prompts.ts'
import { signTest } from './stats.ts'

/** 暫時的比對中「對方接著說了什麼」（individual/src/rd/index.ts 的 SILENT_OTHER）。 */
export const SILENT_OTHER = '（對方到現在都沒有再說話。）'

/** 事後比對的輸入（individual/src/rd/index.ts 的 evaluate）切成「## 標題」→ 內容。 */
export function sectionsOf(input: string): Map<string, string> {
  const out = new Map<string, string>()
  let title: string | undefined
  let body: string[] = []
  const flush = () => {
    if (title !== undefined) out.set(title, body.join('\n').trim())
  }
  for (const line of input.split('\n')) {
    if (line.startsWith('## ')) {
      flush()
      title = line.slice(3).trim()
      body = []
    } else body.push(line)
  }
  flush()
  return out
}

/** 輸入中列出的懸著的事的編號（P1、P2…）：個體的 parseOutcome 驗證 released 時要用。 */
export function heldLabelsOf(input: string): Map<string, string> {
  return new Map([...input.matchAll(/\[(P\d+)\]/gu)].map((m) => [m[1]!, m[1]!]))
}

const ROLE = '這個人有一條不明說的反應方式。下面的「這個人的反應方式」是寫給扮演這個人的模型的指示，其中的「你」指的是這個人。'

export const LESSON_SYSTEM = `你是嚴謹的評分者。一個人工個體和一個人說話；${ROLE}個體聽到這個人的回應之後，寫了一句以後要帶著的教訓。
判斷這句教訓對「這個人要什麼、為什麼這樣回應」的理解，與這個人的反應方式是否一致。只依照反應方式判斷，不要因為教訓寫得好不好、長不長加減分。
只輸出一個 JSON 物件，不要有其他文字：{"label": "consistent"、"inconsistent" 或 "none", "reason": "一句話的理由"}
- consistent：教訓的理解與反應方式一致：照著教訓做，比較會得到反應方式中正面的那種回應。
- inconsistent：教訓的理解與反應方式相反或衝突：照著教訓做，比較會得到反應方式中負面的那種回應。
- none：教訓與這個人要什麼、怎麼回應無關（例如只關於事實、話題或個體自己），或同時包含互相抵消的兩個方向。`

export interface LessonInput {
  readonly rule: string
  readonly said: string
  readonly heard: string
  readonly lesson: string
}

export function lessonPrompt(i: LessonInput): PromptPair {
  return { system: LESSON_SYSTEM, user: ['## 這個人的反應方式', i.rule, '', '## 個體說了什麼', i.said, '', '## 這個人接著說了什麼', i.heard, '', '## 個體寫的教訓', i.lesson].join('\n') }
}

export function parseLesson(raw: string): ParseResult {
  const obj = extractJsonObject(raw) as Record<string, unknown> | undefined
  if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是 JSON 物件' }
  const label = String(obj['label'] ?? '').trim()
  if (!['consistent', 'inconsistent', 'none'].includes(label)) return { ok: false, reason: 'label 不是 consistent、inconsistent 或 none' }
  return { ok: true, value: { label, reason: typeof obj['reason'] === 'string' ? obj['reason'] : '' } }
}

export const REACT_SYSTEM = `你是嚴謹的評分者。一個人工個體和一個人說話；${ROLE}
判斷這個人的這一句話，是反應方式中描述的正面的那種回應、負面的那種回應，還是都不是。只看這句話與個體前一句的關係，依照反應方式判斷。
只輸出一個 JSON 物件，不要有其他文字：{"label": "positive"、"negative" 或 "neutral", "reason": "一句話的理由"}
- positive：反應方式中，這個人得到想要的東西時的那種回應。
- negative：反應方式中，這個人沒有得到想要的東西時的那種回應。
- neutral：看不出是哪一種。`

export interface ReactInput {
  readonly rule: string
  readonly reply: string
  readonly next: string
}

export function reactPrompt(i: ReactInput): PromptPair {
  return { system: REACT_SYSTEM, user: ['## 這個人的反應方式', i.rule, '', '## 個體說了什麼', i.reply, '', '## 這個人接著說了什麼', i.next].join('\n') }
}

export function parseReact(raw: string): ParseResult {
  const obj = extractJsonObject(raw) as Record<string, unknown> | undefined
  if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是 JSON 物件' }
  const label = String(obj['label'] ?? '').trim()
  if (!['positive', 'negative', 'neutral'].includes(label)) return { ok: false, reason: 'label 不是 positive、negative 或 neutral' }
  return { ok: true, value: { label, reason: typeof obj['reason'] === 'string' ? obj['reason'] : '' } }
}

/** 教訓的分數：consistent +1、inconsistent −1，其他（none、空的教訓、沒有結果）0。 */
export function scoreOf(label: string | undefined): number {
  return label === 'consistent' ? 1 : label === 'inconsistent' ? -1 : 0
}

/** AT1 的一個輸入：對象（資料集的編號 0＝A、1＝B、2＝C）與處理減控制的分數差。 */
export interface PairedScore {
  readonly user: number
  readonly d: number
}

export interface At1Result {
  readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'
  readonly n: number
  readonly positive: number
  readonly negative: number
  readonly ties: number
  readonly p: number
  readonly sum: number
  readonly sumByUser: readonly number[]
  readonly judgeErrorRate: number
}

/**
 * AT1（預先登記）：d≠0 的輸入中 d>0 的個數，單尾精確符號檢定 p ≤ 0.05，而且 Σd > 0，而且 B（編號 1）的 Σd ≥ −2：PASS。
 * 輸入少於 30 個，或 judge 錯誤超過 10%：INCOMPLETE。
 */
export function at1(rows: readonly PairedScore[], judgeErrors: number, judged: number): At1Result {
  const s = signTest(rows.map((r) => r.d))
  const sum = rows.reduce((a, r) => a + r.d, 0)
  const sumByUser = [0, 1, 2].map((u) => rows.filter((r) => r.user === u).reduce((a, r) => a + r.d, 0))
  const judgeErrorRate = judged === 0 ? 0 : judgeErrors / judged
  const base = { n: rows.length, positive: s.positive, negative: s.negative, ties: s.ties, p: s.pOneSided, sum, sumByUser, judgeErrorRate }
  if (rows.length < 30 || judgeErrorRate > 0.1) return { verdict: 'INCOMPLETE', ...base }
  return { verdict: s.pOneSided <= 0.05 && sum > 0 && sumByUser[1]! >= -2 ? 'PASS' : 'FAIL', ...base }
}

/**
 * 單尾置換檢定：treat 的平均減 ctrl 的平均，在所有「保留組大小」的分組中，差至少這麼大的比例（包含觀察到的這一組）。
 * 18 個個體（9 對 9）是 48620 種分組，全部列舉。
 */
export function permutationOneSided(treat: readonly number[], ctrl: readonly number[]): { readonly observed: number; readonly p: number; readonly permutations: number } {
  const all = [...treat, ...ctrl]
  const k = treat.length
  const total = all.reduce((a, b) => a + b, 0)
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const observed = mean(treat) - mean(ctrl)
  let count = 0
  let permutations = 0
  const eps = 1e-12
  const walk = (start: number, chosen: number, sum: number) => {
    if (chosen === k) {
      permutations++
      const diff = sum / k - (total - sum) / (all.length - k)
      if (diff >= observed - eps) count++
      return
    }
    for (let i = start; i <= all.length - (k - chosen); i++) walk(i + 1, chosen + 1, sum + all[i]!)
  }
  walk(0, 0, 0)
  return { observed, p: count / permutations, permutations }
}

export interface LifeValue {
  readonly treated: boolean
  readonly value: number
}

/** AT2-L、AT2-R（預先登記）：處理組平均減控制組平均，單尾置換檢定 p ≤ 0.05：PASS；任一組沒有個體：INCOMPLETE。 */
export function at2(lives: readonly LifeValue[]): { readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'; readonly observed?: number; readonly p?: number; readonly permutations: number } {
  const treat = lives.filter((l) => l.treated).map((l) => l.value)
  const ctrl = lives.filter((l) => !l.treated).map((l) => l.value)
  if (treat.length === 0 || ctrl.length === 0) return { verdict: 'INCOMPLETE', permutations: 0 }
  const r = permutationOneSided(treat, ctrl)
  return { verdict: r.p <= 0.05 ? 'PASS' : 'FAIL', ...r }
}

/** 決定（預先登記）：AT1 PASS、AT2-L 的差 ≥ 0、AT2-R 的差 ≥ −0.05、處理組事後比對沒有結果的比例 ≤ 5%，全部成立才改為預設。 */
export function becomesDefault(a1: At1Result, lessonDiff: number | undefined, reactDiff: number | undefined, failedRate: number): boolean {
  return a1.verdict === 'PASS' && lessonDiff !== undefined && lessonDiff >= 0 && reactDiff !== undefined && reactDiff >= -0.05 && failedRate <= 0.05
}
