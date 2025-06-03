import { storage } from "../storage";
import type { InsertCryptocurrency } from "@shared/schema";

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    // Binance API connection has issues - system paused until proper configuration
    console.log('Crypto price updates paused - Binance testnet API connection requires troubleshooting');
    return;
  }

  // Mock data generation removed - using only Binance testnet API

  async startPriceUpdates() {
    console.log('Price updates disabled - Binance testnet API connection needs configuration');
    // All automatic updates stopped until API connection is properly established
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
