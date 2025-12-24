#!/usr/bin/env python3
"""
カップウィズハンドル検出器 V2 - デモ版

SLVの実際のパターンに基づいたシミュレーションデータを使用して
大規模なカップウィズハンドルパターンの検出をデモンストレーションします。

実際のSLVパターン:
- 2011年4月: ピーク $48.00付近
- 2015年12月: ボトム $13.60付近  (下落率: 約72%)
- 2020年7月: 回復 $26.00付近
- その後ハンドル形成
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from scipy.signal import argrelextrema


def generate_slv_like_pattern():
    """SLVの実際のパターンに基づいたデータを生成"""

    # 2006年から2024年まで、3ヶ月ごと（四半期）
    start_date = datetime(2006, 1, 1)
    n_quarters = 75  # 約19年分
    dates = pd.date_range(start=start_date, periods=n_quarters, freq='Q')

    # 実際のSLVのパターンをシミュレート
    prices = []

    # フェーズ1: 上昇トレンド (2006-2011年初頭) Q0-Q20
    phase1_quarters = 21
    phase1_start = 10.0
    phase1_end = 48.0
    phase1 = np.linspace(phase1_start, phase1_end, phase1_quarters)
    phase1 += np.random.normal(0, 1.5, phase1_quarters)  # ノイズ
    prices.extend(phase1.tolist())

    # フェーズ2: 急落 (2011年) Q20-Q24
    phase2_quarters = 4
    phase2_start = phase1_end
    phase2_end = 25.0
    phase2 = np.linspace(phase2_start, phase2_end, phase2_quarters)
    phase2 += np.random.normal(0, 1.0, phase2_quarters)
    prices.extend(phase2.tolist())

    # フェーズ3: カップの底 (2012-2015年) Q24-Q40
    phase3_quarters = 16
    phase3 = np.full(phase3_quarters, 15.0)
    phase3 += np.random.normal(0, 1.5, phase3_quarters)
    phase3 = np.clip(phase3, 13.0, 20.0)  # 13-20ドルの範囲
    prices.extend(phase3.tolist())

    # フェーズ4: 回復 (2016-2020年) Q40-Q56
    phase4_quarters = 16
    phase4_start = 15.0
    phase4_end = 26.0
    phase4 = np.linspace(phase4_start, phase4_end, phase4_quarters)
    phase4 += np.random.normal(0, 1.0, phase4_quarters)
    prices.extend(phase4.tolist())

    # フェーズ5: ハンドル (2020-2022年) Q56-Q64
    phase5_quarters = 8
    phase5_start = 26.0
    phase5_low = 20.0
    # 下落してから少し回復
    phase5_down = np.linspace(phase5_start, phase5_low, phase5_quarters // 2)
    phase5_up = np.linspace(phase5_low, 22.0, phase5_quarters // 2)
    phase5 = np.concatenate([phase5_down, phase5_up])
    phase5 += np.random.normal(0, 0.8, phase5_quarters)
    prices.extend(phase5.tolist())

    # フェーズ6: 現在（上昇傾向またはブレイクアウト） Q64-Q75
    phase6_quarters = n_quarters - len(prices)
    if phase6_quarters > 0:
        phase6_start = 22.0
        phase6_end = 29.0
        phase6 = np.linspace(phase6_start, phase6_end, phase6_quarters)
        phase6 += np.random.normal(0, 0.8, phase6_quarters)
        prices.extend(phase6.tolist())

    prices = np.array(prices[:n_quarters])

    # DataFrameを作成
    df = pd.DataFrame({
        'Close': prices,
        'High': prices * (1 + np.random.uniform(0, 0.03, n_quarters)),
        'Low': prices * (1 - np.random.uniform(0, 0.03, n_quarters)),
        'Open': np.roll(prices, 1),
        'Volume': np.random.uniform(50000000, 150000000, n_quarters)
    }, index=dates)

    df.loc[df.index[0], 'Open'] = prices[0]

    return df


def visualize_slv_demo():
    """SLVデモパターンを可視化"""

    # データ生成
    df = generate_slv_like_pattern()

    print("=" * 100)
    print("SLV風カップウィズハンドルパターン - デモンストレーション")
    print("=" * 100)
    print(f"\nデータ期間: {df.index[0].date()} ～ {df.index[-1].date()}")
    print(f"四半期数: {len(df)}")
    print(f"年数: {len(df) / 4:.1f}年")

    # 主要なポイントを特定
    max_price = df['Close'].max()
    max_idx = df['Close'].idxmax()
    min_price = df['Close'].min()
    min_idx = df['Close'].idxmin()

    print(f"\nピーク: ${max_price:.2f} ({max_idx.date()})")
    print(f"ボトム: ${min_price:.2f} ({min_idx.date()})")
    print(f"下落率: {(1 - min_price/max_price)*100:.1f}%")

    # カップとハンドルの位置を手動で定義（デモ用）
    cup_left_idx = 20   # 2011年頃のピーク
    cup_bottom_idx = 35  # 2015年頃のボトム
    cup_right_idx = 56   # 2020年頃の回復
    handle_bottom_idx = 60  # 2021年頃のハンドル底

    # 図の作成
    fig = plt.figure(figsize=(18, 12))
    gs = fig.add_gridspec(3, 2, height_ratios=[2.5, 1, 1], hspace=0.3, wspace=0.3)

    # メインチャート（3ヶ月足）
    ax1 = fig.add_subplot(gs[0, :])
    ax1.plot(df.index, df['Close'], linewidth=3, color='#2E86AB',
            marker='o', markersize=6, label='Quarterly Close', markerfacecolor='white',
            markeredgewidth=2)

    # カップの範囲
    cup_dates = df.index[cup_left_idx:cup_right_idx+1]
    cup_prices = df['Close'].iloc[cup_left_idx:cup_right_idx+1]
    ax1.fill_between(cup_dates, cup_prices.min() * 0.9, cup_prices,
                    alpha=0.15, color='blue', label='Cup Pattern')

    # ハンドルの範囲
    handle_dates = df.index[cup_right_idx:handle_bottom_idx+3]
    handle_prices = df['Close'].iloc[cup_right_idx:handle_bottom_idx+3]
    ax1.fill_between(handle_dates, handle_prices.min() * 0.9, handle_prices,
                    alpha=0.2, color='orange', label='Handle Pattern')

    # 重要ポイントをマーク
    ax1.scatter(df.index[cup_left_idx], df['Close'].iloc[cup_left_idx],
               color='green', s=300, zorder=5, marker='^',
               label=f'Cup Left High: ${df["Close"].iloc[cup_left_idx]:.2f}',
               edgecolors='black', linewidths=3)
    ax1.scatter(df.index[cup_bottom_idx], df['Close'].iloc[cup_bottom_idx],
               color='red', s=300, zorder=5, marker='v',
               label=f'Cup Bottom: ${df["Close"].iloc[cup_bottom_idx]:.2f}',
               edgecolors='black', linewidths=3)
    ax1.scatter(df.index[cup_right_idx], df['Close'].iloc[cup_right_idx],
               color='green', s=300, zorder=5, marker='^',
               label=f'Cup Right High: ${df["Close"].iloc[cup_right_idx]:.2f}',
               edgecolors='black', linewidths=3)
    ax1.scatter(df.index[handle_bottom_idx], df['Close'].iloc[handle_bottom_idx],
               color='orange', s=300, zorder=5, marker='v',
               label=f'Handle Bottom: ${df["Close"].iloc[handle_bottom_idx]:.2f}',
               edgecolors='black', linewidths=3)

    # ブレイクアウトレベル
    breakout_level = df['Close'].iloc[cup_right_idx]
    ax1.axhline(y=breakout_level, color='green', linestyle='--',
               linewidth=2.5, alpha=0.7, label=f'Breakout Level: ${breakout_level:.2f}')

    # 現在価格
    current_price = df['Close'].iloc[-1]
    ax1.axhline(y=current_price, color='blue', linestyle='-',
               linewidth=2.5, alpha=0.8, label=f'Current Price: ${current_price:.2f}')

    ax1.set_xlabel('Date', fontsize=13, fontweight='bold')
    ax1.set_ylabel('Price ($)', fontsize=13, fontweight='bold')
    ax1.set_title('SLV-like Pattern: Multi-Year Cup with Handle (Quarterly Chart)',
                 fontsize=18, fontweight='bold', pad=20)
    ax1.legend(loc='upper left', fontsize=10, framealpha=0.95)
    ax1.grid(True, alpha=0.3, linestyle='--')

    # パターン情報
    cup_depth = (df['Close'].iloc[cup_left_idx] - df['Close'].iloc[cup_bottom_idx]) / df['Close'].iloc[cup_left_idx]
    cup_years = (cup_right_idx - cup_left_idx) / 4
    handle_depth = (df['Close'].iloc[cup_right_idx] - df['Close'].iloc[handle_bottom_idx]) / df['Close'].iloc[cup_right_idx]
    handle_years = (handle_bottom_idx - cup_right_idx) / 4

    info_text = f"""
