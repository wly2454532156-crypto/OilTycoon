
# 《石油大亨》微信小游戏 - 软件设计文档 (v1.0)

## 1. 架构与工程规范

*   **引擎与语言**：Cocos Creator 3.x + TypeScript。
*   **设计模式**：严格执行逻辑层与表现层分离。所有地下资源分布、管道寻路、经济计算全部在独立的数据类（Manager/Model）中运算，Cocos 节点（View）仅负责读取数据并渲染更新。
*   **坐标系约定**：采用二维网格（Grid）体系定义地下空间，左上角为 `(0,0)`，向下为 Y 轴正方向，所有物理碰撞和管道连接基于网格坐标而非屏幕像素坐标。

## 2. 核心系统一：地层生成系统（Grid & Resource System）

负责在游戏开局时生成具有自然分布特征（如油藏聚集、岩石阻挡）的地下网格图。

### 2.1 核心数据枚举与接口

```typescript
// 地块类型枚举
export enum BlockType {
    Dirt = 0,   // 普通泥土（基础钻透速度）
    Rock = 1,   // 岩石（钻透极慢，需科技升级）
    Oil = 2,    // 石油（可开采资源）
    Gas = 3     // 天然气（影响油压或单独收集）
}

// 单个网格节点数据模型
export interface GridBlock {
    x: number;                  // 逻辑坐标 X
    y: number;                  // 逻辑坐标 Y
    type: BlockType;            // 地块类型
    hardness: number;           // 硬度（决定钻井耗时）
    resourceCapacity: number;   // 资源储量（仅对 Oil/Gas 有效）
    isRevealed: boolean;        // 是否已被雷达或管道探测（决定战争迷雾渲染）
}

```

### 2.2 算法逻辑：基于深度权重的元胞自动机

油藏的生成分为三个清晰的数学阶段：初始化扩散、聚集平滑（迭代）、储量梯度计算。

**阶段一：初始化随机种子**

* **逻辑**：遍历整个网格，基于概率判定每个网格初始是否为 `Oil`。
* **深度权重公式**：网格处于坐标 `(x, y)` 时的生成概率 $P(y)$ 随深度增加。
$P(y) = P_{base} + (\frac{y}{Y_{max}}) \times W_{depth}$
* **参数建议**：基础概率 $P_{base} = 0.05$，深度权重 $W_{depth} = 0.35$，$Y_{max}$ 为最大网格深度。

**阶段二：Moore 邻域平滑迭代**

* **逻辑**：采用 8 邻域进行 4-5 次平滑迭代，促使散落的噪点聚集成团块。
* **演化规则**：设当前网格状态为 $S$，其 8 个相邻网格中类型为 `Oil` 的数量为 $N$。
1. 如果 $S$ 为 `Dirt` 且 $N \ge 5$，则下一步状态变为 `Oil`。
2. 如果 $S$ 为 `Oil` 且 $N \ge 4$，则下一步状态保持 `Oil`。
3. 其他所有情况，状态全部变为（或保持） `Dirt`。


* **边界条件**：超出边界的坐标在计算 $N$ 时视为 `Dirt`。

**阶段三：孤岛剔除与储量赋值**

* **连通图过滤**：使用洪水填充算法寻找所有连通的 `Oil` 区块集合（Cluster）。若网格总数 $< 4$，强制转化为 `Dirt`。
* **储量梯度测算**：计算保留 Cluster 中每个网格到最近 `Dirt` 的曼哈顿距离 $D_{edge}$。
$Capacity = C_{base} + D_{edge} \times C_{multiplier}$

**岩石生成覆盖**

* 在油田生成完毕后，采用同套逻辑独立生成岩石（`Rock`）网格。
* **冲突规则**：当岩石生成在已有油藏位置时，油藏保留，岩石层退让（Oil 优先级大于 Rock）。

## 3. 核心系统二：管道流体与寻路系统（Pipeline Network）

负责处理玩家拖拽生成的管道拓扑结构、钻头延伸逻辑以及流体传输计算。

