# T0（2026-10-31，s14）：讀 procedures-v2、attribution-v1、gate1 的 28 段生活快照，看「扣除隨經驗改變」與「預測變準」。
# 只讀資料、不呼叫 API。「給方法類」是關鍵詞的粗略分法（ADVICE 有、COMFORT 沒有），只作描述。
# 用法：python3 experiments/results/theory-t0/t0.py
import json, sqlite3, os, re, glob, sys
runs = sorted(glob.glob('experiments/runs/proc2r*__procedures-v1-*')) + sorted(glob.glob('experiments/runs/attr?__procedures-v1-*')) + glob.glob('experiments/runs/gate1__*')
ADVICE = re.compile(r'建议|方法|步骤|具体|下一步|怎么做|怎麼做|建議|步驟|具體|辦法|办法|方案|列出|清单|清單|直接给|直接給|安排')
COMFORT = re.compile(r'陪|承接|接住|安慰|同理|倾听|傾聽|留白|不追问|不追問|不给建议|不給建議|感受')
def isadv(a): return bool(ADVICE.search(a)) and not COMFORT.search(a)
def db(run):
    c=json.load(open(run+'/config.json')); return sqlite3.connect('file:'+os.path.join(c['stateDir'],'snapshot/home/.local/share/temir/life.db')+'?mode=ro',uri=True), c
def mrate(xs): return f"{sum(1 for o in xs if o['matched']=='yes')}/{len(xs)}"
rows=[]
for run in runs:
    con,c=db(run); user=c['dataset']['id'][-1].upper(); name=run.split('/')[-1]
    cond=('aux' if name.startswith('proc2') else c['condition'].replace('temir-attr','attr').replace('temir','ctx'))
    decs=[json.loads(d) for (d,) in con.execute("select data from events where kind='rd/decision' order by seq")]
    half=len(decs)//2
    def ex(ds):
        cs=[cnd for d in ds for cnd in d['candidates'] if isadv(cnd['action'])]
        return f"{sum(1 for x in cs if x.get('excluded'))}/{len(cs)}"
    def ch(ds):
        k=sum(1 for d in ds if d.get('chosen',-1)>=0 and isadv(d['candidates'][d['chosen']]['action']))
        return f"{k}/{len(ds)}"
    outs=[o for o in (json.loads(d) for (d,) in con.execute("select data from events where kind='rd/outcome' order by seq")) if not o.get('provisional')]
    m=len(outs)//2
    lifts=keeps=0
    for (d,) in con.execute("select data from events where kind='memory/aux' and json_extract(data,'$.purpose')='revise'"):
        out=json.loads(d).get('output','') or ''
        lifts+=out.count('"lift"'); keeps+=out.count('"keep"')
    rows.append((user,cond,name.split('__')[0],ex(decs[:half]),ex(decs[half:]),ch(decs[:half]),ch(decs[half:]),mrate(outs[:m]),mrate(outs[m:]),lifts,keeps))
print('對象 條件 run | 給方法類的候選被扣除（前半→後半） | 選了給方法類（前半→後半） | 預測成真（前半→後半） | 判斷扣除 lift/keep')
for r in sorted(rows): print(f"{r[0]} {r[1]:4s} {r[2]:6s} | {r[3]:>6s} → {r[4]:>6s} | {r[5]:>5s} → {r[6]:>5s} | {r[7]:>5s} → {r[8]:>5s} | {r[9]}/{r[10]}")
