.PHONY: help setup dev stop restart clean test lint format migrate

# Default target
help:
	@echo "InfraMap - User-Driven Digital Infrastructure Map"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  setup      Initial project setup"
	@echo "  dev        Start development environment"
	@echo "  stop       Stop all services"
	@echo "  restart    Restart all services"
	@echo "  logs       Show Docker logs"
	@echo ""
	@echo "Database:"
	@echo "  migrate    Run database migrations"
	@echo "  db-reset   Reset database (WARNING: deletes all data)"
	@echo ""
	@echo "Testing:"
	@echo "  test       Run all tests"
	@echo "  test-back  Run backend tests"
	@echo "  test-front Run frontend tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint       Run linters"
	@echo "  format     Format code"
	@echo ""
	@echo "ML Training:"
	@echo "  ml-setup   Setup ML training environment"
	@echo "  ml-train   Train the tactile paving model"
	@echo ""
	@echo "Deployment:"
	@echo "  build      Build production images"
	@echo "  deploy     Deploy to production"

# Development
setup:
	@./scripts/setup.sh

dev:
	@./scripts/dev.sh start

stop:
	@./scripts/dev.sh stop

restart:
	@./scripts/dev.sh restart

logs:
	@./scripts/dev.sh logs

# Database
migrate:
	@cd backend && source venv/bin/activate && alembic upgrade head

db-reset:
	@echo "WARNING: This will delete all data. Press Ctrl+C to cancel."
	@sleep 3
	@cd docker && docker compose -f docker-compose.dev.yml down -v
	@cd docker && docker compose -f docker-compose.dev.yml up -d db
	@sleep 5
	@make migrate

# Testing
test: test-back test-front

test-back:
	@cd backend && source venv/bin/activate && pytest tests/ -v

test-front:
	@cd frontend && npm test

# Code Quality
lint:
	@echo "Linting backend..."
	@cd backend && source venv/bin/activate && ruff check app/
	@echo "Linting frontend..."
	@cd frontend && npm run lint

format:
	@echo "Formatting backend..."
	@cd backend && source venv/bin/activate && ruff format app/
	@echo "Formatting frontend..."
	@cd frontend && npx prettier --write "src/**/*.{ts,tsx}"

# ML Training
ml-setup:
	@cd ml && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

ml-train:
	@cd ml && source venv/bin/activate && python training/train_tactile.py train --epochs 100

# Build
build:
	@cd docker && docker compose build

# Deploy (placeholder)
deploy:
	@echo "Deployment not configured. Please set up your deployment pipeline."
