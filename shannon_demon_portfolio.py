#!/usr/bin/env python3
"""
シャノンの悪魔（定率リバランス）に向いたポートフォリオの実データ検証

リバランスの上乗せ（分散リターン）は
    DR ≒ ½ (Σ wᵢσᵢ² − σₚ²)
で近似でき、「各資産のボラが高い」「資産間の相関が低い」ほど大きくなる。
本スクリプトは候補ポートフォリオを
  ① 定率リバランス（月次 / 年次 / ±乖離バンド）
  ② 放置（バイ&ホールド、同じ初期配分）
で比較し、上乗せ幅・CAGR・最大DD・時代別の頑健性・ウォークフォワードを確認する。

データ（GitHub上の公開データ。Yahoo等は本環境から接続不可のため月次で検証）
  - S&P500（Shillerデータ, 月平均価格+配当）: datasets/s-and-p-500
      ※2023-07以降は配当欠損 → 配当利回り年1.4%で補完
  - 米10年債利回り（月次）: datasets/bond-yields-us-10y
      → 10年満期パー債を毎月ロールする合成トータルリターン
      → 20年債は同じ利回りで満期20年とした近似（長期債の代理）
  - 金（World Bank月次平均）: datasets/gold-prices
  - 現金: T-billデータが取れないため max(10年債利回り − 1.5%, 0) で近似
  - ビットコイン（Coin Metrics日次PriceUSD → 月平均）: coinmetrics/data
注意: 月平均価格は月末値よりボラを小さく見せるため、上乗せ幅はやや過小推計になる。
      ドル建て・税金なし・手数料は売買額×0.1%で計算。
"""

import itertools
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "data"
COST = 0.001  # 片道売買コスト（売買額に対する比率）
OUT_DIR = os.path.dirname(os.path.abspath(__file__))


# ─────────────────────────── データ構築 ───────────────────────────
def bond_total_return(yields_pct, maturity):
    """満期 maturity 年のパー債を毎月買い直す合成トータルリターン"""
    y = yields_pct / 100.0
    rets = [np.nan]
    for y0, y1 in zip(y[:-1], y[1:]):
        n = maturity * 12 - 1
        c = y0 / 12
        r = y1 / 12
        price = c * (1 - (1 + r) ** -n) / r + (1 + r) ** -n
        rets.append(price - 1 + c)
    return pd.Series(rets, index=yields_pct.index)


def load_monthly_returns():
    sp = pd.read_csv(f"{DATA_DIR}/datasets_s-and-p-500_main_data_data.csv", parse_dates=["Date"])
    sp = sp.set_index("Date")
    div_yield = (sp["Dividend"] / sp["SP500"]).where(sp["Dividend"] > 0)
    div_yield = div_yield.fillna(0.014)
    stock = sp["SP500"].pct_change() + div_yield.shift(1) / 12

    by = pd.read_csv(f"{DATA_DIR}/datasets_bond-yields-us-10y_main_data_monthly.csv", parse_dates=["Date"])
    by = by.set_index("Date")["Rate"]
    bond10 = bond_total_return(by, 10)
    bond20 = bond_total_return(by, 20)
    cash = (np.maximum(by - 1.5, 0) / 100 / 12).shift(1)

    gd = pd.read_csv(f"{DATA_DIR}/datasets_gold-prices_main_data_monthly.csv")
    gd["Date"] = pd.to_datetime(gd["Date"] + "-01")
    gold = gd.set_index("Date")["Price"].pct_change()

    btc = pd.read_csv(f"{DATA_DIR}/btc.csv", usecols=["time", "PriceUSD"], parse_dates=["time"])
    btc = btc.dropna().set_index("time")["PriceUSD"].resample("MS").mean()
    btc = btc.pct_change()

    df = pd.DataFrame({"株": stock, "債10": bond10, "債20": bond20,
                       "金": gold, "現金": cash, "BTC": btc})
    return df


