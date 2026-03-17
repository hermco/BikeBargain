.PHONY: dev install build proxy

PROXY_PORT ?= 3000
WORKTREE_NAME := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || basename $(CURDIR))
WORKTREE_PATH := $(CURDIR)

dev:  ## Lance le backend + frontend en parallele (ports auto-detectes)
	$(eval PORTS := $(shell .venv/bin/python devproxy_register.py find-ports))
	$(eval BACKEND_PORT := $(word 1,$(PORTS)))
	$(eval FRONTEND_PORT := $(word 2,$(PORTS)))
	@echo "Starting backend on :$(BACKEND_PORT) and frontend on :$(FRONTEND_PORT)"
	@.venv/bin/python devproxy_register.py register $(PROXY_PORT) $(WORKTREE_NAME) $(FRONTEND_PORT) $(BACKEND_PORT) $(WORKTREE_PATH) 2>/dev/null || true
	@.venv/bin/uvicorn src.api:app --reload --port $(BACKEND_PORT) & \
	UVICORN_PID=$$!; \
	trap ".venv/bin/python devproxy_register.py unregister $(PROXY_PORT) $(WORKTREE_NAME) 2>/dev/null; kill $$UVICORN_PID 2>/dev/null" EXIT INT TERM; \
	cd frontend && VITE_PORT=$(FRONTEND_PORT) VITE_BACKEND_PORT=$(BACKEND_PORT) npx vite --port $(FRONTEND_PORT)

proxy:  ## Lance le proxy et ouvre le dashboard
	@open http://localhost:$(PROXY_PORT)/_proxy/ &
	.venv/bin/python devproxy.py --port $(PROXY_PORT)

install:  ## Installe toutes les dependances
	.venv/bin/pip install -r requirements.txt
	cd frontend && npm install

build:  ## Build le frontend pour production
	cd frontend && npm run build
