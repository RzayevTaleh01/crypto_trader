import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../storage';

class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string = '';

  initialize() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';

    if (!token) {
      console.log('TELEGRAM_BOT_TOKEN not provided, Telegram bot disabled');
      return;
    }

    if (!this.chatId) {
      console.log('TELEGRAM_CHAT_ID not provided, Telegram notifications disabled');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.setupCommands();
      console.log('✅ Telegram bot initialized successfully');
      
      // Test connection
      this.bot.getMe().then(() => {
        console.log('✅ Telegram bot connection verified');
        this.sendTestMessage();
      }).catch((error) => {
        console.log('❌ Telegram bot connection failed:', error.message);
      });
    } catch (error) {
      console.log('❌ Telegram bot initialization failed:', error);
    }
  }

  private async sendTestMessage() {
    try {
      console.log('✅ Telegram bot ready for notifications');
    } catch (error) {
      console.log('❌ Telegram bot initialization failed:', error);
    }
  }

  private setupCommands() {
    if (!this.bot) return;

    // No commands - only trade notifications when trades happen
  }

  private async getBotStatus(): Promise<string> {
    const settings = await storage.getBotSettings(1);
    return settings?.isActive ? '🟢 Aktiv' : '🔴 Deaktiv';
  }

  // Send trading notifications
  async sendTradeNotification(trade: any, crypto: any, portfolioItem?: any) {
    if (!this.bot || !this.chatId) return;

    console.log(`📱 Sending Telegram notification: ${trade.type.toUpperCase()} ${crypto.symbol}`);

    let message = '';
    
    if (trade.type === 'BUY') {
      // Buy notification: coin, price, portfolio amount
      const portfolioAmount = portfolioItem ? parseFloat(portfolioItem.amount) : parseFloat(trade.amount);
      message = `🟢 ALIŞ

💎 ${crypto.symbol} - $${parseFloat(trade.price).toFixed(6)}
📊 Portfeydə: ${portfolioAmount.toFixed(6)} ${crypto.symbol}`;
      
    } else if (trade.type === 'SELL') {
      // Sell notification: coin, price, total profit, profit value
      const totalAmount = parseFloat(trade.total);
      const profit = parseFloat(trade.pnl || '0');
      message = `🔴 SATIŞ

💎 ${crypto.symbol} - $${parseFloat(trade.price).toFixed(6)}
💰 Ümumi: $${totalAmount.toFixed(2)}
📈 Kar: $${profit.toFixed(2)}`;
    }

    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });
      console.log('✅ Trade notification sent successfully');
    } catch (error) {
      console.log('❌ Failed to send trade notification:', error);
    }
  }

  // Send startup information
  async sendStartupInfo() {
    if (!this.bot || !this.chatId) return;
    
    try {
      const user = await storage.getUser(1);
      const botStatus = await this.getBotStatus();
      
      const message = `🤖 Bot Başladı

💰 Balans: $${user?.balance || '0.00'}
${botStatus}
📊 Trading sistemi hazırdır`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });
      console.log('✅ Startup info sent successfully');
    } catch (error) {
      console.log('❌ Failed to send startup info:', error);
    }
  }

  // Update profit alert to be simpler
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

  // Daily report stays the same
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