#!/usr/bin/env python3
"""
カップウィズハンドルパターン検出アプリケーション

このアプリケーションは株価チャートからカップウィズハンドル（Cup with Handle）
パターンを検出し、現在形成中または形成完了した銘柄を特定します。

カップウィズハンドルパターンの特徴:
1. カップ部分: U字型の下落と回復（深さ: 12-33%が理想的）
2. ハンドル部分: カップの右側の小さな下落（深さ: 8-12%）
3. 期間: カップ 7週間〜1年、ハンドル 1〜4週間
4. 出来高: カップ形成中は減少、ブレイクアウト時に増加
"""

import yfinance as yf
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import argrelextrema
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')


class CupHandleDetector:
    """カップウィズハンドルパターン検出器"""

    def __init__(self,
                 cup_depth_min=0.12,      # カップの最小深さ (12%)
                 cup_depth_max=0.33,      # カップの最大深さ (33%)
                 handle_depth_min=0.05,   # ハンドルの最小深さ (5%)
                 handle_depth_max=0.15,   # ハンドルの最大深さ (15%)
                 cup_duration_min=35,     # カップの最小期間 (日数)
                 cup_duration_max=365,    # カップの最大期間 (日数)
                 handle_duration_min=5,   # ハンドルの最小期間 (日数)
                 handle_duration_max=30): # ハンドルの最大期間 (日数)
        """
        パラメータ:
            cup_depth_min/max: カップの深さの範囲（割合）
            handle_depth_min/max: ハンドルの深さの範囲（割合）
            cup_duration_min/max: カップの期間（日数）
            handle_duration_min/max: ハンドルの期間（日数）
        """
        self.cup_depth_min = cup_depth_min
        self.cup_depth_max = cup_depth_max
        self.handle_depth_min = handle_depth_min
        self.handle_depth_max = handle_depth_max
        self.cup_duration_min = cup_duration_min
        self.cup_duration_max = cup_duration_max
        self.handle_duration_min = handle_duration_min
        self.handle_duration_max = handle_duration_max

    def get_stock_data(self, ticker, period='2y'):
        """
        株価データを取得

        パラメータ:
            ticker: ティッカーシンボル (例: 'AAPL')
            period: データ取得期間 (デフォルト: 2年)

        戻り値:
            pandas.DataFrame: 株価データ
        """
        try:
            stock = yf.Ticker(ticker)
            df = stock.history(period=period)
            if df.empty:
                print(f"警告: {ticker} のデータが取得できませんでした")
                return None
            return df
        except Exception as e:
            print(f"エラー: {ticker} のデータ取得に失敗 - {e}")
            return None

    def find_local_extrema(self, prices, order=5):
        """
        局所的な極大値・極小値を検出

        パラメータ:
            prices: 価格データ（numpy配列）
            order: 検出する範囲（前後何個のデータと比較するか）

        戻り値:
            tuple: (極大値のインデックス, 極小値のインデックス)
        """
        # 極大値
        maxima = argrelextrema(prices, np.greater, order=order)[0]
        # 極小値
        minima = argrelextrema(prices, np.less, order=order)[0]
        return maxima, minima

    def detect_cup(self, df):
        """
        カップパターンを検出

        パラメータ:
            df: 株価データフレーム

        戻り値:
            list: 検出されたカップのリスト（各要素は辞書）
        """
        prices = df['Close'].values
        dates = df.index

        # 極大値・極小値を検出
        maxima, minima = self.find_local_extrema(prices, order=10)

        cups = []

        # カップの左端（高値）を探索
        for i, left_high_idx in enumerate(maxima[:-1]):
            left_high_price = prices[left_high_idx]

            # 左端の後の極小値を探索（カップの底）
            bottom_candidates = minima[minima > left_high_idx]

            for bottom_idx in bottom_candidates:
                bottom_price = prices[bottom_idx]

                # カップの深さをチェック
                cup_depth = (left_high_price - bottom_price) / left_high_price
                if cup_depth < self.cup_depth_min or cup_depth > self.cup_depth_max:
                    continue

                # カップの右端（高値）を探索
                right_high_candidates = maxima[maxima > bottom_idx]

                for right_high_idx in right_high_candidates:
                    right_high_price = prices[right_high_idx]

                    # 右端の高さをチェック（左端の90%以上）
                    if right_high_price < left_high_price * 0.90:
                        continue

                    # カップの期間をチェック
                    cup_duration = (dates[right_high_idx] - dates[left_high_idx]).days
                    if cup_duration < self.cup_duration_min or cup_duration > self.cup_duration_max:
                        continue

                    # カップが対称的かチェック（底が中央付近にあるか）
                    left_duration = (dates[bottom_idx] - dates[left_high_idx]).days
                    right_duration = (dates[right_high_idx] - dates[bottom_idx]).days
                    symmetry_ratio = min(left_duration, right_duration) / max(left_duration, right_duration)
                    if symmetry_ratio < 0.3:  # あまりにも非対称なら除外
                        continue

                    cups.append({
                        'left_high_idx': left_high_idx,
                        'bottom_idx': bottom_idx,
                        'right_high_idx': right_high_idx,
                        'left_high_price': left_high_price,
                        'bottom_price': bottom_price,
                        'right_high_price': right_high_price,
                        'cup_depth': cup_depth,
                        'cup_duration': cup_duration,
                        'symmetry_ratio': symmetry_ratio
                    })

                    break  # 最初に見つかった有効な右端を使用

        return cups

    def detect_handle(self, df, cup):
        """
        カップに対するハンドルパターンを検出

        パラメータ:
            df: 株価データフレーム
            cup: カップの情報（辞書）

        戻り値:
            dict or None: ハンドルの情報、またはNone
        """
        prices = df['Close'].values
        dates = df.index

        right_high_idx = cup['right_high_idx']
        right_high_price = cup['right_high_price']

        # ハンドルの開始位置から最後までの範囲でハンドルを探索
        handle_start_idx = right_high_idx

        # データの終端まで、またはハンドル最大期間まで
        max_search_idx = min(len(prices), handle_start_idx + self.handle_duration_max + 20)

        if max_search_idx - handle_start_idx < self.handle_duration_min:
            return None  # データが不足

        # ハンドル内の極小値を探索
        handle_prices = prices[handle_start_idx:max_search_idx]
        if len(handle_prices) < 5:
            return None

        local_minima_indices = argrelextrema(handle_prices, np.less, order=3)[0]

        if len(local_minima_indices) == 0:
            return None

        # 最初の極小値をハンドルの底とする
        handle_bottom_local_idx = local_minima_indices[0]
        handle_bottom_idx = handle_start_idx + handle_bottom_local_idx
        handle_bottom_price = prices[handle_bottom_idx]

        # ハンドルの深さをチェック
        handle_depth = (right_high_price - handle_bottom_price) / right_high_price
        if handle_depth < self.handle_depth_min or handle_depth > self.handle_depth_max:
            return None

        # ハンドルの期間をチェック
        handle_duration = (dates[handle_bottom_idx] - dates[handle_start_idx]).days
        if handle_duration < self.handle_duration_min or handle_duration > self.handle_duration_max:
            return None

        return {
            'handle_start_idx': handle_start_idx,
            'handle_bottom_idx': handle_bottom_idx,
            'handle_bottom_price': handle_bottom_price,
            'handle_depth': handle_depth,
            'handle_duration': handle_duration
        }

    def detect_pattern(self, ticker, period='2y'):
        """
        カップウィズハンドルパターンを検出

        パラメータ:
            ticker: ティッカーシンボル
            period: データ取得期間

        戻り値:
            dict: 検出結果
        """
        df = self.get_stock_data(ticker, period)
        if df is None or len(df) < 100:
            return {'ticker': ticker, 'pattern_found': False, 'message': 'データ不足'}

        # カップを検出
        cups = self.detect_cup(df)

        if not cups:
            return {'ticker': ticker, 'pattern_found': False, 'message': 'カップパターン未検出'}

        # 各カップに対してハンドルを検出
        patterns = []
        for cup in cups:
            handle = self.detect_handle(df, cup)
            if handle:
                patterns.append({
                    'cup': cup,
                    'handle': handle,
                    'score': self.calculate_pattern_score(cup, handle)
                })

        if not patterns:
            return {'ticker': ticker, 'pattern_found': False, 'message': 'ハンドルパターン未検出', 'cups_found': len(cups)}

        # スコアが最も高いパターンを選択
        best_pattern = max(patterns, key=lambda x: x['score'])

        return {
            'ticker': ticker,
            'pattern_found': True,
            'data': df,
            'cup': best_pattern['cup'],
            'handle': best_pattern['handle'],
            'score': best_pattern['score'],
            'total_patterns': len(patterns)
        }

    def calculate_pattern_score(self, cup, handle):
        """
        パターンの品質スコアを計算（0-100）

        パラメータ:
            cup: カップの情報
            handle: ハンドルの情報

        戻り値:
            float: スコア
        """
        score = 0

        # カップの深さ（理想は20-25%）
        ideal_cup_depth = 0.225
        cup_depth_score = 100 * (1 - abs(cup['cup_depth'] - ideal_cup_depth) / ideal_cup_depth)
        score += cup_depth_score * 0.25

        # カップの対称性（高いほど良い）
        symmetry_score = cup['symmetry_ratio'] * 100
        score += symmetry_score * 0.20

        # ハンドルの深さ（理想は8-10%）
        ideal_handle_depth = 0.09
        handle_depth_score = 100 * (1 - abs(handle['handle_depth'] - ideal_handle_depth) / ideal_handle_depth)
        score += handle_depth_score * 0.25

        # カップの期間（長すぎず短すぎず、理想は90-180日）
        ideal_cup_duration = 135
        cup_duration_score = 100 * (1 - abs(cup['cup_duration'] - ideal_cup_duration) / ideal_cup_duration)
        score += cup_duration_score * 0.15

        # ハンドルの期間（理想は10-20日）
        ideal_handle_duration = 15
        handle_duration_score = 100 * (1 - abs(handle['handle_duration'] - ideal_handle_duration) / ideal_handle_duration)
        score += handle_duration_score * 0.15

        return max(0, min(100, score))

    def visualize_pattern(self, result, save_path=None):
        """
        検出されたパターンを可視化

        パラメータ:
            result: detect_pattern の戻り値
            save_path: 保存先パス（Noneの場合は表示のみ）
        """
        if not result['pattern_found']:
            print(f"{result['ticker']}: パターンが見つかりませんでした - {result['message']}")
            return

        df = result['data']
        cup = result['cup']
        handle = result['handle']
        ticker = result['ticker']
        score = result['score']

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10),
                                        gridspec_kw={'height_ratios': [3, 1]})

        # 価格チャート
        ax1.plot(df.index, df['Close'], label='Close Price', linewidth=1.5, color='#2E86AB')

        # カップのマーキング
        left_high_idx = cup['left_high_idx']
        bottom_idx = cup['bottom_idx']
        right_high_idx = cup['right_high_idx']

        ax1.scatter(df.index[left_high_idx], df['Close'].iloc[left_high_idx],
                   color='green', s=100, zorder=5, label='Cup Left High')
        ax1.scatter(df.index[bottom_idx], df['Close'].iloc[bottom_idx],
                   color='red', s=100, zorder=5, label='Cup Bottom')
        ax1.scatter(df.index[right_high_idx], df['Close'].iloc[right_high_idx],
                   color='green', s=100, zorder=5, label='Cup Right High')

        # ハンドルのマーキング
        handle_bottom_idx = handle['handle_bottom_idx']
        ax1.scatter(df.index[handle_bottom_idx], df['Close'].iloc[handle_bottom_idx],
                   color='orange', s=100, zorder=5, label='Handle Bottom')

        # カップとハンドルの範囲を強調
        cup_range = df.index[left_high_idx:right_high_idx+1]
        cup_prices = df['Close'].iloc[left_high_idx:right_high_idx+1]
        ax1.fill_between(cup_range, cup_prices.min(), cup_prices, alpha=0.2, color='blue', label='Cup Pattern')

        handle_start_idx = handle['handle_start_idx']
        handle_end_idx = min(handle_bottom_idx + 10, len(df) - 1)
        handle_range = df.index[handle_start_idx:handle_end_idx+1]
        handle_prices = df['Close'].iloc[handle_start_idx:handle_end_idx+1]
        ax1.fill_between(handle_range, handle_prices.min(), handle_prices, alpha=0.2, color='orange', label='Handle Pattern')

        ax1.set_xlabel('Date', fontsize=11)
        ax1.set_ylabel('Price ($)', fontsize=11)
        ax1.set_title(f'{ticker} - Cup with Handle Pattern (Score: {score:.1f}/100)',
                     fontsize=14, fontweight='bold')
        ax1.legend(loc='upper left', fontsize=9)
        ax1.grid(True, alpha=0.3)

        # パターン情報テキスト
        info_text = f"""
Cup Depth: {cup['cup_depth']*100:.1f}%
Cup Duration: {cup['cup_duration']} days
Cup Symmetry: {cup['symmetry_ratio']:.2f}

Handle Depth: {handle['handle_depth']*100:.1f}%
Handle Duration: {handle['handle_duration']} days
        """.strip()

        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes,
                fontsize=9, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8),
                family='monospace')

        # 出来高チャート
        ax2.bar(df.index, df['Volume'], color='gray', alpha=0.5)
        ax2.set_xlabel('Date', fontsize=11)
        ax2.set_ylabel('Volume', fontsize=11)
        ax2.set_title('Trading Volume', fontsize=12, fontweight='bold')
        ax2.grid(True, alpha=0.3)

        # カップとハンドルの範囲を強調
        ax2.axvspan(df.index[left_high_idx], df.index[right_high_idx],
                   alpha=0.2, color='blue')
        ax2.axvspan(df.index[handle_start_idx], df.index[handle_end_idx],
                   alpha=0.2, color='orange')

        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"図を保存しました: {save_path}")
        else:
            plt.show()

        plt.close()

    def screen_stocks(self, tickers, period='2y', min_score=50):
        """
        複数の銘柄をスクリーニング

        パラメータ:
            tickers: ティッカーシンボルのリスト
            period: データ取得期間
            min_score: 最小スコア（これ以上のものを抽出）

        戻り値:
            list: 検出結果のリスト
        """
        results = []

        print(f"スクリーニング開始: {len(tickers)} 銘柄")
        print("=" * 80)

        for i, ticker in enumerate(tickers, 1):
            print(f"[{i}/{len(tickers)}] {ticker} を分析中...", end=" ")

            result = self.detect_pattern(ticker, period)

            if result['pattern_found'] and result['score'] >= min_score:
                print(f"✓ パターン検出! スコア: {result['score']:.1f}")
                results.append(result)
            else:
                print(f"× {result.get('message', 'パターンなし')}")

        print("=" * 80)
        print(f"完了: {len(results)} 銘柄でパターンを検出")

        # スコアでソート
        results.sort(key=lambda x: x['score'], reverse=True)

        return results


