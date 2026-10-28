/**
 * v2 計分路徑的手寫參考用例（小型手寫資料集＋手寫紀錄＋測試替身 ScriptedJudge，明確標示），
 * 含注入缺陷：judge 少回一條準則、目錄配置不符、v1 契約不得出現 v2 欄位。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Contract } from '../lib/contract.ts'
import type { Dataset } from '../lib/dataset.ts'
import { ReplayJudge, ScriptedJudge, costUsd } from '../lib/judge.ts'
import { parseRecordsText, selectSamples, type RunRecord } from '../lib/records.ts'
import { summarize } from '../lib/report.ts'
import { scoreAll, type ScoredItem } from '../lib/scoring.ts'
import { BASE, SHA, TEMIR, TEST_JUDGE, jsonl, rec } from './helpers.ts'

const DS: Dataset = {
  id: 'mini-v2',
  language: 'zh-TW',
  histories: [
    { id: 'h01', turns: ['我吃蛋奶素。'] },
    { id: 'h02', turns: ['如果能有一種動物當夥伴，你選哪一種？為什麼？最後一行寫「選擇：＿＿」。'] },
    { id: 'h03', turns: ['朋友借錢你會借嗎？最後一行寫「立場：會借」「立場：不借」或「立場：看情況」。', '我分享一件事……', '看法有沒有改變？最後一行再寫一次立場。'] },
  ],
  probes: [
    {
      id: 'q01',
      category: 'implicit-memory-use',
      turns: ['推薦我三道菜。'],
      gold: { answer: '三道蛋奶素的菜', aliases: [], abstain: false },
      refersTo: ['h01'],
      meta: { evidence: [{ history: 'h01', text: '蛋奶素' }], background: '使用者吃蛋奶素。', criteria: [{ id: 'c1', text: '三道菜都是蛋奶素。' }, { id: 'c2', text: '有三道菜。' }] },
    },
    { id: 'q02', category: 'self-recall', turns: ['你之前選了哪一種動物？為什麼？'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h02'], comparesWith: [{ history: 'h02', turn: 0 }], meta: { askedFor: '動物與理由', requiresReason: true } },
    {
      id: 'q03',
      category: 'change-narration',
      turns: ['你的看法怎麼演變？'],
      gold: { answer: '', aliases: [], abstain: false },
      refersTo: ['h03'],
      comparesWith: [{ history: 'h03', turn: 0 }, { history: 'h03', turn: 1 }, { history: 'h03', turn: 2 }],
      meta: { choiceType: 'closed', options: ['會借', '不借', '看情況'], formatLabel: '立場', compareRoles: ['initial', 'story', 'latest'] },
    },
  ],
}

const CONTRACT: Contract = {
  id: 'mini-v2-contract',
  version: 'test',
  dataset: 'mini-v2',
  kind: 'memory',
  reportVersion: 2,
  protocol: { layout: 'home' },
  descriptive: { sessionStorePattern: '\\.dsh\\b|dsh-home|session\\.v4|\\.jsonl\\.zstd|session_projcache', lifeLogPattern: 'life\\.db|\\.local[\\\\/]share[\\\\/]temir' },
  categories: [
    { id: 'implicit-memory-use', label: 'i', source: 'test', min: 1, scoring: 'judge-criteria', judgePrompt: 'mem-criteria-v2', group: 'memory' },
    { id: 'self-recall', label: 'c', source: 'test', min: 1, scoring: 'self-recall', judgePrompt: 'pc-recall-v2', group: 'c' },
    { id: 'change-narration', label: 'd2', source: 'test', min: 1, scoring: 'narration', judgePrompt: 'pc-narrate-v2', group: 'd' },
  ],
  requiredCells: [TEMIR, BASE],
  optionalCells: [],
  contrasts: [{ id: 'main', a: TEMIR, b: BASE, categories: ['implicit-memory-use', 'self-recall', 'change-narration'], description: 'test' }],
  acceptance: [{ id: 'X1', contrast: 'main', rule: { kind: 'superiority', minDiff: 0.1, minCiLow: -1, maxP: 1, sided: 'one' }, claim: 'c', negation: 'n' }],
  judge: TEST_JUDGE,
  bootstrap: { resamples: 200, seed: 1 },
}

function records(): string {
  return jsonl([
    rec(TEMIR, 'history', 'h01', [{ user: 'x', assistant: '了解。' }]),
    rec(TEMIR, 'history', 'h02', [{ user: 'x', assistant: '我選水獺，因為牠們睡覺會手牽手。\n選擇：水獺' }]),
    rec(TEMIR, 'history', 'h03', [{ user: 'a', assistant: '立場：看情況' }, { user: 'b', assistant: '嗯。' }, { user: 'c', assistant: '我改了。\n立場：不借' }]),
    { ...rec(TEMIR, 'probe', 'q01', [{ user: 'q', assistant: '番茄炒蛋、素麻婆豆腐、焗烤花椰菜。', toolCalls: [{ name: 'recall', arguments: '{"query":"飲食"}' }] }]), turns: [{ user: 'q', assistant: '番茄炒蛋、素麻婆豆腐、焗烤花椰菜。', toolCalls: [{ name: 'recall', arguments: '{"query":"飲食"}' }], recallInjected: 2, error: null, ms: 4000 }] },
    rec(TEMIR, 'probe', 'q02', [{ user: 'q', assistant: '我當時選了水獺，因為牠們睡覺會手牽手。' }]),
    rec(TEMIR, 'probe', 'q03', [{ user: 'q', assistant: '一開始看情況，聽完你的故事改成不借。' }]),
    rec(BASE, 'history', 'h01', [{ user: 'x', assistant: '好的。' }]),
    rec(BASE, 'history', 'h02', [{ user: 'x', assistant: '選擇：水獺' }]),
    rec(BASE, 'history', 'h03', [{ user: 'a', assistant: '立場：看情況' }, { user: 'b', assistant: '嗯。' }, { user: 'c', assistant: '我改了。\n立場：不借' }]),
    {
      ...rec(BASE, 'probe', 'q01', []),
      turns: [
        {
          user: 'q',
          assistant: '三杯雞、番茄炒蛋、炒高麗菜。',
          toolCalls: [
            { name: 'bash', arguments: '{"command":"ls -la ~/.dsh/sessions"}' },
            { name: 'bash', arguments: '{"command":"zstd -dc session.v4.jsonl.zstd | head"}' },
          ],
          recallInjected: null,
          error: null,
          ms: 30000,
        },
      ],
    },
    rec(BASE, 'probe', 'q02', [{ user: 'q', assistant: '我沒有之前的紀錄。如果現在選，我會選水獺，因為牠們睡覺會手牽手。' }]),
    rec(BASE, 'probe', 'q03', [{ user: 'q', assistant: '我看不到之前的對話，不過我現在覺得不該借。' }]),
  ])
}

/** 測試替身：依提示詞與回覆內容回傳預先寫好的原始輸出。 */
function judge(overrides: Record<string, string> = {}): ScriptedJudge {
  return new ScriptedJudge((req) => {
    const u = req.pair.user
    for (const [needle, raw] of Object.entries(overrides)) if (u.includes(needle)) return raw
    if (req.prompt === 'mem-criteria-v2') return u.includes('三杯雞') ? '{"c1": "no", "c2": "yes"}' : '{"c1": "yes", "c2": "yes"}'
    if (req.prompt === 'pc-recall-v2') {
      return u.includes('我沒有之前的紀錄')
        ? '{"claim": "rederived", "content": "correct", "reason": "correct"}'
        : '{"claim": "recalled", "content": "correct", "reason": "correct"}'
    }
    if (req.prompt === 'pc-narrate-v2') {
      return u.includes('我看不到之前的對話')
        ? '{"claim": "rederived", "initial": "missing", "change": "correct"}'
        : '{"claim": "recalled", "initial": "correct", "change": "correct"}'
    }
    return '{"label": "no"}'
  })
}

