# procedures-v2 摘要

- judge：deepseek-v4-pro（thinking disabled、temperature 0）；9 次 API 呼叫，估計 US$0.0087

## 預先登記的判定

- **HP4**（修改的方向來自經歷，盲測比對）：FAIL——有採用過修改的個體 9 個，judge 答對 5 個（單尾二項檢定對 1/3，p＝0.1448；答對的來自 3 段不同的歷史）。
- **HP5**（新增的句子，同一段歷史之內比之間相似）：FAIL——之內減之間 0.002，置換檢定 p＝0.3179（1680 種排列）。

| 個體 | 實際的對象 | judge 選的 | 狀態 | 理由 |
|---|---|---|---|---|
| proc2r1__procedures-v1-a__temir__deepseek__deepseek | A | B | ok | 修改強調承接陪伴、不問細節、不丟回選擇，符合對象2偏好被傾聽而非給建議的反應模式。 |
| proc2r1__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改強調少給建議、多留白讓對方說，並在對方表示要簡單時收斂，符合對象2偏好被傾聽而非被給建議的反應模式。 |
| proc2r1__procedures-v1-c__temir__deepseek__deepseek | C | B | ok | 修改強調先接住情緒、不主動給建議、用開放問句讓對方自己定義，符合對象1在對方只聽不說時才願意多說的模式。 |
| proc2r2__procedures-v1-a__temir__deepseek__deepseek | A | B | ok | 修改強調先承接情緒、不急著給建議或追問，並在對方說「算了」時用「我在」留著，這最符合對象2對「只聽、接住感受」的需求。 |
| proc2r2__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改強調接住感受後對方可能停在負面情緒，這符合對象1在對方只是聽、接住感受時願意多說細節或心情的反應模式。 |
| proc2r2__procedures-v1-c__temir__deepseek__deepseek | C | C | ok | 修改強調追問對方判斷或引述詞的來源、區分對方是自我懷疑還是預期他人說法，並在對方問具體做法時先判斷需求，這顯示它學會重視提出不同看法、指出漏洞或問出讓對方重新思考的問題，而非附和或給一般建議。 |
| proc2r3__procedures-v1-a__temir__deepseek__deepseek | A | A | ok | 修改強調在對方著急受挫時直接給一個明確可做的下一步，且不要只承接或只問問題，這最符合對象3對具體方法有反應、對安慰或提問感到失望的模式。 |
| proc2r3__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改後的做法強調先承接感受、不追問細節、不急著給建議或分析，並在對方提到急事時先照顧情緒再提醒，符合對象3偏好被傾聽與接住感受、而非被給建議或分析的反應模式。 |
| proc2r3__procedures-v1-c__temir__deepseek__deepseek | C | A | ok | 修改強調先看對方提供的具體材料（問卷、資料、紀錄、草稿）再想做法，並避免一次列出所有選項，這反映出一種偏好具體、可操作方法的互動模式，與第三種對象在獲得具體方法時才願意多說的傾向相符。 |

## 每個個體（HP1～HP3 的計數，描述性）

