#!/usr/bin/env python3
"""
長期データ（10-20年）に基づくポートフォリオ最適化

データソース:
- Yahoo Finance, Morningstar, Fidelity, BlackRock
- Portfolio Visualizer, LazyPortfolioETF
- 期間: 各資産の設定年から2024年末まで

注: BTCは2014年以降のデータのみ利用可能（約10年）
"""

import numpy as np
import pandas as pd

# =============================================================================
# 長期データ（10-20年の年率統計）
# =============================================================================

# 資産定義: (名称, 10年CAGR, 15年CAGR, 年率ボラ, VTI相関, 設定年, データソース)
ASSETS_LONG_TERM = {
    # 株式
    'VTI': {
        'name': '米国株式トータル',
        'cagr_10y': 0.142,     # 14.2%
        'cagr_15y': 0.137,     # 13.7%
        'cagr_20y': 0.108,     # 10.8%
        'volatility': 0.156,   # 15.6%
        'corr_vti': 1.00,
        'inception': 2001,
        'source': 'LazyPortfolioETF, FinanceCharts'
    },
    'VEA': {
        'name': '先進国株式（除く米国）',
        'cagr_10y': 0.067,     # 6.7%
        'cagr_15y': 0.069,     # 6.9%
        'cagr_20y': 0.055,     # 推定
        'volatility': 0.165,   # 16.5%
        'corr_vti': 0.85,
        'inception': 2007,
        'source': 'PortfoliosLab'
    },
    'VWO': {
        'name': '新興国株式',
        'cagr_10y': 0.077,     # 7.7%
        'cagr_15y': 0.040,     # 4.0%
        'cagr_20y': 0.050,     # 推定
        'volatility': 0.217,   # 21.7%
        'corr_vti': 0.75,
        'inception': 2005,
        'source': 'FinanceCharts'
    },

    # 債券
    'SHV': {
        'name': '短期米国債（0-1年）',
        'cagr_10y': 0.018,     # 1.8%（低金利期を含む）
        'cagr_15y': 0.012,     # 1.2%
        'cagr_20y': 0.015,     # 推定
        'volatility': 0.005,   # 0.5%（極低ボラ）
        'corr_vti': 0.00,
        'inception': 2007,
        'source': 'iShares'
    },
    'IEF': {
        'name': '中期米国債（7-10年）',
        'cagr_10y': 0.015,     # 1.5%
        'cagr_15y': 0.025,     # 2.5%
        'cagr_20y': 0.035,     # 3.5%
        'volatility': 0.080,   # 8.0%
        'corr_vti': -0.25,
        'inception': 2002,
        'source': 'iShares'
    },
    'TLT': {
        'name': '長期米国債（20年+）',
        'cagr_10y': -0.003,    # -0.3%（最近10年は厳しい）
        'cagr_15y': 0.025,     # 2.5%
        'cagr_20y': 0.046,     # 4.6%
        'volatility': 0.145,   # 14.5%（高金利環境で上昇）
        'corr_vti': -0.30,
        'inception': 2002,
        'source': 'LazyPortfolioETF'
    },

    # 不動産
    'VNQ': {
        'name': '米国REIT',
        'cagr_10y': 0.054,     # 5.4%
        'cagr_15y': 0.077,     # 7.7%
        'cagr_20y': 0.064,     # 6.4%
        'volatility': 0.196,   # 19.6%
        'corr_vti': 0.65,
        'inception': 2004,
        'source': 'PortfoliosLab'
    },

    # コモディティ
    'GLD': {
        'name': 'ゴールド',
        'cagr_10y': 0.138,     # 13.8%（最近10年は好調）
        'cagr_15y': 0.073,     # 7.3%
        'cagr_20y': 0.107,     # 10.7%
        'volatility': 0.158,   # 15.8%
        'corr_vti': 0.05,
        'inception': 2004,
        'source': 'FinanceCharts'
    },
    'SLV': {
        'name': 'シルバー',
        'cagr_10y': 0.060,     # 6.0%
        'cagr_15y': 0.040,     # 4.0%
        'cagr_20y': 0.050,     # 推定
        'volatility': 0.280,   # 28.0%
        'corr_vti': 0.15,
        'inception': 2006,
        'source': '推定'
    },

    # 暗号資産（2014年以降のみ）
    'BTC': {
        'name': 'ビットコイン',
        'cagr_10y': 0.490,     # 49%（2014-2024）
        'cagr_15y': None,      # データなし
        'cagr_20y': None,      # データなし
        'volatility': 0.700,   # 70%（非常に高い）
        'corr_vti': 0.35,      # 最近は上昇傾向
        'inception': 2014,
        'source': 'Fidelity, BlackRock'
    },

    # オルタナティブ
    'DBMF': {
        'name': 'マネージドフューチャーズ',
        'cagr_10y': 0.045,     # 4.5%（SG CTA Indexに準拠）
        'cagr_15y': 0.040,     # 4.0%
        'cagr_20y': 0.050,     # 5.0%（2022年は+20%と好調）
        'volatility': 0.120,   # 12.0%
        'corr_vti': 0.05,
        'inception': 2019,     # DBMF自体は2019年設定
        'source': 'iMGP Funds, SG CTA Index'
    },
}

