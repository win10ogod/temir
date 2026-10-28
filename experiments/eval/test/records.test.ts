/**
 * 紀錄讀取：損壞、缺漏、錯誤回合都要計入分母（記為失敗），不能被過濾掉。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRecordsText, selectSamples } from '../lib/records.ts'
import { BASE, SHA, TEMIR, jsonl, rec } from './helpers.ts'

const query = { phase: 'probe' as const, itemId: 'q01', condition: 'temir', historyModel: 'deepseek-flash', probeModel: 'deepseek-flash', expected: 1, expectedTurns: 1, datasetSha256: SHA }

test('正常紀錄 → ok，回傳最後一輪回覆', () => {
  const loaded = parseRecordsText(jsonl([rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '答案是麻糬' }])]), 'mem')
  const { samples } = selectSamples(loaded, query)
  assert.equal(samples[0]!.status, 'ok')
  assert.equal(samples[0]!.response, '答案是麻糬')
})

test('JSON 損壞的行：無法辨認題目 → protocol issue；該題記為 missing-record（仍在分母）', () => {
  const loaded = parseRecordsText('{"runId": "x", "phase": "probe", "itemId": "q01"\n', 'mem')
  assert.equal(loaded.records.length, 0)
  assert.equal(loaded.issues.length, 1)
  const { samples } = selectSamples(loaded, query)
  assert.equal(samples.length, 1)
  assert.equal(samples[0]!.status, 'missing-record')
})

test('欄位缺漏但能辨認題目 → malformed-record（失敗，不丟棄）', () => {
  const bad = { ...rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '答' }]) } as Record<string, unknown>
  delete bad['sessionId']
  const loaded = parseRecordsText(jsonl([bad]), 'mem')
  assert.equal(loaded.malformed.length, 1)
  const { samples } = selectSamples(loaded, query)
  assert.equal(samples[0]!.status, 'malformed-record')
  assert.match(samples[0]!.detail!, /sessionId/)
})

test('turns 內容型別錯誤 → malformed-record', () => {
  const bad = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '答' }]) as unknown as Record<string, unknown>
  ;(bad['turns'] as Record<string, unknown>[])[0]!['assistant'] = 42
  const { samples } = selectSamples(parseRecordsText(jsonl([bad]), 'mem'), query)
  assert.equal(samples[0]!.status, 'malformed-record')
})

test('回合錯誤（逾時等）→ turn-error；空回覆 → empty-response；回合數不符 → turn-count-mismatch', () => {
  const errored = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '', error: 'timeout after 900000ms' }])
  assert.equal(selectSamples(parseRecordsText(jsonl([errored]), 'm'), query).samples[0]!.status, 'turn-error')
  const empty = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '   ' }])
  assert.equal(selectSamples(parseRecordsText(jsonl([empty]), 'm'), query).samples[0]!.status, 'empty-response')
  const twoTurns = rec(TEMIR, 'probe', 'q01', [{ user: '1', assistant: 'a' }, { user: '2', assistant: 'b' }])
  assert.equal(selectSamples(parseRecordsText(jsonl([twoTurns]), 'm'), query).samples[0]!.status, 'turn-count-mismatch')
})

test('資料集 sha256 不符 → dataset-mismatch', () => {
  const other = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '答' }], { datasetSha256: '0'.repeat(64) })
  assert.equal(selectSamples(parseRecordsText(jsonl([other]), 'm'), query).samples[0]!.status, 'dataset-mismatch')
})

test('重複次數：不足補 missing-record，多出的回報 extras；依 repeat 欄位排序', () => {
  const r1 = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '第二次' }], { repeat: 1, startedAt: '2026-10-28T00:00:00.000Z' })
  const r0 = rec(TEMIR, 'probe', 'q01', [{ user: '問', assistant: '第一次' }], { repeat: 0, startedAt: '2026-10-28T00:05:00.000Z' })
  const loaded = parseRecordsText(jsonl([r1, r0]), 'm')
  const three = selectSamples(loaded, { ...query, expected: 3 })
  assert.deepEqual(three.samples.map((s) => s.status), ['ok', 'ok', 'missing-record'])
  assert.equal(three.samples[0]!.response, '第一次')
  const one = selectSamples(loaded, { ...query, expected: 1 })
  assert.equal(one.extras, 1)
})

test('不同條件的紀錄不會被混用；歷史紀錄不看 probeModel', () => {
  const loaded = parseRecordsText(
    jsonl([rec(BASE, 'probe', 'q01', [{ user: '問', assistant: '基準' }]), rec({ ...TEMIR, probeModel: 'EVE-27B' }, 'history', 'h01', [{ user: '說', assistant: '好' }])]),
    'm',
  )
  assert.equal(selectSamples(loaded, query).samples[0]!.status, 'missing-record')
  const hist = selectSamples(loaded, {
    phase: 'history',
    itemId: 'h01',
    condition: 'temir',
    historyModel: 'deepseek-flash',
    expected: 1,
    expectedTurns: 1,
    datasetSha256: SHA,
  })
  assert.equal(hist.samples[0]!.status, 'ok')
})
