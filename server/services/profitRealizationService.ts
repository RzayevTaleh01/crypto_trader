import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

export class ProfitRealizationService {
  async sellAllProfitablePositions(userId: number) {
    const portfolioItems = await storage.getUserPortfolio(userId);
    const trades = [];
    let totalProfit = 0;
    let totalRevenue = 0;

    console.log(`💰 STARTING PROFIT REALIZATION FOR USER ${userId}`);

    for (const item of portfolioItems) {
      const crypto = await storage.getCryptocurrency(item.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(item.averagePrice);
      const amount = parseFloat(item.amount);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

      console.log(`📊 ${crypto.symbol}: Current: $${currentPrice}, Avg: $${avgPrice}, P&L: ${profitPercentage.toFixed(2)}%`);

      // Sell if profitable (any positive gain)
      if (profitPercentage > -0.1) { // Sell positions with minimal losses too
        const sellAmount = amount;
        const totalValue = sellAmount * currentPrice;
        const profit = (currentPrice - avgPrice) * sellAmount;

        console.log(`💸 SELLING PROFITABLE: ${sellAmount.toFixed(6)} ${crypto.symbol} for $${totalValue.toFixed(2)} (Profit: $${profit.toFixed(2)})`);

        const tradeData: InsertTrade = {
          userId,
          cryptoId: item.cryptoId,
          type: 'sell',
          amount: sellAmount.toString(),
          price: currentPrice.toString(),
          total: totalValue.toString(),
          isBot: false
        };

        const trade = await storage.createTrade(tradeData);
        await this.updatePortfolioAfterSell(userId, item.cryptoId, sellAmount);

        // Update balance immediately
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
          console.log(`💳 Balance updated: $${newBalance.toFixed(2)}`);
        }

        trades.push(trade);
        totalProfit += profit;
        totalRevenue += totalValue;
      }
    }

    console.log(`✅ PROFIT REALIZATION COMPLETE:`);
    console.log(`📈 Positions sold: ${trades.length}`);
    console.log(`💰 Total profit: $${totalProfit.toFixed(2)}`);
    console.log(`💵 Total revenue: $${totalRevenue.toFixed(2)}`);

    return {
      trades,
      totalProfit: totalProfit.toFixed(2),
      totalRevenue: totalRevenue.toFixed(2),
      positionsSold: trades.length,
      message: `Successfully sold ${trades.length} profitable positions for $${totalProfit.toFixed(2)} profit`
    };
  }

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - soldAmount);
      
      if (newAmount < 0.001) {
        await storage.deletePortfolioItem(userId, cryptoId);
        console.log(`🔒 Position closed for crypto ID ${cryptoId}`);
      } else {
        const sellRatio = soldAmount / currentAmount;
        const currentTotal = parseFloat(existing.totalInvested);
        const newTotal = currentTotal * (1 - sellRatio);
        
        await storage.updatePortfolioItem(
          userId, 
          cryptoId, 
          newAmount.toString(), 
          existing.averagePrice, 
          newTotal.toString()
        );
      }
    }
  }
}

export const profitRealizationService = new ProfitRealizationService();