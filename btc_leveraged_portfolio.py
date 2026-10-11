#!/usr/bin/env python3
"""
レバレッジETF＋BTC を組み込んだシャノンの悪魔ポートフォリオ検証（年1回 定率リバランス）

検証A（実データ寄り）: 2013-01〜2018-12
  TQQQ型 … NASDAQ総合 日次から3倍日次リセット合成（arch同梱）→ 月末値
  BTC    … Coin Metrics 日次 → 月末値
  TMF型/長期債/金/現金 … leveraged_portfolio_mix.py と同じ
検証B（長め・代理あり）: 2014-01〜2026-05（BTCデータ末尾）
  3倍株 … Shiller S&P500（月平均価格+配当）を月次リセットで3倍 → TQQQより目減り・暴落を過小評価
  BTC    … 日次 → 月平均（他の月次データと揃える）
  長期債/TMF型/金/現金 … shannon_demon_portfolio.py と同じ
頑健性: 開始点を BTC の天井直後を含めて複数とり、その最悪値で比較する。
"""

import itertools
import sys

import numpy as np
import pandas as pd

import leveraged_portfolio_mix as LM
import shannon_demon_portfolio as SD

DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "data"
LM.DATA_DIR = SD.DATA_DIR = DATA_DIR
FEE3 = 0.009


def btc_daily():
    b = pd.read_csv(f"{DATA_DIR}/btc.csv", usecols=["time", "PriceUSD"], parse_dates=["time"])
    return b.dropna().set_index("time")["PriceUSD"]


def load_a():
    df = LM.load()
    px = btc_daily()
    m_end = px.groupby(px.index.to_period("M")).last().pct_change()
    df["BTC"] = m_end
    return df.loc["2013-01":"2018-12"].dropna()


def load_b():
    d = SD.load_monthly_returns()
    cash = d["現金"]
    out = pd.DataFrame({
        "3倍株": 3 * d["株"] - 2 * cash - FEE3 / 12,
        "株": d["株"],
        "長期債": d["債20"],
        "TMF型": 3 * d["債20"] - 2 * cash - FEE3 / 12,
        "金": d["金"],
        "現金": cash,
        "BTC": d["BTC"],
    })
    out.index = out.index.to_period("M")
    return out.loc["2014-01":"2026-05"].dropna()


def run(df, ports, starts, title, eq="TQQQ型"):
    print(f"\n===== {title}  （年1回12月リバランス）CAGR / 最大DD / Sharpe =====")
    print(f"{'':44s}" + "".join(f"{'開始' + s:>24s}" for s in starts))
    for name, wd in ports.items():
        wd = {(eq if k == "LEV" else k): v for k, v in wd.items()}
        cols = list(wd)
        w = [wd[c] for c in cols]
        line = ""
        for s in starts:
            d = df.loc[s:]
            v = LM.sim(d[cols].values, w, d.index)
            c, m, sh = LM.stats(v, d["現金"].values)
            line += f"{c*100:8.1f}% {m*100:5.0f}% {sh:5.2f}  "
        print(f"{name:42s}{line}")


def calendar_years(df, ports, eq):
    print(f"\n===== 暦年リターン（{eq}） =====")
    rows = {}
    for name, wd in ports.items():
        wd = {(eq if k == "LEV" else k): v for k, v in wd.items()}
        cols = list(wd)
        v = pd.Series(LM.sim(df[cols].values, [wd[c] for c in cols], df.index), index=df.index)
        y = v.groupby(v.index.year).last()
        y = y / y.shift(1).fillna(1) - 1
        rows[name] = (y * 100).round(0).astype(int)
    print(pd.DataFrame(rows).T.to_string())


def grid(df, assets, starts, step=0.05, btc_max=0.3, dd_limits=(0.25, 0.35)):
    n = int(round(1 / step))
    data = [(df.loc[s:][assets].values, df.loc[s:].index, df.loc[s:]["現金"].values) for s in starts]
    bi = assets.index("BTC")
    rows = []
    for combo in itertools.product(range(n + 1), repeat=len(assets) - 1):
        if sum(combo) > n:
            continue
        w = [c * step for c in combo] + [(n - sum(combo)) * step]
        if w[bi] > btc_max + 1e-9:
            continue
        per = [LM.stats(LM.sim(R, w, idx), rf) for R, idx, rf in data]
        rows.append((min(p[0] for p in per), min(p[1] for p in per), np.mean([p[2] for p in per]),
                     tuple(round(x, 2) for x in w)))
    print(f"\n----- 総当たり {assets}（5%刻み, BTC≤{btc_max*100:.0f}%, {len(rows)}通り, 開始点 {starts} の最悪値） -----")
    for lim in dd_limits:
        ok = sorted([r for r in rows if r[1] >= -lim], key=lambda r: -r[0])
        print(f"  最悪の最大DD ≤ {lim*100:.0f}% 上位3:")
        for r in ok[:3]:
            print(f"    最悪CAGR {r[0]*100:5.1f}%  最悪DD {r[1]*100:4.0f}%  平均Sharpe {r[2]:.2f}  {dict(zip(assets, r[3]))}")
    # BTC 比率ごとの最良（DD≤35%）
    print("  BTC比率ごとの最良（最悪DD≤35%）:")
    for b in np.arange(0, btc_max + 1e-9, 0.05):
        ok = [r for r in rows if abs(r[3][bi] - b) < 1e-9 and r[1] >= -0.35]
        if ok:
            r = max(ok, key=lambda r: r[0])
            print(f"    BTC {b*100:3.0f}%: 最悪CAGR {r[0]*100:5.1f}%  最悪DD {r[1]*100:4.0f}%  {dict(zip(assets, r[3]))}")


