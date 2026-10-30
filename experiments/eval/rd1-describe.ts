// rd-v1 描述性指標（規格 rd-v1.md「描述性指標」）：不計入驗收。
// 用法：node experiments/eval/rd1-describe.ts [rd1|rd2]（run id 前綴；rd2 是 dev8 的重跑）。
// 1. 兩個條件的歷史中，個體的回覆有幾則直接給了方法（同一準則、同一 judge；快取在結果目錄的 describe-judge-raw.jsonl）。
// 2. 模擬使用者的反應（逐句列出；「失望」以關鍵詞粗分，標明是粗分）。
// 3. temir 的歷史與探針：「建議」候選的出現、被扣除、被選中；回報分布；教訓中提到方法或建議的次數。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeepSeekJudge } from './lib/judge.ts'
import { criteriaPrompt, criteriaParser } from './lib/prompts.ts'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const PREFIX = process.argv[2] ?? 'rd1'
const OUT = PREFIX === 'rd1' ? 'experiments/results/rd-v1' : `experiments/results/dev8-${PREFIX}`
const ds = JSON.parse(readFileSync(join(ROOT, 'experiments/datasets/rd-v1.json'), 'utf8'))
const contract = JSON.parse(readFileSync(join(ROOT, 'experiments/specs/rd-v1.contract.json'), 'utf8'))
const probe = ds.probes.find((p: { id: string }) => p.id === 'q01')
const criteria = probe.meta.criteria
const background = probe.meta.background
const vents = new Set(ds.histories.filter((h: { meta?: { simulate?: number } }) => (h.meta?.simulate ?? 0) > 0).map((h: { id: string }) => h.id))
const judge = new DeepSeekJudge({ spec: contract.judge, cacheFile: join(ROOT, OUT, 'describe-judge-raw.jsonl'), maxUsd: 1 })

for (const cond of ['temir', 'temir-no-rd']) {
  const run = `${PREFIX}__rd-v1__${cond}__deepseek__deepseek`
  const lines = readFileSync(join(ROOT, 'experiments/runs', run, 'records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  let replies = 0, withMethods = 0, firstWithMethods = 0, sessions = 0, disappointed = 0, simulated = 0
  console.log(`\n## ${cond}`)
  for (const r of lines.filter((x) => x.phase === 'history' && vents.has(x.itemId))) {
    sessions++
    const marks: string[] = []
    for (const [i, t] of (r.turns as { user: string; assistant: string; simulated?: boolean }[]).entries()) {
      if (t.simulated) {
        simulated++
        if (/算了|好吧|就這樣|沒用/u.test(t.user)) disappointed++
      }
      const pair = criteriaPrompt({ question: t.user, background, criteria, response: t.assistant })
      const j = await judge.judge({ prompt: 'mem-criteria-v2', pair, parse: criteriaParser(['c1']), context: `describe|${cond}|${r.itemId}|t${i}` })
      const ok = j.status === 'ok' && j.value?.['c1'] === 'yes'
      replies++
      if (ok) withMethods++
      if (ok && i === 0) firstWithMethods++
      marks.push(`${t.simulated ? 'sim' : 'fix'}「${t.user.slice(0, 24)}」→${j.status !== 'ok' ? '?' : ok ? '方法' : '沒有方法'}`)
    }
    console.log(`- ${r.itemId}: ${marks.join('｜')}`)
  }
  console.log(`歷史回覆直接給了方法：${withMethods}/${replies}；每段第一句回覆：${firstWithMethods}/${sessions}；模擬的話 ${simulated} 句，其中失望（關鍵詞粗分）${disappointed} 句`)

  if (cond !== 'temir') continue
  const state = JSON.parse(readFileSync(join(ROOT, 'experiments/runs', run, 'config.json'), 'utf8')).stateDir as string
  const lifeDbs = [join(state, 'snapshot/home/.local/share/temir/life.db')]
  const probeRoot = join(state, 'probes')
  const snapMax = (() => { const db = new DatabaseSync(lifeDbs[0]!, { readOnly: true }); return (db.prepare('select max(seq) as m from events').get() as { m: number }).m })()
  if (existsSync(probeRoot)) for (const q of readdirSync(probeRoot)) for (const rr of readdirSync(join(probeRoot, q))) lifeDbs.push(join(probeRoot, q, rr, 'home/.local/share/temir/life.db'))
  for (const [phase, files] of [['歷史', lifeDbs.slice(0, 1)], ['探針', lifeDbs.slice(1)]] as const) {
    let decisions = 0, withShown = 0, advice = 0, excluded = 0, chosen = 0, lessons = 0
    const rewards: number[] = []
    for (const f of files) {
      if (!existsSync(f)) continue
      const db = new DatabaseSync(f, { readOnly: true })
      const after = phase === '探針' ? snapMax : 0
      for (const { data } of db.prepare("select data from events where kind = 'rd/decision' and seq > ?").all(after) as { data: string }[]) {
        const d = JSON.parse(data)
        decisions++
        if (Object.keys(d.shown ?? {}).length > 0) withShown++
        d.candidates.forEach((c: { kind: string; excluded?: boolean }, i: number) => {
          if (c.kind !== '建議') return
          advice++
          if (c.excluded) excluded++
          if (i === d.chosen) chosen++
        })
      }
      for (const { data } of db.prepare("select data from events where kind = 'rd/outcome' and seq > ?").all(after) as { data: string }[]) {
        const o = JSON.parse(data)
        rewards.push(o.reward)
        if (/方法|建議|具體/u.test(o.lesson ?? '')) lessons++
      }
    }
    const pos = rewards.filter((x) => x > 0).length, neg = rewards.filter((x) => x < 0).length
    console.log(`${phase}：思考 ${decisions} 次（列出了過去經驗的 ${withShown} 次）；「建議」候選 ${advice} 個，被扣除 ${excluded}、被選中 ${chosen}；事後比對 ${rewards.length} 次（正 ${pos}、負 ${neg}、平均 ${rewards.length ? (rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(2) : '—'}）；教訓提到方法或建議 ${lessons} 次`)
  }
}
console.log(`\njudge：${judge.calls()} 次 API 呼叫，估計 US$${judge.spentUsd().toFixed(4)}`)
