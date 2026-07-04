#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""config/*.yaml → data/config.json（前端讀取用）。"""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def main():
    cfg = {}
    for name in ("watchlist", "settings", "phases", "checkpoints", "strategy", "playbook"):
        p = ROOT / "config" / f"{name}.yaml"
        cfg[name] = yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else None
    tp = ROOT / "config" / "targets.yaml"
    cfg["targets"] = (yaml.safe_load(tp.read_text(encoding="utf-8")) or {}).get("targets") \
        if tp.exists() else None
    hp = ROOT / "config" / "theses.yaml"
    cfg["theses"] = (yaml.safe_load(hp.read_text(encoding="utf-8")) or {}).get("theses") \
        if hp.exists() else None
    out = ROOT / "data" / "config.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(cfg, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"[config] → {out}")


if __name__ == "__main__":
    sys.exit(main())
