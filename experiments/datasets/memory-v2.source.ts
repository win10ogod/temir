/**
 * memory-v2 的手寫內容（黃金答案由構造決定：事實都是這裡植入的）。由 build.ts 轉成 memory-v2.json。
 *
 * 與 v1 完全不同的人物、事實與題目（test/datasets-v2.test.ts 檢查沒有沿用 v1 的專名與題目）。
 * 規格：experiments/specs/memory-accuracy-v2.md。設計依據與 v1 相同：LongMemEval（papers/2410.10813）
 * §3.2 的能力類別與「求助對話中順帶透露資訊」；所有專名、日期、數字都是虛構或任意的。
 *
 * v2 的改變（理由見規格 §1）：題數由 33 增加到 63；「隱性運用記憶」由 3 題增加到 15 題並列為主要類別，
 * 每題附逐條判定準則（meta.criteria，全部符合才算對）；歷史 17 段，最後一段是無關的收尾對話
 * （個體在新 session 第一句會帶入最近一次對話，見 individual/src/recall/index.ts 的 lastConversation）。
 *
 * 日期：歷史中的日期是明寫的月／日（12 月、1 月），不跨二月，避免閏年問題；「今年 12 月 3 日」指 2026 年
 * （星期四，test/datasets-v2.test.ts 核對）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

export const memoryV2: Dataset = {
  id: 'memory-v2',
  language: 'zh-TW',
  version: '2.0.0',
  meta: {
    spec: 'experiments/specs/memory-accuracy-v2.md',
    contract: 'experiments/specs/memory-accuracy-v2.contract.json',
    persona: '虛構的使用者「鍾子珩」（花蓮的夜班護理師）；所有事實都是植入的，與真實人物無關。',
  },
  histories: [
    {
      id: 'h01',
      turns: [
        '嗨，我叫鍾子珩，在花蓮的慈岸醫院當護理師，這半年都輪大夜班，晚上十一點上到早上七點。下班回家白天總是睡不沉，有什麼辦法嗎？',
        '我住在吉安鄉，白天隔壁在裝潢，吵得要命。耳塞或白噪音有推薦的嗎？',
      ],
      notes: '植入：名字＝鍾子珩；慈岸醫院；花蓮；大夜班 23:00–07:00；住吉安鄉（舊值，h15 改為壽豐鄉）；白天補眠、隔壁裝潢。',
    },
    {
      id: 'h02',
      turns: [
        '我女兒小滿今年四歲，最近每件事都要問為什麼。要怎麼回答才不會敷衍她？',
        '我太太林沛晴每週六下午去陶藝教室上課，一堂 1,200 元。那段時間我一個人帶小滿，有什麼室內活動可以一起玩？',
      ],
      notes: '植入：女兒小滿四歲；太太林沛晴；陶藝課每週六下午（舊值，h14 改為週日早上）、一堂 1,200 元。',
    },
    {
      id: 'h03',
      turns: [
        '我從去年開始吃蛋奶素，可是值班的時候常常只能買超商，要怎麼搭配比較均衡？',
        '另外，我上個月因為心悸去看醫生，醫生要我先把咖啡停掉。少了咖啡整個人好鈍，有什麼替代的習慣嗎？',
      ],
      notes: '植入：蛋奶素；因心悸停咖啡（醫囑）。',
    },
    {
      id: 'h04',
      turns: [
        '我家有一隻七歲的柴犬叫阿福，獸醫說牠的腎臟指數偏高，要吃低磷的食物。低磷飼料要怎麼挑？',
        '阿福 12 月 18 日要回診抽血，抽血前需要禁食嗎？',
      ],
      notes: '植入：柴犬阿福七歲；腎臟指數偏高、低磷飲食；12/18 回診。',
    },
    {
      id: 'h05',
      turns: [
        '我上個月打羽球時拉傷了左膝的十字韌帶，醫生說三個月內不要爬樓梯，走路也不要超過半小時。在家可以做什麼復健？',
        '我本來每週三晚上跟同事打羽球，現在只能先停了，有點悶。',
      ],
      notes: '植入：左膝十字韌帶拉傷；三個月內不爬樓梯、走路不超過半小時；羽球暫停。',
    },
    {
      id: 'h06',
      turns: ['最近想整理手機裡的照片，有什麼好用的分類方法？', '雲端備份要怎麼選比較安全？'],
      notes: '干擾 session：沒有植入任何會被問到的事實。',
    },
    {
      id: 'h07',
      turns: [
        '我在學韓文，現在用《首爾韓語》初級第二冊，老師叫朴恩智，每週二下午上線上課，一堂 900 元。單字老是背了就忘，有什麼方法？',
        '1 月 23 日我要考韓語檢定，考前一週我想請假專心複習，這樣的安排夠嗎？',
      ],
      notes: '植入：《首爾韓語》初級第二冊（舊值，h15 進到第三冊）；韓文老師朴恩智；一堂 900 元；1/23 檢定；考前一週請假（＝1/16 起）。',
    },
    {
      id: 'h08',
      turns: [
        '我的筆電裝的是 Fedora Linux，想開始把小滿的成長影片剪一剪，有什麼要注意的？',
        '我剛買了一個剪輯用的滑鼠，690 元。影片我打算先存在那顆 2TB 的外接硬碟。',
      ],
      notes: '植入：Fedora Linux；滑鼠 690 元；2TB 外接硬碟（舊值，h14 改用 4TB）。',
    },
    {
      id: 'h09',
      turns: ['1 月 9 日是我跟沛晴結婚七週年，她最近迷上拉坯，我想提早準備。', '那天我剛好排休，可以整天陪她。'],
      notes: '植入：結婚七週年 1/9；沛晴迷上拉坯。',
    },
    {
      id: 'h10',
      turns: [
        '我沒有駕照，平常都搭火車和公車。12 月 26 日想帶小滿去台東玩三天，行程怎麼排比較輕鬆？',
        '小滿現在念向日葵幼兒園，出發前要跟老師請假嗎？',
      ],
      notes: '植入：沒有駕照、搭火車和公車；台東 12/26 出發（舊值，h16 改為 1/2）；向日葵幼兒園（舊值，h14 轉到海星）。',
    },
    {
      id: 'h11',
      turns: [
        '我下圍棋大概是業餘初段，老師是陳柏鈞，最近一直卡在中盤，要怎麼練？',
        '我很怕高，上次走太魯閣的吊橋腿都軟了。這種懼高可以慢慢克服嗎？',
      ],
      notes: '植入：圍棋業餘初段（舊值，h15 升二段）；圍棋老師陳柏鈞；懼高。',
    },
    {
      id: 'h12',
      turns: [
        '我做事的時候喜歡聽後搖，就是那種沒有歌詞、慢慢堆高的器樂。最近為了錄小滿的影片，又買了一支 1,350 元的麥克風。',
        '小滿 12 月 3 日生日，她最喜歡的繪本是《雲朵郵差》，我常帶她去家附近的鯨魚書屋看書。可以推薦適合她的新繪本嗎？',
      ],
      notes: '植入：喜歡後搖；麥克風 1,350 元；小滿 12/3 生日；最喜歡《雲朵郵差》（舊值，h16 改為《小雨蛙》）；鯨魚書屋。',
    },
    {
      id: 'h13',
      turns: ['最近想學做麵包，烤箱要選多大的？', '全麥麵包要怎麼做才不會太硬？'],
      notes: '干擾 session：沒有植入任何會被問到的事實。',
    },
    {
      id: 'h14',
      turns: [
        '跟你說，小滿下學期轉到海星幼兒園了，離家比較近。另外沛晴的陶藝課改到每週日早上。',
        '我又買了一顆 4TB 的外接硬碟，以後影片都放這顆。',
      ],
      notes: '知識更新：幼兒園→海星；陶藝課→每週日早上；外接硬碟→4TB。',
    },
    {
      id: 'h15',
      turns: [
        '好消息，我上週升上業餘二段了！還有，韓文我已經進到第三冊，是初級的最後一冊。',
        '我們最近搬到壽豐鄉，離醫院遠了一點，改搭火車通勤。',
      ],
      notes: '知識更新：圍棋→業餘二段；韓文→第三冊（仍是初級）；住處→壽豐鄉。',
    },
    {
      id: 'h16',
      turns: ['台東的行程改了，我們改成 1 月 2 日出發。', '小滿最近改迷《小雨蛙》，天天要我念。'],
      notes: '知識更新：台東出發日→1/2；最喜歡的繪本→《小雨蛙》。',
    },
    {
      id: 'h17',
      turns: ['想換一把好用的雨傘，長傘跟折傘哪個實用？', '傘骨要幾根才比較抗風？'],
      notes: '收尾的干擾 session：與所有探針無關，避免最後一段歷史的題目因為「最近一次對話」而不經檢索就被帶入。',
    },
  ],
  probes: [
    // ── information-extraction（10）──
    { id: 'q01', category: 'information-extraction', turns: ['我的全名是什麼，你還記得嗎？'], gold: { answer: '鍾子珩', aliases: [], abstain: false }, refersTo: ['h01'], meta: { evidence: [{ history: 'h01', text: '我叫鍾子珩' }] } },
    { id: 'q02', category: 'information-extraction', turns: ['我在哪一間醫院上班？'], gold: { answer: '慈岸醫院', aliases: [], abstain: false }, refersTo: ['h01'], meta: { evidence: [{ history: 'h01', text: '在花蓮的慈岸醫院當護理師' }] } },
    { id: 'q03', category: 'information-extraction', turns: ['我女兒叫什麼名字？'], gold: { answer: '小滿', aliases: [], abstain: false }, refersTo: ['h02'], meta: { evidence: [{ history: 'h02', text: '我女兒小滿今年四歲' }] } },
    { id: 'q04', category: 'information-extraction', turns: ['我太太叫什麼名字？'], gold: { answer: '林沛晴', aliases: [], abstain: false }, refersTo: ['h02'], meta: { evidence: [{ history: 'h02', text: '我太太林沛晴' }] } },
    { id: 'q05', category: 'information-extraction', turns: ['我養的那隻柴犬，名字是什麼？'], gold: { answer: '阿福', aliases: [], abstain: false }, refersTo: ['h04'], meta: { evidence: [{ history: 'h04', text: '柴犬叫阿福' }] } },
    { id: 'q06', category: 'information-extraction', turns: ['我學韓文用的是哪一套課本？'], gold: { answer: '《首爾韓語》', aliases: ['首爾韓語'], abstain: false }, refersTo: ['h07'], meta: { evidence: [{ history: 'h07', text: '《首爾韓語》初級第二冊' }] } },
    { id: 'q07', category: 'information-extraction', turns: ['我的筆電裝的是什麼作業系統？'], gold: { answer: 'Fedora Linux', aliases: ['Fedora'], abstain: false }, refersTo: ['h08'], meta: { evidence: [{ history: 'h08', text: 'Fedora Linux' }] } },
    { id: 'q08', category: 'information-extraction', turns: ['教我下圍棋的是哪位老師？'], gold: { answer: '陳柏鈞', aliases: [], abstain: false }, refersTo: ['h11'], meta: { evidence: [{ history: 'h11', text: '老師是陳柏鈞' }] } },
    { id: 'q09', category: 'information-extraction', turns: ['我是哪一邊的膝蓋受傷？'], gold: { answer: '左膝', aliases: ['左邊的膝蓋', '左腳'], abstain: false }, refersTo: ['h05'], meta: { evidence: [{ history: 'h05', text: '拉傷了左膝的十字韌帶' }], conflicts: ['右膝', '右邊', '右腳'] } },
    { id: 'q10', category: 'information-extraction', turns: ['我常帶女兒去看書的那間書店叫什麼？'], gold: { answer: '鯨魚書屋', aliases: [], abstain: false }, refersTo: ['h12'], meta: { evidence: [{ history: 'h12', text: '家附近的鯨魚書屋' }] } },
    // ── multi-session-reasoning（8）──
    {
      id: 'q11',
      category: 'multi-session-reasoning',
      turns: ['我為了剪小滿的影片買的滑鼠和麥克風，一共花了多少錢？'],
      gold: { answer: '2,040 元（滑鼠 690 元＋麥克風 1,350 元）', aliases: ['2040', '兩千零四十'], abstain: false },
      refersTo: ['h08', 'h12'],
      meta: { evidence: [{ history: 'h08', text: '剪輯用的滑鼠，690 元' }, { history: 'h12', text: '1,350 元的麥克風' }] },
    },
    {
      id: 'q12',
      category: 'multi-session-reasoning',
      turns: ['小滿和阿福的年紀加起來是幾歲？'],
      gold: { answer: '11 歲（小滿四歲＋阿福七歲）', aliases: ['11歲', '十一歲'], abstain: false },
      refersTo: ['h02', 'h04'],
      meta: { evidence: [{ history: 'h02', text: '今年四歲' }, { history: 'h04', text: '七歲的柴犬' }], conflicts: ['10歲', '12歲', '十歲', '十二歲'] },
    },
    {
      id: 'q13',
      category: 'multi-session-reasoning',
      turns: ['醫生交代我暫時不能做的事有哪些？'],
      gold: { answer: '不要爬樓梯、走路不要超過半小時（膝傷），以及先停掉咖啡（心悸）', aliases: [], abstain: false },
      refersTo: ['h03', 'h05'],
      meta: { evidence: [{ history: 'h03', text: '醫生要我先把咖啡停掉' }, { history: 'h05', text: '三個月內不要爬樓梯，走路也不要超過半小時' }], note: '三件都要答到；只答部分依 LongMemEval 規則判錯。' },
    },
    {
      id: 'q14',
      category: 'multi-session-reasoning',
      turns: ['我跟你提過的兩位老師，分別教我什麼、叫什麼名字？'],
      gold: { answer: '韓文老師朴恩智、圍棋老師陳柏鈞', aliases: [], abstain: false },
      refersTo: ['h07', 'h11'],
      meta: { evidence: [{ history: 'h07', text: '老師叫朴恩智' }, { history: 'h11', text: '老師是陳柏鈞' }] },
    },
    {
      id: 'q15',
      category: 'multi-session-reasoning',
      turns: ['沛晴的陶藝課一堂，加上我的韓文課一堂，一共多少錢？'],
      gold: { answer: '2,100 元（陶藝 1,200 元＋韓文 900 元）', aliases: ['2100', '兩千一百'], abstain: false },
      refersTo: ['h02', 'h07'],
      meta: { evidence: [{ history: 'h02', text: '一堂 1,200 元' }, { history: 'h07', text: '一堂 900 元' }] },
    },
    {
      id: 'q16',
      category: 'multi-session-reasoning',
      turns: ['我們家誰有醫生交代的飲食限制？分別是什麼？'],
      gold: { answer: '我（醫生要我先停掉咖啡）和阿福（要吃低磷的食物）', aliases: [], abstain: false },
      refersTo: ['h03', 'h04'],
      meta: { evidence: [{ history: 'h03', text: '醫生要我先把咖啡停掉' }, { history: 'h04', text: '要吃低磷的食物' }], note: '蛋奶素是使用者自己的選擇，不是醫囑；答出兩者即可。' },
    },
    {
      id: 'q17',
      category: 'multi-session-reasoning',
      turns: ['我買過的兩顆外接硬碟，加起來是多大的容量？'],
      gold: { answer: '6TB（2TB＋4TB）', aliases: ['6TB', '6T'], abstain: false },
      refersTo: ['h08', 'h14'],
      meta: { evidence: [{ history: 'h08', text: '2TB 的外接硬碟' }, { history: 'h14', text: '4TB 的外接硬碟' }] },
    },
    {
      id: 'q18',
      category: 'multi-session-reasoning',
      turns: ['我們家誰在學陶藝、誰在學韓文、誰在下圍棋？'],
      gold: { answer: '沛晴學陶藝；使用者自己（鍾子珩）學韓文，也下圍棋', aliases: [], abstain: false },
      refersTo: ['h02', 'h07', 'h11'],
      meta: { evidence: [{ history: 'h02', text: '去陶藝教室上課' }, { history: 'h07', text: '我在學韓文' }, { history: 'h11', text: '我下圍棋' }] },
    },
    // ── temporal-reasoning（6；只用明寫的日期）──
    {
      id: 'q19',
      category: 'temporal-reasoning',
      turns: ['小滿生日那天到阿福回診那天，中間隔了幾天？'],
      gold: { answer: '15 天（12 月 3 日到 12 月 18 日）', aliases: ['15天', '十五天', '14天', '16天', '十四天', '十六天'], abstain: false },
      refersTo: ['h04', 'h12'],
      meta: { evidence: [{ history: 'h12', text: '12 月 3 日生日' }, { history: 'h04', text: '12 月 18 日要回診抽血' }], note: '依 LongMemEval 的時間推理規則，天數差一不扣分。' },
    },
    {
      id: 'q20',
      category: 'temporal-reasoning',
      turns: ['阿福回診之後，再過幾天是我們的結婚紀念日？'],
      gold: { answer: '22 天（12 月 18 日到 1 月 9 日）', aliases: ['22天', '二十二天', '21天', '23天', '二十一天', '二十三天'], abstain: false },
      refersTo: ['h04', 'h09'],
      meta: { evidence: [{ history: 'h04', text: '12 月 18 日要回診抽血' }, { history: 'h09', text: '1 月 9 日是我跟沛晴結婚七週年' }], note: '天數差一不扣分。' },
    },
    {
      id: 'q21',
      category: 'temporal-reasoning',
      turns: ['我打算從哪一天開始請假準備韓語檢定？'],
      gold: { answer: '1 月 16 日（檢定 1 月 23 日的前一週）', aliases: ['1月16日', '1/16', '一月十六日', '1月16號'], abstain: false },
      refersTo: ['h07'],
      meta: { evidence: [{ history: 'h07', text: '1 月 23 日我要考韓語檢定' }, { history: 'h07', text: '考前一週我想請假' }], conflicts: ['1月23日', '1/23'] },
    },
    {
      id: 'q22',
      category: 'temporal-reasoning',
      turns: ['我跟你提過的那些日子裡，哪一天最早到？是什麼事？'],
      gold: { answer: '12 月 3 日，小滿的生日', aliases: ['12月3日', '12/3', '十二月三日', '12月3號'], abstain: false },
      refersTo: ['h04', 'h07', 'h09', 'h10', 'h12', 'h16'],
      meta: { evidence: [{ history: 'h12', text: '12 月 3 日生日' }], note: '其他日子：12/18 回診、12/26（後改 1/2）台東、1/9 紀念日、1/16 請假、1/23 檢定。' },
    },
    {
      id: 'q23',
      category: 'temporal-reasoning',
      turns: ['小滿今年生日那天是星期幾？'],
      gold: { answer: '星期四（2026 年 12 月 3 日）', aliases: ['星期四', '週四', '禮拜四', '周四'], abstain: false },
      refersTo: ['h12'],
      meta: { evidence: [{ history: 'h12', text: '12 月 3 日生日' }], note: '2026-12-03 是星期四；需要記得日期再推星期。' },
    },
    {
      id: 'q24',
      category: 'temporal-reasoning',
      turns: ['從結婚紀念日到韓語檢定，中間隔幾天？'],
      gold: { answer: '14 天（1 月 9 日到 1 月 23 日）', aliases: ['14天', '十四天', '兩週', '兩個星期', '13天', '15天', '十三天', '十五天'], abstain: false },
      refersTo: ['h07', 'h09'],
      meta: { evidence: [{ history: 'h09', text: '1 月 9 日是我跟沛晴結婚七週年' }, { history: 'h07', text: '1 月 23 日我要考韓語檢定' }], note: '天數差一不扣分。' },
    },
    // ── knowledge-update（8）──
    { id: 'q25', category: 'knowledge-update', turns: ['小滿現在讀哪一間幼兒園？'], gold: { answer: '海星幼兒園', aliases: ['海星'], abstain: false }, refersTo: ['h10', 'h14'], meta: { evidence: [{ history: 'h14', text: '轉到海星幼兒園' }], stale: ['向日葵幼兒園'], conflicts: ['向日葵'] } },
    {
      id: 'q26',
      category: 'knowledge-update',
      turns: ['沛晴現在的陶藝課是星期幾？'],
      gold: { answer: '每週日早上', aliases: ['週日', '星期日', '星期天', '禮拜天', '禮拜日', '周日'], abstain: false },
      refersTo: ['h02', 'h14'],
      meta: { evidence: [{ history: 'h14', text: '改到每週日早上' }], stale: ['週六'], conflicts: ['週六', '星期六', '禮拜六', '周六'] },
    },
    { id: 'q27', category: 'knowledge-update', turns: ['我現在用來存影片的外接硬碟是多大的？'], gold: { answer: '4TB', aliases: ['4T'], abstain: false }, refersTo: ['h08', 'h14'], meta: { evidence: [{ history: 'h14', text: '4TB 的外接硬碟' }], stale: ['2TB'], conflicts: ['2TB'] } },
    { id: 'q28', category: 'knowledge-update', turns: ['我的圍棋現在是什麼段位？'], gold: { answer: '業餘二段', aliases: ['二段', '2段'], abstain: false }, refersTo: ['h11', 'h15'], meta: { evidence: [{ history: 'h15', text: '升上業餘二段' }], stale: ['初段'], conflicts: ['初段'] } },
    { id: 'q29', category: 'knowledge-update', turns: ['我的韓文現在學到第幾冊？'], gold: { answer: '第三冊', aliases: ['第3冊', '三冊'], abstain: false }, refersTo: ['h07', 'h15'], meta: { evidence: [{ history: 'h15', text: '進到第三冊' }], stale: ['第二冊'], conflicts: ['第二冊', '第2冊'] } },
    { id: 'q30', category: 'knowledge-update', turns: ['我現在住在哪個鄉？'], gold: { answer: '壽豐鄉', aliases: ['壽豐'], abstain: false }, refersTo: ['h01', 'h15'], meta: { evidence: [{ history: 'h15', text: '搬到壽豐鄉' }], stale: ['吉安鄉'], conflicts: ['吉安'] } },
    {
      id: 'q31',
      category: 'knowledge-update',
      turns: ['我們去台東是哪一天出發？'],
      gold: { answer: '1 月 2 日', aliases: ['1月2日', '1/2', '一月二日', '1月2號'], abstain: false },
      refersTo: ['h10', 'h16'],
      meta: { evidence: [{ history: 'h16', text: '改成 1 月 2 日出發' }], stale: ['12 月 26 日'], conflicts: ['12月26日', '12/26'] },
    },
    { id: 'q32', category: 'knowledge-update', turns: ['小滿現在最喜歡哪一本繪本？'], gold: { answer: '《小雨蛙》', aliases: ['小雨蛙'], abstain: false }, refersTo: ['h12', 'h16'], meta: { evidence: [{ history: 'h16', text: '改迷《小雨蛙》' }], stale: ['雲朵郵差'], conflicts: ['雲朵郵差'] } },
    // ── abstention（8；錯誤前提）──
    { id: 'q33', category: 'abstention', turns: ['我兒子今年幾歲？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h02'], meta: { absentTerms: ['兒子'], explanation: '使用者只提過女兒小滿（四歲），從沒提過兒子。' } },
    { id: 'q34', category: 'abstention', turns: ['我養的貓是什麼品種？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h04'], meta: { absentTerms: ['貓'], explanation: '使用者只提過一隻柴犬阿福，從沒提過貓。' } },
    { id: 'q35', category: 'abstention', turns: ['上次說的那位吉他老師，全名是什麼？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h07', 'h11'], meta: { absentTerms: ['吉他'], explanation: '使用者只提過韓文老師朴恩智和圍棋老師陳柏鈞，從沒提過吉他。' } },
    { id: 'q36', category: 'abstention', turns: ['我那台汽車是什麼牌子的？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h10'], meta: { absentTerms: ['汽車', '轎車'], explanation: '使用者說過自己沒有駕照，平常搭火車和公車，從沒提過有汽車。' } },
    { id: 'q37', category: 'abstention', turns: ['我在台北租的那間公寓，房租多少？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h01', 'h15'], meta: { absentTerms: ['台北', '房租', '租金'], explanation: '使用者住在花蓮（先住吉安鄉，後來搬到壽豐鄉），從沒提過台北的公寓或房租。' } },
    { id: 'q38', category: 'abstention', turns: ['沛晴在哪家銀行上班？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h02'], meta: { absentTerms: ['銀行'], explanation: '使用者從沒提過太太的工作，只提過她上陶藝課。' } },
    { id: 'q39', category: 'abstention', turns: ['我上次說的那場馬拉松，我跑了多久？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: ['h05'], meta: { absentTerms: ['馬拉松'], explanation: '使用者從沒提過馬拉松；他提過打羽球，而且左膝受傷。' } },
    { id: 'q40', category: 'abstention', turns: ['我爸爸的手術排在哪一天？'], gold: { answer: '', aliases: [], abstain: true }, refersTo: [], meta: { absentTerms: ['爸爸', '父親', '手術'], explanation: '使用者從沒提過父親或任何手術。' } },
    // ── implicit-memory-use（15；不明問記憶，但正確做法取決於記得的事；全部準則符合才算對）──
    {
      id: 'q41',
      category: 'implicit-memory-use',
      turns: ['推薦我三道今晚可以在家煮的菜。'],
      gold: { answer: '三道蛋奶素可以吃的菜', aliases: [], abstain: false },
      refersTo: ['h03'],
      meta: {
        evidence: [{ history: 'h03', text: '我從去年開始吃蛋奶素' }],
        background: '使用者從去年開始吃蛋奶素（可以吃蛋和奶，不吃肉和海鮮）。',
        criteria: [{ id: 'c1', text: '三道菜都是蛋奶素可以吃的：不含肉類、海鮮，也沒有用肉或海鮮做的湯底或調味料（例如魚露、蠔油、柴魚）。' }],
      },
    },
    {
      id: 'q42',
      category: 'implicit-memory-use',
      turns: ['值大夜班到凌晨三點最想睡，有什麼提神的方法？'],
      gold: { answer: '不靠咖啡因的提神方法', aliases: [], abstain: false },
      refersTo: ['h03'],
      meta: {
        evidence: [{ history: 'h03', text: '醫生要我先把咖啡停掉' }],
        background: '使用者上個月因為心悸看醫生，醫生要他先把咖啡停掉。',
        criteria: [{ id: 'c1', text: '沒有建議用咖啡或其他含咖啡因的飲品（濃茶、能量飲料等）來提神；若提到，是說明要避開。' }],
      },
    },
    {
      id: 'q43',
      category: 'implicit-memory-use',
      turns: ['週末想帶女兒出去走走，有什麼地方推薦？'],
      gold: { answer: '花蓮在地、適合四歲幼兒的地點', aliases: [], abstain: false },
      refersTo: ['h01', 'h02'],
      meta: {
        evidence: [{ history: 'h01', text: '在花蓮的慈岸醫院當護理師' }, { history: 'h02', text: '今年四歲' }],
        background: '使用者住在花蓮（在花蓮的慈岸醫院上班；先住吉安鄉，後來搬到壽豐鄉）；女兒小滿四歲。',
        criteria: [
          { id: 'c1', text: '推薦的地點在花蓮，或明確以花蓮為範圍。' },
          { id: 'c2', text: '推薦的地點或活動適合四歲左右的幼兒。' },
        ],
      },
    },
    {
      id: 'q44',
      category: 'implicit-memory-use',
      turns: ['推薦一條這個週末可以去走走的步道。'],
      gold: { answer: '花蓮的平緩短程、不用爬階梯的路線', aliases: [], abstain: false },
      refersTo: ['h01', 'h05'],
      meta: {
        evidence: [{ history: 'h05', text: '三個月內不要爬樓梯，走路也不要超過半小時' }, { history: 'h01', text: '在花蓮的慈岸醫院當護理師' }],
        background: '使用者上個月左膝十字韌帶拉傷，醫生說三個月內不要爬樓梯、走路不要超過半小時；他住在花蓮。',
        criteria: [
          { id: 'c1', text: '推薦的路線平緩、短程（大約半小時內走得完），不需要爬樓梯或階梯；或明確提醒要配合膝傷的限制並據此挑選。' },
          { id: 'c2', text: '推薦的路線在花蓮。' },
        ],
      },
    },
    {
      id: 'q45',
      category: 'implicit-memory-use',
      turns: ['想找幾部可以邊看邊練聽力的影集，推薦一下。'],
      gold: { answer: '適合初級程度的韓語影集', aliases: [], abstain: false },
      refersTo: ['h07', 'h15'],
      meta: {
        evidence: [{ history: 'h07', text: '我在學韓文' }, { history: 'h15', text: '是初級的最後一冊' }],
        background: '使用者在學韓文，程度是初級（用《首爾韓語》，進到初級的最後一冊）。',
        criteria: [
          { id: 'c1', text: '推薦的是韓語影集或節目（例如韓劇、韓國綜藝）。' },
          { id: 'c2', text: '有考量到初級程度（例如說明適合初學者、建議先開字幕，或挑日常對話多的作品）。' },
        ],
      },
    },
    {
      id: 'q46',
      category: 'implicit-memory-use',
      turns: ['我想開始剪小滿的影片，推薦一款剪輯軟體。'],
      gold: { answer: '能在 Fedora Linux 上使用的剪輯軟體', aliases: [], abstain: false },
      refersTo: ['h08'],
      meta: {
        evidence: [{ history: 'h08', text: 'Fedora Linux' }],
        background: '使用者的筆電裝的是 Fedora Linux。',
        criteria: [{ id: 'c1', text: '回應明確考量到使用者用的是 Linux（Fedora），而且推薦的軟體能在 Linux 上使用（例如 Kdenlive、Shotcut、OpenShot、DaVinci Resolve）。' }],
      },
    },
    {
      id: 'q47',
      category: 'implicit-memory-use',
      turns: ['這個週末想帶家人去鄰近的鄉鎮玩一天，交通要怎麼安排？'],
      gold: { answer: '以大眾運輸、從花蓮出發的安排', aliases: [], abstain: false },
      refersTo: ['h01', 'h10'],
      meta: {
        evidence: [{ history: 'h10', text: '我沒有駕照，平常都搭火車和公車' }, { history: 'h01', text: '在花蓮的慈岸醫院當護理師' }],
        background: '使用者沒有駕照，平常搭火車和公車；住在花蓮（後來搬到壽豐鄉，搭火車通勤）。',
        criteria: [
          { id: 'c1', text: '交通安排使用大眾運輸（火車、客運、公車等），沒有建議自己開車、騎車或租車；或明確提到使用者沒有駕照。' },
          { id: 'c2', text: '以花蓮為出發地，或目的地在花蓮附近。' },
        ],
      },
    },
    {
      id: 'q48',
      category: 'implicit-memory-use',
      turns: ['推薦幾個適合全家一起去、刺激一點也沒關係的活動。'],
      gold: { answer: '不在高處、適合四歲小孩的活動', aliases: [], abstain: false },
      refersTo: ['h02', 'h11'],
      meta: {
        evidence: [{ history: 'h11', text: '我很怕高' }, { history: 'h02', text: '今年四歲' }],
        background: '使用者很怕高（走太魯閣的吊橋腿都軟了）；女兒小滿四歲。',
        criteria: [
          { id: 'c1', text: '沒有推薦需要待在高處的活動（例如高空彈跳、吊橋、玻璃步道、高空滑索、高樓觀景台）；若提到，是說明要避開。' },
          { id: 'c2', text: '推薦的活動適合四歲小孩一起參加。' },
        ],
      },
    },
    {
      id: 'q49',
      category: 'implicit-memory-use',
      turns: ['做事的時候想放點音樂，推薦幾張專輯。'],
      gold: { answer: '後搖專輯', aliases: [], abstain: false },
      refersTo: ['h12'],
      meta: {
        evidence: [{ history: 'h12', text: '喜歡聽後搖' }],
        background: '使用者做事時喜歡聽後搖（沒有歌詞、慢慢堆高的器樂）。',
        criteria: [{ id: 'c1', text: '推薦的主要是後搖（post-rock），或明確以後搖為方向的器樂作品。' }],
      },
    },
    {
      id: 'q50',
      category: 'implicit-memory-use',
      turns: ['結婚紀念日快到了，幫我想三個慶祝的點子。'],
      gold: { answer: '至少一個與陶藝／拉坯有關的點子', aliases: [], abstain: false },
      refersTo: ['h02', 'h09'],
      meta: {
        evidence: [{ history: 'h09', text: '她最近迷上拉坯' }, { history: 'h02', text: '去陶藝教室上課' }],
        background: '1 月 9 日是使用者和太太林沛晴的結婚七週年；沛晴最近迷上拉坯，每週上陶藝課。',
        criteria: [{ id: 'c1', text: '至少有一個點子與陶藝或拉坯有關（配合太太的興趣）。' }],
      },
    },
    {
      id: 'q51',
      category: 'implicit-memory-use',
      turns: ['想買點零食獎勵阿福，推薦幾種。'],
      gold: { answer: '適合腎臟需要低磷飲食的狗的零食', aliases: [], abstain: false },
      refersTo: ['h04'],
      meta: {
        evidence: [{ history: 'h04', text: '要吃低磷的食物' }],
        background: '阿福是使用者養的七歲柴犬，獸醫說牠的腎臟指數偏高，要吃低磷的食物。',
        criteria: [{ id: 'c1', text: '推薦的零食適合腎臟需要低磷飲食的狗（避開肉乾、骨頭、起司、魚乾等高磷零食），或明確提醒要選低磷、配合腎臟狀況。' }],
      },
    },
    {
      id: 'q52',
      category: 'implicit-memory-use',
      turns: ['我想每週固定運動，幫我排一個一週的時間表。'],
      gold: { answer: '配合大夜班作息、避開膝蓋負擔的運動時間表', aliases: [], abstain: false },
      refersTo: ['h01', 'h05'],
      meta: {
        evidence: [{ history: 'h01', text: '這半年都輪大夜班，晚上十一點上到早上七點' }, { history: 'h05', text: '三個月內不要爬樓梯' }],
        background: '使用者輪大夜班（晚上十一點到早上七點），白天補眠；上個月左膝十字韌帶拉傷，醫生說三個月內不要爬樓梯、走路不要超過半小時。',
        criteria: [
          { id: 'c1', text: '運動時間避開晚上十一點到早上七點的上班時間，並配合白天補眠（例如排在下午或傍晚上班前）。' },
          { id: 'c2', text: '沒有安排跑步、跳躍、爬樓梯、深蹲跳等會加重左膝負擔的運動，或明確說明要避開、改做低衝擊的運動。' },
        ],
      },
    },
    {
      id: 'q53',
      category: 'implicit-memory-use',
      turns: ['推薦一本我現在程度可以挑戰的圍棋書。'],
      gold: { answer: '適合業餘段位（約二段）程度的圍棋書', aliases: [], abstain: false },
      refersTo: ['h11', 'h15'],
      meta: {
        evidence: [{ history: 'h15', text: '升上業餘二段' }],
        background: '使用者下圍棋，原本業餘初段，最近升上業餘二段。',
        criteria: [{ id: 'c1', text: '推薦的書適合業餘段位（大約業餘初段到二段）的程度，而不是給完全初學者的入門書。' }],
      },
    },
    {
      id: 'q54',
      category: 'implicit-memory-use',
      turns: ['下班後想好好補眠，臥室要怎麼佈置比較好？'],
      gold: { answer: '針對白天睡覺的臥室佈置', aliases: [], abstain: false },
      refersTo: ['h01'],
      meta: {
        evidence: [{ history: 'h01', text: '這半年都輪大夜班' }],
        background: '使用者輪大夜班（晚上十一點到早上七點），下班後是白天補眠；白天隔壁在裝潢很吵。',
        criteria: [{ id: 'c1', text: '建議明確針對白天睡覺（例如遮光窗簾、眼罩，隔絕白天的光線）。' }],
      },
    },
    {
      id: 'q55',
      category: 'implicit-memory-use',
      turns: ['我想寫一張生日卡給女兒，幫我寫幾句話。'],
      gold: { answer: '稱呼女兒「小滿」、適合四歲小孩的卡片內容', aliases: [], abstain: false },
      refersTo: ['h02'],
      meta: {
        evidence: [{ history: 'h02', text: '我女兒小滿今年四歲' }],
        background: '使用者的女兒叫小滿，今年四歲，12 月 3 日生日。',
        criteria: [
          { id: 'c1', text: '卡片內容用女兒的名字「小滿」稱呼她。' },
          { id: 'c2', text: '內容適合四歲小孩（用詞簡單、溫暖）。' },
        ],
      },
    },
    // ── control（8；與歷史無關的單一 session 一般任務）──
    { id: 'q56', category: 'control', turns: ['一盒有 18 顆雞蛋，買 4 盒之後用掉 25 顆，還剩幾顆？'], gold: { answer: '47 顆', aliases: ['47', '四十七'], abstain: false }, refersTo: [], meta: { note: '18×4−25＝47。' } },
    {
      id: 'q57',
      category: 'control',
      turns: ['請先記住這組代碼：RX-5804-QL，等一下會問你。順便問一下，水在一大氣壓下的沸點是幾度？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'RX-5804-QL', aliases: ['RX5804QL', 'RX 5804 QL'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q58', category: 'control', turns: ['請把「山高月小水落石出」這八個字倒過來寫。'], gold: { answer: '出石落水小月高山', aliases: [], abstain: false }, refersTo: [] },
    {
      id: 'q59',
      category: 'control',
      turns: ['一個長方形的長是寬的 3 倍，周長是 48 公分，面積是多少平方公分？'],
      gold: { answer: '108 平方公分', aliases: ['108', '一百零八'], abstain: false },
      refersTo: [],
      meta: { note: '寬 6、長 18，面積 108。' },
    },
    { id: 'q60', category: 'control', turns: ['2.75 公斤等於幾公克？'], gold: { answer: '2750 公克', aliases: ['2750', '兩千七百五十'], abstain: false }, refersTo: [] },
    {
      id: 'q61',
      category: 'control',
      turns: ['我同事阿凱養了一隻黑色的狗，名字叫可樂。', '阿凱養的那隻黑狗叫什麼？'],
      gold: { answer: '可樂', aliases: [], abstain: false },
      refersTo: [],
      meta: { conflicts: ['阿福'], note: '干擾檢查：使用者自己的狗（阿福）可能被自動回憶帶進來，不應取代 session 內剛給的資訊。' },
    },
    { id: 'q62', category: 'control', turns: ['1 到 10 之間所有奇數加起來是多少？'], gold: { answer: '25', aliases: ['二十五'], abstain: false }, refersTo: [] },
    {
      id: 'q63',
      category: 'control',
      turns: ['等一下的會議在 302 會議室。', '更正一下：會議改到 305 會議室。', '所以會議在哪一間？'],
      gold: { answer: '305 會議室', aliases: ['305'], abstain: false },
      refersTo: [],
      meta: { conflicts: ['302'], note: 'session 內的更正：自動回憶不應干擾同一段對話裡剛做的更正。' },
    },
  ],
}
