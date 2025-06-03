import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../storage';
import { tradingEngine } from './tradingEngine';

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

    this.bot = new TelegramBot(token, { polling: true });
    this.setupCommands();
    console.log('Telegram bot initialized successfully');
  }

  private setupCommands() {
    if (!this.bot) return;

    // /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const welcomeMessage = `
🚀 *CryptoBot Trading Assistant*

Salam! Mən sizin avtomatik kripto trading köməkçinizəm.

📊 *Mövcud komandalar:*
/status - Cari trading statusu
/balance - Portfel balansı
/trades - Son treydlər
/start_bot - Trading botu başlat
/stop_bot - Trading botu dayandır
/settings - Bot parametrləri

💡 *Trading bot hazırda:* ${await this.getBotStatus()}
      `;
      
      this.bot?.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // /status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const stats = await storage.getUserStats(1); // Demo user ID
      
      const statusMessage = `
📈 *Trading Status*

💰 Ümumi Kar: $${stats.totalProfit}
📊 Aktiv Treydlər: ${stats.activeTrades}
🎯 Uğur Nisbəti: ${stats.winRate}%
📅 Bugünki Kar: $${stats.todayProfit}
⏱️ Bot Uptime: ${stats.uptime}%

🤖 Bot Status: ${await this.getBotStatus()}
      `;
      
      this.bot?.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    });

    // /balance command
    this.bot.onText(/\/balance/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const user = await storage.getUser(1);
      const portfolio = await storage.getUserPortfolio(1);
      
      let portfolioValue = 0;
      for (const item of portfolio) {
        const crypto = await storage.getCryptocurrency(item.cryptoId);
        if (crypto) {
          portfolioValue += parseFloat(item.amount) * parseFloat(crypto.currentPrice);
        }
      }
      
      const balanceMessage = `
💼 *Portfel Balansı*

💵 Nağd Balans: $${user?.balance || '0.00'}
📈 Portfel Dəyəri: $${portfolioValue.toFixed(2)}
💎 Ümumi Dəyər: $${(parseFloat(user?.balance || '0') + portfolioValue).toFixed(2)}

📊 Aktiv Pozisiyalar: ${portfolio.length}
      `;
      
      this.bot?.sendMessage(chatId, balanceMessage, { parse_mode: 'Markdown' });
    });

    // /trades command
    this.bot.onText(/\/trades/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const trades = await storage.getUserTrades(1, 5);
      
      let tradesMessage = '📋 *Son 5 Treyd:*\n\n';
      
      for (const trade of trades) {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        const emoji = trade.type === 'buy' ? '🟢' : '🔴';
        const pnl = parseFloat(trade.pnl || '0');
        const pnlEmoji = pnl >= 0 ? '📈' : '📉';
        
        tradesMessage += `${emoji} *${crypto?.symbol}* - ${trade.type.toUpperCase()}\n`;
        tradesMessage += `💰 Məbləğ: ${parseFloat(trade.amount).toFixed(6)}\n`;
        tradesMessage += `💵 Qiymət: $${parseFloat(trade.price).toFixed(2)}\n`;
        tradesMessage += `${pnlEmoji} P&L: $${Math.abs(pnl).toFixed(2)}\n`;
        tradesMessage += `📅 ${new Date(trade.createdAt).toLocaleString('az-AZ')}\n\n`;
      }
      
      this.bot?.sendMessage(chatId, tradesMessage, { parse_mode: 'Markdown' });
    });

    // /start_bot command
    this.bot.onText(/\/start_bot/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await storage.updateBotSettings(1, { isActive: true });
        await tradingEngine.startBot(1);
        
        this.bot?.sendMessage(chatId, '🚀 *Trading Bot Başladıldı!*\n\nBot indi avtomatik treydlər aparacaq.', 
          { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot?.sendMessage(chatId, '❌ Bot başladıla bilmədi. Xəta: ' + error.message);
      }
    });

    // /stop_bot command
    this.bot.onText(/\/stop_bot/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await storage.updateBotSettings(1, { isActive: false });
        tradingEngine.stopBot(1);
        
        this.bot?.sendMessage(chatId, '🛑 *Trading Bot Dayandırıldı!*\n\nBot treydləri dayandırdı.', 
          { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot?.sendMessage(chatId, '❌ Bot dayandırıla bilmədi. Xəta: ' + error.message);
      }
    });

    // /settings command
    this.bot.onText(/\/settings/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const settings = await storage.getBotSettings(1);
      
      const settingsMessage = `
⚙️ *Bot Parametrləri*

📊 Strategiya: ${settings?.strategy || 'scalping'}
⚡ Risk Səviyyəsi: ${settings?.riskLevel || 5}/10
💸 Max Gündəlik İtki: $${settings?.maxDailyLoss || '50'}
🎯 Gündəlik Hədəf: $${settings?.targetProfit || '100'}
🔄 Status: ${settings?.isActive ? 'Aktiv' : 'Deaktiv'}

💡 Parametrləri dəyişmək üçün veb paneldən istifadə edin.
      `;
      
      this.bot?.sendMessage(chatId, settingsMessage, { parse_mode: 'Markdown' });
    });
  }

  private async getBotStatus(): Promise<string> {
    const settings = await storage.getBotSettings(1);
    return settings?.isActive ? '🟢 Aktiv' : '🔴 Deaktiv';
  }

  // Send trading notifications
  async sendTradeNotification(trade: any, crypto: any, portfolioItem?: any) {
    if (!this.bot || !this.chatId) return;

    const emoji = trade.type === 'buy' ? '🟢 ALIŞ' : '🔴 SATIŞ';
    const profit = parseFloat(trade.profit || '0');
    const profitEmoji = profit >= 0 ? '💰' : '📉';
    
    let message = `
${emoji} *Yeni Treyd!*

💎 *${crypto.symbol}* - ${trade.type.toUpperCase()}
💰 Məbləğ: ${parseFloat(trade.amount).toFixed(6)}`;

    // Show detailed price information
    if (trade.type === 'buy') {
      message += `
🛒 Alış Qiyməti: $${parseFloat(trade.price).toFixed(6)}
📊 Hazırki Qiymət: $${parseFloat(crypto.currentPrice).toFixed(6)}
💼 Ümumi: $${parseFloat(trade.total).toFixed(2)}`;
    } else if (trade.type === 'sell') {
      const sellPrice = parseFloat(trade.price);
      const buyPrice = portfolioItem ? parseFloat(portfolioItem.averagePrice) : sellPrice;
      const currentPrice = parseFloat(crypto.currentPrice);
      
      message += `
🛒 Alış Qiyməti: $${buyPrice.toFixed(6)}
🔥 Satış Qiyməti: $${sellPrice.toFixed(6)}
📊 Hazırki Qiymət: $${currentPrice.toFixed(6)}
💼 Ümumi: $${parseFloat(trade.total).toFixed(2)}`;
      
      if (trade.profit) {
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

  // Send price alerts
  async sendPriceAlert(symbol: string, price: number, change: number) {
    if (!this.bot || !this.chatId) return;

    const emoji = change >= 0 ? '📈' : '📉';
    const changeEmoji = change >= 5 ? '🚀' : change <= -5 ? '💥' : '📊';
    
    const message = `
${changeEmoji} *Qiymət Xəbərdarlığı*

💎 *${symbol}*
💰 Cari Qiymət: $${price.toFixed(2)}
${emoji} 24s Dəyişiklik: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%

📅 ${new Date().toLocaleString('az-AZ')}
    `;

    this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
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