# ─────────────────────────── シミュレーション ───────────────────────────
def simulate(rets, weights, mode="monthly", band=0.05, cost=COST):
    """mode: 'monthly' | 'annual' | 'band' | 'hold'"""
    w_target = np.array(weights, dtype=float)
    R = rets.values
    hold = w_target.copy()  # 金額ベースの保有
    values = []
    for t in range(len(R)):
        hold = hold * (1 + R[t])
        total = hold.sum()
        cur = hold / total
        do = False
        if mode == "monthly":
            do = True
        elif mode == "annual":
            do = rets.index[t].month == 12
        elif mode == "band":
            do = np.any(np.abs(cur - w_target) > band)
        if do:
            turnover = np.abs(cur - w_target).sum() * total / 2
            total -= turnover * cost * 2
            hold = w_target * total
        values.append(hold.sum())
    return pd.Series(values, index=rets.index)


def stats(v, cash=None):
    years = len(v) / 12
    cagr = v.iloc[-1] ** (1 / years) - 1
    r = v.pct_change().fillna(v.iloc[0] - 1)
    vol = r.std() * np.sqrt(12)
    mdd = (v / v.cummax() - 1).min()
    out = {"CAGR": cagr, "Vol": vol, "MaxDD": mdd}
    if cash is not None:
        ex = r - cash.values
        out["Sharpe"] = ex.mean() / ex.std() * np.sqrt(12)
    return out


def diversification_return(rets, w):
    w = np.array(w)
    cov = np.atleast_2d(np.cov(rets.values.T)) * 12
    return 0.5 * (w @ np.diag(cov) - w @ cov @ w)


# ─────────────────────────── 候補ポートフォリオ ───────────────────────────
PORTS_LONG = {  # 1972-2026（BTCなし）
    "株100%":                     {"株": 1.0},
    "株60/債40":                  {"株": .6, "債10": .4},
    "株50/金50":                  {"株": .5, "金": .5},
    "株/債/金 各1/3":              {"株": 1/3, "債10": 1/3, "金": 1/3},
    "パーマネント(株/債20/金/現金)": {"株": .25, "債20": .25, "金": .25, "現金": .25},
    "株40/債20 30/金30":           {"株": .4, "債20": .3, "金": .3},
}
PORTS_BTC = {  # 2013-2026（BTCあり）
    "株100%":                         {"株": 1.0},
    "株/債/金 各1/3":                  {"株": 1/3, "債10": 1/3, "金": 1/3},
    "パーマネント":                     {"株": .25, "債20": .25, "金": .25, "現金": .25},
    "BTC50/現金50 (古典的シャノン)":     {"BTC": .5, "現金": .5},
    "BTC50/金50":                     {"BTC": .5, "金": .5},
    "パーマネント+BTC5%":               {"株": .2375, "債20": .2375, "金": .2375, "現金": .2375, "BTC": .05},
    "株/債/金 各30 + BTC10":            {"株": .3, "債10": .3, "金": .3, "BTC": .1},
    "株/債/金/BTC 各25":               {"株": .25, "債10": .25, "金": .25, "BTC": .25},
}


