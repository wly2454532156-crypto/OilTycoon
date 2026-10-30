import { BlockType, GridBlock, GridManager } from './GridManager';
import { EconomyManager } from '../Economy/EconomyManager';

export interface PipeNode {
    id: string;
    gridX: number;
    gridY: number;
    connectedNodes: string[];
    isPumping: boolean;
    currentFlow: number;
    status: 'building' | 'done';
    buildTimeLeft: number;
    flowTarget: string;
}

export class PipeNetworkManager {
    readonly nodes: Map<string, PipeNode> = new Map();

    // 正在施工的管道队列
    readonly activeDrills: PipeNode[] = [];

    // 井架所在列列表（均位于 gridY=0）。空数组表示尚未放置井架。
    rigs: number[] = [];

    // 放置井架到顶行某列（每列最多一口）
    placeRig(x: number): boolean {
        if (this.rigs.includes(x)) return false;
        this.rigs.push(x);
        return true;
    }

    hasRig(x: number): boolean {
        return this.rigs.includes(x);
    }

    // 气体系统（Phase 3）
    gasLevel = 0;                 // 当前累积气体
    isBurning = false;            // 是否在燃烧停工
    burnTicksLeft = 0;            // 剩余停工 tick 数
    private _pendingBurnPenalty = 0;
    private readonly gasThreshold = 100;
    private readonly gasPerNode = 15;
    private readonly gasDecay = 8;
    private readonly burnDurationTicks = 6;
    private readonly burnPenaltyCost = 200;

    private readonly baseBuildCost = 5;
    private readonly branchExtraCost = 15;
    private readonly drillSpeed = 1;
    private readonly drillUpgradeCost = 150;

    // 管宽基准（Width_base）——重定义为每口井（井架）总流速上限，对齐 Turmoil 管道总容量
    private readonly pipeWidth = 3;

    // 科技等级（管宽 / 钻速）
    private tech = {
        pipeWidthLevel: 1,
        drillSpeedLevel: 1,
    };

    buildPipe(
        x: number,
        y: number,
        fromX: number,
        fromY: number,
        hardness: number,
        economy: EconomyManager,
    ): boolean {
        const dx = Math.abs(x - fromX);
        const dy = Math.abs(y - fromY);
        if (dx + dy !== 1) {
            console.warn(`PipeNetworkManager: (${x},${y}) 与 (${fromX},${fromY}) 不相邻，无法延伸管道`);
            return false;
        }

        const fromId = this._key(fromX, fromY);
        const targetId = this._key(x, y);

        let fromNode = this.nodes.get(fromId);
        if (!fromNode) {
            // 井架限制：起点不在已有网络中时，只允许从井架格（顶行任一井架列）开始建管
            if (!(fromY === 0 && this.rigs.includes(fromX))) {
                console.warn(`PipeNetworkManager: 首次建管必须从井架格（顶行井架所在列）开始`);
                return false;
            }
            fromNode = this._createNode(fromX, fromY);
            this.nodes.set(fromId, fromNode);
        }

        const targetNode = this.nodes.get(targetId);
        if (targetNode && targetNode.connectedNodes.includes(fromId)) {
            return false;
        }

        const isBranch = fromNode.connectedNodes.length >= 2;
        const cost = this.baseBuildCost + (isBranch ? this.branchExtraCost : 0);

        // 余额校验：不足则拒绝建造
        if (economy.wallet.balance < cost) {
            console.warn(`PipeNetworkManager: 余额不足，建造需 $${cost}，当前 $${economy.wallet.balance.toFixed(2)}`);
            return false;
        }

        // 钻透耗时：硬度 /（基础钻速 × 钻头科技等级）——岩石可钻但明显更慢
        const time = hardness / (this.drillSpeed * this.tech.drillSpeedLevel);

        const node = targetNode ?? this._createNode(x, y);
        fromNode.connectedNodes.push(targetId);
        node.connectedNodes.push(fromId);

        if (!targetNode) {
            // 新节点进入施工状态，加入施工队列
            node.status = 'building';
            node.buildTimeLeft = time;
            this.activeDrills.push(node);
            this.nodes.set(targetId, node);
        }

        // 实际扣费（SDD 3.2：每次成功构建必须显式调用 payCost）
        economy.payCost(cost);

        console.log(`建设成功：花费 $${cost}，预计耗时 ${time} 秒`);
        return true;
    }

