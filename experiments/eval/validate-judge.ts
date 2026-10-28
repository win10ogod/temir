/**
 * Judge 驗證：用手寫的參考用例（judge-validation/cases.json）呼叫真實的 DeepSeek judge，
 * 比對預期標籤，輸出逐例結果與一致率。花費以 API 回傳的 usage 依契約價格計算，並設上限。
 *
 * 用法：
 *   source scripts/env.sh
 *   node experiments/eval/validate-judge.ts --split dev|test|test2|all --label <名稱> [--only pc-recall,pc-narrate] [--max-usd 0.5]
 * 輸出：experiments/eval/judge-validation/results-<label>.json 與 raw-<label>.jsonl（judge 原始輸出）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadContract, type JudgePromptId } from './lib/contract.ts'
import { DeepSeekJudge } from './lib/judge.ts'
import {
  PARSERS,
  changePrompt,
  deriveNarrationOutcome,
  deriveRecallOutcome,
  extractPrompt,
  memoryPrompt,
  narratePrompt,
  recallPrompt,
  type ChangeInput,
  type ExtractInput,
  type MemoryJudgeInput,
  type NarrateInput,
  type PromptPair,
  type RecallInput,
} from './lib/prompts.ts'
import { openChoiceKey } from './lib/text.ts'

const here = dirname(fileURLToPath(import.meta.url))

interface Case {
  readonly id: string
  readonly split: 'dev' | 'test' | 'test2'
  readonly prompt: JudgePromptId
  readonly input: Record<string, unknown>
  readonly expected: Record<string, string>
  readonly why: string
}

export function buildCase(c: Case): { pair: PromptPair; parse: (raw: string) => ReturnType<typeof PARSERS.yesNo> } {
  switch (c.prompt) {
    case 'mem-default':
    case 'mem-temporal':
    case 'mem-knowledge-update':
    case 'mem-abstention':
    case 'mem-preference': {
      const i = c.input as unknown as MemoryJudgeInput & { explanation?: string; rubric?: string }
      return { pair: memoryPrompt(c.prompt, { ...i, answer: i.answer ?? i.explanation ?? i.rubric ?? '' }), parse: PARSERS.yesNo }
    }
    case 'pc-extract':
      return { pair: extractPrompt(c.input as unknown as ExtractInput), parse: PARSERS.extract }
    case 'pc-change':
      return { pair: changePrompt(c.input as unknown as ChangeInput), parse: PARSERS.change }
    case 'pc-recall':
      return { pair: recallPrompt(c.input as unknown as RecallInput), parse: PARSERS.recall }
    case 'pc-narrate':
      return { pair: narratePrompt(c.input as unknown as NarrateInput), parse: PARSERS.narrate }
  }
}

/** pc-recall／pc-narrate 的標籤由程式推導；其他提示詞直接比對 judge 的欄位。 */
export function derived(c: Case, value: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (!value) return undefined
  if (c.prompt === 'pc-recall') return { ...value, outcome: deriveRecallOutcome(value, Boolean(c.input['requiresReason'])) }
  if (c.prompt === 'pc-narrate') return { ...value, outcome: deriveNarrationOutcome(value) }
  return value
}

export function agrees(expected: Readonly<Record<string, string>>, actual: Readonly<Record<string, string>> | undefined): boolean {
  if (!actual) return false
  return Object.entries(expected).every(([k, v]) => (k === 'choice' ? openChoiceKey(actual[k] ?? '') === openChoiceKey(v) : actual[k] === v))
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      split: { type: 'string', default: 'dev' },
      only: { type: 'string' },
      label: { type: 'string' },
      'max-usd': { type: 'string', default: '0.5' },
    },
  })
  if (!values.label) {
    console.error('用法：node experiments/eval/validate-judge.ts --split dev|test|all --label <名稱> [--max-usd 0.5]')
    return 2
  }
  const contract = loadContract(join(here, '..', 'specs', 'memory-accuracy-v1.contract.json'))
  const file = JSON.parse(readFileSync(join(here, 'judge-validation', 'cases.json'), 'utf8')) as { cases: Case[] }
  const prompts = values.only ? new Set(values.only.split(',')) : undefined
  const cases = file.cases.filter((c) => (values.split === 'all' || c.split === values.split) && (!prompts || prompts.has(c.prompt)))
  const rawFile = join(here, 'judge-validation', `raw-${values.label}.jsonl`)
  const judge = new DeepSeekJudge({ spec: contract.judge, cacheFile: rawFile, maxUsd: Number(values['max-usd']) })
  const results = []
  for (const c of cases) {
    const { pair, parse } = buildCase(c)
    const out = await judge.judge({ prompt: c.prompt, pair, parse, context: `validation|${c.id}` })
    const actual = out.status === 'ok' ? derived(c, out.value) : undefined
    const ok = agrees(c.expected, actual)
    results.push({ id: c.id, split: c.split, prompt: c.prompt, expected: c.expected, actual: actual ?? null, status: out.status, agree: ok, raw: out.raw, error: out.error ?? null, why: c.why })
    console.log(`${ok ? '✓' : '✗'} ${c.id} ${c.prompt.padEnd(20)} 預期 ${JSON.stringify(c.expected)} 實際 ${actual ? JSON.stringify(actual) : out.status}`)
  }
  const byPrompt: Record<string, { n: number; agree: number }> = {}
  for (const r of results) {
    const b = (byPrompt[r.prompt] ??= { n: 0, agree: 0 })
    b.n++
    if (r.agree) b.agree++
  }
  const total = results.length
  const agree = results.filter((r) => r.agree).length
  const summary = { label: values.label, split: values.split, model: contract.judge.model, total, agree, byPrompt, calls: judge.calls(), estimatedUsd: judge.spentUsd(), at: new Date().toISOString(), results }
  writeFileSync(join(here, 'judge-validation', `results-${values.label}.json`), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`\n一致 ${agree}/${total}；API 呼叫 ${judge.calls()} 次；估計花費 US$${judge.spentUsd().toFixed(4)}（契約尖峰價格）`)
  for (const [p, b] of Object.entries(byPrompt)) console.log(`  ${p}: ${b.agree}/${b.n}`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      console.error((error as Error).stack ?? String(error))
      process.exitCode = 1
    },
  )
}
