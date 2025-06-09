import { storage } from '../storage';
import { telegramService } from './telegramService';
import { binanceService } from './binanceService';
import type { InsertTrade } from '@shared/schema';

export class EmaRsiStrategy {
    private broadcastFn: ((data: any) => void) | null = null;
    private tradingInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    setBroadcastFunction(fn: ((data: any) => void) | null) {
        this.broadcastFn = fn;
    }

    async startContinuousTrading(userId: number): Promise<void> {
        if (this.isRunning) {
            console.log('🔄 Trading strategy already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Starting Enhanced Multi-Indicator Trading Strategy');

        // Execute immediately
        await this.executeAdvancedStrategy(userId);

        // Set up continuous execution every 45 seconds for better timing
        this.tradingInterval = setInterval(async () => {
            try {
                const botSettings = await storage.getBotSettings(userId);
                if (botSettings?.isActive) {
                    await this.executeAdvancedStrategy(userId);
                } else {
                    this.stopContinuousTrading();
                }
            } catch (error) {
                console.error('Trading interval error:', error);
            }
        }, 45000); // 45 seconds for optimal market timing
    }

    stopContinuousTrading(): void {
        if (this.tradingInterval) {
            clearInterval(this.tradingInterval);
            this.tradingInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 Stopped advanced trading strategy');
    }

    async executeAdvancedStrategy(userId: number): Promise<void> {
        const user = await storage.getUser(userId);
        if (!user) return;

        const balance = parseFloat(user.balance);
        const portfolio = await storage.getUserPortfolio(userId);

        console.log(`🎯 Advanced Strategy - Balance: $${balance.toFixed(2)}`);
        console.log(`📊 Portfolio Positions: ${portfolio.length}`);

        // Check target profit limit
        const botSettings = await storage.getBotSettings(userId);
        if (botSettings && botSettings.targetProfit) {
            const targetMaxBalance = parseFloat(botSettings.targetProfit);

            let portfolioValue = 0;
            for (const item of portfolio) {
                const crypto = await storage.getCryptocurrency(item.cryptoId);
                if (crypto) {
                    portfolioValue += parseFloat(item.amount) * parseFloat(crypto.currentPrice);
                }
            }

            const totalBalance = balance + portfolioValue;

            if (totalBalance >= targetMaxBalance) {
                console.log(`🎯 TARGET REACHED! Selling all and stopping bot.`);
                await this.sellAllPortfolio(userId);
                await storage.updateBotSettings(userId, { isActive: false });
                this.stopContinuousTrading();

                const { telegramService } = await import('./telegramService');
                await telegramService.sendTargetReachedNotification(targetMaxBalance, totalBalance);
                return;
            }
        }

        // Get real market data
        const { binanceService } = await import('./binanceService');
        console.log('📡 Fetching enhanced market data...');

        const marketData = await binanceService.getRealMarketData();
        if (!marketData) {
            console.log('🚨 Market data unavailable - stopping bot');
            await storage.updateBotSettings(userId, { isActive: false });
            this.stopContinuousTrading();
            return;
        }

        // Store real-time data with enhanced processing
        const enhancedCryptos = [];
        for (const coin of marketData) {
            try {
                let crypto = await storage.getCryptocurrencyBySymbol(coin.symbol);

                if (!crypto) {
                    crypto = await storage.createCryptocurrency({
                        symbol: coin.symbol,
                        name: coin.name,
                        currentPrice: coin.currentPrice.toString(),
                        priceChange24h: coin.priceChange24h.toString()
                    });
                } else {
                    await storage.updateCryptocurrencyPrice(
                        crypto.id,
                        coin.currentPrice.toString(),
                        coin.priceChange24h.toString()
                    );
                    crypto.currentPrice = coin.currentPrice.toString();
                    crypto.priceChange24h = coin.priceChange24h.toString();
                }

                enhancedCryptos.push(crypto);
            } catch (error: any) {
                if (error.code === '23505') {
                    const existingCrypto = await storage.getCryptocurrencyBySymbol(coin.symbol);
                    if (existingCrypto) {
                        await storage.updateCryptocurrencyPrice(
                            existingCrypto.id,
                            coin.currentPrice.toString(),
                            coin.priceChange24h.toString()
                        );
                        existingCrypto.currentPrice = coin.currentPrice.toString();
                        existingCrypto.priceChange24h = coin.priceChange24h.toString();
                        enhancedCryptos.push(existingCrypto);
                    }
                }
            }
        }

        console.log(`💾 Enhanced analysis on ${enhancedCryptos.length} cryptocurrencies`);

        // Advanced sell signals with multiple profit-taking strategies
        await this.checkAdvancedSellSignals(userId, portfolio, enhancedCryptos);

        // Multi-indicator buy signals for optimal entries
        if (balance > 1.0) {
            await this.checkAdvancedBuySignals(userId, enhancedCryptos, balance);
        }
    }

    private async checkAdvancedSellSignals(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
        console.log(`🔍 Advanced Sell Analysis for ${portfolio.length} positions`);

        for (const position of portfolio) {
            const crypto = cryptos.find(c => c.id === position.cryptoId);
            if (!crypto) continue;

            const currentPrice = parseFloat(crypto.currentPrice);
            const avgPrice = parseFloat(position.averagePrice);
            const amount = parseFloat(position.amount);

            // Enhanced commission calculation with spread consideration
            const totalCommission = 0.002; // 0.2% total fees
            const spreadCost = 0.001; // 0.1% spread estimate
            const totalCost = totalCommission + spreadCost; // 0.3% total cost

            const breakEvenPrice = avgPrice * (1 + totalCost);
            const netProfitPercent = ((currentPrice - breakEvenPrice) / breakEvenPrice) * 100;
            const grossProfit = ((currentPrice - avgPrice) / avgPrice) * 100;

            console.log(`💰 ${crypto.symbol}: Price: $${currentPrice.toFixed(6)}, Avg: $${avgPrice.toFixed(6)}`);
            console.log(`📊 Gross: ${grossProfit.toFixed(2)}%, Net: ${netProfitPercent.toFixed(2)}%`);

            const analysis = await this.performAdvancedAnalysis(crypto);

            if (analysis) {
                const positionValue = currentPrice * amount;
                const netProfitDollar = positionValue * (1 - 0.001) - parseFloat(position.totalInvested);

                let shouldSell = false;
                let sellReason = '';
                let sellPercentage = 0.95; // Default 95% sell

                // Multi-tier profit taking strategy
                if (netProfitPercent >= 15) {
                    shouldSell = true;
                    sellPercentage = 1.0; // Sell 100% on very high profit
                    sellReason = `Exceptional profit target - ${netProfitPercent.toFixed(2)}% net gain`;
                } else if (netProfitPercent >= 8 && analysis.momentum < -0.3) {
                    shouldSell = true;
                    sellPercentage = 0.8; // Partial sell on momentum loss
                    sellReason = `High profit + momentum loss - ${netProfitPercent.toFixed(2)}% gain`;
                } else if (netProfitPercent >= 5 && analysis.volatilitySignal === 'HIGH_RISK') {
                    shouldSell = true;
                    sellPercentage = 0.75;
                    sellReason = `Profit protection in high volatility - ${netProfitPercent.toFixed(2)}%`;
                } else if (netProfitPercent >= 3.5 && analysis.compositeScore <= 2) {
                    shouldSell = true;
                    sellPercentage = 0.9;
                    sellReason = `Good profit + weak signals - ${netProfitPercent.toFixed(2)}%`;
                } else if (netProfitDollar >= 0.50 && analysis.rsi > 75) {
                    shouldSell = true;
                    sellPercentage = 0.85;
                    sellReason = `Dollar profit target + overbought - $${netProfitDollar.toFixed(3)}`;
                } else if (analysis.signal === 'STRONG_SELL' && netProfitPercent > 1.5) {
                    shouldSell = true;
                    sellPercentage = 0.9;
                    sellReason = `Strong sell signal + profitable - ${netProfitPercent.toFixed(2)}%`;
                } else if (netProfitPercent >= 2.0 && analysis.trendscore < 3) {
                    shouldSell = true;
                    sellPercentage = 0.8;
                    sellReason = `Trend weakening + decent profit - ${netProfitPercent.toFixed(2)}%`;
                }

                // Advanced trailing stop using volatility-adjusted levels
                const volatilityFactor = Math.max(0.02, Math.min(0.08, Math.abs(parseFloat(crypto.priceChange24h || '0')) * 0.001));
                const trailingStopLevel = avgPrice * (1 + totalCost + volatilityFactor);

                if (currentPrice < trailingStopLevel && netProfitPercent > 1.0) {
                    shouldSell = true;
                    sellPercentage = 0.9;
                    sellReason = `Volatility-adjusted trailing stop - ${netProfitPercent.toFixed(2)}%`;
                }

                if (shouldSell) {
                    const sellAmount = amount * sellPercentage;

                    console.log(`🔴 ADVANCED SELL: ${crypto.symbol} - ${sellReason}`);
                    console.log(`💰 Selling ${(sellPercentage * 100).toFixed(0)}% (${sellAmount.toFixed(6)}) at $${currentPrice.toFixed(6)}`);
                    console.log(`📊 Net profit: ${netProfitPercent.toFixed(2)}%`);

                    await this.executeSellOrder(userId, crypto, sellAmount, sellReason, position);
                    telegramService.sendProfitAlert(netProfitPercent, crypto.symbol);
                } else {
                    console.log(`⚪ HOLD: ${crypto.symbol} - Score: ${analysis.compositeScore}/10`);
                    console.log(`   Net P&L: ${netProfitPercent.toFixed(2)}%, Momentum: ${analysis.momentum.toFixed(2)}`);
                }
            }
        }
    }

    private async checkAdvancedBuySignals(userId: number, cryptos: any[], balance: number): Promise<void> {
        const opportunities = [];

        console.log(`🔍 Enhanced Profit-Focused Analysis on ${cryptos.length} assets`);

        for (const crypto of cryptos) {
            const analysis = await this.performAdvancedAnalysis(crypto);

            // More strict criteria for profitable coin selection
            if (analysis && analysis.signal === 'STRONG_BUY') {
                const momentum = analysis.momentum;
                const volatility = analysis.volatility;
                const trendscore = analysis.trendscore;
                const priceChange24h = parseFloat(crypto.priceChange24h || '0');

                // Enhanced profit-focused scoring with stricter requirements
                const profitPotentialScore = (
                    analysis.compositeScore * 3 +           // Weight composite score more
                    momentum * 15 +                         // Higher momentum weight
                    (trendscore > 7 ? trendscore * 2 : 0) + // Bonus for strong trends
                    (analysis.volume_strength * 8) +        // Volume is critical
                    (analysis.market_structure * 5) +
                    (Math.abs(priceChange24h) > 3 ? 5 : 0) + // Bonus for higher volatility
                    (analysis.rsi < 25 ? 8 : 0) +           // Big bonus for oversold
                    (analysis.confidence > 0.85 ? 10 : 0)   // Bonus for high confidence
                );

                // More flexible criteria for better trading opportunities
                const meetsStrictCriteria = (
                    analysis.confidence > 0.65 &&           // Reduced confidence threshold
                    momentum > 0.2 &&                       // Lower momentum requirement
                    trendscore >= 5 &&                      // Reduced trend requirement
                    analysis.volume_strength > 1.0 &&       // Lower volume requirement
                    analysis.compositeScore >= 6.5 &&       // Lower composite score
                    volatility >= 2 && volatility <= 18     // Wider volatility range
                );

                if (meetsStrictCriteria) {
                    opportunities.push({
                        crypto,
                        analysis,
                        score: profitPotentialScore,
                        confidence: analysis.confidence,
                        profitPotential: this.calculateProfitPotential(analysis, priceChange24h)
                    });

                    console.log(`💎 HIGH-PROFIT Opportunity: ${crypto.symbol} - Score: ${profitPotentialScore.toFixed(1)}, Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
                    console.log(`   Momentum: ${momentum.toFixed(2)}, Trend: ${trendscore}/10, Volume: ${analysis.volume_strength.toFixed(2)}`);
                }
            }
        }

        // Sort by profit potential score (highest first)
        opportunities.sort((a, b) => b.score - a.score);

        // Only take the absolute best opportunities
        const topOpportunities = opportunities.slice(0, Math.min(3, opportunities.length));
        const usableBalance = balance * 0.90; // Use 90% of balance for high-conviction trades

        console.log(`🎯 Executing ONLY TOP ${topOpportunities.length} highest-profit opportunities from ${opportunities.length} candidates`);

        for (let i = 0; i < topOpportunities.length; i++) {
            const opp = topOpportunities[i];

            // Aggressive position sizing for highest conviction trades
            let positionSize = 0.20; // Base 20% for top picks

            if (opp.confidence > 0.9 && opp.analysis.momentum > 0.6) {
                positionSize = 0.35; // 35% for exceptional opportunities
            } else if (opp.confidence > 0.85 && opp.analysis.trendscore >= 8) {
                positionSize = 0.30; // 30% for very strong signals
            } else if (opp.score > 50) {
                positionSize = 0.25; // 25% for high-scoring opportunities
            }

            const investAmount = Math.min(usableBalance * positionSize, 2.0); // Max $2.0 per trade
            const commissionBuffer = 1.003; // Minimal buffer for high-conviction trades
            const finalAmount = investAmount / commissionBuffer;

            // Higher minimum investment for quality focus
            if (finalAmount >= 0.30 && usableBalance >= 0.60 && opp.confidence > 0.75) {
                console.log(`💎 HIGH-PROFIT BUY: ${opp.crypto.symbol}`);
                console.log(`   Profit Score: ${opp.score.toFixed(1)}, Confidence: ${(opp.confidence * 100).toFixed(0)}%`);
                console.log(`   Investment: $${finalAmount.toFixed(3)}, Expected Return: ${(opp.profitPotential * 100).toFixed(1)}%`);
                console.log(`   RSI: ${opp.analysis.rsi}, Momentum: ${opp.analysis.momentum.toFixed(2)}, Trend: ${opp.analysis.trendscore}/10`);

                // Enhanced buy reason logging for profit focus
                this.logProfitFocusedBuySignals(opp.crypto.symbol, opp.analysis, finalAmount, opp.score, opp.confidence, opp.profitPotential);

                await this.executeBuyOrder(userId, opp.crypto, finalAmount,
                    `Profit-Focused Strategy - Score:${opp.score.toFixed(1)} ExpectedReturn:${(opp.profitPotential*100).toFixed(1)}%`);
                balance -= finalAmount;
            }
        }

        if (topOpportunities.length === 0) {
            console.log(`⚠️ No coins meet strict profit criteria - waiting for better opportunities`);
        }
    }

    private async performAdvancedAnalysis(crypto: any): Promise<any> {
        try {
            const currentPrice = parseFloat(crypto.currentPrice);
            const priceChange24h = parseFloat(crypto.priceChange24h || '0');
            const volume24h = parseFloat(crypto.volume24h || '0');

            // Enhanced RSI calculation with dynamic periods
            let rsi = this.calculateDynamicRSI(priceChange24h);

            // Advanced momentum analysis
            const momentum = this.calculateMomentumScore(priceChange24h);

            // NEW: MACD-like momentum analysis
            const macdSignal = this.calculateMACDSignal(priceChange24h, momentum);

            // NEW: Fibonacci retracement levels
            const fibLevels = this.calculateFibonacciLevels(currentPrice, priceChange24h);

            // Volatility analysis with Bollinger Band concept
            const volatility = Math.abs(priceChange24h);
            const bollingerPosition = this.calculateBollingerPosition(priceChange24h, volatility);

            let volatilitySignal = 'NORMAL';
            if (volatility > 15) volatilitySignal = 'HIGH_RISK';
            else if (volatility > 8) volatilitySignal = 'HIGH';
            else if (volatility < 2) volatilitySignal = 'LOW';

            // Market structure analysis
            const marketStructure = this.analyzeMarketStructure(priceChange24h, volatility);

            // Volume strength analysis with whale detection
            const volumeStrength = this.calculateVolumeStrength(volume24h, priceChange24h);
            const whaleActivity = this.detectWhaleActivity(volume24h, priceChange24h);

            // Enhanced trend strength scoring (1-10)
            const trendscore = this.calculateTrendScore(priceChange24h, volatility, momentum, macdSignal);

            // Support/Resistance levels with Fibonacci
            const levels = this.calculateKeyLevels(currentPrice, priceChange24h, fibLevels);

            // Enhanced signal conditions for higher profit potential
            const buyConditions = {
                rsi_oversold: rsi < 30,
                rsi_deep_oversold: rsi < 25,                // Extra strong signal
                momentum_positive: momentum > 0.2,
                momentum_strong: momentum > 0.4,            // Stronger momentum
                momentum_explosive: momentum > 0.6,         // Explosive momentum
                macd_bullish: macdSignal > 0.3,
                macd_strong_bullish: macdSignal > 0.5,      // Very bullish MACD
                fibonacci_support: fibLevels.nearSupport,
                bollinger_oversold: bollingerPosition < -1.5,
                bollinger_deep_oversold: bollingerPosition < -2.0, // Deeper oversold
                volume_surge: volumeStrength > 1.5,
                volume_explosion: volumeStrength > 2.5,     // Volume explosion
                whale_accumulation: whaleActivity > 0.5,
                whale_strong_accumulation: whaleActivity > 0.8, // Strong whale activity
                trend_strong: trendscore >= 6,
                trend_dominant: trendscore >= 8,            // Dominant trend
                volatility_ok: volatility >= 2 && volatility <= 12,
                volatility_optimal: volatility >= 4 && volatility <= 8, // Optimal range
                structure_bullish: marketStructure > 0.3,
                structure_very_bullish: marketStructure > 0.5, // Very bullish structure
                support_level: currentPrice <= levels.support * 1.02,
                breakout_potential: priceChange24h > -2 && rsi < 40,
                strong_breakout: priceChange24h > 1 && momentum > 0.3, // Active breakout
                golden_cross: this.checkGoldenCross(priceChange24h, momentum),
                high_profit_setup: (rsi < 30 && momentum > 0.4 && trendscore >= 7), // Combined high profit
                exceptional_opportunity: (rsi < 25 && momentum > 0.5 && volumeStrength > 2.0) // Exceptional setup
            };

            const sellConditions = {
                rsi_overbought: rsi > 70,
                momentum_negative: momentum < -0.3,
                macd_bearish: macdSignal < -0.3,
                fibonacci_resistance: fibLevels.nearResistance,
                bollinger_overbought: bollingerPosition > 1.5,
                volume_weak: volumeStrength < 0.8,
                whale_distribution: whaleActivity < -0.5,
                trend_weak: trendscore <= 3,
                volatility_high: volatility > 15,
                structure_bearish: marketStructure < -0.3,
                resistance_level: currentPrice >= levels.resistance * 0.98,
                death_cross: this.checkDeathCross(priceChange24h, momentum)
            };

            // Composite scoring system
            const buyScore = Object.values(buyConditions).filter(Boolean).length;
            const sellScore = Object.values(sellConditions).filter(Boolean).length;

            // Overall composite score (1-10)
            const compositeScore = Math.min(10, Math.max(1,
                (buyScore * 1.2) - (sellScore * 0.8) + (trendscore * 0.3) + (momentum * 5)
            ));

            // Enhanced signal determination focused on high-profit opportunities
            let signal = 'HOLD';
            let confidence = 0;

            // Check for exceptional profit opportunities first
            if (buyConditions.exceptional_opportunity && compositeScore >= 8.5) {
                signal = 'STRONG_BUY';
                confidence = Math.min(0.98, (buyScore + trendscore + momentum * 8) / 18);
            }
            // High profit setup with strict requirements
            else if (buyConditions.high_profit_setup && buyScore >= 7 && sellScore <= 1) {
                signal = 'STRONG_BUY';
                confidence = Math.min(0.95, (buyScore + trendscore + momentum * 6) / 16);
            }
            // Standard strong buy with higher thresholds
            else if (buyScore >= 6 && sellScore <= 2 && compositeScore >= 7.5) {
                signal = 'STRONG_BUY';
                confidence = Math.min(0.92, (buyScore + trendscore + momentum * 5) / 15);
            }
            // Regular buy with stricter criteria
            else if (buyScore >= 5 && compositeScore >= 7 && momentum > 0.3) {
                signal = 'BUY';
                confidence = (buyScore + trendscore + momentum * 3) / 13;
            }
            // Sell signals remain the same
            else if (sellScore >= 4 && compositeScore <= 4) {
                signal = 'STRONG_SELL';
                confidence = (sellScore + (10 - trendscore)) / 12;
            } else if (sellScore >= 3) {
                signal = 'SELL';
                confidence = sellScore / 8;
            }

            return {
                signal,
                confidence,
                rsi,
                momentum,
                volatility,
                volatilitySignal,
                trendscore,
                marketStructure,
                volumeStrength,
                compositeScore,
                buyConditions,
                sellConditions,
                buyScore,
                sellScore,
                levels,
                market_structure: marketStructure,
                volume_strength: volumeStrength,
                price_change: priceChange24h
            };
        } catch (error) {
            console.log(`❌ Advanced analysis error for ${crypto.symbol}:`, error);
            return null;
        }
    }

    private calculateDynamicRSI(priceChange: number): number {
        // Enhanced RSI calculation based on price momentum
        let rsi = 50;

        if (priceChange > 10) rsi = 85;
        else if (priceChange > 7) rsi = 78;
        else if (priceChange > 4) rsi = 70;
        else if (priceChange > 2) rsi = 62;
        else if (priceChange > 0.5) rsi = 55;
        else if (priceChange > 0) rsi = 52;
        else if (priceChange > -0.5) rsi = 48;
        else if (priceChange > -2) rsi = 38;
        else if (priceChange > -4) rsi = 30;
        else if (priceChange > -7) rsi = 22;
        else rsi = 15;

        return rsi;
    }

    private calculateMomentumScore(priceChange: number): number {
        // Momentum score from -1 to +1
        return Math.max(-1, Math.min(1, priceChange / 10));
    }

    private analyzeMarketStructure(priceChange: number, volatility: number): number {
        // Market structure score from -1 to +1
        const structuralStrength = (priceChange / Math.max(1, volatility)) * 0.1;
        return Math.max(-1, Math.min(1, structuralStrength));
    }

    private calculateVolumeStrength(volume: number, priceChange: number): number {
        // Volume strength relative to price movement
        const baseVolume = 1000000;
        const volumeRatio = volume / baseVolume;
        const priceVolumeAlignment = Math.abs(priceChange) * volumeRatio * 0.1;
        return Math.max(0.1, Math.min(3.0, priceVolumeAlignment || 1.0));
    }

    private calculateTrendScore(priceChange: number, volatility: number, momentum: number, macdSignal: number = 0): number {
        // Enhanced trend strength score 1-10
        const baseScore = 5;
        const priceScore = (priceChange > 0 ? 1 : -1) * Math.min(3, Math.abs(priceChange) * 0.3);
        const volatilityScore = volatility > 10 ? -1 : (volatility < 3 ? -0.5 : 0);
        const momentumScore = momentum * 2;
        const macdScore = macdSignal * 1.5; // MACD contribution

        return Math.max(1, Math.min(10, baseScore + priceScore + volatilityScore + momentumScore + macdScore));
    }

    // NEW: MACD-like signal calculation
    private calculateMACDSignal(priceChange: number, momentum: number): number {
        const ema12 = priceChange * 0.7 + momentum * 0.3;
        const ema26 = priceChange * 0.3 + momentum * 0.7;
        const macdLine = ema12 - ema26;
        const signalLine = macdLine * 0.6; // Simplified signal line
        return (macdLine - signalLine) * 10; // Histogram-like value
    }

    // NEW: Fibonacci retracement levels
    private calculateFibonacciLevels(currentPrice: number, priceChange: number): any {
        const high = currentPrice * (1 + Math.abs(priceChange) * 0.01);
        const low = currentPrice * (1 - Math.abs(priceChange) * 0.01);
        const range = high - low;

        const fib618 = high - (range * 0.618);
        const fib382 = high - (range * 0.382);
        const fib236 = high - (range * 0.236);

        return {
            nearSupport: currentPrice <= fib618 * 1.02,
            nearResistance: currentPrice >= fib382 * 0.98,
            levels: { fib236, fib382, fib618 }
        };
    }

    // NEW: Bollinger Band position
    private calculateBollingerPosition(priceChange: number, volatility: number): number {
        const sma = 0; // Simplified moving average (neutral)
        const stdDev = volatility * 0.5;
        const upperBand = sma + (2 * stdDev);
        const lowerBand = sma - (2 * stdDev);

        // Position relative to bands (-2 to +2)
        if (priceChange > upperBand) return 2;
        if (priceChange < lowerBand) return -2;
        return (priceChange - sma) / stdDev;
    }

    // NEW: Whale activity detection
    private detectWhaleActivity(volume: number, priceChange: number): number {
        const volumeThreshold = 10000000; // $10M volume threshold
        const volumeRatio = volume / volumeThreshold;
        const priceImpact = Math.abs(priceChange);

        // Whale activity score: high volume + significant price movement
        const whaleScore = (volumeRatio * priceImpact * 0.1) - 0.5;
        return Math.max(-1, Math.min(1, whaleScore));
    }

    // NEW: Golden Cross detection
    private checkGoldenCross(priceChange: number, momentum: number): boolean {
        return priceChange > 2 && momentum > 0.4; // Simplified golden cross
    }

    // NEW: Death Cross detection
    private checkDeathCross(priceChange: number, momentum: number): boolean {
        return priceChange < -2 && momentum < -0.4; // Simplified death cross
    }

    private calculateKeyLevels(currentPrice: number, priceChange: number, fibLevels?: any): any {
        const volatilityFactor = Math.abs(priceChange) * 0.01;

        let support = currentPrice * (1 - Math.max(0.02, volatilityFactor));
        let resistance = currentPrice * (1 + Math.max(0.02, volatilityFactor));

        // Incorporate Fibonacci levels if available
        if (fibLevels) {
            support = Math.min(support, fibLevels.levels.fib618);
            resistance = Math.max(resistance, fibLevels.levels.fib382);
        }

        return {
            support,
            resistance,
            pivot: currentPrice,
            fibonacci: fibLevels?.levels
        };
    }

    private async executeBuyOrder(userId: number, crypto: any, amount: number, reason: string) {
        try {
            const price = parseFloat(crypto.currentPrice);
            const quantity = amount / price;

            const user = await storage.getUser(userId);
            if (!user) return;

            const currentBalance = parseFloat(user.balance);

            if (currentBalance < amount) {
                console.log(`❌ Insufficient balance: Need $${amount.toFixed(2)}, have $${currentBalance.toFixed(2)}`);
                return;
            }

            const newBalance = currentBalance - amount;

            if (newBalance < 0) {
                console.log(`❌ Transaction would create negative balance: $${newBalance.toFixed(2)}`);
                return;
            }

            await storage.updateUserBalance(userId, newBalance.toString());

            if (this.broadcastFn) {
                this.broadcastFn({
                    type: 'balanceUpdate',
                    data: { userId, balance: newBalance }
                });
            }

            const tradeData: InsertTrade = {
                userId,
                cryptoId: crypto.id,
                type: 'BUY',
                amount: quantity.toString(),
                price: price.toString(),
                total: amount.toString(),
                isBot: true
            };

            const trade = await storage.createTrade(tradeData);

            await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, price);

            if (this.broadcastFn) {
                const { portfolioService } = await import('../services/portfolioService');
                const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
                this.broadcastFn({
                    type: 'portfolioUpdate',
                    data: updatedPortfolio
                });
            }

            console.log(`✅ ADVANCED BUY: ${crypto.symbol} - $${amount.toFixed(2)} at $${price.toFixed(6)}`);

            await telegramService.sendTradeNotification(trade, crypto);

            if (this.broadcastFn) {
                const tradeActivity = {
                    timestamp: new Date().toISOString(),
                    action: 'BUY',
                    symbol: crypto.symbol,
                    amount: quantity.toString(),
                    price: price.toString(),
                    total: amount.toString(),
                    type: 'automated',
                    strategy: 'Advanced Multi-Indicator'
                };

                this.broadcastFn({
                    type: 'tradeUpdate',
                    data: tradeActivity
                });

                this.broadcastFn({
                    type: 'newTrade',
                    data: {
                        ...trade,
                        cryptocurrency: crypto
                    }
                });
            }
        } catch (error) {
            console.log(`❌ Failed to execute advanced buy order for ${crypto.symbol}:`, error);
        }
    }

    private async executeSellOrder(userId: number, crypto: any, quantity: number, reason: string, position: any) {
        try {
            const price = parseFloat(crypto.currentPrice);
            const total = quantity * price;

            // Update user balances using new balance mechanism
            const user = await storage.getUser(userId);
            if (user) {
                const currentMainBalance = parseFloat(user.balance);
                const totalInvested = parseFloat(position.totalInvested);
                const profitLoss = total - totalInvested;

                // Return original investment to main balance
                const newMainBalance = currentMainBalance + totalInvested;
                await storage.updateUserBalances(userId, newMainBalance.toString(), undefined);

                if (profitLoss > 0) {
                    // Add profit to profit balance
                    await storage.addProfit(userId, profitLoss);
                    console.log(`💰 Profit $${profitLoss.toFixed(2)} added to profit balance`);
                } else {
                    // Subtract loss from main balance
                    await storage.subtractFromMainBalance(userId, Math.abs(profitLoss));
                    console.log(`📉 Loss $${Math.abs(profitLoss).toFixed(2)} subtracted from main balance`);
                }
            }

            if (this.broadcastFn) {
                this.broadcastFn({
                    type: 'balanceUpdate',
                    data: { userId, balance: user?.balance }
                });
            }

            const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
            let pnl = '0';
            if (portfolioItem) {
                const avgBuyPrice = parseFloat(portfolioItem.averagePrice);
                const sellPrice = price;
                const profit = (sellPrice - avgBuyPrice) * quantity;
                pnl = profit.toString();
            }

            const tradeData: InsertTrade = {
                userId,
                cryptoId: crypto.id,
                type: 'SELL',
                amount: quantity.toString(),
                price: price.toString(),
                total: total.toString(),
                pnl: pnl,
                reason: reason,
                isBot: true
            };

            const trade = await storage.createTrade(tradeData);

            await this.updatePortfolioAfterSell(userId, crypto.id, quantity);

            if (this.broadcastFn) {
                const { portfolioService } = await import('../services/portfolioService');
                const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
                this.broadcastFn({
                    type: 'portfolioUpdate',
                    data: updatedPortfolio
                });
            }

            console.log(`✅ ADVANCED SELL: ${crypto.symbol} - ${quantity.toFixed(6)} at $${price.toFixed(6)}`);

            await telegramService.sendTradeNotification(trade, crypto);

            if (this.broadcastFn) {
                const tradeActivity = {
                    timestamp: new Date().toISOString(),
                    action: 'SELL',
                    symbol: crypto.symbol,
                    amount: quantity.toString(),
                    price: price.toString(),
                    total: total.toString(),
                    type: 'automated',
                    strategy: 'Advanced Multi-Indicator'
                };

                this.broadcastFn({
                    type: 'tradeUpdate',
                    data: tradeActivity
                });

                this.broadcastFn({
                    type: 'newTrade',
                    data: {
                        ...trade,
                        cryptocurrency: crypto
                    }
                });

                const trades = await storage.getUserTrades(userId, 100);
                const sellTrades = trades.filter(t => t.type === 'SELL');
                const soldCoins = await Promise.all(sellTrades.map(async (t) => {
                    const cryptoData = await storage.getCryptocurrency(t.cryptoId);

                    const buyTrades = trades.filter(bt =>
                        bt.cryptoId === t.cryptoId &&
                        bt.type === 'BUY' &&
                        bt.createdAt < t.createdAt
                    );

                    let totalBuyValue = 0;
                    let totalBuyQuantity = 0;

                    for (const buyTrade of buyTrades) {
                        const buyAmount = parseFloat(buyTrade.amount);
                        const buyPrice = parseFloat(buyTrade.price);
                        totalBuyValue += buyAmount * buyPrice;
                        totalBuyQuantity += buyAmount;
                    }

                    const avgBuyPrice = totalBuyQuantity > 0 ? totalBuyValue / totalBuyQuantity : 0;
                    const sellPrice = parseFloat(t.price);
                    const quantity = parseFloat(t.amount);
                    const sellValue = parseFloat(t.total);
                    const buyValue = avgBuyPrice * quantity;
                    const profit = sellValue - buyValue;
                    const profitPercentage = buyValue > 0 ? ((profit / buyValue) * 100) : 0;

                    return {
                        id: t.id,
                        symbol: cryptoData?.symbol || 'Unknown',
                        name: cryptoData?.name || 'Unknown',
                        soldQuantity: t.amount,
                        sellPrice: t.price,
                        buyPrice: avgBuyPrice.toString(),
                        sellValue: t.total,
                        profit: profit.toString(),
                        profitPercentage: profitPercentage.toString(),
                        soldAt: t.createdAt.toISOString()
                    };
                }));

                this.broadcastFn({
                    type: 'soldCoinsUpdate',
                    data: soldCoins
                });
            }
        } catch (error) {
            console.log(`❌ Failed to execute advanced sell order for ${crypto.symbol}:`, error);
        }
    }

    private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number) {
        const existing = await storage.getPortfolioItem(userId, cryptoId);

        if (existing) {
            const newAmount = parseFloat(existing.amount) + quantity;
            const newTotal = parseFloat(existing.totalInvested) + (quantity * price);
            const newAvgPrice = newTotal / newAmount;

            await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), newAvgPrice.toString(), newTotal.toString());
        } else {
            await storage.createPortfolioItem({
                userId,
                cryptoId,
                amount: quantity.toString(),
                averagePrice: price.toString(),
                totalInvested: (quantity * price).toString()
            });
        }
    }

    private async updatePortfolioAfterSell(userId: number, cryptoId: number, quantity: number) {
        const existing = await storage.getPortfolioItem(userId, cryptoId);
        if (!existing) return;

        const currentAmount = parseFloat(existing.amount);
        const newAmount = currentAmount - quantity;

        if (newAmount <= 0.000001) {
            await storage.deletePortfolioItem(userId, cryptoId);
        } else {
            const avgPrice = parseFloat(existing.averagePrice);
            const newTotalInvested = newAmount * avgPrice;

            await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), avgPrice.toString(), newTotalInvested.toString());
        }
    }

    private calculateProfitPotential(analysis: any, priceChange24h: number): number {
        // Calculate expected profit potential based on multiple factors
        const momentumFactor = Math.max(0, analysis.momentum) * 0.3;
        const trendFactor = (analysis.trendscore / 10) * 0.25;
        const volumeFactor = Math.min(analysis.volume_strength / 3, 0.2);
        const volatilityFactor = Math.min(Math.abs(priceChange24h) / 20, 0.15);
        const confidenceFactor = analysis.confidence * 0.1;

        const totalPotential = momentumFactor + trendFactor + volumeFactor + volatilityFactor + confidenceFactor;
        return Math.min(totalPotential, 0.25); // Cap at 25% expected return
    }

    private logProfitFocusedBuySignals(symbol: string, analysis: any, amount: number, score: number, confidence: number, profitPotential: number): void {
        console.log(`\n💎 ═══════ YÜKSEK KAR POTENSİALI - ${symbol} ═══════`);
        console.log(`💰 Investisiya məbləği: $${amount.toFixed(3)}`);
        console.log(`📊 Kar Potensial Skoru: ${score.toFixed(1)}/100`);
        console.log(`🎲 Etibar dərəcəsi: ${(confidence * 100).toFixed(1)}%`);
        console.log(`💹 Gözlənilən gəlir: ${(profitPotential * 100).toFixed(1)}%`);
        console.log(`\n🚀 ÜSTÜN İNDİKATORLAR:`);
        console.log(`   • RSI: ${analysis.rsi} ${analysis.rsi < 25 ? '🔥 (Çox oversold - güclü alış)' : analysis.rsi < 35 ? '✅ (Oversold)' : '⚠️ (Normal)'}`);
        console.log(`   • Momentum: ${analysis.momentum.toFixed(3)} ${analysis.momentum > 0.6 ? '🚀 (Çox güclü)' : analysis.momentum > 0.3 ? '✅ (Güclü)' : '⚠️ (Orta)'}`);
        console.log(`   • Trend Gücü: ${analysis.trendscore}/10 ${analysis.trendscore >= 8 ? '🔥 (Dominant trend)' : analysis.trendscore >= 6 ? '✅ (Güclü trend)' : '⚠️ (Orta)'}`);
        console.log(`   • Volume Gücü: ${analysis.volumeStrength.toFixed(2)} ${analysis.volumeStrength > 2 ? '🔥 (Çox yüksək)' : analysis.volumeStrength > 1.5 ? '✅ (Yüksək)' : '⚠️ (Orta)'}`);
        console.log(`   • Kompozit Skor: ${analysis.compositeScore.toFixed(1)}/10 ${analysis.compositeScore >= 8 ? '🔥 (Mükəmməl)' : analysis.compositeScore >= 7.5 ? '✅ (Çox yaxşı)' : '⚠️ (Yaxşı)'}`);
        console.log(`   • Bazar Strukturu: ${analysis.marketStructure.toFixed(3)} ${analysis.marketStructure > 0.5 ? '🚀 (Çox bullish)' : analysis.marketStructure > 0.3 ? '✅ (Bullish)' : '⚠️ (Neytral)'}`);

        console.log(`\n💡 KAR SƏBƏBLƏRİ:`);
        if (analysis.momentum > 0.6) console.log(`   🚀 Çox güclü momentum (${analysis.momentum.toFixed(3)}) - böyük hərəkat gözlənilir`);
        if (analysis.trendscore >= 8) console.log(`   📈 Dominant yüksəliş trendi (${analysis.trendscore}/10)`);
        if (analysis.rsi < 25) console.log(`   🔥 Həddindən çox satılmış (RSI: ${analysis.rsi}) - güclü toparlanma`);
        if (analysis.volumeStrength > 2) console.log(`   💪 Çox yüksək volume aktivliyi - güclü maraq`);
        if (confidence > 0.9) console.log(`   ⭐ İstisna etibar dərəcəsi (${(confidence * 100).toFixed(1)}%)`);
        if (analysis.compositeScore >= 8.5) console.log(`   🎯 Mükəmməl texniki göstəricilər kombinasiyası`);

        console.log(`\n🎯 QƏRAR ƏSASLARI:`);
        console.log(`   ✅ Sərt meyarlara uyğun: Confidence>75%, Momentum>0.3, Trend≥6`);
        console.log(`   ✅ Yüksək həcm aktivliği və güclü bazar strukturu`);
        console.log(`   ✅ Optimal volatillik aralığında (3-15%)`);
        console.log(`   ✅ TOP ${Math.ceil(score/20)} ən yüksək kar potensialı`);
        console.log(`═══════════════════════════════════════════\n`);
    }

    private logBuySignals(symbol: string, analysis: any, amount: number, score: number, confidence: number): void {
        console.log(`\n🎯 ═══════ ALIŞ SİQNALLARI - ${symbol} ═══════`);
        console.log(`💰 Investisiya məbləği: $${amount.toFixed(3)}`);
        console.log(`📊 Ümumi skor: ${score.toFixed(1)}/100`);
        console.log(`🎲 Etibar dərəcəsi: ${(confidence * 100).toFixed(1)}%`);
        console.log(`\n📈 TEXNİKİ İNDİKATORLAR:`);
        console.log(`   • RSI: ${analysis.rsi} ${analysis.rsi < 30 ? '✅ (Oversold)' : analysis.rsi < 40 ? '⚠️ (Low)' : '❌ (Normal/High)'}`);
        console.log(`   • Momentum: ${analysis.momentum.toFixed(3)} ${analysis.momentum > 0.2 ? '✅ (Güclü)' : analysis.momentum > 0 ? '⚠️ (Zəif)' : '❌ (Mənfi)'}`);
        console.log(`   • Trend Score: ${analysis.trendscore}/10 ${analysis.trendscore >= 6 ? '✅ (Güclü trend)' : analysis.trendscore >= 4 ? '⚠️ (Orta)' : '❌ (Zəif)'}`);
        console.log(`   • Volatillik: ${analysis.volatility.toFixed(2)}% ${analysis.volatility <= 12 && analysis.volatility >= 2 ? '✅ (Optimal)' : '⚠️ (Risk)'}`);
        console.log(`   • Bazar strukturu: ${analysis.marketStructure.toFixed(3)} ${analysis.marketStructure > 0.3 ? '✅ (Bullish)' : '❌ (Bearish/Neytral)'}`);
        console.log(`   • Volume gücü: ${analysis.volumeStrength.toFixed(2)} ${analysis.volumeStrength > 1.5 ? '✅ (Güclü)' : '⚠️ (Orta)'}`);

        console.log(`\n🔍 AKTİV SİQNALLAR:`);

        // Active buy signals
        const signals = [];
        if (analysis.buyConditions.rsi_oversold) signals.push('• RSI Oversold (RSI < 30)');
        if (analysis.buyConditions.momentum_positive) signals.push('• Pozitiv Momentum');
        if (analysis.buyConditions.macd_bullish) signals.push('• MACD Bullish');
        if (analysis.buyConditions.fibonacci_support) signals.push('• Fibonacci Dəstək');
        if (analysis.buyConditions.bollinger_oversold) signals.push('• Bollinger Oversold');
        if (analysis.buyConditions.volume_surge) signals.push('• Volume Artışı');
        if (analysis.buyConditions.whale_accumulation) signals.push('• Whale Toplanması');
        if (analysis.buyConditions.trend_strong) signals.push('• Güclü Trend');
        if (analysis.buyConditions.volatility_ok) signals.push('• Optimal Volatillik');
        if (analysis.buyConditions.structure_bullish) signals.push('• Bullish Struktur');
        if (analysis.buyConditions.support_level) signals.push('• Dəstək Səviyyəsi');
        if (analysis.buyConditions.breakout_potential) signals.push('• Breakout Potensialı');
        if (analysis.buyConditions.golden_cross) signals.push('• Golden Cross');

        if (signals.length > 0) {
            console.log(`✅ Aktiv ALIŞ siqnalları (${signals.length}/13):`);
            signals.forEach(signal => console.log(`   ${signal}`));
        }

        console.log(`\n📊 SKOR TƏHLİLİ:`);
        console.log(`   • Buy Score: ${analysis.buyScore}/13`);
        console.log(`   • Sell Score: ${analysis.sellScore}/12`);
        console.log(`   • Kompozit Skor: ${analysis.compositeScore.toFixed(1)}/10`);

        console.log(`\n💎 QƏRAR SƏBƏBLƏRİ:`);
        if (analysis.buyScore >= 5) {
            console.log(`   ✅ Güclü ALIŞ siqnalları (${analysis.buyScore} əlamət)`);
        }
        if (analysis.compositeScore >= 7) {
            console.log(`   ✅ Yüksək kompozit skor (${analysis.compositeScore.toFixed(1)}/10)`);
        }
        if (confidence > 0.8) {
            console.log(`   ✅ Çox yüksək etibar (${(confidence * 100).toFixed(1)}%)`);
        } else if (confidence > 0.7) {
            console.log(`   ✅ Yüksək etibar (${(confidence * 100).toFixed(1)}%)`);
        }
        if (analysis.momentum > 0.5) {
            console.log(`   ✅ Çox güclü momentum (${analysis.momentum.toFixed(3)})`);
        }

        console.log(`═══════════════════════════════════════════\n`);
    }

    private async sellAllPortfolio(userId: number) {
        try {
            const portfolio = await storage.getUserPortfolio(userId);
            const sellResults = [];

            for (const item of portfolio) {
                try {
                    const crypto = await storage.getCryptocurrency(item.cryptoId);
                    if (!crypto) continue;

                    const quantity = parseFloat(item.amount);
                    const price = parseFloat(crypto.currentPrice);
                    const total = quantity * price;

                    const avgBuyPrice = parseFloat(item.averagePrice);
                    const profit = (price - avgBuyPrice) * quantity;

                    console.log(`✅ Target Reached - Sell All: ${crypto.symbol} - ${quantity} at $${price} = $${profit.toFixed(2)} profit`);

                    await this.executeSellOrder(userId, crypto, quantity, 'Target profit reached - auto sell', item);

                    sellResults.push({
                        symbol: crypto.symbol,
                        amount: quantity,
                        price: price,
                        total: total,
                        profit: profit
                    });
                } catch (error) {
                    console.error(`❌ Failed to sell ${item.cryptoId}:`, error);
                }
            }

            return sellResults;
        } catch (error) {
            console.error('❌ Error selling all portfolio:', error);
            return [];
        }
    }
}

export const emaRsiStrategy = new EmaRsiStrategy();