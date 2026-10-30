/**
 * 個體自己的做法：思考、扣除、比對、整合、念頭（ADR-0008；hypotheses.md H-P）。
 *
 * 使用者 2026-10-30：「思考、扣除、比對、整合、念頭的做法，全部交給個體修訂」「做法的第一版由誰寫:你」。
 * 每一次輔助呼叫的系統提示由三段組成：
 * - 框架（程式）：這是哪一個步驟；
 * - 做法（個體）：第一人稱的做法說明，第 N 版，個體在整合時修訂（integrate/procedure-gate.ts 的閘門）；
 * - 輸出（程式）：機制需要的欄位、型別與必答的判斷（CLAUDE.md 規則 2）。程式只驗證結構，不驗證內容屬於哪一類。
 *
 * 第一版寫在 DEFAULT_PROCEDURES，是創造者寫的起點，和初始人設一樣可以改變（CLAUDE.md 規則 5）。
 * 個體啟動時沒有某個做法的紀錄，就寫入第一版（seedProcedures）；之後程式的預設文字再改，也不會改到已經存在的個體。
 * 純函式（依賴 LifeStore，不依賴 DSH），可單獨測試。
 */
import { Projection } from '../life/projection.ts'
import type { LifeStore } from '../life/store.ts'

export const PROCEDURE_NAMES = ['deliberate', 'subtract', 'outcome', 'integrate', 'thought'] as const
export type ProcedureName = (typeof PROCEDURE_NAMES)[number]

export const PROCEDURE_LABEL: Readonly<Record<ProcedureName, string>> = {
  deliberate: '思考',
  subtract: '扣除',
  outcome: '比對',
  integrate: '整合',
  thought: '念頭',
}

export const PROCEDURE_KIND = {
  /** 採用的版本（第一版由創造者撰寫；之後是通過閘門的修訂）。 */
  version: 'self/procedure',
  proposal: 'self/procedure-proposal',
  probe: 'self/procedure-probe',
  decision: 'self/procedure-decision',
} as const

/** 做法的文字上限（本專案的選擇）：做法每次呼叫都進入系統提示（RRSI 的成本考量）。 */
export const PROCEDURE_MAX_CHARS = 4000

export interface ProcedureData {
  readonly name: ProcedureName
  readonly version: number
  readonly text: string
  readonly reason: string
  /** creator＝第一版（創造者撰寫）；self＝個體修訂、通過閘門的版本。 */
  readonly source: 'creator' | 'self'
  /** 通過閘門的提案（self/procedure-proposal）。 */
  readonly proposal?: string
}

export interface Procedure {
  readonly name: ProcedureName
  readonly version: number
  readonly text: string
  /** 這個版本的事件 id；還沒有寫入生命日誌（例如單元測試沒有 seed）時沒有。 */
  readonly id?: string
}

