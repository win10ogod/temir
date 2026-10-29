import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { INTEGRATION_KIND, LESSON_KIND, collect, integrationStart, renderEvidence } from '../src/integrate/evidence.ts'
import { due, latestRoute } from '../src/integrate/index.ts'
import { PROPOSAL_KIND } from '../src/integrate/evidence.ts'
import { applyProposal, parseProposal, validate } from '../src/integrate/proposal.ts'
import { FACTS_KIND, personFacts } from '../src/recall/retrieve.ts'
import { currentNarrative, currentSelfModel, goals, renderSelfSnapshot } from '../src/self/state.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-integrate-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

/** 一段生活：兩個回合、一個長期事實、一筆轉折的感受。 */
function life(store: LifeStore) {
  const q1 = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我住在台北' })
  store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['對方住在台北'], lasting: ['對方住在台北'], from: 'heard' }, text: '對方住在台北', causes: [q1.id] })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我說：台北很熱鬧', model: 'deepseek-official/deepseek-flash' })
  const q2 = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's2', data: {}, text: '對方說：我上週搬到花蓮了' })
  store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's2', data: {}, text: '我說：花蓮很安靜', model: 'deepseek-official/deepseek-flash' })
  const feeling = store.append({ kind: 'appraisal', origin: 'self', session: 's2', data: { feeling: '我替對方高興', significance: 'pivotal', reappraisal: false }, text: '我的感受（轉折）：我替對方高興', causes: [q2.id] })
  return { q1, q2, feeling }
}

test('collect gathers rounds, feelings and ids since the last integration, and renders them with ids', () => {
  withStore((store) => {
    const { q1, q2, feeling } = life(store)
    const ev = collect(store, integrationStart(store))
    assert.deepEqual(ev.rounds.map((r) => [r.heard, r.reply]), [
      ['我住在台北', '台北很熱鬧'],
      ['我上週搬到花蓮了', '花蓮很安靜'],
    ])
    assert.ok(ev.pivotal)
    assert.ok(ev.ids.has(q1.id) && ev.ids.has(q2.id) && ev.ids.has(feeling.id))
    const text = renderEvidence(store, ev)
    assert.match(text, new RegExp(`\\[${q2.id}｜`))
    assert.match(text, /關於對方的長期事實\n- 對方住在台北/)
  })
})

