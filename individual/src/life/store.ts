/**
 * 生命日誌：個體唯一的真相來源。
 *
 * 設計依據（見 research/decisions/ADR-0001-build-on-dsh.md）：
 * - 只增不改：UPDATE／DELETE 由 trigger 拒絕（WikiSkill raw/ 不可變；DSH「model-visible means logged」）。
 * - 與 DSH 的 session 檔案格式無關：session 事件被複製進來，DSH 升級或更換身體時生命紀錄不受影響。
 * - 衍生資料（links、FTS 索引）都可以從 events 重建。
 * 本模組不依賴 DSH，可單獨測試。
 */
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 事件的來源類別。 */
export type Origin =
  /** 從 DSH session 事件複製而來（對話、工具、模型輸出）。 */
  | 'session'
  /** 個體對自己的行為：自我修訂、目標、感受評價、回憶。 */
  | 'self'
  /** 身體（harness）層面的事實：誕生、啟動、模型資訊。 */
  | 'body'

export interface LifeEventInput {
  readonly kind: string
  readonly origin: Origin
  readonly data: unknown
  /** 可被回憶檢索的文字；省略則只保存不索引。 */
  readonly text?: string | undefined
  readonly session?: string | undefined
  readonly model?: string | undefined
  /** 這個事件回應、評價或引用的事件 id。 */
  readonly causes?: readonly string[] | undefined
  /** 穩定 id（用於冪等匯入）；省略則自動產生。 */
  readonly id?: string | undefined
  readonly ts?: number | undefined
}

export interface LifeEvent {
  readonly seq: number
  readonly id: string
  readonly ts: number
  readonly kind: string
  readonly origin: Origin
  readonly session: string | null
  readonly model: string | null
  readonly text: string | null
  readonly data: unknown
  readonly causes: readonly string[]
}

export interface SearchHit extends LifeEvent {
  /** FTS5 bm25 分數，越小越相關。 */
  readonly score: number
}

