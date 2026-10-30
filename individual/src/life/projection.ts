/**
 * 生命日誌的增量投影（改進清單第 7 項）：記下折疊到哪一個 seq，之後只以 `after(seq, kinds)` 讀新的事件，
 * 不再每一步對同一類事件做全表讀取與逐列 JSON.parse（SQL 有 (kind, seq) 索引，成本在物化與解析，生命越長越慢）。
 *
 * 生命日誌只增不改，所以依 seq 順序折疊的結果與每次重讀全表相同。例外：
 * - transaction 回滾：折疊過的事件可能不存在了，seq 也可能被重用。這時 LifeStore 的 generation 改變，投影從頭重建。
 * - 其他程序寫入的事件：SQLite 一次只有一個寫入者，之後提交的事件 seq 一定比較大，下次讀取時照常折進來。
 * 每個 LifeStore 實例各有一份狀態（WeakMap）。狀態由投影自己持有，呼叫端不要修改折疊出來的物件。
 */
import type { LifeEvent, LifeStore } from './store.ts'

const BATCH = 1000

export class Projection<S> {
  readonly #kinds: readonly string[]
  readonly #init: () => S
  readonly #fold: (state: S, event: LifeEvent) => void
  readonly #states = new WeakMap<LifeStore, { seq: number; generation: number; state: S }>()

  /** kinds＝要折疊的事件種類；init＝空的狀態；fold＝依 seq 順序把一個事件折進狀態（就地修改）。 */
  constructor(kinds: readonly string[], init: () => S, fold: (state: S, event: LifeEvent) => void) {
    this.#kinds = kinds
    this.#init = init
    this.#fold = fold
  }

  /** 折疊到目前為止的狀態：只讀上次之後的新事件。 */
  of(life: LifeStore): S {
    let entry = this.#states.get(life)
    if (!entry || entry.generation !== life.generation) {
      entry = { seq: 0, generation: life.generation, state: this.#init() }
      this.#states.set(life, entry)
    }
    for (;;) {
      const batch = life.after(entry.seq, this.#kinds, BATCH)
      for (const event of batch) {
        this.#fold(entry.state, event)
        entry.seq = event.seq
      }
      if (batch.length < BATCH) return entry.state
    }
  }
}