test('validation keeps only grounded items and records why the rest were dropped', () => {
  withStore((store) => {
    const { q1, q2, feeling } = life(store)
    const ev = collect(store, 0)
    const proposal = parseProposal(
      JSON.stringify({
        lessons: [
          { text: '對方的近況會改變，要以新的為準', evidence: [q2.id] },
          { text: '沒有證據的教訓', evidence: ['l:不存在'] },
        ],
        reappraisals: [{ event: feeling.id, feeling: '回頭看，這是對方新的開始', significance: 'major', reason: '搬家穩定了' }],
        selfRevision: {
          text: '我在乎對方的生活',
          reason: '這段對話',
          causes: [q2.id],
          trigger: 'external',
          stability: { holds: true, reason: '延續我一直在聽對方說話', evidence: [q1.id] },
          adaptability: { holds: true, reason: '回應對方搬家', evidence: [q2.id] },
        },
        story: {
          text: '我認識了一個從台北搬到花蓮的人。',
          reason: '加入這段經歷',
          causes: [q1.id, q2.id],
          trigger: 'both',
          stability: { holds: true, reason: '接續原本的故事', evidence: [q1.id] },
          adaptability: { holds: true, reason: '加入搬家', evidence: [q2.id] },
        },
        goals: [
          { op: 'add', text: '多了解花蓮', reason: '對方住在那裡', stability: { holds: true, reason: '我在乎對方', evidence: [q1.id] }, adaptability: { holds: true, reason: '對方搬到花蓮', evidence: [q2.id] } },
          { op: 'pause', goal: 'g:不存在', reason: '?' },
        ],
        outdated: [
          { fact: '對方住在台北', replacedBy: '對方住在花蓮', evidence: [q2.id] },
          { fact: '對方住在火星', replacedBy: '', evidence: [q2.id] },
        ],
        contradictions: ['我想尊重對方，又忍不住給建議'],
        change: '我開始在乎對方的生活。',
      }),
    )
    assert.ok(proposal)
    const { accepted, rejected, deferred } = validate(store, ev, proposal)
    assert.deepEqual(deferred, [])
    assert.equal(accepted.lessons.length, 1)
    assert.equal(accepted.goals.length, 1)
    assert.equal(accepted.outdated.length, 1)
    assert.ok(accepted.selfRevision && accepted.story)
    assert.deepEqual(rejected.map((r) => r.reason).sort(), ['不是目前列出的長期事實', '找不到這個目標', '證據不在這次整合的範圍內'].sort())

    const result = store.transaction(() => applyProposal(store, ev, accepted, rejected, deferred, { trigger: 'pivotal', deep: true, model: 'm', output: '{}' }))
    assert.equal(result.applied.length, 6)
    assert.equal(currentSelfModel(store)?.text, '我在乎對方的生活')
    assert.equal(currentSelfModel(store)?.trigger, 'external', 'the individual decides where the change came from (H3)')
    assert.equal(currentNarrative(store)?.version, 1)
    assert.equal(goals(store)[0]?.text, '多了解花蓮')
    assert.equal(store.all(LESSON_KIND).length, 1)
    assert.deepEqual(personFacts(store).map((f) => f.text), [], 'the outdated fact is no longer listed')
    const integration = store.latest(INTEGRATION_KIND)
    assert.deepEqual((integration?.data as { range: number[] }).range, [0, ev.to])
    assert.equal((integration?.data as { observables: { contradictions: number; citedExperiences: number } }).observables.contradictions, 1)
    assert.equal((integration?.data as { observables: { citedExperiences: number } }).observables.citedExperiences, 3)
    assert.deepEqual(
      [(integration?.data as { observables: { adopted: number; deferred: number } }).observables.adopted, (integration?.data as { observables: { deferred: number } }).observables.deferred],
      [3, 0],
    )
    assert.equal(integrationStart(store), ev.to, 'the next integration starts after this one')
    assert.match(renderSelfSnapshot(store), /## 我的故事（第 1 版[\s\S]*從台北搬到花蓮/)
  })
})

test('a failed integration writes nothing: the whole set of changes is one transaction', () => {
  withStore((store) => {
    life(store)
    const before = store.count()
    assert.throws(() =>
      store.transaction(() => {
        store.append({ kind: LESSON_KIND, origin: 'self', data: {}, text: '教訓：半途' })
        throw new Error('interrupted')
      }),
    )
    assert.equal(store.count(), before)
    assert.equal(store.all(LESSON_KIND).length, 0)
  })
})

test('due: a pivotal experience makes integration due and deep; otherwise interval and rounds decide', () => {
  withStore((store) => {
    assert.deepEqual(due(store, 24, 10), { due: false, deep: false }, 'nothing to integrate')
    life(store)
    assert.deepEqual(due(store, 24, 10), { due: true, deep: true })
  })
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：你好' })
    assert.equal(due(store, 24, 1).due, true, 'never integrated and enough rounds')
    assert.equal(due(store, 24, 2).due, false, 'too few rounds')
  })
})

test('the integration route is the model the individual used last', () => {
  withStore((store) => {
    assert.equal(latestRoute(store), undefined)
    life(store)
    assert.deepEqual(latestRoute(store), { provider: 'deepseek-official', model: 'deepseek-flash' })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's3', data: {}, text: '我說：嗨', model: 'or-nemotron-bf16/nvidia/nemotron-3.5-super-vl' })
    assert.deepEqual(latestRoute(store), { provider: 'or-nemotron-bf16', model: 'nvidia/nemotron-3.5-super-vl' })
  })
})

test('parseProposal tolerates missing fields and wrong types', () => {
  const p = parseProposal('好的：{"lessons": "x", "goals": [{"op": "fly"}], "selfRevision": {"text": ""}}')
  assert.ok(p)
  assert.deepEqual([p.lessons.length, p.goals.length, p.selfRevision, p.story], [0, 0, null, null])
  assert.equal(parseProposal('沒有 JSON'), undefined)
})

