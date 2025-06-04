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
      polling: false,
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4
        }
      }
    });

    console.log('✅ Telegram bot initialized successfully');
    this.sendStartupInfo();
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
      const buyPrice = portfolioItem ? parseFloat(portfolioItem.averagePrice) : sellPrice;
      const totalSell = parseFloat(trade.total);
      const totalBuy = portfolioItem ? parseFloat(portfolioItem.totalInvested) : totalSell;
      const profit = parseFloat(trade.pnl || '0');
      const sellReason = trade.reason || 'Strateji siqnalı';
      
      message = `🔴 SATIŞ

💎 ${crypto.symbol}
📊 ${buyPrice.toFixed(6)} - ${sellPrice.toFixed(6)}
💰 $${totalBuy.toFixed(2)} - $${totalSell.toFixed(2)}
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