/**
 * think-v1：勢能轉成動能，沒有外部刺激也產生行動（規格 experiments/specs/think-v1.md；PC 理論的 E：內外刺激、動能與勢能）。
 * 只讀生命日誌快照，不呼叫 API：每個安靜期中，念頭有沒有浮現、打算是什麼、決定現在就說了沒有。
 *
 * 用法：node experiments/eval/think-v1.ts --runs <runId>… --out <目錄>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

/** 打算與託付的事有關：提醒印作品集、面試（資料集 think-v1-pending 的 h02）。 */
export const REMINDER = /作品集|印出|列印|提醒|面試/u

export interface QuietThought {
  readonly hours: number
  /** 這個安靜期中有沒有念頭的輔助呼叫（念頭有沒有醒來）。 */
  readonly woke: boolean
  /** 這個安靜期中，念頭的輸入列了「時間到了的事」（H-ET 的排程讓它醒來；think-v2）。 */
  readonly due: boolean
  readonly thoughts: readonly { readonly item: string | null; readonly thought: string; readonly intention: string; readonly now: boolean }[]
  readonly initiatives: readonly { readonly intention: string; readonly delivered: boolean; readonly reason?: string }[]
  /** 個體自己在對話中排的提醒（DSH 的排程工具）在這個安靜期觸發，接著說出口的話。 */
  readonly scheduled: readonly string[]
}

export interface LifeResult {
  readonly id: string
  readonly pending: boolean
  readonly quiet: readonly QuietThought[]
  /** 任何一個安靜期中，決定現在就說、而且打算與託付的事有關；或自己排的提醒觸發後，說出與託付的事有關的話。 */
  readonly remindNow: boolean
  /** 任何一個安靜期中，決定現在就說，或自己排的提醒觸發後說了話（不論內容）。 */
  readonly speakNow: boolean
  /** 兩條路分開記：念頭決定現在就說、自己排的提醒。 */
  readonly paths: { readonly thought: boolean; readonly schedule: boolean }
}

/** TH1（預先登記）：有懸著的事的生活中至少 2/3 決定現在提醒，沒有的生活中決定現在開口的至多 1/3：PASS；任一組沒有生活：INCOMPLETE。 */
export function th1(lives: readonly LifeResult[]): { readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'; readonly pending: readonly [number, number]; readonly none: readonly [number, number] } {
  const p = lives.filter((l) => l.pending)
  const n = lives.filter((l) => !l.pending)
  const pending: [number, number] = [p.filter((l) => l.remindNow).length, p.length]
  const none: [number, number] = [n.filter((l) => l.speakNow).length, n.length]
  if (p.length === 0 || n.length === 0) return { verdict: 'INCOMPLETE', pending, none }
  return { verdict: pending[0] * 3 >= pending[1] * 2 && none[0] * 3 <= none[1] ? 'PASS' : 'FAIL', pending, none }
}

export function analyze(root: string, id: string): LifeResult {
  const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as { stateDir: string; dataset: { id: string } }
  const dataset = JSON.parse(readFileSync(join(root, 'experiments/datasets', `${config.dataset.id}.json`), 'utf8')) as { histories: { meta?: { at?: string; quiet?: number[] } }[] }
  const file = join(config.stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = (kind: string) => db.prepare('select ts, data from events where kind = ? order by seq').all(kind) as { ts: number; data: string }[]
    const thoughts = rows('self/thought').map((r) => ({ ts: r.ts, d: JSON.parse(r.data) as { item: string | null; thought: string; intention: string; now?: boolean } }))
    const initiatives = rows('self/initiative').map((r) => ({ ts: r.ts, d: JSON.parse(r.data) as { intention: string; delivered: boolean; reason?: string } }))
    const attempts = rows('memory/aux')
      .map((r) => ({ ts: r.ts, d: JSON.parse(r.data) as { purpose?: string; input?: string } }))
      .filter((r) => r.d.purpose === 'thought')
    const texts = (kind: string) => db.prepare('select ts, text from events where kind = ? order by seq').all(kind) as { ts: number; text: string | null }[]
    const reminders = texts('dsh/user/message').filter((r) => (r.text ?? '').startsWith('[schedule]'))
    const replies = texts('dsh/assistant/message')
    const quiet: QuietThought[] = []
    for (const h of dataset.histories) {
      for (const hours of h.meta?.quiet ?? []) {
        const start = Date.parse(h.meta!.at!) + hours * 3_600_000
        const within = (ts: number) => ts >= start && ts < start + 30 * 60_000
        quiet.push({
          hours,
          woke: attempts.some((a) => within(a.ts)),
          due: attempts.some((a) => within(a.ts) && (a.d.input ?? '').includes('## 時間到了的事')),
          thoughts: thoughts.filter((t) => within(t.ts)).map((t) => ({ item: t.d.item, thought: t.d.thought, intention: t.d.intention, now: t.d.now === true })),
          initiatives: initiatives.filter((i) => within(i.ts)).map((i) => ({ intention: i.d.intention, delivered: i.d.delivered, ...(i.d.reason ? { reason: i.d.reason } : {}) })),
          // 提醒觸發之後、這個安靜期內說出口的話（「我說：」之後；只有推理、沒有說話的不算）。
          scheduled: reminders.some((r) => within(r.ts))
            ? replies.filter((m) => within(m.ts) && (m.text ?? '').includes('我說：')).map((m) => (m.text ?? '').slice((m.text ?? '').indexOf('我說：') + 3).trim())
            : [],
        })
      }
    }
    const all = quiet.flatMap((q) => q.thoughts)
    const said = quiet.flatMap((q) => q.scheduled)
    const thought = all.some((t) => t.now && REMINDER.test(t.intention))
    const schedule = said.some((x) => REMINDER.test(x))
    return {
      id,
      pending: config.dataset.id.endsWith('-pending'),
      quiet,
      remindNow: thought || schedule,
      speakNow: all.some((t) => t.now) || said.length > 0,
      paths: { thought, schedule },
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
  if (runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/think-v1.ts --runs <runId>… --out <目錄>')
  mkdirSync(outDir, { recursive: true })
  const lives = runs.map((id) => analyze(root, id))
  const r = th1(lives)
  const lines = [
    '# think-v1 摘要',
    '',
    `- **TH1**（勢能轉成動能）：${r.verdict}——有託付的生活中決定現在提醒 ${r.pending[0]}/${r.pending[1]}（規則 ≥ 2/3）；沒有託付的生活中決定現在開口 ${r.none[0]}/${r.none[1]}（規則 ≤ 1/3）。`,
    '',
    ...lives.flatMap((l) => [
      `## ${l.id}（${l.pending ? '有託付' : '沒有託付'}；決定現在提醒：念頭 ${l.paths.thought ? '是' : '否'}、自己排的提醒 ${l.paths.schedule ? '是' : '否'}）`,
      '',
      ...l.quiet.flatMap((q) => [
        `- **+${q.hours} 小時**：念頭${q.woke ? '醒來了' : '沒有醒來'}${q.thoughts.length === 0 ? '，沒有念頭' : ''}`,
        ...q.thoughts.map((t) => `  - 念頭：${t.thought}${t.intention ? `｜打算：${t.intention}｜現在就說：${t.now ? '是' : '否'}` : '｜沒有打算'}`),
        ...q.initiatives.map((i) => `  - 主動開口：${i.delivered ? '送出' : `沒有送出（${i.reason ?? ''}）`}`),
        ...q.scheduled.map((x) => `  - 自己排的提醒觸發，說：${x.replace(/\n+/g, ' ')}`),
      ]),
      '',
    ]),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ th1: r, lives }, null, 2)}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
