import { _decorator, Component, Graphics, Color, UITransform, Node, EventTouch, Vec3 } from 'cc';
import { GridManager } from '../Core/GridManager';
import { PipeNetworkManager, PipeNode } from '../Core/PipeNetworkManager';
import { EconomyManager } from '../Economy/EconomyManager';
import { GridRenderer } from './GridRenderer';

const { ccclass, property } = _decorator;

const COLOR_PIPE_DONE = new Color('#333333');
const COLOR_PIPE_BUILDING = new Color('#AAAAAA');
const COLOR_FLOW = new Color('#000000');

@ccclass('PipeController')
export class PipeController extends Component {
    @property
    cellSize = 20;

    private _gridMgr: GridManager | null = null;
    private _pipeMgr: PipeNetworkManager | null = null;
    private _economy: EconomyManager | null = null;
    private _gridRenderer: GridRenderer | null = null;
    private _lastGridX = -1;
    private _lastGridY = -1;

    init(gridMgr: GridManager, pipeMgr: PipeNetworkManager, economy: EconomyManager, gridRenderer: GridRenderer): void {
        this._gridMgr = gridMgr;
        this._pipeMgr = pipeMgr;
        this._economy = economy;
        this._gridRenderer = gridRenderer;
    }

    onLoad(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    renderPipes(): void {
        if (!this._pipeMgr) return;
        const graphics = this.getComponent(Graphics);
        if (!graphics) {
            console.warn('PipeController: 节点上缺少 Graphics 组件');
            return;
        }

        graphics.clear();
        graphics.lineWidth = this.cellSize * 0.4;

        const cs = this.cellSize;
        const drawn = new Set<string>();
        const doneEdges: Array<[PipeNode, PipeNode]> = [];
        const buildingEdges: Array<[PipeNode, PipeNode]> = [];

        for (const node of this._pipeMgr.nodes.values()) {
            for (const targetId of node.connectedNodes) {
                const target = this._pipeMgr.nodes.get(targetId);
                if (!target) continue;

                const edgeKey = node.id < target.id ? `${node.id}|${target.id}` : `${target.id}|${node.id}`;
                if (drawn.has(edgeKey)) continue;
                drawn.add(edgeKey);

                const isBuilding = node.status === 'building' || target.status === 'building';
                if (isBuilding) {
                    buildingEdges.push([node, target]);
                } else {
                    doneEdges.push([node, target]);
                }
            }
        }

        // 已完工管道：深灰实线
        graphics.strokeColor = COLOR_PIPE_DONE;
        for (const [a, b] of doneEdges) {
            graphics.moveTo(a.gridX * cs + cs / 2, -a.gridY * cs - cs / 2);
            graphics.lineTo(b.gridX * cs + cs / 2, -b.gridY * cs - cs / 2);
        }
        graphics.stroke();

        // 施工中管道：浅灰虚影
        graphics.strokeColor = COLOR_PIPE_BUILDING;
        for (const [a, b] of buildingEdges) {
            graphics.moveTo(a.gridX * cs + cs / 2, -a.gridY * cs - cs / 2);
            graphics.lineTo(b.gridX * cs + cs / 2, -b.gridY * cs - cs / 2);
        }
        graphics.stroke();

        // 石油流动：纯黑细线，从流经节点画向其 flowTarget（更接近地表一侧）
        graphics.lineWidth = this.cellSize * 0.15;
        graphics.strokeColor = COLOR_FLOW;
        for (const node of this._pipeMgr.nodes.values()) {
            if (node.currentFlow <= 0 || node.status !== 'done') continue;
            const target = this._pipeMgr.nodes.get(node.flowTarget);
            if (!target) continue;

            graphics.moveTo(node.gridX * cs + cs / 2, -node.gridY * cs - cs / 2);
            graphics.lineTo(target.gridX * cs + cs / 2, -target.gridY * cs - cs / 2);
        }
        graphics.stroke();
    }

    private onTouchStart(event: EventTouch): void {
        const { gridX, gridY } = this._toGrid(event);

        // 井架未放置：点顶行任意格放置井架（扣 $350），并立即作为起笔点
        if (this._pipeMgr && this._pipeMgr.rigX < 0) {
            if (gridY === 0 && this._economy && this._economy.buyRig()) {
                this._pipeMgr.rigX = gridX;
                this._lastGridX = gridX;
                this._lastGridY = 0;
                if (this._gridRenderer && this._gridMgr) {
                    this._gridRenderer.renderGrid(this._gridMgr, this._pipeMgr.rigX);
                }
            } else {
                this._lastGridX = -1;
                this._lastGridY = -1;
            }
            return;
        }

        // 起笔合法性：井架基座，或管网中已完工的节点；'building' 施工中节点不能作为分支起点
        let canStart = false;
        if (this._pipeMgr) {
            const isRigBase = gridX === this._pipeMgr.rigX && gridY === 0;
            const isDoneNode = this._pipeMgr.getNode(gridX, gridY)?.status === 'done';
            canStart = isRigBase || isDoneNode;
        }

        if (canStart) {
            this._lastGridX = gridX;
            this._lastGridY = gridY;
        } else {
            this._lastGridX = -1;
            this._lastGridY = -1;
        }
    }

    private onTouchMove(event: EventTouch): void {
        if (!this._gridMgr || !this._pipeMgr) return;

        const { gridX, gridY } = this._toGrid(event);
        if (!this._inGrid(gridX, gridY)) return;
        if (gridX === this._lastGridX && gridY === this._lastGridY) return;

        // 未从井架格起笔（_lastGrid 为 -1）时不允许建管
        if (!this._inGrid(this._lastGridX, this._lastGridY)) return;

        // Bresenham 插值：补齐上一采样格与当前格之间的所有网格，逐个建管，防止快速滑动断笔
        const cells = this._bresenhamCells(this._lastGridX, this._lastGridY, gridX, gridY);

        for (let i = 1; i < cells.length; i++) {
            const prev = cells[i - 1];
            const cur = cells[i];

            // buildPipe 只接受上下左右相邻（dx+dy===1），Bresenham 产生的对角步需拆成两段正交步
            if (Math.abs(cur.x - prev.x) === 1 && Math.abs(cur.y - prev.y) === 1) {
                const corner = { x: cur.x, y: prev.y };
                if (!this._buildStep(corner.x, corner.y, prev.x, prev.y)) break;
                if (!this._buildStep(cur.x, cur.y, corner.x, corner.y)) break;
            } else {
                if (!this._buildStep(cur.x, cur.y, prev.x, prev.y)) break;
            }
        }

        this.renderPipes();
        // 建管成功后刷新迷雾视野（与 renderPipes 一样每帧只刷一次，避免逐格重绘 800 格）
        if (this._gridRenderer && this._gridMgr && this._pipeMgr) {
            this._gridRenderer.renderGrid(this._gridMgr, this._pipeMgr.rigX);
        }
    }

    private _buildStep(x: number, y: number, fromX: number, fromY: number): boolean {
        if (!this._gridMgr || !this._pipeMgr || !this._economy) return false;

        const block = this._gridMgr.getBlock(x, y);
        if (!block) return false;

        const success = this._pipeMgr.buildPipe(
            x,
            y,
            fromX,
            fromY,
            block.type,
            block.hardness,
            this._economy,
        );

        // 只有成功才推进光标；遇到岩石/余额不足时停下，避免越障或透支
        if (success) {
            this._lastGridX = x;
            this._lastGridY = y;
        }
        return success;
    }

    private _bresenhamCells(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
    ): Array<{ x: number; y: number }> {
        const cells: Array<{ x: number; y: number }> = [];

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;
        cells.push({ x, y });

        while (x !== x1 || y !== y1) {
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
            cells.push({ x, y });
        }

        return cells;
    }

    private _toGrid(event: EventTouch): { gridX: number; gridY: number } {
        const uiTransform = this.node.getComponent(UITransform);
        const uiLocation = event.getUILocation();
        const local = uiTransform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
        return {
            gridX: Math.floor(local.x / this.cellSize),
            gridY: Math.floor(-local.y / this.cellSize),
        };
    }

    private _inGrid(x: number, y: number): boolean {
        if (!this._gridMgr) return false;
        return x >= 0 && y >= 0 && x < this._gridMgr.width && y < this._gridMgr.height;
    }
}
