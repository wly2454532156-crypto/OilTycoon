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

    private readonly wagonCount = 1;
    private wagonCapacity = 20;
    private wagonSpeed = 10;
    private readonly companyDistance = 100;

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
            if (economy.surfaceBuffer <= 0) break;

            wagon.targetSide = side;
            wagon.currentLoad = Math.min(wagon.capacity, economy.surfaceBuffer);
            economy.surfaceBuffer -= wagon.currentLoad;
            wagon.state = WagonState.TO_COMPANY;
        }
    }

    private _updateIdle(wagon: Wagon, economy: EconomyManager, market: MarketManager): void {
        // 手动卖油：空闲马车不再自动出发，等待 dispatchSell 指令
    }

    private _updateToCompany(wagon: Wagon): void {
        const targetX = wagon.targetSide === 'left' ? -this.companyDistance : this.companyDistance;
        if (this._moveToward(wagon, targetX)) {
            wagon.state = WagonState.SELLING;
        }
    }

    private _updateSelling(wagon: Wagon, economy: EconomyManager, market: MarketManager): void {
        const price = wagon.targetSide === 'left' ? market.leftCompanyPrice : market.rightCompanyPrice;
        economy.sellOil(wagon.currentLoad, price);
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
