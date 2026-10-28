import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore, buildMatchQuery } from '../src/life/store.ts'

function withStore(fn: (store: LifeStore, home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-life-'))
  const store = LifeStore.open(home)
  try {
    fn(store, home)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

test('a new life starts with exactly one birth event and a stable individual id', () => {
  withStore((store, home) => {
    const born = store.all('life/born')
    assert.equal(born.length, 1)
    assert.equal((born[0]?.data as { individualId: string }).individualId, store.individualId)
    store.close()
    const reopened = LifeStore.open(home)
    try {
      assert.equal(reopened.individualId, store.individualId)
      assert.equal(reopened.all('life/born').length, 1)
    } finally {
      reopened.close()
    }
  })
})

test('the life log is append-only: updates and deletes are refused', () => {
  withStore((store) => {
    store.append({ kind: 'note', origin: 'self', data: { x: 1 }, text: 'something happened' })
    assert.ok(store.path.endsWith('life.db'))
    // 以另一個連線直接改資料庫，模擬繞過 API 的修改。
    const raw = new DatabaseSync(store.path)
    try {
      assert.throws(() => raw.exec(`UPDATE events SET kind = 'tampered'`), /append-only/)
      assert.throws(() => raw.exec(`DELETE FROM events`), /append-only/)
    } finally {
      raw.close()
    }
  })
})

test('appending with an existing id is idempotent', () => {
  withStore((store) => {
    const first = store.append({ id: 's1#4', kind: 'dsh/user/message', origin: 'session', data: { a: 1 } })
    const again = store.append({ id: 's1#4', kind: 'dsh/user/message', origin: 'session', data: { a: 2 } })
    assert.equal(first.seq, again.seq)
    assert.deepEqual(again.data, { a: 1 })
  })
})

test('search finds Chinese and English text and can exclude the current session', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '我上週搬到里昂，還在整理行李' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '里昂的天氣怎麼樣' })
    store.append({ kind: 'appraisal', origin: 'self', data: {}, text: 'I felt uneasy when I refused the request' })
    const zh = store.search('你還記得我搬到里昂的事嗎', { excludeSession: 'now' })
    assert.equal(zh.length, 1)
    assert.equal(zh[0]?.session, 'old')
    const en = store.search('why did you refuse', {})
    assert.equal(en.length, 1)
    assert.equal(en[0]?.kind, 'appraisal')
  })
})

test('links connect an appraisal to the events it is about', () => {
  withStore((store) => {
    const ev = store.append({ kind: 'dsh/user/message', origin: 'session', data: {}, text: 'a hard conversation' })
    store.append({ kind: 'appraisal', origin: 'self', data: { feeling: 'hurt' }, causes: [ev.id] })
    store.append({ kind: 'appraisal', origin: 'self', data: { feeling: 'I understand it now' }, causes: [ev.id] })
    const about = store.referencing(ev.id, 'appraisal')
    assert.deepEqual(
      about.map((e) => (e.data as { feeling: string }).feeling),
      ['hurt', 'I understand it now'],
    )
  })
})

test('buildMatchQuery skips stopwords and builds CJK bigrams', () => {
  assert.equal(buildMatchQuery('the and for'), undefined)
  assert.equal(buildMatchQuery('里昂'), '"里昂"')
  assert.equal(buildMatchQuery('貓'), '"貓"')
  assert.equal(buildMatchQuery('搬到里昂'), '"搬到" OR "到里" OR "里昂"')
  assert.equal(buildMatchQuery('Lyon "quoted"'), '"lyon" OR "quoted"')
})

test('a paraphrased Chinese question still finds the original memory through shared words', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'a', data: {}, text: '對方說：我叫阿哲，最近剛從波爾圖搬到里昂，還在整理行李。' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'a', data: {}, text: '對方說：今天的會議很無聊。' })
    const hits = store.search('你還記得我搬到哪裡嗎？我叫什麼名字？', { excludeSession: 'b' })
    assert.ok(hits.length >= 1)
    assert.match(hits[0]?.text ?? '', /里昂/)
  })
})

test('reindex rebuilds the derived search index from the log', () => {
  withStore((store) => {
    store.append({ kind: 'note', origin: 'self', data: {}, text: '第一次看到海' })
    store.reindex()
    assert.equal(store.search('看到海').length, 1)
  })
})
