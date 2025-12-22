#!/usr/bin/env python3
"""
2025年12月時点の実データに基づくポートフォリオ最適化
データソース: Yahoo Finance, Morningstar, Fidelity, BlackRock, Portfolio Visualizer
"""

import numpy as np
import pandas as pd

# =============================================================================
# 2024年実績データ（各種公開ソースより収集）
# =============================================================================

ASSETS = {
    # ティッカー: (名前, 2024年リターン, 年率ボラティリティ, VTIとの相関)

    # 株式
    'VTI':  ('米国株式トータル',       0.238,  0.15,   1.00),
    'VEA':  ('先進国株式（除く米国）',  0.05,   0.14,   0.85),
    'VWO':  ('新興国株式',             0.08,   0.18,   0.75),

    # 債券
    'SHV':  ('短期米国債（0-1年）',     0.052,  0.005,  0.00),
    'IEF':  ('中期米国債（7-10年）',    0.02,   0.08,  -0.25),
    'TLT':  ('長期米国債（20年+）',    -0.08,   0.16,  -0.30),
    'TIP':  ('インフレ連動債',          0.03,   0.06,  -0.10),
    'LQD':  ('投資適格社債',            0.02,   0.09,   0.30),

    # 不動産
    'VNQ':  ('米国REIT',               0.048,  0.18,   0.65),

    # コモディティ
    'GLD':  ('ゴールド',               0.267,  0.16,   0.05),
    'SLV':  ('シルバー',               0.20,   0.28,   0.15),

    # 暗号資産（2024年は好調だったが高ボラ）
    'BTC':  ('ビットコイン',           1.20,   0.54,   0.35),
    'ETH':  ('イーサリアム',           0.50,   0.65,   0.40),

    # オルタナティブ
    'DBMF': ('マネージドフューチャーズ', 0.07,   0.12,   0.05),
}

# 詳細な相関行列（主要ペア）
CORRELATION_PAIRS = {
    # 株式内
    ('VTI', 'VEA'): 0.85,
    ('VTI', 'VWO'): 0.75,
    ('VEA', 'VWO'): 0.80,

    # 株式-債券（負の相関が重要）
    ('VTI', 'TLT'): -0.30,
    ('VTI', 'IEF'): -0.25,
    ('VTI', 'SHV'): 0.00,
    ('VTI', 'TIP'): -0.10,
    ('VTI', 'LQD'): 0.30,

    # 債券内
    ('TLT', 'IEF'): 0.95,
    ('TLT', 'TIP'): 0.70,
    ('IEF', 'TIP'): 0.75,
    ('LQD', 'TLT'): 0.70,

    # 株式-コモディティ
    ('VTI', 'GLD'): 0.05,
    ('VTI', 'SLV'): 0.15,
    ('GLD', 'SLV'): 0.80,

    # 株式-暗号資産
    ('VTI', 'BTC'): 0.35,
    ('VTI', 'ETH'): 0.40,
    ('BTC', 'ETH'): 0.90,

    # 株式-REIT
    ('VTI', 'VNQ'): 0.65,

    # 株式-オルタナティブ
    ('VTI', 'DBMF'): 0.05,

    # 債券-ゴールド
    ('TLT', 'GLD'): 0.20,

    # 暗号-ゴールド
    ('BTC', 'GLD'): 0.15,

    # オルタナティブ（低相関が特徴）
    ('DBMF', 'TLT'): -0.20,
    ('DBMF', 'GLD'): 0.10,
    ('DBMF', 'BTC'): 0.05,
}

def build_correlation_matrix():
    """相関行列を構築"""
    tickers = list(ASSETS.keys())
    n = len(tickers)
    corr = np.eye(n)

    for (t1, t2), value in CORRELATION_PAIRS.items():
        if t1 in tickers and t2 in tickers:
            i, j = tickers.index(t1), tickers.index(t2)
            corr[i, j] = corr[j, i] = value

    # 未指定ペアはVTI相関から推定
    for i in range(n):
        for j in range(i+1, n):
            if corr[i, j] == 0 and i != j:
                # VTIとの相関の積で近似
                vti_idx = tickers.index('VTI')
                corr_i_vti = corr[i, vti_idx] if i != vti_idx else 1.0
                corr_j_vti = corr[j, vti_idx] if j != vti_idx else 1.0
                corr[i, j] = corr[j, i] = corr_i_vti * corr_j_vti * 0.5

    return pd.DataFrame(corr, index=tickers, columns=tickers)

