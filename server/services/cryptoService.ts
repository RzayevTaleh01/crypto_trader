import { storage } from "../storage";
import type { InsertCryptocurrency } from "@shared/schema";

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    // Use Binance API for all cryptocurrency data
    const { binanceService } = await import('./binanceService');
    
    try {
      const marketData = await binanceService.getRealMarketData();
      
      if (!marketData || marketData.length === 0) {
        console.log('No Binance market data available - please provide API credentials');
        return;
      }
      
      for (const ticker of marketData) {
        try {
          const symbol = ticker.symbol.replace('USDT', '');
          let crypto = await storage.getCryptocurrencyBySymbol(symbol);
          
          if (!crypto) {
            // Create new cryptocurrency entry from Binance data
            const newCrypto: InsertCryptocurrency = {
              symbol: symbol,
              name: symbol,
              currentPrice: ticker.price,
              priceChange24h: ticker.priceChangePercent || "0",
              marketCap: "0",
              volume24h: ticker.volume || "0"
            };
            
            crypto = await storage.createCryptocurrency(newCrypto);
          } else {
            // Update existing cryptocurrency with Binance data
            await storage.updateCryptocurrencyPrice(
              crypto.id,
              ticker.price,
              ticker.priceChangePercent || "0"
            );
            
            // Store price history
            await storage.createPriceHistory({
              cryptoId: crypto.id,
              price: ticker.price
            });
          }
          
          // Broadcast real-time price update from Binance
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
    } catch (error) {
      console.error('Error fetching Binance market data:', error);
      console.log('Please provide valid Binance API credentials for real trading data');
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
