#!/usr/bin/env python3
"""
2025年12月時点の幅広い資産クラスを使った最適ポートフォリオ
逆ボラティリティ加重（Inverse Volatility Weighting）
"""

import numpy as np
import pandas as pd

# =============================================================================
# 拡張資産クラス（2025年12月時点で利用可能なETF）
# =============================================================================

ASSETS = {
    # 株式 - 地域分散
    'VTI': ('米国株式トータル', 0.12, 0.18),          # Vanguard Total Stock Market
    'VEA': ('先進国株式（除く米国）', 0.08, 0.17),    # Vanguard FTSE Developed Markets
    'VWO': ('新興国株式', 0.10, 0.22),                # Vanguard FTSE Emerging Markets

    # 株式 - ファクター
    'VTV': ('米国バリュー株', 0.10, 0.17),            # Vanguard Value
    'MTUM': ('米国モメンタム', 0.12, 0.20),           # iShares MSCI USA Momentum
    'USMV': ('米国低ボラティリティ', 0.09, 0.13),     # iShares MSCI USA Min Vol

    # 債券 - デュレーション分散
    'SHV': ('米国短期国債', 0.045, 0.01),             # iShares Short Treasury
    'IEF': ('米国中期国債 7-10年', 0.035, 0.08),      # iShares 7-10 Year Treasury
    'TLT': ('米国長期国債 20年+', 0.03, 0.16),        # iShares 20+ Year Treasury
    'TIPS': ('米国インフレ連動債', 0.04, 0.07),       # iShares TIPS Bond

    # 債券 - クレジット
    'LQD': ('米国投資適格社債', 0.05, 0.10),          # iShares Investment Grade Corporate
    'HYG': ('米国ハイイールド債', 0.065, 0.12),       # iShares High Yield Corporate
    'EMB': ('新興国債券', 0.06, 0.12),                # iShares J.P. Morgan USD EM Bond

    # 不動産
    'VNQ': ('米国REIT', 0.08, 0.20),                  # Vanguard Real Estate
    'VNQI': ('国際REIT', 0.07, 0.18),                 # Vanguard Global ex-US Real Estate

    # コモディティ
    'GLD': ('ゴールド', 0.08, 0.15),                  # SPDR Gold Shares
    'SLV': ('シルバー', 0.05, 0.28),                  # iShares Silver Trust
    'DBC': ('コモディティ総合', 0.04, 0.18),          # Invesco DB Commodity

    # オルタナティブ
    'BITO': ('ビットコイン先物', 0.40, 0.65),         # ProShares Bitcoin Strategy
    'ETHE': ('イーサリアム', 0.35, 0.75),             # Grayscale Ethereum Trust

    # トレンドフォロー/マネージドフューチャーズ
    'DBMF': ('マネージドフューチャーズ', 0.06, 0.12), # iMGP DBi Managed Futures
}

# 相関行列（主要な相関関係を定義）
# 簡略化のため、主要グループ間の相関を設定
def build_correlation_matrix(tickers):
    n = len(tickers)
    corr = np.eye(n)

    # 資産グループの定義
    us_equity = ['VTI', 'VTV', 'MTUM', 'USMV']
    intl_equity = ['VEA', 'VWO']
    govt_bonds = ['SHV', 'IEF', 'TLT', 'TIPS']
    credit_bonds = ['LQD', 'HYG', 'EMB']
    reits = ['VNQ', 'VNQI']
    commodities = ['GLD', 'SLV', 'DBC']
    crypto = ['BITO', 'ETHE']
    alternatives = ['DBMF']

    def set_corr(group1, group2, value):
        for t1 in group1:
            for t2 in group2:
                if t1 in tickers and t2 in tickers:
                    i, j = tickers.index(t1), tickers.index(t2)
                    corr[i, j] = corr[j, i] = value

    # グループ内相関
    set_corr(us_equity, us_equity, 0.85)
    set_corr(intl_equity, intl_equity, 0.80)
    set_corr(govt_bonds, govt_bonds, 0.70)
    set_corr(credit_bonds, credit_bonds, 0.75)
    set_corr(reits, reits, 0.70)
    set_corr(commodities, commodities, 0.50)
    set_corr(crypto, crypto, 0.85)

    # グループ間相関
    set_corr(us_equity, intl_equity, 0.75)
    set_corr(us_equity, govt_bonds, -0.20)
    set_corr(us_equity, credit_bonds, 0.50)
    set_corr(us_equity, reits, 0.65)
    set_corr(us_equity, commodities, 0.15)
    set_corr(us_equity, crypto, 0.35)
    set_corr(us_equity, alternatives, 0.05)

    set_corr(intl_equity, govt_bonds, -0.15)
    set_corr(intl_equity, commodities, 0.25)
    set_corr(intl_equity, crypto, 0.30)

    set_corr(govt_bonds, credit_bonds, 0.60)
    set_corr(govt_bonds, reits, 0.20)
    set_corr(govt_bonds, commodities, 0.10)
    set_corr(govt_bonds, crypto, -0.10)
    set_corr(govt_bonds, alternatives, -0.20)

    set_corr(credit_bonds, reits, 0.45)
    set_corr(commodities, crypto, 0.20)

    set_corr(['GLD'], ['SLV'], 0.80)
    set_corr(['GLD'], us_equity, 0.05)

    # 対角要素を1に戻す
    np.fill_diagonal(corr, 1.0)

    return corr

