import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/Sidebar";
import StatsGrid from "@/components/StatsGrid";
import PortfolioChart from "@/components/PortfolioChart";
import PortfolioHoldings from "@/components/PortfolioHoldings";
import BotSettings from "@/components/BotSettings";
import BalanceManager from "@/components/BalanceManager";
import TelegramCommands from "@/components/TelegramCommands";
import LiveTradingActivity from "@/components/LiveTradingActivity";
import SoldCoins from "@/components/SoldCoins";

import { Button } from "@/components/ui/button";
import { Menu, Wallet, User } from "lucide-react";
import { useWebSocketData } from "@/hooks/useWebSocketData";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setLocation] = useLocation();
  const userId = 1; // Mock user ID for demo

  // Get all data from WebSocket - no API calls
  const { user, botSettings, isConnected } = useWebSocketData();

  const handleCoinClick = (symbol: string) => {
    setLocation(`/coin/${symbol}`);
  };

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
        <header className="bg-card border-b border-border px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-foreground hover:bg-accent"
                onClick={toggleSidebar}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Trading Dashboard</h2>
                <p className="text-muted-foreground text-sm hidden sm:block">Real-time crypto trading analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2 bg-background rounded-lg px-2 sm:px-3 py-2">
                <Wallet className="h-4 w-4 text-crypto-blue" />
                <span className="text-xs sm:text-sm font-medium hidden sm:inline">Balance:</span>
                <span className="text-crypto-green font-bold text-sm sm:text-base">
                  ${user.data?.user?.balance || '0.00'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 hidden sm:flex">
                <div className="w-8 h-8 bg-gradient-to-r from-crypto-green to-crypto-blue rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium">{user.data?.user?.username || 'User'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Stats grid */}
          <StatsGrid userId={userId} />

          {/* Portfolio Chart and Holdings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <BotSettings userId={userId} />
            <PortfolioChart userId={userId} />
            <PortfolioHoldings userId={userId} onCoinClick={handleCoinClick} />
          </div>

          {/* Bot settings and Live Trading Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <LiveTradingActivity />
            <SoldCoins userId={userId} />
          </div>

          {/* Sold Coins and Telegram Commands */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
             <BalanceManager userId={userId} currentBalance={user.data?.user?.balance || '0.00'} />
            <TelegramCommands />
          </div>
        </div>
      </main>
    </div>
  );
}
