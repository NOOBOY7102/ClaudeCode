#!/bin/bash
# Initial setup script for the InfraMap project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Setting up InfraMap development environment...${NC}"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    echo "  Python: $PYTHON_VERSION"
else
    echo "  Python: Not found (required)"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "  Node.js: $NODE_VERSION"
else
    echo "  Node.js: Not found (required)"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
    echo "  Docker: $DOCKER_VERSION"
else
    echo "  Docker: Not found (required)"
    exit 1
fi

echo ""

# Setup backend
echo "Setting up backend..."
cd "$PROJECT_DIR/backend"

# Create virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  Created virtual environment"
fi

# Activate and install dependencies
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "  Installed Python dependencies"

# Create .env file
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  Created .env file"
fi

# Create ML models directory
mkdir -p app/ml/models
echo "  Created ML models directory"

deactivate

# Setup frontend
echo ""
echo "Setting up frontend..."
cd "$PROJECT_DIR/frontend"

# Install dependencies
npm install --silent
echo "  Installed Node.js dependencies"

# Setup ML training environment
echo ""
echo "Setting up ML training environment..."
cd "$PROJECT_DIR/ml"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "  Installed ML training dependencies"

# Create dataset directory structure
mkdir -p datasets/tactile_paving/images/{train,val,test}
mkdir -p datasets/tactile_paving/labels/{train,val,test}
echo "  Created dataset directory structure"

deactivate

# Make scripts executable
chmod +x "$PROJECT_DIR/scripts/"*.sh

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start development: ./scripts/dev.sh start"
echo "  2. Open browser: http://localhost:3000"
echo "  3. API docs: http://localhost:8000/docs"
echo ""
echo "For ML training:"
echo "  1. Add training data to: ml/datasets/tactile_paving/"
echo "  2. Run training: cd ml && source venv/bin/activate && python training/train_tactile.py train"
echo ""
