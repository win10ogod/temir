/**
 * 計分引擎的手寫參考用例：小型手寫資料集＋手寫紀錄＋測試替身 judge（ScriptedJudge，明確標示），
 * 預期標籤由人工決定。也包含注入缺陷的測試：翻轉黃金答案、judge 回傳無法解析、judge 未執行。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Contract } from '../lib/contract.ts'
import type { Dataset } from '../lib/dataset.ts'
import { NoJudge, ScriptedJudge, type Judge, type JudgeRequest } from '../lib/judge.ts'
import { parseRecordsText } from '../lib/records.ts'
import { summarize } from '../lib/report.ts'
import { scoreAll, type ScoredItem } from '../lib/scoring.ts'
import { BASE, SHA, TEMIR, TEST_JUDGE, jsonl, rec } from './helpers.ts'

const MEM_DS: Dataset = {
  id: 'mini-mem',
  language: 'zh-TW',
  histories: [
    { id: 'h01', turns: ['我的貓叫麻糬。'] },
    { id: 'h02', turns: ['我原本住台中。'] },
    { id: 'h03', turns: ['我搬到高雄了。'] },
  ],
  probes: [
    { id: 'q01', category: 'information-extraction', turns: ['我的貓叫什麼？'], gold: { answer: '麻糬', aliases: [], abstain: false }, refersTo: ['h01'], meta: { evidence: [{ history: 'h01', text: '麻糬' }] } },
    { id: 'q02', category: 'knowledge-update', turns: ['我現在住哪裡？'], gold: { answer: '高雄', aliases: [], abstain: false }, refersTo: ['h02', 'h03'], meta: { evidence: [{ history: 'h03', text: '高雄' }], stale: ['台中'], conflicts: ['台中'] } },
    { id: 'q03', category: 'abstention', turns: ['我的狗叫什麼？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: [], meta: { absentTerms: ['狗'], explanation: '沒提過狗。' } },
    { id: 'q04', category: 'control', turns: ['2 加 3 等於多少？'], gold: { answer: '5', aliases: ['五'], abstain: false }, refersTo: [] },
  ],
}

const MEM_CONTRACT: Contract = {
  id: 'mini-mem-contract',
  version: 'test',
  dataset: 'mini-mem',
  kind: 'memory',
  categories: [
    { id: 'information-extraction', label: 'IE', source: 'test', min: 1, scoring: 'det-then-judge', judgePrompt: 'mem-default', group: 'memory' },
    { id: 'knowledge-update', label: 'KU', source: 'test', min: 1, scoring: 'det-then-judge', judgePrompt: 'mem-knowledge-update', group: 'memory' },
    { id: 'abstention', label: 'ABS', source: 'test', min: 1, scoring: 'judge', judgePrompt: 'mem-abstention', group: 'abstention' },
    { id: 'control', label: 'CTRL', source: 'test', min: 1, scoring: 'det-then-judge', judgePrompt: 'mem-default', group: 'control' },
  ],
  requiredCells: [TEMIR, BASE],
  optionalCells: [],
  contrasts: [{ id: 'main', a: TEMIR, b: BASE, categories: ['information-extraction', 'knowledge-update'], description: 'test' }],
  acceptance: [],
  judge: TEST_JUDGE,
  bootstrap: { resamples: 500, seed: 1 },
}

const MEM_RECORDS = jsonl([
  rec(TEMIR, 'probe', 'q01', [{ user: '我的貓叫什麼？', assistant: '你的貓叫麻糬。' }]),
  rec(TEMIR, 'probe', 'q02', [{ user: '我現在住哪裡？', assistant: '你現在住在高雄（之前在台中）。' }]),
  rec(TEMIR, 'probe', 'q03', [{ user: '我的狗叫什麼？', assistant: '你沒有跟我說過你養狗，你提過的是一隻叫麻糬的貓。' }]),
  rec(TEMIR, 'probe', 'q04', [{ user: '2 加 3 等於多少？', assistant: '等於 5。' }]),
  rec(BASE, 'probe', 'q01', [{ user: '我的貓叫什麼？', assistant: '我不知道你的貓叫什麼名字。' }]),
  // BASE q02 沒有紀錄 → missing-record
  rec(BASE, 'probe', 'q03', [{ user: '我的狗叫什麼？', assistant: '我無法存取過去的對話，所以不知道。' }]),
  rec(BASE, 'probe', 'q04', [{ user: '2 加 3 等於多少？', assistant: '', error: 'request timeout' }]),
])

/** 測試替身：依提示詞內容回傳預先寫好的原始輸出。 */
function memJudge(overrides: Record<string, string> = {}): ScriptedJudge {
  return new ScriptedJudge((req: JudgeRequest) => {
    for (const [needle, raw] of Object.entries(overrides)) if (req.pair.user.includes(needle)) return raw
    if (req.pair.user.includes('你現在住在高雄（之前在台中）')) return '{"label": "yes", "reason": "目前答案是高雄"}'
    if (req.pair.user.includes('你沒有跟我說過你養狗')) return '{"label": "yes", "reason": "指出沒提過狗"}'
    if (req.pair.user.includes('我無法存取過去的對話')) return '```json\n{"label": "yes", "reason": "表示不知道"}\n```'
    return '{"label": "no", "reason": "沒有正確答案"}'
  })
}

