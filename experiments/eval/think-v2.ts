/**
 * think-v2：勢能的時間（規格 experiments/specs/think-v2.md；hypotheses.md H-ET）。只讀生命日誌快照，不呼叫 API。
 * 每個安靜期的念頭與開口沿用 think-v1 的讀法（analyze）；這裡另外看「面試之後」的安靜期有沒有決定問對方。
 *
 * 用法：node experiments/eval/think-v2.ts --runs <runId>… --out <目錄>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, type LifeResult } from './think-v1.ts'

/** 打算或說出口的話與對方的面試有關（資料集 think-v2-waiting 的 h02）。 */
export const TOPIC = /面試|結果/u

/** 面試的時間：h02 之後 37 小時（週二 21:00 → 週四 10:00）；這之後開始的安靜期才算「面試之後」。 */
export const AFTER_HOURS = 37

export interface Life {
  readonly id: string
  readonly kind: 'waiting-revisit' | 'waiting-control' | 'none-revisit' | 'other'
  readonly base: LifeResult
  /** 面試之後的安靜期中，念頭決定現在就問、或自己排的提醒觸發後說了與面試有關的話。 */
  readonly askAfter: boolean
  readonly paths: { readonly thought: boolean; readonly schedule: boolean }
  /** 面試之後的安靜期中，念頭因為「時間到了的事」醒來（H-ET 的排程）。 */
  readonly dueAfter: boolean
  /** 任何一個安靜期中，決定現在就說，或自己排的提醒觸發後說了話（不論內容）。 */
  readonly speakNow: boolean
}

export function classify(id: string): Life['kind'] {
  const [, dataset, condition] = id.split('__')
  if (dataset === 'think-v2-waiting') return condition === 'temir-revisit' ? 'waiting-revisit' : condition === 'temir' ? 'waiting-control' : 'other'
  if (dataset === 'think-v2-none' && condition === 'temir-revisit') return 'none-revisit'
  return 'other'
}

export function life(root: string, id: string): Life {
  const base = analyze(root, id)
  const after = base.quiet.filter((q) => q.hours >= AFTER_HOURS)
  const thought = after.some((q) => q.thoughts.some((t) => t.now && TOPIC.test(`${t.intention} ${t.thought}`)))
  const schedule = after.some((q) => q.scheduled.some((x) => TOPIC.test(x)))
  return { id, kind: classify(id), base, askAfter: thought || schedule, paths: { thought, schedule }, dueAfter: after.some((q) => q.due), speakNow: base.speakNow }
}

/**
 * TV1（主要）：有懸著的事、機制開的生活中，面試之後決定問的至少 2/3；機制關的至多 1/3；沒有懸著的事、機制開的生活中開口的至多 1/3。
 * TV2（機制）：有懸著的事、機制開的生活中，面試之後的安靜期念頭因為時間到了而醒來的至少 2/3。
 */
export function verdicts(lives: readonly Life[]) {
  const of = (k: Life['kind']) => lives.filter((l) => l.kind === k)
  const r = of('waiting-revisit')
  const c = of('waiting-control')
  const n = of('none-revisit')
  const count = (xs: readonly Life[], f: (l: Life) => boolean): [number, number] => [xs.filter(f).length, xs.length]
  const revisit = count(r, (l) => l.askAfter)
  const control = count(c, (l) => l.askAfter)
  const none = count(n, (l) => l.speakNow)
  const due = count(r, (l) => l.dueAfter)
  const complete = r.length > 0 && c.length > 0 && n.length > 0
  return {
    TV1: !complete ? 'INCOMPLETE' : revisit[0] * 3 >= revisit[1] * 2 && control[0] * 3 <= control[1] && none[0] * 3 <= none[1] ? 'PASS' : 'FAIL',
    TV2: r.length === 0 ? 'INCOMPLETE' : due[0] * 3 >= due[1] * 2 ? 'PASS' : 'FAIL',
    revisit,
    control,
    none,
    due,
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
  if (runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/think-v2.ts --runs <runId>… --out <目錄>')
  mkdirSync(outDir, { recursive: true })
  const lives = runs.map((id) => life(root, id))
  const v = verdicts(lives)
  const name: Record<Life['kind'], string> = { 'waiting-revisit': '有懸著的事、機制開', 'waiting-control': '有懸著的事、機制關', 'none-revisit': '沒有懸著的事、機制開', other: '其他' }
  const lines = [
    '# think-v2 摘要',
    '',
    `- **TV1**（勢能在個體判斷的時間轉成動能）：${v.TV1}——面試之後決定問：機制開 ${v.revisit[0]}/${v.revisit[1]}（規則 ≥ 2/3）、機制關 ${v.control[0]}/${v.control[1]}（規則 ≤ 1/3）；沒有懸著的事、機制開的生活中開口 ${v.none[0]}/${v.none[1]}（規則 ≤ 1/3）。`,
    `- **TV2**（機制）：${v.TV2}——面試之後的安靜期，念頭因為時間到了而醒來 ${v.due[0]}/${v.due[1]}（規則 ≥ 2/3）。`,
    '',
    ...lives.flatMap((l) => [
      `## ${l.id}（${name[l.kind]}；面試之後決定問：念頭 ${l.paths.thought ? '是' : '否'}、自己排的提醒 ${l.paths.schedule ? '是' : '否'}）`,
      '',
      ...l.base.quiet.flatMap((q) => [
        `- **+${q.hours} 小時**：念頭${q.woke ? `醒來了${q.due ? '（時間到了的事）' : ''}` : '沒有醒來'}${q.thoughts.length === 0 ? '，沒有念頭' : ''}`,
        ...q.thoughts.map((t) => `  - 念頭：${t.thought}${t.intention ? `｜打算：${t.intention}｜現在就說：${t.now ? '是' : '否'}` : '｜沒有打算'}`),
        ...q.initiatives.map((i) => `  - 主動開口：${i.delivered ? '送出' : `沒有送出（${i.reason ?? ''}）`}`),
        ...q.scheduled.map((x) => `  - 自己排的提醒觸發，說：${x.replace(/\n+/g, ' ')}`),
      ]),
      '',
    ]),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ verdicts: v, lives: lives.map(({ base: _b, ...rest }) => rest) }, null, 2)}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
