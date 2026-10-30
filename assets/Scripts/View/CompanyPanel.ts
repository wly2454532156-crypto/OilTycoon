import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { MarketManager } from '../Economy/MarketManager';
import { EconomyManager } from '../Economy/EconomyManager';
import { WagonManager } from '../Economy/WagonManager';
import { Layout } from '../Core/Layout';

const { ccclass } = _decorator;

const PANEL_W = 147;
const COLOR_A = new Color('#E0A33F');
const COLOR_B = new Color('#4E93A8');
const COLOR_UP = new Color('#7FBF6A');
const COLOR_DOWN = new Color('#E05B4B');
const COLOR_PANEL_BG = new Color(0, 0, 0, 170);

interface SidePanel {
    price: Label | null;
    trend: Label | null;
    sold: Label | null;
    spark: Graphics | null;
    history: number[];
}

@ccclass('CompanyPanel')
export class CompanyPanel extends Component {
    private _economy: EconomyManager | null = null;
    private _wagonMgr: WagonManager | null = null;
    private _market: MarketManager | null = null;
    private _left: SidePanel = { price: null, trend: null, sold: null, spark: null, history: [] };
    private _right: SidePanel = { price: null, trend: null, sold: null, spark: null, history: [] };

    init(economy: EconomyManager, wagonMgr: WagonManager, market: MarketManager): void {
        this._economy = economy;
        this._wagonMgr = wagonMgr;
        this._market = market;
        this._left = this._buildPanel('left', -Layout.panelCenterX, '买方 A', COLOR_A);
        this._right = this._buildPanel('right', Layout.panelCenterX, '买方 B', COLOR_B);
        this.refresh();
    }

    refresh(): void {
        const m = this._market;
        if (!m) return;
        this._refreshSide(this._left, m.leftCompanyPrice, m.leftTotalSold, m.leftTotalRevenue, COLOR_A);
        this._refreshSide(this._right, m.rightCompanyPrice, m.rightTotalSold, m.rightTotalRevenue, COLOR_B);
    }

    private _refreshSide(s: SidePanel, price: number, sold: number, revenue: number, color: Color): void {
        if (s.price) s.price.string = `$${price.toFixed(2)}`;

        const prev = s.history.length > 0 ? s.history[s.history.length - 1] : price;
        const delta = price - prev;
        if (s.trend) {
            s.trend.string = delta >= 0 ? `▲ ${delta.toFixed(2)} · 走高` : `▼ ${Math.abs(delta).toFixed(2)} · 走低`;
            s.trend.color = delta >= 0 ? COLOR_UP : COLOR_DOWN;
        }

        s.history.push(price);
        if (s.history.length > 30) s.history.shift();
        try {
            this._drawSpark(s.spark, s.history, color);
        } catch (e) {
            console.error('[Spark]', e);
        }

        if (s.sold) s.sold.string = `已卖 $${revenue.toFixed(0)} · ${Math.floor(sold)} 桶`;
    }

    private _drawSpark(g: Graphics | null, history: number[], color: Color): void {
        if (!g) return;
        g.clear();
        if (history.length < 2) return;
        const W = 126;
        const H = 40;
        let min = history[0];
        let max = history[0];
        for (const v of history) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const range = max - min || 1;
        g.strokeColor = color;
        g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i < history.length; i++) {
            const x = -W / 2 + (i / (history.length - 1)) * W;
            const y = -H / 2 + ((history[i] - min) / range) * H;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke();
    }

    private _buildPanel(side: 'left' | 'right', x: number, name: string, color: Color): SidePanel {
        const graphics = this.node.addComponent(Graphics);
        graphics.fillColor = COLOR_PANEL_BG;
        graphics.roundRect(x - PANEL_W / 2, Layout.panelCenterY - Layout.panelH / 2, PANEL_W, Layout.panelH, 10);
        graphics.fill();

        this._addLabel('name', name, 15, color, x, Layout.panelCenterY + 225, PANEL_W, 40);
        const priceLabel = this._addLabel('price', '$0.00', 30, Color.WHITE, x, Layout.panelCenterY + 160, PANEL_W, 50);
        const trendLabel = this._addLabel('trend', '—', 12, Color.WHITE, x, Layout.panelCenterY + 125, PANEL_W, 24);

        const sparkNode = new Node('spark');
        sparkNode.layer = this.node.layer;
        sparkNode.addComponent(UITransform).setContentSize(126, 40);
        const spark = sparkNode.addComponent(Graphics);
        this.node.addChild(sparkNode);
        sparkNode.setPosition(x, Layout.panelCenterY + 70, 0);

        const soldLabel = this._addLabel('sold', '已卖 $0 · 0 桶', 11, Color.WHITE, x, Layout.panelCenterY - 100, PANEL_W, 30);

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

        const bg = btn.addComponent(Graphics);
        bg.fillColor = new Color(color.r, color.g, color.b, 40);
        bg.roundRect(-(PANEL_W - 18) / 2, -35, PANEL_W - 18, 70, 9);
        bg.fill();

        return { price: priceLabel, trend: trendLabel, sold: soldLabel, spark, history: [] };
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
