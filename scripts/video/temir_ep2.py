#!/usr/bin/env python3
"""特密爾的簡體中文影片第二期：安裝與人設（2026-11-01）。

使用者：「製作第二期的教學影片, 說明安裝後如何設定人設與如何安裝」。內容照 s14 實際做過的步驟：
- 個體以 `link:` 裝進 DSH Launcher 的整合包（Node 不剝除 node_modules 中 .ts 檔的型別）；`dsh plugin add -w`（整合包是 pnpm 工作區）；
- 不相容的插件 DSH 會略過；`--dump-config` 檢查；第一次啟動時個體誕生；
- 人設寫在 profile 的 cordis.patch.yml，只在個體還沒有自我模型時寫成第一版，之後由個體自己修訂；面板在 /temir/。

框架（旁白、字幕、音樂、音效、平行渲染）沿用 temir_intro.py；這裡只有腳本、教學用的畫面元件（終端機、編輯器、瀏覽器）與封面。
用法：python3 scripts/video/temir_ep2.py --out <輸出目錄> [--preview] [--jobs 7]
"""
from __future__ import annotations

import argparse
import sys
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import temir_intro as base  # noqa: E402
from temir_intro import (  # noqa: E402
    AMBER,
    BLUE,
    CARD,
    CYAN,
    DIM,
    GREEN,
    H,
    MUTED,
    RED,
    VIOLET,
    WHITE,
    YELLOW,
    W,
    Ctx,
    Scene,
    big_word,
    blob,
    card,
    chip,
    clamp,
    comp,
    ease_out,
    faded,
    font,
    mono,
    put,
    stamp,
    text_img,
)

base.RATE = '+4%'  # 教學：比第一期（+10%）慢一點

# ---------------------------------------------------------------------------------------------
# 教學用的畫面元件
# ---------------------------------------------------------------------------------------------

PROMPT = AMBER
OUT = (190, 200, 228)
KEY = CYAN
STR = (255, 214, 150)
COMMENT = DIM
OK = GREEN


def is_code_char(ch: str) -> bool:
    """等寬字型（Consolas）畫得了的字；中文與全形標點用 Noto Sans SC。"""
    return ord(ch) < 0x2000


