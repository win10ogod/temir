import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { INTEGRATION_KIND, LESSON_KIND, collect, integrationStart, renderEvidence } from '../src/integrate/evidence.ts'
import { due, latestRoute } from '../src/integrate/index.ts'
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
        selfRevision: { text: '我在乎對方的生活', reason: '這段對話', causes: [q2.id] },
        story: { text: '我認識了一個從台北搬到花蓮的人。', reason: '加入這段經歷', causes: [q1.id, q2.id] },
        goals: [
          { op: 'add', text: '多了解花蓮', reason: '對方住在那裡' },
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
    const { accepted, rejected } = validate(store, ev, proposal)
    assert.equal(accepted.lessons.length, 1)
    assert.equal(accepted.goals.length, 1)
    assert.equal(accepted.outdated.length, 1)
    assert.ok(accepted.selfRevision && accepted.story)
    assert.deepEqual(rejected.map((r) => r.reason).sort(), ['不是目前列出的長期事實', '找不到這個目標', '證據不在這次整合的範圍內'].sort())

    const result = store.transaction(() => applyProposal(store, ev, accepted, rejected, { trigger: 'pivotal', deep: true, model: 'm', output: '{}' }))
    assert.equal(result.applied.length, 6)
    assert.equal(currentSelfModel(store)?.text, '我在乎對方的生活')
    assert.equal(currentSelfModel(store)?.trigger, 'internal')
    assert.equal(currentNarrative(store)?.version, 1)
    assert.equal(goals(store)[0]?.text, '多了解花蓮')
    assert.equal(store.all(LESSON_KIND).length, 1)
    assert.deepEqual(personFacts(store).map((f) => f.text), [], 'the outdated fact is no longer listed')
    const integration = store.latest(INTEGRATION_KIND)
    assert.deepEqual((integration?.data as { range: number[] }).range, [0, ev.to])
    assert.equal((integration?.data as { observables: { contradictions: number; citedExperiences: number } }).observables.contradictions, 1)
    assert.equal((integration?.data as { observables: { citedExperiences: number } }).observables.citedExperiences, 3)
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
