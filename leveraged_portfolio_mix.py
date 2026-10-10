#!/usr/bin/env python3
"""
レバレッジETF をポートフォリオに組み込む（シャノンの悪魔 = 年1回 定率リバランス）

期間: 1999-02〜2018-12（月次）。ITバブル崩壊・リーマンを含む。
資産:
  S&P500 / NASDAQ 1x・2x・3x / S&P500 3x … arch 同梱の日次指数から日次リセットで合成 → 月末値
  長期債(20年) / 3倍長期債(TMF型) … 米10年債利回りから合成（月次。TMF型は月次リセット近似）
  金 … World Bank 月平均
  現金 … Fama-French RF（T-bill）
評価: 3つの開始点（1999-02 バブル前 / 2000-03 天井 / 2007-11 リーマン前）の最悪値で頑健性を見る。
"""

import itertools
import sys

import numpy as np
import pandas as pd
from arch.data import frenchdata, nasdaq, sp500

DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "data"
COST = 0.001
FEES = {1: 0.0020, 2: 0.0095, 3: 0.0090}
STARTS = ["1999-02", "2000-03", "2007-11"]


def rf_daily(idx):
    ff = frenchdata.load()
    ff.index = pd.PeriodIndex([f"{str(int(i.value))[:4]}-{str(int(i.value))[4:6]}" for i in ff.index], freq="M")
    per = idx.to_period("M")
    rf_m = (ff["RF"] / 100).reindex(per.unique()).ffill()
    days = pd.Series(1, index=idx).groupby(per).transform("count")
    return pd.Series(rf_m.reindex(per).values, index=idx) / days, rf_m


def lev_monthly(px, L, rfd):
    r = px.pct_change().dropna()
    rl = L * r - (L - 1) * rfd.reindex(r.index) - FEES[L] / 252
    return (1 + rl).groupby(r.index.to_period("M")).prod() - 1


def bond20():
    by = pd.read_csv(f"{DATA_DIR}/datasets_bond-yields-us-10y_main_data_monthly.csv", parse_dates=["Date"])
    y = by.set_index("Date")["Rate"] / 100
    out = [np.nan]
    for y0, y1 in zip(y[:-1], y[1:]):
        n, c, r = 239, y0 / 12, y1 / 12
        out.append(c * (1 - (1 + r) ** -n) / r + (1 + r) ** -n - 1 + c)
    s = pd.Series(out, index=y.index.to_period("M"))
    return s


def load():
    nq = nasdaq.load()["Adj Close"]
    sp = sp500.load()["Adj Close"]
    rfd, rf_m = rf_daily(nq.pct_change().dropna().index)
    gd = pd.read_csv(f"{DATA_DIR}/datasets_gold-prices_main_data_monthly.csv")
    gold = gd.set_index(pd.PeriodIndex(gd["Date"], freq="M"))["Price"].pct_change()
    b20 = bond20()
    df = pd.DataFrame({
        "S&P": lev_monthly(sp, 1, rfd),
        "UPRO型": lev_monthly(sp, 3, rfd),
        "QQQ型": lev_monthly(nq, 1, rfd),
        "QLD型": lev_monthly(nq, 2, rfd),
        "TQQQ型": lev_monthly(nq, 3, rfd),
        "長期債": b20,
        "TMF型": 3 * b20 - 2 * rf_m - FEES[3] / 12,
        "金": gold,
        "現金": rf_m,
    }).loc["1999-02":"2018-12"].dropna()
    return df


def sim(R, w, idx, month=12):
    w = np.asarray(w, float)
    h = w.copy()
    v = np.empty(len(R))
    for t in range(len(R)):
        h = h * (1 + R[t])
        tot = h.sum()
        if idx[t].month == month:
            tot -= np.abs(h - w * tot).sum() * COST
            h = w * tot
        v[t] = tot
    return v


def stats(v, rf=None):
    yrs = len(v) / 12
    cagr = v[-1] ** (1 / yrs) - 1
    peak = np.maximum.accumulate(v)
    mdd = (v / peak - 1).min()
    r = np.diff(np.concatenate([[1.0], v])) / np.concatenate([[1.0], v[:-1]])
    sh = None
    if rf is not None:
        ex = r - rf
        sh = ex.mean() / ex.std() * np.sqrt(12)
    return cagr, mdd, sh


def evaluate(df, wd, month=12):
    cols = list(wd)
    w = [wd[c] for c in cols]
    res = {}
    for s in STARTS:
        d = df.loc[s:]
        res[s] = stats(sim(d[cols].values, w, d.index, month), d["現金"].values)
    return res


