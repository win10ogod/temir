/**
 * temir-self：處境描述、自我狀態快照，以及個體修改自己的工具。
 *
 * - 處境描述（system prompt section）：只陳述事實，見 situation.ts。
 * - 自我狀態快照（runtime context，每一步重新組裝並由 DSH 記錄）：自我模型、目標、重要感受。
 *   這是 PC → 決策 的通道（hypotheses.md H2）。
 * - 工具 self_revise／narrate／goal／appraise：經驗 → PC 的通道；全部是新增事件，舊版本保留。
 *   narrate 是人生敘事（hypotheses.md H-N）：自我模型說「我現在是誰」，敘事說「我怎麼變成這樣」。
 * - 沉默的回合（silence.ts）：整個回合只有推理、沒有說出話就要結束時，提醒一次。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomBytes } from 'node:crypto'
import type {} from '../life/index.ts'
import { readFileSync } from 'node:fs'
import { resolveIds } from '../recall/retrieve.ts'
import { renderOwnSkills } from '../skill/skill.ts'
import { renderThoughts } from '../thought/thought.ts'
import { renderPotential } from './energy.ts'
import { SILENCE_KIND, SILENCE_NOTE, SilenceWatch } from './silence.ts'
import { situation } from './situation.ts'
import {
  GOAL_STATUS,
  GOAL_STATUS_LABEL,
  KIND,
  OPINION_STATUS,
  SIGNIFICANCE,
  SIGNIFICANCE_LABEL,
  TRIGGERS,
  applyPersona,
  currentNarrative,
  currentSelfModel,
  goals,
  opinions,
  renderSelfSnapshot,
  type AppraisalData,
  type GoalChangeData,
  type NarrativeData,
  type OpinionChangeData,
  type PersonaData,
  type SelfRevisionData,
} from './state.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-self': { readonly kind: 'temir-self' }
  }
}

export const name = 'temir-self'
export const inject = ['life', 'systemPrompt', 'tools']

export interface Config {
  /** 是否每步附上自我狀態快照（消融實驗可關閉；預設開）。 */
  readonly snapshot?: boolean
  /** 初始人設（PC 的初始狀態）。也可以用 personaFile 或環境變數 TEMIR_PERSONA_FILE 指向 JSON 檔。 */
  readonly persona?: { readonly name?: string; readonly selfModel: string; readonly story?: string }
  readonly personaFile?: string
  /** 能量（H-E，預設開）：快照中的「懸著的事」與「最近的念頭」。消融實驗可關閉。 */
  readonly energy?: boolean
}

/** 讀出設定中的初始人設；沒有設定時回傳 undefined。 */
export function configuredPersona(config: Config | undefined, env: NodeJS.ProcessEnv = process.env): PersonaData | undefined {
  if (config?.persona) return { ...config.persona, source: 'config' }
  const file = config?.personaFile ?? env['TEMIR_PERSONA_FILE']
  if (!file) return undefined
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; selfModel?: unknown; story?: unknown }
  if (typeof raw.selfModel !== 'string' || !raw.selfModel.trim()) throw new Error(`初始人設檔 ${file} 需要 selfModel（文字）`)
  return {
    ...(typeof raw.name === 'string' && raw.name.trim() ? { name: raw.name.trim() } : {}),
    selfModel: raw.selfModel.trim(),
    ...(typeof raw.story === 'string' && raw.story.trim() ? { story: raw.story.trim() } : {}),
    source: file,
  }
}

/**
 * 性質 6：自我修復的判準是穩定性與適應性，兩者缺一不可。直接修訂自己（self_revise、narrate、goal、opinion）時也要寫出兩者，
 * 和整合期一致；判斷由個體自己做，這裡只確認兩者都有寫，不設任何門檻。
 */
const STABILITY = '穩定性：這個改變如何與你原本在乎的事、你的故事保持連貫，而不是無端的跳躍'
const ADAPTABILITY = '適應性：這個改變回應了哪些經歷（預測與實際的落差、對方的回饋、目標的進展）'

export function requireBoth(stability: string | undefined, adaptability: string | undefined): void {
  const missing = [!stability?.trim() && 'stability（穩定性）', !adaptability?.trim() && 'adaptability（適應性）'].filter(Boolean)
  if (missing.length > 0) throw new Error(`修訂自己時，穩定性與適應性兩者缺一不可：請補上 ${missing.join('、')}。`)
}

