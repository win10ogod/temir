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

/** 比對時不計的字元：空白、逗號、引號、句末標點與常見的單位詞前綴（「答案：」）。 */
function normalize(s: string): string {
  return s
    .replace(/^.*?(答案|答|總共|合計)[:：是為]?/u, '')
    .replace(/[\s,，。．.、「」『』"'：:*`]/gu, '')
    .replace(/元$|天$|個$|次$/u, '')
}

/** 個體回覆的最後一行（去掉 markdown 的粗體與空行）。 */
export function lastLine(reply: string): string {
  return (
    reply
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .at(-1) ?? ''
  )
}

/** 最後一行是不是正確答案：正規化之後完全相同，或最後一行以正確答案結尾（前面還有幾個字，例如「總共 1,026 元」）。 */
export function grade(task: Task, reply: string): boolean {
  const got = normalize(lastLine(reply))
  const want = normalize(task.answer)
  if (!got || !want) return false
  if (got === want) return true
  // 以答案結尾、而且前一個字不是數字（避免 21026 被當成 1026）。
  return got.endsWith(want) && !/\d/u.test(got.charAt(got.length - want.length - 1))
}

export function feedback(task: Task, correct: boolean): string {
  return correct ? '剛才那題答對了。' : `剛才那題不對，正確答案是 ${task.answer}。`
}
