import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { LESSON_KIND } from '../src/integrate/carried.ts'
import { DECISION_KIND, OUTCOME_KIND } from '../src/rd/memory.ts'
import {
  SKILL_KIND,
  lessonsSinceReview,
  ownSkills,
  parseCompose,
  parseProposal,
  pendingProposals,
  probeSituations,
  recordProposal,
  renderOwnSkills,
  reviewInput,
  runGate,
  validateProposal,
  type ModelCall,
  type ProposalData,
  type SkillDecisionData,
} from '../src/skill/skill.ts'

function withStore(fn: (store: LifeStore) => Promise<void> | void): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-skill-'))
  const store = LifeStore.open(home)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    rmSync(home, { recursive: true, force: true })
  })
}

function decision(store: LifeStore, cue: string, situation: string, reward?: number, lesson = '') {
  const d = store.append({
    kind: DECISION_KIND,
    origin: 'self',
    session: 's1',
    data: { cue, situation, candidates: [], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: {}, selfVersion: 0 },
    text: `處境：${situation}`,
  })
  if (reward !== undefined) {
    store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { decision: d.id, didAction: '給了一長串建議', didKind: '建議', actual: '對方說只想被聽', matched: 'no', error: '', reward, reason: '', lesson, selfVersion: 0, heard: '' } })
  }
  return d
}

const LISTEN: ProposalData = {
  op: 'add',
  name: 'listen-before-advising',
  description: '對方抒發時先聽，不急著給建議',
  whenToUse: '對方在抒發工作上的壓力或不愉快',
  content: '- 先回應感受\n- 對方沒有問，就不給建議',
  purpose: '幾次給建議都換來對方說只想被聽',
  evidence: [],
  source: 'review',
}

/** 測試替身（單元測試專用）：依呼叫目的回傳固定的輸出，並記下收到的輸入。 */
function scripted(compose: string): { call: ModelCall; inputs: { purpose: string; input: string }[] } {
  const inputs: { purpose: string; input: string }[] = []
  const call: ModelCall = async (_system, input, purpose) => {
    inputs.push({ purpose, input })
    if (purpose === 'skill-probe') return input.includes('你寫給自己的技能') ? '聽起來真的很累，我在聽。' : '你可以試試這三個方法……'
    return compose
  }
  return { call, inputs }
}

test('parseProposal: op none or non-JSON yields nothing; fields are bounded and the name is lower-cased', () => {
  assert.equal(parseProposal('{"op":"none"}', 'review'), undefined)
  assert.equal(parseProposal('沒有', 'review'), undefined)
  const p = parseProposal('{"op":"add","name":"Listen-First","description":"d","whenToUse":"w","content":"c","purpose":"p","evidence":["l:1"]}', 'review')!
  assert.deepEqual([p.op, p.name, p.evidence, p.source], ['add', 'listen-first', ['l:1'], 'review'])
  assert.equal(parseProposal({ op: 'retire', name: 'x', content: 'ignored', purpose: '不用了' }, 'self')!.content, '')
})

test('parseCompose: adopt needs concrete reasons; revise needs revised content; anything else is a reject', () => {
  assert.equal(parseCompose('{"verdict":"adopt","reasons":[]}').verdict, 'reject', 'adopt without an observation is not evidence')
  assert.equal(parseCompose('{"verdict":"adopt","reasons":[{"situation":"S1","observation":"有技能時先回應了感受"}]}').verdict, 'adopt')
  const r = parseCompose('{"verdict":"revise","reasons":[{"situation":"S2","observation":"太冷淡"}],"revised":{"description":"d2","whenToUse":"w2","content":"c2"}}')
  assert.deepEqual([r.verdict, r.revised?.content], ['revise', 'c2'])
  assert.equal(parseCompose('{"verdict":"revise","reasons":[{"situation":"S1","observation":"x"}],"revised":null}').verdict, 'reject')
  assert.equal(parseCompose('看不懂').verdict, 'reject')
})

test('validateProposal: names, targets, limits, and a rejected proposal cannot simply be proposed again', () =>
  withStore(async (store) => {
    assert.match(validateProposal(store, { ...LISTEN, name: 'Listen First' })!, /不符合規則/)
    assert.match(validateProposal(store, { ...LISTEN, op: 'revise' })!, /沒有叫/)
    assert.match(validateProposal(store, { ...LISTEN, content: '' })!, /不能是空的/)
    assert.equal(validateProposal(store, LISTEN), undefined)
    decision(store, '今天又被主管念了', '對方在抒發工作上的壓力', -0.5)
    const proposal = recordProposal(store, LISTEN)
    await runGate(store, proposal, scripted('{"verdict":"reject","reasons":[{"situation":"S1","observation":"差異不是我要的"}]}').call)
    assert.match(validateProposal(store, LISTEN)!, /被否決過/)
    assert.equal(validateProposal(store, { ...LISTEN, content: '- 先回應感受，再問對方想不想聽建議' }), undefined, 'different content may be proposed again')
  }))