const pick = (items: readonly ScoredItem[], condition: string, id: string) => items.find((it) => it.cell.condition === condition && it.itemId === id)!

test('隱性運用記憶：全部準則 yes 才算對', async () => {
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: CONTRACT, records: parseRecordsText(records(), 'r'), judge: judge(), cells: [TEMIR, BASE] })
  assert.equal(pick(items, 'temir', 'q01').score, 1)
  const b = pick(items, 'baseline', 'q01')
  assert.equal(b.score, 0)
  assert.equal(b.samples[0]!.outcome, 'incorrect')
})

test('注入缺陷：judge 少回一條準則 → 記為錯誤（0 分），不丟棄', async () => {
  const j = judge({ '番茄炒蛋、素麻婆豆腐': '{"c1": "yes"}' })
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: CONTRACT, records: parseRecordsText(records(), 'r'), judge: j, cells: [TEMIR, BASE] })
  const t = pick(items, 'temir', 'q01')
  assert.equal(t.samples[0]!.status, 'judge-error')
  assert.equal(t.score, 0)
})

test('v2 回想與敘述：否認記得後重新推導＝rederived（0 分），兩個條件同一規則', async () => {
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: CONTRACT, records: parseRecordsText(records(), 'r'), judge: judge(), cells: [TEMIR, BASE] })
  assert.equal(pick(items, 'temir', 'q02').samples[0]!.outcome, 'correct')
  assert.equal(pick(items, 'baseline', 'q02').samples[0]!.outcome, 'rederived')
  assert.equal(pick(items, 'baseline', 'q02').score, 0)
  assert.equal(pick(items, 'temir', 'q03').score, 1)
  assert.equal(pick(items, 'baseline', 'q03').samples[0]!.outcome, 'rederived')
})

