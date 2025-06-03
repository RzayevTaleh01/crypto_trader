import { storage } from "../storage";
import type { InsertCryptocurrency } from "@shared/schema";

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    const { binanceService } = await import("./binanceService");
    const marketData = await binanceService.getRealMarketData();
    
    if (!marketData) {
      console.log('Failed to fetch real market data');
      return;
    }

    console.log(`📊 Processing ${marketData.length} real cryptocurrencies from Binance testnet`);

    for (const coinData of marketData) {
      try {
        // Check if cryptocurrency exists, if not create it
        let crypto = await storage.getCryptocurrencyBySymbol(coinData.symbol);
        
        if (!crypto) {
          const newCrypto: InsertCryptocurrency = {
            symbol: coinData.symbol,
            name: coinData.name,
            currentPrice: coinData.currentPrice.toString(),
            priceChange24h: coinData.priceChange24h.toString()
          };
          crypto = await storage.createCryptocurrency(newCrypto);
        } else {
          // Update existing cryptocurrency with real prices
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            coinData.currentPrice.toString(),
            coinData.priceChange24h.toString()
          );
        }

        // Broadcast real price updates
        if (this.broadcastFunction) {
          this.broadcastFunction({
            type: 'priceUpdate',
            data: {
              id: crypto.id,
              symbol: coinData.symbol,
              name: coinData.name,
              currentPrice: coinData.currentPrice,
              priceChange24h: coinData.priceChange24h
            }
          });
        }
      } catch (error) {
        console.error(`Error processing ${coinData.symbol}:`, error);
      }
    }
  }

  async startPriceUpdates() {
    console.log('🚀 Starting real price updates with CoinCap API...');
    
    // Initial price fetch
    await this.fetchCryptoPrices();
    
    // Set interval for regular updates (every 30 seconds)
    this.updateInterval = setInterval(async () => {
      await this.fetchCryptoPrices();
    }, 30000);
    
    console.log('✅ Real market data updates started');
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
