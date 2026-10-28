"""產生 DeepSeek Harness 套件清單（research/dsh/inventory.md）。

用法：python3 -I scripts/dsh_inventory.py references/deepseek-harness > research/dsh/inventory.md
只讀 package.json，不執行參考 repo 的任何程式。
"""
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

root = Path(sys.argv[1]).resolve()
rev = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
groups = defaultdict(list)
for pj in sorted(root.glob("**/package.json")):
    rel = pj.parent.relative_to(root)
    if "node_modules" in rel.parts or not rel.parts or rel.parts[0] not in ("packages", "apps"):
        continue
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        continue
    src = pj.parent / "src"
    loc = sum(1 for f in src.rglob("*.ts") if not f.name.endswith((".test.ts", ".d.ts"))
              for _ in f.open(encoding="utf-8", errors="ignore")) if src.is_dir() else 0
    group = "/".join(rel.parts[:2]) if rel.parts[0] == "packages" else "apps"
    desc = (data.get("description") or "").replace("|", "\\|").replace("\n", " ")
    groups[group].append((str(rel), data.get("name", ""), desc, loc))

total = sum(len(v) for v in groups.values())
print("# DeepSeek Harness 套件清單（自動產生）\n")
print(f"來源：`references/deepseek-harness@{rev[:8]}`，以 `scripts/dsh_inventory.py` 產生，請勿手改。")
print(f"共 {total} 個套件。LOC＝`src/` 下非測試 `.ts` 的行數。\n")
print("「本專案狀態」欄由 [`feature-matrix.md`](feature-matrix.md) 維護。\n")
for group in sorted(groups):
    rows = groups[group]
    print(f"## {group}（{len(rows)}）\n")
    print("| 路徑 | 套件名 | 說明 | LOC |\n|---|---|---|---|")
    for rel, name, desc, loc in rows:
        print(f"| `{rel}` | `{name}` | {desc} | {loc} |")
    print()
