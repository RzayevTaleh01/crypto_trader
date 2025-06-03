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

  const { data: performanceData } = useQuery({
    queryKey: ['/api/portfolio/performance', userId, timeframe],
    enabled: !!userId,
    refetchInterval: 5000, // Update every 5 seconds for real-time charts
  });

  useEffect(() => {
    if (!chartRef.current || !performanceData) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Prepare data
    const labels = performanceData.map((point: any) => {
      const date = new Date(point.timestamp);
      return timeframe === '1D' 
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const values = performanceData.map((point: any) => parseFloat(point.value));

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Portfolio Value',
          data: values,
          borderColor: 'hsl(175, 100%, 42%)', // crypto-green
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
                return `Portfolio: $${context.parsed.y.toFixed(2)}`;
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

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Portfolio Performance</h3>
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
        <div className="chart-container">
          <canvas ref={chartRef} className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  );
}
