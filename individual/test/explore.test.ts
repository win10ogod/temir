import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { DEFAULT_PARAMS } from '../src/rd/jitrl.ts'
import { OUTCOME_KIND, exclusionReviews, parseJudgments, renderExclusionReview, withDoubtReviews } from '../src/rd/memory.ts'
import {
  DELIBERATE_SYSTEM,
  OUTCOME_SYSTEM,
  REVISION_SYSTEM,
  deliberateNotice,
  deliberateSystem,
  deliberationRetryNote,
  outcomeRetryNote,
  outcomeSystem,
  parseDeliberation,
  parseOutcome,
  revisionNotice,
  revisionRetryNote,
  revisionSystem,
} from '../src/rd/aux.ts'
import { potentialItems, presentPotential } from '../src/self/energy.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-explore-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const procedure = { name: 'subtract' as const, version: 1, text: '扣除的做法' }

test('with explore off every prompt is unchanged; on, candidates judge tells and the outcome judges doubt and tested (H-EX)', () => {
  assert.equal(deliberateSystem({ explore: false }), DELIBERATE_SYSTEM)
  assert.equal(outcomeSystem({ explore: false }), OUTCOME_SYSTEM)
  assert.equal(revisionSystem(undefined, false), REVISION_SYSTEM)
  assert.equal(revisionNotice(procedure, 'r', false), revisionNotice(procedure, 'r'))
  assert.equal(revisionRetryNote(['x'], false), revisionRetryNote(['x']))
  assert.equal(deliberationRetryNote(['x'], false), deliberationRetryNote(['x']))
  assert.equal(outcomeRetryNote(['x'], false, false, false), outcomeRetryNote(['x']))
  const notice = (explore: boolean) => deliberateNotice({ explore, held: [], experiences: '沒有找到類似的經驗。' })
  assert.equal(notice(false), deliberateNotice({ held: [], experiences: '沒有找到類似的經驗。' }))
  assert.match(deliberateSystem({ explore: true }), /tells：「懸著的事」中每一件「還分不出的讀法」都要判斷/)
  assert.match(notice(true), /"tells": \[\]/)
  assert.doesNotMatch(deliberateSystem({ explore: true, energy: false }), /tells/, 'doubts are potential: no energy, no doubts')
  assert.match(outcomeSystem({ explore: true }), /- doubt：對方接著說了話時必答/)
  assert.match(revisionSystem(undefined, true), /X 或 D 編號/)
})

const CANDIDATES = (tells1: unknown, tells2: unknown) =>
  JSON.stringify({
    situation: 's',
    candidates: [
      { action: '直接給一個具體的方法', prediction: 'p', confidence: 40, excluded: true, reason: '她累了，不想聽方法', tells: tells1 },
      { action: '先陪她說完', prediction: 'p', confidence: 60, excluded: false, reason: '', tells: tells2 },
    ],
    experiences: [],
  })

test('parseDeliberation: with doubts listed every candidate must say which ones it tells apart (H-EX)', () => {
  const doubts = new Set(['P2'])
  const missing = parseDeliberation(CANDIDATES(undefined, []), new Map(), new Set(), doubts)
  assert.deepEqual(missing.ok ? [] : missing.problems, ['做法 1 的 tells 不是陣列'])
  const unknown = parseDeliberation(CANDIDATES(['P2', 'P9'], []), new Map(), new Set(), doubts)
  assert.deepEqual(unknown.ok ? [] : unknown.problems, ['做法 1 的 tells 有「P9」，不是列出的還分不出的讀法'])
  const ok = parseDeliberation(CANDIDATES(['p2'], []), new Map(), new Set(), doubts)
  assert.ok(ok.ok)
  assert.deepEqual(
    ok.deliberation.candidates.map((c) => c.tells),
    [['P2'], []],
  )
  const off = parseDeliberation(CANDIDATES(['P2'], []), new Map())
  assert.ok(off.ok && off.deliberation.candidates.every((c) => c.tells === undefined), 'explore off: tells are not read')
})

const OUTCOME = (extra: object) =>
  JSON.stringify({ didAction: '先陪她', declined: false, actual: '她說「嗯」', matched: 'partly', error: '', reward: 0, reason: 'r', lesson: '', feeling: '', keepFeeling: false, reconsider: false, gapOnMind: false, released: [], left: [], ...extra })

