import { storage } from "../storage";
import type { InsertCryptocurrency } from "@shared/schema";

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    // Only use Binance testnet API - no fallback to mock data
    const { binanceService } = await import('./binanceService');
    
    const marketData = await binanceService.getRealMarketData();
    
    if (!marketData || marketData.length === 0) {
      console.log('Binance testnet API required - provide BINANCE_API_KEY and BINANCE_API_SECRET');
      return;
    }
    
    console.log(`Processing ${marketData.length} real market tickers from Binance testnet`);
    
    for (const ticker of marketData) {
      try {
        const symbol = ticker.symbol.replace('USDT', '');
        let crypto = await storage.getCryptocurrencyBySymbol(symbol);
        
        if (!crypto) {
          const newCrypto: InsertCryptocurrency = {
            symbol: symbol,
            name: symbol,
            currentPrice: ticker.price,
            priceChange24h: ticker.priceChangePercent || "0",
            marketCap: ticker.quoteVolume || "0",
            volume24h: ticker.volume || "0"
          };
          
          crypto = await storage.createCryptocurrency(newCrypto);
        } else {
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            ticker.price,
            ticker.priceChangePercent || "0"
          );
          
          await storage.createPriceHistory({
            cryptoId: crypto.id,
            price: ticker.price
          });
        }
        
        if (this.broadcastFunction) {
          this.broadcastFunction({
            type: 'priceUpdate',
            data: {
              symbol: symbol,
              price: parseFloat(ticker.price),
              change24h: parseFloat(ticker.priceChangePercent || "0")
            }
          });
        }
      } catch (error) {
        console.error(`Error processing Binance ticker ${ticker.symbol}:`, error);
      }
    }
  }

  // Mock data generation removed - using only Binance testnet API

  async startPriceUpdates() {
    console.log('Starting Binance testnet price updates...');
    
    // Initial fetch from Binance API
    await this.fetchCryptoPrices();
    
    // Update prices every 15 seconds for more responsive trading
    this.updateInterval = setInterval(() => {
      this.fetchCryptoPrices();
    }, 15000);
    
    console.log('Binance testnet price updates started');
  }

  stopPriceUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('Crypto price updates stopped');
    }
  }

  async getTopPerformingCoins(limit = 10) {
    return await storage.getAllCryptocurrencies();
  }
}

export const cryptoService = new CryptoService();
