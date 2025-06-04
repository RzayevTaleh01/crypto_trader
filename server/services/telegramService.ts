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

    const emoji = trade.type === 'buy' ? '🟢 ALIŞ' : '🔴 SATIŞ';
    const pnl = parseFloat(trade.pnl || '0');
    const profitEmoji = pnl >= 0 ? '💰' : '📉';
    
    console.log(`📱 Sending Telegram notification: ${trade.type.toUpperCase()} ${crypto.symbol}`);

    // Send immediate profit notification for sells
    if (trade.type === 'sell' && pnl !== 0) {
      this.sendProfitAlert(pnl, crypto.symbol);
    }
    
    let message = `
${emoji} *Yeni Treyd!*

💎 *${crypto.symbol}* - ${trade.type.toUpperCase()}
💰 Məbləğ: ${parseFloat(trade.amount).toFixed(6)}`;

    // Show detailed price information
    if (trade.type === 'buy') {
      const quantity = parseFloat(trade.quantity);
      const price = parseFloat(trade.price);
      const totalValue = parseFloat(trade.total);
      const currentPrice = parseFloat(crypto.currentPrice);
      
      message += `

📦 Alınan Miqdari: ${quantity.toFixed(8)} ${crypto.symbol}
💰 Alış Qiyməti: $${price.toFixed(6)}
💼 Ümumi Alış Dəyəri: $${totalValue.toFixed(2)}
📊 Hazırki Qiymət: $${currentPrice.toFixed(6)}`;
    } else if (trade.type === 'sell') {
      const quantity = parseFloat(trade.quantity);
      const sellPrice = parseFloat(trade.price);
      const buyPrice = portfolioItem ? parseFloat(portfolioItem.averagePrice) : sellPrice;
      const currentPrice = parseFloat(crypto.currentPrice);
      const totalSellValue = parseFloat(trade.total);
      const totalBuyValue = quantity * buyPrice;
      
      message += `

📦 Satılan Miqdari: ${quantity.toFixed(8)} ${crypto.symbol}
🛒 Alış Qiyməti: $${buyPrice.toFixed(6)}
🔥 Satış Qiyməti: $${sellPrice.toFixed(6)}
💼 Ümumi Alış Dəyəri: $${totalBuyValue.toFixed(2)}
💰 Ümumi Satış Dəyəri: $${totalSellValue.toFixed(2)}
📊 Hazırki Qiymət: $${currentPrice.toFixed(6)}`;
      
      if (trade.pnl) {
        const profit = parseFloat(trade.pnl);
        message += `
💰 *KAR: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}*`;
      }
      
      if (trade.strategy) {
        message += `
📊 Strategiya: ${trade.strategy}`;
      }
    }

    message += `

🤖 Bot Treydi: ${trade.isBot ? 'Bəli' : 'Xeyr'}
📅 ${new Date().toLocaleString('az-AZ')}
    `;

    this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
  }

  async sendProfitAlert(profit: number, symbol: string) {
    if (!this.bot || !this.chatId) return;
    
    const profitEmoji = profit >= 0 ? '💰' : '📉';
    const message = `
${profitEmoji} *Mənfəət Bildirişi!*

🎯 ${symbol}: $${profit >= 0 ? '+' : ''}${profit.toFixed(4)}
📅 ${new Date().toLocaleString('az-AZ')}
    `;
    
    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      console.log(`📱 Profit alert sent: ${symbol} ${profit >= 0 ? '+' : ''}${profit.toFixed(4)}`);
    } catch (error) {
      console.log('Telegram profit alert error:', error);
    }
  }

  // Send daily report
  async sendDailyReport() {
    if (!this.bot || !this.chatId) return;

    const stats = await storage.getUserStats(1);
    const user = await storage.getUser(1);
    
    const message = `
📊 *Gündəlik Hesabat*

💰 Bugünki Kar: $${stats.todayProfit}
📈 Ümumi Kar: $${stats.totalProfit}
🎯 Uğur Nisbəti: ${stats.winRate}%
💼 Cari Balans: $${user?.balance || '0.00'}
📊 Aktiv Pozisiyalar: ${stats.activeTrades}

🤖 Bot Performansı: ${stats.uptime}% uptime

📅 ${new Date().toLocaleDateString('az-AZ')}
    `;

    this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
  }
}

export const telegramService = new TelegramService();