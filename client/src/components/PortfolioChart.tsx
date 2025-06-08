import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface PortfolioChartProps {
  userId: number;
}

export default function PortfolioChart({ userId }: PortfolioChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [timeframe, setTimeframe] = useState('1D');

  const hoursMap = {
    '1D': 24,
    '1W': 168,
    '1M': 720
  };

  const { data: performanceData } = useQuery({
    queryKey: ['/api/portfolio/performance', userId, timeframe],
    queryFn: () => fetch(`/api/portfolio/performance/${userId}?hours=${hoursMap[timeframe as keyof typeof hoursMap]}`).then(res => res.json()),
    enabled: !!userId,
    staleTime: 5000,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    gcTime: 30000,
  });

  const { data: user } = useQuery({
    queryKey: ['/api/user', userId],
    queryFn: () => fetch(`/api/user/${userId}`).then(res => res.json()),
    enabled: !!userId,
    staleTime: 5000,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!chartRef.current || !performanceData) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const safePerformanceData = Array.isArray(performanceData) ? performanceData : [];

    const labels = safePerformanceData.map((point: any) => {
      const date = new Date(point.timestamp);
      return timeframe === '1D'
          ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const values = safePerformanceData.map((point: any) => parseFloat(String(point.value || '0')));

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ümumi Balans',
          data: values,
          borderColor: 'hsl(175, 100%, 42%)',
          backgroundColor: 'hsla(175, 100%, 42%, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: 'hsl(175, 100%, 42%)',
          pointBorderColor: 'hsl(175, 100%, 42%)',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'hsl(240, 4%, 16%)',
            borderColor: 'hsl(215, 15%, 65%)',
            borderWidth: 1,
            titleColor: 'hsl(0, 0%, 98%)',
            bodyColor: 'hsl(0, 0%, 98%)',
            callbacks: {
              label: function(context) {
                return `Ümumi: $${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'hsla(215, 15%, 45%, 0.1)',
            },
            ticks: {
              color: 'hsl(215, 15%, 45%)'
            }
          },
          y: {
            grid: {
              color: 'hsla(215, 15%, 45%, 0.1)',
            },
            ticks: {
              color: 'hsl(215, 15%, 45%)',
              callback: function(value) {
                return '$' + value;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [performanceData, timeframe]);

  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' }
  ];

  const safePerformanceData = Array.isArray(performanceData) ? performanceData : [];

  // Parse values correctly from API response
  const currentValue = safePerformanceData.length > 0 ?
      parseFloat(String(safePerformanceData[safePerformanceData.length - 1]?.value || '0')) : 0;
  const startValue = safePerformanceData.length > 0 ?
      parseFloat(String(safePerformanceData[0]?.value || '0')) : 0;

  const valueChange = currentValue - startValue;
  const percentageChange = startValue > 0 ? ((valueChange / startValue) * 100) : 0;

  // Current balances from user data
  const currentBalance = parseFloat(user?.user?.balance || '0');
  const profitBalance = parseFloat(user?.user?.profitBalance || '0');
  const totalBalance = currentBalance + profitBalance;

  console.log(`🔍 PortfolioChart Values: Current: $${currentValue.toFixed(2)}, Start: $${startValue.toFixed(2)}, Change: $${valueChange.toFixed(2)} (${percentageChange.toFixed(2)}%)`);
  console.log(`📊 Performance Data:`, safePerformanceData.slice(-3));

  return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold">Ümumi Balans Performansı</h3>
              <div className="mt-2">
                <div className="text-2xl font-bold text-foreground">
                  ${totalBalance.toFixed(2)}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Əsas: </span>
                    <span className="font-medium">${currentBalance.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kar: </span>
                    <span className="font-medium text-green-600">${profitBalance.toFixed(2)}</span>
                  </div>
                </div>
                {safePerformanceData.length > 0 && (
                    <div className={`text-sm flex items-center gap-1 mt-1 ${
                        valueChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {valueChange >= 0 ? '+' : ''}${Math.abs(valueChange).toFixed(2)}
                      ({percentageChange >= 0 ? '+' : ''}{percentageChange.toFixed(2)}%)
                    </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {timeframes.map((tf) => (
                  <Button
                      key={tf.value}
                      variant={timeframe === tf.value ? "default" : "ghost"}
                      size="sm"
                      className={timeframe === tf.value ? "bg-crypto-green/20 text-crypto-green" : ""}
                      onClick={() => setTimeframe(tf.value)}
                  >
                    {tf.label}
                  </Button>
              ))}
            </div>
          </div>
          <div className="chart-container h-64">
            <canvas ref={chartRef} className="w-full h-full" />
          </div>
        </CardContent>
      </Card>
  );
}