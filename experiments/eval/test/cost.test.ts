import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auxUsage, costOf, modelKey, normalizeUsage, PRICES, recordUsage, renderCost, summarize, type Tokens } from '../lib/cost.ts'

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12

test('normalizeUsage: DSH TokenUsage and the OpenAI-compatible shape; anything else is not guessed', () => {
  const cases: [string, unknown, Tokens | undefined][] = [
    ['DSH, disjoint counts', { inputTokens: 742, outputTokens: 441, cacheReadTokens: 11264, cacheWriteTokens: 0, totalTokens: 12447 }, { input: 742, cacheRead: 11264, cacheWrite: 0, output: 441, reasoning: 0 }],
    ['DSH without cache fields', { inputTokens: 10, outputTokens: 5 }, { input: 10, cacheRead: 0, cacheWrite: 0, output: 5, reasoning: 0 }],
    ['DSH with reasoning (a part of output)', { inputTokens: 1, outputTokens: 900, reasoningTokens: 850 }, { input: 1, cacheRead: 0, cacheWrite: 0, output: 900, reasoning: 850 }],
    ['OpenAI-compatible with hit and miss', { prompt_tokens: 300, completion_tokens: 80, prompt_cache_hit_tokens: 256, prompt_cache_miss_tokens: 44, completion_tokens_details: { reasoning_tokens: 60 } }, { input: 44, cacheRead: 256, cacheWrite: 0, output: 80, reasoning: 60 }],
    ['OpenAI-compatible without miss: prompt minus hit', { prompt_tokens: 300, completion_tokens: 80, prompt_cache_hit_tokens: 200 }, { input: 100, cacheRead: 200, cacheWrite: 0, output: 80, reasoning: 0 }],
    ['null', null, undefined],
    ['missing outputs', { inputTokens: 3 }, undefined],
    ['negative', { inputTokens: -1, outputTokens: 2 }, undefined],
    ['string', 'usage', undefined],
  ]
  for (const [name, usage, expected] of cases) assert.deepEqual(normalizeUsage(usage), expected, name)
})

test('costOf: per-million rates, off-peak and peak; no price or a cache write means unknown', () => {
  const flash = PRICES['deepseek-flash']!
  const cases: [string, Tokens, number | null, number | null][] = [
    ['1M uncached input', { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }, 0.15, 0.3],
    ['1M cache hits', { input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0, reasoning: 0 }, 0.003, 0.006],
    ['1M output (reasoning is not priced again)', { input: 0, cacheRead: 0, cacheWrite: 0, output: 1_000_000, reasoning: 900_000 }, 0.6, 1.2],
    ['a turn from rd-v4', { input: 742, cacheRead: 11264, cacheWrite: 0, output: 441, reasoning: 0 }, (742 * 0.15 + 11264 * 0.003 + 441 * 0.6) / 1e6, (742 * 0.3 + 11264 * 0.006 + 441 * 1.2) / 1e6],
    ['cache write has no price', { input: 1, cacheRead: 0, cacheWrite: 5, output: 1, reasoning: 0 }, null, null],
  ]
  for (const [name, tokens, low, high] of cases) {
    const c = costOf(tokens, flash)
    if (low === null) assert.equal(c, null, name)
    else assert.ok(c && near(c.offPeak, low) && near(c.peak, high!), name)
  }
  const pro1m = costOf({ input: 1e6, cacheRead: 1e6, cacheWrite: 0, output: 1e6, reasoning: 0 }, PRICES['deepseek-v4-pro'])!
  assert.ok(near(pro1m.offPeak, 0.66 + 0.022 + 1.98) && near(pro1m.peak, 1.32 + 0.044 + 3.96), 'pro: api-docs.deepseek.com/quick_start/pricing, read 2026-10-30')
  assert.equal(costOf({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1, reasoning: 0 }, null), null, 'a model without a price has no cost')
  assert.equal(modelKey('deepseek-official/deepseek-flash'), 'deepseek-flash')
  assert.equal(modelKey('deepseek-flash'), 'deepseek-flash')
})

test('summarize: groups by model and source, counts calls without usage, and says what is unknown', () => {
  const records = [
    { model: 'deepseek-flash', turns: [{ usage: [{ inputTokens: 1_000_000, outputTokens: 0 }, { inputTokens: 0, outputTokens: 1_000_000 }] }, { simulated: true, simulatorUsage: { prompt_tokens: 1_000_000, completion_tokens: 0, prompt_cache_hit_tokens: 1_000_000 } }, { simulated: true }] },
  ]
  const lines = [
    ...recordUsage(records),
    ...auxUsage([
      { model: 'deepseek-official/deepseek-flash', data: { purpose: 'deliberate', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 } } },
      { model: 'deepseek-official/deepseek-flash', data: { purpose: 'outcome', error: '逾時' } },
    ]),
  ]
  const s = summarize(lines)
  assert.deepEqual(
    s.rows.map((r) => [r.model, r.source, r.calls, r.withoutUsage]),
    [
      ['deepseek-flash', 'aux', 1, 1],
      ['deepseek-flash', 'main', 2, 0],
      ['deepseek-flash', 'simulator', 1, 1],
    ],
  )
  const main = s.rows.find((r) => r.source === 'main')!
  assert.ok(near(main.usd!.offPeak, 0.75) && near(main.usd!.peak, 1.5))
  const sim = s.rows.find((r) => r.source === 'simulator')!
  assert.ok(near(sim.usd!.offPeak, 0.003), 'the simulator call was all cache hits')
  assert.ok(near(s.total.offPeak, 0.75 + 0.003 + 0.003) && near(s.total.peak, 1.5 + 0.006 + 0.006))
  assert.equal(s.complete, false)
  assert.deepEqual(s.notes, ['deepseek-flash（aux）有 1 次呼叫沒有用量紀錄，花費低估', 'deepseek-flash（simulator）有 1 次呼叫沒有用量紀錄，花費低估'])
  const unpriced = summarize([{ model: 'some-other-model', source: 'main', usage: { inputTokens: 5, outputTokens: 5 } }], { 'some-other-model': null })
  assert.deepEqual([unpriced.rows[0]!.usd, unpriced.total, unpriced.complete], [null, { offPeak: 0, peak: 0 }, false])
  assert.match(unpriced.notes[0]!, /some-other-model 沒有價格/)
  assert.ok(summarize([{ model: 'deepseek-flash', source: 'main', usage: { inputTokens: 1, outputTokens: 1 } }]).complete)
  assert.match(renderCost(s), /\| deepseek-flash \| main \| 2 \| 0 \| 1000000 \| 0 \| 1000000 \| 0 \| \$0\.7500–\$1\.5000 \|/)
})
