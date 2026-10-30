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

    // 贷款（Phase 12a）：借 $500 加速扩张，0.1%/tick 计息，未还债务结算时从余额扣除
    debt = 0;
    private readonly loanUnitAmount = 500;
    private readonly maxDebt = 1000;
    private readonly loanInterestPerTick = 0.001;

    // 炼油厂（Phase 11b）：把油精炼成 petrol 即时卖出（petrol 更值钱）
    refineryOwned = false;
    private readonly refineryRate = 3;   // 每 tick 精炼 oil 量
    private readonly petrolPrice = 3;     // petrol 售价（高于油 ~$1.3）

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

    // 炼油厂：一次性购买，之后每 tick 把油精炼成 petrol 即时卖出
    buyRefinery(): boolean {
        if (this.refineryOwned) return false;
        const price = getToolDef(ToolType.Refinery).price;
        if (!this.canAfford(price)) return false;
        this.payCost(price);
        this.refineryOwned = true;
        return true;
    }

    // 每 tick：炼油并即时卖出 petrol（收益高于直接卖油）
    tickRefinery(): number {
        if (!this.refineryOwned || this.surfaceBuffer <= 0) return 0;
        const refined = Math.min(this.refineryRate, this.surfaceBuffer);
        this.surfaceBuffer -= refined;
        const revenue = refined * this.petrolPrice;
        this.addRevenue(revenue);
        return revenue;
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

    borrowLoan(): boolean {
        if (this.debt >= this.maxDebt) return false;
        this.wallet.balance += this.loanUnitAmount;
        this.debt += this.loanUnitAmount;
        return true;
    }

    repayLoan(): number {
        const pay = Math.min(this.wallet.balance, this.debt);
        this.wallet.balance -= pay;
        this.debt -= pay;
        return pay;
    }

    applyLoanInterest(): void {
        if (this.debt > 0) {
            this.debt *= 1 + this.loanInterestPerTick;
        }
    }

    settleDebt(): number {
        const d = this.debt;
        this.wallet.balance -= d;
        this.debt = 0;
        return d;
    }
}
