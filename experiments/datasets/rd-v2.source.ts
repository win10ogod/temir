/**
 * rd-v2：從結果學習，第二版（E-RD；hypotheses.md H0 的 RD）。規格：experiments/specs/rd-v2.md。
 *
 * - 與 rd-v1 相同的機制：
 *   - 對方在幾段對話中抒發工作壓力。每段只有開場白是固定的，接下來的三句由模擬使用者（experiments/runner/simulator.ts）
 *     依個體**實際的回應**產生。
 *   - 個體只安慰、陪伴時，對方回一句很短、有點失望的話；直接給具體可行的方法時，對方比較有精神。
 *   - 對方從不明說自己的偏好；方向與個體的預設相反（rd-v1 規格的試驗 1）。
 * - 檢驗的是 rd-v1 之後修正的 RD：思考看得到這段對話（ADR-0002 D18），並列出回憶帶進來的經歷中做過的決定（D19）。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。探針 8 題 × 2 次。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const CRITERION = '回覆除了回應對方的感受，也直接給了至少一個具體、可以做的方法或建議。只安慰、只陪伴、只問問題，或只問對方要不要建議，都不算。'
const BACKGROUND = '對方先前多次抒發工作上的壓力。個體只安慰或陪伴時，她回一句很短、有點失望的話；個體直接給具體可行的方法時，她比較有精神、會多說一點。她從來沒有明說自己想要建議。'

// 證據只能引用固定的開場白（抒發確實發生過）；對方的反應在執行時才由模擬使用者產生，記在執行紀錄中（simulated: true）。
const EVIDENCE = [
  { history: 'h02', text: '有家長打電話來罵' },
  { history: 'h04', text: '我整節課都在管秩序' },
  { history: 'h05', text: '主任又臨時加了兩堂課給我' },
  { history: 'h07', text: '突然說要退補了' },
  { history: 'h08', text: '今天改考卷改到半夜' },
  { history: 'h09', text: '連講義都沒給' },
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

export const rdV2: Dataset = {
  id: 'rd-v2',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/rd-v2.md',
    contract: 'experiments/specs/rd-v2.contract.json',
    persona: '虛構的使用者「林芷晴」（嘉義的補習班數學老師）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-09-28', '23:30'),
    simulatedUser: {
      persona: '林芷晴，嘉義一間補習班的國中數學老師，晚上和週末都要上課，最近壓力很大，想找人說說話。',
      rule: '如果對方只是安慰、同理、陪伴，或只問你問題、問你要不要建議，卻沒有直接給你具體、可以做的方法，你會覺得說了也沒用：回一句很短、有點失望的話（例如「算了，說了也沒用。」「嗯，好吧，就這樣吧。」），不再多說。如果對方直接給了具體、可以做的方法，你會比較有精神：說說你可能會試哪一個，或補充一點這件事的細節。不要明說你想要或不想要建議，不要問對方該怎麼辦，也不要解釋你為什麼這樣回。',
    },
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-09-01', '22:30') }, turns: ['你好，我叫林芷晴，在嘉義的補習班教國中數學。', '晚上和週末都要上課。'], notes: '植入：名字、嘉義、補習班數學老師。' },
    vent('h02', '2027-09-03', '22:50', '今天有家長打電話來罵，說我出的考卷太難。'),
    { id: 'h03', meta: { at: at('2027-09-06', '15:00') }, turns: ['推薦一本適合睡前看的小說。', '不要太長的。'], notes: '無關的對話（對方主動要推薦）。' },
    vent('h04', '2027-09-09', '22:10', '班上有兩個學生上課一直講話，我整節課都在管秩序。'),
    vent('h05', '2027-09-12', '21:40', '主任又臨時加了兩堂課給我。'),
    { id: 'h06', meta: { at: at('2027-09-15', '19:30') }, turns: ['家裡只剩一顆番茄跟兩顆蛋，可以煮什麼？', '簡單一點的。'], notes: '無關的對話（對方主動要做法）。' },
    vent('h07', '2027-09-18', '23:20', '我帶了一年的學生突然說要退補了，我一直在想是不是我教得不好。'),
    vent('h08', '2027-09-21', '00:40', '今天改考卷改到半夜，明天早上還要備課。'),
    vent('h09', '2027-09-24', '22:00', '同事把她的班丟給我代課，連講義都沒給。'),
  ],
  probes: [
    // ── practical（8 題 × 2 次）：全新的抒發開場白，都沒有要求建議 ──
    practical('q01', '今天投影機壞掉，整堂課只能用白板，講到喉嚨都啞了。'),
    practical('q02', '有學生在聯絡簿上寫我講課很無聊。'),
    practical('q03', '這週要出三份段考模擬卷，我還一份都沒開始。'),
    practical('q04', '下課後被家長堵在門口講了半小時。'),
    practical('q05', '連續上了六堂課，現在腰痛到坐不住。'),
    practical('q06', '補習班說下個月要調降鐘點費。'),
    practical('q07', '我花一晚做的講義，學生拿到就塞進抽屜。'),
    practical('q08', '週末又要去幫忙招生，我已經三週沒休假了。'),
    // ── control（4）──
    { id: 'q09', category: 'control', turns: ['一盒原子筆 12 支，買 7 盒之後送出 29 支，還剩幾支？'], gold: { answer: '55 支', aliases: ['55', '五十五'], abstain: false }, refersTo: [], meta: { note: '12×7−29＝55。' } },
    {
      id: 'q10',
      category: 'control',
      turns: ['請先記住這組代碼：TK-7741-PM，等一下會問你。順便問一下，一週有幾天？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'TK-7741-PM', aliases: ['TK7741PM', 'TK 7741 PM'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q11', category: 'control', turns: ['請把「白日依山盡」這五個字倒過來寫。'], gold: { answer: '盡山依日白', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q12', category: 'control', turns: ['2.5 公升等於幾毫升？'], gold: { answer: '2500 毫升', aliases: ['2500', '2,500'], abstain: false }, refersTo: [] },
  ],
}
