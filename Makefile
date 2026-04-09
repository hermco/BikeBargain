.PHONY: dev install build proxy db db-stop db-reset tunnel tunnel-stop sync-prod

include .env
export

PROXY_PORT ?= 3000
WORKTREE_NAME := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || basename $(CURDIR))
WORKTREE_PATH := $(CURDIR)

db:  ## Demarre le container PostgreSQL
	@docker compose up db -d

db-stop:  ## Arrete le container PostgreSQL
	@docker compose down

db-reset:  ## Supprime le volume et repart de zero
	@docker compose down -v

tunnel:  ## Demarre le service LBC + tunnel ngrok
	@docker compose --profile tunnel up lbc ngrok -d --build

tunnel-stop:  ## Arrete le service LBC + tunnel ngrok
	@docker compose --profile tunnel stop lbc ngrok

dev:  ## Lance le backend + frontend en parallele (ports auto-detectes)
	@docker compose up db -d
	$(eval PORTS := $(shell .venv/bin/python devproxy_register.py find-ports))
	$(eval BACKEND_PORT := $(word 1,$(PORTS)))
	$(eval FRONTEND_PORT := $(word 2,$(PORTS)))
	@echo "Starting backend on :$(BACKEND_PORT) and frontend on :$(FRONTEND_PORT)"
	@.venv/bin/python devproxy_register.py register $(PROXY_PORT) $(WORKTREE_NAME) $(FRONTEND_PORT) $(BACKEND_PORT) $(WORKTREE_PATH) 2>/dev/null || true
	@.venv/bin/uvicorn src.api:app --reload --port $(BACKEND_PORT) & \
	UVICORN_PID=$$!; \
	cleanup() { .venv/bin/python devproxy_register.py unregister $(PROXY_PORT) $(WORKTREE_NAME) 2>/dev/null; kill $$UVICORN_PID 2>/dev/null; wait $$UVICORN_PID 2>/dev/null; }; \
	trap cleanup EXIT INT TERM HUP; \
	cd frontend && VITE_PORT=$(FRONTEND_PORT) VITE_BACKEND_PORT=$(BACKEND_PORT) npx vite --port $(FRONTEND_PORT); \
	cleanup

proxy:  ## Lance le proxy et ouvre le dashboard
	@open http://localhost:$(PROXY_PORT)/_proxy/ &
	.venv/bin/python devproxy.py --port $(PROXY_PORT)

PROD_DB_URL := $(shell railway variables --json -s Postgres 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('DATABASE_PUBLIC_URL',''))" 2>/dev/null)
DB_CONTAINER := himalayan-postgres

sync-prod:  ## Synchronise les donnees locales vers la base de production (Railway)
	@if [ -z "$(PROD_DB_URL)" ]; then echo "Error: cannot fetch Railway DATABASE_PUBLIC_URL. Run 'railway login' first."; exit 1; fi
	@echo "Dumping local data..."
	@docker exec $(DB_CONTAINER) pg_dump "$(DATABASE_URL)" --data-only --exclude-table=alembic_version --disable-triggers --no-owner --no-privileges -f /tmp/data.sql
	@echo "Truncating production tables..."
	@docker exec $(DB_CONTAINER) psql "$(PROD_DB_URL)" -c "DO \$$\$$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'alembic_version') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \$$\$$;"
	@echo "Restoring data to production..."
	@docker exec $(DB_CONTAINER) psql "$(PROD_DB_URL)" -f /tmp/data.sql
	@docker exec $(DB_CONTAINER) rm /tmp/data.sql
	@echo "Done — production data synced."

install:  ## Installe toutes les dependances
	.venv/bin/pip install -r requirements.txt
	cd frontend && npm install

build:  ## Build le frontend pour production
	cd frontend && npm run build
