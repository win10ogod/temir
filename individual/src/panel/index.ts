/**
 * temir-panel：Web 的內在狀態面板（plan v2 M4「Web client 插件：內在狀態面板、生命日誌時間軸、記憶瀏覽」）。
 *
 * - 掛在 DSH 自己的 Web 伺服器上（`dsh-host-webserver` 的 WebServer.register），與 DSH 的 Web 介面同一個位址：
 *   `/temir/`（狀態）、`/temir/timeline`（生命日誌時間軸）、`/temir/search?q=`（回憶搜尋）。只有 Web 模式有這個伺服器。
 * - 唯讀：內容與 `scripts/temir.sh state` 相同（self/view.ts），不呼叫模型，也不寫入生命日誌。
 * - 生命日誌是私人資料：預設只回應本機（loopback）的請求，而且 Host 標頭要是 localhost、127.0.0.1 或 [::1]
 *   （擋下 DNS rebinding：別的網站把自己的網域指到 127.0.0.1 再讀這一頁）；其他回 403。設定 allowRemote 才開放。
 * - 不載入任何外部資源；頁面是伺服器產生的 HTML。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '../life/index.ts'
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { approveFromPanel, ownPlugins } from '../plugin/plugin.ts'
import { clipEnds, shortId } from '../recall/retrieve.ts'
import { formatTime } from '../self/state.ts'
import { stateLines } from '../self/view.ts'

export const name = 'temir-panel'
export const inject = ['life']

export interface Config {
  /** 允許非本機的請求（預設否：生命日誌是私人資料）。 */
  readonly allowRemote?: boolean
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Host 標頭是本機的名字（不論埠號）。 */
export function isLocalHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!
  return name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(name)
}

/** 表單送出時的 Origin：沒有（例如 curl）或是本機的頁面。擋下別的網站送出的表單（CSRF）。 */
export function isLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && isLocalHost(u.host)
  } catch {
    return false
  }
}

