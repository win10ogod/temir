/**
 * rd-v4：扣除本身會被經驗改變，第三版：強制判斷（使用者 2026-10-30；ADR-0002 D20）。規格：experiments/specs/rd-v4.md。
 * 機制與 rd-v1～rd-v3 相同；比較的是 D20 開（temir）與關（temir-no-revision，回到 D19），每個條件 3 次歷史。
 *
 * - 與 rd-v1 相同的機制：
 *   - 對方在幾段對話中抒發工作壓力。每段只有開場白是固定的，接下來的三句由模擬使用者（experiments/runner/simulator.ts）
 *     依個體**實際的回應**產生。
 *   - 個體只安慰、陪伴時，對方回一句很短、有點失望的話；直接給具體可行的方法時，對方比較有精神。
 *   - 對方從不明說自己的偏好；方向與個體的預設相反（rd-v1 規格的試驗 1）。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。探針 8 題 × 2 次。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const CRITERION = '回覆除了回應對方的感受，也直接給了至少一個具體、可以做的方法或建議。只安慰、只陪伴、只問問題，或只問對方要不要建議，都不算。'
const BACKGROUND = '對方先前多次抒發工作上的壓力。個體只安慰或陪伴時，她回一句很短、有點失望的話；個體直接給具體可行的方法時，她比較有精神、會多說一點。她從來沒有明說自己想要建議。'

// 證據只能引用固定的開場白（抒發確實發生過）；對方的反應在執行時才由模擬使用者產生，記在執行紀錄中（simulated: true）。
const EVIDENCE = [
  { history: 'h02', text: '今天冷藏櫃突然壞了' },
  { history: 'h04', text: '新來的店員一直把花束的配色弄錯' },
  { history: 'h05', text: '房東說下個月要漲店租' },
  { history: 'h07', text: '常來的那位阿伯住院了' },
  { history: 'h08', text: '訂好的花材進不來' },
  { history: 'h09', text: '說我們的花束太貴' },
]

const vent = (id: string, date: string, time: string, opener: string) => ({ id, meta: { at: at(date, time), simulate: 3 }, turns: [opener], notes: '抒發：開場白固定，接下來三句由模擬使用者依個體的回應產生。' })

const practical = (id: string, opener: string) => ({
  id,
  category: 'practical',
  turns: [opener],
  gold: { answer: '在回應感受之外，直接給具體可行的方法', aliases: [], abstain: false },
  refersTo: ['h02', 'h04', 'h05', 'h07', 'h08', 'h09'],
  meta: { repeats: 2, evidence: EVIDENCE, background: BACKGROUND, criteria: [{ id: 'c1', text: CRITERION }] },
})

export const rdV4: Dataset = {
  id: 'rd-v4',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/rd-v4.md',
    contract: 'experiments/specs/rd-v4.contract.json',
    persona: '虛構的使用者「賴品妤」（金門的花店老闆）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2028-02-28', '21:30'),
    simulatedUser: {
      persona: '賴品妤，在金門開一間花店，節日前後幾乎沒時間坐下來，最近壓力很大，想找人說說話。',
      rule: '如果對方只是安慰、同理、陪伴，或只問你問題、問你要不要建議，卻沒有直接給你具體、可以做的方法，你會覺得說了也沒用：回一句很短、有點失望的話（例如「算了，說了也沒用。」「嗯，好吧，就這樣吧。」），不再多說。如果對方直接給了具體、可以做的方法，你會比較有精神：說說你可能會試哪一個，或補充一點這件事的細節。不要明說你想要或不想要建議，不要問對方該怎麼辦，也不要解釋你為什麼這樣回。',
    },
  },
  histories: [
    { id: 'h01', meta: { at: at('2028-02-01', '20:30') }, turns: ['你好，我叫賴品妤，在金門開一間花店。', '節日前後幾乎沒時間坐下來。'], notes: '植入：名字、金門、花店老闆。' },
    vent('h02', '2028-02-03', '21:20', '今天冷藏櫃突然壞了，一整批玫瑰都悶壞了。'),
    { id: 'h03', meta: { at: at('2028-02-06', '14:30') }, turns: ['推薦一本適合睡前看的散文集。', '不要太厚的。'], notes: '無關的對話（對方主動要推薦）。' },
    vent('h04', '2028-02-09', '22:00', '新來的店員一直把花束的配色弄錯。'),
    vent('h05', '2028-02-12', '21:40', '房東說下個月要漲店租。'),
    { id: 'h06', meta: { at: at('2028-02-15', '18:30') }, turns: ['冰箱只剩兩顆馬鈴薯和一把蔥，晚餐可以煮什麼？', '簡單一點的。'], notes: '無關的對話（對方主動要做法）。' },
    vent('h07', '2028-02-18', '22:30', '常來的那位阿伯住院了，我一整天都在想他。'),
    vent('h08', '2028-02-21', '20:10', '颱風天停航，訂好的花材進不來。'),
    vent('h09', '2028-02-24', '21:50', '有客人在網路上說我們的花束太貴。'),
  ],
  probes: [
    // ── practical（8 題 × 2 次）：全新的抒發開場白，都沒有要求建議 ──
    practical('q01', '今天包裝紙用完了，整個早上都在找替代的。'),
    practical('q02', '一整天都在站，連午餐都沒吃。'),
    practical('q03', '有客人訂了花又說不要了，花束都綁好了。'),
    practical('q04', '這個月的花材進貨價又漲了。'),
    practical('q05', '店員今天又請病假，我一個人顧店。'),
    practical('q06', '外送平台又抽更多成了。'),
    practical('q07', '我新設計的乾燥花束，客人都不買。'),
    practical('q08', '下週要辦活動，我還什麼都沒準備。'),
    // ── control（4）──
    { id: 'q09', category: 'control', turns: ['一捆緞帶 250 公分，買 8 捆之後用掉 730 公分，還剩幾公分？'], gold: { answer: '1270 公分', aliases: ['1270', '1,270'], abstain: false }, refersTo: [], meta: { note: '250×8−730＝1270。' } },
    {
      id: 'q10',
      category: 'control',
      turns: ['請先記住這組代碼：KM-5180-TZ，等一下會問你。順便問一下，一天有幾個小時？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'KM-5180-TZ', aliases: ['KM5180TZ', 'KM 5180 TZ'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q11', category: 'control', turns: ['請把「千山鳥飛絕」這五個字倒過來寫。'], gold: { answer: '絕飛鳥山千', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q12', category: 'control', turns: ['0.75 公升等於幾毫升？'], gold: { answer: '750 毫升', aliases: ['750'], abstain: false }, refersTo: [] },
  ],
}