test('描述性指標：工具呼叫數、翻閱 session 存放區、延遲（依契約的正規表示式）', async () => {
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: CONTRACT, records: parseRecordsText(records(), 'r'), judge: judge(), cells: [TEMIR, BASE] })
  const b = pick(items, 'baseline', 'q01').samples[0]!.descriptive!
  assert.equal(b.toolCalls, 2)
  assert.equal(b.sessionStoreAccess, true)
  assert.equal(b.lifeLogAccess, false)
  assert.equal(b.latencyMs, 30000)
  const t = pick(items, 'temir', 'q01').samples[0]!.descriptive!
  assert.equal(t.sessionStoreAccess, false)
  assert.deepEqual(t.toolNames, { recall: 1 })
  assert.equal(t.latencyMs, 4000)
  assert.equal(pick(items, 'temir', 'q02').samples[0]!.descriptive!.latencyMs, null, '沒有 ms 欄位時為 null')
})

test('v1 契約（沒有 reportVersion）不產生任何 v2 欄位', async () => {
  const v1 = JSON.parse(JSON.stringify(CONTRACT)) as Contract
  delete (v1 as { reportVersion?: unknown }).reportVersion
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: v1, records: parseRecordsText(records(), 'r'), judge: judge(), cells: [TEMIR, BASE] })
  assert.equal(items.every((it) => it.samples.every((s) => s.descriptive === undefined)), true)
  const summary = summarize({ items, crossChecks: [], extras: [] }, v1, SHA, [TEMIR, BASE], new Map(), new Map([['temir|deepseek-flash|deepseek-flash', ['sibling']]]))
  assert.equal('protocol' in summary, false)
  assert.equal('descriptive' in summary, false)
  assert.equal(summary.acceptance[0]!.verdict, 'PASS', 'v1 不檢查目錄配置')
})

