import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { ToolType, ToolDef, TOOL_CATALOG, getToolDef } from '../Economy/ToolCatalog';
import { EconomyManager } from '../Economy/EconomyManager';
import { WagonManager } from '../Economy/WagonManager';
import { PipeNetworkManager } from '../Core/PipeNetworkManager';
import { PipeController } from './PipeController';

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
    private _messageLabel: Label | null = null;
    private _messageTicks = 0;

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

        // 面板背景（半透明黑底圆角）
        const totalW = items.length * BTN_W + (items.length - 1) * BTN_GAP + PAD * 2;
        const totalH = BTN_H + PAD * 2;
        const bg = this.node.addComponent(Graphics);
        bg.fillColor = COLOR_PANEL_BG;
        bg.roundRect(-totalW / 2, -totalH / 2, totalW, totalH, 6);
        bg.fill();

        let x = -totalW / 2 + PAD + BTN_W / 2;
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
            node.setPosition(x, 0, 0);
            x += BTN_W + BTN_GAP;

            this._entries.push({ def, label });
            const type = def.type;
            node.on(Node.EventType.TOUCH_END, () => this._onClick(type), this);
        }

        // 工具反馈消息标签（工具栏上方）
        const msgNode = new Node('message');
        msgNode.layer = this.node.layer;
        msgNode.addComponent(UITransform).setContentSize(totalW, 30);
        const msgLabel = msgNode.addComponent(Label);
        msgLabel.fontSize = 14;
        msgLabel.lineHeight = 20;
        msgLabel.color = COLOR_MESSAGE;
        msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        msgLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(msgNode);
        msgNode.setPosition(0, totalH / 2 + 20, 0);
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
