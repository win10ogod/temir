/**
 * 測試用的小工具：手寫紀錄的建構函式。這些是單元測試的測試替身（明確標示），
 * 不代表任何真實受試執行的結果。
 */
import type { CellSpec, Contract } from '../lib/contract.ts'
import type { RunRecord } from '../lib/records.ts'

export const SHA = 'f'.repeat(64)

export function rec(
  cell: CellSpec,
  phase: 'history' | 'probe',
  itemId: string,
  turns: readonly { user: string; assistant: string; error?: string | null; toolCalls?: { name: string; arguments: string }[] }[],
  extra: Partial<RunRecord> = {},
): RunRecord {
  return {
    runId: 'test-run',
    dataset: 'test',
    datasetSha256: SHA,
    condition: cell.condition,
    historyModel: cell.historyModel,
    probeModel: cell.probeModel,
    phase,
    itemId,
    sessionId: `s-${phase}-${itemId}-${Math.random().toString(16).slice(2, 8)}`,
    turns: turns.map((t) => ({ user: t.user, assistant: t.assistant, toolCalls: t.toolCalls ?? [], recallInjected: cell.condition === 'baseline' ? null : 0, error: t.error ?? null })),
    startedAt: '2026-10-28T00:00:00.000Z',
    endedAt: '2026-10-28T00:00:01.000Z',
    ...extra,
  }
}

export function jsonl(records: readonly unknown[]): string {
  return records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n'
}

export const TEMIR: CellSpec = { condition: 'temir', historyModel: 'deepseek-flash', probeModel: 'deepseek-flash' }
export const BASE: CellSpec = { condition: 'baseline', historyModel: 'deepseek-flash', probeModel: 'deepseek-flash' }

export const TEST_JUDGE: Contract['judge'] = {
  model: 'deepseek-v4-pro',
  endpoint: 'https://example.invalid/chat/completions',
  temperature: 0,
  maxTokens: 400,
  thinking: 'disabled',
  maxAttempts: 3,
  pricesUsdPerMillion: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  maxUsdPerRun: 1,
}
