import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── COLORS ──────────────────────────────────────────────────────────────────
const EXPIRY_COLORS: Record<string, string> = {
  CW: "#3b82f6",
  NW: "#a855f7",
  CM: "#22c55e",
  NM: "#f97316",
};
const SECTOR_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
  "#8b5cf6",
  "#10b981",
  "#fb923c",
  "#6366f1",
  "#0ea5e9",
  "#d946ef",
  "#4ade80",
  "#fbbf24",
  "#60a5fa",
  "#34d399",
  "#f87171",
  "#c084fc",
  "#38bdf8",
];

// ─── MOCK DATA GENERATORS ────────────────────────────────────────────────────
function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function rndi(min: number, max: number) {
  return Math.floor(rnd(min, max));
}

function genDates(days: number, toDate = new Date("2026-03-03")): Date[] {
  const dates: Date[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(toDate);
    d.setDate(d.getDate() - i);
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(d);
  }
  return dates;
}

function formatDate(d: Date) {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

interface OHLC {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}
interface OHLCWithVolume extends OHLC {
  volume: number;
}

function genPriceSeries(
  days: number,
  base: number,
  volatility: number,
): OHLC[] {
  const dates = genDates(days + 40);
  const result: OHLC[] = [];
  let close = base;
  for (const d of dates) {
    const change = (Math.random() - 0.48) * volatility;
    const open = close * (1 + (Math.random() - 0.5) * 0.002);
    const high = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low = Math.min(open, close) * (1 - Math.random() * 0.012);
    close = open + change;
    result.push({
      date: d,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
    });
  }
  return result;
}

interface PCRBarData {
  date: string;
  pcrRatio: number;
  peOI: number;
  ceOI: number;
}

interface ExtendedPCRBarData extends PCRBarData {
  year: number;
  month: number;
}

// Extended PCR OI generator with year+month fields for filtering
// Generates ~1500 trading days (~6 years) back from 2026-03-03
function genPCROIDataFull(n: number): ExtendedPCRBarData[] {
  const dates = genDates(n);
  let pcr = 0.9;
  return dates.map((d) => {
    pcr = Math.max(0.5, Math.min(1.8, pcr + (Math.random() - 0.49) * 0.06));
    const ceOI = rndi(8_000_000, 25_000_000);
    const peOI = Math.round(ceOI * pcr);
    return {
      date: formatDate(d),
      pcrRatio: +pcr.toFixed(3),
      peOI,
      ceOI,
      year: d.getFullYear(),
      month: d.getMonth(),
    };
  });
}

// ─── PRECOMPUTED INDEX DATA ────────────────────────────────────────────────────
const NIFTY_DATA = genPriceSeries(300, 22800, 120);
const BANKNIFTY_DATA = genPriceSeries(300, 48500, 380);

// Full history PCR OI (2020-01 → 2026-03, ~1500 trading days)
const NIFTY_PCR_OI_FULL: Record<string, ExtendedPCRBarData[]> = {
  CW: genPCROIDataFull(1500),
  NW: genPCROIDataFull(1500),
  CM: genPCROIDataFull(1500),
  NM: genPCROIDataFull(1500),
};
const BANKNIFTY_PCR_OI_FULL: Record<string, ExtendedPCRBarData[]> = {
  CM: genPCROIDataFull(1500),
  NM: genPCROIDataFull(1500),
};

// ─── 200 NSE STOCKS ────────────────────────────────────────────────────────────
const STOCKS = [
  { sym: "RELIANCE", name: "Reliance Industries" },
  { sym: "TCS", name: "Tata Consultancy Services" },
  { sym: "HDFCBANK", name: "HDFC Bank" },
  { sym: "BHARTIARTL", name: "Bharti Airtel" },
  { sym: "ICICIBANK", name: "ICICI Bank" },
  { sym: "INFY", name: "Infosys" },
  { sym: "SBIN", name: "State Bank of India" },
  { sym: "LICI", name: "LIC of India" },
  { sym: "ITC", name: "ITC" },
  { sym: "HINDUNILVR", name: "Hindustan Unilever" },
  { sym: "LT", name: "Larsen & Toubro" },
  { sym: "BAJFINANCE", name: "Bajaj Finance" },
  { sym: "HCLTECH", name: "HCL Technologies" },
  { sym: "MARUTI", name: "Maruti Suzuki India" },
  { sym: "SUNPHARMA", name: "Sun Pharmaceutical" },
  { sym: "ADANIENT", name: "Adani Enterprises" },
  { sym: "KOTAKBANK", name: "Kotak Mahindra Bank" },
  { sym: "TITAN", name: "Titan Company" },
  { sym: "AXISBANK", name: "Axis Bank" },
  { sym: "ASIANPAINT", name: "Asian Paints" },
  { sym: "WIPRO", name: "Wipro" },
  { sym: "ULTRACEMCO", name: "UltraTech Cement" },
  { sym: "NESTLEIND", name: "Nestle India" },
  { sym: "ONGC", name: "ONGC" },
  { sym: "NTPC", name: "NTPC" },
  { sym: "POWERGRID", name: "Power Grid Corp" },
  { sym: "MM", name: "Mahindra & Mahindra" },
  { sym: "BAJAJFINSV", name: "Bajaj Finserv" },
  { sym: "JSWSTEEL", name: "JSW Steel" },
  { sym: "TATAMOTORS", name: "Tata Motors" },
  { sym: "TATASTEEL", name: "Tata Steel" },
  { sym: "ADANIPORTS", name: "Adani Ports & SEZ" },
  { sym: "COALINDIA", name: "Coal India" },
  { sym: "TECHM", name: "Tech Mahindra" },
  { sym: "HINDALCO", name: "Hindalco Industries" },
  { sym: "GRASIM", name: "Grasim Industries" },
  { sym: "DRREDDY", name: "Dr Reddys Laboratories" },
  { sym: "CIPLA", name: "Cipla" },
  { sym: "INDUSINDBK", name: "IndusInd Bank" },
  { sym: "EICHERMOT", name: "Eicher Motors" },
  { sym: "BRITANNIA", name: "Britannia Industries" },
  { sym: "APOLLOHOSP", name: "Apollo Hospitals" },
  { sym: "TATACONSUM", name: "Tata Consumer Products" },
  { sym: "BPCL", name: "BPCL" },
  { sym: "DIVISLAB", name: "Divis Laboratories" },
  { sym: "HEROMOTOCO", name: "Hero MotoCorp" },
  { sym: "SHREECEM", name: "Shree Cement" },
  { sym: "BAJAJ-AUTO", name: "Bajaj Auto" },
  { sym: "SBILIFE", name: "SBI Life Insurance" },
  { sym: "HDFCLIFE", name: "HDFC Life Insurance" },
  { sym: "ICICIPRULI", name: "ICICI Prudential Life" },
  { sym: "ICICIGI", name: "ICICI Lombard" },
  { sym: "UPL", name: "UPL" },
  { sym: "GAIL", name: "GAIL India" },
  { sym: "PIDILITIND", name: "Pidilite Industries" },
  { sym: "GODREJCP", name: "Godrej Consumer" },
  { sym: "DABUR", name: "Dabur India" },
  { sym: "AMBUJACEM", name: "Ambuja Cements" },
  { sym: "ACC", name: "ACC" },
  { sym: "COLPAL", name: "Colgate-Palmolive India" },
  { sym: "MARICO", name: "Marico" },
  { sym: "BERGEPAINT", name: "Berger Paints" },
  { sym: "HAVELLS", name: "Havells India" },
  { sym: "VOLTAS", name: "Voltas" },
  { sym: "CONCOR", name: "Container Corp of India" },
  { sym: "IRCTC", name: "IRCTC" },
  { sym: "IRFC", name: "IRFC" },
  { sym: "NHPC", name: "NHPC" },
  { sym: "SJVN", name: "SJVN" },
  { sym: "RECLTD", name: "REC" },
  { sym: "PFC", name: "Power Finance Corp" },
  { sym: "RVNL", name: "Rail Vikas Nigam" },
  { sym: "ABCAPITAL", name: "Aditya Birla Capital" },
  { sym: "CHOLAFIN", name: "Cholamandalam Finance" },
  { sym: "MUTHOOTFIN", name: "Muthoot Finance" },
  { sym: "SHRIRAMFIN", name: "Shriram Finance" },
  { sym: "LICHSGFIN", name: "LIC Housing Finance" },
  { sym: "PNB", name: "Punjab National Bank" },
  { sym: "BANKBARODA", name: "Bank of Baroda" },
  { sym: "CANBK", name: "Canara Bank" },
  { sym: "UNIONBANK", name: "Union Bank of India" },
  { sym: "IDFCFIRSTB", name: "IDFC First Bank" },
  { sym: "FEDERALBNK", name: "Federal Bank" },
  { sym: "BANDHANBNK", name: "Bandhan Bank" },
  { sym: "RBLBANK", name: "RBL Bank" },
  { sym: "YESBANK", name: "Yes Bank" },
  { sym: "NAUKRI", name: "Info Edge India" },
  { sym: "ZOMATO", name: "Zomato" },
  { sym: "PAYTM", name: "Paytm" },
  { sym: "DELHIVERY", name: "Delhivery" },
  { sym: "NYKAA", name: "Nykaa" },
  { sym: "POLICYBZR", name: "PolicyBazaar" },
  { sym: "TATATECH", name: "Tata Technologies" },
  { sym: "MPHASIS", name: "Mphasis" },
  { sym: "LTIM", name: "LTIMindtree" },
  { sym: "PERSISTENT", name: "Persistent Systems" },
  { sym: "COFORGE", name: "Coforge" },
  { sym: "KPITTECH", name: "KPIT Technologies" },
  { sym: "TANLA", name: "Tanla Platforms" },
  { sym: "CYIENT", name: "Cyient" },
  { sym: "BIRLASOFT", name: "Birlasoft" },
  { sym: "CESC", name: "CESC" },
  { sym: "TATAPOWER", name: "Tata Power" },
  { sym: "ADANIGREEN", name: "Adani Green Energy" },
  { sym: "TORNTPOWER", name: "Torrent Power" },
  { sym: "JSWENERGY", name: "JSW Energy" },
  { sym: "CUMMINSIND", name: "Cummins India" },
  { sym: "THERMAX", name: "Thermax" },
  { sym: "ABB", name: "ABB India" },
  { sym: "SIEMENS", name: "Siemens" },
  { sym: "BEL", name: "Bharat Electronics" },
  { sym: "HAL", name: "Hindustan Aeronautics" },
  { sym: "BHEL", name: "BHEL" },
  { sym: "NCC", name: "NCC" },
  { sym: "KEC", name: "KEC International" },
  { sym: "KALPATPOWR", name: "Kalpataru Power" },
  { sym: "ENGINERSIN", name: "Engineers India" },
  { sym: "APOLLOTYRE", name: "Apollo Tyres" },
  { sym: "CEATLTD", name: "CEAT" },
  { sym: "MRF", name: "MRF" },
  { sym: "BALKRISIND", name: "Balkrishna Industries" },
  { sym: "MOTHERSON", name: "Samvardhana Motherson" },
  { sym: "BOSCHLTD", name: "Bosch" },
  { sym: "EXIDEIND", name: "Exide Industries" },
  { sym: "TVSMOTOR", name: "TVS Motor" },
  { sym: "ESCORTS", name: "Escorts Kubota" },
  { sym: "ASHOKLEY", name: "Ashok Leyland" },
  { sym: "TATACHEM", name: "Tata Chemicals" },
  { sym: "DEEPAKNITR", name: "Deepak Nitrite" },
  { sym: "ASTRAL", name: "Astral" },
  { sym: "PRINCEPIPE", name: "Prince Pipes" },
  { sym: "NAVINFLUOR", name: "Navin Fluorine" },
  { sym: "SRF", name: "SRF" },
  { sym: "METROPOLIS", name: "Metropolis Healthcare" },
  { sym: "LALPATHLAB", name: "Dr Lal PathLabs" },
  { sym: "MAXHEALTH", name: "Max Healthcare" },
  { sym: "FORTIS", name: "Fortis Healthcare" },
  { sym: "KIMS", name: "KIMS" },
  { sym: "NARAYANHRU", name: "Narayana Hrudayalaya" },
  { sym: "ZYDUSLIFE", name: "Zydus Lifesciences" },
  { sym: "LUPIN", name: "Lupin" },
  { sym: "AUROPHARMA", name: "Aurobindo Pharma" },
  { sym: "TORNTPHARM", name: "Torrent Pharma" },
  { sym: "ALKEM", name: "Alkem Laboratories" },
  { sym: "ABBOTINDIA", name: "Abbott India" },
  { sym: "BIOCON", name: "Biocon" },
  { sym: "GRANULES", name: "Granules India" },
  { sym: "OBEROIRLTY", name: "Oberoi Realty" },
  { sym: "DLF", name: "DLF" },
  { sym: "GODREJPROP", name: "Godrej Properties" },
  { sym: "PRESTIGE", name: "Prestige Estates" },
  { sym: "BRIGADE", name: "Brigade Enterprises" },
  { sym: "SOBHA", name: "Sobha" },
  { sym: "PHOENIXLTD", name: "Phoenix Mills" },
  { sym: "MACROTECH", name: "Lodha" },
  { sym: "SUNTV", name: "Sun TV Network" },
  { sym: "ZEEL", name: "Zee Entertainment" },
  { sym: "PVRINOX", name: "PVR INOX" },
  { sym: "MANYAVAR", name: "Manyavar" },
  { sym: "ABFRL", name: "Aditya Birla Fashion" },
  { sym: "TRENT", name: "Trent" },
  { sym: "RELAXO", name: "Relaxo Footwears" },
  { sym: "BATA", name: "Bata India" },
  { sym: "PAGEIND", name: "Page Industries" },
  { sym: "KALYANKJIL", name: "Kalyan Jewellers" },
  { sym: "GLAND", name: "Gland Pharma" },
  { sym: "LAURUSLABS", name: "Laurus Labs" },
  { sym: "IPCALAB", name: "IPCA Laboratories" },
  { sym: "NATCOPHARM", name: "Natco Pharma" },
  { sym: "AJANTPHARM", name: "Ajanta Pharma" },
  { sym: "GLAXO", name: "GSK Pharma" },
  { sym: "DELTACORP", name: "Delta Corp" },
  { sym: "LEMONTREE", name: "Lemon Tree Hotels" },
  { sym: "NUVOCO", name: "Nuvoco Vistas" },
  { sym: "HEIDELBERG", name: "HeidelbergCement" },
  { sym: "JKCEMENT", name: "JK Cement" },
  { sym: "RAMCOCEM", name: "Ramco Cements" },
  { sym: "DALBHARAT", name: "Dalmia Bharat" },
  { sym: "CAMS", name: "CAMS" },
  { sym: "CDSL", name: "CDSL" },
  { sym: "BSE", name: "BSE" },
  { sym: "MCX", name: "MCX" },
  { sym: "ANGELONE", name: "Angel One" },
  { sym: "MOTILALOFS", name: "Motilal Oswal" },
  { sym: "IIFL", name: "IIFL Finance" },
  { sym: "MANAPPURAM", name: "Manappuram Finance" },
  { sym: "CREDITACC", name: "CreditAccess Grameen" },
  { sym: "UJJIVANSFB", name: "Ujjivan SFB" },
  { sym: "CROMPTON", name: "Crompton Greaves" },
  { sym: "VGUARD", name: "V-Guard Industries" },
];

// Stocks that have options (large-caps)
const STOCKS_WITH_OPTIONS = new Set([
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "BHARTIARTL",
  "ICICIBANK",
  "INFY",
  "SBIN",
  "ITC",
  "HINDUNILVR",
  "LT",
  "BAJFINANCE",
  "HCLTECH",
  "MARUTI",
  "SUNPHARMA",
  "ADANIENT",
  "KOTAKBANK",
  "TITAN",
  "AXISBANK",
  "ASIANPAINT",
  "WIPRO",
  "ULTRACEMCO",
  "NESTLEIND",
  "ONGC",
  "NTPC",
  "POWERGRID",
  "MM",
  "BAJAJFINSV",
  "JSWSTEEL",
  "TATAMOTORS",
  "TATASTEEL",
  "ADANIPORTS",
  "COALINDIA",
  "TECHM",
  "HINDALCO",
  "GRASIM",
  "DRREDDY",
  "CIPLA",
  "INDUSINDBK",
  "EICHERMOT",
  "BRITANNIA",
  "APOLLOHOSP",
  "TATACONSUM",
  "BPCL",
  "DIVISLAB",
  "HEROMOTOCO",
  "SHREECEM",
  "BAJAJ-AUTO",
  "SBILIFE",
  "HDFCLIFE",
  "GAIL",
  "PIDILITIND",
  "GODREJCP",
  "DABUR",
  "AMBUJACEM",
  "ACC",
  "COLPAL",
  "MARICO",
  "HAVELLS",
  "IRCTC",
  "RECLTD",
  "PFC",
  "CHOLAFIN",
  "MUTHOOTFIN",
  "SHRIRAMFIN",
  "PNB",
  "BANKBARODA",
  "CANBK",
  "IDFCFIRSTB",
  "FEDERALBNK",
  "ZOMATO",
  "NAUKRI",
  "MPHASIS",
  "LTIM",
  "PERSISTENT",
  "COFORGE",
  "KPITTECH",
  "TATAPOWER",
  "ADANIGREEN",
  "ABB",
  "SIEMENS",
  "BEL",
  "HAL",
  "APOLLOTYRE",
  "MRF",
  "TVSMOTOR",
  "ASHOKLEY",
  "DLF",
  "GODREJPROP",
  "PRESTIGE",
  "SUNTV",
  "TRENT",
  "LUPIN",
  "AUROPHARMA",
  "TORNTPHARM",
  "BIOCON",
]);

const STOCK_BASE_PRICES: Record<string, number> = {
  RELIANCE: 2850,
  TCS: 3900,
  HDFCBANK: 1680,
  BHARTIARTL: 1580,
  ICICIBANK: 1280,
  INFY: 1780,
  SBIN: 810,
  ITC: 480,
  HINDUNILVR: 2350,
  LT: 3650,
  BAJFINANCE: 7200,
  HCLTECH: 1680,
  MARUTI: 11800,
  SUNPHARMA: 1720,
  ADANIENT: 2480,
  KOTAKBANK: 1980,
  TITAN: 3580,
  AXISBANK: 1220,
  ASIANPAINT: 2680,
  MRF: 147500,
  PAGEIND: 44200,
  BOSCHLTD: 33800,
};

const stockDataCache: Record<string, OHLCWithVolume[]> = {};
function getStockData(sym: string): OHLCWithVolume[] {
  if (!stockDataCache[sym]) {
    const price = STOCK_BASE_PRICES[sym] ?? rnd(500, 3000);
    stockDataCache[sym] = genPriceSeries(200, price, price * 0.015).map(
      (d) => ({
        ...d,
        volume: rndi(500000, 8000000),
      }),
    );
  }
  return stockDataCache[sym];
}

const stockPCROIFullCache: Record<string, ExtendedPCRBarData[]> = {};
function getStockPCROIFull(sym: string, expiry: string): ExtendedPCRBarData[] {
  const key = `${sym}_${expiry}_full`;
  if (!stockPCROIFullCache[key])
    stockPCROIFullCache[key] = genPCROIDataFull(1500);
  return stockPCROIFullCache[key];
}

// OI Year options: 2020 to current year
function getOIYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2020; y <= currentYear; y++) years.push(y);
  return years;
}
const OI_YEAR_OPTIONS = getOIYearOptions();

