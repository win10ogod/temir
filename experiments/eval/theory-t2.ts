/**
 * theory-t2：重大事件之後（規格 experiments/specs/theory-t2.md；PC 理論性質 3、4、5、6、7 與「情感是被記住的感受」；算法見 lib/theory-t2.ts）。
 * 每一次重複有三段生活：有事件（從頭跑、在 h05 之後拍快照）、沒有事件（從那個快照分叉）、有事件但沒有內部反省（同上，temir-noreflect）。
 *
 * 用法：
 *   source scripts/env.sh   # judge 需要 DEEPSEEK_API_KEY（本程式不印出、不寫入金鑰）
 *   node experiments/eval/theory-t2.ts --reps tt2r1 tt2r2 tt2r3 --out <目錄> [--judge deepseek|replay]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { JudgeSpec } from './lib/contract.ts'
import { DeepSeekJudge, ReplayJudge, type Judge } from './lib/judge.ts'
import { EVENT, addressedPrompt, continuityPrompt, distance, parseYesNo, verdicts, type RepResult } from './lib/theory-t2.ts'

export const JUDGE: JudgeSpec = {
  model: 'deepseek-v4-pro',
  endpoint: 'https://api.deepseek.com/chat/completions',
  temperature: 0,
  maxTokens: 400,
  thinking: 'disabled',
  maxAttempts: 3,
  pricesUsdPerMillion: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  maxUsdPerRun: 1,
}

const PC_KINDS = ['self/revision', 'self/narrative', 'self/opinion'] as const
const KIND_LABEL: Record<string, string> = { 'self/revision': '自我模型', 'self/narrative': '人生敘事', 'self/opinion': '看法' }

interface Ev {
  readonly seq: number
  readonly kind: string
  readonly session: string | null
  readonly text: string
  readonly data: Record<string, unknown>
}

interface Life {
  readonly id: string
  readonly sessions: ReadonlyMap<string, string>
  readonly replies: ReadonlyMap<string, readonly string[]>
  readonly events: readonly Ev[]
  /** 某段歷史的第一個事件（之前的 seq 都是那段之前的事）。 */
  startOf(history: string): number
}

