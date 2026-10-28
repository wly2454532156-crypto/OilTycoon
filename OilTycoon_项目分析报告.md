# 《石油大亨》(OilTycoon) 项目分析报告

> 分析对象：`D:\CocosProjects\OilTycoon`（Cocos Creator 3.8.8 + TypeScript）
> 对标对象：`C:\Program Files (x86)\Steam\steamapps\common\Turmoil`（Unity 版）
> 说明：Turmoil 为 Unity 打包产物，无源码。其功能清单通过反读 `Assembly-CSharp.dll` 的符号名 + 游戏常识还原，非源码级确认。
> 本次**未修改项目内任何文件**。

---

## 一、一句话结论

**你已经有一个能跑起来的技术原型（骨架完整、分层正确），但"玩法闭环"还没成形。**
当前状态更接近"Phase 1 完成 80%、Phase 2 完成 50%、Phase 3 完成 30%、玩法目标与结算 0%"，折算成 Turmoil 的完整度大约 **10%–15%**。

而且有 4 个问题会直接导致"游戏玩不下去"，其中 1 个是**实测确认的致命 bug**：默认参数下**67% 的局根本不会生成石油**。

---

## 二、已完成的部分（这些是对的，别推翻）

| 模块 | 文件 | 状态 |
|---|---|---|
| 数据/表现分离 | `Core/*` vs `View/*` | ✅ 真正做到了，Manager 不引用 `cc` |
| 地层生成框架 | `GridManager.ts` | ✅ 三阶段（种子→平滑→连通块剔除→储量梯度）结构完整 |
| 储量梯度 | `_computeEdgeDistances()` | ✅ 多源 BFS，油藏中心储量高、边缘低，思路正确 |
| 管道图结构 | `PipeNetworkManager.ts` | ✅ 无向图 + 邻接校验 + BFS 找地面路径 |
| 经济/市场/马车数据层 | `Economy/*` | ✅ 模型齐全，状态机清晰 |
| 场景装配 | `scene.scene` | ✅ Grid/Pipe/Wagon/UI 四个节点全部正确挂载引用，锚点(-400,200)+(0,1) 与网格坐标系对得上 |
| 触摸坐标换算 | `PipeController._toGrid()` | ✅ 换算逻辑正确，网格 0..40 / 0..20 对得上 |

**架构这块你是对的**——分层、接口、坐标系约定都站得住，后面加系统不用返工。问题全在"数值与闭环"上。

---

## 三、P0 级问题：现在就会让游戏跑不通

### 🔴 1. 默认参数下，67% 的局没有石油（实测）

我把 `GridManager.generate()` 原样复刻后跑了 200 次（`sim_grid.js` 在工作目录）：

```
40x20 单次生成，各阶段油格数：
种子 173 → 平滑1 54 → 平滑2 20 → 平滑3 9 → 平滑4 7 → 平滑5 4
```

```
SDD默认参数(pBase=0.05, wDepth=0.35, 5轮)：油格占比 0.5%（4.3/800格）| 全图无油概率 67%
```

**原因**：你 SDD 里的平滑规则是 `泥土邻居≥5才变油 / 油邻居≥4才保持`，这是一套"高密度才存活"的规则（类似生命游戏的稠密态）。但种子密度平均只有 22%，第一轮平滑就会把绝大多数油格判死，5 轮迭代等于连续 5 次"灭活"。

**这不是调参能救回的量级**——密度从 22% 塌到 0.5%。

我顺手扫了一遍参数空间，推荐组合（120 次/组）：

| pBase | wDepth | 迭代 | 油格占比 | 平均连通块 | 无油率 |
|---|---|---|---|---|---|
| **0.16** | **0.35** | **2** | **11.5%** | **5.0** | **0%** |
| 0.25 | 0.25 | 3 | 12.2% | 4.4 | 0% |
| 0.20 | 0.25 | 1 | 11.5% | 8.0 | 0% |
| 0.12 | 0.45 | 3 | 13.4% | 3.5 | 0% |

（另外：`_smooth()` 被油层和岩石层共用同一个阈值，所以岩石也一起塌了——实测岩石占比同样只有 0.6%，现在地图基本是"一张纯泥土"。）

