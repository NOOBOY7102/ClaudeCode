# ユーザー育成型デジタルインフラマップ 開発計画書

## 1. プロジェクト概要

### 1.1 背景
日本ユニシスが提唱した「ユーザー育成型デジタルインフラマップ」のコンセプトに基づき、
利用者がスマートフォンで撮影した画像/動画からAI画像認識技術を用いてインフラ情報を
自動検出し、デジタルマップ上に登録するアプリケーションを開発する。

参考: [日本経済新聞 - 日本ユニシスの取り組み](https://www.nikkei.com/article/DGXLRSP524857_W9A201C1000000/)

### 1.2 コンセプト
- **ユーザー参加型**: 利用者が撮影するほどマップが成長・充実
- **AI自動認識**: 画像認識AIでインフラ情報を自動検出
- **アクセシビリティ**: 視覚障がい者向けナビゲーション支援

### 1.3 主要ユースケース（第一弾: 点字ブロックマッピング）
1. 点字ブロックの位置を自動検出・マップ登録
2. 視覚障がい者向けの経路案内
3. インフラ整備状況の可視化

---

## 2. 機能要件

### 2.1 コア機能

| 機能 | 説明 | 優先度 |
|------|------|--------|
| 画像/動画撮影 | スマホカメラで撮影 | 必須 |
| AI画像認識 | 点字ブロック等を自動検出 | 必須 |
| 位置情報取得 | GPS座標の取得・紐付け | 必須 |
| マップ表示 | 検出したインフラをマップ上に表示 | 必須 |
| データ登録 | 検出結果をサーバーに送信・保存 | 必須 |

### 2.2 拡張機能

| 機能 | 説明 | 優先度 |
|------|------|--------|
| ユーザー認証 | アカウント管理 | 高 |
| 貢献ランキング | ゲーミフィケーション | 中 |
| オフライン対応 | 通信なしでも撮影可能 | 中 |
| 経路案内 | 点字ブロックを含むナビゲーション | 高 |
| データ検証 | ユーザーによる登録データの確認・修正 | 高 |
| 音声ガイド | 視覚障がい者向け音声案内 | 高 |

### 2.3 検出対象インフラ（拡張計画）

**Phase 1 (MVP)**
- 点字ブロック（警告ブロック、誘導ブロック）

**Phase 2**
- 横断歩道
- 信号機
- スロープ

**Phase 3**
- マンホール
- 電柱
- 街灯
- バス停

---

## 3. 技術スタック

### 3.1 フロントエンド（Webアプリ/PWA）

```
React 18 + TypeScript
├── Leaflet.js / Mapbox GL JS  # 地図表示
├── TensorFlow.js              # クライアントサイド推論
├── Service Worker             # オフライン対応
└── Web Camera API             # カメラアクセス
```

**選定理由:**
- PWAとしてiOS/Android両対応
- ネイティブアプリ開発より迅速
- Web標準のカメラ・位置情報API活用

### 3.2 バックエンド

```
Python (FastAPI)
├── PostgreSQL + PostGIS       # 地理空間データベース
├── Redis                      # キャッシュ・セッション
├── Celery                     # 非同期タスク処理
└── AWS S3 / MinIO             # 画像ストレージ
```

**選定理由:**
- FastAPIの高速性・型安全性
- PostGISの地理空間クエリ機能
- Pythonの豊富なAI/MLライブラリ

### 3.3 AI/機械学習

```
画像認識パイプライン
├── YOLOv8                     # 物体検出
├── PyTorch                    # モデル訓練
├── OpenCV                     # 画像前処理
└── ONNX                       # モデル最適化・エクスポート
```

**点字ブロック検出モデル:**
- カスタムデータセットで訓練したYOLOv8
- 2クラス分類: 警告ブロック（点状）、誘導ブロック（線状）

### 3.4 インフラ構成

```
                    ┌─────────────────┐
                    │   CloudFlare    │
                    │     (CDN)       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐          ┌────────▼────────┐
     │  Frontend (PWA) │          │   API Server    │
     │   Vercel/Netlify│          │   (FastAPI)     │
     └─────────────────┘          └────────┬────────┘
                                           │
                         ┌─────────────────┼─────────────────┐
                         │                 │                 │
                ┌────────▼───────┐ ┌───────▼──────┐ ┌────────▼───────┐
                │   PostgreSQL   │ │    Redis     │ │   S3/MinIO     │
                │   + PostGIS    │ │   Cache      │ │   Storage      │
                └────────────────┘ └──────────────┘ └────────────────┘
```

---

## 4. データモデル設計

### 4.1 主要エンティティ

```sql
-- ユーザー
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    contribution_points INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インフラポイント
CREATE TABLE infrastructure_points (
    id UUID PRIMARY KEY,
    type VARCHAR(50) NOT NULL,           -- 'tactile_paving', 'crosswalk', etc.
    subtype VARCHAR(50),                  -- 'warning', 'guiding'
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    confidence FLOAT NOT NULL,            -- AI検出信頼度
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    reported_by UUID REFERENCES users(id),
    verified_by UUID REFERENCES users(id),
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 撮影セッション
CREATE TABLE capture_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    route GEOGRAPHY(LINESTRING, 4326),    -- 移動経路
    points_detected INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 検証履歴
CREATE TABLE verifications (
    id UUID PRIMARY KEY,
    point_id UUID REFERENCES infrastructure_points(id),
    user_id UUID REFERENCES users(id),
    is_correct BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 インデックス設計

```sql
-- 地理空間インデックス（高速な範囲検索）
CREATE INDEX idx_infrastructure_location
ON infrastructure_points USING GIST(location);

-- 複合インデックス
CREATE INDEX idx_infrastructure_type_status
ON infrastructure_points(type, status);
```

---

## 5. API設計

### 5.1 エンドポイント一覧

```yaml
# 認証
POST   /api/v1/auth/register       # ユーザー登録
POST   /api/v1/auth/login          # ログイン
POST   /api/v1/auth/refresh        # トークン更新

# インフラポイント
GET    /api/v1/points              # ポイント一覧（範囲指定）
POST   /api/v1/points              # ポイント登録
GET    /api/v1/points/{id}         # ポイント詳細
PATCH  /api/v1/points/{id}         # ポイント更新
DELETE /api/v1/points/{id}         # ポイント削除

# 画像処理
POST   /api/v1/detect              # 画像からインフラ検出
POST   /api/v1/upload              # 画像アップロード

# 撮影セッション
POST   /api/v1/sessions            # セッション開始
PATCH  /api/v1/sessions/{id}       # セッション更新
GET    /api/v1/sessions/{id}       # セッション詳細

# 検証
POST   /api/v1/points/{id}/verify  # ポイント検証
GET    /api/v1/points/{id}/verifications  # 検証履歴

# ユーザー
GET    /api/v1/users/me            # 自分の情報
GET    /api/v1/users/ranking       # 貢献ランキング
```

### 5.2 レスポンス例

```json
// GET /api/v1/points?lat=35.6812&lng=139.7671&radius=500
{
  "success": true,
  "data": {
    "points": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "tactile_paving",
        "subtype": "warning",
        "location": {
          "lat": 35.6815,
          "lng": 139.7672
        },
        "confidence": 0.95,
        "status": "verified",
        "image_url": "https://storage.example.com/images/xxx.jpg",
        "created_at": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1,
    "bounds": {
      "north": 35.6857,
      "south": 35.6767,
      "east": 139.7721,
      "west": 139.7621
    }
  }
}
```

---

## 6. 開発フェーズ

### Phase 1: MVP（4週間）

**Week 1: 基盤構築**
- [ ] プロジェクト初期化（frontend/backend）
- [ ] データベース設計・マイグレーション
- [ ] 基本API実装（認証、CRUD）
- [ ] 開発環境Docker構成

**Week 2: 地図機能**
- [ ] Leaflet/Mapbox統合
- [ ] 位置情報取得・表示
- [ ] ポイント表示・クラスタリング
- [ ] 地図操作UI

**Week 3: 画像認識**
- [ ] YOLOv8モデル準備（事前学習済み）
- [ ] 点字ブロックファインチューニング用データ収集
- [ ] 検出API実装
- [ ] カメラ統合

**Week 4: 統合・テスト**
- [ ] フロントエンド・バックエンド統合
- [ ] E2Eテスト
- [ ] パフォーマンス最適化
- [ ] デプロイ

### Phase 2: 機能拡張（4週間）

**Week 5-6: ユーザー体験向上**
- [ ] オフライン対応（Service Worker）
- [ ] 貢献ランキング機能
- [ ] 通知機能
- [ ] PWAインストール対応

**Week 7-8: アクセシビリティ**
- [ ] 音声ガイド機能
- [ ] 経路案内（点字ブロック優先）
- [ ] 高コントラストモード
- [ ] スクリーンリーダー対応

### Phase 3: スケーリング（4週間）

**Week 9-10: インフラ拡張**
- [ ] 横断歩道検出モデル追加
- [ ] 信号機検出モデル追加
- [ ] マルチモデル推論パイプライン

**Week 11-12: 運用・監視**
- [ ] 監視ダッシュボード
- [ ] ログ分析基盤
- [ ] 自動スケーリング設定
- [ ] セキュリティ監査

---

## 7. ディレクトリ構造

```
infra_map_app/
├── frontend/                    # React PWA
│   ├── public/
│   │   ├── manifest.json
│   │   └── service-worker.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   ├── Camera/
│   │   │   └── UI/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                     # FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── points.py
│   │   │   │   ├── detect.py
│   │   │   │   └── users.py
│   │   │   └── deps.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── models.py
│   │   │   └── session.py
│   │   ├── ml/
│   │   │   ├── detector.py
│   │   │   └── models/
│   │   ├── schemas/
│   │   └── main.py
│   ├── tests/
│   ├── alembic/
│   ├── requirements.txt
│   └── Dockerfile
│
├── ml/                          # 機械学習
│   ├── training/
│   │   ├── train_tactile.py
│   │   └── datasets/
│   ├── models/
│   │   └── tactile_paving.pt
│   └── evaluation/
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── nginx/
│
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
│
├── PLANNING.md                  # この計画書
└── README.md
```

---

## 8. 非機能要件

### 8.1 パフォーマンス
- API応答時間: 95パーセンタイルで200ms以下
- 画像検出時間: 1枚あたり500ms以下
- マップ表示: 初期ロード3秒以内

### 8.2 スケーラビリティ
- 同時接続ユーザー: 1,000人以上
- データポイント: 100万件以上対応
- 画像ストレージ: 自動スケーリング

### 8.3 セキュリティ
- HTTPS必須
- JWT認証
- 画像メタデータ除去
- レート制限実装

### 8.4 アクセシビリティ
- WCAG 2.1 AA準拠
- スクリーンリーダー対応
- キーボードナビゲーション

---

## 9. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| 点字ブロック検出精度不足 | 高 | 多様なデータセット収集、アクティブラーニング |
| GPS精度問題 | 中 | 複数測位、カルマンフィルタ補正 |
| オフライン時のデータ競合 | 中 | CRDT採用、サーバーサイドマージ |
| プライバシー懸念 | 高 | 顔・ナンバー自動ぼかし、データ匿名化 |

---

## 10. 今後のアクション

1. **即時**: プロジェクト構造の初期化
2. **Week 1**: バックエンドAPI基盤の構築
3. **Week 2**: フロントエンド地図機能の実装
4. **Week 3**: AI検出機能の統合

---

## 参考資料

- [日本経済新聞 - 日本ユニシスの取り組み](https://www.nikkei.com/article/DGXLRSP524857_W9A201C1000000/)
- [OpenStreetMap](https://www.openstreetmap.org/)
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Leaflet Documentation](https://leafletjs.com/)

---

*作成日: 2026-02-05*
*最終更新: 2026-02-05*
