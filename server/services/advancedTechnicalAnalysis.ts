import { binanceService } from './binanceService';

export interface TechnicalIndicators {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; position: number } | null;
  stochastic: { k: number; d: number } | null;
  ema: { ema12: number; ema26: number; ema50: number } | null;
  volume: { sma: number; ratio: number } | null;
  momentum: number | null;
  williamsR: number | null;
}

export interface MarketSignal {
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  confidence: number;
  indicators: string[];
  score: number;
}

export class AdvancedTechnicalAnalysis {
  
  async getComprehensiveAnalysis(symbol: string): Promise<{ indicators: TechnicalIndicators; signal: MarketSignal }> {
    try {
      const priceData = await binanceService.getKlineData(symbol, '1h', 100);
      if (priceData.length < 50) {
        throw new Error('Insufficient price data for analysis');
      }

      const indicators = await this.calculateAllIndicators(priceData);
      const signal = this.generateMarketSignal(indicators);

      return { indicators, signal };
    } catch (error) {
      console.log(`Failed to get analysis for ${symbol}:`, error);
      return {
        indicators: this.getEmptyIndicators(),
        signal: { signal: 'hold', confidence: 0, indicators: [], score: 0 }
      };
    }
  }

  private async calculateAllIndicators(prices: number[]): Promise<TechnicalIndicators> {
    return {
      rsi: this.calculateRSI(prices, 14),
      macd: this.calculateMACD(prices),
      bollinger: this.calculateBollingerBands(prices, 20),
      stochastic: this.calculateStochastic(prices, 14),
      ema: this.calculateEMAs(prices),
      volume: null, // Volume data would need additional API calls
      momentum: this.calculateMomentum(prices, 10),
      williamsR: this.calculateWilliamsR(prices, 14)
    };
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    if (gains.length < period) return null;

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } | null {
    if (prices.length < 26) return null;

    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    
    if (!ema12 || !ema26) return null;

    const macdLine = ema12 - ema26;
    const macdHistory = [];
    
    // Calculate MACD for last 9 periods to get signal line
    for (let i = Math.max(0, prices.length - 9); i < prices.length; i++) {
      const slice = prices.slice(0, i + 1);
      if (slice.length >= 26) {
        const ema12_i = this.calculateEMA(slice, 12);
        const ema26_i = this.calculateEMA(slice, 26);
        if (ema12_i && ema26_i) {
          macdHistory.push(ema12_i - ema26_i);
        }
      }
    }

    const signalLine = macdHistory.length >= 9 ? this.calculateEMA(macdHistory, 9) || 0 : 0;
    const histogram = macdLine - signalLine;

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  private calculateBollingerBands(prices: number[], period: number = 20): { upper: number; middle: number; lower: number; position: number } | null {
    if (prices.length < period) return null;

    const recentPrices = prices.slice(-period);
    const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
    
    const variance = recentPrices.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const currentPrice = prices[prices.length - 1];
    const upper = sma + (2 * stdDev);
    const lower = sma - (2 * stdDev);
    
    // Position: 0 = at lower band, 0.5 = at middle, 1 = at upper band
    const position = (currentPrice - lower) / (upper - lower);

    return {
      upper,
      middle: sma,
      lower,
      position: Math.max(0, Math.min(1, position))
    };
  }

  private calculateStochastic(prices: number[], period: number = 14): { k: number; d: number } | null {
    if (prices.length < period) return null;

    const recentPrices = prices.slice(-period);
    const currentPrice = prices[prices.length - 1];
    const highest = Math.max(...recentPrices);
    const lowest = Math.min(...recentPrices);

    if (highest === lowest) return { k: 50, d: 50 };

    const k = ((currentPrice - lowest) / (highest - lowest)) * 100;
    
    // Simple D calculation (3-period SMA of K)
    const kValues = [];
    for (let i = Math.max(0, prices.length - 3); i < prices.length; i++) {
      const slice = prices.slice(Math.max(0, i - period + 1), i + 1);
      if (slice.length === period) {
        const h = Math.max(...slice);
        const l = Math.min(...slice);
        const p = prices[i];
        if (h !== l) {
          kValues.push(((p - l) / (h - l)) * 100);
        }
      }
    }

    const d = kValues.length > 0 ? kValues.reduce((a, b) => a + b, 0) / kValues.length : k;

    return { k, d };
  }

  private calculateEMAs(prices: number[]): { ema12: number; ema26: number; ema50: number } | null {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const ema50 = this.calculateEMA(prices, 50);

    if (!ema12 || !ema26 || !ema50) return null;

    return { ema12, ema26, ema50 };
  }

  private calculateEMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateMomentum(prices: number[], period: number = 10): number | null {
    if (prices.length < period + 1) return null;

    const currentPrice = prices[prices.length - 1];
    const pastPrice = prices[prices.length - 1 - period];
    
    return ((currentPrice - pastPrice) / pastPrice) * 100;
  }

  private calculateWilliamsR(prices: number[], period: number = 14): number | null {
    if (prices.length < period) return null;

    const recentPrices = prices.slice(-period);
    const currentPrice = prices[prices.length - 1];
    const highest = Math.max(...recentPrices);
    const lowest = Math.min(...recentPrices);

    if (highest === lowest) return -50;

    return ((highest - currentPrice) / (highest - lowest)) * -100;
  }

  private generateMarketSignal(indicators: TechnicalIndicators): MarketSignal {
    const signals: string[] = [];
    let score = 0;
    let totalWeight = 0;

    // RSI Analysis (Weight: 20)
    if (indicators.rsi !== null) {
      totalWeight += 20;
      if (indicators.rsi < 30) {
        score += 20;
        signals.push('RSI Oversold');
      } else if (indicators.rsi < 40) {
        score += 15;
        signals.push('RSI Low');
      } else if (indicators.rsi > 70) {
        score -= 20;
        signals.push('RSI Overbought');
      } else if (indicators.rsi > 60) {
        score -= 10;
        signals.push('RSI High');
      }
    }

    // MACD Analysis (Weight: 25)
    if (indicators.macd) {
      totalWeight += 25;
      if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
        score += 25;
        signals.push('MACD Bullish');
      } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
        score -= 25;
        signals.push('MACD Bearish');
      }
    }

