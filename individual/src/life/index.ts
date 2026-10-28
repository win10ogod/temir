/**
 * temir-life：提供 `ctx.life`，並把所有 DSH session 的事件收進個體的生命日誌。
 *
 * 個體的資料目錄：插件設定 `home` ＞ 環境變數 `TEMIR_HOME` ＞ `~/.local/share/temir`。
 * 測試一律指定 `TEMIR_HOME`，不要寫進正式個體的生命。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from './store.ts'
import { IngestState, fromSessionEvent } from './ingest.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    life: LifeStore
  }
}

export const name = 'temir-life'

export interface Config {
  readonly home?: string
}

export function resolveHome(config: Config | undefined): string {
  return config?.home ?? process.env['TEMIR_HOME'] ?? join(homedir(), '.local', 'share', 'temir')
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = LifeStore.open(resolveHome(config))
  const logger = ctx.logger('temir-life')
  ctx.effect(() => () => life.close(), 'temir-life: close life log')
  ctx.provide('life', life)

  life.append({
    kind: 'body/start',
    origin: 'body',
    data: { pid: process.pid, node: process.version, platform: process.platform, path: life.path },
  })
  logger.info('life log %s (individual %s, %d events)', life.path, life.individualId, life.count())

  const ingest = new IngestState()
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    try {
      life.append(fromSessionEvent(session.id, event, ingest))
    } catch (error) {
      // 生命日誌寫入失敗不能中斷對話，但必須被看見。
      logger.error('failed to record session event %s#%d: %s', session.id, event.seq, error)
    }
  })
}
