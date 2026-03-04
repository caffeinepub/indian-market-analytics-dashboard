# Indian Market Analytics Dashboard

## Current State
The app has 4 tabs: Index & Index Options OI, Stocks & Stock Options OI, Macro Indicators, Fortnightly Sector FII Data. Charts are line/bar charts using recharts. No candlestick rendering. No "Analysis" tab. No timeframe toggles (5min/15min etc.). PCR section only shows PCR ratio line; no PE/CE OI volume histograms. Macro indicators show single-series charts without paired overlays. Index tab uses a shared index selector rather than 4 independent panels. Backend is a minimal Motoko stub.

## Requested Changes (Diff)

### Add
- **Tab 1 "Analysis"**: New first tab. Python-enabled analysis placeholder section with data summary cards (market overview metrics drawn from mock data of tabs 2–5). Clearly labelled as "Python Integration Ready" for future DB seeding and formula hookup.
- **Candlestick chart**: Custom OHLC candlestick renderer using recharts ComposedChart + SVG custom shapes. Green body when Close>Open, red when Open>Close. Wicks from High to Low.
- **Timeframe toggles**: 5min, 15min, 30min, 75min, 1Day, 1Week — on Index price panels and Stock price panel. Each timeframe generates different candle density from mock data.
- **4 independent Index panels**: Nifty50 price panel, Nifty50 OI Data panel (PCR + PE/CE OI histograms), BankNifty price panel, BankNifty OI Data panel. No shared selector — each panel is independent.
- **PCR OI panels**: PCR Ratio as line graph + Total OI Volume as dual histograms (PE=green, CE=red). Expiry multi-select (CW/NW/CM/NM for Nifty50; CM/NM for BankNifty). Multiple selections sum the PCR ratio and PE/CE OI for the same day.
- **Zoom control on price charts**: Slider or +/- buttons to control visible candle count (zoom out = more candles, zoom in = fewer candles).
- **Horizontal scroll on PCR/OI panels**: Left/right scroll across timeline.
- **Stock tab 2 panels**: Stock price+volume panel + OI Data panel. Error message "The script does not have Options" for stocks without options.
- **Volume average input**: Number-of-days input field on stock volume chart to overlay a moving average line.
- **Paired Macro charts**: 
  - Daily: USD/INR line; FII+DII histograms together; Crude WTI+Brent histograms together; 3Y+5Y+10Y G-Sec lines together.
  - MoM: CPI+WPI lines together; Auto Sales+GST lines together; Mfg PMI+Services PMI lines together; FX Reserve line.
  - QoQ: GDP histogram + CAD% line together on dual-axis; Interest Rates line.
- **3 Macro dialog boxes**: One for Daily indicators, one for MoM, one for QoQ — each with sub-selector for the indicator group.

### Modify
- Tab order: Analysis (1), Index & Index Options OI (2), Stocks and Stocks Options OI (3), Macro Indicators (4), Fortnightly Sector Wise FII Data (5).
- Index price charts: replace line charts with candlestick charts.
- Stock price chart: replace line chart with candlestick chart.
- Macro daily FII/DII: change from line to histogram, show both series.
- Macro daily Crude: change to histogram, show both WTI and Brent.
- Macro QoQ GDP+CAD: dual-axis chart (GDP histogram + CAD% line).
- Nav labels updated to match new 5-tab names.

### Remove
- Shared index selector on old Index tab (replaced by 4 independent panels).
- Old Tab1/Tab2/Tab3/Tab4 naming — renumbered.

## Implementation Plan
1. Write spec.md (this file).
2. Implement CandlestickBar custom shape component for recharts.
3. Build Tab "Analysis" with Python placeholder section and summary metrics.
4. Build Tab "Index & Index Options OI":
   - 4 panels: Nifty50 price (candlestick + timeframe toggles + zoom), Nifty50 OI Data (PCR line + PE/CE histograms + expiry multi-select), BankNifty price, BankNifty OI Data.
5. Build Tab "Stocks and Stocks Options OI":
   - Stock search (Nifty 500 list), Stock price panel (candlestick + volume histogram + avg days input + timeframe + zoom), Stock OI Data panel (PCR line + PE/CE histograms + CM/NM multi-select, or error message).
6. Build Tab "Macro Indicators":
   - Daily box: USD/INR line; FII+DII histograms; Crude WTI+Brent histograms; G-Sec 3Y/5Y/10Y lines — each as a sub-card with selector.
   - MoM box: CPI+WPI; Auto Sales+GST; Mfg PMI+Services PMI; FX Reserve.
   - QoQ box: GDP+CAD% dual axis; Interest Rates.
7. Build Tab "Fortnightly Sector Wise FII Data":
   - Sector multi-select + line chart panel.
   - Sector stocks table panel.
8. Update nav to 5 tabs in correct order.
9. Validate and fix build errors.
