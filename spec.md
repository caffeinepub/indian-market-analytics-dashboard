# Indian Market Analytics Dashboard

## Current State

The app has 7 tabs. The "Results & Analytics" tab (between Stocks & Stocks Options OI and Macro Indicators) contains:
- A stock selector for Nifty Total Market stocks
- **Analytics Matrix Panel**: period inputs (# Quarters or # Years), Notes section, multi-select standard/custom metrics dropdown, metrics table with Save/Modify per row. Standard metric names are hardcoded as "(5Y)" regardless of the actual period selected. Custom metrics support Macro Indicator variables (MacroCPI, FIIFlow, NiftyClose, etc.) but no Index OI/Stock OI data points.
- **Visualization Panel**: chart type toggle (Bar/Line/Composed), multi-select conditions dropdown showing standard series + saved custom metrics. No period selector. Uses fixed last 20 quarters. No Index or Stock OI data points, no Macro Indicator data points.

Data available in scope:
- `NIFTY_DATA`: OHLC[] — Nifty50 daily price from Jan 2005
- `BANKNIFTY_DATA`: OHLC[] — BankNifty daily price from Jan 2005
- `getStockData(sym)`: OHLCWithVolume[] — Stock daily OHLC+Volume
- `NIFTY_PCR_OI_DATA.CM/NM/CW/NW`: ExtendedPCRBarData[] — Nifty OI with date/year/month
- `BANKNIFTY_PCR_OI_DATA.CM/NM`: ExtendedPCRBarData[] — BankNifty OI
- Stock PCR OI via `stockPCROIFullCache[key]`
- `MACRO_CPI_WPI_FULL`, `MACRO_FII_FULL`, `MACRO_USDINT_FULL`, `MACRO_CRUDE_FULL`, `MACRO_GSEC_FULL`, `MACRO_GDP_CAD_FULL`, `MACRO_RATES_FULL`, `MACRO_FXRESERVE_FULL` — all macro time-series

## Requested Changes (Diff)

### Add
- **Analytics Matrix Panel**: Index & Stock OI data point variables available in formulas/display. New variables: `NiftyOI_PE`, `NiftyOI_CE`, `NiftyPCR`, `BankNiftyOI_PE`, `BankNiftyOI_CE`, `BankNiftyPCR`, `StockOI_PE`, `StockOI_CE`, `StockPCR`, `StockClose`, `StockVolume`. Data aggregated to match the selected period (Q or Y) by averaging or summing daily/monthly data into quarterly or annual buckets.
- **Analytics Matrix Panel**: A new "Data Sources" expandable section showing available Index & Stock OI variables (with current values) alongside existing Macro variables in the formula reference panel.
- **Visualization Panel**: Period selector (# Quarters or # Years) — mirroring the Analytics Matrix Panel controls — that governs how many periods are displayed on the chart.
- **Visualization Panel**: Add macro indicator data points to the conditions dropdown (MacroCPI, MacroWPI, FIIFlow, MacroDII, MacroUSDINR, MacroCrudeWTI, MacroCrudeBrent, Macro3YGsec, Macro5YGsec, Macro10YGsec, MacroGDP, MacroRepoRate, MacroFXReserve) as selectable series with auto-aggregation to the selected period.
- **Visualization Panel**: Add Index OI and Stock OI data points as selectable series (NiftyPCR, NiftyOI_Net, BankNiftyPCR, BankNiftyOI_Net, StockClose, StockVolume, StockPCR).
- **Visualization Panel**: Auto-adjust logic that converts daily/monthly/quarterly OI and macro data into the selected period granularity (quarterly or annual buckets, averaging or summing as appropriate).

### Modify
- **Analytics Matrix Panel — Metric Names**: The standard metric names currently hardcode "(5Y)". Update `computeBuiltinMetrics` to use dynamic period suffix based on the selected period — e.g. "(8Q)" when 8 quarters is selected, or "(3Y)" when 3 years is selected. The returned metric name should reflect the actual period.
- **Analytics Matrix Panel — `evalCustomMetric`**: Extend the variables injected into formula eval to include the new Index & Stock OI variables (computed from the selected period window).
- **Visualization Panel — chartData**: Instead of slicing to last 20 quarters, slice to `periodQuarters` aligned with the selected period in the panel's own period controls.
- **Visualization Panel — multi-source series rendering**: Support a right Y-axis for macro/OI series that use different units, and add them to the existing allSeries/renderSeries pipeline.

### Remove
- Nothing removed.

## Implementation Plan

1. **`computeBuiltinMetrics` update**: Change metric name strings from hardcoded "(5Y)" to use a dynamic label built from `periodQ` (e.g. `${years}Y` when divisible, or `${periodQ}Q`).

2. **Index/Stock OI aggregation helper**: Create a helper `aggregateOIByPeriod(oiData: ExtendedPCRBarData[], periods: {year:number,month:number}[], mode:'quarterly'|'annual')` that groups daily OI rows by quarter or year, averaging PCR and summing PE/CE OI per bucket, returning an array aligned to QuarterlyResult periods.

3. **`evalCustomMetric` extension**: Add new variables `NiftyOI_PE`, `NiftyOI_CE`, `NiftyPCR`, `BankNiftyOI_PE`, `BankNiftyOI_CE`, `BankNiftyPCR`, `StockOI_PE` (from selected stock), `StockOI_CE`, `StockPCR`, `StockClose`, `StockVolume` — computed as period averages using the selected `periodQ` window. Pass `sym` and `periodQ` into the evaluator.

4. **AnalyticsMatrixPanel — metric name display**: Update the metrics table "Metric" column to show the dynamic period-suffixed name from `computeBuiltinMetrics`. Update formula variable reference panel to include Index/Stock OI variable names with current values.

5. **VisualizationPanel — period controls**: Add `numQuarters`/`numYears` state + `periodQuarters` derived value, identical to AnalyticsMatrixPanel controls. Replace the hardcoded `slice(0, 20)` with `slice(0, periodQuarters)`.

6. **VisualizationPanel — macro series**: Add macro indicator entries to the conditions dropdown under a new "Macro Indicators" section. When checked, add them to `customConditionSeries` using time-series values aligned to chart quarters (averaging Macro data by quarter). Use a separate right-axis for macro series that have small values (PCR, rates, margins) vs large (FII flows, OI).

7. **VisualizationPanel — Index & Stock OI series**: Add "Index & Stock OI" section to the conditions dropdown. When checked, aggregate OI data by the selected periods and overlay as additional series with right-axis (PCR values) or left-axis (OI volumes).

8. **Auto-adjust logic**: Build `getQuarterlyMacroValue(macroArray, quarterDate, field)` helper that finds the macro entry closest to a given quarter date. Build `getQuarterlyOIValue(oiData, quarter, field)` that averages daily OI rows within a quarter window. Use these in chart data generation for the new series.