### 🔴 2. 建管道不扣钱，`payCost()` 全项目零调用

`PipeNetworkManager.buildPipe()` 里 `cost` 算出来了，然后：
```ts
console.log(`建设成功：花费 $${cost}，预计耗时 ${time} 秒`);
```
→ 只打印。`EconomyManager.payCost()` 定义了但**没有任何调用点**（已全项目 grep 确认）。

结果：**钱只进不出**，初始 2000 永不减少。整个经济压力消失，玩家可以疯狂铺管。

### 🔴 3. 没有钻井时间，`time` 算了就丢

```ts
const time = hardness / this.drillSpeed;   // 计算了
console.log(... 预计耗时 ${time} 秒);        // 打印了
```
管道是**瞬成**的。Turmoil 的核心节奏之一就是"钻井要等、管越深越慢"，你这一层完全没接。

### 🔴 4. 岩石不阻挡，`blockType` 参数是死参数

`buildPipe(..., blockType, hardness)` 里 `blockType` 完全没用到（注释也写了"预留"）。意味着：
- 硬度 1 的泥土和硬度 8 的岩石，花费一样、速度一样；
- 岩石在地图上纯粹是**换了个颜色的泥土**，没有"这里钻不过去、得先升级钻头"的决策。

### 🔴 5. 没有井架（Rig），顶行任意位置都能开口 → 无限口井

`_findPathToSurface()` 把"任何 `gridY === 0` 的节点"都当作地面出口。而玩家可以在顶行**任意 x** 开始划线 → 等于每个顶行格子都是一口独立油井。

Turmoil 里地面井架是**有限且需要购买/升级**的，玩家必须决策"这一口井往哪个方向钻"。你现在把这层策略直接抹掉了。

### 🔴 6. 手指快速滑动会"断笔"

`PipeController.onTouchMove()`：
```ts
const dist = Math.abs(gridX - lastGridX) + Math.abs(gridY - lastGridY);
if (dist !== 1) return;     // 跳格就直接放弃，且 last 不更新
```
真机上正常速度划一下，一帧内会跨 3–8 格，`dist` 多数时候 ≠ 1 → **直接 return，划线中断**，而且 `_lastGridX` 没更新，后续移动也接不上，必须重新按下。

`buildPipe` 返回 false 时同样不更新 last，也会卡死。
→ 必须补 **Bresenham 插值**，把两个采样点之间的格子补全（你 SDD 3.2 里写了 Bresenham，代码里没实现）。

---

## 四、P1 级：核心玩法缺失（对比 Turmoil）

### 4.1 机制对比表

| Turmoil 机制（DLL 符号证据） | 你的项目 | 影响 |
|---|---|---|
| `GasSupply` / `RigSpilledGas` / `OnOilBurningStarted` / `GetPipeGasTransferSpeedNoPenalty` | ❌ `BlockType.Gas` 定义了但**生成逻辑里从不产出**，是纯死代码 | 少了"毒气/溢出/燃烧"这层风险 |
| `RigOilCapacity` / `RigOverflowTimer` / `RigOilSpillage` | ⚠️ 只有 `bufferCapacity=50` 一个常数，无溢出倒计时 | 无"抢时机去救井"的紧张感 |
| 油压/pressure 影响涌出速度 | ❌ `pressure = 1` 常数、`pipeWidth = 1` 常数 → **流速恒定为 1**，与深度/储量/科技全无关 | 最深层的油和地表油一样快，玩家没动力往下钻 |
| `BuySilo` / `BuySuperSilo` / `RefineryOilStorage` / `SuperSiloOilStorage` | ❌ 无 | **"囤货等高价"是 Turmoil 的核心策略**，缺了它经济就只剩单向卖 |
| `BuyWagon` / `UpgradeWagonButton` / `WagonOperation` / 左右分配 | ⚠️ 3 辆马车写死，且**全部同时出发、同时去同一侧**（`targetSide` 由同一价格比较决定），玩家无法干预 | 马车从"调度策略"退化成"自动流水线" |
| `BuyScanner`（雷达显影）/ `BuyMole` / `BuyDynamite` | ❌ | 少了三个主动道具维度 |
| `PipeUpgradeScript` / `EstimatePipeUpgradePrice` / elbow drill upgrade | ❌ `pipeWidth` 写死 1 | 科技树完全没有（`TechTree` 接口在 SDD 里设计了，代码里没有） |
| `MonthEndTime` / `LoanMonthlyInterest` / `DayDuration` / `CurrentDay` | ❌ 只有 `tickInterval=0.5s` 无限循环 | **没有关卡边界 → 没有"这一局赢了没有"** |
| `LevelRecapUI` / `SingleLevelRecap` / `HasWonTurmoil` | ❌ | 无结算、无胜负、无目标 |
| `LandAuction` / `StockAuction` / `TownHall` | ❌ | 无关卡间元进度（地块竞标/公司股票） |
| `RivalAI` / `RivalAIBuyUpgrades` | ❌ | 无对手，纯沙盒 |
| `isRevealed` 战争迷雾 + 雷达 | ❌ 字段存在但**从未被赋值或读取**，`GridRenderer` 开局就把 800 格全画出来 | **"不知道油在哪"的搜索乐趣直接归零**——这是我觉得最可惜的一条 |
| `AchievementManager` / `LevelTutorialManager`（教程分支极多） | ❌ | — |
| `MultiplayerManager` / `MultiplayerStocksUI` | ❌ | 长期项，先不管 |

