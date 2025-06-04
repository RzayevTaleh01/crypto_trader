import { storage } from '../storage';
import { telegramService } from './telegramService';
import { binanceService } from './binanceService';
import type { InsertTrade } from '@shared/schema';

export class EmaRsiStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private tradingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  setBroadcastFunction(fn: ((data: any) => void) | null) {
    this.broadcastFn = fn;
  }

  async startContinuousTrading(userId: number): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Trading strategy already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting continuous EMA-RSI trading strategy');

    // Execute immediately
    await this.executeEmaRsiStrategy(userId);

    // Set up continuous execution every 30 seconds
    this.tradingInterval = setInterval(async () => {
      try {
        const botSettings = await storage.getBotSettings(userId);
        if (botSettings?.isActive) {
          await this.executeEmaRsiStrategy(userId);
        } else {
          this.stopContinuousTrading();
        }
      } catch (error) {
        console.error('Trading interval error:', error);
      }
    }, 90000); // 90 seconds to prevent duplicate trades
  }

  stopContinuousTrading(): void {
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
      this.tradingInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Stopped continuous trading strategy');
  }

  async executeEmaRsiStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    const portfolio = await storage.getUserPortfolio(userId);

    console.log(`🎯 EMA-RSI Strategy - Balance: $${balance.toFixed(2)}`);
    console.log(`📊 Analyzing ${cryptos.length} cryptocurrencies, ${portfolio.length} positions`);

    // Force Binance API data fetch for trading analysis
    const { binanceService } = await import('./binanceService');
    console.log('📡 Fetching real market data from Binance...');
    
    const marketData = await binanceService.getRealMarketData();
    if (!marketData) {
      console.log('🚨 Binance API unavailable - stopping bot to prevent trading without real data');
      
      // Stop the bot automatically when Binance API fails
      await storage.updateBotSettings(userId, { isActive: false });
      this.stopContinuousTrading();
      
      // Broadcast bot status update
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'botStatus',
          data: { userId, isActive: false, reason: 'Binance API unavailable' }
        });
      }
      
      console.log('🛑 Bot automatically stopped due to API failure');
      return;
    }
    
    console.log(`📊 Using real market data for ${marketData.length} cryptocurrencies`);

    // Store real-time data in database and get valid IDs
    const realTimeCryptos = [];
    for (const coin of marketData) {
      try {
        let crypto = await storage.getCryptocurrencyBySymbol(coin.symbol);
        
        if (!crypto) {
          // Create new cryptocurrency record
          crypto = await storage.createCryptocurrency({
            symbol: coin.symbol,
            name: coin.name,
            currentPrice: coin.currentPrice.toString(),
            priceChange24h: coin.priceChange24h.toString()
          });
        } else {
          // Update existing cryptocurrency with latest price
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            coin.currentPrice.toString(),
            coin.priceChange24h.toString()
          );
          crypto.currentPrice = coin.currentPrice.toString();
          crypto.priceChange24h = coin.priceChange24h.toString();
        }
        
        realTimeCryptos.push(crypto);
      } catch (error: any) {
        // Handle duplicate key constraint or other database errors
        if (error.code === '23505') {
          // Duplicate key error - try to get the existing record
          const existingCrypto = await storage.getCryptocurrencyBySymbol(coin.symbol);
          if (existingCrypto) {
            await storage.updateCryptocurrencyPrice(
              existingCrypto.id,
              coin.currentPrice.toString(),
              coin.priceChange24h.toString()
            );
            existingCrypto.currentPrice = coin.currentPrice.toString();
            existingCrypto.priceChange24h = coin.priceChange24h.toString();
            realTimeCryptos.push(existingCrypto);
          }
        } else {
          console.log(`❌ Error processing crypto ${coin.symbol}:`, error.message);
        }
      }
    }

    console.log(`💾 Stored ${realTimeCryptos.length} cryptocurrencies in database with valid IDs`);

    // Check sell signals first with real database records
    await this.checkSellSignals(userId, portfolio, realTimeCryptos);

    // Check buy signals if we have balance with real database records
    if (balance > 0.5) {
      await this.checkBuySignals(userId, realTimeCryptos, balance);
    }
  }

  private async checkSellSignals(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    console.log(`🔍 Checking sell signals for ${portfolio.length} portfolio positions`);
    
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) {
        console.log(`❌ No crypto data found for position ID: ${position.cryptoId}`);
        continue;
      }

      console.log(`🔍 Analyzing position: ${crypto.symbol} - Amount: ${position.amount}`);
      
      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;
      
      console.log(`💰 ${crypto.symbol}: Current: $${currentPrice}, Avg: $${avgPrice}, P&L: ${profitPercentage.toFixed(2)}%`);
      
      const signal = await this.analyzeSymbol(crypto);
      let shouldSell = false;
      let sellReason = '';
      
      if (signal) {
        console.log(`📊 ${crypto.symbol}: RSI=${signal.rsi}, Signal=${signal.signal}`);
        
        // Conservative sell conditions to prevent losses
        const profitDollar = currentPrice * parseFloat(position.amount) - parseFloat(position.totalInvested);
        
        // Only sell when profitable - no stop losses that create losses
        if (profitPercentage >= 5) {  // Higher profit target - 5%
          shouldSell = true;
          sellReason = `Profit target reached - ${profitPercentage.toFixed(2)}% gain`;
        } else if (profitDollar >= 0.15) {  // Higher dollar profit target - $0.15
          shouldSell = true;
          sellReason = `Dollar profit target reached - $${profitDollar.toFixed(3)} gain`;
        } else if (signal.signal === 'SELL' && profitPercentage > 0) {  // Only sell on signal if profitable
          shouldSell = true;
          sellReason = `Profitable sell signal - ${profitPercentage.toFixed(2)}% gain`;
        }
        
        // No stop-loss selling - only hold until profitable
        
        if (shouldSell) {
          const sellAmount = parseFloat(position.amount) * 0.8; // Sell 80% of position
          
          console.log(`🔴 SELL Signal: ${crypto.symbol} - ${sellReason}`);
          console.log(`💰 Selling ${sellAmount} of ${crypto.symbol}`);
          
          await this.executeSellOrder(userId, crypto, sellAmount, sellReason);
          
          // Send Telegram notification
          telegramService.sendProfitAlert(profitPercentage, crypto.symbol);
        } else {
          console.log(`⚪ HOLD position: ${crypto.symbol} - RSI: ${signal.rsi}, P&L: ${profitPercentage.toFixed(2)}%`);
        }
      } else {
        console.log(`❌ No signal data for ${crypto.symbol}`);
      }
    }
  }

  private async checkBuySignals(userId: number, cryptos: any[], balance: number): Promise<void> {
    const opportunities = [];
    let analyzed = 0;
    let validSignals = 0;

    console.log(`🔍 Analyzing ${cryptos.length} cryptocurrencies for buy signals`);

    for (const crypto of cryptos) { // Analyze all available cryptocurrencies
      analyzed++;
      
      const signal = await this.analyzeSymbol(crypto);
      
      if (signal) {
        validSignals++;
        
        if (signal.signal === 'BUY') {
          opportunities.push({
            crypto,
            signal,
            priority: signal.vol_ratio * (100 - signal.rsi) // Higher volume and lower RSI = higher priority
          });
          console.log(`🟢 BUY opportunity: ${crypto.symbol} - RSI: ${signal.rsi}, Confidence: ${(signal.confidence * 100).toFixed(0)}%, Score: ${signal.buyScore}/6`);
        } else if (signal.signal === 'SELL') {
          console.log(`🔴 SELL signal: ${crypto.symbol} - RSI: ${signal.rsi}, Price: $${crypto.currentPrice}`);
        }
        
        // Log detailed analysis for first 10 cryptos to debug
        if (analyzed <= 10) {
          console.log(`🔍 Debug ${crypto.symbol}: RSI=${signal.rsi}, BuyScore=${signal.buyScore}/6, SellScore=${signal.sellScore}/4, Signal=${signal.signal}`);
          console.log(`   Conditions: RSI(${signal.buyConditions.rsi}) MACD(${signal.buyConditions.macd}) EMA(${signal.buyConditions.ema}) BB(${signal.buyConditions.bollinger}) VOL(${signal.buyConditions.volume}) ADX(${signal.buyConditions.adx})`);
          console.log(`   Values: RSI=${signal.rsi} PriceChange=${signal.price_change}% Volume=${signal.vol_ratio} ADX=${signal.adx}`);
        }
      }
    }

    console.log(`📊 Analyzed ${analyzed} cryptos, ${validSignals} valid signals, ${opportunities.length} buy opportunities`);
    
    if (opportunities.length === 0) {
      console.log(`❌ No buy opportunities found in current market conditions`);
    }

    // Sort by priority and take top 5 for more aggressive trading
    opportunities.sort((a, b) => b.priority - a.priority);
    
    const maxTrades = Math.min(3, opportunities.length); // Reduce to max 3 trades
    console.log(`🎯 Executing ${maxTrades} buy orders from ${opportunities.length} opportunities`);
    
    for (let i = 0; i < maxTrades; i++) {
      const opp = opportunities[i];
      const maxUsableBalance = balance * 0.80; // Use only 80% of balance for more conservative approach
      const investAmount = Math.min(maxUsableBalance * 0.15, 0.75); // Max 15% of usable balance or $0.75 per trade
      
      if (investAmount >= 0.1 && maxUsableBalance >= 0.15) { // Minimum $0.10 investment if usable balance allows
        console.log(`🟢 BUY Signal: ${opp.crypto.symbol} - RSI: ${opp.signal.rsi}, Volume: ${opp.signal.vol_ratio}x`);
        await this.executeBuyOrder(userId, opp.crypto, investAmount, `EMA-RSI buy signal - RSI: ${opp.signal.rsi}`);
        balance -= investAmount; // Update balance for next calculation
      } else {
        console.log(`💰 Insufficient usable balance for ${opp.crypto.symbol}: Need $0.15, have $${maxUsableBalance.toFixed(2)} (95% of $${balance.toFixed(2)})`);
        break; // Stop if balance is too low
      }
    }
  }

  private async analyzeSymbol(crypto: any): Promise<any> {
    try {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange24h = parseFloat(crypto.priceChange24h || '0');
      const volume24h = parseFloat(crypto.volume24h || '0');
      
      // More dynamic RSI calculation for active trading
      let rsi = 50;
      if (priceChange24h > 6) rsi = 80;
      else if (priceChange24h < -6) rsi = 20;
      else if (priceChange24h > 3) rsi = 70;
      else if (priceChange24h < -3) rsi = 30;
      else if (priceChange24h > 1) rsi = 60;
      else if (priceChange24h < -1) rsi = 40;
      else if (priceChange24h > 0.5) rsi = 55;
      else if (priceChange24h < -0.5) rsi = 45;
      else if (priceChange24h > 0) rsi = 52;
      else if (priceChange24h < 0) rsi = 48;
      
      // Simulate EMA crossover based on recent price trends
      const ema20 = currentPrice * (1 + priceChange24h * 0.01);
      const ema50 = currentPrice * (1 + priceChange24h * 0.005);
      
      // Simulate MACD signals based on momentum
      const macdPositive = priceChange24h > 1;
      
      // Bollinger Band simulation
      const volatility = Math.abs(priceChange24h);
      const upperBand = currentPrice * (1 + volatility * 0.02);
      const lowerBand = currentPrice * (1 - volatility * 0.02);
      
      // Volume analysis
      const volumeRatio = volume24h > 1000000 ? 2.0 : 1.0;
      
      // ADX simulation based on price volatility
      const adx = Math.min(100, volatility * 5 + 20);
      
      // Balanced Buy Conditions - at least 3 out of 6 must be true for more active trading
      const buyConditions = {
        rsi: rsi < 40,  // More lenient RSI
        macd: macdPositive,
        ema: ema20 > ema50,
        bollinger: currentPrice <= lowerBand * 1.05 && priceChange24h > -5, // More flexible Bollinger
        volume: volumeRatio > 0.8,  // Lower volume requirement
        adx: adx > 15  // Lower ADX threshold
      };
      
      const buyCount = Object.values(buyConditions).filter(Boolean).length;
      
      // Advanced Sell Conditions - any 2 conditions trigger sell
      const sellConditions = {
        rsi: rsi > 65,  // Lower sell RSI
        macd: !macdPositive && priceChange24h < -2,
        bollinger: currentPrice >= upperBand * 0.95,  // More flexible upper band
        volumeDrop: volumeRatio < 0.6
      };
      
      const sellCount = Object.values(sellConditions).filter(Boolean).length;
      
      // Even more aggressive signal generation for active trading
      let signal = 'HOLD';
      let confidence = 0;
      
      if (buyCount >= 2) {  // Reduced from 3 to 2 for more trades
        signal = 'BUY';
        confidence = buyCount / 6;
      } else if (sellCount >= 2) {
        signal = 'SELL';
        confidence = sellCount / 4;
      } else if (rsi < 30) {  // Strong RSI oversold signal alone
        signal = 'BUY';
        confidence = 0.7;
      } else if (rsi > 70) {  // Strong RSI overbought signal alone
        signal = 'SELL';
        confidence = 0.7;
      }
      
      return {
        signal,
        confidence,
        rsi,
        ema20,
        ema50,
        macd: macdPositive ? 1 : -1,
        macdSignal: 0,
        bollingerUpper: upperBand,
        bollingerLower: lowerBand,
        adx,
        vol_ratio: volumeRatio,
        price_change: priceChange24h,
        buyConditions,
        sellConditions,
        buyScore: buyCount,
        sellScore: sellCount
      };
    } catch (error) {
      console.log(`❌ Error analyzing ${crypto.symbol}:`, error);
      return null;
    }
  }

  private calculateEMA(prices: number[], period: number): number[] | null {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
    
    return ema;
  }

  private calculateMACD(prices: number[]): any | null {
    if (prices.length < 26) return null;
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    if (!ema12 || !ema26) return null;
    
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    
    // Calculate MACD signal line (9-period EMA of MACD line)
    const macdHistory = [];
    for (let i = 26; i < prices.length; i++) {
      if (ema12[i - 26] && ema26[i - 26]) {
        macdHistory.push(ema12[i - 26] - ema26[i - 26]);
      }
    }
    
    const signalArray = this.calculateEMA(macdHistory, 9);
    const signal = signalArray ? signalArray[signalArray.length - 1] : macdLine;
    
    return {
      macd: macdLine,
      signal: signal,
      histogram: macdLine - signal
    };
  }

  private calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): any | null {
    if (prices.length < period) return null;
    
    const sma = prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
    
    const variance = prices.slice(-period).reduce((sum, price) => {
      return sum + Math.pow(price - sma, 2);
    }, 0) / period;
    
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * multiplier),
      middle: sma,
      lower: sma - (stdDev * multiplier)
    };
  }

  private calculateADX(prices: number[], period: number = 14): number {
    if (prices.length < period * 2) return 25; // Default moderate trend strength
    
    // Simplified ADX calculation based on price volatility
    const priceChanges = [];
    for (let i = 1; i < prices.length; i++) {
      priceChanges.push(Math.abs(prices[i] - prices[i - 1]));
    }
    
    const avgChange = priceChanges.slice(-period).reduce((sum, change) => sum + change, 0) / period;
    const maxChange = Math.max(...priceChanges.slice(-period));
    
    // Convert to ADX-like scale (0-100)
    const adx = Math.min(100, (avgChange / maxChange) * 100);
    return isNaN(adx) ? 25 : adx;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private async executeBuyOrder(userId: number, crypto: any, amount: number, reason: string) {
    try {
      const price = parseFloat(crypto.currentPrice);
      const quantity = amount / price;
      
      // Get current user balance and check if purchase is possible
      const user = await storage.getUser(userId);
      if (!user) return;
      
      const currentBalance = parseFloat(user.balance);
      
      // Prevent negative balance - ensure we have enough funds
      if (currentBalance < amount) {
        console.log(`❌ Insufficient balance: Need $${amount.toFixed(2)}, have $${currentBalance.toFixed(2)}`);
        return;
      }
      
      const newBalance = currentBalance - amount;
      
      // Double-check that balance won't go negative
      if (newBalance < 0) {
        console.log(`❌ Transaction would create negative balance: $${newBalance.toFixed(2)}`);
        return;
      }
      
      await storage.updateUserBalance(userId, newBalance.toString());
      
      // Broadcast balance update to WebSocket clients
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'balanceUpdate',
          data: { userId, balance: newBalance }
        });
      }
      
      // Create trade record
      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'buy',
        amount: quantity.toString(),
        price: price.toString(),
        total: amount.toString(),
        isBot: true
      };
      
      const trade = await storage.createTrade(tradeData);
      
      // Update portfolio
      await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, price);
      
      // Broadcast portfolio update to WebSocket with proper calculations
      if (this.broadcastFn) {
        const { portfolioService } = await import('../services/portfolioService');
        const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
        this.broadcastFn({
          type: 'portfolioUpdate',
          data: updatedPortfolio
        });
      }
      
      console.log(`✅ BUY: ${crypto.symbol} - $${amount.toFixed(2)} at $${price.toFixed(6)}`);
      
      // Send Telegram notification
      await telegramService.sendTradeNotification(trade, crypto);
      
      // Broadcast trading activity for live feed
      if (this.broadcastFn) {
        const tradeActivity = {
          timestamp: new Date().toISOString(),
          action: 'BUY',
          symbol: crypto.symbol,
          amount: quantity.toString(),
          price: price.toString(),
          total: amount.toString(),
          type: 'automated',
          strategy: 'EMA-RSI'
        };
        
        this.broadcastFn({
          type: 'tradeUpdate',
          data: tradeActivity
        });
        
        this.broadcastFn({
          type: 'newTrade',
          data: {
            ...trade,
            cryptocurrency: crypto
          }
        });
      }
    } catch (error) {
      console.log(`❌ Failed to execute buy order for ${crypto.symbol}:`, error);
    }
  }

  private async executeSellOrder(userId: number, crypto: any, quantity: number, reason: string) {
    try {
      const price = parseFloat(crypto.currentPrice);
      const total = quantity * price;
      
      // Get current user balance
      const user = await storage.getUser(userId);
      if (!user) return;
      
      const currentBalance = parseFloat(user.balance);
      const newBalance = currentBalance + total;
      
      // Ensure balance calculation is correct (adding money from sale)
      if (newBalance < 0) {
        console.log(`❌ Sell order calculation error: Current: $${currentBalance.toFixed(2)}, Adding: $${total.toFixed(2)}, Result: $${newBalance.toFixed(2)}`);
        return;
      }
      
      await storage.updateUserBalance(userId, newBalance.toString());
      
      // Broadcast balance update to WebSocket clients
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'balanceUpdate',
          data: { userId, balance: newBalance }
        });
      }
      
      // Create trade record
      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'sell',
        amount: quantity.toString(),
        price: price.toString(),
        total: total.toString(),
        isBot: true
      };
      
      const trade = await storage.createTrade(tradeData);
      
      // Update portfolio
      await this.updatePortfolioAfterSell(userId, crypto.id, quantity);
      
      // Broadcast portfolio update to WebSocket with proper calculations
      if (this.broadcastFn) {
        const { portfolioService } = await import('../services/portfolioService');
        const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
        this.broadcastFn({
          type: 'portfolioUpdate',
          data: updatedPortfolio
        });
      }
      
      console.log(`✅ SELL: ${crypto.symbol} - ${quantity.toFixed(6)} at $${price.toFixed(6)}`);
      
      // Send Telegram notification
      await telegramService.sendTradeNotification(trade, crypto);
      
      // Broadcast trading activity for live feed
      if (this.broadcastFn) {
        const tradeActivity = {
          timestamp: new Date().toISOString(),
          action: 'SELL',
          symbol: crypto.symbol,
          amount: quantity.toString(),
          price: price.toString(),
          total: total.toString(),
          type: 'automated',
          strategy: 'EMA-RSI'
        };
        
        this.broadcastFn({
          type: 'tradeUpdate',
          data: tradeActivity
        });
        
        this.broadcastFn({
          type: 'newTrade',
          data: {
            ...trade,
            cryptocurrency: crypto
          }
        });

        // Broadcast sold coins update for the UI
        const trades = await storage.getUserTrades(userId, 100);
        const sellTrades = trades.filter(t => t.type === 'SELL');
        const soldCoins = await Promise.all(sellTrades.map(async (t) => {
          const cryptoData = await storage.getCryptocurrency(t.cryptoId);
          
          // Find corresponding buy trade
          const buyTrades = trades.filter(bt => 
            bt.cryptoId === t.cryptoId && 
            bt.type === 'BUY' && 
            bt.createdAt < t.createdAt
          ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          
          const lastBuyTrade = buyTrades[0];
          const buyPrice = lastBuyTrade ? parseFloat(lastBuyTrade.price) : 0;
          const sellPrice = parseFloat(t.price);
          const quantity = parseFloat(t.amount);
          const sellValue = parseFloat(t.total);
          const buyValue = buyPrice * quantity;
          const profit = sellValue - buyValue;
          const profitPercentage = buyValue > 0 ? ((profit / buyValue) * 100) : 0;
          
          return {
            id: t.id,
            symbol: cryptoData?.symbol || 'Unknown',
            name: cryptoData?.name || 'Unknown',
            soldQuantity: t.amount,
            sellPrice: t.price,
            buyPrice: buyPrice.toString(),
            sellValue: t.total,
            profit: profit.toString(),
            profitPercentage: profitPercentage.toString(),
            soldAt: t.createdAt.toISOString()
          };
        }));

        this.broadcastFn({
          type: 'soldCoinsUpdate',
          data: soldCoins
        });
      }
    } catch (error) {
      console.log(`❌ Failed to execute sell order for ${crypto.symbol}:`, error);
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number) {
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, quantity: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    if (!existing) return;
    
    const currentAmount = parseFloat(existing.amount);
    const newAmount = currentAmount - quantity;
    
    if (newAmount <= 0.000001) {
      // Remove from portfolio if amount is negligible
      await storage.deletePortfolioItem(userId, cryptoId);
    } else {
      // Update amount, keep same average price and adjust total invested proportionally
      const avgPrice = parseFloat(existing.averagePrice);
      const newTotalInvested = newAmount * avgPrice;
      
      await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), avgPrice.toString(), newTotalInvested.toString());
    }
  }
}

export const emaRsiStrategy = new EmaRsiStrategy();