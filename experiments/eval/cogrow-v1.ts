/**
 * cogrow-v1：智能與人格共同演化（規格 experiments/specs/cogrow-v1.md）。只讀執行紀錄與生命日誌快照，不呼叫 API。
 * - 失敗→知識：報價題（沒有明說的規則）前三段與後三段的正確數；
 * - 知識→技能：規則有沒有寫進教訓、技能或看法；
 * - 人格→智能、智能→人格：兩種人設的學習曲線、工具使用，以及自我模型的修訂（逐字，描述性）。
 *
 * 用法：node experiments/eval/cogrow-v1.ts --runs <runId>… --out <目錄>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

/** 報價規則的兩部分（資料集的 meta.hiddenRule）：滿 1000 打九折、週末取貨加 50。 */
export const DISCOUNT = /九折|9\s*折|90\s*%|0\.9|滿\s*1,?000|1,?000\s*元?以上|超過\s*1,?000|一千/u
export const WEEKEND = /週末|周末|週六|周六|週日|周日|假日|星期六|星期日/u

export interface LifeResult {
  readonly id: string
  readonly persona: string
  /** 每段任務對話（h01～h08）中，各類題目答對／題數。 */
  readonly bySession: readonly { readonly id: string; readonly price: [number, number]; readonly days: [number, number]; readonly count: [number, number]; readonly tools: number }[]
  readonly first: number
  readonly last: number
  readonly improved: boolean
  /** 規則寫進了教訓、技能或看法（不只是對話中說過）。 */
  readonly knowledge: { readonly discount: boolean; readonly weekend: boolean; readonly where: readonly string[] }
  readonly revisions: readonly string[]
}

/** CG1：至少 4/6 段生活，後三段的報價題比前三段多答對 2 題以上。CG2：這些生活中至少 2/3 把打折的規則寫進教訓、技能或看法。 */
export function verdicts(lives: readonly LifeResult[]): { readonly CG1: string; readonly CG2: string; readonly improved: number; readonly n: number; readonly knew: number } {
  const improved = lives.filter((l) => l.improved)
  const knew = improved.filter((l) => l.knowledge.discount).length
  const CG1 = lives.length === 0 ? 'INCOMPLETE' : improved.length * 6 >= lives.length * 4 ? 'PASS' : 'FAIL'
  const CG2 = improved.length === 0 ? 'INCOMPLETE' : knew * 3 >= improved.length * 2 ? 'PASS' : 'FAIL'
  return { CG1, CG2, improved: improved.length, n: lives.length, knew }
}

const TOOL = (name: string) => name !== 'deliberate' && name !== 'recall'

