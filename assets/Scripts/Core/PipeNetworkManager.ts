import { BlockType, GridManager } from './GridManager';
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

    // 井架所在列（gridY=0）。-1 表示尚未放置井架，此时无有效管道起点与抽油出口。
    rigX = -1;

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

    // 管宽基准（Width_base）——上调到 5，使流速不被 1 掐死
    private readonly pipeWidth = 5;

    // 科技等级（当前仅管宽生效；其余科技后续接入）
    private readonly tech = {
        pipeWidthLevel: 1,
    };

    buildPipe(
        x: number,
        y: number,
        fromX: number,
        fromY: number,
        blockType: BlockType,
        hardness: number,
        economy: EconomyManager,
    ): boolean {
        const dx = Math.abs(x - fromX);
        const dy = Math.abs(y - fromY);
        if (dx + dy !== 1) {
            console.warn(`PipeNetworkManager: (${x},${y}) 与 (${fromX},${fromY}) 不相邻，无法延伸管道`);
            return false;
        }

        // 岩石阻挡：未解锁高级钻头前，禁止向 Rock 延伸管道
        if (blockType === BlockType.Rock) {
            console.warn(`岩石阻挡：(${x},${y}) 为岩石，当前钻头无法穿透`);
            return false;
        }

        const fromId = this._key(fromX, fromY);
        const targetId = this._key(x, y);

        let fromNode = this.nodes.get(fromId);
        if (!fromNode) {
            // 井架限制：起点不在已有网络中时，只允许从井架格 (rigX, 0) 开始建管
            if (!(fromX === this.rigX && fromY === 0)) {
                console.warn(`PipeNetworkManager: 首次建管必须从井架 (${this.rigX},0) 开始`);
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

        // 钻透耗时正式启用：hardness / drillSpeed
        const time = hardness / this.drillSpeed;

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
            if (!path) continue;

            // 动态油压：储量越大、埋得越深，压力越强
            const pressure = (block.resourceCapacity / 50) + (node.gridY * 0.1);
            // 实际流速受限于管宽科技
            const actualFlow = Math.min(pressure, this.pipeWidth * this.tech.pipeWidthLevel);

            block.resourceCapacity -= actualFlow;
            totalExtracted += actualFlow;

            // path 顺序为 [地表, ..., 油源]，石油从深处向地表流动
            for (let i = 0; i < path.length; i++) {
                const pathNode = path[i];
                pathNode.isPumping = true;
                pathNode.currentFlow += actualFlow;
                if (i > 0) {
                    pathNode.flowTarget = path[i - 1].id;
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

    updateDrills(dt: number, gridMgr: GridManager): boolean {
        let completed = false;
        let remaining = dt;
        // 顺序钻井：只有队首节点扣减耗时，完工后剩余时间顺延给下一节
        while (remaining > 0 && this.activeDrills.length > 0) {
            const node = this.activeDrills[0];
            node.buildTimeLeft -= remaining;
            if (node.buildTimeLeft <= 0) {
                remaining = -node.buildTimeLeft;
                node.buildTimeLeft = 0;
                node.status = 'done';
                this.activeDrills.shift();
                // 管道挖通才算真正探明：揭开该格及其 8 邻域迷雾
                gridMgr.revealArea(node.gridX, node.gridY);
                completed = true;
            } else {
                remaining = 0;
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
            // 只有井架所在格才是有效的地表出口（其余顶行格不作为抽油出口）
            if (current.gridY === 0 && current.gridX === this.rigX) {
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
