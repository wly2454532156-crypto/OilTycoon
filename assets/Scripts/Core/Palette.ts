import { Color } from 'cc';

// 视觉规范唯一取色源（SDD §15.1）。所有渲染器只从这里取色，不散落各处。

export const Palette = {
    soilLight: new Color('#8C6545'),
    soilDark: new Color('#4E3421'),
    rock: new Color('#4B5057'),
    hardRock: new Color('#2A2E32'),
    oil: new Color('#1A1F1C'),
    oilOutline: new Color(150, 205, 170, 107), // rgba(150,205,170,.42)
    gas: new Color('#5E9C86'),
    gasStripe: new Color(160, 220, 200, 90),
    fog: new Color('#0E0A08'),
    oilHint: new Color('#2B1D12'),
    pipe: new Color('#191F24'),
    pipeFlow: new Color('#2E4A3C'),
    metal: new Color('#9AA0A6'),
    companyA: new Color('#E0A33F'),
    companyB: new Color('#4E93A8'),
    warn: new Color('#E05B4B'),
};
