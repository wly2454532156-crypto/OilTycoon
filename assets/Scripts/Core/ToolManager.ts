import { GridManager, BlockType } from './GridManager';

// 工具逻辑（纯逻辑，不引用 cc）。只操作 GridManager 数据，扣费与表现由调用方负责。
export class ToolManager {
    // 探测器：报告该列（x）地表以下是否有油。y 参数保留，对齐未来「深度档位」（DOWSER_DEPTH）。
    static useDowser(gridMgr: GridManager, x: number, y: number): boolean {
        for (let gy = 1; gy < gridMgr.height; gy++) {
            const block = gridMgr.getBlock(x, gy);
            if (block && block.type === BlockType.Oil) return true;
        }
        return false;
    }

    // 扫描仪：揭开以 (x,y) 为中心的 3×3 战争迷雾
    static useScanner(gridMgr: GridManager, x: number, y: number): void {
        gridMgr.revealArea(x, y);
    }

    // 鼹鼠：从 (x,y) 向地下随机钻探约 5 格，逐格揭开迷雾
    static useMole(gridMgr: GridManager, x: number, y: number): void {
        let cx = x;
        let cy = y;
        for (let i = 0; i < 5 && cy < gridMgr.height; i++) {
            gridMgr.revealArea(cx, cy);
            const r = Math.random();
            if (r < 0.7) {
                cy += 1;                                  // 向下为主
            } else if (r < 0.85) {
                cx = Math.min(gridMgr.width - 1, cx + 1); // 右
            } else {
                cx = Math.max(0, cx - 1);                 // 左
            }
        }
    }

    // 炸药：清除岩石（变泥土），成功返回 true；非岩石返回 false（由调用方决定不扣费并保持选中）
    static useDynamite(gridMgr: GridManager, x: number, y: number): boolean {
        const block = gridMgr.getBlock(x, y);
        if (!block || block.type !== BlockType.Rock) return false;
        block.type = BlockType.Dirt;
        block.hardness = 1;
        gridMgr.revealArea(x, y);
        return true;
    }
}
