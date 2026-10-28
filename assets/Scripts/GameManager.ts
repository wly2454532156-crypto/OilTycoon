import { _decorator, Component, input, Input, EventKeyboard, KeyCode } from 'cc';
import { GridManager } from './Core/GridManager';
import { PipeNetworkManager } from './Core/PipeNetworkManager';
import { MarketManager } from './Economy/MarketManager';
import { EconomyManager } from './Economy/EconomyManager';
import { WagonManager } from './Economy/WagonManager';
import { GridRenderer } from './View/GridRenderer';
import { PipeController } from './View/PipeController';
import { UIPanel } from './View/UIPanel';
import { WagonRenderer } from './View/WagonRenderer';
import { ToolPanel } from './View/ToolPanel';

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
    private targetMoney = 2000;
    private isGameOver = false;

    onLoad(): void {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    start(): void {
        console.log('🎮 操作：底部目录点选设施/工具；键盘 B=Silo  C=马车容量  V=马车速度  1=卖左  2=卖右');

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

        // 井架改为玩家自由选址（见 PipeController.onTouchStart），此处不再自动放置
        if (this.gridRenderer) {
            this.gridRenderer.renderGrid(this.gridMgr, this.pipeMgr.rigX);
        }
        if (this.pipeController) {
            this.pipeController.init(this.gridMgr, this.pipeMgr, this.economy, this.gridRenderer);
        }

        if (this.toolPanel) {
            this.toolPanel.init(this.economy, this.wagonMgr, this.pipeMgr, this.pipeController);
        }
    }

    update(deltaTime: number): void {
        // 游戏结束则冻结整个模拟
        if (this.isGameOver) return;

        // 每帧必须执行（在 Tick 循环之外）：钻头时间平滑流逝
        const drillCompleted = this.pipeMgr.updateDrills(deltaTime, this.gridMgr);
        if (drillCompleted) {
            // 有管道完工：刷新管道颜色 + 刷新刚挖通地块周围的迷雾
            if (this.pipeController) {
                this.pipeController.renderPipes();
            }
            if (this.gridRenderer) {
                this.gridRenderer.renderGrid(this.gridMgr, this.pipeMgr.rigX);
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
            `[Tick ${this.tickCounter}] 油价 L=$${this.market.leftCompanyPrice.toFixed(2)} R=$${this.market.rightCompanyPrice.toFixed(2)} | 抽出 ${extracted} | 气体 ${this.pipeMgr.gasLevel}${this.pipeMgr.isBurning ? ' 🔥燃烧中' : ''} | 库存 ${this.economy.surfaceBuffer} | 余额 $${this.economy.wallet.balance.toFixed(2)} | 马车活跃 ${this.wagonMgr.activeWagonCount}/${this.wagonMgr.wagons.length}`,
        );

        if (this.uiPanel) {
            this.uiPanel.updateUI(this.economy.wallet, this.market, this.economy.surfaceBuffer, this.currentDay, this.maxDays, this.economy.bufferCapacity);
        }
        if (this.toolPanel) {
            this.toolPanel.refresh();
        }
        if (this.wagonRenderer) {
            this.wagonRenderer.renderWagons(this.wagonMgr);
        }
    }

    private _triggerGameOver(): void {
        this.isGameOver = true;
        const won = this.economy.wallet.balance >= this.targetMoney;

        console.log('==========================================');
        console.log('          《游戏结算 Recap》');
        console.log(`  目标资产：$${this.targetMoney}`);
        console.log(`  最终余额：$${this.economy.wallet.balance.toFixed(2)}`);
        console.log(won ? '  🎉 结果：胜利！' : '  💀 结果：失败');
        console.log('==========================================');

        // 在日期标签上显示胜负，避免静默冻结让人误以为卡死
        if (this.uiPanel) {
            this.uiPanel.showGameOver(won);
        }
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
            case KeyCode.DIGIT_1:
                this.wagonMgr.dispatchSell('left', this.economy);
                break;
            case KeyCode.DIGIT_2:
                this.wagonMgr.dispatchSell('right', this.economy);
                break;
        }
    }
}
