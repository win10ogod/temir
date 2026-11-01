/**
 * 子代理不是個體本人（src/life/subagent.ts；使用者 2026-11-01「子代理不該知道自己是個體的一部分」）。
 * 組合是真的 DSH 0.2.2-alpha.2（session、agent loop、system prompt、tools、skills）加上個體的插件；
 * 只有模型是測試替身：一律回「好」的 LlmAdapter（單元測試專用，不連到任何地方）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Llm, { LlmAdapter, ToolCallId, createUserMessage, isAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import Agents from '@deepseek-ai/dsh-agent'
import Sessions from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Skills from '@deepseek-ai/dsh-skill'
import * as temirLife from '../src/life/index.ts'
import * as temirSelf from '../src/self/index.ts'
import * as temirRecall from '../src/recall/index.ts'
import * as temirRd from '../src/rd/index.ts'
import * as temirSkill from '../src/skill/index.ts'
import { LifeStore } from '../src/life/store.ts'
import { SKILL_KIND } from '../src/skill/skill.ts'

/** 個體自己的工具（src/*／index.ts 註冊的）。 */
const OWN_TOOLS = ['deliberate', 'recall', 'self_revise', 'narrate', 'goal', 'opinion', 'appraise', 'skill_propose']

function seedSkill(home: string): void {
  const life = LifeStore.open(home)
  try {
    const draft = { name: 'own-skill-x', description: '個體自己採用的技能', whenToUse: '測試', content: '內容' }
    const proposal = life.append({ kind: SKILL_KIND.proposal, origin: 'self', data: { ...draft, op: 'add', purpose: '測試', evidence: [], source: 'self' } })
    life.append({
      kind: SKILL_KIND.decision,
      origin: 'self',
      data: { proposal: proposal.id, op: 'add', name: draft.name, verdict: 'adopt', reasons: [], skill: draft, gate: 'none', costChars: 0, probes: [] },
    })
  } finally {
    life.close()
  }
}

const textOf = (content: unknown): string =>
  Array.isArray(content) ? content.map((b: { type?: string; text?: string }) => (b.type === 'text' ? (b.text ?? '') : '')).join('\n') : String(content ?? '')