def inverse_volatility_weights(volatilities):
    """逆ボラティリティ加重"""
    inv_vol = 1.0 / np.array(volatilities)
    return inv_vol / inv_vol.sum()

def calculate_portfolio_stats(weights, returns, cov_matrix, rf=0.045):
    """ポートフォリオ統計"""
    port_return = weights @ returns
    port_vol = np.sqrt(weights @ cov_matrix @ weights)
    sharpe = (port_return - rf) / port_vol if port_vol > 0 else 0
    return port_return, port_vol, sharpe

def main():
    print("=" * 80)
    print("  2025年12月 拡張資産クラス最適ポートフォリオ")
    print("  逆ボラティリティ加重（Inverse Volatility Weighting）")
    print("=" * 80)

    tickers = list(ASSETS.keys())
    names = [ASSETS[t][0] for t in tickers]
    returns = np.array([ASSETS[t][1] for t in tickers])
    vols = np.array([ASSETS[t][2] for t in tickers])

    # 相関行列と共分散行列
    corr = build_correlation_matrix(tickers)
    cov = np.outer(vols, vols) * corr

    # 逆ボラティリティ加重
    weights = inverse_volatility_weights(vols)

    # 結果表示
    print("\n" + "=" * 80)
    print("  資産配分（逆ボラティリティ加重）")
    print("=" * 80)

    # ソートして表示
    sorted_idx = np.argsort(weights)[::-1]

    print(f"\n{'資産':<30}{'ティッカー':>10}{'ボラ':>8}{'配分':>10}")
    print("-" * 60)

    for i in sorted_idx:
        if weights[i] >= 0.01:  # 1%以上のみ表示
            bar = "█" * int(weights[i] * 50)
            print(f"{names[i]:<30}{tickers[i]:>10}{vols[i]*100:>7.1f}%{weights[i]*100:>9.1f}% {bar}")

    # カテゴリ別集計
    print("\n" + "=" * 80)
    print("  カテゴリ別配分")
    print("=" * 80)

    categories = {
        '株式（米国）': ['VTI', 'VTV', 'MTUM', 'USMV'],
        '株式（国際）': ['VEA', 'VWO'],
        '債券（国債）': ['SHV', 'IEF', 'TLT', 'TIPS'],
        '債券（クレジット）': ['LQD', 'HYG', 'EMB'],
        '不動産（REIT）': ['VNQ', 'VNQI'],
        'コモディティ': ['GLD', 'SLV', 'DBC'],
        '暗号資産': ['BITO', 'ETHE'],
        'オルタナティブ': ['DBMF'],
    }

    print(f"\n{'カテゴリ':<25}{'配分':>10}")
    print("-" * 40)

    for cat, cat_tickers in categories.items():
        cat_weight = sum(weights[tickers.index(t)] for t in cat_tickers if t in tickers)
        bar = "█" * int(cat_weight * 40)
        print(f"{cat:<25}{cat_weight*100:>9.1f}% {bar}")

    # ポートフォリオ統計
    port_ret, port_vol, sharpe = calculate_portfolio_stats(weights, returns, cov)

    print("\n" + "=" * 80)
    print("  ポートフォリオ統計")
    print("=" * 80)
    print(f"""
    期待リターン:     {port_ret*100:.2f}%
    ボラティリティ:   {port_vol*100:.2f}%
    シャープレシオ:   {sharpe:.3f}
    """)

    # 簡略化した推奨ポートフォリオ
    print("\n" + "=" * 80)
    print("  📌 実用的な簡略化ポートフォリオ（10銘柄）")
    print("=" * 80)

    # 各カテゴリから代表的なETFを選択
    simplified = {
        'VTI': ('米国株式トータル', 0.18),
        'VEA': ('先進国株式', 0.17),
        'VWO': ('新興国株式', 0.22),
        'SHV': ('短期国債', 0.01),
        'IEF': ('中期国債', 0.08),
        'TLT': ('長期国債', 0.16),
        'VNQ': ('米国REIT', 0.20),
        'GLD': ('ゴールド', 0.15),
        'BITO': ('ビットコイン', 0.65),
        'DBMF': ('マネージドフューチャーズ', 0.12),
    }

    simp_tickers = list(simplified.keys())
    simp_vols = np.array([simplified[t][1] for t in simp_tickers])
    simp_weights = inverse_volatility_weights(simp_vols)

    print(f"\n{'資産':<25}{'ティッカー':>8}{'配分':>10}")
    print("-" * 50)

    sorted_simp = sorted(zip(simp_tickers, simp_weights), key=lambda x: x[1], reverse=True)
    for ticker, w in sorted_simp:
        name = simplified[ticker][0]
        bar = "█" * int(w * 40)
        print(f"{name:<25}{ticker:>8}{w*100:>9.1f}% {bar}")

    print("\n" + "=" * 80)
    print("  💡 分散効果の高い資産クラス")
    print("=" * 80)
    print("""
    ┌─────────────────────────────────────────────────────────────────────┐
    │  株式との相関が低い資産（分散効果大）:                               │
    │                                                                     │
    │  • 短期国債 (SHV)        相関 ≈ 0      ボラ 1%   → 安定装置         │
    │  • 長期国債 (TLT)        相関 ≈ -0.20  ボラ 16%  → 逆相関ヘッジ     │
    │  • ゴールド (GLD)        相関 ≈ 0.05   ボラ 15%  → インフレヘッジ   │
    │  • マネージドフューチャーズ 相関 ≈ 0.05   ボラ 12%  → トレンドフォロー │
    │                                                                     │
    │  注意が必要な資産:                                                   │
    │  • 暗号資産: 高リターンだがボラ65-75%、株式相関0.35上昇中           │
    │  • ハイイールド債: 株式相関0.50と高い（分散効果限定）               │
    │  • REIT: 株式相関0.65と高い（不動産固有リスクはあり）               │
    └─────────────────────────────────────────────────────────────────────┘
    """)

    print("\n" + "=" * 80)
    print("  🏆 最終推奨: 3段階ポートフォリオ")
    print("=" * 80)
    print("""
    【保守的】リスク許容度: 低
    ┌────────────────────────────────────────┐
    │ 短期国債 (SHV/BIL)      40%            │
    │ 中期国債 (IEF)          20%            │
    │ 投資適格社債 (LQD)      15%            │
    │ ゴールド (GLD)          10%            │
    │ 米国株式 (VTI)          10%            │
    │ マネージドフューチャーズ  5%            │
    │ → 期待リターン: 5-6% / ボラ: 5-7%      │
    └────────────────────────────────────────┘

    【中庸】リスク許容度: 中（推奨）
    ┌────────────────────────────────────────┐
    │ 米国株式 (VTI)          20%            │
    │ 先進国株式 (VEA)        10%            │
    │ 新興国株式 (VWO)         5%            │
    │ 中期国債 (IEF)          20%            │
    │ 長期国債 (TLT)          10%            │
    │ ゴールド (GLD)          15%            │
    │ REIT (VNQ)              8%            │
    │ マネージドフューチャーズ  8%            │
    │ ビットコイン (BITO)      4%            │
    │ → 期待リターン: 7-9% / ボラ: 10-12%    │
    └────────────────────────────────────────┘

    【積極的】リスク許容度: 高
    ┌────────────────────────────────────────┐
    │ 米国株式 (VTI)          30%            │
    │ 先進国株式 (VEA)        15%            │
    │ 新興国株式 (VWO)        10%            │
    │ 長期国債 (TLT)          10%            │
    │ ゴールド (GLD)          12%            │
    │ REIT (VNQ)             10%            │
    │ マネージドフューチャーズ  5%            │
    │ ビットコイン (BITO)      5%            │
    │ イーサリアム (ETHE)      3%            │
    │ → 期待リターン: 10-13% / ボラ: 14-17%  │
    └────────────────────────────────────────┘
    """)

if __name__ == "__main__":
    main()
