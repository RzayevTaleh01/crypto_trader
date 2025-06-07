
import { storage } from '../storage';
import { emaRsiStrategy } from './emaRsiStrategy';

interface BacktestConfig {
  startBalance: number;
  startDate: string;
  endDate: string;
  strategy: string;
  riskLevel: number;
}

interface BacktestResult {
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  trades: any[];
  dailyReturns: any[];
}

export class BacktestService {
  private mockPortfolio: any[] = [];
  private mockBalance: number = 0;
  private mockProfitBalance: number = 0;
  private trades: any[] = [];
  private dailyBalances: any[] = [];

  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log('🚀 Starting Backtest Simulation...');
    console.log(`💰 Initial Balance: $${config.startBalance}`);
    console.log(`📅 Period: ${config.startDate} to ${config.endDate}`);
    console.log(`🎯 Strategy: ${config.strategy}`);

    // Initialize mock state
    this.mockBalance = config.startBalance;
    this.mockProfitBalance = 0;
    this.mockPortfolio = [];
    this.trades = [];
    this.dailyBalances = [];

    // Generate historical market data for simulation
    const historicalData = await this.generateHistoricalData(config.startDate, config.endDate);
    
    let currentDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    let dayCounter = 0;

    // Simulate trading day by day
    while (currentDate <= endDate) {
      const dayData = historicalData[dayCounter % historicalData.length];
      
      // Update mock crypto prices
      await this.updateMockCryptoPrices(dayData, currentDate);
      
      // Execute trading strategy
      await this.executeStrategyBacktest(config);
      
      // Record daily performance
      this.recordDailyPerformance(currentDate);
      
      currentDate.setDate(currentDate.getDate() + 1);
      dayCounter++;
      
      // Add some delay to show progress
      if (dayCounter % 10 === 0) {
        console.log(`📊 Processed ${dayCounter} days... Current Balance: $${this.getTotalPortfolioValue().toFixed(2)}`);
      }
    }

