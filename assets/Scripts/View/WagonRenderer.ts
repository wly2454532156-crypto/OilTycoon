import { _decorator, Component, Graphics, Color } from 'cc';
import { WagonManager, WagonState } from '../Economy/WagonManager';

const { ccclass } = _decorator;

const COLOR_LOADED = new Color('#000000');
const COLOR_EMPTY = new Color('#CCCCCC');
const COLOR_IDLE = new Color('#FFFF00');
const COLOR_TO_COMPANY = new Color('#00FF00');
const COLOR_SELLING = new Color('#FF0000');
const COLOR_TO_SILO = new Color('#0000FF');

@ccclass('WagonRenderer')
export class WagonRenderer extends Component {
    private readonly wagonWidth = 40;
    private readonly wagonHeight = 20;

    renderWagons(wagonMgr: WagonManager): void {
        const graphics = this.getComponent(Graphics);
        if (!graphics) {
            console.warn('WagonRenderer: 节点上缺少 Graphics 组件');
            return;
        }

        graphics.clear();

        for (const wagon of wagonMgr.wagons) {
            graphics.fillColor = wagon.currentLoad > 0 ? COLOR_LOADED : COLOR_EMPTY;
            graphics.rect(wagon.positionX - this.wagonWidth / 2, 10, this.wagonWidth, this.wagonHeight);
            graphics.fill();

            graphics.fillColor = this._stateColor(wagon.state);
            graphics.rect(wagon.positionX - this.wagonWidth / 4, 10 + this.wagonHeight, this.wagonWidth / 2, 6);
            graphics.fill();
        }
    }

    private _stateColor(state: WagonState): Color {
        switch (state) {
            case WagonState.TO_COMPANY:
                return COLOR_TO_COMPANY;
            case WagonState.SELLING:
                return COLOR_SELLING;
            case WagonState.TO_SILO:
                return COLOR_TO_SILO;
            case WagonState.IDLE:
            default:
                return COLOR_IDLE;
        }
    }
}