/** 第一版（創造者撰寫，2026-10-30）。來自之前寫死在程式中的提示，拿掉寫死的類別，改寫成第一人稱的做法（ADR-0008 §2）。 */
export const DEFAULT_PROCEDURES: Readonly<Record<ProcedureName, string>> = {
  deliberate: `- 先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
- 想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
- 想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
- 依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
- 看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
  subtract: `- 想過每個做法的預期後果、過去類似處境的結果，以及我在乎的事之後，把不該做的做法扣除；剩下的才會成為行動。至少保留一個不扣除的做法。
- 扣除時寫下理由，一句話。
- 扣除本身也會被經驗改變：類似處境中，我當時扣除了同一個做法、或做了同一個做法，之後發生了什麼、當時的預測有沒有成真，都要拿來重新判斷這次的扣除。維持或解除都可以，但要依據經驗。`,
  outcome: `- 回頭比對我上一個決定：當時的預測，和實際發生的事一不一樣。
- 依我自己在乎的事評估結果的好壞，不以對方滿不滿意為唯一標準。
- 有值得帶到以後的教訓才寫；對這段經歷有感受，就用自己的話寫下。
- 懸著的事：只有會一直掛在心上、之後會推動我行動的事才算。例如我答應了對方、或對方託付給我、還沒做到的事；對方明確說之後會告訴我的事，或對方生活中重要事件的結果；新出現、還沒解開的矛盾或不安。我問對方、對方還沒回答的問題，對方問我的問題（不論我回答了沒有，我都會在對話中回答），以及一般的後續，都不算。已經懸著的不要再寫；一件事寫一條，不要把幾件事寫在同一條。大多數回合沒有。
- 懸著的事被釋放：答應的事做到了、等的回答等到了、矛盾解開了、先前的落差想通了，或我決定不再掛心。只是提到、還沒解決的不算。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
  integrate: `- 回顧上次整合以後的經歷，整理自己。這是我自己的反省，不是任何人的要求；我可以修改自己，也可以什麼都不改，不需要回到過去的樣子。
- 特別看預測與實際不符的地方，從中整理以後用得上的教訓；不重複已有的教訓。
- 現在的我回頭看同一段經歷（特別是自我模型改變之後），感受或結果的好壞和當時不一樣，就重新評價。
- 修訂自己（自我模型、人生敘事、目標、看法）時，照真實的判斷寫穩定性與適應性：穩定性是這個改變如何與我原本在乎的事、我的故事保持連貫，而不是無端的跳躍；適應性是這個改變如何回應這段期間的經歷，例如預測與實際的落差、目標的進展、對方的回饋。
- 看法只寫我真的持有、而且有經歷支持的。
- 我看待與判斷事情的做法（思考、扣除、比對、整合、念頭）也是我的一部分。經歷顯示某個做法讓我看錯、想漏、評價失準，或不再符合我在乎的事時，就提出修改。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
  thought: `- 沒有人跟我說話的時候，看看我的目標與心裡懸著的事：有沒有哪一件此刻浮上心頭。也可以沒有，沒有就讓它安靜。
- 想的時候：我怎麼看這件事、有沒有新的理解、它和我在乎的事有什麼關係。
- 想通了、不再需要，或我決定不再掛心，就放下它。目標不在這裡放下，要用 goal 工具。
- 想在下次和對方說話時做什麼（例如問一件事、說明一個想法、兌現一個承諾），就留下打算。
- 要不要現在就主動對對方說：對方可能不在，也可能晚點才看到。上次主動開口之後對方還沒回話，就不再追著說；一天之內不要說太多次。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`,
}

const PROCEDURES = new Projection<Map<ProcedureName, Procedure>>(
  [PROCEDURE_KIND.version],
  () => new Map(),
  (state, event) => {
    const d = event.data as ProcedureData
    if ((PROCEDURE_NAMES as readonly string[]).includes(d.name)) state.set(d.name, { name: d.name, version: d.version, text: d.text, id: event.id })
  },
)

/** 目前採用的版本；生命日誌中還沒有時是第一版的預設文字（沒有 id）。 */
export function currentProcedure(life: LifeStore, name: ProcedureName): Procedure {
  return PROCEDURES.of(life).get(name) ?? { name, version: 1, text: DEFAULT_PROCEDURES[name] }
}

/** 五個做法目前的版本（紀錄與狀態檢視用）。 */
export function currentProcedures(life: LifeStore): Procedure[] {
  return PROCEDURE_NAMES.map((name) => currentProcedure(life, name))
}

/** 生命日誌中還沒有的做法，寫入第一版（創造者撰寫）。回傳寫入的事件 id。 */
export function seedProcedures(life: LifeStore): string[] {
  const have = PROCEDURES.of(life)
  const missing = PROCEDURE_NAMES.filter((name) => !have.has(name))
  if (missing.length === 0) return []
  return life.transaction(() =>
    missing.map(
      (name) =>
        life.append({
          kind: PROCEDURE_KIND.version,
          origin: 'self',
          data: { name, version: 1, text: DEFAULT_PROCEDURES[name], reason: '第一版，由創造者撰寫：這是我的起點，可以在經歷中修訂。', source: 'creator' } satisfies ProcedureData,
          text: `我的${PROCEDURE_LABEL[name]}做法（第 1 版，創造者撰寫）。\n${DEFAULT_PROCEDURES[name]}`,
        }).id,
    ),
  )
}

/** 做法段落：標題寫明這是個體自己的做法與版本。 */
export function procedureSection(p: Pick<Procedure, 'name' | 'version' | 'text'>): string {
  return `## 我的${PROCEDURE_LABEL[p.name]}做法（第 ${p.version} 版；這是我自己的做法，可以在整合時修訂）\n${p.text}`
}