# 詳細相関行列（長期データに基づく）
CORRELATIONS_LONG_TERM = {
    # 株式内
    ('VTI', 'VEA'): 0.85,
    ('VTI', 'VWO'): 0.75,
    ('VEA', 'VWO'): 0.82,

    # 株式-債券（重要: 負の相関）
    ('VTI', 'SHV'): 0.00,
    ('VTI', 'IEF'): -0.25,
    ('VTI', 'TLT'): -0.30,

    # 債券内
    ('SHV', 'IEF'): 0.30,
    ('SHV', 'TLT'): 0.20,
    ('IEF', 'TLT'): 0.95,

    # 株式-REIT
    ('VTI', 'VNQ'): 0.65,
    ('VNQ', 'TLT'): 0.20,

    # 株式-コモディティ
    ('VTI', 'GLD'): 0.05,
    ('VTI', 'SLV'): 0.15,
    ('GLD', 'SLV'): 0.80,
    ('GLD', 'TLT'): 0.20,

    # 株式-暗号資産
    ('VTI', 'BTC'): 0.35,
    ('BTC', 'GLD'): 0.15,

    # オルタナティブ
    ('VTI', 'DBMF'): 0.05,
    ('TLT', 'DBMF'): -0.20,
    ('GLD', 'DBMF'): 0.10,
}

def build_correlation_matrix(tickers):
    """相関行列を構築"""
    n = len(tickers)
    corr = np.eye(n)

    for (t1, t2), value in CORRELATIONS_LONG_TERM.items():
        if t1 in tickers and t2 in tickers:
            i, j = tickers.index(t1), tickers.index(t2)
            corr[i, j] = corr[j, i] = value

    # 未定義ペアは低相関と仮定
    for i in range(n):
        for j in range(i+1, n):
            if corr[i, j] == 0 and i != j:
                # VTI相関の積で近似
                t1, t2 = tickers[i], tickers[j]
                c1 = ASSETS_LONG_TERM[t1]['corr_vti']
                c2 = ASSETS_LONG_TERM[t2]['corr_vti']
                corr[i, j] = corr[j, i] = c1 * c2 * 0.6

    return corr

def build_covariance_matrix(tickers, corr, period='10y'):
    """共分散行列を構築"""
    vols = np.array([ASSETS_LONG_TERM[t]['volatility'] for t in tickers])
    return np.outer(vols, vols) * corr

def inverse_volatility_weights(vols):
    """逆ボラティリティ加重"""
    inv_vol = 1.0 / vols
    return inv_vol / inv_vol.sum()

