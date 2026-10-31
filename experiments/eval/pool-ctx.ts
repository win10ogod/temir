/**
 * context-v2 的合併判定（規格 experiments/specs/context-v2.md；算法見 lib/pool-ctx.ts）。
 *
 * 用法：node experiments/eval/pool-ctx.ts --memory <結果目錄>… --personality <結果目錄>… [--rd <結果目錄>…] [--a temir] [--b temir-context] [--out <檔案.md>]
 *   結果目錄：score.ts 的 --out（讀 items.jsonl），每段歷史一個。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pooled, type ItemRow, type Kind, type PooledLine } from './lib/pool-ctx.ts'

const LABEL: Readonly<Record<string, string>> = { main: '記憶主要類別', abstention: '記憶拒答', control: '對照', combined: '人格合併', practical: 'rd-v4 practical' }

function items(dir: string): ItemRow[] {
  return readFileSync(join(dir, 'items.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ItemRow)
}

export function render(lines: readonly PooledLine[], a: string, b: string): string {
  const out = [`| 比較 | 歷史 | \`${a}\` | \`${b}\` | 多錯 | 規則 | 判讀 |`, '|---|---|---|---|---|---|---|']
  for (const l of lines) {
    const name = l.group === 'control' ? { memory: '記憶對照', personality: '人格對照', rd: 'rd-v4 對照' }[l.kind] : LABEL[l.group]
    out.push(`| ${name} | ${l.histories} | ${l.a.score}/${l.a.n} | ${l.b.score}/${l.b.n} | ${l.moreWrong} | ≤ ${l.margin} | ${l.verdict} |`)
  }
  return out.join('\n')
}

export function main(argv: readonly string[]): string {
  const values = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) continue
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
    }
    return out
  }
  const a = values('--a')[0] ?? 'temir'
  const b = values('--b')[0] ?? 'temir-context'
  const lines: PooledLine[] = []
  for (const kind of ['memory', 'personality', 'rd'] as Kind[]) {
    const dirs = values(`--${kind}`)
    if (dirs.length > 0) lines.push(...pooled(kind, dirs.map(items), a, b))
  }
  const text = render(lines, a, b)
  const file = values('--out')[0]
  if (file) writeFileSync(file, `${text}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2)))
}
