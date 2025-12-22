#!/usr/bin/env python3
"""
実際の市場データを使用したポートフォリオ最適化
Yahoo Finance APIから直接データ取得
"""

import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import time

# 拡張資産クラス
TICKERS = {
    # 株式
    'VTI': '米国株式トータル',
    'VEA': '先進国株式',
    'VWO': '新興国株式',

    # 債券
    'SHV': '短期米国債',
    'IEF': '中期米国債',
    'TLT': '長期米国債',
    'TIP': 'インフレ連動債',
    'LQD': '投資適格社債',

    # 不動産
    'VNQ': '米国REIT',

    # コモディティ
    'GLD': 'ゴールド',
    'SLV': 'シルバー',

    # 暗号資産
    'BTC-USD': 'ビットコイン',
    'ETH-USD': 'イーサリアム',

    # オルタナティブ
    'DBMF': 'マネージドフューチャーズ',
}

def fetch_yahoo_data(ticker, period1, period2):
    """Yahoo Finance APIからデータ取得"""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        'period1': int(period1.timestamp()),
        'period2': int(period2.timestamp()),
        'interval': '1d',
        'events': 'history'
    }
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        data = response.json()

        if 'chart' not in data or 'result' not in data['chart'] or not data['chart']['result']:
            return None

        result = data['chart']['result'][0]
        timestamps = result['timestamp']
        closes = result['indicators']['adjclose'][0]['adjclose']

        df = pd.DataFrame({
            'Date': pd.to_datetime(timestamps, unit='s'),
            'Close': closes
        })
        df.set_index('Date', inplace=True)
        return df
    except Exception as e:
        print(f"  ⚠ {ticker}: {e}")
        return None