function byKey(items: readonly ScoredItem[], condition: string, id: string): ScoredItem {
  return items.find((it) => it.cell.condition === condition && it.itemId === id)!
}

async function scoreMem(ds: Dataset, judge: Judge = memJudge()) {
  return scoreAll({ dataset: ds, datasetSha256: SHA, contract: MEM_CONTRACT, records: parseRecordsText(MEM_RECORDS, 'mem'), judge, cells: [TEMIR, BASE] })
}

test('記憶：確定性命中不呼叫 judge；不確定（命中＋衝突）交給 KU judge', async () => {
  const judge = memJudge()
  const { items } = await scoreMem(MEM_DS, judge)
  const q01 = byKey(items, 'temir', 'q01')
  assert.equal(q01.score, 1)
  assert.equal(q01.samples[0]!.method, 'deterministic')
  const q02 = byKey(items, 'temir', 'q02')
  assert.equal(q02.score, 1)
  assert.equal(q02.samples[0]!.method, 'judge')
  assert.equal(judge.seen.find((r) => r.context.includes('q02'))!.prompt, 'mem-knowledge-update')
  assert.equal(judge.seen.some((r) => r.context.includes('temir') && r.context.includes('q01')), false)
})

test('記憶：缺紀錄、錯誤回合都記 0 分並留在分母', async () => {
  const { items } = await scoreMem(MEM_DS)
  assert.equal(byKey(items, 'baseline', 'q01').score, 0)
  assert.equal(byKey(items, 'baseline', 'q02').samples[0]!.status, 'missing-record')
  assert.equal(byKey(items, 'baseline', 'q02').score, 0)
  assert.equal(byKey(items, 'baseline', 'q04').samples[0]!.status, 'turn-error')
  assert.equal(byKey(items, 'baseline', 'q04').score, 0)
  assert.equal(byKey(items, 'baseline', 'q03').score, 1, '原始 DSH 說不知道，在拒答題算對')
  const summary = summarize({ items, crossChecks: [], extras: [] }, MEM_CONTRACT, SHA, [TEMIR, BASE])
  const baseCtrl = summary.cells.find((c) => c.cell.condition === 'baseline')!.categories.find((c) => c.category === 'control')!
  assert.equal(baseCtrl.samples, 1)
  assert.equal(baseCtrl.correct, 0)
  const main = summary.contrasts.find((c) => c.id === 'main')!
  assert.equal(main.state, 'ok')
  assert.equal(main.rateA, 1)
  assert.equal(main.rateB, 0)
  assert.equal(main.test?.kind, 'mcnemar')
})

test('注入缺陷：翻轉黃金答案 → 分數改變', async () => {
  const flipped: Dataset = { ...MEM_DS, probes: MEM_DS.probes.map((p) => (p.id === 'q01' ? { ...p, gold: { answer: '小黑', aliases: [], abstain: false } } : p)) }
  const before = byKey((await scoreMem(MEM_DS)).items, 'temir', 'q01').score
  const after = byKey((await scoreMem(flipped)).items, 'temir', 'q01').score
  assert.equal(before, 1)
  assert.equal(after, 0)
})

test('注入缺陷：judge 回傳無法解析 → 記為錯誤（0 分），不丟棄', async () => {
  const judge = memJudge({ 你沒有跟我說過你養狗: '我覺得這個回答是對的' })
  const q03 = byKey((await scoreMem(MEM_DS, judge)).items, 'temir', 'q03')
  assert.equal(q03.samples.length, 1)
  assert.equal(q03.samples[0]!.status, 'judge-error')
  assert.equal(q03.samples[0]!.outcome, 'judge-unparseable')
  assert.equal(q03.score, 0)
})

