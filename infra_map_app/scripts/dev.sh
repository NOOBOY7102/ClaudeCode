#!/bin/bash
# Development environment startup script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Start infrastructure services (database, redis, minio)
start_infra() {
    print_status "Starting infrastructure services..."
    cd "$PROJECT_DIR/docker"
    docker compose -f docker-compose.dev.yml up -d db redis minio
    print_success "Infrastructure services started"

    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    sleep 5

    until docker compose -f docker-compose.dev.yml exec -T db pg_isready -U postgres > /dev/null 2>&1; do
        sleep 1
    done
    print_success "Database is ready"
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."
    cd "$PROJECT_DIR/backend"

    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_warning "Created .env file from .env.example"
    fi

    # Check if alembic is installed
    if ! python -c "import alembic" 2>/dev/null; then
        print_status "Installing Python dependencies..."
        pip install -r requirements.txt
    fi

    # Run migrations
    alembic upgrade head
    print_success "Database migrations complete"
}

# Start backend server
start_backend() {
    print_status "Starting backend server..."
    cd "$PROJECT_DIR/backend"

    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
    fi

    # Start with hot reload
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
    BACKEND_PID=$!
    print_success "Backend server started (PID: $BACKEND_PID)"
    echo $BACKEND_PID > "$PROJECT_DIR/.backend.pid"
}

# Start frontend server
start_frontend() {
    print_status "Starting frontend server..."
    cd "$PROJECT_DIR/frontend"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    fi

    # Start dev server
    npm run dev &
    FRONTEND_PID=$!
    print_success "Frontend server started (PID: $FRONTEND_PID)"
    echo $FRONTEND_PID > "$PROJECT_DIR/.frontend.pid"
}

# Stop all services
stop_all() {
    print_status "Stopping all services..."

    # Stop frontend
    if [ -f "$PROJECT_DIR/.frontend.pid" ]; then
        kill $(cat "$PROJECT_DIR/.frontend.pid") 2>/dev/null || true
        rm "$PROJECT_DIR/.frontend.pid"
    fi

    # Stop backend
    if [ -f "$PROJECT_DIR/.backend.pid" ]; then
        kill $(cat "$PROJECT_DIR/.backend.pid") 2>/dev/null || true
        rm "$PROJECT_DIR/.backend.pid"
    fi

    # Stop docker services
    cd "$PROJECT_DIR/docker"
    docker compose -f docker-compose.dev.yml down

    print_success "All services stopped"
}

# Show logs
show_logs() {
    cd "$PROJECT_DIR/docker"
    docker compose -f docker-compose.dev.yml logs -f
}

# Main menu
show_help() {
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start all development services"
    echo "  stop        Stop all development services"
    echo "  restart     Restart all development services"
    echo "  infra       Start only infrastructure (db, redis, minio)"
    echo "  backend     Start only backend server"
    echo "  frontend    Start only frontend server"
    echo "  migrate     Run database migrations"
    echo "  logs        Show Docker logs"
    echo "  help        Show this help message"
    echo ""
}

# Main entry point
case "${1:-help}" in
    start)
        check_docker
        start_infra
        run_migrations
        start_backend
        start_frontend
        echo ""
        print_success "Development environment is ready!"
        echo ""
        echo "  Backend:  http://localhost:8000"
        echo "  Frontend: http://localhost:3000"
        echo "  API Docs: http://localhost:8000/docs"
        echo "  MinIO:    http://localhost:9001 (minioadmin/minioadmin)"
        echo ""
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        check_docker
        start_infra
        run_migrations
        start_backend
        start_frontend
        ;;
    infra)
        check_docker
        start_infra
        ;;
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    migrate)
        run_migrations
        ;;
    logs)
        show_logs
        ;;
    help|*)
        show_help
        ;;
esac