def fetch_all_data(tickers, years=3):
    """全ティッカーのデータを取得"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years*365)

    print(f"\n📊 データ取得中: {start_date.date()} → {end_date.date()}")
    print("-" * 50)

    all_data = {}
    for ticker in tickers:
        print(f"  取得中: {ticker}...", end=" ")
        df = fetch_yahoo_data(ticker, start_date, end_date)
        if df is not None and len(df) > 100:
            all_data[ticker] = df['Close']
            print(f"✓ {len(df)}日分")
        else:
            print("✗ 失敗")
        time.sleep(0.3)  # API制限対策

    # DataFrameに結合
    prices = pd.DataFrame(all_data)
    prices = prices.dropna()

    print(f"\n✓ 有効データ: {len(prices)}日分、{len(prices.columns)}銘柄")
    return prices

def calculate_statistics(prices):
    """リターンと統計量を計算"""
    returns = prices.pct_change().dropna()

    # 年率統計
    annual_returns = returns.mean() * 252
    annual_volatility = returns.std() * np.sqrt(252)

    # 相関行列
    correlation = returns.corr()

    # 共分散行列（年率）
    covariance = returns.cov() * 252

    return returns, annual_returns, annual_volatility, correlation, covariance

def inverse_volatility_weights(volatilities):
    """逆ボラティリティ加重"""
    inv_vol = 1.0 / volatilities
    return inv_vol / inv_vol.sum()

def risk_parity_weights(cov_matrix, tol=1e-6, max_iter=500):
    """リスクパリティ加重"""
    from scipy.optimize import minimize

    n = len(cov_matrix)
    target_risk = np.ones(n) / n

    def objective(w):
        port_var = w @ cov_matrix.values @ w
        marginal = cov_matrix.values @ w
        risk_contrib = w * marginal
        risk_contrib_pct = risk_contrib / np.sum(risk_contrib)
        return np.sum((risk_contrib_pct - target_risk) ** 2)

    constraints = {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
    bounds = tuple((0.01, 0.5) for _ in range(n))

    result = minimize(objective, np.ones(n)/n, method='SLSQP',
                     bounds=bounds, constraints=constraints,
                     options={'maxiter': max_iter, 'ftol': tol})
    return result.x

def portfolio_performance(weights, returns, cov_matrix, rf=0.045):
    """ポートフォリオパフォーマンス"""
    port_return = weights @ returns
    port_vol = np.sqrt(weights @ cov_matrix.values @ weights)
    sharpe = (port_return - rf) / port_vol if port_vol > 0 else 0
    return port_return, port_vol, sharpe

def main():
    print("=" * 70)
    print("  実データによるポートフォリオ最適化")
    print("  2025年12月22日時点")
    print("=" * 70)

    # データ取得
    prices = fetch_all_data(TICKERS.keys(), years=3)

    if len(prices.columns) < 5:
        print("❌ 十分なデータが取得できませんでした")
        return

    # 統計量計算
    returns, ann_ret, ann_vol, corr, cov = calculate_statistics(prices)

    available_tickers = list(prices.columns)
    available_names = {t: TICKERS.get(t, t) for t in available_tickers}

    # 結果表示
    print("\n" + "=" * 70)
    print("  資産別統計（年率）")
    print("=" * 70)

    stats_df = pd.DataFrame({
        '資産名': [available_names[t] for t in available_tickers],
        'リターン': ann_ret.values,
        'ボラティリティ': ann_vol.values,
        'シャープ': (ann_ret.values - 0.045) / ann_vol.values
    }, index=available_tickers)

    stats_df = stats_df.sort_values('ボラティリティ')

    print(f"\n{'ティッカー':<10}{'資産名':<20}{'リターン':>10}{'ボラ':>10}{'シャープ':>10}")
    print("-" * 65)
    for ticker in stats_df.index:
        row = stats_df.loc[ticker]
        print(f"{ticker:<10}{row['資産名']:<20}{row['リターン']*100:>9.1f}%{row['ボラティリティ']*100:>9.1f}%{row['シャープ']:>10.2f}")

    # 相関行列
    print("\n" + "=" * 70)
    print("  相関行列（主要ペア）")
    print("=" * 70)

    # 株式代表としてVTIとの相関
    if 'VTI' in corr.columns:
        print("\n米国株式 (VTI) との相関:")
        vti_corr = corr['VTI'].drop('VTI').sort_values()
        for ticker, c in vti_corr.items():
            bar = "+" * int(abs(c) * 20) if c > 0 else "-" * int(abs(c) * 20)
            print(f"  {available_names.get(ticker, ticker):<25} {c:>6.2f} {bar}")

    # ポートフォリオ構築
    print("\n" + "=" * 70)
    print("  ポートフォリオ構築")
    print("=" * 70)

    portfolios = {}

    # 1. 均等配分
    n = len(available_tickers)
    portfolios['1/N 均等配分'] = np.ones(n) / n

    # 2. 逆ボラティリティ
    portfolios['逆ボラティリティ'] = inverse_volatility_weights(ann_vol)

    # 3. リスクパリティ
    try:
        portfolios['リスクパリティ'] = risk_parity_weights(cov)
    except:
        print("  ⚠ リスクパリティ計算失敗、スキップ")

    # 結果表示
    print(f"\n{'戦略':<20}", end="")
    for t in available_tickers:
        print(f"{t:>8}", end="")
    print()
    print("-" * (20 + 8 * len(available_tickers)))

    for name, weights in portfolios.items():
        print(f"{name:<20}", end="")
        for w in weights:
            print(f"{w*100:>7.1f}%", end="")
        print()

    # パフォーマンス比較
    print("\n" + "=" * 70)
    print("  パフォーマンス比較")
    print("=" * 70)

    print(f"\n{'戦略':<20}{'期待リターン':>12}{'ボラティリティ':>14}{'シャープ比':>12}")
    print("-" * 60)

    best_sharpe = -999
    best_strategy = None
    best_weights = None

    for name, weights in portfolios.items():
        ret, vol, sharpe = portfolio_performance(weights, ann_ret.values, cov)
        print(f"{name:<20}{ret*100:>11.1f}%{vol*100:>13.1f}%{sharpe:>12.3f}")
        if sharpe > best_sharpe:
            best_sharpe = sharpe
            best_strategy = name
            best_weights = weights

    # 最終推奨
    print("\n" + "=" * 70)
    print("  🏆 最終推奨ポートフォリオ")
    print("=" * 70)

    print(f"\n最適戦略: {best_strategy} (シャープ比: {best_sharpe:.3f})")
    print("\n配分:")

    # ソートして表示
    sorted_idx = np.argsort(best_weights)[::-1]

    total_equity = 0
    total_bond = 0
    total_alt = 0

    for i in sorted_idx:
        ticker = available_tickers[i]
        w = best_weights[i]
        name = available_names[ticker]

        # カテゴリ分類
        if ticker in ['VTI', 'VEA', 'VWO']:
            total_equity += w
        elif ticker in ['SHV', 'IEF', 'TLT', 'TIP', 'LQD']:
            total_bond += w
        else:
            total_alt += w

        if w >= 0.02:  # 2%以上のみ表示
            bar = "█" * int(w * 50)
            print(f"  {name:<22} ({ticker:>7}): {w*100:>5.1f}% {bar}")

    print(f"\n  ─────────────────────────────────")
    print(f"  株式合計:       {total_equity*100:>5.1f}%")
    print(f"  債券合計:       {total_bond*100:>5.1f}%")
    print(f"  その他:         {total_alt*100:>5.1f}%")

    # 実務的調整提案
    print("\n" + "=" * 70)
    print("  💡 実務的調整（リスク許容度別）")
    print("=" * 70)

    # 暗号資産のウェイトを取得
    crypto_weight = sum(best_weights[i] for i, t in enumerate(available_tickers)
                       if t in ['BTC-USD', 'ETH-USD'])

    print(f"""
    現在の暗号資産配分: {crypto_weight*100:.1f}%

    【保守的な調整】
    • 暗号資産を2%以下に制限
    • 超過分を短期国債(SHV)とゴールド(GLD)に振り分け

    【中庸な調整】
    • 暗号資産を4%に制限
    • 株式比率を30-35%に調整

    【積極的な場合】
    • 現在の配分を維持（リスク許容度が高い場合）
    """)

    return portfolios, stats_df, corr

if __name__ == "__main__":
    portfolios, stats, corr = main()
