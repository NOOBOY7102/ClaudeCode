# カップウィズハンドル パターン検出器

株価チャートから「カップウィズハンドル（Cup with Handle）」パターンを自動検出するアプリケーションです。

## バージョン情報

### V2（長期パターン対応版） - **推奨**
- **対象**: 数年〜数十年レベルの大規模パターン
- **タイムフレーム**: 3ヶ月足（四半期足）
- **対象銘柄**: インデックス、コモディティ、債券ETF（SLV, GLD, SPY, QQQ, TLT など）
- **ファイル**: `cup_handle_detector_v2.py`, `cup_handle_v2_demo.py`

### V1（短期パターン版）
- **対象**: 数週間〜1年程度の短期パターン
- **タイムフレーム**: 日足
- **対象銘柄**: 個別株
- **ファイル**: `cup_handle_detector.py`, `cup_handle_demo.py`

## 概要

カップウィズハンドルパターンは、テクニカル分析における強気の継続パターンで、以下の特徴を持ちます：

### パターンの構成要素

```
        左端高値
         /\
        /  \
       /    \______ 右端高値
      /            /\  ハンドル
     /            /  \/
    /            /
   カップ底
```

1. **カップ部分（Cup）**
   - U字型またはV字型の価格下落と回復
   - 理想的な深さ: 12-33%
   - 期間: 7週間〜1年（理想は3-6ヶ月）
   - 対称的な形状が望ましい

2. **ハンドル部分（Handle）**
   - カップ右端の小さな下落
   - 理想的な深さ: 5-15%
   - 期間: 5-30日（理想は1-4週間）
   - 下向きまたは横ばいのトレンド

3. **ブレイクアウト**
   - ハンドルの上限を上抜けた時が買いシグナル
   - 出来高の増加を伴うことが理想的

## 機能

- 🔍 **自動パターン検出**: 株価データから自動的にカップウィズハンドルパターンを検出
- 📊 **複数銘柄スクリーニング**: 大量の銘柄を一括でスクリーニング
- 📈 **品質スコアリング**: 各パターンの品質を0-100のスコアで評価
- 📉 **可視化**: 検出されたパターンをチャートで視覚的に表示
- 🎯 **カスタマイズ可能**: パターンの検出パラメータを自由に調整

## インストール

### 必要要件

- Python 3.8以上

### セットアップ

```bash
# リポジトリをクローン
git clone <repository_url>
cd ClaudeCode

# 依存パッケージをインストール
pip install -r requirements.txt
```

## 使用方法

### V2版（長期パターン検出） - 推奨

```bash
# デモ版を実行（SLV風のパターンをシミュレーション）
python cup_handle_v2_demo.py

# 実際のETFデータで分析（yfinanceが必要）
python cup_handle_detector_v2.py
```

### Python スクリプトとして使用（V2）

```python
from cup_handle_detector_v2 import CupHandleDetectorV2

# 検出器を初期化（長期パターン用のパラメータ）
detector = CupHandleDetectorV2(
    cup_depth_min=0.15,        # カップ深さ 15-70%
    cup_depth_max=0.70,
    cup_quarters_min=8,        # カップ期間 2-20年
    cup_quarters_max=80,
    handle_quarters_min=2,     # ハンドル期間 0.5-4年
    handle_quarters_max=16
)

# 単一ETFを分析（全期間データを取得）
result = detector.detect_pattern('SLV', period='max')

if result['pattern_found']:
    print(f"パターン検出! スコア: {result['score']:.1f}")
    # チャートを保存
    detector.visualize_pattern(result, save_path='slv_pattern.png')
else:
    print(f"パターンなし: {result['message']}")

# 複数ETFをスクリーニング
etfs = ['SLV', 'GLD', 'SPY', 'QQQ', 'TLT', 'IEF']
results = detector.screen_etfs(etfs, period='max', min_score=30)

# 結果を表示
for r in results:
    cup = r['cup']
    print(f"{r['ticker']}: スコア {r['score']:.1f} "
          f"(カップ: {cup['cup_duration_years']:.1f}年, {cup['cup_depth']*100:.0f}%)")
```

### V1版（短期パターン検出）