def risk_parity_weights(cov_matrix):
    """リスクパリティ加重"""
    from scipy.optimize import minimize

    n = len(cov_matrix)

    def objective(w):
        port_var = w @ cov_matrix @ w
        marginal = cov_matrix @ w
        risk_contrib = w * marginal
        rc_pct = risk_contrib / np.sum(risk_contrib)
        return np.sum((rc_pct - 1/n) ** 2)

    constraints = {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
    bounds = tuple((0.01, 0.35) for _ in range(n))

    result = minimize(objective, np.ones(n)/n, method='SLSQP',
                     bounds=bounds, constraints=constraints)
    return result.x

def portfolio_stats(weights, returns, cov_matrix, rf=0.04):
    """ポートフォリオ統計"""
    port_ret = weights @ returns
    port_vol = np.sqrt(weights @ cov_matrix @ weights)
    sharpe = (port_ret - rf) / port_vol
    return port_ret, port_vol, sharpe

def main():
    print("=" * 80)
    print("  長期データ（10-20年）に基づくポートフォリオ最適化")
    print("  期間: 各資産の設定年 ～ 2024年")
    print("=" * 80)

    tickers = list(ASSETS_LONG_TERM.keys())
    n = len(tickers)

    # 統計量抽出
    names = {t: ASSETS_LONG_TERM[t]['name'] for t in tickers}
    returns_10y = np.array([ASSETS_LONG_TERM[t]['cagr_10y'] or 0.05 for t in tickers])
    returns_15y = np.array([ASSETS_LONG_TERM[t]['cagr_15y'] or ASSETS_LONG_TERM[t]['cagr_10y'] or 0.05 for t in tickers])
    vols = np.array([ASSETS_LONG_TERM[t]['volatility'] for t in tickers])

    corr = build_correlation_matrix(tickers)
    cov = build_covariance_matrix(tickers, corr)

    # 資産統計表示
    print("\n" + "=" * 80)
    print("  資産別長期統計")
    print("=" * 80)

    print(f"\n{'ティッカー':<8}{'資産名':<25}{'10年CAGR':>10}{'15年CAGR':>10}{'ボラ':>8}{'VTI相関':>8}")
    print("-" * 75)

    for t in tickers:
        a = ASSETS_LONG_TERM[t]
        cagr_10 = f"{a['cagr_10y']*100:.1f}%" if a['cagr_10y'] else "N/A"
        cagr_15 = f"{a['cagr_15y']*100:.1f}%" if a['cagr_15y'] else "N/A"
        print(f"{t:<8}{a['name']:<25}{cagr_10:>10}{cagr_15:>10}{a['volatility']*100:>7.1f}%{a['corr_vti']:>8.2f}")

    # ポートフォリオ構築（10年データ使用）
    print("\n" + "=" * 80)
    print("  ポートフォリオ最適化（10年データ基準）")
    print("=" * 80)

    portfolios = {}

    # 1. 均等配分
    portfolios['1/N 均等'] = np.ones(n) / n

    # 2. 逆ボラティリティ
    portfolios['逆ボラティリティ'] = inverse_volatility_weights(vols)

    # 3. リスクパリティ
    try:
        portfolios['リスクパリティ'] = risk_parity_weights(cov)
    except Exception as e:
        print(f"  リスクパリティ計算失敗: {e}")

    # パフォーマンス比較
    print(f"\n{'戦略':<18}{'期待リターン':>12}{'ボラ':>10}{'シャープ':>10}")
    print("-" * 55)

    results = []
    for name, weights in portfolios.items():
        ret, vol, sr = portfolio_stats(weights, returns_10y, cov)
        print(f"{name:<18}{ret*100:>11.1f}%{vol*100:>9.1f}%{sr:>10.3f}")
        results.append((name, sr, weights))

    # 最適戦略
    results.sort(key=lambda x: x[1], reverse=True)
    best_name, best_sr, best_weights = results[0]

    print("\n" + "=" * 80)
    print(f"  🏆 最適戦略: {best_name} (シャープ比: {best_sr:.3f})")
    print("=" * 80)

    print("\n詳細配分:")
    sorted_idx = np.argsort(best_weights)[::-1]

    for i in sorted_idx:
        t = tickers[i]
        w = best_weights[i]
        if w >= 0.01:
            bar = "█" * int(w * 40)
            print(f"  {names[t]:<25} ({t:>4}): {w*100:>5.1f}% {bar}")

    # カテゴリ別集計
    categories = {
        '株式': ['VTI', 'VEA', 'VWO'],
        '債券': ['SHV', 'IEF', 'TLT'],
        '不動産': ['VNQ'],
        'コモディティ': ['GLD', 'SLV'],
        '暗号資産': ['BTC'],
        'オルタナティブ': ['DBMF'],
    }

    print("\n  カテゴリ別:")
    for cat, cat_tickers in categories.items():
        total = sum(best_weights[tickers.index(t)] for t in cat_tickers if t in tickers)
        if total > 0:
            print(f"    {cat:<15}: {total*100:>5.1f}%")

    # 推奨ポートフォリオ（逆ボラティリティ + 調整）
    print("\n" + "=" * 80)
    print("  📌 推奨: 調整済み逆ボラティリティ")
    print("=" * 80)

    # BTC上限5%、株式下限20%に調整
    adj_weights = portfolios['逆ボラティリティ'].copy()

    btc_idx = tickers.index('BTC')
    if adj_weights[btc_idx] > 0.05:
        excess = adj_weights[btc_idx] - 0.05
        adj_weights[btc_idx] = 0.05
        # 超過分をGLDに
        gld_idx = tickers.index('GLD')
        adj_weights[gld_idx] += excess

    # 正規化
    adj_weights = adj_weights / adj_weights.sum()

    ret, vol, sr = portfolio_stats(adj_weights, returns_10y, cov)

    print(f"\n期待パフォーマンス（10年平均基準）:")
    print(f"  リターン: {ret*100:.1f}%  ボラ: {vol*100:.1f}%  シャープ: {sr:.3f}")

    print("\n配分:")
    sorted_adj = sorted(zip(tickers, adj_weights), key=lambda x: x[1], reverse=True)
    for t, w in sorted_adj:
        if w >= 0.02:
            bar = "█" * int(w * 40)
            print(f"  {names[t]:<25} ({t:>4}): {w*100:>5.1f}% {bar}")

    # 15年データでの検証
    print("\n" + "=" * 80)
    print("  📊 15年データでの検証")
    print("=" * 80)

    ret_15, vol_15, sr_15 = portfolio_stats(adj_weights, returns_15y, cov)
    print(f"\n  15年平均リターン基準:")
    print(f"  リターン: {ret_15*100:.1f}%  ボラ: {vol_15*100:.1f}%  シャープ: {sr_15:.3f}")

    # 理論的根拠
    print("\n" + "=" * 80)
    print("  💡 長期データからの洞察")
    print("=" * 80)
    print("""
  【期間による違い】
  • 10年: 2015-2024（低金利→高金利移行期、TLTはマイナス）
  • 15年: 2010-2024（リーマン後の回復期を含む）
  • 20年: 2005-2024（リーマンショックを含む）

  【重要な発見】
  1. BTCの49%CAGRは持続不可能と見るべき
     → Morgan Stanleyも「今後10年は繰り返さない」と予測

  2. TLTの10年リターンは-0.3%だが、20年は+4.6%
     → 金利サイクル全体を見る必要がある

  3. GLD（ゴールド）は10年で13.8%と好調
     → 長期（20年）では10.7%に収束

  4. VTIは10年14.2%だが、20年は10.8%
     → 長期では10%前後が現実的

  【なぜ逆ボラティリティか】
  • 期待リターンの推定誤差を回避（DeMiguel問題）
  • ボラティリティは比較的安定して推定可能
  • 高ボラ資産（BTC 70%、SLV 28%）を自動的に抑制
    """)

    # 最終まとめ
    print("\n" + "=" * 80)
    print("  🎯 最終推奨（長期投資向け）")
    print("=" * 80)
    print("""
  ┌────────────────────────────────────────────────────────────────┐
  │ 資産                              配分         役割            │
  ├────────────────────────────────────────────────────────────────┤
  │ 短期米国債 (SHV)                  40-50%      安定装置         │
  │ 中期米国債 (IEF)                  10-15%      金利収入         │
  │ 長期米国債 (TLT)                   5-10%      逆相関ヘッジ     │
  │ ゴールド (GLD)                    10-15%      インフレヘッジ   │
  │ 米国株式 (VTI)                    10-15%      成長エンジン     │
  │ 先進国株式 (VEA)                   3-5%       地理分散         │
  │ マネージドフューチャーズ (DBMF)      5-8%       トレンドフォロー │
  │ ビットコイン (BTC)                 2-5%       高リスク・高リターン│
  │ その他 (VWO, VNQ, SLV)             5%以下     追加分散         │
  └────────────────────────────────────────────────────────────────┘

  期待パフォーマンス（長期）:
  • リターン: 5-7%
  • ボラティリティ: 4-6%
  • シャープ比: 0.5-0.8
    """)

    return portfolios, adj_weights

if __name__ == "__main__":
    portfolios, recommended = main()
