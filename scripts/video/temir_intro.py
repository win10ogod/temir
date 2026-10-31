#!/usr/bin/env python3
"""特密爾的簡體中文介紹影片（使用者 2026-10-31 要求）：旁白、字幕、動態圖卡，1920×1080、30fps。

流程：
1. 每一幕的旁白以 edge-tts（微軟的神經語音，需要網路；旁白是公開的介紹文字，不含機密）合成 mp3 與字幕時間；
2. 以 PIL 逐格繪製畫面（元素依旁白的句子依序淡入，字幕依句子切換，幕與幕之間交叉淡化）；
3. ffmpeg 合成 H.264＋AAC 的 mp4，另外輸出 srt 字幕。

用法：python3 scripts/video/temir_intro.py --out <輸出目錄> [--voice zh-CN-YunxiNeural] [--edge-tts <edge-tts 執行檔>]
影片內容裡的數字都來自 experiments/results/ 的報告（見 SCENES 的註解）；mp4 不進 git（.gitignore）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
FONT_PATH = os.environ.get('TEMIR_VIDEO_FONT', '/mnt/c/Windows/Fonts/NotoSansSC-VF.ttf')
MONO_PATH = os.environ.get('TEMIR_VIDEO_MONO', '/mnt/c/Windows/Fonts/consola.ttf')

BG_TOP = (9, 12, 28)
BG_BOTTOM = (16, 22, 48)
BLUE = (77, 107, 254)  # DeepSeek 的藍
CYAN = (56, 213, 230)
VIOLET = (155, 109, 255)
AMBER = (255, 184, 77)
GREEN = (84, 214, 140)
RED = (255, 107, 107)
WHITE = (240, 244, 255)
MUTED = (150, 162, 200)
CARD = (22, 30, 62)

_fonts: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}


def font(size: int, weight: str = 'Regular') -> ImageFont.FreeTypeFont:
    key = (size, weight)
    if key not in _fonts:
        f = ImageFont.truetype(FONT_PATH, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fonts[key] = f
    return _fonts[key]


def mono(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(MONO_PATH, size)
    except OSError:
        return font(size, 'Medium')


# ---------------------------------------------------------------------------------------------
# 元素：先畫成 RGBA 圖層（只畫一次），每一格只做淡入與位移的合成
# ---------------------------------------------------------------------------------------------


@dataclass
class Element:
    image: Image.Image
    x: int
    y: int
    #: 第幾句旁白開始時出現（0＝這一幕一開始）
    at: int = 0
    delay: float = 0.0
    #: 數字的計數動畫（count-up）：(起, 迄, 繪製函式)
    counter: tuple | None = None


#: 不放在行首的標點（避頭）：超出一點寬度也留在上一行。
NO_START = set('、，。；：！？」』）》…,.;:!?)')


def wrap(text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for para in text.split('\n'):
        cur = ''
        for ch in para:
            if f.getlength(cur + ch) > width and cur and ch not in NO_START:
                lines.append(cur)
                cur = ch.lstrip() if ch == ' ' else ch
            else:
                cur += ch
        lines.append(cur)
    return lines


def text_layer(text: str, size: int, color=WHITE, weight='Regular', width: int | None = None, spacing: float = 1.35, align='left') -> Image.Image:
    f = font(size, weight)
    lines = wrap(text, f, width) if width else text.split('\n')
    lh = int(size * spacing)
    w = int(max(f.getlength(l) for l in lines)) + 8
    img = Image.new('RGBA', (width or w, lh * len(lines) + int(size * 0.3)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        lw = f.getlength(l)
        x = 0 if align == 'left' else ((width or w) - lw) / 2 if align == 'center' else (width or w) - lw
        d.text((x, i * lh), l, font=f, fill=color)
    return img


def rich_layer(spans: list[tuple[str, tuple, str]], size: int) -> Image.Image:
    """一行多色文字：[(文字, 顏色, 字重)]。"""
    widths = [font(size, w).getlength(t) for t, _, w in spans]
    img = Image.new('RGBA', (int(sum(widths)) + 10, int(size * 1.4)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 0.0
    for (t, c, w), wd in zip(spans, widths):
        d.text((x, 0), t, font=font(size, w), fill=c)
        x += wd
    return img


def glow(img: Image.Image, color, radius=18, strength=0.55) -> Image.Image:
    pad = radius * 3
    base = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    alpha = img.split()[3]
    shadow = Image.new('RGBA', img.size, color + (0,))
    shadow.putalpha(alpha.point(lambda a: int(a * strength)))
    base.alpha_composite(shadow, (pad, pad))
    base = base.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(img, (pad, pad))
    return base


def card_layer(w: int, h: int, title: str, body: str = '', accent=BLUE, tag: str = '', title_size=40, body_size=30, icon: str = '') -> Image.Image:
    accent = tuple(accent)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=26, fill=CARD + (235,), outline=accent + (200,), width=3)
    d.rounded_rectangle((0, 0, 10, h - 1), radius=5, fill=accent + (255,))
    x = 40
    y = 30
    if tag:
        tf = mono(24) if tag.isascii() else font(24, 'Medium')
        tw = tf.getlength(tag) + 28
        d.rounded_rectangle((x, y, x + tw, y + 40), radius=20, fill=accent + (60,), outline=accent + (180,), width=2)
        d.text((x + 14, y + 6), tag, font=tf, fill=accent)
        y += 58
    if icon:
        d.text((x, y), icon, font=font(title_size, 'Bold'), fill=accent)
        x2 = x + font(title_size, 'Bold').getlength(icon) + 14
    else:
        x2 = x
    d.text((x2, y), title, font=font(title_size, 'Bold'), fill=WHITE)
    y += int(title_size * 1.45)
    if body:
        for i, line in enumerate(wrap(body, font(body_size), w - 80)):
            d.text((40, y + i * int(body_size * 1.45)), line, font=font(body_size), fill=MUTED)
    return img


def chip_layer(text: str, color=BLUE, size=30) -> Image.Image:
    f = font(size, 'Medium')
    w = int(f.getlength(text)) + 48
    h = int(size * 1.9)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=color + (45,), outline=color + (210,), width=2)
    d.text((24, (h - size * 1.3) / 2), text, font=f, fill=WHITE)
    return img


def arrow_layer(length: int, color=MUTED, vertical=False, width=5) -> Image.Image:
    w, h = (40, length) if vertical else (length, 40)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if vertical:
        d.line((20, 0, 20, h - 16), fill=color + (230,), width=width)
        d.polygon([(6, h - 20), (34, h - 20), (20, h)], fill=color + (230,))
    else:
        d.line((0, 20, w - 16, 20), fill=color + (230,), width=width)
        d.polygon([(w - 20, 6), (w - 20, 34), (w, 20)], fill=color + (230,))
    return img


def stat_layer(value: str, label: str, color=CYAN, sub: str = '') -> Image.Image:
    color = tuple(color)
    img = Image.new('RGBA', (520, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, 519, 299), radius=28, fill=CARD + (230,), outline=color + (160,), width=3)
    vf = font(108, 'Black')
    d.text(((520 - vf.getlength(value)) / 2, 30), value, font=vf, fill=color)
    lf = font(32, 'Medium')
    d.text(((520 - lf.getlength(label)) / 2, 180), label, font=lf, fill=WHITE)
    if sub:
        sf = font(24)
        d.text(((520 - sf.getlength(sub)) / 2, 232), sub, font=sf, fill=MUTED)
    return img


# ---------------------------------------------------------------------------------------------
# 背景
# ---------------------------------------------------------------------------------------------


def background(accent=BLUE, accent2=VIOLET) -> Image.Image:
    img = Image.new('RGB', (W, H))
    top, bottom = BG_TOP, BG_BOTTOM
    grad = Image.new('RGB', (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    img = grad.resize((W, H)).convert('RGBA')
    # 兩團柔光
    for (cx, cy, r, c, a) in [(W * 0.82, H * 0.18, 520, accent, 70), (W * 0.12, H * 0.9, 600, accent2, 55)]:
        g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse((cx - r, cy - r, cx + r, cy + r), fill=c + (a,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(160)))
    # 細格線
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 80):
        gd.line((x, 0, x, H), fill=(120, 140, 220, 14))
    for y in range(0, H, 80):
        gd.line((0, y, W, y), fill=(120, 140, 220, 14))
    img.alpha_composite(grid)
    # 品牌與頁尾
    d = ImageDraw.Draw(img)
    d.text((64, 44), '特密尔 temir', font=font(30, 'Bold'), fill=WHITE + (230,))
    d.text((64 + font(30, 'Bold').getlength('特密尔 temir') + 18, 50), 'DeepSeek Harness 插件 · 开源研究项目', font=font(24), fill=MUTED + (220,))
    gh = 'github.com/win10ogod/temir'
    d.text((W - 64 - mono(26).getlength(gh), 48), gh, font=mono(26), fill=MUTED + (220,))
    return img


# ---------------------------------------------------------------------------------------------
# 幕
# ---------------------------------------------------------------------------------------------


@dataclass
class Scene:
    id: str
    narration: list[str]
    build: callable
    accent: tuple = BLUE
    accent2: tuple = VIOLET
    elements: list[Element] = field(default_factory=list)
    cues: list[tuple[float, float, str]] = field(default_factory=list)
    duration: float = 0.0
    audio: Path | None = None


def center_x(img: Image.Image) -> int:
    return (W - img.width) // 2


def s_title(s: Scene) -> None:
    t = glow(text_layer('特密尔', 190, WHITE, 'Black'), BLUE, 30, 0.7)
    s.elements.append(Element(t, center_x(t), 170))
    sub = text_layer('让 DeepSeek Harness 长出「自己」', 64, CYAN, 'Bold')
    s.elements.append(Element(sub, center_x(sub), 545, at=0, delay=0.6))
    line = text_layer('持续经历 · 记住 · 思考 · 改变自己', 40, MUTED, 'Medium')
    s.elements.append(Element(line, center_x(line), 650, at=1))
    chips = [chip_layer(t, c) for t, c in [('DSH 插件 bundle', BLUE), ('TypeScript', CYAN), ('Apache-2.0 开源', GREEN), ('不 fork DSH', VIOLET)]]
    total = sum(c.width for c in chips) + 28 * (len(chips) - 1)
    x = (W - total) // 2
    for i, c in enumerate(chips):
        s.elements.append(Element(c, x, 760, at=1, delay=0.25 * i + 0.5))
        x += c.width + 28


def s_problem(s: Scene) -> None:
    h = text_layer('智能体很聪明，但它没有「一生」', 64, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 150))
    left = card_layer(760, 470, '一般的智能体', '', RED, 'stateless')
    d = ImageDraw.Draw(left)
    for i, t in enumerate(['每次对话都从零开始', '记忆靠写进外部文件', '行为由固定的提示决定', '经验不会改变它']):
        d.text((48, 170 + i * 68), '×  ' + t, font=font(34), fill=MUTED)
    right = card_layer(760, 470, '特密尔个体', '', GREEN, 'a life')
    d = ImageDraw.Draw(right)
    for i, t in enumerate(['连续的生命日志', '自己的记忆、看法与人生叙事', '先思考、再扣除、才行动', '在经历中修订自己']):
        d.text((48, 170 + i * 68), '✓  ' + t, font=font(34), fill=WHITE)
    s.elements.append(Element(left, 160, 300, at=0, delay=0.4))
    s.elements.append(Element(right, 1000, 300, at=2))


def s_arch(s: Scene) -> None:
    h = text_layer('不改 DSH 一行代码：一组插件挂上去', 60, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 140))
    core = Image.new('RGBA', (520, 150), (0, 0, 0, 0))
    d = ImageDraw.Draw(core)
    d.rounded_rectangle((0, 0, 519, 149), radius=30, fill=BLUE + (70,), outline=BLUE + (255,), width=4)
    t = 'DeepSeek Harness'
    d.text(((520 - font(46, 'Bold').getlength(t)) / 2, 22), t, font=font(46, 'Bold'), fill=WHITE)
    t2 = '身体：模型、工具、会话'
    d.text(((520 - font(28).getlength(t2)) / 2, 90), t2, font=font(28), fill=MUTED)
    core = glow(core, BLUE, 26, 0.5)
    s.elements.append(Element(core, center_x(core), 520 - core.height // 2 + 40, at=0, delay=0.3))
    plugins = [
        ('temir-life', '只增不改的生命日志', CYAN),
        ('temir-self', '处境、自我模型、叙事', VIOLET),
        ('temir-recall', '每一步自动回忆', GREEN),
        ('temir-rd', '思考与扣除（RD）', AMBER),
        ('temir-integrate', '整合期与做法闸门', BLUE),
        ('thought', '闲置时的念头', RED),
    ]
    pos = [(150, 300), (150, 520), (150, 740), (1290, 300), (1290, 520), (1290, 740)]
    for i, ((name, desc, c), (x, y)) in enumerate(zip(plugins, pos)):
        card = card_layer(480, 170, desc, '', c, name, title_size=34)
        s.elements.append(Element(card, x, y, at=1 if i < 3 else 1, delay=0.35 * i))
    note = text_layer('记忆、自我模型、人生叙事\n都是生命日志的投影', 34, CYAN, 'Medium', align='center')
    s.elements.append(Element(note, center_x(note), 720, at=2))


def s_pc(s: Scene) -> None:
    eq = glow(rich_layer([('PC', CYAN, 'Black'), (' = ', WHITE, 'Bold'), ('ST', VIOLET, 'Black'), (' + ', WHITE, 'Bold'), ('E', GREEN, 'Black'), (' − ', WHITE, 'Bold'), ('RD', AMBER, 'Black'), (' = ', WHITE, 'Bold'), ('A', RED, 'Black')], 150), BLUE, 24, 0.4)
    s.elements.append(Element(eq, center_x(eq), 140))
    labels = rich_layer([('人格', CYAN, 'Bold'), ('   =   ', MUTED, 'Regular'), ('思考', VIOLET, 'Bold'), ('   +   ', MUTED, 'Regular'), ('经验', GREEN, 'Bold'), ('   −   ', MUTED, 'Regular'), ('扣除', AMBER, 'Bold'), ('   =   ', MUTED, 'Regular'), ('行动', RED, 'Bold')], 46)
    s.elements.append(Element(labels, center_x(labels), 380, delay=0.6))
    steps = [('对方说话', WHITE), ('想出几个做法\n预测后果', VIOLET), ('依据经验\n扣除不该做的', AMBER), ('行动', RED), ('事后比对\n预测成真了吗', GREEN)]
    x = 110
    for i, (t, c) in enumerate(steps):
        box = Image.new('RGBA', (280, 190), (0, 0, 0, 0))
        d = ImageDraw.Draw(box)
        d.rounded_rectangle((0, 0, 279, 189), radius=24, fill=CARD + (235,), outline=c + (220,), width=3)
        lines = t.split('\n')
        for j, l in enumerate(lines):
            f = font(34 if j == 0 else 28, 'Bold' if j == 0 else 'Regular')
            yy = 95 - len(lines) * 24 + j * 52
            d.text(((280 - f.getlength(l)) / 2, yy), l, font=f, fill=c if j == 0 else MUTED)
        at = 1 if i < 3 else 2 if i == 3 else 3
        s.elements.append(Element(box, x, 600, at=at, delay=0.3 * (i % 3)))
        if i < len(steps) - 1:
            s.elements.append(Element(arrow_layer(70, MUTED), x + 290, 675, at=at, delay=0.3 * (i % 3) + 0.2))
        x += 360


def s_integrate(s: Scene) -> None:
    h = text_layer('没人说话的时候，它在整理自己', 60, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 150))
    cards = [
        ('整合期', '整理教训、重新评价过去的经历、修订自我模型与人生叙事、目标和看法', BLUE, 'integrate'),
        ('两项判准缺一不可', '稳定性：和在乎的事连贯\n适应性：回应这段经历', GREEN, 'stability + adaptability'),
        ('闲置时的念头', '浮上心头的目标与悬着的事；想通了就放下，想说的留到下次', VIOLET, 'thought'),
    ]
    for i, (t, b, c, tag) in enumerate(cards):
        s.elements.append(Element(card_layer(500, 400, t, b, c, tag, title_size=42, body_size=34), 140 + i * 560, 330, at=min(i, 2), delay=0.3))


def s_procedures(s: Scene) -> None:
    h = text_layer('连「怎么想」都属于它自己', 64, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 140))
    chips = [chip_layer(t, c, 34) for t, c in [('思考', VIOLET), ('扣除', AMBER), ('比对', GREEN), ('整合', BLUE), ('念头', RED)]]
    total = sum(c.width for c in chips) + 30 * 4
    x = (W - total) // 2
    for i, c in enumerate(chips):
        s.elements.append(Element(c, x, 260, delay=0.2 * i + 0.3))
        x += c.width + 30
    sub = text_layer('第一版由创造者写，之后由个体在整合时提出修改', 38, MUTED, 'Medium')
    s.elements.append(Element(sub, center_x(sub), 370, at=1))
    flow = [('提案', '个体写出新版本', BLUE), ('探测', '过去的真实处境\n现行做法 ×2（噪声）\n新做法 ×1', CYAN), ('判断', '差异是否大于\n现行两次之间的差异', AMBER), ('采用 / 修改 / 不采用', '每个理由都要指出处境', GREEN)]
    x = 120
    for i, (t, b, c) in enumerate(flow):
        card = card_layer(380, 330, t, b, c, f'step {i + 1}', title_size=38, body_size=28)
        s.elements.append(Element(card, x, 500, at=2 if i < 2 else 3, delay=0.35 * (i % 2)))
        if i < 3:
            s.elements.append(Element(arrow_layer(60, c), x + 390, 645, at=2 if i < 1 else 3, delay=0.35 * (i % 2) + 0.2))
        x += 450


# 以下兩幕的數字在實驗完成後填入（procedures-v1、procedures-v2、v3 的報告）。
RESULTS: dict = {}


def s_results(s: Scene) -> None:
    h = text_layer('三个个体，三种不同的成长', 60, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 140))
    for i, (who, rule, change, c) in enumerate(RESULTS['individuals']):
        card = card_layer(520, 440, who, '', c, rule, title_size=42)
        d = ImageDraw.Draw(card)
        for j, line in enumerate(wrap('「' + change + '」', font(34), 440)):
            d.text((40, 200 + j * 54), line, font=font(34), fill=WHITE)
        s.elements.append(Element(card, 130 + i * 570, 300, at=1 + (i > 0), delay=0.3 * i))


def s_replicate(s: Scene) -> None:
    h = text_layer(RESULTS['replicate_title'], 58, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 150))
    for i, (value, label, sub, c) in enumerate(RESULTS['replicate_stats']):
        st = stat_layer(value, label, c, sub)
        s.elements.append(Element(st, 170 + i * 560, 300, at=min(i + 1, len(s.narration) - 1), delay=0.2))
    note = text_layer(RESULTS['replicate_note'], 34, MUTED, 'Medium', width=1600, align='center')
    s.elements.append(Element(note, center_x(note), 660, at=len(s.narration) - 1))


def s_numbers(s: Scene) -> None:
    h = text_layer('预先登记的实验（v3，全新题目，DeepSeek）', 54, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 150))
    stats = [('39/39', '人格连续性', '原始 DSH：6/39', CYAN), ('40/44', '记忆准确率', '原始 DSH：32/44', GREEN), ('10/10', '回想自己说过的话', '原始 DSH：0/10', AMBER)]
    for i, (v, l, sub, c) in enumerate(stats):
        s.elements.append(Element(stat_layer(v, l, c, sub), 170 + i * 560, 330, at=i if i < 2 else 2, delay=0.2))
    note = text_layer('记忆这一项没有达到预先登记的门槛：原始 DSH 会自己写 AGENTS.md 当记忆。失败也照实写。', 34, MUTED, 'Medium', width=1600, align='center')
    s.elements.append(Element(note, center_x(note), 720, at=len(s.narration) - 1))


def s_honest(s: Scene) -> None:
    h = text_layer('研究项目，不是成品', 64, WHITE, 'Bold')
    s.elements.append(Element(h, center_x(h), 150))
    items = [('证据优先', '每个算法都追到论文或代码的出处', BLUE), ('预先登记', '判准在看结果之前写定', CYAN), ('没跑过就写「未验证」', '端到端一律用真实的 DeepSeek API', AMBER), ('失败照实写', RESULTS['honest_example'], GREEN)]
    for i, (t, b, c) in enumerate(items):
        row = card_layer(1400, 124, t, b, c, title_size=36, body_size=28)
        s.elements.append(Element(row, center_x(row), 270 + i * 140, at=min(i, len(s.narration) - 1), delay=0.25 * (i % 2)))


def s_cta(s: Scene) -> None:
    t = glow(text_layer('github.com/win10ogod/temir', 86, WHITE, 'Bold'), BLUE, 28, 0.6)
    s.elements.append(Element(t, center_x(t), 300))
    sub = text_layer('用 DeepSeek 就能跑 · Apache-2.0', 46, CYAN, 'Medium')
    s.elements.append(Element(sub, center_x(sub), 575, delay=0.5))
    q = text_layer('一个人工个体，能自我演化到哪里？', 54, WHITE, 'Bold')
    s.elements.append(Element(q, center_x(q), 690, at=1))
    star = chip_layer('★ 欢迎来点个星', AMBER, 40)
    s.elements.append(Element(star, center_x(star), 800, at=1, delay=0.6))


SCENES: list[Scene] = []


def scenes() -> list[Scene]:
    return [
        Scene('title', ['如果 DeepSeek 的智能体，不只是帮你写代码，', '而是能持续经历、记住、思考，还会改变自己，会怎么样？这就是特密尔。'], s_title),
        Scene('problem', ['今天的智能体很聪明，但每次对话都从零开始。', '它没有经历，也不会因为经验而改变。', '特密尔想研究的是：一个人工个体，能不能形成自己的人格，并且和智能一起演化。'], s_problem, RED, GREEN),
        Scene('arch', ['它不 fork DeepSeek Harness，而是用一组插件挂上去。', '生命日志、自我、回忆、思考与扣除、整合，还有闲置时的念头。', '所有经历都写进一份只增不改的生命日志，记忆和人生叙事都是从日志投影出来的。'], s_arch),
        Scene('pc', ['它的核心是一条公式：人格等于思考，加上经验，减去扣除，等于行动。', '对方说话之后，它在自己的回合里先想出几个做法，预测各自的后果；', '再依据过去的经验，扣除不该做的，剩下的才成为行动。', '下一回合，它会回头比对：当时的预测，和实际发生的一样吗？'], s_pc, VIOLET, AMBER),
        Scene('integrate', ['没人说话的时候，它会整合自己：整理教训、重新评价过去的经历、修订自我模型和人生叙事。', '每一次修订，都要同时说明稳定性和适应性。', '闲置时它也会浮现念头，把想说的话留到下一次。'], s_integrate, GREEN, BLUE),
        Scene('procedures', ['最有意思的是：连它思考、扣除、比对、整合和念头的做法，都属于它自己。', '第一版由创造者写，之后个体可以在整合时提出修改。', '修改不会直接生效：先在过去真实的处境里，用现行做法跑两次当作噪声，再用新做法跑一次；', '只有差异大于噪声，个体才会采用。'], s_procedures, CYAN, AMBER),
        Scene('results', RESULTS['results_narration'], s_results, VIOLET, CYAN),
        Scene('replicate', RESULTS['replicate_narration'], s_replicate, AMBER, BLUE),
        Scene('numbers', ['在预先登记、全新题目的实验里，个体的人格连续性是 39 比 39，原始 DSH 只有 6。', '记忆准确率是 44 题答对 40 题。', '不过记忆这一项没有达到预先登记的门槛，因为原始 DSH 也会自己写文件当记忆。失败，我们也照实写。'], s_numbers, CYAN, GREEN),
        Scene('honest', RESULTS['honest_narration'], s_honest, BLUE, GREEN),
        Scene('cta', ['特密尔已经在 GitHub 开源，用 DeepSeek 就能跑。', '一个人工个体，能自我演化到哪里？欢迎来点个星，一起看下去。'], s_cta),
    ]


# ---------------------------------------------------------------------------------------------
# 配音
# ---------------------------------------------------------------------------------------------


def vtt_cues(path: Path) -> list[tuple[float, float, str]]:
    def secs(t: str) -> float:
        h, m, s = t.replace(',', '.').split(':')
        return int(h) * 3600 + int(m) * 60 + float(s)

    cues = []
    blocks = re.split(r'\n\s*\n', path.read_text(encoding='utf-8'))
    for b in blocks:
        m = re.search(r'(\d+:\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+)\s*\n(.+)', b, re.S)
        if m:
            cues.append((secs(m.group(1)), secs(m.group(2)), m.group(3).strip().replace('\n', '')))
    return cues


def duration(path: Path) -> float:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def synthesize(s: Scene, work: Path, edge: str, voice: str, rate: str) -> None:
    """每一句分開合成，句子的時間就是字幕與元素出現的時間（不依賴 edge-tts 的斷句）。"""
    parts = []
    t = 0.0
    for i, sentence in enumerate(s.narration):
        tag = hashlib.sha256(f'{voice}|{rate}|{sentence}'.encode()).hexdigest()[:12]
        mp3 = work / f'{s.id}-{i}-{tag}.mp3'
        if not mp3.exists():
            subprocess.run([edge, '--voice', voice, f'--rate={rate}', '--text', sentence, '--write-media', str(mp3)], check=True, capture_output=True)
        d = duration(mp3)
        s.cues.append((t, t + d, sentence))
        parts.append(mp3)
        t += d + 0.28
    lead = 0.5
    s.cues = [(a + lead, b + lead, x) for a, b, x in s.cues]
    s.duration = s.cues[-1][1] + 1.1
    # 一幕的音軌：開頭 lead 秒的靜音，每句之間 0.28 秒
    wav = work / f'{s.id}.wav'
    inputs = []
    filt = []
    for i, p in enumerate(parts):
        inputs += ['-i', str(p)]
        filt.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=0.28[a{i}]')
    concat = ''.join(f'[a{i}]' for i in range(len(parts)))
    filt.append(f'{concat}concat=n={len(parts)}:v=0:a=1,adelay={int(lead * 1000)},apad=whole_dur={s.duration:.3f}[out]')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(filt), '-map', '[out]', '-ar', '48000', '-ac', '1', str(wav)], check=True)
    s.audio = wav


# ---------------------------------------------------------------------------------------------
# 繪製
# ---------------------------------------------------------------------------------------------


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def subtitle(img: Image.Image, text: str, alpha: float) -> None:
    if not text or alpha <= 0:
        return
    f = font(40, 'Medium')
    lines = wrap(text, f, 1500)
    lh = 58
    h = lh * len(lines) + 30
    w = int(max(f.getlength(l) for l in lines)) + 80
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=22, fill=(5, 8, 20, int(185 * alpha)))
    for i, l in enumerate(lines):
        d.text(((w - f.getlength(l)) / 2, 12 + i * lh), l, font=f, fill=WHITE + (int(255 * alpha),))
    img.alpha_composite(layer, ((W - w) // 2, H - 60 - h))


def render(all_scenes: list[Scene], work: Path, out: Path) -> None:
    total = sum(s.duration for s in all_scenes)
    frames_total = int(total * FPS)
    ff = subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', str(out)],
        stdin=subprocess.PIPE,
    )
    assert ff.stdin
    fade = 0.45
    done = 0
    prev_last: Image.Image | None = None
    for s in all_scenes:
        bg = background(s.accent, s.accent2)
        starts = [s.cues[e.at][0] if e.at < len(s.cues) else 0.0 for e in s.elements]
        n = int(round(s.duration * FPS))
        settled: Image.Image | None = None
        for k in range(n):
            t = k / FPS
            if settled is None:
                frame = bg.copy()
                moving = False
                for e, st in zip(s.elements, starts):
                    p = (t - st - e.delay) / 0.55
                    if p <= 0:
                        moving = True
                        continue
                    a = ease(p)
                    if a < 1:
                        moving = True
                    layer = e.image
                    if a < 1:
                        layer = e.image.copy()
                        layer.putalpha(layer.split()[3].point(lambda v, a=a: int(v * a)))
                    frame.alpha_composite(layer, (e.x, e.y + int(28 * (1 - a))))
                if not moving:
                    settled = frame
            else:
                frame = settled.copy()
            # 字幕
            cur = next(((a, b, x) for a, b, x in s.cues if a - 0.05 <= t <= b + 0.25), None)
            if cur:
                sa = min(1.0, (t - cur[0] + 0.05) / 0.2, (cur[1] + 0.25 - t) / 0.2)
                subtitle(frame, cur[2], max(0.0, sa))
            # 進度條
            d = ImageDraw.Draw(frame)
            prog = (done + k) / frames_total
            d.rectangle((0, H - 6, int(W * prog), H), fill=s.accent + (255,))
            rgb = frame.convert('RGB')
            if prev_last is not None and t < fade:
                rgb = Image.blend(prev_last, rgb, ease(t / fade))
            ff.stdin.write(rgb.tobytes())
            if k == n - 1:
                prev_last = rgb
        done += n
        print(f'  {s.id}: {s.duration:.1f}s', file=sys.stderr)
    ff.stdin.close()
    ff.wait()


def srt(all_scenes: list[Scene], path: Path) -> None:
    def ts(x: float) -> str:
        ms = int(round(x * 1000))
        return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

    lines = []
    offset = 0.0
    i = 1
    for s in all_scenes:
        for a, b, x in s.cues:
            lines += [str(i), f'{ts(offset + a)} --> {ts(offset + b)}', x, '']
            i += 1
        offset += s.duration
    path.write_text('\n'.join(lines), encoding='utf-8')


def bgm(total: float, path: Path) -> None:
    """很輕的環境音墊（和弦的正弦波，緩慢起伏），音量遠低於旁白。"""
    notes = [220.0, 277.18, 329.63, 440.0, 164.81]
    expr = '+'.join(f'{0.16 / (i + 1):.3f}*sin(2*PI*{f}*t)*(0.6+0.4*sin(2*PI*{0.05 + 0.02 * i:.2f}*t))' for i, f in enumerate(notes))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'aevalsrc={expr}:s=48000:d={total:.2f}', '-af', f'lowpass=f=1800,volume=0.22,afade=t=in:d=3,afade=t=out:st={max(0.0, total - 4):.2f}:d=4', '-ac', '1', str(path)], check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--voice', default='zh-CN-YunxiNeural')
    ap.add_argument('--rate', default='+4%')
    ap.add_argument('--edge-tts', default='edge-tts')
    ap.add_argument('--results', default=str(Path(__file__).with_name('results-zh-CN.json')), help='影片中實驗結果的文字（JSON；數字來自 procedures-v1、procedures-v2、context-v2 的報告）')
    ap.add_argument('--preview', action='store_true', help='只輸出每一幕最後一格的圖')
    args = ap.parse_args()
    out = Path(args.out)
    work = out / 'work'
    work.mkdir(parents=True, exist_ok=True)
    RESULTS.update(json.loads(Path(args.results).read_text(encoding='utf-8')))
    all_scenes = scenes()
    for s in all_scenes:
        s.build(s)
        synthesize(s, work, args.edge_tts, args.voice, args.rate)
    # 封面：標題幕的元素，不含字幕
    title = all_scenes[0]
    cover = background(title.accent, title.accent2)
    for e in title.elements:
        cover.alpha_composite(e.image, (e.x, e.y))
    cover.convert('RGB').save(out / 'cover.png')
    if args.preview:
        for s in all_scenes:
            frame = background(s.accent, s.accent2)
            for e in s.elements:
                frame.alpha_composite(e.image, (e.x, e.y))
            subtitle(frame, s.narration[-1], 1.0)
            frame.convert('RGB').save(out / f'preview-{s.id}.png')
        return
    total = sum(s.duration for s in all_scenes)
    silent = work / 'video.mp4'
    render(all_scenes, work, silent)
    voice = work / 'voice.wav'
    lst = work / 'voice.txt'
    lst.write_text(''.join(f"file '{s.audio}'\n" for s in all_scenes), encoding='utf-8')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(voice)], check=True)
    music = work / 'bgm.wav'
    bgm(total, music)
    final = out / 'temir-intro-zh-CN.mp4'
    subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-i', str(silent), '-i', str(voice), '-i', str(music), '-filter_complex', '[1:a][2:a]amix=inputs=2:duration=first:weights=1 0.5:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', str(final)],
        check=True,
    )
    srt(all_scenes, out / 'temir-intro-zh-CN.srt')
    print(f'{final}  {total:.1f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
