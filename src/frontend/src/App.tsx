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

function genPCROIData(n: number, dates?: Date[]): PCRBarData[] {
  const ds = dates ?? genDates(n);
  let pcr = 0.9;
  return ds.slice(-n).map((d) => {
    pcr = Math.max(0.5, Math.min(1.8, pcr + (Math.random() - 0.49) * 0.06));
    const ceOI = rndi(8_000_000, 25_000_000);
    const peOI = Math.round(ceOI * pcr);
    return { date: formatDate(d), pcrRatio: +pcr.toFixed(3), peOI, ceOI };
  });
}

// ─── PRECOMPUTED INDEX DATA ────────────────────────────────────────────────────
const NIFTY_DATA = genPriceSeries(300, 22800, 120);
const BANKNIFTY_DATA = genPriceSeries(300, 48500, 380);

const NIFTY_PCR_OI: Record<string, PCRBarData[]> = {
  CW: genPCROIData(100),
  NW: genPCROIData(100),
  CM: genPCROIData(100),
  NM: genPCROIData(100),
};
const BANKNIFTY_PCR_OI: Record<string, PCRBarData[]> = {
  CM: genPCROIData(100),
  NM: genPCROIData(100),
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

const stockPCROICache: Record<string, PCRBarData[]> = {};
function getStockPCROI(sym: string, expiry: string): PCRBarData[] {
  const key = `${sym}_${expiry}`;
  if (!stockPCROICache[key]) stockPCROICache[key] = genPCROIData(60);
  return stockPCROICache[key];
}

// ─── MACRO DATA ────────────────────────────────────────────────────────────────
function genDailyMacro(base: number, vol: number, days = 300) {
  const dates = genDates(days + 30);
  let v = base;
  return dates.map((d) => {
    v = Math.max(
      base * 0.85,
      Math.min(base * 1.15, v + (Math.random() - 0.49) * vol),
    );
    return { date: formatDate(d), value: +v.toFixed(3) };
  });
}

const MACRO_USDINT = genDailyMacro(83.5, 0.15);
const MACRO_FII = genDates(300).map((d) => ({
  date: formatDate(d),
  fii: +rnd(-3500, 4000).toFixed(0),
  dii: +rnd(-1500, 3500).toFixed(0),
}));
const MACRO_CRUDE = genDates(300).map((d) => ({
  date: formatDate(d),
  wti: +rnd(72, 86).toFixed(2),
  brent: +rnd(76, 90).toFixed(2),
}));
const MACRO_GSEC = genDates(300).map((d) => ({
  date: formatDate(d),
  y3: +(6.5 + Math.random() * 0.6).toFixed(3),
  y5: +(6.8 + Math.random() * 0.6).toFixed(3),
  y10: +(7.0 + Math.random() * 0.5).toFixed(3),
}));

function genMonthlyDates(n: number): string[] {
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
    d.setMonth(d.getMonth() - i);
    dates.push(
      `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
    );
  }
  return dates;
}

const MOM_DATES = genMonthlyDates(24);
const MACRO_CPI_WPI = MOM_DATES.map((d, i) => ({
  date: d,
  cpi: +(5.0 + Math.sin(i * 0.4) * 0.8 + (Math.random() - 0.5) * 0.4).toFixed(
    2,
  ),
  wpi: +(2.5 + Math.sin(i * 0.35) * 1.2 + (Math.random() - 0.5) * 0.6).toFixed(
    2,
  ),
}));
const MACRO_AUTO_GST = MOM_DATES.map((d, i) => ({
  date: d,
  autoSales: +(38 + Math.sin(i * 0.3) * 4 + (Math.random() - 0.5) * 3).toFixed(
    1,
  ),
  gst: +(1.82 + i * 0.003 + (Math.random() - 0.5) * 0.05).toFixed(3),
}));
const MACRO_PMI = MOM_DATES.map((d, i) => ({
  date: d,
  mfg: +(56.5 + Math.sin(i * 0.25) * 2 + (Math.random() - 0.5) * 1.5).toFixed(
    1,
  ),
  services: +(
    58.5 +
    Math.sin(i * 0.3) * 2.5 +
    (Math.random() - 0.5) * 1.8
  ).toFixed(1),
}));
const MACRO_FXRESERVE = MOM_DATES.map((d, i) => ({
  date: d,
  value: +(615 + i * 0.8 + (Math.random() - 0.5) * 8).toFixed(1),
}));

const QTR_DATES = [
  "Q2FY22",
  "Q3FY22",
  "Q4FY22",
  "Q1FY23",
  "Q2FY23",
  "Q3FY23",
  "Q4FY23",
  "Q1FY24",
  "Q2FY24",
  "Q3FY24",
  "Q4FY24",
  "Q1FY25",
];
const MACRO_GDP_CAD = QTR_DATES.map((d, i) => ({
  date: d,
  gdp: +(6.5 + Math.sin(i * 0.5) * 1.2 + (Math.random() - 0.5) * 0.5).toFixed(
    1,
  ),
  cad: +(-1.8 + Math.sin(i * 0.4) * 0.6 + (Math.random() - 0.5) * 0.3).toFixed(
    2,
  ),
}));
const MACRO_RATES = QTR_DATES.map((d, i) => ({
  date: d,
  repoRate: i < 2 ? 4.0 : i < 4 ? 5.9 : i < 6 ? 6.25 : 6.5,
  fxReserve: +(615 + i * 2 + (Math.random() - 0.5) * 10).toFixed(1),
}));

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
function CandlesRenderer(props: Record<string, unknown>) {
  const { xAxisMap, yAxisMap, data } = props as {
    xAxisMap: Record<
      string,
      { scale: (v: unknown) => number; bandwidth?: () => number }
    >;
    yAxisMap: Record<string, { scale: (v: number) => number }>;
    data: CandlePoint[];
  };
  if (!xAxisMap || !yAxisMap || !data) return null;
  const xAxis = xAxisMap[0];
  const yAxis = yAxisMap[0];
  if (!xAxis || !yAxis) return null;
  const bw = xAxis.bandwidth ? xAxis.bandwidth() : 8;
  const bodyW = Math.max(2, bw * 0.6);
  return (
    <g>
      {data.map((d, i) => {
        const x = xAxis.scale(i);
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
}

function CandlestickChart({
  data,
  height = 260,
}: { data: CandlePoint[]; height?: number }) {
  const dummyData = data.map((d, i) => ({
    ...d,
    _idx: i,
    _dummy: (d.high + d.low) / 2,
  }));
  const minVal = Math.min(...data.map((d) => d.low));
  const maxVal = Math.max(...data.map((d) => d.high));
  const padding = (maxVal - minVal) * 0.05;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={dummyData}
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "#64748b" }}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "#64748b" }}
          domain={[minVal - padding, maxVal + padding]}
          width={65}
          tickFormatter={(v: number) =>
            v.toLocaleString("en-IN", { maximumFractionDigits: 0 })
          }
        />
        <Tooltip
          {...ttStyle}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload as CandlePoint;
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
              </div>
            );
          }}
        />
        <Bar dataKey="_dummy" opacity={0} isAnimationActive={false} />
        <Customized component={CandlesRenderer} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── PCR + OI CHART ────────────────────────────────────────────────────────────
function PCROIPanel({ data, title }: { data: PCRBarData[]; title: string }) {
  const chartW = Math.max(700, data.length * 22);
  return (
    <div>
      <div className="text-xs font-semibold text-slate-300 mb-1">{title}</div>
      <div className="overflow-x-auto rounded-lg">
        <div style={{ width: chartW }}>
          {/* PCR Ratio Line */}
          <div className="text-xs text-slate-500 mb-0.5 px-1">PCR Ratio</div>
          <LineChart
            width={chartW}
            height={110}
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fill: "#64748b" }}
              interval={Math.floor(data.length / 8)}
            />
            <YAxis
              tick={{ fontSize: 8, fill: "#64748b" }}
              domain={[0.4, 2.0]}
              width={30}
            />
            <Tooltip
              {...ttStyle}
              formatter={(v: number) => [v.toFixed(3), "PCR"]}
            />
            <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="pcrRatio"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              name="PCR"
            />
          </LineChart>
          {/* PE / CE OI Histograms */}
          <div className="text-xs text-slate-500 mt-1 mb-0.5 px-1">
            Total OI Volume (PE = Green, CE = Red)
          </div>
          <BarChart
            width={chartW}
            height={110}
            data={data}
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fill: "#64748b" }}
              interval={Math.floor(data.length / 8)}
            />
            <YAxis
              tick={{ fontSize: 8, fill: "#64748b" }}
              tickFormatter={fmtK}
              width={36}
            />
            <Tooltip
              {...ttStyle}
              formatter={(v: number, n: string) => [fmtK(v), n]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar
              dataKey="peOI"
              name="PE OI"
              fill="#22c55e"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="ceOI"
              name="CE OI"
              fill="#ef4444"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
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

function mergePCROI(
  source: Record<string, PCRBarData[]>,
  selected: Record<string, boolean>,
): PCRBarData[] {
  const active = Object.keys(selected).filter((e) => selected[e]);
  if (!active.length) return [];
  const base = source[active[0]];
  return base.map((item, i) => {
    let totalPE = 0;
    let totalCE = 0;
    for (const e of active) {
      const arr = source[e];
      totalPE += arr[i]?.peOI ?? 0;
      totalCE += arr[i]?.ceOI ?? 0;
    }
    const pcrRatio = totalCE > 0 ? totalPE / totalCE : 0;
    return {
      date: item.date,
      pcrRatio: +pcrRatio.toFixed(3),
      peOI: totalPE,
      ceOI: totalCE,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
function TabAnalysis() {
  const niftyLast = NIFTY_DATA[NIFTY_DATA.length - 1];
  const bnkLast = BANKNIFTY_DATA[BANKNIFTY_DATA.length - 1];
  const usdInrLast = MACRO_USDINT[MACRO_USDINT.length - 1];

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

  const candleData: CandlePoint[] = candles.map((d) => ({
    date: formatDate(d.date),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));
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
      <CandlestickChart data={candleData} height={260} />
    </Card>
  );
}

function IndexOIPanel({
  indexName,
  pcrSource,
  expiries,
  ocidPrefix,
}: {
  indexName: string;
  pcrSource: Record<string, PCRBarData[]>;
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
  const merged = useMemo(
    () => mergePCROI(pcrSource, selected),
    [pcrSource, selected],
  );
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
        pcrSource={NIFTY_PCR_OI}
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
        pcrSource={BANKNIFTY_PCR_OI}
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
  const candleData: CandlePoint[] = useMemo(() => {
    return rawData.slice(-visibleCount).map((d) => ({
      date: formatDate(d.date),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
  }, [rawData, visibleCount]);
  const volumeData = useMemo(() => {
    const sliced = rawData.slice(-visibleCount);
    return sliced.map((d, i) => {
      const from = Math.max(0, i - avgDays + 1);
      const avg =
        sliced.slice(from, i + 1).reduce((s, x) => s + x.volume, 0) /
        (i - from + 1);
      return {
        date: formatDate(d.date),
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
      <CandlestickChart data={candleData} height={230} />
      <div className="mt-3">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-slate-500">Volume</span>
          <div className="flex items-center gap-1.5">
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
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart
            data={volumeData}
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fill: "#64748b" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 8, fill: "#64748b" }}
              tickFormatter={(v: number) => `${(v / 1e5).toFixed(0)}L`}
              width={34}
            />
            <Tooltip
              {...ttStyle}
              formatter={(v: number, n: string) => [
                `${(v / 1e5).toFixed(2)}L`,
                n,
              ]}
            />
            <Bar
              dataKey="volume"
              name="Volume"
              fill="#1d4ed8"
              radius={[2, 2, 0, 0]}
              opacity={0.8}
            />
            <Line
              type="monotone"
              dataKey="avg"
              name={`${avgDays}D Avg`}
              stroke="#f97316"
              dot={false}
              strokeWidth={1.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
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
  const pcrSource = useMemo(
    () => ({ CM: getStockPCROI(sym, "CM"), NM: getStockPCROI(sym, "NM") }),
    [sym],
  );
  const merged = useMemo(
    () => mergePCROI(pcrSource, selected),
    [pcrSource, selected],
  );
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
function DailyIndicatorsCard() {
  const [sub, setSub] = useState<"usd" | "fiidii" | "crude" | "gsec">("usd");
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
  const sliceDays = 132;
  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100 mb-3">
        Daily Indicators
      </h2>
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
            USD/INR Exchange Rate (₹/USD) — Daily
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={MACRO_USDINT.slice(-sliceDays)}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#64748b" }}
                interval={20}
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
        </>
      )}
      {sub === "fiidii" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            FII & DII Daily Flows (₹ Cr) — FII (Blue), DII (Green)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={MACRO_FII.slice(-sliceDays)}
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
                interval={20}
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
        </>
      )}
      {sub === "crude" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Crude Oil Prices (USD/bbl) — WTI (Orange), Brent (Amber)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={MACRO_CRUDE.slice(-sliceDays)}
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
                interval={20}
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
        </>
      )}
      {sub === "gsec" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            G-Sec Yields (%) — 3Y (Blue), 5Y (Green), 10Y (Orange)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={MACRO_GSEC.slice(-sliceDays)}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={20}
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
        </>
      )}
    </Card>
  );
}

function MoMIndicatorsCard() {
  const [sub, setSub] = useState<"cpiwpi" | "autogst" | "pmi" | "fxreserve">(
    "cpiwpi",
  );
  const subTabs = [
    { id: "cpiwpi" as const, label: "CPI & WPI", ocid: "macro.mom.cpiwpi.tab" },
    {
      id: "autogst" as const,
      label: "Auto Sales & GST",
      ocid: "macro.mom.autogst.tab",
    },
    { id: "pmi" as const, label: "PMI", ocid: "macro.mom.pmi.tab" },
    {
      id: "fxreserve" as const,
      label: "FX Reserve",
      ocid: "macro.mom.fxreserve.tab",
    },
  ];
  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100 mb-3">
        Month-on-Month (MoM) Indicators
      </h2>
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
            CPI (Blue) & WPI (Green) — MoM % — Last 24 months
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={MACRO_CPI_WPI}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={3}
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
        </>
      )}
      {sub === "autogst" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Auto Sales (Lakhs, bars) & GST Collections (₹ L Cr, line) — MoM
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={MACRO_AUTO_GST}
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
                interval={3}
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
        </>
      )}
      {sub === "pmi" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            India Manufacturing PMI (Blue) & Services PMI (Green) — MoM
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={MACRO_PMI}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={3}
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
        </>
      )}
      {sub === "fxreserve" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            India FX Reserves (USD Bn) — MoM
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={MACRO_FXRESERVE}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={3}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b" }}
                domain={["auto", "auto"]}
                width={45}
              />
              <Tooltip
                {...ttStyle}
                formatter={(v: number) => [`$${v}B`, "FX Reserve"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                name="FX Reserve"
                stroke="#a855f7"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

function QoQIndicatorsCard() {
  const [sub, setSub] = useState<"gdpcad" | "rates">("gdpcad");
  const subTabs = [
    { id: "gdpcad" as const, label: "GDP & CAD", ocid: "macro.qoq.gdpcad.tab" },
    {
      id: "rates" as const,
      label: "Interest Rates & FX Reserve",
      ocid: "macro.qoq.interestrates.tab",
    },
  ];
  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100 mb-3">
        Quarter-on-Quarter (QoQ) Indicators
      </h2>
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
            GDP Growth % (bars, left) & CAD as % of GDP (line, right) — QoQ
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={MACRO_GDP_CAD}
              margin={{ top: 4, right: 36, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} />
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
                {MACRO_GDP_CAD.map((d) => (
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
        </>
      )}
      {sub === "rates" && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Repo Rate % (Blue, left) & FX Reserve USD Bn (Orange, right) — QoQ
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={MACRO_RATES}
              margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} />
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
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { label: "Analysis", comp: <TabAnalysis /> },
  { label: "Index & Index Options OI", comp: <TabIndex /> },
  { label: "Stocks and Stocks Options OI", comp: <TabStocks /> },
  { label: "Macro Indicators", comp: <TabMacro /> },
  { label: "Fortnightly Sector Wise FII Data", comp: <TabSectorFII /> },
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
