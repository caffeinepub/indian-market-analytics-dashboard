# Indian Market Analytics Dashboard

## Current State
A 7-tab dashboard (Analysis, Index & Index Options OI, Stocks & Stocks Options OI, Results & Analytics, Macro Indicators, Fortnightly Sector Wise FII Data, Indices and Sectors) built in a single large App.tsx file (~11,836 lines). Each tab contains multiple panels with charts, controls, and data tables.

## Requested Changes (Diff)

### Add
- A reusable `PanelInfo` component: a small circular `ⓘ` icon button placed in the top-right corner of every panel header. Hovering/clicking shows a tooltip or popover with:
  - Panel name / purpose
  - What data is displayed (chart types, metrics)
  - Key parameters/controls available in that panel (e.g. timeframe selector, expiry selector, date picker, zoom controls)
- Info content for every panel across all 7 tabs:
  - **Analysis tab**: Python Analysis panel — describes the code editor, data source connections, and run/seed buttons
  - **Index & Index Options OI tab**: Nifty50 price panel, Nifty50 OI Data panel, BankNifty price panel, BankNifty OI Data panel
  - **Stocks & Stocks Options OI tab**: Stock Price & Volume panel, Stock OI Data panel
  - **Results & Analytics tab**: Summary & Trigger panel, Analytics Matrix panel, Visualization panel, Custom Logic & Notes panel
  - **Macro Indicators tab**: Daily Indicators panel, MoM Indicators panel, QoQ Indicators panel
  - **Fortnightly Sector Wise FII Data tab**: Sector FII Line Chart panel, Sector Stocks Table panel
  - **Indices and Sectors tab**: Nifty Indices panel, FII Sectors panel, Constituents panel

### Modify
- Each panel's header section to include the `PanelInfo` icon alongside the existing title

### Remove
- Nothing removed

## Implementation Plan
1. Create a reusable `PanelInfoIcon` component that accepts a `title` and `description` (string or JSX) prop, renders an `ⓘ` button, and displays a Popover/Tooltip on hover with the panel description content
2. For each panel in all 7 tabs, add `<PanelInfoIcon>` to the panel header with appropriate descriptive content covering:
   - What data the panel shows
   - Chart types used
   - Available controls/parameters (selectors, date pickers, zoom, swipe, etc.)
3. Ensure the info icon does not disrupt existing layout — use absolute positioning or flex-end alignment within panel headers
4. Apply `data-ocid` markers on the info icon buttons following the deterministic marker convention
