/**
 * temir-self：處境描述、自我狀態快照，以及個體修改自己的工具。
 *
 * - 處境描述（system prompt section）：只陳述事實，見 situation.ts。
 * - 自我狀態快照（runtime context，每一步重新組裝並由 DSH 記錄）：自我模型、目標、重要感受。
 *   這是 PC → 決策 的通道（hypotheses.md H2）。
 * - 工具 self_revise／narrate／goal／appraise：經驗 → PC 的通道；全部是新增事件，舊版本保留。
 *   narrate 是人生敘事（hypotheses.md H-N）：自我模型說「我現在是誰」，敘事說「我怎麼變成這樣」。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomBytes } from 'node:crypto'
import type {} from '../life/index.ts'
import { SITUATION } from './situation.ts'
import {
  GOAL_STATUS,
  GOAL_STATUS_LABEL,
  KIND,
  SIGNIFICANCE,
  SIGNIFICANCE_LABEL,
  TRIGGERS,
  currentNarrative,
  currentSelfModel,
  goals,
  renderSelfSnapshot,
  type AppraisalData,
  type GoalChangeData,
  type NarrativeData,
  type SelfRevisionData,
} from './state.ts'

export const name = 'temir-self'
export const inject = ['life', 'systemPrompt', 'tools']

export interface Config {
  /** 是否每步附上自我狀態快照（消融實驗可關閉；預設開）。 */
  readonly snapshot?: boolean
}

