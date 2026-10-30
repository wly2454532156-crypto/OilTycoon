#!/usr/bin/env python3
"""Oil Tycoon 经济平衡无头模拟。

复刻核心经济循环，用「理想操作」跑 N 局，估算胜率（≥ $2500）。
理想操作 = 全知挑最好油列 + 最优井/车配比 + 自动卖高价侧，是真实胜率的上界。

用法：
    python tools/balance_sim.py            # 默认 300 局 × 全配比扫描
    python tools/balance_sim.py --games 500

常数与 TS 代码一一对应，改动 TS 时同步这里。来源文件见每个常量注释。
"""
import argparse
import math
import random
import statistics
import sys
from collections import deque

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ============ 地图/网格（对齐 GridManager） ============
WIDTH = 40
HEIGHT = 20
P_BASE = 0.16          # GridManager._pBase
W_DEPTH = 0.35         # GridManager._wDepth
SMOOTH = 2             # GridManager._smoothingIterations
MIN_CLUSTER = 4        # GridManager._minClusterSize
CAP_BASE = 200         # GridManager._capacityBase
CAP_MULT = 40          # GridManager._capacityMultiplier

# ============ 经济（对齐 EconomyManager / ToolCatalog） ============
START_MONEY = 2000
TARGET = 2500
BUFFER = 500           # EconomyManager.bufferCapacity
SPILL_PER_UNIT = 3     # EconomyManager.spillageRate
SPILL_INITIAL = 1000   # EconomyManager.spillageFineInitial
RIG_PRICE = 350        # ToolCatalog.Rig
WAGON_PRICE = 150      # ToolCatalog.Wagon
PIPE_PER_CELL = 5      # PipeNetworkManager.baseBuildCost
PIPE_DEPTH = 19        # 顶行往下钻到底的典型格数

# ============ 抽油/运输（对齐 PipeNetworkManager / WagonManager） ============
PIPE_WIDTH = 3         # PipeNetworkManager.pipeWidth（每井总流速 cap，units/tick）
WAGON_CAP = 30         # WagonManager.wagonCapacity
WAGON_SPEED = 15       # WagonManager.wagonSpeed
COMPANY_DIST = 100     # WagonManager.companyDistance

# ============ 油价（对齐 MarketManager） ============
PRICE_BASE = 1.3       # MarketManager.basePrice
PRICE_AMP = 0.5        # MarketManager.amplitude
PRICE_OMEGA = 0.1      # MarketManager.omega
PRICE_RAND = 0.1       # MarketManager.randomAmplitude
MIN_PRICE_FACTOR = 0.82   # MarketManager.minPriceFactor
SELL_PRESSURE_PER_UNIT = 0.006  # MarketManager.sellPressurePerUnit
SELL_PRESSURE_DECAY = 0.97      # MarketManager.sellPressureDecay

TICKS = 240            # 120s @ 0.5s/tick（GameManager.tickInterval=0.5）


