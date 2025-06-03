import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

export class SmartTradingEngine {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeSmartTrading(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    
    console.log(`💡 Smart Trading Analysis - Balance: $${balance.toFixed(2)}`);

    // Step 1: Sell profitable positions
    await this.sellProfitablePositions(userId);
    
    // Step 2: Buy undervalued cryptocurrencies
    await this.buyUndervaluedCryptos(userId, cryptos, balance);
  }

  private async sellProfitablePositions(userId: number): Promise<void> {
    const portfolioItems = await storage.getUserPortfolio(userId);
    
    for (const item of portfolioItems) {
      const crypto = await storage.getCryptocurrency(item.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(item.averagePrice);
      const amount = parseFloat(item.amount);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

      // Only sell if genuinely profitable (minimum 1% profit)
      if (profitPercentage > 1) {
        const sellAmount = amount * 0.5; // Sell 50% of profitable position
        const totalValue = sellAmount * currentPrice;
        const profit = (currentPrice - avgPrice) * sellAmount;

        console.log(`💰 PROFITABLE SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} for $${totalValue.toFixed(2)} (Profit: $${profit.toFixed(2)})`);

        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'sell',
          amount: sellAmount.toString(),
          price: currentPrice.toString(),
          total: totalValue.toString(),
          isBot: true
        };

        await storage.createTrade(tradeData);
        await this.updatePortfolioAfterSell(userId, crypto.id, sellAmount);
        
        // Update balance with profit
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'sell',
              symbol: crypto.symbol,
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(2),
              total: totalValue.toFixed(2),
              strategy: `Profit taking: +${profitPercentage.toFixed(2)}%`,
              profit: profit.toFixed(2)
            }
          });
        }
      }
    }
  }

  private async buyUndervaluedCryptos(userId: number, cryptos: any[], currentBalance: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    if (balance < 50) return; // Need minimum $50 to trade

    // Find cryptocurrencies with strong downward momentum (buying opportunity)
    const buyOpportunities = cryptos
      .filter(crypto => {
        const priceChange = parseFloat(crypto.priceChange24h);
        return priceChange < -3; // Look for 3%+ drops
      })
      .sort((a, b) => parseFloat(a.priceChange24h) - parseFloat(b.priceChange24h))
      .slice(0, 3); // Top 3 biggest drops

    for (const crypto of buyOpportunities) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      
      // Check if we already have a position
      const existingPosition = await storage.getPortfolioItem(userId, crypto.id);
      const maxInvestment = balance * 0.15; // Maximum 15% of balance per crypto
      const currentInvestment = existingPosition ? parseFloat(existingPosition.totalInvested) : 0;
      
      if (currentInvestment < maxInvestment && balance > 50) {
        const investAmount = Math.min(maxInvestment - currentInvestment, balance * 0.1);
        const quantity = investAmount / currentPrice;

        console.log(`📈 BUY OPPORTUNITY: ${quantity.toFixed(6)} ${crypto.symbol} for $${investAmount.toFixed(2)} (${priceChange.toFixed(2)}% drop)`);

        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'buy',
          amount: quantity.toString(),
          price: currentPrice.toString(),
          total: investAmount.toString(),
          isBot: true
        };

        await storage.createTrade(tradeData);
        await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);
        
        // Update balance
        const newBalance = balance - investAmount;
        await storage.updateUserBalance(userId, newBalance.toString());

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'buy',
              symbol: crypto.symbol,
              amount: quantity.toFixed(6),
              price: currentPrice.toFixed(2),
              total: investAmount.toFixed(2),
              strategy: `Value buy: ${priceChange.toFixed(2)}% dip`,
              profit: '0.00'
            }
          });
        }

        // Get updated balance for next iteration
        const updatedUser = await storage.getUser(userId);
        if (updatedUser) {
          const updatedBalance = parseFloat(updatedUser.balance);
          if (updatedBalance < 50) break; // Stop if balance too low
        }
      }
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number): Promise<void> {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const newAmount = parseFloat(existing.amount) + quantity;
      const newTotal = parseFloat(existing.totalInvested) + (quantity * price);
      const newAvgPrice = newTotal / newAmount;
      
      await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), newAvgPrice.toString(), newTotal.toString());
    } else {
      await storage.createPortfolioItem({
        userId,
        cryptoId,
        amount: quantity.toString(),
        averagePrice: price.toString(),
        totalInvested: (quantity * price).toString()
      });
    }
  }

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number): Promise<void> {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - soldAmount);
      
      if (newAmount < 0.001) {
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        const sellRatio = soldAmount / currentAmount;
        const currentTotal = parseFloat(existing.totalInvested);
        const newTotal = currentTotal * (1 - sellRatio);
        
        await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), existing.averagePrice, newTotal.toString());
      }
    }
  }
}

export const smartTradingEngine = new SmartTradingEngine();