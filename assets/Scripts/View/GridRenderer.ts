import { _decorator, Component, Graphics, Color } from 'cc';
import { GridManager, BlockType, GridBlock } from '../Core/GridManager';
import { Layout } from '../Core/Layout';
import { Palette } from '../Core/Palette';

const { ccclass } = _decorator;

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

        // 迷雾距离：从已揭示区 BFS，用于三级羽化（SDD §15.2）
        const fogDist = this._computeFogDist(grid, width, height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const block = grid[y][x];
                const px = Layout.gridLeft + x * Layout.cellW;
                const py = Layout.gridTop - (y + 1) * Layout.cellH;

                // 泥土基底：所有格都画，未揭示区不变成纯黑
                if (block.isOilHint) {
                    graphics.fillColor = Palette.oilHint;
                } else {
                    graphics.fillColor = this._soilColor(y, height);
                }
                graphics.rect(px, py, Layout.cellW + 0.5, Layout.cellH + 0.5);
                graphics.fill();

                // 已揭示的非泥土地块：叠加岩石/油/气
                if (!block.isOilHint && block.isRevealed && block.type !== BlockType.Dirt) {
                    this._drawSpecial(graphics, block, px, py);
                }

                // 迷雾覆盖：未揭示的泥土上叠半透明暗层（三级羽化）
                if (!block.isOilHint && !block.isRevealed) {
                    const d = fogDist[y][x];
                    const a = d === 1 ? 0.34 : d === 2 ? 0.56 : 0.74;
                    graphics.fillColor = new Color(Palette.fog.r, Palette.fog.g, Palette.fog.b, Math.floor(a * 255));
                    graphics.rect(px, py, Layout.cellW + 0.5, Layout.cellH + 0.5);
                    graphics.fill();
                }
            }
        }

        // 石油连通块外沿描边（黑油靠「形」被认出来）
        this._drawOilOutline(graphics, grid, width, height);

        // 井架标记：每口井架 1 格宽、2 格高，底边贴地表
        for (const rx of rigs) {
            graphics.fillColor = Palette.metal;
            graphics.rect(Layout.gridLeft + rx * Layout.cellW, Layout.gridTop, Layout.cellW, Layout.cellH * 2);
            graphics.fill();
        }
    }

    // 泥土按深度浅→深渐变
    private _soilColor(y: number, height: number): Color {
        const t = y / (height - 1);
        return this._lerpColor(Palette.soilLight, Palette.soilDark, Math.pow(t, 0.85));
    }

    private _drawSpecial(graphics: Graphics, block: GridBlock, px: number, py: number): void {
        const cw = Layout.cellW;
        const ch = Layout.cellH;
        switch (block.type) {
            case BlockType.Rock: {
                graphics.fillColor = block.hardness >= 16 ? Palette.hardRock : Palette.rock;
                graphics.rect(px, py, cw + 0.5, ch + 0.5);
                graphics.fill();
                // 顶部高光：做出体积
                graphics.fillColor = new Color(255, 255, 255, 26);
                graphics.rect(px, py, cw, 1.6);
                graphics.fill();
                break;
            }
            case BlockType.Oil: {
                graphics.fillColor = Palette.oil;
                graphics.rect(px, py, cw + 0.5, ch + 0.5);
                graphics.fill();
                break;
            }
            case BlockType.Gas: {
                graphics.fillColor = Palette.gas;
                graphics.rect(px, py, cw + 0.5, ch + 0.5);
                graphics.fill();
                // 45° 斜纹
                graphics.strokeColor = Palette.gasStripe;
                graphics.lineWidth = 1;
                graphics.beginPath();
                for (let k = -ch; k < cw; k += 5) {
                    graphics.moveTo(px + k, py + ch);
                    graphics.lineTo(px + k + ch, py);
                }
                graphics.stroke();
                break;
            }
        }
    }

    // BFS：每个格到最近已揭示区的距离
    private _computeFogDist(grid: GridBlock[][], width: number, height: number): number[][] {
        const dist: number[][] = Array.from({ length: height }, () => new Array(width).fill(999));
        const q: number[] = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y][x].isRevealed) {
                    dist[y][x] = 0;
                    q.push(y * width + x);
                }
            }
        }
        let head = 0;
        while (head < q.length) {
            const idx = q[head++];
            const x = idx % width;
            const y = (idx / width) | 0;
            const nd = dist[y][x] + 1;
            if (x + 1 < width && dist[y][x + 1] > nd) { dist[y][x + 1] = nd; q.push(y * width + x + 1); }
            if (x - 1 >= 0 && dist[y][x - 1] > nd) { dist[y][x - 1] = nd; q.push(y * width + x - 1); }
            if (y + 1 < height && dist[y + 1][x] > nd) { dist[y + 1][x] = nd; q.push((y + 1) * width + x); }
            if (y - 1 >= 0 && dist[y - 1][x] > nd) { dist[y - 1][x] = nd; q.push((y - 1) * width + x); }
        }
        return dist;
    }

    private _drawOilOutline(graphics: Graphics, grid: GridBlock[][], width: number, height: number): void {
        graphics.strokeColor = Palette.oilOutline;
        graphics.lineWidth = 1.6;
        graphics.beginPath();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y][x].type !== BlockType.Oil || !grid[y][x].isRevealed) continue;
                const px = Layout.gridLeft + x * Layout.cellW;
                const py = Layout.gridTop - (y + 1) * Layout.cellH;
                const cw = Layout.cellW;
                const ch = Layout.cellH;
                if (y === 0 || grid[y - 1][x].type !== BlockType.Oil) { graphics.moveTo(px, py + 0.8); graphics.lineTo(px + cw, py + 0.8); }
                if (y === height - 1 || grid[y + 1][x].type !== BlockType.Oil) { graphics.moveTo(px, py + ch - 0.8); graphics.lineTo(px + cw, py + ch - 0.8); }
                if (x === 0 || grid[y][x - 1].type !== BlockType.Oil) { graphics.moveTo(px + 0.8, py); graphics.lineTo(px + 0.8, py + ch); }
                if (x === width - 1 || grid[y][x + 1].type !== BlockType.Oil) { graphics.moveTo(px + cw - 0.8, py); graphics.lineTo(px + cw - 0.8, py + ch); }
            }
        }
        graphics.stroke();
    }

    private _lerpColor(a: Color, b: Color, t: number): Color {
        return new Color(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t),
            255,
        );
    }
}
