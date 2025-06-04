import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, TrendingUp, ArrowUpDown, Wallet, History, Settings, MessageSquare, BarChart3, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  botStatus: string;
}

interface UserStats {
  totalProfit: string;
  currentBalance: string;
  todayProfit: string;
  todayProfitPercentage: string;
}

export default function Sidebar({ isOpen, onClose, botStatus }: SidebarProps) {
  const [stats, setStats] = useState<UserStats>({
    totalProfit: '0.00',
    currentBalance: '10.00',
    todayProfit: '0.00',
    todayProfitPercentage: '0.00'
  });
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load and fallback
  const { data: apiStats } = useQuery<UserStats>({
    queryKey: ['/api/stats', 1],
  });

  // Initialize stats from API data
  useEffect(() => {
    if (apiStats) {
      setStats({
        totalProfit: apiStats.totalProfit || '0.00',
        currentBalance: apiStats.currentBalance || '10.00',
        todayProfit: apiStats.totalProfit || '0.00', // Use total profit as today's profit
        todayProfitPercentage: apiStats.totalProfit ? 
          ((parseFloat(apiStats.totalProfit) / 10) * 100).toFixed(1) : '0.0'
      });
    }
  }, [apiStats]);

  // Listen for real-time stats updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleStatsUpdate = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'statsUpdate' && message.data) {
          setStats({
            totalProfit: message.data.totalProfit || '0.00',
            currentBalance: message.data.currentBalance || '10.00',
            todayProfit: message.data.totalProfit || '0.00',
            todayProfitPercentage: message.data.totalProfit ? 
              ((parseFloat(message.data.totalProfit) / 10) * 100).toFixed(1) : '0.0'
          });
        }
      } catch (error) {
        console.log('Error parsing WebSocket stats message:', error);
      }
    };

    socket.addEventListener('message', handleStatsUpdate);
    return () => socket.removeEventListener('message', handleStatsUpdate);
  }, [socket]);

  const navigation = [
    { name: 'Dashboard', icon: BarChart3, href: '#', current: true },
    { name: 'Trading', icon: ArrowUpDown, href: '#', current: false },
    { name: 'Portfolio', icon: Wallet, href: '#', current: false },
    { name: 'Trade History', icon: History, href: '#', current: false },
    { name: 'Bot Settings', icon: Settings, href: '#', current: false },
    { name: 'Telegram Bot', icon: MessageSquare, href: '#', current: false },
  ];

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-30 transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-crypto-green to-crypto-blue rounded-lg flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CryptoBot</h1>
            <p className="text-muted-foreground text-sm">Trading Dashboard</p>
          </div>
        </div>
      </div>
      
      {/* Bot status */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm font-medium">Bot Status</span>
          <div className="flex items-center space-x-2">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              botStatus === 'Active' ? "bg-crypto-green" : "bg-gray-400"
            )} />
            <span className={cn(
              "text-sm font-medium",
              botStatus === 'Active' ? "text-crypto-green" : "text-gray-400"
            )}>
              {botStatus}
            </span>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="mt-2">
        <ul className="space-y-2 px-3">
          {navigation.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors",
                  item.current 
                    ? "bg-accent text-crypto-green" 
                    : "hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </a>
            </li>
          ))}
        </ul>

        {/* Today's profit card */}
        <div className="mt-8 px-6">
          <div className={`bg-gradient-to-r rounded-lg p-4 border ${
            parseFloat(stats.todayProfit) >= 0 
              ? 'from-crypto-green/20 to-crypto-blue/20 border-crypto-green/30'
              : 'from-red-500/20 to-red-600/20 border-red-500/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Today's Profit</span>
              {parseFloat(stats.todayProfit) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-crypto-green" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className={`text-2xl font-bold ${
              parseFloat(stats.todayProfit) >= 0 ? 'text-crypto-green' : 'text-red-500'
            }`}>
              {parseFloat(stats.todayProfit) >= 0 ? '+' : ''}${stats.todayProfit}
            </div>
            <div className="text-xs text-muted-foreground">
              {parseFloat(stats.todayProfitPercentage) >= 0 ? '+' : ''}{stats.todayProfitPercentage}% from start
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}