    calculateFlow(gridMgr: GridManager): number {
        for (const node of this.nodes.values()) {
            node.isPumping = false;
            node.currentFlow = 0;
            node.flowTarget = '';
        }

        // 燃烧停工期间停止抽油
        if (this.isBurning) {
            this.burnTicksLeft--;
            if (this.burnTicksLeft <= 0) {
                this.isBurning = false;
            }
            return 0;
        }

        let totalExtracted = 0;
        let gasTouched = 0;

        // 按地表井架分组累积油压，再按管宽限流（对齐 Turmoil：管道总容量限制整口井流速）
        const wellSources = new Map<string, { node: PipeNode; block: GridBlock; pressure: number; path: PipeNode[] }[]>();

        for (const node of this.nodes.values()) {
            // 施工中的管道不能传输石油
            if (node.status !== 'done') continue;

            const block = gridMgr.getBlock(node.gridX, node.gridY);
            if (!block) continue;

            // 接触气藏：累积气体，不产油
            if (block.type === BlockType.Gas) {
                gasTouched += this.gasPerNode;
                continue;
            }

            if (block.type !== BlockType.Oil || block.resourceCapacity <= 0) {
                continue;
            }

            const path = this._findPathToSurface(node);
            if (!path || path.length === 0) continue;

            // 动态油压：储量越大、埋得越深，压力越强
            const pressure = (block.resourceCapacity / 50) + (node.gridY * 0.1);
            const surfaceId = path[0].id;
            const source = { node, block, pressure, path };
            const list = wellSources.get(surfaceId);
            if (list) {
                list.push(source);
            } else {
                wellSources.set(surfaceId, [source]);
            }
        }

        // 每口井总流速 = min(总油压, 管宽 × 科技等级)，再按各格油压占比分配
        const wellCap = this.pipeWidth * this.tech.pipeWidthLevel;
        for (const sources of wellSources.values()) {
            const totalPressure = sources.reduce((sum, s) => sum + s.pressure, 0);
            const totalFlow = Math.min(totalPressure, wellCap);
            const scale = totalFlow > 0 ? totalFlow / totalPressure : 0;

            for (const s of sources) {
                const actualFlow = s.pressure * scale;
                if (actualFlow <= 0) continue;

                s.block.resourceCapacity -= actualFlow;
                totalExtracted += actualFlow;

                // path 顺序为 [地表, ..., 油源]，石油从深处向地表流动
                for (let i = 0; i < s.path.length; i++) {
                    const pathNode = s.path[i];
                    pathNode.isPumping = true;
                    pathNode.currentFlow += actualFlow;
                    if (i > 0) {
                        pathNode.flowTarget = s.path[i - 1].id;
                    }
                }
            }
        }

        // 气体累积/消散与燃烧判定
        if (gasTouched > 0) {
            this.gasLevel += gasTouched;
            if (this.gasLevel >= this.gasThreshold) {
                this.gasLevel = 0;
                this.isBurning = true;
                this.burnTicksLeft = this.burnDurationTicks;
                this._pendingBurnPenalty += this.burnPenaltyCost;
            }
        } else if (this.gasLevel > 0) {
            this.gasLevel = Math.max(0, this.gasLevel - this.gasDecay);
        }

        return totalExtracted;
    }

    // 读取并清除待处理的燃烧罚款（由 GameManager 通过 economy 扣款）
    consumeBurnPenalty(): number {
        const p = this._pendingBurnPenalty;
        this._pendingBurnPenalty = 0;
        return p;
    }

    // 升级钻头：钻速等级 +1（钻透时间按等级递减）
    upgradeDrillSpeed(economy: EconomyManager): boolean {
        if (economy.wallet.balance < this.drillUpgradeCost) return false;
        economy.payCost(this.drillUpgradeCost);
        this.tech.drillSpeedLevel += 1;
        return true;
    }

    updateDrills(dt: number, gridMgr: GridManager): boolean {
        let completed = false;
        // 并行钻井：所有施工节点同时扣减耗时，多井架不再串行（5 井泥土秒级钻完）
        for (let i = this.activeDrills.length - 1; i >= 0; i--) {
            const node = this.activeDrills[i];
            node.buildTimeLeft -= dt;
            if (node.buildTimeLeft <= 0) {
                node.buildTimeLeft = 0;
                node.status = 'done';
                this.activeDrills.splice(i, 1);
                // 管道挖通才算真正探明：揭开该格及其 8 邻域迷雾
                gridMgr.revealArea(node.gridX, node.gridY);
                completed = true;
            }
        }
        return completed;
    }

    private _findPathToSurface(start: PipeNode): PipeNode[] | null {
        const queue: PipeNode[] = [start];
        const visited = new Set<string>([start.id]);
        const parent = new Map<string, string>();
        let head = 0;
        let surface: PipeNode | null = null;

        while (head < queue.length) {
            const current = queue[head++];
            // 任一井架所在格都是有效的地表出口
            if (current.gridY === 0 && this.rigs.includes(current.gridX)) {
                surface = current;
                break;
            }
            for (const neighborId of current.connectedNodes) {
                if (visited.has(neighborId)) continue;
                const neighbor = this.nodes.get(neighborId);
                if (!neighbor) continue;
                // BFS 只允许遍历已完工的管道
                if (neighbor.status !== 'done') continue;
                visited.add(neighborId);
                parent.set(neighborId, current.id);
                queue.push(neighbor);
            }
        }

        if (!surface) return null;

        const path: PipeNode[] = [];
        let id = surface.id;
        while (id !== start.id) {
            const node = this.nodes.get(id);
            if (!node) return null;
            path.push(node);
            const parentId = parent.get(id);
            if (parentId === undefined) return null;
            id = parentId;
        }
        path.push(start);
        return path;
    }

    debugPrintNetwork(): void {
        console.log(`=== 管道网络（${this.nodes.size} 个节点）===`);
        for (const node of this.nodes.values()) {
            const connections = node.connectedNodes.length > 0 ? node.connectedNodes.join(', ') : '(无)';
            console.log(`[${node.id}] (${node.gridX},${node.gridY}) -> ${connections}`);
        }
    }

    getNode(x: number, y: number): PipeNode | undefined {
        return this.nodes.get(this._key(x, y));
    }

    private _key(x: number, y: number): string {
        return `${x}_${y}`;
    }

    private _createNode(x: number, y: number): PipeNode {
        return {
            id: this._key(x, y),
            gridX: x,
            gridY: y,
            connectedNodes: [],
            isPumping: false,
            currentFlow: 0,
            status: 'done',
            buildTimeLeft: 0,
            flowTarget: '',
        };
    }
}