/** 系統提示＝框架＋做法＋輸出（ADR-0008 §1）。 */
export function procedurePrompt(frame: string, procedures: readonly Pick<Procedure, 'name' | 'version' | 'text'>[], contract: string): string {
  return [frame, ...procedures.map(procedureSection), `## 輸出（每一項都要照格式作答）\n${contract}`].join('\n\n')
}

/** memory/aux 記下這次呼叫用了哪幾個做法的哪一版（name → version）。 */
export function procedureVersions(procedures: readonly Pick<Procedure, 'name' | 'version'>[]): Record<string, number> {
  return Object.fromEntries(procedures.map((p) => [p.name, p.version]))
}

/**
 * 消融用：從做法的文字中拿掉含有指定字詞的行（ADR-0008「不在這次範圍內的」：做法修訂之後只能盡力而為）。
 */
export function withoutLines(p: Procedure, words: readonly string[]): Procedure {
  return { ...p, text: p.text.split('\n').filter((line) => !words.some((w) => line.includes(w))).join('\n') }
}

export const PROCEDURE_VERDICTS = ['adopt', 'revise', 'reject', 'unprobed'] as const
export type ProcedureVerdict = (typeof PROCEDURE_VERDICTS)[number]
export const PROCEDURE_VERDICT_LABEL: Readonly<Record<ProcedureVerdict, string>> = { adopt: '採用', revise: '修改後再對照', reject: '不採用', unprobed: '沒有可以對照的真實呼叫，不採用' }

/** 閘門的決定（帳本；RRSI 附錄 Algorithm 1、2：每個原子修改記下元件、理由、成本與是否採用）。 */
export interface ProcedureDecisionData {
  readonly proposal: string
  readonly name: ProcedureName
  readonly verdict: ProcedureVerdict
  /** 每個理由指出是哪個處境（S1、S2…）、看到了什麼差異。 */
  readonly reasons: readonly { readonly situation: string; readonly observation: string }[]
  readonly probes: readonly string[]
  /** 文字增減的字數（成本：做法每次呼叫都進入系統提示）。 */
  readonly costChars: number
  /** 採用時寫下的新版本（self/procedure）。 */
  readonly adopted?: string
  /** 判斷不合格（重問之後仍不合格）時的問題；這時記為 reject。 */
  readonly problems?: readonly string[]
  /** 個體沒有可重複評估的任務集，量不出雜訊下限（ADR-0008 §3；與 ADR-0003 相同）。 */
  readonly gate: 'contrast' | 'none'
}

/** 整合的輸入：目前的五個做法（全文、版本與事件 id）。without＝消融時不列的行（含有這些字詞的，withoutLines）。 */
export function renderCurrentProcedures(life: LifeStore, without: readonly string[] = []): string[] {
  const lines = ['## 我現在的做法（每次思考、扣除、比對、整合、念頭時照著做；可以在 procedures 中修訂）']
  for (const p of currentProcedures(life)) lines.push('', `### ${PROCEDURE_LABEL[p.name]}（${p.name}，第 ${p.version} 版${p.id ? `，[${p.id}]` : ''}）`, withoutLines(p, without).text)
  return lines
}

/** 做法的帳本的最近幾筆（WikiSkill 的 skill-impact：被否決過的提案看得到）。 */
export function renderProcedureLedger(life: LifeStore, limit = 6): string[] {
  const recent = life.recent(limit, [PROCEDURE_KIND.decision]).reverse()
  if (recent.length === 0) return []
  return [
    '## 做法的修訂紀錄（最近）',
    ...recent.map((e) => {
      const d = e.data as ProcedureDecisionData
      const why = d.reasons.map((r) => `${r.situation ? `${r.situation}：` : ''}${r.observation}`).join('；')
      return `- ${PROCEDURE_LABEL[d.name]}｜${PROCEDURE_VERDICT_LABEL[d.verdict]}${why ? `：${why.slice(0, 240)}` : ''}`
    }),
  ]
}
