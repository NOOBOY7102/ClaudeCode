#!/usr/bin/env python3
"""
カップウィズハンドル検出器 - デモ版

このスクリプトは、yfinanceをインストールせずに実行できるデモ版です。
サンプルデータを使用してパターン検出のアルゴリズムを実演します。
"""

import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
import pandas as pd


def generate_cup_handle_pattern(days=200, noise=0.02):
    """
    カップウィズハンドルパターンのサンプルデータを生成

    パラメータ:
        days: データポイント数
        noise: ノイズの大きさ

    戻り値:
        pandas.DataFrame: 生成された株価データ
    """
    # 日付を生成
    start_date = datetime.now() - timedelta(days=days)
    dates = pd.date_range(start=start_date, periods=days, freq='D')

    # ベース価格
    base_price = 100

    # カップパターンを生成
    cup_duration = int(days * 0.7)  # カップは全体の70%
    handle_duration = days - cup_duration  # 残りはハンドル

    # カップ部分（U字型）
    t_cup = np.linspace(0, np.pi, cup_duration)
    cup_pattern = base_price * (1 - 0.25 * np.sin(t_cup))  # 25%の下落

    # ハンドル部分（小さな下落）
    t_handle = np.linspace(0, np.pi/2, handle_duration)
    handle_pattern = cup_pattern[-1] * (1 - 0.08 * np.sin(t_handle))  # 8%の下落

    # 結合
    prices = np.concatenate([cup_pattern, handle_pattern])

    # ノイズを追加
    prices += np.random.normal(0, base_price * noise, days)

    # 出来高を生成（カップ形成中は低く、ハンドル終盤で増加）
    volume_base = 1000000
    volume = np.concatenate([
        volume_base * (1 + 0.3 * np.random.random(cup_duration)),
        volume_base * (1 + 0.5 * np.random.random(handle_duration - 10)),
        volume_base * (1.5 + 0.5 * np.random.random(10))  # 最後の10日は出来高増加
    ])

    # DataFrameを作成
    df = pd.DataFrame({
        'Close': prices,
        'High': prices * (1 + np.random.uniform(0, 0.02, days)),
        'Low': prices * (1 - np.random.uniform(0, 0.02, days)),
        'Open': np.roll(prices, 1),
        'Volume': volume
    }, index=dates)

    df['Open'][0] = prices[0]

    return df


def visualize_cup_handle_demo():
    """カップウィズハンドルパターンのデモを可視化"""

    # サンプルデータを生成
    df = generate_cup_handle_pattern(days=200, noise=0.015)

    # プロットの作成
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10),
                                    gridspec_kw={'height_ratios': [3, 1]})

    # 価格チャート
    ax1.plot(df.index, df['Close'], linewidth=2, color='#2E86AB', label='Close Price')

    # カップとハンドルの範囲を強調
    cup_end_idx = int(len(df) * 0.7)

    # カップ領域
    ax1.fill_between(df.index[:cup_end_idx],
                     df['Close'][:cup_end_idx].min(),
                     df['Close'][:cup_end_idx],
                     alpha=0.2, color='blue', label='Cup Pattern')

    # ハンドル領域
    ax1.fill_between(df.index[cup_end_idx:],
                     df['Close'][cup_end_idx:].min(),
                     df['Close'][cup_end_idx:],
                     alpha=0.2, color='orange', label='Handle Pattern')

    # 重要なポイントをマーク
    left_high_idx = 0
    bottom_idx = int(len(df) * 0.35)  # カップの底
    right_high_idx = cup_end_idx
    handle_bottom_idx = int(len(df) * 0.85)

    ax1.scatter(df.index[left_high_idx], df['Close'].iloc[left_high_idx],
               color='green', s=150, zorder=5, marker='^', label='Cup Left High')
    ax1.scatter(df.index[bottom_idx], df['Close'].iloc[bottom_idx],
               color='red', s=150, zorder=5, marker='v', label='Cup Bottom')
    ax1.scatter(df.index[right_high_idx], df['Close'].iloc[right_high_idx],
               color='green', s=150, zorder=5, marker='^', label='Cup Right High')
    ax1.scatter(df.index[handle_bottom_idx], df['Close'].iloc[handle_bottom_idx],
               color='orange', s=150, zorder=5, marker='v', label='Handle Bottom')

    # ブレイクアウトラインを追加
    breakout_price = df['Close'].iloc[right_high_idx]
    ax1.axhline(y=breakout_price, color='green', linestyle='--',
               linewidth=2, alpha=0.7, label=f'Breakout Level: ${breakout_price:.2f}')

    ax1.set_xlabel('Date', fontsize=12)
    ax1.set_ylabel('Price ($)', fontsize=12)
    ax1.set_title('Cup with Handle Pattern - Demo Example',
                 fontsize=16, fontweight='bold', pad=15)
    ax1.legend(loc='upper left', fontsize=9)
    ax1.grid(True, alpha=0.3)

    # パターン情報を追加
    cup_depth = (df['Close'].iloc[left_high_idx] - df['Close'].iloc[bottom_idx]) / df['Close'].iloc[left_high_idx]
    handle_depth = (df['Close'].iloc[right_high_idx] - df['Close'].iloc[handle_bottom_idx]) / df['Close'].iloc[right_high_idx]

    info_text = f"""
Pattern Characteristics:

Cup Formation:
  • Depth: {cup_depth*100:.1f}%
  • Duration: ~{cup_end_idx} days
  • Shape: U-shaped (symmetrical)

Handle Formation:
  • Depth: {handle_depth*100:.1f}%
  • Duration: ~{len(df) - cup_end_idx} days
  • Shape: Downward drift

Breakout Price: ${breakout_price:.2f}
Current Price: ${df['Close'].iloc[-1]:.2f}
    """.strip()

    ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes,
            fontsize=9, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.9),
            family='monospace')

    # 出来高チャート
    colors = ['red' if df['Close'].iloc[i] < df['Open'].iloc[i] else 'green'
              for i in range(len(df))]
    ax2.bar(df.index, df['Volume'], color=colors, alpha=0.6)

    # カップとハンドルの範囲を強調
    ax2.axvspan(df.index[0], df.index[cup_end_idx], alpha=0.15, color='blue')
    ax2.axvspan(df.index[cup_end_idx], df.index[-1], alpha=0.15, color='orange')

    ax2.set_xlabel('Date', fontsize=12)
    ax2.set_ylabel('Volume', fontsize=12)
    ax2.set_title('Trading Volume (Lower volume during cup, increases at breakout)',
                 fontsize=12, fontweight='bold')
    ax2.grid(True, alpha=0.3, axis='y')

    # 出来高のトレンドを表示
    window = 20
    volume_ma = df['Volume'].rolling(window=window).mean()
    ax2.plot(df.index, volume_ma, color='black', linewidth=2,
            label=f'{window}-day MA', alpha=0.7)
    ax2.legend(loc='upper left', fontsize=9)

    plt.tight_layout()

    # 保存
    save_path = '/home/user/ClaudeCode/cup_handle_demo.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"\n✓ デモチャートを保存しました: {save_path}")

    plt.close()


