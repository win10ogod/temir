/**
 * DeepSeek judge 的協定處理（用假的 fetch，不連網、不花錢；測試替身已標示）：
 * 解析失敗重試後記為 unparseable、API 錯誤記為 api-error、快取與重放、預算上限、金鑰不外洩。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeepSeekJudge, ReplayJudge, type JudgeRequest } from '../lib/judge.ts'
import { PARSERS, extractJsonObject, memoryPrompt } from '../lib/prompts.ts'
import { TEST_JUDGE } from './helpers.ts'

const FAKE_KEY = 'sk-test-SHOULD-NEVER-APPEAR-0123456789'

function request(response = '你的貓叫麻糬。'): JudgeRequest {
  return {
    prompt: 'mem-default',
    pair: memoryPrompt('mem-default', { question: '我的貓叫什麼？', answer: '麻糬', response }),
    parse: PARSERS.yesNo,
    context: 'test|q01|r0',
  }
}

type FakeResponse = { status: number; body: string } | Error

/** 測試替身：依序回傳預先寫好的 HTTP 回應，並記下收到的請求。 */
function fakeFetch(responses: FakeResponse[]) {
  const seen: { url: string; headers: Record<string, string>; body: unknown }[] = []
  const fn = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    const next = responses.shift()
    if (!next) throw new Error('沒有更多假回應')
    if (next instanceof Error) throw next
    return { status: next.status, ok: next.status >= 200 && next.status < 300, text: async () => next.body }
  }
  return { fn, seen }
}

function completion(content: string, usage = { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 900, completion_tokens: 30 }) {
  return JSON.stringify({ choices: [{ message: { content } }], usage })
}

function newJudge(responses: FakeResponse[], maxUsd = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'temir-judge-'))
  const cacheFile = join(dir, 'judge-raw.jsonl')
  const fake = fakeFetch(responses)
  const judge = new DeepSeekJudge({ spec: TEST_JUDGE, cacheFile, maxUsd, fetchImpl: fake.fn as never, apiKey: FAKE_KEY, sleep: async () => {} })
  return { judge, cacheFile, seen: fake.seen }
}

test('extractJsonObject：容許 ```json 圍欄；兩個物件 → 失敗', () => {
  assert.deepEqual(extractJsonObject('```json\n{"label":"yes"}\n```'), { label: 'yes' })
  assert.throws(() => extractJsonObject('{"label":"yes"} {"label":"no"}'))
  assert.throws(() => extractJsonObject('yes'))
})

test('成功：請求帶正確參數（thinking disabled、temperature 0、json_object）；結果寫入快取', async () => {
  const { judge, cacheFile, seen } = newJudge([{ status: 200, body: completion('{"label":"yes","reason":"有答案"}') }])
  const out = await judge.judge(request())
  assert.equal(out.status, 'ok')
  assert.equal(out.value!['label'], 'yes')
  const body = seen[0]!.body as Record<string, unknown>
  assert.equal(body['model'], 'deepseek-v4-pro')
  assert.equal(body['temperature'], 0)
  assert.deepEqual(body['thinking'], { type: 'disabled' })
  assert.deepEqual(body['response_format'], { type: 'json_object' })
  assert.ok(judge.spentUsd() > 0)
  const cache = readFileSync(cacheFile, 'utf8')
  assert.match(cache, /"final":true/)
  assert.ok(!cache.includes(FAKE_KEY), '快取檔不得含金鑰')
})

test('解析失敗：重試到上限後記為 unparseable，每次原始輸出都保存', async () => {
  const { judge, cacheFile } = newJudge([
    { status: 200, body: completion('我覺得對') },
    { status: 200, body: completion('{"label":"maybe"}') },
    { status: 200, body: completion('還是不知道') },
  ])
  const out = await judge.judge(request())
  assert.equal(out.status, 'unparseable')
  assert.equal(out.attempts, 3)
  const lines = readFileSync(cacheFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(lines.length, 3)
  assert.deepEqual(lines.map((l) => l.raw), ['我覺得對', '{"label":"maybe"}', '還是不知道'])
  assert.equal(lines[2].final, true)
})

test('API 錯誤（HTTP 500、網路錯誤）：重試；第三次成功就採用', async () => {
  const { judge } = newJudge([{ status: 500, body: 'server error' }, new Error('ECONNRESET'), { status: 200, body: completion('{"label":"no"}') }])
  const out = await judge.judge(request())
  assert.equal(out.status, 'ok')
  assert.equal(out.value!['label'], 'no')
  assert.equal(out.attempts, 3)
})

test('API 一直錯誤 → api-error；錯誤訊息不含金鑰', async () => {
  const { judge, cacheFile } = newJudge([
    { status: 401, body: `invalid key ${FAKE_KEY}` },
    { status: 401, body: 'unauthorized' },
    { status: 401, body: 'unauthorized' },
  ])
  const out = await judge.judge(request())
  assert.equal(out.status, 'api-error')
  assert.ok(!(out.error ?? '').includes(FAKE_KEY))
  assert.ok(!readFileSync(cacheFile, 'utf8').includes(FAKE_KEY))
})

test('快取：同一請求第二次不呼叫 API；重放模式只讀快取', async () => {
  const { judge, cacheFile, seen } = newJudge([{ status: 200, body: completion('{"label":"yes"}') }])
  await judge.judge(request())
  const again = await judge.judge(request())
  assert.equal(again.cached, true)
  assert.equal(seen.length, 1)
  const replay = new ReplayJudge(TEST_JUDGE, [cacheFile])
  assert.equal((await replay.judge(request())).value!['label'], 'yes')
  assert.equal((await replay.judge(request('別的回答'))).status, 'unavailable')
})

test('預算上限：超過後不再呼叫，記為 budget-exhausted', async () => {
  const big = { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 2_000_000, completion_tokens: 0 }
  const { judge, seen } = newJudge([{ status: 200, body: completion('{"label":"yes"}', big) }], 0.5)
  assert.equal((await judge.judge(request('第一個'))).status, 'ok')
  const second = await judge.judge(request('第二個'))
  assert.equal(second.status, 'budget-exhausted')
  assert.equal(seen.length, 1)
})

test('沒有金鑰 → unavailable（不會送出請求）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'temir-judge-'))
  const fake = fakeFetch([])
  const saved = process.env['DEEPSEEK_API_KEY']
  delete process.env['DEEPSEEK_API_KEY']
  try {
    const judge = new DeepSeekJudge({ spec: TEST_JUDGE, cacheFile: join(dir, 'c.jsonl'), maxUsd: 1, fetchImpl: fake.fn as never })
    assert.equal((await judge.judge(request())).status, 'unavailable')
    assert.equal(fake.seen.length, 0)
  } finally {
    if (saved !== undefined) process.env['DEEPSEEK_API_KEY'] = saved
  }
})
