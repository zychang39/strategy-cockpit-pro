# 本機備援模式：沒有推送權限也能全功能運作
.PHONY: fetch fixture sync test build run-local dev init

init:            ## 安裝依賴
	pip install -r requirements.txt
	cd web && npm install

fetch:           ## 抓真實行情（第一次請加 --init-targets）
	python fetch.py
	python scripts/export_config.py
	$(MAKE) sync

fixture:         ## 假資料（SCENARIO=offense|rotation|defense|glue|double）
	python scripts/make_fixture.py --scenario $(or $(SCENARIO),offense)
	python scripts/export_config.py
	$(MAKE) sync

sync:            ## data/*.json → web/public/data/
	mkdir -p web/public/data/history
	cp data/latest.json data/config.json web/public/data/
	-cp data/history/*.json web/public/data/history/ 2>/dev/null || true

test:            ## 規則引擎單元測試
	python -m pytest tests/ -q

build: sync      ## 前端正式打包 → web/dist
	cd web && npm run build

dev: sync        ## Vite 開發伺服器（熱更新）
	cd web && npm run dev

run-local: build ## 打包後以 http.server 服務（PWA 完整功能）
	@echo "→ http://localhost:8899"
	cd web/dist && python -m http.server 8899
