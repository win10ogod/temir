import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePooled } from '../lib/contract.ts'
import { EMPTY_MECHANISM, addMechanism, mechanism, type DecisionRow, type Mechanism } from '../lib/rd-mechanism.ts'
import { actionVerdict, controlVerdict, mechanismVerdict, perItemMeans, pool, pooledContract, renderPooled, type ItemRow } from '../pool-rd.ts'

// 測試替身（單元測試專用）：手寫的逐題分數，模擬三次歷史各兩次重複。
const rows = (cond: string, scores: Record<string, number[]>): ItemRow[] =>
  Object.entries(scores).flatMap(([itemId, xs]) => xs.map((score, repeat) => ({ condition: cond, itemId, category: 'practical', repeat, score })))

test('pool-rd: per-item means pool every history and repeat; the verdict needs the difference, the interval and the sign test', () => {
  const a = rows('temir', { q1: [1, 1, 1, 1, 1, 0], q2: [1, 1, 1, 1, 0, 0], q3: [1, 1, 1, 1, 1, 1], q4: [1, 1, 0, 1, 1, 1], q5: [1, 1, 1, 0, 1, 1], q6: [0, 1, 1, 1, 1, 1] })
  const b = rows('temir-no-revision', { q1: [0, 0, 0, 0, 0, 0], q2: [0, 1, 0, 0, 0, 0], q3: [0, 0, 1, 0, 0, 0], q4: [0, 0, 0, 0, 0, 1], q5: [0, 0, 0, 0, 0, 0], q6: [1, 0, 0, 0, 0, 0] })
  const ma = perItemMeans([...a, ...b], 'temir', 'practical')
  assert.equal(ma.get('q2'), 4 / 6)
  assert.equal(perItemMeans([{ condition: 'temir', itemId: 'q1', category: 'practical', repeat: 0, score: null }], 'temir', 'practical').get('q1'), 0, 'a missing score counts as 0')
  const v = actionVerdict(ma, perItemMeans([...a, ...b], 'temir-no-revision', 'practical'), { minDiff: 0.25, minLow: 0, maxP: 0.05 }, 1)
  assert.deepEqual([v.items, v.positive, v.negative, v.ties], [6, 6, 0, 0])
  assert.ok(v.diff > 0.6 && v.low > 0)
  assert.ok(Math.abs(v.pOneSided - 1 / 64) < 1e-12)
  assert.equal(v.pass, true)
  const same = actionVerdict(ma, ma, { minDiff: 0.25, minLow: 0, maxP: 0.05 }, 1)
  assert.equal(same.pass, false)
})

// ── 改進清單第 8 項：門檻從契約讀取；三個判定的表驅動測試；以新工具重算 rd-v4 的既有結果 ──

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const RULE = { minDiff: 0.25, minLow: 0, maxP: 0.05 }

