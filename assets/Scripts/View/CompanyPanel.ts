import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { MarketManager } from '../Economy/MarketManager';
import { EconomyManager } from '../Economy/EconomyManager';
import { WagonManager } from '../Economy/WagonManager';
import { Layout } from '../Core/Layout';

const { ccclass } = _decorator;

const PANEL_W = 147;
const COLOR_A = new Color('#E0A33F'); // 买方 A 暖金
const COLOR_B = new Color('#4E93A8'); // 买方 B 冷青
const COLOR_PANEL_BG = new Color(0, 0, 0, 170);

@ccclass('CompanyPanel')
export class CompanyPanel extends Component {
    private _economy: EconomyManager | null = null;
    private _wagonMgr: WagonManager | null = null;
    private _market: MarketManager | null = null;
    private _leftPriceLabel: Label | null = null;
    private _rightPriceLabel: Label | null = null;

    init(economy: EconomyManager, wagonMgr: WagonManager, market: MarketManager): void {
        this._economy = economy;
        this._wagonMgr = wagonMgr;
        this._market = market;
        this._buildPanel('left', -Layout.panelCenterX, '买方 A', COLOR_A);
        this._buildPanel('right', Layout.panelCenterX, '买方 B', COLOR_B);
        this.refresh();
    }

    refresh(): void {
        if (this._market && this._leftPriceLabel) {
            this._leftPriceLabel.string = `$${this._market.leftCompanyPrice.toFixed(2)}`;
        }
        if (this._market && this._rightPriceLabel) {
            this._rightPriceLabel.string = `$${this._market.rightCompanyPrice.toFixed(2)}`;
        }
    }

    private _buildPanel(side: 'left' | 'right', x: number, name: string, color: Color): void {
        const graphics = this.node.addComponent(Graphics);
        graphics.fillColor = COLOR_PANEL_BG;
        graphics.roundRect(x - PANEL_W / 2, Layout.panelCenterY - Layout.panelH / 2, PANEL_W, Layout.panelH, 10);
        graphics.fill();

        // 公司名
        this._addLabel('name', name, 15, color, x, Layout.panelCenterY + 225, PANEL_W, 40);

        // 实时价
        const priceLabel = this._addLabel('price', '$0.00', 30, Color.WHITE, x, Layout.panelCenterY + 160, PANEL_W, 50);
        if (side === 'left') this._leftPriceLabel = priceLabel;
        else this._rightPriceLabel = priceLabel;

        // 派车按钮
        const btn = new Node('dispatch');
        btn.layer = this.node.layer;
        btn.addComponent(UITransform).setContentSize(PANEL_W - 18, 70);
        const btnLabel = btn.addComponent(Label);
        btnLabel.string = side === 'left' ? '◀ 派车' : '派车 ▶';
        btnLabel.fontSize = 16;
        btnLabel.lineHeight = 22;
        btnLabel.color = color;
        btnLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        btnLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(btn);
        btn.setPosition(x, Layout.panelCenterY - 220, 0);
        btn.on(Node.EventType.TOUCH_END, () => this._onDispatch(side), this);

        // 按钮底板（点击区更明显）
        const bg = btn.addComponent(Graphics);
        bg.fillColor = new Color(color.r, color.g, color.b, 40);
        bg.roundRect(-(PANEL_W - 18) / 2, -35, PANEL_W - 18, 70, 9);
        bg.fill();
    }

    private _addLabel(n: string, text: string, fontSize: number, color: Color, x: number, y: number, w: number, h: number): Label {
        const node = new Node(n);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.floor(fontSize * 1.4);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(node);
        node.setPosition(x, y, 0);
        return label;
    }

    private _onDispatch(side: 'left' | 'right'): void {
        if (this._wagonMgr && this._economy) {
            this._wagonMgr.dispatchSell(side, this._economy);
        }
    }
}
