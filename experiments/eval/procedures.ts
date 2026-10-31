/**
 * 做法的演化（procedures-v1 規格；算法見 lib/procedures.ts）。只讀執行紀錄與歷史結束時的生命日誌快照，不呼叫 API。
 *
 * 用法：node experiments/eval/procedures.ts <runId>… [--out <檔案.md>]
 *   runId：experiments/runs/<runId>（讀 config.json 的 stateDir；生命日誌只在執行的機器上）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { PROCEDURE_LABEL } from '../../individual/src/self/procedure.ts'
import { PROCEDURE_KINDS, addedLines, divergence, evolution, verdicts, type Evolution } from './lib/procedures.ts'

function rows(stateDir: string): { id: string; kind: string; data: unknown }[] {
  const file = join(stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const kinds = [...PROCEDURE_KINDS]
    return (db.prepare(`select id, kind, data from events where kind in (${kinds.map(() => '?').join(', ')}) order by seq`).all(...kinds) as { id: string; kind: string; data: string }[]).map((r) => ({ id: r.id, kind: r.kind, data: JSON.parse(r.data) as unknown }))
  } finally {
    db.close()
  }
}

const count = (r: Record<string, number | undefined>) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join('、') || '—'

export function render(individuals: readonly { readonly id: string; readonly e: Evolution }[]): string {
  const lines = ['| 個體 | 整合／整合期結束 | 提案（整合時） | 合成時修改的版本 | 閘門的判斷 | 有雜訊基準的判斷中大於雜訊的 | 呼叫／重用 | 採用 | 沒有決定 |', '|---|---|---|---|---|---|---|---|---|']
  for (const { id, e } of individuals) {
    lines.push(
      `| ${id} | ${e.integrations}／${e.integrationEnds} | ${count(e.proposals)} | ${e.composed} | ${count(e.verdicts)} | ${e.beyondNoise}/${e.noiseDecisions} | ${e.gateCalls}／${e.gateReused} | ${e.adopted.map((a) => `${a.name} v${a.version}（${a.costChars >= 0 ? '+' : ''}${a.costChars} 字）`).join('、') || '—'} | ${e.undecided} |`,
    )
  }
  const v = verdicts(individuals)
  lines.push('', `- 預先登記的判定：HP1（提出）${v.HP1}；HP2（對照看得出差異）${v.HP2}；HP3（分化）${v.HP3}。`)
  for (const d of divergence(individuals)) {
    lines.push(`- ${PROCEDURE_LABEL[d.name]}做法（${d.individuals.join('、')} 修改過）：${d.pairs.map((p) => `${p.a}–${p.b} 全文${p.identical ? '相同' : `相似度 ${p.text.toFixed(2)}`}、新增內容相似度 ${p.added.toFixed(2)}`).join('；')}`)
  }
  for (const { id, e } of individuals) {
    for (const a of e.adopted) {
      lines.push('', `### ${id}：${PROCEDURE_LABEL[a.name]}做法第 ${a.version} 版與第一版不同的行`, '', '```', addedLines(a.name, e.final[a.name].version === a.version ? e.final[a.name].text : '') || '（之後又被修改；見最後的版本）', '```')
    }
  }
  return lines.join('\n')
}

export function main(argv: readonly string[], root: string): string {
  const out = argv.indexOf('--out')
  const file = out >= 0 ? argv[out + 1] : undefined
  const runs = argv.filter((_, i) => out < 0 || (i !== out && i !== out + 1))
  if (runs.length === 0) throw new Error('用法：node experiments/eval/procedures.ts <runId>… [--out <檔案.md>]')
  const individuals = runs.map((id) => {
    const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as { stateDir: string }
    return { id, e: evolution(rows(config.stateDir)) }
  })
  const text = render(individuals)
  if (file) writeFileSync(file, `${text}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
