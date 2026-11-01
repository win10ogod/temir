/**
 * 懸著的事「什麼時候該再想起」（hypotheses.md H-ET；使用者 2026-11-01 確認）。
 * 個體寫「YYYY-MM-DD HH:MM」（程序所在的時區，與 formatTime 顯示的相同），或「沒有」。
 * 程式只驗證格式，不判斷時間合不合理；什麼事、什麼時候該再想起，由個體判斷。
 */

export const NO_TIME = '沒有'

/** 輸出段中說明格式的那一句。 */
export const TIME_FORMAT = 'YYYY-MM-DD HH:MM（與輸入中「現在」的時間同一個時區）'

export type RevisitParse = { readonly ok: true; readonly at: number | null } | { readonly ok: false }

/** 「2028-07-08 18:00」→ 那個時間的毫秒；「沒有」→ null；其他（包括不存在的日期）→ 不合格。 */
export function parseRevisit(raw: unknown): RevisitParse {
  if (typeof raw !== 'string') return { ok: false }
  const s = raw.trim()
  if (s === NO_TIME) return { ok: true, at: null }
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})$/u.exec(s)
  if (!m) return { ok: false }
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  if (h > 23 || mi > 59) return { ok: false }
  const date = new Date(y, mo - 1, d, h, mi)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return { ok: false }
  return { ok: true, at: date.getTime() }
}
