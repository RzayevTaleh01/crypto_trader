import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, ArrowUpDown, Target, Bot, ArrowUp, Wallet } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import BalanceHistoryDialog from "./BalanceHistoryDialog";

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
  expectedStartingBalance?: string;
  actualCurrentValue?: string;
  profitFromExpectedStart?: string;
  profitPercentageFromStart?: string;
  profitBalance?: string;
  totalAvailableBalance?: string;
  realizedProfit?: string;
  unrealizedProfit?: string;
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
    profitBalance: '0.00',
    totalAvailableBalance: '0.00'
  });
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedBalanceType, setSelectedBalanceType] = useState<"main" | "profit">("main");
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load and fallback
  const { data: apiStats, isLoading } = useQuery<StatsData>({
    queryKey: ['/api/stats', userId],
    enabled: !!userId,
    refetchInterval: 2000, // Refetch every 2 seconds
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

  const profitFromStart = parseFloat(stats.profitFromExpectedStart || '0');
  const profitPercentageFromStart = parseFloat(stats.profitPercentageFromStart || '0');

  const mainBalance = parseFloat(stats.currentBalance || '0');
  const profitBalance = parseFloat(stats.profitBalance || stats.totalProfit || '0');
  const totalBalance = mainBalance + profitBalance;

  const handleBalanceClick = (type: "main" | "profit") => {
    setSelectedBalanceType(type);
    setHistoryDialogOpen(true);
  };

  const statsCards = [
    {
      title: "Əsas Balans",
      value: `$${mainBalance.toFixed(2)}`,
      icon: Wallet,
      bgColor: "bg-crypto-blue/20",
      iconColor: "text-crypto-blue",
      change: "",
      changeText: "ticarət üçün",
      onClick: () => handleBalanceClick("main"),
      clickable: true
    },
    {
      title: "Kar Balansı", 
      value: `$${profitBalance.toFixed(2)}`,
      icon: TrendingUp,
      bgColor: "bg-crypto-green/20",
      iconColor: "text-crypto-green",
      change: profitBalance > 0 ? `+${((profitBalance / 20) * 100).toFixed(1)}%` : "0%",
      changeText: "qazanılan kar",
      onClick: () => handleBalanceClick("profit"),
      clickable: true
    },
    {
      title: "Ümumi Balans",
      value: `$${totalBalance.toFixed(2)}`,
      icon: ArrowUp,
      bgColor: "bg-purple-500/20",
      iconColor: "text-purple-500",
      change: totalBalance > 20 ? `+${((totalBalance - 20) / 20 * 100).toFixed(1)}%` : "0%",
      changeText: "ümumi dəyər"
    },
    {
      title: "Win Rate",
      value: `${stats.winRate || '0'}%`,
      icon: Target,
      bgColor: "bg-yellow-500/20",
      iconColor: "text-yellow-500",
      change: parseFloat(stats.winRate) > 50 ? "+5.2%" : "0%",
      changeText: "uğur nisbəti"
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
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {statsCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
                <Card 
                  key={index} 
                  className={`hover:shadow-lg transition-all duration-200 ${
                    stat.clickable ? 'cursor-pointer hover:scale-105 hover:bg-muted/50' : ''
                  }`}
                  onClick={stat.onClick}
                >
                  <CardContent className="p-3 sm:p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {stat.title}
                          {stat.clickable && (
                            <span className="text-xs ml-1 opacity-70">(klik)</span>
                          )}
                        </p>
                        <div className="text-2xl font-bold text-foreground">
                          {stat.value}
                        </div>
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

        <BalanceHistoryDialog
          isOpen={historyDialogOpen}
          onClose={() => setHistoryDialogOpen(false)}
          balanceType={selectedBalanceType}
          userId={userId}
        />
      </>
  );
}