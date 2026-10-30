import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { ToolType, ToolDef, TOOL_CATALOG, getToolDef } from '../Economy/ToolCatalog';
import { EconomyManager } from '../Economy/EconomyManager';
import { WagonManager } from '../Economy/WagonManager';
import { PipeNetworkManager } from '../Core/PipeNetworkManager';
import { PipeController } from './PipeController';
import { Layout } from '../Core/Layout';

const { ccclass } = _decorator;

const COLOR_NORMAL = Color.WHITE;
const COLOR_DISABLED = new Color('#7A7A7A');
const COLOR_SELECTED = new Color('#FFD24D');
const COLOR_MESSAGE = new Color('#FFE08A');
const COLOR_PANEL_BG = new Color(0, 0, 0, 160);

const BTN_W = 90;
const BTN_H = 46;
const BTN_GAP = 6;
const PAD = 12;

@ccclass('ToolPanel')
export class ToolPanel extends Component {
    private _economy: EconomyManager | null = null;
    private _wagonMgr: WagonManager | null = null;
    private _pipeMgr: PipeNetworkManager | null = null;
    private _pipeController: PipeController | null = null;

    private _entries: { def: ToolDef; label: Label }[] = [];
    private _gasButtonLabel: Label | null = null;
    private _loanButtonLabel: Label | null = null;
    private _pauseLabel: Label | null = null;
    private _messageLabel: Label | null = null;
    private _messageTicks = 0;
    pauseCallback: (() => void) | null = null;

    init(economy: EconomyManager, wagonMgr: WagonManager, pipeMgr: PipeNetworkManager, pipeController: PipeController): void {
        this._economy = economy;
        this._wagonMgr = wagonMgr;
        this._pipeMgr = pipeMgr;
        this._pipeController = pipeController;
        this._buildUI();
        this.refresh();
    }

    // 每 tick 调用一次，按余额/井架/工具选中状态刷新按钮颜色与消息
    refresh(): void {
        for (const entry of this._entries) {
            entry.label.color = this._stateColor(entry.def);
        }
        if (this._gasButtonLabel && this._pipeMgr) {
            const value = this._pipeMgr.getGasSaleValue();
            this._gasButtonLabel.string = value > 0 ? `卖气 $${Math.floor(value)}` : '卖气';
        }
        if (this._loanButtonLabel && this._economy) {
            this._loanButtonLabel.string = this._economy.debt > 0 ? `还贷 $${Math.floor(this._economy.debt)}` : '借贷 $500';
        }
        // 工具反馈消息：显示约 2 秒后清除
        if (this._messageLabel && this._pipeController && this._pipeController.lastToolMessage) {
            this._messageLabel.string = this._pipeController.lastToolMessage;
            this._messageTicks++;
            if (this._messageTicks >= 4) {
                this._messageLabel.string = '';
                this._pipeController.lastToolMessage = '';
                this._messageTicks = 0;
            }
        }
    }