def main():
    """メイン関数"""

    # 検出器を初期化
    detector = CupHandleDetector()

    # スクリーニング対象の銘柄リスト（主要な米国株）
    tickers = [
        # テクノロジー
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AMD', 'INTC',
        # 金融
        'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C',
        # ヘルスケア
        'JNJ', 'PFE', 'UNH', 'ABBV', 'TMO', 'MRK',
        # 消費財
        'PG', 'KO', 'PEP', 'WMT', 'HD', 'MCD', 'NKE', 'SBUX',
        # エネルギー
        'XOM', 'CVX', 'COP', 'SLB',
        # 通信
        'T', 'VZ', 'CMCSA',
        # 工業
        'BA', 'CAT', 'GE', 'MMM',
        # 半導体
        'QCOM', 'AVGO', 'TXN', 'MU'
    ]

    # スクリーニング実行
    results = detector.screen_stocks(tickers, period='2y', min_score=50)

    # 結果を表示
    if results:
        print("\n" + "=" * 80)
        print("カップウィズハンドルパターン検出結果")
        print("=" * 80)
        print(f"{'順位':<6} {'銘柄':<8} {'スコア':<8} {'カップ深さ':<12} {'ハンドル深さ':<14} {'カップ期間':<12}")
        print("-" * 80)

        for i, result in enumerate(results, 1):
            cup = result['cup']
            handle = result['handle']
            print(f"{i:<6} {result['ticker']:<8} {result['score']:>6.1f}  "
                  f"{cup['cup_depth']*100:>10.1f}%  {handle['handle_depth']*100:>12.1f}%  "
                  f"{cup['cup_duration']:>10}日")

        # トップ5の銘柄を可視化
        print("\n" + "=" * 80)
        print("トップ5銘柄のチャートを生成中...")
        print("=" * 80)

        for i, result in enumerate(results[:5], 1):
            save_path = f"/home/user/ClaudeCode/cup_handle_{result['ticker']}.png"
            detector.visualize_pattern(result, save_path=save_path)

        # サマリーレポート
        print("\n" + "=" * 80)
        print("サマリーレポート")
        print("=" * 80)
        print(f"スクリーニング対象: {len(tickers)} 銘柄")
        print(f"パターン検出: {len(results)} 銘柄")
        print(f"検出率: {len(results)/len(tickers)*100:.1f}%")

        if results:
            scores = [r['score'] for r in results]
            print(f"\nスコア統計:")
            print(f"  最高: {max(scores):.1f}")
            print(f"  平均: {np.mean(scores):.1f}")
            print(f"  最低: {min(scores):.1f}")

            print(f"\n最も有望な銘柄 (トップ3):")
            for i, result in enumerate(results[:3], 1):
                print(f"  {i}. {result['ticker']} - スコア: {result['score']:.1f}")
    else:
        print("\nカップウィズハンドルパターンを持つ銘柄は見つかりませんでした。")
        print("パラメータを調整するか、別の期間で試してください。")


if __name__ == '__main__':
    main()
