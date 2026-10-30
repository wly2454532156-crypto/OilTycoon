export interface MarketState {
    leftCompanyPrice: number;
    rightCompanyPrice: number;
    priceTickCounter: number;
}

export class MarketManager implements MarketState {
    leftCompanyPrice = 1.0;
    rightCompanyPrice = 1.0;
    priceTickCounter = 0;

    private readonly basePrice = 1.3;
    private readonly amplitude = 0.5;
    private readonly omega = 0.1;
    private readonly randomAmplitude = 0.1;
    private readonly leftPhase = 0;
    private readonly rightPhase = Math.PI / 2;

    // 供需反馈（SDD 4.3）：卖出越多，该侧价格越被压低，随时间缓慢恢复
    private leftSellPressure = 0;
    private rightSellPressure = 0;
    // 累计卖出量/营收（公司面板「已卖给它」统计用）
    leftTotalSold = 0;
    rightTotalSold = 0;
    leftTotalRevenue = 0;
    rightTotalRevenue = 0;
    private readonly sellPressurePerUnit = 0.006;
    private readonly sellPressureDecay = 0.97;
    private readonly minPriceFactor = 0.82;

    updatePrice(tickCounter: number): void {
        this.priceTickCounter = tickCounter;
        this.leftSellPressure *= this.sellPressureDecay;
        this.rightSellPressure *= this.sellPressureDecay;
        this.leftCompanyPrice = this._compute(tickCounter, this.leftPhase, this.leftSellPressure);
        this.rightCompanyPrice = this._compute(tickCounter, this.rightPhase, this.rightSellPressure);
    }

    registerSell(side: 'left' | 'right', volume: number, price: number): void {
        const delta = volume * this.sellPressurePerUnit;
        if (side === 'left') {
            this.leftSellPressure += delta;
            this.leftTotalSold += volume;
            this.leftTotalRevenue += volume * price;
        } else {
            this.rightSellPressure += delta;
            this.rightTotalSold += volume;
            this.rightTotalRevenue += volume * price;
        }
    }

    private _compute(t: number, phase: number, sellPressure: number): number {
        const wave = this.amplitude * Math.sin(this.omega * t + phase);
        const noise = (Math.random() * 2 - 1) * this.randomAmplitude;
        const factor = Math.max(this.minPriceFactor, 1 - sellPressure);
        return (this.basePrice + wave + noise) * factor;
    }
}