```bash
# デモ版を実行
python cup_handle_demo.py

# 実際の株価データで分析
python cup_handle_detector.py
```

### Python スクリプトとして使用（V1）

```python
from cup_handle_detector import CupHandleDetector

# 検出器を初期化
detector = CupHandleDetector()

# 単一銘柄を分析
result = detector.detect_pattern('AAPL', period='2y')

if result['pattern_found']:
    print(f"パターン検出! スコア: {result['score']:.1f}")
    detector.visualize_pattern(result, save_path='aapl_pattern.png')

# 複数銘柄をスクリーニング
tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']
results = detector.screen_stocks(tickers, min_score=60)
```

### パラメータのカスタマイズ

```python
# カスタムパラメータで検出器を初期化
detector = CupHandleDetector(
    cup_depth_min=0.15,        # カップの最小深さ 15%
    cup_depth_max=0.40,        # カップの最大深さ 40%
    handle_depth_min=0.05,     # ハンドルの最小深さ 5%
    handle_depth_max=0.12,     # ハンドルの最大深さ 12%
    cup_duration_min=50,       # カップの最小期間 50日
    cup_duration_max=300,      # カップの最大期間 300日
    handle_duration_min=7,     # ハンドルの最小期間 7日
    handle_duration_max=25     # ハンドルの最大期間 25日
)
```

## 出力

### コンソール出力

```
スクリーニング開始: 50 銘柄
================================================================================
[1/50] AAPL を分析中... ✓ パターン検出! スコア: 78.5
[2/50] MSFT を分析中... × カップパターン未検出
...
================================================================================
完了: 5 銘柄でパターンを検出

================================================================================
カップウィズハンドルパターン検出結果
================================================================================
順位   銘柄     スコア   カップ深さ   ハンドル深さ   カップ期間
--------------------------------------------------------------------------------
1      NVDA      78.5        22.5%          9.2%          142日
2      AMD       72.3        19.8%          8.5%          156日
3      AAPL      68.9        25.1%         10.3%          128日
...
```

### チャート出力

検出されたパターンは自動的にPNG画像として保存されます：

- `cup_handle_<TICKER>.png`: 各銘柄のパターンチャート
- カップとハンドルの範囲を色分けで表示
- 重要なポイント（高値、底値）をマーク
- 出来高チャートも併記

## アルゴリズムの詳細

### パターン検出プロセス

1. **データ取得**: yfinanceを使用して株価データを取得
2. **極値検出**: scipy.signalを使用して局所的な高値・安値を検出
3. **カップ検出**:
   - 左端の高値を探索
   - その後の底値を探索（深さ12-33%）
   - 右端の高値を探索（左端の90%以上）
   - 期間と対称性を検証
4. **ハンドル検出**:
   - カップ右端からの下落を探索
   - 深さ5-15%、期間5-30日を検証
5. **スコアリング**: パターンの品質を多角的に評価

### スコア計算

各パターンは以下の要素で評価されます（0-100点）：

- **カップの深さ** (25%): 理想は20-25%
- **カップの対称性** (20%): 左右のバランス
- **ハンドルの深さ** (25%): 理想は8-10%
- **カップの期間** (15%): 理想は90-180日
- **ハンドルの期間** (15%): 理想は10-20日

## 技術スタック

- **yfinance**: 株価データ取得
- **NumPy**: 数値計算
- **Pandas**: データ処理
- **Matplotlib**: チャート可視化
- **SciPy**: 信号処理（極値検出）

## 注意事項

⚠️ **免責事項**

このツールは教育・研究目的で提供されています。投資判断は自己責任で行ってください。

- パターン検出は統計的手法であり、100%の精度を保証するものではありません
- 過去のパターンが将来の価格上昇を保証するものではありません
- 実際の投資では、他のテクニカル指標やファンダメンタル分析も併用してください
- 出来高、全体的な市場環境、ニュースなども考慮してください

## 参考文献

- William J. O'Neil "How to Make Money in Stocks"
- Thomas Bulkowski "Encyclopedia of Chart Patterns"

## ライセンス

MIT License

## 貢献

プルリクエストを歓迎します！バグ報告や機能提案はIssueでお願いします。

## サポート

問題が発生した場合は、GitHubのIssueで報告してください。