    // Bollinger Bands Analysis (Weight: 15)
    if (indicators.bollinger) {
      totalWeight += 15;
      if (indicators.bollinger.position < 0.2) {
        score += 15;
        signals.push('Near Lower Bollinger');
      } else if (indicators.bollinger.position > 0.8) {
        score -= 15;
        signals.push('Near Upper Bollinger');
      }
    }

    // Stochastic Analysis (Weight: 15)
    if (indicators.stochastic) {
      totalWeight += 15;
      if (indicators.stochastic.k < 20 && indicators.stochastic.d < 20) {
        score += 15;
        signals.push('Stochastic Oversold');
      } else if (indicators.stochastic.k > 80 && indicators.stochastic.d > 80) {
        score -= 15;
        signals.push('Stochastic Overbought');
      }
    }

    // EMA Trend Analysis (Weight: 15)
    if (indicators.ema) {
      totalWeight += 15;
      if (indicators.ema.ema12 > indicators.ema.ema26 && indicators.ema.ema26 > indicators.ema.ema50) {
        score += 15;
        signals.push('EMA Uptrend');
      } else if (indicators.ema.ema12 < indicators.ema.ema26 && indicators.ema.ema26 < indicators.ema.ema50) {
        score -= 15;
        signals.push('EMA Downtrend');
      }
    }

    // Williams %R Analysis (Weight: 10)
    if (indicators.williamsR !== null) {
      totalWeight += 10;
      if (indicators.williamsR < -80) {
        score += 10;
        signals.push('Williams %R Oversold');
      } else if (indicators.williamsR > -20) {
        score -= 10;
        signals.push('Williams %R Overbought');
      }
    }

    // Normalize score
    const normalizedScore = totalWeight > 0 ? (score / totalWeight) * 100 : 0;
    const confidence = Math.abs(normalizedScore);

    let signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    
    if (normalizedScore > 60) {
      signal = 'strong_buy';
    } else if (normalizedScore > 20) {
      signal = 'buy';
    } else if (normalizedScore > -20) {
      signal = 'hold';
    } else if (normalizedScore > -60) {
      signal = 'sell';
    } else {
      signal = 'strong_sell';
    }

    return {
      signal,
      confidence: Math.min(100, confidence),
      indicators: signals,
      score: normalizedScore
    };
  }

  private getEmptyIndicators(): TechnicalIndicators {
    return {
      rsi: null,
      macd: null,
      bollinger: null,
      stochastic: null,
      ema: null,
      volume: null,
      momentum: null,
      williamsR: null
    };
  }
}

export const advancedTechnicalAnalysis = new AdvancedTechnicalAnalysis();