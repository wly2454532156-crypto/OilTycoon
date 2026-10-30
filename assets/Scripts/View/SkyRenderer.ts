import { _decorator, Component, Graphics, Color } from 'cc';
import { Layout } from '../Core/Layout';

const { ccclass, property } = _decorator;

@ccclass('SkyRenderer')
export class SkyRenderer extends Component {
    @property(Color)
    skyTop = new Color('#6E8CA5'); // 天空顶部（浅蓝灰）

    @property(Color)
    skyBottom = new Color('#D6C4A6'); // 天空底部（暖沙，近地平线）

    @property(Color)
    horizonColor = new Color('#7A5A38'); // 地平线

    onLoad(): void {
        this.renderSky();
    }

    renderSky(): void {
        const graphics = this.getComponent(Graphics);
        if (!graphics) return;
        graphics.clear();

        const horizonY = Layout.gridTop;
        const screenTop = 375; // DESIGN_H / 2

        // 渐变近似：多段色带（Graphics 不支持线性渐变）
        const steps = 16;
        const W = 1400;
        for (let i = 0; i < steps; i++) {
            const t0 = i / steps;
            const y0 = horizonY + (screenTop - horizonY) * t0;
            const y1 = horizonY + (screenTop - horizonY) * ((i + 1) / steps);
            graphics.fillColor = this._lerp(this.skyTop, this.skyBottom, t0);
            graphics.rect(-W / 2, y0, W, y1 - y0 + 1);
            graphics.fill();
        }

        // 地平线
        graphics.fillColor = this.horizonColor;
        graphics.rect(-W / 2, horizonY, W, 4);
        graphics.fill();
    }

    private _lerp(a: Color, b: Color, t: number): Color {
        return new Color(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t),
            255,
        );
    }
}