### 4.2 三个"结构性"问题（比缺功能更值得先想清楚）

**(1) 地下信息全公开 → 游戏没悬念了**
Turmoil 的乐趣起点是"我不知道油在哪，得先花钱探"。你开局把整张地层图直接画满屏幕，玩家一眼看穿——后面所有钻井决策都变成"照着答案连线"。`isRevealed` 字段你留对了，但渲染层没用上。**这个改动量很小、收益极大**：开局只画已钻通的格子 + 相邻一圈，其余画成未知色。

**(2) 缺"时间成本"这条腿**
现在唯一的成本是"钱"，而且钱还没扣。真实循环应该是 **钱 × 时间**：钻井耗时、管道流速有限、马车在跑的时候价格在变。你只做了"钱"一条，节奏就变成了瞬间完成。

**(3) 缺"结束条件"**
没有日历、没有目标金额、没有 Over。玩家永远在无限赚钱的沙盒里，5 分钟就没目标了。**建议优先补这个**——哪怕只做"60 天内存到 $X"这一个最简版本，整个游戏立刻从 demo 变成"游戏"。

---

## 五、P2 级：工程质量与移动端适配

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 1 | **触点太小** | `cellSize=20` @ 设计分辨率 800 宽 | 手机 390pt 宽时每格仅 9.75pt ≈ 3.4mm，远低于 9mm 最小触控目标，且**没有缩放/拖动**。Turmoil 的格子是为鼠标设计的，搬到手机会密集到点不准。建议：格子物理尺寸放大 + 双指缩放 + 单指拖动 |
| 2 | **800 次 `rect+fill`** | `GridRenderer.renderGrid()` | 一次性 800 个独立 fill 指令，低端机首帧会明显卡。建议改成单张动态 `Texture2D`（逐像素写色）或 `TiledMap`，一次 drawcall |
| 3 | **每 tick 打日志** | `GameManager.tick()` | 每 0.5s 一条 console.log，微信小游戏里是实打实的性能与包体问题 |
| 4 | **钻过的格子不会变** | `renderGrid` 只在 start 调一次 | 打通泥土/岩石后画面毫无反馈，玩家不知道自己钻到哪了 |
| 5 | **管道没有流体表现** | `renderPipes` 没用 `isPumping`/`currentFlow` | 抽油时管道不会有油滴流动，反馈全靠 UI 数字跳 |
| 6 | **三辆马车重叠** | `WagonRenderer` 全部画在 `y=10` | 3 个矩形叠在同一个位置，看起来像 1 辆。且马车轨道只有 ±100px，而地图宽 800px，视觉比例失衡 |
| 7 | **每 tick 全图 BFS** | `calculateFlow()` | 每个接触油的节点都做一次 BFS 找地表 → O(节点数²)/tick。建议每 tick 从井口做一次反向 BFS + 父指针缓存 |
| 8 | **无随机种子** | `GridManager` 全用 `Math.random()` | 不可复现，做不了每日挑战 / 关卡固定布局 / 回放 |
| 9 | **UI 硬编码坐标** | `UIPanel` 子节点 `_lpos` 固定 | `fitWidth=true` 下不同宽高比会偏移，没有 Widget 适配、没有安全区处理（刘海屏） |
| 10 | **无存档** | — | 关掉就清零 |
| 11 | **`strict: false`** | `tsconfig.json` | 上面好几个"参数算了不用""字段从不读"的问题，`strict` + `noUnusedLocals` 能自动帮你抓出来 |
| 12 | **无构建产物** | 无 `build/` 目录 | 从未构建过，微信小游戏包体/分包/开放数据域都还没验证 |
| 13 | **市场噪声太白** | `MarketManager._compute()` | 每 tick 独立 `Math.random()` → 价格每 0.5s 跳 ±0.1，闪烁抖动。SDD 写的是"正弦 + 随机游走"，实现成了"正弦 + 白噪声"。另外两边只差固定相位 π/2，玩家闭眼也能算准价格 —— 应改为带均值回归的随机游走，并补上 SDD 4.3 的"大量售出压低该侧价格"反馈（未实现） |
| 14 | **溢油惩罚过重** | `spillageRate=10` vs 油价 ≈1 | 溢 1 单位罚 10，是售价的 10 倍。且 `checkSpillage` 每 tick 都判，持续满载会连续罚爆 |

