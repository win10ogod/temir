/**
 * 改進清單第 10 項：PID 檔與 host 腳本（cli/host.ts、scripts/host.sh）、dsh-im 的 Telegram 綁定 payload。
 * PID 的測試用真的程序（sleep）；HTTP 的部分以 fetch 的測試替身代替，不連到任何地方。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accessPolicyRequest, alive, bindTelegram, boundBotId, connect, cookieOf, launchUrl, mask, pidState, readPid, safeAccessPolicy, stopPid, telegramBindRequest, writePid } from '../../cli/host.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** 一定不存在的 PID（Linux 的 pid_max 上限是 2^22）。 */
const NO_SUCH_PID = 4_194_305

function withDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'temir-host-'))
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }))
}

const waitFor = async (check: () => boolean, ms = 5000) => {
  const deadline = Date.now() + ms
  while (!check() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
  return check()
}

test('PID files: write and read back with the start time; garbage and missing files are not a PID', () =>
  withDir((dir) => {
    const file = join(dir, 'x.pid')
    assert.equal(readPid(file), undefined)
    const record = writePid(file, process.pid)
    assert.deepEqual(readPid(file), record)
    assert.match(record.start ?? '', /^\d+$/, 'the start time comes from /proc')
    assert.deepEqual(pidState(file), { state: 'running', record })
    writeFileSync(file, 'not a pid\n')
    assert.equal(readPid(file), undefined)
    assert.deepEqual(pidState(file), { state: 'missing' })
    writeFileSync(file, '1 -\n')
    assert.equal(readPid(file), undefined, 'PID 1 is never ours')
  }))

test('stopPid: a PID that does not exist, or a reused PID, ends nothing and only removes the stale file', () =>
  withDir(async (dir) => {
    const file = join(dir, 'x.pid')
    assert.equal(await stopPid(file), 'missing')
    writeFileSync(file, `${NO_SUCH_PID} 123\n`)
    assert.equal(await stopPid(file), 'stale')
    assert.equal(existsSync(file), false)
    // PID 被重用：PID 是這個測試程序，開始時間卻不同。不能結束它。
    writeFileSync(file, `${process.pid} 1\n`)
    assert.equal(pidState(file).state, 'stale')
    assert.equal(await stopPid(file), 'stale')
    assert.ok(alive(process.pid))
  }))

test('stopPid ends the recorded process and its process group', () =>
  withDir(async (dir) => {
    const file = join(dir, 'x.pid')
    // detached：自己的程序群組（host.sh 以 setsid 啟動 dsh）。群組裡另有一個子程序。
    const leader = spawn('bash', ['-c', 'sleep 30 & echo $!; wait'], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const child = await new Promise<number>((resolve) => leader.stdout!.once('data', (b: Buffer) => resolve(Number(String(b).trim()))))
    writePid(file, leader.pid!)
    assert.equal(pidState(file).state, 'running')
    assert.equal(await stopPid(file, 3000), 'stopped')
    assert.ok(await waitFor(() => !alive(leader.pid!)), 'the leader ended')
    assert.ok(await waitFor(() => !alive(child) || readFileSync(`/proc/${child}/stat`, 'utf8').includes(') Z ')), 'the child in the group ended too')
    assert.equal(existsSync(file), false)
  }))

test('scripts/host.sh stop and status exit safely when nothing runs or the PID is stale', () =>
  withDir((dir) => {
    const env = { ...process.env, TEMIR_CACHE: dir, TEMIR_NODE_DIR: join(dirname(process.execPath), '..') }
    const run = (cmd: string) => spawnSync('bash', [join(REPO, 'scripts/host.sh'), cmd], { env, encoding: 'utf8' })
    const missing = run('stop')
    assert.equal(missing.status, 0, missing.stderr)
    assert.match(missing.stdout, /沒有在執行（沒有 PID 檔）/)
    writeFileSync(join(dir, 'run', 'web.pid'), `${NO_SUCH_PID} 42\n`)
    assert.match(run('status').stdout, /PID 檔過期/)
    const stale = run('stop')
    assert.equal(stale.status, 0, stale.stderr)
    assert.match(stale.stdout, /移除過期的 PID 檔，沒有結束任何程序/)
    assert.equal(existsSync(join(dir, 'run', 'web.pid')), false)
    assert.equal(statSync(join(dir, 'run')).mode & 0o777, 0o700)
  }))

test('launch URL: the token is taken out of the printed URL; the base keeps its mount path', () => {
  assert.deepEqual(launchUrl('DSH Web 已啟動：http://127.0.0.1:4173/?token=AbC_123-x\n'), { base: 'http://127.0.0.1:4173', token: 'AbC_123-x' })
  assert.deepEqual(launchUrl('open http://localhost:9000/dsh/?lang=zh&token=t0k#x'), { base: 'http://localhost:9000/dsh', token: 't0k' })
  assert.equal(launchUrl('listening on http://127.0.0.1:4173/'), undefined)
  assert.equal(cookieOf('dsh_auth_127.0.0.1_4173=v2.abc; Path=/; HttpOnly; SameSite=Strict'), 'dsh_auth_127.0.0.1_4173=v2.abc')
  assert.equal(cookieOf(null), undefined)
})

test('connect exchanges the token for a cookie stored with mode 600 (test double for fetch)', () =>
  withDir(async (dir) => {
    const seen: string[] = []
    // 測試替身（單元測試專用）：/connect 回 302 與 Set-Cookie。
    const ok = (async (url: URL, init: RequestInit) => {
      seen.push(`${url.pathname}?${url.searchParams.toString()} redirect=${init.redirect}`)
      return new Response(null, { status: 302, headers: { 'set-cookie': 'dsh_auth=v2.signed; Path=/; HttpOnly' } })
    }) as unknown as typeof fetch
    const file = join(dir, 'cookie')
    await connect('http://127.0.0.1:4173', 'secret-launch-token', file, ok)
    assert.deepEqual(seen, ['/connect?token=secret-launch-token redirect=manual'])
    assert.equal(readFileSync(file, 'utf8'), 'dsh_auth=v2.signed\n')
    assert.equal(statSync(file).mode & 0o777, 0o600)
    // 測試替身（單元測試專用）：token 不對時 DSH 回 401。
    const denied = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch
    await assert.rejects(connect('http://127.0.0.1:4173', 'secret-launch-token', file, denied), (e: Error) => /HTTP 401/.test(e.message) && !e.message.includes('secret-launch-token'))
  }))

test('dsh-im payloads: bind-credentials and the safe access policy have exactly the shape dsh-im 5.8.0 validates', () => {
  const bind = telegramBindRequest('123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'r1')
  assert.deepEqual(bind, { type: 'client-request', rpcId: 'r1', method: 'dsh-im/telegram', payload: { method: 'bot.bind-credentials', payload: { token: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAA' } } })
  assert.throws(() => telegramBindRequest('too-short'), /不是有效的 Bot Token/)
  const policy = accessPolicyRequest('telegram_0123456789abcdef01234567', ' 987654321 ', { rpcId: 'r2' })
  assert.deepEqual(policy.payload, {
    method: 'bot.access-policy.set',
    payload: {
      botId: 'telegram_0123456789abcdef01234567',
      policy: {
        direct: { mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [{ id: '987654321', canExecuteCommands: false }] } },
        group: { mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [] } },
      },
    },
  })
  assert.equal(safeAccessPolicy('1', true).direct.allowlist.users[0]!.canExecuteCommands, true)
  assert.throws(() => accessPolicyRequest('bad id!', '1'), /botId/)
  assert.throws(() => safeAccessPolicy('  '), /使用者 ID/)
  assert.throws(() => safeAccessPolicy('a‮b'), /使用者 ID/)
})

test('boundBotId: the bot that appeared after binding; a rebinding is unambiguous only with one bot', () => {
  const s = (...ids: string[]) => ({ bots: ids.map((botId) => ({ botId })) })
  const cases: [ReturnType<typeof s>, ReturnType<typeof s>, string | undefined][] = [
    [s(), s('b1'), 'b1'],
    [s('a'), s('a', 'b1'), 'b1'],
    [s('b1'), s('b1'), 'b1'],
    [s('a', 'b1'), s('a', 'b1'), undefined],
    [s(), s(), undefined],
  ]
  for (const [before, after, expected] of cases) assert.equal(boundBotId(before, after), expected)
  assert.equal(mask('987654321'), '98•••21')
})

test('bindTelegram: status, bind, then the safe policy, all on the local management API with the cookie (test double for fetch)', async () => {
  const calls: { url: string; cookie: string; method: string; payload: unknown }[] = []
  // 測試替身（單元測試專用）：依 dsh-im 的回應形狀回覆（{type:"server-response", rpcId, result}）。
  const fake = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as { rpcId: string; payload: { method: string; payload: unknown } }
    calls.push({ url, cookie: init.headers['cookie']!, method: body.payload.method, payload: body.payload.payload })
    const value = body.payload.method === 'connection.status' ? { bots: [] } : body.payload.method === 'bot.bind-credentials' ? { bots: [{ botId: 'telegram_abc', state: 'connected' }] } : { ok: true }
    return Response.json({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } })
  }) as unknown as typeof fetch
  const botId = await bindTelegram('http://127.0.0.1:4173', 'dsh_auth=v2.signed', { token: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAA', userId: '987654321' }, fake)
  assert.equal(botId, 'telegram_abc')
  assert.deepEqual(calls.map((c) => [c.url, c.cookie, c.method]), [
    ['http://127.0.0.1:4173/api/dsh-im/telegram', 'dsh_auth=v2.signed', 'connection.status'],
    ['http://127.0.0.1:4173/api/dsh-im/telegram', 'dsh_auth=v2.signed', 'bot.bind-credentials'],
    ['http://127.0.0.1:4173/api/dsh-im/telegram', 'dsh_auth=v2.signed', 'bot.access-policy.set'],
  ])
  assert.deepEqual((calls[2]!.payload as { policy: { direct: { allowlist: { users: unknown[] } } } }).policy.direct.allowlist.users, [{ id: '987654321', canExecuteCommands: false }])
  // 測試替身（單元測試專用）：dsh-im 拒絕時，錯誤訊息不含 token。
  const reject = (async (_url: string, init: { body: string }) => Response.json({ type: 'server-response', rpcId: (JSON.parse(init.body) as { rpcId: string }).rpcId, result: { ok: false, error: { code: 'invalid-token', message: 'Telegram Bot Token 无效' } } })) as unknown as typeof fetch
  await assert.rejects(bindTelegram('http://127.0.0.1:4173', 'c=1', { token: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAA', userId: '1' }, reject), (e: Error) => /invalid-token/.test(e.message) && !e.message.includes('AAAA'))
})
