import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, ArrowUpDown, Target, Bot, ArrowUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface StatsGridProps {
  userId: number;
}

export default function StatsGrid({ userId }: StatsGridProps) {
  const { data: statsResponse } = useQuery({
    queryKey: ['/api/analytics/user', userId],
    enabled: !!userId,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Handle the response properly
  const stats = statsResponse || {};

  const statsCards = [
    {
      title: "Total Profit",
      value: `+$${stats.totalProfit || '0.00'}`,
      icon: TrendingUp,
      bgColor: "bg-crypto-green/20",
      iconColor: "text-crypto-green",
      change: stats.totalProfit > 0 ? "+18.2%" : "0%",
      changeText: "vs last week"
    },
    {
      title: "Active Trades",
      value: stats.activeTrades || '0',
      icon: ArrowUpDown,
      bgColor: "bg-crypto-blue/20",
      iconColor: "text-crypto-blue",
      change: "",
      changeText: `${stats.activeTrades || 0} positions`
    },
    {
      title: "Win Rate",
      value: `${stats.winRate || '0'}%`,
      icon: Target,
      bgColor: "bg-yellow-500/20",
      iconColor: "text-yellow-500",
      change: stats.winRate > 50 ? "+5.2%" : "0%",
      changeText: "improvement"
    },
    {
      title: "Bot Uptime",
      value: `${stats.uptime || '99.7'}%`,
      icon: Bot,
      bgColor: "bg-crypto-green/20",
      iconColor: "text-crypto-green",
      change: "",
      changeText: "Last 30 days"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {statsCards.map((card, index) => (
        <Card key={index} className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{card.title}</p>
                <p className="text-2xl font-bold text-crypto-green">{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                <card.icon className={`${card.iconColor} text-xl h-6 w-6`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              {card.change && (
                <>
                  <ArrowUp className="h-4 w-4 text-crypto-green mr-1" />
                  <span className="text-crypto-green">{card.change}</span>
                </>
              )}
              <span className="text-muted-foreground ml-2">{card.changeText}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