### 3.1 核心数据结构

```typescript
// 管道节点（图论中的顶点）
export interface PipeNode {
    id: string;                 // 唯一标识，例如 "x_y"
    gridX: number;
    gridY: number;
    connectedNodes: string[];   // 相连的上下左右节点 ID 数组（构建无向图）
    isPumping: boolean;         // 当前是否正在抽油
    currentFlow: number;        // 当前管道内的流体量/流速
}

// 管道网络管理器
export interface PipeNetwork {
    nodes: Map<string, PipeNode>;
    addPipe(startX: number, startY: number, endX: number, endY: number): boolean;
    calculateFlow(): void;      // 每帧/每 Tick 调用的流体力学结算
}

```

### 3.2 算法逻辑要求

* **建造验证**：玩家手指滑动划线时，使用 Bresenham 直线算法或曼哈顿路径将其转换为网格坐标集合，验证资金是否足够以及目标地块是否可穿透。
* **图遍历与流速**：当某个 `PipeNode` 接触到 `BlockType.Oil` 时，触发该连通图的 BFS（广度优先搜索），向根节点（地面油井）传输资源。

## 4. 经济循环与科技系统（Economy & Tech System）

本系统负责处理游戏中所有的数值流转，包括初始资金、建设消耗、动态市场价格、马车运输以及科技升级。

### 4.1 核心数据模型

```typescript
// 玩家钱包状态
export interface WalletState {
    balance: number;            // 当前可用现金
    totalEarned: number;        // 本局累计总收入
    totalSpent: number;         // 本局累计总支出
    spillagePenalty: number;    // 溢油罚款（原油溢出地表未被及时收集）
}

// 市场价格模型
export interface MarketState {
    leftCompanyPrice: number;   // 左侧收购商当前价格
    rightCompanyPrice: number;  // 右侧收购商当前价格
    priceTickCounter: number;   // 价格波动计时器
}

// 科技与升级树模型
export interface TechTree {
    pipeWidthLevel: number;     // 管道宽度（决定基础最大流速）
    drillSpeedLevel: number;    // 钻头硬度/速度（决定钻透耗时）
    wagonCapacityLevel: number; // 马车容量（决定单趟运输量）
    wagonSpeedLevel: number;    // 马车移动速度
}

```

### 4.2 数值计算公式

* **管道建设成本**：$Cost = L \times C_{base} + B \times C_{branch}$
$L$ 为新增网格长度，$B$ 为分支节点数。对分叉接头收取额外费用，鼓励树状拓扑。
* **钻透时间计算**：$T_{drill} = \frac{Hardness}{Speed_{base} \times Tech_{drillSpeed}}$
* **原油涌出流速**：$Flow = min(Pressure, Width_{base} \times Tech_{pipeWidth})$
真实流速受限于地下油藏当前剩余压力与管道物理宽度的最小值。

### 4.3 动态市场价格算法

* **基础波动算法**：$P(t) = P_{base} + A \times \sin(\omega t + \phi) + Random(-R, R)$
使用正弦波保证价格周期性起伏，叠加随机游走制造不可预测性。
* **供需反馈系统**：当玩家向某一侧大量售卖时，触发阈值增加该侧价格下降权重 $W_{drop}$，迫使玩家调度马车。

### 4.4 运输与结算逻辑

* **缓存与溢出**：地面油井拥有微小的储油量缓存。管道抽上的油先进入缓存，马车到达后扣除。
* **溢油惩罚**：缓存满载且无空闲马车时触发溢油，按照溢出体积从钱包高额扣款。

## 5. 阶段开发拆解 (Phase Plan)

* **Phase 1：底层数据结构构建**。实现 `GridManager` 和自然地质生成算法，不涉及 UI。
* **Phase 2：管道网与交互**。实现 `PipeNetworkManager`，支持通过代码输入起点和终点，构建图网络并扣除资金。
* **Phase 3：Cocos 表现层接入**。将数据层挂载到 Cocos 节点，实现点击、滑动绘图和油滴动画。