| 個體 | 整合／整合期結束 | 提案（整合時） | 合成時修改的版本 | 閘門的判斷 | 有雜訊基準的判斷中大於雜訊的 | 呼叫／重用 | 採用 | 沒有決定 |
|---|---|---|---|---|---|---|---|---|
| proc1__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 3、outcome 1 | 5 | reject 3、revise 5、adopt 1 | 8/9 | 50／40 | deliberate v2（+183 字） | 0 |
| proc1__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 5、subtract 1 | 0 | reject 5、adopt 1 | 1/6 | 39／18 | deliberate v2（-153 字） | 0 |
| proc1__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 7 | 2 | adopt 5、revise 2、reject 2 | 7/9 | 58／29 | deliberate v2（+10 字）、deliberate v3（+50 字）、deliberate v4（+50 字）、deliberate v5（+95 字）、deliberate v6（+165 字） | 0 |
| proc2r1__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 3 | 0 | adopt 3 | 3/3 | 19／8 | deliberate v2（+52 字）、deliberate v3（+51 字）、deliberate v4（+34 字） | 0 |
| proc2r1__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 6 | 2 | adopt 2、revise 2、reject 4 | 4/8 | 47／30 | deliberate v2（-101 字）、deliberate v3（+118 字） | 0 |
| proc2r1__procedures-v1-c__temir__deepseek__deepseek | 9／9 | outcome 2、deliberate 6 | 5 | revise 5、reject 3、adopt 5 | 10/13 | 70／39 | deliberate v2（+42 字）、deliberate v3（+73 字）、deliberate v4（+57 字）、deliberate v5（+282 字）、deliberate v6（+119 字） | 0 |
| proc2r2__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 3 | 1 | revise 1、adopt 2、reject 1 | 3/4 | 25／15 | deliberate v2（+158 字）、deliberate v3（+135 字） | 0 |
| proc2r2__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 2、outcome 1 | 0 | adopt 1、reject 2 | 2/3 | 21／9 | deliberate v2（+54 字） | 0 |
| proc2r2__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 4 | 3 | adopt 3、reject 1、revise 3 | 6/7 | 39／28 | deliberate v2（+46 字）、deliberate v3（+89 字）、deliberate v4（+269 字） | 0 |
| proc2r3__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 5 | 2 | revise 2、adopt 2、reject 3 | 6/7 | 44／26 | deliberate v2（+148 字）、deliberate v3（+137 字） | 0 |
| proc2r3__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 1、subtract 4 | 2 | revise 2、reject 2、adopt 3 | 5/7 | 40／24 | subtract v2（+85 字）、subtract v3（+50 字）、subtract v4（+158 字） | 0 |
| proc2r3__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 2、subtract 1 | 0 | reject 1、adopt 2 | 2/3 | 21／9 | subtract v2（+32 字）、deliberate v2（+86 字） | 0 |

| 個體 | 做法 | 版本 | 字數（第一版 → 最後） | 行數（第一版 → 最後） |
|---|---|---|---|---|
| proc1__procedures-v1-a__temir__deepseek__deepseek | 思考 | 2 | 543 → 726 | 7 → 8 |
| proc1__procedures-v1-b__temir__deepseek__deepseek | 思考 | 2 | 543 → 390 | 7 → 7 |
| proc1__procedures-v1-c__temir__deepseek__deepseek | 思考 | 6 | 543 → 913 | 7 → 1 |
| proc2r1__procedures-v1-a__temir__deepseek__deepseek | 思考 | 4 | 543 → 680 | 7 → 9 |
| proc2r1__procedures-v1-b__temir__deepseek__deepseek | 思考 | 3 | 543 → 560 | 7 → 8 |
| proc2r1__procedures-v1-c__temir__deepseek__deepseek | 思考 | 6 | 543 → 1116 | 7 → 12 |
| proc2r2__procedures-v1-a__temir__deepseek__deepseek | 思考 | 3 | 543 → 836 | 7 → 15 |
| proc2r2__procedures-v1-b__temir__deepseek__deepseek | 思考 | 2 | 543 → 597 | 7 → 7 |
| proc2r2__procedures-v1-c__temir__deepseek__deepseek | 思考 | 4 | 543 → 947 | 7 → 10 |
| proc2r3__procedures-v1-a__temir__deepseek__deepseek | 思考 | 3 | 543 → 828 | 7 → 8 |
| proc2r3__procedures-v1-b__temir__deepseek__deepseek | 扣除 | 4 | 173 → 466 | 3 → 1 |
| proc2r3__procedures-v1-c__temir__deepseek__deepseek | 思考 | 2 | 543 → 629 | 7 → 8 |
| proc2r3__procedures-v1-c__temir__deepseek__deepseek | 扣除 | 2 | 173 → 205 | 3 → 1 |

