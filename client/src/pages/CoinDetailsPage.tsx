import { useRoute, useLocation } from "wouter";
import CoinDetails from "@/components/CoinDetails";

export default function CoinDetailsPage() {
  const [, params] = useRoute("/coin/:symbol");
  const [, setLocation] = useLocation();
  
  const symbol = params?.symbol;
  
  if (!symbol) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Invalid Coin Symbol</h1>
          <p className="text-muted-foreground mt-2">Please provide a valid cryptocurrency symbol.</p>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <CoinDetails 
          symbol={symbol.toUpperCase()} 
          onBack={handleBack}
        />
      </div>
    </div>
  );
}