@lru_cache(maxsize=1024)
def code_line(segments: tuple[tuple[str, tuple], ...], size: int) -> Image.Image:
    """一行程式碼：依片段上色，ASCII 用等寬字型、中文用黑體。"""
    m, c = mono(size), font(size, 'Medium')
    runs: list[tuple[str, tuple, bool]] = []
    for text, color in segments:
        for ch in text:
            code = is_code_char(ch)
            if runs and runs[-1][1] == color and runs[-1][2] == code:
                runs[-1] = (runs[-1][0] + ch, color, code)
            else:
                runs.append((ch, color, code))
    width = sum((m if code else c).getlength(r) for r, _, code in runs)
    img = Image.new('RGBA', (int(width) + 8, int(size * 1.5)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 0.0
    for r, color, code in runs:
        f = m if code else c
        d.text((x, size * 0.12 if code else 0), r, font=f, fill=tuple(color))
        x += f.getlength(r)
    return img


def cut(segments: tuple[tuple[str, tuple], ...], n: int) -> tuple[tuple[str, tuple], ...]:
    """前 n 個字（打字效果）。"""
    out, left = [], n
    for text, color in segments:
        if left <= 0:
            break
        out.append((text[:left], color))
        left -= len(text)
    return tuple(out)


def length(segments: tuple[tuple[str, tuple], ...]) -> int:
    return sum(len(t) for t, _ in segments)


@lru_cache(maxsize=64)
def window(w: int, h: int, title: str, accent, kind: str = 'term') -> Image.Image:
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fill = (12, 15, 30, 245) if kind == 'term' else (18, 22, 44, 245)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=22, fill=fill, outline=tuple(accent) + (200,), width=3)
    d.rounded_rectangle((0, 0, w - 1, 64), radius=22, fill=(30, 36, 66, 255))
    d.rectangle((0, 40, w - 1, 64), fill=(30, 36, 66, 255))
    for i, col in enumerate([(255, 95, 87), (255, 189, 46), (40, 201, 64)]):
        d.ellipse((26 + i * 34, 22, 46 + i * 34, 42), fill=col)
    d.text((140, 14), title, font=font(30, 'Bold'), fill=MUTED)
    return img


class Row:
    """終端機的一行：cmd（打字出現）、out（整行淡入）。at＝開始的時間（秒，相對於這一幕）。"""

    def __init__(self, kind: str, segments: tuple[tuple[str, tuple], ...], at: float, cps: float = 34):
        self.kind, self.segments, self.at, self.cps = kind, segments, at, cps


def terminal(frame: Image.Image, x: int, y: int, w: int, h: int, title: str, rows: list[Row], t: float, t0: float, accent=AMBER, size: int = 30) -> None:
    if t < t0:
        return
    a = ease_out((t - t0) / 0.4)
    win = window(w, h, title, accent, 'term')
    comp(frame, faded(win, a), x, y + 30 * (1 - a))
    ly = y + 88
    for r in rows:
        if t < r.at:
            break
        if r.kind == 'cmd':
            n = int(clamp((t - r.at) * r.cps, 0, length(r.segments)))
            img = code_line((('PS> ', PROMPT),) + cut(r.segments, n), size)
            comp(frame, img, x + 34, ly)
            if n < length(r.segments) and int(t * 3) % 2 == 0:  # 游標
                ImageDraw.Draw(frame).rectangle((x + 34 + img.width - 4, ly + 6, x + 34 + img.width + 10, ly + size * 1.25), fill=WHITE + (220,))
        else:
            img = code_line(r.segments, size)
            comp(frame, faded(img, clamp((t - r.at) / 0.25)), x + 34, ly)
        ly += int(size * 1.55)


def yaml_segments(line: str) -> tuple[tuple[str, tuple], ...]:
    """簡單的 YAML 上色：註解、鍵、值。"""
    if line.lstrip().startswith('#'):
        return ((line, COMMENT),)
    stripped = line.lstrip(' ')
    indent = line[: len(line) - len(stripped)]
    lead = ''
    if stripped.startswith('- '):
        lead, stripped = '- ', stripped[2:]
    if ':' in stripped and not stripped.startswith(('我', '“', '「')):
        k, v = stripped.split(':', 1)
        return ((indent + lead, WHITE), (k, KEY), (':', WHITE), (v, AMBER if v.strip() == '|-' else STR))
    return ((indent + lead + stripped, WHITE),)


def editor(frame: Image.Image, x: int, y: int, w: int, h: int, title: str, lines: list[str], t: float, t0: float, starts: list[float], accent=CYAN, size: int = 30, hl: frozenset = frozenset()) -> None:
    """編輯器：每一行在 starts[i] 淡入；hl＝要框起來強調的行號。"""
    if t < t0:
        return
    a = ease_out((t - t0) / 0.4)
    comp(frame, faded(window(w, h, title, accent, 'edit'), a), x, y + 30 * (1 - a))
    ly = y + 86
    lh = int(size * 1.55)
    for i, line in enumerate(lines):
        st = starts[i] if i < len(starts) else starts[-1]
        if t < st:
            break
        p = clamp((t - st) / 0.25)
        num = code_line(((f'{i + 1:>2}', DIM),), size - 4)
        comp(frame, faded(num, p), x + 22, ly + 3)
        img = code_line(yaml_segments(line), size)
        if i in hl:
            ImageDraw.Draw(frame).rounded_rectangle((x + 78, ly - 4, x + 92 + img.width, ly + lh - 8), radius=8, outline=YELLOW + (int(220 * p),), width=3)
        comp(frame, faded(img, p), x + 86, ly)
        ly += lh


@lru_cache(maxsize=128)
def note_card(title: str, text: str, accent, w: int = 760, size: int = 34) -> Image.Image:
    head = text_img(title, size + 6, accent, 'Black', align='left')
    body = text_img(text, size, WHITE, 'Medium', width=w - 80, align='left') if text else None
    h = 40 + head.height + (body.height + 6 if body else 0) + 20
    img = card(w, h, accent).copy()
    img.alpha_composite(head, (40, 26))
    if body:
        img.alpha_composite(body, (40, 26 + head.height + 4))
    return img


@lru_cache(maxsize=64)
def check_card(text: str, sub: str, accent) -> Image.Image:
    w, h = 780, 150
    img = card(w, h, accent).copy()
    d = ImageDraw.Draw(img)
    d.ellipse((36, 40, 106, 110), outline=tuple(accent) + (255,), width=6)
    d.line((52, 76, 68, 92, 92, 58), fill=tuple(accent) + (255,), width=8, joint='curve')
    img.alpha_composite(text_img(text, 44, WHITE, 'Black', align='left'), (130, 22))
    img.alpha_composite(text_img(sub, 30, MUTED, 'Medium', align='left'), (132, 84))
    return img


def arrow(frame: Image.Image, x0: float, y0: float, x1: float, y1: float, color, p: float, width: int = 8) -> None:
    if p <= 0:
        return
    xe, ye = x0 + (x1 - x0) * p, y0 + (y1 - y0) * p
    d = ImageDraw.Draw(frame)
    d.line((x0, y0, xe, ye), fill=tuple(color) + (255,), width=width)
    if p >= 1:
        import math

        ang = math.atan2(y1 - y0, x1 - x0)
        for s in (-1, 1):
            d.line((x1, y1, x1 - 28 * math.cos(ang + s * 0.5), y1 - 28 * math.sin(ang + s * 0.5)), fill=tuple(color) + (255,), width=width)


def step_tag(frame: Image.Image, n: int, title: str, t: float, t0: float, accent) -> None:
    """左上角的步驟標籤：「第 n 步 · 標題」。"""
    img = chip(f'第 {n} 步 · {title}', accent, 36)
    put(frame, img, 290, 30, t, t0, 'left', 0.4)


# ---------------------------------------------------------------------------------------------
# 腳本（【】＝字幕中的關鍵詞）
# ---------------------------------------------------------------------------------------------

PACK = r'$env:APPDATA\dsh-launcher\dsh-packs\pack-tw'
DSH_CMD = r'$env:APPDATA\dsh-launcher\dsh-runtime\versions\0.2.2-alpha.2\node_modules\.bin\dsh.cmd'

PERSONA_YAML = [
    '# 特密尔的初始人设：只会写成第一版',
    '- id: temir-self',
    '  config:',
    '    persona:',
    '      name: 小满',
    '      selfModel: |-',
    '        我是住在这台电脑里的人工个体。我好奇心很重，喜欢问到底；',
    '        说话直接，但会先把对方的话听完……',
    '      story: |-',
    '        我第一次醒来，是在一个安静的晚上……',
]


def d_hook(c: Ctx) -> None:
    t = c.t
    put(c.frame, chip('第 2 期', AMBER, 44), (W - chip('第 2 期', AMBER, 44).width) / 2, 170, t, c.at(0, 0.0), 'pop')
    recap = note_card('上一期', '它会记得你、先想再说、会改自己，也会改错', DIM, 900, 36)
    put(c.frame, recap, (W - recap.width) / 2, 380, t, c.at(0, 0.3), 'up', 0.45, out_at=c.at(1, 0.0))
    a = big_word('装好它', 190, WHITE, BLUE)
    b = big_word('再给它一个性格', 150, CYAN)
    put(c.frame, a, (W - a.width) / 2, 300, t, c.at(1, 0.2), 'pop', 0.5)
    put(c.frame, b, (W - b.width) / 2, 560, t, c.at(1, 2.4), 'pop', 0.5)


def d_need(c: Ctx) -> None:
    t = c.t
    items = [
        ('DSH 启动器 + 整合包', '整合包的 DSH 版本是 0.2.2', BLUE, c.at(1, 0.0)),
        ('Node.js 24 以上', '特密尔是 TypeScript，由 Node 直接执行', GREEN, c.at(1, 2.4)),
        ('DeepSeek API 密钥', '在启动器里登录', VIOLET, c.at(1, 4.2)),
        ('特密尔的代码', 'github.com/win10ogod/temir', AMBER, c.at(1, 5.6)),
    ]
    title = text_img('开始之前，准备四样东西', 58, WHITE, 'Black')
    put(c.frame, title, (W - title.width) / 2, 120, t, c.at(0, 0.0))
    for i, (a, b, col, t0) in enumerate(items):
        img = check_card(a, b, col)
        put(c.frame, img, 150 + (i % 2) * 840, 290 + (i // 2) * 200, t, t0, 'pop')


def d_code(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 1, '拿到代码', t, 0.0, AMBER)
    rows = [Row('cmd', (('git clone https://github.com/win10ogod/temir', WHITE),), c.at(0, 0.6))]
    terminal(c.frame, 160, 150, 1600, 190, 'PowerShell', rows, t, c.at(0, 0.0))
    # 檔案樹：temir\individual → D:\DSH\temir-individual
    put(c.frame, note_card('temir\\', '', DIM, 420, 34), 200, 420, t, c.at(1, 0.0), 'left')
    put(c.frame, note_card('individual\\', '只要这个文件夹', CYAN, 520, 32), 260, 560, t, c.at(1, 1.2), 'left')
    arrow(c.frame, 800, 640, 1080, 640, CYAN, clamp((t - c.at(1, 3.0)) / 0.5))
    put(c.frame, note_card('D:\\DSH\\temir-individual', '固定的位置', GREEN, 640, 32), 1110, 560, t, c.at(1, 3.4), 'right')
    st = stamp('放好就别再搬', RED, 60, -6)
    put(c.frame, st, 1140, 400, t, c.at(2, 0.4), 'stamp', 0.3)


def d_pack(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 2, '找到整合包', t, 0.0, BLUE)
    path = code_line((('C:\\Users\\你\\AppData\\Roaming\\dsh-launcher\\dsh-packs\\', OUT), ('pack-tw', YELLOW)), 40)
    box = card(path.width + 100, 140, BLUE).copy()
    box.alpha_composite(path, (50, 44))
    put(c.frame, box, (W - box.width) / 2, 300, t, c.at(1, 0.0), 'up')
    x_id = (W - box.width) / 2 + 50 + path.width - code_line((('pack-tw', YELLOW),), 40).width / 2
    arrow(c.frame, x_id, 560, x_id, 450, YELLOW, clamp((t - c.at(1, 2.6)) / 0.4))
    tag = chip('文件夹名字 = 整合包的 ID', YELLOW, 40)
    put(c.frame, tag, x_id - tag.width / 2, 580, t, c.at(1, 2.9), 'pop')


def d_install(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 3, '装进整合包', t, 0.0, GREEN)
    rows = [
        Row('cmd', (('$env:DSH_HOME = ', KEY), (f'"{PACK}"', STR)), c.at(0, 0.5), 40),
        Row('cmd', (('$dsh = ', KEY), (f'"{DSH_CMD}"', STR)), c.at(1, 0.2), 52),
        Row('cmd', (('& $dsh plugin --profile pack-tw add ', WHITE), ('-w ', YELLOW), ('link:', YELLOW), ('D:/DSH/temir-individual', WHITE)), c.at(1, 2.6), 36),
        Row('out', (('+ temir-individual 0.1.0 <- D:\\DSH\\temir-individual', OK),), c.at(1, 5.0)),
    ]
    terminal(c.frame, 100, 140, 1720, 380, 'PowerShell', rows, t, c.at(0, 0.0), GREEN, 28)
    put(c.frame, note_card('-w', '整合包是一个 pnpm 工作区，要明确装在根目录', YELLOW, 800, 32), 100, 580, t, c.at(2, 0.6), 'up')
    put(c.frame, note_card('link:', 'TypeScript 放进 node_modules，Node 就不帮它去掉类型；所以链接到你放代码的文件夹', YELLOW, 820, 32), 980, 580, t, c.at(2, 3.4), 'up')


def d_more(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 4, '其他插件（可选）', t, 0.0, VIOLET)
    rows = [
        Row('cmd', (('& $dsh plugin --profile pack-tw add ', WHITE), ('-w ', YELLOW), ('@xmanrui/dsh-im', WHITE)), c.at(0, 0.6), 34),
        Row('out', (('+ @xmanrui/dsh-im', OK),), c.at(0, 2.8)),
    ]
    terminal(c.frame, 160, 150, 1600, 230, 'PowerShell', rows, t, c.at(0, 0.0), VIOLET)
    good = note_card('支持 0.2.2 → 载入', '插件宣告的 DSH 版本包含 0.2.2', GREEN, 760, 32)
    bad = note_card('只支持到 0.2.1 → 跳过', 'DSH 会检查版本，不兼容的插件不会载入', RED, 760, 32)
    put(c.frame, good, 160, 470, t, c.at(1, 1.4), 'left')
    put(c.frame, bad, 1000, 470, t, c.at(1, 1.8), 'right')
    put(c.frame, chip('装之前先看版本', AMBER, 40), 720, 760, t, c.at(1, 4.2), 'pop')


def d_check(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 5, '检查', t, 0.0, CYAN)
    names = ['life', 'self', 'recall', 'rd', 'integrate', 'thought', 'skill', 'plugin', 'panel']
    rows = [Row('cmd', (('& $dsh --profile pack-tw --dump-config', WHITE),), c.at(0, 0.6), 30)]
    rows += [Row('out', ((f'- id: temir-{n}', OK),), c.at(1, 2.2 + 0.18 * i)) for i, n in enumerate(names)]
    terminal(c.frame, 120, 130, 920, 700, 'PowerShell', rows, t, c.at(0, 0.0), CYAN, 30)
    nine = big_word('9 个', 130, GREEN)
    put(c.frame, nine, 1250, 210, t, c.at(1, 3.4), 'pop')
    life = note_card('第一次启动 = 诞生', r'C:\Users\你\.local\share\temir\life.db', GREEN, 700, 30)
    put(c.frame, life, 1100, 520, t, c.at(2, 1.6), 'right')


def d_origin(c: Ctx) -> None:
    t = c.t
    head = big_word('人设', 170, VIOLET)
    put(c.frame, head, (W - head.width) / 2, 260, t, c.at(0, 0.0), 'pop', 0.45, out_at=c.at(1, 0.0))
    a = big_word('人设 ≠ 固定的设定', 110, WHITE, VIOLET)
    put(c.frame, a, (W - a.width) / 2, 150, t, c.at(1, 0.0), 'pop', 0.45, out_at=c.at(1, 2.0))
    b = big_word('人设 = 起点', 130, CYAN)
    put(c.frame, b, (W - b.width) / 2, 150, t, c.at(1, 2.2), 'pop', 0.45, out_at=c.at(2, 0.0))
    steps = [('第 1 版', '初始人设', VIOLET), ('第 2 版', '相处之后', BLUE), ('第 3 版', '它自己改的', GREEN)]
    for i, (v, sub, col) in enumerate(steps):
        img = note_card(v, sub, col, 440, 34)
        x = 170 + i * 560
        put(c.frame, img, x, 450, t, c.at(2, 0.3 + 1.6 * i), 'up')
        if i > 0:
            arrow(c.frame, x - 110, 530, x - 20, 530, col, clamp((t - c.at(2, 0.1 + 1.6 * i)) / 0.3))


def d_file(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 6, '写人设', t, 0.0, VIOLET)
    path = chip(r'整合包\profiles\pack-tw\cordis.patch.yml', CYAN, 34)
    put(c.frame, path, 160, 140, t, c.at(0, 0.8), 'up')
    starts = [c.at(1, 0.0)] + [c.at(1, 0.5 + 0.25 * i) for i in range(3)] + [c.at(1, 1.6), c.at(1, 3.0), c.at(1, 3.4), c.at(1, 3.7), c.at(1, 4.6), c.at(1, 5.0)]
    hl = frozenset({4, 5, 8}) if c.t >= c.at(2, 0.0) else frozenset()
    editor(c.frame, 160, 230, 1600, 640, 'cordis.patch.yml', PERSONA_YAML, t, c.at(1, 0.0), starts, VIOLET, 30, hl)
    put(c.frame, chip('selfModel 必填，其他可省略', YELLOW, 34), 1060, 160, t, c.at(2, 0.4), 'pop')


def d_write(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 7, '怎么写', t, 0.0, AMBER)
    tips = [('第一人称', '我是……我喜欢……'), ('写成一段话', '怎么说话、在乎什么、小缺点'), ('不写数值', '性格要能长，数字长不出来')]
    for i, (a, b) in enumerate(tips):
        put(c.frame, note_card(a, b, AMBER if i < 2 else RED, 520, 32), 150 + i * 560, 130, t, c.at(0, 0.6 + 1.4 * i), 'up')
    ex = note_card('小满（例子）', '好奇心重，喜欢问到底；说话直接，但会先听完。容易太快下结论，所以会提醒自己多问一句。', VIOLET, 1000, 36)
    put(c.frame, ex, 150, 440, t, c.at(1, 0.4), 'left')
    stats = text_img('好奇 85\n直接 70\n耐心 60', 44, MUTED, 'Bold', align='left')
    box = card(stats.width + 80, stats.height + 50, RED).copy()
    box.alpha_composite(stats, (40, 22))
    put(c.frame, box, 1290, 430, t, c.at(2, 0.3), 'right')
    if t >= c.at(2, 1.4):
        p = clamp((t - c.at(2, 1.4)) / 0.3)
        d = ImageDraw.Draw(c.frame)
        x0, y0 = 1290, 430
        d.line((x0 + 10, y0 + 10, x0 + 10 + (box.width - 20) * p, y0 + 10 + (box.height - 20) * p), fill=RED + (255,), width=10)
        if p >= 1:
            d.line((x0 + box.width - 10, y0 + 10, x0 + 10, y0 + box.height - 10), fill=RED + (255,), width=10)


PANEL_SHOT = Path(__file__).resolve().parent / 'assets' / 'ep2-panel.png'


@lru_cache(maxsize=1)
def panel_window() -> Image.Image:
    """真實的面板截圖（scripts/video/assets/ep2-panel.png：測試用的生命套上「小满」的人設開機，Edge 無介面模式以 2 倍解析度截下 /temir/ 的上半部），加上瀏覽器的外框。"""
    shot = Image.open(PANEL_SHOT).convert('RGBA')
    w, h = shot.width + 40, shot.height + 64 + 20
    img = window(w, h, '', GREEN, 'edit').copy()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((140, 12, w - 40, 54), radius=20, fill=(14, 18, 36, 255))
    img.alpha_composite(code_line((('127.0.0.1:3097/temir/', OUT),), 28), (166, 18))
    img.alpha_composite(shot, (20, 64))
    return img


def d_apply(c: Ctx) -> None:
    t = c.t
    step_tag(c.frame, 8, '启动，看看它', t, 0.0, GREEN)
    save = note_card('存档 → 启动器里重新启动', '人设在这一次启动时写进去', GREEN, 860, 36)
    put(c.frame, save, (W - save.width) / 2, 360, t, c.at(0, 0.3), 'pop', 0.45, out_at=c.at(1, 0.0))
    win = panel_window()
    x, y = (W - win.width) / 2, 140
    put(c.frame, win, x, y, t, c.at(1, 0.0), 'up', 0.5)
    put(c.frame, chip('真实截图', GREEN, 30), x + win.width - 210, y - 52, t, c.at(1, 0.6), 'fade')
    if t >= c.at(1, 2.4):  # 框出「自我模型（第 1 版……初始人設……）」那一行（截圖中的位置）
        p = clamp((t - c.at(1, 2.4)) / 0.3)
        ImageDraw.Draw(c.frame).rounded_rectangle((x + 40, y + 64 + 222, x + 20 + 1010, y + 64 + 270), radius=10, outline=YELLOW + (int(255 * p),), width=5)


def d_notes(c: Ctx) -> None:
    t = c.t
    notes = [
        ('① 第一次说话之前改', '之后人设就是它自己的；想重来，换一个 TEMIR_HOME，就是新的生命', VIOLET),
        ('② 背景思考会用 API', '没人说话时它会想事情、整理自己；有对话之后才会发生', AMBER),
        ('③ 生命日志只能新增', r'记得备份 C:\Users\你\.local\share\temir', GREEN),
    ]
    head = big_word('三个提醒', 150, AMBER)
    put(c.frame, head, (W - head.width) / 2, 300, t, c.at(0, 0.0), 'pop', 0.45, out_at=c.at(1, 0.0))
    for i, (a, b, col) in enumerate(notes):
        put(c.frame, note_card(a, b, col, 1500, 34), 210, 120 + i * 230, t, c.at(i + 1, 0.2), 'left')


def d_cta(c: Ctx) -> None:
    t = c.t
    a = big_word('README 有完整步骤', 104, WHITE, BLUE)
    put(c.frame, a, (W - a.width) / 2, 200, t, c.at(0, 0.2), 'pop')
    gh = code_line((('github.com/win10ogod/temir', CYAN),), 64)
    put(c.frame, gh, (W - gh.width) / 2, 420, t, c.at(0, 1.0), 'up')
    b = big_word('点个星，下期见', 120, YELLOW)
    put(c.frame, b, (W - b.width) / 2, 580, t, c.at(1, 1.6), 'pop')


def scenes() -> list[Scene]:
    return [
        Scene('hook', ['上一期，我们讲了特密尔是什么。', '这一期【手把手】：把它装进 DSH 整合包，再给它一个【属于它自己的性格】。'], d_hook, BLUE, CYAN, 'intro', tail=1.2, sfx=[(0, 0.0, 'pop'), (1, 0.2, 'hit'), (1, 2.4, 'pop')]),
        Scene('need', ['开始之前，准备四样东西：', 'DSH 启动器和一个【0.2.2】的整合包，【Node.js 24】以上，DeepSeek 的 API 密钥，还有特密尔的代码。'], d_need, BLUE, GREEN, 'build', flash=True, sfx=[(1, 0.0, 'pop'), (1, 2.4, 'pop'), (1, 4.2, 'pop'), (1, 5.6, 'pop')]),
        Scene('code', ['第一步，拿代码：从 GitHub 克隆，或者直接下载 ZIP。', '我们只要里面的【individual】文件夹，把它放到一个【固定的位置】，比如 D 盘的 DSH 文件夹。', '放好之后就别再搬了，整合包会一直从这里读它。'], d_code, AMBER, BLUE, 'build', sfx=[(0, 0.6, 'type'), (1, 3.0, 'whoosh'), (2, 0.4, 'stamp')]),
        Scene('pack', ['第二步，找到你的整合包。', '启动器的整合包都放在 AppData 的 dsh-packs 里，每个文件夹的名字，就是那个包的【ID】。'], d_pack, BLUE, VIOLET, 'build', sfx=[(1, 0.0, 'whoosh'), (1, 2.9, 'pop')]),
        Scene('install', ['第三步，打开 PowerShell，先告诉 DSH 这个整合包在哪里。', '再用启动器自带的 dsh，把特密尔【加进整合包】。', '注意两个地方：参数【w】，因为整合包是一个工作区；还有【link】，因为特密尔是 TypeScript，放进 node_modules，Node 就不帮它去掉类型了。'], d_install, GREEN, CYAN, 'build', tail=1.4, sfx=[(0, 0.5, 'type'), (1, 0.2, 'type'), (1, 2.6, 'type'), (1, 5.0, 'ding'), (2, 0.6, 'pop'), (2, 3.4, 'pop')]),
        Scene('more', ['想用 Telegram 这类聊天软件跟它说话，就用同样的命令，加上 dsh-im。', '其他插件也一样。但 DSH 会检查版本：【不兼容的插件会被跳过】，装之前先看它支不支持 0.2.2。'], d_more, VIOLET, BLUE, 'build', sfx=[(0, 0.6, 'type'), (1, 1.4, 'pop'), (1, 1.8, 'stamp'), (1, 4.2, 'pop')]),
        Scene('check', ['第五步，装完先检查一次。', '用 dump-config 列出整合包组好的设置，看到 temir 开头的【九个插件】，就对了。', '然后从启动器打开它。第一次启动，它就在你的用户文件夹里【诞生】了。'], d_check, CYAN, GREEN, 'build', tail=1.3, sfx=[(1, 0.2, 'type'), (1, 3.4, 'ding'), (2, 1.6, 'stamp')]),
        Scene('origin', ['接下来是人设。', '先说清楚：人设【不是一套固定的设定】，而是它的【起点】。', '它只会被写成第一版的自我模型和人生故事；之后，它会在跟你相处的过程中，【自己改】。'], d_origin, VIOLET, CYAN, 'break', flash=True, tail=1.4, sfx=[(1, 0.0, 'boom'), (1, 2.2, 'hit'), (2, 0.3, 'pop'), (2, 1.9, 'pop'), (2, 3.5, 'pop')]),
        Scene('file', ['第六步，人设写在整合包 profile 文件夹里的 cordis.patch.yml。', '加上一段 temir-self：name 是名字，selfModel 是它对自己的描述，story 是它的故事。', 'selfModel【一定要有】，另外两个可以省略。'], d_file, VIOLET, BLUE, 'build', sfx=[(1, 0.0, 'whoosh'), (1, 1.6, 'type'), (1, 3.0, 'type'), (2, 0.4, 'pop')]),
        Scene('write', ['怎么写？用【第一人称】，写成一段话：它怎么说话、在乎什么、有什么小缺点。', '比如这一位：小满，好奇心重，说话直接，但会先听完；容易太快下结论，所以会提醒自己【多问一句】。', '不要写成数值或清单。性格要能变，【一堆固定的数字】是长不出来的。'], d_write, AMBER, VIOLET, 'build', tail=1.3, sfx=[(0, 0.6, 'pop'), (0, 2.0, 'pop'), (0, 3.4, 'pop'), (1, 0.4, 'whoosh'), (2, 1.4, 'stamp')]),
        Scene('apply', ['第八步，存档，从启动器重新打开。', '在网址后面加上 /temir，就能看到：自我模型，【第一版】，初始人设。'], d_apply, GREEN, CYAN, 'full', flash=True, tail=1.6, sfx=[(1, 0.2, 'type'), (1, 2.6, 'ding')]),
        Scene('notes', ['最后，三个提醒。', '一，人设只有在【第一次说话之前】改才有用；之后它就是它自己的了。想重来，换一个 TEMIR HOME，就是一个新的生命。', '二，没人说话时，它也会想事情、整理自己，这些会用到 API，但要【有对话之后】才会发生。', '三，生命日志【只能新增】，记得备份这个文件夹。'], d_notes, AMBER, VIOLET, 'build', tail=1.2, sfx=[(1, 0.2, 'pop'), (2, 0.2, 'pop'), (3, 0.2, 'pop')]),
        Scene('cta', ['完整的步骤，写在 GitHub 的 README 里。', '之后，我们再一起看它怎么在相处中改变自己。【点个星】，下期见。'], d_cta, BLUE, VIOLET, 'full', flash=True, brand=False, tail=2.6, sfx=[(0, 0.2, 'hit'), (1, 1.6, 'pop')]),
    ]


# ---------------------------------------------------------------------------------------------
# 封面、發布說明與主流程
# ---------------------------------------------------------------------------------------------


def cover(path: Path) -> None:
    frame = base.bg_base().copy()
    comp(frame, blob(BLUE), 1150, -350)
    comp(frame, blob(VIOLET), -300, 450)
    tag = chip('第 2 期 · 安装与人设', AMBER, 52)
    comp(frame, tag, (W - tag.width) / 2, 110)
    a = big_word('装好它', 190, WHITE, BLUE)
    b = big_word('再给它一个性格', 150, CYAN)
    comp(frame, a, (W - a.width) / 2, 270)
    comp(frame, b, (W - b.width) / 2, 540)
    sub = text_img('特密尔 · DeepSeek Harness 开源插件', 54, MUTED, 'Bold')
    comp(frame, sub, (W - sub.width) / 2, 830)
    frame.convert('RGB').save(path)


CHAPTER = {'hook': '开场', 'need': '准备', 'code': '第 1 步 拿到代码', 'pack': '第 2 步 找到整合包', 'install': '第 3 步 装进整合包', 'more': '第 4 步 其他插件', 'check': '第 5 步 检查', 'origin': '人设是起点', 'file': '第 6 步 写人设', 'write': '第 7 步 怎么写', 'apply': '第 8 步 启动，看看它', 'notes': '三个提醒', 'cta': '结尾'}


def publish(all_scenes: list[Scene], path: Path) -> None:
    lines, off = [], 0.0
    for s in all_scenes:
        m, sec = divmod(int(off), 60)
        lines.append(f'{m:02d}:{sec:02d} {CHAPTER[s.id]}')
        off += s.duration
    text = f"""标题（三选一）：
- 十分钟装好特密尔，再给它一个属于它的性格（DSH 整合包教程）
- 给你的 DeepSeek 智能体一个会自己长大的人设：特密尔安装与人设教程
- 特密尔第 2 期：装进 DSH 启动器整合包，设定初始人设

简介：
第 2 期是手把手教程：把特密尔装进 DeepSeek Harness（DSH）启动器的整合包，再给它一个初始人设。
- 需要：DSH 启动器与 0.2.2 的整合包、Node.js 24 以上、DeepSeek API 密钥、特密尔的代码；
- 安装：把 individual 文件夹放到固定位置，用启动器自带的 dsh 执行 plugin add，参数 -w，以 link: 指向那个文件夹；
- 人设：写在整合包 profiles 文件夹里的 cordis.patch.yml（temir-self 的 persona：name、selfModel、story）。
  它只会写成第一版的自我模型与人生故事，之后由它自己在相处中修改。
完整步骤见 README：https://github.com/win10ogod/temir （Apache-2.0）

章节：
{chr(10).join(lines)}

标签：DeepSeek, DeepSeek Harness, DSH, AI Agent, 智能体, 教程, 人设, 开源, TypeScript

说明：
- 配音：微软 Edge 神经语音 zh-CN-YunxiNeural（edge-tts 合成）。音乐与音效都是程序合成的。字体：Noto Sans SC（SIL OFL）、Consolas。
- 片中的命令与路径照实际安装过的步骤。面板是真实截图：测试用的生命套上片中的人设「小满」启动后，截下 /temir/ 页面。
"""
    path.write_text(text, encoding='utf-8')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--tts-python', default=str(Path.home() / '.cache/temir/tools/video-venv/bin/python3'))
    ap.add_argument('--preview', action='store_true', help='只輸出每一句旁白結束時的畫面')
    ap.add_argument('--jobs', type=int, default=6)
    args = ap.parse_args()
    out = Path(args.out)
    work = out / 'work'
    work.mkdir(parents=True, exist_ok=True)
    all_scenes = scenes()
    base.tts(all_scenes, work, args.tts_python)
    total = sum(s.duration for s in all_scenes)
    for s in all_scenes:
        print(f'  {s.id}: {s.duration:.1f}s，字幕 {len(s.subs)} 段', file=sys.stderr)
    print(f'  total {total:.1f}s', file=sys.stderr)
    cover(out / 'cover.png')
    publish(all_scenes, out / 'publish-zh-CN.txt')
    if args.preview:
        for s in all_scenes:
            for i in range(len(s.lines)):
                t = min(s.duration - 0.05, s.ends[i] - 0.3)
                base.render_frame(s, t, 0, total).save(out / f'preview-{s.id}-{i}.png')
        return
    offsets, o = [], 0.0
    for s in all_scenes:
        offsets.append(o)
        o += s.duration
    jobs = [(s, offsets[i], total, str(work / f'seg-{i:02d}-{s.id}.mp4')) for i, s in enumerate(all_scenes)]
    with Pool(args.jobs) as pool:
        segs = pool.map(base.render_scene, jobs)
    lst = work / 'segs.txt'
    lst.write_text(''.join(f"file '{p}'\n" for p in segs), encoding='utf-8')
    video = work / 'video.mp4'
    import subprocess

    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(video)], check=True)
    voice = work / 'voice.wav'
    vl = work / 'voice.txt'
    vl.write_text(''.join(f"file '{s.audio}'\n" for s in all_scenes), encoding='utf-8')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(vl), '-c', 'copy', str(voice)], check=True)
    mus, fx = work / 'music.wav', work / 'sfx.wav'
    base.music(all_scenes, mus)
    base.sfx(all_scenes, fx)
    final = out / 'temir-ep2-zh-CN.mp4'
    # 混音同第一期（s13 量過的配比）：音樂在旁白下方約 12 dB、音效約 7 dB，最後限幅在 −1.5 dBFS。
    filt = (
        '[1:a]aformat=channel_layouts=stereo,asplit=2[v1][v2];'
        '[2:a][v2]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=350[duck];'
        "[v1][duck][3:a]amix=inputs=3:duration=first:weights='1 0.22 0.30':normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false[a]"
    )
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-i', str(voice), '-i', str(mus), '-i', str(fx), '-filter_complex', filt, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', str(base.SR), '-ac', '2', '-movflags', '+faststart', str(final)], check=True)
    base.srt(all_scenes, out / 'temir-ep2-zh-CN.srt')
    print(f'{final}  {total:.1f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