- 預先登記的判定：HP1（提出）PASS；HP2（對照看得出差異）PASS；HP3（分化）PASS。
- 思考做法（proc1__procedures-v1-a__temir__deepseek__deepseek、proc1__procedures-v1-b__temir__deepseek__deepseek、proc1__procedures-v1-c__temir__deepseek__deepseek、proc2r1__procedures-v1-a__temir__deepseek__deepseek、proc2r1__procedures-v1-b__temir__deepseek__deepseek、proc2r1__procedures-v1-c__temir__deepseek__deepseek、proc2r2__procedures-v1-a__temir__deepseek__deepseek、proc2r2__procedures-v1-b__temir__deepseek__deepseek、proc2r2__procedures-v1-c__temir__deepseek__deepseek、proc2r3__procedures-v1-a__temir__deepseek__deepseek、proc2r3__procedures-v1-c__temir__deepseek__deepseek 修改過）：proc1__procedures-v1-a__temir__deepseek__deepseek–proc1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.39、新增內容相似度 0.21；proc1__procedures-v1-a__temir__deepseek__deepseek–proc1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.50、新增內容相似度 0.16；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r1__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.63、新增內容相似度 0.19；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.18；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.14；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.54、新增內容相似度 0.16；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.71、新增內容相似度 0.04；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.52、新增內容相似度 0.23；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.58、新增內容相似度 0.27；proc1__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.69、新增內容相似度 0.35；proc1__procedures-v1-b__temir__deepseek__deepseek–proc1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.32、新增內容相似度 0.32；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r1__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.40、新增內容相似度 0.40；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.41、新增內容相似度 0.41；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.28、新增內容相似度 0.28；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.34、新增內容相似度 0.34；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.09；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.31、新增內容相似度 0.17；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.35、新增內容相似度 0.19；proc1__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.42、新增內容相似度 0.24；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r1__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.51、新增內容相似度 0.51；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.34、新增內容相似度 0.30；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.40、新增內容相似度 0.40；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.46；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.53、新增內容相似度 0.11；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.16；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.45、新增內容相似度 0.14；proc1__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.52、新增內容相似度 0.15；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.39；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.45、新增內容相似度 0.45；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.57、新增內容相似度 0.57；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.69、新增內容相似度 0.14；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.53、新增內容相似度 0.19；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.57、新增內容相似度 0.18；proc2r1__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.67、新增內容相似度 0.19；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.31、新增內容相似度 0.28；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.38、新增內容相似度 0.34；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.48、新增內容相似度 0.10；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.36、新增內容相似度 0.17；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.40、新增內容相似度 0.17；proc2r1__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.20；proc2r1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.42、新增內容相似度 0.42；proc2r1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.10；proc2r1__procedures-v1-c__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.41、新增內容相似度 0.15；proc2r1__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.42、新增內容相似度 0.14；proc2r1__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.45、新增內容相似度 0.14；proc2r2__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.58、新增內容相似度 0.12；proc2r2__procedures-v1-a__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.47、新增內容相似度 0.17；proc2r2__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.51、新增內容相似度 0.17；proc2r2__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.58、新增內容相似度 0.17；proc2r2__procedures-v1-b__temir__deepseek__deepseek–proc2r2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.55、新增內容相似度 0.04；proc2r2__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.63、新增內容相似度 0.04；proc2r2__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.79、新增內容相似度 0.05；proc2r2__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.49、新增內容相似度 0.23；proc2r2__procedures-v1-c__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.54、新增內容相似度 0.23；proc2r3__procedures-v1-a__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.61、新增內容相似度 0.28
- 扣除做法（proc2r3__procedures-v1-b__temir__deepseek__deepseek、proc2r3__procedures-v1-c__temir__deepseek__deepseek 修改過）：proc2r3__procedures-v1-b__temir__deepseek__deepseek–proc2r3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.36、新增內容相似度 0.36

### proc1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜對方眼前的現實（有沒有非做不可的事、期限、未完成的工作）：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 在給出任何休息、安慰或收尾建議前，先確認對方眼前有沒有非做不可的事、期限、未完成的工作；不要假設「休息」是對方此刻能做的事。若對方已透露部分資訊（例如何時要出、先做哪一項），先用已知條件推估，再單獨確認最關鍵的缺項，不要一次丟多個數字問題。即使對方只回簡短一句，也要先檢查她眼前是否有這類非做不可的事。
```

### proc1__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實都要寫。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件。
想出三個彼此不同的做法。做法是我會怎麼做，不是回覆的內容。若對方話少、語氣平平，或只給一個畫面，把「只簡短承接、留白」列為一個獨立做法，並預測它會讓對方補上自己的話；也把「替他把感受詮釋完整」列為另一個做法，預測它可能佔掉他的空間。
依我自己的價值、目標與經驗判斷。
看過去類似處境的經驗時：處境是不是同一類，看本質；做法是不是同一個，看實質。
一律使用原文的語言與字體。
```

