import { _decorator, Component, Graphics, Color } from 'cc';
import { WagonManager, WagonState } from '../Economy/WagonManager';
import { Layout } from '../Core/Layout';

const { ccclass, property } = _decorator;

@ccclass('WagonRenderer')
export class WagonRenderer extends Component {
    @property(Color)
    colorLoaded = new Color('#000000');

    @property(Color)
    colorEmpty = new Color('#CCCCCC');

    @property(Color)
    colorIdle = new Color('#FFFF00');

    @property(Color)
    colorToCompany = new Color('#00FF00');

    @property(Color)
    colorSelling = new Color('#FF0000');

    @property(Color)
    colorToSilo = new Color('#0000FF');

    private readonly wagonWidth = 64;
    private readonly wagonHeight = 32;

    renderWagons(wagonMgr: WagonManager): void {
        const graphics = this.getComponent(Graphics);
        if (!graphics) {
            console.warn('WagonRenderer: 节点上缺少 Graphics 组件');
            return;
        }

        graphics.clear();

        // 天空带车道：地平线（地层顶部）上方 34 设计单位
        const laneY = Layout.gridTop + 34;

        for (const wagon of wagonMgr.wagons) {
            const y = laneY + wagon.id * 4;
            graphics.fillColor = wagon.currentLoad > 0 ? this.colorLoaded : this.colorEmpty;
            graphics.rect(wagon.positionX - this.wagonWidth / 2, y, this.wagonWidth, this.wagonHeight);
            graphics.fill();

            graphics.fillColor = this._stateColor(wagon.state);
            graphics.rect(wagon.positionX - this.wagonWidth / 4, y + this.wagonHeight, this.wagonWidth / 2, 6);
            graphics.fill();
        }
    }

    private _stateColor(state: WagonState): Color {
        switch (state) {
            case WagonState.TO_COMPANY:
                return this.colorToCompany;
            case WagonState.SELLING:
                return this.colorSelling;
            case WagonState.TO_SILO:
                return this.colorToSilo;
            case WagonState.IDLE:
            default:
                return this.colorIdle;
        }
    }
}
