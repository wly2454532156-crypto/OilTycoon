import { _decorator, Component, Label, Node, UITransform, Color } from 'cc';
import { WalletState } from '../Economy/EconomyManager';
import { MarketState } from '../Economy/MarketManager';

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

    onLoad(): void {
        // 场景未绑定 dateLabel 时运行时创建，确保日历（紧迫感来源）在手机上可见
        if (this.dateLabel) return;
        const node = new Node('Date');
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(200, 40);
        const label = node.addComponent(Label);
        label.fontSize = 20;
        label.lineHeight = 30;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(node);
        node.setPosition(0, 130, 0);
        this.dateLabel = label;
    }

    updateUI(wallet: WalletState, market: MarketState, buffer: number, currentDay: number, maxDays: number, bufferCapacity: number): void {
        if (this.balanceLabel) {
            this.balanceLabel.string = `$${wallet.balance.toFixed(2)}`;
        }
        if (this.leftPriceLabel) {
            this.leftPriceLabel.string = `$${market.leftCompanyPrice.toFixed(2)}`;
        }
        if (this.rightPriceLabel) {
            this.rightPriceLabel.string = `$${market.rightCompanyPrice.toFixed(2)}`;
        }
        if (this.bufferLabel) {
            this.bufferLabel.string = `${buffer} / ${bufferCapacity}`;
        }
        if (this.dateLabel) {
            this.dateLabel.string = `第 ${currentDay} / ${maxDays} 天`;
        }
    }
}
