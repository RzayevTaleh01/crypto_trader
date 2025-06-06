
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Initialize Telegram bot and Binance API
  const { telegramService } = await import("./services/telegramService");
  const { binanceService } = await import("./services/binanceService");
  
  telegramService.initialize();
  console.log('🔧 Initializing Binance testnet API...');
  binanceService.initialize();
  
  // Check bot state and resume trading if previously active
  const { storage } = await import("./storage");
  const { emaRsiStrategy } = await import("./services/emaRsiStrategy.ts");
  
  // Get the first available user
  let userId = 1;
  try {
    const user = await storage.getUser(1);
    if (!user) {
      // Check if there are any users and get the first one
      const allUsers = await storage.db.select().from(storage.users);
      if (allUsers.length > 0) {
        userId = allUsers[0].id;
      }
    }
  } catch (error) {
    console.log('No users found, system will initialize when user is created');
  }
  
  const botSettings = await storage.getBotSettings(userId);
  if (!botSettings) {
    try {
      await storage.createBotSettings({
        userId: userId,
        strategy: 'ema_rsi',
        riskLevel: 5,
        maxDailyLoss: '50.00',
        targetProfit: '130.00',
        isActive: false
      });
      console.log('✅ Trading system ready - bot will only analyze when manually activated from dashboard');
    } catch (error) {
      console.log('✅ Trading system ready - bot will initialize when user settings are configured');
    }
  } else if (botSettings.isActive) {
    // Resume trading automatically if bot was previously active
    console.log('🔄 Bot was previously active - resuming trading');
    emaRsiStrategy.startContinuousTrading(userId);
    console.log('✅ Trading system ready - bot is active and trading');
  } else {
    console.log('✅ Trading system ready - bot will only analyze when manually activated from dashboard');
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
