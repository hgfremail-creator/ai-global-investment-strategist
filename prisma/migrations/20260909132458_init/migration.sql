-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "riskScore" INTEGER NOT NULL,
    "horizon" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "constraintsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "benchmarkSymbol" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "listingExchange" TEXT,
    "factorLoadings" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Security_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL,
    "sourceId" TEXT,
    CONSTRAINT "Price_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Price_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fundamental" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "revenueGrowth" REAL,
    "epsGrowth" REAL,
    "fcfMargin" REAL,
    "roic" REAL,
    "netDebtToEbitda" REAL,
    "grossMargin" REAL,
    "operatingMargin" REAL,
    "pe" REAL,
    "forwardPe" REAL,
    "evEbitda" REAL,
    "peg" REAL,
    "ps" REAL,
    "fcfYield" REAL,
    "epsRevision4w" REAL,
    "epsRevision13w" REAL,
    "expectedRevenueGrowth" REAL,
    "expectedEpsGrowth" REAL,
    "moat" TEXT,
    "tamTier" INTEGER,
    "sourceId" TEXT,
    CONSTRAINT "Fundamental_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Fundamental_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MacroIndicator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "sourceId" TEXT,
    CONSTRAINT "MacroIndicator_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketRegime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asOf" DATETIME NOT NULL,
    "regime" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "driversJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SecurityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "overall" REAL NOT NULL,
    "businessQuality" REAL NOT NULL,
    "growth" REAL NOT NULL,
    "valuation" REAL NOT NULL,
    "earningsMomentum" REAL NOT NULL,
    "marketMomentum" REAL NOT NULL,
    "aiExposure" REAL NOT NULL,
    "balanceSheet" REAL NOT NULL,
    "risk" REAL NOT NULL,
    "weightsJson" TEXT NOT NULL,
    "contributionsJson" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityScore_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Primary',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "capitalUsdMinor" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgPriceMinor" INTEGER NOT NULL,
    "isUserSupplied" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioPosition_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortfolioPosition_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weekOf" DATETIME NOT NULL,
    "regimeId" TEXT NOT NULL,
    "sleeveTargetsJson" TEXT NOT NULL,
    "allocationJson" TEXT NOT NULL,
    "fxRatesJson" TEXT NOT NULL,
    "factorExposureJson" TEXT NOT NULL,
    "narrativeMd" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyVersion_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrategyVersion_regimeId_fkey" FOREIGN KEY ("regimeId") REFERENCES "MarketRegime" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategyVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "deltaText" TEXT,
    "reason" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    CONSTRAINT "StrategyChange_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conviction" INTEGER NOT NULL,
    "evidenceQuality" INTEGER NOT NULL,
    "targetWeight" REAL NOT NULL,
    "targetUsdMinor" INTEGER NOT NULL,
    "timeHorizon" TEXT NOT NULL,
    "entryStrategy" TEXT NOT NULL,
    "valuationView" TEXT NOT NULL,
    "thesisMd" TEXT NOT NULL,
    "catalystsJson" TEXT NOT NULL,
    "risksJson" TEXT NOT NULL,
    "invalidationJson" TEXT NOT NULL,
    "bullBearBaseJson" TEXT NOT NULL,
    "devilsAdvocateMd" TEXT NOT NULL,
    "ficJson" TEXT NOT NULL,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recommendationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "relevance" TEXT,
    CONSTRAINT "RecommendationSource_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecommendationSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" DATETIME,
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshness" TEXT NOT NULL,
    "excerpt" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT,
    "region" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "publisher" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "sentiment" REAL,
    "sourceId" TEXT,
    CONSTRAINT "NewsItem_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT NOT NULL,
    "volatility" REAL NOT NULL,
    "expectedDrawdown" REAL NOT NULL,
    "maxHistoricalDrawdown" REAL NOT NULL,
    "concentrationHHI" REAL NOT NULL,
    "aiFactorExposure" REAL NOT NULL,
    "semiconductorExposure" REAL NOT NULL,
    "usTechExposure" REAL NOT NULL,
    "valuationRisk" REAL NOT NULL,
    "liquidityRisk" REAL NOT NULL,
    "geopoliticalRisk" REAL NOT NULL,
    "countryExposureJson" TEXT NOT NULL,
    "currencyExposureJson" TEXT NOT NULL,
    "sectorExposureJson" TEXT NOT NULL,
    "sharpe" REAL,
    "sortino" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskMetric_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StressTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "assumptionsJson" TEXT NOT NULL,
    "estimatedImpactPct" REAL NOT NULL,
    "byAssetJson" TEXT NOT NULL,
    "isHypothetical" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StressTest_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "totalUsdMinor" INTEGER NOT NULL,
    "positionsJson" TEXT NOT NULL,
    "benchmarkJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT,
    "date" DATETIME NOT NULL,
    "close" REAL NOT NULL,
    CONSTRAINT "Benchmark_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT NOT NULL,
    "weekOf" DATETIME NOT NULL,
    "markdown" TEXT NOT NULL,
    "sectionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchReport_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyVersionId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "usedFallback" BOOLEAN NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAnalysis_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConflictDisclosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "securityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "asOf" DATETIME NOT NULL,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RiskProfile_userId_active_idx" ON "RiskProfile"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Market_code_key" ON "Market"("code");

