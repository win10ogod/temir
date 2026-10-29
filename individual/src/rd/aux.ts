/**
 * RD 階段的輔助呼叫：行動前的思考與準備、事後比對（hypotheses.md H0；ADR-0002 D2）。
 *
 * 兩個呼叫都以個體目前的模型路由、最低推理等級進行，輸入與輸出寫進生命日誌。
 * 處境描述用固定欄位：JitRL method.tex〈State Construction〉把原始狀態抽象成精簡的結構化狀態、去掉無關細節，
 * 原則是「功能相同的處境映射到相似的表示」。e2e-13 中自由文字的處境混入個體自身狀態的套話，
 * 兩次相似的傾訴相似度只有 0.15–0.23。
 * 候選行動附 0–100 的口述信心，依 JitRL 論文 experiments.tex〈Verbalized Logit〉與 appendix.tex 的 Jericho
 * 行動產生提示（「For EACH action, provide your confidence as an integer from 0 to 100」「sum … MUST equal 100」）。
 */
import { extractJson, strings } from '../recall/aux.ts'
import { SIGNIFICANCE, type Significance } from '../self/state.ts'
import type { Candidate } from './jitrl.ts'

export const KINDS = ['回答', '提問', '建議', '拒絕', '使用工具', '表達感受', '其他'] as const

export const DELIBERATE_SYSTEM = `你是一個人工個體，在回應之前先思考與準備：理解眼前的處境，想出幾個可能的做法，預測各自的後果，再決定傾向哪一個。依你自己的價值、目標與經驗判斷；你可以照對方的要求做，也可以提問、表達不同意或拒絕。只輸出一個 JSON 物件，不要任何其他文字：
{"situation": "...", "drive": "...", "similar": [], "candidates": [{"action": "...", "kind": "...", "prediction": "...", "confidence": 50, "sameAs": []}]}
- situation：用固定的格式描述眼前的處境，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不要寫你自己的紀錄有多少、有沒有自我模型這類與處境無關的事。
- drive：此刻推動你行動的是什麼：對方的話裡的什麼，以及你的目標或「懸著的事」中被這個處境觸發的（有的話寫出是哪一件）。一句話；寫的是動機，不是做法。
- similar：「過去類似處境的經驗」中，處境與現在本質上是同一類的經驗編號（例如同樣是對方在抒發壓力、同樣是對方在請你推薦）；只是提到相同的人或詞，不算。沒有就給空陣列。
- candidates：剛好 3 個彼此不同的做法。
  - action：用一句話寫你會怎麼做：是做法（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容；不要在這裡列舉具體的事實或細節。
  - kind：${KINDS.join('／')} 之一。
  - prediction：預期對方或結果會怎樣。
  - confidence：0 到 100 的整數，代表你有多傾向這樣做，三個加總為 100。
  - sameAs：「過去類似處境的經驗」中，當時採取的做法與這個做法實質上相同的經驗編號（例如 "E2"）。只是處境相似、或做法相反，都不算；沒有就給空陣列。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export const OUTCOME_SYSTEM = `你是一個人工個體，回頭比對自己上一個決定：當時的預測，和實際發生的事一不一樣。依你自己在乎的事評估結果，不以對方滿不滿意為唯一標準。只輸出一個 JSON 物件，不要任何其他文字：
{"didAction": "...", "didKind": "...", "actual": "...", "matched": "yes", "error": "", "reward": 0, "reason": "...", "lesson": "", "feeling": "", "significance": "daily", "released": "", "left": ""}
- didAction：用一句話寫你實際採取的做法；didKind：${KINDS.join('／')} 之一。
- actual：實際發生了什麼：你做了什麼、對方接著怎麼回應。
- matched：結果是否符合你當時的預測：yes／partly／no。
- error：預測與實際的差異；符合就給空字串。
- reward：-1 到 1 之間的數，依你的自我模型與目標，評估這個結果對你而言好不好。
- reason：一句話說明 reward 的理由。
- lesson：如果有值得帶到以後的教訓，寫一句；沒有就給空字串。
- feeling：你對這段經歷的感受，用你自己的話；沒有特別的感受就給空字串。
- significance：這段經歷對你的重要程度：daily（日常）／notable（值得注意）／major（重大）／pivotal（轉折）。
- released：這次行動之後，你的目標或「懸著的事」中有沒有哪件被釋放了：目標有了進展或完成、矛盾解開了、先前的落差想通了。寫出是哪件、怎麼釋放的；沒有就給空字串。
- left：這次行動有沒有留下新的懸念：答應了對方、還沒做的事；沒有把握的判斷；新出現的矛盾。一句話；沒有就給空字串。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export interface Deliberation {
  readonly situation: string
  /** 動能（H-E）：此刻推動這次行動的是什麼；模型沒有寫就是空字串。 */
  readonly drive: string
  /** 模型判定處境本質上相同的過去經驗（rd/decision 事件 id）。 */
  readonly similar: readonly string[]
  readonly candidates: readonly Candidate[]
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
    candidates.push({ action, kind: kindOf(c['kind']), prediction: text(c['prediction'], 300), confidence, sameAs: ids(c['sameAs']) })
    if (candidates.length >= 4) break
  }
  if (candidates.length < 2) return undefined
  return { situation: text(obj['situation'], 600), drive: text(obj['drive'], 300), similar: [...new Set(ids(obj['similar']))], candidates }
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
  /** H-E：釋放了什麼、留下了什麼。 */
  readonly released: string
  readonly left: string
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
    released: text(obj['released'], 300),
    left: text(obj['left'], 300),
  }
}
