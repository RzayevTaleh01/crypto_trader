import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { storage } from '../storage';
import { telegramService } from './telegramService';

class BinanceService {
  private client: any = null;
  private isTestnet: boolean = true; // Using testnet for real trading practice

  initialize() {
    const apiKey = process.env.BINANCE_TESTNET_API_KEY;
    const apiSecret = process.env.BINANCE_TESTNET_SECRET_KEY;

    try {
      const Binance = require('binance-api-node').default;
      
      if (apiKey && apiSecret) {
        // Initialize with testnet credentials for real trading
        this.client = Binance({
          apiKey,
          apiSecret,
          httpBase: 'https://testnet.binance.vision',
          wsBase: 'wss://testnet.binance.vision/ws'
        });
        console.log(`✅ Binance Testnet API initialized with credentials for real trading`);
        this.testConnection();
      } else {
        // Initialize without credentials for market data only
        this.client = Binance({
          httpBase: 'https://api.binance.com',
          wsBase: 'wss://stream.binance.com:9443/ws'
        });
        console.log(`✅ Binance API initialized for market data only (no trading credentials)`);
      }
      
      this.monitorPrices();
    } catch (error) {
      console.error('❌ Failed to initialize Binance API:', error);
    }
  }

  private async testConnection() {
    if (!this.client) return;

    try {
      const accountInfo = await this.client.accountInfo();
      console.log('Binance API connection successful');
      console.log('Account type:', accountInfo.accountType);
    } catch (error) {
      console.error('Binance API connection failed:', error);
    }
  }

  // Get real market data from Binance testnet API only
  async getRealMarketData() {
    if (!this.client) {
      console.error('Binance API not initialized');
      return null;
    }

    try {
      // Get 24hr ticker statistics for all symbols
      const tickers = await this.client.dailyStats();
      
      if (!tickers || tickers.length === 0) {
        throw new Error('No market data received from Binance');
      }
      
      // Filter only USDT pairs and extract symbol data
      const usdtPairs = tickers.filter((ticker: any) => ticker.symbol.endsWith('USDT'));
      
      console.log(`✅ Fetched real market data for ${usdtPairs.length} cryptocurrencies from Binance testnet`);
      
      return usdtPairs.map((ticker: any) => {
        const symbol = ticker.symbol.replace('USDT', '');
        return {
          symbol: symbol,
          name: this.getFullName(symbol),
          currentPrice: parseFloat(ticker.lastPrice || 0),
          priceChange24h: parseFloat(ticker.priceChangePercent || 0),
          volume24h: parseFloat(ticker.volume || 0),
          marketCap: 0 // Not available from Binance ticker
        };
      }).filter((coin: any) => coin.currentPrice > 0);
    } catch (error) {
      console.error('Failed to fetch market data from Binance:', error);
      return null;
    }
  }

