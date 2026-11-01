import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { OUTCOME_KIND } from '../src/rd/memory.ts'
import { OUTCOME_SYSTEM, outcomeRetryNote, outcomeSystem, parseOutcome } from '../src/rd/aux.ts'
import { THOUGHT_KIND, potentialItems, presentPotential } from '../src/self/energy.ts'
import { parseRevisit } from '../src/self/time.ts'
import { THOUGHT_SYSTEM, dueItems, parseThought, recordThought, thoughtInput, thoughtRetryNote, thoughtSystem } from '../src/thought/thought.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-revisit-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const OUTCOME = (left: unknown) =>
  JSON.stringify({ didAction: '答應提醒', declined: false, actual: '她說好', matched: 'yes', error: '', reward: 0.5, reason: 'r', lesson: '', feeling: '', keepFeeling: false, reconsider: false, released: [], left })

test('revisit times: a local YYYY-MM-DD HH:MM time or 沒有; anything else is not an answer (H-ET)', () => {
  assert.deepEqual(parseRevisit('2028-07-06 21:00'), { ok: true, at: new Date(2028, 6, 6, 21, 0).getTime() })
  assert.deepEqual(parseRevisit(' 2028/7/6 9:05 '), { ok: true, at: new Date(2028, 6, 6, 9, 5).getTime() })
  assert.deepEqual(parseRevisit('沒有'), { ok: true, at: null })
  for (const bad of ['明天晚上', '2028-02-30 10:00', '2028-07-06 24:00', '2028-07-06', '', 3, undefined]) assert.equal(parseRevisit(bad).ok, false, String(bad))
})

test('with revisit off the outcome and thought prompts are unchanged; on, every left item and intention must say when to think again', () => {
  assert.equal(outcomeSystem({ revisit: false }), OUTCOME_SYSTEM)
  assert.equal(thoughtSystem(undefined, { revisit: false }), THOUGHT_SYSTEM)
  assert.equal(outcomeRetryNote(['x'], false, false), outcomeRetryNote(['x']))
  assert.equal(thoughtRetryNote(['x'], false), thoughtRetryNote(['x']))
  assert.match(outcomeSystem({ revisit: true }), /revisitAt：每條必答/)
  assert.doesNotMatch(outcomeSystem({ revisit: true, energy: false }), /revisitAt/, 'no left items without energy')
  assert.match(thoughtSystem(undefined, { revisit: true }), /intentionAt：item 與 intention 都不是空的時必答/)

  const off = parseOutcome(OUTCOME([{ text: '明晚提醒她印作品集', forOther: true }]))
  assert.ok(off.ok && off.judgment.left[0]!.revisitAt === undefined)
  const missing = parseOutcome(OUTCOME([{ text: '明晚提醒她印作品集', forOther: true }]), { revisit: true })
  assert.deepEqual(missing.ok ? [] : missing.problems, ['left 第 1 條的 revisitAt 不是「沒有」或 YYYY-MM-DD HH:MM 的時間'])
  const on = parseOutcome(OUTCOME([{ text: '明晚提醒她印作品集', forOther: true, revisitAt: '2028-07-06 21:00' }, { text: '我是不是太急了', forOther: false, revisitAt: '沒有' }]), { revisit: true })
  assert.ok(on.ok)
  assert.deepEqual(
    on.judgment.left.map((l) => l.revisitAt),
    [new Date(2028, 6, 6, 21, 0).getTime(), null],
  )
})

/** 本機時區的「YYYY-MM-DD HH:MM」（分鐘以下捨去）與它代表的毫秒。 */
function minute(ts: number): { readonly text: string; readonly at: number } {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { text: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`, at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime() }
}

test('an item whose time has come is due until a thought (or an attempt) happens after that time; the thought can set a new time (H-ET)', () => {
  withStore((store) => {
    const now = Date.now()
    const t0 = now - 2 * 86_400_000
    const at = minute(now - 3_600_000).at
    const later = minute(now + 2 * 3_600_000)
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', ts: t0, data: {}, text: '對方說：面試前一天晚上提醒我印作品集' })
    const outcome = store.append({
      kind: OUTCOME_KIND,
      origin: 'self',
      session: 's1',
      ts: t0 + 1000,
      data: { decision: 'l:d', didAction: 'a', actual: 'b', matched: 'yes', error: '', reward: 0, reason: '', lesson: '', left: '提醒她', leftItems: [{ text: '明晚提醒她印作品集', forOther: true, revisitAt: at }, { text: '沒有時間的事', forOther: false, revisitAt: null }], selfVersion: 0, heard: '' },
    })
    const key = `left:${outcome.id}#0`
    assert.deepEqual(potentialItems(store).map((i) => i.revisitAt), [at, undefined])
    assert.match(presentPotential(store).lines.join('\n'), /你判斷 .* 該再想起/)
    assert.deepEqual(dueItems(store, at - 60_000), [], 'not yet')
    assert.deepEqual(dueItems(store, now).map((i) => i.key), [key])
    // 念頭的輸入只在 revisit 開時列出時間到了的事。
    assert.doesNotMatch(thoughtInput(store, now).input, /時間到了的事/)
    const { input, labels, due } = thoughtInput(store, now, { revisit: true })
    assert.match(input, /## 時間到了的事/)
    assert.deepEqual(due, ['P1'])
    // 必答：時間到了的每一件（放下的除外），以及打算的時間。
    const parse = (raw: object) => parseThought(JSON.stringify(raw), labels, { revisit: true, due })
    const base = { item: 'P1', thought: '時間到了，該提醒她了', feeling: '', reconsider: false, release: false, intention: '', replaces: [], now: false }
    const unanswered = parse(base)
    assert.deepEqual(unanswered.ok ? [] : unanswered.problems, ['有時間到了的事，但 revisit 不是陣列', '時間到了的事 P1 沒有在 revisit 中作答'])
    assert.ok(parse({ ...base, release: true }).ok, 'the released item needs no new time')
    const noTime = parse({ ...base, intention: '現在提醒她', now: true, revisit: [{ item: 'p1', at: later.text }] })
    assert.deepEqual(noTime.ok ? [] : noTime.problems, ['有 intention，但 intentionAt 不是「沒有」或 YYYY-MM-DD HH:MM 的時間'])
    const judged = parse({ ...base, intention: '現在提醒她', now: true, intentionAt: '沒有', revisit: [{ item: 'P1', at: later.text }] })
    assert.ok(judged.ok)
    store.transaction(() => recordThought(store, judged.judgment, labels, 'm'))
    assert.deepEqual((store.latest(THOUGHT_KIND)!.data as { revisited?: unknown }).revisited, [{ key, at: later.at }])
    // 想過之後不再因為原本的時間醒來；新的時間到了才再到期。
    assert.deepEqual(dueItems(store, Date.now()), [])
    assert.deepEqual(dueItems(store, later.at + 60_000).map((i) => i.key), [key])
    assert.equal(potentialItems(store).find((i) => i.key.startsWith('intention:'))?.revisitAt, undefined, 'intention answered 沒有')
  })
})