test('probeSituations: cited decisions first, then lexical similarity; nothing similar means no probe', () =>
  withStore((store) => {
    const unrelated = decision(store, '幫我算 3 加 5', '對方問算術')
    const vent = decision(store, '今天又被主管念了一頓', '對方在抒發工作上的壓力', -0.5, '對方抒發時不要急著給建議')
    const cited = decision(store, '晚餐吃什麼', '對方問晚餐')
    const picked = probeSituations(store, { ...LISTEN, evidence: [cited.id] })
    assert.deepEqual(picked.map((s) => s.decision.id), [cited.id, vent.id])
    assert.equal(picked[1]!.outcome?.reward, -0.5)
    assert.ok(!picked.some((s) => s.decision.id === unrelated.id))
    assert.deepEqual(probeSituations(store, { description: '寫程式', whenToUse: '除錯', evidence: [] }), [])
  }))

test('runGate: adopt after a behaviour contrast; the skill is projected, listed in the snapshot and its use is counted', () =>
  withStore(async (store) => {
    decision(store, '今天又被主管念了一頓', '對方在抒發工作上的壓力', -0.5)
    const proposal = recordProposal(store, LISTEN)
    assert.deepEqual(pendingProposals(store).map((e) => e.id), [proposal.id])
    const { call, inputs } = scripted('{"verdict":"adopt","reasons":[{"situation":"S1","observation":"有技能時先回應了感受，沒有列方法"}]}')
    const { decision: d, next } = await runGate(store, proposal, call)
    assert.equal(next, undefined)
    const data = d.data as SkillDecisionData
    assert.deepEqual([data.verdict, data.gate, data.probes.length, data.costChars], ['adopt', 'contrast', 1, LISTEN.content.length])
    assert.deepEqual(inputs.map((i) => i.purpose), ['skill-probe', 'skill-probe', 'skill-compose'])
    assert.ok(!inputs[0]!.input.includes('你寫給自己的技能') && inputs[1]!.input.includes(LISTEN.content), 'reference without the skill, candidate with it')
    assert.match(inputs[2]!.input, /沒有技能時你會說：\n你可以試試這三個方法/)
    assert.deepEqual(pendingProposals(store), [])
    const own = ownSkills(store)
    assert.deepEqual(own.map((s) => [s.name, s.version, s.purpose]), [[LISTEN.name, d.id, LISTEN.purpose]])
    store.append({ kind: SKILL_KIND.use, origin: 'self', data: { name: LISTEN.name, version: d.id } })
    assert.equal(ownSkills(store)[0]!.uses, 1)
    assert.match(renderOwnSkills(store).join('\n'), /listen-before-advising：對方抒發時先聽.*用過 1 次/u)
    // 移除：不需要探測，回到沒有這個技能的狀態
    const retire = recordProposal(store, { ...LISTEN, op: 'retire', content: '', purpose: '對方不再抒發了' })
    const r = await runGate(store, retire, scripted('').call)
    assert.deepEqual([(r.decision.data as SkillDecisionData).verdict, (r.decision.data as SkillDecisionData).gate], ['adopt', 'none'])
    assert.deepEqual(ownSkills(store), [])
  }))

test('runGate: revise creates a new proposal that must be contrasted again; no similar situation means unprobed', () =>
  withStore(async (store) => {
    const lone = recordProposal(store, LISTEN)
    const u = await runGate(store, lone, scripted('').call)
    assert.equal((u.decision.data as SkillDecisionData).verdict, 'unprobed')
    assert.deepEqual(ownSkills(store), [], 'nothing is adopted without a contrast')
    decision(store, '今天又被主管念了一頓', '對方在抒發工作上的壓力', -0.5)
    const again = recordProposal(store, { ...LISTEN, content: '- 先回應感受' })
    const r = await runGate(store, again, scripted('{"verdict":"revise","reasons":[{"situation":"S1","observation":"太冷淡"}],"revised":{"description":"先聽再問","whenToUse":"抒發時","content":"- 先回應感受\\n- 問對方要不要建議"}}').call)
    assert.equal((r.decision.data as SkillDecisionData).verdict, 'revise')
    assert.ok(r.next)
    assert.deepEqual([(r.next!.data as ProposalData).source, (r.next!.data as ProposalData).revises, (r.next!.data as ProposalData).content], ['compose', again.id, '- 先回應感受\n- 問對方要不要建議'])
    assert.deepEqual(ownSkills(store), [], 'the revised version is not adopted until it is contrasted')
    assert.deepEqual(pendingProposals(store).map((e) => e.id), [r.next!.id])
  }))

test('review input: own skills, the ledger, lessons since the last review, and the best and worst outcomes', () =>
  withStore(async (store) => {
    store.append({ kind: LESSON_KIND, origin: 'self', data: { text: '對方抒發時不要急著給建議', evidence: [] } })
    decision(store, '今天又被主管念了一頓', '對方在抒發工作上的壓力', -0.5, '先聽再說')
    assert.equal(lessonsSinceReview(store), 2)
    const input = reviewInput(store)
    assert.match(input, /## 你的技能\n（還沒有）/)
    assert.match(input, /對方抒發時不要急著給建議/)
    assert.match(input, /## 結果最不好的經驗\n- \[l:[0-9a-f]{8}\] .*回報 -0\.50/u)
    store.append({ kind: SKILL_KIND.review, origin: 'self', data: { proposal: null } })
    assert.equal(lessonsSinceReview(store), 0)
  }))
