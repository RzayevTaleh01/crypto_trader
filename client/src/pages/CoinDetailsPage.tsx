import { useParams } from "wouter";
import CoinDetails from "@/components/CoinDetails";

export default function CoinDetailsPage() {
  const { symbol } = useParams<{ symbol: string }>();

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Symbol tapılmadı</h1>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Geri Qayıt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <CoinDetails 
          key={`coin-details-${symbol}`}
          symbol={symbol.toUpperCase()} 
          onBack={() => window.history.back()} 
        />
      </div>
    </div>
  );
}