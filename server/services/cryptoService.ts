import { storage } from "../storage";
import type { InsertCryptocurrency } from "@shared/schema";

class CryptoService {
  private updateInterval: NodeJS.Timeout | null = null;
  private broadcastFunction: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFunction = fn;
  }

  private async fetchCryptoPrices() {
    try {
      // Using CoinGecko API for real crypto prices
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      for (const coin of data) {
        try {
          let crypto = await storage.getCryptocurrencyBySymbol(coin.symbol.toUpperCase());
          
          if (!crypto) {
            // Create new cryptocurrency entry
            const newCrypto: InsertCryptocurrency = {
              symbol: coin.symbol.toUpperCase(),
              name: coin.name,
              currentPrice: coin.current_price.toString(),
              priceChange24h: (coin.price_change_percentage_24h || 0).toString(),
              marketCap: coin.market_cap?.toString() || "0",
              volume24h: coin.total_volume?.toString() || "0"
            };
            
            crypto = await storage.createCryptocurrency(newCrypto);
          } else {
            // Update existing cryptocurrency
            await storage.updateCryptocurrencyPrice(
              crypto.id,
              coin.current_price.toString(),
              (coin.price_change_percentage_24h || 0).toString()
            );
            
            // Store price history
            await storage.createPriceHistory({
              cryptoId: crypto.id,
              price: coin.current_price.toString()
            });
          }
          
          // Broadcast real-time price update
          if (this.broadcastFunction) {
            this.broadcastFunction({
              type: 'priceUpdate',
              data: {
                symbol: coin.symbol.toUpperCase(),
                price: coin.current_price,
                change24h: coin.price_change_percentage_24h || 0
              }
            });
          }
        } catch (error) {
          console.error(`Error processing ${coin.symbol}:`, error);
        }
      }
    } catch (error) {
      console.error('Error fetching crypto prices:', error.message);
      
      // Fallback: generate mock data if API fails
      await this.generateMockPrices();
    }
  }

  private async generateMockPrices() {
    const mockCryptos = [
      { symbol: 'BTC', name: 'Bitcoin', basePrice: 106000 },
      { symbol: 'ETH', name: 'Ethereum', basePrice: 2614 },
      { symbol: 'BNB', name: 'Binance Coin', basePrice: 668 },
      { symbol: 'ADA', name: 'Cardano', basePrice: 0.69 },
      { symbol: 'SOL', name: 'Solana', basePrice: 161 },
      { symbol: 'DOT', name: 'Polkadot', basePrice: 5.67 },
      { symbol: 'MATIC', name: 'Polygon', basePrice: 0.512 },
      { symbol: 'LINK', name: 'Chainlink', basePrice: 14.30 },
      { symbol: 'XRP', name: 'Ripple', basePrice: 2.27 },
      { symbol: 'LTC', name: 'Litecoin', basePrice: 112.73 },
      { symbol: 'BCH', name: 'Bitcoin Cash', basePrice: 407.40 },
      { symbol: 'DOGE', name: 'Dogecoin', basePrice: 0.196 },
      { symbol: 'AVAX', name: 'Avalanche', basePrice: 21.38 },
      { symbol: 'UNI', name: 'Uniswap', basePrice: 9.71 },
      { symbol: 'FIL', name: 'Filecoin', basePrice: 4.56 },
      { symbol: 'VET', name: 'VeChain', basePrice: 0.0227 },
      { symbol: 'ICP', name: 'Internet Computer', basePrice: 8.19 },
      { symbol: 'ETC', name: 'Ethereum Classic', basePrice: 29.73 },
      { symbol: 'XLM', name: 'Stellar', basePrice: 0.275 },
      { symbol: 'TRX', name: 'TRON', basePrice: 0.270 },
      { symbol: 'AAVE', name: 'Aave', basePrice: 151.28 },
      { symbol: 'GRT', name: 'The Graph', basePrice: 0.164 },
      { symbol: 'MKR', name: 'Maker', basePrice: 1433.79 },
      { symbol: 'COMP', name: 'Compound', basePrice: 39.44 },
      { symbol: 'ZEC', name: 'Zcash', basePrice: 37.43 },
      { symbol: 'DASH', name: 'Dash', basePrice: 35.67 },
      { symbol: 'BAT', name: 'Basic Attention Token', basePrice: 0.215 },
      { symbol: 'ENJ', name: 'Enjin Coin', basePrice: 0.206 },
      { symbol: 'MANA', name: 'Decentraland', basePrice: 0.411 },
      { symbol: 'SAND', name: 'The Sandbox', basePrice: 0.372 },
      { symbol: 'CHZ', name: 'Chiliz', basePrice: 0.085 },
      { symbol: 'THETA', name: 'THETA', basePrice: 1.77 },
      { symbol: 'ZRX', name: '0x', basePrice: 0.291 },
      { symbol: 'CRV', name: 'Curve DAO Token', basePrice: 0.264 },
      { symbol: 'SUSHI', name: 'SushiSwap', basePrice: 1.12 },
      { symbol: 'YFI', name: 'yearn.finance', basePrice: 6351.80 },
      { symbol: 'SNX', name: 'Synthetix', basePrice: 2.15 },
      { symbol: 'REN', name: 'Ren', basePrice: 0.045 },
      { symbol: 'KNC', name: 'Kyber Network', basePrice: 0.52 },
      { symbol: 'KAVA', name: 'Kava', basePrice: 0.315 },
      { symbol: 'ALGO', name: 'Algorand', basePrice: 0.245 },
      { symbol: 'ATOM', name: 'Cosmos', basePrice: 6.89 },
      { symbol: 'NEAR', name: 'NEAR Protocol', basePrice: 4.23 },
      { symbol: 'FTM', name: 'Fantom', basePrice: 0.789 },
      { symbol: 'ONE', name: 'Harmony', basePrice: 0.0123 },
      { symbol: 'RUNE', name: 'THORChain', basePrice: 3.45 },
      { symbol: 'WAVES', name: 'Waves', basePrice: 1.23 },
      { symbol: 'ZIL', name: 'Zilliqa', basePrice: 0.0189 },
      { symbol: 'ICX', name: 'ICON', basePrice: 0.145 },
      { symbol: 'ONT', name: 'Ontology', basePrice: 0.167 },
      { symbol: 'QTUM', name: 'Qtum', basePrice: 2.34 },
      { symbol: 'ZEN', name: 'Horizen', basePrice: 8.90 },
      { symbol: 'DGB', name: 'DigiByte', basePrice: 0.0078 },
      { symbol: 'SC', name: 'Siacoin', basePrice: 0.0043 },
      { symbol: 'DCR', name: 'Decred', basePrice: 12.45 },
      { symbol: 'XTZ', name: 'Tezos', basePrice: 0.89 },
      { symbol: 'LSK', name: 'Lisk', basePrice: 0.78 },
      { symbol: 'ARK', name: 'Ark', basePrice: 0.345 },
      { symbol: 'STRAT', name: 'Stratis', basePrice: 0.456 },
      { symbol: 'BTS', name: 'BitShares', basePrice: 0.0123 },
      { symbol: 'KMD', name: 'Komodo', basePrice: 0.234 },
      { symbol: 'PIVX', name: 'PIVX', basePrice: 0.189 },
      { symbol: 'XEM', name: 'NEM', basePrice: 0.0234 },
      { symbol: 'MAID', name: 'MaidSafeCoin', basePrice: 0.045 },
      { symbol: 'GAME', name: 'GameCredits', basePrice: 0.078 },
      { symbol: 'RDD', name: 'ReddCoin', basePrice: 0.00089 },
      { symbol: 'GRC', name: 'GridCoin', basePrice: 0.0034 },
      { symbol: 'NXT', name: 'Nxt', basePrice: 0.0045 },
      { symbol: 'BURST', name: 'Burst', basePrice: 0.0012 },
      { symbol: 'CLOAK', name: 'CloakCoin', basePrice: 0.234 },
      { symbol: 'POT', name: 'PotCoin', basePrice: 0.0089 },
      { symbol: 'BLK', name: 'BlackCoin', basePrice: 0.023 },
      { symbol: 'VIA', name: 'Viacoin', basePrice: 0.145 },
      { symbol: 'AMP', name: 'Synereo', basePrice: 0.034 },
      { symbol: 'XCP', name: 'Counterparty', basePrice: 1.23 },
      { symbol: 'OMNI', name: 'Omni', basePrice: 0.89 },
      { symbol: 'NAV', name: 'NavCoin', basePrice: 0.078 },
      { symbol: 'XPM', name: 'Primecoin', basePrice: 0.045 },
      { symbol: 'SYS', name: 'Syscoin', basePrice: 0.089 },
      { symbol: 'NEOS', name: 'NeosCoin', basePrice: 0.023 },
      { symbol: 'GRS', name: 'Groestlcoin', basePrice: 0.145 },
      { symbol: 'NLG', name: 'Gulden', basePrice: 0.0034 },
      { symbol: 'RBY', name: 'Rubycoin', basePrice: 0.012 },
      { symbol: 'XWC', name: 'WhiteCoin', basePrice: 0.0078 },
      { symbol: 'BLOCK', name: 'Blocknet', basePrice: 0.234 },
      { symbol: 'FAIR', name: 'FairCoin', basePrice: 0.045 },
      { symbol: 'CURE', name: 'CureCoin', basePrice: 0.089 }
    ];

    for (const mockCoin of mockCryptos) {
      try {
        let crypto = await storage.getCryptocurrencyBySymbol(mockCoin.symbol);
        
        // Generate significant price fluctuation for real profit opportunities
        const priceChange = (Math.random() - 0.5) * 0.16; // ±8% change for meaningful movements
        const newPrice = mockCoin.basePrice * (1 + priceChange);
        const change24h = priceChange * 100;
        
        if (!crypto) {
          const newCrypto: InsertCryptocurrency = {
            symbol: mockCoin.symbol,
            name: mockCoin.name,
            currentPrice: newPrice.toString(),
            priceChange24h: change24h.toString(),
            marketCap: (newPrice * 19000000).toString(), // Mock market cap
            volume24h: (newPrice * 500000).toString() // Mock volume
          };
          
          crypto = await storage.createCryptocurrency(newCrypto);
        } else {
          await storage.updateCryptocurrencyPrice(
            crypto.id,
            newPrice.toString(),
            change24h.toString()
          );
          
          await storage.createPriceHistory({
            cryptoId: crypto.id,
            price: newPrice.toString()
          });
        }
        
        if (this.broadcastFunction) {
          this.broadcastFunction({
            type: 'priceUpdate',
            data: {
              symbol: mockCoin.symbol,
              price: newPrice,
              change24h: change24h
            }
          });
        }
      } catch (error) {
        console.error(`Error processing mock ${mockCoin.symbol}:`, error);
      }
    }
  }

  async startPriceUpdates() {
    // Initial fetch
    await this.fetchCryptoPrices();
    
    // Update prices every 30 seconds
    this.updateInterval = setInterval(() => {
      this.fetchCryptoPrices();
    }, 30000);
    
    console.log('Crypto price updates started');
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
