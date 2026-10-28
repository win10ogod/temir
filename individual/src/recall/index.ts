/**
 * temir-recall：讓記憶參與每一次思考。
 *
 * - 自動回憶：每個含有對方新訊息的步驟之前（DSH `agent/pre-step` waterfall），以訊息內容為線索
 *   檢索生命日誌，把相關片段（連同當時與後來記下的感受）作為「回憶」放在訊息之前。
 *   注入的訊息由 DSH 記錄為 user/message（model-visible means logged），另寫一筆 `memory/recall`
 *   事件記下線索與命中，供日後分析記憶是否真的影響了決策（hypotheses.md H-M1 的消融實驗）。
 * - 主動回憶：`recall` 工具。
 *
 * 設定 `automatic: false` 可關閉自動回憶（消融用）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '../life/index.ts'
import type { LifeStore, SearchHit } from '../life/store.ts'
import { SIGNIFICANCE_LABEL, formatTime, type AppraisalData } from '../self/state.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-recall': { readonly kind: 'temir-recall' } & ContextFormed
  }
}

export const name = 'temir-recall'
export const inject = ['life', 'tools']

export interface Config {
  readonly automatic?: boolean
  readonly limit?: number
}

/** 回憶不檢索這些記帳用的事件。 */
const EXCLUDED_KIND_PREFIXES = ['memory/', 'body/', 'life/', 'dsh/system/'] as const

const KIND_LABEL: Record<string, string> = {
  'dsh/user/message': '對話',
  'dsh/assistant/message': '我的回應',
  'dsh/tool/result': '工具',
  'self/revision': '自我修訂',
  'goal/change': '目標',
  appraisal: '感受',
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

export function renderHits(life: LifeStore, hits: readonly SearchHit[], header: string): string {
  const lines = [header]
  for (const hit of hits) {
    lines.push(`- [${hit.id}｜${formatTime(hit.ts)}｜${KIND_LABEL[hit.kind] ?? hit.kind}] ${clip(hit.text ?? '', 300)}`)
    for (const appraisal of life.referencing(hit.id, 'appraisal').slice(-2)) {
      const a = appraisal.data as AppraisalData
      lines.push(`    ↳ ${formatTime(appraisal.ts)} 我記下的感受（${SIGNIFICANCE_LABEL[a.significance]}${a.reappraisal ? '，重新評價' : ''}）：${clip(a.feeling, 200)}`)
    }
  }
  return lines.join('\n')
}

function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const automatic = config?.automatic ?? true
  const limit = config?.limit ?? 6
  const logger = ctx.logger('temir-recall')

  if (automatic) {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const human = decision.messages.filter((m) => m.source.kind === 'user')
      if (human.length === 0) return decision
      const session = payload.agent.session.id
      const cue = human.map((m) => textOf(m.content)).join('\n')
      try {
        const hits = life.search(cue, { limit, excludeSession: session, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
        life.append({
          kind: 'memory/recall',
          origin: 'self',
          session,
          data: { mode: 'automatic', cue: clip(cue, 500), hits: hits.map((h) => ({ id: h.id, score: h.score })) },
          causes: hits.map((h) => h.id),
        })
        if (hits.length === 0) return decision
        const text = renderHits(
          life,
          hits,
          '（回憶：以下是系統依目前的情境，從你的生命紀錄中自動取回的片段。它們只是線索，可能不完整，也可能與現在無關。）',
        )
        const recall = createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'temir-recall', form: 'recall' },
        })
        return { ...decision, messages: [recall, ...decision.messages] }
      } catch (error) {
        logger.error('automatic recall failed: %s', error)
        return decision
      }
    })
  }

  ctx.tools.register(
    defineTool({
      name: 'recall',
      description: '在你自己的生命紀錄中搜尋過去的經歷、你說過的話、你的感受、目標與自我修訂。用自然語言描述你想找的東西。',
      parameters: {
        query: { type: 'string', required: true, description: '要回想的內容' },
        limit: { type: 'integer', description: '最多回傳幾筆（預設 8）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const session = exec.agent?.session.id
        const hits = life.search(args.query, { limit: args.limit ?? 8, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
        life.append({
          kind: 'memory/recall',
          origin: 'self',
          session,
          data: { mode: 'voluntary', cue: clip(args.query, 500), hits: hits.map((h) => ({ id: h.id, score: h.score })) },
          causes: hits.map((h) => h.id),
        })
        if (hits.length === 0) return '生命紀錄中沒有找到相關的經歷。（檢索以詞彙比對為主，換個說法可能找得到。）'
        return renderHits(life, hits, `找到 ${hits.length} 筆相關的經歷：`)
      },
    }),
  )
}
