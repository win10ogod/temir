/**
 * 字體檢查：輔助呼叫的輸入是繁體中文、輸出卻變成簡體時，呼叫端重試一次。
 *
 * e2e-14：線索理解偶爾把繁體的話擷取成簡體的事實（例如「对方表示刚才的建议不太想听」）。
 * 這些事實進了回憶，再出現在主模型的上下文裡，主模型的回覆也跟著出現簡體字。
 * 只用簡繁一對一、而且在繁體文字中不會出現的常用字判斷（像「松」「准」這類繁體也常用的字不列入），
 * 不做轉換（一對多的字無法可靠轉換）。
 */
const SIMPLIFIED_ONLY = new Set(
  '对说这时们会过还没让为发经验见实给题问应该压烦讲东车长门电开关头觉学习写从动间样进种点话语请谢认识记忆网线业务员产报场数刚议听欢乐爱吗个来边读书买卖钱饭馆医药现传统处决选择岁儿妈爷备忧担虑试谁响严确钟华际双轻旧视剧邻' as string,
)
const TRADITIONAL_ONLY = new Set(
  '對說這時們會過還沒讓為發經驗見實給題問應該壓煩講東車長門電開關頭覺學習寫從動間樣進種點話語請謝認識記憶網線業務員產報場數剛議聽歡樂愛嗎個來邊讀書買賣錢飯館醫藥現傳統處決選擇歲兒媽爺準備憂擔慮試誰響嚴確鐘華際雙輕鬆舊視劇鄰' as string,
)

function count(text: string, set: ReadonlySet<string>): number {
  let n = 0
  for (const ch of text) if (set.has(ch)) n++
  return n
}

/** 文字中的簡體專用字（依出現順序，可重複）；描述性監測用（experiments/eval/lib/script-drift.ts）。 */
export function simplifiedChars(text: string): string[] {
  return [...text].filter((ch) => SIMPLIFIED_ONLY.has(ch))
}

/** 文字看得出是繁體：至少一個繁體專用字、沒有簡體專用字（driftedToSimplified 對輸入的判斷）。 */
export function looksTraditional(text: string): boolean {
  return count(text, TRADITIONAL_ONLY) > 0 && count(text, SIMPLIFIED_ONLY) === 0
}

/** 輸入看得出是繁體（至少一個繁體專用字、沒有簡體專用字），輸出卻有至少 minSimplified 個簡體專用字。 */
export function driftedToSimplified(input: string, output: string, minSimplified = 2): boolean {
  return looksTraditional(input) && count(output, SIMPLIFIED_ONLY) >= minSimplified
}

export const SCRIPT_RETRY_NOTE = '（注意：上一次的輸出用了簡體字。原文是繁體中文，這次所有文字都要用繁體中文。）'