def gen_columns():
    """忠实复刻 GridManager.generate() 的油藏生成，返回每列 [总储量, 油顶深度]。"""
    ymax = HEIGHT - 1
    oil = [[random.random() < (P_BASE + (y / ymax) * W_DEPTH)
            for x in range(WIDTH)] for y in range(HEIGHT)]

    def smooth(layer):
        nxt = [[False] * WIDTH for _ in range(HEIGHT)]
        for y in range(HEIGHT):
            for x in range(WIDTH):
                n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and layer[ny][nx]:
                            n += 1
                nxt[y][x] = (n >= 4) if layer[y][x] else (n >= 5)
        return nxt

    for _ in range(SMOOTH):
        oil = smooth(oil)

    # 孤岛剔除（< MIN_CLUSTER 的连通块变 Dirt）
    visited = [[False] * WIDTH for _ in range(HEIGHT)]
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if not oil[y][x] or visited[y][x]:
                continue
            stack = [(x, y)]
            visited[y][x] = True
            cluster = []
            while stack:
                cx, cy = stack.pop()
                cluster.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and oil[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            if len(cluster) < MIN_CLUSTER:
                for cx, cy in cluster:
                    oil[cy][cx] = False

    # 到最近 Dirt 的曼哈顿距离（储量梯度）
    dist = [[float('inf')] * WIDTH for _ in range(HEIGHT)]
    q = deque()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if not oil[y][x]:
                dist[y][x] = 0
                q.append((x, y))
    for x in range(WIDTH):
        if oil[0][x] and dist[0][x] > 1:
            dist[0][x] = 1
            q.append((x, 0))
        if oil[HEIGHT - 1][x] and dist[HEIGHT - 1][x] > 1:
            dist[HEIGHT - 1][x] = 1
            q.append((x, HEIGHT - 1))
    for y in range(HEIGHT):
        if oil[y][0] and dist[y][0] > 1:
            dist[y][0] = 1
            q.append((0, y))
        if oil[y][WIDTH - 1] and dist[y][WIDTH - 1] > 1:
            dist[y][WIDTH - 1] = 1
            q.append((WIDTH - 1, y))
    while q:
        x, y = q.popleft()
        nd = dist[y][x] + 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and dist[ny][nx] > nd:
                dist[ny][nx] = nd
                q.append((nx, ny))

    cols = []
    for x in range(WIDTH):
        total = 0
        top = 99
        for y in range(1, HEIGHT):
            if oil[y][x]:
                total += CAP_BASE + dist[y][x] * CAP_MULT
                top = min(top, y)
        if total > 0:
            cols.append((total, top))
    return cols


def run_game(wells_n, wagons_n):
    """模拟一局：给定井数/车数，跑满 TICKS，返回终局余额。"""
    cols = gen_columns()
    cols.sort(key=lambda c: -c[0])

    cost = wells_n * (RIG_PRICE + PIPE_DEPTH * PIPE_PER_CELL) + max(0, wagons_n - 1) * WAGON_PRICE
    money = START_MONEY - cost

    # 每口井 [剩余储量, 钻探剩余 tick]。油顶越深钻得越久（并行钻探后仍以最慢格为准）。
    wells = [[cols[i][0], max(1, int(cols[i][1] * 0.35 + 1))]
             for i in range(min(wells_n, len(cols)))]

    buffer = 0.0
    left_pressure = 0.0
    right_pressure = 0.0
    revenue = 0.0
    spilled_once = False
    transport_per_wagon = WAGON_CAP / (2 * COMPANY_DIST / WAGON_SPEED)

    for t in range(TICKS):
        left_pressure *= SELL_PRESSURE_DECAY
        right_pressure *= SELL_PRESSURE_DECAY

        def price(phase, pressure):
            wave = PRICE_AMP * math.sin(PRICE_OMEGA * t + phase) + (random.random() * 2 - 1) * PRICE_RAND
            return (PRICE_BASE + wave) * max(MIN_PRICE_FACTOR, 1 - pressure)

        pl = price(0.0, left_pressure)
        pr = price(math.pi / 2, right_pressure)

        for i in range(len(wells)):
            if wells[i][1] > 0:
                wells[i][1] -= 1
                continue
            reserve = wells[i][0]
            if reserve > 0:
                flow = min(PIPE_WIDTH, reserve)  # 每井每 tick 上限
                wells[i][0] -= flow
                buffer += flow

        sold = min(buffer, wagons_n * transport_per_wagon)
        buffer -= sold
        side = 'left' if pl >= pr else 'right'
        revenue += sold * (pl if side == 'left' else pr)
        if side == 'left':
            left_pressure += sold * SELL_PRESSURE_PER_UNIT
        else:
            right_pressure += sold * SELL_PRESSURE_PER_UNIT

        if buffer > BUFFER:
            spilled = buffer - BUFFER
            buffer = BUFFER
            penalty = spilled * SPILL_PER_UNIT + (SPILL_INITIAL if not spilled_once else 0)
            if not spilled_once:
                spilled_once = True
            money -= penalty

    return money + revenue


def sweep(games):
    """扫描井数 1..5 × 车数 1..6，返回按胜率排序的 (井, 车, 胜率, 平均终局)。"""
    results = []
    for wn in range(1, 6):
        for wgn in range(1, 7):
            wins = 0
            total = 0.0
            for _ in range(games):
                final = run_game(wn, wgn)
                total += final
                if final >= TARGET:
                    wins += 1
            results.append((wn, wgn, wins / games, total / games))
    results.sort(key=lambda r: -r[2])
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--games', type=int, default=300)
    args = parser.parse_args()

    print(f"=== 理想操作无头模拟（{args.games} 局） ===")
    print(f"目标 ${TARGET} | 初始 ${START_MONEY} | 基准价 ${PRICE_BASE} | 每井流速 {PIPE_WIDTH}/tick | 缓冲 {BUFFER}\n")

    results = sweep(args.games)
    print("Top 8 配比（井数 / 车数 / 胜率 / 平均终局）:")
    for wn, wgn, wr, avg in results[:8]:
        print(f"  wells={wn}  wagons={wgn}  win={wr:.0%}  avg=${avg:.0f}")

    top = results[0]
    print(f"\n最优：{top[0]} 井 {top[1]} 车 → 胜率 {top[2]:.0%}，均 ${top[3]:.0f}")

    meds = []
    for _ in range(min(200, args.games)):
        c = gen_columns()
        if c:
            meds.append(statistics.median([cc[0] for cc in c]))
    print(f"列储量中位（{len(meds)} 局） ~ ${statistics.mean(meds):.0f}")


if __name__ == '__main__':
    main()