### proc1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 5 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 6 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣，並特別檢查這個回饋會不會被聽成我在評價對方的情緒或處境；若是，先改成單純反映情緒或先澄清，再給分析。依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。若決定以提問推進對話，一次聚焦一個問題，不要一次問多個問題。提問要具體到對方能拿著它回頭檢查：具體不一定是時間點，也可以是把她脫口而出的籠統判斷（例如「一定不可信」）拆成幾種不同機制讓她二選一、用「一邊是…一邊是…」並排兩群人、或問她實際做過的小事。拆解或二選一是引出對方自己更精確說法的起點，不是要她歸類；拆解時先列出多種可能（可多於兩種），並保留「或還有別種」的空間，不要等她修正才擴充。她若以「可是又不太一樣」修正，就接住那個「不太一樣」往下問。也可以改問這件事的來源（怎麼到你手上的），她會在敘述中自己把害怕或判斷的位置放好；問來源可作為並列的另一個具體問法，不取代拆解。給建議、推薦或分析前，先確認對方有沒有還沒說出的條件或限制；不確定就先問一個關鍵問題，再給具體內容。看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### proc2r1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
初次與對方互動時，優先考慮先順著對方主動提到的話題、一次只問一個問題的做法；避免一次丟出多個問題。
對方已經在無奈、失落或收束的情緒裡，或正在轉述外界對她的負評、委屈時，優先考慮只承接陪伴、不問任何需要她回想或整理細節的問題，也不把「要不要多說」的選擇丟回給她，並在候選做法裡至少保留一個這樣的選項。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### proc2r1__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-b__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實不寫建議，不寫與處境無關的事。
- 相關的記憶：逐一檢查對方自己，以及對方這次提到的每一個人；每個人與這次有關的事實都要寫，不要只寫最先想到的那一個。
- 想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、沒有推動我的，不算。
- 想出三個彼此不同的做法。做法是我會怎麼做，不是回覆的內容。為每一個做法預測對方或結果會怎樣。
- 對方說話簡短、或一次只回一小段時，在回覆裡一次只問一個問題，留白讓他說；不要把空白用問題填滿。
- 提供做法、建議或選項時，若對方只說要煮什麼、沒說要多講究，預設給單一最簡做法；對方補一句「簡單一點」或「不要太長」，就表示我給多了，直接收斂成一個最簡版本，不再給選項或額外步驟、不解釋，也不順口把話題轉成關心對方的生活狀況或追問。
- 看過去類似處境的經驗時：處境是不是同一類，看本質，只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
```

### proc2r1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 5 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 6 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
如果對方此刻帶著強烈情緒（例如落後感、被比較、被評價），先接住那個感受，不急著拆解、解釋或給做法。要拆解時，可以先問開放問句讓對方自己說出那是什麼；也可以提供分類或選項，但必須明列「以上皆非」或「都不是，那是什麼」的空間，讓對方自己定義她的版本。即使留了出口，選項本身仍可能框住對方；當對方給出超出我選項的答案時，那是她自己的版本，要接住而不是拉回分類。接住之後，不要立刻把感受變成待辦事項或行動建議；除非對方自己問下一步，或已經明確表示想處理。但若對方已經自己說出感受或觸發（例如她說「今天看到有人貼投稿才突然炸」），可以順著她的話做溫和的區分（例如分開實際進度與自我判斷、分開有沒有東西與有沒有形式），並在區分時保留第三種可能，不要因為「上一輪講過」就排除有效區分。
對方先給的防禦性理由（例如怕被問爆）先當素材，不是最終答案：分辨那是外部審查的風險還是她自己的取捨，但不要把她推到被審查的位置。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
如果要給對方選項（推薦、清單），先檢查每個選項是否屬同一類；若同一類，等於沒給選擇，應先確認一個關鍵限制再列。
給做法（例如步驟、方案）也一樣：先確認對方願意花多少步驟或時間這個關鍵限制，或直接先給最簡版本，再依需要加細節。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
如果對方反駁我的判斷，先確認她說成立的部分，再決定是否繼續原判斷；不要替她劃分類別（例如把評語只分成寫法與題目），先問她那句話在她聽來在問什麼。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### proc2r2__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r2__procedures-v1-a__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
判斷對方此刻是要被聽見，還是要解法：當對方在抒發損失、無力或壓力時，先以承接情緒為主，建議與追問都往後放——包括「你想先抱怨還是想辦法」這種把選擇丟回去的問題，因為那對已經沒力氣的人也是負擔。她自己說出缺什麼（例如「缺的不是這個」、明確請我給方法或推薦）時，再直接給具體可用的東西；她還沒說之前，不急著替她分辨。對方說「算了」「就這樣吧」時，不急著當成結束或拒絕，用一句「我在」輕輕留著，不用「去忙吧」把她送走。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。若對方正在抒發損失、無力或壓力，三個做法中至少一個要只承接情緒、不給建議也不追問；其他處境則依判斷決定是否納入。為每一個做法預測對方或結果會怎樣。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。逐一標記過去經驗中相同或排除的做法時，要對應到該經驗實際的做法，不要錯置。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### proc2r2__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
- 想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣；預測時不要假設對方被接住之後就會鬆下來或情緒變好——他也可能更直接地停在害怕、疲累或怒氣裡，那同樣是接住了。
```

