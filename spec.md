# Indian Market Analytics Dashboard

## Current State
Full-stack dashboard with 6 tabs. All window panels (OI Data, Macro Indicators, Price panels) use standard calendar month/week boundaries (Monday–Sunday week, calendar month). Date filtering is uniform regardless of data date.

## Requested Changes (Diff)

### Add
- A utility function `getMarketPeriodBoundaries(date: Date)` that returns the market-specific start/end of the current week and month based on two regimes:
  - **On or after 1 Sep 2025**: Week = Wednesday (this week) → Tuesday (next week); Month = last Wednesday of previous calendar month → last Tuesday of current calendar month
  - **Before 1 Sep 2025**: Week = Friday (previous week) → Thursday (this week); Month = last Friday of previous calendar month → last Thursday of current calendar month
- Utility helpers: `getLastWeekdayOfMonth(year, month, weekday)` to find the last occurrence of a given weekday (0=Sun…6=Sat) in a calendar month
- Display of the market period label (e.g., "Period: 28 Aug 2025 – 30 Sep 2025") in all window panels that show date-windowed data

### Modify
- All OI Data panels (IndexOIPanel, StockOIPanel): When showing the "4-month window", the month boundaries used to group and label data should reflect the market calendar regime (Wed–Tue or Fri–Thu) rather than calendar months
- Macro Indicators panels (DailyIndicatorsCard, MoMIndicatorsCard, QoQIndicatorsCard): The range label and window anchor displayed should show market-period-aware start/end dates rather than raw calendar month labels
- The `rangeLabel` in all three macro cards should be computed via the market period boundary rules

### Remove
- Nothing removed

## Implementation Plan
1. Add `SEPT_2025_CUTOFF = new Date(2025, 8, 1)` constant
2. Add `getLastWeekdayOfMonth(year, month, weekday): Date` helper
3. Add `getMarketWeekStart(date): Date` and `getMarketWeekEnd(date): Date` functions
4. Add `getMarketMonthStart(date): Date` and `getMarketMonthEnd(date): Date` functions
5. Add `getMarketPeriodLabel(startDate: Date, endDate: Date): string` formatter
6. Update `IndexOIPanel` and `StockOIPanel` to show a market-period-aware range label below the year/month selectors using the selected month's regime
7. Update `DailyIndicatorsCard` range label to use market month boundaries
8. Update `MoMIndicatorsCard` range label to use market month boundaries
9. Update `QoQIndicatorsCard` range label to use market period boundaries
