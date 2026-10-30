import { _decorator, Component, Graphics, Color } from 'cc';
import { GridManager, BlockType, GridBlock } from '../Core/GridManager';
import { Layout } from '../Core/Layout';

const { ccclass, property } = _decorator;

@ccclass('GridRenderer')
export class GridRenderer extends Component {
    @property(Color)
    colorDirt = new Color('#8B4513');

    @property(Color)
    colorRock = new Color('#555555');

    @property(Color)
    colorHardRock = new Color('#333333');

    @property(Color)
    colorOil = new Color('#000000');

    @property(Color)
    colorGas = new Color('#ADD8E6');

    @property(Color)
    colorFog = new Color('#8B7355');

    @property(Color)
    colorRig = new Color('#3A3A3A');

    @property(Color)
    colorOilHint = new Color('#2B1D12');

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
                    graphics.fillColor = this.colorOilHint;
                } else if (block.isRevealed) {
                    graphics.fillColor = this._colorForType(block);
                } else {
                    graphics.fillColor = this.colorFog;
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
            graphics.fillColor = this.colorRig;
            graphics.rect(Layout.gridLeft + rx * Layout.cellW, Layout.gridTop, Layout.cellW, Layout.cellH * 2);
            graphics.fill();
        }
    }

    private _colorForType(block: GridBlock): Color {
        switch (block.type) {
            case BlockType.Rock:
                return block.hardness >= 16 ? this.colorHardRock : this.colorRock;
            case BlockType.Oil:
                return this.colorOil;
            case BlockType.Gas:
                return this.colorGas;
            case BlockType.Dirt:
            default:
                return this.colorDirt;
        }
    }
}
