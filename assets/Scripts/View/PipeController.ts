import { _decorator, Component, Graphics, Color, UITransform, Node, EventTouch, Touch, Vec2, Vec3 } from 'cc';
import { GridManager } from '../Core/GridManager';
import { PipeNetworkManager, PipeNode } from '../Core/PipeNetworkManager';
import { EconomyManager } from '../Economy/EconomyManager';
import { ToolType, getToolDef } from '../Economy/ToolCatalog';
import { ToolManager } from '../Core/ToolManager';
import { GridRenderer } from './GridRenderer';
import { Layout, worldToCell } from '../Core/Layout';

const { ccclass } = _decorator;

const COLOR_PIPE_DONE = new Color('#333333');
const COLOR_PIPE_BUILDING = new Color('#AAAAAA');
const COLOR_FLOW = new Color('#000000');

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

@ccclass('PipeController')
export class PipeController extends Component {
    private _gridMgr: GridManager | null = null;
    private _pipeMgr: PipeNetworkManager | null = null;
    private _economy: EconomyManager | null = null;
    private _gridRenderer: GridRenderer | null = null;
    // 是否处于「待放置井架」态（点击目录「钻井」后为 true，点顶行格完成放置）
    pendingRig = false;

    // 当前选中的工具（Dowser/Scanner/Mole/Dynamite）；null 表示未选工具，走建管逻辑
    selectedTool: ToolType | null = null;

    // 最近一次工具使用的反馈消息（供 ToolPanel 显示）
    lastToolMessage = '';

    private _lastGridX = -1;
    private _lastGridY = -1;

    // 双指缩放/拖动（Phase 6）
    private _zoomScale = 1;
    private _panX = 0;
    private _panY = 0;
    private _lastPinchDist = 0;
    private _lastPinchMid: Vec2 | null = null;
    private _isPinching = false;
    private readonly _baseGridPos = new Vec3();
    private readonly _basePipePos = new Vec3();

    init(gridMgr: GridManager, pipeMgr: PipeNetworkManager, economy: EconomyManager, gridRenderer: GridRenderer): void {
        this._gridMgr = gridMgr;
        this._pipeMgr = pipeMgr;
        this._economy = economy;
        this._gridRenderer = gridRenderer;
        if (gridRenderer) {
            this._baseGridPos.set(gridRenderer.node.position);
        }
        this._basePipePos.set(this.node.position);
    }

    onLoad(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    renderPipes(): void {
        if (!this._pipeMgr) return;
        const graphics = this.getComponent(Graphics);
        if (!graphics) {
            console.warn('PipeController: 节点上缺少 Graphics 组件');
            return;
        }

        const cx = (gx: number) => Layout.gridLeft + (gx + 0.5) * Layout.cellW;
        const cy = (gy: number) => Layout.gridTop - (gy + 0.5) * Layout.cellH;

        graphics.clear();
        graphics.lineWidth = Layout.cellW * 0.4;

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
            graphics.moveTo(cx(a.gridX), cy(a.gridY));
            graphics.lineTo(cx(b.gridX), cy(b.gridY));
        }
        graphics.stroke();

        // 施工中管道：浅灰虚影
        graphics.strokeColor = COLOR_PIPE_BUILDING;
        for (const [a, b] of buildingEdges) {
            graphics.moveTo(cx(a.gridX), cy(a.gridY));
            graphics.lineTo(cx(b.gridX), cy(b.gridY));
        }
        graphics.stroke();

        // 石油流动：纯黑细线，从流经节点画向其 flowTarget（更接近地表一侧）
        graphics.lineWidth = Layout.cellW * 0.15;
        graphics.strokeColor = COLOR_FLOW;
        for (const node of this._pipeMgr.nodes.values()) {
            if (node.currentFlow <= 0 || node.status !== 'done') continue;
            const target = this._pipeMgr.nodes.get(node.flowTarget);
            if (!target) continue;

            graphics.moveTo(cx(node.gridX), cy(node.gridY));
            graphics.lineTo(cx(target.gridX), cy(target.gridY));
        }
        graphics.stroke();
    }

