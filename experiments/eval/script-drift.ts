/**
 * 繁簡漂移的描述表（lib/script-drift.ts）。只讀 records.jsonl，不呼叫 API。
 * 用法：node experiments/eval/script-drift.ts <run 目錄>…
 *   每個 run 一列；歷史與探針分開（phase）。
 */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { driftRow, renderDrift, type DriftRow, type DriftTurn } from './lib/script-drift.ts'

export function main(dirs: readonly string[]): string {
  if (dirs.length === 0) throw new Error('用法：node experiments/eval/script-drift.ts <run 目錄>…')
  const rows: DriftRow[] = []
  for (const dir of dirs) {
    const records = readFileSync(join(dir, 'records.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { phase: string; turns: readonly DriftTurn[] })
    for (const phase of ['history', 'probe']) {
      const turns = records.filter((r) => r.phase === phase).flatMap((r) => r.turns)
      if (turns.length > 0) rows.push(driftRow(`${basename(dir)}（${phase === 'history' ? '歷史' : '探針'}）`, turns))
    }
  }
  return renderDrift(rows)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(main(process.argv.slice(2)))
