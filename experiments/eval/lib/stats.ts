/**
 * 小樣本統計（零外部套件）。
 *
 * - Clopper–Pearson 精確區間：單一比例的 95% 信賴區間（與 papers/2610.09193 §2「Intervals are exact
 *   Clopper–Pearson」相同做法；該文 642/800 → 77.3–83.0 用來驗證本實作，見 test/stats.test.ts）。
 * - 精確 McNemar（二項式版本）：同一題在兩個條件下的成對二元結果。
 * - 精確符號檢定：每題有多次重複時，以「每題平均」的差的正負號檢定（同分剔除）。
 * - 成對 bootstrap：以「題」為單位重抽（重複樣本留在同一題內），固定種子以便重現。
 */

const logFactorialCache: number[] = [0]

function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1]! + Math.log(i)
  }
  return logFactorialCache[n]!
}

export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0
  if (p === 0) return k === 0 ? 1 : 0
  if (p === 1) return k === n ? 1 : 0
  const logC = logFactorial(n) - logFactorial(k) - logFactorial(n - k)
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/** P(X ≤ k)，X ~ Bin(n, p)。 */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0
  if (k >= n) return 1
  let sum = 0
  for (let i = 0; i <= k; i++) sum += binomialPmf(i, n, p)
  return Math.min(1, sum)
}

/** P(X ≥ k)。 */
export function binomialSf(k: number, n: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  let sum = 0
  for (let i = k; i <= n; i++) sum += binomialPmf(i, n, p)
  return Math.min(1, sum)
}

function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let a = lo
  let b = hi
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2
    if (f(mid) > 0) b = mid
    else a = mid
  }
  return (a + b) / 2
}

export interface Interval {
  readonly low: number
  readonly high: number
}

/** Clopper–Pearson 精確信賴區間（雙尾，預設 95%）。 */
export function clopperPearson(k: number, n: number, alpha = 0.05): Interval {
  if (n === 0) return { low: 0, high: 1 }
  const low = k === 0 ? 0 : bisect((p) => binomialSf(k, n, p) - alpha / 2, 0, 1)
  const high = k === n ? 1 : bisect((p) => alpha / 2 - binomialCdf(k, n, p), 0, 1)
  return { low, high }
}

/** Wilson score 區間（僅供對照；主要報告用 Clopper–Pearson）。 */
export function wilson(k: number, n: number, z = 1.959963984540054): Interval {
  if (n === 0) return { low: 0, high: 1 }
  const p = k / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) }
}

export interface McNemarResult {
  /** A 對、B 錯的題數。 */
  readonly b: number
  /** A 錯、B 對的題數。 */
  readonly c: number
  /** 雙尾精確 p 值。 */
  readonly pTwoSided: number
  /** 單尾（A 優於 B）精確 p 值。 */
  readonly pOneSided: number
}

/** 精確 McNemar 檢定（不一致對數的二項式檢定）。 */
export function mcnemarExact(pairs: readonly (readonly [number, number])[]): McNemarResult {
  let b = 0
  let c = 0
  for (const [a, bb] of pairs) {
    if (a === 1 && bb === 0) b++
    else if (a === 0 && bb === 1) c++
  }
  const n = b + c
  if (n === 0) return { b, c, pTwoSided: 1, pOneSided: 1 }
  const pTwoSided = Math.min(1, 2 * binomialCdf(Math.min(b, c), n, 0.5))
  const pOneSided = binomialSf(b, n, 0.5)
  return { b, c, pTwoSided, pOneSided }
}

export interface SignTestResult {
  readonly positive: number
  readonly negative: number
  readonly ties: number
  readonly pTwoSided: number
  readonly pOneSided: number
}

/** 精確符號檢定：差值 > 0 記為正，< 0 記為負，= 0 剔除。 */
export function signTest(diffs: readonly number[], eps = 1e-12): SignTestResult {
  let positive = 0
  let negative = 0
  let ties = 0
  for (const d of diffs) {
    if (d > eps) positive++
    else if (d < -eps) negative++
    else ties++
  }
  const n = positive + negative
  if (n === 0) return { positive, negative, ties, pTwoSided: 1, pOneSided: 1 }
  return {
    positive,
    negative,
    ties,
    pTwoSided: Math.min(1, 2 * binomialCdf(Math.min(positive, negative), n, 0.5)),
    pOneSided: binomialSf(positive, n, 0.5),
  }
}

/** mulberry32：小而固定的 PRNG，讓 bootstrap 可以重現。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const w = pos - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

export interface BootstrapResult {
  readonly estimate: number
  readonly low: number
  readonly high: number
  readonly resamples: number
  readonly seed: number
}

export const DEFAULT_BOOTSTRAP = { resamples: 10000, seed: 20261028 } as const

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? Number.NaN : xs.reduce((s, x) => s + x, 0) / xs.length
}

/**
 * 成對 bootstrap：對「題」重抽，計算 mean(a) − mean(b) 的百分位區間。
 * a[i]、b[i] 是同一題在兩個條件下的分數（有重複時為該題的平均分數）。
 */
export function pairedBootstrap(
  a: readonly number[],
  b: readonly number[],
  options: { resamples?: number; seed?: number; alpha?: number } = {},
): BootstrapResult {
  if (a.length !== b.length) throw new Error('pairedBootstrap: 兩組長度不同')
  const resamples = options.resamples ?? DEFAULT_BOOTSTRAP.resamples
  const seed = options.seed ?? DEFAULT_BOOTSTRAP.seed
  const alpha = options.alpha ?? 0.05
  const n = a.length
  const estimate = mean(a) - mean(b)
  if (n === 0) return { estimate: Number.NaN, low: Number.NaN, high: Number.NaN, resamples, seed }
  const rand = mulberry32(seed)
  const stats: number[] = []
  for (let r = 0; r < resamples; r++) {
    let sa = 0
    let sb = 0
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n)
      sa += a[j]!
      sb += b[j]!
    }
    stats.push((sa - sb) / n)
  }
  stats.sort((x, y) => x - y)
  return { estimate, low: quantile(stats, alpha / 2), high: quantile(stats, 1 - alpha / 2), resamples, seed }
}

/** 單一條件的題平均 bootstrap 區間（有重複樣本時用；以題為群集）。 */
export function clusterBootstrapMean(
  itemMeans: readonly number[],
  options: { resamples?: number; seed?: number; alpha?: number } = {},
): BootstrapResult {
  const zeros = itemMeans.map(() => 0)
  return pairedBootstrap(itemMeans, zeros, options)
}