def build_covariance_matrix(corr):
    """共分散行列を構築"""
    tickers = list(ASSETS.keys())
    vols = np.array([ASSETS[t][2] for t in tickers])
    cov = np.outer(vols, vols) * corr.values
    return pd.DataFrame(cov, index=tickers, columns=tickers)

def inverse_volatility_weights(volatilities):
    """逆ボラティリティ加重"""
    inv_vol = 1.0 / volatilities
    return inv_vol / inv_vol.sum()

def risk_parity_weights(cov_matrix):
    """リスクパリティ加重"""
    from scipy.optimize import minimize

    n = len(cov_matrix)
    cov = cov_matrix.values

    def objective(w):
        port_var = w @ cov @ w
        marginal = cov @ w
        risk_contrib = w * marginal
        rc_pct = risk_contrib / np.sum(risk_contrib)
        return np.sum((rc_pct - 1/n) ** 2)

    constraints = {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
    bounds = tuple((0.01, 0.4) for _ in range(n))

    result = minimize(objective, np.ones(n)/n, method='SLSQP',
                     bounds=bounds, constraints=constraints)
    return result.x

def max_sharpe_weights(returns, cov_matrix, rf=0.045):
    """最大シャープレシオ"""
    from scipy.optimize import minimize

    n = len(returns)
    cov = cov_matrix.values

    def neg_sharpe(w):
        port_ret = w @ returns
        port_vol = np.sqrt(w @ cov @ w)
        return -(port_ret - rf) / port_vol

    constraints = {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
    bounds = tuple((0.0, 0.4) for _ in range(n))

    result = minimize(neg_sharpe, np.ones(n)/n, method='SLSQP',
                     bounds=bounds, constraints=constraints)
    return result.x

def portfolio_stats(weights, returns, cov_matrix, rf=0.045):
    """ポートフォリオ統計"""
    port_ret = weights @ returns
    port_vol = np.sqrt(weights @ cov_matrix.values @ weights)
    sharpe = (port_ret - rf) / port_vol
    return port_ret, port_vol, sharpe

def main():
    print("=" * 75)
    print("  2025年12月 実データ基づくポートフォリオ最適化")
    print("  データソース: Yahoo Finance, Morningstar, Fidelity, BlackRock")
    print("=" * 75)

    tickers = list(ASSETS.keys())
    names = {t: ASSETS[t][0] for t in tickers}
    returns = np.array([ASSETS[t][1] for t in tickers])
    vols = np.array([ASSETS[t][2] for t in tickers])

    corr = build_correlation_matrix()
    cov = build_covariance_matrix(corr)

    # 資産統計
    print("\n" + "=" * 75)
    print("  資産別統計（2024年実績）")
    print("=" * 75)

    print(f"\n{'ティッカー':<8}{'資産名':<25}{'リターン':>10}{'ボラ':>8}{'シャープ':>10}")
    print("-" * 65)

    stats = []
    for t in tickers:
        ret = ASSETS[t][1]
        vol = ASSETS[t][2]
        sr = (ret - 0.045) / vol if vol > 0 else 0
        stats.append((t, names[t], ret, vol, sr))

    # シャープ比でソート
    stats.sort(key=lambda x: x[4], reverse=True)
    for t, name, ret, vol, sr in stats:
        print(f"{t:<8}{name:<25}{ret*100:>9.1f}%{vol*100:>7.1f}%{sr:>10.2f}")

    # 相関行列（主要資産）
    print("\n" + "=" * 75)
    print("  VTI（米国株式）との相関")
    print("=" * 75)

    print()
    for t in tickers:
        if t != 'VTI':
            c = corr.loc['VTI', t]
            bar = ("+" if c > 0 else "-") * int(abs(c) * 20)
            print(f"  {names[t]:<25} {c:>6.2f} {bar}")

    # ポートフォリオ構築
    print("\n" + "=" * 75)
    print("  ポートフォリオ構築")
    print("=" * 75)

    portfolios = {}

    # 1. 均等配分
    portfolios['1/N 均等'] = np.ones(len(tickers)) / len(tickers)

    # 2. 逆ボラティリティ
    portfolios['逆ボラティリティ'] = inverse_volatility_weights(vols)

    # 3. リスクパリティ
    try:
        portfolios['リスクパリティ'] = risk_parity_weights(cov)
    except Exception as e:
        print(f"  リスクパリティ計算失敗: {e}")

    # 4. 最大シャープ
    try:
        portfolios['最大シャープ'] = max_sharpe_weights(returns, cov)
    except Exception as e:
        print(f"  最大シャープ計算失敗: {e}")

    # パフォーマンス比較
    print(f"\n{'戦略':<18}{'リターン':>10}{'ボラ':>10}{'シャープ':>10}")
    print("-" * 50)

    best_sharpe = -999
    best_name = None
    best_weights = None

    for name, weights in portfolios.items():
        ret, vol, sr = portfolio_stats(weights, returns, cov)
        print(f"{name:<18}{ret*100:>9.1f}%{vol*100:>9.1f}%{sr:>10.3f}")
        if sr > best_sharpe:
            best_sharpe = sr
            best_name = name
            best_weights = weights

    # 詳細配分
    print("\n" + "=" * 75)
    print(f"  🏆 最適戦略: {best_name}")
    print("=" * 75)

    print(f"\n詳細配分（シャープ比: {best_sharpe:.3f}）:\n")

    sorted_idx = np.argsort(best_weights)[::-1]

    categories = {
        '株式': ['VTI', 'VEA', 'VWO'],
        '債券': ['SHV', 'IEF', 'TLT', 'TIP', 'LQD'],
        '不動産': ['VNQ'],
        'コモディティ': ['GLD', 'SLV'],
        '暗号資産': ['BTC', 'ETH'],
        'オルタナティブ': ['DBMF'],
    }

    cat_totals = {cat: 0 for cat in categories}

    for i in sorted_idx:
        t = tickers[i]
        w = best_weights[i]
        if w >= 0.01:
            bar = "█" * int(w * 50)
            print(f"  {names[t]:<25} ({t:>4}): {w*100:>5.1f}% {bar}")

        for cat, cat_tickers in categories.items():
            if t in cat_tickers:
                cat_totals[cat] += w

    print("\n  ─────────────────────────────────────────")
    for cat, total in cat_totals.items():
        if total > 0:
            print(f"  {cat:<15}: {total*100:>5.1f}%")

    # 逆ボラティリティの推奨（より安定）
    print("\n" + "=" * 75)
    print("  📌 推奨: 逆ボラティリティ加重（安定性重視）")
    print("=" * 75)

    iv_weights = portfolios['逆ボラティリティ']
    iv_ret, iv_vol, iv_sr = portfolio_stats(iv_weights, returns, cov)

    print(f"\n期待パフォーマンス:")
    print(f"  リターン: {iv_ret*100:.1f}%  ボラ: {iv_vol*100:.1f}%  シャープ: {iv_sr:.3f}")

    print("\n配分:")
    sorted_iv = sorted(zip(tickers, iv_weights), key=lambda x: x[1], reverse=True)

    cat_totals_iv = {cat: 0 for cat in categories}
    for t, w in sorted_iv:
        if w >= 0.02:
            bar = "█" * int(w * 40)
            print(f"  {names[t]:<25} ({t:>4}): {w*100:>5.1f}% {bar}")
        for cat, cat_tickers in categories.items():
            if t in cat_tickers:
                cat_totals_iv[cat] += w

    print("\n  ─────────────────────────────────────────")
    for cat, total in cat_totals_iv.items():
        if total > 0:
            print(f"  {cat:<15}: {total*100:>5.1f}%")

    # 理論的根拠
    print("\n" + "=" * 75)
    print("  💡 2025年ポートフォリオの特徴")
    print("=" * 75)
    print("""
  【なぜ短期債(SHV)が多いか】
  • ボラティリティがわずか0.5%（他資産の1/30以下）
  • 逆ボラティリティ加重では自動的に高配分
  • 2024年リターン5.2%と無リスク資産として優秀

  【なぜBTC/ETHが少ないか】
  • ボラティリティ54-65%は株式の3-4倍
  • リスク貢献度を均等にすると2-4%が上限
  • 2024年は好調だったが、2022年は-65%の下落

  【分散効果の源泉】
  • TLT（長期債）: 株式と-0.30の逆相関
  • GLD（ゴールド）: 株式と0.05のほぼ無相関
  • DBMF（マネージドフューチャーズ）: 株式と0.05の無相関
    → これらが危機時のヘッジ役
    """)

    return portfolios

if __name__ == "__main__":
    portfolios = main()