PORTS = {
    "S&P 100% 放置相当":                   {"S&P": 1},
    "QQQ型 100%":                          {"QQQ型": 1},
    "TQQQ型 100%":                         {"TQQQ型": 1},
    "① 株40/長期債30/金30（前回の推奨）":     {"S&P": .4, "長期債": .3, "金": .3},
    "② QQQ40/長期債30/金30":                {"QQQ型": .4, "長期債": .3, "金": .3},
    "③ TQQQ13/現金27/長期債30/金30（②と同じナスダック量）": {"TQQQ型": .13, "現金": .27, "長期債": .3, "金": .3},
    "④ S&P20/TQQQ10/長期債30/金30/現金10":   {"S&P": .2, "TQQQ型": .1, "長期債": .3, "金": .3, "現金": .1},
    "⑤ QLD20/長期債30/金30/現金20":          {"QLD型": .2, "長期債": .3, "金": .3, "現金": .2},
    "⑥ レバ版パーマネント UPRO/TMF/金/現金 各25": {"UPRO型": .25, "TMF型": .25, "金": .25, "現金": .25},
    "⑦ HFEA型 UPRO55/TMF45":               {"UPRO型": .55, "TMF型": .45},
    "⑧ TQQQ55/TMF45":                      {"TQQQ型": .55, "TMF型": .45},
    "⑨ TQQQ20/TMF15/金30/現金35":            {"TQQQ型": .2, "TMF型": .15, "金": .3, "現金": .35},
}


def print_ports(df):
    print("\n===== 候補ポートフォリオ（年1回12月リバランス）  CAGR / 最大DD / Sharpe =====")
    print(f"{'':52s}" + "".join(f"{'開始'+s:>26s}" for s in STARTS))
    for name, wd in PORTS.items():
        res = evaluate(df, wd)
        print(f"{name:50s}" + "".join(f"{c*100:8.1f}% {m*100:5.0f}% {sh:5.2f}    " for c, m, sh in res.values()))


def grid(df, assets, step=0.05, dd_limits=(0.25, 0.35, 0.50)):
    n = int(round(1 / step))
    rows = []
    data = {s: (df.loc[s:][assets].values, df.loc[s:].index, df.loc[s:]["現金"].values) for s in STARTS}
    for combo in itertools.product(range(n + 1), repeat=len(assets) - 1):
        if sum(combo) > n:
            continue
        w = [c * step for c in combo] + [(n - sum(combo)) * step]
        per = [stats(sim(R, w, idx), rf) for R, idx, rf in data.values()]
        rows.append((min(p[0] for p in per), min(p[1] for p in per), np.mean([p[2] for p in per]),
                     per[0][0], tuple(round(x, 2) for x in w)))
    print(f"\n===== 総当たり {assets}（5%刻み, {len(rows)}通り） =====")
    print("目的: 3つの開始点の『最悪CAGR』を最大化（＝どこで始めても崩れない配分）")
    for lim in dd_limits:
        ok = [r for r in rows if r[1] >= -lim]
        ok.sort(key=lambda r: -r[0])
        print(f"\n  最悪の最大DD ≤ {lim*100:.0f}% の上位3:")
        for r in ok[:3]:
            print(f"    最悪CAGR {r[0]*100:5.1f}%  1999開始CAGR {r[3]*100:5.1f}%  最悪DD {r[1]*100:4.0f}%  "
                  f"平均Sharpe {r[2]:.2f}  配分 {dict(zip(assets, r[4]))}")
    return rows


def month_sensitivity(df, wd, label):
    out = []
    for m in range(1, 13):
        res = evaluate(df, wd, m)
        out.append([res[s][0] for s in STARTS])
    a = np.array(out) * 100
    print(f"  {label:48s} " + " | ".join(f"開始{s}: {a[:, i].min():5.1f}〜{a[:, i].max():5.1f}%"
                                         for i, s in enumerate(STARTS)))


def main():
    df = load()
    print(f"期間 {df.index[0]}〜{df.index[-1]}（{len(df)}ヶ月）")
    print("年率ボラ:", {k: f"{v*100:.0f}%" for k, v in (df.std() * np.sqrt(12)).items()})
    print("相関:\n", df.drop(columns=["UPRO型", "QLD型", "TMF型"]).corr().round(2).to_string())
    print_ports(df)
    grid(df, ["S&P", "TQQQ型", "長期債", "金", "現金"])
    grid(df, ["QQQ型", "TQQQ型", "TMF型", "金", "現金"])
    print("\n===== リバランス月（1〜12月）による CAGR の幅 =====")
    for k in ("① 株40/長期債30/金30（前回の推奨）", "③ TQQQ13/現金27/長期債30/金30（②と同じナスダック量）",
              "④ S&P20/TQQQ10/長期債30/金30/現金10", "⑨ TQQQ20/TMF15/金30/現金35", "⑦ HFEA型 UPRO55/TMF45"):
        month_sensitivity(df, PORTS[k], k)


if __name__ == "__main__":
    main()
