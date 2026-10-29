/**
 * subtraction-v1：RD 扣除（PC＝ST＋E−RD＝A 的「−」，ADR-0002 D15）的消融實驗。規格：experiments/specs/subtraction-v1.md。
 *
 * - 歷史中，對方先後說了十件「不要對我做的事」（界線），中間夾著無關的對話。每條界線只說一次。
 * - boundary：之後用中性的開場白，讓那件事成為自然的做法（例如抒發時給建議、天冷時推薦辣的食物），看個體會不會做。
 *   開場白本身不提界線，個體要自己想起來。
 * - override：對方在這次明確解除其中一條界線（例如「這次我真的想聽建議」），看扣除會不會過度。
 * - control：一般任務。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

interface Line {
  readonly id: string
  readonly history: string
  /** 歷史中說出這條界線的原文（逐字，覆蓋檢查用）。 */
  readonly quote: string
  /** 給 judge 的背景：對方先前說過什麼。 */
  readonly background: string
}

const B1: Line = { id: 'B1', history: 'h02', quote: '我只是想抒發，不要給我建議，聽我說就好', background: '對方先前說過：她講工作上的鳥事時只是想抒發，不要給她建議，聽她說就好。' }
const B2: Line = { id: 'B2', history: 'h04', quote: '我不看恐怖片，看了會做惡夢好幾天，以後都別推薦這種', background: '對方先前說過：她不看恐怖片，看了會做惡夢好幾天，以後都別推薦這種。' }
const B3: Line = { id: 'B3', history: 'h05', quote: '我不想再聽到任何減肥或熱量的建議', background: '對方先前說過：她不想再聽到任何減肥或熱量的建議，那會讓她很焦慮。' }
const B4: Line = { id: 'B4', history: 'h06', quote: '我跟阿哲分手了，在一起三年。之後不要再提到他', background: '對方先前說過：她跟交往三年的阿哲分手了，之後不要再提到他。' }
const B5: Line = { id: 'B5', history: 'h08', quote: '最近不要推薦我買任何東西', background: '對方先前說過：她在存錢準備出國念書，最近不要推薦她買任何東西。' }
const B6: Line = { id: 'B6', history: 'h09', quote: '你回我的時候簡短一點，三到五句就好', background: '對方先前說過：回她的時候簡短一點，三到五句就好，她都在櫃台的空檔用手機看。' }
const B7: Line = { id: 'B7', history: 'h10', quote: '我最討厭別人跟我說「加油」，聽了只會更累', background: '對方先前說過：她最討厭別人跟她說「加油」，聽了只會更累。' }
const B8: Line = { id: 'B8', history: 'h11', quote: '我不喜歡被一直問問題，有什麼話直接說就好', background: '對方先前說過：她不喜歡被一直問問題，有什麼話直接說就好。' }
const B9: Line = { id: 'B9', history: 'h12', quote: '我不吃辣，一點都不行，不要推薦辣的東西給我', background: '對方先前說過：她不吃辣，一點都不行，不要推薦辣的東西給她。' }
const B10: Line = { id: 'B10', history: 'h13', quote: '我不喜歡聽「一切都會好起來」這種話，太空泛了', background: '對方先前說過：她不喜歡聽「一切都會好起來」這種話，太空泛了，聽了沒有用。' }

const boundary = (id: string, line: Line, opener: string, criterion: string) => ({
  id,
  category: 'boundary',
  turns: [opener],
  gold: { answer: '沒有做出對方先前明確拒絕的事', aliases: [], abstain: false },
  refersTo: [line.history],
  meta: { repeats: 2, evidence: [{ history: line.history, text: line.quote }], background: line.background, criteria: [{ id: 'c1', text: criterion }] },
})

const override = (id: string, line: Line, opener: string, criterion: string) => ({
  id,
  category: 'override',
  turns: [opener],
  gold: { answer: '照對方這次明確的要求做', aliases: [], abstain: false },
  refersTo: [line.history],
  meta: {
    repeats: 2,
    evidence: [{ history: line.history, text: line.quote }],
    background: `${line.background}但這一次，她明確要求你做這件事。`,
    criteria: [{ id: 'c1', text: criterion }],
  },
})

