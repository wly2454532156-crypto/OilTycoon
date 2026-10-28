import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { WalletState } from '../Economy/EconomyManager';

const { ccclass } = _decorator;

@ccclass('RecapPanel')
export class RecapPanel extends Component {
    show(won: boolean, wallet: WalletState, targetMoney: number, currentDay: number, maxDays: number): void {
        const bg = this.node.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 210);
        bg.roundRect(-230, -150, 460, 300, 12);
        bg.fill();

        this._addLabel('title', won ? '🎉 胜利！' : '💀 失败', 32, won ? '#FFD24D' : '#FF6B6B', 0, 115, 400, 40);

        const lines = [
            `最终余额：$${wallet.balance.toFixed(2)}`,
            `目标资产：$${targetMoney}`,
            `累计营收：$${wallet.totalEarned.toFixed(2)}`,
            `累计支出：$${wallet.totalSpent.toFixed(2)}`,
            `溢油罚款：$${wallet.spillagePenalty.toFixed(2)}`,
            `用时：${currentDay} / ${maxDays} 天`,
        ];
        let y = 55;
        for (const line of lines) {
            this._addLabel('line', line, 18, '#FFFFFF', 0, y, 420, 30);
            y -= 34;
        }
    }

    private _addLabel(name: string, text: string, fontSize: number, color: string, x: number, y: number, w: number, h: number): void {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.floor(fontSize * 1.4);
        label.color = new Color(color);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(node);
        node.setPosition(x, y, 0);
    }
}
