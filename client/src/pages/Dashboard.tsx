import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import StatsGrid from "@/components/StatsGrid";
import PortfolioChart from "@/components/PortfolioChart";
import PortfolioHoldings from "@/components/PortfolioHoldings";
import BotSettings from "@/components/BotSettings";
import BalanceManager from "@/components/BalanceManager";
import TelegramCommands from "@/components/TelegramCommands";
import LiveTradingActivity from "@/components/LiveTradingActivity";

import { Button } from "@/components/ui/button";
import { Menu, Wallet, User } from "lucide-react";
import { useWebSocketData } from "@/hooks/useWebSocketData";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userId = 1; // Mock user ID for demo

  // Get all data from WebSocket - no API calls
  const { user, botSettings, isConnected } = useWebSocketData();

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
        botStatus={botSettings.data?.isActive ? 'Active' : 'Inactive'}
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
                  ${user.data?.user?.balance || '0.00'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-crypto-green to-crypto-blue rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium">{user.data?.user?.username || 'User'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-6 space-y-6">
          {/* Stats grid */}
          <StatsGrid userId={userId} />

          {/* Portfolio Chart and Holdings */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PortfolioChart userId={userId} />
            <PortfolioHoldings userId={userId} />
          </div>

          {/* Bot settings and Live Trading Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <BotSettings userId={userId} />
            <LiveTradingActivity />
            <BalanceManager userId={userId} currentBalance={user.data?.user?.balance || '0.00'} />
          </div>

          {/* Telegram commands */}
          <TelegramCommands />
        </div>
      </main>
    </div>
  );
}