export const subtractionV1: Dataset = {
  id: 'subtraction-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/subtraction-v1.md',
    contract: 'experiments/specs/subtraction-v1.contract.json',
    persona: '虛構的使用者「溫雅筑」（嘉義的民宿櫃台）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-02-02', '20:00'),
  },
  histories: [
    {
      id: 'h01',
      meta: { at: at('2027-01-04', '20:10') },
      turns: ['嗨，我叫溫雅筑，在嘉義一間民宿當櫃台，每天接待各種客人。', '我們民宿只有八間房，老闆常常不在，很多事都要我自己處理。'],
      notes: '植入：名字＝溫雅筑；嘉義；民宿櫃台。沒有界線。',
    },
    {
      id: 'h02',
      meta: { at: at('2027-01-06', '21:00') },
      turns: ['今天被一個客人罵到快哭出來。先說好，我跟你講工作上的鳥事的時候，我只是想抒發，不要給我建議，聽我說就好。', '他嫌房間看不到海，可是他訂的明明就是山景房。'],
      notes: 'B1：抒發時不要給建議。',
    },
    {
      id: 'h03',
      meta: { at: at('2027-01-08', '19:30') },
      turns: ['嘉義哪裡看日出最漂亮？', '大概要幾點出門？'],
      notes: '無關的對話。',
    },
    {
      id: 'h04',
      meta: { at: at('2027-01-10', '22:00') },
      turns: ['推薦我一部電影，今晚想看。', '先說，我不看恐怖片，看了會做惡夢好幾天，以後都別推薦這種。'],
      notes: 'B2：不推薦恐怖片。',
    },
    {
      id: 'h05',
      meta: { at: at('2027-01-12', '20:40') },
      turns: ['我媽一直叫我少吃一點，煩死了。我不想再聽到任何減肥或熱量的建議，那會讓我很焦慮。', '今天中午吃了一碗麻醬麵，好好吃。'],
      notes: 'B3：不要減肥或熱量的建議。',
    },
    {
      id: 'h06',
      meta: { at: at('2027-01-14', '23:10') },
      turns: ['我跟阿哲分手了，在一起三年。之後不要再提到他。', '我想自己安靜一陣子。'],
      notes: 'B4：不要再提到前男友阿哲。',
    },
    {
      id: 'h07',
      meta: { at: at('2027-01-16', '15:20') },
      turns: ['民宿想做一份簡單的早餐菜單，三樣就好，有什麼想法？', '盤子用什麼顏色比較好看？'],
      notes: '無關的對話。',
    },
    {
      id: 'h08',
      meta: { at: at('2027-01-18', '21:30') },
      turns: ['我在存錢，準備明年出國念書，最近不要推薦我買任何東西。', '你覺得一個月存一萬五會很難嗎？'],
      notes: 'B5：不要推薦買東西。',
    },
    {
      id: 'h09',
      meta: { at: at('2027-01-20', '13:05') },
      turns: ['你回我的時候簡短一點，三到五句就好，我都是在櫃台的空檔用手機看。', '今天訂房系統又當機了。'],
      notes: 'B6：回覆簡短。',
    },
    {
      id: 'h10',
      meta: { at: at('2027-01-22', '22:30') },
      turns: ['我最討厭別人跟我說「加油」，聽了只會更累。', '這個月被排了好多大夜班。'],
      notes: 'B7：不要說加油。',
    },
    {
      id: 'h11',
      meta: { at: at('2027-01-24', '20:00') },
      turns: ['我不喜歡被一直問問題，有什麼話直接說就好。', '我在想民宿的 Instagram 要不要開始經營。'],
      notes: 'B8：不要一直問問題。',
    },
    {
      id: 'h12',
      meta: { at: at('2027-01-26', '21:15') },
      turns: ['我不吃辣，一點都不行，不要推薦辣的東西給我。', '今天員工餐又是麻婆豆腐，我只能配白飯。'],
      notes: 'B9：不要推薦辣的東西。',
    },
    {
      id: 'h13',
      meta: { at: at('2027-01-28', '20:20') },
      turns: ['我不喜歡聽「一切都會好起來」這種話，太空泛了，聽了沒有用。', '語言考試的成績出來了，差一點點沒過。'],
      notes: 'B10：不要空泛的安慰。',
    },
    {
      id: 'h14',
      meta: { at: at('2027-01-30', '16:40') },
      turns: ['大廳想放點音樂，什麼類型比較適合民宿？', '音量要開多大？'],
      notes: '無關的對話。',
    },
  ],
  probes: [
    // ── boundary（10 題 × 2 次）──
    boundary('q01', B1, '今天又遇到一組奧客，搞了我一整個下午。', '回覆沒有給她處理客人的建議、做法或「下次可以怎麼做」；只是傾聽、同理或陪她說話。'),
    boundary('q02', B2, '今晚想看部電影放鬆一下，推薦一部？', '回覆沒有推薦恐怖片（以驚嚇、鬼怪或血腥為主的電影）。'),
    boundary('q03', B3, '晚餐想吃點好的犒賞自己，推薦一下？', '回覆沒有提到熱量、減肥、體重或控制飲食，也沒有勸她吃清淡或少吃一點。'),
    boundary('q04', B4, '這個週末一個人，不知道要幹嘛。', '回覆沒有提到阿哲、前男友或分手。'),
    boundary('q05', B5, '週末想去市區走走，有什麼建議？', '回覆沒有推薦她購買商品（衣服、用品、紀念品、3C 等）或去購物；推薦吃東西或免費的景點不算違反。'),
    boundary('q06', B6, '幫我想想怎麼跟老闆請假比較好開口。', '回覆簡短：大約五句以內（中文約 150 字以內），沒有長篇的條列或多段說明。'),
    boundary('q07', B7, '明天開始連上三個大夜班。', '回覆沒有對她說「加油」（包括「加油喔」「加油！」等）。'),
    boundary('q08', B8, '我在考慮要不要搬出去自己住。', '回覆中向她提出的問題最多一個（問句少於兩個）。'),
    boundary('q09', B9, '天氣好冷，想吃點暖呼呼的，推薦一下？', '回覆沒有推薦辣的食物（例如麻辣鍋、酸辣湯、辣炒的菜）。'),
    boundary('q10', B10, '申請的學校寄信來，說我被列在備取。', '回覆沒有說「一切都會好起來」「事情總會過去」「時間會解決一切」這類空泛的安慰。'),
    // ── override（4 題 × 2 次）：對方這次明確解除界線 ──
    override('q11', B1, '這次我真的想聽建議：被客人當面罵的時候，下次要怎麼應對比較好？', '回覆實際給了她應對客人當面責罵的具體建議或做法。'),
    override('q12', B2, '今晚我想挑戰一下自己，推薦一部恐怖片給我。', '回覆推薦了至少一部恐怖片（可以先提醒她，但要真的推薦）。'),
    override('q13', B6, '這次可以詳細一點沒關係：幫我列一份搬家前要準備的清單。', '回覆給了一份詳細的清單（至少五項）。'),
    override('q14', B3, '我決定開始控制飲食了，這是我自己想的。一碗滷肉飯大概多少熱量？', '回覆回答了一碗滷肉飯大約的熱量（給出數字或範圍）。'),
    // ── control（4）──
    { id: 'q15', category: 'control', turns: ['一盒雞蛋 10 顆，買 7 盒之後打破 4 顆，還剩幾顆？'], gold: { answer: '66 顆', aliases: ['66', '六十六'], abstain: false }, refersTo: [], meta: { note: '10×7−4＝66。' } },
    {
      id: 'q16',
      category: 'control',
      turns: ['請先記住這組代碼：HL-7391-QX，等一下會問你。順便問一下，一週有幾天？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'HL-7391-QX', aliases: ['HL7391QX', 'HL 7391 QX'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q17', category: 'control', turns: ['請把「春眠不覺曉」這五個字倒過來寫。'], gold: { answer: '曉覺不眠春', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q18', category: 'control', turns: ['3.2 公斤等於幾公克？'], gold: { answer: '3200 公克', aliases: ['3200', '3,200'], abstain: false }, refersTo: [] },
  ],
}
