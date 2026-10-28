/**
 * 統計函式的參考值：
 * - Clopper–Pearson：papers/2610.09193 §3.1 與 Table 1 公布的精確區間（642/800 → 77.3–83.0；
 *   447/600 → 70.8–77.9；376/400 → 91.2–96.1；266/400 → 61.6–71.1），以及教科書公式
 *   0/n 的上界 1−(α/2)^(1/n)。
 * - McNemar／符號檢定：直接用二項式機率手算的值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { binomialCdf, clopperPearson, mcnemarExact, pairedBootstrap, signTest, wilson } from '../lib/stats.ts'

const round1 = (x: number) => Math.round(x * 1000) / 10

test('Clopper–Pearson 與 2610.09193 公布的區間一致（四捨五入到 0.1 個百分點）', () => {
  const cases: [number, number, number, number][] = [
    [642, 800, 77.3, 83.0],
    [447, 600, 70.8, 77.9],
    [376, 400, 91.2, 96.1],
    [266, 400, 61.6, 71.1],
  ]
  for (const [k, n, lo, hi] of cases) {
    const ci = clopperPearson(k, n)
    assert.equal(round1(ci.low), lo, `${k}/${n} 下界`)
    assert.equal(round1(ci.high), hi, `${k}/${n} 上界`)
  }
})

test('Clopper–Pearson 邊界：0/n 與 n/n', () => {
  const zero = clopperPearson(0, 10)
  assert.equal(zero.low, 0)
  assert.ok(Math.abs(zero.high - (1 - 0.025 ** (1 / 10))) < 1e-9)
  const all = clopperPearson(10, 10)
  assert.equal(all.high, 1)
  assert.ok(Math.abs(all.low - 0.025 ** (1 / 10)) < 1e-9)
  assert.deepEqual(clopperPearson(0, 0), { low: 0, high: 1 })
})

test('Wilson 區間落在 [0,1] 且包含點估計', () => {
  const w = wilson(3, 10)
  assert.ok(w.low < 0.3 && w.high > 0.3 && w.low >= 0 && w.high <= 1)
})

test('binomialCdf 手算值', () => {
  assert.ok(Math.abs(binomialCdf(1, 7, 0.5) - 8 / 128) < 1e-12)
  assert.equal(binomialCdf(7, 7, 0.5), 1)
})

test('精確 McNemar：只看不一致的對', () => {
  const pairs: [number, number][] = [
    ...Array.from({ length: 10 }, () => [1, 0] as [number, number]),
    ...Array.from({ length: 5 }, () => [1, 1] as [number, number]),
    ...Array.from({ length: 8 }, () => [0, 0] as [number, number]),
  ]
  const r = mcnemarExact(pairs)
  assert.equal(r.b, 10)
  assert.equal(r.c, 0)
  assert.ok(Math.abs(r.pTwoSided - 2 * 0.5 ** 10) < 1e-12)
  assert.ok(Math.abs(r.pOneSided - 0.5 ** 10) < 1e-12)
  const r2 = mcnemarExact([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]])
  assert.ok(Math.abs(r2.pTwoSided - 2 * (8 / 128)) < 1e-12)
  assert.equal(mcnemarExact([[1, 1], [0, 0]]).pTwoSided, 1)
})

test('精確符號檢定：同分剔除；5 題全正時單尾 p＝1/32', () => {
  const r = signTest([0.5, 1, 0.5, 1, 0.5])
  assert.equal(r.positive, 5)
  assert.ok(Math.abs(r.pOneSided - 1 / 32) < 1e-12)
  const t = signTest([0.5, 0, 0, -0.5])
  assert.equal(t.ties, 2)
  assert.equal(t.pTwoSided, 1)
})

test('成對 bootstrap：固定種子可重現；全對 vs 全錯的區間是 [1,1]', () => {
  const a = [1, 1, 0, 1, 0.5, 1]
  const b = [0, 0, 0, 1, 0, 0]
  const x = pairedBootstrap(a, b, { resamples: 2000, seed: 7 })
  const y = pairedBootstrap(a, b, { resamples: 2000, seed: 7 })
  assert.deepEqual(x, y)
  assert.ok(x.low <= x.estimate && x.estimate <= x.high)
  const z = pairedBootstrap([1, 1, 1], [0, 0, 0], { resamples: 500, seed: 1 })
  assert.deepEqual([z.estimate, z.low, z.high], [1, 1, 1])
  assert.throws(() => pairedBootstrap([1], [1, 0]))
})