test('a PC revision is adopted only when the individual judges both stability and adaptability to hold, with evidence', () => {
  withStore((store) => {
    const { q1, q2 } = life(store)
    const ev = collect(store, 0)
    const ok = { holds: true, reason: '有依據', evidence: [q2.id] }
    const proposal = parseProposal(
      JSON.stringify({
        selfRevision: { text: '我變成只在乎效率的人', reason: '一時的想法', causes: [q2.id], trigger: 'internal', stability: { holds: false, reason: '和我在乎對方的生活矛盾', evidence: [q1.id] }, adaptability: ok },
        story: { text: '我的故事', reason: '加入搬家', causes: [q2.id], trigger: 'both', stability: { holds: true, reason: '接續', evidence: [] }, adaptability: ok },
        goals: [
          { op: 'add', text: '只回答技術問題', reason: '想專注', stability: { holds: true, reason: '一致', evidence: [q1.id] }, adaptability: { holds: true, reason: '回應', evidence: ['l:別的時期'] } },
          { op: 'add', text: '多了解花蓮', reason: '對方住在那裡', stability: { holds: true, reason: '我在乎對方', evidence: [q1.id] }, adaptability: ok },
        ],
      }),
    )
    assert.ok(proposal)
    const { accepted, rejected, deferred } = validate(store, ev, proposal)
    assert.equal(accepted.selfRevision, null)
    assert.equal(accepted.story, null)
    assert.deepEqual(accepted.goals.map((g) => g.text), ['多了解花蓮'])
    assert.deepEqual(
      deferred.map((d) => [d.kind, d.reason]),
      [
        ['selfRevision', '穩定性不成立'],
        ['story', '穩定性沒有可查的證據'],
        ['goal', '適應性沒有這段期間的證據'],
      ],
    )
    store.transaction(() => applyProposal(store, ev, accepted, rejected, deferred, { trigger: 'voluntary', deep: false, model: 'm', output: '{}' }))
    assert.equal(currentSelfModel(store), undefined, 'nothing about who I am changed')
    const kept = store.all(PROPOSAL_KIND)
    assert.equal(kept.length, 3, 'unadopted revisions are kept as proposals')
    assert.match(kept[0]?.text ?? '', /沒有採用的自我模型修訂（穩定性不成立）/)
  })
})

test('deep integration looks back over the whole life, not only since the last integration', async () => {
  const { collect, integrationStart, INTEGRATION_KIND } = await import('../src/integrate/evidence.ts')
  withStore((store) => {
    const { q1 } = life(store)
    store.append({ kind: INTEGRATION_KIND, origin: 'self', data: { status: 'completed', range: [0, store.lastSeq()] } })
    const since = integrationStart(store)
    assert.equal(collect(store, since).rounds.length, 0, 'nothing new since the last integration')
    assert.ok(collect(store, 0).ids.has(q1.id), 'a deep look starts from the beginning')
  })
})

test('opinions (H1-2): adopted only with evidence and both criteria; revised and dropped by id; shown in the snapshot and the next evidence', async () => {
  const { opinions } = await import('../src/self/state.ts')
  withStore((store) => {
    const { q1, q2 } = life(store)
    const ev = collect(store, 0)
    const ok = { holds: true, reason: '有依據', evidence: [q2.id] }
    const proposal = parseProposal(
      JSON.stringify({
        opinions: [
          { op: 'add', text: '搬家之後，先問對方最需要什麼，比直接給建議重要', reason: '對方搬到花蓮', evidence: [q2.id], stability: { holds: true, reason: '延續我在乎對方', evidence: [q1.id] }, adaptability: ok },
          { op: 'add', text: '沒有依據的看法', reason: '?', evidence: [], stability: ok, adaptability: ok },
          { op: 'revise', opinion: 'o:不存在', text: 'x', reason: '?', evidence: [q2.id], stability: ok, adaptability: ok },
          { op: 'add', text: '只看效率', reason: '一時的想法', evidence: [q2.id], stability: { holds: false, reason: '和我在乎對方矛盾', evidence: [q1.id] }, adaptability: ok },
        ],
      }),
    )
    assert.ok(proposal)
    const { accepted, rejected, deferred } = validate(store, ev, proposal)
    assert.deepEqual(accepted.opinions.map((o) => o.text), ['搬家之後，先問對方最需要什麼，比直接給建議重要'])
    assert.deepEqual(rejected.map((r) => r.reason).sort(), ['找不到這個看法', '看法沒有可查的經歷支持'].sort())
    assert.deepEqual(deferred.map((d) => [d.kind, d.reason]), [['opinion', '穩定性不成立']])
    store.transaction(() => applyProposal(store, ev, accepted, rejected, deferred, { trigger: 'voluntary', deep: false, model: 'm', output: '{}' }))
    const [held] = opinions(store)
    assert.equal(held?.status, 'held')
    assert.match(held?.id ?? '', /^o:[0-9a-f]{8}$/)
    assert.match(renderSelfSnapshot(store), new RegExp(`## 我的看法\\n- \\[${held!.id}\\] 搬家之後，先問對方最需要什麼`))
    // 下一次整合看得到這個看法，可以改寫或放下。
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's3', data: {}, text: '對方說：其實我比較想聽建議' })
    const ev2 = collect(store, integrationStart(store))
    assert.match(renderEvidence(store, ev2), new RegExp(`## 目前的看法\\n- \\[${held!.id}\\] 搬家之後`))
    const q3 = ev2.rounds[0]!.id
    const next = parseProposal(JSON.stringify({ opinions: [{ op: 'revise', opinion: held!.id, text: '要先問對方想聽建議還是只想被聽', reason: '對方說比較想聽建議', evidence: [q3], stability: { holds: true, reason: '仍是先理解對方', evidence: [held!.history[0] ? q2.id : q2.id] }, adaptability: { holds: true, reason: '回應對方的話', evidence: [q3] } }] }))!
    const v2 = validate(store, ev2, next)
    store.transaction(() => applyProposal(store, ev2, v2.accepted, v2.rejected, v2.deferred, { trigger: 'voluntary', deep: false, model: 'm', output: '{}' }))
    const revised = opinions(store).find((o) => o.id === held!.id)
    assert.equal(revised?.text, '要先問對方想聽建議還是只想被聽')
    assert.equal(revised?.history.length, 2, 'the earlier wording stays in the history')
  })
})

