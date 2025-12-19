#!/usr/bin/env python3
"""
2025年最新理論に基づくポートフォリオ最適化
DeMiguel et al. (2009) の「1/Nが最適化を上回る」問題への現代的解決策

手法:
1. 均等配分 (1/N) - ベンチマーク
2. リスクパリティ (Risk Parity) - 各資産のリスク貢献度を均等化
3. 階層的リスクパリティ (HRP) - 機械学習ベースの最適化
4. 最小分散 (Minimum Variance) + Ledoit-Wolf シュリンケージ
"""

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from scipy.optimize import minimize
from scipy.cluster.hierarchy import linkage, dendrogram, leaves_list
from scipy.spatial.distance import squareform
import warnings
warnings.filterwarnings('ignore')

# 資産クラス定義
ASSETS = {
    'SPY': 'S&P 500',
    'QQQ': 'NASDAQ 100',
    'VGLT': '長期米国債',
    'GLDM': 'ゴールド',
    'SLV': 'シルバー',
    'BTC-USD': 'ビットコイン'
}

def fetch_data(tickers, years=5):
    """過去データを取得"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years*365)

    print(f"\n📊 データ取得中: {start_date.date()} から {end_date.date()}")

    data = yf.download(list(tickers.keys()), start=start_date, end=end_date)['Adj Close']
    data = data.dropna()

    # 列名を整理
    if len(tickers) == 1:
        data = pd.DataFrame(data)
        data.columns = list(tickers.keys())

    print(f"✓ {len(data)} 日分のデータを取得")
    return data

def calculate_returns(prices):
    """日次リターンを計算"""
    return prices.pct_change().dropna()

def ledoit_wolf_shrinkage(returns):
    """
    Ledoit-Wolf シュリンケージ推定量
    推定誤差を軽減するための共分散行列の縮約
    """
    T, N = returns.shape

    # サンプル共分散行列
    sample_cov = returns.cov().values

    # ターゲット行列（対角行列 - 個別分散のみ）
    var = np.diag(sample_cov)
    target = np.diag(var)

    # 最適シュリンケージ強度の計算
    X = returns.values
    X_centered = X - X.mean(axis=0)

    # Frobenius normを使った最適シュリンケージ
    sum_var = 0
    for i in range(N):
        for j in range(N):
            sum_var += np.var(X_centered[:, i] * X_centered[:, j])

    sum_var *= T / (T - 1) ** 2

    delta = np.sum((sample_cov - target) ** 2)

    shrinkage_intensity = min(1, max(0, sum_var / delta)) if delta > 0 else 0

    # 縮約された共分散行列
    shrunk_cov = (1 - shrinkage_intensity) * sample_cov + shrinkage_intensity * target

    return pd.DataFrame(shrunk_cov, index=returns.columns, columns=returns.columns), shrinkage_intensity

def equal_weight_portfolio(n_assets):
    """均等配分 (1/N)"""
    return np.ones(n_assets) / n_assets

def minimum_variance_portfolio(cov_matrix):
    """最小分散ポートフォリオ"""
    n = len(cov_matrix)

    def portfolio_variance(weights):
        return weights @ cov_matrix @ weights

    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0, 1) for _ in range(n))

    result = minimize(portfolio_variance,
                     np.ones(n)/n,
                     method='SLSQP',
                     bounds=bounds,
                     constraints=constraints)

    return result.x

def risk_parity_portfolio(cov_matrix):
    """
    リスクパリティポートフォリオ
    各資産のリスク貢献度を均等化
    """
    n = len(cov_matrix)

    def risk_contribution(weights):
        portfolio_vol = np.sqrt(weights @ cov_matrix @ weights)
        marginal_risk = cov_matrix @ weights
        risk_contrib = weights * marginal_risk / portfolio_vol
        return risk_contrib

    def objective(weights):
        rc = risk_contribution(weights)
        target_rc = np.sum(rc) / n
        return np.sum((rc - target_rc) ** 2)

    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0.01, 1) for _ in range(n))

    result = minimize(objective,
                     np.ones(n)/n,
                     method='SLSQP',
                     bounds=bounds,
                     constraints=constraints)

    return result.x

def hierarchical_risk_parity(returns, cov_matrix):
    """
    階層的リスクパリティ (HRP)
    López de Prado (2016) の手法
    機械学習クラスタリングを使用して共分散行列の逆行列計算を回避
    """
    # 1. 相関行列から距離行列を計算
    corr = returns.corr()
    distance = np.sqrt(0.5 * (1 - corr))

    # 2. 階層的クラスタリング
    dist_condensed = squareform(distance.values)
    link = linkage(dist_condensed, method='single')

    # 3. 擬似対角化（quasi-diagonalization）
    sorted_idx = leaves_list(link)
    sorted_corr = corr.iloc[sorted_idx, sorted_idx]
    sorted_cov = cov_matrix.iloc[sorted_idx, sorted_idx]

    # 4. 再帰的二分割
    weights = pd.Series(1.0, index=sorted_cov.index)
    cluster_items = [sorted_cov.index.tolist()]

    while len(cluster_items) > 0:
        cluster_items = [item for sublist in
                        [_bisect_cluster(item, sorted_cov, weights)
                         for item in cluster_items]
                        for item in sublist]

    # 元の順序に戻す
    weights = weights[returns.columns]
    return weights.values / weights.sum()

def _bisect_cluster(items, cov_matrix, weights):
    """クラスターを二分割"""
    if len(items) <= 1:
        return []

    mid = len(items) // 2
    left_items = items[:mid]
    right_items = items[mid:]

    # 各クラスターの分散を計算
    left_var = _cluster_variance(left_items, cov_matrix)
    right_var = _cluster_variance(right_items, cov_matrix)

    # 逆分散ウェイト
    alpha = 1 - left_var / (left_var + right_var)

    weights[left_items] *= alpha
    weights[right_items] *= (1 - alpha)

    return [left_items, right_items]

def _cluster_variance(items, cov_matrix):
    """クラスター内の分散を計算"""
    sub_cov = cov_matrix.loc[items, items]
    w = np.ones(len(items)) / len(items)
    return w @ sub_cov.values @ w

def calculate_portfolio_metrics(weights, returns, cov_matrix, rf_rate=0.045):
    """ポートフォリオのパフォーマンス指標を計算"""
    weights = np.array(weights)

    # 年率リターン
    mean_daily = returns.mean()
    annual_return = (weights @ mean_daily) * 252

    # 年率ボラティリティ
    annual_vol = np.sqrt(weights @ cov_matrix @ weights) * np.sqrt(252)

    # シャープレシオ
    sharpe = (annual_return - rf_rate) / annual_vol if annual_vol > 0 else 0

    # 最大ドローダウン
    portfolio_returns = (returns @ weights)
    cumulative = (1 + portfolio_returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    max_drawdown = drawdown.min()

    # ソルティノレシオ
    downside_returns = portfolio_returns[portfolio_returns < 0]
    downside_vol = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 0 else 0
    sortino = (annual_return - rf_rate) / downside_vol if downside_vol > 0 else 0

    return {
        'annual_return': annual_return,
        'annual_volatility': annual_vol,
        'sharpe_ratio': sharpe,
        'sortino_ratio': sortino,
        'max_drawdown': max_drawdown
    }

def main():
    print("=" * 70)
    print("  2025年最新理論に基づくポートフォリオ最適化")
    print("  DeMiguel (2009) 問題への現代的解決策")
    print("=" * 70)

    # データ取得
    prices = fetch_data(ASSETS, years=5)
    returns = calculate_returns(prices)

    # Ledoit-Wolf シュリンケージ共分散行列
    shrunk_cov, shrinkage_intensity = ledoit_wolf_shrinkage(returns)
    print(f"\n📈 Ledoit-Wolf シュリンケージ強度: {shrinkage_intensity:.2%}")

    # サンプル共分散行列（比較用）
    sample_cov = returns.cov()

    # 各手法でポートフォリオを構築
    n_assets = len(ASSETS)
    tickers = list(ASSETS.keys())

    portfolios = {}

    # 1. 均等配分
    portfolios['1/N 均等配分'] = equal_weight_portfolio(n_assets)

    # 2. 最小分散（シュリンケージ）
    portfolios['最小分散 (Ledoit-Wolf)'] = minimum_variance_portfolio(shrunk_cov.values)

    # 3. リスクパリティ（シュリンケージ）
    portfolios['リスクパリティ'] = risk_parity_portfolio(shrunk_cov.values)

    # 4. 階層的リスクパリティ
    portfolios['HRP (階層的リスクパリティ)'] = hierarchical_risk_parity(returns, shrunk_cov)

    # 結果表示
    print("\n" + "=" * 70)
    print("  資産配分結果")
    print("=" * 70)

    allocation_df = pd.DataFrame(portfolios, index=[ASSETS[t] for t in tickers])
    allocation_df = allocation_df * 100  # パーセント表示
    print("\n資産配分 (%):")
    print(allocation_df.round(2).to_string())

    # パフォーマンス比較
    print("\n" + "=" * 70)
    print("  パフォーマンス比較（過去5年バックテスト）")
    print("=" * 70)

    metrics_list = []
    for name, weights in portfolios.items():
        metrics = calculate_portfolio_metrics(weights, returns, shrunk_cov.values)
        metrics['strategy'] = name
        metrics_list.append(metrics)

    metrics_df = pd.DataFrame(metrics_list).set_index('strategy')
    metrics_df.columns = ['年率リターン', '年率ボラ', 'シャープ', 'ソルティノ', '最大DD']

    # フォーマット
    metrics_df['年率リターン'] = (metrics_df['年率リターン'] * 100).round(2).astype(str) + '%'
    metrics_df['年率ボラ'] = (metrics_df['年率ボラ'] * 100).round(2).astype(str) + '%'
    metrics_df['シャープ'] = metrics_df['シャープ'].round(3)
    metrics_df['ソルティノ'] = metrics_df['ソルティノ'].round(3)
    metrics_df['最大DD'] = (metrics_df['最大DD'] * 100).round(2).astype(str) + '%'

    print("\n" + metrics_df.to_string())

    # 相関行列
    print("\n" + "=" * 70)
    print("  資産間相関行列")
    print("=" * 70)
    corr_df = returns.corr()
    corr_df.index = [ASSETS[t] for t in corr_df.index]
    corr_df.columns = [ASSETS[t] for t in corr_df.columns]
    print("\n" + corr_df.round(3).to_string())

    # 推奨ポートフォリオ
    print("\n" + "=" * 70)
    print("  2025年最適ポートフォリオ推奨")
    print("=" * 70)

    # シャープレシオが最も高い戦略を選択
    best_strategy = None
    best_sharpe = -np.inf
    for name, weights in portfolios.items():
        metrics = calculate_portfolio_metrics(weights, returns, shrunk_cov.values)
        if metrics['sharpe_ratio'] > best_sharpe:
            best_sharpe = metrics['sharpe_ratio']
            best_strategy = name
            best_weights = weights

    print(f"\n🏆 推奨戦略: {best_strategy}")
    print(f"   シャープレシオ: {best_sharpe:.3f}")
    print("\n📊 推奨配分:")
    for ticker, weight in zip(tickers, best_weights):
        print(f"   {ASSETS[ticker]:12} ({ticker:8}): {weight*100:6.2f}%")

    # BlackRockガイダンスに基づく調整提案
    print("\n" + "-" * 70)
    print("  実務的調整（BlackRock/State Street 2025年ガイダンス反映）")
    print("-" * 70)
    print("""
  • ビットコイン: 最大2-4%に制限（ボラティリティリスク）
  • ゴールド: 5-15%推奨（インフレヘッジ・安全資産）
  • 長期債: 金利上昇リスク考慮、10-20%が適切
  • 株式（SPY+QQQ）: コアとして50-60%
  • シルバー: 投機的要素強く、2-5%以下推奨
    """)

    return portfolios, allocation_df, metrics_df

if __name__ == "__main__":
    portfolios, allocations, metrics = main()
