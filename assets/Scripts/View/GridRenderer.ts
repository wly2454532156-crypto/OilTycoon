import { _decorator, Component, Graphics, Color } from 'cc';
import { GridManager, BlockType } from '../Core/GridManager';

const { ccclass, property } = _decorator;

const COLOR_DIRT = new Color('#8B4513');
const COLOR_ROCK = new Color('#555555');
const COLOR_OIL = new Color('#000000');
const COLOR_GAS = new Color('#ADD8E6');
const COLOR_FOG = new Color('#8B7355');
const COLOR_RIG = new Color('#3A3A3A');
const COLOR_OIL_HINT = new Color('#2B1D12');

@ccclass('GridRenderer')
export class GridRenderer extends Component {
    @property
    cellSize = 20;

    renderGrid(gridManager: GridManager, rigX: number): void {
        const graphics = this.getComponent(Graphics);
        if (!graphics) {
            console.warn('GridRenderer: 节点上缺少 Graphics 组件');
            return;
        }

        graphics.clear();

        const grid = gridManager.grid;
        const width = gridManager.width;
        const height = gridManager.height;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const block = grid[y][x];
                // 油迹提示优先显示；否则战争迷雾：未探测统一未知色，已探测按真实类型
                if (block.isOilHint) {
                    graphics.fillColor = COLOR_OIL_HINT;
                } else if (block.isRevealed) {
                    graphics.fillColor = this._colorForType(block.type);
                } else {
                    graphics.fillColor = COLOR_FOG;
                }
                // 网格 (0,0) 为左上、Y 向下，Graphics 的 Y 向上，故取负 Y 对齐
                graphics.rect(x * this.cellSize, -y * this.cellSize, this.cellSize, this.cellSize);
                graphics.fill();
            }
        }

        // 井架标记：1 格宽、2 格高，底边贴地表、正对 rigX 列，与起笔点对齐
        if (rigX >= 0) {
            graphics.fillColor = COLOR_RIG;
            graphics.rect(rigX * this.cellSize, 0, this.cellSize, this.cellSize * 2);
            graphics.fill();
        }
    }

    private _colorForType(type: BlockType): Color {
        switch (type) {
            case BlockType.Rock:
                return COLOR_ROCK;
            case BlockType.Oil:
                return COLOR_OIL;
            case BlockType.Gas:
                return COLOR_GAS;
            case BlockType.Dirt:
            default:
                return COLOR_DIRT;
        }
    }
}