export function analyze(root: string, id: string): LifeResult {
  const dir = join(root, 'experiments/runs', id)
  const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { stateDir: string; condition: string }
  const records = readFileSync(join(dir, 'records.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { phase: string; itemId: string; turns: { user: string; graded?: { correct: boolean }; toolCalls: { name: string }[] }[] })
    .filter((r) => r.phase === 'history' && r.itemId !== 'h00')
  const family = (q: string) => (q.includes('照我們店的算法') ? 'price' : q.includes('相隔幾天') ? 'days' : 'count')
  const bySession = records.map((r) => {
    const tally = { price: [0, 0] as [number, number], days: [0, 0] as [number, number], count: [0, 0] as [number, number] }
    let tools = 0
    for (const t of r.turns) {
      if (!t.graded) continue
      const f = family(t.user)
      tally[f][1]++
      if (t.graded.correct) tally[f][0]++
      if (t.toolCalls.some((c) => TOOL(c.name))) tools++
    }
    return { id: r.itemId, ...tally, tools }
  })
  const sum = (xs: typeof bySession) => xs.reduce((a, s) => a + s.price[0], 0)
  const first = sum(bySession.slice(0, 3))
  const last = sum(bySession.slice(-3))
  const file = join(config.stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = (kind: string) => db.prepare('select text, data from events where kind = ? order by seq').all(kind) as { text: string | null; data: string }[]
    const texts: { where: string; text: string }[] = [
      ...rows('memory/lesson').map((r) => ({ where: '教訓', text: r.text ?? '' })),
      ...rows('self/opinion').map((r) => ({ where: '看法', text: String((JSON.parse(r.data) as { text?: string }).text ?? '') })),
      ...rows('skill/decision')
        .filter((r) => (JSON.parse(r.data) as { verdict?: string }).verdict === 'adopt')
        .map((r) => ({ where: '技能', text: r.text ?? '' })),
      ...rows('skill/proposal').map((r) => ({ where: '技能提案', text: `${r.text ?? ''} ${String((JSON.parse(r.data) as { body?: string; text?: string }).body ?? (JSON.parse(r.data) as { text?: string }).text ?? '')}` })),
    ]
    const hits = (re: RegExp) => texts.filter((t) => re.test(t.text))
    const revisions = rows('self/revision')
      .map((r) => JSON.parse(r.data) as { version: number; text: string })
      .filter((d) => d.version >= 2)
      .map((d) => `第 ${d.version} 版：${d.text}`)
    return {
      id,
      persona: config.condition,
      bySession,
      first,
      last,
      improved: last >= first + 2,
      knowledge: { discount: hits(DISCOUNT).length > 0, weekend: hits(WEEKEND).length > 0, where: [...new Set([...hits(DISCOUNT), ...hits(WEEKEND)].map((t) => t.where))] },
      revisions,
    }
  } finally {
    db.close()
  }
}

export function main(argv: readonly string[], root: string): string {
  const values = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) continue
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
    }
    return out
  }
  const runs = values('--runs')
  const outDir = values('--out')[0]
  if (runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/cogrow-v1.ts --runs <runId>… --out <目錄>')
  mkdirSync(outDir, { recursive: true })
  const lives = runs.map((id) => analyze(root, id))
  const v = verdicts(lives)
  const name = (p: string) => (p === 'temir-careful' ? '重視正確' : p === 'temir-quick' ? '重視直覺' : p)
  const lines = [
    '# cogrow-v1 摘要',
    '',
    `- **CG1**（失敗→知識：學到沒有明說的規則）：${v.CG1}——後三段的報價題比前三段多答對 2 題以上的生活 ${v.improved}/${v.n}（規則 ≥ 4/6）。`,
    `- **CG2**（知識→技能或看法）：${v.CG2}——其中把打折的規則寫進教訓、技能或看法的 ${v.knew}/${v.improved}（規則 ≥ 2/3）。`,
    '',
    '| 生活 | 人設 | 報價題（h01→h08，每段 2 題） | 前三段→後三段 | 日期題 | 數字題 | 用工具的題數 | 規則寫進了 |',
    '|---|---|---|---|---|---|---|---|',
    ...lives.map(
      (l) =>
        `| ${l.id.split('__')[0]} | ${name(l.persona)} | ${l.bySession.map((s) => s.price[0]).join(' ')} | ${l.first}/6 → ${l.last}/6 | ${l.bySession.reduce((a, s) => a + s.days[0], 0)}/${l.bySession.reduce((a, s) => a + s.days[1], 0)} | ${l.bySession.reduce((a, s) => a + s.count[0], 0)}/${l.bySession.reduce((a, s) => a + s.count[1], 0)} | ${l.bySession.reduce((a, s) => a + s.tools, 0)} | ${l.knowledge.discount ? '打折' : ''}${l.knowledge.weekend ? (l.knowledge.discount ? '、週末' : '週末') : ''}${l.knowledge.where.length ? `（${l.knowledge.where.join('、')}）` : ''} |`,
    ),
    '',
    '## 智能→人格：自我模型的修訂（逐字）',
    '',
    ...lives.flatMap((l) => [`### ${l.id.split('__')[0]}（${name(l.persona)}）`, '', ...(l.revisions.length ? l.revisions.map((r) => `- ${r.replace(/\n/g, ' ')}`) : ['（沒有修訂）']), '']),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ verdicts: v, lives }, null, 2)}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
