import { _decorator, Component, Graphics, Color } from 'cc';
import { GridManager, BlockType, GridBlock } from '../Core/GridManager';
import { Layout } from '../Core/Layout';

const { ccclass } = _decorator;

const COLOR_DIRT = new Color('#8B4513');
const COLOR_ROCK = new Color('#555555');
const COLOR_HARD_ROCK = new Color('#333333');
const COLOR_OIL = new Color('#000000');
const COLOR_GAS = new Color('#ADD8E6');
const COLOR_FOG = new Color('#8B7355');
const COLOR_RIG = new Color('#3A3A3A');
const COLOR_OIL_HINT = new Color('#2B1D12');

@ccclass('GridRenderer')
export class GridRenderer extends Component {
    renderGrid(gridManager: GridManager, rigs: number[]): void {
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
                    graphics.fillColor = this._colorForType(block);
                } else {
                    graphics.fillColor = COLOR_FOG;
                }
                // 绝对坐标（Canvas 中心、Y 向上）：格子 (x,y) 画在地层区对应位置
                graphics.rect(
                    Layout.gridLeft + x * Layout.cellW,
                    Layout.gridTop - (y + 1) * Layout.cellH,
                    Layout.cellW,
                    Layout.cellH,
                );
                graphics.fill();
            }
        }

        // 井架标记：每口井架 1 格宽、2 格高，底边贴地表、正对其所在列
        for (const rx of rigs) {
            graphics.fillColor = COLOR_RIG;
            graphics.rect(Layout.gridLeft + rx * Layout.cellW, Layout.gridTop, Layout.cellW, Layout.cellH * 2);
            graphics.fill();
        }
    }

    private _colorForType(block: GridBlock): Color {
        switch (block.type) {
            case BlockType.Rock:
                return block.hardness >= 16 ? COLOR_HARD_ROCK : COLOR_ROCK;
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