def run_table(rets, ports, label):
    rows = []
    for name, wd in ports.items():
        cols = list(wd.keys())
        w = [wd[c] for c in cols]
        sub = rets[cols]
        reb = simulate(sub, w, "monthly")
        ann = simulate(sub, w, "annual")
        bnd = simulate(sub, w, "band")
        bh = simulate(sub, w, "hold", cost=0)
        s_reb, s_ann, s_bnd, s_bh = (stats(x, rets["現金"]) for x in (reb, ann, bnd, bh))
        rows.append({
            "ポートフォリオ": name,
            "CAGR(年次リバ)": s_ann["CAGR"], "CAGR(月次)": s_reb["CAGR"],
            "CAGR(±5%バンド)": s_bnd["CAGR"], "CAGR(放置)": s_bh["CAGR"],
            "上乗せ(年次−放置)": s_ann["CAGR"] - s_bh["CAGR"],
            # 悪魔の取り分の実測: 各資産を単独保有した成長率の加重平均との差
            "実現DR(年次−Σwg)": s_ann["CAGR"] - sum(
                wi * stats((1 + sub[c]).cumprod())["CAGR"] for wi, c in zip(w, cols)),
            "理論DR": diversification_return(sub, w),
            "Vol": s_ann["Vol"], "MaxDD(年次)": s_ann["MaxDD"], "MaxDD(放置)": s_bh["MaxDD"],
            "Sharpe": s_ann["Sharpe"],
        })
    df = pd.DataFrame(rows).set_index("ポートフォリオ")
    print(f"\n{'='*30} {label} {'='*30}")
    with pd.option_context("display.float_format", lambda x: f"{x*100:7.2f}%",
                           "display.width", 250, "display.max_columns", 20):
        disp = df.copy()
        print(disp.drop(columns=["Sharpe"]).to_string())
    print("Sharpe:", {k: round(v, 2) for k, v in df["Sharpe"].items()})
    return df


def subperiods(rets, ports, periods):
    rows = {}
    for name, wd in ports.items():
        cols = list(wd.keys())
        w = [wd[c] for c in cols]
        rows[name] = {}
        for a, b in periods:
            sub = rets.loc[a:b, cols]
            rows[name][f"{a[:4]}-{b[:4]}"] = stats(simulate(sub, w, "annual"))["CAGR"]
            rows[name][f"{a[:4]}-{b[:4]} 上乗せ"] = (
                rows[name][f"{a[:4]}-{b[:4]}"] - stats(simulate(sub, w, "hold", cost=0))["CAGR"])
    df = pd.DataFrame(rows).T
    print("\n===== 時代別 CAGR（年次リバ）と上乗せ（年次リバ−放置） =====")
    with pd.option_context("display.float_format", lambda x: f"{x*100:6.1f}%",
                           "display.width", 250, "display.max_columns", 20):
        print(df.to_string())
    return df


def grid_search(rets, assets, step=0.05, max_dd=None):
    n = int(round(1 / step))
    best = []
    for combo in itertools.product(range(n + 1), repeat=len(assets) - 1):
        if sum(combo) > n:
            continue
        w = [c * step for c in combo] + [(n - sum(combo)) * step]
        v = simulate(rets[assets], w, "annual")
        s = stats(v, rets["現金"])
        if max_dd is not None and s["MaxDD"] < -max_dd:
            continue
        best.append((s["Sharpe"], s["CAGR"], s["MaxDD"], tuple(round(x, 2) for x in w)))
    best.sort(reverse=True)
    return best


def walk_forward(rets, assets, split):
    train, test = rets.loc[:split], rets.loc[split:]
    top = grid_search(train, assets, step=0.1)[0]
    w = list(top[3])
    s_train = stats(simulate(train[assets], w, "annual"), train["現金"])
    s_test = stats(simulate(test[assets], w, "annual"), test["現金"])
    eq = [1 / len(assets)] * len(assets)
    s_eq = stats(simulate(test[assets], eq, "annual"), test["現金"])
    print(f"\n===== ウォークフォワード（〜{split}で最適化 → 以降で検証） =====")
    print(f"学習期間の最適(Sharpe最大) {dict(zip(assets, w))}: 学習 Sharpe {s_train['Sharpe']:.2f} "
          f"CAGR {s_train['CAGR']*100:.1f}%")
    print(f"  → 検証期間: Sharpe {s_test['Sharpe']:.2f}  CAGR {s_test['CAGR']*100:.1f}%  MaxDD {s_test['MaxDD']*100:.1f}%")
    print(f"均等配分 → 検証期間: Sharpe {s_eq['Sharpe']:.2f}  CAGR {s_eq['CAGR']*100:.1f}%  MaxDD {s_eq['MaxDD']*100:.1f}%")