PORTS = {
    "① 株40/長期債30/金30":                 {"株": .4, "長期債": .3, "金": .3},
    "①+BTC5（現金枠なし→各比例減）":          {"株": .38, "長期債": .285, "金": .285, "BTC": .05},
    "③ LEV13/現金27/長期債30/金30":          {"LEV": .13, "現金": .27, "長期債": .3, "金": .3},
    "③+BTC5（現金から）":                    {"LEV": .13, "現金": .22, "長期債": .3, "金": .3, "BTC": .05},
    "⑨ LEV20/TMF15/金30/現金35":            {"LEV": .2, "TMF型": .15, "金": .3, "現金": .35},
    "⑨+BTC5（現金から）":                    {"LEV": .2, "TMF型": .15, "金": .3, "現金": .3, "BTC": .05},
    "⑨+BTC10（現金から）":                   {"LEV": .2, "TMF型": .15, "金": .3, "現金": .25, "BTC": .1},
    "⑨+BTC20（現金から）":                   {"LEV": .2, "TMF型": .15, "金": .3, "現金": .15, "BTC": .2},
    "BTC50/現金50（参考）":                   {"BTC": .5, "現金": .5},
}


def main():
    a = load_a()
    a = a.rename(columns={"S&P": "株", "TQQQ型": "TQQQ型"})
    a["長期債"] = a["長期債"]
    print(f"検証A: {a.index[0]}〜{a.index[-1]} ({len(a)}ヶ月)")
    print("年率ボラ:", {k: f"{v*100:.0f}%" for k, v in (a[["TQQQ型", "BTC", "TMF型", "金"]].std() * np.sqrt(12)).items()})
    print("相関(A):\n", a[["株", "TQQQ型", "長期債", "金", "BTC"]].corr().round(2).to_string())
    starts_a = ["2013-01", "2014-01", "2016-01"]
    run(a, PORTS, starts_a, "検証A 2013〜2018（TQQQ型=日次合成, BTC=日次月末）", eq="TQQQ型")
    calendar_years(a, {k: PORTS[k] for k in ("⑨ LEV20/TMF15/金30/現金35", "⑨+BTC5（現金から）",
                                             "⑨+BTC10（現金から）", "⑨+BTC20（現金から）")}, "TQQQ型")
    grid(a, ["TQQQ型", "BTC", "TMF型", "金", "現金"], starts_a)

    b = load_b()
    print(f"\n検証B: {b.index[0]}〜{b.index[-1]} ({len(b)}ヶ月)")
    print("相関(B):\n", b[["株", "長期債", "金", "BTC"]].corr().round(2).to_string())
    starts_b = ["2014-01", "2018-01", "2021-11"]
    run(b, PORTS, starts_b, "検証B 2014〜2026（3倍株=S&P月次近似）", eq="3倍株")
    calendar_years(b, {k: PORTS[k] for k in ("① 株40/長期債30/金30", "⑨ LEV20/TMF15/金30/現金35",
                                             "⑨+BTC5（現金から）", "⑨+BTC10（現金から）", "⑨+BTC20（現金から）")}, "3倍株")
    grid(b, ["3倍株", "BTC", "TMF型", "金", "現金"], starts_b)
    grid(b, ["3倍株", "BTC", "長期債", "金", "現金"], starts_b)

    print("\n===== リバランス月（1〜12月）による CAGR の幅（検証B, 開始2018-01） =====")
    d = b.loc["2018-01":]
    for name in ("⑨ LEV20/TMF15/金30/現金35", "⑨+BTC5（現金から）", "⑨+BTC10（現金から）", "⑨+BTC20（現金から）"):
        wd = {("3倍株" if k == "LEV" else k): v for k, v in PORTS[name].items()}
        cols = list(wd)
        cs = [LM.stats(LM.sim(d[cols].values, [wd[c] for c in cols], d.index, m))[0] * 100 for m in range(1, 13)]
        print(f"  {name:28s} {min(cs):5.1f}〜{max(cs):5.1f}%（中央 {np.median(cs):.1f}%）")


if __name__ == "__main__":
    main()
