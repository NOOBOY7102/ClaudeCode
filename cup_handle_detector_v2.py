#!/usr/bin/env python3
"""
カップウィズハンドルパターン検出器 V2 - 長期パターン対応版

数年〜数十年レベルの大規模なカップウィズハンドルパターンを検出します。
3ヶ月足（四半期足）ベースでインデックス、コモディティ、債券ETFを分析します。

対象: SPY, QQQ, GLD, SLV, TLT, IEF, DIA, IWM, EEM, VTI, AGG, LQD など
"""

import yfinance as yf
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import argrelextrema
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')


class CupHandleDetectorV2:
    """大規模カップウィズハンドルパターン検出器（3ヶ月足対応）"""

    def __init__(self,
                 cup_depth_min=0.15,        # カップの最小深さ (15%)
                 cup_depth_max=0.70,        # カップの最大深さ (70%)
                 handle_depth_min=0.05,     # ハンドルの最小深さ (5%)
                 handle_depth_max=0.25,     # ハンドルの最大深さ (25%)
                 cup_quarters_min=8,        # カップの最小期間 (四半期: 8四半期=2年)
                 cup_quarters_max=80,       # カップの最大期間 (四半期: 80四半期=20年)
                 handle_quarters_min=2,     # ハンドルの最小期間 (四半期: 2四半期=6ヶ月)
                 handle_quarters_max=16,    # ハンドルの最大期間 (四半期: 16四半期=4年)
                 timeframe='quarterly'):    # タイムフレーム
        """
        パラメータ:
            cup_depth_min/max: カップの深さの範囲（割合）
            handle_depth_min/max: ハンドルの深さの範囲（割合）
            cup_quarters_min/max: カップの期間（四半期数）
            handle_quarters_min/max: ハンドルの期間（四半期数）
            timeframe: 'quarterly' (3ヶ月足) または 'monthly' (月足)
        """
        self.cup_depth_min = cup_depth_min
        self.cup_depth_max = cup_depth_max
        self.handle_depth_min = handle_depth_min
        self.handle_depth_max = handle_depth_max
        self.cup_quarters_min = cup_quarters_min
        self.cup_quarters_max = cup_quarters_max
        self.handle_quarters_min = handle_quarters_min
        self.handle_quarters_max = handle_quarters_max
        self.timeframe = timeframe

    def get_stock_data(self, ticker, period='max'):
        """
        株価データを取得して3ヶ月足にリサンプリング

        パラメータ:
            ticker: ティッカーシンボル (例: 'SLV')
            period: データ取得期間 (デフォルト: max)

        戻り値:
            tuple: (日足データ, 3ヶ月足データ)
        """
        try:
            stock = yf.Ticker(ticker)
            df_daily = stock.history(period=period)
            if df_daily.empty:
                print(f"警告: {ticker} のデータが取得できませんでした")
                return None, None

            # 3ヶ月足にリサンプリング
            if self.timeframe == 'quarterly':
                df_resampled = df_daily.resample('Q').agg({
                    'Open': 'first',
                    'High': 'max',
                    'Low': 'min',
                    'Close': 'last',
                    'Volume': 'sum'
                })
            elif self.timeframe == 'monthly':
                df_resampled = df_daily.resample('M').agg({
                    'Open': 'first',
                    'High': 'max',
                    'Low': 'min',
                    'Close': 'last',
                    'Volume': 'sum'
                })
            else:
                df_resampled = df_daily

            # NaNを除去
            df_resampled = df_resampled.dropna()

            return df_daily, df_resampled

        except Exception as e:
            print(f"エラー: {ticker} のデータ取得に失敗 - {e}")
            return None, None

    def find_local_extrema(self, prices, order=2):
        """
        局所的な極大値・極小値を検出

        パラメータ:
            prices: 価格データ（numpy配列）
            order: 検出する範囲（3ヶ月足なので小さめ）

        戻り値:
            tuple: (極大値のインデックス, 極小値のインデックス)
        """
        if len(prices) < order * 2 + 1:
            return np.array([]), np.array([])

        # 極大値
        maxima = argrelextrema(prices, np.greater, order=order)[0]
        # 極小値
        minima = argrelextrema(prices, np.less, order=order)[0]
        return maxima, minima

    def detect_cup(self, df):
        """
        カップパターンを検出

        パラメータ:
            df: 株価データフレーム（3ヶ月足）

        戻り値:
            list: 検出されたカップのリスト
        """
        prices = df['Close'].values
        dates = df.index

        # 極大値・極小値を検出
        maxima, minima = self.find_local_extrema(prices, order=2)

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

                    # 右端の高さをチェック（左端の85%以上）
                    # 大規模パターンでは完全に戻らないこともある
                    if right_high_price < left_high_price * 0.85:
                        continue

                    # カップの期間をチェック（四半期数）
                    cup_duration = right_high_idx - left_high_idx
                    if cup_duration < self.cup_quarters_min or cup_duration > self.cup_quarters_max:
                        continue

                    # カップが対称的かチェック（底が中央付近にあるか）
                    left_duration = bottom_idx - left_high_idx
                    right_duration = right_high_idx - bottom_idx
                    if left_duration == 0 or right_duration == 0:
                        continue
                    symmetry_ratio = min(left_duration, right_duration) / max(left_duration, right_duration)
                    if symmetry_ratio < 0.2:  # 大規模パターンでは緩めの基準
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
                        'cup_duration_years': cup_duration * 0.25,  # 四半期を年に換算
                        'symmetry_ratio': symmetry_ratio
                    })

                    break  # 最初に見つかった有効な右端を使用

        return cups

    def detect_handle(self, df, cup):
        """
        カップに対するハンドルパターンを検出

        パラメータ:
            df: 株価データフレーム（3ヶ月足）
            cup: カップの情報

        戻り値:
            dict or None: ハンドルの情報
        """
        prices = df['Close'].values
        dates = df.index

        right_high_idx = cup['right_high_idx']
        right_high_price = cup['right_high_price']

        # ハンドルの開始位置から最後までの範囲でハンドルを探索
        handle_start_idx = right_high_idx

        # データの終端まで、またはハンドル最大期間まで
        max_search_idx = min(len(prices), handle_start_idx + self.handle_quarters_max + 5)

        if max_search_idx - handle_start_idx < self.handle_quarters_min:
            return None  # データが不足

        # ハンドル内の極小値を探索
        handle_prices = prices[handle_start_idx:max_search_idx]
        if len(handle_prices) < 3:
            return None

        # ハンドル内の最低価格を探す
        handle_bottom_local_idx = np.argmin(handle_prices)
        handle_bottom_idx = handle_start_idx + handle_bottom_local_idx
        handle_bottom_price = prices[handle_bottom_idx]

        # ハンドルの深さをチェック
        handle_depth = (right_high_price - handle_bottom_price) / right_high_price
        if handle_depth < self.handle_depth_min or handle_depth > self.handle_depth_max:
            return None

        # ハンドルの期間をチェック
        handle_duration = handle_bottom_idx - handle_start_idx
        if handle_duration < self.handle_quarters_min or handle_duration > self.handle_quarters_max:
            return None

        return {
            'handle_start_idx': handle_start_idx,
            'handle_bottom_idx': handle_bottom_idx,
            'handle_bottom_price': handle_bottom_price,
            'handle_depth': handle_depth,
            'handle_duration': handle_duration,
            'handle_duration_years': handle_duration * 0.25  # 四半期を年に換算
        }

    def detect_pattern(self, ticker, period='max'):
        """
        カップウィズハンドルパターンを検出

        パラメータ:
            ticker: ティッカーシンボル
            period: データ取得期間

        戻り値:
            dict: 検出結果
        """
        df_daily, df_quarterly = self.get_stock_data(ticker, period)
        if df_quarterly is None or len(df_quarterly) < 20:
            return {'ticker': ticker, 'pattern_found': False, 'message': 'データ不足'}

        # カップを検出
        cups = self.detect_cup(df_quarterly)

        if not cups:
            return {'ticker': ticker, 'pattern_found': False, 'message': 'カップパターン未検出'}

        # 各カップに対してハンドルを検出
        patterns = []
        for cup in cups:
            handle = self.detect_handle(df_quarterly, cup)
            if handle:
                patterns.append({
                    'cup': cup,
                    'handle': handle,
                    'score': self.calculate_pattern_score(cup, handle)
                })

        if not patterns:
            # ハンドルがなくても、カップのみでも有用な情報
            # 最も深いカップを返す
            best_cup = max(cups, key=lambda x: x['cup_depth'])
            return {
                'ticker': ticker,
                'pattern_found': True,
                'pattern_type': 'cup_only',
                'data_daily': df_daily,
                'data_quarterly': df_quarterly,
                'cup': best_cup,
                'handle': None,
                'score': self.calculate_cup_only_score(best_cup),
                'total_cups': len(cups)
            }

        # スコアが最も高いパターンを選択
        best_pattern = max(patterns, key=lambda x: x['score'])

        return {
            'ticker': ticker,
            'pattern_found': True,
            'pattern_type': 'cup_with_handle',
            'data_daily': df_daily,
            'data_quarterly': df_quarterly,
            'cup': best_pattern['cup'],
            'handle': best_pattern['handle'],
            'score': best_pattern['score'],
            'total_patterns': len(patterns)
        }

    def calculate_pattern_score(self, cup, handle):
        """
        パターンの品質スコアを計算（0-100）
        """
        score = 0

        # カップの深さ（20-40%が理想）
        ideal_cup_depth = 0.30
        cup_depth_diff = abs(cup['cup_depth'] - ideal_cup_depth)
        cup_depth_score = max(0, 100 * (1 - cup_depth_diff / ideal_cup_depth))
        score += cup_depth_score * 0.25

        # カップの対称性
        symmetry_score = cup['symmetry_ratio'] * 100
        score += symmetry_score * 0.20

        # ハンドルの深さ（10-15%が理想）
        ideal_handle_depth = 0.12
        handle_depth_diff = abs(handle['handle_depth'] - ideal_handle_depth)
        handle_depth_score = max(0, 100 * (1 - handle_depth_diff / ideal_handle_depth))
        score += handle_depth_score * 0.25

        # カップの期間（適度な長さ: 3-10年が理想）
        ideal_cup_years = 6
        cup_years_diff = abs(cup['cup_duration_years'] - ideal_cup_years)
        cup_duration_score = max(0, 100 * (1 - cup_years_diff / ideal_cup_years))
        score += cup_duration_score * 0.15

        # ハンドルの期間（1-2年が理想）
        ideal_handle_years = 1.5
        handle_years_diff = abs(handle['handle_duration_years'] - ideal_handle_years)
        handle_duration_score = max(0, 100 * (1 - handle_years_diff / ideal_handle_years))
        score += handle_duration_score * 0.15

        return max(0, min(100, score))

    def calculate_cup_only_score(self, cup):
        """カップのみの場合のスコア"""
        score = 0

        # カップの深さ
        ideal_cup_depth = 0.30
        cup_depth_diff = abs(cup['cup_depth'] - ideal_cup_depth)
        cup_depth_score = max(0, 100 * (1 - cup_depth_diff / ideal_cup_depth))
        score += cup_depth_score * 0.4

        # カップの対称性
        symmetry_score = cup['symmetry_ratio'] * 100
        score += symmetry_score * 0.3

        # カップの期間
        ideal_cup_years = 6
        cup_years_diff = abs(cup['cup_duration_years'] - ideal_cup_years)
        cup_duration_score = max(0, 100 * (1 - cup_years_diff / ideal_cup_years))
        score += cup_duration_score * 0.3

        return max(0, min(100, score))

    def visualize_pattern(self, result, save_path=None):
        """
        検出されたパターンを可視化
        """
        if not result['pattern_found']:
            print(f"{result['ticker']}: パターンが見つかりませんでした - {result['message']}")
            return

        df_daily = result['data_daily']
        df_quarterly = result['data_quarterly']
        cup = result['cup']
        handle = result.get('handle')
        ticker = result['ticker']
        score = result['score']
        pattern_type = result.get('pattern_type', 'cup_with_handle')

        fig = plt.figure(figsize=(18, 12))
        gs = fig.add_gridspec(3, 2, height_ratios=[2, 1, 1], hspace=0.3, wspace=0.3)

        # 3ヶ月足チャート（メイン）
        ax1 = fig.add_subplot(gs[0, :])
        ax1.plot(df_quarterly.index, df_quarterly['Close'],
                linewidth=2.5, color='#2E86AB', marker='o', markersize=5,
                label='Quarterly Close')

        # カップのマーキング
        left_high_idx = cup['left_high_idx']
        bottom_idx = cup['bottom_idx']
        right_high_idx = cup['right_high_idx']

        ax1.scatter(df_quarterly.index[left_high_idx], df_quarterly['Close'].iloc[left_high_idx],
                   color='green', s=200, zorder=5, marker='^', label='Cup Left High', edgecolors='black', linewidths=2)
        ax1.scatter(df_quarterly.index[bottom_idx], df_quarterly['Close'].iloc[bottom_idx],
                   color='red', s=200, zorder=5, marker='v', label='Cup Bottom', edgecolors='black', linewidths=2)
        ax1.scatter(df_quarterly.index[right_high_idx], df_quarterly['Close'].iloc[right_high_idx],
                   color='green', s=200, zorder=5, marker='^', label='Cup Right High', edgecolors='black', linewidths=2)

        # カップの範囲を強調
        cup_range = df_quarterly.index[left_high_idx:right_high_idx+1]
        cup_prices = df_quarterly['Close'].iloc[left_high_idx:right_high_idx+1]
        ax1.fill_between(cup_range, cup_prices.min() * 0.95, cup_prices,
                        alpha=0.15, color='blue', label='Cup Pattern')

        # ハンドルのマーキング
        if handle:
            handle_bottom_idx = handle['handle_bottom_idx']
            ax1.scatter(df_quarterly.index[handle_bottom_idx], df_quarterly['Close'].iloc[handle_bottom_idx],
                       color='orange', s=200, zorder=5, marker='v', label='Handle Bottom', edgecolors='black', linewidths=2)

            handle_start_idx = handle['handle_start_idx']
            handle_end_idx = min(handle_bottom_idx + 3, len(df_quarterly) - 1)
            handle_range = df_quarterly.index[handle_start_idx:handle_end_idx+1]
            handle_prices = df_quarterly['Close'].iloc[handle_start_idx:handle_end_idx+1]
            ax1.fill_between(handle_range, handle_prices.min() * 0.95, handle_prices,
                            alpha=0.2, color='orange', label='Handle Pattern')

        ax1.set_xlabel('Date', fontsize=12, fontweight='bold')
        ax1.set_ylabel('Price ($)', fontsize=12, fontweight='bold')

        title = f'{ticker} - Cup {"with Handle" if handle else "Only"} Pattern (Quarterly) - Score: {score:.1f}/100'
        ax1.set_title(title, fontsize=16, fontweight='bold', pad=15)
        ax1.legend(loc='upper left', fontsize=10)
        ax1.grid(True, alpha=0.3)

        # パターン情報
        info_lines = [
            f"Pattern Type: {pattern_type.replace('_', ' ').title()}",
            f"",
            f"Cup Formation:",
            f"  Depth: {cup['cup_depth']*100:.1f}%",
            f"  Duration: {cup['cup_duration_years']:.1f} years ({cup['cup_duration']} quarters)",
            f"  Symmetry: {cup['symmetry_ratio']:.2f}",
            f"  Period: {df_quarterly.index[left_high_idx].date()} - {df_quarterly.index[right_high_idx].date()}",
        ]

        if handle:
            info_lines.extend([
                f"",
                f"Handle Formation:",
                f"  Depth: {handle['handle_depth']*100:.1f}%",
                f"  Duration: {handle['handle_duration_years']:.1f} years ({handle['handle_duration']} quarters)",
                f"  Period: {df_quarterly.index[handle['handle_start_idx']].date()} - {df_quarterly.index[handle['handle_bottom_idx']].date()}",
            ])

        info_text = '\n'.join(info_lines)

        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes,
                fontsize=10, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.9, edgecolor='black', linewidth=2),
                family='monospace')

        # 日足チャート（参考）
        ax2 = fig.add_subplot(gs[1, :])
        ax2.plot(df_daily.index, df_daily['Close'],
                linewidth=1, color='#888888', alpha=0.5, label='Daily Close')

        # カップの期間を強調
        cup_start_date = df_quarterly.index[left_high_idx]
        cup_end_date = df_quarterly.index[right_high_idx]
        ax2.axvspan(cup_start_date, cup_end_date, alpha=0.1, color='blue')

        if handle:
            handle_start_date = df_quarterly.index[handle['handle_start_idx']]
            handle_end_date = df_quarterly.index[min(handle['handle_bottom_idx'] + 2, len(df_quarterly) - 1)]
            ax2.axvspan(handle_start_date, handle_end_date, alpha=0.15, color='orange')

        ax2.set_xlabel('Date', fontsize=11)
        ax2.set_ylabel('Price ($)', fontsize=11)
        ax2.set_title(f'{ticker} - Daily Chart (Reference)', fontsize=13, fontweight='bold')
        ax2.legend(loc='upper left', fontsize=9)
        ax2.grid(True, alpha=0.3)

        # 出来高チャート（3ヶ月足）
        ax3 = fig.add_subplot(gs[2, 0])
        ax3.bar(df_quarterly.index, df_quarterly['Volume'], color='gray', alpha=0.5)
        ax3.axvspan(cup_start_date, cup_end_date, alpha=0.1, color='blue')
        if handle:
            ax3.axvspan(handle_start_date, handle_end_date, alpha=0.15, color='orange')
        ax3.set_xlabel('Date', fontsize=11)
        ax3.set_ylabel('Volume', fontsize=11)
        ax3.set_title('Quarterly Volume', fontsize=12, fontweight='bold')
        ax3.grid(True, alpha=0.3, axis='y')

        # 価格変動率（3ヶ月足）
        ax4 = fig.add_subplot(gs[2, 1])
        returns = df_quarterly['Close'].pct_change() * 100
        colors = ['green' if r >= 0 else 'red' for r in returns]
        ax4.bar(df_quarterly.index, returns, color=colors, alpha=0.6)
        ax4.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
        ax4.axvspan(cup_start_date, cup_end_date, alpha=0.1, color='blue')
        if handle:
            ax4.axvspan(handle_start_date, handle_end_date, alpha=0.15, color='orange')
        ax4.set_xlabel('Date', fontsize=11)
        ax4.set_ylabel('Quarterly Return (%)', fontsize=11)
        ax4.set_title('Quarterly Returns', fontsize=12, fontweight='bold')
        ax4.grid(True, alpha=0.3, axis='y')

        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"図を保存しました: {save_path}")
        else:
            plt.show()

        plt.close()

    def screen_etfs(self, tickers, period='max', min_score=30):
        """
        複数のETFをスクリーニング

        パラメータ:
            tickers: ティッカーシンボルのリスト
            period: データ取得期間
            min_score: 最小スコア

        戻り値:
            list: 検出結果のリスト
        """
        results = []

        print(f"スクリーニング開始: {len(tickers)} ETF (3ヶ月足解析)")
        print("=" * 100)

        for i, ticker in enumerate(tickers, 1):
            print(f"[{i}/{len(tickers)}] {ticker:8} を分析中...", end=" ")

            result = self.detect_pattern(ticker, period)

            if result['pattern_found']:
                pattern_type = result.get('pattern_type', 'unknown')
                if result['score'] >= min_score:
                    cup = result['cup']
                    handle = result.get('handle')
                    if handle:
                        print(f"✓ カップ+ハンドル検出! スコア: {result['score']:.1f} "
                              f"(カップ: {cup['cup_duration_years']:.1f}年 {cup['cup_depth']*100:.0f}%, "
                              f"ハンドル: {handle['handle_duration_years']:.1f}年 {handle['handle_depth']*100:.0f}%)")
                    else:
                        print(f"○ カップのみ検出 スコア: {result['score']:.1f} "
                              f"(期間: {cup['cup_duration_years']:.1f}年, 深さ: {cup['cup_depth']*100:.0f}%)")
                    results.append(result)
                else:
                    print(f"△ パターンあるもスコア低い ({result['score']:.1f})")
            else:
                print(f"× {result.get('message', 'パターンなし')}")

        print("=" * 100)
        print(f"完了: {len(results)} ETFでパターンを検出")

        # スコアでソート
        results.sort(key=lambda x: x['score'], reverse=True)

        return results


