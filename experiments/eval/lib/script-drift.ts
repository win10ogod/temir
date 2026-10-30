/**
 * 繁簡漂移的描述性監測（改進清單第 11 項）：回覆偶爾出現簡體字（例如「运行」「难受」）。
 * 對 records.jsonl 的每一回合（對方的話 → 回覆）計數，只輸出描述表，不計入任何驗收。
 * 判斷用個體的字體檢查（individual/src/recall/script.ts）：只看簡繁一對一、繁體文字中不會出現的常用字，不做轉換。
 * 那份字表沒有清單引用的「运」「难」，所以監測另加一份補充字表（SUPPLEMENT；只用於這裡的計數，不影響個體的字體檢查）。
 * 「依字體檢查的門檻」一欄只用原本的字表與門檻（driftedToSimplified），看得到檢查漏掉多少。
 * 注意：個體的字體檢查只用在輔助呼叫（recall/aux.ts 的 callModel）；這裡量的是主模型的回覆，它不會被重試。
 * 這裡只是量測：不得因此在處境描述或任何提示中加入語言指示。
 */
import { driftedToSimplified, looksTraditional, simplifiedChars } from '../../../individual/src/recall/script.ts'

/** 補充字表：簡繁一對一、繁體文字中不會出現的常用簡體字（運難討論節連氣計絡換辦轉緊張），script.ts 的字表沒有。 */
export const SUPPLEMENT = new Set('运难讨论节连气计络换办转紧张')

/** 簡體專用字：個體字體檢查的字表加上補充字表。 */
export function monitoredChars(text: string): string[] {
  const own = new Set(simplifiedChars(text))
  return [...text].filter((ch) => own.has(ch) || SUPPLEMENT.has(ch))
}

export interface DriftTurn {
  readonly user: string
  readonly assistant: string
}

export interface DriftRow {
  readonly label: string
  /** 有回覆的回合數。 */
  readonly turns: number
  /** 對方的話看得出是繁體的回合數（漂移只在這些回合中算）。 */
  readonly traditionalInput: number
  /** 回覆中至少有一個簡體專用字（含補充字表）的回合數。 */
  readonly anySimplified: number
  /** 依個體字體檢查的字表與門檻（至少 2 個）會判為漂移的回合數（主模型的回覆不經過這個檢查，只是對照）。 */
  readonly drifted: number
  /** 簡體專用字的總數，以及出現最多的字（字：次數）。 */
  readonly chars: number
  readonly top: readonly (readonly [string, number])[]
}

export function driftRow(label: string, turns: readonly DriftTurn[], top = 8): DriftRow {
  const counts = new Map<string, number>()
  let n = 0
  let traditionalInput = 0
  let anySimplified = 0
  let drifted = 0
  for (const t of turns) {
    if (!t.assistant.trim()) continue
    n++
    if (!looksTraditional(t.user)) continue
    traditionalInput++
    const found = monitoredChars(t.assistant)
    if (found.length > 0) anySimplified++
    if (driftedToSimplified(t.user, t.assistant)) drifted++
    for (const ch of found) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  // 同次數時依碼位排序（不依地區設定，結果在每台機器上相同）。
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return { label, turns: n, traditionalInput, anySimplified, drifted, chars: sorted.reduce((s, [, c]) => s + c, 0), top: sorted.slice(0, top) }
}

export function renderDrift(rows: readonly DriftRow[]): string {
  const lines = ['| 紀錄 | 有回覆的回合 | 對方是繁體 | 回覆有簡體字 | 依字體檢查的門檻 | 簡體字數 | 最常見 |', '|---|---|---|---|---|---|---|']
  for (const r of rows) lines.push(`| ${r.label} | ${r.turns} | ${r.traditionalInput} | ${r.anySimplified} | ${r.drifted} | ${r.chars} | ${r.top.map(([ch, c]) => `${ch}×${c}`).join(' ') || '—'} |`)
  lines.push('', '（描述性指標，不計入驗收；只比對簡繁一對一的常用字：individual/src/recall/script.ts 的字表加上監測用的補充字表。）')
  return lines.join('\n')
}
