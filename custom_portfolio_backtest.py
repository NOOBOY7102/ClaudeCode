#!/usr/bin/env python3
"""
カスタムポートフォリオ バックテスト (2017-2024)
階層的均等配分: 4カテゴリ × 25%

ポートフォリオ構成:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【株式 25%】
  - SPY (S&P 500): 12.5%
  - QQQ (NASDAQ 100): 12.5%

【債券 25%】
  - VGLT (長期国債): 8.33%
  - IEF (中期国債 7-10年): 8.33%
  - SHV (短期国債 0-1年): 8.33%

【コモディティ 25%】
  - GLD (金): 12.5%
  - SLV (銀): 12.5%

【オルタナティブ 25%】
  - BTC (ビットコイン): 6.25%
  - ETH (イーサリアム): 6.25%
  - XRP (リップル): 6.25%
  - DOGE (ドージコイン): 6.25%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec

# 年次リターンデータ (2017-2024)
# 出典: Yahoo Finance, Morningstar, CoinMarketCap, CryptoRank

annual_returns = {
    # 株式 (Equities)
    'SPY': {
        2017: 21.70, 2018: -4.56, 2019: 31.22, 2020: 18.37,
        2021: 28.75, 2022: -18.17, 2023: 26.19, 2024: 24.89
    },
    'QQQ': {
        2017: 32.70, 2018: -0.10, 2019: 39.00, 2020: 48.60,
        2021: 27.40, 2022: -32.60, 2023: 56.42, 2024: 25.72
    },
    # 債券 (Bonds)
    'VGLT': {
        2017: 8.64, 2018: -1.53, 2019: 14.31, 2020: 17.57,
        2021: -4.98, 2022: -29.35, 2023: 3.29, 2024: -6.29
    },
    'IEF': {
        2017: 2.55, 2018: 0.99, 2019: 8.03, 2020: 10.01,
        2021: -3.33, 2022: -15.16, 2023: 3.64, 2024: -0.64
    },
    'SHV': {
        2017: 0.67, 2018: 1.72, 2019: 2.36, 2020: 0.81,
        2021: -0.10, 2022: 0.94, 2023: 5.04, 2024: 5.13
    },
    # コモディティ (Commodities)
    'GLD': {
        2017: 13.00, 2018: -2.00, 2019: 18.30, 2020: 24.80,
        2021: -4.10, 2022: 0.00, 2023: 13.10, 2024: 26.50
    },
    'SLV': {
        2017: 5.80, 2018: -9.40, 2019: 15.30, 2020: 47.40,
        2021: -12.10, 2022: 3.00, 2023: 0.00, 2024: 21.50
    },
    # オルタナティブ (Alternatives) - 仮想通貨
    'BTC': {
        2017: 1318.00, 2018: -72.00, 2019: 95.00, 2020: 305.00,
        2021: 59.00, 2022: -64.00, 2023: 154.57, 2024: 111.39
    },
    'ETH': {
        2017: 2571.23, 2018: -82.00, 2019: -8.02, 2020: 466.61,
        2021: 402.85, 2022: -68.26, 2023: 90.10, 2024: 41.57
    },
    'XRP': {
        2017: 18410.80, 2018: -69.95, 2019: -45.87, 2020: 166.35,
        2021: 83.32, 2022: -63.17, 2023: 76.50, 2024: 266.89
    },
    'DOGE': {
        2017: 1400.00, 2018: -26.00, 2019: -10.00, 2020: 130.00,
        2021: 3596.00, 2022: -59.00, 2023: 29.00, 2024: 252.00
    },
}

# カテゴリ定義
categories = {
    'Equities (25%)': {
        'assets': ['SPY', 'QQQ'],
        'weight': 0.25,
        'color': '#2E86AB'
    },
    'Bonds (25%)': {
        'assets': ['VGLT', 'IEF', 'SHV'],
        'weight': 0.25,
        'color': '#A23B72'
    },
    'Commodities (25%)': {
        'assets': ['GLD', 'SLV'],
        'weight': 0.25,
        'color': '#F18F01'
    },
    'Alternatives (25%)': {
        'assets': ['BTC', 'ETH', 'XRP', 'DOGE'],
        'weight': 0.25,
        'color': '#C73E1D'
    }
}

# 各資産のウェイトを計算
asset_weights = {}
for cat_name, cat_info in categories.items():
    n_assets = len(cat_info['assets'])
    weight_per_asset = cat_info['weight'] / n_assets
    for asset in cat_info['assets']:
        asset_weights[asset] = weight_per_asset

years = list(range(2017, 2025))

def calculate_portfolio_return(weights, returns_dict, year):
    """ポートフォリオの年次リターンを計算"""
    total_return = 0
    for asset, weight in weights.items():
        asset_return = returns_dict[asset].get(year, 0) / 100
        total_return += weight * asset_return
    return total_return * 100

def calculate_category_return(category_assets, returns_dict, year):
    """カテゴリの年次リターンを計算（均等配分）"""
    n = len(category_assets)
    total_return = 0
    for asset in category_assets:
        asset_return = returns_dict[asset].get(year, 0) / 100
        total_return += asset_return / n
    return total_return * 100

# ポートフォリオ定義
portfolios = {
    'Hierarchical EW\n(4 Categories x 25%)': asset_weights,
    'SPY Only\n(Benchmark)': {'SPY': 1.0},
    'Traditional 60/40\n(SPY/IEF)': {'SPY': 0.6, 'IEF': 0.4},
    'Equities Only\n(SPY+QQQ)': {'SPY': 0.5, 'QQQ': 0.5},
}

# バックテスト実行
results = {name: {'returns': [], 'cumulative': [100]} for name in portfolios}
category_returns = {cat: [] for cat in categories}

for year in years:
    # 各ポートフォリオのリターン計算
    for name, weights in portfolios.items():
        ret = calculate_portfolio_return(weights, annual_returns, year)
        results[name]['returns'].append(ret)
        prev_value = results[name]['cumulative'][-1]
        new_value = prev_value * (1 + ret / 100)
        results[name]['cumulative'].append(new_value)

    # カテゴリ別リターン計算
    for cat_name, cat_info in categories.items():
        cat_ret = calculate_category_return(cat_info['assets'], annual_returns, year)
        category_returns[cat_name].append(cat_ret)

# 統計計算
def calculate_stats(returns, cumulative):
    returns_decimal = [r/100 for r in returns]
    cagr = (cumulative[-1] / 100) ** (1/len(returns)) - 1
    volatility = np.std(returns_decimal) * 100
    sharpe = (cagr * 100) / volatility if volatility > 0 else 0
    max_dd = min(returns)
    total_return = cumulative[-1] - 100
    return {
        'CAGR': cagr * 100,
        'Vol': volatility,
        'Sharpe': sharpe,
        'MaxDD': max_dd,
        'Total': total_return
    }

# 図の作成
plt.rcParams['font.family'] = ['DejaVu Sans', 'sans-serif']
fig = plt.figure(figsize=(16, 14))
gs = GridSpec(3, 2, figure=fig, height_ratios=[1.2, 1, 1.2])

# ========== 1. ポートフォリオ構成表示 (左上) ==========
ax1 = fig.add_subplot(gs[0, 0])
ax1.set_xlim(0, 10)
ax1.set_ylim(0, 10)
ax1.axis('off')
ax1.set_title('Portfolio Composition (Hierarchical Equal Weight)', fontsize=14, fontweight='bold', pad=10)

# カテゴリごとに表示
y_pos = 9.5
for cat_name, cat_info in categories.items():
    # カテゴリ名
    ax1.text(0.5, y_pos, cat_name, fontsize=12, fontweight='bold',
             color=cat_info['color'], va='top')
    y_pos -= 0.5

    # 各資産
    n_assets = len(cat_info['assets'])
    weight_per_asset = cat_info['weight'] / n_assets * 100
    for asset in cat_info['assets']:
        ax1.text(1.0, y_pos, f"  {asset}: {weight_per_asset:.2f}%",
                fontsize=10, va='top', color='#333333')
        y_pos -= 0.4
    y_pos -= 0.3

# 合計
ax1.text(0.5, y_pos, f"━" * 30, fontsize=10, va='top')
y_pos -= 0.5
ax1.text(0.5, y_pos, f"Total: 100%", fontsize=11, fontweight='bold', va='top')

# ========== 2. 累積リターン (右上) ==========
ax2 = fig.add_subplot(gs[0, 1])
colors_portfolio = ['#2E86AB', '#E84855', '#F9A825', '#4CAF50']
for i, (name, data) in enumerate(results.items()):
    ax2.plot(range(2016, 2025), data['cumulative'],
             label=name.replace('\n', ' '), linewidth=2.5, color=colors_portfolio[i])
ax2.set_xlabel('Year', fontsize=11)
ax2.set_ylabel('Portfolio Value ($100 start)', fontsize=11)
ax2.set_title('Cumulative Returns (2017-2024)', fontsize=14, fontweight='bold')
ax2.legend(loc='upper left', fontsize=9)
ax2.grid(True, alpha=0.3)
ax2.set_xticks(range(2016, 2025))

# ========== 3. カテゴリ別リターン推移 (左中) ==========
ax3 = fig.add_subplot(gs[1, 0])
for cat_name, cat_info in categories.items():
    ax3.plot(years, category_returns[cat_name],
             label=cat_name, linewidth=2, color=cat_info['color'], marker='o')
ax3.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
ax3.set_xlabel('Year', fontsize=11)
ax3.set_ylabel('Annual Return (%)', fontsize=11)
ax3.set_title('Returns by Category (25% each)', fontsize=14, fontweight='bold')
ax3.legend(loc='upper right', fontsize=9)
ax3.grid(True, alpha=0.3)
ax3.set_xticks(years)

# ========== 4. 年次リターン比較 (右中) ==========
ax4 = fig.add_subplot(gs[1, 1])
x = np.arange(len(years))
width = 0.2
for i, (name, data) in enumerate(results.items()):
    # リターンが大きすぎる場合はクリップ
    returns_clipped = [min(max(r, -50), 100) for r in data['returns']]
    ax4.bar(x + i*width, returns_clipped, width,
            label=name.replace('\n', ' '), color=colors_portfolio[i], alpha=0.8)
ax4.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
ax4.set_xlabel('Year', fontsize=11)
ax4.set_ylabel('Annual Return (%)', fontsize=11)
ax4.set_title('Annual Returns Comparison (capped at -50% to 100%)', fontsize=14, fontweight='bold')
ax4.set_xticks(x + width * 1.5)
ax4.set_xticklabels(years)
ax4.legend(loc='upper right', fontsize=8)
ax4.grid(True, alpha=0.3, axis='y')

# ========== 5. 統計サマリー (下) ==========
ax5 = fig.add_subplot(gs[2, :])
ax5.axis('off')

# テーブルデータ
table_data = []
headers = ['Portfolio', 'CAGR', 'Volatility', 'Sharpe', 'Max DD', 'Total Return', 'Final Value']
for name, data in results.items():
    stats = calculate_stats(data['returns'], data['cumulative'])
    table_data.append([
        name.replace('\n', ' '),
        f"{stats['CAGR']:.1f}%",
        f"{stats['Vol']:.1f}%",
        f"{stats['Sharpe']:.2f}",
        f"{stats['MaxDD']:.1f}%",
        f"{stats['Total']:.0f}%",
        f"${data['cumulative'][-1]:.0f}"
    ])

table = ax5.table(cellText=table_data, colLabels=headers,
                  cellLoc='center', loc='upper center',
                  colWidths=[0.22, 0.1, 0.1, 0.1, 0.1, 0.12, 0.12])
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1.2, 1.8)

# ヘッダーの色
for i in range(len(headers)):
    table[(0, i)].set_facecolor('#2E86AB')
    table[(0, i)].set_text_props(color='white', fontweight='bold')

# 行の色分け
for i in range(1, len(table_data) + 1):
    for j in range(len(headers)):
        if i % 2 == 0:
            table[(i, j)].set_facecolor('#f0f0f0')

# 結論テキスト
conclusion_text = """
[Analysis Conclusions] (2017-2024 Backtest)

