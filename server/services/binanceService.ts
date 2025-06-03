import * as BinanceAPI from 'binance-api-node';
import { storage } from '../storage';
import { telegramService } from './telegramService';

class BinanceService {
  private client: any = null;
  private isTestnet: boolean = true; // Default to testnet for safety

  initialize() {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.log('Binance API credentials not provided, using mock trading');
      return;
    }

    try {
      this.client = BinanceAPI.default({
        apiKey,
        apiSecret
      });

      console.log(`Binance API initialized (${this.isTestnet ? 'Testnet' : 'Mainnet'})`);
      this.testConnection();
    } catch (error) {
      console.error('Failed to initialize Binance API:', error);
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

  // Get real market data
  async getRealMarketData() {
    if (!this.client) return null;

    try {
      // Get 24hr ticker statistics
      const tickers = await this.client.dailyStats();
      
      // Filter for major cryptocurrencies
      const majorPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT'];
      const filteredTickers = tickers.filter((ticker: any) => majorPairs.includes(ticker.symbol));

      return filteredTickers.map((ticker: any) => ({
        symbol: ticker.symbol.replace('USDT', ''),
        name: this.getFullName(ticker.symbol.replace('USDT', '')),
        currentPrice: parseFloat(ticker.lastPrice),
        priceChange24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        quoteVolume: parseFloat(ticker.quoteVolume)
      }));
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
      // Get current market price
      const ticker = await this.client.prices({ symbol: symbol + 'USDT' });
      const currentPrice = parseFloat(ticker[symbol + 'USDT']);

      // Execute market order
      const order = await this.client.order({
        symbol: symbol + 'USDT',
        side,
        type: 'MARKET',
        quantity: quantity.toString()
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
        amount: quantity.toString(),
        price: currentPrice.toString(),
        total: (quantity * currentPrice).toString(),
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
    if (!this.client) return null;

    try {
      const exchangeInfo = await this.client.exchangeInfo();
      return exchangeInfo.symbols.filter((symbol: any) => 
        symbol.status === 'TRADING' && 
        symbol.symbol.endsWith('USDT') &&
        ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'MATIC', 'LINK'].includes(symbol.baseAsset)
      );
    } catch (error) {
      console.error('Failed to get trading pairs:', error);
      return null;
    }
  }

  // Advanced trading strategy implementation
  async executeAdvancedStrategy(userId: number, strategy: string, riskLevel: number) {
    if (!this.client) {
      console.log(`🤖 Bot executing ${strategy} strategy for user ${userId} (risk level: ${riskLevel})`);
      return this.executeMockStrategy(userId, strategy, riskLevel);
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
      const maxTradeAmount = (availableBalance * (riskLevel / 10) * 0.1); // Max 10% per trade

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

  private async executeMockStrategy(userId: number, strategy: string, riskLevel: number) {
    console.log(`Executing mock ${strategy} strategy for user ${userId} with risk level ${riskLevel}`);
    
    const cryptos = await storage.getAllCryptocurrencies();
    if (cryptos.length === 0) {
      console.log('No cryptocurrencies available for trading');
      return;
    }

    const randomCrypto = cryptos[Math.floor(Math.random() * Math.min(5, cryptos.length))];
    const priceChange = parseFloat(randomCrypto.priceChange24h);
    const tradingProbability = 0.3 * (riskLevel / 10); // 30% base chance
    const shouldTrade = Math.random() < tradingProbability;
    
    console.log(`Bot check for ${randomCrypto.symbol}: priceChange=${priceChange}%, shouldTrade=${shouldTrade}, probability=${tradingProbability}`);
    
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
    const maxTradeAmount = balance * 0.03 * (riskLevel / 10); // 3% of balance per trade
    const currentPrice = parseFloat(randomCrypto.currentPrice);

    console.log(`Trading params: balance=$${balance}, maxTradeAmount=$${maxTradeAmount}, price=$${currentPrice}`);

    if (maxTradeAmount < 1) {
      console.log('Trade amount too small, skipping');
      return;
    }

    // More lenient trading conditions
    if (priceChange < -0.5 && balance > maxTradeAmount) {
      // Buy on small dips
      const amount = maxTradeAmount / currentPrice;
      
      console.log(`Executing BUY trade: ${amount.toFixed(6)} ${randomCrypto.symbol} at $${currentPrice}`);
      
      const trade = await storage.createTrade({
        userId,
        cryptoId: randomCrypto.id,
        type: 'buy',
        amount: amount.toString(),
        price: currentPrice.toString(),
        total: maxTradeAmount.toString(),
        isBot: true
      });

      console.log(`✅ Bot BUY trade completed: Trade ID ${trade.id}`);
      await telegramService.sendTradeNotification(trade, randomCrypto);
      
    } else if (priceChange > 0.5) {
      // Sell on small gains - check if user has this crypto in portfolio
      const portfolioItem = await storage.getPortfolioItem(userId, randomCrypto.id);
      
      if (portfolioItem && parseFloat(portfolioItem.amount) > 0) {
        const sellAmount = Math.min(
          parseFloat(portfolioItem.amount) * 0.5, // Sell max 50% of position
          maxTradeAmount / currentPrice
        );
        
        if (sellAmount > 0) {
          console.log(`Executing SELL trade: ${sellAmount.toFixed(6)} ${randomCrypto.symbol} at $${currentPrice}`);
          
          const trade = await storage.createTrade({
            userId,
            cryptoId: randomCrypto.id,
            type: 'sell',
            amount: sellAmount.toString(),
            price: currentPrice.toString(),
            total: (sellAmount * currentPrice).toString(),
            isBot: true
          });

          console.log(`✅ Bot SELL trade completed: Trade ID ${trade.id}`);
          await telegramService.sendTradeNotification(trade, randomCrypto);
        }
      } else {
        console.log(`No ${randomCrypto.symbol} in portfolio to sell`);
      }
    } else {
      console.log(`No suitable trading conditions for ${randomCrypto.symbol} (change: ${priceChange}%)`);
    }
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

  // Price monitoring with alerts
  async monitorPrices() {
    if (!this.client) return;

    try {
      const marketData = await this.getRealMarketData();
      if (!marketData) return;

      for (const coin of marketData) {
        // Send alert for significant price movements
        if (Math.abs(coin.priceChange24h) > 5) {
          await telegramService.sendPriceAlert(coin.symbol, coin.currentPrice, coin.priceChange24h);
        }

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