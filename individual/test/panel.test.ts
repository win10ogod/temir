import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { isLocalHost, isLocalOrigin, isLoopback, render } from '../src/panel/index.ts'
import { PLUGIN_KIND, activationRoute, approveFromPanel, codeHash, ownPlugins } from '../src/plugin/plugin.ts'

test('panel: only loopback requests are served by default', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.1.2.3']) assert.equal(isLoopback(a), true, a)
  for (const a of ['10.0.0.7', '192.168.1.2', '::ffff:10.0.0.7', 'fe80::1', undefined]) assert.equal(isLoopback(a), false, String(a))
  for (const h of ['localhost:18766', '127.0.0.1:18766', '[::1]:18766', 'localhost']) assert.equal(isLocalHost(h), true, h)
  for (const h of ['evil.example:18766', '127.0.0.1.evil.example', 'localhost.evil.example:80', undefined]) assert.equal(isLocalHost(h), false, String(h))
})

test('panel: state, timeline and search pages are read-only views of the life log; HTML is escaped', () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-panel-'))
  const life = LifeStore.open(home)
  try {
    life.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：<script>alert(1)</script> 我喜歡貓' })
    const before = life.lastSeq()
    const state = render(life, new URL('http://localhost/temir/'))!
    assert.match(state, /## 自我模型/)
    assert.match(state, /## 通道（dsh-im）\n沒有載入/u)
    assert.match(render(life, new URL('http://localhost/temir/'), [])!, /已載入，還沒有接入機器人/u)
    assert.match(render(life, new URL('http://localhost/temir/'), [{ botId: 'b1', channel: 'telegram' }])!, /已載入，1 個機器人：telegram（b1）/u)
    assert.match(state, /## 最近的 PC 循環/)
    const timeline = render(life, new URL('http://localhost/temir/timeline'))!
    assert.match(timeline, /&lt;script&gt;alert\(1\)&lt;\/script&gt; 我喜歡貓/)
    assert.doesNotMatch(timeline, /<script>alert/)
    const search = render(life, new URL('http://localhost/temir/search?q=喜歡貓'))!
    assert.match(search, /1 筆/)
    assert.match(render(life, new URL('http://localhost/temir/search'))!, /<form action="\/temir\/search">/)
    assert.equal(render(life, new URL('http://localhost/temir/nope')), undefined)
    assert.equal(life.lastSeq(), before, 'rendering writes nothing')
  } finally {
    life.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('plugin approvals: with dsh-im the creator approves in the local panel; the form only accepts local origins', () => {
  assert.equal(activationRoute(true, { dshIm: true, webServer: true }), 'allow')
  assert.equal(activationRoute(false, { dshIm: false, webServer: true }), 'ask', 'no IM: the DSH approval dialog is local')
  assert.equal(activationRoute(false, { dshIm: true, webServer: true }), 'panel', 'IM could relay the approval without the code')
  assert.equal(activationRoute(false, { dshIm: true, webServer: false }), 'unavailable')
  for (const o of [undefined, 'http://127.0.0.1:3080', 'http://localhost:18766']) assert.equal(isLocalOrigin(o), true, String(o))
  for (const o of ['https://evil.example', 'http://127.0.0.1.evil.example', 'null']) assert.equal(isLocalOrigin(o), false, o)
  const home = mkdtempSync(join(tmpdir(), 'temir-panel-plugins-'))
  const life = LifeStore.open(home)
  try {
    const code = 'return () => {}'
    const v1 = life.append({ kind: PLUGIN_KIND.proposal, origin: 'self', data: { op: 'add', name: 'day-counter', purpose: '查日期', code, sha256: codeHash(code) } })
    const page = render(life, new URL('http://localhost/temir/plugins'))!
    assert.match(page, /return \(\) =&gt; \{\}/u, 'the full code is shown, escaped')
    assert.match(page, new RegExp(`name="version" value="${v1.id}"`))
    assert.equal(approveFromPanel(life, 'l:nope').ok, false)
    assert.equal(approveFromPanel(life, v1.id).ok, true)
    assert.equal(ownPlugins(life)[0]!.approved, true)
    assert.equal(approveFromPanel(life, v1.id).ok, false, 'only once')
    const v2 = life.append({ kind: PLUGIN_KIND.proposal, origin: 'self', data: { op: 'revise', name: 'day-counter', purpose: '查日期', code: `${code}\n`, sha256: codeHash(`${code}\n`) } })
    assert.equal(approveFromPanel(life, v1.id).ok, false, 'an old version cannot be approved')
    assert.equal(ownPlugins(life)[0]!.approved, false)
    assert.equal(approveFromPanel(life, v2.id).ok, true)
  } finally {
    life.close()
    rmSync(home, { recursive: true, force: true })
  }
})