-- CreateIndex
CREATE INDEX "Security_assetClass_idx" ON "Security"("assetClass");

-- CreateIndex
CREATE INDEX "Security_countryCode_idx" ON "Security"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Security_ticker_marketId_key" ON "Security"("ticker", "marketId");

-- CreateIndex
CREATE INDEX "Price_securityId_date_idx" ON "Price"("securityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Price_securityId_date_key" ON "Price"("securityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Fundamental_securityId_asOf_key" ON "Fundamental"("securityId", "asOf");

-- CreateIndex
CREATE INDEX "MacroIndicator_key_date_idx" ON "MacroIndicator"("key", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MacroIndicator_key_date_key" ON "MacroIndicator"("key", "date");

-- CreateIndex
CREATE INDEX "MarketRegime_asOf_idx" ON "MarketRegime"("asOf");

-- CreateIndex
CREATE INDEX "SecurityScore_asOf_idx" ON "SecurityScore"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityScore_securityId_asOf_key" ON "SecurityScore"("securityId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPosition_portfolioId_securityId_key" ON "PortfolioPosition"("portfolioId", "securityId");

-- CreateIndex
CREATE INDEX "StrategyVersion_portfolioId_weekOf_idx" ON "StrategyVersion"("portfolioId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_portfolioId_version_key" ON "StrategyVersion"("portfolioId", "version");

-- CreateIndex
CREATE INDEX "Recommendation_securityId_idx" ON "Recommendation"("securityId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_strategyVersionId_securityId_key" ON "Recommendation"("strategyVersionId", "securityId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationSource_recommendationId_sourceId_key" ON "RecommendationSource"("recommendationId", "sourceId");

-- CreateIndex
CREATE INDEX "Source_type_idx" ON "Source"("type");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsItem_securityId_idx" ON "NewsItem"("securityId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskMetric_strategyVersionId_key" ON "RiskMetric"("strategyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_date_key" ON "PortfolioSnapshot"("portfolioId", "date");

-- CreateIndex
CREATE INDEX "Benchmark_symbol_date_idx" ON "Benchmark"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_symbol_date_key" ON "Benchmark"("symbol", "date");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_executedAt_idx" ON "Transaction"("portfolioId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchReport_strategyVersionId_key" ON "ResearchReport"("strategyVersionId");

-- CreateIndex
CREATE INDEX "AIAnalysis_kind_createdAt_idx" ON "AIAnalysis"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_base_quote_asOf_key" ON "FxRate"("base", "quote", "asOf");
