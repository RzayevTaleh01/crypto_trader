export interface User {
  id: number;
  username: string;
  email: string;
  balance: string;
  profitBalance: string;
  createdAt: string;
}

export interface Cryptocurrency {
  id: number;
  symbol: string;
  name: string;
  currentPrice: string;
  priceChange24h: string;
  marketCap?: string;
  volume24h?: string;
  lastUpdated: string;
}

export interface Trade {
  id: number;
  userId: number;
  cryptoId: number;
  type: 'buy' | 'sell';
  amount: string;
  price: string;
  total: string;
  pnl?: string;
  isBot: boolean;
  createdAt: string;
  cryptocurrency?: Cryptocurrency;
}

export interface Portfolio {
  id: number;
  userId: number;
  cryptoId: number;
  amount: string;
  averagePrice: string;
  totalInvested: string;
  updatedAt: string;
  cryptocurrency?: Cryptocurrency;
  currentValue?: string;
  pnl?: string;
  pnlPercentage?: string;
}

export interface BotSettings {
  id: number;
  userId: number;
  isActive: boolean;
  strategy: string;
  riskLevel: number;
  maxDailyLoss: string;
  targetProfit: string;
  tradingPairs: string[];
  updatedAt: string;
}

export interface PriceHistory {
  id: number;
  cryptoId: number;
  price: string;
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'priceUpdate' | 'trade' | 'botStatus';
  data: any;
}

export interface PortfolioPerformance {
  timestamp: string;
  value: number;
}

export interface UserStats {
  totalProfit: string;
  activeTrades: number;
  winRate: string;
  todayProfit: string;
  uptime: string;
}

export interface UserBalance {
  mainBalance: string;
  profitBalance: string;
}

export interface TradingSignal {
  type: 'BUY' | 'SELL';
  reason: string;
  confidence: number;
  indicators: string[];
  expectedTarget?: number;
  stopLoss?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}