    private onTouchStart(event: EventTouch): void {
        // 第二根手指按下：进入捏合模式
        const touches = event.getTouches();
        if (touches.length >= 2) {
            this._isPinching = true;
            this._lastPinchDist = this._pinchDist(touches);
            this._lastPinchMid = this._pinchMid(touches);
            return;
        }

        const { gridX, gridY } = this._toGrid(event);

        // 工具使用：选中工具后，点地图执行工具
        if (this.selectedTool !== null) {
            this._useSelectedTool(gridX, gridY);
            return;
        }

        // 井架放置：点击目录「钻井」进入待放置态后，点顶行格完成放置
        if (this.pendingRig) {
            if (gridY === 0 && this._pipeMgr) {
                if (this._pipeMgr.placeRig(gridX)) {
                    this.pendingRig = false;
                    this._lastGridX = gridX;
                    this._lastGridY = 0;
                }
                if (this._gridRenderer && this._gridMgr) {
                    this._gridRenderer.renderGrid(this._gridMgr, this._pipeMgr.rigs);
                }
            }
            // 非顶行或该列已有井架：保持待放置态
            return;
        }

        // 起笔合法性：井架基座，或管网中已完工的节点；'building' 施工中节点不能作为分支起点
        let canStart = false;
        if (this._pipeMgr) {
            const isRigBase = gridY === 0 && this._pipeMgr.hasRig(gridX);
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
        // 捏合模式：两指缩放 + 拖动，不画管
        const touches = event.getTouches();
        if (this._isPinching || touches.length >= 2) {
            if (touches.length < 2) {
                this._isPinching = false;
                return;
            }
            this._isPinching = true;
            const dist = this._pinchDist(touches);
            const mid = this._pinchMid(touches);
            if (this._lastPinchDist > 0) {
                const factor = dist / this._lastPinchDist;
                this._zoomScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._zoomScale * factor));
            }
            if (this._lastPinchMid) {
                this._panX += mid.x - this._lastPinchMid.x;
                this._panY += mid.y - this._lastPinchMid.y;
            }
            this._lastPinchDist = dist;
            this._lastPinchMid = mid;
            this._applyTransform();
            return;
        }

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
            this._gridRenderer.renderGrid(this._gridMgr, this._pipeMgr.rigs);
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

    private onTouchEnd(event: EventTouch): void {
        if (event.getTouches().length < 2) {
            this._isPinching = false;
            this._lastPinchDist = 0;
            this._lastPinchMid = null;
        }
    }

    private _pinchDist(touches: Touch[]): number {
        const p0 = touches[0].getUILocation();
        const p1 = touches[1].getUILocation();
        return Vec2.distance(p0, p1);
    }

    private _pinchMid(touches: Touch[]): Vec2 {
        const p0 = touches[0].getUILocation();
        const p1 = touches[1].getUILocation();
        return new Vec2((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    }

    private _applyTransform(): void {
        if (this._gridRenderer) {
            const g = this._gridRenderer.node;
            g.setScale(this._zoomScale, this._zoomScale, 1);
            g.setPosition(this._baseGridPos.x + this._panX, this._baseGridPos.y + this._panY, 0);
        }
        this.node.setScale(this._zoomScale, this._zoomScale, 1);
        this.node.setPosition(this._basePipePos.x + this._panX, this._basePipePos.y + this._panY, 0);
    }

    private _useSelectedTool(x: number, y: number): void {
        if (!this._gridMgr || !this._economy) return;
        const tool = this.selectedTool;
        if (tool === null) return;

        let success = true;
        let message = '';

        switch (tool) {
            case ToolType.Dowser: {
                const hasOil = ToolManager.useDowser(this._gridMgr, x, y);
                message = hasOil ? '探测器：该列有油 ✓' : '探测器：该列无油 ✗';
                break;
            }
            case ToolType.Scanner: {
                ToolManager.useScanner(this._gridMgr, x, y);
                message = '扫描仪：已揭示 3×3 区域';
                break;
            }
            case ToolType.Mole: {
                ToolManager.useMole(this._gridMgr, x, y);
                message = '鼹鼠：已向下钻探';
                break;
            }
            case ToolType.Dynamite: {
                success = ToolManager.useDynamite(this._gridMgr, x, y);
                message = success ? '炸药：岩石已清除' : '炸药：只能清除岩石';
                break;
            }
            default:
                return;
        }

        if (success) {
            // 成功使用：扣费并取消选中
            this._economy.payCost(getToolDef(tool).price);
            this.selectedTool = null;
        }
        // 无效使用（如炸药点非岩石）：不扣费、保持选中，但仍反馈原因
        this.lastToolMessage = message;

        // 工具揭示/清除了地块，重绘网格
        if (this._gridRenderer && this._gridMgr && this._pipeMgr) {
            this._gridRenderer.renderGrid(this._gridMgr, this._pipeMgr.rigs);
        }
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
        const cell = worldToCell({ x: local.x, y: local.y });
        return { gridX: cell.x, gridY: cell.y };
    }

    private _inGrid(x: number, y: number): boolean {
        if (!this._gridMgr) return false;
        return x >= 0 && y >= 0 && x < this._gridMgr.width && y < this._gridMgr.height;
    }
}