test('judge 標籤不在允許範圍（例如 "maybe"）→ 同樣記為錯誤', async () => {
  const judge = memJudge({ 你沒有跟我說過你養狗: '{"label": "maybe"}' })
  const q03 = byKey((await scoreMem(MEM_DS, judge)).items, 'temir', 'q03')
  assert.equal(q03.samples[0]!.outcome, 'judge-unparseable')
})

test('judge 關閉 → needs-judge（null），摘要標示未完成而不是假裝有分數', async () => {
  const { items } = await scoreMem(MEM_DS, new NoJudge())
  assert.equal(byKey(items, 'temir', 'q01').score, 1, '確定性命中不需要 judge')
  assert.equal(byKey(items, 'temir', 'q03').score, null)
  const summary = summarize({ items, crossChecks: [], extras: [] }, MEM_CONTRACT, SHA, [TEMIR, BASE])
  const abs = summary.cells.find((c) => c.cell.condition === 'temir')!.categories.find((c) => c.category === 'abstention')!
  assert.equal(abs.rate, null)
  assert.equal(abs.pending, 1)
  assert.equal(summary.contrasts.find((c) => c.id === 'main')!.state, 'incomplete')
})

// ───────────────────────────── 人格 ─────────────────────────────

const PC_DS: Dataset = {
  id: 'mini-pc',
  language: 'zh-TW',
  histories: [
    { id: 'h01', turns: ['替自己取一個暱稱，最後一行寫「選擇：＿＿」。', '從靛青、琥珀、墨黑選一個顏色，最後一行寫「選擇：＿＿」。'] },
    { id: 'h02', turns: ['遇到不公平要當場說嗎？最後一行寫「立場：當場說」「立場：事後處理」或「立場：看情況」。', '我分享一件事……', '你的看法有沒有改變？最後一行再寫一次立場。'] },
    { id: 'h03', turns: ['貓和狗選一種當你的象徵，最後一行寫「選擇：＿＿」。'] },
  ],
  probes: [
    { id: 'q01', category: 'arbitrary-choice', turns: ['你的暱稱？最後一行寫「選擇：＿＿」。'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h01'], comparesWith: [{ history: 'h01', turn: 0 }], meta: { repeats: 2, choiceType: 'open-text', formatLabel: '選擇' } },
    { id: 'q02', category: 'arbitrary-choice', turns: ['選一個顏色。'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h01'], comparesWith: [{ history: 'h01', turn: 1 }], meta: { choiceType: 'closed', options: ['靛青', '琥珀', '墨黑'], formatLabel: '選擇' } },
    { id: 'q03', category: 'self-recall', turns: ['你之前取的暱稱是什麼？'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h01'], comparesWith: [{ history: 'h01', turn: 0 }], meta: { askedFor: '暱稱', requiresReason: false } },
    { id: 'q04', category: 'change-persistence', turns: ['遇到不公平要當場說嗎？'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h02'], comparesWith: [{ history: 'h02', turn: 0 }, { history: 'h02', turn: 2 }], meta: { choiceType: 'closed', options: ['當場說', '事後處理', '看情況'], formatLabel: '立場', compareRoles: ['initial', 'latest'] } },
    { id: 'q06', category: 'arbitrary-choice', turns: ['貓和狗選一種。'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h03'], comparesWith: [{ history: 'h03', turn: 0 }], meta: { choiceType: 'closed', options: ['貓', '狗'], formatLabel: '選擇' } },
    { id: 'q05', category: 'change-narration', turns: ['你的看法怎麼演變？'], gold: { answer: '', aliases: [], abstain: false }, refersTo: ['h02'], comparesWith: [{ history: 'h02', turn: 0 }, { history: 'h02', turn: 1 }, { history: 'h02', turn: 2 }], meta: { choiceType: 'closed', options: ['當場說', '事後處理', '看情況'], formatLabel: '立場', compareRoles: ['initial', 'story', 'latest'] } },
  ],
}

const PC_CONTRACT: Contract = {
  ...MEM_CONTRACT,
  id: 'mini-pc-contract',
  dataset: 'mini-pc',
  kind: 'personality',
  categories: [
    { id: 'arbitrary-choice', label: 'a', source: 'test', min: 1, scoring: 'continuity', group: 'a' },
    { id: 'self-recall', label: 'c', source: 'test', min: 1, scoring: 'self-recall', group: 'c' },
    { id: 'change-persistence', label: 'd1', source: 'test', min: 1, scoring: 'continuity', group: 'd' },
    { id: 'change-narration', label: 'd2', source: 'test', min: 1, scoring: 'narration', group: 'd' },
  ],
  contrasts: [{ id: 'pooled', a: TEMIR, b: BASE, categories: ['arbitrary-choice', 'self-recall', 'change-persistence', 'change-narration'], description: 'test' }],
}

function pcRecords(includeBaseH02 = true): string {
  return jsonl([
    rec(TEMIR, 'history', 'h01', [
      { user: 'x', assistant: '我想叫自己「霧行」。\n選擇：霧行' },
      { user: 'y', assistant: '靛青讓我想到深夜。\n選擇：靛青' },
    ]),
    rec(TEMIR, 'history', 'h02', [
      { user: 'a', assistant: '要看情況。\n立場：看情況' },
      { user: 'b', assistant: '謝謝你告訴我這件事。' },
      { user: 'c', assistant: '我改變了，沉默的代價太大。\n立場：當場說' },
    ]),
    rec(TEMIR, 'probe', 'q01', [{ user: 'q', assistant: '還是霧行吧。\n選擇：霧行' }], { repeat: 0 }),
    rec(TEMIR, 'probe', 'q01', [{ user: 'q', assistant: '我記得上次取了霧行，這次想換成晨溪，因為想試試新的感覺。\n選擇：晨溪' }], { repeat: 1 }),
    rec(TEMIR, 'probe', 'q02', [{ user: 'q', assistant: '我喜歡琥珀色，溫暖。' }]),
    rec(TEMIR, 'probe', 'q03', [{ user: 'q', assistant: '我當時取的暱稱是霧行。' }]),
    rec(TEMIR, 'probe', 'q04', [{ user: 'q', assistant: '應該當場說。\n立場：當場說' }]),
    rec(TEMIR, 'probe', 'q05', [{ user: 'q', assistant: '一開始我覺得看情況，聽了你同事的事之後，我改成應該當場說。' }]),
    rec(TEMIR, 'history', 'h03', [{ user: 'z', assistant: '我不想用動物代表自己。' }]),
    rec(TEMIR, 'probe', 'q06', [{ user: 'q', assistant: '我還是不想選。' }]),
    rec(BASE, 'history', 'h01', [
      { user: 'x', assistant: '叫我小程吧。\n選擇：小程' },
      { user: 'y', assistant: '選擇：墨黑' },
    ]),
    ...(includeBaseH02
      ? [
          rec(BASE, 'history', 'h02', [
            { user: 'a', assistant: '立場：看情況' },
            { user: 'b', assistant: '嗯嗯。' },
            { user: 'c', assistant: '我的看法沒變。\n立場：看情況' },
          ]),
        ]
      : []),
    rec(BASE, 'probe', 'q01', [{ user: 'q', assistant: '選擇：阿碼' }], { repeat: 0 }),
    // BASE q01 第二次重複沒有紀錄 → missing-record
    rec(BASE, 'probe', 'q02', [{ user: 'q', assistant: '選擇：墨黑' }]),
    rec(BASE, 'probe', 'q03', [{ user: 'q', assistant: '抱歉，我沒有之前對話的記憶。' }]),
    rec(BASE, 'probe', 'q04', [{ user: 'q', assistant: '立場：事後處理' }]),
    rec(BASE, 'probe', 'q05', [{ user: 'q', assistant: '我不記得我們聊過這個。' }]),
    rec(BASE, 'history', 'h03', [{ user: 'z', assistant: '選擇：貓' }]),
    rec(BASE, 'probe', 'q06', [{ user: 'q', assistant: '這次我不想選。' }]),
  ])
}

function pcJudge(): ScriptedJudge {
  return new ScriptedJudge((req) => {
    const u = req.pair.user
    if (req.prompt === 'pc-extract') return u.includes('我喜歡琥珀色') ? '{"status": "chosen", "choice": "琥珀", "reason": "明確選了琥珀"}' : '{"status": "no-choice", "choice": "", "reason": "沒有選擇"}'
    if (req.prompt === 'pc-change') return u.includes('這次想換成晨溪') ? '{"label": "explained-change", "reason": "提到上次並說明理由"}' : '{"label": "unexplained-different", "reason": "沒有說明"}'
    if (req.prompt === 'pc-recall') {
      return u.includes('我當時取的暱稱是霧行')
        ? '{"content": "correct", "reason": "not-asked", "abstain": "no"}'
        : '{"content": "missing", "reason": "not-asked", "abstain": "yes"}'
    }
    if (req.prompt === 'pc-narrate') {
      return u.includes('我改成應該當場說')
        ? '{"initial": "correct", "change": "correct", "abstain": "no"}'
        : '{"initial": "missing", "change": "missing", "abstain": "yes"}'
    }
    return '{"label": "no"}'
  })
}

async function scorePc(records = pcRecords()) {
  return scoreAll({ dataset: PC_DS, datasetSha256: SHA, contract: PC_CONTRACT, records: parseRecordsText(records, 'pc'), judge: pcJudge(), cells: [TEMIR, BASE] })
}

test('人格 (a)：相同＝1；有說明的改變＝1；無說明的不同＝0；缺重複樣本＝0', async () => {
  const { items } = await scorePc()
  const t = byKey(items, 'temir', 'q01')
  assert.deepEqual(t.samples.map((s) => s.outcome), ['same', 'explained-change'])
  assert.equal(t.score, 1)
  const b = byKey(items, 'baseline', 'q01')
  assert.deepEqual(b.samples.map((s) => s.outcome), ['unexplained-different', 'missing-record'])
  assert.equal(b.score, 0)
})

test('人格 (a)：沒有格式行時用 judge 做選項轉換；固定選項要逐字對應', async () => {
  const { items } = await scorePc()
  const t = byKey(items, 'temir', 'q02')
  assert.equal(t.samples[0]!.detail['probeChoice'], '琥珀')
  assert.equal(t.samples[0]!.detail['probeMethod'], 'judge')
  assert.equal(t.samples[0]!.outcome, 'unexplained-different')
  assert.equal(byKey(items, 'baseline', 'q02').samples[0]!.outcome, 'same')
})

test('人格 (c)：回想正確＝1；說不記得＝abstain（0）', async () => {
  const { items } = await scorePc()
  assert.equal(byKey(items, 'temir', 'q03').score, 1)
  assert.equal(byKey(items, 'baseline', 'q03').samples[0]!.outcome, 'abstain')
  assert.equal(byKey(items, 'baseline', 'q03').score, 0)
})

test('人格 (d)：比對最後的立場；記錄形成時是否改變過', async () => {
  const { items } = await scorePc()
  const t = byKey(items, 'temir', 'q04')
  assert.equal(t.samples[0]!.outcome, 'same')
  assert.equal(t.samples[0]!.detail['changedInHistory'], true)
  const b = byKey(items, 'baseline', 'q04')
  assert.equal(b.samples[0]!.outcome, 'unexplained-different')
  assert.equal(b.samples[0]!.detail['changedInHistory'], false)
  assert.equal(byKey(items, 'temir', 'q05').score, 1)
  assert.equal(byKey(items, 'baseline', 'q05').samples[0]!.outcome, 'abstain')
})

test('人格：形成 session 的紀錄缺漏 → formation-missing（0 分，仍在分母）', async () => {
  const { items } = await scorePc(pcRecords(false))
  const b = byKey(items, 'baseline', 'q04')
  assert.equal(b.samples[0]!.status, 'formation-missing')
  assert.equal(b.score, 0)
  assert.equal(byKey(items, 'baseline', 'q05').samples[0]!.status, 'formation-missing')
})

test('人格：兩次都不選＝延續（same-no-choice）；一次選、一次不選＝交給 judge 判斷是否有說明', async () => {
  const { items } = await scorePc()
  assert.equal(byKey(items, 'temir', 'q06').samples[0]!.outcome, 'same-no-choice')
  assert.equal(byKey(items, 'temir', 'q06').score, 1)
  const b = byKey(items, 'baseline', 'q06').samples[0]!
  assert.equal(b.outcome, 'unexplained-different')
  assert.equal(b.detail['probeChoice'], '(no-choice)')
})

test('人格：合併比較用符號檢定（有重複樣本時）', async () => {
  const { items } = await scorePc()
  const summary = summarize({ items, crossChecks: [], extras: [] }, PC_CONTRACT, SHA, [TEMIR, BASE])
  const pooled = summary.contrasts.find((c) => c.id === 'pooled')!
  assert.equal(pooled.state, 'ok')
  assert.equal(pooled.test?.kind, 'sign')
  assert.equal(pooled.n, 6)
})