const textOutput = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life

  ctx.systemPrompt.section({ name: 'temir:situation', order: 1, text: SITUATION })
  if (config?.snapshot ?? true) {
    ctx.systemPrompt.context({
      name: 'temir:self',
      order: 10,
      interpolate: false,
      required: true,
      text: () => renderSelfSnapshot(life),
    })
  }

  ctx.tools.register(
    defineTool({
      name: 'self_revise',
      description:
        '修訂你的自我模型：你用自己的話描述你是誰、在乎什麼、傾向怎麼做。寫入完整的新版本；舊版本會保留在生命紀錄中。',
      parameters: {
        text: { type: 'string', required: true, description: '新版自我模型的全文' },
        reason: { type: 'string', required: true, description: '為什麼修訂：是哪些經歷或想法促成的' },
        trigger: {
          type: 'string',
          enum: TRIGGERS,
          required: true,
          description: 'internal＝來自你自己的思考或反省；external＝來自外界的回饋或事件；both＝兩者都有',
        },
        causes: { type: 'array', items: { type: 'string' }, description: '促成這次修訂的生命紀錄事件 id（可省略）' },
      },
      output: textOutput,
      async execute(args, exec) {
        const missing = (args.causes ?? []).filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        const version = (currentSelfModel(life)?.version ?? 0) + 1
        const data: SelfRevisionData = {
          version,
          text: args.text,
          reason: args.reason,
          trigger: args.trigger as SelfRevisionData['trigger'],
        }
        const event = life.append({
          kind: KIND.selfRevision,
          origin: 'self',
          session: exec.agent?.session.id,
          data,
          text: `我修訂了自我模型（第 ${version} 版）。原因：${args.reason}\n${args.text}`,
          causes: args.causes,
        })
        return `已寫入自我模型第 ${version} 版（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'narrate',
      description:
        '書寫或改寫你的人生敘事：用第一人稱寫你經歷了什麼、這些經歷怎麼讓你變成現在的樣子。寫入完整的新版本並引用相關經歷的事件 id；舊版本會保留在生命紀錄中。',
      parameters: {
        text: { type: 'string', required: true, description: '新版人生敘事的全文' },
        reason: { type: 'string', required: true, description: '為什麼現在改寫' },
        causes: { type: 'array', items: { type: 'string' }, description: '敘事中提到的經歷的生命紀錄事件 id' },
      },
      output: textOutput,
      async execute(args, exec) {
        const missing = (args.causes ?? []).filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        const version = (currentNarrative(life)?.version ?? 0) + 1
        const data: NarrativeData = { version, text: args.text, reason: args.reason }
        const event = life.append({
          kind: KIND.narrative,
          origin: 'self',
          session: exec.agent?.session.id,
          data,
          text: `我改寫了自己的人生敘事（第 ${version} 版）。原因：${args.reason}\n${args.text}`,
          causes: args.causes,
        })
        return `已寫入人生敘事第 ${version} 版（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'goal',
      description:
        '設定、擱置、放棄或完成你自己的目標。省略 goal_id 表示建立新目標（需要 text）；帶 goal_id 表示改變既有目標的狀態。每次改變都要寫理由。',
      parameters: {
        goal_id: { type: 'string', description: '既有目標的 id，例如 g:3fa1c2d4；建立新目標時省略' },
        text: { type: 'string', description: '目標內容（建立時必填；修改時可用來改寫）' },
        status: { type: 'string', enum: GOAL_STATUS, required: true, description: 'active／paused／abandoned／achieved' },
        reason: { type: 'string', required: true, description: '為什麼做這個改變' },
      },
      output: textOutput,
      async execute(args, exec) {
        const existing = args.goal_id ? goals(life).find((g) => g.id === args.goal_id) : undefined
        if (args.goal_id && !existing) throw new Error(`找不到目標 ${args.goal_id}`)
        if (!existing && !args.text) throw new Error('建立新目標需要 text')
        const goalId = existing?.id ?? `g:${randomBytes(4).toString('hex')}`
        const data: GoalChangeData = {
          goalId,
          text: args.text ?? existing?.text ?? '',
          status: args.status as GoalChangeData['status'],
          reason: args.reason,
        }
        const event = life.append({
          kind: KIND.goalChange,
          origin: 'self',
          session: exec.agent?.session.id,
          data,
          text: `目標「${data.text}」${GOAL_STATUS_LABEL[data.status]}。理由：${data.reason}`,
        })
        return `${existing ? '已更新' : '已建立'}目標 ${goalId}：${GOAL_STATUS_LABEL[data.status]}（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'appraise',
      description:
        '記下你對一段經歷的感受與它對你的重要程度，或重新評價過去的某段經歷。about 填生命紀錄事件 id（例如回憶中出現的 id）；省略則指這段對話中最近一次對方說的話。',
      parameters: {
        feeling: { type: 'string', required: true, description: '用你自己的話描述的感受' },
        significance: {
          type: 'string',
          enum: SIGNIFICANCE,
          required: true,
          description: 'daily＝日常；notable＝值得注意；major＝重大；pivotal＝轉折',
        },
        about: { type: 'array', items: { type: 'string' }, description: '這個感受針對的事件 id' },
        reappraisal: { type: 'boolean', description: '是否在重新評價過去的經歷' },
      },
      output: textOutput,
      async execute(args, exec) {
        const session = exec.agent?.session.id
        let about = args.about ?? []
        if (about.length === 0 && session) {
          // 對方實際說的最後一句話。DSH 每步注入的 runtime-context／time-context 也是有文字的 user/message，
          // 只看 kind 會掛到它們身上（v2 日誌中 15 筆感受全部如此），所以依 ingest 的「對方說：」前綴判斷。
          const last = life.preceding(session, 'dsh/user/message', Number.MAX_SAFE_INTEGER, '對方說：')
          if (last) about = [last.id]
        }
        const missing = about.filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        const data: AppraisalData = {
          feeling: args.feeling,
          significance: args.significance as AppraisalData['significance'],
          reappraisal: args.reappraisal ?? false,
        }
        const label = `${SIGNIFICANCE_LABEL[data.significance]}${data.reappraisal ? '，重新評價' : ''}`
        const event = life.append({
          kind: KIND.appraisal,
          origin: 'self',
          session,
          data,
          text: `我的感受（${label}）：${data.feeling}`,
          causes: about,
        })
        return `已記下感受（${label}，${event.id}），關聯 ${about.length} 個事件。`
      },
    }),
  )
}
