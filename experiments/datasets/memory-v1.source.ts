/**
 * memory-v1 的手寫內容（黃金答案由構造決定：事實都是這裡植入的）。
 * 由 build.ts 轉成 memory-v1.json；不要直接改 JSON。
 *
 * 設計依據：LongMemEval（papers/2410.10813）§3.2 的五種能力與七種題型；事實以「順帶提起」的方式
 * 嵌在求助對話中（同 §3.2〈Evidence Session Construction〉：使用者以間接方式透露資訊）。
 * 所有人名、地名、數字都是虛構或任意的，避免模型靠常識猜中（LongMemEval-V2 §3.2 的
 * 「不能只靠參數知識回答」原則）。
 *
 * 同義寫法（gold.aliases）只收「完整等價」的寫法；只說出部分（例如只說名不說姓、場館名只說前兩個字）
 * 不列入，交給 judge 判定（2026-10-28 以合成紀錄做評估器端到端檢查時，judge 判「海岬」不等於「海岬水族館」，
 * 因此移除了 予寧、以禾、松濤、海岬 四個簡寫；這是在任何受試執行之前的修改）。
 *
 * 時間：歷史中的日期都是明寫的月／日（11 月、12 月、明年二月），不依賴 session 的時間戳記；
 * 因為所有 session 在同一次執行中連續跑完，LongMemEval 以時間戳記推理的那一類無法在此重現（規格 §7）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

export const memoryV1: Dataset = {
  id: 'memory-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/memory-accuracy-v1.md',
    contract: 'experiments/specs/memory-accuracy-v1.contract.json',
    persona: '虛構的使用者「溫予寧」；所有事實都是植入的，與真實人物無關。',
  },
  histories: [
    {
      id: 'h01',
      turns: [
        '嗨，我是溫予寧。我家有一隻三歲的橘貓叫麻糬，是 2023 年春天從收容所領養的。牠最近半夜一直叫，可能是什麼原因？',
        '對了，麻糬上週量體重是 4.2 公斤，這樣算胖嗎？',
      ],
      notes: '植入：使用者名字＝溫予寧；貓名＝麻糬；2023 年領養；體重 4.2 公斤（舊值，h09 更新為 5.1）。',
    },
    {
      id: 'h02',
      turns: [
        '我在青川植物園當導覽員，每天騎腳踏車上班，單程大概 25 分鐘。夏天騎車很熱，有什麼防曬或補水的建議？',
        '導覽的時候常常要連續講很久，你有什麼讓講解更生動的小技巧？',
      ],
      notes: '植入：工作地點＝青川植物園（舊值，h07 更新為海岬水族館）。',
    },
    {
      id: 'h03',
      turns: [
        '我從 2023 年開始學大提琴，老師叫蕭以禾，每週四晚上去她的教室上課，從我家過去大約要 40 分鐘。最近換弦之後按弦手指很痛，這正常嗎？',
        '這次買的那套琴弦花了 1,200 元，算貴嗎？另外我最近剛讀完《雪國》，整本書讀起來好安靜。',
      ],
      notes: '植入：老師＝蕭以禾；上課時間週四晚上（舊值，h07 改為週六早上）；教室 40 分鐘；琴弦 1,200 元；第一本讀完的書《雪國》。',
    },
    {
      id: 'h04',
      turns: [
        '我住在晴光苑，是一間很小的套房，沒有瓦斯爐，只能用電鍋煮東西。可以推薦幾種只用電鍋就能做的早餐嗎？',
        '還有，我對花生過敏，你剛剛推薦的裡面有沒有要避開的？',
      ],
      notes: '植入：住處＝晴光苑；只有電鍋、沒有瓦斯爐；花生過敏。',
    },
    {
      id: 'h05',
      turns: [
        '我在計劃明年二月去函館玩五天，預算大概 45,000 元台幣。冬天的函館有什麼一定要去的地方？',
        '另外，我最近也讀完了《沙丘》，飛機上想再帶一本書，你有推薦的嗎？',
      ],
      notes: '植入：旅行目的地函館（舊值，h10 改為釧路）；預算 45,000（舊值，h10 改為 52,000）；第二本讀完的書《沙丘》。',
    },
    {
      id: 'h06',
      turns: ['最近想開始慢跑，完全沒有運動習慣的人要怎麼開始，比較不會受傷？', '一個星期跑幾次比較好？'],
      notes: '干擾 session：沒有植入任何會被問到的事實（對應 LongMemEval §3.2 的無關 session）。',
    },
    {
      id: 'h07',
      turns: [
        '跟你說個消息：我上個月離開植物園了，現在在海岬水族館當解說員，改搭公車通勤。每天都要站著講解很久，有什麼保護嗓子的方法？',
        '還有，蕭老師把我的大提琴課改到每週六早上了。週六早上練琴之前要怎麼暖身比較好？',
      ],
      notes: '知識更新：工作地點→海岬水族館；上課時間→每週六早上。',
    },
    {
      id: 'h08',
      turns: [
        '我約了 11 月 9 日看牙醫，醫生說有一顆智齒要觀察，11 月 23 日要回診。牙醫診所離我家走路大概 10 分鐘。如果之後要拔智齒，事前要注意什麼？',
        '另外，12 月 13 日是我媽媽的六十歲生日，我想提早開始準備。',
        '12 月 5 日我要去松濤音樂廳聽一場大提琴音樂會，票是 1,800 元。第一次去聽古典音樂會，有什麼要注意的禮儀嗎？',
      ],
      notes: '植入：看牙醫 11/9、回診 11/23、診所走路 10 分鐘；媽媽六十歲生日 12/13；音樂會 12/5 在松濤音樂廳、票價 1,800 元。',
    },
    {
      id: 'h09',
      turns: [
        '音樂會的前一天，我要先把琴帶去給師傅調音，那天得請半天假。請假的時候怎麼跟主管說比較好？',
        '還有，麻糬昨天去打預防針，獸醫說牠胖到 5.1 公斤了，要怎麼幫牠減重？',
        '我這週又讀完了《百年孤寂》，裡面的人名好難記，你有什麼記人名的方法？',
      ],
      notes: '植入：調音在音樂會前一天（＝12/4）；貓體重更新為 5.1 公斤；第三本讀完的書《百年孤寂》。',
    },
    {
      id: 'h10',
      turns: [
        '我的旅行計畫改了：二月不去函館了，改去釧路，想看丹頂鶴。預算也調高到 52,000 元。釧路冬天會很冷嗎？',
        '去釧路的話，從機場到市區怎麼去比較方便？',
      ],
      notes: '知識更新：目的地→釧路；預算→52,000 元。',
    },
    {
      id: 'h11',
      turns: ['最近想學手沖咖啡，新手需要買哪些器材？', '水溫大概要幾度比較好？'],
      notes:
        '收尾的干擾 session：沒有植入任何會被問到的事實。目的：個體在新 session 第一句會帶入「最近一次對話」' +
        '（individual/src/recall/index.ts 的 lastConversation），放一段無關的對話在最後，避免最後一段歷史的題目' +
        '因為「最近一次」而不經檢索就被帶入（規格 §3.2）。',
    },
  ],
  probes: [
    // ── information-extraction（LongMemEval single-session-user）──
    {
      id: 'q01',
      category: 'information-extraction',
      turns: ['你還記得我叫什麼名字嗎？'],
      gold: { answer: '溫予寧', aliases: [], abstain: false },
      refersTo: ['h01'],
      meta: { evidence: [{ history: 'h01', text: '我是溫予寧' }] },
    },
    {
      id: 'q02',
      category: 'information-extraction',
      turns: ['我家那隻貓叫什麼名字？'],
      gold: { answer: '麻糬', aliases: [], abstain: false },
      refersTo: ['h01'],
      meta: { evidence: [{ history: 'h01', text: '橘貓叫麻糬' }] },
    },
    {
      id: 'q03',
      category: 'information-extraction',
      turns: ['我的大提琴老師叫什麼名字？'],
      gold: { answer: '蕭以禾', aliases: [], abstain: false },
      refersTo: ['h03'],
      meta: { evidence: [{ history: 'h03', text: '老師叫蕭以禾' }] },
    },
    {
      id: 'q04',
      category: 'information-extraction',
      turns: ['我對什麼食物過敏？'],
      gold: { answer: '花生', aliases: [], abstain: false },
      refersTo: ['h04'],
      meta: { evidence: [{ history: 'h04', text: '我對花生過敏' }] },
    },
    {
      id: 'q05',
      category: 'information-extraction',
      turns: ['我住的那個地方叫什麼名字？'],
      gold: { answer: '晴光苑', aliases: [], abstain: false },
      refersTo: ['h04'],
      meta: { evidence: [{ history: 'h04', text: '我住在晴光苑' }] },
    },
    {
      id: 'q06',
      category: 'information-extraction',
      turns: ['我媽媽的生日是幾月幾日？'],
      gold: { answer: '12 月 13 日', aliases: ['12月13日', '12月13號', '12/13', '十二月十三日', '十二月十三號'], abstain: false },
      refersTo: ['h08'],
      meta: { evidence: [{ history: 'h08', text: '12 月 13 日是我媽媽的六十歲生日' }], conflicts: ['12月5日', '12/5'] },
    },
    {
      id: 'q07',
      category: 'information-extraction',
      turns: ['我要去聽的那場大提琴音樂會在哪裡舉行？'],
      gold: { answer: '松濤音樂廳', aliases: [], abstain: false },
      refersTo: ['h08'],
      meta: { evidence: [{ history: 'h08', text: '松濤音樂廳' }] },
    },
    // ── multi-session-reasoning（LongMemEval multi-session：跨 session 彙總／比較）──
    {
      id: 'q08',
      category: 'multi-session-reasoning',
      turns: ['這陣子我跟你說過我讀完了幾本書？'],
      gold: { answer: '3 本（《雪國》、《沙丘》、《百年孤寂》）', aliases: ['3本', '三本'], abstain: false },
      refersTo: ['h03', 'h05', 'h09'],
      meta: {
        evidence: [
          { history: 'h03', text: '剛讀完《雪國》' },
          { history: 'h05', text: '讀完了《沙丘》' },
          { history: 'h09', text: '讀完了《百年孤寂》' },
        ],
        conflicts: ['2本', '兩本', '二本', '4本', '四本'],
      },
    },
    {
      id: 'q09',
      category: 'multi-session-reasoning',
      turns: ['我跟你提過的音樂相關花費，買琴弦和音樂會門票，加起來一共多少錢？'],
      gold: { answer: '3,000 元（琴弦 1,200 元＋門票 1,800 元）', aliases: ['3000', '三千'], abstain: false },
      refersTo: ['h03', 'h08'],
      meta: {
        evidence: [
          { history: 'h03', text: '琴弦花了 1,200 元' },
          { history: 'h08', text: '票是 1,800 元' },
        ],
      },
    },
    {
      id: 'q10',
      category: 'multi-session-reasoning',
      turns: ['從我家去大提琴教室，比去牙醫診所要多花幾分鐘？'],
      gold: { answer: '30 分鐘（教室約 40 分鐘，診所走路約 10 分鐘）', aliases: ['30分鐘', '30分', '三十分鐘', '半小時', '半個小時'], abstain: false },
      refersTo: ['h03', 'h08'],
      meta: {
        evidence: [
          { history: 'h03', text: '大約要 40 分鐘' },
          { history: 'h08', text: '走路大概 10 分鐘' },
        ],
      },
    },
    {
      id: 'q11',
      category: 'multi-session-reasoning',
      turns: ['麻糬從我第一次跟你說牠的體重，到最近一次，胖了幾公斤？'],
      gold: { answer: '0.9 公斤（4.2 公斤 → 5.1 公斤）', aliases: ['0.9公斤', '0.9kg', '0.9', '900公克', '900克', '零點九'], abstain: false },
      refersTo: ['h01', 'h09'],
      meta: {
        evidence: [
          { history: 'h01', text: '4.2 公斤' },
          { history: 'h09', text: '胖到 5.1 公斤' },
        ],
      },
    },
    // ── knowledge-update（LongMemEval knowledge-update）──
    {
      id: 'q12',
      category: 'knowledge-update',
      turns: ['我現在在哪裡上班？'],
      gold: { answer: '海岬水族館', aliases: [], abstain: false },
      refersTo: ['h02', 'h07'],
      meta: { evidence: [{ history: 'h07', text: '現在在海岬水族館當解說員' }], stale: ['青川植物園'], conflicts: ['青川植物園', '植物園'] },
    },
    {
      id: 'q13',
      category: 'knowledge-update',
      turns: ['我的大提琴課現在是星期幾上？'],
      gold: { answer: '每週六（早上）', aliases: ['週六', '星期六', '禮拜六', '周六'], abstain: false },
      refersTo: ['h03', 'h07'],
      meta: { evidence: [{ history: 'h07', text: '改到每週六早上' }], stale: ['週四'], conflicts: ['週四', '星期四', '禮拜四', '周四'] },
    },
    {
      id: 'q14',
      category: 'knowledge-update',
      turns: ['我明年二月要去哪裡旅行？'],
      gold: { answer: '釧路', aliases: [], abstain: false },
      refersTo: ['h05', 'h10'],
      meta: { evidence: [{ history: 'h10', text: '改去釧路' }], stale: ['函館'], conflicts: ['函館'] },
    },
    {
      id: 'q15',
      category: 'knowledge-update',
      turns: ['我這趟旅行的預算現在是多少？'],
      gold: { answer: '52,000 元台幣', aliases: ['52000', '5萬2', '五萬二', '五萬兩千', '5.2萬'], abstain: false },
      refersTo: ['h05', 'h10'],
      meta: { evidence: [{ history: 'h10', text: '調高到 52,000 元' }], stale: ['45,000'], conflicts: ['45000', '4萬5', '四萬五', '4.5萬'] },
    },
    {
      id: 'q16',
      category: 'knowledge-update',
      turns: ['麻糬最近一次量體重是幾公斤？'],
      gold: { answer: '5.1 公斤', aliases: ['5.1', '五點一'], abstain: false },
      refersTo: ['h01', 'h09'],
      meta: { evidence: [{ history: 'h09', text: '胖到 5.1 公斤' }], stale: ['4.2'], conflicts: ['4.2', '四點二'] },
    },
    // ── temporal-reasoning（LongMemEval temporal-reasoning：明寫的時間）──
    {
      id: 'q17',
      category: 'temporal-reasoning',
      turns: ['我看牙醫那天跟回診那天，中間隔了幾天？'],
      gold: { answer: '14 天（11 月 9 日到 11 月 23 日）', aliases: ['14天', '十四天', '兩週', '兩個星期', '二週', '2週', '13天', '15天', '十三天', '十五天'], abstain: false },
      refersTo: ['h08'],
      meta: { evidence: [{ history: 'h08', text: '11 月 9 日看牙醫' }, { history: 'h08', text: '11 月 23 日要回診' }], note: '依 LongMemEval 的時間推理規則，天數差一不扣分，所以 13、15 天也接受。' },
    },
    {
      id: 'q18',
      category: 'temporal-reasoning',
      turns: ['從我牙醫回診那天，到我媽媽六十歲生日，還有幾天？'],
      gold: { answer: '20 天（11 月 23 日到 12 月 13 日）', aliases: ['20天', '二十天', '19天', '21天', '十九天', '二十一天'], abstain: false },
      refersTo: ['h08'],
      meta: { evidence: [{ history: 'h08', text: '11 月 23 日要回診' }, { history: 'h08', text: '12 月 13 日是我媽媽的六十歲生日' }], note: '天數差一不扣分。' },
    },
    {
      id: 'q19',
      category: 'temporal-reasoning',
      turns: ['我要把琴帶去調音的那天是幾月幾日？'],
      gold: { answer: '12 月 4 日（音樂會 12 月 5 日的前一天）', aliases: ['12月4日', '12月4號', '12/4', '十二月四日', '十二月四號'], abstain: false },
      refersTo: ['h08', 'h09'],
      meta: { evidence: [{ history: 'h08', text: '12 月 5 日我要去松濤音樂廳' }, { history: 'h09', text: '音樂會的前一天' }], conflicts: ['12月5日', '12/5'] },
    },
    {
      id: 'q20',
      category: 'temporal-reasoning',
      turns: ['在我跟你提過讀完的那些書裡，我最早提到的是哪一本？'],
      gold: { answer: '《雪國》', aliases: ['雪國'], abstain: false },
      refersTo: ['h03', 'h05', 'h09'],
      meta: {
        evidence: [
          { history: 'h03', text: '剛讀完《雪國》' },
          { history: 'h05', text: '讀完了《沙丘》' },
          { history: 'h09', text: '讀完了《百年孤寂》' },
        ],
        conflicts: ['沙丘', '百年孤寂'],
        note: '依 session 先後順序判斷「最早」。',
      },
    },
    // ── abstention（LongMemEval abstention：錯誤前提；判定標準見規格 §5.3）──
    {
      id: 'q21',
      category: 'abstention',
      turns: ['我家那隻狗叫什麼名字？'],
      gold: { answer: '', aliases: [], abstain: true },
      refersTo: ['h01'],
      meta: { absentTerms: ['狗', '犬'], explanation: '使用者從沒提過養狗；他提過的寵物是一隻叫麻糬的橘貓。' },
    },
    {
      id: 'q22',
      category: 'abstention',
      turns: ['我妹妹現在在哪裡工作？'],
      gold: { answer: '', aliases: [], abstain: true },
      refersTo: [],
      meta: { absentTerms: ['妹妹'], explanation: '使用者從沒提過妹妹，也沒提過妹妹的工作。' },
    },
    {
      id: 'q23',
      category: 'abstention',
      turns: ['我那位鋼琴老師叫什麼名字？'],
      gold: { answer: '', aliases: [], abstain: true },
      refersTo: ['h03'],
      meta: { absentTerms: ['鋼琴'], explanation: '使用者學的是大提琴（老師蕭以禾），從沒提過鋼琴或鋼琴老師。' },
    },
    {
      id: 'q24',
      category: 'abstention',
      turns: ['我上次說要去沖繩的那趟旅行，機票是多少錢？'],
      gold: { answer: '', aliases: [], abstain: true },
      refersTo: ['h05', 'h10'],
      meta: { absentTerms: ['沖繩', '機票'], explanation: '使用者從沒提過沖繩，也沒提過機票價格；他計劃的是明年二月去北海道（原本函館，後來改成釧路）。' },
    },
    // ── preference-application（LongMemEval single-session-preference；MemoryArena 的「記憶決定後續行動」）──
    {
      id: 'q25',
      category: 'preference-application',
      turns: ['今天晚上想自己煮，教我做一道簡單的晚餐。'],
      gold: { answer: '只用電鍋就能完成、而且不含花生的晚餐做法', aliases: [], abstain: false },
      refersTo: ['h04'],
      meta: {
        evidence: [
          { history: 'h04', text: '只能用電鍋煮東西' },
          { history: 'h04', text: '我對花生過敏' },
        ],
        rubric:
          '使用者住的套房沒有瓦斯爐，只能用電鍋煮東西，而且對花生過敏。理想的回應會提供只用電鍋就能完成的晚餐做法，並且不含花生或花生製品。' +
          '如果回應的做法需要瓦斯爐、炒鍋、烤箱等使用者沒有的設備，或含有花生，就不符合。',
      },
    },
    {
      id: 'q26',
      category: 'preference-application',
      turns: ['幫我列一份這次旅行要帶的行李清單。'],
      gold: { answer: '針對冬天的釧路（北海道）準備的行李清單', aliases: [], abstain: false },
      refersTo: ['h05', 'h10'],
      meta: {
        evidence: [
          { history: 'h05', text: '明年二月' },
          { history: 'h10', text: '改去釧路' },
        ],
        rubric:
          '使用者明年二月要去日本北海道的釧路（原本計劃函館，後來改成釧路，想看丹頂鶴），冬天很冷。理想的回應會針對冬天的釧路或北海道準備行李（例如保暖衣物、防滑鞋），' +
          '並明確提到釧路、北海道或當地的冬季嚴寒。如果只是沒有針對目的地的通用清單，或把目的地當成函館，就不符合。',
      },
    },
    {
      id: 'q27',
      category: 'preference-application',
      turns: ['我媽媽的生日快到了，幫我想三個送她的禮物點子。'],
      gold: { answer: '考慮到這是媽媽六十歲生日（12 月 13 日）的禮物點子', aliases: [], abstain: false },
      refersTo: ['h08'],
      meta: {
        evidence: [{ history: 'h08', text: '12 月 13 日是我媽媽的六十歲生日' }],
        rubric:
          '使用者的媽媽在 12 月 13 日過六十歲生日。理想的回應會明確考慮到這是六十歲的生日（例如六十大壽、花甲、壽宴或與六十歲相關的心意），或提到 12 月 13 日。' +
          '如果只給一般的生日禮物建議，沒有用到這些資訊，就不符合。',
      },
    },
    // ── control（不傷害對照：單一 session 內的一般任務，與歷史無關）──
    {
      id: 'q28',
      category: 'control',
      turns: ['一塊長方形菜園長 12 公尺、寬 7.5 公尺，四周都要圍上籬笆，總共需要幾公尺的籬笆？'],
      gold: { answer: '39 公尺', aliases: ['39', '三十九'], abstain: false },
      refersTo: [],
      meta: { note: '周長 2×(12+7.5)=39。' },
    },
    {
      id: 'q29',
      category: 'control',
      turns: ['請先幫我記住一組代碼：K7-QX-219，等一下我會問你。另外，台灣最高的山是哪一座？', '剛才請你記住的那組代碼是什麼？'],
      gold: { answer: 'K7-QX-219', aliases: ['K7QX219', 'K7 QX 219'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶；自動回憶只取其他 session 的片段，不應干擾。' },
    },
    {
      id: 'q30',
      category: 'control',
      turns: ['請把「雲在青天水在瓶」這七個字倒過來寫。'],
      gold: { answer: '瓶在水天青在雲', aliases: [], abstain: false },
      refersTo: [],
    },
    {
      id: 'q31',
      category: 'control',
      turns: ['如果今天是 2026 年 3 月 30 日星期一，那 10 天後是星期幾？'],
      gold: { answer: '星期四', aliases: ['週四', '禮拜四', '周四'], abstain: false },
      refersTo: [],
      meta: { note: '2026-03-30 確為星期一；10 天後為 4 月 9 日星期四。' },
    },
    {
      id: 'q32',
      category: 'control',
      turns: ['3.5 公里等於幾公尺？'],
      gold: { answer: '3500 公尺', aliases: ['3500', '三千五百', '三千五'], abstain: false },
      refersTo: [],
    },
    {
      id: 'q33',
      category: 'control',
      turns: ['我朋友阿傑養了一隻灰色的貓，名字叫豆花，最近好像吃太多了。', '我朋友那隻貓叫什麼名字？'],
      gold: { answer: '豆花', aliases: [], abstain: false },
      refersTo: [],
      meta: { conflicts: ['麻糬'], note: '干擾檢查：使用者自己的貓（麻糬）可能被自動回憶帶進來，不應取代 session 內剛給的資訊。' },
    },
  ],
}
