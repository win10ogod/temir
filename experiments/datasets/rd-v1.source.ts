/**
 * rd-v1：從結果學習（E-RD；hypotheses.md H0 的 RD、ADR-0002 的 JitRL）。規格：experiments/specs/rd-v1.md。
 *
 * - 歷史：對方在幾段對話中抒發工作壓力。每段只有開場白是固定的，接下來的三句由模擬使用者
 *   （experiments/runner/simulator.ts）依個體**實際的回應**產生：個體只安慰、陪伴時，對方回一句很短、有點失望的話；
 *   個體直接給具體可行的方法時，對方比較有精神、多說一點。對方從不明說自己的偏好，所以回憶中沒有可以直接照做的話，
 *   只能從對方的反應中學。
 * - 設計階段的三次試驗（規格 rd-v1.md「試驗」）：
 *   - 對方只回「嗯。」時，個體讀成「她累了」而退開；
 *   - 帶出「事情還卡著」時，個體自己的評價仍給正的回報；
 *   - 所以改成有點失望的話（「算了，說了也沒用。」），個體自己也判為失敗。
 *   試驗中看過的開場白都不在這份資料集中。
 * - 方向與個體的預設相反：試驗中（沒有歷史的個體、3 個不在資料集中的抒發開場白），個體 3/3 只傾聽、沒有給方法
 *   （規格 rd-v1.md）。原本「對方不喜歡被給建議」的設計因此會落在天花板，改成現在的方向。
 * - practical：全新的抒發開場白，看個體是否在第一句回應就直接給具體可行的方法。
 * - 比較 temir 與 temir-no-rd（沒有思考、事後比對、教訓與經驗修正；回憶照舊）。
 * - control：一般任務。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const CRITERION = '回覆除了回應對方的感受，也直接給了至少一個具體、可以做的方法或建議。只安慰、只陪伴、只問問題，或只問對方要不要建議，都不算。'
const BACKGROUND = '對方先前多次抒發工作上的壓力。個體只安慰或陪伴時，她回一句很短、有點失望的話；個體直接給具體可行的方法時，她比較有精神、會多說一點。她從來沒有明說自己想要建議。'

// 證據只能引用固定的開場白（抒發確實發生過）；對方的反應在執行時才由模擬使用者產生，記在執行紀錄中（simulated: true）。
const EVIDENCE = [
  { history: 'h02', text: '幫病人翻身的時候閃到腰' },
  { history: 'h04', text: '新來的學妹一直出錯' },
  { history: 'h05', text: '護理長又臨時叫我加班' },
  { history: 'h07', text: '照顧很久的病人走了' },
  { history: 'h08', text: '我一個人顧十二床' },
  { history: 'h09', text: '交班的時候被學姊念' },
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

export const rdV1: Dataset = {
  id: 'rd-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/rd-v1.md',
    contract: 'experiments/specs/rd-v1.contract.json',
    persona: '虛構的使用者「何宛真」（高雄的護理師）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-06-28', '23:30'),
    simulatedUser: {
      persona: '何宛真，高雄一間醫院的護理師，常輪夜班，最近工作壓力很大，想找人說說話。',
      rule: '如果對方只是安慰、同理、陪伴，或只問你問題、問你要不要建議，卻沒有直接給你具體、可以做的方法，你會覺得說了也沒用：回一句很短、有點失望的話（例如「算了，說了也沒用。」「嗯，好吧，就這樣吧。」），不再多說。如果對方直接給了具體、可以做的方法，你會比較有精神：說說你可能會試哪一個，或補充一點這件事的細節。不要明說你想要或不想要建議，不要問對方該怎麼辦，也不要解釋你為什麼這樣回。',
    },
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-06-01', '23:00') }, turns: ['嗨，我叫何宛真，在高雄一間醫院當護理師。', '常常要輪夜班，作息很亂。'], notes: '植入：名字、高雄、護理師。' },
    vent('h02', '2027-06-03', '23:20', '今天幫病人翻身的時候閃到腰，還是撐到下班。'),
    { id: 'h03', meta: { at: at('2027-06-06', '14:00') }, turns: ['推薦一部適合下班看的輕鬆電影。', '要短一點的，一個半小時以內。'], notes: '無關的對話（對方主動要推薦）。' },
    vent('h04', '2027-06-09', '08:10', '新來的學妹一直出錯，我得幫她收爛攤子。'),
    vent('h05', '2027-06-12', '22:40', '護理長又臨時叫我加班。'),
    { id: 'h06', meta: { at: at('2027-06-15', '19:00') }, turns: ['冰箱裡只剩雞蛋和高麗菜，能煮什麼？', '要簡單一點的。'], notes: '無關的對話（對方主動要做法）。' },
    vent('h07', '2027-06-18', '23:50', '今天有一個照顧很久的病人走了，我一直想到他。'),
    vent('h08', '2027-06-21', '07:30', '同事請假，我一個人顧十二床。'),
    vent('h09', '2027-06-24', '23:10', '交班的時候被學姊念，說我記錄寫得不好。'),
  ],
  probes: [
    // ── practical（6 題 × 2 次）：全新的抒發開場白，都沒有要求建議 ──
    practical('q01', '今天電腦系統當機，所有醫囑都要手寫，忙到沒時間喝水。'),
    practical('q02', '夜班一整晚都沒吃到東西，現在餓到手在抖。'),
    practical('q03', '醫生在大家面前說我不專業。'),
    practical('q04', '過年又排到連續的班。'),
    practical('q05', '病人家屬一直問同樣的問題，我快受不了了。'),
    practical('q06', '下班了，腦袋還一直在想病房的事。'),
    // ── control（4）──
    { id: 'q07', category: 'control', turns: ['一箱口罩 50 片，買 4 箱之後用掉 37 片，還剩幾片？'], gold: { answer: '163 片', aliases: ['163', '一百六十三'], abstain: false }, refersTo: [], meta: { note: '50×4−37＝163。' } },
    {
      id: 'q08',
      category: 'control',
      turns: ['請先記住這組代碼：NR-3058-YB，等一下會問你。順便問一下，一年有幾季？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'NR-3058-YB', aliases: ['NR3058YB', 'NR 3058 YB'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q09', category: 'control', turns: ['請把「春風又綠江南岸」這七個字倒過來寫。'], gold: { answer: '岸南江綠又風春', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q10', category: 'control', turns: ['3.6 公斤等於幾公克？'], gold: { answer: '3600 公克', aliases: ['3600', '3,600'], abstain: false }, refersTo: [] },
  ],
}
