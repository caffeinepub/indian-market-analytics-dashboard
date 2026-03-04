# Indian Market Analytics Dashboard

## Current State
5-tab dashboard: Analysis, Index & Index Options OI, Stocks and Stocks Options OI, Macro Indicators, Fortnightly Sector Wise FII Data. Tab 5 uses FII Sectors (24 items) with a multiselect panel + stocks table panel. No Nifty index/sector listing tab exists.

## Requested Changes (Diff)

### Add
- New tab "Indices and Sectors" (6th tab) with two side-by-side panels:
  - **Panel 1: Sector/Index Selector** — Two grouped multiselect sections:
    1. "Nifty Sectors" — 25 entries (NIFTY50, BANKNIFTY, NIFTY NEXT 50, NIFTY AUTO, NIFTY FMCG, NIFTY IT, NIFTY MEDIA, NIFTY METAL, NIFTY PHARMA, NIFTY PSU BANK, NIFTY PRIVATE BANK, NIFTY REALTY, NIFTY HEALTHCARE, NIFTY CONSUMER DURABLES, NIFTY OIL & GAS, NIFTY COMMODITIES, NIFTY INDIA CONSUMPTION, NIFTY ENERGY, NIFTY INFRASTRUCTURE, NIFTY INDIA DEFENCE, NIFTY INDIA TOURISM, NIFTY CAPITAL MARKETS, NIFTY EV & NEW AGE AUTOMOTIVE, NIFTY MOBILITY, NIFTY RURAL)
    2. "FII Sectors" — 24 entries matching existing SECTORS list
    - Each group has Select All / Clear All for that group
    - Selected items shown with color badges
  - **Panel 2: Constituent Companies** — Shows a table of symbols/companies for all selected indices/sectors. Each selected index/sector shown as a collapsible group or flat list with stock name, symbol, sector type label (Nifty / FII)

- Mock stock constituent data for Nifty indices (at least key ones: NIFTY50, BANKNIFTY, major sectors)
- NIFTY_INDICES constant (25 entries) with constituent stocks per index

### Modify
- TABS array: add 6th entry `{ label: "Indices and Sectors", comp: <TabIndicesSectors /> }`
- Nav tab data-ocid sequence extended to `.6`

### Remove
- Nothing removed

## Implementation Plan
1. Add `NIFTY_INDICES` constant array (25 index names)
2. Add `NIFTY_INDEX_STOCKS` record mapping each Nifty index name to a list of `{ name, symbol }` constituent stocks (real NSE names for key indices; shorter mock lists for niche ones)
3. Add `TabIndicesSectors` function component:
   - State: `selectedNifty: string[]` (default: ["NIFTY50"]), `selectedFII: string[]` (default: [])
   - Left panel (or top on mobile): two grouped multiselect sections with colored checkboxes and Select All/Clear All per group
   - Right panel (or bottom on mobile): flat list/table of constituent stocks grouped by selected index/sector; columns — Index/Sector, Name, Symbol; scroll if long
4. Wire tab into TABS array as 6th entry with deterministic data-ocid
