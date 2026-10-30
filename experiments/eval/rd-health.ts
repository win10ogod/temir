/**
 * RD 機制的健康度（dev14 規格；算法見 lib/rd-health.ts）。只讀執行紀錄與生命日誌，不呼叫 API。
 *
 * 用法：node experiments/eval/rd-health.ts <runId>… [--out <檔案.md>]
 *   runId：experiments/runs/<runId>（讀 config.json 的 stateDir；生命日誌只在執行的機器上）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HEALTH_KINDS, addHealth, emptyHealth, healthVerdict, type Health } from './lib/rd-health.ts'
import { lifeGroups } from './lib/rd-mechanism.ts'

const pct = (a: number, b: number) => (b > 0 ? `${a}/${b}（${((100 * a) / b).toFixed(1)}%）` : `${a}/0`)
const reasons = (r: Record<string, number>) => Object.entries(r).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join('、') || '—'

export function renderHealth(rows: readonly { readonly name: string; readonly h: Health }[]): string {
  const lines = [
    '| run | 思考：決定／沒有結果 | 思考重問（理由） | 事後比對：結果／沒有結果 | 比對重問（理由） | 列出經驗的決定 | 經驗→鄰居 | 沒有逐筆判斷 | sameAs 非空 | 有相符鄰居 | 輔助呼叫有 usage | finish |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ]
  for (const { name, h } of rows) {
    lines.push(
      `| ${name} | ${h.decisions}／${pct(h.deliberationFailed, h.decisions + h.deliberationFailed)} | ${h.deliberateRetries}（${reasons(h.deliberateRetryReasons)}） | ${h.outcomes}／${pct(h.outcomeFailed, h.outcomes + h.outcomeFailed)} | ${h.outcomeRetries}（${reasons(h.outcomeRetryReasons)}） | ${h.withShown} | ${pct(h.judgedNeighbors, h.shown)} | ${h.uncovered} | ${pct(h.sameAs, h.candidates)} | ${pct(h.supported, h.candidates)} | ${pct(h.auxWithUsage, h.auxCalls)} | ${reasons(h.finish)} |`,
    )
  }
  return lines.join('\n')
}

export function main(argv: readonly string[], root: string): string {
  const out = argv.indexOf('--out')
  const file = out >= 0 ? argv[out + 1] : undefined
  const runs = argv.filter((_, i) => out < 0 || (i !== out && i !== out + 1))
  if (runs.length === 0) throw new Error('用法：node experiments/eval/rd-health.ts <runId>… [--out <檔案.md>]')
  const rows: { name: string; h: Health }[] = []
  const total = emptyHealth()
  for (const id of runs) {
    const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as { stateDir: string }
    const groups = existsSync(config.stateDir) ? lifeGroups(config.stateDir, HEALTH_KINDS) : undefined
    if (!groups) throw new Error(`${id}：找不到生命日誌（${config.stateDir}）`)
    const history = addHealth(emptyHealth(), groups.history)
    const probes = groups.probes.reduce((h, life) => addHealth(h, life), emptyHealth())
    rows.push({ name: `${id}（歷史）`, h: history }, { name: `${id}（探針）`, h: probes })
    addHealth(total, groups.history)
    for (const life of groups.probes) addHealth(total, life)
  }
  rows.push({ name: '合計', h: total })
  const v = healthVerdict(total)
  const text = [
    renderHealth(rows),
    '',
    `- 機制門檻（dev14 規格，合計）：思考沒有結果 ≤ 5% ${v.deliberation ? 'PASS' : 'FAIL'}；事後比對沒有結果 ≤ 5% ${v.outcome ? 'PASS' : 'FAIL'}；列出的經驗都逐筆判斷 ${v.coverage ? 'PASS' : 'FAIL'}。`,
    `- 思考的 token（有回報的合計）：${total.reasoningTokens}。`,
  ].join('\n')
  if (file) writeFileSync(file, `${text}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