test('a subagent gets none of the individual: no situation, self state, tools, skills, recall or deliberation; its events are kept as subagent work', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'temir-subagent-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  seedSkill(home)

  const ctx = new Context()
  const use = (plugin: unknown, config: unknown = {}) => (ctx as unknown as { plugin(p: unknown, c: unknown): Promise<unknown> }).plugin(plugin, config)
  for (const plugin of [Sessions, Projections, Agents, Llm, Prompt, Tools, NativeToolExecutor, Skills, Loop]) await use(plugin)
  await use(temirLife, { home })
  for (const plugin of [temirSelf, temirRecall, temirRd]) await use(plugin)
  await use(temirSkill, { automatic: false })

  // 每個 agent 的第一個請求先呼叫一個個體的工具（主 agent：recall；子代理：self_revise），之後回「好」。
  const requests: GenerateOptions[] = []
  const firstCall = new Map<string, { readonly name: string; readonly arguments: string }>()
  const adapter = new (class extends LlmAdapter {
    async *stream(request: GenerateOptions): AsyncGenerator<StreamChunk> {
      requests.push(request)
      const session = (request as { sessionId?: string }).sessionId ?? ''
      const call = firstCall.get(session)
      if (call && isAgentLoopRequest(request)) {
        firstCall.delete(session)
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(`call-${call.name}`), ...call } } as unknown as StreamChunk
      } else {
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '好' } } as unknown as StreamChunk
      }
      yield { type: 'finish', reason: { kind: 'stop' } } as unknown as StreamChunk
    }
  })()
  ctx.llm.registerAdapter(['fixture'], adapter)
  const agentOptions = { provider: 'fixture', model: 'fixture-model', maxTokens: 8192 }

  const main = await ctx.agents.create({ sessionId: randomUUID(), agentOptions } as never)
  const sub = await ctx.agents.create({
    sessionId: randomUUID(),
    parentAgent: main.agent,
    meta: { origin: 'subagent', parentSession: main.agent.session.id, delegationDepth: 1 },
    agentOptions,
  } as never)
  t.after(async () => {
    await sub.dispose()
    await main.dispose()
    await ctx.fiber.dispose()
  })

  firstCall.set(main.agent.session.id, { name: 'recall', arguments: '{"query":"測試"}' })
  firstCall.set(sub.agent.session.id, { name: 'self_revise', arguments: '{"text":"我是子代理","stability":"-","adaptability":"-"}' })
  main.agent.followup(createUserMessage({ content: [{ type: 'text', text: '你好，我是測試者' }], source: { kind: 'user' } }))
  await main.agent.whenIdle()
  sub.agent.followup(createUserMessage({ content: [{ type: 'text', text: '把這份清單排序：c、a、b' }], source: { kind: 'user' } }))
  await sub.agent.whenIdle()

  type Request = { readonly sessionId?: string; readonly messages: readonly { readonly role: string; readonly content: unknown }[]; readonly tools?: readonly { readonly name: string }[] }
  const loopRequests = (agent: { readonly session: { readonly id: string } }) =>
    (requests as unknown as Request[]).filter((r) => r.sessionId === agent.session.id && r.messages.some((m) => m.role === 'system'))
  const view = (r: Request) => ({
    system: r.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n'),
    user: r.messages.filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n'),
    tools: (r.tools ?? []).map((tool) => tool.name),
  })

  // 主 agent：照舊是個體。
  const mainFirst = loopRequests(main.agent)[0]
  assert.ok(mainFirst, 'the main agent made a request')
  const m = view(mainFirst)
  assert.match(m.system, /你的處境/)
  assert.match(m.system, /deliberate/)
  for (const name of OWN_TOOLS) assert.ok(m.tools.includes(name), `main agent has ${name}`)
  assert.match(m.user, /自我模型|生命紀錄/, 'the self snapshot reaches the main agent')
  assert.match(m.user, /deliberate/, 'the main agent is asked to deliberate')
  assert.deepEqual((await ctx.skills.list({ scope: main.agent } as never)).map((s) => s.name).filter((n) => n === 'own-skill-x'), ['own-skill-x'])

  // 子代理：組合原本的提示與工具都在，個體的一樣都沒有。
  const subRequests = loopRequests(sub.agent)
  assert.ok(subRequests.length > 0, 'the subagent made a request')
  for (const r of subRequests) {
    const s = view(r)
    assert.match(s.system, /DeepSeek Harness/, 'the composition’s own prompt is kept')
    assert.doesNotMatch(s.system, /你的處境|人工個體|deliberate/)
    for (const name of OWN_TOOLS) assert.ok(!s.tools.includes(name), `subagent has no ${name}`)
    assert.doesNotMatch(s.user, /自我模型|生命紀錄|回憶|deliberate|own-skill-x/)
    assert.match(s.user, /把這份清單排序/)
  }
  assert.deepEqual((await ctx.skills.list({ scope: sub.agent } as never)).filter((s) => s.name === 'own-skill-x'), [])

  // 生命日誌：子代理的事件照記，但是子代理的工作，不是對話。
  const life = ctx.get('life') as LifeStore
  const subEvents = life.slice(sub.agent.session.id, 0, Number.MAX_SAFE_INTEGER)
  assert.ok(subEvents.length > 0)
  for (const e of subEvents) {
    assert.ok(e.kind.startsWith('subagent/'), `${e.kind} is recorded as subagent work, not as the individual’s own conversation`)
    assert.ok(!e.text, `${e.kind} is not indexed for recall`)
  }
  assert.ok(subEvents.some((e) => e.kind === 'subagent/user/message'))
  const heard = life.allInSession(main.agent.session.id, 'dsh/user/message').filter((e) => e.text?.startsWith('對方說：'))
  assert.deepEqual(heard.map((e) => e.text), ['對方說：你好，我是測試者'])

  // 執行：主 agent 照常用得到自己的工具；子代理呼叫個體的工具被拒絕，什麼都沒寫進自我。
  type ToolResult = { readonly data: { readonly message: { readonly toolCallId: string; readonly isError?: boolean; readonly content: unknown } } }
  const resultOf = (events: readonly { readonly kind: string; readonly data: unknown }[], kind: string, callId: string) =>
    events.filter((e) => e.kind === kind).map((e) => (e.data as ToolResult).data.message).find((m) => m.toolCallId === callId)
  const mainRecall = resultOf(life.allInSession(main.agent.session.id, 'dsh/tool/result'), 'dsh/tool/result', 'call-recall')
  assert.ok(mainRecall, 'recall ran for the main agent')
  assert.notEqual(mainRecall.isError, true)
  const subRevise = resultOf(subEvents, 'subagent/tool/result', 'call-self_revise')
  assert.ok(subRevise, 'the subagent’s call got a result')
  assert.equal(subRevise.isError, true, 'self_revise is not available to the subagent')
  assert.match(textOf(subRevise.content), /unknown tool "self_revise"/)
  assert.equal(life.all('self/revision').length, 0, 'the subagent did not revise the individual')
})
