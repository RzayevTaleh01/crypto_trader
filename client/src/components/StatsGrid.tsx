import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, ArrowUpDown, Target, Bot, ArrowUp, Wallet } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface StatsGridProps {
  userId: number;
}

interface StatsData {
  totalProfit: string;
  activeTrades: number;
  winRate: string;
  uptime: string;
  currentBalance: string;
  totalValue: string;
  portfolioValue: string;
  totalInvested: string;
  portfolioPnL: string;
  portfolioPnLPercentage: string;
  expectedStartingBalance?: string;
  actualCurrentValue?: string;
  profitFromExpectedStart?: string;
  profitPercentageFromStart?: string;
}

export default function StatsGrid({ userId }: StatsGridProps) {
  const [stats, setStats] = useState<StatsData>({
    totalProfit: '0.00',
    activeTrades: 0,
    winRate: '0',
    uptime: '99.7',
    currentBalance: '0.00',
    totalValue: '0.00',
    portfolioValue: '0.00',
    totalInvested: '0.00',
    portfolioPnL: '0.00',
    portfolioPnLPercentage: '0.00'
  });
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load and fallback
  const { data: apiStats, isLoading } = useQuery<StatsData>({
    queryKey: ['/api/stats', userId],
    enabled: !!userId,
  });

  // Initialize stats from API data
  useEffect(() => {
    if (apiStats) {
      setStats(apiStats);
    }
  }, [apiStats]);

  // Listen for real-time stats updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleStatsUpdate = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'statsUpdate' && message.data) {
          setStats(message.data);
        }
      } catch (error) {
        console.log('Error parsing WebSocket stats message:', error);
      }
    };

    socket.addEventListener('message', handleStatsUpdate);
    return () => socket.removeEventListener('message', handleStatsUpdate);
  }, [socket]);

  const totalValue = parseFloat(stats.totalValue || '0');
  const portfolioValue = parseFloat(stats.portfolioValue || '0');
  const currentBalance = parseFloat(stats.currentBalance || '0');
  const totalProfit = parseFloat(stats.totalProfit || '0');
  const portfolioPnL = parseFloat(stats.portfolioPnL || '0');
  const portfolioPnLPercentage = parseFloat(stats.portfolioPnLPercentage || '0');

  // Total value = current balance + portfolio value
  const calculatedTotalValue = currentBalance + portfolioValue;

  const statsCards = [
    {
      title: "Ümumi Balans + Portfolio",
      value: `$${calculatedTotalValue.toFixed(2)}`,
      icon: Wallet,
      bgColor: "bg-crypto-blue/20",
      iconColor: "text-crypto-blue",
      change: portfolioPnL >= 0 ? `+$${Math.abs(portfolioPnL).toFixed(2)}` : `-$${Math.abs(portfolioPnL).toFixed(2)}`,
      changeText: `${portfolioPnLPercentage >= 0 ? '+' : ''}${portfolioPnLPercentage.toFixed(1)}% portfolio P&L`
    },
    {
      title: "Portfolio Dəyəri",
      value: `$${portfolioValue.toFixed(2)}`,
      icon: TrendingUp,
      bgColor: portfolioPnL >= 0 ? "bg-crypto-green/20" : "bg-crypto-red/20",
      iconColor: portfolioPnL >= 0 ? "text-crypto-green" : "text-crypto-red",
      change: portfolioPnL >= 0 ? `+$${portfolioPnL.toFixed(2)}` : `-$${Math.abs(portfolioPnL).toFixed(2)}`,
      changeText: `${portfolioPnLPercentage.toFixed(1)}% P&L`
    },
    {
      title: "Aktiv Pozisiyalar",
      value: stats.activeTrades || '0',
      icon: ArrowUpDown,
      bgColor: "bg-purple-500/20",
      iconColor: "text-purple-500",
      change: "",
      changeText: `${stats.activeTrades || 0} coins`
    },
    {
      title: "Win Rate",
      value: `${stats.winRate || '0'}%`,
      icon: Target,
      bgColor: parseFloat(stats.winRate) >= 60 ? "bg-crypto-green/20" : parseFloat(stats.winRate) >= 40 ? "bg-yellow-500/20" : "bg-crypto-red/20",
      iconColor: parseFloat(stats.winRate) >= 60 ? "text-crypto-green" : parseFloat(stats.winRate) >= 40 ? "text-yellow-500" : "text-crypto-red",
      change: parseFloat(stats.winRate) > 50 ? "+Good" : "Needs Work",
      changeText: "performance"
    }
  ];

  if (isLoading) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-16 bg-muted rounded"></div>
                </CardContent>
              </Card>
          ))}
        </div>
    );
  }

  return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-bold mt-2">{stat.value}</p>
                      <div className="flex items-center mt-2 text-sm">
                        {stat.change && (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <ArrowUp className="h-3 w-3" />
                              {stat.change}
                      </span>
                        )}
                        <span className="text-muted-foreground ml-2">
                      {stat.changeText}
                    </span>
                      </div>
                    </div>
                    <div className={`${stat.bgColor} p-3 rounded-full`}>
                      <Icon className={`h-6 w-6 ${stat.iconColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
          );
        })}
      </div>
  );
}