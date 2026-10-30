export enum BlockType {
    Dirt = 0,
    Rock = 1,
    Oil = 2,
    Gas = 3,
}

export interface GridBlock {
    x: number;
    y: number;
    type: BlockType;
    hardness: number;
    resourceCapacity: number;
    isRevealed: boolean;
    isOilHint: boolean;
}

export interface GridGenParams {
    pBase?: number;
    wDepth?: number;
    smoothingIterations?: number;
    minClusterSize?: number;
    capacityBase?: number;
    capacityMultiplier?: number;
    hardnessDirt?: number;
    hardnessRock?: number;
    hardnessOil?: number;
    hardnessGas?: number;
    rockPBase?: number;
    rockWDepth?: number;
    gasPBase?: number;
    gasWDepth?: number;
}

export class GridManager {
    private readonly _width: number;
    private readonly _height: number;
    private _grid: GridBlock[][] = [];

    private _pBase = 0.16;
    private _wDepth = 0.35;
    private _smoothingIterations = 2;
    private _minClusterSize = 4;
    private _capacityBase = 200;
    private _capacityMultiplier = 40;

    private _hardnessDirt = 1;
    private _hardnessRock = 8;
    private _hardnessOil = 1;
    private _hardnessGas = 1;

    private _rockPBase = 0.14;
    private _rockWDepth = 0.35;
    private _gasPBase = 0.15;
    private _gasWDepth = 0.25;

