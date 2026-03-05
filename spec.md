# Indian Market Analytics Dashboard

## Current State

The dashboard has 6 tabs. In Tab 2 (Index & Index Options OI) the Nifty50 and BankNifty price panels are powered by `NIFTY_DATA` and `BANKNIFTY_DATA`, each generated via `genPriceSeries(300, ...)` — only ~300 trading days of mock data going back roughly 1 year from March 2026.

In Tab 3 (Stocks & Stocks Options OI) each stock's OHLC+Volume data is generated on demand via `getStockData(sym)` which calls `genPriceSeries(200, ...)` — only ~200 trading days per stock.

Both generators use `genDates()` which counts backwards from a hardcoded `toDate = new Date("2026-03-03")`, producing short histories.

There is no date-range filtering on the price panels — the charts simply show the last N candles based on zoom level.

## Requested Changes (Diff)

### Add
- A seeded deterministic PRNG utility (`seededRng(seed)`) so each symbol always produces the same price series
- A `PRICE_START_DATE` constant set to `2005-01-03` (first trading day of Jan 2005)
- A `STOCK_IPO_YEAR` map for recently-listed stocks (IPO after 2010) so their data starts from a realistic date
- Extended `genPriceSeries` with a `fromDate` / `toDate` range parameter that uses the seeded RNG to generate full history from the given start date to today
- Nifty50 historical base: start at ~2050 (actual approximate level in Jan 2005), trending to ~22800 today — use a random-walk with upward drift
- BankNifty historical base: start at ~7200 (approximate Jan 2005 level), trending to ~48500 today

### Modify
- `NIFTY_DATA`: change from `genPriceSeries(300, 22800, 120)` to a full history generator seeded deterministically from Jan 1, 2005 to today (~5400 trading days)
- `BANKNIFTY_DATA`: change from `genPriceSeries(300, 48500, 380)` to a full history generator seeded from Jan 1, 2005
- `getStockData(sym)`: change from 200-day generator to a full history generator starting from Jan 1, 2005 (or stock's IPO date if later), using a per-symbol deterministic seed, including realistic OHLC+Volume data
- `genDates()`: add overload / modify to accept `fromDate` and `toDate` parameters so callers can specify date ranges
- `genPriceSeries()`: extend to accept `startDate` and an optional seed so it produces deterministic reproducible series with appropriate upward drift for long-term Indian market indices

### Remove
- Nothing removed — existing API surface (OHLC interface, `getStockData`, `NIFTY_DATA`, `BANKNIFTY_DATA`) remains the same, only the underlying data depth changes

## Implementation Plan

1. **Add seeded PRNG**: Implement `seededRng(seed: number)` returning a `() => number` function using a simple mulberry32 algorithm so each symbol gets reproducible data.

2. **Add `genDatesRange(fromDate, toDate)`**: Generate all weekday dates (Mon–Fri) between two dates, skipping Sat/Sun.

3. **Add `genPriceSeriesRange(fromDate, toDate, startPrice, endPrice, volatilityPct, seed)`**: Walk from `startPrice` to approximately `endPrice` over the date range, using a mean-reverting drift so it trends realistically. Use the seeded PRNG for reproducibility. Each candle: open near prev close, high = max(open,close) * (1 + small noise), low = min(open,close) * (1 - small noise).

4. **Replace `NIFTY_DATA`**: Call `genPriceSeriesRange(new Date("2005-01-03"), new Date("2026-03-03"), 2050, 22800, 0.012, 42)` — ~5400 trading days.

5. **Replace `BANKNIFTY_DATA`**: Call `genPriceSeriesRange(new Date("2005-01-03"), new Date("2026-03-03"), 7200, 48500, 0.018, 99)` — ~5400 trading days.

6. **Add `STOCK_IPO_YEAR`**: Map of recently-listed stocks (those that went public after 2010) to their approximate listing year. Stocks not in the map default to 2005.

7. **Replace `getStockData(sym)`**: Use the stock's start date (from `STOCK_IPO_YEAR` or 2005-01-03), generate full history to today using a per-symbol seed (hash of symbol string). Base prices come from `STOCK_BASE_PRICES` or a reasonable default. Includes volume data (seeded random in realistic range per stock).

8. **Performance**: Since all data is generated once at module load time and cached in `stockDataCache`, the lazy-on-first-access pattern already handles performance. Index data (`NIFTY_DATA`, `BANKNIFTY_DATA`) is computed once at startup — ~5400 entries per index is fast.

9. **No UI changes**: Only the data layer changes. All chart components, zoom, timeframe selectors, and date-range logic remain unchanged.
