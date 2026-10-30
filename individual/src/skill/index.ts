/**
 * temir-skill：個體寫給自己的技能（plan v2 M3；ADR-0003；流程見 skill.ts）。
 *
 * - 投影：生命日誌中採用的技能以 DSH 的執行期技能註冊（`ctx.skills.register`）。主模型在技能目錄中看到名字與說明，
 *   需要時用 DSH 的 skill 工具載入內容（WikiSkill：行動中的個體看技能，不看整理用的知識庫）。採用、修改或移除後立即更新。
 * - 回顧（閒置時）：上次回顧以後有 minLessons 條以上的新教訓、而且生命紀錄已有 idleMinutes 沒有新事件時，
 *   以個體最近使用的模型回顧一次，最多一個提案，接著跑閘門；修改後的版本最多再對照一輪（RRSI 的編輯預算）。
 *   計時器不讓程序多留（unref），所以一次性的執行與實驗的探針不會觸發。
 * - skill_propose：個體自己提出新增、修改或移除；閘門在背景執行，結果寫進生命紀錄。
 * - 使用紀錄：主模型用 skill 工具載入自己的技能時記一筆 skill/use，回顧與帳本看得到哪些技能有在用。
 *
 * 設定：automatic（預設開）、checkMinutes（5）、idleMinutes（20）、minLessons（2）、timeoutMs（120000）、
 * enabled（預設開；消融 patches/no-skill.yml 關閉：不註冊技能、沒有 skill_propose 與回顧）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '../life/index.ts'
import type { LifeEvent } from '../life/store.ts'
import { latestRoute } from '../integrate/index.ts'
import { auxRecord, callModel, type AuxRoute } from '../recall/aux.ts'
import { clip, resolveIds } from '../recall/retrieve.ts'
import {
  REVIEW_SYSTEM,
  SKILL_KIND,
  SKILL_OPS,
  lessonsSinceReview,
  ownSkills,
  parseProposal,
  pendingProposals,
  recordProposal,
  reviewInput,
  runGate,
  type ModelCall,
} from './skill.ts'

export const name = 'temir-skill'
export const inject = ['life', 'llm', 'tools', 'skills']

export interface Config {
  readonly enabled?: boolean
  readonly automatic?: boolean
  readonly checkMinutes?: number
  readonly idleMinutes?: number
  readonly minLessons?: number
  readonly timeoutMs?: number
}

export function apply(ctx: Context, config: Config | undefined): void {
  if (config?.enabled === false) return
  const life = ctx.life
  const logger = ctx.logger('temir-skill')
  const checkMs = (config?.checkMinutes ?? 5) * 60_000
  const idleMs = (config?.idleMinutes ?? 20) * 60_000
  const minLessons = config?.minLessons ?? 2
  const timeoutMs = config?.timeoutMs ?? 120_000

  // ── 投影：採用中的技能 → DSH 執行期技能 ──
  const registered = new Map<string, { readonly version: string; readonly dispose: () => void }>()
  function sync(): void {
    const own = new Map(ownSkills(life).map((s) => [s.name, s]))
    for (const [skillName, r] of registered) {
      if (own.get(skillName)?.version === r.version) continue
      r.dispose()
      registered.delete(skillName)
    }
    for (const s of own.values()) {
      if (registered.has(s.name)) continue
      const dispose = ctx.skills.register({
        name: s.name,
        description: s.description,
        ...(s.whenToUse ? { whenToUse: s.whenToUse } : {}),
        content: s.content,
        source: 'temir',
        metadata: { version: s.version, adoptedAt: new Date(s.adoptedAt).toISOString() },
      })
      registered.set(s.name, { version: s.version, dispose })
    }
  }
  sync()

  // ── 使用紀錄 ──
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (event.type !== 'assistant/message' || !life.isOpen) return
    const blocks = (event.data as { message: { content: readonly { type: string; name?: string; arguments?: string }[] } }).message.content
    for (const block of blocks) {
      if (block.type !== 'tool-call' || block.name !== 'skill') continue
      let skillName = ''
      try {
        skillName = String((JSON.parse(block.arguments ?? '{}') as { name?: unknown }).name ?? '')
      } catch {
        continue
      }
      const skill = registered.get(skillName)
      if (skill) life.append({ kind: SKILL_KIND.use, origin: 'self', session: session.id, data: { name: skillName, version: skill.version }, causes: [skill.version] })
    }
  })

  // ── 模型呼叫（每次都寫進生命日誌）與閘門 ──
  function caller(route: AuxRoute): ModelCall {
    const model = `${route.provider}/${route.model}`
    return async (system, input, purpose) => {
      try {
        const call = await callModel(ctx, route, system, input, AbortSignal.timeout(timeoutMs))
        if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose, ...auxRecord(call), input: clip(input, 8000), output: call.output } })
        return call.output
      } catch (error) {
        if (life.isOpen) life.append({ kind: 'memory/aux', origin: 'self', model, data: { purpose, error: String(error), input: clip(input, 8000) } })
        throw error
      }
    }
  }

  /** 一個提案的閘門；修改後的版本最多再對照一輪。 */
  async function gate(proposal: LifeEvent, route: AuxRoute): Promise<void> {
    let current: LifeEvent | undefined = proposal
    for (let round = 0; current && round < 2 && life.isOpen; round++) {
      const { next } = await runGate(life, current, caller(route))
      sync()
      current = next
    }
  }

  async function review(): Promise<void> {
    const route = latestRoute(life)
    if (!route) return
    for (const pending of pendingProposals(life)) await gate(pending, route)
    const output = await caller(route)(REVIEW_SYSTEM, reviewInput(life), 'skill-review')
    if (!life.isOpen) return
    const proposal = parseProposal(output, 'review')
    const event = proposal ? recordProposal(life, proposal) : undefined
    life.append({ kind: SKILL_KIND.review, origin: 'self', data: { proposal: event?.id ?? null }, causes: event ? [event.id] : [] })
    if (event) await gate(event, route)
  }

  let running: Promise<void> | undefined
  const run = (work: () => Promise<void>): Promise<void> => {
    const task = (running ?? Promise.resolve())
      .then(work)
      .catch((error) => logger.warn('skill work failed: %s', error))
      .finally(() => {
        if (running === task) running = undefined
      })
    running = task
    return task
  }

  if (config?.automatic ?? true) {
    let quietAfter = -1
    const timer = setInterval(() => {
      try {
        if (running || !life.isOpen || life.lastSeq() === quietAfter) return
        const last = life.recent(1)[0]
        if (!last || Date.now() - last.ts < idleMs) return
        if (lessonsSinceReview(life) < minLessons && pendingProposals(life).length === 0) {
          quietAfter = life.lastSeq()
          return
        }
        void run(review).finally(() => {
          if (life.isOpen) quietAfter = life.lastSeq()
        })
      } catch (error) {
        logger.error('skill check failed: %s', error)
      }
    }, checkMs)
    timer.unref()
    ctx.effect(() => () => clearInterval(timer), 'temir-skill: stop idle check')
  }
  ctx.effect(
    () => async () => {
      if (running) await running
    },
    'temir-skill: finish running gate',
  )

  ctx.tools.register(
    defineTool({
      name: 'skill_propose',
      description:
        '提出一個寫給自己的技能：新增、修改或移除。技能是「在什麼情況下、具體怎麼做某一類事」的做法說明，不是關於某個人的事實（那些記在記憶裡），也不是你是誰（那是自我模型）。提出後會在背景用你過去的處境對照「有沒有這個技能」時你的回覆，由你自己判斷要不要採用；結果記在生命紀錄中，採用的技能之後會出現在技能目錄，需要時用 skill 工具載入。',
      parameters: {
        op: { type: 'string', enum: SKILL_OPS, required: true, description: 'add＝新增；revise＝修改既有的技能；retire＝不再使用既有的技能' },
        name: { type: 'string', required: true, description: '技能的名字：英文小寫、數字與連字號，例如 listen-before-advising' },
        description: { type: 'string', description: '一句話說明這個技能是什麼（新增或修改時必填）' },
        when_to_use: { type: 'string', description: '在什麼情況下用它' },
        content: { type: 'string', description: '技能本身：具體的做法（新增或修改時必填）' },
        purpose: { type: 'string', required: true, description: '為什麼需要它：哪些教訓或經歷讓你想這樣做' },
        evidence: { type: 'array', items: { type: 'string' }, description: '支持它的生命紀錄事件 id（回憶中方括號內的 id）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const route = latestRoute(life)
        if (!route) throw new Error('還沒有可以用來對照的模型紀錄')
        const evidence = resolveIds(life, args.evidence ?? [])
        const missing = evidence.filter((id) => !life.get(id))
        if (missing.length > 0) throw new Error(`生命紀錄中沒有這些事件：${missing.join(', ')}`)
        const proposal = parseProposal(
          { op: args.op, name: args.name, description: args.description ?? '', whenToUse: args.when_to_use ?? '', content: args.content ?? '', purpose: args.purpose, evidence },
          'self',
        )
        if (!proposal) throw new Error('op 只能是 add、revise 或 retire')
        const event = recordProposal(life, proposal)
        void run(() => gate(event, route))
        logger.info('skill proposal %s (%s %s) from session %s', event.id, proposal.op, proposal.name, exec.agent?.session.id ?? '-')
        return `已提出（${event.id}）。會在背景用過去的處境對照，結果記在生命紀錄中；採用的話，技能會出現在技能目錄。`
      },
    }),
  )
}