def cost_sensitivity(rets, wd, label):
    cols = list(wd.keys())
    w = [wd[c] for c in cols]
    bh = stats(simulate(rets[cols], w, "hold", cost=0))["CAGR"]
    print(f"\n===== コスト感応度: {label}（放置 CAGR {bh*100:.2f}%） =====")
    for c in (0, 0.001, 0.005, 0.01, 0.02):
        for mode in ("monthly", "annual", "band"):
            g = stats(simulate(rets[cols], w, mode, cost=c))["CAGR"]
            print(f"  片道コスト {c*100:4.1f}%  {mode:7s}: CAGR {g*100:6.2f}%  上乗せ {(g-bh)*100:+6.2f}pt")


EN = {  # 日本語フォントが無い環境でも読めるよう凡例は英語
    "株100%": "Stocks 100%", "株60/債40": "60/40", "株50/金50": "Stocks/Gold 50/50",
    "株/債/金 各1/3": "Stocks/Bonds/Gold 1/3 each",
    "パーマネント(株/債20/金/現金)": "Permanent (S/LB/G/C 25 each)", "パーマネント": "Permanent",
    "株40/債20 30/金30": "Stocks40/LongBond30/Gold30",
    "BTC50/現金50 (古典的シャノン)": "BTC50/Cash50 (classic Shannon)", "BTC50/金50": "BTC50/Gold50",
    "パーマネント+BTC5%": "Permanent + BTC5%", "株/債/金 各30 + BTC10": "S/B/G 30 each + BTC10",
    "株/債/金/BTC 各25": "S/B/G/BTC 25 each",
}


def btc_daily_study():
    """日次の実価格（平均化なし）で BTC/現金 の古典的シャノンの悪魔を検証"""
    px = pd.read_csv(f"{DATA_DIR}/btc.csv", usecols=["time", "PriceUSD"], parse_dates=["time"])
    px = px.dropna().set_index("time")["PriceUSD"]
    r_btc = px.pct_change().dropna()
    r_cash = pd.Series(0.02 / 365, index=r_btc.index)  # 現金は年2%固定
    rules = {
        "毎日": lambda d, prev: True,
        "毎週": lambda d, prev: d.weekday() == 0,
        "毎月": lambda d, prev: d.month != prev.month,
        "四半期": lambda d, prev: d.month != prev.month and d.month in (1, 4, 7, 10),
        "毎年": lambda d, prev: d.year != prev.year,
    }
    print("\n===== BTC/現金 日次実価格での検証（片道コスト0.1%, 現金年2%） =====")
    for start in ("2013-01-01", "2018-01-01", "2021-11-01"):
        rb, rc = r_btc.loc[start:], r_cash.loc[start:]
        yrs = len(rb) / 365
        g_btc = (1 + rb).prod() ** (1 / yrs) - 1
        print(f"\n  開始 {start}: BTC単独 CAGR {g_btc*100:6.1f}%  最大DD "
              f"{((1+rb).cumprod() / (1+rb).cumprod().cummax() - 1).min()*100:.0f}%")
        for wb in (0.1, 0.3, 0.5):
            line = []
            hb, hc = wb, 1 - wb
            v_hold = (wb * (1 + rb).cumprod() + (1 - wb) * (1 + rc).cumprod())
            line.append(f"放置 {(v_hold.iloc[-1] ** (1/yrs) - 1)*100:6.1f}%")
            for name, rule in list(rules.items()) + [("±10pt帯", None), ("±20pt帯", None)]:
                hb, hc = wb, 1 - wb
                vals = []
                prev = rb.index[0]
                for d, x, c in zip(rb.index, rb.values, rc.values):
                    hb *= 1 + x
                    hc *= 1 + c
                    tot = hb + hc
                    if rule is not None:
                        do = rule(d, prev)
                    else:
                        band = 0.1 if name == "±10pt帯" else 0.2
                        do = abs(hb / tot - wb) > band
                    prev = d
                    if do:
                        tot -= abs(hb - wb * tot) * COST * 2
                        hb, hc = wb * tot, (1 - wb) * tot
                    vals.append(tot)
                v = pd.Series(vals, index=rb.index)
                dd = (v / v.cummax() - 1).min()
                line.append(f"{name} {(v.iloc[-1] ** (1/yrs) - 1)*100:6.1f}%({dd*100:.0f}%)")
            print(f"    BTC{int(wb*100):2d}%: " + " | ".join(line))


