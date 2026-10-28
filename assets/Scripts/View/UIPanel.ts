import { _decorator, Component, Label } from 'cc';
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

    showGameOver(won: boolean): void {
        if (this.dateLabel) {
            this.dateLabel.string = won ? '🎉 游戏结束：胜利' : '💀 游戏结束：失败';
        }
    }
}
