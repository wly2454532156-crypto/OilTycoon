import { view } from 'cc';

// 布局唯一真源（SDD §14.2）。渲染与触摸都读这里，消除 Grid/Pipe 各维护一份 cellSize 的隐患。

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const DESIGN_W = 1334;
const DESIGN_H = 750;
const PANEL_W = 147;
const GAP = 20;
const GRID_TOP_FROM_TOP = 242; // 地层顶部距屏幕顶 = 状态条60 + 购买栏84 + 天空98

export const Layout = (() => {
    const W = view.getVisibleSize().width || DESIGN_W;
    const cellW = clamp((W - 2 * (PANEL_W + GAP)) / 40, 22, 30);
    const cellH = Math.round(cellW * 0.84);
    const gridW = 40 * cellW;
    const gridH = 20 * cellH;
    // 地层左上角（相对 Canvas 中心、y 向上为正）
    const gridLeft = -gridW / 2;
    const gridTop = DESIGN_H / 2 - GRID_TOP_FROM_TOP;
    return {
        COLS: 40,
        ROWS: 20,
        cellW,
        cellH,
        gridW,
        gridH,
        gridLeft,
        gridTop,
        // 各横条中心 Y（Canvas 中心、Y 向上）
        statusBarY: DESIGN_H / 2 - 30,    // 状态条（60 高，顶部 0~60）
        shopBarY: DESIGN_H / 2 - 102,     // 购买栏（84 高，顶部 60~144）
        actionBarY: DESIGN_H / 2 - 706,   // 动作条（88 高，顶部 662~750）
        // 左右公司面板（147×518，顶部 144~662）
        panelCenterX: DESIGN_W / 2 - PANEL_W / 2,  // 593.5
        panelCenterY: DESIGN_H / 2 - 403,           // -28
        panelH: 518,
    };
})();

/** 世界坐标（Canvas 中心、y 向上）→ 格子（最近格吸附，越界给 -1 / COLS） */
export function worldToCell(p: { x: number; y: number }): { x: number; y: number; inside: boolean } {
    const L = Layout;
    const fx = (p.x - L.gridLeft) / L.cellW;
    const fy = (L.gridTop - p.y) / L.cellH;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const inside = cx >= 0 && cy >= 0 && cx < L.COLS && cy < L.ROWS;
    return { x: cx, y: cy, inside };
}

/** 格子 → 格中心世界坐标 */
export function cellToWorld(x: number, y: number): { x: number; y: number } {
    const L = Layout;
    return { x: L.gridLeft + (x + 0.5) * L.cellW, y: L.gridTop - (y + 0.5) * L.cellH };
}
