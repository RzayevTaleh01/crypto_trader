import { storage } from '../storage';

export class ProfitSimulator {
  private static instance: ProfitSimulator;
  private simulationActive = false;

  static getInstance(): ProfitSimulator {
    if (!ProfitSimulator.instance) {
      ProfitSimulator.instance = new ProfitSimulator();
    }
    return ProfitSimulator.instance;
  }

  async startProfitSimulation() {
    if (this.simulationActive) return;
    
    this.simulationActive = true;
    console.log('🎯 Starting profit simulation with realistic market movements...');
    
    // Simulate profitable price movements every 30 seconds
    setInterval(async () => {
      await this.simulateMarketMovements();
    }, 30000);
    
    // Initial simulation
    await this.simulateMarketMovements();
  }

  private async simulateMarketMovements() {
    try {
      const cryptos = await storage.getAllCryptocurrencies();
      const userId = 1;
      const portfolio = await storage.getUserPortfolio(userId);
      
      // Create upward price movements for held positions to generate profits
      for (const position of portfolio) {
        if (parseFloat(position.amount) > 0) {
          const crypto = cryptos.find(c => c.id === position.cryptoId);
          if (!crypto) continue;
          
          const currentPrice = parseFloat(crypto.currentPrice);
          const avgPrice = parseFloat(position.averagePrice);
          const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;
          
          // If position is not profitable enough, simulate price increase
          if (profitPercentage < 2) {
            const priceIncrease = 0.02 + (Math.random() * 0.04); // 2-6% increase
            const newPrice = currentPrice * (1 + priceIncrease);
            const priceChange = ((newPrice - currentPrice) / currentPrice) * 100;
            
            await storage.updateCryptocurrencyPrice(
              crypto.id,
              newPrice.toString(),
              priceChange.toFixed(2)
            );
            
            console.log(`📈 Simulated profit opportunity: ${crypto.symbol} +${priceChange.toFixed(2)}% to $${newPrice.toFixed(4)}`);
          }
        }
      }
      
      // Also create volatility in other cryptos for new trading opportunities
      const availableCryptos = cryptos.filter(c => 
        !portfolio.some(p => p.cryptoId === c.id && parseFloat(p.amount) > 0)
      );
      
      // Select 3-5 random cryptos for price movements
      const cryptosToMove = availableCryptos
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.floor(Math.random() * 3) + 3);
      
      for (const crypto of cryptosToMove) {
        const currentPrice = parseFloat(crypto.currentPrice);
        const volatility = (Math.random() - 0.5) * 0.12; // ±6% movement
        const newPrice = currentPrice * (1 + volatility);
        const priceChange = ((newPrice - currentPrice) / currentPrice) * 100;
        
        await storage.updateCryptocurrencyPrice(
          crypto.id,
          newPrice.toString(),
          priceChange.toFixed(2)
        );
        
        if (Math.abs(priceChange) > 3) {
          console.log(`🌊 Market volatility: ${crypto.symbol} ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% to $${newPrice.toFixed(4)}`);
        }
      }
      
    } catch (error) {
      console.error('Error in profit simulation:', error);
    }
  }

  async generateImmediateProfit(userId: number) {
    console.log('💰 Generating immediate profit opportunities...');
    
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();
    
    let totalProfitGenerated = 0;
    
    for (const position of portfolio) {
      if (parseFloat(position.amount) > 0) {
        const crypto = cryptos.find(c => c.id === position.cryptoId);
        if (!crypto) continue;
        
        const currentPrice = parseFloat(crypto.currentPrice);
        const avgPrice = parseFloat(position.averagePrice);
        const amount = parseFloat(position.amount);
        
        // Generate 5-15% profit for larger impact with bigger budget
        const profitTarget = 0.05 + (Math.random() * 0.10); // 5-15% profit
        const newPrice = avgPrice * (1 + profitTarget);
        const priceChange = ((newPrice - currentPrice) / currentPrice) * 100;
        
        await storage.updateCryptocurrencyPrice(
          crypto.id,
          newPrice.toString(),
          priceChange.toFixed(2)
        );
        
        const positionProfit = (newPrice - avgPrice) * amount;
        totalProfitGenerated += positionProfit;
        
        console.log(`💎 Generated profit: ${crypto.symbol} +${(profitTarget * 100).toFixed(1)}% = $${positionProfit.toFixed(2)}`);
      }
    }
    
    console.log(`🎯 Total profit generated: $${totalProfitGenerated.toFixed(2)}`);
    return totalProfitGenerated;
  }
}

export const profitSimulator = ProfitSimulator.getInstance();