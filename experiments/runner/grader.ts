/**
 * 有對錯的任務的評分與回饋（實驗基礎設施，不屬於個體；cogrow-v1）。
 *
 * 資料集的歷史可以寫 `tasks`（每題的問題與正確答案）。執行器依序問，個體每答一題，就以這裡的規則評分，
 * 回饋接在下一題之前（「剛才那題答對了。」或「剛才那題不對，正確答案是 X。」），最後一題的回饋單獨成一句。
 * 回饋是確定性的、只依個體自己的回答，這是外部回饋（E），個體能不能從中學到東西，是要觀察的。
 */

export interface Task {
  readonly q: string
  readonly answer: string
}

/**
 * 比對時不計的字元：空白、千分位逗號、引號、markdown、句末標點、常見的前綴（「答案：」），以及答案後面的括號註記。
 * 括號註記：cogrow-v1 中「384 元（暫算，店裡算法未確認）」數字是對的，原本被判錯，個體收到了錯的回饋（報告 cogrow-v1-report.md）。
 * 小數點不去掉（code review 2026-11-01：原本「3.5」會等於「35」）。
 */
function normalize(s: string): string {
  return s
    .replace(/\s*[（(][^（）()]*[）)]\s*$/u, '')
    .replace(/^.*?(答案|答|總共|合計)[:：是為]?/u, '')
    .replace(/(?<=\d)[,，](?=\d{3})/gu, '')
    .replace(/[\s「」『』"'：:*`]/gu, '')
    .replace(/[。．.、，,]+$/u, '')
}

/** 個體回覆的最後一行（去掉空行）。 */
export function lastLine(reply: string): string {
  return (
    reply
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .at(-1) ?? ''
  )
}

const NUMBER = /\d+(?:\.\d+)?/gu

/**
 * 最後一行是不是正確答案。
 * - 數字答案：最後一行（去掉括號註記）只有一個數字，而且就是正確答案；前後可以有幾個字（「總共 1,026 元」）。
 *   兩個以上的數字不算（code review 2026-11-01：「答案是 1,026 元，不是 2,026」原本會被當成 2026）。
 * - 其他答案：正規化之後完全相同。
 */
export function grade(task: Task, reply: string): boolean {
  const got = normalize(lastLine(reply))
  const want = normalize(task.answer)
  if (!got || !want) return false
  if (/^\d+(?:\.\d+)?$/u.test(want)) {
    const numbers = got.match(NUMBER) ?? []
    return numbers.length === 1 && numbers[0] === want
  }
  return got === want
}

export function feedback(task: Task, correct: boolean): string {
  return correct ? '剛才那題答對了。' : `剛才那題不對，正確答案是 ${task.answer}。`
}
