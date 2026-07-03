# 策略操作台 Pro（strategy-cockpit-pro）

均線倉位紀律 × 供應鏈論述追蹤的個人投資策略監控系統。每日自動抓行情 → 判定操作制度 → 產出每檔標的的現股/融資/LEAPS 部位建議、限價與預期報酬，含蒙地卡羅情境模擬。純靜態 PWA，零維運成本。

> 本工具僅供個人紀律管理，**非投資建議**。不下單、不連券商、不儲存帳密。

## 架構

```
GitHub Actions（cron 抓價）→ data/*.json（commit 回 repo）→ GitHub Pages PWA
                                                          ↘ 本機模式（make run-local）
```

- `fetch.py` — 行情抓取（yfinance 主源；Stooq / TWSE / TPEx / frankfurter 備援；3 次重試指數退避；缺料絕不沿用舊價）
- `engine.py` — 規則引擎（制度判定、修飾規則、限價、換算）；`web/src/engine.js` 為其 JS 鏡像
- `config/*.yaml` — 觀察清單、四階段配置、目標價、檢查點、參數
- `web/` — Vite + Preact PWA（五分頁：今日/配置/下單/情境/追蹤）
- 使用者狀態（本金、淨值、持倉、檢查點）存瀏覽器 IndexedDB，「追蹤」頁可 JSON 匯出/匯入跨裝置同步

## 快速開始（本機模式）

```bash
make init                 # pip + npm 依賴
python fetch.py --init-targets   # 抓真實行情 + 以現價生成 targets.yaml 初始值
make run-local            # → http://localhost:8899
```

沒網路或想先看介面：`make fixture` 用假資料（前端會顯示「樣本資料」徽章）。
開發熱更新：`make dev`。

> 注意：目前 repo 內附的 `data/latest.json` 與 `config/targets.yaml` 是**建置時的樣本/佔位值**（建置環境無法連外抓價）。第一次使用請務必執行 `python fetch.py --force-targets` 以真實現價重生目標價。

## GitHub Pages 部署

1. 推到 GitHub（repo 任意名稱，main 分支）。
2. Settings → Pages → Source 選 **GitHub Actions**。
3. Actions 分頁手動跑一次 `daily-fetch`（會抓價、commit data、觸發 deploy）。
4. 之後每日台北 06:30 / 14:30 自動更新。手機開 Pages 網址 → 加入主畫面即為 App。

## 常見維護

- **改觀察清單**：編輯 `config/watchlist.yaml`（Yahoo 代碼），下次 fetch 生效。新標的記得在 `config/targets.yaml` 補目標價（或 `--force-targets` 全部重生——會覆蓋你手動改過的值，慎用）。
- **改個股論述（買進時點/理由/上檔）**：`config/theses.yaml`，下單頁每張卡的折疊區塊。
- **改目標價**：直接編輯 `config/targets.yaml` 的 bear/base/bull；`thesis_expiry` 到期未兌現前端會標灰提醒。
- **改階段/權重**：`config/phases.yaml`。
- **改融資利率、LEAPS 參數、模擬預設**：`config/settings.yaml`。
- 改完 config 後：本機 `python scripts/export_config.py && make sync`；線上等下次 daily 或手動觸發。

## 驗收

```bash
make test                                    # 34 條規則引擎單元測試
python scripts/make_fixture.py --scenario rotation   # SOX 破 30MA、QQQ 未破
make sync && make run-local                  # → 今日頁應出現「資金輪動」醒目卡片
# 論述證偽驗收：追蹤頁把任一檢查點切「證偽」→ 今日頁紅色橫幅、曝險 −20pp、槓桿鎖 1.0×
```

## 規則摘要（詳見 engine.py 註解）

| 條件 | 制度 | 持股水位 | 允許槓桿 |
|---|---|---|---|
| SOX > 30MA 且 > 60MA | 進攻 | 95% | ≤ min(1.3×, 使用者上限) |
| SOX < 30MA 但 > 60MA | 減碼 | 80% | 1.0×（先去槓桿再降倉） |
| SOX < 60MA | 防守 | 65% | 1.0×（禁融資/槓桿選擇權） |

修飾：輪動（SOX破30MA、QQQ未破→加碼 CSP）、均線黏合（<5%→單次減碼上限 20–30%）、雙破（channel check 每兩週）、論述證偽（−20pp、鎖 1.0×，優先於一切）、回撤斷路器（−10% 警示 / −15% 強制去槓桿）。