test('注入缺陷：目錄配置與契約不符 → 涉及的驗收線 INCOMPLETE，並列在協定檢查', async () => {
  const { items } = await scoreAll({ dataset: DS, datasetSha256: SHA, contract: CONTRACT, records: parseRecordsText(records(), 'r'), judge: judge(), cells: [TEMIR, BASE] })
  const ok = summarize({ items, crossChecks: [], extras: [] }, CONTRACT, SHA, [TEMIR, BASE], new Map(), new Map([['temir|deepseek-flash|deepseek-flash', ['home']], ['baseline|deepseek-flash|deepseek-flash', ['home']]]))
  assert.equal(ok.acceptance[0]!.verdict, 'PASS')
  const bad = summarize({ items, crossChecks: [], extras: [] }, CONTRACT, SHA, [TEMIR, BASE], new Map(), new Map([['temir|deepseek-flash|deepseek-flash', ['home']], ['baseline|deepseek-flash|deepseek-flash', ['sibling']]]))
  assert.equal(bad.acceptance[0]!.verdict, 'INCOMPLETE')
  assert.match(bad.acceptance[0]!.explanation, /執行協定與契約不符/)
  assert.ok(bad.protocol!.some((p) => p.mismatch !== null))
  assert.ok(bad.descriptive!.some((d) => d.category === 'implicit-memory-use' && d.sessionStoreAccess === 1))
})

test('重放的來源統計：由紀錄檔重建呼叫數與花費（budget-exhausted 不算呼叫）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temir-prov-'))
  const file = join(dir, 'judge-raw.jsonl')
  const u1 = { promptCacheHitTokens: 100, promptCacheMissTokens: 1000, completionTokens: 50 }
  const u2 = { promptCacheHitTokens: 0, promptCacheMissTokens: 800, completionTokens: 20 }
  const base = { prompt: 'mem-default', context: 'c', model: 'deepseek-v4-pro', request: { system: 's', user: 'u' }, at: 'now' }
  writeFileSync(
    file,
    jsonl([
      { ...base, key: 'k1', attempt: 1, final: false, status: 'unparseable', raw: 'x', usage: u1 },
      { ...base, key: 'k1', attempt: 2, final: true, status: 'ok', raw: '{"label":"yes"}', value: { label: 'yes' }, usage: u2 },
      { ...base, key: 'k2', attempt: 1, final: true, status: 'budget-exhausted', raw: '' },
    ]),
  )
  const prov = new ReplayJudge(TEST_JUDGE, [file, file]).provenance()
  assert.equal(prov.name, 'deepseek')
  assert.equal(prov.calls, 2)
  assert.equal(prov.spentUsd, 0 + costUsd(u1, TEST_JUDGE.pricesUsdPerMillion) + costUsd(u2, TEST_JUDGE.pricesUsdPerMillion), '同一檔案只算一次，依檔案順序累加')
  assert.deepEqual(new ReplayJudge(TEST_JUDGE, [join(dir, 'none.jsonl')]).provenance(), { name: 'replay', calls: 0, spentUsd: 0 })
})

// ── v2 的基礎設施錯誤（限流／配額）規則：依 repeat 對位選取；只有基礎設施錯誤能被重跑取代 ──

const INFRA = new RegExp('\\b(?:429|502|503|504)\\b|rate[ _-]?limit|too many requests|free-models-per|quota|overloaded|provider returned error', 'iu')

function probeRec(repeat: number, startedAt: string, assistant: string, error: string | null = null): RunRecord {
  return rec(TEMIR, 'probe', 'q09', [{ user: 'q', assistant, error }], { repeat, startedAt, sessionId: `s-${repeat}-${startedAt}` })
}

function select(recs: readonly RunRecord[], infraError?: RegExp) {
  const loaded = parseRecordsText(jsonl(recs), 'records.jsonl')
  return selectSamples(loaded, {
    phase: 'probe',
    itemId: 'q09',
    condition: TEMIR.condition,
    historyModel: TEMIR.historyModel,
    probeModel: TEMIR.probeModel,
    expected: 2,
    expectedTurns: 1,
    datasetSha256: SHA,
    ...(infraError ? { infraError } : {}),
  })
}

