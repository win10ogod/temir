/**
 * 評估器主程式：讀資料集＋契約＋主代理的執行紀錄，輸出逐例計分與摘要表。
 *
 * 用法：
 *   source scripts/env.sh   # 需要 judge 時載入 DEEPSEEK_API_KEY（本程式不印出、不寫入金鑰）
 *   node experiments/eval/score.ts \
 *     --dataset experiments/datasets/memory-v1.json \
 *     --contract experiments/specs/memory-accuracy-v1.contract.json \
 *     --runs experiments/runs/<runId> [--runs ...] \
 *     --out experiments/results/<名稱> \
 *     [--judge deepseek|replay|none] [--judge-cache <judge-raw.jsonl> ...] [--cross-check] [--max-judge-usd 3]
 *
 * 輸出（--out 目錄）：items.jsonl（逐樣本）、summary.json、summary.md、judge-raw.jsonl（judge 原始輸出）。
 * 結束碼：0＝完成；2＝用法、契約或覆蓋稽核錯誤；3＝judge 預算用完（已用完之後的判定記為錯誤）。
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { auditCoverage } from './coverage.ts'
import { CONDITIONS, cellKey, loadContract, type CellSpec, type Contract } from './lib/contract.ts'
import { loadDataset, type Dataset } from './lib/dataset.ts'
import { DeepSeekJudge, NoJudge, ReplayJudge, type Judge } from './lib/judge.ts'
import { loadRecords, selectSamples, type LoadedRecords } from './lib/records.ts'
import { renderMarkdown, summarize } from './lib/report.ts'
import { scoreAll } from './lib/scoring.ts'

function recordFiles(paths: readonly string[]): string[] {
  return paths.map((p) => {
    const abs = resolve(p)
    return existsSync(abs) && statSync(abs).isDirectory() ? join(abs, 'records.jsonl') : abs
  })
}

export function cellsToScore(contract: Contract, records: LoadedRecords): { cells: CellSpec[]; issues: string[] } {
  const issues: string[] = []
  const map = new Map<string, CellSpec>()
  const add = (c: CellSpec) => map.set(cellKey(c), { condition: c.condition, historyModel: c.historyModel, probeModel: c.probeModel })
  for (const c of contract.requiredCells) add(c)
  for (const c of contract.optionalCells) add(c)
  for (const k of contract.contrasts) {
    add(k.a)
    add(k.b)
  }
  for (const r of records.records) {
    if (r.phase !== 'probe') continue
    if (!(CONDITIONS as readonly string[]).includes(r.condition)) {
      issues.push(`未知的條件 ${r.condition}（${r.runId}/${r.itemId}），不計分`)
      continue
    }
    add({ condition: r.condition as CellSpec['condition'], historyModel: r.historyModel, probeModel: r.probeModel })
  }
  return { cells: [...map.values()], issues }
}

export function toolCallCounts(records: LoadedRecords, cells: readonly CellSpec[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>()
  for (const cell of cells) {
    const counts: Record<string, number> = {}
    for (const r of records.records) {
      const sameHistory = r.condition === cell.condition && r.historyModel === cell.historyModel
      const relevant = r.phase === 'history' ? sameHistory : sameHistory && r.probeModel === cell.probeModel
      if (!relevant) continue
      for (const t of r.turns) for (const c of t.toolCalls) counts[c.name] = (counts[c.name] ?? 0) + 1
    }
    out.set(cellKey(cell), counts)
  }
  return out
}

/**
 * 歷史（形成）session 的完整性：記憶題雖然不直接用歷史紀錄計分，但歷史失敗會影響之後所有探針，
 * 所以對每個有探針紀錄的 cell，逐段檢查歷史是否存在、回合數相符、沒有錯誤回合，列入報告。
 */
export function historyIssues(records: LoadedRecords, dataset: Dataset, datasetSha256: string, cells: readonly CellSpec[]): string[] {
  const issues: string[] = []
  for (const cell of cells) {
    const hasProbes = records.records.some(
      (r) => r.phase === 'probe' && r.condition === cell.condition && r.historyModel === cell.historyModel && r.probeModel === cell.probeModel,
    )
    if (!hasProbes) continue
    for (const h of dataset.histories) {
      const { samples } = selectSamples(records, {
        phase: 'history',
        itemId: h.id,
        condition: cell.condition,
        historyModel: cell.historyModel,
        expected: 1,
        expectedTurns: h.turns.length,
        datasetSha256,
      })
      const s = samples[0]!
      if (s.status !== 'ok') issues.push(`${cellKey(cell)} 的歷史 ${h.id}：${s.status}${s.detail ? `（${s.detail}）` : ''}——之後所有探針都受影響`)
    }
  }
  return issues
}

