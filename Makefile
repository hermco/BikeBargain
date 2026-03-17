.PHONY: dev install build

dev:  ## Lance le backend + frontend en parallele
	@echo "Starting backend on :8000 and frontend on :5173"
	.venv/bin/uvicorn src.api:app --reload --port 8000 & \
	cd frontend && npm run dev

install:  ## Installe toutes les dependances
	.venv/bin/pip install -r requirements.txt
	cd frontend && npm install

build:  ## Build le frontend pour production
	cd frontend && npm run build