const textOutput = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const logger = ctx.logger('temir-self')

  // 初始人設只在生命還沒有任何自我修訂時寫入；已經寫入或個體已經修訂過自己，就不再動它。
  const persona = configuredPersona(config)
  if (persona) {
    const written = applyPersona(life, persona)
    if (written.length > 0) logger.info('initial persona written as self model version 1 (%s)', persona.source)
    else if (!life.latest(KIND.persona)) logger.warn('initial persona not applied: the individual has already revised itself')
  }
  ctx.systemPrompt.section({ name: 'temir:situation', order: 1, text: situation(life.latest(KIND.persona) !== undefined) })

  // 沉默的回合：整個回合只有推理、沒有說出話就要結束時，steer 一次讓回合多跑一步（silence.ts）。
  const silence = new SilenceWatch()
  ctx.on('session/event', (session: Session, event: SessionEvent) => silence.observe(session, event))
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    if (signal.aborted || !silence.claim(agent.session, turn)) return
    try {
      if (life.isOpen) life.append({ kind: SILENCE_KIND, origin: 'body', session: agent.session.id, data: { turn } })
      agent.steer(createUserMessage({ content: [{ type: 'text', text: SILENCE_NOTE }], source: { kind: 'temir-self' } }))
    } catch (error) {
      logger.warn('silence nudge failed: %s', error)
    }
  })
  if (config?.snapshot ?? true) {
    ctx.systemPrompt.context({
      name: 'temir:self',
      order: 10,
      interpolate: false,
      required: true,
      text: () => renderSelfSnapshot(life, [...((config?.energy ?? true) ? [...renderPotential(life), ...renderThoughts(life)] : []), ...renderOwnSkills(life)]),
    })
  }

  ctx.tools.register(
    defineTool({
      name: 'self_revise',
      description:
        '修訂你的自我模型：你用自己的話描述你是誰、在乎什麼、傾向怎麼做。寫入完整的新版本；舊版本會保留在生命紀錄中。要同時寫出這個改變的穩定性與適應性。',
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
        stability: { type: 'string', required: true, description: STABILITY },
        adaptability: { type: 'string', required: true, description: ADAPTABILITY },
      },
      output: textOutput,
      async execute(args, exec) {
        const causes = resolveIds(life, args.causes ?? [])
        const missing = causes.filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        requireBoth(args.stability, args.adaptability)
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
          data: { ...data, stability: args.stability.trim(), adaptability: args.adaptability.trim() },
          text: `我修訂了自我模型（第 ${version} 版）。原因：${args.reason}\n${args.text}`,
          causes,
        })
        return `已寫入自我模型第 ${version} 版（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'narrate',
      description:
        '書寫或改寫你的人生敘事：用第一人稱寫你經歷了什麼、這些經歷怎麼讓你變成現在的樣子。寫入完整的新版本並引用相關經歷的事件 id；舊版本會保留在生命紀錄中。要同時寫出這個改寫的穩定性與適應性。',
      parameters: {
        text: { type: 'string', required: true, description: '新版人生敘事的全文' },
        reason: { type: 'string', required: true, description: '為什麼現在改寫' },
        causes: { type: 'array', items: { type: 'string' }, description: '敘事中提到的經歷的生命紀錄事件 id' },
        stability: { type: 'string', required: true, description: STABILITY },
        adaptability: { type: 'string', required: true, description: ADAPTABILITY },
      },
      output: textOutput,
      async execute(args, exec) {
        const causes = resolveIds(life, args.causes ?? [])
        const missing = causes.filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        requireBoth(args.stability, args.adaptability)
        const version = (currentNarrative(life)?.version ?? 0) + 1
        const data: NarrativeData = { version, text: args.text, reason: args.reason }
        const event = life.append({
          kind: KIND.narrative,
          origin: 'self',
          session: exec.agent?.session.id,
          data: { ...data, stability: args.stability.trim(), adaptability: args.adaptability.trim() },
          text: `我改寫了自己的人生敘事（第 ${version} 版）。原因：${args.reason}\n${args.text}`,
          causes,
        })
        return `已寫入人生敘事第 ${version} 版（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'goal',
      description:
        '設定、擱置、放棄或完成你自己的目標。省略 goal_id 表示建立新目標（需要 text）；帶 goal_id 表示改變既有目標的狀態。每次改變都要寫理由，以及這個改變的穩定性與適應性。',
      parameters: {
        goal_id: { type: 'string', description: '既有目標的 id，例如 g:3fa1c2d4；建立新目標時省略' },
        text: { type: 'string', description: '目標內容（建立時必填；修改時可用來改寫）' },
        status: { type: 'string', enum: GOAL_STATUS, required: true, description: 'active／paused／abandoned／achieved' },
        reason: { type: 'string', required: true, description: '為什麼做這個改變' },
        stability: { type: 'string', required: true, description: STABILITY },
        adaptability: { type: 'string', required: true, description: ADAPTABILITY },
      },
      output: textOutput,
      async execute(args, exec) {
        const existing = args.goal_id ? goals(life).find((g) => g.id === args.goal_id) : undefined
        if (args.goal_id && !existing) throw new Error(`找不到目標 ${args.goal_id}`)
        if (!existing && !args.text) throw new Error('建立新目標需要 text')
        requireBoth(args.stability, args.adaptability)
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
          data: { ...data, stability: args.stability.trim(), adaptability: args.adaptability.trim() },
          text: `目標「${data.text}」${GOAL_STATUS_LABEL[data.status]}。理由：${data.reason}`,
        })
        return `${existing ? '已更新' : '已建立'}目標 ${goalId}：${GOAL_STATUS_LABEL[data.status]}（${event.id}）。`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'opinion',
      description:
        '寫下、改寫或放下你的一個看法或價值（例如什麼重要、某類事該怎麼做），並引用支持它的經歷（生命紀錄事件 id，回憶中方括號內的 id）。省略 opinion_id 表示新的看法；帶 opinion_id 表示改寫或放下既有的看法。每次都要寫理由，以及這個改變的穩定性與適應性。',
      parameters: {
        opinion_id: { type: 'string', description: '既有看法的 id，例如 o:3fa1c2d4；新的看法時省略' },
        text: { type: 'string', description: '看法本身（新的或改寫時必填；放下時可省略）' },
        status: { type: 'string', enum: OPINION_STATUS, required: true, description: 'held＝持有（新的或改寫）；dropped＝放下' },
        reason: { type: 'string', required: true, description: '為什麼持有、改寫或放下' },
        evidence: { type: 'array', items: { type: 'string' }, description: '支持它的生命紀錄事件 id（新的看法至少一個）' },
        stability: { type: 'string', required: true, description: STABILITY },
        adaptability: { type: 'string', required: true, description: ADAPTABILITY },
      },
      output: textOutput,
      async execute(args, exec) {
        const existing = args.opinion_id ? opinions(life).find((o) => o.id === args.opinion_id) : undefined
        if (args.opinion_id && !existing) throw new Error(`找不到看法 ${args.opinion_id}`)
        if (args.status === 'held' && !args.text && !existing) throw new Error('新的看法需要 text')
        if (args.status === 'dropped' && !existing) throw new Error('放下看法需要 opinion_id')
        const evidence = resolveIds(life, args.evidence ?? [])
        const missing = evidence.filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        if (!existing && evidence.length === 0) throw new Error('新的看法要引用至少一段支持它的經歷（evidence）')
        requireBoth(args.stability, args.adaptability)
        const opinionId = existing?.id ?? `o:${randomBytes(4).toString('hex')}`
        const data: OpinionChangeData = {
          opinionId,
          text: args.text ?? existing?.text ?? '',
          status: args.status as OpinionChangeData['status'],
          reason: args.reason,
          evidence,
        }
        const event = life.append({
          kind: KIND.opinion,
          origin: 'self',
          session: exec.agent?.session.id,
          data: { ...data, stability: args.stability.trim(), adaptability: args.adaptability.trim() },
          text: data.status === 'dropped' ? `我放下了一個看法：${data.text}。理由：${data.reason}` : `我的看法${existing ? '（改寫）' : ''}：${data.text}。理由：${data.reason}`,
          causes: evidence,
        })
        return `${data.status === 'dropped' ? '已放下' : existing ? '已改寫' : '已寫下'}看法 ${opinionId}（${event.id}）。`
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
        let about = resolveIds(life, args.about ?? [])
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
