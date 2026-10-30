// 工具/设施目录——唯一数据源。所有名称与价格以此为准（见 SDD 8.1 价格表）。

export enum ToolType {
    Rig = 0,      // 钻井（设施）
    Silo = 1,     // 油罐（设施）
    Wagon = 2,    // 马车（设施）
    Dowser = 3,   // 探测器（工具）
    Scanner = 4,  // 扫描仪（工具）
    Mole = 5,     // 鼹鼠（工具）
    Dynamite = 6, // 炸药（工具）
    SuperSilo = 7, // 超级油罐（设施）
    Refinery = 8,  // 炼油厂（设施）
}

export interface ToolDef {
    type: ToolType;
    name: string;
    price: number;
    category: 'facility' | 'tool';
}

export const TOOL_CATALOG: ToolDef[] = [
    { type: ToolType.Rig, name: '钻井', price: 350, category: 'facility' },
    { type: ToolType.Silo, name: '油罐', price: 250, category: 'facility' },
    { type: ToolType.SuperSilo, name: '超级油罐', price: 500, category: 'facility' },
    { type: ToolType.Wagon, name: '马车', price: 150, category: 'facility' },
    { type: ToolType.Refinery, name: '炼油厂', price: 500, category: 'facility' },
    { type: ToolType.Dowser, name: '探测器', price: 100, category: 'tool' },
    { type: ToolType.Scanner, name: '扫描仪', price: 100, category: 'tool' },
    { type: ToolType.Mole, name: '鼹鼠', price: 100, category: 'tool' },
    { type: ToolType.Dynamite, name: '炸药', price: 100, category: 'tool' },
];

export function getToolDef(type: ToolType): ToolDef {
    return TOOL_CATALOG.find((t) => t.type === type) as ToolDef;
}
