
import { backtestService } from './services/backtestService';

async function runBacktestTest() {
  console.log('🧪 Starting Backtest Test...\n');

  const config = {
    startBalance: 20, // $20 başlanğıc balans
    startDate: '2024-01-01',
    endDate: '2024-06-30', // 6 aylıq test
    strategy: 'ema_rsi',
    riskLevel: 5
  };

  try {
    const results = await backtestService.runBacktest(config);

    console.log('\n📊 ═══════ BACKTEST NƏTİCƏLƏRİ ═══════');
    console.log(`💰 Başlanğıc Balans: $${results.initialBalance.toFixed(2)}`);
    console.log(`💎 Son Balans: $${results.finalBalance.toFixed(2)}`);
    console.log(`📈 Ümumi Qazanc: $${results.totalReturn.toFixed(2)} (${results.totalReturnPercent.toFixed(2)}%)`);
    console.log(`🎯 Ümumi Treydlər: ${results.totalTrades}`);
    console.log(`✅ Qazan Treydlər: ${results.winningTrades}`);
    console.log(`❌ Itirən Treydlər: ${results.losingTrades}`);
    console.log(`🏆 Qazanma Nisbəti: ${results.winRate.toFixed(1)}%`);
    console.log(`📉 Maksimum Düşüş: ${results.maxDrawdown.toFixed(2)}%`);
    console.log(`⚡ Profit Factor: ${results.profitFactor.toFixed(2)}`);
    console.log(`📊 Sharpe Ratio: ${results.sharpeRatio.toFixed(2)}`);

    console.log('\n💹 SON 5 TREYD:');
    const lastTrades = results.trades.slice(-5);
    lastTrades.forEach((trade, index) => {
      const emoji = trade.type === 'BUY' ? '🟢' : '🔴';
      const profit = trade.profit ? ` (${trade.profit > 0 ? '+' : ''}$${trade.profit.toFixed(2)})` : '';
      console.log(`${emoji} ${trade.type}: ${trade.symbol} - $${trade.total.toFixed(2)}${profit}`);
    });

    console.log('\n📈 SON 5 GÜN PERFORMANSI:');
    const lastDays = results.dailyReturns.slice(-5);
    lastDays.forEach((day, index) => {
      console.log(`📅 ${new Date(day.date).toLocaleDateString()}: $${day.totalValue.toFixed(2)} (Ana: $${day.mainBalance.toFixed(2)}, Kar: $${day.profitBalance.toFixed(2)})`);
    });

    console.log('\n🎊 Backtest tamamlandı! Strategiyanız:');
    if (results.totalReturnPercent > 50) {
      console.log('🚀 ÇOX YAXŞI! Strategiya çox uğurlu görünür.');
    } else if (results.totalReturnPercent > 20) {
      console.log('✅ YAXŞI! Strategiya müsbət nəticə verir.');
    } else if (results.totalReturnPercent > 0) {
      console.log('⚠️ ORTA! Strategiya kiçik qazanc verir.');
    } else {
      console.log('❌ ZƏIF! Strategiya itki verir, yenidən nəzərdən keçirin.');
    }

    if (results.winRate > 60) {
      console.log('🎯 Qazanma nisbəti çox yaxşıdır!');
    } else if (results.winRate > 50) {
      console.log('👍 Qazanma nisbəti qənaətbəxşdir.');
    } else {
      console.log('⚠️ Qazanma nisbəti yaxşılaşdırıla bilər.');
    }

  } catch (error) {
    console.error('❌ Backtest xətası:', error);
  }
}

// Run the test
runBacktestTest();