    constructor(width: number, height: number, params?: GridGenParams) {
        this._width = width;
        this._height = height;
        if (params) {
            this._pBase = params.pBase ?? this._pBase;
            this._wDepth = params.wDepth ?? this._wDepth;
            this._smoothingIterations = params.smoothingIterations ?? this._smoothingIterations;
            this._minClusterSize = params.minClusterSize ?? this._minClusterSize;
            this._capacityBase = params.capacityBase ?? this._capacityBase;
            this._capacityMultiplier = params.capacityMultiplier ?? this._capacityMultiplier;
            this._hardnessDirt = params.hardnessDirt ?? this._hardnessDirt;
            this._hardnessRock = params.hardnessRock ?? this._hardnessRock;
            this._hardnessOil = params.hardnessOil ?? this._hardnessOil;
            this._hardnessGas = params.hardnessGas ?? this._hardnessGas;
            this._rockPBase = params.rockPBase ?? this._rockPBase;
            this._rockWDepth = params.rockWDepth ?? this._rockWDepth;
            this._gasPBase = params.gasPBase ?? this._gasPBase;
            this._gasWDepth = params.gasWDepth ?? this._gasWDepth;
        }
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get grid(): GridBlock[][] {
        return this._grid;
    }

    getBlock(x: number, y: number): GridBlock | null {
        if (x < 0 || y < 0 || x >= this._width || y >= this._height) {
            return null;
        }
        return this._grid[y][x];
    }

    // 揭开指定格及其 8 邻域（共 3x3）的战争迷雾
    revealArea(x: number, y: number): void {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const block = this.getBlock(x + dx, y + dy);
                if (block) {
                    block.isRevealed = true;
                }
            }
        }
    }

    // 揭开全图迷雾（调试用）
    revealAll(): void {
        for (let y = 0; y < this._height; y++) {
            for (let x = 0; x < this._width; x++) {
                this._grid[y][x].isRevealed = true;
            }
        }
    }

    generate(): void {
        // 阶段一/二：油藏 深度加权种子 -> Moore 邻域平滑
        let oil = this._generateSeed(this._pBase, this._wDepth);
        for (let i = 0; i < this._smoothingIterations; i++) {
            oil = this._smooth(oil);
        }

        // 阶段三：孤岛剔除，随后测算每个油格到最近 Dirt 的曼哈顿距离作为储量梯度
        this._removeSmallClusters(oil, this._minClusterSize);
        const edgeDist = this._computeEdgeDistances(oil);

        // 岩石层独立生成（同套逻辑），合并时油藏优先级高于岩石
        let rock = this._generateSeed(this._rockPBase, this._rockWDepth);
        for (let i = 0; i < this._smoothingIterations; i++) {
            rock = this._smooth(rock);
        }

        // 气藏层独立生成，合并优先级：油 > 气 > 岩石
        let gas = this._generateSeed(this._gasPBase, this._gasWDepth);
        for (let i = 0; i < this._smoothingIterations; i++) {
            gas = this._smooth(gas);
        }
        this._removeSmallClusters(gas, 3);

        this._grid = [];
        for (let y = 0; y < this._height; y++) {
            this._grid[y] = [];
            for (let x = 0; x < this._width; x++) {
                let type: BlockType;
                let hardness: number;
                let capacity = 0;

                if (oil[y][x]) {
                    type = BlockType.Oil;
                    hardness = this._hardnessOil;
                    capacity = this._capacityBase + edgeDist[y][x] * this._capacityMultiplier;
                } else if (gas[y][x]) {
                    type = BlockType.Gas;
                    hardness = this._hardnessGas;
                } else if (rock[y][x]) {
                    type = BlockType.Rock;
                    // 深层岩石为硬岩档（2 倍硬度，钻透更慢）
                    hardness = y >= this._height * 0.5 ? this._hardnessRock * 2 : this._hardnessRock;
                } else {
                    type = BlockType.Dirt;
                    hardness = this._hardnessDirt;
                }

                this._grid[y][x] = {
                    x,
                    y,
                    type,
                    hardness,
                    resourceCapacity: capacity,
                    isRevealed: false,
                    isOilHint: false,
                };
            }
        }

        // 地表油迹提示：仅当该列有「浅层油」（油顶 y<6）时标记，深层油需探测器/扫描仪/鼹鼠
        for (let x = 0; x < this._width; x++) {
            let shallowOil = false;
            for (let y = 1; y < this._height; y++) {
                if (this._grid[y][x].type === BlockType.Oil) {
                    shallowOil = y < 6;
                    break;
                }
            }
            if (shallowOil && this._grid[0][x].type !== BlockType.Oil) {
                this._grid[0][x].isOilHint = true;
            }
        }
    }

    debugPrintGrid(): void {
        const symbols = [".", "#", "O", "G"];
        const lines: string[] = [];
        for (let y = 0; y < this._height; y++) {
            let row = "";
            for (let x = 0; x < this._width; x++) {
                row += symbols[this._grid[y][x].type];
            }
            lines.push(row);
        }
        console.log(lines.join("\n"));
    }

    private _generateSeed(pBase: number, wDepth: number): boolean[][] {
        const yMax = Math.max(1, this._height - 1);
        const layer: boolean[][] = [];
        for (let y = 0; y < this._height; y++) {
            layer[y] = [];
            for (let x = 0; x < this._width; x++) {
                const p = pBase + (y / yMax) * wDepth;
                layer[y][x] = Math.random() < p;
            }
        }
        return layer;
    }

    private _smooth(layer: boolean[][]): boolean[][] {
        const next: boolean[][] = [];
        for (let y = 0; y < this._height; y++) {
            next[y] = [];
            for (let x = 0; x < this._width; x++) {
                const n = this._countMooreNeighbors(layer, x, y);
                next[y][x] = layer[y][x] ? n >= 4 : n >= 5;
            }
        }
        return next;
    }

    private _countMooreNeighbors(layer: boolean[][], x: number, y: number): number {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= this._width || ny >= this._height) continue;
                if (layer[ny][nx]) n++;
            }
        }
        return n;
    }

    private _removeSmallClusters(layer: boolean[][], minSize: number): void {
        const clusters = this._collectClusters(layer);
        for (const cluster of clusters) {
            if (cluster.length < minSize) {
                for (const cell of cluster) {
                    layer[cell.y][cell.x] = false;
                }
            }
        }
    }

    private _collectClusters(layer: boolean[][]): { x: number; y: number }[][] {
        const w = this._width;
        const h = this._height;
        const visited: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
        const clusters: { x: number; y: number }[][] = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!layer[y][x] || visited[y][x]) continue;

                const cluster: { x: number; y: number }[] = [];
                const stack: number[] = [y * w + x];
                visited[y][x] = true;

                while (stack.length > 0) {
                    const idx = stack.pop() as number;
                    const cx = idx % w;
                    const cy = (idx / w) | 0;
                    cluster.push({ x: cx, y: cy });

                    if (cx + 1 < w && layer[cy][cx + 1] && !visited[cy][cx + 1]) {
                        visited[cy][cx + 1] = true;
                        stack.push(cy * w + cx + 1);
                    }
                    if (cx - 1 >= 0 && layer[cy][cx - 1] && !visited[cy][cx - 1]) {
                        visited[cy][cx - 1] = true;
                        stack.push(cy * w + cx - 1);
                    }
                    if (cy + 1 < h && layer[cy + 1][cx] && !visited[cy + 1][cx]) {
                        visited[cy + 1][cx] = true;
                        stack.push((cy + 1) * w + cx);
                    }
                    if (cy - 1 >= 0 && layer[cy - 1][cx] && !visited[cy - 1][cx]) {
                        visited[cy - 1][cx] = true;
                        stack.push((cy - 1) * w + cx);
                    }
                }

                clusters.push(cluster);
            }
        }
        return clusters;
    }

    private _computeEdgeDistances(layer: boolean[][]): number[][] {
        const w = this._width;
        const h = this._height;
        const dist: number[][] = Array.from({ length: h }, () => new Array(w).fill(Infinity));
        const queue: number[] = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!layer[y][x]) {
                    dist[y][x] = 0;
                    queue.push(y * w + x);
                }
            }
        }

        // 边界外的空间视为 Dirt：边界上的油格距其 D_edge = 1。
        for (let x = 0; x < w; x++) {
            if (layer[0][x] && dist[0][x] > 1) {
                dist[0][x] = 1;
                queue.push(x);
            }
            if (layer[h - 1][x] && dist[h - 1][x] > 1) {
                dist[h - 1][x] = 1;
                queue.push((h - 1) * w + x);
            }
        }
        for (let y = 0; y < h; y++) {
            if (layer[y][0] && dist[y][0] > 1) {
                dist[y][0] = 1;
                queue.push(y * w);
            }
            if (layer[y][w - 1] && dist[y][w - 1] > 1) {
                dist[y][w - 1] = 1;
                queue.push(y * w + w - 1);
            }
        }

        let head = 0;
        while (head < queue.length) {
            const idx = queue[head++];
            const x = idx % w;
            const y = (idx / w) | 0;
            const nd = dist[y][x] + 1;

            if (x + 1 < w && dist[y][x + 1] > nd) {
                dist[y][x + 1] = nd;
                queue.push(y * w + x + 1);
            }
            if (x - 1 >= 0 && dist[y][x - 1] > nd) {
                dist[y][x - 1] = nd;
                queue.push(y * w + x - 1);
            }
            if (y + 1 < h && dist[y + 1][x] > nd) {
                dist[y + 1][x] = nd;
                queue.push((y + 1) * w + x);
            }
            if (y - 1 >= 0 && dist[y - 1][x] > nd) {
                dist[y - 1][x] = nd;
                queue.push((y - 1) * w + x);
            }
        }

        return dist;
    }
}
