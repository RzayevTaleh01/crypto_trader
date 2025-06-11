import { storage } from "../storage";

class PortfolioService {
  async getUserPortfolioWithDetails(userId: number) {
    const portfolio = await storage.getUserPortfolio(userId);

    const portfolioWithDetails = portfolio.map((item: any) => {
      // Portfolio data already includes cryptocurrency details from the join
      const currentPrice = parseFloat(item.cryptocurrency?.currentPrice || "0");
      const amount = parseFloat(item.amount);
      const averagePrice = parseFloat(item.averagePrice);
      const totalInvested = parseFloat(item.totalInvested);

      // Calculate current value based on amount and current price
      const currentValue = amount * currentPrice;

      // Calculate P&L: difference between current value and total invested
      const pnl = currentValue - totalInvested;

      // Calculate P&L percentage: (current value - total invested) / total invested * 100
      const pnlPercentage = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      console.log(`💰 Profit calc: ${item.cryptocurrency?.symbol} - Current: $${currentPrice}, Amount: ${amount}, Total Invested: $${totalInvested}, Current Value: $${currentValue.toFixed(4)}, P&L: ${pnlPercentage.toFixed(2)}%`);

      return {
        ...item,
        currentValue: currentValue.toString(),
        pnl: pnl.toString(),
        pnlPercentage: pnlPercentage.toString()
      };
    });

    return portfolioWithDetails;
  }

  async getPortfolioPerformance(userId: number, hours: number = 24): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      const portfolio = await storage.getPortfolioForUser(userId);

      if (!user) {
        console.log('❌ User not found for portfolio performance');
        return [];
      }

      const currentBalance = parseFloat(user.balance || '0');
      const currentProfitBalance = parseFloat(user.profitBalance || '0');

      // Calculate current portfolio value
      let currentPortfolioValue = 0;
      for (const position of portfolio) {
        const crypto = await storage.getCryptocurrency(position.cryptoId);
        if (crypto) {
          const currentPrice = parseFloat(crypto.currentPrice);
          const amount = parseFloat(position.amount);
          currentPortfolioValue += (amount * currentPrice);
        }
      }

      // REAL TOTAL: main balance + portfolio value (düzgün hesablama)
      const realTotalValue = currentBalance + currentPortfolioValue;

      console.log(`🎯 CHART BALANCE: Main: $${currentBalance.toFixed(2)}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Kar: $${currentProfitBalance.toFixed(2)}, REAL Total: $${realTotalValue.toFixed(2)}`);

      // TARİXİ DATA YARADIM - YALNIZ REAL TRADING DATASI
      const now = new Date();
      const performanceData = [];
      
      // Əgər heç bir trade yoxdursa, sadəcə başlanğıc balansı göstər
      const userTrades = await storage.getTradesForUser(userId);
      const hasTrading = userTrades && userTrades.length > 0;
      
      if (!hasTrading) {
        // Heç bir trade yoxdursa - sadəcə düz xətt göstər
        performanceData.push({
          timestamp: now.toISOString(),
          value: parseFloat(realTotalValue.toFixed(2))
        });
      } else {
        // Trading activity varsa - tarixi chart göstər
        for (let i = hours - 1; i >= 0; i--) {
          const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
          
          // Real balansı göstər (təsadüfi dəyişikliklər olmadan)
          performanceData.push({
            timestamp: timestamp.toISOString(),
            value: parseFloat(realTotalValue.toFixed(2))
          });
        }
      }

      return performanceData;

    } catch (error) {
      console.error('❌ Portfolio performance error:', error);
      const user = await storage.getUser(userId);
      const currentBalance = parseFloat(user?.balance || '0');

      return [{
        timestamp: new Date().toISOString(),
        value: currentBalance
      }];
    }
  }

  async getPortfolioSummary(userId: number) {
    const portfolioWithDetails = await this.getUserPortfolioWithDetails(userId);
    const user = await storage.getUser(userId);

    if (!user) {
      return {
        totalValue: "0.00",
        totalInvested: "0.00",
        totalPnL: "0.00",
        totalPnLPercentage: "0.00",
        positions: 0
      };
    }

    const currentBalance = parseFloat(user.balance || '0');
    const profitBalance = parseFloat(user.profitBalance || '0');

    // Portfolio current value
    const portfolioValue = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.currentValue);
    }, 0);

    // Portfolio invested amount
    const portfolioInvested = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.totalInvested);
    }, 0);

    // Total TRADING value = main balance + current portfolio value (EXCLUDING profit balance)
    const totalTradingValue = currentBalance + portfolioValue;

    // Total invested is dynamic based on user's added balance
    const totalInvested = parseFloat(currentBalance) + portfolioInvested;

    // P&L calculation: profit balance (stored separately) + unrealized portfolio profits
    const unrealizedPnL = portfolioValue - portfolioInvested;
    const totalPnL = profitBalance + unrealizedPnL;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      totalValue: totalTradingValue.toString(), // Only trading value, not including profit balance
      totalInvested: totalInvested.toString(),
      totalPnL: totalPnL.toString(),
      totalPnLPercentage: totalPnLPercentage.toString(),
      positions: portfolioWithDetails.length
    };
  }
}

export const portfolioService = new PortfolioService();