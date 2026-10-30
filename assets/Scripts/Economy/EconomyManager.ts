import { ToolType, getToolDef } from './ToolCatalog';

export interface WalletState {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    spillagePenalty: number;
}

export class EconomyManager {
    readonly wallet: WalletState = {
        balance: 2000,
        totalEarned: 0,
        totalSpent: 0,
        spillagePenalty: 0,
    };

    surfaceBuffer = 0;
    bufferCapacity = 500;
    private readonly spillageRate = 3;
    private readonly spillageFineInitial = 1000;
    private hasSpilledOnce = false;

    private readonly siloCapacityBonus = 500;
    private readonly superSiloCapacityBonus = 1500;

    buyRig(): boolean {
        const price = getToolDef(ToolType.Rig).price;
        if (!this.canAfford(price)) return false;
        this.payCost(price);
        return true;
    }

    buySilo(): boolean {
        const price = getToolDef(ToolType.Silo).price;
        if (!this.canAfford(price)) return false;
        this.payCost(price);
        this.bufferCapacity += this.siloCapacityBonus;
        return true;
    }

    // 超级油罐：Silo 之外的第二级储油
    buySuperSilo(): boolean {
        const price = getToolDef(ToolType.SuperSilo).price;
        if (!this.canAfford(price)) return false;
        this.payCost(price);
        this.bufferCapacity += this.superSiloCapacityBonus;
        return true;
    }

    canAfford(price: number): boolean {
        return this.wallet.balance >= price;
    }

    payCost(amount: number): void {
        this.wallet.balance -= amount;
        this.wallet.totalSpent += amount;
    }

    addOilToBuffer(amount: number): void {
        this.surfaceBuffer += amount;
    }

    checkSpillage(): number {
        if (this.surfaceBuffer <= this.bufferCapacity) return 0;

        const spilled = this.surfaceBuffer - this.bufferCapacity;
        this.surfaceBuffer = this.bufferCapacity;

        let penalty = spilled * this.spillageRate;
        if (!this.hasSpilledOnce) {
            penalty += this.spillageFineInitial;
            this.hasSpilledOnce = true;
        }
        this.wallet.balance -= penalty;
        this.wallet.spillagePenalty += penalty;
        return spilled;
    }

    sellOil(volume: number, price: number): number {
        if (volume <= 0) return 0;

        const revenue = volume * price;
        this.wallet.balance += revenue;
        this.wallet.totalEarned += revenue;
        return revenue;
    }

    addRevenue(amount: number): void {
        this.wallet.balance += amount;
        this.wallet.totalEarned += amount;
    }
}