// Given oiYear + oiMonth, compute the 4-month window
// Returns array of {year, month} for [oiMonth-3, oiMonth-2, oiMonth-1, oiMonth]
function getFourMonthRange(
  year: number,
  month: number,
): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  for (let offset = 3; offset >= 0; offset--) {
    let m = month - offset;
    let y = year;
    while (m < 0) {
      m += 12;
      y--;
    }
    result.push({ year: y, month: m });
  }
  return result;
}

// Filter extended PCR data to 4-month window
function filterPCROIFourMonths(
  data: ExtendedPCRBarData[],
  year: number,
  month: number,
): ExtendedPCRBarData[] {
  const range = getFourMonthRange(year, month);
  return data.filter((d) =>
    range.some((r) => r.year === d.year && r.month === d.month),
  );
}

// Merge extended PCR data sources filtered by 4-month window
function mergePCROIFiltered(
  source: Record<string, ExtendedPCRBarData[]>,
  selected: Record<string, boolean>,
  year: number,
  month: number,
): PCRBarData[] {
  const active = Object.keys(selected).filter((e) => selected[e]);
  if (!active.length) return [];
  // Collect all filtered entries from all active expiries, sorted by date
  const allEntries: ExtendedPCRBarData[] = [];
  for (const e of active) {
    const filtered = filterPCROIFourMonths(source[e] ?? [], year, month);
    allEntries.push(...filtered);
  }
  // Group by date string and merge
  const byDate = new Map<string, { peOI: number; ceOI: number }>();
  for (const entry of allEntries) {
    const existing = byDate.get(entry.date);
    if (existing) {
      existing.peOI += entry.peOI;
      existing.ceOI += entry.ceOI;
    } else {
      byDate.set(entry.date, { peOI: entry.peOI, ceOI: entry.ceOI });
    }
  }
  // Build sorted result
  return Array.from(byDate.entries())
    .sort(([a], [b]) => {
      // dates are DD/MM — sort by month first, then day within the 4-month window
      const [da, ma] = a.split("/").map(Number);
      const [db, mb] = b.split("/").map(Number);
      if (ma !== mb) return ma - mb;
      return da - db;
    })
    .map(([date, { peOI, ceOI }]) => ({
      date,
      pcrRatio: ceOI > 0 ? +(peOI / ceOI).toFixed(3) : 0,
      peOI,
      ceOI,
    }));
}

// ─── MACRO DATA ────────────────────────────────────────────────────────────────

// Helper: year options from 2005 to current year
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2005; y <= currentYear; y++) years.push(y);
  return years;
}
const YEAR_OPTIONS = getYearOptions();
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Extended daily macro generator — returns objects with year + month for filtering
interface DailyMacroEntry {
  date: string;
  value: number;
  year: number;
  month: number;
}
function genDailyMacroFull(base: number, vol: number): DailyMacroEntry[] {
  // Generate ~5600 trading days back from 2026-03-03 (covers back to Jan 2005)
  const dates = genDates(5600);
  let v = base;
  return dates.map((d) => {
    v = Math.max(
      base * 0.7,
      Math.min(base * 1.3, v + (Math.random() - 0.49) * vol),
    );
    return {
      date: formatDate(d),
      value: +v.toFixed(3),
      year: d.getFullYear(),
      month: d.getMonth(),
    };
  });
}

interface FIIDailyEntry {
  date: string;
  fii: number;
  dii: number;
  year: number;
  month: number;
}
interface CrudeDailyEntry {
  date: string;
  wti: number;
  brent: number;
  year: number;
  month: number;
}
interface GSECDailyEntry {
  date: string;
  y3: number;
  y5: number;
  y10: number;
  year: number;
  month: number;
}

const ALL_DAILY_DATES = genDates(5600);
const MACRO_USDINT_FULL: DailyMacroEntry[] = genDailyMacroFull(83.5, 0.15);
const MACRO_FII_FULL: FIIDailyEntry[] = ALL_DAILY_DATES.map((d) => ({
  date: formatDate(d),
  fii: +rnd(-3500, 4000).toFixed(0),
  dii: +rnd(-1500, 3500).toFixed(0),
  year: d.getFullYear(),
  month: d.getMonth(),
}));
const MACRO_CRUDE_FULL: CrudeDailyEntry[] = ALL_DAILY_DATES.map((d) => ({
  date: formatDate(d),
  wti: +rnd(60, 115).toFixed(2),
  brent: +rnd(64, 120).toFixed(2),
  year: d.getFullYear(),
  month: d.getMonth(),
}));
const MACRO_GSEC_FULL: GSECDailyEntry[] = ALL_DAILY_DATES.map((d) => ({
  date: formatDate(d),
  y3: +(6.5 + Math.random() * 0.6).toFixed(3),
  y5: +(6.8 + Math.random() * 0.6).toFixed(3),
  y10: +(7.0 + Math.random() * 0.5).toFixed(3),
  year: d.getFullYear(),
  month: d.getMonth(),
}));

