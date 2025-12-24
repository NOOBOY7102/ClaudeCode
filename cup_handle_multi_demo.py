#!/usr/bin/env python3
"""
カップウィズハンドル検出器 V2 - 複数ETFデモ版

複数のETF風パターンをシミュレートして、
上位10個のチャートを生成します。
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
import sys
sys.path.insert(0, '/home/user/ClaudeCode')


def generate_etf_pattern(ticker, pattern_type='cup_with_handle'):
    """
    ETF風のカップウィズハンドルパターンを生成

    pattern_type:
        'cup_with_handle' - カップ+ハンドル
        'cup_only' - カップのみ
        'strong' - 強いパターン
        'weak' - 弱いパターン
    """
    start_date = datetime(2006, 1, 1)
    n_quarters = 75
    dates = pd.date_range(start=start_date, periods=n_quarters, freq='QE')

    # パターンタイプに応じた価格生成
    if ticker == 'SLV':
        # 深いカップ
        prices = generate_slv_pattern(n_quarters)
    elif ticker == 'GLD':
        # 中程度のカップ
        prices = generate_gld_pattern(n_quarters)
    elif ticker == 'TLT':
        # 浅いカップ
        prices = generate_tlt_pattern(n_quarters)
    elif ticker == 'SPY':
        # 短いカップ
        prices = generate_spy_pattern(n_quarters)
    elif ticker == 'QQQ':
        # 急速な回復
        prices = generate_qqq_pattern(n_quarters)
    elif ticker == 'DIA':
        # 対称的なカップ
        prices = generate_dia_pattern(n_quarters)
    elif ticker == 'IWM':
        # 非対称なカップ
        prices = generate_iwm_pattern(n_quarters)
    elif ticker == 'EEM':
        # 複数のカップ
        prices = generate_eem_pattern(n_quarters)
    elif ticker == 'VTI':
        # 理想的なパターン
        prices = generate_vti_pattern(n_quarters)
    elif ticker == 'AGG':
        # 小さなカップ
        prices = generate_agg_pattern(n_quarters)
    else:
        # デフォルト
        prices = generate_default_pattern(n_quarters)

    df = pd.DataFrame({
        'Close': prices,
        'High': prices * (1 + np.random.uniform(0, 0.03, n_quarters)),
        'Low': prices * (1 - np.random.uniform(0, 0.03, n_quarters)),
        'Open': np.roll(prices, 1),
        'Volume': np.random.uniform(50000000, 150000000, n_quarters)
    }, index=dates)

    df.loc[df.index[0], 'Open'] = prices[0]

    return df


def generate_slv_pattern(n):
    """SLV: 深いカップ (68%)"""
    prices = []
    # 上昇
    prices.extend(np.linspace(10, 48, 21) + np.random.normal(0, 1.5, 21))
    # 急落
    prices.extend(np.linspace(48, 25, 4) + np.random.normal(0, 1, 4))
    # 底
    prices.extend(np.full(16, 15) + np.random.normal(0, 1.5, 16))
    # 回復
    prices.extend(np.linspace(15, 26, 16) + np.random.normal(0, 1, 16))
    # ハンドル
    phase5 = np.concatenate([np.linspace(26, 20, 4), np.linspace(20, 22, 4)])
    prices.extend(phase5 + np.random.normal(0, 0.8, 8))
    # 上昇
    prices.extend(np.linspace(22, 29, n - len(prices)) + np.random.normal(0, 0.8, n - len(prices)))
    return np.array(prices[:n])


def generate_gld_pattern(n):
    """GLD: 中程度のカップ (45%)"""
    prices = []
    prices.extend(np.linspace(80, 190, 18) + np.random.normal(0, 3, 18))
    prices.extend(np.linspace(190, 105, 12) + np.random.normal(0, 2, 12))
    prices.extend(np.linspace(105, 170, 20) + np.random.normal(0, 2, 20))
    phase4 = np.concatenate([np.linspace(170, 155, 5), np.linspace(155, 165, 5)])
    prices.extend(phase4 + np.random.normal(0, 1.5, 10))
    prices.extend(np.linspace(165, 185, n - len(prices)) + np.random.normal(0, 2, n - len(prices)))
    return np.array(prices[:n])


def generate_tlt_pattern(n):
    """TLT: 浅いカップ (28%)"""
    prices = []
    prices.extend(np.linspace(90, 140, 20) + np.random.normal(0, 1.5, 20))
    prices.extend(np.linspace(140, 100, 15) + np.random.normal(0, 1.2, 15))
    prices.extend(np.linspace(100, 135, 18) + np.random.normal(0, 1.2, 18))
    phase4 = np.concatenate([np.linspace(135, 125, 6), np.linspace(125, 130, 6)])
    prices.extend(phase4 + np.random.normal(0, 1, 12))
    prices.extend(np.linspace(130, 142, n - len(prices)) + np.random.normal(0, 1.2, n - len(prices)))
    return np.array(prices[:n])


def generate_spy_pattern(n):
    """SPY: 短いカップ (22%)"""
    prices = []
    prices.extend(np.linspace(120, 210, 25) + np.random.normal(0, 2, 25))
    prices.extend(np.linspace(210, 165, 8) + np.random.normal(0, 1.5, 8))
    prices.extend(np.linspace(165, 205, 20) + np.random.normal(0, 1.5, 20))
    phase4 = np.concatenate([np.linspace(205, 192, 5), np.linspace(192, 200, 5)])
    prices.extend(phase4 + np.random.normal(0, 1.2, 10))
    prices.extend(np.linspace(200, 225, n - len(prices)) + np.random.normal(0, 2, n - len(prices)))
    return np.array(prices[:n])


def generate_qqq_pattern(n):
    """QQQ: 急速な回復"""
    prices = []
    prices.extend(np.linspace(50, 110, 22) + np.random.normal(0, 1.5, 22))
    prices.extend(np.linspace(110, 70, 6) + np.random.normal(0, 1.2, 6))
    prices.extend(np.linspace(70, 108, 18) + np.random.normal(0, 1.2, 18))
    phase4 = np.concatenate([np.linspace(108, 98, 6), np.linspace(98, 105, 6)])
    prices.extend(phase4 + np.random.normal(0, 1, 12))
    prices.extend(np.linspace(105, 130, n - len(prices)) + np.random.normal(0, 1.5, n - len(prices)))
    return np.array(prices[:n])


def generate_dia_pattern(n):
    """DIA: 対称的なカップ"""
    prices = []
    prices.extend(np.linspace(110, 180, 18) + np.random.normal(0, 1.8, 18))
    prices.extend(np.linspace(180, 125, 18) + np.random.normal(0, 1.5, 18))
    prices.extend(np.linspace(125, 175, 18) + np.random.normal(0, 1.5, 18))
    phase4 = np.concatenate([np.linspace(175, 162, 5), np.linspace(162, 170, 5)])
    prices.extend(phase4 + np.random.normal(0, 1.2, 10))
    prices.extend(np.linspace(170, 188, n - len(prices)) + np.random.normal(0, 1.8, n - len(prices)))
    return np.array(prices[:n])


def generate_iwm_pattern(n):
    """IWM: 非対称なカップ"""
    prices = []
    prices.extend(np.linspace(75, 165, 20) + np.random.normal(0, 1.8, 20))
    prices.extend(np.linspace(165, 100, 12) + np.random.normal(0, 1.5, 12))
    prices.extend(np.linspace(100, 158, 24) + np.random.normal(0, 1.5, 24))
    phase4 = np.concatenate([np.linspace(158, 145, 4), np.linspace(145, 152, 4)])
    prices.extend(phase4 + np.random.normal(0, 1.2, 8))
    prices.extend(np.linspace(152, 172, n - len(prices)) + np.random.normal(0, 1.8, n - len(prices)))
    return np.array(prices[:n])


def generate_eem_pattern(n):
    """EEM: カップのみ（ハンドル未形成）"""
    prices = []
    prices.extend(np.linspace(35, 68, 20) + np.random.normal(0, 1.2, 20))
    prices.extend(np.linspace(68, 32, 16) + np.random.normal(0, 1, 16))
    prices.extend(np.linspace(32, 62, 22) + np.random.normal(0, 1, 22))
    # ハンドルなし、横ばい
    prices.extend(np.full(n - len(prices), 62) + np.random.normal(0, 1.5, n - len(prices)))
    return np.array(prices[:n])


def generate_vti_pattern(n):
    """VTI: 理想的なパターン"""
    prices = []
    prices.extend(np.linspace(65, 130, 18) + np.random.normal(0, 1.5, 18))
    prices.extend(np.linspace(130, 95, 18) + np.random.normal(0, 1.2, 18))
    prices.extend(np.linspace(95, 126, 18) + np.random.normal(0, 1.2, 18))
    phase4 = np.concatenate([np.linspace(126, 115, 5), np.linspace(115, 122, 5)])
    prices.extend(phase4 + np.random.normal(0, 1, 10))
    prices.extend(np.linspace(122, 145, n - len(prices)) + np.random.normal(0, 1.5, n - len(prices)))
    return np.array(prices[:n])


def generate_agg_pattern(n):
    """AGG: 小さなカップ"""
    prices = []
    prices.extend(np.linspace(105, 115, 25) + np.random.normal(0, 0.8, 25))
    prices.extend(np.linspace(115, 100, 10) + np.random.normal(0, 0.6, 10))
    prices.extend(np.linspace(100, 113, 20) + np.random.normal(0, 0.6, 20))
    phase4 = np.concatenate([np.linspace(113, 108, 5), np.linspace(108, 111, 5)])
    prices.extend(phase4 + np.random.normal(0, 0.5, 10))
    prices.extend(np.linspace(111, 117, n - len(prices)) + np.random.normal(0, 0.8, n - len(prices)))
    return np.array(prices[:n])


def generate_default_pattern(n):
    """デフォルト"""
    prices = []
    prices.extend(np.linspace(100, 150, 20) + np.random.normal(0, 2, 20))
    prices.extend(np.linspace(150, 110, 15) + np.random.normal(0, 1.5, 15))
    prices.extend(np.linspace(110, 145, 20) + np.random.normal(0, 1.5, 20))
    phase4 = np.concatenate([np.linspace(145, 135, 5), np.linspace(135, 140, 5)])
    prices.extend(phase4 + np.random.normal(0, 1.2, 10))
    prices.extend(np.linspace(140, 160, n - len(prices)) + np.random.normal(0, 2, n - len(prices)))
    return np.array(prices[:n])


def main():
    from cup_handle_detector_v2 import CupHandleDetectorV2

    print("\n")
    print("╔" + "═" * 98 + "╗")
    print("║" + " " * 20 + "カップウィズハンドル検出器 V2 - 複数ETFデモ版" + " " * 28 + "║")
    print("║" + " " * 35 + "上位10個のチャート生成" + " " * 41 + "║")
    print("╚" + "═" * 98 + "╝")

    # 検出器を初期化
    detector = CupHandleDetectorV2(
        cup_depth_min=0.15,
        cup_depth_max=0.70,
        handle_depth_min=0.05,
        handle_depth_max=0.25,
        cup_quarters_min=8,
        cup_quarters_max=80,
        handle_quarters_min=2,
        handle_quarters_max=16
    )

    # シミュレートするETF
    etfs = ['SLV', 'GLD', 'TLT', 'SPY', 'QQQ', 'DIA', 'IWM', 'EEM', 'VTI', 'AGG']

    print("\n" + "=" * 100)
    print(f"スクリーニング開始: {len(etfs)} ETF (シミュレーションデータ)")
    print("=" * 100)

    results = []

    for i, ticker in enumerate(etfs, 1):
        print(f"[{i}/{len(etfs)}] {ticker:8} を分析中...", end=" ")

        # シミュレーションデータを生成
        df_quarterly = generate_etf_pattern(ticker)
        df_daily = df_quarterly  # デモでは同じデータを使用

        # パターンを検出
        cups = detector.detect_cup(df_quarterly)

        if not cups:
            print("× カップパターン未検出")
            continue

        patterns = []
        for cup in cups:
            handle = detector.detect_handle(df_quarterly, cup)
            if handle:
                patterns.append({
                    'cup': cup,
                    'handle': handle,
                    'score': detector.calculate_pattern_score(cup, handle)
                })

        if patterns:
            best_pattern = max(patterns, key=lambda x: x['score'])
            result = {
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
            print(f"✓ カップ+ハンドル検出! スコア: {result['score']:.1f}")
        else:
            best_cup = max(cups, key=lambda x: x['cup_depth'])
            result = {
                'ticker': ticker,
                'pattern_found': True,
                'pattern_type': 'cup_only',
                'data_daily': df_daily,
                'data_quarterly': df_quarterly,
                'cup': best_cup,
                'handle': None,
                'score': detector.calculate_cup_only_score(best_cup),
                'total_cups': len(cups)
            }
            print(f"○ カップのみ検出 スコア: {result['score']:.1f}")

        results.append(result)

    # スコアでソート
    results.sort(key=lambda x: x['score'], reverse=True)

    print("=" * 100)
    print(f"完了: {len(results)} ETFでパターンを検出")

    # 結果を表示
    print("\n" + "=" * 100)
    print("カップウィズハンドルパターン検出結果（3ヶ月足シミュレーション）")
    print("=" * 100)
    print(f"{'順位':<6} {'銘柄':<8} {'タイプ':<18} {'スコア':<8} {'カップ深さ':<12} "
          f"{'カップ期間':<15} {'ハンドル深さ':<14} {'ハンドル期間':<12}")
    print("-" * 100)

    for i, result in enumerate(results, 1):
        cup = result['cup']
        handle = result.get('handle')

        if handle:
            print(f"{i:<6} {result['ticker']:<8} {'Cup+Handle':<18} {result['score']:>6.1f}  "
                  f"{cup['cup_depth']*100:>10.1f}%  {cup['cup_duration_years']:>10.1f}年  "
                  f"{handle['handle_depth']*100:>12.1f}%  {handle['handle_duration_years']:>10.1f}年")
        else:
            print(f"{i:<6} {result['ticker']:<8} {'Cup Only':<18} {result['score']:>6.1f}  "
                  f"{cup['cup_depth']*100:>10.1f}%  {cup['cup_duration_years']:>10.1f}年  "
                  f"{'---':>12}  {'---':>10}")

    # 上位10個のチャートを生成
    print("\n" + "=" * 100)
    print(f"上位{min(10, len(results))}個のETFチャートを生成中...")
    print("=" * 100)

    for i, result in enumerate(results[:10], 1):
        save_path = f"/home/user/ClaudeCode/cup_handle_top{i:02d}_{result['ticker']}.png"
        print(f"[{i}/10] {result['ticker']} のチャートを生成中...", end=" ")
        detector.visualize_pattern(result, save_path=save_path)
        print(f"✓")

    # サマリー
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

        print(f"\n上位5 ETF:")
        for i, result in enumerate(results[:5], 1):
            pattern_desc = "カップ+ハンドル" if result.get('handle') else "カップのみ"
            cup = result['cup']
            print(f"  {i}. {result['ticker']} ({pattern_desc}) - "
                  f"スコア: {result['score']:.1f}, "
                  f"カップ深さ: {cup['cup_depth']*100:.0f}%, "
                  f"期間: {cup['cup_duration_years']:.1f}年")

        print(f"\n生成されたチャート:")
        for i, result in enumerate(results[:10], 1):
            print(f"  {i}. cup_handle_top{i:02d}_{result['ticker']}.png")

    print("\n" + "=" * 100)
    print("✓ デモ完了!")
    print("=" * 100 + "\n")


if __name__ == '__main__':
    main()
