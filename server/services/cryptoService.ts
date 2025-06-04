import { storage } from '../storage';
import { InsertCryptocurrency } from '@shared/schema';

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    const { binanceService } = await import("./binanceService");
    
    let marketData;
    try {
      marketData = await binanceService.getRealMarketData();
      
      if (!marketData) {
        console.log('⏳ Binance Testnet temporarily unavailable - waiting for service restoration');
        return;
      }
    } catch (error) {
      console.log('🚨 Binance API failed - stopping price updates');
      this.stopPriceUpdates();
      return;
    }

    console.log(`📊 Processing ${marketData.length} real cryptocurrencies from market data`);

    for (const coinData of marketData) {
      try {
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
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            coinData.currentPrice.toString(),
            coinData.priceChange24h.toString()
          );
        }

        await storage.createPriceHistory({
          cryptoId: crypto.id,
          price: coinData.currentPrice.toString()
        });

      } catch (error) {
        console.error(`Error processing ${coinData.symbol}:`, error);
      }
    }

    if (this.broadcastFunction) {
      this.broadcastFunction({
        type: 'cryptoUpdate',
        data: marketData
      });
    }
  }

  async startPriceUpdates() {
    console.log('🚀 Starting real price updates with CoinCap API...');
    
    await this.fetchCryptoPrices();
    
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