// Extended monthly data — 252 months back from Mar 2026 = covers Jan 2005
interface MonthlyEntry {
  label: string;
  year: number;
  month: number;
}
function genMonthlyDatesFull(n: number): MonthlyEntry[] {
  const entries: MonthlyEntry[] = [];
  const base = new Date(2026, 2, 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setMonth(d.getMonth() - i);
    entries.push({
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return entries;
}

const MOM_DATES_FULL = genMonthlyDatesFull(252);

interface CPIWPIEntry {
  date: string;
  cpi: number;
  wpi: number;
  year: number;
  month: number;
}
interface AutoGSTEntry {
  date: string;
  autoSales: number;
  gst: number;
  year: number;
  month: number;
}
interface PMIEntry {
  date: string;
  mfg: number;
  services: number;
  year: number;
  month: number;
}
interface FXReserveEntry {
  date: string;
  value: number;
  year: number;
  month: number;
}

const MACRO_CPI_WPI_FULL: CPIWPIEntry[] = MOM_DATES_FULL.map(
  ({ label, year, month }, i) => ({
    date: label,
    cpi: +(5.0 + Math.sin(i * 0.4) * 0.8 + (Math.random() - 0.5) * 0.4).toFixed(
      2,
    ),
    wpi: +(
      2.5 +
      Math.sin(i * 0.35) * 1.2 +
      (Math.random() - 0.5) * 0.6
    ).toFixed(2),
    year,
    month,
  }),
);
const MACRO_AUTO_GST_FULL: AutoGSTEntry[] = MOM_DATES_FULL.map(
  ({ label, year, month }, i) => ({
    date: label,
    autoSales: +(
      38 +
      Math.sin(i * 0.3) * 4 +
      (Math.random() - 0.5) * 3
    ).toFixed(1),
    gst: +(1.82 + (i / 252) * 0.8 + (Math.random() - 0.5) * 0.05).toFixed(3),
    year,
    month,
  }),
);
const MACRO_PMI_FULL: PMIEntry[] = MOM_DATES_FULL.map(
  ({ label, year, month }, i) => ({
    date: label,
    mfg: +(56.5 + Math.sin(i * 0.25) * 2 + (Math.random() - 0.5) * 1.5).toFixed(
      1,
    ),
    services: +(
      58.5 +
      Math.sin(i * 0.3) * 2.5 +
      (Math.random() - 0.5) * 1.8
    ).toFixed(1),
    year,
    month,
  }),
);
const MACRO_FXRESERVE_FULL: FXReserveEntry[] = MOM_DATES_FULL.map(
  ({ label, year, month }, i) => ({
    date: label,
    value: +(350 + (i / 252) * 280 + (Math.random() - 0.5) * 12).toFixed(1),
    year,
    month,
  }),
);

// Extended quarterly data — Q1FY06 through Q4FY25 (80 quarters)
interface QuarterEntry {
  label: string;
  fyYear: number; // FY year number e.g. 2021 for FY21
  qNum: number; // 1–4
  calStartYear: number; // calendar year when this quarter starts
}
function genFullQtrDates(): QuarterEntry[] {
  const entries: QuarterEntry[] = [];
  // FY06 = Apr 2005 – Mar 2006, Q1FY06 = Apr-Jun 2005 (calStartYear=2005)
  // FY25 = Apr 2024 – Mar 2025, Q4FY25 = Jan-Mar 2025 (calStartYear=2025)
  for (let fy = 6; fy <= 25; fy++) {
    const fyYear = 2000 + fy;
    for (let q = 1; q <= 4; q++) {
      // Q1 = Apr-Jun (calStart = fyYear-1), Q2 = Jul-Sep (calStart = fyYear-1)
      // Q3 = Oct-Dec (calStart = fyYear-1), Q4 = Jan-Mar (calStart = fyYear)
      const calStartYear = q <= 3 ? fyYear - 1 : fyYear;
      entries.push({
        label: `Q${q}FY${fy.toString().padStart(2, "0")}`,
        fyYear,
        qNum: q,
        calStartYear,
      });
    }
  }
  return entries;
}

const QTR_DATES_FULL = genFullQtrDates();

interface GDPCADEntry {
  date: string;
  gdp: number;
  cad: number;
  fyYear: number;
  calStartYear: number;
}
interface RatesEntry {
  date: string;
  repoRate: number;
  fxReserve: number;
  fyYear: number;
  calStartYear: number;
}
interface FXAndRatesEntry {
  date: string;
  repoRate: number;
  fxReserve: number;
  fyYear: number;
  calStartYear: number;
}

function getRepoRate(fyYear: number, qNum: number): number {
  // Simulate historical repo rate progression
  if (fyYear <= 8) return 6.0;
  if (fyYear <= 10) return 7.25;
  if (fyYear <= 12) return 8.0;
  if (fyYear <= 14) return 8.0;
  if (fyYear <= 16) return 6.75;
  if (fyYear <= 18) return 6.0;
  if (fyYear <= 20) return 5.15;
  if (fyYear <= 21) return 4.0;
  if (fyYear <= 22) return qNum <= 2 ? 4.0 : 4.9;
  if (fyYear <= 23) return qNum <= 1 ? 5.9 : 6.25;
  return 6.5;
}

const MACRO_GDP_CAD_FULL: GDPCADEntry[] = QTR_DATES_FULL.map(
  ({ label, fyYear, calStartYear }, i) => ({
    date: label,
    gdp: +(6.5 + Math.sin(i * 0.2) * 1.5 + (Math.random() - 0.5) * 0.5).toFixed(
      1,
    ),
    cad: +(
      -1.8 +
      Math.sin(i * 0.18) * 0.8 +
      (Math.random() - 0.5) * 0.3
    ).toFixed(2),
    fyYear,
    calStartYear,
  }),
);

const MACRO_RATES_FULL: RatesEntry[] = QTR_DATES_FULL.map(
  ({ label, fyYear, qNum, calStartYear }, i) => ({
    date: label,
    repoRate: getRepoRate(fyYear, qNum),
    fxReserve: +(200 + (i / 80) * 430 + (Math.random() - 0.5) * 15).toFixed(1),
    fyYear,
    calStartYear,
  }),
);

const MACRO_FX_AND_RATES_FULL: FXAndRatesEntry[] = QTR_DATES_FULL.map(
  ({ label, fyYear, qNum, calStartYear }, i) => {
    // Map to approximate FX reserve from full monthly data
    const monthIdx = Math.min(
      MACRO_FXRESERVE_FULL.length - 1,
      Math.round(i * (252 / 80)),
    );
    return {
      date: label,
      repoRate: getRepoRate(fyYear, qNum),
      fxReserve: MACRO_FXRESERVE_FULL[monthIdx]?.value ?? 500,
      fyYear,
      calStartYear,
    };
  },
);

// Legacy short aliases retained as fallbacks (unused by current cards)
const _MOM_DATES = MOM_DATES_FULL.slice(-24).map((e) => e.label);
const _MACRO_CPI_WPI = MACRO_CPI_WPI_FULL.slice(-24).map(
  ({ date, cpi, wpi }) => ({ date, cpi, wpi }),
);
const _MACRO_AUTO_GST = MACRO_AUTO_GST_FULL.slice(-24).map(
  ({ date, autoSales, gst }) => ({ date, autoSales, gst }),
);
const _MACRO_PMI = MACRO_PMI_FULL.slice(-24).map(({ date, mfg, services }) => ({
  date,
  mfg,
  services,
}));
const _MACRO_FXRESERVE = MACRO_FXRESERVE_FULL.slice(-24).map(
  ({ date, value }) => ({ date, value }),
);
const _QTR_DATES = QTR_DATES_FULL.slice(-12).map((e) => e.label);
const _MACRO_GDP_CAD = MACRO_GDP_CAD_FULL.slice(-12).map(
  ({ date, gdp, cad }) => ({ date, gdp, cad }),
);
const _MACRO_RATES = MACRO_RATES_FULL.slice(-12).map(
  ({ date, repoRate, fxReserve }) => ({ date, repoRate, fxReserve }),
);
const _MACRO_FX_AND_RATES = MACRO_FX_AND_RATES_FULL.slice(-12).map(
  ({ date, repoRate, fxReserve }) => ({ date, repoRate, fxReserve }),
);
const _MACRO_USDINT = MACRO_USDINT_FULL.slice(-300).map(({ date, value }) => ({
  date,
  value,
}));
// Suppress unused-variable warnings on intentional stubs
void _MOM_DATES;
void _MACRO_CPI_WPI;
void _MACRO_AUTO_GST;
void _MACRO_PMI;
void _MACRO_FXRESERVE;
void _QTR_DATES;
void _MACRO_GDP_CAD;
void _MACRO_RATES;
void _MACRO_FX_AND_RATES;
void _MACRO_USDINT;

// ─── NIFTY INDICES DATA ────────────────────────────────────────────────────────
const NIFTY_INDICES = [
  "NIFTY50",
  "BANKNIFTY",
  "NIFTY NEXT 50",
  "NIFTY AUTO",
  "NIFTY FMCG",
  "NIFTY IT",
  "NIFTY MEDIA",
  "NIFTY METAL",
  "NIFTY PHARMA",
  "NIFTY PSU BANK",
  "NIFTY PRIVATE BANK",
  "NIFTY REALTY",
  "NIFTY HEALTHCARE",
  "NIFTY CONSUMER DURABLES",
  "NIFTY OIL & GAS",
  "NIFTY COMMODITIES",
  "NIFTY INDIA CONSUMPTION",
  "NIFTY ENERGY",
  "NIFTY INFRASTRUCTURE",
  "NIFTY INDIA DEFENCE",
  "NIFTY INDIA TOURISM",
  "NIFTY CAPITAL MARKETS",
  "NIFTY EV & NEW AGE AUTOMOTIVE",
  "NIFTY MOBILITY",
  "NIFTY RURAL",
];

interface IndexConstituent {
  name: string;
  symbol: string;
}

const NIFTY_INDEX_STOCKS: Record<string, IndexConstituent[]> = {
  NIFTY50: [
    { name: "Reliance Industries", symbol: "RELIANCE" },
    { name: "Tata Consultancy Services", symbol: "TCS" },
    { name: "HDFC Bank", symbol: "HDFCBANK" },
    { name: "Bharti Airtel", symbol: "BHARTIARTL" },
    { name: "ICICI Bank", symbol: "ICICIBANK" },
    { name: "Infosys", symbol: "INFY" },
    { name: "State Bank of India", symbol: "SBIN" },
    { name: "LIC of India", symbol: "LICI" },
    { name: "ITC", symbol: "ITC" },
    { name: "Hindustan Unilever", symbol: "HINDUNILVR" },
    { name: "Larsen & Toubro", symbol: "LT" },
    { name: "Bajaj Finance", symbol: "BAJFINANCE" },
    { name: "HCL Technologies", symbol: "HCLTECH" },
    { name: "Maruti Suzuki India", symbol: "MARUTI" },
    { name: "Sun Pharmaceutical", symbol: "SUNPHARMA" },
    { name: "Adani Enterprises", symbol: "ADANIENT" },
    { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK" },
    { name: "Titan Company", symbol: "TITAN" },
    { name: "Axis Bank", symbol: "AXISBANK" },
    { name: "Asian Paints", symbol: "ASIANPAINT" },
    { name: "Wipro", symbol: "WIPRO" },
    { name: "UltraTech Cement", symbol: "ULTRACEMCO" },
    { name: "Nestle India", symbol: "NESTLEIND" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "Power Grid Corp", symbol: "POWERGRID" },
    { name: "Mahindra & Mahindra", symbol: "MM" },
    { name: "Bajaj Finserv", symbol: "BAJAJFINSV" },
    { name: "JSW Steel", symbol: "JSWSTEEL" },
    { name: "Tata Motors", symbol: "TATAMOTORS" },
    { name: "Tata Steel", symbol: "TATASTEEL" },
    { name: "Adani Ports & SEZ", symbol: "ADANIPORTS" },
    { name: "Coal India", symbol: "COALINDIA" },
    { name: "Tech Mahindra", symbol: "TECHM" },
    { name: "Hindalco Industries", symbol: "HINDALCO" },
    { name: "Grasim Industries", symbol: "GRASIM" },
    { name: "Dr Reddys Laboratories", symbol: "DRREDDY" },
    { name: "Cipla", symbol: "CIPLA" },
    { name: "IndusInd Bank", symbol: "INDUSINDBK" },
    { name: "Eicher Motors", symbol: "EICHERMOT" },
    { name: "Britannia Industries", symbol: "BRITANNIA" },
    { name: "Apollo Hospitals", symbol: "APOLLOHOSP" },
    { name: "Tata Consumer Products", symbol: "TATACONSUM" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "Divis Laboratories", symbol: "DIVISLAB" },
    { name: "Hero MotoCorp", symbol: "HEROMOTOCO" },
    { name: "Shree Cement", symbol: "SHREECEM" },
    { name: "Bajaj Auto", symbol: "BAJAJ-AUTO" },
    { name: "SBI Life Insurance", symbol: "SBILIFE" },
    { name: "HDFC Life Insurance", symbol: "HDFCLIFE" },
  ],
  BANKNIFTY: [
    { name: "HDFC Bank", symbol: "HDFCBANK" },
    { name: "ICICI Bank", symbol: "ICICIBANK" },
    { name: "State Bank of India", symbol: "SBIN" },
    { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK" },
    { name: "Axis Bank", symbol: "AXISBANK" },
    { name: "IndusInd Bank", symbol: "INDUSINDBK" },
    { name: "Punjab National Bank", symbol: "PNB" },
    { name: "Bank of Baroda", symbol: "BANKBARODA" },
    { name: "Federal Bank", symbol: "FEDERALBNK" },
    { name: "IDFC First Bank", symbol: "IDFCFIRSTB" },
    { name: "Bandhan Bank", symbol: "BANDHANBNK" },
    { name: "AU Small Finance Bank", symbol: "AUBANK" },
  ],
  "NIFTY NEXT 50": [
    { name: "Adani Green Energy", symbol: "ADANIGREEN" },
    { name: "Adani Total Gas", symbol: "ATGL" },
    { name: "Zomato", symbol: "ZOMATO" },
    { name: "DLF", symbol: "DLF" },
    { name: "Vedanta", symbol: "VEDL" },
    { name: "Siemens", symbol: "SIEMENS" },
    { name: "Godrej Consumer", symbol: "GODREJCP" },
    { name: "Pidilite Industries", symbol: "PIDILITIND" },
    { name: "Havells India", symbol: "HAVELLS" },
    { name: "SBI Cards", symbol: "SBICARD" },
    { name: "Muthoot Finance", symbol: "MUTHOOTFIN" },
    { name: "Cholamandalam Finance", symbol: "CHOLAFIN" },
    { name: "Tata Power", symbol: "TATAPOWER" },
    { name: "Dabur India", symbol: "DABUR" },
    { name: "Colgate-Palmolive India", symbol: "COLPAL" },
    { name: "Marico", symbol: "MARICO" },
    { name: "Naukri (Info Edge)", symbol: "NAUKRI" },
    { name: "Berger Paints", symbol: "BERGEPAINT" },
    { name: "Godrej Properties", symbol: "GODREJPROP" },
    { name: "Oberoi Realty", symbol: "OBEROIRLTY" },
  ],
  "NIFTY AUTO": [
    { name: "Maruti Suzuki India", symbol: "MARUTI" },
    { name: "Tata Motors", symbol: "TATAMOTORS" },
    { name: "Mahindra & Mahindra", symbol: "MM" },
    { name: "Bajaj Auto", symbol: "BAJAJ-AUTO" },
    { name: "Hero MotoCorp", symbol: "HEROMOTOCO" },
    { name: "Eicher Motors", symbol: "EICHERMOT" },
    { name: "TVS Motor", symbol: "TVSMOTOR" },
    { name: "Ashok Leyland", symbol: "ASHOKLEY" },
    { name: "Bosch", symbol: "BOSCHLTD" },
    { name: "Motherson Sumi", symbol: "MOTHERSUMI" },
    { name: "Bharat Forge", symbol: "BHARATFORG" },
    { name: "MRF", symbol: "MRF" },
    { name: "Apollo Tyres", symbol: "APOLLOTYRE" },
    { name: "Exide Industries", symbol: "EXIDEIND" },
    { name: "Balkrishna Industries", symbol: "BALKRISIND" },
  ],
  "NIFTY FMCG": [
    { name: "Hindustan Unilever", symbol: "HINDUNILVR" },
    { name: "ITC", symbol: "ITC" },
    { name: "Nestle India", symbol: "NESTLEIND" },
    { name: "Britannia Industries", symbol: "BRITANNIA" },
    { name: "Tata Consumer Products", symbol: "TATACONSUM" },
    { name: "Godrej Consumer", symbol: "GODREJCP" },
    { name: "Dabur India", symbol: "DABUR" },
    { name: "Colgate-Palmolive India", symbol: "COLPAL" },
    { name: "Marico", symbol: "MARICO" },
    { name: "Emami", symbol: "EMAMILTD" },
    { name: "Varun Beverages", symbol: "VBL" },
    { name: "United Breweries", symbol: "UBL" },
  ],
  "NIFTY IT": [
    { name: "Tata Consultancy Services", symbol: "TCS" },
    { name: "Infosys", symbol: "INFY" },
    { name: "HCL Technologies", symbol: "HCLTECH" },
    { name: "Wipro", symbol: "WIPRO" },
    { name: "Tech Mahindra", symbol: "TECHM" },
    { name: "LTIMindtree", symbol: "LTIM" },
    { name: "Mphasis", symbol: "MPHASIS" },
    { name: "Coforge", symbol: "COFORGE" },
    { name: "Persistent Systems", symbol: "PERSISTENT" },
    { name: "Oracle Financial Services", symbol: "OFSS" },
  ],
  "NIFTY MEDIA": [
    { name: "Zee Entertainment", symbol: "ZEEL" },
    { name: "Sun TV Network", symbol: "SUNTV" },
    { name: "PVR Inox", symbol: "PVRINOX" },
    { name: "Dish TV India", symbol: "DISHTV" },
    { name: "Hathway Cable", symbol: "HATHWAY" },
    { name: "Den Networks", symbol: "DEN" },
    { name: "Network18 Media", symbol: "NETWORK18" },
    { name: "TV18 Broadcast", symbol: "TV18BRDCST" },
  ],
  "NIFTY METAL": [
    { name: "Tata Steel", symbol: "TATASTEEL" },
    { name: "JSW Steel", symbol: "JSWSTEEL" },
    { name: "Hindalco Industries", symbol: "HINDALCO" },
    { name: "Vedanta", symbol: "VEDL" },
    { name: "Coal India", symbol: "COALINDIA" },
    { name: "NMDC", symbol: "NMDC" },
    { name: "SAIL", symbol: "SAIL" },
    { name: "Hindustan Zinc", symbol: "HINDZINC" },
    { name: "Jindal Steel & Power", symbol: "JINDALSTEL" },
    { name: "National Aluminium", symbol: "NATIONALUM" },
    { name: "Welspun Corp", symbol: "WELCORP" },
  ],
  "NIFTY PHARMA": [
    { name: "Sun Pharmaceutical", symbol: "SUNPHARMA" },
    { name: "Dr Reddys Laboratories", symbol: "DRREDDY" },
    { name: "Cipla", symbol: "CIPLA" },
    { name: "Divis Laboratories", symbol: "DIVISLAB" },
    { name: "Aurobindo Pharma", symbol: "AUROPHARMA" },
    { name: "Lupin", symbol: "LUPIN" },
    { name: "Biocon", symbol: "BIOCON" },
    { name: "Gland Pharma", symbol: "GLAND" },
    { name: "Abbott India", symbol: "ABBOTINDIA" },
    { name: "Alkem Laboratories", symbol: "ALKEM" },
    { name: "Torrent Pharmaceuticals", symbol: "TORNTPHARM" },
    { name: "Ipca Laboratories", symbol: "IPCALAB" },
  ],
  "NIFTY PSU BANK": [
    { name: "State Bank of India", symbol: "SBIN" },
    { name: "Punjab National Bank", symbol: "PNB" },
    { name: "Bank of Baroda", symbol: "BANKBARODA" },
    { name: "Canara Bank", symbol: "CANBK" },
    { name: "Union Bank of India", symbol: "UNIONBANK" },
    { name: "Indian Bank", symbol: "INDIANB" },
    { name: "Bank of India", symbol: "BANKINDIA" },
    { name: "Central Bank of India", symbol: "CENTRALBK" },
    { name: "UCO Bank", symbol: "UCOBANK" },
    { name: "Punjab & Sind Bank", symbol: "PSB" },
    { name: "Indian Overseas Bank", symbol: "IOB" },
    { name: "Bank of Maharashtra", symbol: "MAHABANK" },
  ],
  "NIFTY PRIVATE BANK": [
    { name: "HDFC Bank", symbol: "HDFCBANK" },
    { name: "ICICI Bank", symbol: "ICICIBANK" },
    { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK" },
    { name: "Axis Bank", symbol: "AXISBANK" },
    { name: "IndusInd Bank", symbol: "INDUSINDBK" },
    { name: "Federal Bank", symbol: "FEDERALBNK" },
    { name: "IDFC First Bank", symbol: "IDFCFIRSTB" },
    { name: "Bandhan Bank", symbol: "BANDHANBNK" },
    { name: "AU Small Finance Bank", symbol: "AUBANK" },
    { name: "RBL Bank", symbol: "RBLBANK" },
  ],
  "NIFTY REALTY": [
    { name: "DLF", symbol: "DLF" },
    { name: "Godrej Properties", symbol: "GODREJPROP" },
    { name: "Oberoi Realty", symbol: "OBEROIRLTY" },
    { name: "Prestige Estates", symbol: "PRESTIGE" },
    { name: "Brigade Enterprises", symbol: "BRIGADE" },
    { name: "Sobha", symbol: "SOBHA" },
    { name: "Macrotech Developers (Lodha)", symbol: "LODHA" },
    { name: "Sunteck Realty", symbol: "SUNTECK" },
    { name: "Phoenix Mills", symbol: "PHOENIXLTD" },
    { name: "Indiabulls Real Estate", symbol: "IBREALEST" },
  ],
  "NIFTY HEALTHCARE": [
    { name: "Sun Pharmaceutical", symbol: "SUNPHARMA" },
    { name: "Apollo Hospitals", symbol: "APOLLOHOSP" },
    { name: "Dr Reddys Laboratories", symbol: "DRREDDY" },
    { name: "Cipla", symbol: "CIPLA" },
    { name: "Divis Laboratories", symbol: "DIVISLAB" },
    { name: "Max Healthcare", symbol: "MAXHEALTH" },
    { name: "Fortis Healthcare", symbol: "FORTIS" },
    { name: "Narayana Hrudayalaya", symbol: "NH" },
    { name: "Metropolis Healthcare", symbol: "METROPOLIS" },
    { name: "Dr Lal PathLabs", symbol: "LALPATHLAB" },
  ],
  "NIFTY CONSUMER DURABLES": [
    { name: "Titan Company", symbol: "TITAN" },
    { name: "Asian Paints", symbol: "ASIANPAINT" },
    { name: "Havells India", symbol: "HAVELLS" },
    { name: "Voltas", symbol: "VOLTAS" },
    { name: "Berger Paints", symbol: "BERGEPAINT" },
    { name: "Whirlpool of India", symbol: "WHIRLPOOL" },
    { name: "Crompton Greaves Consumer", symbol: "CROMPTON" },
    { name: "Orient Electric", symbol: "ORIENTELEC" },
    { name: "Blue Star", symbol: "BLUESTARCO" },
    { name: "Bajaj Electricals", symbol: "BAJAJELEC" },
    { name: "Kalyan Jewellers", symbol: "KALYANKJIL" },
    { name: "PC Jeweller", symbol: "PCJEWELLER" },
  ],
  "NIFTY OIL & GAS": [
    { name: "Reliance Industries", symbol: "RELIANCE" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "GAIL India", symbol: "GAIL" },
    { name: "Indian Oil Corp", symbol: "IOC" },
    { name: "Hindustan Petroleum", symbol: "HINDPETRO" },
    { name: "Oil India", symbol: "OIL" },
    { name: "Petronet LNG", symbol: "PETRONET" },
    { name: "Adani Total Gas", symbol: "ATGL" },
    { name: "Gujarat Gas", symbol: "GUJGASLTD" },
  ],
  "NIFTY COMMODITIES": [
    { name: "Reliance Industries", symbol: "RELIANCE" },
    { name: "Tata Steel", symbol: "TATASTEEL" },
    { name: "JSW Steel", symbol: "JSWSTEEL" },
    { name: "Hindalco Industries", symbol: "HINDALCO" },
    { name: "Coal India", symbol: "COALINDIA" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "UltraTech Cement", symbol: "ULTRACEMCO" },
    { name: "Grasim Industries", symbol: "GRASIM" },
    { name: "NMDC", symbol: "NMDC" },
    { name: "Vedanta", symbol: "VEDL" },
  ],
  "NIFTY INDIA CONSUMPTION": [
    { name: "Hindustan Unilever", symbol: "HINDUNILVR" },
    { name: "ITC", symbol: "ITC" },
    { name: "Titan Company", symbol: "TITAN" },
    { name: "Maruti Suzuki India", symbol: "MARUTI" },
    { name: "Nestle India", symbol: "NESTLEIND" },
    { name: "Asian Paints", symbol: "ASIANPAINT" },
    { name: "Britannia Industries", symbol: "BRITANNIA" },
    { name: "Dabur India", symbol: "DABUR" },
    { name: "Godrej Consumer", symbol: "GODREJCP" },
    { name: "Colgate-Palmolive India", symbol: "COLPAL" },
    { name: "Marico", symbol: "MARICO" },
    { name: "Varun Beverages", symbol: "VBL" },
  ],
  "NIFTY ENERGY": [
    { name: "Reliance Industries", symbol: "RELIANCE" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "Power Grid Corp", symbol: "POWERGRID" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "GAIL India", symbol: "GAIL" },
    { name: "Tata Power", symbol: "TATAPOWER" },
    { name: "Adani Green Energy", symbol: "ADANIGREEN" },
    { name: "Torrent Power", symbol: "TORNTPOWER" },
    { name: "NHPC", symbol: "NHPC" },
  ],
  "NIFTY INFRASTRUCTURE": [
    { name: "Larsen & Toubro", symbol: "LT" },
    { name: "Adani Ports & SEZ", symbol: "ADANIPORTS" },
    { name: "Power Grid Corp", symbol: "POWERGRID" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "UltraTech Cement", symbol: "ULTRACEMCO" },
    { name: "Adani Enterprises", symbol: "ADANIENT" },
    { name: "Container Corp of India", symbol: "CONCOR" },
    { name: "RVNL", symbol: "RVNL" },
    { name: "IRB Infrastructure", symbol: "IRB" },
    { name: "KNR Constructions", symbol: "KNRCON" },
    { name: "NCC", symbol: "NCC" },
  ],
  "NIFTY INDIA DEFENCE": [
    { name: "HAL (Hindustan Aeronautics)", symbol: "HAL" },
    { name: "BEL (Bharat Electronics)", symbol: "BEL" },
    { name: "BHEL", symbol: "BHEL" },
    { name: "Mazagon Dock", symbol: "MAZDOCK" },
    { name: "Cochin Shipyard", symbol: "COCHINSHIP" },
    { name: "Garden Reach Shipbuilders", symbol: "GRSE" },
    { name: "Data Patterns India", symbol: "DATAPATTE" },
    { name: "Paras Defence", symbol: "PARAS" },
    { name: "Solar Industries", symbol: "SOLARINDS" },
    { name: "Astra Microwave", symbol: "ASTRAMICRO" },
  ],
  "NIFTY INDIA TOURISM": [
    { name: "Indian Hotels (Taj)", symbol: "INDHOTEL" },
    { name: "EIH (Oberoi)", symbol: "EIHOTEL" },
    { name: "Thomas Cook India", symbol: "THOMASCOOK" },
    { name: "IRCTC", symbol: "IRCTC" },
    { name: "InterGlobe Aviation (IndiGo)", symbol: "INDIGO" },
    { name: "SpiceJet", symbol: "SPICEJET" },
    { name: "PVR Inox", symbol: "PVRINOX" },
    { name: "Lemon Tree Hotels", symbol: "LEMONTREE" },
  ],
  "NIFTY CAPITAL MARKETS": [
    { name: "BSE", symbol: "BSE" },
    { name: "MCX", symbol: "MCX" },
    { name: "CDSL", symbol: "CDSL" },
    { name: "Angel One", symbol: "ANGELONE" },
    { name: "5paisa Capital", symbol: "5PAISA" },
    { name: "ICICI Securities", symbol: "ISEC" },
    { name: "Motilal Oswal Financial", symbol: "MOTILALOFS" },
    { name: "Nippon Life India AMC", symbol: "NAM-INDIA" },
    { name: "HDFC AMC", symbol: "HDFCAMC" },
    { name: "UTI AMC", symbol: "UTIAMC" },
  ],
  "NIFTY EV & NEW AGE AUTOMOTIVE": [
    { name: "Tata Motors", symbol: "TATAMOTORS" },
    { name: "Mahindra & Mahindra", symbol: "MM" },
    { name: "Ola Electric", symbol: "OLAELEC" },
    { name: "Hero MotoCorp", symbol: "HEROMOTOCO" },
    { name: "TVS Motor", symbol: "TVSMOTOR" },
    { name: "Exide Industries", symbol: "EXIDEIND" },
    { name: "Amara Raja Energy", symbol: "AMARAJABAT" },
    { name: "Tata Power", symbol: "TATAPOWER" },
  ],
  "NIFTY MOBILITY": [
    { name: "Maruti Suzuki India", symbol: "MARUTI" },
    { name: "Tata Motors", symbol: "TATAMOTORS" },
    { name: "Mahindra & Mahindra", symbol: "MM" },
    { name: "Bajaj Auto", symbol: "BAJAJ-AUTO" },
    { name: "Hero MotoCorp", symbol: "HEROMOTOCO" },
    { name: "InterGlobe Aviation (IndiGo)", symbol: "INDIGO" },
    { name: "Container Corp of India", symbol: "CONCOR" },
    { name: "Blue Dart Express", symbol: "BLUEDART" },
    { name: "Adani Ports & SEZ", symbol: "ADANIPORTS" },
    { name: "IRCTC", symbol: "IRCTC" },
    { name: "Ashok Leyland", symbol: "ASHOKLEY" },
    { name: "Eicher Motors", symbol: "EICHERMOT" },
  ],
  "NIFTY RURAL": [
    { name: "ITC", symbol: "ITC" },
    { name: "Hindustan Unilever", symbol: "HINDUNILVR" },
    { name: "Dabur India", symbol: "DABUR" },
    { name: "Marico", symbol: "MARICO" },
    { name: "Godrej Consumer", symbol: "GODREJCP" },
    { name: "Emami", symbol: "EMAMILTD" },
    { name: "Jyothy Labs", symbol: "JYOTHYLAB" },
    { name: "Hero MotoCorp", symbol: "HEROMOTOCO" },
    { name: "TVS Motor", symbol: "TVSMOTOR" },
    { name: "Mahindra & Mahindra", symbol: "MM" },
    { name: "Bajaj Auto", symbol: "BAJAJ-AUTO" },
    { name: "Tata Motors", symbol: "TATAMOTORS" },
  ],
};

// ─── SECTOR FII DATA ───────────────────────────────────────────────────────────
const SECTORS = [
  "Automobile & Auto Components",
  "Capital Goods",
  "Chemicals",
  "Construction",
  "Construction Materials",
  "Consumer Durables",
  "Consumer Services",
  "Diversified",
  "Fast Moving Consumer Goods",
  "Financial Services",
  "Forest Materials",
  "Healthcare",
  "Information Technology",
  "Media, Entertainment & Publication",
  "Metals & Mining",
  "Oil, Gas & Consumable Fuels",
  "Power",
  "Realty",
  "Services",
  "Telecommunication",
  "Textiles",
  "Utilities",
  "Sovereign",
  "Others",
];

function genFortnightDates(n: number): string[] {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dates: string[] = [];
  const base = new Date(2026, 2, 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 14);
    dates.push(
      `${d.getDate().toString().padStart(2, "0")} ${months[d.getMonth()]}`,
    );
  }
  return dates;
}

const FORTNIGHT_DATES = genFortnightDates(12);
const SECTOR_FII_DATA: Record<string, { date: string; value: number }[]> = {};
for (const sec of SECTORS) {
  let v = rnd(-1500, 3000);
  SECTOR_FII_DATA[sec] = FORTNIGHT_DATES.map((d) => {
    v = v + (Math.random() - 0.47) * 800;
    return { date: d, value: +v.toFixed(0) };
  });
}

interface SectorStock {
  name: string;
  symbol: string;
  holding: number;
  change: number;
  netFlow: number;
}
const SECTOR_STOCKS: Record<string, SectorStock[]> = {};
const SECTOR_REAL_STOCKS: Record<string, SectorStock[]> = {
  "Automobile & Auto Components": [
    {
      name: "Maruti Suzuki India",
      symbol: "MARUTI",
      holding: 18.6,
      change: 1.4,
      netFlow: 1850,
    },
    {
      name: "Tata Motors",
      symbol: "TATAMOTORS",
      holding: 22.3,
      change: 2.8,
      netFlow: 3200,
    },
    {
      name: "Mahindra & Mahindra",
      symbol: "MM",
      holding: 19.7,
      change: -0.6,
      netFlow: -720,
    },
    {
      name: "Bajaj Auto",
      symbol: "BAJAJ-AUTO",
      holding: 15.4,
      change: 1.1,
      netFlow: 980,
    },
    {
      name: "Hero MotoCorp",
      symbol: "HEROMOTOCO",
      holding: 12.8,
      change: 0.5,
      netFlow: 430,
    },
    {
      name: "Ashok Leyland",
      symbol: "ASHOKLEY",
      holding: 8.9,
      change: -1.2,
      netFlow: -560,
    },
    {
      name: "TVS Motor",
      symbol: "TVSMOTOR",
      holding: 11.5,
      change: 1.9,
      netFlow: 870,
    },
    {
      name: "Eicher Motors",
      symbol: "EICHERMOT",
      holding: 24.1,
      change: 3.2,
      netFlow: 1640,
    },
    {
      name: "Samvardhana Motherson",
      symbol: "MOTHERSON",
      holding: 9.6,
      change: 0.8,
      netFlow: 390,
    },
    {
      name: "Bosch",
      symbol: "BOSCHLTD",
      holding: 27.4,
      change: -0.4,
      netFlow: -310,
    },
  ],
  "Capital Goods": [
    {
      name: "Larsen & Toubro",
      symbol: "LT",
      holding: 21.8,
      change: 1.6,
      netFlow: 2850,
    },
    {
      name: "ABB India",
      symbol: "ABB",
      holding: 14.2,
      change: 2.4,
      netFlow: 1120,
    },
    {
      name: "Siemens",
      symbol: "SIEMENS",
      holding: 16.9,
      change: 1.8,
      netFlow: 940,
    },
    {
      name: "Bharat Electronics",
      symbol: "BEL",
      holding: 10.3,
      change: 0.7,
      netFlow: 520,
    },
    {
      name: "Hindustan Aeronautics",
      symbol: "HAL",
      holding: 8.6,
      change: 1.2,
      netFlow: 680,
    },
    { name: "BHEL", symbol: "BHEL", holding: 6.4, change: -0.9, netFlow: -430 },
    {
      name: "Cummins India",
      symbol: "CUMMINSIND",
      holding: 19.5,
      change: 2.1,
      netFlow: 780,
    },
    {
      name: "Thermax",
      symbol: "THERMAX",
      holding: 13.7,
      change: 0.4,
      netFlow: 290,
    },
    {
      name: "KEC International",
      symbol: "KEC",
      holding: 11.2,
      change: -1.5,
      netFlow: -610,
    },
  ],
  Chemicals: [
    {
      name: "Deepak Nitrite",
      symbol: "DEEPAKNITR",
      holding: 12.4,
      change: 1.8,
      netFlow: 740,
    },
    {
      name: "Navin Fluorine",
      symbol: "NAVINFLUOR",
      holding: 16.8,
      change: 2.5,
      netFlow: 920,
    },
    { name: "SRF", symbol: "SRF", holding: 20.3, change: -0.7, netFlow: -480 },
    {
      name: "Tata Chemicals",
      symbol: "TATACHEM",
      holding: 9.7,
      change: 0.9,
      netFlow: 360,
    },
    {
      name: "Astral",
      symbol: "ASTRAL",
      holding: 14.5,
      change: 1.3,
      netFlow: 590,
    },
    {
      name: "PI Industries",
      symbol: "PIIND",
      holding: 22.1,
      change: 3.0,
      netFlow: 1380,
    },
  ],
  "Fast Moving Consumer Goods": [
    {
      name: "Hindustan Unilever",
      symbol: "HINDUNILVR",
      holding: 17.3,
      change: 0.8,
      netFlow: 1450,
    },
    { name: "ITC", symbol: "ITC", holding: 14.6, change: -0.3, netFlow: -280 },
    {
      name: "Nestle India",
      symbol: "NESTLEIND",
      holding: 19.8,
      change: 1.5,
      netFlow: 860,
    },
    {
      name: "Dabur India",
      symbol: "DABUR",
      holding: 11.4,
      change: 0.6,
      netFlow: 390,
    },
    {
      name: "Marico",
      symbol: "MARICO",
      holding: 13.7,
      change: -0.8,
      netFlow: -510,
    },
    {
      name: "Godrej Consumer",
      symbol: "GODREJCP",
      holding: 9.2,
      change: 1.1,
      netFlow: 460,
    },
    {
      name: "Colgate-Palmolive India",
      symbol: "COLPAL",
      holding: 21.5,
      change: 2.3,
      netFlow: 1050,
    },
    {
      name: "Britannia Industries",
      symbol: "BRITANNIA",
      holding: 16.1,
      change: -1.4,
      netFlow: -730,
    },
  ],
  Healthcare: [
    {
      name: "Apollo Hospitals",
      symbol: "APOLLOHOSP",
      holding: 25.6,
      change: 3.1,
      netFlow: 2400,
    },
    {
      name: "Max Healthcare",
      symbol: "MAXHEALTH",
      holding: 18.9,
      change: 2.4,
      netFlow: 1580,
    },
    {
      name: "Fortis Healthcare",
      symbol: "FORTIS",
      holding: 14.3,
      change: 1.7,
      netFlow: 920,
    },
    {
      name: "Narayana Hrudayalaya",
      symbol: "NARAYANHRU",
      holding: 11.8,
      change: 0.9,
      netFlow: 570,
    },
    { name: "KIMS", symbol: "KIMS", holding: 9.4, change: -0.5, netFlow: -280 },
    {
      name: "Metropolis Healthcare",
      symbol: "METROPOLIS",
      holding: 13.6,
      change: 1.2,
      netFlow: 640,
    },
    {
      name: "Dr Lal PathLabs",
      symbol: "LALPATHLAB",
      holding: 16.2,
      change: -1.8,
      netFlow: -870,
    },
  ],
  "Metals & Mining": [
    {
      name: "Tata Steel",
      symbol: "TATASTEEL",
      holding: 19.4,
      change: 1.6,
      netFlow: 1920,
    },
    {
      name: "JSW Steel",
      symbol: "JSWSTEEL",
      holding: 22.7,
      change: 2.8,
      netFlow: 2650,
    },
    {
      name: "Hindalco Industries",
      symbol: "HINDALCO",
      holding: 17.5,
      change: -0.9,
      netFlow: -840,
    },
    {
      name: "Vedanta",
      symbol: "VEDL",
      holding: 14.8,
      change: 1.3,
      netFlow: 1120,
    },
    {
      name: "Coal India",
      symbol: "COALINDIA",
      holding: 8.3,
      change: 0.4,
      netFlow: 380,
    },
    { name: "SAIL", symbol: "SAIL", holding: 5.9, change: -1.7, netFlow: -650 },
    { name: "NMDC", symbol: "NMDC", holding: 7.2, change: 0.6, netFlow: 290 },
  ],
  Power: [
    { name: "NTPC", symbol: "NTPC", holding: 12.8, change: 0.9, netFlow: 1240 },
    {
      name: "Power Grid Corp",
      symbol: "POWERGRID",
      holding: 10.5,
      change: 0.5,
      netFlow: 620,
    },
    {
      name: "Tata Power",
      symbol: "TATAPOWER",
      holding: 15.3,
      change: 1.8,
      netFlow: 980,
    },
    {
      name: "Adani Green Energy",
      symbol: "ADANIGREEN",
      holding: 18.6,
      change: 2.4,
      netFlow: 1850,
    },
    {
      name: "JSW Energy",
      symbol: "JSWENERGY",
      holding: 13.9,
      change: -0.7,
      netFlow: -430,
    },
    {
      name: "Torrent Power",
      symbol: "TORNTPOWER",
      holding: 11.4,
      change: 1.2,
      netFlow: 560,
    },
    { name: "NHPC", symbol: "NHPC", holding: 7.6, change: 0.3, netFlow: 190 },
    { name: "SJVN", symbol: "SJVN", holding: 6.1, change: -0.4, netFlow: -230 },
    { name: "CESC", symbol: "CESC", holding: 9.3, change: 0.8, netFlow: 370 },
  ],
  Realty: [
    { name: "DLF", symbol: "DLF", holding: 21.4, change: 2.6, netFlow: 2980 },
    {
      name: "Godrej Properties",
      symbol: "GODREJPROP",
      holding: 17.8,
      change: 1.9,
      netFlow: 1640,
    },
    {
      name: "Prestige Estates",
      symbol: "PRESTIGE",
      holding: 14.5,
      change: 3.1,
      netFlow: 1280,
    },
    {
      name: "Oberoi Realty",
      symbol: "OBEROIRLTY",
      holding: 19.2,
      change: -0.8,
      netFlow: -620,
    },
    {
      name: "Brigade Enterprises",
      symbol: "BRIGADE",
      holding: 11.7,
      change: 1.4,
      netFlow: 790,
    },
    {
      name: "Phoenix Mills",
      symbol: "PHOENIXLTD",
      holding: 15.9,
      change: 2.2,
      netFlow: 1150,
    },
    {
      name: "Lodha (Macrotech)",
      symbol: "MACROTECH",
      holding: 13.3,
      change: -1.2,
      netFlow: -840,
    },
  ],
  "Information Technology": [
    {
      name: "Infosys",
      symbol: "INFY",
      holding: 14.8,
      change: 1.2,
      netFlow: 1250,
    },
    { name: "TCS", symbol: "TCS", holding: 12.5, change: -0.4, netFlow: -380 },
    {
      name: "HCL Technologies",
      symbol: "HCLTECH",
      holding: 18.2,
      change: 2.1,
      netFlow: 890,
    },
    {
      name: "Wipro",
      symbol: "WIPRO",
      holding: 10.6,
      change: -1.0,
      netFlow: -620,
    },
    {
      name: "Tech Mahindra",
      symbol: "TECHM",
      holding: 16.4,
      change: 0.8,
      netFlow: 430,
    },
    {
      name: "LTIMindtree",
      symbol: "LTIM",
      holding: 22.1,
      change: 3.2,
      netFlow: 1680,
    },
    {
      name: "Mphasis",
      symbol: "MPHASIS",
      holding: 20.5,
      change: 1.5,
      netFlow: 740,
    },
    {
      name: "Persistent Systems",
      symbol: "PERSISTENT",
      holding: 25.3,
      change: 2.8,
      netFlow: 920,
    },
    {
      name: "Coforge",
      symbol: "COFORGE",
      holding: 19.7,
      change: -0.6,
      netFlow: -290,
    },
    {
      name: "KPIT Technologies",
      symbol: "KPITTECH",
      holding: 17.9,
      change: 1.8,
      netFlow: 560,
    },
  ],
  "Financial Services": [
    {
      name: "HDFC Bank",
      symbol: "HDFCBANK",
      holding: 24.6,
      change: 0.9,
      netFlow: 2200,
    },
    {
      name: "ICICI Bank",
      symbol: "ICICIBANK",
      holding: 28.3,
      change: 1.4,
      netFlow: 3100,
    },
    {
      name: "Kotak Mahindra Bank",
      symbol: "KOTAKBANK",
      holding: 19.8,
      change: -0.5,
      netFlow: -480,
    },
    {
      name: "Axis Bank",
      symbol: "AXISBANK",
      holding: 22.1,
      change: 1.2,
      netFlow: 1450,
    },
    {
      name: "Bajaj Finance",
      symbol: "BAJFINANCE",
      holding: 15.4,
      change: 0.7,
      netFlow: 820,
    },
    {
      name: "SBI Life Insurance",
      symbol: "SBILIFE",
      holding: 12.6,
      change: -0.3,
      netFlow: -210,
    },
    {
      name: "HDFC Life Insurance",
      symbol: "HDFCLIFE",
      holding: 11.8,
      change: 0.6,
      netFlow: 390,
    },
    {
      name: "Cholamandalam Finance",
      symbol: "CHOLAFIN",
      holding: 17.2,
      change: 2.1,
      netFlow: 680,
    },
    {
      name: "Muthoot Finance",
      symbol: "MUTHOOTFIN",
      holding: 9.4,
      change: 0.4,
      netFlow: 190,
    },
    {
      name: "Shriram Finance",
      symbol: "SHRIRAMFIN",
      holding: 14.7,
      change: -1.2,
      netFlow: -540,
    },
  ],
};
for (const sec of SECTORS) {
  if (!SECTOR_REAL_STOCKS[sec]) {
    const count = rndi(8, 18);
    SECTOR_STOCKS[sec] = Array.from({ length: count }, (_, i) => ({
      name: `${sec.split(" ")[0]} Stock ${i + 1}`,
      symbol: `${sec.replace(/[^A-Z]/g, "").slice(0, 3)}${i + 1}`,
      holding: +rnd(4, 28).toFixed(2),
      change: +rnd(-2.5, 3.5).toFixed(2),
      netFlow: +rnd(-800, 1500).toFixed(0),
    }));
  }
}

// ─── TOOLTIP STYLE ─────────────────────────────────────────────────────────────
const ttStyle = {
  contentStyle: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    fontSize: 12,
    color: "#e2e8f0",
  },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#e2e8f0" },
};

function fmtK(v: number) {
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

const selectCls =
  "bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-1.5 hover:border-blue-500 focus:border-blue-500 focus:outline-none cursor-pointer";

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function Card({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-slate-800 border border-slate-700 rounded-xl p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function StatBadge({
  label,
  value,
  colorClass,
}: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 min-w-0">
      <div className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`font-semibold text-sm truncate ${colorClass ?? "text-slate-100"}`}
      >
        {value}
      </div>
    </div>
  );
}

function TimeframeSelector({
  value,
  onChange,
  ocidPrefix,
}: { value: string; onChange: (v: string) => void; ocidPrefix: string }) {
  const tfs = ["5m", "15m", "30m", "75m", "1D", "1W"];
  return (
    <div className="flex gap-1 flex-wrap">
      {tfs.map((tf) => (
        <button
          type="button"
          key={tf}
          onClick={() => onChange(tf)}
          data-ocid={`${ocidPrefix}.${tf.toLowerCase()}.toggle`}
          className={`px-2 py-1 text-xs rounded border transition-colors ${value === tf ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

function ZoomControls({
  count,
  setCount,
  max,
  prefix,
}: {
  count: number;
  setCount: (n: number) => void;
  max: number;
  prefix: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <button
        type="button"
        data-ocid={`${prefix}.zoom_out.button`}
        onClick={() => setCount(Math.min(max, count + 20))}
        className="w-6 h-6 flex items-center justify-center border border-slate-600 rounded hover:border-blue-500 hover:text-blue-400 transition-colors"
      >
        −
      </button>
      <span className="min-w-16 text-center">{count} candles</span>
      <button
        type="button"
        data-ocid={`${prefix}.zoom_in.button`}
        onClick={() => setCount(Math.max(10, count - 20))}
        className="w-6 h-6 flex items-center justify-center border border-slate-600 rounded hover:border-blue-500 hover:text-blue-400 transition-colors"
      >
        +
      </button>
    </div>
  );
}

// ─── CANDLESTICK CHART ─────────────────────────────────────────────────────────
interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Custom recharts Customized component to render candles
// yAxisKey: which yAxisMap key to use for price ("0" for single-axis, "price" for dual-axis)
function makeCandlesRenderer(yAxisKey: string | number = 0) {
  return function CandlesRenderer(props: Record<string, unknown>) {
    const { xAxisMap, yAxisMap, data } = props as {
      xAxisMap: Record<
        string,
        { scale: (v: unknown) => number; bandwidth?: () => number }
      >;
      yAxisMap: Record<string | number, { scale: (v: number) => number }>;
      data: CandlePoint[];
    };
    if (!xAxisMap || !yAxisMap || !data) return null;
    const xAxis = xAxisMap[0];
    const yAxis = yAxisMap[yAxisKey];
    if (!xAxis || !yAxis) return null;
    const bw = xAxis.bandwidth ? xAxis.bandwidth() : 8;
    const bodyW = Math.max(2, bw * 0.6);
    return (
      <g>
        {data.map((d, i) => {
          const x = xAxis.scale(d.date);
          if (x === undefined) return null;
          const yHigh = yAxis.scale(d.high);
          const yLow = yAxis.scale(d.low);
          const yOpen = yAxis.scale(d.open);
          const yClose = yAxis.scale(d.close);
          const color = d.close >= d.open ? "#22c55e" : "#ef4444";
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          const cx = x + bw / 2;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: index is stable for candle positions
            <g key={i}>
              <line
                x1={cx}
                y1={yHigh}
                x2={cx}
                y2={yLow}
                stroke={color}
                strokeWidth={1}
              />
              <rect
                x={cx - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
              />
            </g>
          );
        })}
      </g>
    );
  };
}

// Pre-built renderer for dual-axis (price on right "price" axis)
const CandlesRendererPrice = makeCandlesRenderer("price");

// ─── COMBINED CANDLESTICK + VOLUME CHART ──────────────────────────────────────
interface CandleWithVolume extends CandlePoint {
  volume: number;
  avg?: number;
}

function CandlestickWithVolumeChart({
  data,
  height = 320,
  avgDays,
  showAvg = true,
}: {
  data: CandleWithVolume[];
  height?: number;
  avgDays?: number;
  showAvg?: boolean;
}) {
  const dummyData = data.map((d, i) => ({
    ...d,
    _idx: i,
    _dummy: (d.high + d.low) / 2,
  }));

  const minPrice = Math.min(...data.map((d) => d.low));
  const maxPrice = Math.max(...data.map((d) => d.high));
  const pricePad = (maxPrice - minPrice) * 0.05;

  const maxVol = Math.max(...data.map((d) => d.volume));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={dummyData}
        margin={{ top: 4, right: 65, bottom: 0, left: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "#64748b" }}
          interval={Math.floor(data.length / 6)}
        />
        {/* Left Y-axis: Volume */}
        <YAxis
          yAxisId="vol"
          orientation="left"
          tick={{ fontSize: 9, fill: "#64748b" }}
          tickFormatter={(v: number) => `${(v / 1e5).toFixed(0)}L`}
          domain={[0, maxVol * 3]}
          width={44}
          label={{
            value: "Volume",
            angle: -90,
            position: "insideLeft",
            offset: 8,
            style: { fontSize: 9, fill: "#64748b" },
          }}
        />
        {/* Right Y-axis: Price */}
        <YAxis
          yAxisId="price"
          orientation="right"
          tick={{ fontSize: 9, fill: "#64748b" }}
          domain={[minPrice - pricePad, maxPrice + pricePad]}
          width={65}
          tickFormatter={(v: number) =>
            v.toLocaleString("en-IN", { maximumFractionDigits: 0 })
          }
          label={{
            value: "Price",
            angle: 90,
            position: "insideRight",
            offset: 8,
            style: { fontSize: 9, fill: "#64748b" },
          }}
        />
        <Tooltip
          {...ttStyle}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload as CandleWithVolume;
            return (
              <div
                style={ttStyle.contentStyle}
                className="p-2 text-xs space-y-1"
              >
                <div style={{ color: "#94a3b8" }}>{d.date}</div>
                <div>
                  O:{" "}
                  <span className="text-slate-100">
                    {d.open?.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  H:{" "}
                  <span className="text-green-400">
                    {d.high?.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  L:{" "}
                  <span className="text-red-400">
                    {d.low?.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  C:{" "}
                  <span
                    className={
                      d.close >= d.open ? "text-green-400" : "text-red-400"
                    }
                  >
                    {d.close?.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  Vol:{" "}
                  <span className="text-blue-400">
                    {(d.volume / 1e5).toFixed(2)}L
                  </span>
                </div>
                {showAvg && d.avg !== undefined && (
                  <div>
                    Avg({avgDays}D):{" "}
                    <span className="text-orange-400">
                      {(d.avg / 1e5).toFixed(2)}L
                    </span>
                  </div>
                )}
              </div>
            );
          }}
        />
        {/* Volume bars on left axis */}
        <Bar
          yAxisId="vol"
          dataKey="volume"
          name="Volume"
          fill="#1d4ed8"
          opacity={0.5}
          radius={[1, 1, 0, 0]}
          isAnimationActive={false}
        />
        {/* Volume moving average line on left axis */}
        {showAvg && (
          <Line
            yAxisId="vol"
            type="monotone"
            dataKey="avg"
            name={`${avgDays}D Avg`}
            stroke="#f97316"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        )}
        {/* Invisible bar on price axis to establish the domain */}
        <Bar
          yAxisId="price"
          dataKey="_dummy"
          opacity={0}
          isAnimationActive={false}
        />
        {/* Candlestick renderer using the right (price) axis */}
        <Customized component={CandlesRendererPrice} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── PCR + OI CHART ────────────────────────────────────────────────────────────
function PCROIPanel({ data, title }: { data: PCRBarData[]; title: string }) {
  const chartW = Math.max(600, data.length * 18);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchScrollLeft = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchScrollLeft.current = scrollRef.current.scrollLeft;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    const dx = touchStartX.current - e.touches[0].clientX;
    scrollRef.current.scrollLeft = touchScrollLeft.current + dx;
  };

  return (
    <div>
      {title && (
        <div className="text-xs font-semibold text-slate-300 mb-1">{title}</div>
      )}
      {/* Legend row */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-1 px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-blue-400 rounded" />
          PCR Ratio (Left)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500 opacity-80" />
          PE OI (Right)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500 opacity-80" />
          CE OI (Right)
        </span>
      </div>
      <div
        className="overflow-x-auto rounded-lg"
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Combined chart: PCR Ratio line (left Y) + PE/CE OI bars (right Y) */}
        <div style={{ minWidth: chartW }}>
          <ComposedChart
            width={chartW}
            height={220}
            data={data}
            margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fill: "#64748b" }}
              interval={Math.floor(data.length / 8)}
            />
            {/* Left Y-axis: PCR Ratio */}
            <YAxis
              yAxisId="pcr"
              orientation="left"
              tick={{ fontSize: 8, fill: "#60a5fa" }}
              domain={[0.4, 2.0]}
              width={34}
              tickFormatter={(v: number) => v.toFixed(2)}
              label={{
                value: "PCR",
                angle: -90,
                position: "insideLeft",
                offset: 6,
                style: { fontSize: 9, fill: "#60a5fa" },
              }}
            />
            {/* Right Y-axis: Total OI Volume */}
            <YAxis
              yAxisId="oi"
              orientation="right"
              tick={{ fontSize: 8, fill: "#94a3b8" }}
              tickFormatter={fmtK}
              width={44}
              label={{
                value: "OI Vol",
                angle: 90,
                position: "insideRight",
                offset: 6,
                style: { fontSize: 9, fill: "#94a3b8" },
              }}
            />
            <Tooltip
              {...ttStyle}
              formatter={(v: number, name: string) => {
                if (name === "PCR") return [v.toFixed(3), "PCR Ratio"];
                return [fmtK(v), name];
              }}
            />
            <ReferenceLine
              yAxisId="pcr"
              y={1}
              stroke="#475569"
              strokeDasharray="4 4"
            />
            {/* PE OI bars (green) */}
            <Bar
              yAxisId="oi"
              dataKey="peOI"
              name="PE OI"
              fill="#22c55e"
              opacity={0.75}
              radius={[2, 2, 0, 0]}
            />
            {/* CE OI bars (red) */}
            <Bar
              yAxisId="oi"
              dataKey="ceOI"
              name="CE OI"
              fill="#ef4444"
              opacity={0.75}
              radius={[2, 2, 0, 0]}
            />
            {/* PCR Ratio line on top */}
            <Line
              yAxisId="pcr"
              type="monotone"
              dataKey="pcrRatio"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              name="PCR"
            />
          </ComposedChart>
        </div>
      </div>
    </div>
  );
}

// ─── EXPIRY MULTI-SELECT ───────────────────────────────────────────────────────
function ExpirySelector({
  expiries,
  selected,
  onToggle,
  ocidPrefix,
}: {
  expiries: string[];
  selected: Record<string, boolean>;
  onToggle: (e: string) => void;
  ocidPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {expiries.map((e) => (
        <label key={e} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!selected[e]}
            onChange={() => onToggle(e)}
            data-ocid={`${ocidPrefix}.${e.toLowerCase()}.toggle`}
            className="accent-blue-500"
          />
          <span style={{ color: EXPIRY_COLORS[e] }} className="font-semibold">
            {e}
          </span>
        </label>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
function TabAnalysis() {
  const niftyLast = NIFTY_DATA[NIFTY_DATA.length - 1];
  const bnkLast = BANKNIFTY_DATA[BANKNIFTY_DATA.length - 1];
  const usdInrLast = MACRO_USDINT_FULL[MACRO_USDINT_FULL.length - 1];

  return (
    <div className="space-y-5">
      {/* Market Overview */}
      <Card>
        <h2 className="text-sm font-bold text-slate-100 mb-4">
          Market Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBadge
            label="Nifty 50 (Last Close)"
            value={niftyLast.close.toLocaleString("en-IN")}
            colorClass="text-green-400"
          />
          <StatBadge
            label="BankNifty (Last Close)"
            value={bnkLast.close.toLocaleString("en-IN")}
            colorClass="text-blue-400"
          />
          <StatBadge
            label="USD/INR (Latest)"
            value={`₹${usdInrLast.value}`}
            colorClass="text-amber-400"
          />
          <StatBadge
            label="Active Stocks Tracked"
            value={`${STOCKS.length}`}
            colorClass="text-purple-400"
          />
        </div>
      </Card>

      {/* Python Analysis Workspace */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-100">
            Python Analysis Workspace
          </h2>
          <span className="bg-blue-950 text-blue-300 text-xs px-2.5 py-1 rounded-full font-medium border border-blue-800">
            Integration Ready
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Connect a Python backend to run custom formulas on data from all tabs.
          Supports pandas, numpy, scipy, and custom indicators.
        </p>
        <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-slate-300 leading-relaxed mb-4 overflow-x-auto">
          <pre className="whitespace-pre">{`# Example: Correlation analysis between Nifty PCR and returns
import pandas as pd
import numpy as np

# Data from Tab 2-5 will be available as DataFrames:
# nifty_df, banknifty_df, macro_df, sector_fii_df

# Correlation between Nifty PCR (CM) and next-day returns
pcr_series = nifty_df['pcr_cm']
returns = nifty_df['close'].pct_change().shift(-1)
correlation = pcr_series.corr(returns)
print(f"PCR-Return Correlation: {correlation:.4f}")

# Macro regime detection
def detect_regime(gsec_10y, usd_inr):
    if gsec_10y > 7.2 and usd_inr > 84:
        return "Risk-Off"
    elif gsec_10y < 6.8 and usd_inr < 83:
        return "Risk-On"
    return "Neutral"`}</pre>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled
            data-ocid="analysis.run_button"
            title="Connect Python backend to enable"
            className="px-4 py-2 text-xs bg-blue-900 text-blue-400 border border-blue-800 rounded-lg opacity-50 cursor-not-allowed"
          >
            ▶ Run Analysis
          </button>
          <button
            type="button"
            disabled
            data-ocid="analysis.loaddb_button"
            className="px-4 py-2 text-xs border border-slate-600 text-slate-400 rounded-lg opacity-50 cursor-not-allowed"
          >
            Load from DB
          </button>
        </div>
        <div className="mt-4 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium mb-1">Results</div>
          <div className="text-xs text-slate-500 italic">
            No analysis run yet. Results will appear here once Python backend is
            connected.
          </div>
        </div>
      </Card>

      {/* Data Source Status */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-100">
            Data Source Status
          </h2>
          <button
            type="button"
            disabled
            data-ocid="analysis.seeddb_button"
            className="px-4 py-2 text-xs border border-slate-600 text-slate-400 rounded-lg opacity-50 cursor-not-allowed"
          >
            Seed from Database
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900">
                {["Tab", "Data Source", "Status", "Last Updated"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-slate-400 font-medium border-b border-slate-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Index & Index Options OI", "Mock Data", "Simulated", "—"],
                ["Stocks and Stocks Options OI", "Mock Data", "Simulated", "—"],
                ["Macro Indicators", "Mock Data", "Simulated", "—"],
                ["Fortnightly Sector FII", "Mock Data", "Simulated", "—"],
              ].map(([tab, src, status], i) => (
                <tr
                  key={tab}
                  className="hover:bg-slate-700/40 transition-colors"
                  data-ocid={`analysis.datasource.row.${i + 1}`}
                >
                  <td className="px-4 py-2.5 text-slate-200 border-b border-slate-800">
                    {tab}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 border-b border-slate-800">
                    {src}
                  </td>
                  <td className="px-4 py-2.5 border-b border-slate-800">
                    <span className="bg-amber-950 text-amber-400 px-2 py-0.5 rounded text-xs">
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 border-b border-slate-800">
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          When connected to a database, live market data will replace simulated
          data. Python formulas will have access to all data sources.
        </p>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: INDEX & INDEX OPTIONS OI
// ═══════════════════════════════════════════════════════════════════════════════
function IndexPricePanel({
  indexName,
  rawData,
  ocidPrefix,
}: { indexName: string; rawData: OHLC[]; ocidPrefix: string }) {
  const [tf, setTf] = useState("1D");
  const [visibleCount, setVisibleCount] = useState(60);
  const [avgDays] = useState(20);
  const TF_MULTIPLIERS: Record<string, number> = {
    "5m": 78,
    "15m": 26,
    "30m": 13,
    "75m": 5,
    "1D": 1,
    "1W": 0.2,
  };
  const candles = useMemo(() => {
    const m = TF_MULTIPLIERS[tf] ?? 1;
    if (m <= 1) return rawData.slice(-visibleCount);
    const daily = rawData.slice(-Math.ceil(visibleCount / m));
    const expanded: OHLC[] = [];
    for (const d of daily) {
      const count = Math.round(m);
      for (let i = 0; i < count; i++) {
        const noise = d.close * 0.0005;
        expanded.push({
          date: new Date(d.date.getTime() + i * 5 * 60000),
          open: d.open + (Math.random() - 0.5) * noise * 2,
          high: d.high - Math.random() * noise,
          low: d.low + Math.random() * noise,
          close: d.close + (Math.random() - 0.5) * noise * 2,
        });
      }
    }
    return expanded.slice(-visibleCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, tf, visibleCount]);

  // Combined candle + volume data (simulate volume for index)
  const combinedData: CandleWithVolume[] = useMemo(() => {
    return candles.map((d, i) => {
      const vol = rndi(50_000_000, 200_000_000);
      const slicedVols = candles
        .slice(0, i + 1)
        .map(() => rndi(50_000_000, 200_000_000));
      const from = Math.max(0, i - avgDays + 1);
      const avgVol = Math.round(
        slicedVols.slice(from).reduce((s, v) => s + v, 0) / (i - from + 1),
      );
      return {
        date: formatDate(d.date),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: vol,
        avg: avgVol,
      };
    });
  }, [candles, avgDays]);

  const last = rawData[rawData.length - 1];
  const prev = rawData[rawData.length - 2];
  const chg = last.close - prev.close;
  const chgPct = ((chg / prev.close) * 100).toFixed(2);
  const isUp = chg >= 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-100">{indexName}</h2>
        <ZoomControls
          count={visibleCount}
          setCount={setVisibleCount}
          max={rawData.length}
          prefix={`${ocidPrefix}`}
        />
      </div>
      <TimeframeSelector value={tf} onChange={setTf} ocidPrefix={ocidPrefix} />
      <div className="flex flex-wrap gap-2 my-3">
        <StatBadge label="Open" value={last.open.toLocaleString("en-IN")} />
        <StatBadge
          label="High"
          value={last.high.toLocaleString("en-IN")}
          colorClass="text-green-400"
        />
        <StatBadge
          label="Low"
          value={last.low.toLocaleString("en-IN")}
          colorClass="text-red-400"
        />
        <StatBadge
          label="Close"
          value={`${last.close.toLocaleString("en-IN")} (${isUp ? "+" : ""}${chgPct}%)`}
          colorClass={isUp ? "text-green-400" : "text-red-400"}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-2 px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-700 opacity-60" />
          Volume (Left)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />
          {avgDays}D Avg Vol (Left)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
          Price (Right)
        </span>
      </div>
      <div
        onWheel={(e) => {
          e.preventDefault();
          if (e.deltaY > 0) {
            setVisibleCount((c) => Math.min(rawData.length, c + 10));
          } else {
            setVisibleCount((c) => Math.max(10, c - 10));
          }
        }}
        style={{ touchAction: "none" }}
      >
        <CandlestickWithVolumeChart
          data={combinedData}
          height={300}
          avgDays={avgDays}
          showAvg={true}
        />
      </div>
    </Card>
  );
}

function IndexOIPanel({
  indexName,
  pcrSourceFull,
  expiries,
  ocidPrefix,
}: {
  indexName: string;
  pcrSourceFull: Record<string, ExtendedPCRBarData[]>;
  expiries: string[];
  ocidPrefix: string;
}) {
  const initSelected = Object.fromEntries(expiries.map((e, i) => [e, i === 0]));
  const [selected, setSelected] =
    useState<Record<string, boolean>>(initSelected);
  const onToggle = useCallback(
    (e: string) => setSelected((s) => ({ ...s, [e]: !s[e] })),
    [],
  );

  const today = new Date();
  const [oiYear, setOiYear] = useState(today.getFullYear());
  const [oiMonth, setOiMonth] = useState(today.getMonth());

  const merged = useMemo(
    () => mergePCROIFiltered(pcrSourceFull, selected, oiYear, oiMonth),
    [pcrSourceFull, selected, oiYear, oiMonth],
  );

  const fourMonthRange = getFourMonthRange(oiYear, oiMonth);
  const rangeLabel = `${MONTH_NAMES[fourMonthRange[0].month]} ${fourMonthRange[0].year} – ${MONTH_NAMES[fourMonthRange[3].month]} ${fourMonthRange[3].year}`;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-100">
          {indexName} OI Data
        </h2>
        <ExpirySelector
          expiries={expiries}
          selected={selected}
          onToggle={onToggle}
          ocidPrefix={ocidPrefix}
        />
      </div>
      {/* Year / Month selectors */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Year:</span>
        <select
          data-ocid={`${ocidPrefix}.oi.year.select`}
          className={selectCls}
          value={oiYear}
          onChange={(e) => setOiYear(Number(e.target.value))}
        >
          {OI_YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">Month:</span>
        <select
          data-ocid={`${ocidPrefix}.oi.month.select`}
          className={selectCls}
          value={oiMonth}
          onChange={(e) => setOiMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-1">
          Showing: <span className="text-slate-300">{rangeLabel}</span>
        </span>
      </div>
      {merged.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          Select at least one expiry
        </div>
      ) : (
        <PCROIPanel data={merged} title="" />
      )}
    </Card>
  );
}

function TabIndex() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <IndexPricePanel
        indexName="Nifty50"
        rawData={NIFTY_DATA}
        ocidPrefix="index.nifty"
      />
      <IndexOIPanel
        indexName="Nifty50"
        pcrSourceFull={NIFTY_PCR_OI_FULL}
        expiries={["CW", "NW", "CM", "NM"]}
        ocidPrefix="index.nifty"
      />
      <IndexPricePanel
        indexName="BankNifty"
        rawData={BANKNIFTY_DATA}
        ocidPrefix="index.banknifty"
      />
      <IndexOIPanel
        indexName="BankNifty"
        pcrSourceFull={BANKNIFTY_PCR_OI_FULL}
        expiries={["CM", "NM"]}
        ocidPrefix="index.banknifty"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: STOCKS AND STOCKS OPTIONS OI
// ═══════════════════════════════════════════════════════════════════════════════
function StockSearch({
  value,
  onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return STOCKS.slice(0, 40);
    return STOCKS.filter(
      (s) =>
        s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    ).slice(0, 40);
  }, [query]);
  const current = STOCKS.find((s) => s.sym === value) ?? STOCKS[0];
  return (
    <div className="relative" ref={ref}>
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-slate-400 text-sm font-medium">Stock:</span>
        <button
          type="button"
          data-ocid="stock.select"
          onClick={() => setOpen((o) => !o)}
          className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 flex items-center gap-3 min-w-56 hover:border-blue-500 transition-colors"
        >
          <span className="font-bold text-blue-400">{current.sym}</span>
          <span className="text-slate-400 text-xs truncate max-w-32">
            {current.name}
          </span>
          <span className="text-slate-500 ml-auto">▾</span>
        </button>
        <input
          type="search"
          placeholder="Search Nifty 500..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          data-ocid="stock.search_input"
          className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none w-52 focus:border-blue-500 transition-colors"
        />
      </div>
      {open && (
        <div className="absolute top-12 left-0 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50 w-80 mt-1">
          {filtered.map((s) => (
            <button
              type="button"
              key={s.sym}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors"
              onClick={() => {
                onChange(s.sym);
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="font-bold text-blue-400">{s.sym}</span>
              <span className="text-slate-400 text-xs ml-2">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StockPricePanel({ sym }: { sym: string }) {
  const [tf, setTf] = useState("1D");
  const [visibleCount, setVisibleCount] = useState(60);
  const [avgDays, setAvgDays] = useState(20);
  const rawData = useMemo(() => getStockData(sym), [sym]);

  // Combined candle + volume data
  const combinedData: CandleWithVolume[] = useMemo(() => {
    const sliced = rawData.slice(-visibleCount);
    return sliced.map((d, i) => {
      const from = Math.max(0, i - avgDays + 1);
      const avg =
        sliced.slice(from, i + 1).reduce((s, x) => s + x.volume, 0) /
        (i - from + 1);
      return {
        date: formatDate(d.date),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
        avg: Math.round(avg),
      };
    });
  }, [rawData, visibleCount, avgDays]);

  const last = rawData[rawData.length - 1];
  const prev = rawData[rawData.length - 2];
  const chg = last.close - prev.close;
  const chgPct = ((chg / prev.close) * 100).toFixed(2);
  const isUp = chg >= 0;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-100">
          {sym} — Price & Volume
        </h2>
        <ZoomControls
          count={visibleCount}
          setCount={setVisibleCount}
          max={rawData.length}
          prefix="stock"
        />
      </div>
      <TimeframeSelector
        value={tf}
        onChange={setTf}
        ocidPrefix="stock.timeframe"
      />
      <div className="flex flex-wrap gap-2 my-3">
        <StatBadge
          label="Open"
          value={last.open.toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}
        />
        <StatBadge
          label="High"
          value={last.high.toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}
          colorClass="text-green-400"
        />
        <StatBadge
          label="Low"
          value={last.low.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          colorClass="text-red-400"
        />
        <StatBadge
          label="Close"
          value={`${last.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${isUp ? "+" : ""}${chgPct}%)`}
          colorClass={isUp ? "text-green-400" : "text-red-400"}
        />
        <StatBadge
          label="Volume"
          value={`${(last.volume / 1e5).toFixed(2)}L`}
        />
      </div>
      {/* Chart legend + avg days control */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-700 opacity-60" />
            Volume (Left)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />
            Avg Vol (Left)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
            Price (Right)
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-slate-500">Avg Days:</span>
          <input
            type="number"
            min={1}
            max={200}
            value={avgDays}
            onChange={(e) =>
              setAvgDays(Math.max(1, Math.min(200, Number(e.target.value))))
            }
            data-ocid="stock.avgdays.input"
            className="w-14 bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div
        onWheel={(e) => {
          e.preventDefault();
          if (e.deltaY > 0) {
            setVisibleCount((c) => Math.min(rawData.length, c + 10));
          } else {
            setVisibleCount((c) => Math.max(10, c - 10));
          }
        }}
        style={{ touchAction: "none" }}
      >
        <CandlestickWithVolumeChart
          data={combinedData}
          height={320}
          avgDays={avgDays}
          showAvg={true}
        />
      </div>
    </Card>
  );
}

function StockOIPanel({ sym }: { sym: string }) {
  const hasOptions = STOCKS_WITH_OPTIONS.has(sym);
  const [selected, setSelected] = useState<Record<string, boolean>>({
    CM: true,
    NM: false,
  });
  const onToggle = useCallback(
    (e: string) => setSelected((s) => ({ ...s, [e]: !s[e] })),
    [],
  );

  const today = new Date();
  const [oiYear, setOiYear] = useState(today.getFullYear());
  const [oiMonth, setOiMonth] = useState(today.getMonth());

  const pcrSourceFull = useMemo(
    () => ({
      CM: getStockPCROIFull(sym, "CM"),
      NM: getStockPCROIFull(sym, "NM"),
    }),
    [sym],
  );

  const merged = useMemo(
    () => mergePCROIFiltered(pcrSourceFull, selected, oiYear, oiMonth),
    [pcrSourceFull, selected, oiYear, oiMonth],
  );

  const fourMonthRange = getFourMonthRange(oiYear, oiMonth);
  const rangeLabel = `${MONTH_NAMES[fourMonthRange[0].month]} ${fourMonthRange[0].year} – ${MONTH_NAMES[fourMonthRange[3].month]} ${fourMonthRange[3].year}`;

  if (!hasOptions) {
    return (
      <Card className="flex flex-col items-center justify-center min-h-48">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-slate-300 font-semibold mb-1">
            The script does not have Options
          </div>
          <div className="text-slate-500 text-xs">
            Options data is not available for {sym}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-100">{sym} — OI Data</h2>
        <ExpirySelector
          expiries={["CM", "NM"]}
          selected={selected}
          onToggle={onToggle}
          ocidPrefix="stock"
        />
      </div>
      {/* Year / Month selectors */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Year:</span>
        <select
          data-ocid="stock.oi.year.select"
          className={selectCls}
          value={oiYear}
          onChange={(e) => setOiYear(Number(e.target.value))}
        >
          {OI_YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">Month:</span>
        <select
          data-ocid="stock.oi.month.select"
          className={selectCls}
          value={oiMonth}
          onChange={(e) => setOiMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-1">
          Showing: <span className="text-slate-300">{rangeLabel}</span>
        </span>
      </div>
      {merged.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          Select at least one expiry
        </div>
      ) : (
        <PCROIPanel data={merged} title="" />
      )}
    </Card>
  );
}

function TabStocks() {
  const [sym, setSym] = useState("RELIANCE");
  return (
    <div className="space-y-4">
      <Card>
        <StockSearch value={sym} onChange={setSym} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StockPricePanel sym={sym} />
        <StockOIPanel sym={sym} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: MACRO INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

function NoDataMsg() {
  return (
    <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
      No data available for selected period
    </div>
  );
}

function DailyIndicatorsCard() {
  const [sub, setSub] = useState<"usd" | "fiidii" | "crude" | "gsec">("usd");
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());

  const subTabs = [
    { id: "usd" as const, label: "USD/INR", ocid: "macro.daily.usdinr.tab" },
    {
      id: "fiidii" as const,
      label: "FII & DII",
      ocid: "macro.daily.fiidii.tab",
    },
    { id: "crude" as const, label: "Crude Oil", ocid: "macro.daily.crude.tab" },
    {
      id: "gsec" as const,
      label: "G-Sec Yields",
      ocid: "macro.daily.gsec.tab",
    },
  ];

  const usdData = useMemo(
    () =>
      MACRO_USDINT_FULL.filter(
        (d) => d.year === selectedYear && d.month === selectedMonth,
      ),
    [selectedYear, selectedMonth],
  );
  const fiiData = useMemo(
    () =>
      MACRO_FII_FULL.filter(
        (d) => d.year === selectedYear && d.month === selectedMonth,
      ),
    [selectedYear, selectedMonth],
  );
  const crudeData = useMemo(
    () =>
      MACRO_CRUDE_FULL.filter(
        (d) => d.year === selectedYear && d.month === selectedMonth,
      ),
    [selectedYear, selectedMonth],
  );
  const gsecData = useMemo(
    () =>
      MACRO_GSEC_FULL.filter(
        (d) => d.year === selectedYear && d.month === selectedMonth,
      ),
    [selectedYear, selectedMonth],
  );

  const xAxisInterval = (len: number) => (len <= 10 ? 0 : len <= 20 ? 2 : 5);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-slate-100">Daily Indicators</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Year:</span>
          <select
            data-ocid="macro.daily.year.select"
            className={selectCls}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Month:</span>
          <select
            data-ocid="macro.daily.month.select"
            className={selectCls}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {subTabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setSub(t.id)}
            data-ocid={t.ocid}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${sub === t.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "usd" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            USD/INR Exchange Rate (₹/USD) — Daily — {MONTH_NAMES[selectedMonth]}{" "}
            {selectedYear}
          </div>
          {usdData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={usdData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={xAxisInterval(usdData.length)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={50}
                />
                <Tooltip
                  {...ttStyle}
                  formatter={(v: number) => [`₹${v}`, "USD/INR"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                  name="USD/INR"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "fiidii" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            FII & DII Daily Flows (₹ Cr) — FII (Blue), DII (Green) —{" "}
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </div>
          {fiiData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={fiiData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xAxisInterval(fiiData.length)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={55}
                  tickFormatter={fmtK}
                />
                <Tooltip
                  {...ttStyle}
                  formatter={(v: number, n: string) => [`₹${fmtK(v)} Cr`, n]}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="fii"
                  name="FII"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                  opacity={0.8}
                />
                <Bar
                  dataKey="dii"
                  name="DII"
                  fill="#22c55e"
                  radius={[2, 2, 0, 0]}
                  opacity={0.8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "crude" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Crude Oil Prices (USD/bbl) — WTI (Orange), Brent (Amber) —{" "}
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </div>
          {crudeData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={crudeData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xAxisInterval(crudeData.length)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={40}
                />
                <Tooltip {...ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="wti"
                  name="Crude WTI"
                  fill="#f97316"
                  radius={[2, 2, 0, 0]}
                  opacity={0.8}
                />
                <Bar
                  dataKey="brent"
                  name="Crude Brent"
                  fill="#eab308"
                  radius={[2, 2, 0, 0]}
                  opacity={0.8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "gsec" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            G-Sec Yields (%) — 3Y (Blue), 5Y (Green), 10Y (Orange) —{" "}
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </div>
          {gsecData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={gsecData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xAxisInterval(gsecData.length)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={36}
                />
                <Tooltip
                  {...ttStyle}
                  formatter={(v: number, n: string) => [`${v}%`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="y3"
                  name="3Y G-Sec"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="y5"
                  name="5Y G-Sec"
                  stroke="#22c55e"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="y10"
                  name="10Y G-Sec"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </Card>
  );
}

function MoMIndicatorsCard() {
  const [sub, setSub] = useState<"cpiwpi" | "autogst" | "pmi">("cpiwpi");
  // Default: trailing 24 months — start from year 24 months ago
  const today = new Date();
  const trailing24Start = new Date(
    today.getFullYear(),
    today.getMonth() - 23,
    1,
  );
  const [selectedYear, setSelectedYear] = useState(
    trailing24Start.getFullYear(),
  );

  const subTabs = [
    { id: "cpiwpi" as const, label: "CPI & WPI", ocid: "macro.mom.cpiwpi.tab" },
    {
      id: "autogst" as const,
      label: "Auto Sales & GST",
      ocid: "macro.mom.autogst.tab",
    },
    { id: "pmi" as const, label: "PMI", ocid: "macro.mom.pmi.tab" },
  ];

  const cpiWpiData = useMemo(
    () => MACRO_CPI_WPI_FULL.filter((d) => d.year >= selectedYear),
    [selectedYear],
  );
  const autoGstData = useMemo(
    () => MACRO_AUTO_GST_FULL.filter((d) => d.year >= selectedYear),
    [selectedYear],
  );
  const pmiData = useMemo(
    () => MACRO_PMI_FULL.filter((d) => d.year >= selectedYear),
    [selectedYear],
  );

  const xInterval = (len: number) =>
    len <= 12 ? 0 : len <= 24 ? 2 : len <= 48 ? 5 : 11;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-slate-100">
          Month-on-Month (MoM) Indicators
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">From Year:</span>
          <select
            data-ocid="macro.mom.year.select"
            className={selectCls}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {subTabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setSub(t.id)}
            data-ocid={t.ocid}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${sub === t.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "cpiwpi" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            CPI (Blue) & WPI (Green) — MoM % — From {selectedYear}
          </div>
          {cpiWpiData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={cpiWpiData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(cpiWpiData.length)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={34}
                />
                <Tooltip
                  {...ttStyle}
                  formatter={(v: number, n: string) => [`${v}%`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine
                  y={4}
                  stroke="#475569"
                  strokeDasharray="4 4"
                  label={{ value: "RBI Target", fill: "#64748b", fontSize: 9 }}
                />
                <Line
                  type="monotone"
                  dataKey="cpi"
                  name="CPI"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="wpi"
                  name="WPI"
                  stroke="#22c55e"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "autogst" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Auto Sales (Lakhs, bars) & GST Collections (₹ L Cr, line) — MoM —
            From {selectedYear}
          </div>
          {autoGstData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={autoGstData}
                margin={{ top: 4, right: 32, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(autoGstData.length)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={34}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={40}
                  domain={["auto", "auto"]}
                />
                <Tooltip {...ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="autoSales"
                  name="Auto Sales (L)"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                  opacity={0.8}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="gst"
                  name="GST (₹LCr)"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "pmi" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            India Manufacturing PMI (Blue) & Services PMI (Green) — MoM — From{" "}
            {selectedYear}
          </div>
          {pmiData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={pmiData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(pmiData.length)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={[45, 65]}
                  width={34}
                />
                <Tooltip {...ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine
                  y={50}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: "Expansion/Contraction",
                    fill: "#64748b",
                    fontSize: 9,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="mfg"
                  name="Mfg PMI"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="services"
                  name="Services PMI"
                  stroke="#22c55e"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </Card>
  );
}

function QoQIndicatorsCard() {
  const [sub, setSub] = useState<"gdpcad" | "rates" | "fxreserve">("gdpcad");
  // Default: trailing 20 quarters ≈ 5 years back
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear() - 5);

  const subTabs = [
    { id: "gdpcad" as const, label: "GDP & CAD", ocid: "macro.qoq.gdpcad.tab" },
    {
      id: "rates" as const,
      label: "Interest Rates & FX Reserve",
      ocid: "macro.qoq.interestrates.tab",
    },
    {
      id: "fxreserve" as const,
      label: "FX Reserve & Rates",
      ocid: "macro.qoq.fxreserve.tab",
    },
  ];

  const gdpCadData = useMemo(
    () => MACRO_GDP_CAD_FULL.filter((d) => d.calStartYear >= selectedYear),
    [selectedYear],
  );
  const ratesData = useMemo(
    () => MACRO_RATES_FULL.filter((d) => d.calStartYear >= selectedYear),
    [selectedYear],
  );
  const fxAndRatesData = useMemo(
    () => MACRO_FX_AND_RATES_FULL.filter((d) => d.calStartYear >= selectedYear),
    [selectedYear],
  );

  const xInterval = (len: number) =>
    len <= 8 ? 0 : len <= 16 ? 1 : len <= 32 ? 3 : 7;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-slate-100">
          Quarter-on-Quarter (QoQ) Indicators
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">From Year:</span>
          <select
            data-ocid="macro.qoq.year.select"
            className={selectCls}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {subTabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setSub(t.id)}
            data-ocid={t.ocid}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${sub === t.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "gdpcad" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            GDP Growth % (bars, left) & CAD as % of GDP (line, right) — QoQ —
            From {selectedYear}
          </div>
          {gdpCadData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={gdpCadData}
                margin={{ top: 4, right: 36, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(gdpCadData.length)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={34}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={34}
                />
                <Tooltip {...ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="left" y={0} stroke="#475569" />
                <Bar
                  yAxisId="left"
                  dataKey="gdp"
                  name="GDP Growth %"
                  radius={[3, 3, 0, 0]}
                >
                  {gdpCadData.map((d) => (
                    <Cell
                      key={d.date}
                      fill={d.gdp >= 0 ? "#3b82f6" : "#ef4444"}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cad"
                  name="CAD % GDP"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "rates" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Repo Rate % (Blue, left) & FX Reserve USD Bn (Orange, right) — QoQ —
            From {selectedYear}
          </div>
          {ratesData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={ratesData}
                margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(ratesData.length)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={34}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={45}
                />
                <Tooltip {...ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="repoRate"
                  name="Repo Rate %"
                  stroke="#3b82f6"
                  dot={{ fill: "#3b82f6", r: 4 }}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="fxReserve"
                  name="FX Reserve ($B)"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
      {sub === "fxreserve" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            FX Reserve USD Bn (Purple, left) &amp; Repo Rate % (Blue step-line,
            right) — QoQ — From {selectedYear}
          </div>
          {fxAndRatesData.length === 0 ? (
            <NoDataMsg />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={fxAndRatesData}
                margin={{ top: 4, right: 44, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval(fxAndRatesData.length)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={46}
                  tickFormatter={(v: number) => `$${v}B`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  width={34}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  {...ttStyle}
                  formatter={(v: number, n: string) =>
                    n === "FX Reserve (USD Bn)" ? [`$${v}B`, n] : [`${v}%`, n]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="fxReserve"
                  name="FX Reserve (USD Bn)"
                  stroke="#a855f7"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="repoRate"
                  name="Repo Rate %"
                  stroke="#3b82f6"
                  dot={{ fill: "#3b82f6", r: 4 }}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </Card>
  );
}

function TabMacro() {
  return (
    <div className="space-y-4">
      <DailyIndicatorsCard />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MoMIndicatorsCard />
        <QoQIndicatorsCard />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: FORTNIGHTLY SECTOR WISE FII DATA
// ═══════════════════════════════════════════════════════════════════════════════
function SectorFIIPanel({
  selectedSectors,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  selectedSectors: string[];
  onToggle: (s: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const sectorColorMap = useMemo(
    () => Object.fromEntries(SECTORS.map((s, i) => [s, SECTOR_COLORS[i]])),
    [],
  );
  const merged = useMemo(
    () =>
      FORTNIGHT_DATES.map((d, i) => {
        const obj: Record<string, unknown> = { date: d };
        for (const sec of selectedSectors)
          obj[sec] = SECTOR_FII_DATA[sec][i]?.value;
        return obj;
      }),
    [selectedSectors],
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-100">
          Sector FII Flows (Fortnightly)
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            data-ocid="sector.selectall.button"
            className="px-3 py-1.5 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onClearAll}
            data-ocid="sector.clearall.button"
            className="px-3 py-1.5 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-red-500 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SECTORS.map((sec, i) => (
          <label
            key={sec}
            style={{
              borderColor: selectedSectors.includes(sec)
                ? SECTOR_COLORS[i]
                : "#334155",
              background: selectedSectors.includes(sec)
                ? `${SECTOR_COLORS[i]}22`
                : "transparent",
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedSectors.includes(sec)}
              onChange={() => onToggle(sec)}
              data-ocid={`sector.checkbox.${i + 1}`}
              className="accent-blue-500"
            />
            <span
              style={{
                color: selectedSectors.includes(sec)
                  ? SECTOR_COLORS[i]
                  : "#94a3b8",
                fontSize: 11,
                whiteSpace: "nowrap",
              }}
            >
              {sec}
            </span>
          </label>
        ))}
      </div>
      {selectedSectors.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
          Select sectors to view FII flows
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={merged}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              width={45}
            />
            <Tooltip
              {...ttStyle}
              formatter={(v: number, n: string) => [
                `₹${v?.toLocaleString("en-IN")} Cr`,
                n,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#475569" />
            {selectedSectors.map((sec) => (
              <Line
                key={sec}
                type="monotone"
                dataKey={sec}
                stroke={sectorColorMap[sec]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function SectorStocksPanel({ selectedSectors }: { selectedSectors: string[] }) {
  const [activeSector, setActiveSector] = useState<string | null>(null);
  useEffect(() => {
    if (
      selectedSectors.length > 0 &&
      (!activeSector || !selectedSectors.includes(activeSector))
    ) {
      setActiveSector(selectedSectors[0]);
    }
    if (selectedSectors.length === 0) setActiveSector(null);
  }, [selectedSectors, activeSector]);
  const stocks = useMemo(() => {
    if (!activeSector) return [];
    return (
      SECTOR_REAL_STOCKS[activeSector] ?? SECTOR_STOCKS[activeSector] ?? []
    );
  }, [activeSector]);
  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100 mb-3">
        Stocks in Selected Sectors
      </h2>
      {selectedSectors.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          Select sectors from the chart above
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedSectors.map((sec, i) => (
              <button
                type="button"
                key={sec}
                onClick={() => setActiveSector(sec)}
                data-ocid={`sector.stocks.tab.${i + 1}`}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${activeSector === sec ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
              >
                {sec}
              </button>
            ))}
          </div>
          {activeSector && (
            <div className="overflow-x-auto" data-ocid="sector.stocks.table">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900">
                    {[
                      "Stock Name",
                      "Symbol",
                      "FII Holding %",
                      "Change (FN)",
                      "Net FII Flow (₹ Cr)",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2.5 text-slate-400 font-medium border-b border-slate-700"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s, i) => (
                    <tr
                      key={s.symbol}
                      className="hover:bg-slate-700/50 transition-colors"
                      data-ocid={`sector.stocks.row.${i + 1}`}
                    >
                      <td className="px-3 py-2 text-slate-200 border-b border-slate-800">
                        {s.name}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-800">
                        <span className="bg-green-950 text-green-400 px-2 py-0.5 rounded text-xs font-medium">
                          {s.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300 border-b border-slate-800">
                        {s.holding}%
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold border-b border-slate-800 ${s.change >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {s.change >= 0 ? "+" : ""}
                        {s.change}%
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium border-b border-slate-800 ${s.netFlow >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {s.netFlow >= 0 ? "+" : ""}₹
                        {Math.abs(s.netFlow).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TabSectorFII() {
  const [selectedSectors, setSelectedSectors] = useState<string[]>([
    "Financial Services",
    "Information Technology",
  ]);
  const toggleSector = useCallback((sec: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec],
    );
  }, []);
  return (
    <div className="space-y-4">
      <SectorFIIPanel
        selectedSectors={selectedSectors}
        onToggle={toggleSector}
        onSelectAll={() => setSelectedSectors([...SECTORS])}
        onClearAll={() => setSelectedSectors([])}
      />
      <SectorStocksPanel selectedSectors={selectedSectors} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: INDICES AND SECTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NIFTY_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
  "#8b5cf6",
  "#10b981",
  "#fb923c",
  "#6366f1",
  "#0ea5e9",
  "#d946ef",
  "#4ade80",
  "#fbbf24",
  "#60a5fa",
  "#34d399",
  "#f87171",
  "#c084fc",
  "#38bdf8",
  "#a3e635",
];

function TabIndicesSectors() {
  const [selectedNifty, setSelectedNifty] = useState<string[]>(["NIFTY50"]);
  const [selectedFII, setSelectedFII] = useState<string[]>([]);
  const [activeConstituent, setActiveConstituent] = useState<string>("NIFTY50");

  const toggleNifty = useCallback((idx: string) => {
    setSelectedNifty((prev) => {
      const next = prev.includes(idx)
        ? prev.filter((s) => s !== idx)
        : [...prev, idx];
      if (!prev.includes(idx)) setActiveConstituent(idx);
      return next;
    });
  }, []);

  const toggleFII = useCallback((sec: string) => {
    setSelectedFII((prev) => {
      const next = prev.includes(sec)
        ? prev.filter((s) => s !== sec)
        : [...prev, sec];
      if (!prev.includes(sec)) setActiveConstituent(sec);
      return next;
    });
  }, []);

  // All selected items (nifty first, then fii)
  const allSelected = useMemo(
    () => [
      ...selectedNifty.map((n) => ({ name: n, type: "Nifty" as const })),
      ...selectedFII.map((s) => ({ name: s, type: "FII" as const })),
    ],
    [selectedNifty, selectedFII],
  );

  // Constituents for the active selected item
  const activeStocks = useMemo(() => {
    if (NIFTY_INDEX_STOCKS[activeConstituent])
      return NIFTY_INDEX_STOCKS[activeConstituent];
    // For FII sectors reuse SECTOR_REAL_STOCKS then SECTOR_STOCKS
    return (
      SECTOR_REAL_STOCKS[activeConstituent]?.map((s) => ({
        name: s.name,
        symbol: s.symbol,
      })) ??
      (SECTOR_STOCKS[activeConstituent] ?? []).map((s) => ({
        name: s.name,
        symbol: s.symbol,
      }))
    );
  }, [activeConstituent]);

  // If active item was deselected, pick the first available
  useEffect(() => {
    const allNames = allSelected.map((a) => a.name);
    if (allNames.length > 0 && !allNames.includes(activeConstituent)) {
      setActiveConstituent(allNames[0]);
    }
  }, [allSelected, activeConstituent]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Left Panel: Sector / Index Selector ── */}
      <div className="space-y-4">
        {/* Nifty Sectors group */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-100">Nifty Indices</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedNifty([...NIFTY_INDICES]);
                  setActiveConstituent(NIFTY_INDICES[0]);
                }}
                data-ocid="indices.nifty.selectall.button"
                className="px-2.5 py-1 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedNifty([])}
                data-ocid="indices.nifty.clearall.button"
                className="px-2.5 py-1 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-red-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NIFTY_INDICES.map((idx, i) => {
              const selected = selectedNifty.includes(idx);
              const color = NIFTY_COLORS[i % NIFTY_COLORS.length];
              return (
                <label
                  key={idx}
                  style={{
                    borderColor: selected ? color : "#334155",
                    background: selected ? `${color}22` : "transparent",
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-colors"
                  onClick={() => selected && setActiveConstituent(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      selected && setActiveConstituent(idx);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleNifty(idx)}
                    data-ocid={`indices.nifty.checkbox.${i + 1}`}
                    className="accent-blue-500"
                  />
                  <span
                    style={{
                      color: selected ? color : "#94a3b8",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {idx}
                  </span>
                </label>
              );
            })}
          </div>
        </Card>

        {/* FII Sectors group */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-100">FII Sectors</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFII([...SECTORS]);
                  setActiveConstituent(SECTORS[0]);
                }}
                data-ocid="indices.fii.selectall.button"
                className="px-2.5 py-1 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedFII([])}
                data-ocid="indices.fii.clearall.button"
                className="px-2.5 py-1 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-red-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map((sec, i) => {
              const selected = selectedFII.includes(sec);
              const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
              return (
                <label
                  key={sec}
                  style={{
                    borderColor: selected ? color : "#334155",
                    background: selected ? `${color}22` : "transparent",
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-colors"
                  onClick={() => selected && setActiveConstituent(sec)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      selected && setActiveConstituent(sec);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleFII(sec)}
                    data-ocid={`indices.fii.checkbox.${i + 1}`}
                    className="accent-blue-500"
                  />
                  <span
                    style={{
                      color: selected ? color : "#94a3b8",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sec}
                  </span>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Right Panel: Constituent Companies ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-slate-100">
            Constituent Companies
          </h2>
          {allSelected.length > 0 && (
            <div
              className="flex flex-wrap gap-1"
              data-ocid="indices.constituents.tabs"
            >
              {allSelected.map((item, i) => {
                const isNifty = item.type === "Nifty";
                const colorArr = isNifty ? NIFTY_COLORS : SECTOR_COLORS;
                const colorIdx = isNifty
                  ? NIFTY_INDICES.indexOf(item.name)
                  : SECTORS.indexOf(item.name);
                const color = colorArr[colorIdx % colorArr.length];
                const isActive = activeConstituent === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setActiveConstituent(item.name)}
                    data-ocid={`indices.constituents.tab.${i + 1}`}
                    style={{
                      borderColor: isActive ? color : "#334155",
                      background: isActive ? `${color}33` : "transparent",
                      color: isActive ? color : "#94a3b8",
                    }}
                    className="px-2 py-0.5 text-xs rounded border transition-colors font-medium"
                  >
                    {item.name}
                    <span
                      className="ml-1 text-[10px] opacity-60"
                      style={{ color: isActive ? color : "#64748b" }}
                    >
                      {item.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {allSelected.length === 0 ? (
          <div
            className="h-64 flex flex-col items-center justify-center text-slate-500 text-sm gap-2"
            data-ocid="indices.constituents.empty_state"
          >
            <div className="text-3xl opacity-30">📊</div>
            <div>Select an index or sector to view constituent companies</div>
          </div>
        ) : (
          <div data-ocid="indices.constituents.panel">
            {/* Active index/sector header */}
            <div className="mb-2">
              {(() => {
                const isNifty = NIFTY_INDICES.includes(activeConstituent);
                const colorArr = isNifty ? NIFTY_COLORS : SECTOR_COLORS;
                const colorIdx = isNifty
                  ? NIFTY_INDICES.indexOf(activeConstituent)
                  : SECTORS.indexOf(activeConstituent);
                const color = colorArr[colorIdx % colorArr.length];
                return (
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-bold"
                      style={{ background: `${color}33`, color }}
                    >
                      {activeConstituent}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isNifty ? "Nifty Index" : "FII Sector"} ·{" "}
                      {activeStocks.length} constituents
                    </span>
                  </div>
                );
              })()}
            </div>
            <div
              className="overflow-auto max-h-[520px]"
              data-ocid="indices.constituents.table"
            >
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900">
                  <tr>
                    {["#", "Company Name", "Symbol"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2.5 text-slate-400 font-medium border-b border-slate-700"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeStocks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-8 text-center text-slate-500"
                        data-ocid="indices.constituents.stocks.empty_state"
                      >
                        No constituent data available for this selection
                      </td>
                    </tr>
                  ) : (
                    activeStocks.map((s, i) => (
                      <tr
                        key={s.symbol}
                        className="hover:bg-slate-700/50 transition-colors"
                        data-ocid={`indices.constituents.row.${i + 1}`}
                      >
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-800 w-8">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 text-slate-200 border-b border-slate-800">
                          {s.name}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-800">
                          <span className="bg-blue-950 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">
                            {s.symbol}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { label: "Analysis", comp: <TabAnalysis /> },
  { label: "Index & Index Options OI", comp: <TabIndex /> },
  { label: "Stocks and Stocks Options OI", comp: <TabStocks /> },
  { label: "Macro Indicators", comp: <TabMacro /> },
  { label: "Fortnightly Sector Wise FII Data", comp: <TabSectorFII /> },
  { label: "Indices and Sectors", comp: <TabIndicesSectors /> },
];

export default function App() {
  const [tab, setTab] = useState(0);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-bold text-sm text-white">
              IM
            </div>
            <div>
              <div className="font-bold text-sm text-slate-100 leading-tight">
                Indian Market Analytics
              </div>
              <div className="text-xs text-slate-500">
                NSE | BSE | Simulated Data
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 ml-auto">
            {TABS.map((t, i) => (
              <button
                type="button"
                key={t.label}
                onClick={() => setTab(i)}
                data-ocid={`nav.tab.${i + 1}`}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === i ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-green-950 text-green-400 text-xs px-2.5 py-1 rounded font-semibold">
            ● LIVE SIM
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-4 py-5">{TABS[tab].comp}</div>
    </div>
  );
}