def print_pattern_explanation():
    """カップウィズハンドルパターンの説明を表示"""

    print("=" * 80)
    print("カップウィズハンドル（Cup with Handle）パターン 解説")
    print("=" * 80)

    print("\n【パターンの概要】")
    print("-" * 80)
    print("""
カップウィズハンドルは、強気の継続パターンで、上昇トレンド中の一時的な
調整後、再び上昇する際に形成されます。伝説的なトレーダー、ウィリアム・
オニールによって広められました。
    """.strip())

    print("\n【パターンの構成】")
    print("-" * 80)
    print("""
1. カップ部分（Cup）
   ├─ U字型またはV字型の価格調整
   ├─ 理想的な深さ: 12-33%（深すぎると弱気）
   ├─ 期間: 7週間〜1年（通常3-6ヶ月）
   └─ 左右の高値がほぼ同水準

2. ハンドル部分（Handle）
   ├─ カップ右端からの小さな下落
   ├─ 理想的な深さ: 5-15%（カップより浅い）
   ├─ 期間: 1-4週間
   └─ 通常は下向きまたは横ばいトレンド

3. ブレイクアウト
   ├─ ハンドル上限を価格が突破
   ├─ 出来高の増加を伴う（重要！）
   └─ 買いシグナルとなる
    """.strip())

    print("\n【パターンの心理】")
    print("-" * 80)
    print("""
• カップ形成: 利益確定売りや市場調整による価格下落、その後の回復
• ハンドル形成: 最後の弱気筋の売り、強い投資家による買い増し
• ブレイクアウト: 抵抗線突破、新たな買いの波が始まる
    """.strip())

    print("\n【成功のポイント】")
    print("-" * 80)
    print("""
✓ カップは深すぎない（12-33%が理想、50%超は要注意）
✓ ハンドルはカップより浅い（通常1/3以下）
✓ 出来高パターン: カップ形成中は減少、ブレイクアウト時は急増
✓ 全体の市場環境が上昇トレンドであること
✓ 強いファンダメンタルズ（収益成長、新製品など）
    """.strip())

    print("\n【取引戦略】")
    print("-" * 80)
    print("""
• エントリー: ハンドル上限のブレイクアウト + 出来高増加
• ストップロス: ハンドルの底値の少し下
• 利益目標: カップの深さと同じだけ上昇すると予想
  （例: カップが20%なら、ブレイクアウトから20%上昇）
    """.strip())

    print("\n【著名な成功例】")
    print("-" * 80)
    print("""
• Apple (AAPL): 2003-2004年
• Amazon (AMZN): 2005-2006年
• Netflix (NFLX): 2009-2010年
• Tesla (TSLA): 2019-2020年
    """.strip())

    print("\n" + "=" * 80)


def main():
    """メイン関数"""

    print("\n")
    print("╔" + "═" * 78 + "╗")
    print("║" + " " * 18 + "カップウィズハンドル検出器 - デモ版" + " " * 22 + "║")
    print("╚" + "═" * 78 + "╝")

    # パターンの説明を表示
    print_pattern_explanation()

    # デモチャートを生成
    print("\n" + "=" * 80)
    print("デモチャートを生成しています...")
    print("=" * 80)

    visualize_cup_handle_demo()

    print("\n" + "=" * 80)
    print("使い方")
    print("=" * 80)
    print("""
実際の株価データで分析するには:

1. 必要なパッケージをインストール:
   $ pip install -r requirements.txt

2. メインスクリプトを実行:
   $ python cup_handle_detector.py

3. または、Pythonスクリプトとして使用:
   >>> from cup_handle_detector import CupHandleDetector
   >>> detector = CupHandleDetector()
   >>> result = detector.detect_pattern('AAPL', period='2y')
   >>> detector.visualize_pattern(result, 'aapl_pattern.png')

詳細はREADME_CUP_HANDLE.mdを参照してください。
    """.strip())

    print("\n" + "=" * 80)
    print("✓ デモ完了!")
    print("=" * 80 + "\n")


if __name__ == '__main__':
    main()
