import { _decorator, Component, Node, Layers, input, Input, EventKeyboard, KeyCode, UITransform } from 'cc';
import { GridManager } from './Core/GridManager';
import { Layout } from './Core/Layout';
import { PipeNetworkManager } from './Core/PipeNetworkManager';
import { MarketManager } from './Economy/MarketManager';
import { EconomyManager } from './Economy/EconomyManager';
import { WagonManager } from './Economy/WagonManager';
import { GridRenderer } from './View/GridRenderer';
import { PipeController } from './View/PipeController';
import { UIPanel } from './View/UIPanel';
import { WagonRenderer } from './View/WagonRenderer';
import { ToolPanel } from './View/ToolPanel';
import { RecapPanel } from './View/RecapPanel';
import { CompanyPanel } from './View/CompanyPanel';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property
    gridWidth = 40;

    @property
    gridHeight = 20;

    @property
    debugRevealAll = false;

    gridMgr!: GridManager;
    pipeMgr!: PipeNetworkManager;
    market!: MarketManager;
    economy!: EconomyManager;
    wagonMgr!: WagonManager;
    private companyPanel: CompanyPanel = null;

    @property(GridRenderer)
    gridRenderer: GridRenderer = null;

    @property(PipeController)
    pipeController: PipeController = null;

    @property(UIPanel)
    uiPanel: UIPanel = null;

    @property(WagonRenderer)
    wagonRenderer: WagonRenderer = null;

    @property(ToolPanel)
    toolPanel: ToolPanel = null;

    private tickTimer = 0;
    private tickInterval = 0.5;
    private tickCounter = 0;

    // 日历与目标
    private currentDay = 1;
    private maxDays = 120;
    private targetMoney = 2500;
    private isGameOver = false;
    private isPaused = false;

    onLoad(): void {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    start(): void {
        console.log('🎮 操作：底部目录点选设施/工具；键盘 B=Silo  C=容量  V=速度  D=钻头  1=卖左  2=卖右');

        this.gridMgr = new GridManager(this.gridWidth, this.gridHeight);
        this.gridMgr.generate();

        // 调试：勾选后开局揭开全图迷雾，便于验证石油分布、油迹与管道
        if (this.debugRevealAll) {
            this.gridMgr.revealAll();
        }

        this.market = new MarketManager();
        this.economy = new EconomyManager();
        this.pipeMgr = new PipeNetworkManager();
        this.wagonMgr = new WagonManager();
        this.wagonMgr.setCompanyDistance(Layout.gridW / 2);

        // 布局：Grid/Pipe/Wagon 节点归到画布中心，渲染用 Layout 绝对坐标（SDD §14.4）
        this._layoutNodes();

        // 井架改为玩家自由选址（见 PipeController.onTouchStart），此处不再自动放置
        if (this.gridRenderer) {
            this.gridRenderer.renderGrid(this.gridMgr, this.pipeMgr.rigs);
        }
        if (this.pipeController) {
            this.pipeController.init(this.gridMgr, this.pipeMgr, this.economy, this.gridRenderer);
        }

        if (this.toolPanel) {
            this.toolPanel.init(this.economy, this.wagonMgr, this.pipeMgr, this.pipeController);
            this.toolPanel.pauseCallback = () => this.togglePause();
        }

        // 左右公司面板（SDD §14.5）
        const canvas = this.node.parent;
        if (canvas) {
            const panelNode = new Node('CompanyPanel');
            panelNode.layer = Layers.Enum.UI_2D;
            this.companyPanel = panelNode.addComponent(CompanyPanel);
            canvas.addChild(panelNode);
            panelNode.setPosition(0, 0, 0);
            this.companyPanel.init(this.economy, this.wagonMgr, this.market);
        }
    }

    // 把 Grid/Pipe/Wagon 节点归到画布中心，渲染统一用 Layout 绝对坐标（SDD §14.4）
    private _layoutNodes(): void {
        const nodes: Node[] = [];
        if (this.gridRenderer) nodes.push(this.gridRenderer.node);
        if (this.pipeController) nodes.push(this.pipeController.node);
        if (this.wagonRenderer) nodes.push(this.wagonRenderer.node);
        if (this.uiPanel) nodes.push(this.uiPanel.node);
        if (this.toolPanel) nodes.push(this.toolPanel.node);
        for (const node of nodes) {
            const ut = node.getComponent(UITransform);
            if (ut) ut.setAnchorPoint(0.5, 0.5);
            node.setPosition(0, 0, 0);
        }
    }

    update(deltaTime: number): void {
        // 游戏结束或暂停则冻结整个模拟
        if (this.isGameOver || this.isPaused) return;

        // 每帧必须执行（在 Tick 循环之外）：钻头时间平滑流逝
        const drillCompleted = this.pipeMgr.updateDrills(deltaTime, this.gridMgr);
        if (drillCompleted) {
            // 有管道完工：刷新管道颜色 + 刷新刚挖通地块周围的迷雾
            if (this.pipeController) {
                this.pipeController.renderPipes();
            }
            if (this.gridRenderer) {
                this.gridRenderer.renderGrid(this.gridMgr, this.pipeMgr.rigs);
            }
        }

        this.tickTimer += deltaTime;
        if (this.tickTimer >= this.tickInterval) {
            this.tickTimer -= this.tickInterval;
            this.tick();
        }
    }

    private tick(): void {
        this.tickCounter++;
        this.market.updatePrice(this.tickCounter);

        const extracted = this.pipeMgr.calculateFlow(this.gridMgr);

        // 气藏燃烧罚款（calculateFlow 内部已在燃烧时停工并累积罚款）
        const burnPenalty = this.pipeMgr.consumeBurnPenalty();
        if (burnPenalty > 0) {
            this.economy.payCost(burnPenalty);
            console.warn(`💥 气藏燃烧！损失 $${burnPenalty}，停工中...`);
        }

        // 立刻刷新管道内石油流动表现
        if (this.pipeController) {
            this.pipeController.renderPipes();
        }

        this.economy.addOilToBuffer(extracted);

        this.wagonMgr.updateWagons(this.economy, this.market);

        this.economy.checkSpillage();
        this.economy.applyLoanInterest();

        // 库存将满时提示玩家手动卖油，避免误以为卡死
        if (this.economy.surfaceBuffer >= this.economy.bufferCapacity) {
            console.warn('⚠️ 库存已满！按 1 卖左 / 2 卖右，或按 B 买 Silo 扩容，否则持续溢油罚款');
        }

        // 日期步进：每 2 个 Tick（1 秒）经过 1 天
        if (this.tickCounter % 2 === 0) {
            this.currentDay++;
        }

        // 到达时限，触发游戏结束
        if (this.currentDay >= this.maxDays) {
            this._triggerGameOver();
        }

        console.log(
            `[Tick ${this.tickCounter}] 油价 L=$${this.market.leftCompanyPrice.toFixed(2)} R=$${this.market.rightCompanyPrice.toFixed(2)} | 抽出 ${extracted} | 气体 ${this.pipeMgr.gasLevel}${this.pipeMgr.isBurning ? ' 🔥燃烧中' : ''} | 库存 ${this.economy.surfaceBuffer} | 余额 $${this.economy.wallet.balance.toFixed(2)} | 负债 $${this.economy.debt.toFixed(0)} | 马车活跃 ${this.wagonMgr.activeWagonCount}/${this.wagonMgr.wagons.length}`,
        );

        if (this.uiPanel) {
            try {
                this.uiPanel.updateUI(this.economy.wallet, this.market, this.economy.surfaceBuffer, this.currentDay, this.maxDays, this.economy.bufferCapacity, this.targetMoney, this.pipeMgr.gasLevel);
            } catch (e) {
                console.error('[UIPanel]', e);
            }
        }
        if (this.toolPanel) {
            try {
                this.toolPanel.refresh();
            } catch (e) {
                console.error('[ToolPanel]', e);
            }
        }
        if (this.companyPanel) {
            try {
                this.companyPanel.refresh();
            } catch (e) {
                console.error('[CompanyPanel]', e);
            }
        }
        if (this.wagonRenderer) {
            try {
                this.wagonRenderer.renderWagons(this.wagonMgr);
            } catch (e) {
                console.error('[WagonRenderer]', e);
            }
        }
    }

    private _triggerGameOver(): void {
        this.isGameOver = true;
        this.economy.settleDebt();
        const won = this.economy.wallet.balance >= this.targetMoney;

        console.log('==========================================');
        console.log(`  目标资产：$${this.targetMoney} | 最终余额：$${this.economy.wallet.balance.toFixed(2)} | ${won ? '胜利' : '失败'}`);
        console.log('==========================================');

        this._showRecap(won);
    }

    private _showRecap(won: boolean): void {
        const canvas = this.node.parent;
        if (!canvas) return;

        const recapNode = new Node('RecapPanel');
        recapNode.layer = Layers.Enum.UI_2D;
        const recap = recapNode.addComponent(RecapPanel);
        canvas.addChild(recapNode);
        recapNode.setPosition(0, 0, 0);
        recap.show(won, this.economy.wallet, this.targetMoney, this.currentDay, this.maxDays);
    }

    togglePause(): void {
        this.isPaused = !this.isPaused;
    }

    private _onKeyDown(event: EventKeyboard): void {
        if (!this.economy || !this.wagonMgr) return;
        switch (event.keyCode) {
            case KeyCode.KEY_B:
                this.economy.buySilo();
                break;
            case KeyCode.KEY_C:
                this.wagonMgr.buyWagonCapacityUpgrade(this.economy);
                break;
            case KeyCode.KEY_V:
                this.wagonMgr.buyWagonSpeedUpgrade(this.economy);
                break;
            case KeyCode.KEY_D:
                this.pipeMgr.upgradeDrillSpeed(this.economy);
                break;
            case KeyCode.KEY_G:
                this.pipeMgr.sellGas(this.economy);
                break;
            case KeyCode.KEY_L:
                this.economy.borrowLoan();
                break;
            case KeyCode.KEY_R:
                this.economy.repayLoan();
                break;
            case KeyCode.DIGIT_1:
                this.wagonMgr.dispatchSell('left', this.economy);
                break;
            case KeyCode.DIGIT_2:
                this.wagonMgr.dispatchSell('right', this.economy);
                break;
        }
    }
}
