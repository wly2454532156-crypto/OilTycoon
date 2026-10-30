import { _decorator, Component, Label, Node, UITransform, Color, Graphics } from 'cc';
import { WalletState } from '../Economy/EconomyManager';
import { MarketState } from '../Economy/MarketManager';
import { Layout } from '../Core/Layout';

const { ccclass, property } = _decorator;

@ccclass('UIPanel')
export class UIPanel extends Component {
    @property(Label)
    balanceLabel: Label = null;

    @property(Label)
    leftPriceLabel: Label = null;

    @property(Label)
    rightPriceLabel: Label = null;

    @property(Label)
    bufferLabel: Label = null;

    @property(Label)
    dateLabel: Label = null;

    private targetLabel: Label | null = null;
    private gasLabel: Label | null = null;
    private progressBar: Graphics | null = null;

    onLoad(): void {
        if (!this.dateLabel) {
            this.dateLabel = this._createLabel('Date', 18);
        }
        if (!this.targetLabel) {
            this.targetLabel = this._createLabel('Target', 13);
        }
        if (!this.gasLabel) {
            this.gasLabel = this._createLabel('Gas', 15);
        }
        // 目标进度条
        const barNode = new Node('TargetBar');
        barNode.layer = this.node.layer;
        barNode.addComponent(UITransform).setContentSize(150, 6);
        this.progressBar = barNode.addComponent(Graphics);
        this.node.addChild(barNode);

        this._layoutStatusBar();
    }

    private _createLabel(name: string, fontSize: number): Label {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(220, 40);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = Math.floor(fontSize * 1.4);
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(node);
        node.setPosition(0, 0, 0);
        return label;
    }

    private _layoutStatusBar(): void {
        const place = (label: Label | null, x: number) => {
            if (label) label.node.setPosition(x, Layout.statusBarY, 0);
        };
        place(this.balanceLabel, -570);
        place(this.dateLabel, -410);
        place(this.targetLabel, -225);
        if (this.progressBar) {
            this.progressBar.node.setPosition(-135, Layout.statusBarY - 14, 0);
        }
        place(this.bufferLabel, 130);
        place(this.gasLabel, 290);
        // 左右价已移到公司面板，状态条不再显示（移出屏幕）
        place(this.leftPriceLabel, -9999);
        place(this.rightPriceLabel, -9999);
    }

    updateUI(
        wallet: WalletState,
        market: MarketState,
        buffer: number,
        currentDay: number,
        maxDays: number,
        bufferCapacity: number,
        targetMoney: number,
        gasLevel: number,
    ): void {
        if (this.balanceLabel) {
            this.balanceLabel.string = `$${wallet.balance.toFixed(2)}`;
        }
        if (this.dateLabel) {
            this.dateLabel.string = `第 ${currentDay}/${maxDays} 天 · 剩 ${Math.max(0, maxDays - currentDay)} 天`;
        }
        const pct = Math.max(0, Math.min(1, wallet.balance / targetMoney));
        if (this.targetLabel) {
            this.targetLabel.string = `目标 $${targetMoney} · ${Math.floor(pct * 100)}%`;
        }
        if (this.progressBar) {
            this._drawBar(pct);
        }
        if (this.bufferLabel) {
            this.bufferLabel.string = `${buffer} / ${bufferCapacity}`;
        }
        if (this.gasLabel) {
            this.gasLabel.string = `气压 ${Math.floor(gasLevel)}`;
        }
    }

    private _drawBar(pct: number): void {
        const g = this.progressBar;
        if (!g) return;
        g.clear();
        g.fillColor = new Color(255, 255, 255, 40);
        g.rect(-75, -3, 150, 6);
        g.fill();
        g.fillColor = new Color('#7FBF6A');
        g.rect(-75, -3, 150 * pct, 6);
        g.fill();
    }
}
