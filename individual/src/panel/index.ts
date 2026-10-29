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
</style></head><body><header><b>特密爾</b><a href="/temir/">狀態</a><a href="/temir/timeline">生命日誌</a><a href="/temir/search">回憶搜尋</a></header><main>${body}</main></body></html>`
}

function eventRow(e: LifeEvent): string {
  return `<div class="ev"><div class="meta">${escape(formatTime(e.ts))}｜${escape(e.kind)}｜${escape(shortId(e.id))}</div><pre>${escape(clipEnds(e.text ?? '', 600))}</pre></div>`
}

/** 依路徑產生頁面；找不到時回傳 undefined。 */
export function render(life: LifeStore, url: URL): string | undefined {
  const path = url.pathname.replace(/\/+$/, '')
  if (path === '/temir') return page('特密爾：內在狀態', `<pre>${escape([`個體 ${life.individualId}`, '', ...stateLines(life, 5)].join('\n'))}</pre>`)
  if (path === '/temir/timeline') {
    const kind = url.searchParams.get('kind') ?? ''
    const events = life.recent(200, kind ? [kind] : undefined).filter((e) => e.text)
    return page('特密爾：生命日誌', `<p class="meta">最近 ${events.length} 個有文字的事件（新的在前）${kind ? `，種類 ${escape(kind)}` : ''}。</p>${events.map(eventRow).join('')}`)
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
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (!(config?.allowRemote ?? false) && !(isLoopback(req.socket.remoteAddress) && isLocalHost(req.headers.host))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('只回應本機的請求（生命日誌是私人資料）。')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end()
      return
    }
    try {
      const html = life.isOpen ? render(life, new URL(req.url ?? '/temir', 'http://localhost')) : undefined
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
