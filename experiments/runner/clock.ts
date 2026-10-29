/**
 * 實驗用的模擬時鐘：以 `--import` 預先載入 DSH 子行程（NODE_OPTIONS），讓 JavaScript 的「現在」
 * 比真實時間多 TEMIR_SIM_OFFSET_MS 毫秒，之後照常流動。沒有設定時什麼都不做。
 *
 * 用途：讓歷史 session 分散在數週之間。LongMemEval（papers/2410.10813 §3）每段 session 都有時間戳，題目有提問日期；
 * v2 的歷史在幾分鐘內跑完，個體看到前後矛盾的兩句話只隔幾分鐘（dev1、dev2 的 q28、q29），時間推理也只能用明寫的日期。
 *
 * - 只換掉全域的 Date（建構子、Date()、Date.now()）；計時器、performance.now() 與 TLS 憑證檢查（OpenSSL 用系統時鐘）都不受影響。
 *   Node 內部模組用的是自己保存的 Date，Intl 不帶日期參數時也用真實時間。
 * - 偏移量由執行器在啟動時算好、放在環境變數，所以 DSH 啟動的子行程（node 腳本、`sim-bin/date`）看到的是同一個時間。
 * - 個體與 DSH 的程式碼沒有任何改變。已知的不一致：受試者用 Python 取時間、或看檔案時間時，看到的是真實時間（報告中照實記錄）。
 */
const offset = Number(process.env['TEMIR_SIM_OFFSET_MS'] ?? '')
if (Number.isFinite(offset) && offset !== 0) {
  const RealDate = Date
  const now = () => RealDate.now() + offset
  globalThis.Date = new Proxy(RealDate, {
    construct: (real, args, newTarget) => Reflect.construct(real, args.length === 0 ? [now()] : args, newTarget) as object,
    apply: () => new RealDate(now()).toString(),
    get: (real, key, receiver) => (key === 'now' ? now : Reflect.get(real, key, receiver)),
  })
}

export {}
