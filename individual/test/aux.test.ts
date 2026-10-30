import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { callModel, modelCaller } from '../src/recall/aux.ts'
import { createRecall } from '../src/recall/index.ts'

/**
 * 測試替身（單元測試專用）：只有 llm.prepareCall 的最小 ctx。每次呼叫依序串流一組 chunk（DSH 的 StreamChunk 形狀），
 * 由真的 BlockAssembler 組裝；記下每次的 system 與指定的推理等級。
 */
function fakeLlm(streams: readonly (readonly Record<string, unknown>[])[]) {
  const seen: { system: string; effort: unknown }[] = []
  let n = 0
  const ctx = {
    llm: {
      prepareCall: async (_selection: unknown, _signal: AbortSignal, adjust: (controls: Record<string, unknown>, info: unknown) => Record<string, unknown>) => {
        const controls = adjust({}, { reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }] } })
        const chunks = streams[n++] ?? []
        return {
          config: {},
          stream: async function* (request: { system: string }) {
            seen.push({ system: request.system, effort: controls['reasoningEffort'] })
            yield* chunks
          },
        }
      },
    },
  }
  return { ctx: ctx as never, seen }
}

const ROUTE = { provider: 'deepseek-official', model: 'deepseek-flash' }
const stream = (text: string, usage: Record<string, number> | null, finish: string) => [
  { type: 'reasoning-delta', index: 0, text: '先想一想' },
  { type: 'text-delta', index: 1, text },
  ...(usage ? [{ type: 'usage', usage }] : []),
  { type: 'finish', reason: { kind: finish } },
]

test('callModel records the usage and the finish reason of the stream (test double for the model stream)', async () => {
  const { ctx, seen } = fakeLlm([stream('{"facts":[]}', { inputTokens: 120, outputTokens: 900, cacheReadTokens: 4000, cacheWriteTokens: 0, reasoningTokens: 850 }, 'max-tokens')])
  const r = await callModel(ctx, ROUTE, '系統', '對方說：你好', new AbortController().signal)
  assert.equal(r.output, '{"facts":[]}', 'reasoning is not mixed into the output')
  assert.equal(r.reasoningChars, 4)
  assert.equal(r.effort, 'low')
  assert.equal(seen[0]!.effort, 'low', 'thinking is not turned off')
  assert.deepEqual(r.usage, { inputTokens: 120, outputTokens: 900, cacheReadTokens: 4000, cacheWriteTokens: 0, reasoningTokens: 850 })
  assert.equal(r.finish, 'max-tokens', 'a truncated output can be told apart from a malformed one')
  const none = await callModel(fakeLlm([stream('x', null, 'stop')]).ctx, ROUTE, '系統', '輸入', new AbortController().signal)
  assert.deepEqual([none.usage, none.finish], [null, 'stop'])
})

test('memory/aux records carry the usage and the finish reason', async () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-aux-'))
  const life = LifeStore.open(home)
  try {
    const { ctx } = fakeLlm([stream('{"lasting":[],"facts":["對方叫阿哲"],"keywords":["阿哲"]}', { inputTokens: 300, outputTokens: 40, cacheReadTokens: 1200 }, 'stop')])
    const recall = createRecall({ life, call: modelCaller(ctx), logger: { warn() {}, error() {} } }, { automatic: false })
    await recall.step({ session: 's1', route: ROUTE, cue: '我叫阿哲', messageIds: [], signal: new AbortController().signal })
    const [aux] = life.all('memory/aux')
    const data = aux!.data as { purpose: string; usage: unknown; finish: string; effort: string; reasoningChars: number }
    assert.deepEqual([data.purpose, data.usage, data.finish, data.effort, data.reasoningChars], ['heard', { inputTokens: 300, outputTokens: 40, cacheReadTokens: 1200 }, 'stop', 'low', 4])
    assert.equal(aux!.model, 'deepseek-official/deepseek-flash')
  } finally {
    life.close()
    rmSync(home, { recursive: true, force: true })
  }
})