/** 本機的請求：IPv4／IPv6 的 loopback。 */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>
:root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e0d8; --accent: #2f5d50; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #e8e6e1; --muted: #9b9890; --line: #33322f; --accent: #8cc4b3; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 system-ui, "Noto Sans TC", sans-serif; }
header { padding: 12px 16px; border-bottom: 1px solid var(--line); display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
header b { font-size: 16px; } header a { color: var(--accent); text-decoration: none; }
main { padding: 16px; max-width: 980px; }
pre { white-space: pre-wrap; word-break: break-word; font: 14px/1.6 ui-monospace, "Noto Sans Mono CJK TC", monospace; margin: 0; }
.ev { border-bottom: 1px solid var(--line); padding: 6px 0; } .meta { color: var(--muted); font-size: 13px; }
input { font: inherit; padding: 4px 8px; width: min(420px, 70vw); background: var(--bg); color: var(--fg); border: 1px solid var(--line); }
</style></head><body><header><b>特密爾</b><a href="/temir/">狀態</a><a href="/temir/timeline">生命日誌</a><a href="/temir/search">回憶搜尋</a><a href="/temir/plugins">插件</a></header><main>${body}</main></body></html>`
}

function eventRow(e: LifeEvent): string {
  return `<div class="ev"><div class="meta">${escape(formatTime(e.ts))}｜${escape(e.kind)}｜${escape(shortId(e.id))}</div><pre>${escape(clipEnds(e.text ?? '', 600))}</pre></div>`
}

/** IM 通道的狀態（dsh-im；ADR-0006）：undefined＝沒有載入。 */
export type Channels = readonly { readonly botId: string; readonly channel: string }[] | undefined

function channelLines(channels: Channels): string[] {
  if (channels === undefined) return ['', '## 通道（dsh-im）', '沒有載入。安裝：dsh plugin --profile web add -w @xmanrui/dsh-im（ADR-0006）']
  return ['', '## 通道（dsh-im）', channels.length === 0 ? '已載入，還沒有接入機器人（在 DSH 的「設定 → IM機器人」接入）。' : `已載入，${channels.length} 個機器人：${channels.map((b) => `${b.channel}（${b.botId}）`).join('、')}`]
}

/** 依路徑產生頁面；找不到時回傳 undefined。 */
export function render(life: LifeStore, url: URL, channels?: Channels | 'unknown'): string | undefined {
  const path = url.pathname.replace(/\/+$/, '')
  if (path === '/temir') return page('特密爾：內在狀態', `<pre>${escape([`個體 ${life.individualId}`, '', ...stateLines(life, 5), ...(channels === 'unknown' ? [] : channelLines(channels))].join('\n'))}</pre>`)
  if (path === '/temir/timeline') {
    const kind = url.searchParams.get('kind') ?? ''
    const events = life.recent(200, kind ? [kind] : undefined).filter((e) => e.text)
    return page('特密爾：生命日誌', `<p class="meta">最近 ${events.length} 個有文字的事件（新的在前）${kind ? `，種類 ${escape(kind)}` : ''}。</p>${events.map(eventRow).join('')}`)
  }
  if (path === '/temir/plugins') {
    const notice = url.searchParams.get('notice')
    const rows = ownPlugins(life).map((p) => {
      const form = p.approved
        ? '<p class="meta">已核准：之後每段對話都會啟用這個版本。</p>'
        : `<form method="post" action="/temir/plugins/approve"><input type="hidden" name="version" value="${escape(p.version)}"><button>我看過程式碼，核准這個版本</button></form>`
      return `<div class="ev"><div class="meta">${escape(p.name)}｜sha256 ${escape(p.sha256.slice(0, 12))}｜${escape(formatTime(p.writtenAt))} 寫的版本｜${p.approved ? '已核准' : '還沒有核准'}</div><p>${escape(p.purpose)}</p><pre>${escape(p.code)}</pre>${form}</div>`
    })
    return page(
      '特密爾：插件',
      `${notice ? `<p class="meta">${escape(notice)}</p>` : ''}<p class="meta">個體寫給自己的插件。程式碼會在 DSH 的主程序中執行（DSH 的沙盒不是隔離），請看過再核准。核准只對這個版本有效；修改後要重新核准。</p>${rows.length > 0 ? rows.join('') : '<p>還沒有插件。</p>'}`,
    )
  }
  if (path === '/temir/search') {
    const q = (url.searchParams.get('q') ?? '').trim()
    const hits = q ? life.search(q, { limit: 40 }) : []
    const form = `<form action="/temir/search"><input name="q" value="${escape(q)}" placeholder="搜尋生命紀錄（至少兩個字，例如一個名字、一件事）"> <button>搜尋</button></form>`
    return page('特密爾：回憶搜尋', `${form}${q ? `<p class="meta">${hits.length} 筆</p>${hits.map(eventRow).join('')}` : ''}`)
  }
  return undefined
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const channels = async (): Promise<Channels> => {
    const im = ctx.get('dshIm') as { listBots(): Promise<{ botId: string; channel: string }[]> } | undefined
    if (!im) return undefined
    try {
      return await im.listBots()
    } catch {
      return []
    }
  }
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (!(config?.allowRemote ?? false) && !(isLoopback(req.socket.remoteAddress) && isLocalHost(req.headers.host))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('只回應本機的請求（生命日誌是私人資料）。')
      return
    }
    const url = new URL(req.url ?? '/temir', 'http://localhost')
    if (req.method === 'POST' && url.pathname.replace(/\/+$/, '') === '/temir/plugins/approve') {
      if (!isLocalOrigin(req.headers.origin)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('只接受本機頁面送出的核准。')
        return
      }
      let body = ''
      for await (const chunk of req) {
        body += String(chunk)
        if (body.length > 10_000) break
      }
      const version = new URLSearchParams(body).get('version') ?? ''
      const result = life.isOpen ? approveFromPanel(life, version) : { ok: false as const, reason: '生命紀錄沒有開啟' }
      const notice = result.ok ? `已核准插件 ${result.data.name} 的這個版本（sha256 ${result.data.sha256.slice(0, 12)}）。請個體再呼叫 plugin_activate。` : `沒有核准：${result.reason}`
      res.writeHead(303, { location: `/temir/plugins?notice=${encodeURIComponent(notice)}` }).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end()
      return
    }
    try {
      const html = life.isOpen ? render(life, url, await channels()) : undefined
      if (html === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('找不到這一頁。')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(req.method === 'HEAD' ? undefined : html)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error))
    }
  }
  // 只有 Web 模式有 webServer；等它出現才註冊，它離開時路由跟著移除。
  ctx.inject(['webServer'], (c) => {
    c.effect(() => c.webServer.register({ kind: 'prefix', path: '/temir', handler }), 'temir-panel: /temir routes')
  })
}