test('parseOutcome: when the other replied, doubt is null or two grounded readings; every listed doubt is tested (H-EX)', () => {
  const doubts = new Map([['P2', 2]])
  const problems = (extra: object, replied = true) => {
    const parsed = parseOutcome(OUTCOME(extra), { explore: { doubts, replied } })
    return parsed.ok ? [] : parsed.problems
  }
  assert.deepEqual(problems({}), ['doubt 不是 null，也不是含有 readings 陣列的物件', '有還分不出的讀法，但 tested 不是陣列'])
  assert.deepEqual(problems({ doubt: { readings: [{ reading: '她累了', basis: '回得很短' }] }, tested: [] }), ['doubt 少於兩種彼此不同的讀法', '還分不出的讀法 P2 沒有在 tested 中作答'])
  assert.deepEqual(problems({ doubt: { readings: [{ reading: '她累了', basis: '回得很短' }, { reading: '她失望了', basis: '' }] }, tested: [{ item: 'P2', supports: 0, why: 'w' }] }), ['doubt 第 2 種讀法沒有依據（basis）', 'doubt 少於兩種彼此不同的讀法'])
  assert.deepEqual(problems({ doubt: null, tested: [{ item: 'P2', supports: 3, why: 'w' }] }), ['P2 的 supports 不是 0 到 2 的整數', '還分不出的讀法 P2 沒有在 tested 中作答'])
  assert.deepEqual(problems({ doubt: null, tested: [{ item: 'P2', supports: 2, why: 'w', lesson: '' }] }), ['P2 的 supports 不是 0，但沒有 lesson'])
  assert.deepEqual(problems({ tested: [{ item: 'P2', supports: 0, why: 'w' }] }, false), [], 'a provisional outcome (no reply) is not asked for doubt')
  const ok = parseOutcome(OUTCOME({ doubt: { readings: [{ reading: '她累了', basis: '回得很短' }, { reading: '她失望了', basis: '方法不合' }] }, tested: [{ item: 'p2', supports: 2, why: '她說要具體的', lesson: '她要的是具體方法' }] }), { explore: { doubts, replied: true } })
  assert.ok(ok.ok)
  assert.deepEqual(ok.judgment.doubt, [
    { reading: '她累了', basis: '回得很短' },
    { reading: '她失望了', basis: '方法不合' },
  ])
  assert.deepEqual(ok.judgment.tested, [{ ref: 'P2', supports: 2, why: '她說要具體的', lesson: '她要的是具體方法' }])
  const off = parseOutcome(OUTCOME({}))
  assert.ok(off.ok && off.judgment.doubt === undefined && off.judgment.tested === undefined)
})

test('a doubt is potential until an outcome tells which reading held; discriminating or newly resolved readings bring excluded candidates back to judgment (H-EX)', () => {
  withStore((store) => {
    const base = { decision: 'l:d', didAction: 'a', actual: 'b', matched: 'partly', error: '', reward: 0, reason: '', lesson: '', selfVersion: 0, heard: '' }
    const o1 = store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { ...base, doubt: [{ reading: '她累了想收尾', basis: '回得很短' }, { reading: '她對方法失望', basis: '說了沒用' }] } })
    const key = `doubt:${o1.id}`
    const item = potentialItems(store).find((i) => i.key === key)
    assert.deepEqual([item?.kind, item?.outward, item?.readings], ['doubt', false, ['她累了想收尾', '她對方法失望']])
    assert.match(presentPotential(store).lines.join('\n'), /還分不出的讀法（.*）：①她累了想收尾；②她對方法失望/)

    const candidates = [
      { action: '直接給一個具體的方法', prediction: 'p', confidence: 40, sameAs: [], excluded: true, excludeReason: '她累了', tells: [key] },
      { action: '先陪她說完', prediction: 'p', confidence: 60, sameAs: [], tells: [] },
      { action: '轉移話題', prediction: 'p', confidence: 0, sameAs: [], excluded: true, excludeReason: '不合適', tells: [] },
    ]
    const open = [{ key, readings: item!.readings! }]
    const plain = exclusionReviews(candidates, [], DEFAULT_PARAMS)
    assert.deepEqual(plain, [], 'no similar experiences: D20 alone asks nothing')
    const reviews = withDoubtReviews(plain, candidates, open, [])
    assert.deepEqual(
      reviews.map((r) => [r.index, r.doubts?.map((d) => d.key)]),
      [[0, [key]]],
    )
    const rendered = renderExclusionReview('s', candidates, reviews)
    assert.match(rendered.text, /它分辨得出的讀法（D 編號）/)
    assert.match(rendered.text, /- D1｜這個做法分辨得出這件還分不出的讀法：①她累了想收尾；②她對方法失望/)
    const judged = parseJudgments('{"judgments":[{"candidate":1,"decision":"lift","why":"給了才知道是哪一種","refs":["D1"]}]}', reviews, rendered.labels)
    assert.ok(judged.ok)
    assert.deepEqual(judged.judgments[0]!.refs, [key])

    // 讀法剛被判斷：被扣除的每一個做法都要再判斷，不管它分不分辨得出。
    const resolved = [{ key, readings: item!.readings!, resolved: { supported: '她對方法失望', refuted: ['她累了想收尾'], lesson: '她要的是合用的方法' } }]
    const after = withDoubtReviews([], candidates, [], resolved)
    assert.deepEqual(
      after.map((r) => r.index),
      [0, 2],
    )
    assert.match(renderExclusionReview('s', candidates, after).text, /剛被結果判斷的讀法：.*支持「她對方法失望」，否定「她累了想收尾」｜教訓：她要的是合用的方法/)

    // 比對判斷出讀法（releasedItems）之後就不再懸著。
    store.append({ kind: OUTCOME_KIND, origin: 'self', session: 's1', data: { ...base, releasedItems: [key], tested: [{ key, supports: 2, why: 'w', lesson: 'l' }] } })
    assert.equal(potentialItems(store).some((i) => i.key === key), false)
  })
})
