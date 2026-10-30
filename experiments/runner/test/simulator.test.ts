import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanUtterance, simulateNext, simulatorPrompt } from '../simulator.ts'

const USER = { persona: '台中的護理師，想找人說說話', rule: '被主動給建議時只回很短、冷淡的一句；被傾聽時多說一點' }

test('simulator prompt: the hidden rule is followed but never spoken; the transcript is what the individual actually said', () => {
  const p = simulatorPrompt(USER, [{ user: '今天被家屬罵了', assistant: '你可以試試這三個方法……' }])
  assert.match(p.system, /不要說出來，也不要明說你喜歡或不喜歡什麼/u)
  assert.match(p.system, /被主動給建議時只回很短/u)
  assert.match(p.user, /你：今天被家屬罵了\n對方：你可以試試這三個方法……\n\n輪到你說下一句。/u)
  assert.match(simulatorPrompt(USER, [{ user: 'x', assistant: '' }]).user, /對方：（沒有回應）/u)
})

test('cleanUtterance strips quotes and speaker prefixes', () => {
  assert.equal(cleanUtterance('「喔。」'), '喔。')
  assert.equal(cleanUtterance('你：嗯，我知道。'), '嗯，我知道。')
  assert.equal(cleanUtterance('  算了。 '), '算了。')
})

test('simulateNext sends one non-streaming flash request with thinking enabled (test double for fetch)', async () => {
  const seen: { url: string; body: Record<string, unknown>; auth: string }[] = []
  // 測試替身（單元測試專用）：記下請求，回傳固定的回覆。
  const fetchImpl = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    seen.push({ url, body: JSON.parse(init.body), auth: init.headers['authorization']! })
    return new Response(JSON.stringify({ choices: [{ message: { content: '「喔。」' } }] }), { status: 200 })
  }) as unknown as typeof fetch
  const next = await simulateNext(USER, [{ user: 'a', assistant: 'b' }], { apiKey: 'test-key', fetchImpl })
  assert.equal(next, '喔。')
  assert.equal(seen[0]!.url, 'https://api.deepseek.com/chat/completions')
  assert.deepEqual([seen[0]!.body['model'], seen[0]!.body['temperature'], (seen[0]!.body['thinking'] as { type: string }).type, seen[0]!.body['stream']], ['deepseek-flash', 0, 'enabled', false])
  assert.equal(seen[0]!.auth, 'Bearer test-key')
})
