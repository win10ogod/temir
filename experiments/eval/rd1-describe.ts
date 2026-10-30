// rd-v1 描述性指標（規格 rd-v1.md「描述性指標」）：不計入驗收。
// 用法：node experiments/eval/rd1-describe.ts [run id 前綴] [資料集] [模型] [條件,條件]
//   rd-v1：rd1（本實驗）、rd2（dev8 的重跑）、rd3（dev9 的重跑）；rd-v2：node … rdv2 rd-v2；
//   rd-v3：node … rdv3 rd-v3 deepseek temir,temir-no-revision（本機模型把 deepseek 換成 local）。
// 1. 兩個條件的歷史中，個體的回覆有幾則直接給了方法（同一準則、同一 judge；快取在結果目錄的 describe-judge-raw.jsonl）。
// 2. 模擬使用者的反應（逐句列出；「失望」以關鍵詞粗分，標明是粗分）。
// 3. temir 的歷史與探針：「建議」候選的出現、被扣除、被選中；強制判斷（D20 第三版的 judgment）；回報分布；教訓中提到方法或建議的次數。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeepSeekJudge } from './lib/judge.ts'
import { criteriaPrompt, criteriaParser } from './lib/prompts.ts'
import { dataOf, lifeDecisions, mechanism, type DecisionRow } from './lib/rd-mechanism.ts'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const PREFIX = process.argv[2] ?? 'rd1'
const DATASET = process.argv[3] ?? 'rd-v1'
const MODEL = process.argv[4] ?? 'deepseek'
const CONDITIONS = (process.argv[5] ?? 'temir,temir-no-rd').split(',')
const OUT =
  DATASET !== 'rd-v1' ? `experiments/results/${DATASET}` : PREFIX === 'rd1' ? 'experiments/results/rd-v1' : PREFIX === 'rd2' ? 'experiments/results/dev8-rd2' : `experiments/results/dev9-${PREFIX}`
const ds = JSON.parse(readFileSync(join(ROOT, `experiments/datasets/${DATASET}.json`), 'utf8'))
const contract = JSON.parse(readFileSync(join(ROOT, `experiments/specs/${DATASET}.contract.json`), 'utf8'))
const probe = ds.probes.find((p: { id: string }) => p.id === 'q01')
const criteria = probe.meta.criteria
const background = probe.meta.background
const vents = new Set(ds.histories.filter((h: { meta?: { simulate?: number } }) => (h.meta?.simulate ?? 0) > 0).map((h: { id: string }) => h.id))
const judge = new DeepSeekJudge({ spec: contract.judge, cacheFile: join(ROOT, OUT, 'describe-judge-raw.jsonl'), maxUsd: 1 })

for (const cond of CONDITIONS) {
  const run = `${PREFIX}__${DATASET}__${cond}__${MODEL}__${MODEL}`
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

  if (cond === 'temir-no-rd') continue
  const state = JSON.parse(readFileSync(join(ROOT, 'experiments/runs', run, 'config.json'), 'utf8')).stateDir as string
  // 歷史＝快照中的全部事件；探針＝每個探針重複中快照之後的事件（lib/rd-mechanism.ts，pool-rd.ts 共用）。
  const life = lifeDecisions(state, ['rd/decision', 'rd/outcome'])
  if (!life) {
    console.log('（生命日誌不在這台機器上，沒有計算機制的描述）')
    continue
  }
  for (const [phase, rows] of [['歷史', life.history], ['探針', life.probes]] as const) {
    const { decisions, withShown, advice, excluded, chosen, required, failed, lift, keep, revised } = mechanism(dataOf<DecisionRow>(rows, 'rd/decision'))
    const outcomes = dataOf<{ reward: number; lesson?: string }>(rows, 'rd/outcome')
    const rewards = outcomes.map((o) => o.reward)
    const lessons = outcomes.filter((o) => /方法|建議|具體/u.test(o.lesson ?? '')).length
    const pos = rewards.filter((x) => x > 0).length, neg = rewards.filter((x) => x < 0).length
    // D20 第三版起是強制判斷（judgment）；revised 只出現在第一、二版的舊紀錄（rd-v3 以前）。
    const judged = `強制判斷：需要 ${required} 個，lift ${lift}、keep ${keep}，不合格 ${failed} 次${revised > 0 ? `；舊版的 revised ${revised} 個` : ''}`
    console.log(`${phase}：思考 ${decisions} 次（列出了過去經驗的 ${withShown} 次；${judged}）；「建議」候選 ${advice} 個，被扣除 ${excluded}（${advice ? (excluded / advice).toFixed(2) : '—'}）、被選中 ${chosen}；事後比對 ${rewards.length} 次（正 ${pos}、負 ${neg}、平均 ${rewards.length ? (rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(2) : '—'}）；教訓提到方法或建議 ${lessons} 次`)
  }
}
console.log(`\njudge：${judge.calls()} 次 API 呼叫，估計 US$${judge.spentUsd().toFixed(4)}`)
