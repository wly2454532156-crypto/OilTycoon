
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