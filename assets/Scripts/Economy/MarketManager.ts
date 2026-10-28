export interface MarketState {
    leftCompanyPrice: number;
    rightCompanyPrice: number;
    priceTickCounter: number;
}

export class MarketManager implements MarketState {
    leftCompanyPrice = 1.0;
    rightCompanyPrice = 1.0;
    priceTickCounter = 0;

    private readonly basePrice = 1.0;
    private readonly amplitude = 0.5;
    private readonly omega = 0.1;
    private readonly randomAmplitude = 0.1;
    private readonly leftPhase = 0;
    private readonly rightPhase = Math.PI / 2;

    updatePrice(tickCounter: number): void {
        this.priceTickCounter = tickCounter;
        this.leftCompanyPrice = this._compute(tickCounter, this.leftPhase);
        this.rightCompanyPrice = this._compute(tickCounter, this.rightPhase);
    }

    private _compute(t: number, phase: number): number {
        const wave = this.amplitude * Math.sin(this.omega * t + phase);
        const noise = (Math.random() * 2 - 1) * this.randomAmplitude;
        return this.basePrice + wave + noise;
    }
}