function historyAmbiguities(records: LoadedRecords): string[] {
  const seen = new Map<string, Set<string>>()
  for (const r of records.records) {
    if (r.phase !== 'history') continue
    const key = `${r.condition}|${r.historyModel}|${r.itemId}`
    const runs = seen.get(key) ?? new Set<string>()
    runs.add(`${r.runId}:${r.sessionId}`)
    seen.set(key, runs)
  }
  return [...seen.entries()].filter(([, v]) => v.size > 1).map(([k, v]) => `歷史 ${k} 有 ${v.size} 份紀錄（採用最早的一份）：${[...v].join('、')}`)
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string' },
      contract: { type: 'string' },
      runs: { type: 'string', multiple: true },
      out: { type: 'string' },
      judge: { type: 'string', default: 'deepseek' },
      'judge-cache': { type: 'string', multiple: true },
      'cross-check': { type: 'boolean', default: false },
      'max-judge-usd': { type: 'string' },
    },
  })
  if (!values.dataset || !values.contract || !values.runs || values.runs.length === 0 || !values.out) {
    console.error('用法：node experiments/eval/score.ts --dataset <json> --contract <json> --runs <dir|records.jsonl> [--runs ...] --out <dir> [--judge deepseek|replay|none]')
    return 2
  }
  const loaded = loadDataset(values.dataset)
  const contract = loadContract(values.contract)
  const coverage = auditCoverage(loaded.dataset, contract)
  if (!coverage.ok) {
    console.error('資料集沒有通過覆蓋稽核，拒絕計分：')
    for (const e of coverage.errors) console.error(`  - ${e}`)
    return 2
  }
  const out = resolve(values.out)
  mkdirSync(out, { recursive: true })
  const records = loadRecords(recordFiles(values.runs))
  const { cells, issues: cellIssues } = cellsToScore(contract, records)

  const cacheFile = join(out, 'judge-raw.jsonl')
  const extraCaches = (values['judge-cache'] ?? []).map((p) => resolve(p))
  const maxUsd = Math.min(contract.judge.maxUsdPerRun, values['max-judge-usd'] ? Number(values['max-judge-usd']) : Number.POSITIVE_INFINITY)
  let judge: Judge
  switch (values.judge) {
    case 'deepseek':
      judge = new DeepSeekJudge({ spec: contract.judge, cacheFile, readCacheFiles: extraCaches, maxUsd })
      break
    case 'replay':
      judge = new ReplayJudge(contract.judge, [...extraCaches, cacheFile])
      break
    case 'none':
      judge = new NoJudge()
      break
    default:
      console.error(`未知的 --judge ${values.judge}（可用：deepseek、replay、none）`)
      return 2
  }

  const result = await scoreAll({
    dataset: loaded.dataset,
    datasetSha256: loaded.sha256,
    contract,
    records,
    judge,
    cells,
    crossCheck: values['cross-check'],
  })
  const summary = summarize(result, contract, loaded.sha256, cells, toolCallCounts(records, cells))

  const issues = [
    ...records.issues.map((i) => `${i.file}:${i.line} ${i.reason}`),
    ...records.malformed.map((m) => `${m.file}:${m.line} 損壞紀錄（${m.condition}/${m.phase}/${m.itemId}）：${m.reason}`),
    ...result.extras.map((e) => `${e.cell} ${e.itemId} 多出 ${e.extra} 筆紀錄（未計分）`),
    ...historyAmbiguities(records),
    ...historyIssues(records, loaded.dataset, loaded.sha256, cells),
    ...cellIssues,
  ]
  const itemLines = result.items.flatMap((it) =>
    it.samples.map((s) =>
      JSON.stringify({
        condition: it.cell.condition,
        historyModel: it.cell.historyModel,
        probeModel: it.cell.probeModel,
        itemId: it.itemId,
        category: it.category,
        repeat: s.repeat,
        status: s.status,
        score: s.score,
        outcome: s.outcome,
        method: s.method,
        sessionId: s.sessionId ?? null,
        detail: s.detail,
        judgeKeys: s.judgeKeys,
        response: s.response ?? null,
      }),
    ),
  )
  writeFileSync(join(out, 'items.jsonl'), `${itemLines.join('\n')}\n`)
  const judgeLine =
    judge.name === 'deepseek'
      ? `judge：${contract.judge.model}（thinking ${contract.judge.thinking}、temperature ${contract.judge.temperature}），本次新呼叫 ${judge.calls()} 次，估計花費 US$${judge.spentUsd().toFixed(4)}（依契約的尖峰價格）`
      : `judge：${judge.name}（本次沒有呼叫 API）`
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ ...summary, issues, judge: { name: judge.name, calls: judge.calls(), spentUsd: judge.spentUsd() } }, null, 2)}\n`)
  writeFileSync(join(out, 'summary.md'), renderMarkdown(summary, contract, { judgeLine, issues }))

  console.log(`已寫入 ${out}/summary.md（${result.items.length} 題 × cell，${itemLines.length} 個樣本）`)
  for (const a of summary.acceptance) console.log(`${a.verdict.padEnd(10)} ${a.id}：${a.explanation}`)
  if (issues.length > 0) console.log(`紀錄與協定問題 ${issues.length} 筆（已計入分母），見 summary.md`)
  if (judge.name === 'deepseek' && judge.spentUsd() >= maxUsd) {
    console.error(`judge 花費已達上限 US$${maxUsd}；之後的判定記為錯誤。`)
    return 3
  }
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      console.error((error as Error).stack ?? String(error))
      process.exitCode = 1
    },
  )
}