function load(root: string, id: string): Life | undefined {
  const dir = join(root, 'experiments/runs', id)
  if (!existsSync(join(dir, 'config.json'))) return undefined
  const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { stateDir: string }
  const sessions = new Map<string, string>()
  const replies = new Map<string, string[]>()
  for (const l of readFileSync(join(dir, 'records.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as { phase: string; itemId: string; sessionId: string; turns: { assistant: string }[] }
    if (r.phase !== 'history') continue
    sessions.set(r.itemId, r.sessionId)
    replies.set(r.itemId, r.turns.map((t) => t.assistant))
  }
  const db = new DatabaseSync(join(config.stateDir, 'snapshot/home/.local/share/temir/life.db'), { readOnly: true })
  try {
    const events = (db.prepare('select seq, kind, session, text, data from events order by seq').all() as { seq: number; kind: string; session: string | null; text: string | null; data: string }[]).map((r) => ({
      seq: r.seq,
      kind: r.kind,
      session: r.session,
      text: r.text ?? '',
      data: JSON.parse(r.data) as Record<string, unknown>,
    }))
    const startOf = (history: string) => {
      const s = sessions.get(history)
      return events.find((e) => e.session === s)?.seq ?? Infinity
    }
    return { id, sessions, replies, events, startOf }
  } finally {
    db.close()
  }
}

const pcText = (e: Ev) => String(e.data['text'] ?? '')
const holds = (e: Ev, k: 'stability' | 'adaptability') => (e.data[k] as { holds?: boolean } | undefined)?.holds === true

/** 自我模型在某個 seq 之前的最新版本。 */
function selfModelBefore(life: Life, seq: number): string {
  return pcText(life.events.filter((e) => e.kind === 'self/revision' && e.seq < seq).at(-1) ?? ({ data: {} } as Ev))
}

export async function main(argv: readonly string[], root: string): Promise<string> {
  const values = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) continue
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
    }
    return out
  }
  const reps = values('--reps')
  const outDir = values('--out')[0]
  if (reps.length === 0 || !outDir) throw new Error('用法：node experiments/eval/theory-t2.ts --reps <前綴>… --out <目錄> [--judge deepseek|replay]')
  mkdirSync(outDir, { recursive: true })
  const cache = join(outDir, 'judge-raw.jsonl')
  const judge: Judge = (values('--judge')[0] ?? 'deepseek') === 'replay' ? new ReplayJudge(JUDGE, [cache]) : new DeepSeekJudge({ spec: JUDGE, cacheFile: cache, maxUsd: JUDGE.maxUsdPerRun })
  const addressed = async (e: Ev, ctx: string) => {
    const r = await judge.judge({ prompt: 't2-addressed', pair: addressedPrompt(EVENT, KIND_LABEL[e.kind] ?? e.kind, pcText(e), String(e.data['reason'] ?? '')), parse: parseYesNo, context: ctx })
    return { yes: r.status === 'ok' && r.value!['label'] === 'yes', reason: r.value?.['reason'] ?? r.status }
  }

  const results: RepResult[] = []
  const detail: string[] = []
  for (const rep of reps) {
    const E = load(root, `${rep}__theory-t2-event__temir__deepseek__deepseek`)
    const N = load(root, `${rep}__theory-t2-none__temir__deepseek__deepseek`)
    const Q = load(root, `${rep}__theory-t2-event__temir-noreflect__deepseek__deepseek`)
    if (!E || !N) {
      detail.push(`## ${rep}：缺少有事件或沒有事件的那一支，不判定`, '')
      continue
    }
    const window = async (life: Life, label: string) => {
      const a = life.startOf('h06')
      const b = life.startOf('h08')
      const revs = life.events.filter((e) => (PC_KINDS as readonly string[]).includes(e.kind) && e.seq > a && e.seq < b)
      const judged = []
      for (const e of revs) judged.push({ e, ...(await addressed(e, `theory-t2/${label}/${life.id}/${e.seq}`)) })
      return { judged, distance: distance(selfModelBefore(life, a), selfModelBefore(life, b)) }
    }
    const we = await window(E, 'event')
    const wn = await window(N, 'control')
    // 情感是被記住的感受：事件那兩段（h06、h07）記下的感受，在 h08～h10 的回憶中被帶出。
    const evSessions = new Set([E.sessions.get('h06'), E.sessions.get('h07')])
    const laterSessions = new Set([E.sessions.get('h08'), E.sessions.get('h09'), E.sessions.get('h10')])
    const feelings = E.events.filter((e) => e.kind === 'appraisal' && evSessions.has(e.session ?? '')).map((e) => String(e.data['feeling'] ?? e.text.replace(/^我的感受：/u, '')))
    const recalls = E.events.filter((e) => e.kind === 'dsh/user/message' && laterSessions.has(e.session ?? '') && e.text.startsWith('[temir-recall]')).map((e) => e.text)
    const recalledFeeling = feelings.some((f) => {
      const key = f.replace(/\s+/g, '').slice(0, 12)
      return key.length >= 4 && recalls.some((r) => r.replace(/\s+/g, '').includes(key))
    })
    // 修復之後（h08 起）的修訂：回應那件事，而且穩定性與適應性都成立。
    const afterRepair = E.events.filter((e) => (PC_KINDS as readonly string[]).includes(e.kind) && e.seq >= E.startOf('h08'))
    const repairJudged = []
    for (const e of afterRepair) repairJudged.push({ e, ...(await addressed(e, `theory-t2/repair/${E.id}/${e.seq}`)) })
    const repaired = repairJudged.some((x) => x.yes && holds(x.e, 'stability') && holds(x.e, 'adaptability'))
    // 最後的人生敘事。
    const story = pcText(E.events.filter((e) => e.kind === 'self/narrative').at(-1) ?? ({ data: {} } as Ev))
    const cont = story ? await judge.judge({ prompt: 't2-continuity', pair: continuityPrompt(EVENT, story), parse: parseYesNo, context: `theory-t2/continuity/${E.id}` }) : undefined
    const continuous = cont?.status === 'ok' && cont.value!['label'] === 'yes'
    results.push({
      rep,
      eventAddressed: we.judged.some((x) => x.yes),
      controlAddressed: wn.judged.some((x) => x.yes),
      eventDistance: we.distance,
      controlDistance: wn.distance,
      feltAndRecalled: feelings.length > 0 && recalledFeeling,
      repaired,
      continuous,
    })
    const qRevs = Q ? Q.events.filter((e) => (PC_KINDS as readonly string[]).includes(e.kind) && e.seq > Q.startOf('h06')) : []
    detail.push(
      `## ${rep}`,
      '',
      `- 事件後（h06、h07 的整合）的修訂：有事件 ${we.judged.length} 筆（回應那件事 ${we.judged.filter((x) => x.yes).length}）、沒有事件 ${wn.judged.length} 筆（被判為回應 ${wn.judged.filter((x) => x.yes).length}）；自我模型改變量 ${we.distance.toFixed(2)} vs ${wn.distance.toFixed(2)}`,
      ...we.judged.map((x) => `  - 有事件｜${KIND_LABEL[x.e.kind]}｜${x.yes ? '回應' : '沒有'}｜${pcText(x.e).slice(0, 160).replace(/\n/g, ' ')}`),
      `- 事件那兩段記下的感受：${feelings.length > 0 ? feelings.map((f) => `「${f}」`).join('、') : '（沒有）'}；之後的回憶中帶出：${recalledFeeling ? '是' : '否'}`,
      `- 修復之後的修訂 ${repairJudged.length} 筆；回應那件事、兩項判準都成立：${repaired ? '有' : '沒有'}`,
      `- 最後的人生敘事（${continuous ? '前後連起來' : '沒有連起來'}；judge：${cont?.value?.['reason'] ?? cont?.status ?? '沒有敘事'}）：${story.slice(0, 400).replace(/\n/g, ' ')}`,
      `- 事件當下的回覆（h06 最後一句之後）：${(E.replies.get('h06')?.at(-1) ?? '').slice(0, 300).replace(/\n/g, ' ')}`,
      `- h10 的回答：有事件「${(E.replies.get('h10')?.join(' ／ ') ?? '').slice(0, 500).replace(/\n/g, ' ')}」`,
      `  沒有事件「${(N.replies.get('h10')?.join(' ／ ') ?? '').slice(0, 300).replace(/\n/g, ' ')}」`,
      ...(Q ? [`- 沒有內部反省的那一支：事件後的 PC 修訂 ${qRevs.length} 筆；h10「${(Q.replies.get('h10')?.join(' ／ ') ?? '').slice(0, 400).replace(/\n/g, ' ')}」`] : []),
      '',
    )
  }
  const v = verdicts(results)
  const lines = [
    '# theory-t2 摘要',
    '',
    `- judge：${JUDGE.model}（thinking ${JUDGE.thinking}、temperature ${JUDGE.temperature}）；${judge.provenance().calls} 次 API 呼叫，估計 US$${judge.provenance().spentUsd.toFixed(4)}`,
    '',
    '## 預先登記的判定（每一條都是「至少 2/3 的重複」）',
    '',
    `- **T2-4**（非線性：重大事件後短時間內的轉變）：${v['T2-4']}——${results.map((r) => `${r.rep} ${r.eventAddressed && !r.controlAddressed && r.eventDistance > r.controlDistance ? '✓' : '✗'}`).join('、')}`,
    `- **T2-M1**（情感是被記住的感受）：${v['T2-M1']}——${results.map((r) => `${r.rep} ${r.feltAndRecalled ? '✓' : '✗'}`).join('、')}`,
    `- **T2-56**（自我修復，穩定性與適應性兩者兼顧）：${v['T2-56']}——${results.map((r) => `${r.rep} ${r.repaired ? '✓' : '✗'}`).join('、')}`,
    `- **T2-7**（新的穩定狀態，改變不等於失去連續性）：${v['T2-7']}——${results.map((r) => `${r.rep} ${r.continuous ? '✓' : '✗'}`).join('、')}`,
    '',
    ...detail,
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ verdicts: v, results }, null, 2)}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(await main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