def main():
    """メイン関数"""

    # 検出器を初期化（長期パターン用のパラメータ）
    detector = CupHandleDetectorV2(
        cup_depth_min=0.15,           # 15%以上
        cup_depth_max=0.70,           # 70%以下
        handle_depth_min=0.05,        # 5%以上
        handle_depth_max=0.25,        # 25%以下
        cup_quarters_min=8,           # 最小2年
        cup_quarters_max=80,          # 最大20年
        handle_quarters_min=2,        # 最小0.5年
        handle_quarters_max=16        # 最大4年
    )

    # スクリーニング対象のETF
    etfs = [
        # 株式インデックス
        'SPY',   # S&P 500
        'QQQ',   # NASDAQ 100
        'DIA',   # Dow Jones
        'IWM',   # Russell 2000
        'VTI',   # Total Stock Market
        'EEM',   # Emerging Markets
        'EFA',   # EAFE (先進国除く米国)
        'VEA',   # FTSE Developed Markets

        # コモディティ
        'GLD',   # Gold
        'SLV',   # Silver
        'USO',   # Oil
        'DBC',   # Commodities
        'PDBC',  # Optimum Yield Diversified Commodity

        # 債券
        'TLT',   # 20+ Year Treasury
        'IEF',   # 7-10 Year Treasury
        'SHY',   # 1-3 Year Treasury
        'AGG',   # Aggregate Bond
        'LQD',   # Investment Grade Corporate
        'HYG',   # High Yield Corporate
        'TIP',   # TIPS

        # セクター
        'XLF',   # Financials
        'XLE',   # Energy
        'XLK',   # Technology
        'XLV',   # Health Care
        'XLI',   # Industrials
    ]

    # スクリーニング実行
    results = detector.screen_etfs(etfs, period='max', min_score=30)

    # 結果を表示
    if results:
        print("\n" + "=" * 100)
        print("カップウィズハンドルパターン検出結果（3ヶ月足解析）")
        print("=" * 100)
        print(f"{'順位':<6} {'銘柄':<8} {'タイプ':<18} {'スコア':<8} {'カップ深さ':<12} "
              f"{'カップ期間':<15} {'ハンドル深さ':<14} {'ハンドル期間':<12}")
        print("-" * 100)

        for i, result in enumerate(results, 1):
            cup = result['cup']
            handle = result.get('handle')
            pattern_type = result.get('pattern_type', 'unknown')

            if handle:
                print(f"{i:<6} {result['ticker']:<8} {'Cup+Handle':<18} {result['score']:>6.1f}  "
                      f"{cup['cup_depth']*100:>10.1f}%  {cup['cup_duration_years']:>10.1f}年  "
                      f"{handle['handle_depth']*100:>12.1f}%  {handle['handle_duration_years']:>10.1f}年")
            else:
                print(f"{i:<6} {result['ticker']:<8} {'Cup Only':<18} {result['score']:>6.1f}  "
                      f"{cup['cup_depth']*100:>10.1f}%  {cup['cup_duration_years']:>10.1f}年  "
                      f"{'---':>12}  {'---':>10}")

        # トップ10の銘柄を可視化
        print("\n" + "=" * 100)
        print("トップ10 ETFのチャートを生成中...")
        print("=" * 100)

        for i, result in enumerate(results[:10], 1):
            save_path = f"/home/user/ClaudeCode/cup_handle_v2_{result['ticker']}.png"
            detector.visualize_pattern(result, save_path=save_path)

        # サマリーレポート
        print("\n" + "=" * 100)
        print("サマリーレポート")
        print("=" * 100)
        print(f"スクリーニング対象: {len(etfs)} ETF")
        print(f"パターン検出: {len(results)} ETF")
        print(f"検出率: {len(results)/len(etfs)*100:.1f}%")

        if results:
            scores = [r['score'] for r in results]
            print(f"\nスコア統計:")
            print(f"  最高: {max(scores):.1f}")
            print(f"  平均: {np.mean(scores):.1f}")
            print(f"  最低: {min(scores):.1f}")

            cup_with_handle = [r for r in results if r.get('handle') is not None]
            cup_only = [r for r in results if r.get('handle') is None]
            print(f"\nパターンタイプ:")
            print(f"  カップ+ハンドル: {len(cup_with_handle)} ETF")
            print(f"  カップのみ: {len(cup_only)} ETF")

            print(f"\n最も有望なETF (トップ5):")
            for i, result in enumerate(results[:5], 1):
                pattern_desc = "カップ+ハンドル" if result.get('handle') else "カップのみ"
                print(f"  {i}. {result['ticker']} ({pattern_desc}) - スコア: {result['score']:.1f}")
    else:
        print("\nカップウィズハンドルパターンを持つETFは見つかりませんでした。")
        print("パラメータを調整するか、別の期間で試してください。")


if __name__ == '__main__':
    main()