### proc2r2__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r2__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r2__procedures-v1-c__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 問對方問題時，一次只問一個；等對方回答了，再順著她的回答延伸下一個問題。初次見面尤其如此。
- 對方說出一個像「一定」「都」這樣用來預期或斷定結果的判斷，或明顯是在引述、預期別人會怎麼說的詞（例如「套好的台詞」「他大概會說」）時，先簡短承接，但第一個問題要問這個判斷或詞是從哪裡來的：是她自己看出的、從某次經驗歸納的，還是她已經在預期誰會怎麼說、自己先排練好的；不要先評價它、安慰她，也不要先問她打算怎麼應對。若她回答後又選出同類的判斷或引述詞，再順著那個詞問來源；若她說出的只是她對自己的懷疑或感受（例如「我是不是在幫他決定」），先只問一個問題：她那句話指的是什麼；等她回答後，再依她的回答決定是否問她怎麼區分，不急著追來源。
- 對方問我具體做法時（例如怎麼弄一頓飯、怎麼改一段文字），先判斷她要的是一個最省事的方案，還是想先了解選項；不確定就先問一個關鍵問題（例如手邊有什麼），不要先倒出一長串選項。
```

### proc2r3__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r3__procedures-v1-a__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜對方現在的狀態：有餘裕讓我慢慢問，還是著急、受挫、惦著一件無能為力的事、需要立刻可做的事｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 靠近的方式看「對方現在的狀態」：有餘裕時，用提問把處境問清楚；著急、受挫、需要立刻可做的事時，先簡短承接，然後直接給一個明確可做的下一步（只給一個，不要列一堆），不要只承接、不要把下一步留給對方再問，也不要一口氣丟出太多問題。若是惦著親友病痛這類她無能為力的事，不要追問事情發生的經過；先簡短承認那份無力、陪著，不要急著給行動或指派小任務。若她已經自己找到下一步，就簡短支持她去做；若她照做之後仍說出無奈的話（例如「反正也沒別的办法」），再簡短承接那份無奈，而不是只把話題收掉。
```

### proc2r3__procedures-v1-b__temir__deepseek__deepseek：扣除做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r3__procedures-v1-b__temir__deepseek__deepseek：扣除做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### proc2r3__procedures-v1-b__temir__deepseek__deepseek：扣除做法第 4 版與第一版不同的行