    return this.calculateBacktestResults(config);
  }

  private async generateHistoricalData(startDate: string, endDate: string): Promise<any[]> {
    // Generate realistic crypto market data
    const cryptos = ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOGE', 'LINK', 'UNI', 'AVAX', 'DOT'];
    const data = [];

    for (let i = 0; i < 100; i++) {
      const dayData = cryptos.map(symbol => ({
        symbol,
        name: this.getCryptoName(symbol),
        currentPrice: this.generatePrice(symbol),
        priceChange24h: (Math.random() - 0.5) * 20, // -10% to +10%
        volume24h: Math.random() * 10000000 + 1000000
      }));
      data.push(dayData);
    }

    return data;
  }

  private generatePrice(symbol: string): number {
    const basePrices: { [key: string]: number } = {
      'BTC': 45000 + Math.random() * 20000,
      'ETH': 2500 + Math.random() * 1500,
      'BNB': 300 + Math.random() * 200,
      'ADA': 0.5 + Math.random() * 0.8,
      'SOL': 80 + Math.random() * 60,
      'DOGE': 0.08 + Math.random() * 0.15,
      'LINK': 12 + Math.random() * 10,
      'UNI': 6 + Math.random() * 8,
      'AVAX': 25 + Math.random() * 20,
      'DOT': 8 + Math.random() * 6
    };
    
    return basePrices[symbol] || (Math.random() * 100 + 1);
  }

  private getCryptoName(symbol: string): string {
    const names: { [key: string]: string } = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum', 
      'BNB': 'Binance Coin',
      'ADA': 'Cardano',
      'SOL': 'Solana',
      'DOGE': 'Dogecoin',
      'LINK': 'Chainlink',
      'UNI': 'Uniswap',
      'AVAX': 'Avalanche',
      'DOT': 'Polkadot'
    };
    return names[symbol] || symbol;
  }

  private async updateMockCryptoPrices(dayData: any[], currentDate: Date) {
    // This simulates updating crypto prices in the database
    for (const crypto of dayData) {
      // In real backtest, we would use historical prices from database
      // For now, we generate realistic price movements
    }
  }

  private async executeStrategyBacktest(config: BacktestConfig) {
    // Simulate EMA-RSI strategy execution
    if (config.strategy === 'ema_rsi') {
      await this.simulateEmaRsiStrategy(config.riskLevel);
    }
  }

  private async simulateEmaRsiStrategy(riskLevel: number) {
    // Check for sell signals first
    for (let i = this.mockPortfolio.length - 1; i >= 0; i--) {
      const position = this.mockPortfolio[i];
      const shouldSell = this.shouldSellPosition(position);
      
      if (shouldSell) {
        await this.executeMockSell(position);
        this.mockPortfolio.splice(i, 1);
      }
    }

    // Check for buy signals
    if (this.mockBalance > 1.0 && this.mockPortfolio.length < 5) {
      const buyOpportunity = this.findBuyOpportunity(riskLevel);
      if (buyOpportunity) {
        await this.executeMockBuy(buyOpportunity, riskLevel);
      }
    }
  }

  private shouldSellPosition(position: any): boolean {
    // Simulate sell conditions based on profit/loss
    const currentPrice = this.generatePrice(position.symbol);
    const avgPrice = position.averagePrice;
    const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
    
    // Sell conditions
    if (profitPercent > 8) return true; // Take profit at 8%
    if (profitPercent < -5) return true; // Stop loss at -5%
    if (Math.random() < 0.1) return true; // Random technical sell signal
    
    return false;
  }

  private findBuyOpportunity(riskLevel: number): any | null {
    // Simulate finding a good buy opportunity
    if (Math.random() < 0.3) { // 30% chance to find opportunity each day
      const symbols = ['BTC', 'ETH', 'BNB', 'ADA', 'SOL'];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      
      return {
        symbol,
        name: this.getCryptoName(symbol),
        currentPrice: this.generatePrice(symbol),
        signal: 'STRONG_BUY',
        confidence: 0.7 + Math.random() * 0.3
      };
    }
    return null;
  }

  private async executeMockBuy(opportunity: any, riskLevel: number) {
    const investmentAmount = Math.min(
      this.mockBalance * (riskLevel / 100), // Risk-based position sizing
      this.mockBalance * 0.2 // Max 20% per trade
    );
    
    if (investmentAmount < 1.0) return;

    const quantity = investmentAmount / opportunity.currentPrice;
    
    // Add to mock portfolio
    this.mockPortfolio.push({
      symbol: opportunity.symbol,
      name: opportunity.name,
      amount: quantity,
      averagePrice: opportunity.currentPrice,
      totalInvested: investmentAmount
    });

    // Update mock balance
    this.mockBalance -= investmentAmount;

    // Record trade
    this.trades.push({
      date: new Date(),
      type: 'BUY',
      symbol: opportunity.symbol,
      amount: quantity,
      price: opportunity.currentPrice,
      total: investmentAmount,
      reason: 'Backtest simulation'
    });

    console.log(`✅ BUY: ${opportunity.symbol} - $${investmentAmount.toFixed(2)} at $${opportunity.currentPrice.toFixed(4)}`);
  }

  private async executeMockSell(position: any) {
    const currentPrice = this.generatePrice(position.symbol);
    const sellValue = position.amount * currentPrice;
    const profit = sellValue - position.totalInvested;
    
    // Update balances based on our profit/loss logic
    if (profit > 0) {
      this.mockBalance += position.totalInvested; // Return original investment
      this.mockProfitBalance += profit; // Add profit to profit balance
    } else {
      this.mockBalance += sellValue; // Add full sell value (includes loss)
    }

    // Record trade
    this.trades.push({
      date: new Date(),
      type: 'SELL',
      symbol: position.symbol,
      amount: position.amount,
      price: currentPrice,
      total: sellValue,
      profit: profit,
      profitPercent: (profit / position.totalInvested) * 100,
      reason: 'Backtest simulation'
    });

    console.log(`🔴 SELL: ${position.symbol} - $${sellValue.toFixed(2)} (${profit > 0 ? '+' : ''}$${profit.toFixed(2)})`);
  }

  private recordDailyPerformance(date: Date) {
    const totalValue = this.getTotalPortfolioValue();
    this.dailyBalances.push({
      date: date.toISOString(),
      mainBalance: this.mockBalance,
      profitBalance: this.mockProfitBalance,
      portfolioValue: totalValue - this.mockBalance - this.mockProfitBalance,
      totalValue: totalValue
    });
  }

  private getTotalPortfolioValue(): number {
    let portfolioValue = 0;
    for (const position of this.mockPortfolio) {
      const currentPrice = this.generatePrice(position.symbol);
      portfolioValue += position.amount * currentPrice;
    }
    return this.mockBalance + this.mockProfitBalance + portfolioValue;
  }

  private calculateBacktestResults(config: BacktestConfig): BacktestResult {
    const finalBalance = this.getTotalPortfolioValue();
    const totalReturn = finalBalance - config.startBalance;
    const totalReturnPercent = (totalReturn / config.startBalance) * 100;

    const buyTrades = this.trades.filter(t => t.type === 'BUY');
    const sellTrades = this.trades.filter(t => t.type === 'SELL');
    const winningTrades = sellTrades.filter(t => t.profit > 0).length;
    const losingTrades = sellTrades.filter(t => t.profit <= 0).length;
    const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = config.startBalance;
    for (const daily of this.dailyBalances) {
      if (daily.totalValue > peak) peak = daily.totalValue;
      const drawdown = ((peak - daily.totalValue) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Calculate profit factor
    const totalProfit = sellTrades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(sellTrades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0;

    // Simple Sharpe ratio calculation
    const returns = this.dailyBalances.map((daily, i) => {
      if (i === 0) return 0;
      return ((daily.totalValue - this.dailyBalances[i-1].totalValue) / this.dailyBalances[i-1].totalValue) * 100;
    });
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnStdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;

    return {
      initialBalance: config.startBalance,
      finalBalance: finalBalance,
      totalReturn: totalReturn,
      totalReturnPercent: totalReturnPercent,
      totalTrades: this.trades.length,
      winningTrades: winningTrades,
      losingTrades: losingTrades,
      winRate: winRate,
      maxDrawdown: maxDrawdown,
      profitFactor: profitFactor,
      sharpeRatio: sharpeRatio,
      trades: this.trades,
      dailyReturns: this.dailyBalances
    };
  }
}

export const backtestService = new BacktestService();