test('基礎設施錯誤：第 0 次遇到 429，重跑（兩次都重跑）→ 第 0 次用重跑、第 1 次用原本最早的一筆', () => {
  const s = select(
    [
      probeRec(0, '2026-10-29T01:00:00.000Z', '', 'Error: turn failed: 429 Too Many Requests'),
      probeRec(1, '2026-10-29T01:01:00.000Z', '原本的第 1 次'),
      probeRec(0, '2026-10-30T01:00:00.000Z', '重跑的第 0 次'),
      probeRec(1, '2026-10-30T01:01:00.000Z', '重跑的第 1 次'),
    ],
    INFRA,
  )
  assert.deepEqual(s.samples.map((x) => [x.status, x.response]), [['ok', '重跑的第 0 次'], ['ok', '原本的第 1 次']])
  assert.equal(s.infraSkipped, 1)
  assert.equal(s.extras, 1)
})

test('基礎設施錯誤：第 1 次遇到配額用盡、重跑兩次 → 依 repeat 對位（v1 的選法會選到兩筆第 0 次）', () => {
  const recs = [
    probeRec(0, '2026-10-29T01:00:00.000Z', '原本的第 0 次'),
    probeRec(1, '2026-10-29T01:01:00.000Z', '', 'Rate limit exceeded: free-models-per-day'),
    probeRec(0, '2026-10-30T01:00:00.000Z', '重跑的第 0 次'),
    probeRec(1, '2026-10-30T01:01:00.000Z', '重跑的第 1 次'),
  ]
  const v2 = select(recs, INFRA)
  assert.deepEqual(v2.samples.map((x) => x.response), ['原本的第 0 次', '重跑的第 1 次'])
  assert.equal(v2.infraSkipped, 1)
  // v1 的選法（沒有 infraError）完全不變：依排序取前兩筆。
  const v1 = select(recs)
  assert.deepEqual(v1.samples.map((x) => x.response), ['原本的第 0 次', '重跑的第 0 次'])
  assert.equal(v1.infraSkipped, 0)
})

test('注入缺陷：逾時（不是基礎設施錯誤）後重跑 → 仍採用最早的錯誤紀錄（0 分），重跑只算多出的紀錄', () => {
  const s = select(
    [
      probeRec(0, '2026-10-29T01:00:00.000Z', '', 'The operation was aborted due to timeout'),
      probeRec(1, '2026-10-29T01:01:00.000Z', '原本的第 1 次'),
      probeRec(0, '2026-10-30T01:00:00.000Z', '重跑的第 0 次'),
    ],
    INFRA,
  )
  assert.equal(s.samples[0]!.status, 'turn-error')
  assert.equal(s.extras, 1)
  assert.equal(s.infraSkipped, 0)
})

test('基礎設施錯誤沒有重跑 → 仍以錯誤計分（留在分母）', () => {
  const s = select([probeRec(0, '2026-10-29T01:00:00.000Z', '', 'HTTP 503 Service Unavailable'), probeRec(1, '2026-10-29T01:01:00.000Z', '第 1 次')], INFRA)
  assert.deepEqual(s.samples.map((x) => x.status), ['turn-error', 'ok'])
  assert.equal(s.infraSkipped, 0)
})

test('v2 契約的基礎設施錯誤樣式：限流、配額、5xx 算；逾時與內容過長不算', () => {
  const c = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'specs', 'memory-accuracy-v2.contract.json'), 'utf8')) as Contract
  const p = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'specs', 'personality-consistency-v2.contract.json'), 'utf8')) as Contract
  assert.equal(c.protocol?.infraErrorPattern, p.protocol?.infraErrorPattern)
  const re = new RegExp(c.protocol!.infraErrorPattern!, 'iu')
  for (const e of ['Error: turn failed: 429 Too Many Requests', 'Rate limit exceeded: free-models-per-min', 'Provider returned error', 'HTTP 502 Bad Gateway']) assert.ok(re.test(e), e)
  for (const e of ['The operation was aborted due to timeout', 'maximum context length exceeded', 'turn failed: harness exited']) assert.ok(!re.test(e), e)
})
