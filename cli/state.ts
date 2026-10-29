/**
 * 唯讀檢視個體的內在狀態（內容見 individual/src/self/view.ts，Web 面板也用同一份）。
 * 不呼叫模型，也不寫入生命日誌（個體還沒誕生時不會讓它誕生）。
 *
 * 用法：scripts/temir.sh state [--cycles 3]
 *       TEMIR_HOME=/path scripts/temir.sh state      指定個體的生命資料目錄
 */
import { parseArgs } from 'node:util'
import { resolveHome } from '../individual/src/life/index.ts'
import { LifeStore } from '../individual/src/life/store.ts'
import { stateLines } from '../individual/src/self/view.ts'

function main(): void {
  const { values } = parseArgs({ options: { cycles: { type: 'string', default: '3' } } })
  const home = resolveHome(undefined)
  const life = LifeStore.openReadOnly(home)
  if (!life) {
    console.log(`個體還沒有誕生（${home} 沒有生命日誌）。第一次對話時才會誕生。`)
    return
  }
  try {
    console.log([`個體 ${life.individualId}（${life.path}）`, '', ...stateLines(life, Number(values.cycles))].join('\n'))
  } finally {
    life.close()
  }
}

main()
