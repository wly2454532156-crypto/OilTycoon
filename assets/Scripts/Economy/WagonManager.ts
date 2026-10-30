import { EconomyManager } from './EconomyManager';
import { MarketManager } from './MarketManager';
import { ToolType, getToolDef } from './ToolCatalog';

export enum WagonState {
    IDLE = 0,
    TO_COMPANY = 1,
    SELLING = 2,
    TO_SILO = 3,
}

export interface Wagon {
    id: number;
    state: WagonState;
    capacity: number;
    currentLoad: number;
    speed: number;
    positionX: number;
    targetSide: 'left' | 'right';
}

export class WagonManager {
    readonly wagons: Wagon[] = [];

    // 自动卖油：true=空闲马车自动卖到高价侧；false=装满后停下等派车
    autoSell = true;

    private readonly wagonCount = 1;
    private wagonCapacity = 30;
    private wagonSpeed = 75;
    private companyDistance = 100;

    // 升级成本与效果（后续接入科技树 UI）
    private readonly capacityUpgradeCost = 100;
    private readonly capacityUpgradeAmount = 10;
    private readonly speedUpgradeCost = 100;
    private readonly speedUpgradeAmount = 5;

    constructor() {
        for (let i = 0; i < this.wagonCount; i++) {
            this.wagons.push(this._createWagon(i));
        }
    }

    buyWagon(economy: EconomyManager): boolean {
        const price = getToolDef(ToolType.Wagon).price;
        if (economy.wallet.balance < price) return false;
        economy.payCost(price);
        this.wagons.push(this._createWagon(this.wagons.length));
        return true;
    }

    // 升级马车容量：对所有现有马车生效
    buyWagonCapacityUpgrade(economy: EconomyManager): boolean {
        if (economy.wallet.balance < this.capacityUpgradeCost) return false;
        economy.payCost(this.capacityUpgradeCost);
        this.wagonCapacity += this.capacityUpgradeAmount;
        for (const w of this.wagons) w.capacity = this.wagonCapacity;
        return true;
    }

    // 升级马车速度：对所有现有马车生效
    buyWagonSpeedUpgrade(economy: EconomyManager): boolean {
        if (economy.wallet.balance < this.speedUpgradeCost) return false;
        economy.payCost(this.speedUpgradeCost);
        this.wagonSpeed += this.speedUpgradeAmount;
        for (const w of this.wagons) w.speed = this.wagonSpeed;
        return true;
    }

    private _createWagon(id: number): Wagon {
        return {
            id,
            state: WagonState.IDLE,
            capacity: this.wagonCapacity,
            currentLoad: 0,
            speed: this.wagonSpeed,
            positionX: 0,
            targetSide: 'left',
        };
    }

    get activeWagonCount(): number {
        let count = 0;
        for (const w of this.wagons) {
            if (w.state !== WagonState.IDLE) count++;
        }
        return count;
    }

    updateWagons(economy: EconomyManager, market: MarketManager): void {
        for (const wagon of this.wagons) {
            switch (wagon.state) {
                case WagonState.IDLE:
                    this._updateIdle(wagon, economy, market);
                    break;
                case WagonState.TO_COMPANY:
                    this._updateToCompany(wagon);
                    break;
                case WagonState.SELLING:
                    this._updateSelling(wagon, economy, market);
                    break;
                case WagonState.TO_SILO:
                    this._updateToSilo(wagon);
                    break;
            }
        }
    }

    dispatchSell(side: 'left' | 'right', economy: EconomyManager): void {
        for (const wagon of this.wagons) {
            if (wagon.state !== WagonState.IDLE) continue;
            // 空车先装满，已装满的直接发车
            if (wagon.currentLoad <= 0) {
                if (economy.surfaceBuffer <= 0) break;
                wagon.currentLoad = Math.min(wagon.capacity, economy.surfaceBuffer);
                economy.surfaceBuffer -= wagon.currentLoad;
            }
            wagon.targetSide = side;
            wagon.state = WagonState.TO_COMPANY;
        }
    }

    // 马车往返距离（左右公司到井区的距离），由 GameManager 按地图宽设置
    setCompanyDistance(d: number): void {
        this.companyDistance = d;
    }

    toggleAutoSell(): void {
        this.autoSell = !this.autoSell;
    }

    private _updateIdle(wagon: Wagon, economy: EconomyManager, market: MarketManager): void {
        if (economy.surfaceBuffer <= 0) return;
        if (!this.autoSell) {
            // 手动模式：只装满、不发车，停在原地等派车
            if (wagon.currentLoad >= wagon.capacity) return;
            const load = Math.min(wagon.capacity - wagon.currentLoad, economy.surfaceBuffer);
            wagon.currentLoad += load;
            economy.surfaceBuffer -= load;
            return;
        }
        // 自动模式：装满并自动发车到高价侧
        const side = market.leftCompanyPrice >= market.rightCompanyPrice ? 'left' : 'right';
        wagon.targetSide = side;
        wagon.currentLoad = Math.min(wagon.capacity, economy.surfaceBuffer);
        economy.surfaceBuffer -= wagon.currentLoad;
        wagon.state = WagonState.TO_COMPANY;
    }

    private _updateToCompany(wagon: Wagon): void {
        const targetX = wagon.targetSide === 'left' ? -this.companyDistance : this.companyDistance;
        if (this._moveToward(wagon, targetX)) {
            wagon.state = WagonState.SELLING;
        }
    }

    private _updateSelling(wagon: Wagon, economy: EconomyManager, market: MarketManager): void {
        const side = wagon.targetSide;
        const price = side === 'left' ? market.leftCompanyPrice : market.rightCompanyPrice;
        economy.sellOil(wagon.currentLoad, price);
        market.registerSell(side, wagon.currentLoad, price);
        wagon.currentLoad = 0;
        wagon.state = WagonState.TO_SILO;
    }

    private _updateToSilo(wagon: Wagon): void {
        if (this._moveToward(wagon, 0)) {
            wagon.state = WagonState.IDLE;
        }
    }

    private _moveToward(wagon: Wagon, targetX: number): boolean {
        const distance = targetX - wagon.positionX;
        if (Math.abs(distance) <= wagon.speed) {
            wagon.positionX = targetX;
            return true;
        }
        wagon.positionX += Math.sign(distance) * wagon.speed;
        return false;
    }
}
