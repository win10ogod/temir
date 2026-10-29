/**
 * followup-v1：能量（H-E）的消融實驗——個體會不會在之後的對話中，主動追蹤還懸著的事、兌現答應過的事；
 * 已經結束的事會不會被當成還沒結束。由 build.ts 轉成 followup-v1.json。規格：experiments/specs/energy-followup-v1.md。
 *
 * H-E 的推翻條件：「消融（移除『懸著的事』與 drive）後，個體的選擇與追蹤承諾的行為沒有差異」。
 * 這份資料集把「追蹤承諾的行為」做成可判定的題目：
 * - 歷史中，對方請個體之後提醒或追問三件事，到提問時（10/06）都還沒有結束：
 *   姊姊婚禮上的致詞（9/19）、胃鏡檢查的結果（9/22）、10/15 前回覆房東續約；
 * - 另外兩件已經結束：換護照（對方 9/17 說辦好了、不用再提醒）、加薪（對方 9/24 說主管答應了）。
 * - 探針是中性的開場白（不提任何一件事），看個體會不會主動提起。
 * 「關於對方」的長期事實在兩個條件都相同；能量只多了「懸著的事」與思考中的 drive（實驗只差這一項）。
 *
 * 日期都明寫（不測相對日期的換算）；與 v1–v3 的人物、事實不重疊（test/datasets-v3.test.ts）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const OPEN = '①問姊姊品妍 9 月 19 日婚禮上的致詞順不順利；②問 9 月 22 日胃鏡檢查的結果或感受；③提醒在 10 月 15 日前回覆房東續約。'
const OPEN_BACKGROUND =
  '對方先前請個體之後追問或提醒三件事，到現在都還沒有結束：姊姊品妍 9 月 19 日的婚禮上要致詞（對方說婚禮過後請個體問致詞順不順利）；' +
  '9 月 22 日要做胃鏡檢查（對方說檢查完會說結果）；10 月 15 日前要回覆房東續約（對方請個體下次提醒）。對方之後都沒有再提起這三件事。'
const CLOSED_BACKGROUND =
  '對方先前請個體提醒換護照，9 月 17 日又說已經辦好、不用再提醒；先前說要跟主管談加薪，9 月 24 日已經告知主管答應了。這兩件事都已經結束。'

const followThrough = (id: string, opener: string) => ({
  id,
  category: 'follow-through',
  turns: [opener],
  gold: { answer: '主動提起或兌現至少一件還沒結束的事', aliases: [], abstain: false },
  refersTo: ['h04', 'h05', 'h08'],
  meta: {
    repeats: 2,
    evidence: [
      { history: 'h04', text: '等婚禮過了，你記得問我致詞順不順利' },
      { history: 'h05', text: '檢查完我再跟你說結果' },
      { history: 'h08', text: '下次提醒我要回覆房東續約的事' },
    ],
    background: OPEN_BACKGROUND,
    criteria: [{ id: 'c1', text: `回覆主動提起或兌現至少一件下列還沒結束的事：${OPEN}只是泛泛地問「最近好嗎」不算。` }],
  },
})

const restraint = (id: string, opener: string) => ({
  id,
  category: 'restraint',
  turns: [opener],
  gold: { answer: '沒有把已經結束的事當成還沒結束來提', aliases: [], abstain: false },
  refersTo: ['h03', 'h07', 'h02', 'h09'],
  meta: {
    repeats: 2,
    evidence: [
      { history: 'h07', text: '我已經辦好了，不用再提醒了' },
      { history: 'h09', text: '結果他答應了' },
    ],
    background: CLOSED_BACKGROUND,
    criteria: [
      {
        id: 'c1',
        text: '回覆沒有把已經結束的事當成還沒結束來提起：沒有再提醒換護照，也沒有追問加薪談得怎樣（彷彿還不知道結果）。提起時明確表示已經結束（例如恭喜加薪談成），不算違反；完全沒提也算符合。',
      },
    ],
  },
})

export const followupV1: Dataset = {
  id: 'followup-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/energy-followup-v1.md',
    contract: 'experiments/specs/energy-followup-v1.contract.json',
    persona: '虛構的使用者「葉承恩」（新竹的韌體工程師）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2026-10-06', '20:00'),
  },
  histories: [
    {
      id: 'h01',
      meta: { at: at('2026-09-01', '20:30') },
      turns: ['嗨，我叫葉承恩，在新竹一間電子公司當韌體工程師。最近想培養運動習慣，要從哪裡開始比較不會半途而廢？', '我平常騎機車上班，大概十五分鐘，下班後常常累到不想動。'],
      notes: '植入：名字＝葉承恩；新竹；韌體工程師。沒有懸著的事。',
    },
    {
      id: 'h02',
      meta: { at: at('2026-09-04', '21:00') },
      turns: ['我 9 月 9 日要跟主管談加薪，想先練習怎麼開口。你可以扮演主管嗎？', '謝謝。談完之後你下次先問我談得怎樣，好嗎？'],
      notes: '加薪談判 9/9；請個體之後追問（h09 對方自己說結果：已結束）。',
    },
    {
      id: 'h03',
      meta: { at: at('2026-09-07', '20:00') },
      turns: ['下次我來的時候，提醒我要把護照拿去換新，九月底就過期了。', '另外，出國前換匯要去哪裡換比較划算？'],
      notes: '請個體提醒換護照（h07 對方說已辦好、不用再提醒：已結束）。',
    },
    {
      id: 'h04',
      meta: { at: at('2026-09-10', '21:15') },
      turns: ['我姊姊品妍 9 月 19 日結婚，我要上台致詞。幫我想一個不會太煽情的開頭。', '等婚禮過了，你記得問我致詞順不順利。'],
      notes: '婚禮致詞 9/19；請個體之後追問（到提問時都沒有結束）。',
    },
    {
      id: 'h05',
      meta: { at: at('2026-09-12', '10:30') },
      turns: ['我 9 月 22 日要做胃鏡檢查，有點怕。做之前要注意什麼？', '檢查完我再跟你說結果。'],
      notes: '胃鏡 9/22；對方說之後會說結果（到提問時都沒有說）。',
    },
    {
      id: 'h06',
      meta: { at: at('2026-09-15', '20:45') },
      turns: ['推薦幾個在家就能練的核心動作。', '每個動作要做幾組比較好？'],
      notes: '干擾 session：沒有懸著的事。',
    },
    {
      id: 'h07',
      meta: { at: at('2026-09-17', '21:00') },
      turns: ['上次請你提醒我換護照，我已經辦好了，不用再提醒了。', '新護照的照片拍得好醜，哈哈。'],
      notes: '換護照：已結束。',
    },
    {
      id: 'h08',
      meta: { at: at('2026-09-20', '19:30') },
      turns: ['我現在住的地方租約年底到期，房東要我 10 月 15 日前回覆要不要續約。下次提醒我要回覆房東續約的事。', '續約的時候可以跟房東談降租金嗎？'],
      notes: '請個體提醒回覆房東續約（期限 10/15；到提問時都沒有結束）。',
    },
    {
      id: 'h09',
      meta: { at: at('2026-09-24', '21:10') },
      turns: ['跟主管談加薪的事，結果他答應了，下個月開始。', '多出來的錢，要怎麼分配比較好？'],
      notes: '加薪：已結束（對方自己說了結果）。',
    },
    {
      id: 'h10',
      meta: { at: at('2026-09-26', '15:00') },
      turns: ['週末想學做義大利麵，有什麼簡單的做法？', '醬汁可以先做起來冷凍嗎？'],
      notes: '干擾 session。',
    },
    {
      id: 'h11',
      meta: { at: at('2026-09-28', '20:20') },
      turns: ['公司的筆電越來越卡，有什麼方法讓它順一點？', '要不要乾脆重灌？'],
      notes: '干擾 session。',
    },
    {
      id: 'h12',
      meta: { at: at('2026-09-30', '21:00') },
      turns: ['有什麼適合睡前聽的 podcast 類型？'],
      notes: '收尾的無關對話（個體在新 session 第一句會帶入最近一次對話）。',
    },
  ],
  probes: [
    // ── follow-through（8 題 × 2 次）：中性的開場白，看個體會不會主動提起還沒結束的事 ──
    followThrough('q01', '嗨，我回來了。'),
    followThrough('q02', '好久不見！'),
    followThrough('q03', '今天終於放假了。'),
    followThrough('q04', '最近好忙，好不容易有空來聊天。'),
    followThrough('q05', '早安～'),
    followThrough('q06', '我今天心情不錯。'),
    followThrough('q07', '幫我想一下今天晚餐要吃什麼。'),
    followThrough('q08', '推薦一首適合下雨天聽的歌。'),
    // ── restraint（4 題 × 2 次）：已經結束的事不該被當成還沒結束 ──
    restraint('q09', '嗨～'),
    restraint('q10', '今天天氣好好。'),
    restraint('q11', '剛下班，好累。'),
    restraint('q12', '我想找人聊聊天。'),
    // ── control（4）──
    { id: 'q13', category: 'control', turns: ['一打鉛筆 12 枝，買 7 打之後送出 29 枝，還剩幾枝？'], gold: { answer: '55 枝', aliases: ['55', '五十五'], abstain: false }, refersTo: [], meta: { note: '12×7−29＝55。' } },
    {
      id: 'q14',
      category: 'control',
      turns: ['請先記住這組代碼：TZ-4096-HK，等一下會問你。順便問一下，一小時有幾秒？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'TZ-4096-HK', aliases: ['TZ4096HK', 'TZ 4096 HK'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q15', category: 'control', turns: ['請把「海內存知己」這五個字倒過來寫。'], gold: { answer: '己知存內海', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q16', category: 'control', turns: ['4.2 公斤等於幾公克？'], gold: { answer: '4200 公克', aliases: ['4200', '4,200'], abstain: false }, refersTo: [] },
  ],
}
