#!/usr/bin/env python3
"""
レバレッジETF（QLD / TQQQ 型）をシャノンの悪魔で回すと？ 日次データ検証

データ: arch パッケージ同梱
  - NASDAQ総合指数 日次（1999-01〜2018-12）… NASDAQ100の代理（ハイテク比率が高く値動きが近い）
  - Fama-French 無リスク金利（月次, T-bill）… 現金リターンとレバの借入コスト
合成方法（日次リセット）:
  r_L = L × r_idx − (L−1) × rf_daily − 経費率/252
  経費率: 1倍 0.20%（QQQ相当）, 2倍 0.95%（QLD）, 3倍 0.86%（TQQQ）
  指数は配当なし価格のため、実物より年0.5〜1%程度低めに出る。
SOXL（半導体3倍）・TECL（テック3倍）は日次指数データが取れないため、
同じ合成式に「ボラだけ変えた」理論計算で比較する。
"""

import numpy as np
import pandas as pd
from arch.data import frenchdata, nasdaq

COST = 0.001  # 片道売買コスト
FEES = {1: 0.0020, 2: 0.0095, 3: 0.0086}


def load():
    px = nasdaq.load()["Adj Close"]
    r = px.pct_change().dropna()
    ff = frenchdata.load()
    ff.index = pd.PeriodIndex([str(int(i.value))[:4] + "-" + str(int(i.value))[4:6]
                               for i in ff.index], freq="M")
    rf_m = ff["RF"] / 100
    per = r.index.to_period("M")
    rf_m = rf_m.reindex(per.unique()).ffill()
    days = pd.Series(1, index=r.index).groupby(per).transform("count")
    rf_d = pd.Series(rf_m.reindex(per).values, index=r.index) / days
    df = pd.DataFrame({"現金": rf_d})
    for L, name in ((1, "QQQ型1倍"), (2, "QLD型2倍"), (3, "TQQQ型3倍")):
        df[name] = L * r - (L - 1) * rf_d - FEES[L] / 252
    return df


def is_rebal(rule, d, prev):
    if rule == "毎日":
        return True
    if rule == "毎月":
        return d.month != prev.month
    if rule == "四半期":
        return d.month != prev.month and d.month in (1, 4, 7, 10)
    if rule == "毎年":
        return d.year != prev.year
    return False


def sim(rets, w, rule):
    """rule: 毎日/毎月/四半期/毎年/放置/帯NN（目標比±NNpt）"""
    w = np.array(w, float)
    hold = w.copy()
    R = rets.values
    idx = rets.index
    out = np.empty(len(R))
    band = int(rule[1:]) / 100 if rule.startswith("帯") else None
    for t in range(len(R)):
        hold *= 1 + R[t]
        tot = hold.sum()
        if band is not None:
            do = np.any(np.abs(hold / tot - w) > band)
        else:
            do = t > 0 and is_rebal(rule, idx[t], idx[t - 1])
        if do:
            tot -= np.abs(hold - w * tot).sum() * COST
            hold = w * tot
        out[t] = tot
    return pd.Series(out, index=idx)


def st(v):
    yrs = len(v) / 252
    cagr = v.iloc[-1] ** (1 / yrs) - 1
    mdd = (v / v.cummax() - 1).min()
    return cagr, mdd


PORTS = {
    "QQQ型 100% 放置":            ({"QQQ型1倍": 1}, ["放置"]),
    "QLD型 100% 放置":            ({"QLD型2倍": 1}, ["放置"]),
    "TQQQ型 100% 放置":           ({"TQQQ型3倍": 1}, ["放置"]),
    "QQQ50/現金50":              ({"QQQ型1倍": .5, "現金": .5}, ["放置", "毎月", "毎年", "帯10"]),
    "QLD50/現金50":              ({"QLD型2倍": .5, "現金": .5}, ["放置", "毎月", "毎年", "帯10"]),
    "TQQQ33/現金67（実質1倍）":     ({"TQQQ型3倍": 1/3, "現金": 2/3}, ["放置", "毎日", "毎月", "四半期", "毎年", "帯10"]),
    "TQQQ50/現金50":             ({"TQQQ型3倍": .5, "現金": .5}, ["放置", "毎月", "毎年", "帯10"]),
    "TQQQ20/QQQ型40/現金40":      ({"TQQQ型3倍": .2, "QQQ型1倍": .4, "現金": .4}, ["放置", "毎月", "毎年"]),
}

STARTS = [("1999-01-04", "バブル前"), ("2000-03-10", "ITバブル天井"),
          ("2002-10-09", "ITバブル底"), ("2007-10-31", "リーマン前天井"), ("2009-03-09", "リーマン底")]


def main():
    df = load()
    print(f"期間 {df.index[0]:%Y-%m-%d}〜{df.index[-1]:%Y-%m-%d}")
    ann = df.std() * np.sqrt(252)
    print("年率ボラ:", {k: f"{v*100:.1f}%" for k, v in ann.items()})

    for start, label in STARTS:
        d = df.loc[start:]
        print(f"\n===== 開始 {start}（{label}）〜2018-12   CAGR / 最大DD =====")
        for name, (wd, rules) in PORTS.items():
            cols = list(wd)
            res = []
            for rule in rules:
                c, m = st(sim(d[cols], [wd[k] for k in cols], rule))
                res.append(f"{rule} {c*100:6.1f}% /{m*100:4.0f}%")
            print(f"  {name:24s} " + " | ".join(res))

    # 年別リターン（TQQQ型の壊滅を確認）
    yr = (1 + df[["QQQ型1倍", "QLD型2倍", "TQQQ型3倍"]]).groupby(df.index.year).prod() - 1
    print("\n===== 暦年リターン =====")
    print((yr * 100).round(0).astype(int).T.to_string())

    # SOXL / TECL 型の理論比較: 期待リターンμ, ボラσ の指数を L倍日次リセット
    print("\n===== 理論: 指数のボラ別にみた L倍ETFの長期成長率（指数の算術リターン年11%、金利3%） =====")
    print("  成長率 ≒ L·μ − (L−1)·rf − 経費 − L²σ²/2     （1倍は μ − σ²/2）")
    mu, rf = 0.11, 0.03
    for name, sig in (("S&P500型", 0.17), ("NASDAQ100型(QQQ)", 0.23), ("テック(XLK→TECL)", 0.25),
                      ("半導体(SOX→SOXL)", 0.38)):
        row = []
        for L in (1, 2, 3):
            g = L * mu - (L - 1) * rf - FEES[L] - (L * sig) ** 2 / 2
            row.append(f"{L}倍 {g*100:6.1f}%")
        best_L = (mu - rf) / sig ** 2
        print(f"  {name:18s} σ={sig*100:.0f}%: " + " | ".join(row) + f"   成長率最大のL ≒ {best_L:.1f}倍")


if __name__ == "__main__":
    main()
