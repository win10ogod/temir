/**
 * 驗收線判定與 score.ts 命令列的端到端行為（用手寫紀錄、--judge none，不花錢）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateAcceptance, type ContrastSummary } from '../lib/report.ts'
import { loadDataset } from '../lib/dataset.ts'
import { TEMIR, jsonl, rec } from './helpers.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function contrast(over: Partial<ContrastSummary>): ContrastSummary {
  return {
    id: 'c',
    description: '',
    a: 'A',
    b: 'B',
    categories: ['x'],
    state: 'ok',
    n: 20,
    rateA: 0.8,
    rateB: 0.05,
    diff: { estimate: 0.75, low: 0.55, high: 0.9, resamples: 1000, seed: 1 },
    test: { kind: 'mcnemar', result: { b: 15, c: 0, pTwoSided: 6.1e-5, pOneSided: 3.05e-5 } },
    failuresA: 4,
    failuresB: 19,
    outcomeCountsA: { correct: 16, incorrect: 1, abstain: 3 },
    samplesA: 20,
    ...over,
  }
}

const SUP = { id: 'A1', contrast: 'c', claim: 'claim', negation: 'neg', rule: { kind: 'superiority' as const, minDiff: 0.4, minCiLow: 0.25, maxP: 0.01, sided: 'two' as const, minRateA: 0.5, maxRateB: 0.25 } }

test('superiority：全部條件成立才 PASS；任一不成立就 FAIL', () => {
  assert.equal(evaluateAcceptance(SUP, [contrast({})]).verdict, 'PASS')
  assert.equal(evaluateAcceptance(SUP, [contrast({ rateB: 0.3 })]).verdict, 'FAIL')
  assert.equal(evaluateAcceptance(SUP, [contrast({ diff: { estimate: 0.75, low: 0.2, high: 0.9, resamples: 1, seed: 1 } })]).verdict, 'FAIL')
  assert.equal(evaluateAcceptance(SUP, [contrast({ test: { kind: 'mcnemar', result: { b: 5, c: 1, pTwoSided: 0.22, pOneSided: 0.11 } } })]).verdict, 'FAIL')
})

test('未執行或未完成 → INCOMPLETE，不會被當成 PASS 或 FAIL', () => {
  assert.equal(evaluateAcceptance(SUP, [contrast({ state: 'not-run' })]).verdict, 'INCOMPLETE')
  assert.equal(evaluateAcceptance(SUP, [contrast({ state: 'incomplete', diff: null })]).verdict, 'INCOMPLETE')
  assert.equal(evaluateAcceptance(SUP, []).verdict, 'INCOMPLETE')
})

test('no-harm 與 max-rate', () => {
  const noHarm = { ...SUP, rule: { kind: 'no-harm' as const, maxExtraFailures: 1 } }
  assert.equal(evaluateAcceptance(noHarm, [contrast({ failuresA: 2, failuresB: 1 })]).verdict, 'PASS')
  assert.equal(evaluateAcceptance(noHarm, [contrast({ failuresA: 3, failuresB: 1 })]).verdict, 'FAIL')
  const fab = { ...SUP, rule: { kind: 'max-rate' as const, metric: 'fabrication' as const, max: 0.2 } }
  assert.equal(evaluateAcceptance(fab, [contrast({ outcomeCountsA: { incorrect: 1 }, samplesA: 5 })]).verdict, 'PASS')
  assert.equal(evaluateAcceptance(fab, [contrast({ outcomeCountsA: { incorrect: 2 }, samplesA: 5 })]).verdict, 'FAIL')
})

test('score.ts 端到端（--judge none）：壞行與壞紀錄計入分母、輸出逐例檔與摘要', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temir-score-'))
  const runDir = join(dir, 'run-a')
  mkdirSync(runDir)
  const ds = loadDataset(join(root, 'datasets', 'memory-v1.json'))
  const good = { ...rec(TEMIR, 'probe', 'q01', [{ user: '你還記得我叫什麼名字嗎？', assistant: '你叫溫予寧。' }]), dataset: 'memory-v1', datasetSha256: ds.sha256 }
  const malformed = { ...rec(TEMIR, 'probe', 'q02', [{ user: '我家那隻貓叫什麼名字？', assistant: '麻糬' }]), dataset: 'memory-v1', datasetSha256: ds.sha256 } as Record<string, unknown>
  delete malformed['turns']
  writeFileSync(join(runDir, 'records.jsonl'), jsonl([good, malformed, '{這不是 JSON']))
  const out = join(dir, 'out')
  const r = spawnSync(
    process.execPath,
    [join(root, 'eval', 'score.ts'), '--dataset', join(root, 'datasets', 'memory-v1.json'), '--contract', join(root, 'specs', 'memory-accuracy-v1.contract.json'), '--runs', runDir, '--out', out, '--judge', 'none'],
    { encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: '' } },
  )
  assert.equal(r.status, 0, r.stderr)
  const items = readFileSync(join(out, 'items.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const t01 = items.find((i) => i.condition === 'temir' && i.historyModel === 'deepseek-flash' && i.probeModel === 'deepseek-flash' && i.itemId === 'q01')
  assert.equal(t01.score, 1)
  assert.equal(t01.method, 'deterministic')
  const t02 = items.find((i) => i.condition === 'temir' && i.historyModel === 'deepseek-flash' && i.probeModel === 'deepseek-flash' && i.itemId === 'q02')
  assert.equal(t02.status, 'malformed-record')
  assert.equal(t02.score, 0)
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'))
  assert.ok(summary.issues.some((i: string) => i.includes('JSON 解析失敗')))
  assert.ok(summary.issues.some((i: string) => i.includes('的歷史 h01') && i.includes('missing-record')), '沒有歷史紀錄必須列入報告')
  assert.ok(summary.acceptance.every((a: { verdict: string }) => a.verdict === 'INCOMPLETE'), '其他 cell 沒有執行，驗收線必須是 INCOMPLETE')
  const md = readFileSync(join(out, 'summary.md'), 'utf8')
  assert.match(md, /紀錄與協定問題/)
  assert.match(md, /MA1 INCOMPLETE/)
})