  // Execute real trade
  async executeRealTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, userId: number) {
    if (!this.client) {
      throw new Error('Binance API not initialized');
    }

    try {
      // Check if symbol is available on Binance testnet
      const binanceSymbol = symbol + 'USDT';
      const availablePairs = await this.getTradingPairs();
      
      if (!availablePairs.includes(binanceSymbol)) {
        throw new Error(`Symbol ${binanceSymbol} not available on Binance testnet`);
      }

      // Get current market price
      const ticker = await this.client.prices({ symbol: binanceSymbol });
      const currentPrice = parseFloat(ticker[binanceSymbol]);

      // Get symbol info for proper quantity calculation
      const exchangeInfo = await this.client.exchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === binanceSymbol);
      
      if (!symbolInfo) {
        throw new Error(`Symbol info not found for ${binanceSymbol}`);
      }

      // Simplified approach - use predefined safe quantities for major coins
      let properQuantity;
      
      if (symbol === 'BTC') {
        properQuantity = Math.max(0.001, quantity / currentPrice); // Minimum 0.001 BTC
        properQuantity = Math.floor(properQuantity * 100000) / 100000; // 5 decimal places
      } else if (symbol === 'ETH') {
        properQuantity = Math.max(0.01, quantity / currentPrice); // Minimum 0.01 ETH
        properQuantity = Math.floor(properQuantity * 1000) / 1000; // 3 decimal places
      } else {
        // For other coins, use conservative approach
        properQuantity = Math.max(1, quantity / currentPrice);
        properQuantity = Math.floor(properQuantity);
      }

      console.log(`📊 ${binanceSymbol} - Price: $${currentPrice}, Investment: $${quantity}, Quantity: ${properQuantity}`);
      
      // Execute market order
      const order = await this.client.order({
        symbol: binanceSymbol,
        side,
        type: 'MARKET',
        quantity: properQuantity.toString()
      });

      console.log('Binance order executed:', order);

      // Record trade in database
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        throw new Error(`Cryptocurrency ${symbol} not found in database`);
      }

      const trade = await storage.createTrade({
        userId,
        cryptoId: crypto.id,
        type: side.toLowerCase() as 'buy' | 'sell',
        amount: properQuantity.toString(),
        price: currentPrice.toString(),
        total: (properQuantity * currentPrice).toString(),
        isBot: true
      });

      // Send Telegram notification
      await telegramService.sendTradeNotification(trade, crypto);

      return {
        success: true,
        order,
        trade,
        message: `${side} order executed successfully`
      };

    } catch (error) {
      console.error('Failed to execute Binance trade:', error);
      throw error;
    }
  }

  // Get account balance
  async getAccountBalance() {
    if (!this.client) return null;

    try {
      const accountInfo = await this.client.accountInfo();
      return accountInfo.balances.filter((balance: any) => parseFloat(balance.free) > 0);
    } catch (error) {
      console.error('Failed to get account balance:', error);
      return null;
    }
  }

  // Get trading pairs info
  async getTradingPairs() {
    if (!this.client) return [];

    try {
      const exchangeInfo = await this.client.exchangeInfo();
      const tradingPairs = exchangeInfo.symbols
        .filter((symbol: any) => 
          symbol.status === 'TRADING' && 
          symbol.symbol.endsWith('USDT')
        )
        .map((symbol: any) => symbol.symbol);
      
      console.log(`📋 Found ${tradingPairs.length} trading pairs on Binance testnet`);
      return tradingPairs;
    } catch (error) {
      console.error('Failed to get trading pairs:', error);
      return [];
    }
  }

  // Advanced trading strategy implementation
  async executeAdvancedStrategy(userId: number, strategy: string, riskLevel: number) {
    if (!this.client) {
      console.log(`🤖 Bot executing ${strategy} strategy for user ${userId} (risk level: ${riskLevel})`);
      return this.executeActiveStrategy(userId, strategy, riskLevel);
    }

    try {
      const marketData = await this.getRealMarketData();
      if (!marketData) return;

      const balance = await this.getAccountBalance();
      const usdtBalance = balance?.find((b: any) => b.asset === 'USDT');
      
      if (!usdtBalance || parseFloat(usdtBalance.free) < 10) {
        console.log('Insufficient USDT balance for trading');
        return;
      }

      const availableBalance = parseFloat(usdtBalance.free);
      const maxTradeAmount = (availableBalance * (riskLevel / 10) * 0.3); // Max 30% per trade

      // Strategy implementation
      switch (strategy) {
        case 'scalping':
          await this.executeScalpingStrategy(marketData, maxTradeAmount, userId);
          break;
        case 'momentum':
          await this.executeMomentumStrategy(marketData, maxTradeAmount, userId);
          break;
        case 'mean-reversion':
          await this.executeMeanReversionStrategy(marketData, maxTradeAmount, userId);
          break;
        case 'grid':
          await this.executeGridStrategy(marketData, maxTradeAmount, userId);
          break;
        default:
          await this.executeScalpingStrategy(marketData, maxTradeAmount, userId);
      }

    } catch (error) {
      console.error('Failed to execute advanced strategy:', error);
    }
  }

  private async executeScalpingStrategy(marketData: any[], maxTradeAmount: number, userId: number) {
    // Look for coins with high volume and recent price movement
    const candidates = marketData.filter(coin => 
      Math.abs(coin.priceChange24h) > 1 && coin.volume24h > 1000000
    );

    for (const coin of candidates.slice(0, 2)) {
      if (coin.priceChange24h < -2) {
        // Price dropped, consider buying
        const quantity = (maxTradeAmount * 0.5) / coin.currentPrice;
        if (quantity * coin.currentPrice >= 10) { // Minimum order size
          await this.executeRealTrade(coin.symbol, 'BUY', quantity, userId);
          console.log(`Scalping BUY: ${coin.symbol} at $${coin.currentPrice}`);
        }
      }
    }
  }

  private async executeMomentumStrategy(marketData: any[], maxTradeAmount: number, userId: number) {
    // Look for coins with strong upward momentum
    const strongMomentum = marketData.filter(coin => 
      coin.priceChange24h > 3 && coin.volume24h > 500000
    );

    for (const coin of strongMomentum.slice(0, 1)) {
      const quantity = (maxTradeAmount * 0.3) / coin.currentPrice;
      if (quantity * coin.currentPrice >= 10) {
        await this.executeRealTrade(coin.symbol, 'BUY', quantity, userId);
        console.log(`Momentum BUY: ${coin.symbol} at $${coin.currentPrice}`);
      }
    }
  }

  private async executeMeanReversionStrategy(marketData: any[], maxTradeAmount: number, userId: number) {
    // Look for oversold conditions
    const oversold = marketData.filter(coin => 
      coin.priceChange24h < -5 && coin.volume24h > 300000
    );

    for (const coin of oversold.slice(0, 1)) {
      const quantity = (maxTradeAmount * 0.4) / coin.currentPrice;
      if (quantity * coin.currentPrice >= 10) {
        await this.executeRealTrade(coin.symbol, 'BUY', quantity, userId);
        console.log(`Mean Reversion BUY: ${coin.symbol} at $${coin.currentPrice}`);
      }
    }
  }

  private async executeGridStrategy(marketData: any[], maxTradeAmount: number, userId: number) {
    // Grid trading - buy at support levels, sell at resistance
    const stableCoins = marketData.filter(coin => 
      Math.abs(coin.priceChange24h) < 3 && coin.volume24h > 1000000
    );

    for (const coin of stableCoins.slice(0, 1)) {
      if (coin.priceChange24h < -1) {
        const quantity = (maxTradeAmount * 0.25) / coin.currentPrice;
        if (quantity * coin.currentPrice >= 10) {
          await this.executeRealTrade(coin.symbol, 'BUY', quantity, userId);
          console.log(`Grid BUY: ${coin.symbol} at $${coin.currentPrice}`);
        }
      }
    }
  }

  private async executeActiveStrategy(userId: number, strategy: string, riskLevel: number) {
    // Force active trading - execute trades every cycle
    const cryptos = await storage.getAllCryptocurrencies();
    if (!cryptos || cryptos.length === 0) return;

    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    if (balance < 10) {
      console.log('Insufficient balance for trading');
      return;
    }

    // Select a random crypto for trading
    const selectedCrypto = cryptos[Math.floor(Math.random() * cryptos.length)];
    const priceChange = parseFloat(selectedCrypto.priceChange24h);
    const currentPrice = parseFloat(selectedCrypto.currentPrice);
    const maxTradeAmount = balance * 0.20 * (riskLevel / 10); // 20% of balance per trade

    console.log(`🚀 FORCED TRADING: ${selectedCrypto.symbol} - Price: $${currentPrice}, Change: ${priceChange}%`);

    // Force a trade based on strategy
    const shouldBuy = strategy === 'momentum' ? priceChange > 1 : 
                     strategy === 'scalping' ? Math.abs(priceChange) > 0.5 :
                     strategy === 'grid' ? true : // Grid always trades
                     priceChange < -1; // Mean reversion buys dips

    if (shouldBuy && balance > maxTradeAmount) {
      // Execute BUY trade
      const amount = maxTradeAmount / currentPrice;
      
      console.log(`💰 EXECUTING BUY: ${amount.toFixed(6)} ${selectedCrypto.symbol} for $${maxTradeAmount.toFixed(2)}`);
      
      const trade = await storage.createTrade({
        userId,
        cryptoId: selectedCrypto.id,
        type: 'buy',
        amount: amount.toString(),
        price: currentPrice.toString(),
        total: maxTradeAmount.toString(),
        isBot: true
      });

      // Update balance
      await storage.updateUserBalance(userId, (balance - maxTradeAmount).toString());
      
      // Update portfolio
      const portfolioItem = await storage.getPortfolioItem(userId, selectedCrypto.id);
      if (portfolioItem) {
        const existingAmount = parseFloat(portfolioItem.amount);
        const existingTotal = parseFloat(portfolioItem.totalInvested);
        const newAmount = existingAmount + amount;
        const newTotal = existingTotal + maxTradeAmount;
        const newAvgPrice = newTotal / newAmount;
        
        await storage.updatePortfolioItem(
          userId,
          selectedCrypto.id,
          newAmount.toString(),
          newAvgPrice.toString(),
          newTotal.toString()
        );
      } else {
        await storage.createPortfolioItem({
          userId,
          cryptoId: selectedCrypto.id,
          amount: amount.toString(),
          averagePrice: currentPrice.toString(),
          totalInvested: maxTradeAmount.toString()
        });
      }

      console.log(`✅ BUY TRADE COMPLETED: ${selectedCrypto.symbol}`);
      await telegramService.sendTradeNotification(trade, selectedCrypto);
      
    } else {
      // Try to execute a SELL trade if we have holdings
      const portfolioItem = await storage.getPortfolioItem(userId, selectedCrypto.id);
      
      if (portfolioItem && parseFloat(portfolioItem.amount) > 0) {
        const sellAmount = parseFloat(portfolioItem.amount) * 0.2; // Sell 20% of holdings
        const sellValue = sellAmount * currentPrice;
        
        if (sellAmount > 0) {
          console.log(`💰 EXECUTING SELL: ${sellAmount.toFixed(6)} ${selectedCrypto.symbol} for $${sellValue.toFixed(2)}`);
          
          const avgPrice = parseFloat(portfolioItem.averagePrice);
          const profit = (currentPrice - avgPrice) * sellAmount;
          
          const trade = await storage.createTrade({
            userId,
            cryptoId: selectedCrypto.id,
            type: 'sell',
            amount: sellAmount.toString(),
            price: currentPrice.toString(),
            total: sellValue.toString(),
            pnl: profit.toString(),
            isBot: true
          });

          // Update balance
          await storage.updateUserBalance(userId, (balance + sellValue).toString());
          
          // Update portfolio
          const remainingAmount = parseFloat(portfolioItem.amount) - sellAmount;
          if (remainingAmount <= 0) {
            await storage.deletePortfolioItem(userId, selectedCrypto.id);
          } else {
            const currentTotal = parseFloat(portfolioItem.totalInvested);
            const reduction = (sellAmount / parseFloat(portfolioItem.amount)) * currentTotal;
            const newTotal = currentTotal - reduction;
            
            await storage.updatePortfolioItem(
              userId,
              selectedCrypto.id,
              remainingAmount.toString(),
              portfolioItem.averagePrice,
              newTotal.toString()
            );
          }

          console.log(`✅ SELL TRADE COMPLETED: ${selectedCrypto.symbol} - Profit: $${profit.toFixed(2)}`);
          await telegramService.sendTradeNotification(trade, selectedCrypto);
        }
      } else {
        console.log(`No holdings to sell for ${selectedCrypto.symbol}`);
      }
    }
  }

  private async executeMockStrategy(userId: number, strategy: string, riskLevel: number) {
    console.log(`Executing ${strategy} strategy for user ${userId} with risk level ${riskLevel}`);
    
    const cryptos = await storage.getAllCryptocurrencies();
    if (cryptos.length === 0) {
      console.log('No cryptocurrencies available for trading');
      return;
    }

    // Analyze most profitable coins based on price change
    const profitableCryptos = cryptos
      .filter(crypto => parseFloat(crypto.priceChange24h) !== 0)
      .sort((a, b) => Math.abs(parseFloat(b.priceChange24h)) - Math.abs(parseFloat(a.priceChange24h)))
      .slice(0, 5); // Top 5 most volatile coins

    if (profitableCryptos.length === 0) {
      console.log('No suitable cryptocurrencies for trading');
      return;
    }

    const selectedCrypto = profitableCryptos[Math.floor(Math.random() * profitableCryptos.length)];
    const priceChange = parseFloat(selectedCrypto.priceChange24h);
    const tradingProbability = 0.6 + (riskLevel / 20); // 60% base chance + risk bonus
    const shouldTrade = Math.random() < tradingProbability;
    
    console.log(`Bot analyzing ${selectedCrypto.symbol}: priceChange=${priceChange}%, shouldTrade=${shouldTrade}, probability=${tradingProbability}`);
    
    if (!shouldTrade) {
      console.log('No trade this cycle - probability not met');
      return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.log('User not found for trading');
      return;
    }

    const balance = parseFloat(user.balance);
    const maxTradeAmount = balance * 0.05 * (riskLevel / 10); // 5% of balance per trade
    const currentPrice = parseFloat(selectedCrypto.currentPrice);

    console.log(`Trading params for ${selectedCrypto.symbol}: balance=$${balance}, maxTradeAmount=$${maxTradeAmount}, price=$${currentPrice}`);

    if (maxTradeAmount < 1) {
      console.log('Trade amount too small, skipping');
      return;
    }

    // Smart trading strategy based on profitable analysis
    if (priceChange < -1) {
      // Buy on dips for coins showing potential
      const amount = maxTradeAmount / currentPrice;
      
      console.log(`🔥 Executing BUY trade: ${amount.toFixed(6)} ${selectedCrypto.symbol} at $${currentPrice} (${priceChange}% dip)`);
      
      const trade = await storage.createTrade({
        userId,
        cryptoId: selectedCrypto.id,
        type: 'buy',
        amount: amount.toString(),
        price: currentPrice.toString(),
        total: maxTradeAmount.toString(),
        isBot: true
      });

      console.log(`✅ Bot BUY completed: ${selectedCrypto.symbol} - Trade ID ${trade.id}`);
      await telegramService.sendTradeNotification(trade, selectedCrypto);
      
    } else if (priceChange > 1) {
      // Sell on gains - check if user has this crypto in portfolio
      const portfolioItem = await storage.getPortfolioItem(userId, selectedCrypto.id);
      
      if (portfolioItem && parseFloat(portfolioItem.amount) > 0) {
        const sellAmount = Math.min(
          parseFloat(portfolioItem.amount) * 0.6, // Sell max 60% of position on strong gains
          maxTradeAmount / currentPrice
        );
        
        if (sellAmount > 0) {
          console.log(`💰 Executing SELL trade: ${sellAmount.toFixed(6)} ${selectedCrypto.symbol} at $${currentPrice} (${priceChange}% gain)`);
          
          const trade = await storage.createTrade({
            userId,
            cryptoId: selectedCrypto.id,
            type: 'sell',
            amount: sellAmount.toString(),
            price: currentPrice.toString(),
            total: (sellAmount * currentPrice).toString(),
            isBot: true
          });

          console.log(`✅ Bot SELL completed: ${selectedCrypto.symbol} - Trade ID ${trade.id}`);
          await telegramService.sendTradeNotification(trade, selectedCrypto);
        }
      } else {
        console.log(`No ${selectedCrypto.symbol} in portfolio to sell`);
      }
    } else {
      console.log(`Waiting for better conditions on ${selectedCrypto.symbol} (${priceChange}% change)`);
    }
  }

  private roundToPrecision(quantity: number, symbol: string): number {
    // Most cryptocurrencies have different precision requirements
    // Common precisions: BTC/ETH: 6 decimals, others: 2-4 decimals
    let precision = 6; // Default precision
    
    if (symbol === 'BTC' || symbol === 'ETH') {
      precision = 6;
    } else if (symbol === 'USDT' || symbol === 'USDC') {
      precision = 2;
    } else {
      precision = 4;
    }
    
    return parseFloat(quantity.toFixed(precision));
  }

  private getFullName(symbol: string): string {
    const names: { [key: string]: string } = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'BNB': 'Binance Coin',
      'ADA': 'Cardano',
      'SOL': 'Solana',
      'DOT': 'Polkadot',
      'MATIC': 'Polygon',
      'LINK': 'Chainlink'
    };
    return names[symbol] || symbol;
  }

  // Get real price history from Binance testnet for RSI calculation
  async getKlineData(symbol: string, interval: string = '1h', limit: number = 21): Promise<number[]> {
    if (!this.client) {
      console.error('Binance API not initialized');
      return [];
    }

    try {
      // Get kline/candlestick data from Binance testnet
      const klines = await this.client.candles({
        symbol: symbol + 'USDT',
        interval: interval,
        limit: limit
      });
      
      if (!klines || klines.length === 0) {
        console.log(`No price data available for ${symbol} on Binance testnet`);
        return [];
      }
      
      // Extract closing prices for RSI calculation (index 4 is close price)
      const prices = klines.map((kline: any) => parseFloat(kline.close));
      console.log(`✅ Fetched ${prices.length} real price points for ${symbol} RSI calculation from Binance testnet`);
      
      return prices;
    } catch (error) {
      console.error(`Failed to fetch price history for ${symbol} from Binance:`, error);
      return [];
    }
  }

  // Price monitoring with alerts
  async monitorPrices() {
    if (!this.client) return;

    try {
      const marketData = await this.getRealMarketData();
      if (!marketData) return;

      for (const coin of marketData) {
        // Update database with real prices
        const crypto = await storage.getCryptocurrencyBySymbol(coin.symbol);
        if (crypto) {
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            coin.currentPrice.toString(),
            coin.priceChange24h.toString()
          );
        }
      }
    } catch (error) {
      console.error('Price monitoring error:', error);
    }
  }
}

export const binanceService = new BinanceService();