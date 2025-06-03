import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import StatsGrid from "@/components/StatsGrid";
import PortfolioChart from "@/components/PortfolioChart";
import TopCoins from "@/components/TopCoins";
import RecentTrades from "@/components/RecentTrades";
import BotSettings from "@/components/BotSettings";
import BalanceManager from "@/components/BalanceManager";
import TelegramCommands from "@/components/TelegramCommands";
import LiveTradingActivity from "@/components/LiveTradingActivity";

import { Button } from "@/components/ui/button";
import { Menu, Wallet, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userId = 1; // Mock user ID for demo

  // Initialize WebSocket connection
  useWebSocket();

  // Fetch user data
  const { data: user } = useQuery({
    queryKey: ['/api/user/1'],
    queryFn: async () => {
      const response = await fetch('/api/user/1');
      if (!response.ok) {
        // Create demo user if not exists
        const createResponse = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'demo_user',
            email: 'demo@cryptobot.com',
            balance: '1000.00'
          })
        });
        if (createResponse.ok) {
          const { user } = await createResponse.json();
          return user;
        }
        throw new Error('Failed to create user');
      }
      const { user } = await response.json();
      return user;
    }
  });

  // Fetch bot settings
  const { data: botSettings } = useQuery({
    queryKey: ['/api/bot-settings', userId],
    enabled: !!userId
  });

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        botStatus={(botSettings || {}).isActive ? 'Active' : 'Inactive'}
      />

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-foreground hover:bg-accent"
                onClick={toggleSidebar}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold">Trading Dashboard</h2>
                <p className="text-muted-foreground">Real-time crypto trading analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-2">
                <Wallet className="h-4 w-4 text-crypto-blue" />
                <span className="text-sm font-medium">Balance:</span>
                <span className="text-crypto-green font-bold">
                  ${user?.balance || '0.00'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-crypto-green to-crypto-blue rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium">{user?.username || 'User'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-6 space-y-6">
          {/* Stats grid */}
          <StatsGrid userId={userId} />

          {/* Charts and trading section */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <PortfolioChart userId={userId} />
            </div>
            <div>
              <TopCoins />
            </div>
          </div>

          {/* Recent Trades */}
          <RecentTrades userId={userId} />

          {/* Bot settings and Live Trading Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <BotSettings userId={userId} />
            <LiveTradingActivity />
            <BalanceManager userId={userId} currentBalance={user?.balance || '0.00'} />
          </div>

          {/* Telegram commands */}
          <TelegramCommands />
        </div>
      </main>
    </div>
  );
}
