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
    bufferCapacity = 50;
    private readonly spillageRate = 10;

    readonly rigCost = 350;
    readonly siloCost = 250;
    private readonly siloCapacityBonus = 50;

    buyRig(): boolean {
        if (this.wallet.balance < this.rigCost) return false;
        this.payCost(this.rigCost);
        return true;
    }

    buySilo(): boolean {
        if (this.wallet.balance < this.siloCost) return false;
        this.payCost(this.siloCost);
        this.bufferCapacity += this.siloCapacityBonus;
        return true;
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

        const penalty = spilled * this.spillageRate;
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
}