```
2026-10-27
### 2.2 算法逻辑要求（更新参数）
*   **阶段一：初始化随机种子**：为了解决默认参数导致全图无油的问题，推荐参数修正为：基础概率 $P_{base} = 0.16$，深度权重 $W_{depth} = 0.35$。
*   **阶段二：Moore 邻域平滑迭代**：平滑迭代次数修改为 2 次，以保证约 11.5% 的油格占比和 100% 的生成率。

### 3.2 算法逻辑要求（更新物理与经济限制）
*   **钻井限制 (Rig)**：玩家不能在顶行任意位置划线。必须先花费 $350 购买/放置井架（Rig），管道只能从拥有井架的地表网格向下延伸。
*   **岩石阻挡 (Rock Blocking)**：在未解锁高级钻头科技前，当试图向 `BlockType.Rock` 延伸管道时，必须返回 `false` 并阻止建造。
*   **实际扣费**：每次成功构建管道（基础费 $5，分叉费 $15），必须显式调用 `EconomyManager.payCost(cost)`，若余额不足则拒绝建造。
*   **防断触插值 (Bresenham)**：玩家手指快速滑动跨越多格时，必须使用 Bresenham 直线算法补齐起始点和终点之间的所有网格。

### 4. 核心工具与设施价格表
结合游戏 UI 设计，定义以下基础资产价格：
*   **探矿者 (Dowser)**：$100，用于地面寻找油源。
*   **扫描仪 (Scanner)**：$100，用于透视地下一定区域的迷雾。
*   **鼹鼠 (Mole)**：$100，用于地下随机探索。
*   **钻井 (Rig)**：$350，开启一条管道的必需起点。
*   **油罐 (Silo)**：$250，增加地表存储上限。
*   **马车 (Wagon)**：$150，购买一辆用于运输和销售石油的马车。

## 6. 数值链修复（2026-10-27 复测，对应分析报告）

*   **施工队列（顺序钻井）**：移除 `buildPipe` 中 `fromNode.status === 'building'` 的前置阻断，一次滑动即可把整条路径全部入队；`updateDrills` 改为顺序队列——仅队首节点扣减 `buildTimeLeft`，完工后 `shift` 并把剩余时间顺延给下一节，恢复 Bresenham 多格建管。
*   **油压公式生效**：`pipeWidth`（Width_base）由 1 上调为 5，`actualFlow = min(pressure, 5)` 不再恒等于 1；`pressure = capacity/50 + depth*0.1` 在约 2~8 区间波动，流速真正随储量与深度变化。
*   **经济再平衡**：`targetMoney` 由 $5000 下调为 $2000，使 60 天（约 60 秒）内可达成。
*   **井架自由选址 + 地表油迹**：移除开局自动放井架；玩家点顶行格放置井架（扣 $350）并立即起笔。生成时把「下方有油的列」的地表格标记为深色油迹（isOilHint），让玩家据此选址，消除 31% 干井死局。
*   **待办（后续批次）**：① 硬度系统（岩石由「阻挡」改为「极慢钻透」或接入钻速科技）；② scene 绑定 dateLabel；③ renderGrid 性能（单纹理）；④ 结算 UI 面板。
*   **调试辅助**：`GameManager.debugRevealAll` 布尔开关，勾选后开局揭开全图迷雾，便于验证石油分布、油迹与管道连接。

## 7. 经济循环二：Silo 储油 + 手动择时卖油（2026-10-27）

*   **Silo 储油仓**：地表基础储油上限 50 单位。可花 $250 购买 Silo，每个 +50 上限（`EconomyManager.buySilo()`）。
*   **手动卖油**：取消马车自动卖油。玩家手动触发 `WagonManager.dispatchSell('left'|'right', economy)`，让所有空闲马车装油运往指定收购商，到达时按当时价格结算。
*   **择时博弈**：油先囤在地表缓存，缓存满则溢油罚款；玩家在「囤着等高价」与「满了被罚」之间取舍。
*   **交互（原型）**：键盘 B=买 Silo、1=卖左、2=卖右；移动端需换成触控按钮。

## 8. 补全路线图（2026-10-28，对齐 Turmoil 的一手 DLL 分析）

> 目标：从「能跑通一局的 demo」推进到「移动端可玩的完整单局」。共 6 个 Phase，每个独立可验证、有验收标准。所有新增数值以本节为准（后续修正只在本文档改，不回写代码注释）。

### Phase 1：工具/设施目录 + 价格面板 + 点击使用（本次启动，最高优先）

**目标**：把「买设施 / 用工具」从键盘原型换成移动端触控目录——底部工具条显示每项名称+价格，点击选中（工具）或立即购买（设施），再点地图执行；对齐电脑版 Turmoil 的「点工具→点地面」交互。

#### 1.1 工具/设施目录（价格表，唯一规格来源）

| 分类 | 名称 | 键 | 价格 | 效果 |
|---|---|---|---|---|
| 设施 | 钻井 Rig | `rig` | $350 | 进入「放井架」状态，点顶行格放置（开启一条管道的必需起点） |
| 设施 | 油罐 Silo | `silo` | $250 | 立即 +50 地表储油上限 |
| 设施 | 马车 Wagon | `wagon` | $150 | 立即增加一辆空闲马车（移除「写死 3 辆」） |
| 工具 | 探测器 Dowser | `dowser` | $100 | 选中后点任意格：报告该列下方是否含油（沿 y 扫描），不消耗目标格 |
| 工具 | 扫描仪 Scanner | `scanner` | $100 | 选中后点任意格：揭开以该格为中心 3×3 的战争迷雾 |
| 工具 | 鼹鼠 Mole | `mole` | $100 | 选中后点任意格：从该格向地下随机钻探，揭开一条随机路径（约 5 格）迷雾 |
| 工具 | 炸药 Dynamite | `dynamite` | $100 | 选中后点岩石格：清除该岩石（变泥土），不生成油 |

#### 1.2 数据层（纯逻辑，不引用 `cc`）

新增 `assets/Scripts/Economy/ToolCatalog.ts`：

*   `export enum ToolType { Rig, Silo, Wagon, Dowser, Scanner, Mole, Dynamite }`
*   `export interface ToolDef { type: ToolType; name: string; price: number; category: 'facility' | 'tool'; }`
*   `export const TOOL_CATALOG: ToolDef[] = [...]` —— 上表为唯一数据源。
*   `EconomyManager` 增加：`getToolDef(t)`、`canAfford(t)`、`buyTool(t)`（余额校验 + `payCost`，返回 boolean）。

#### 1.3 表现层：底部工具条 `ToolPanel`

新增 `assets/Scripts/View/ToolPanel.ts`（挂到 Canvas 下的 `ToolPanel` 节点）：

*   横向排列 7 个条目，每个显示：名称 + `$${price}`（价格用 Label 文本）。
*   **设施**（Rig/Silo/Wagon）：点击立即 `buyTool`，成功后刷新余额；余额不足置灰禁用。
*   **工具**（Dowser/Scanner/Mole/Dynamite）：点击进入「选中」态（高亮描边），再点地图执行后**取消选中并扣费**；再次点击已选中项则取消选中。
*   每 tick 或余额变化时刷新各条目「可买/禁用」状态与余额文本。

#### 1.4 交互接入（复用现有 `PipeController`）

`PipeController` 增加 `selectedTool: ToolType | null` 状态：

*   `selectedTool === null`：维持现有行为（放井架 / 划线建管）。
*   `selectedTool !== null`：`onTouchStart` 优先走「工具执行」分支——调用对应工具逻辑，成功后 `selectedTool = null`。
*   工具逻辑（新建 `assets/Scripts/Core/ToolManager.ts` 纯逻辑类）：
    *   `useDowser(x,y)` → 返回该列 `y>0` 是否含 `Oil`（布尔）；`ToolPanel` 用 label 反馈结果。
    *   `useScanner(x,y)` → `gridMgr.revealArea(x,y)`（复用现有 `revealArea`）。
    *   `useMole(x,y)` → 从 `(x,y)` 向下随机走 5 步，逐格 `revealArea`。
    *   `useDynamite(x,y)` → 若 `block.type===Rock`，改 `Dirt` 并 `revealArea`，否则返还（不扣费）。

#### 1.5 验收标准

*   底部目录显示 7 项及正确价格；余额不足时按钮禁用。
*   点 Dowser 再点地表，能正确反馈该列有无油；点 Scanner 能揭 3×3 迷雾；点 Mole 能揭随机路径；点 Dynamite 能清岩石。
*   买 Wagon 后马车数 +1（`WagonManager.wagons` 长度增加），买 Silo 后 `bufferCapacity` +50。
*   键盘 B/1/2 快捷方式移除或保留为调试，不再作为主交互。

### Phase 2：储油升级链 + 马车购买/升级（2026-10-28 完成）

*   **SuperSilo**：`buySuperSilo()`（$500，+100 上限），目录新增「超级油罐」按钮，Silo 之外的第二级储油。
*   **马车初始 1 辆**：`wagonCount = 1`（不再写死 3 辆），`buyWagon()`（$150）继续买。
*   **马车升级**：`buyWagonCapacityUpgrade()`（$100，+10/级）、`buyWagonSpeedUpgrade()`（$100，+5/级），对所有现有马车生效。
*   **交互（原型）**：升级暂用键盘 `C`=容量、`V`=速度；点击版升级面板留到后续（工具栏单行放不下）。
*   验收：可连续买马车；升级后单趟运量/速度可感知变化。

### Phase 3：气体系统（Gas 生成 + 溢出/燃烧）（2026-10-28 完成）

*   **气藏生成**：`GridManager` 产出 `BlockType.Gas`（独立种子 `gasPBase=0.15 / gasWDepth=0.25`，2 轮平滑 + 去 <3 小簇），合并优先级 **油 > 气 > 岩石**。渲染为浅蓝色（`COLOR_GAS`）。
*   **气体累积**：`PipeNetworkManager.calculateFlow()` 检测到已完工管道接触 `Gas` 格时，每格每 tick 累积 15（`gasPerNode`），不产油；无接触时每 tick 消散 8（`gasDecay`）。
*   **燃烧触发**：`gasLevel ≥ 100`（`gasThreshold`）时触发——清零气量、进入 `isBurning` 停工 6 tick（3 秒，期间 `calculateFlow` 直接返回 0 停抽）、累积 $200 罚款（`consumeBurnPenalty()` 由 `GameManager` 扣款）。
*   对标 Turmoil `GasSupply` + `OnOilBurningStarted`。
*   验收：`debugRevealAll` 全开迷雾可见浅蓝气藏；钻到气后 tick 日志出现「气体 N」、超阈后「💥 气藏燃烧」+ 停工。

### Phase 4：钻头科技 + 硬岩分级（2026-10-28 完成）

*   **岩石密度修复**：`rockPBase` 0.05 → **0.14**（原 0.05 会塌缩到 0.6% 几乎不生成），否则无可钻岩石。
*   **岩石可钻**：移除 `buildPipe` 里的 Rock 阻挡（同时删除死参数 `blockType`），岩石改为「慢钻」——`时间 = 硬度/(钻速×等级)`，岩石硬度 8 → 8 秒。
*   **硬岩档**：深层岩石（`y >= height/2`）硬度翻倍到 16，钻透更慢；渲染为更深灰（`COLOR_HARD_ROCK`）。
*   **钻速科技**：`tech.drillSpeedLevel` 落地，`upgradeDrillSpeed()`（$150，+1 级，钻透时间按等级递减）；键盘 `D` 升级。
*   验收：岩石可钻但明显慢、硬岩更慢；按 D 升级后钻透变快。

### Phase 5：结算 Recap 面板 + 目标收紧（2026-10-28 完成）

*   **真 Recap 面板**：新增 `View/RecapPanel.ts`（代码构建居中半透明面板），`_triggerGameOver` 时动态创建并显示胜负 + 最终余额/目标/累计营收/累计支出/溢油罚款/用时，取代 console 打印。
*   **目标收紧**：`targetMoney` 2000 → **2500**（脱离初始余额，避免「不玩也赢」；单井 120 天内可达）。
*   验收：到点弹出可读结算面板，胜负明确。

### Phase 6：移动端体验（2026-10-28 部分完成）

*   **双指缩放 + 拖动（已完成）**：`PipeController` 检测两指捏合缩放（`MIN_ZOOM=1`~`MAX_ZOOM=3`）+ 两指拖动平移，缩放/平移 Grid 与 Pipe 节点；单指仍画管。`_toGrid` 用 `convertToNodeSpaceAR` 自动跟随节点缩放，触摸→网格映射不变。
*   **dateLabel 场景绑定（暂缓）**：天数已在 RecapPanel（用时 X/Y 天）与 tick 日志显示，低优先，需要时再补场景 Label。
*   **单纹理 renderGrid（暂缓）**：40×20 仅 800 次 `rect+fill`，实际不构成首帧瓶颈；等真机实测卡顿再优化为 `Texture2D`。
*   验收：手机上双指可缩放点准格子；两指拖动平移。

## 9. 多井架（2026-10-28）

*   **单井 → 多井**：`PipeNetworkManager.rigX`（单个值）改为 `rigs: number[]`（井架列列表），`placeRig(x)` 放置（每列最多一口）、`hasRig(x)` 查询。
*   **建管起点**：`buildPipe` 的「首次建管必须从井架」改为「从任一井架列（顶行）」；`_findPathToSurface` 的 BFS 出口改为「任一井架格」。
*   **放置交互**：点「钻井」进入待放置态后，可连续在多个顶行格放置多口井（每口 $350）；`GridRenderer` 循环绘制所有井架。
*   验收：可放多口井，每口井独立向下钻管、独立抽油（就近出口）。

## 10. 经济链修复 + 并行钻探 + 小修（2026-10-30，对齐 Turmoil 实测值）

> 400 局「理想操作」模拟：胜率 0%、净利 -$1165。根因：① 抽取（单油格 ~4/tick，井柱穿 2.5 格 ≈ 20/s）远快于运输（4 马车上限 8/s）；② 溢油罚 $10/桶 = 售价 10 倍；③ 油迹列储量中位 380 < 开发成本 445，57% 列亏钱；④ `updateDrills` 全局单队列串行钻探（5 井 = 95s）。对照解包 `Turmoil_Data/resources.assets`（定点 `rawValue/65536`）：`RigOilCapacity=559/井`、`SpillageFineInitial=$1000`+`SpillageFinePerUnit=$3`、`WagonsMin/Max=5/15`（自动 AI）、`OilSalePriceMin/Max=0.90/1.15`（供需驱动）。

### 10.1 溢油罚款（对齐 Turmoil）
*   `EconomyManager.spillageRate: 10 → 3`；新增 `spillageFineInitial = 1000` 与 `hasSpilledOnce` 标志：**首次溢油额外扣 $1,000，之后每桶 $3**。

### 10.2 地表缓冲做大（蓄水池）
*   `bufferCapacity: 50 → 500`；`siloCapacityBonus: 50 → 500`；`superSiloCapacityBonus: 100 → 1500`。缓冲做大后溢油从「常态」变「事故」。

### 10.3 井口限流（对齐 Turmoil 管道总容量）
*   `PipeNetworkManager.calculateFlow()` 改为**按地表井架分组**：各油格算 `pressure = capacity/50 + depth*0.1`，同井累加 `totalPressure`，该井 `totalFlow = min(totalPressure, pipeWidth × tech.pipeWidthLevel)`，再按各格 pressure 占比分配回扣储量。
*   `pipeWidth: 5 → 3`（重定义为**每口井总流速上限** = 3/tick = 6/s，仍随科技等级放大）。气体检测保持逐格，不受限流影响。

### 10.4 储量上调（解决回本）
*   `GridManager.capacityBase: 100 → 200`、`capacityMultiplier: 20 → 40`，列中位 ~700-800 > 成本 445。

### 10.5 马车自动化 + 基础增强
*   `WagonManager._updateIdle`：空闲马车**自动装油卖到当前较高价侧**（保留左右价差博弈），无需手动按 1/2。
*   基础增强：`wagonCapacity: 20 → 30`、`wagonSpeed: 10 → 15`（单辆 ≈ 4.5/s）。

### 10.6 供需反馈油价（补 SDD 4.3）
*   `MarketManager` 新增 `registerSell(side, volume)`：卖出累积每侧 `sellPressure`，每 tick `×0.97` 衰减；最终价 = 正弦波 × `clamp(1 - sellPressure, 0.82, 1)`。卖多压价、随时间恢复。
*   **基准价 $1.0 → $1.3**：无头模拟证实 $1.0 在 120s 局内无论如何赢不了（即使供需温和也 0%），而 Turmoil 有效油价 = $0.90~1.15 × `OilSalePriceModifier 1.22` ≈ **$1.1~1.4**，$1.3 仍在区间内。

### 10.7 并行钻探
*   `PipeNetworkManager.updateDrills()` 改为**遍历 `activeDrills`，每个施工节点独立 `buildTimeLeft -= dt`**，完工置 `done` 并移除。纯泥土 19 格 ≈ 1s 钻完整列（每格 1s 并行），岩石 8s / 硬岩 16s 仍是慢钻，5 井并行。

### 10.8 小修
*   `GridManager`：`isOilHint` 只标**浅层油**（该列油顶 `y<6`），深层油需探测器/扫描仪/鼹鼠。
*   `UIPanel`：`onLoad` 若 `dateLabel === null` 则运行时创建 Label（显示「第 X / 120 天」）；删除死代码 `showGameOver()`。
*   `WagonRenderer`：马车纵向错开 `y = 10 + wagon.id * 30`。

### 10.9 验收标准
*   400 局理想模拟：胜率 > 50%、净利转正；溢油罚款「3 倍 + 一次性 $1,000」；单列油田零溢油全卖盈利。
*   5 口井纯泥土 < 5s 钻完（而非 95s）；马车空闲即自动卖；油价随卖出量下压。
*   无头模拟（理想操作）：基准价 $1.3 时「2 井 3 车」胜率 100%、终局均 $2615（净 +$115）；$1.0 时 0%。真实对局因迷雾/气藏/岩石/择时更严，理想胜率需 >50% 留余量。**已调常数**：`basePrice=1.3`、`minPriceFactor=0.82`、`sellPressurePerUnit=0.006`、`sellPressureDecay=0.97`、`pipeWidth=3`、`capacityBase=200`、`capacityMultiplier=40`、`spillageRate=3`+首次 `$1000`、`bufferCapacity=500`、马车 `30/15`。

### 10.10 平衡模拟工具
*   `tools/balance_sim.py`：无头复刻核心经济循环，`python tools/balance_sim.py --games N` 扫描井/车配比跑胜率。常数与 TS 代码一一对应，改 TS 时同步此处。

### 10.11 后续路线图（不在本批次）
*   ~~Phase 10：马车左右分配 UI~~ → 见 §11（已完成）。
*   ~~Phase 11：卖气收益~~ → 见 §12（已完成；炼油厂产 petrol 留后续）。
*   Phase 12a：贷款 → 见 §13（本次）；Phase 12b：关卡间元进度（Turmoil campaign、tenants）留后续。
*   Phase 13：对手 AI + 土地拍卖（Turmoil `NumPlayers=4`、`aiconfig_turmoil_expert`、`EstateBidPrice`）。

## 11. Phase 10：马车左右分配 UI（2026-10-30）

> 现状：马车自动卖高价侧，`registerSell` 压价被自动套利掉，玩家无参与。对齐 Turmoil `tut_companywagon_assignment`，让玩家手动分配卖油方向，激活供需博弈。

### 11.1 卖油模式（`WagonManager`）
*   新增 `sellMode: 'left' | 'right' | 'auto'`（默认 `'auto'`）+ `setSellMode(mode)`。
*   `_updateIdle`：`auto` 卖高价侧（原行为）；`left`/`right` 固定卖对应侧。`dispatchSell`（键盘 1/2）保留为手动覆盖。

### 11.2 分配按钮（`ToolPanel`）
*   底部工具栏第二行新增 3 键「卖左 / 自动 / 卖右」，点击 `setSellMode`；`refresh()` 高亮当前模式（`COLOR_SELECTED`）。

### 11.3 验收标准
*   点「卖左」后空闲马车只卖左，左价随卖出量下压、右价回涨；切「自动」恢复高价侧。
*   手动键盘 1/2 仍可一次性覆盖派送。

## 12. Phase 11：卖气收益（2026-10-30）

> 现状：气藏是「无限源」——钻到后 `gasPerNode` 每 tick 固定累加、永不枯竭，一旦气量 ≥ 100 就燃烧扣款，形成「永久燃烧循环」。且气体纯是惩罚。对齐 Turmoil（`CompanyGasSellFactor`、`GasSupply`），把气藏改成有限储量 + 可卖收益，燃烧从「必然」变「你不卖的后果」。

### 12.1 气藏有限化（`GridManager`）
*   新增 `_gasCapacityBase = 80`，生成时给 `BlockType.Gas` 格设 `resourceCapacity = 80`（原来为 0），气格像油格一样可枯竭。

### 12.2 气体抽取 + 卖气（`PipeNetworkManager`）
*   `calculateFlow` 气体分支改为「按储量抽取」：`extract = min(gasPerNode, resourceCapacity)`，扣储量、累加 `gasTouched`。枯竭后不再贡献。
*   新增 `gasPrice = 3`、`getGasSaleValue()`、`sellGas(economy)`：卖出当前 `gasLevel × gasPrice` 并清零。
*   调参：`gasThreshold 100→200`（更多缓冲）、`gasPerNode 15→10`（更慢累积，给反应时间）。

### 12.3 卖气入口（`EconomyManager` / `ToolPanel` / `GameManager`）
*   `EconomyManager.addRevenue(amount)`：入账 + 累计营收。
*   `ToolPanel` 方向行新增第 4 键「卖气」，`refresh()` 显示 `卖气 $X`（X = 当前可卖金额），点击 `sellGas`。
*   `GameManager` 键盘 `G` = 卖气（调试）。

### 12.4 验收标准
*   钻到气藏后气格会枯竭（不再永久燃烧）；气量缓涨，点「卖气」入账并清零；若放任气量 ≥ 200 仍会燃烧扣款。
*   气藏从「纯惩罚」变成「卖则赚、不管则烧」的取舍。

## 13. Phase 12a：贷款（2026-10-30）

> 对齐 Turmoil `LoanUnitAmount=$500`。让玩家能借钱加速扩张，但要付息、且结算时未还债务从余额扣除（不能靠借债刷赢）。元进度（campaign/tenants）留后续。

### 13.1 贷款逻辑（`EconomyManager`）
*   新增 `debt`、`borrowLoan()`（借 $500，`maxDebt=$1000`）、`repayLoan()`（还 `min(余额, 债务)`）、`applyLoanInterest()`（每 tick `debt *= 1.001`，0.1%/tick ≈ 27%/局）、`settleDebt()`（结算扣余额清零）。

### 13.2 接入（`GameManager`）
*   `tick()` 调 `applyLoanInterest()`；`_triggerGameOver` 先 `settleDebt()` 再判胜负；tick 日志加负债；键盘 `L`=借、`R`=还（调试）。

### 13.3 验收标准
*   按 L 借 $500、余额 +$500、负债 +$500；负债每 tick 微涨；按 R 还款；到点未还债务从余额扣除后再判胜负。
*   点击版贷款/还款按钮 + 负债显示 UI 留后续。
