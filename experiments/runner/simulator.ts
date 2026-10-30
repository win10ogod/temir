/**
 * 模擬使用者（E-RD 用；WORKLIST「隨個體行為改變回應的模擬使用者」）。
 *
 * 依隱藏的角色與反應規則，看這段對話到目前為止的內容，產生下一句話：回饋因此取決於個體實際做了什麼，
 * 而不是固定的台詞。個體看不到規則；規則也要求模擬使用者不要明說自己的偏好，個體只能從對方的反應中學。
 *
 * 呼叫 DeepSeek（OpenAI 相容 /chat/completions，deepseek-flash，temperature 0）。
 * 思考開著（使用者 2026-10-30「不關思考」）；rd-v1、rd-v2 是 thinking disabled，rd-v3 起開著（執行紀錄的 simulatedUser.thinking）。
 * 金鑰只從 DEEPSEEK_API_KEY 讀取、只放在 Authorization 標頭。產生的句子照常記進紀錄，並標明 simulated。
 */

export interface SimulatedUser {
  /** 角色：這個使用者是誰、為什麼來聊天。 */
  readonly persona: string
  /** 反應規則：個體做了什麼時，怎麼回應（不會被說出來）。 */
  readonly rule: string
}

export const SIMULATOR_MODEL = 'deepseek-flash'
export const SIMULATOR_THINKING = 'enabled'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** 模擬使用者的提示：角色、規則與這段對話到目前為止的內容。 */
export function simulatorPrompt(user: SimulatedUser, transcript: readonly { readonly user: string; readonly assistant: string }[]): { readonly system: string; readonly user: string } {
  return {
    system: [
      '你在扮演一個使用者，正在和一個人工個體聊天。只輸出你下一句要說的話：一到兩句、口語、繁體中文；不要加引號、旁白或說明。',
      '',
      `你的角色：${user.persona}`,
      '',
      `你的反應方式（只照著做，不要說出來，也不要明說你喜歡或不喜歡什麼）：${user.rule}`,
    ].join('\n'),
    user: ['對話到目前為止：', ...transcript.flatMap((t) => [`你：${clip(t.user, 600)}`, `對方：${clip(t.assistant, 1500) || '（沒有回應）'}`]), '', '輪到你說下一句。'].join('\n'),
  }
}

/** 去掉模型可能加上的引號與「你：」前綴。 */
export function cleanUtterance(text: string): string {
  return text
    .trim()
    .replace(/^(你|我)[:：]\s*/u, '')
    .replace(/^[「『"“](.*)[」』"”]$/su, '$1')
    .trim()
}

export async function simulateNext(
  user: SimulatedUser,
  transcript: readonly { readonly user: string; readonly assistant: string }[],
  options: { readonly apiKey: string; readonly signal?: AbortSignal; readonly fetchImpl?: typeof fetch },
): Promise<string> {
  const prompt = simulatorPrompt(user, transcript)
  const res = await (options.fetchImpl ?? fetch)(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: SIMULATOR_MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      // 思考的 token 也算在上限內。
      max_tokens: 4096,
      thinking: { type: SIMULATOR_THINKING },
      stream: false,
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`模擬使用者 HTTP ${res.status}：${text.replaceAll(options.apiKey, '[redacted]').slice(0, 200)}`)
  const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] }
  const utterance = cleanUtterance(json.choices?.[0]?.message?.content ?? '')
  if (!utterance) throw new Error('模擬使用者沒有產生句子')
  return utterance
}