test('revaluations (H2): the integration can re-judge an old reward under the current self; JitRL uses the latest judgement', async () => {
  const { experiences, OUTCOME_KIND, REVALUATION_KIND, DECISION_KIND } = await import('../src/rd/memory.ts')
  withStore((store) => {
    const decision = store.append({ kind: DECISION_KIND, origin: 'self', session: 's1', data: { cue: '我好累', situation: '對方：x｜對方的意圖：抒發', candidates: [{ action: '給建議', kind: '建議', prediction: 'p', confidence: 100, sameAs: [] }], chosen: 0, value: null, neighbors: [], shown: {}, jitrl: true, params: {}, selfVersion: 1 } })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我只是想抒發' })
    const outcome = store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { decision: decision.id, didAction: '給建議', didKind: '建議', actual: '對方說只是想抒發', matched: 'no', error: 'e', reward: 0.4, reason: '當時覺得有幫上忙', lesson: '', selfVersion: 1, heard: '' }, causes: [decision.id] })
    assert.equal(experiences(store, 0.5)[0]?.ret, 0.4)
    const ev = collect(store, 0)
    const proposal = parseProposal(JSON.stringify({ revaluations: [{ outcome: outcome.id, reward: -0.6, reason: '現在我更在乎先聽完對方' }, { outcome: 'l:不存在', reward: 1, reason: '?' }, { outcome: outcome.id, reward: '高', reason: '不是數字' }] }))!
    assert.equal(proposal.revaluations.length, 2, 'a non-numeric reward is dropped at parse time')
    const { accepted, rejected, deferred } = validate(store, ev, proposal)
    assert.deepEqual(rejected.map((r) => r.reason), ['不是這次列出的事後比對'])
    store.transaction(() => applyProposal(store, ev, accepted, rejected, deferred, { trigger: 'voluntary', deep: false, model: 'm', output: '{}' }))
    const [reval] = store.all(REVALUATION_KIND)
    assert.deepEqual([(reval?.data as { previous: number }).previous, (reval?.data as { reward: number }).reward], [0.4, -0.6])
    assert.equal(experiences(store, 0.5)[0]?.ret, -0.6, 'the latest judgement wins')
  })
})

test('the integration can release held items by label; released items no longer appear; pending pivotal experiences are detected', async () => {
  const { potentialItems } = await import('../src/self/energy.ts')
  const { pendingPivotal } = await import('../src/integrate/index.ts')
  const { OUTCOME_KIND } = await import('../src/rd/memory.ts')
  withStore((store) => {
    life(store)
    assert.equal(pendingPivotal(store), true, 'a pivotal feeling has not been integrated yet')
    const left = store.append({ kind: OUTCOME_KIND, origin: 'self', data: { decision: 'l:d', didAction: 'a', didKind: '回答', actual: 'b', matched: 'partly', error: '', reward: 0, reason: '', lesson: '', left: '答應下次再聊搬家', selfVersion: 0, heard: '' } })
    const ev = collect(store, 0)
    const label = [...ev.potentialLabels.entries()].find(([, key]) => key === `left:${left.id}`)?.[0]
    assert.ok(label)
    const proposal = parseProposal(JSON.stringify({ release: [{ item: label, reason: '已經聊過了' }, { item: 'P99', reason: '?' }] }))!
    const { accepted, rejected, deferred } = validate(store, ev, proposal)
    assert.deepEqual(rejected.map((r) => r.reason), ['不是這次列出的懸著的事'])
    store.transaction(() => applyProposal(store, ev, accepted, rejected, deferred, { trigger: 'pivotal', deep: true, model: 'm', output: '{}' }))
    assert.deepEqual(potentialItems(store).map((p) => p.key), [])
    const integration = store.latest(INTEGRATION_KIND)
    assert.deepEqual((integration?.data as { released: unknown }).released, [{ key: `left:${left.id}`, reason: '已經聊過了' }])
    assert.deepEqual([(integration?.data as { observables: { potential: number; released: number } }).observables.potential, (integration?.data as { observables: { released: number } }).observables.released], [1, 1])
    assert.equal(pendingPivotal(store), false, 'integrated')
  })
})