export interface SearchOptions {
  readonly limit?: number
  /** 排除這個 session 的事件（它們通常已在模型的上下文中）。 */
  readonly excludeSession?: string | undefined
  /** 只取這些 kind；省略則不限。 */
  readonly kinds?: readonly string[] | undefined
  /** 排除這些 kind 前綴。 */
  readonly excludeKindPrefixes?: readonly string[] | undefined
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  origin TEXT NOT NULL,
  session TEXT,
  model TEXT,
  text TEXT,
  data TEXT NOT NULL,
  causes TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS events_kind ON events(kind, seq);
CREATE INDEX IF NOT EXISTS events_session ON events(session, seq);
CREATE TRIGGER IF NOT EXISTS events_append_only_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'life log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_append_only_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'life log is append-only'); END;
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(terms, tokenize='porter unicode61');
CREATE TABLE IF NOT EXISTS links(
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  PRIMARY KEY(src, dst)
);
CREATE INDEX IF NOT EXISTS links_dst ON links(dst);
`

interface Row {
  seq: number
  id: string
  ts: number
  kind: string
  origin: string
  session: string | null
  model: string | null
  text: string | null
  data: string
  causes: string
  score?: number
}

function toEvent(row: Row): LifeEvent {
  return {
    seq: row.seq,
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    origin: row.origin as Origin,
    session: row.session,
    model: row.model,
    text: row.text,
    data: JSON.parse(row.data),
    causes: JSON.parse(row.causes) as string[],
  }
}

/** 常見英文虛詞，不進索引也不進查詢。 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'are', 'with', 'this', 'that', 'have', 'was', 'not', 'but',
  'what', 'can', 'your', 'from', 'they', 'will', 'would', 'there', 'their', 'about', 'which',
  'when', 'how', 'all', 'any', 'been', 'one', 'our', 'out', 'has', 'had', 'his', 'her', 'its',
])

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu
const WORD = /[\p{L}\p{N}_]{2,}/gu

/**
 * 檢索用的詞：CJK 連續字串切成重疊的二字組（單字串保留單字），其他文字取 ≥2 字元的詞並轉小寫。
 * 二字組是中文全文檢索的常見做法（例如 Lucene CJKAnalyzer）：多數中文詞是兩個字，
 * 先前用 trigram 時「里昂」「搬家」這類詞查不到。英文詞再經 FTS5 porter 詞幹化（refused → refus）。
 */
export function indexTerms(text: string): string[] {
  const terms: string[] = []
  for (const run of text.match(CJK_RUN) ?? []) {
    const chars = [...run]
    if (chars.length === 1) terms.push(run)
    for (let i = 0; i + 2 <= chars.length; i++) terms.push(chars[i]! + chars[i + 1]!)
  }
  for (const word of text.replace(CJK_RUN, ' ').match(WORD) ?? []) {
    const w = word.toLowerCase()
    if (!STOPWORDS.has(w)) terms.push(w)
  }
  return terms
}

/** 把自由文字轉成 FTS5 查詢：去重後的檢索詞以 OR 連接，交給 bm25 排序。 */
export function buildMatchQuery(text: string, maxTerms = 64): string | undefined {
  const terms = [...new Set(indexTerms(text))]
  if (terms.length === 0) return undefined
  return terms.slice(0, maxTerms).map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ')
}

export class LifeStore {
  readonly path: string
  readonly individualId: string
  readonly #db: DatabaseSync

  private constructor(path: string, db: DatabaseSync) {
    this.path = path
    this.#db = db
    this.individualId = this.#ensureBirth()
  }

  /** 開啟（或建立）一個個體的生命日誌。`home` 是個體的資料目錄。 */
  static open(home: string): LifeStore {
    mkdirSync(home, { recursive: true })
    const path = join(home, 'life.db')
    const db = new DatabaseSync(path)
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;')
    db.exec(SCHEMA)
    return new LifeStore(path, db)
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close()
  }

  #ensureBirth(): string {
    const row = this.#db.prepare(`SELECT value FROM meta WHERE key = 'individual_id'`).get() as
      | { value: string }
      | undefined
    if (row) return row.value
    const id = randomUUID()
    this.#db.prepare(`INSERT INTO meta(key, value) VALUES ('individual_id', ?)`).run(id)
    this.append({
      kind: 'life/born',
      origin: 'body',
      data: {
        individualId: id,
        note: '生命日誌建立。沒有預設的名字、身份或人格；自我模型為空。',
      },
    })
    return id
  }

  /**
   * 追加一個事件。帶 `id` 且已存在時不重複寫入（冪等匯入），回傳既有事件。
   */
  append(input: LifeEventInput): LifeEvent {
    const id = input.id ?? `l:${randomUUID()}`
    const ts = input.ts ?? Date.now()
    const causes = [...(input.causes ?? [])]
    const result = this.#db
      .prepare(
        `INSERT OR IGNORE INTO events(id, ts, kind, origin, session, model, text, data, causes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        ts,
        input.kind,
        input.origin,
        input.session ?? null,
        input.model ?? null,
        input.text ?? null,
        JSON.stringify(input.data ?? null),
        JSON.stringify(causes),
      )
    if (result.changes > 0) {
      const seq = Number(result.lastInsertRowid)
      if (input.text) this.#index(seq, input.text)
      const link = this.#db.prepare(`INSERT OR IGNORE INTO links(src, dst) VALUES (?, ?)`)
      for (const dst of causes) link.run(id, dst)
    }
    const stored = this.get(id)
    if (!stored) throw new Error(`life log append lost event ${id}`)
    return stored
  }

  #index(seq: number, text: string): void {
    const terms = indexTerms(text)
    if (terms.length > 0) {
      this.#db.prepare(`INSERT INTO events_fts(rowid, terms) VALUES (?, ?)`).run(seq, terms.join(' '))
    }
  }

  /** 重建檢索索引（索引是衍生資料，可隨時從 events 重建）。 */
  reindex(): void {
    this.#db.exec(`DELETE FROM events_fts`)
    const rows = this.#db.prepare(`SELECT seq, text FROM events WHERE text IS NOT NULL`).all() as unknown as {
      seq: number
      text: string
    }[]
    for (const row of rows) this.#index(row.seq, row.text)
  }

  get(id: string): LifeEvent | undefined {
    const row = this.#db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as Row | undefined
    return row ? toEvent(row) : undefined
  }

  count(): number {
    const row = this.#db.prepare(`SELECT count(*) AS n FROM events`).get() as { n: number }
    return row.n
  }

  /** 依時間倒序列出最近的事件（可限定 kind）。 */
  recent(limit = 20, kinds?: readonly string[]): LifeEvent[] {
    if (kinds && kinds.length > 0) {
      const marks = kinds.map(() => '?').join(', ')
      const rows = this.#db
        .prepare(`SELECT * FROM events WHERE kind IN (${marks}) ORDER BY seq DESC LIMIT ?`)
        .all(...kinds, limit) as unknown as Row[]
      return rows.map(toEvent)
    }
    const rows = this.#db.prepare(`SELECT * FROM events ORDER BY seq DESC LIMIT ?`).all(limit) as unknown as Row[]
    return rows.map(toEvent)
  }

  /** 最新一筆指定 kind 的事件。 */
  latest(kind: string): LifeEvent | undefined {
    const row = this.#db.prepare(`SELECT * FROM events WHERE kind = ? ORDER BY seq DESC LIMIT 1`).get(kind) as
      | Row
      | undefined
    return row ? toEvent(row) : undefined
  }

  /** 某 session 中最新一筆指定 kind 的事件。 */
  latestInSession(session: string, kind: string): LifeEvent | undefined {
    const row = this.#db
      .prepare(`SELECT * FROM events WHERE session = ? AND kind = ? ORDER BY seq DESC LIMIT 1`)
      .get(session, kind) as Row | undefined
    return row ? toEvent(row) : undefined
  }

  /** 依時間順序列出所有指定 kind 的事件。 */
  all(kind: string): LifeEvent[] {
    const rows = this.#db.prepare(`SELECT * FROM events WHERE kind = ? ORDER BY seq`).all(kind) as unknown as Row[]
    return rows.map(toEvent)
  }

  /** 指向某事件的後續事件（例如對它的感受評價），依時間順序。 */
  referencing(id: string, kind?: string): LifeEvent[] {
    const rows = (
      kind
        ? this.#db
            .prepare(
              `SELECT e.* FROM links l JOIN events e ON e.id = l.src WHERE l.dst = ? AND e.kind = ? ORDER BY e.seq`,
            )
            .all(id, kind)
        : this.#db
            .prepare(`SELECT e.* FROM links l JOIN events e ON e.id = l.src WHERE l.dst = ? ORDER BY e.seq`)
            .all(id)
    ) as unknown as Row[]
    return rows.map(toEvent)
  }

  /** 以自由文字檢索生命日誌（詞彙＋三字組，bm25 排序）。 */
  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const match = buildMatchQuery(query)
    if (!match) return []
    const limit = options.limit ?? 8
    const where: string[] = ['events_fts MATCH ?']
    const params: (string | number)[] = [match]
    if (options.excludeSession) {
      where.push('(e.session IS NULL OR e.session <> ?)')
      params.push(options.excludeSession)
    }
    if (options.kinds && options.kinds.length > 0) {
      where.push(`e.kind IN (${options.kinds.map(() => '?').join(', ')})`)
      params.push(...options.kinds)
    }
    for (const prefix of options.excludeKindPrefixes ?? []) {
      where.push(`e.kind NOT LIKE ? ESCAPE '\\'`)
      params.push(`${prefix.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
    }
    params.push(limit)
    const rows = this.#db
      .prepare(
        `SELECT e.*, bm25(events_fts) AS score
         FROM events_fts JOIN events e ON e.seq = events_fts.rowid
         WHERE ${where.join(' AND ')}
         ORDER BY score LIMIT ?`,
      )
      .all(...params) as unknown as Row[]
    return rows.map((row) => ({ ...toEvent(row), score: row.score ?? 0 }))
  }
}