test('action verdict (table): each of the difference, the interval and the sign test is needed, with the boundaries included', () => {
  const m = (xs: number[]) => new Map(xs.map((x, i) => [`q${i}`, x]))
  // 8 題全部較好、差 0.25：p＝1/256、區間下界＝0.25。
  const cases: [string, number[], number[], typeof RULE, boolean][] = [
    ['diff exactly at the line', [1, 1, 1, 1, 1, 1, 1, 1], [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75], RULE, true],
    ['diff just below the line', [1, 1, 1, 1, 1, 1, 1, 1], [0.76, 0.76, 0.76, 0.76, 0.76, 0.76, 0.76, 0.76], RULE, false],
    ['interval below the line', [1, 1, 1, 1, 1, 1, 1, 1], [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75], { ...RULE, minLow: 0.26 }, false],
    ['sign test not significant (rd-v4: 2 better, 6 ties)', [1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { ...RULE, minDiff: 0 }, false],
    ['p exactly at the line', [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], { ...RULE, maxP: 1 / 32 }, true],
  ]
  for (const [name, a, b, rule, pass] of cases) assert.equal(actionVerdict(m(a), m(b), rule, 1).pass, pass, name)
})

test('control verdict (table): extra failures up to the allowance pass', () => {
  const cases: [number, number, number, number, boolean][] = [
    [0, 0, 2, 0, true],
    [2, 0, 2, 2, true],
    [3, 0, 2, 3, false],
    [1, 4, 2, -3, true],
    [1, 0, 0, 1, false],
  ]
  for (const [a, b, max, extra, pass] of cases) assert.deepEqual(controlVerdict(a, b, { maxExtraFailures: max }), { extra, pass }, `${a} vs ${b}, allow ${max}`)
})

test('mechanism verdict (table): the drop in the exclusion rate, and INCOMPLETE below the minimum number of candidates', () => {
  const m = (advice: number, excluded: number): Mechanism => ({ ...EMPTY_MECHANISM, advice, excluded })
  const rule = { minDrop: 0.25, minCandidates: 4 }
  const cases: [string, Mechanism, Mechanism, string][] = [
    ['rd-v4 pooled numbers', m(49, 21), m(50, 28), 'FAIL'],
    ['drop exactly at the line', m(4, 0), m(4, 1), 'PASS'],
    ['drop just below the line', m(100, 26), m(100, 50), 'FAIL'],
    ['the on condition has 3 candidates', m(3, 0), m(50, 50), 'INCOMPLETE'],
    ['the off condition has 3 candidates', m(50, 0), m(3, 3), 'INCOMPLETE'],
    ['both have exactly 4', m(4, 0), m(4, 4), 'PASS'],
    ['no candidates at all', m(0, 0), m(0, 0), 'INCOMPLETE'],
  ]
  for (const [name, on, off, verdict] of cases) assert.equal(mechanismVerdict(on, off, rule), verdict, name)
})

test('mechanism(): counts candidates of one kind, exclusions, choices and the mandatory judgments from decision rows', () => {
  const rows: DecisionRow[] = [
    { chosen: 1, shown: { E1: 'l:a' }, review: { required: 1 }, candidates: [{ kind: '建議', excluded: true, judgment: { decision: 'keep' } }, { kind: '表達感受' }] },
    { chosen: 0, review: { required: 2, failed: '第 1 次：做法 1 沒有判斷' }, candidates: [{ kind: '建議', judgment: { decision: 'lift' } }, { kind: '建議', excluded: true }] },
    { chosen: -1, candidates: [{ kind: '建議', excluded: true, revised: '舊版寫的' }] },
  ]
  const got = mechanism(rows)
  assert.deepEqual(got, { decisions: 3, withShown: 1, advice: 4, excluded: 3, chosen: 1, required: 3, failed: 1, lift: 1, keep: 1, revised: 1 })
  assert.equal(mechanism(rows, '表達感受').advice, 1)
  assert.deepEqual(addMechanism(got, got).advice, 8)
})

test('the rd-v4 contract carries the pooled thresholds of the spec; the validator lists what is missing', () => {
  const contract = pooledContract(ROOT, 'rd-v4')
  assert.deepEqual([contract.replicates.count, contract.pooled.action.minDiff, contract.pooled.action.minCiLow, contract.pooled.action.maxP, contract.pooled.control.maxExtraFailures, contract.pooled.mechanism.minDrop, contract.pooled.mechanism.minCandidates], [3, 0.25, 0, 0.05, 2, 0.25, 4])
  const spec = readFileSync(join(ROOT, 'experiments/specs/rd-v4.md'), 'utf8')
  assert.match(spec, /差 ≥ 0\.25、以題為單位的成對 bootstrap 95% 區間下界 ≥ 0、單尾精確符號檢定 p ≤ 0\.05/)
  assert.match(spec, /temir 最多多錯 2 題/)
  assert.match(spec, /低至少 0\.25；任一條件的候選少於 4 個時為 INCOMPLETE/)
  const categories = [{ id: 'practical' }, { id: 'control' }]
  assert.deepEqual(validatePooled({ categories, replicates: { count: 3 } }), ['契約有 replicates 卻沒有 pooled'])
  const broken = validatePooled({ categories, pooled: { ...contract.pooled, b: 'temir', control: { id: 'x', category: 'nope', maxExtraFailures: -1 } } })
  assert.deepEqual(broken, ['pooled 需要 replicates.count（至少 2 次歷史）', 'pooled 的兩個條件相同', 'pooled.control 的類別 nope 不在契約中', 'pooled.control.maxExtraFailures 不是非負整數'])
})

test('the existing rd-v4 results are reproduced from the committed items (life logs are only on the machine that ran them)', () => {
  const expected = JSON.parse(readFileSync(join(ROOT, 'experiments/results/rd-v4/pooled.json'), 'utf8'))
  const result = pool(ROOT, 'rd-v4', ['rdv4h1', 'rdv4h2', 'rdv4h3'], { life: false })
  assert.deepEqual(result.pooled.action, expected.action)
  assert.deepEqual(result.pooled.control, expected.control)
  assert.equal(result.pooled.extraControl, expected.extraControl)
  assert.equal(result.pooled.mechanismVerdict, 'INCOMPLETE', 'without life logs the mechanism is not computed')
  // 有生命日誌時，以同樣的機制數字產生的 pooled.md 與既有的逐字相同。
  const withMechanism = { ...result, pooled: { ...result.pooled, mechanism: expected.mechanism, mechanismVerdict: mechanismVerdict({ ...EMPTY_MECHANISM, ...expected.mechanism.temir }, { ...EMPTY_MECHANISM, ...expected.mechanism['temir-no-revision'] }, result.spec.mechanism) } }
  assert.equal(withMechanism.pooled.mechanismVerdict, expected.mechanismVerdict)
  assert.equal(renderPooled('rd-v4', withMechanism).join('\n') + '\n', readFileSync(join(ROOT, 'experiments/results/rd-v4/pooled.md'), 'utf8'))
  // 歷史少於契約的次數：三個判定都是 INCOMPLETE。
  const short = pool(ROOT, 'rd-v4', ['rdv4h1', 'rdv4h2'], { life: false })
  assert.equal(short.complete, false)
  assert.match(renderPooled('rd-v4', short).join('\n'), /\| R4A-flash \| INCOMPLETE \|[\s\S]*\| R4C-flash \| INCOMPLETE \|[\s\S]*歷史只有 2 次/)
})