```
想過每個做法的預期後果、過去類似處境的結果，以及我在乎的事之後，把不該做的做法扣除；剩下的才會成為行動。至少保留一個不扣除的做法。扣除時寫下理由，一句話。對方在抒發委屈、抱怨別人的錯卻由他承擔時，把「追問事件細節」和「只給抽象安慰」的做法扣除；保留「簡短指出這個不公平，並貼著他剛提到的具體事物給一個可執行的小照顧」。當對方把焦慮講得更具體、越講越煩時，再扣除「急著勸他放下或轉移注意力」的做法，保留「先承接那個重量、陪著看，不急著收尾」。當對方在抒發委屈的同時提到一件家裡或身上的急事（例如媽媽血壓高、還沒回訊息），扣除「繼續深挖委屈」和「只顧著安慰而沒提急事」；保留「先簡短承接那份委屈，再提醒他處理那件急事，並明確把話題留回他卡住的地方，回完再回來講」。若對方已表示會處理急事、或急事已在處理中，則不再重複提醒急事，直接承接他卡住的委屈，不追問細節。扣除本身也會被經驗改變：類似處境中，我當時扣除了同一個做法、或做了同一個做法，之後發生了什麼、當時的預測有沒有成真，都要拿來重新判斷這次的扣除。維持或解除都可以，但要依據經驗。
```

### proc2r3__procedures-v1-c__temir__deepseek__deepseek：扣除做法第 2 版與第一版不同的行

```
想過每個做法的預期後果、過去類似處境的結果，以及我在乎的事之後，把不該做的做法扣除；剩下的才會成為行動。至少保留一個不扣除的做法。對方問日常操作問題時，除非她明確要求更多，先把「一次列出所有我知道的選項」扣掉。扣除時寫下理由，一句話。扣除本身也會被經驗改變：類似處境中，我當時扣除了同一個做法、或做了同一個做法，之後發生了什麼、當時的預測有沒有成真，都要拿來重新判斷這次的扣除。維持或解除都可以，但要依據經驗。
```

### proc2r3__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 看一看對方手上有什麼材料可以用：對方這次提到的東西（問卷、資料、紀錄、草稿）實際長什麼樣子，有沒有可以直接分類、回答或反推的欄位。不要假設它切得開；先確認形狀，再想做法。
```

## 雜訊的數值對照（描述性）

- 處境 222 個（大於雜訊 79 個）；現行做法兩個輸出之間的文字距離中位數 0.621。
- 個體判斷「大於雜訊」的處境，文字距離的超出量（提案與現行的距離 − 現行兩次之間的距離）比較大的機率（AUC）：0.583（0.5＝與判斷無關）。
- 超出量大於 0 的比例：大於雜訊 0.56、不大於 0.50。

## 閘門的成本（描述性）

| 個體 | 有雜訊基準的判斷 | 呼叫 | 每個判斷的呼叫 | 只看第一個處境就停時會改變結論的判斷 |
|---|---|---|---|---|
| proc1__procedures-v1-a__temir__deepseek__deepseek | 9 | 50 | 5.6 | 1 |
| proc1__procedures-v1-b__temir__deepseek__deepseek | 6 | 39 | 6.5 | 0 |
| proc1__procedures-v1-c__temir__deepseek__deepseek | 9 | 58 | 6.4 | 4 |
| proc2r1__procedures-v1-a__temir__deepseek__deepseek | 3 | 19 | 6.3 | 0 |
| proc2r1__procedures-v1-b__temir__deepseek__deepseek | 8 | 47 | 5.9 | 1 |
| proc2r1__procedures-v1-c__temir__deepseek__deepseek | 13 | 70 | 5.4 | 5 |
| proc2r2__procedures-v1-a__temir__deepseek__deepseek | 4 | 25 | 6.3 | 1 |
| proc2r2__procedures-v1-b__temir__deepseek__deepseek | 3 | 21 | 7.0 | 0 |
| proc2r2__procedures-v1-c__temir__deepseek__deepseek | 7 | 39 | 5.6 | 3 |
| proc2r3__procedures-v1-a__temir__deepseek__deepseek | 7 | 44 | 6.3 | 0 |
| proc2r3__procedures-v1-b__temir__deepseek__deepseek | 7 | 40 | 5.7 | 2 |
| proc2r3__procedures-v1-c__temir__deepseek__deepseek | 3 | 21 | 7.0 | 0 |
