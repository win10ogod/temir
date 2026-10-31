import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pooled, type ItemRow } from '../lib/pool-ctx.ts'

const rows = (condition: string, category: string, scores: readonly number[]): ItemRow[] => scores.map((score) => ({ condition, historyModel: 'deepseek-flash', category, score }))

test('context-v2: histories are pooled and the margin is the per-history margin times the number of histories', () => {
  const h1 = [...rows('temir', 'knowledge-update', [1, 1, 1, 1]), ...rows('temir-context', 'knowledge-update', [0, 0, 0, 1]), ...rows('temir', 'abstention', [1]), ...rows('temir-context', 'abstention', [1]), ...rows('temir', 'control', [1]), ...rows('temir-context', 'control', [1])]
  const h2 = [...rows('temir', 'knowledge-update', [0, 1, 1, 1]), ...rows('temir-context', 'knowledge-update', [1, 1, 1, 1]), ...rows('temir', 'abstention', [1]), ...rows('temir-context', 'abstention', [1]), ...rows('temir', 'control', [1]), ...rows('temir-context', 'control', [1])]
  // 另一個模型的同名條件不算。
  const other: ItemRow[] = [{ condition: 'temir', historyModel: 'nvidia/nemotron', category: 'knowledge-update', score: 1 }]
  const [main] = pooled('memory', [h1, [...h2, ...other]], 'temir', 'temir-context')
  assert.deepEqual([main!.a, main!.b, main!.moreWrong, main!.margin, main!.verdict], [{ score: 7, n: 8 }, { score: 5, n: 8 }, 2, 4, 'PASS'])
  assert.equal(pooled('memory', [h1], 'temir', 'temir-context')[0]!.verdict, 'FAIL')
  // 缺格：一段歷史中只有一個條件。
  assert.equal(pooled('memory', [h1, rows('temir', 'knowledge-update', [1])], 'temir', 'temir-context')[0]!.verdict, 'INCOMPLETE')
})