    private _buildUI(): void {
        const items = TOOL_CATALOG;
        const graphics = this.node.addComponent(Graphics);

        // 顶部购买栏（8 槽）
        const shopW = items.length * BTN_W + (items.length - 1) * BTN_GAP + PAD * 2;
        graphics.fillColor = COLOR_PANEL_BG;
        graphics.roundRect(-shopW / 2, Layout.shopBarY - BTN_H / 2 - PAD / 2, shopW, BTN_H + PAD, 6);
        graphics.fill();

        let x = -shopW / 2 + PAD + BTN_W / 2;
        for (const def of items) {
            const node = new Node(`tool_${def.type}`);
            node.layer = this.node.layer;
            node.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
            const label = node.addComponent(Label);
            label.string = `${def.name} $${def.price}`;
            label.fontSize = 14;
            label.lineHeight = 20;
            label.color = Color.WHITE;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            this.node.addChild(node);
            node.setPosition(x, Layout.shopBarY, 0);
            x += BTN_W + BTN_GAP;

            this._entries.push({ def, label });
            const type = def.type;
            node.on(Node.EventType.TOUCH_END, () => this._onClick(type), this);
        }

        // 底部动作条（卖气 / 升级 / 借贷 / 暂停）
        const rowButtons = 4;
        const actW = rowButtons * BTN_W + (rowButtons - 1) * BTN_GAP + PAD * 2;
        graphics.fillColor = COLOR_PANEL_BG;
        graphics.roundRect(-actW / 2, Layout.actionBarY - BTN_H / 2 - PAD / 2, actW, BTN_H + PAD, 6);
        graphics.fill();

        let mx = -actW / 2 + PAD + BTN_W / 2;

        // 卖气按钮（显示当前可卖金额）
        const gasNode = new Node('gas');
        gasNode.layer = this.node.layer;
        gasNode.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const gasLabel = gasNode.addComponent(Label);
        gasLabel.string = '卖气';
        gasLabel.fontSize = 14;
        gasLabel.lineHeight = 20;
        gasLabel.color = Color.WHITE;
        gasLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        gasLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(gasNode);
        gasNode.setPosition(mx, Layout.actionBarY, 0);
        this._gasButtonLabel = gasLabel;
        gasNode.on(Node.EventType.TOUCH_END, () => this._onSellGas(), this);

        // 升级按钮（钻速）
        const upNode = new Node('upgrade');
        upNode.layer = this.node.layer;
        upNode.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const upLabel = upNode.addComponent(Label);
        upLabel.string = '升级';
        upLabel.fontSize = 14;
        upLabel.lineHeight = 20;
        upLabel.color = Color.WHITE;
        upLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        upLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(upNode);
        upNode.setPosition(mx, Layout.actionBarY, 0);
        mx += BTN_W + BTN_GAP;
        upNode.on(Node.EventType.TOUCH_END, () => this._onUpgrade(), this);

        // 借贷按钮
        const loanNode = new Node('loan');
        loanNode.layer = this.node.layer;
        loanNode.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const loanLabel = loanNode.addComponent(Label);
        loanLabel.string = '借贷';
        loanLabel.fontSize = 14;
        loanLabel.lineHeight = 20;
        loanLabel.color = Color.WHITE;
        loanLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        loanLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(loanNode);
        loanNode.setPosition(mx, Layout.actionBarY, 0);
        mx += BTN_W + BTN_GAP;
        this._loanButtonLabel = loanLabel;
        loanNode.on(Node.EventType.TOUCH_END, () => this._onLoan(), this);

        // 暂停按钮
        const pauseNode = new Node('pause');
        pauseNode.layer = this.node.layer;
        pauseNode.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const pauseLabel = pauseNode.addComponent(Label);
        pauseLabel.string = '暂停';
        this._pauseLabel = pauseLabel;
        pauseLabel.fontSize = 14;
        pauseLabel.lineHeight = 20;
        pauseLabel.color = Color.WHITE;
        pauseLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        pauseLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(pauseNode);
        pauseNode.setPosition(mx, Layout.actionBarY, 0);
        mx += BTN_W + BTN_GAP;
        pauseNode.on(Node.EventType.TOUCH_END, () => this._onPause(), this);

        // 工具反馈消息标签
        const msgNode = new Node('message');
        msgNode.layer = this.node.layer;
        msgNode.addComponent(UITransform).setContentSize(shopW, 30);
        const msgLabel = msgNode.addComponent(Label);
        msgLabel.fontSize = 14;
        msgLabel.lineHeight = 20;
        msgLabel.color = COLOR_MESSAGE;
        msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        msgLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(msgNode);
        msgNode.setPosition(0, Layout.shopBarY - 55, 0);
        this._messageLabel = msgLabel;
    }

    private _stateColor(def: ToolDef): Color {
        if (!this._economy) return COLOR_DISABLED;
        if (def.type === ToolType.Rig) {
            if (this._pipeController && this._pipeController.pendingRig) return COLOR_SELECTED; // 待放置
        }
        // 工具选中态
        if (def.category === 'tool' && this._pipeController && this._pipeController.selectedTool === def.type) {
            return COLOR_SELECTED;
        }
        if (this._economy.wallet.balance < def.price) return COLOR_DISABLED; // 余额不足
        return COLOR_NORMAL;
    }

    private _onClick(type: ToolType): void {
        if (!this._economy) return;
        const def = getToolDef(type);
        if (def.category === 'facility') {
            switch (type) {
                case ToolType.Rig:
                    this._buyRig();
                    break;
                case ToolType.Silo:
                    this._economy.buySilo();
                    break;
                case ToolType.SuperSilo:
                    this._economy.buySuperSilo();
                    break;
                case ToolType.Wagon:
                    if (this._wagonMgr) this._wagonMgr.buyWagon(this._economy);
                    break;
                default:
                    break;
            }
        } else {
            this._selectTool(type);
        }
        this.refresh();
    }

    private _onSellGas(): void {
        if (this._pipeMgr && this._economy) {
            const revenue = this._pipeMgr.sellGas(this._economy);
            if (revenue > 0 && this._pipeController) {
                this._pipeController.lastToolMessage = `卖气 +$${Math.floor(revenue)}`;
            }
        }
        this.refresh();
    }

    private _onUpgrade(): void {
        if (this._pipeMgr && this._economy) {
            this._pipeMgr.upgradeDrillSpeed(this._economy);
        }
        this.refresh();
    }

    private _onLoan(): void {
        if (this._economy) {
            if (this._economy.debt > 0) {
                this._economy.repayLoan();
            } else {
                this._economy.borrowLoan();
            }
        }
        this.refresh();
    }

    private _onPause(): void {
        if (this.pauseCallback) {
            this.pauseCallback();
        }
        if (this._pauseLabel) {
            this._pauseLabel.string = this._pauseLabel.string === '暂停' ? '继续' : '暂停';
        }
    }

    private _selectTool(type: ToolType): void {
        if (!this._pipeController) return;
        // 再点已选中的工具 → 取消选中
        this._pipeController.selectedTool = this._pipeController.selectedTool === type ? null : type;
    }

    private _buyRig(): void {
        if (!this._economy || !this._pipeMgr || !this._pipeController) return;
        if (this._pipeController.pendingRig) {
            // 再次点击取消待放置（不退费——原型阶段接受）
            this._pipeController.pendingRig = false;
            return;
        }
        if (this._economy.buyRig()) {
            this._pipeController.pendingRig = true;
        }
    }
}
