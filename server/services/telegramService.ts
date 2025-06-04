import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../storage';

class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string = '';

  initialize() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.log('⚠️ Telegram credentials not found, skipping initialization');
      return;
    }

    this.chatId = chatId;
    this.bot = new TelegramBot(token, { 
      polling: true
    });

    console.log('✅ Telegram bot initialized successfully');
    this.setupCommands();
    this.sendStartupInfo();
  }

  private setupCommands() {
    if (!this.bot) return;

    // Listen for commands
    this.bot.onText(/\/start/, (msg) => {
      this.handleStartCommand(msg);
    });

    this.bot.onText(/\/stop/, (msg) => {
      this.handleStopCommand(msg);
    });

    this.bot.onText(/\/status/, (msg) => {
      this.handleStatusCommand(msg);
    });

    this.bot.onText(/\/balance/, (msg) => {
      this.handleBalanceCommand(msg);
    });

    this.bot.onText(/\/help/, (msg) => {
      this.handleHelpCommand(msg);
    });
  }

  private async handleStartCommand(msg: any) {
    if (!this.bot || msg.chat.id.toString() !== this.chatId) return;

    try {
      await storage.updateBotSettings(1, { isActive: true });
      
      // Import and start the strategy
      const { emaRsiStrategy } = await import('./emaRsiStrategy');
      await emaRsiStrategy.startContinuousTrading(1);
      
      await this.bot.sendMessage(this.chatId, '🚀 Bot aktivləşdirildi və trading başladı!');
    } catch (error) {
      console.error('Error starting bot:', error);
      await this.bot.sendMessage(this.chatId, '❌ Bot başladılarkən xəta baş verdi');
    }
  }

  private async handleStopCommand(msg: any) {
    if (!this.bot || msg.chat.id.toString() !== this.chatId) return;

    try {
      await storage.updateBotSettings(1, { isActive: false });
      
      // Import and stop the strategy
      const { emaRsiStrategy } = await import('./emaRsiStrategy');
      emaRsiStrategy.stopContinuousTrading();
      
      await this.bot.sendMessage(this.chatId, '⏹️ Bot dayandırıldı və trading bitdi!');
    } catch (error) {
      console.error('Error stopping bot:', error);
      await this.bot.sendMessage(this.chatId, '❌ Bot dayandırılarkən xəta baş verdi');
    }
  }

  private async handleStatusCommand(msg: any) {
    if (!this.bot || msg.chat.id.toString() !== this.chatId) return;

    try {
      const settings = await storage.getBotSettings(1);
      const portfolio = await storage.getUserPortfolio(1);
      const user = await storage.getUser(1);
      
      const status = settings?.isActive ? '🟢 Aktiv' : '🔴 Deaktiv';
      const activePositions = portfolio.length;
      
      const message = `📊 Bot Status

${status}
💰 Balans: $${user?.balance || '0.00'}
📈 Aktiv pozisiyalar: ${activePositions}
🎯 Strategy: EMA-RSI`;

      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error('Error getting status:', error);
      await this.bot.sendMessage(this.chatId, '❌ Status alınarkən xəta baş verdi');
    }
  }

  private async handleBalanceCommand(msg: any) {
    if (!this.bot || msg.chat.id.toString() !== this.chatId) return;

    try {
      const user = await storage.getUser(1);
      const portfolio = await storage.getUserPortfolio(1);
      
      let totalValue = parseFloat(user?.balance || '0');
      
      for (const item of portfolio) {
        const crypto = await storage.getCryptocurrency(item.cryptoId);
        if (crypto) {
          const currentValue = parseFloat(item.amount) * parseFloat(crypto.currentPrice);
          totalValue += currentValue;
        }
      }
      
      const message = `💰 Balans məlumatı

💵 Nəğd: $${user?.balance || '0.00'}
📊 Portfolio: ${portfolio.length} pozisiya
💎 Ümumi dəyər: $${totalValue.toFixed(2)}`;

      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error('Error getting balance:', error);
      await this.bot.sendMessage(this.chatId, '❌ Balans alınarkən xəta baş verdi');
    }
  }

  private async handleHelpCommand(msg: any) {
    if (!this.bot || msg.chat.id.toString() !== this.chatId) return;

    const message = `🤖 Bot komandları

/start - Trading başlat
/stop - Trading dayandır
/status - Bot statusu
/balance - Balans məlumatı
/help - Bu yardım mesajı

Bot həmçinin avtomatik trade bildirişləri göndərir.`;

    await this.bot.sendMessage(this.chatId, message);
  }

  // Send startup information
  async sendStartupInfo() {
    if (!this.bot || !this.chatId) return;
    
    try {
      const user = await storage.getUser(1);
      const settings = await storage.getBotSettings(1);
      const botStatus = settings?.isActive ? '🟢 Aktiv' : '🔴 Deaktiv';
      
      const message = `🤖 Bot Başladı

💰 Balans: $${user?.balance || '0.00'}
${botStatus}
📊 Trading sistemi hazırdır`;

      await this.bot.sendMessage(this.chatId, message);
      console.log('✅ Startup info sent successfully');
    } catch (error) {
      console.log('❌ Failed to send startup info:', error);
    }
  }

  // Send trading notifications
  async sendTradeNotification(trade: any, crypto: any, portfolioItem?: any) {
    if (!this.bot || !this.chatId) return;

    console.log(`📱 Sending Telegram notification: ${trade.type.toUpperCase()} ${crypto.symbol}`);

    let message = '';
    
    if (trade.type === 'BUY') {
      // Buy notification: coin, price, total spent, portfolio amount
      const portfolioAmount = portfolioItem ? parseFloat(portfolioItem.amount) : parseFloat(trade.amount);
      const totalSpent = parseFloat(trade.total);
      message = `🟢 ALIŞ

💎 ${crypto.symbol} - $${parseFloat(trade.price).toFixed(6)}
💰 Xərc: $${totalSpent.toFixed(2)}
📊 Portfeydə: ${portfolioAmount.toFixed(6)} ${crypto.symbol}`;
      
    } else if (trade.type === 'SELL') {
      // Sell notification: coin name, previous price - sell price, total previous - total sell, profit, sell reason
      const sellPrice = parseFloat(trade.price);
      const totalSell = parseFloat(trade.total);
      const profit = parseFloat(trade.pnl || '0');
      const sellReason = trade.reason || 'Strateji siqnalı';
      
      // Calculate buy price from profit and sell data
      let buyPrice = 0;
      let totalBuy = 0;
      
      if (portfolioItem) {
        buyPrice = parseFloat(portfolioItem.averagePrice);
        totalBuy = parseFloat(portfolioItem.totalInvested);
      } else {
        // Calculate buy price from profit: totalBuy = totalSell - profit
        totalBuy = totalSell - profit;
        const sellAmount = parseFloat(trade.amount);
        buyPrice = totalBuy / sellAmount;
      }
      
      message = `🔴 SATIŞ

💎 ${crypto.symbol}
📊 $${buyPrice.toFixed(6)} → $${sellPrice.toFixed(6)}
💰 $${totalBuy.toFixed(2)} → $${totalSell.toFixed(2)}
📈 Kar: $${profit.toFixed(2)}
🎯 Səbəb: ${sellReason}`;
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('✅ Trade notification sent successfully');
    } catch (error) {
      console.log('❌ Failed to send trade notification:', error);
    }
  }

  // Send profit alert
  async sendProfitAlert(profit: number, symbol: string) {
    if (!this.bot || !this.chatId) return;
    
    const emoji = profit >= 0 ? '💰' : '📉';
    const message = `${emoji} Kar: $${profit.toFixed(2)} (${symbol})`;
    
    try {
      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.log('❌ Failed to send profit alert:', error);
    }
  }

  // Send daily report
  async sendDailyReport() {
    if (!this.bot || !this.chatId) return;
    
    try {
      const stats = await storage.getUserStats(1);
      const message = `📊 Günlük Hesabat

💰 Ümumi Kar: $${stats.totalProfit || '0.00'}
📈 Aktiv Treydlər: ${stats.activeTrades || 0}
🎯 Qalib Nisbəti: ${stats.winRate || '0'}%`;

      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.log('❌ Failed to send daily report:', error);
    }
  }
}

export const telegramService = new TelegramService();