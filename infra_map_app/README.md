# ユーザー育成型デジタルインフラマップ (InfraMap)

スマートフォンで撮影した画像からAI画像認識技術を用いてインフラ情報（点字ブロック等）を自動検出し、デジタルマップ上に登録するアプリケーション。

## 概要

このプロジェクトは、日本ユニシスが提唱した「ユーザー育成型デジタルインフラマップ」のコンセプトに基づいています。利用者が撮影するほどマップが成長・充実する参加型のインフラマッピングシステムです。

### 主な機能

- **AI画像認識**: YOLOv8を使用した点字ブロックの自動検出
- **マップ表示**: Leaflet.jsによるインタラクティブな地図表示
- **ユーザー参加型**: 撮影・登録・検証による貢献システム
- **ゲーミフィケーション**: 貢献ランキングとバッジシステム
- **PWA対応**: オフライン対応、ホーム画面追加可能

## 技術スタック

### フロントエンド
- React 18 + TypeScript
- Leaflet.js (地図表示)
- TanStack Query (データフェッチ)
- Zustand (状態管理)
- Tailwind CSS (スタイリング)
- Vite + PWA Plugin

### バックエンド
- FastAPI (Python)
- PostgreSQL + PostGIS (地理空間データベース)
- Redis (キャッシュ)
- MinIO/S3 (画像ストレージ)

### AI/ML
- YOLOv8 (物体検出)
- PyTorch
- ONNX Runtime

## クイックスタート

### 前提条件

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-repo/infra-map.git
cd infra-map/infra_map_app

# 初期セットアップ
make setup

# 開発サーバー起動
make dev
```

### アクセス

- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## プロジェクト構造

```
infra_map_app/
├── backend/                 # FastAPI バックエンド
│   ├── app/
│   │   ├── api/v1/         # API エンドポイント
│   │   ├── core/           # 設定・セキュリティ
│   │   ├── db/             # データベースモデル
│   │   ├── ml/             # AI検出モジュール
│   │   └── schemas/        # Pydanticスキーマ
│   ├── alembic/            # DBマイグレーション
│   └── tests/
│
├── frontend/                # React PWA
│   ├── src/
│   │   ├── components/     # UIコンポーネント
│   │   ├── pages/          # ページ
│   │   ├── hooks/          # カスタムフック
│   │   ├── store/          # 状態管理
│   │   └── services/       # API通信
│   └── public/
│
├── ml/                      # 機械学習
│   ├── training/           # 訓練スクリプト
│   ├── models/             # 学習済みモデル
│   └── datasets/           # データセット
│
├── docker/                  # Docker設定
├── scripts/                 # 開発スクリプト
├── Makefile
└── PLANNING.md              # 詳細計画書
```

## 開発

### コマンド一覧

```bash
# 開発環境
make dev          # 開発サーバー起動
make stop         # サーバー停止
make restart      # 再起動

# データベース
make migrate      # マイグレーション実行
make db-reset     # DBリセット（データ削除）

# コード品質
make lint         # リンター実行
make format       # コードフォーマット
make test         # テスト実行

# ML訓練
make ml-setup     # ML環境セットアップ
make ml-train     # モデル訓練
```

### API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/v1/auth/register | ユーザー登録 |
| POST | /api/v1/auth/login | ログイン |
| GET | /api/v1/points | ポイント一覧取得 |
| POST | /api/v1/points | ポイント登録 |
| POST | /api/v1/detect | 画像からインフラ検出 |
| GET | /api/v1/users/ranking | ランキング取得 |

詳細は http://localhost:8000/docs を参照してください。

## ML モデル訓練

### データセット準備

```bash
cd ml

# データセット構造を作成
python training/prepare_dataset.py sample --output datasets/tactile_paving

# COCOフォーマットから変換
python training/prepare_dataset.py convert --coco annotations.json --output datasets/tactile_paving
```

### 訓練実行

```bash
# 訓練
python training/train_tactile.py train --epochs 100 --data datasets/tactile_paving/data.yaml

# 検証
python training/train_tactile.py validate --weights runs/train/tactile_paving/weights/best.pt --data datasets/tactile_paving/data.yaml

# 推論テスト
python training/train_tactile.py predict --weights runs/train/tactile_paving/weights/best.pt --source test_images/
```

## デプロイ

### Docker Compose (本番)

```bash
cd docker
docker compose up -d
```

### 環境変数

本番環境では以下の環境変数を適切に設定してください：

- `SECRET_KEY`: JWT署名用の秘密鍵
- `DATABASE_URL`: PostgreSQL接続URL
- `REDIS_URL`: Redis接続URL
- `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: S3設定

## ライセンス

MIT License

## 参考

- [日本経済新聞 - 日本ユニシスの取り組み](https://www.nikkei.com/article/DGXLRSP524857_W9A201C1000000/)
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Leaflet Documentation](https://leafletjs.com/)
