import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { storage } from '../storage';
import { telegramService } from './telegramService';

class BinanceService {
  private client: any = null;
  private isTestnet: boolean = true;

  initialize() {
    const apiKey = process.env.BINANCE_TESTNET_API_KEY;
    const apiSecret = process.env.BINANCE_TESTNET_SECRET_KEY;

    try {
      const Binance = require('binance-api-node').default;
      
      if (apiKey && apiSecret) {
        this.client = Binance({
          apiKey,
          apiSecret,
          httpBase: 'https://testnet.binance.vision',
          wsBase: 'wss://testnet.binance.vision/ws'
        });
        console.log('🔧 Initializing Binance testnet API...');
        this.testConnection();
      } else {
        this.client = Binance({
          httpBase: 'https://api.binance.com',
          wsBase: 'wss://stream.binance.com:9443/ws'
        });
        console.log('🔧 Binance API initialized for market data only');
      }
      
      // Market monitoring will only start when bot is manually activated
    } catch (error) {
      console.error('Failed to initialize Binance API:', error);
    }
  }

  private async testConnection() {
    if (!this.client) return;

    try {
      const accountInfo = await this.client.accountInfo();
      console.log('✅ Binance Testnet API initialized with credentials for real trading');
    } catch (error) {
      console.error('Binance API connection failed:', error);
    }
  }

  async getRealMarketData() {
    if (!this.client) return null;

    try {
      const tickers = await this.client.dailyStats();
      console.log(`📊 Binance returned ${tickers.length} total tickers`);
      
      const usdtPairs = tickers.filter((ticker: any) => ticker.symbol.endsWith('USDT'));
      console.log(`💰 Found ${usdtPairs.length} USDT pairs`);
      
      // Use more lenient filtering and prioritize high volatility pairs
      const filtered = tickers
        .filter((ticker: any) => 
          ticker.symbol.endsWith('USDT') && 
          parseFloat(ticker.volume) > 1000 &&   // Very low volume requirement
          parseFloat(ticker.count) > 10         // Very low count requirement
        )
        .sort((a: any, b: any) => {
          // Sort by absolute price change percentage (highest volatility first)
          const aChange = Math.abs(parseFloat(a.priceChangePercent));
          const bChange = Math.abs(parseFloat(b.priceChangePercent));
          return bChange - aChange;
        })
        .slice(0, 100); // Top 100 most volatile pairs
      
      console.log(`🎯 After filtering: ${filtered.length} active pairs selected`);
      
      return filtered.map((ticker: any) => ({
        symbol: ticker.symbol.replace('USDT', ''),
        name: this.getFullName(ticker.symbol.replace('USDT', '')),
        currentPrice: parseFloat(ticker.lastPrice),
        priceChange24h: parseFloat(ticker.priceChangePercent)
      }));
    } catch (error) {
      console.log('Failed to fetch market data from Binance:', error);
      return null;
    }
  }

  async executeRealTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, userId: number) {
    if (!this.client) {
      console.log(`Mock ${side} trade: ${quantity} ${symbol} for user ${userId}`);
      return { success: true, message: 'Mock trade executed' };
    }

    try {
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) throw new Error(`Cryptocurrency ${symbol} not found`);

      const currentPrice = parseFloat(crypto.currentPrice);
      const properQuantity = this.roundToPrecision(quantity, symbol + 'USDT');

      const order = await this.client.order({
        symbol: symbol + 'USDT',
        side,
        type: 'MARKET',
        quantity: properQuantity
      });

      const trade = await storage.createTrade({
        userId,
        cryptoId: crypto.id,
        type: side.toLowerCase() as 'buy' | 'sell',
        amount: properQuantity.toString(),
        price: currentPrice.toString(),
        total: (properQuantity * currentPrice).toString(),
        isBot: true
      });

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

  async getKlineData(symbol: string, interval: string = '1h', limit: number = 21): Promise<number[]> {
    if (!this.client) return [];

    try {
      const klines = await this.client.candles({
        symbol: symbol + 'USDT',
        interval,
        limit
      });

      return klines.map((kline: any) => parseFloat(kline.close));
    } catch (error) {
      console.error(`Error fetching ${symbol} kline data:`, error);
      return [];
    }
  }

  private roundToPrecision(quantity: number, symbol: string): number {
    const precisionMap: { [key: string]: number } = {
      'BTC': 6, 'ETH': 5, 'BNB': 3, 'ADA': 1, 'DOT': 2, 'LINK': 2
    };
    
    const precision = precisionMap[symbol.replace('USDT', '')] || 3;
    return parseFloat(quantity.toFixed(precision));
  }

  private getFullName(symbol: string): string {
    const nameMap: { [key: string]: string } = {
      'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'Binance Coin',
      'ADA': 'Cardano', 'SOL': 'Solana', 'DOT': 'Polkadot',
      'LINK': 'Chainlink', 'UNI': 'Uniswap', 'LTC': 'Litecoin',
      'AVAX': 'Avalanche', 'ATOM': 'Cosmos', 'ALGO': 'Algorand'
    };
    return nameMap[symbol] || symbol;
  }

  async monitorPrices() {
    const marketData = await this.getRealMarketData();
    if (marketData) {
      console.log('🚀 Starting real market data updates with CoinCap API...');
    }
  }
}

export const binanceService = new BinanceService();