def plot(rets_long, rets_btc, path):
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    for ax, rets, ports, title in (
        (axes[0], rets_long, PORTS_LONG, "1972–2026 (log, annual rebalance)"),
        (axes[1], rets_btc, PORTS_BTC, "2018–2026, start at 2017 BTC peak (log, annual rebalance)"),
    ):
        for name, wd in ports.items():
            cols = list(wd.keys())
            v = simulate(rets[cols], [wd[c] for c in cols], "annual")
            ax.plot(v.index, v.values, label=EN.get(name, name), lw=1.4)
        ax.set_yscale("log")
        ax.set_title(title)
        ax.grid(alpha=.3)
        ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=110)


def main():
    df = load_monthly_returns()
    long_ = df.loc["1972-01-01":, ["株", "債10", "債20", "金", "現金"]].dropna()
    btc_ = df.loc["2013-01-01":].dropna()
    print(f"長期データ: {long_.index[0]:%Y-%m}〜{long_.index[-1]:%Y-%m} ({len(long_)}ヶ月)")
    print(f"BTCデータ : {btc_.index[0]:%Y-%m}〜{btc_.index[-1]:%Y-%m} ({len(btc_)}ヶ月)")

    print("\n===== 資産別（年率） =====")
    for c in long_.columns:
        print(f"  {c}: リターン {stats((1+long_[c]).cumprod())['CAGR']*100:5.1f}%  ボラ {long_[c].std()*np.sqrt(12)*100:5.1f}%")
    print(f"  BTC(2013〜): リターン {stats((1+btc_['BTC']).cumprod())['CAGR']*100:5.1f}%  ボラ {btc_['BTC'].std()*np.sqrt(12)*100:5.1f}%")
    print("\n相関（1972〜）:\n", long_.corr().round(2).to_string())
    print("\n相関（2013〜）:\n", btc_.corr().round(2).to_string())

    run_table(long_, PORTS_LONG, "1972–2026 BTCなし")
    run_table(btc_, PORTS_BTC, "2013–2026 BTCあり")

    subperiods(long_, PORTS_LONG, [("1972-01", "1981-12"), ("1982-01", "1999-12"),
                                   ("2000-01", "2009-12"), ("2010-01", "2019-12"),
                                   ("2020-01", "2026-12")])

    print("\n===== グリッド探索（株/債20/金/現金, 年次リバ, Sharpe上位5） =====")
    for s in grid_search(long_, ["株", "債20", "金", "現金"])[:5]:
        print(f"  Sharpe {s[0]:.2f} CAGR {s[1]*100:.1f}% MaxDD {s[2]*100:.1f}% 配分 {s[3]}")
    print("  （同、最大DD 20%以内でCAGR最大）")
    cand = grid_search(long_, ["株", "債20", "金", "現金"], max_dd=0.20)
    for s in sorted(cand, key=lambda x: -x[1])[:3]:
        print(f"  Sharpe {s[0]:.2f} CAGR {s[1]*100:.1f}% MaxDD {s[2]*100:.1f}% 配分 {s[3]}")

    walk_forward(long_, ["株", "債20", "金", "現金"], "1998-12")

    run_table(df.loc["2018-01-01":].dropna(), PORTS_BTC, "2018–2026 BTCあり（2017年末バブル天井から開始）")
    btc_daily_study()
    cost_sensitivity(long_, PORTS_LONG["パーマネント(株/債20/金/現金)"], "パーマネント")

    plot(long_, df.loc["2018-01-01":].dropna(), os.path.join(OUT_DIR, "shannon_demon_portfolio.png"))


if __name__ == "__main__":
    main()