1. Hierarchical EW portfolio achieved extraordinary returns due to 2017 crypto bubble
   (BTC +1318%, ETH +2571%, XRP +18411%). However, volatility is extremely high.

2. 2022: Stocks (-18~-33%), Bonds (-15~-29%), Crypto (-60~-68%) all fell simultaneously.
   Only Commodities (GLD 0%, SLV +3%) provided hedge function.

3. The 25% allocation to Alternatives (crypto) brings large returns in bull markets,
   but deep drawdowns in bear markets. Adjust allocation based on risk tolerance.
"""
ax5.text(0.5, 0.25, conclusion_text, transform=ax5.transAxes, fontsize=10,
         verticalalignment='top', horizontalalignment='center',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5),
         family='monospace')

plt.tight_layout()
plt.savefig('/home/user/ClaudeCode/custom_portfolio_backtest.png', dpi=150, bbox_inches='tight')
plt.close()

# コンソール出力
print("=" * 80)
print("  カスタムポートフォリオ バックテスト結果 (2017-2024)")
print("=" * 80)

print("\n【ポートフォリオ構成】")
print("-" * 60)
for cat_name, cat_info in categories.items():
    print(f"\n{cat_name}")
    n_assets = len(cat_info['assets'])
    weight_per_asset = cat_info['weight'] / n_assets * 100
    for asset in cat_info['assets']:
        print(f"  - {asset}: {weight_per_asset:.2f}%")
print("-" * 60)
print("合計: 100%")

print("\n【累積リターン】$100投資した場合の2024年末価値:")
for name, data in results.items():
    print(f"  {name.replace(chr(10), ' '):<30}: ${data['cumulative'][-1]:,.0f}")

print("\n【統計サマリー】")
print(f"{'Portfolio':<35} {'CAGR':>8} {'Vol':>8} {'Sharpe':>8} {'MaxDD':>10} {'Total':>10}")
print("-" * 80)
for name, data in results.items():
    stats = calculate_stats(data['returns'], data['cumulative'])
    print(f"{name.replace(chr(10), ' '):<35} {stats['CAGR']:>7.1f}% {stats['Vol']:>7.1f}% {stats['Sharpe']:>8.2f} {stats['MaxDD']:>9.1f}% {stats['Total']:>9.0f}%")

print("\n【年次リターン詳細】")
print(f"{'Year':<6}", end="")
for name in results.keys():
    print(f"{name.replace(chr(10), ' '):<20}", end="")
print()
print("-" * 86)
for i, year in enumerate(years):
    print(f"{year:<6}", end="")
    for name, data in results.items():
        print(f"{data['returns'][i]:>18.1f}%", end=" ")
    print()

print("\n" + "=" * 80)
print(f"図を保存しました: /home/user/ClaudeCode/custom_portfolio_backtest.png")