---

## 六、实现进度量化

```
Phase 1  底层数据结构          ████████░░  80%   架构✅ / 生成参数失效❌
Phase 2  管道网与经济          █████░░░░░  50%   图结构✅ / 扣费·耗时·岩石校验❌
Phase 3  表现层接入            ███░░░░░░░  30%   能画✅ / 交互反馈·迷雾·缩放❌
Phase 4  玩法闭环(目标/结算)    ░░░░░░░░░░   0%   ← 最大缺口
Phase 5  科技树·道具·元进度     ░░░░░░░░░░   0%
────────────────────────────────────
Turmoil 机制覆盖度             约 10%–15%
代码量                         9 个 TS 文件 / 约 900 行
美术资源                       0 个（全部 Graphics 色块）
```

---

## 七、建议的修复顺序（按"每小时收益"排）

**第一批（半天内，让游戏真的能玩）**
1. 把 `pBase` 改 0.16、`smoothingIterations` 改 2 → 油格从 0.5% 回到 11%+，无油率 67%→0%
2. `buildPipe` 里接上 `economy.payCost(cost)`，钱不够就 `return false` 并给玩家反馈
3. 补 Bresenham：TOUCH_MOVE 里把上一个格子到当前格子之间的路径全部尝试建管
4. `buildPipe` 里按 `blockType === Rock` 加"钻不透"判断（先不做升级，就是钻不过去）
5. 把"顶行任意位置开口"改成"只有井架那一格能开第一根管"

**第二批（1–2 天，补上节奏与目标）**
6. 加钻井耗时队列（`time` 真正生效），管道先进入"施工中"状态再转正
7. 开局战争迷雾：只有钻过的格子+邻接一圈可见
8. 加最简单的关卡结算：N 天后比目标营收 / 或比对手，出 Recap 面板
9. 管道 `isPumping` 接上油滴流动动画；钻过的格子换色

**第三批（1 周，逼近 Turmoil 的手感）**
10. 油压系统：储量高/深度深 → 压力高 → 流速高，抽出过程中压力衰减（这是 Turmoil 爽感的核心）
11. Silo 储油仓 + 玩家手动"什么时候卖"
12. 马车左右分配 + 购买/升级
13. 科技树：管宽 / 钻速 / 马车容量 / 马车速度
14. 移动端：双指缩放 + 单指拖动 + 格子尺寸重估 + Graphics 换成单纹理

**第四批（后续）**
15. 气体机制、雷达/地鼠/炸药、地块竞标、AI 对手

---

## 八、附：本次分析产出

- `sim_grid.js` — 复刻 `GridManager.generate()` 的验证脚本，可直接 `node sim_grid.js` 重跑参数对比
- 未修改 `D:\CocosProjects\OilTycoon` 下任何文件
