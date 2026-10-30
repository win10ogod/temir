/**
 * 每個 run 的花費（改進清單第 5 項；算法與價表見 lib/cost.ts）。只讀紀錄與生命日誌，不呼叫 API。
 *
 * 用法：node experiments/eval/cost.ts <run 目錄>… [--life <life.db>]… [--after <seq>]
 *   run 目錄：experiments/runs/<runId>（讀 records.jsonl 與 config.json）。
 *   --life：這些 run 的生命日誌（輔助呼叫的用量在 memory/aux）。探針前會還原快照：同一份快照之後的各個探針生命，
 *     用 --after <快照的最大 seq> 只算快照之後的事件，否則快照中的輔助呼叫會重複計算。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { auxUsage, recordUsage, renderCost, summarize, type UsageLine, type UsageRecord } from './lib/cost.ts'

export function main(argv: readonly string[]): string {
  const runs: string[] = []
  const lives: string[] = []
  let after = 0
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--life') lives.push(argv[++i] ?? '')
    else if (a === '--after') after = Number(argv[++i])
    else runs.push(a)
  }
  if (runs.length === 0 && lives.length === 0) throw new Error('用法：node experiments/eval/cost.ts <run 目錄>… [--life <life.db>]… [--after <seq>]')
  const lines: UsageLine[] = []
  for (const dir of runs) {
    const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { simulatedUser?: { model?: string } }
    const records = readFileSync(join(dir, 'records.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as UsageRecord)
    lines.push(...recordUsage(records, config.simulatedUser?.model))
  }
  for (const file of lives) {
    if (!existsSync(file)) throw new Error(`找不到生命日誌：${file}`)
    const db = new DatabaseSync(file, { readOnly: true })
    const rows = db.prepare("select model, data from events where kind = 'memory/aux' and seq > ?").all(after) as { model: string | null; data: string }[]
    db.close()
    lines.push(...auxUsage(rows.map((r) => ({ model: r.model, data: JSON.parse(r.data) as unknown }))))
  }
  return renderCost(summarize(lines))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(main(process.argv.slice(2)))