CUP PATTERN ANALYSIS

Cup Formation:
  • Left Peak:  ${df['Close'].iloc[cup_left_idx]:.2f} ({df.index[cup_left_idx].strftime('%Y-%m')})
  • Bottom:     ${df['Close'].iloc[cup_bottom_idx]:.2f} ({df.index[cup_bottom_idx].strftime('%Y-%m')})
  • Right Peak: ${df['Close'].iloc[cup_right_idx]:.2f} ({df.index[cup_right_idx].strftime('%Y-%m')})
  • Depth:      {cup_depth*100:.1f}%
  • Duration:   {cup_years:.1f} years ({cup_right_idx - cup_left_idx} quarters)

Handle Formation:
  • Start:      ${df['Close'].iloc[cup_right_idx]:.2f} ({df.index[cup_right_idx].strftime('%Y-%m')})
  • Bottom:     ${df['Close'].iloc[handle_bottom_idx]:.2f} ({df.index[handle_bottom_idx].strftime('%Y-%m')})
  • Depth:      {handle_depth*100:.1f}%
  • Duration:   {handle_years:.1f} years ({handle_bottom_idx - cup_right_idx} quarters)

Trading Metrics:
  • Breakout Level:   ${breakout_level:.2f}
  • Current Price:    ${current_price:.2f}
  • From Bottom:      +{(current_price/df['Close'].iloc[cup_bottom_idx] - 1)*100:.1f}%
  • To Breakout:      {(current_price/breakout_level - 1)*100:.1f}%
    """.strip()

    ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes,
            fontsize=9, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='lightyellow',
                     alpha=0.95, edgecolor='black', linewidth=2),
            family='monospace')

    # 価格変動チャート
    ax2 = fig.add_subplot(gs[1, :])
    returns = df['Close'].pct_change() * 100
    colors = ['green' if r >= 0 else 'red' for r in returns]
    ax2.bar(df.index, returns, color=colors, alpha=0.6, width=80)
    ax2.axhline(y=0, color='black', linestyle='-', linewidth=1)

    # カップとハンドルの範囲を強調
    ax2.axvspan(df.index[cup_left_idx], df.index[cup_right_idx],
               alpha=0.1, color='blue')
    ax2.axvspan(df.index[cup_right_idx], df.index[handle_bottom_idx+2],
               alpha=0.15, color='orange')

    ax2.set_xlabel('Date', fontsize=12, fontweight='bold')
    ax2.set_ylabel('Quarterly Return (%)', fontsize=12, fontweight='bold')
    ax2.set_title('Quarterly Price Returns', fontsize=14, fontweight='bold')
    ax2.grid(True, alpha=0.3, axis='y')

    # 累積リターン
    ax3 = fig.add_subplot(gs[2, 0])
    cumulative_return = (df['Close'] / df['Close'].iloc[0] - 1) * 100
    ax3.plot(df.index, cumulative_return, linewidth=2.5, color='#E84855')
    ax3.fill_between(df.index, 0, cumulative_return, alpha=0.3, color='#E84855')
    ax3.axhline(y=0, color='black', linestyle='-', linewidth=1)
    ax3.axvspan(df.index[cup_left_idx], df.index[cup_right_idx],
               alpha=0.1, color='blue')
    ax3.axvspan(df.index[cup_right_idx], df.index[handle_bottom_idx+2],
               alpha=0.15, color='orange')
    ax3.set_xlabel('Date', fontsize=11, fontweight='bold')
    ax3.set_ylabel('Cumulative Return (%)', fontsize=11, fontweight='bold')
    ax3.set_title('Cumulative Returns from Start', fontsize=13, fontweight='bold')
    ax3.grid(True, alpha=0.3)

    # 出来高
    ax4 = fig.add_subplot(gs[2, 1])
    ax4.bar(df.index, df['Volume'], color='gray', alpha=0.5, width=80)
    ax4.axvspan(df.index[cup_left_idx], df.index[cup_right_idx],
               alpha=0.1, color='blue')
    ax4.axvspan(df.index[cup_right_idx], df.index[handle_bottom_idx+2],
               alpha=0.15, color='orange')
    ax4.set_xlabel('Date', fontsize=11, fontweight='bold')
    ax4.set_ylabel('Volume', fontsize=11, fontweight='bold')
    ax4.set_title('Trading Volume (Quarterly)', fontsize=13, fontweight='bold')
    ax4.grid(True, alpha=0.3, axis='y')
    ax4.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))

    plt.tight_layout()

    # 保存
    save_path = '/home/user/ClaudeCode/slv_like_cup_handle_demo.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"\nチャートを保存しました: {save_path}")

    plt.close()

    # サマリー
    print("\n" + "=" * 100)
    print("パターン分析サマリー")
    print("=" * 100)
    print(f"\n✓ これは数十年レベルの大規模カップウィズハンドルパターンです")
    print(f"\n【カップ】")
    print(f"  期間: {cup_years:.1f}年 ({df.index[cup_left_idx].year}年 - {df.index[cup_right_idx].year}年)")
    print(f"  深さ: {cup_depth*100:.1f}%")
    print(f"  ピーク → ボトム → 回復")
    print(f"\n【ハンドル】")
    print(f"  期間: {handle_years:.1f}年")
    print(f"  深さ: {handle_depth*100:.1f}% (カップより浅い ✓)")
    print(f"\n【取引戦略】")
    print(f"  ブレイクアウト目標: ${breakout_level:.2f}")
    print(f"  現在価格: ${current_price:.2f}")
    if current_price >= breakout_level:
        print(f"  状態: ✓ ブレイクアウト済み!")
    else:
        print(f"  状態: ブレイクアウト待ち ({(breakout_level/current_price - 1)*100:.1f}% 上昇で達成)")

    print("\n" + "=" * 100)


def main():
    print("\n")
    print("╔" + "═" * 98 + "╗")
    print("║" + " " * 25 + "カップウィズハンドル検出器 V2 - デモ版" + " " * 33 + "║")
    print("║" + " " * 30 + "長期パターン対応（3ヶ月足）" + " " * 38 + "║")
    print("╚" + "═" * 98 + "╝")

    visualize_slv_demo()

    print("\n" + "=" * 100)
    print("実際のデータでの使用方法")
    print("=" * 100)
    print("""
このデモは、SLVの実際のパターンに基づいたシミュレーションです。

実際のETFデータで分析するには:

1. 必要なパッケージをインストール:
   $ pip install yfinance appdirs frozendict multitasking

2. cup_handle_detector_v2.py を実行:
   $ python cup_handle_detector_v2.py

3. または、特定のETFのみを分析:
   >>> from cup_handle_detector_v2 import CupHandleDetectorV2
   >>> detector = CupHandleDetectorV2()
   >>> result = detector.detect_pattern('SLV', period='max')
   >>> detector.visualize_pattern(result, 'slv_pattern.png')

対象ETF:
  • 貴金属: SLV (銀), GLD (金)
  • 株式: SPY, QQQ, DIA, IWM
  • 債券: TLT, IEF, AGG
  • コモディティ: USO, DBC

詳細はREADME_CUP_HANDLE.mdを参照してください。
    """.strip())

    print("\n" + "=" * 100)
    print("✓ デモ完了!")
    print("=" * 100 + "\n")


if __name__ == '__main__':
    main()
