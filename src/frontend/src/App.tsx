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

// ─── SEEDED PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(initialSeed: number) {
  let s = initialSeed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function symSeed(sym: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < sym.length; i++) {
    h ^= sym.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ─── DATE RANGE GENERATOR ─────────────────────────────────────────────────────
function genDatesRange(fromDate: Date, toDate: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ─── OHLC SERIES FROM DATE RANGE WITH SEEDED RNG ─────────────────────────────
function genPriceSeriesRange(
  fromDate: Date,
  toDate: Date,
  startPrice: number,
  endPrice: number,
  volatilityPct: number,
  seed: number,
): OHLC[] {
  const dates = genDatesRange(fromDate, toDate);
  const rng = mulberry32(seed);
  const n = dates.length;
  if (n === 0) return [];
  const result: OHLC[] = [];
  let close = startPrice;
  const logDrift = Math.log(endPrice / startPrice) / n;
  for (let i = 0; i < n; i++) {
    const noise = (rng() - 0.48) * volatilityPct;
    const drift = logDrift * (1 + (rng() - 0.5) * 0.2);
    const open = close * (1 + (rng() - 0.5) * 0.003);
    close = open * Math.exp(drift + noise);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const high = bodyHigh * (1 + rng() * 0.012);
    const low = bodyLow * (1 - rng() * 0.012);
    result.push({
      date: dates[i],
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +Math.max(1, low).toFixed(2),
      close: +Math.max(1, close).toFixed(2),
    });
  }
  return result;
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
const PRICE_START_DATE = new Date("2005-01-03");
const PRICE_END_DATE = new Date("2026-03-03");

const NIFTY_DATA: OHLC[] = genPriceSeriesRange(
  PRICE_START_DATE,
  PRICE_END_DATE,
  2050,
  22800,
  0.012,
  42,
);
const BANKNIFTY_DATA: OHLC[] = genPriceSeriesRange(
  PRICE_START_DATE,
  PRICE_END_DATE,
  7200,
  48500,
  0.018,
  99,
);

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

// ─── NIFTY TOTAL MARKET STOCKS (from CSV) ───────────────────────────────────────
const STOCKS = [
  { sym: "TEJASNET", name: "TEJASNET" },
  { sym: "RELIANCE", name: "RELIANCE" },
  { sym: "BHARTIARTL", name: "BHARTIARTL" },
  { sym: "HDFCBANK", name: "HDFCBANK" },
  { sym: "LT", name: "LT" },
  { sym: "ICICIBANK", name: "ICICIBANK" },
  { sym: "INFY", name: "INFY" },
  { sym: "PARAS", name: "PARAS" },
  { sym: "SBIN", name: "SBIN" },
  { sym: "BEL", name: "BEL" },
  { sym: "ONGC", name: "ONGC" },
  { sym: "M&M", name: "M&M" },
  { sym: "TATASTEEL", name: "TATASTEEL" },
  { sym: "NETWEB", name: "NETWEB" },
  { sym: "BSE", name: "BSE" },
  { sym: "INDIGO", name: "INDIGO" },
  { sym: "ETERNAL", name: "ETERNAL" },
  { sym: "VEDL", name: "VEDL" },
  { sym: "OIL", name: "OIL" },
  { sym: "MARUTI", name: "MARUTI" },
  { sym: "HAL", name: "HAL" },
  { sym: "HINDCOPPER", name: "HINDCOPPER" },
  { sym: "NATIONALUM", name: "NATIONALUM" },
  { sym: "DIXON", name: "DIXON" },
  { sym: "SOLARINDS", name: "SOLARINDS" },
  { sym: "SHRIRAMFIN", name: "SHRIRAMFIN" },
  { sym: "TCS", name: "TCS" },
  { sym: "SUNPHARMA", name: "SUNPHARMA" },
  { sym: "BAJFINANCE", name: "BAJFINANCE" },
  { sym: "DLF", name: "DLF" },
  { sym: "POWERGRID", name: "POWERGRID" },
  { sym: "COALINDIA", name: "COALINDIA" },
  { sym: "SAGILITY", name: "SAGILITY" },
  { sym: "AXISBANK", name: "AXISBANK" },
  { sym: "CHENNPETRO", name: "CHENNPETRO" },
  { sym: "ITC", name: "ITC" },
  { sym: "KOTAKBANK", name: "KOTAKBANK" },
  { sym: "MCX", name: "MCX" },
  { sym: "HINDALCO", name: "HINDALCO" },
  { sym: "TMPV", name: "TMPV" },
  { sym: "HINDUNILVR", name: "HINDUNILVR" },
  { sym: "PETRONET", name: "PETRONET" },
  { sym: "ASHOKLEY", name: "ASHOKLEY" },
  { sym: "SAIL", name: "SAIL" },
  { sym: "SWIGGY", name: "SWIGGY" },
  { sym: "CANBK", name: "CANBK" },
  { sym: "BANKBARODA", name: "BANKBARODA" },
  { sym: "BPCL", name: "BPCL" },
  { sym: "ADANIPORTS", name: "ADANIPORTS" },
  { sym: "IDEA", name: "IDEA" },
  { sym: "IOC", name: "IOC" },
  { sym: "APOLLOHOSP", name: "APOLLOHOSP" },
  { sym: "ULTRACEMCO", name: "ULTRACEMCO" },
  { sym: "ZENTEC", name: "ZENTEC" },
  { sym: "GAIL", name: "GAIL" },
  { sym: "UNIONBANK", name: "UNIONBANK" },
  { sym: "TVSMOTOR", name: "TVSMOTOR" },
  { sym: "EICHERMOT", name: "EICHERMOT" },
  { sym: "KAYNES", name: "KAYNES" },
  { sym: "HINDZINC", name: "HINDZINC" },
  { sym: "HCLTECH", name: "HCLTECH" },
  { sym: "OLAELEC", name: "OLAELEC" },
  { sym: "PAYTM", name: "PAYTM" },
  { sym: "TITAN", name: "TITAN" },
  { sym: "PFC", name: "PFC" },
  { sym: "NTPC", name: "NTPC" },
  { sym: "CUMMINSIND", name: "CUMMINSIND" },
  { sym: "BAJAJFINSV", name: "BAJAJFINSV" },
  { sym: "HDFCLIFE", name: "HDFCLIFE" },
  { sym: "POLYCAB", name: "POLYCAB" },
  { sym: "BHEL", name: "BHEL" },
  { sym: "POWERINDIA", name: "POWERINDIA" },
  { sym: "WIPRO", name: "WIPRO" },
  { sym: "RECLTD", name: "RECLTD" },
  { sym: "ASIANPAINT", name: "ASIANPAINT" },
  { sym: "VBL", name: "VBL" },
  { sym: "COFORGE", name: "COFORGE" },
  { sym: "MAXHEALTH", name: "MAXHEALTH" },
  { sym: "FORCEMOT", name: "FORCEMOT" },
  { sym: "PRAJIND", name: "PRAJIND" },
  { sym: "JINDALSTEL", name: "JINDALSTEL" },
  { sym: "GVT&D", name: "GVT&D" },
  { sym: "GODREJPROP", name: "GODREJPROP" },
  { sym: "JIOFIN", name: "JIOFIN" },
  { sym: "BALRAMCHIN", name: "BALRAMCHIN" },
  { sym: "PERSISTENT", name: "PERSISTENT" },
  { sym: "VMM", name: "VMM" },
  { sym: "ADANIENT", name: "ADANIENT" },
  { sym: "IRFC", name: "IRFC" },
  { sym: "LODHA", name: "LODHA" },
  { sym: "BHARATFORG", name: "BHARATFORG" },
  { sym: "CDSL", name: "CDSL" },
  { sym: "DATAPATTNS", name: "DATAPATTNS" },
  { sym: "LUPIN", name: "LUPIN" },
  { sym: "BAJAJ-AUTO", name: "BAJAJ-AUTO" },
  { sym: "PNB", name: "PNB" },
  { sym: "TRENT", name: "TRENT" },
  { sym: "NATCOPHARM", name: "NATCOPHARM" },
  { sym: "SUZLON", name: "SUZLON" },
  { sym: "IDFCFIRSTB", name: "IDFCFIRSTB" },
  { sym: "WAAREEENER", name: "WAAREEENER" },
  { sym: "KEI", name: "KEI" },
  { sym: "INDIANB", name: "INDIANB" },
  { sym: "RVNL", name: "RVNL" },
  { sym: "SUNDRMFAST", name: "SUNDRMFAST" },
  { sym: "HINDPETRO", name: "HINDPETRO" },
  { sym: "CGPOWER", name: "CGPOWER" },
  { sym: "CIPLA", name: "CIPLA" },
  { sym: "HDFCAMC", name: "HDFCAMC" },
  { sym: "MTARTECH", name: "MTARTECH" },
  { sym: "MUTHOOTFIN", name: "MUTHOOTFIN" },
  { sym: "FEDERALBNK", name: "FEDERALBNK" },
  { sym: "HEROMOTOCO", name: "HEROMOTOCO" },
  { sym: "GRASIM", name: "GRASIM" },
  { sym: "TORNTPOWER", name: "TORNTPOWER" },
  { sym: "CHOLAFIN", name: "CHOLAFIN" },
  { sym: "MRPL", name: "MRPL" },
  { sym: "TECHM", name: "TECHM" },
  { sym: "DRREDDY", name: "DRREDDY" },
  { sym: "NMDC", name: "NMDC" },
  { sym: "MAHABANK", name: "MAHABANK" },
  { sym: "INDUSTOWER", name: "INDUSTOWER" },
  { sym: "ITCHOTELS", name: "ITCHOTELS" },
  { sym: "INDUSINDBK", name: "INDUSINDBK" },
  { sym: "DIVISLAB", name: "DIVISLAB" },
  { sym: "ADANIPOWER", name: "ADANIPOWER" },
  { sym: "DMART", name: "DMART" },
  { sym: "AMBER", name: "AMBER" },
  { sym: "LTF", name: "LTF" },
  { sym: "BANKINDIA", name: "BANKINDIA" },
  { sym: "AUBANK", name: "AUBANK" },
  { sym: "IDBI", name: "IDBI" },
  { sym: "YESBANK", name: "YESBANK" },
  { sym: "UPL", name: "UPL" },
  { sym: "POLYMED", name: "POLYMED" },
  { sym: "MAZDOCK", name: "MAZDOCK" },
  { sym: "RBLBANK", name: "RBLBANK" },
  { sym: "POLICYBZR", name: "POLICYBZR" },
  { sym: "TATAPOWER", name: "TATAPOWER" },
  { sym: "JSWSTEEL", name: "JSWSTEEL" },
  { sym: "INDHOTEL", name: "INDHOTEL" },
  { sym: "GODREJCP", name: "GODREJCP" },
  { sym: "MOTHERSON", name: "MOTHERSON" },
  { sym: "CAMS", name: "CAMS" },
  { sym: "HYUNDAI", name: "HYUNDAI" },
  { sym: "BDL", name: "BDL" },
  { sym: "JUBLFOOD", name: "JUBLFOOD" },
  { sym: "ABCAPITAL", name: "ABCAPITAL" },
  { sym: "FORTIS", name: "FORTIS" },
  { sym: "RPOWER", name: "RPOWER" },
  { sym: "SBILIFE", name: "SBILIFE" },
  { sym: "TORNTPHARM", name: "TORNTPHARM" },
  { sym: "KARURVYSYA", name: "KARURVYSYA" },
  { sym: "APARINDS", name: "APARINDS" },
  { sym: "NEWGEN", name: "NEWGEN" },
  { sym: "MANAPPURAM", name: "MANAPPURAM" },
  { sym: "NAUKRI", name: "NAUKRI" },
  { sym: "BRITANNIA", name: "BRITANNIA" },
  { sym: "ADANIGREEN", name: "ADANIGREEN" },
  { sym: "BOSCHLTD", name: "BOSCHLTD" },
  { sym: "ADANIENSOL", name: "ADANIENSOL" },
  { sym: "SAMMAANCAP", name: "SAMMAANCAP" },
  { sym: "REDINGTON", name: "REDINGTON" },
  { sym: "IRCTC", name: "IRCTC" },
  { sym: "ABB", name: "ABB" },
  { sym: "PIDILITIND", name: "PIDILITIND" },
  { sym: "PGEL", name: "PGEL" },
  { sym: "STLTECH", name: "STLTECH" },
  { sym: "BANDHANBNK", name: "BANDHANBNK" },
  { sym: "LAURUSLABS", name: "LAURUSLABS" },
  { sym: "JKTYRE", name: "JKTYRE" },
  { sym: "MPHASIS", name: "MPHASIS" },
  { sym: "MANKIND", name: "MANKIND" },
  { sym: "UNOMINDA", name: "UNOMINDA" },
  { sym: "NAVINFLUOR", name: "NAVINFLUOR" },
  { sym: "TIINDIA", name: "TIINDIA" },
  { sym: "ENRIN", name: "ENRIN" },
  { sym: "KRN", name: "KRN" },
  { sym: "SUPREMEIND", name: "SUPREMEIND" },
  { sym: "GRSE", name: "GRSE" },
  { sym: "NESTLEIND", name: "NESTLEIND" },
  { sym: "NHPC", name: "NHPC" },
  { sym: "RAIN", name: "RAIN" },
  { sym: "TATACONSUM", name: "TATACONSUM" },
  { sym: "SIEMENS", name: "SIEMENS" },
  { sym: "MRF", name: "MRF" },
  { sym: "GMRAIRPORT", name: "GMRAIRPORT" },
  { sym: "ICICIGI", name: "ICICIGI" },
  { sym: "KALYANKJIL", name: "KALYANKJIL" },
  { sym: "AVANTIFEED", name: "AVANTIFEED" },
  { sym: "360ONE", name: "360ONE" },
  { sym: "APLAPOLLO", name: "APLAPOLLO" },
  { sym: "ANANTRAJ", name: "ANANTRAJ" },
  { sym: "KPITTECH", name: "KPITTECH" },
  { sym: "HAVELLS", name: "HAVELLS" },
  { sym: "ANGELONE", name: "ANGELONE" },
  { sym: "TARIL", name: "TARIL" },
  { sym: "TATAELXSI", name: "TATAELXSI" },
  { sym: "ECLERX", name: "ECLERX" },
  { sym: "MGL", name: "MGL" },
  { sym: "GUJGASLTD", name: "GUJGASLTD" },
  { sym: "GMDCLTD", name: "GMDCLTD" },
  { sym: "SCI", name: "SCI" },
  { sym: "IREDA", name: "IREDA" },
  { sym: "RENUKA", name: "RENUKA" },
  { sym: "MFSL", name: "MFSL" },
  { sym: "POONAWALLA", name: "POONAWALLA" },
  { sym: "COCHINSHIP", name: "COCHINSHIP" },
  { sym: "OBEROIRLTY", name: "OBEROIRLTY" },
  { sym: "PRESTIGE", name: "PRESTIGE" },
  { sym: "NBCC", name: "NBCC" },
  { sym: "ZYDUSLIFE", name: "ZYDUSLIFE" },
  { sym: "PATANJALI", name: "PATANJALI" },
  { sym: "CONCOR", name: "CONCOR" },
  { sym: "ATHERENERG", name: "ATHERENERG" },
  { sym: "UNITDSPR", name: "UNITDSPR" },
  { sym: "BIOCON", name: "BIOCON" },
  { sym: "AMBUJACEM", name: "AMBUJACEM" },
  { sym: "AUROPHARMA", name: "AUROPHARMA" },
  { sym: "GRAPHITE", name: "GRAPHITE" },
  { sym: "TRIVENI", name: "TRIVENI" },
  { sym: "KTKBANK", name: "KTKBANK" },
  { sym: "ENGINERSIN", name: "ENGINERSIN" },
  { sym: "CARTRADE", name: "CARTRADE" },
  { sym: "ACUTAAS", name: "ACUTAAS" },
  { sym: "WOCKPHARMA", name: "WOCKPHARMA" },
  { sym: "UJJIVANSFB", name: "UJJIVANSFB" },
  { sym: "KFINTECH", name: "KFINTECH" },
  { sym: "LICI", name: "LICI" },
  { sym: "NYKAA", name: "NYKAA" },
  { sym: "COROMANDEL", name: "COROMANDEL" },
  { sym: "SYRMA", name: "SYRMA" },
  { sym: "VOLTAS", name: "VOLTAS" },
  { sym: "NAM-INDIA", name: "NAM-INDIA" },
  { sym: "SRF", name: "SRF" },
  { sym: "SHREECEM", name: "SHREECEM" },
  { sym: "J&KBANK", name: "J&KBANK" },
  { sym: "SUNDARMFIN", name: "SUNDARMFIN" },
  { sym: "LICHSGFIN", name: "LICHSGFIN" },
  { sym: "TDPOWERSYS", name: "TDPOWERSYS" },
  { sym: "SOUTHBANK", name: "SOUTHBANK" },
  { sym: "MARICO", name: "MARICO" },
  { sym: "NUVAMA", name: "NUVAMA" },
  { sym: "JSL", name: "JSL" },
  { sym: "GODFRYPHLP", name: "GODFRYPHLP" },
  { sym: "HSCL", name: "HSCL" },
  { sym: "GLENMARK", name: "GLENMARK" },
  { sym: "DABUR", name: "DABUR" },
  { sym: "HFCL", name: "HFCL" },
  { sym: "LTM", name: "LTM" },
  { sym: "BLUESTARCO", name: "BLUESTARCO" },
  { sym: "OFSS", name: "OFSS" },
  { sym: "INOXWIND", name: "INOXWIND" },
  { sym: "CREDITACC", name: "CREDITACC" },
  { sym: "GESHIP", name: "GESHIP" },
  { sym: "HBLENGINE", name: "HBLENGINE" },
  { sym: "SBICARD", name: "SBICARD" },
  { sym: "LALPATHLAB", name: "LALPATHLAB" },
  { sym: "SAILIFE", name: "SAILIFE" },
  { sym: "IFCI", name: "IFCI" },
  { sym: "RADICO", name: "RADICO" },
  { sym: "ASTRAL", name: "ASTRAL" },
  { sym: "FINCABLES", name: "FINCABLES" },
  { sym: "IGL", name: "IGL" },
  { sym: "JAMNAAUTO", name: "JAMNAAUTO" },
  { sym: "JSWENERGY", name: "JSWENERGY" },
  { sym: "CUB", name: "CUB" },
  { sym: "PAGEIND", name: "PAGEIND" },
  { sym: "ABBOTINDIA", name: "ABBOTINDIA" },
  { sym: "IIFL", name: "IIFL" },
  { sym: "DYNAMATECH", name: "DYNAMATECH" },
  { sym: "PIIND", name: "PIIND" },
  { sym: "BELRISE", name: "BELRISE" },
  { sym: "PREMIERENE", name: "PREMIERENE" },
  { sym: "ABLBL", name: "ABLBL" },
  { sym: "CROMPTON", name: "CROMPTON" },
  { sym: "TITAGARH", name: "TITAGARH" },
  { sym: "LUMAXTECH", name: "LUMAXTECH" },
  { sym: "PHOENIXLTD", name: "PHOENIXLTD" },
  { sym: "HUDCO", name: "HUDCO" },
  { sym: "M&MFIN", name: "M&MFIN" },
  { sym: "HEG", name: "HEG" },
  { sym: "AWL", name: "AWL" },
  { sym: "IEX", name: "IEX" },
  { sym: "EIDPARRY", name: "EIDPARRY" },
  { sym: "PNBHOUSING", name: "PNBHOUSING" },
  { sym: "IIFLCAPS", name: "IIFLCAPS" },
  { sym: "RELIGARE", name: "RELIGARE" },
  { sym: "COLPAL", name: "COLPAL" },
  { sym: "EDELWEISS", name: "EDELWEISS" },
  { sym: "MOTILALOFS", name: "MOTILALOFS" },
  { sym: "WELCORP", name: "WELCORP" },
  { sym: "SONACOMS", name: "SONACOMS" },
  { sym: "BAJAJHLDNG", name: "BAJAJHLDNG" },
  { sym: "FSL", name: "FSL" },
  { sym: "PARADEEP", name: "PARADEEP" },
  { sym: "ANANDRATHI", name: "ANANDRATHI" },
  { sym: "ICICIPRULI", name: "ICICIPRULI" },
  { sym: "SCHAEFFLER", name: "SCHAEFFLER" },
  { sym: "BAJAJHFL", name: "BAJAJHFL" },
  { sym: "ASTRAMICRO", name: "ASTRAMICRO" },
  { sym: "GRANULES", name: "GRANULES" },
  { sym: "KAJARIACER", name: "KAJARIACER" },
  { sym: "TATATECH", name: "TATATECH" },
  { sym: "THANGAMAYL", name: "THANGAMAYL" },
  { sym: "CENTRALBK", name: "CENTRALBK" },
  { sym: "LEMONTREE", name: "LEMONTREE" },
  { sym: "GPIL", name: "GPIL" },
  { sym: "AFFLE", name: "AFFLE" },
  { sym: "NCC", name: "NCC" },
  { sym: "HOMEFIRST", name: "HOMEFIRST" },
  { sym: "ANURAS", name: "ANURAS" },
  { sym: "JSWINFRA", name: "JSWINFRA" },
  { sym: "JPPOWER", name: "JPPOWER" },
  { sym: "DCBBANK", name: "DCBBANK" },
  { sym: "CEATLTD", name: "CEATLTD" },
  { sym: "ALKEM", name: "ALKEM" },
  { sym: "BSOFT", name: "BSOFT" },
  { sym: "ASTERDM", name: "ASTERDM" },
  { sym: "NH", name: "NH" },
  { sym: "YATHARTH", name: "YATHARTH" },
  { sym: "APTUS", name: "APTUS" },
  { sym: "DELHIVERY", name: "DELHIVERY" },
  { sym: "PTCIL", name: "PTCIL" },
  { sym: "VOLTAMP", name: "VOLTAMP" },
  { sym: "ZEEL", name: "ZEEL" },
  { sym: "SWANCORP", name: "SWANCORP" },
  { sym: "CHOLAHLDNG", name: "CHOLAHLDNG" },
  { sym: "LLOYDSME", name: "LLOYDSME" },
  { sym: "GOKEX", name: "GOKEX" },
  { sym: "BEML", name: "BEML" },
  { sym: "OLECTRA", name: "OLECTRA" },
  { sym: "RAILTEL", name: "RAILTEL" },
  { sym: "KIRLOSENG", name: "KIRLOSENG" },
  { sym: "AARTIIND", name: "AARTIIND" },
  { sym: "APOLLOTYRE", name: "APOLLOTYRE" },
  { sym: "JMFINANCIL", name: "JMFINANCIL" },
  { sym: "EXIDEIND", name: "EXIDEIND" },
  { sym: "RRKABEL", name: "RRKABEL" },
  { sym: "ACC", name: "ACC" },
  { sym: "SHAKTIPUMP", name: "SHAKTIPUMP" },
  { sym: "IRB", name: "IRB" },
  { sym: "CHAMBLFERT", name: "CHAMBLFERT" },
  { sym: "IRCON", name: "IRCON" },
  { sym: "DALBHARAT", name: "DALBHARAT" },
  { sym: "NLCINDIA", name: "NLCINDIA" },
  { sym: "GABRIEL", name: "GABRIEL" },
  { sym: "SHARDACROP", name: "SHARDACROP" },
  { sym: "JINDALSAW", name: "JINDALSAW" },
  { sym: "EQUITASBNK", name: "EQUITASBNK" },
  { sym: "AZAD", name: "AZAD" },
  { sym: "AADHARHFC", name: "AADHARHFC" },
  { sym: "JBCHEPHARM", name: "JBCHEPHARM" },
  { sym: "STAR", name: "STAR" },
  { sym: "IKS", name: "IKS" },
  { sym: "IOB", name: "IOB" },
  { sym: "TRANSRAILL", name: "TRANSRAILL" },
  { sym: "SYNGENE", name: "SYNGENE" },
  { sym: "SANDUMA", name: "SANDUMA" },
  { sym: "IGIL", name: "IGIL" },
  { sym: "WABAG", name: "WABAG" },
  { sym: "HEXT", name: "HEXT" },
  { sym: "CASTROLIND", name: "CASTROLIND" },
  { sym: "PVRINOX", name: "PVRINOX" },
  { sym: "KPIGREEN", name: "KPIGREEN" },
  { sym: "SHAILY", name: "SHAILY" },
  { sym: "FIRSTCRY", name: "FIRSTCRY" },
  { sym: "UCOBANK", name: "UCOBANK" },
  { sym: "TATACHEM", name: "TATACHEM" },
  { sym: "SANSERA", name: "SANSERA" },
  { sym: "FIVESTAR", name: "FIVESTAR" },
  { sym: "PRIVISCL", name: "PRIVISCL" },
  { sym: "NEULANDLAB", name: "NEULANDLAB" },
  { sym: "GSPL", name: "GSPL" },
  { sym: "SHYAMMETL", name: "SHYAMMETL" },
  { sym: "BATAINDIA", name: "BATAINDIA" },
  { sym: "TATACOMM", name: "TATACOMM" },
  { sym: "BALUFORGE", name: "BALUFORGE" },
  { sym: "EMCURE", name: "EMCURE" },
  { sym: "PCJEWELLER", name: "PCJEWELLER" },
  { sym: "GRWRHITECH", name: "GRWRHITECH" },
  { sym: "HCC", name: "HCC" },
  { sym: "NAZARA", name: "NAZARA" },
  { sym: "IXIGO", name: "IXIGO" },
  { sym: "ARE&M", name: "ARE&M" },
  { sym: "SIGNATURE", name: "SIGNATURE" },
  { sym: "PPLPHARMA", name: "PPLPHARMA" },
  { sym: "SARDAEN", name: "SARDAEN" },
  { sym: "JWL", name: "JWL" },
  { sym: "CMSINFO", name: "CMSINFO" },
  { sym: "SJVN", name: "SJVN" },
  { sym: "BLS", name: "BLS" },
  { sym: "LTTS", name: "LTTS" },
  { sym: "ZENSARTECH", name: "ZENSARTECH" },
  { sym: "MOIL", name: "MOIL" },
  { sym: "ENDURANCE", name: "ENDURANCE" },
  { sym: "INDIAMART", name: "INDIAMART" },
  { sym: "BLACKBUCK", name: "BLACKBUCK" },
  { sym: "JKCEMENT", name: "JKCEMENT" },
  { sym: "ZAGGLE", name: "ZAGGLE" },
  { sym: "KSB", name: "KSB" },
  { sym: "AETHER", name: "AETHER" },
  { sym: "ABSLAMC", name: "ABSLAMC" },
  { sym: "BALKRISIND", name: "BALKRISIND" },
  { sym: "PRICOLLTD", name: "PRICOLLTD" },
  { sym: "ATGL", name: "ATGL" },
  { sym: "DEEPAKNTR", name: "DEEPAKNTR" },
  { sym: "ONESOURCE", name: "ONESOURCE" },
  { sym: "WEBELSOLAR", name: "WEBELSOLAR" },
  { sym: "CRAFTSMAN", name: "CRAFTSMAN" },
  { sym: "BIRLACORPN", name: "BIRLACORPN" },
  { sym: "SENCO", name: "SENCO" },
  { sym: "PCBL", name: "PCBL" },
  { sym: "SHRIPISTON", name: "SHRIPISTON" },
  { sym: "LLOYDSENT", name: "LLOYDSENT" },
  { sym: "CHOICEIN", name: "CHOICEIN" },
  { sym: "AJANTPHARM", name: "AJANTPHARM" },
  { sym: "KRBL", name: "KRBL" },
  { sym: "SAMHI", name: "SAMHI" },
  { sym: "BRIGADE", name: "BRIGADE" },
  { sym: "JYOTICNC", name: "JYOTICNC" },
  { sym: "TIMETECHNO", name: "TIMETECHNO" },
  { sym: "INOXGREEN", name: "INOXGREEN" },
  { sym: "CESC", name: "CESC" },
  { sym: "GREAVESCOT", name: "GREAVESCOT" },
  { sym: "RELINFRA", name: "RELINFRA" },
  { sym: "SKYGOLD", name: "SKYGOLD" },
  { sym: "SWSOLAR", name: "SWSOLAR" },
  { sym: "TECHNOE", name: "TECHNOE" },
  { sym: "AEGISVOPAK", name: "AEGISVOPAK" },
  { sym: "CYIENT", name: "CYIENT" },
  { sym: "JAIBALAJI", name: "JAIBALAJI" },
  { sym: "AAVAS", name: "AAVAS" },
  { sym: "GRAVITA", name: "GRAVITA" },
  { sym: "TATAINVEST", name: "TATAINVEST" },
  { sym: "GPPL", name: "GPPL" },
  { sym: "KEC", name: "KEC" },
  { sym: "LINDEINDIA", name: "LINDEINDIA" },
  { sym: "RBA", name: "RBA" },
  { sym: "KSCL", name: "KSCL" },
  { sym: "RAINBOW", name: "RAINBOW" },
  { sym: "BLUEJET", name: "BLUEJET" },
  { sym: "FLUOROCHEM", name: "FLUOROCHEM" },
  { sym: "PATELENG", name: "PATELENG" },
  { sym: "WAAREERTL", name: "WAAREERTL" },
  { sym: "AURIONPRO", name: "AURIONPRO" },
  { sym: "SONATSOFTW", name: "SONATSOFTW" },
  { sym: "KNRCON", name: "KNRCON" },
  { sym: "NTPCGREEN", name: "NTPCGREEN" },
  { sym: "TEXRAIL", name: "TEXRAIL" },
  { sym: "JSWCEMENT", name: "JSWCEMENT" },
  { sym: "INTELLECT", name: "INTELLECT" },
  { sym: "DEEPAKFERT", name: "DEEPAKFERT" },
  { sym: "SUNTV", name: "SUNTV" },
  { sym: "ASHOKA", name: "ASHOKA" },
  { sym: "WHIRLPOOL", name: "WHIRLPOOL" },
  { sym: "UBL", name: "UBL" },
  { sym: "UTIAMC", name: "UTIAMC" },
  { sym: "SYMPHONY", name: "SYMPHONY" },
  { sym: "ACE", name: "ACE" },
  { sym: "PTC", name: "PTC" },
  { sym: "CEMPRO", name: "CEMPRO" },
  { sym: "INDGN", name: "INDGN" },
  { sym: "ZFCVINDIA", name: "ZFCVINDIA" },
  { sym: "HAPPSTMNDS", name: "HAPPSTMNDS" },
  { sym: "GLAND", name: "GLAND" },
  { sym: "ESCORTS", name: "ESCORTS" },
  { sym: "LTFOODS", name: "LTFOODS" },
  { sym: "MAPMYINDIA", name: "MAPMYINDIA" },
  { sym: "WELSPUNLIV", name: "WELSPUNLIV" },
  { sym: "ABDL", name: "ABDL" },
  { sym: "NAVA", name: "NAVA" },
  { sym: "BERGEPAINT", name: "BERGEPAINT" },
  { sym: "V2RETAIL", name: "V2RETAIL" },
  { sym: "EMAMILTD", name: "EMAMILTD" },
  { sym: "GSFC", name: "GSFC" },
  { sym: "BHARTIHEXA", name: "BHARTIHEXA" },
  { sym: "3MINDIA", name: "3MINDIA" },
  { sym: "ELGIEQUIP", name: "ELGIEQUIP" },
  { sym: "GILLETTE", name: "GILLETTE" },
  { sym: "CONCORDBIO", name: "CONCORDBIO" },
  { sym: "CIGNITITEC", name: "CIGNITITEC" },
  { sym: "DIACABS", name: "DIACABS" },
  { sym: "COHANCE", name: "COHANCE" },
  { sym: "KITEX", name: "KITEX" },
  { sym: "MSUMI", name: "MSUMI" },
  { sym: "TI", name: "TI" },
  { sym: "NSLNISP", name: "NSLNISP" },
  { sym: "KPIL", name: "KPIL" },
  { sym: "INDIASHLTR", name: "INDIASHLTR" },
  { sym: "VTL", name: "VTL" },
  { sym: "ABFRL", name: "ABFRL" },
  { sym: "DBL", name: "DBL" },
  { sym: "KIMS", name: "KIMS" },
  { sym: "IMFA", name: "IMFA" },
  { sym: "JBMA", name: "JBMA" },
  { sym: "CSBBANK", name: "CSBBANK" },
  { sym: "THERMAX", name: "THERMAX" },
  { sym: "AARTIPHARM", name: "AARTIPHARM" },
  { sym: "AIIL", name: "AIIL" },
  { sym: "CLEAN", name: "CLEAN" },
  { sym: "VIYASH", name: "VIYASH" },
  { sym: "CANFINHOME", name: "CANFINHOME" },
  { sym: "EASEMYTRIP", name: "EASEMYTRIP" },
  { sym: "PNGJL", name: "PNGJL" },
  { sym: "CCL", name: "CCL" },
  { sym: "TRIDENT", name: "TRIDENT" },
  { sym: "GMRP&UI", name: "GMRP&UI" },
  { sym: "TIMKEN", name: "TIMKEN" },
  { sym: "ARVIND", name: "ARVIND" },
  { sym: "HONASA", name: "HONASA" },
  { sym: "RITES", name: "RITES" },
  { sym: "AEGISLOG", name: "AEGISLOG" },
  { sym: "EPL", name: "EPL" },
  { sym: "ASAHIINDIA", name: "ASAHIINDIA" },
  { sym: "AVALON", name: "AVALON" },
  { sym: "TANLA", name: "TANLA" },
  { sym: "KPRMILL", name: "KPRMILL" },
  { sym: "JYOTHYLAB", name: "JYOTHYLAB" },
  { sym: "AIAENG", name: "AIAENG" },
  { sym: "CGCL", name: "CGCL" },
  { sym: "AFCONS", name: "AFCONS" },
  { sym: "TEGA", name: "TEGA" },
  { sym: "RATEGAIN", name: "RATEGAIN" },
  { sym: "GODIGIT", name: "GODIGIT" },
  { sym: "MANYAVAR", name: "MANYAVAR" },
  { sym: "AGI", name: "AGI" },
  { sym: "LLOYDSENGG", name: "LLOYDSENGG" },
  { sym: "JUSTDIAL", name: "JUSTDIAL" },
  { sym: "BORORENEW", name: "BORORENEW" },
  { sym: "EIEL", name: "EIEL" },
  { sym: "SCHNEIDER", name: "SCHNEIDER" },
  { sym: "TBOTEK", name: "TBOTEK" },
  { sym: "JISLJALEQS", name: "JISLJALEQS" },
  { sym: "NETWORK18", name: "NETWORK18" },
  { sym: "USHAMART", name: "USHAMART" },
  { sym: "MIDHANI", name: "MIDHANI" },
  { sym: "MAHSEAMLES", name: "MAHSEAMLES" },
  { sym: "MEDPLUS", name: "MEDPLUS" },
  { sym: "LATENTVIEW", name: "LATENTVIEW" },
  { sym: "MASTEK", name: "MASTEK" },
  { sym: "RCF", name: "RCF" },
  { sym: "OSWALPUMPS", name: "OSWALPUMPS" },
  { sym: "TRITURBINE", name: "TRITURBINE" },
  { sym: "HGINFRA", name: "HGINFRA" },
  { sym: "JKPAPER", name: "JKPAPER" },
  { sym: "TIPSMUSIC", name: "TIPSMUSIC" },
  { sym: "FIEMIND", name: "FIEMIND" },
  { sym: "DBREALTY", name: "DBREALTY" },
  { sym: "GLAXO", name: "GLAXO" },
  { sym: "LXCHEM", name: "LXCHEM" },
  { sym: "REFEX", name: "REFEX" },
  { sym: "IPCALAB", name: "IPCALAB" },
  { sym: "PGIL", name: "PGIL" },
  { sym: "KIRLPNU", name: "KIRLPNU" },
  { sym: "ABREL", name: "ABREL" },
  { sym: "BANCOINDIA", name: "BANCOINDIA" },
  { sym: "RAMCOCEM", name: "RAMCOCEM" },
  { sym: "MARKSANS", name: "MARKSANS" },
  { sym: "CCAVENUE", name: "CCAVENUE" },
  { sym: "POWERMECH", name: "POWERMECH" },
  { sym: "ATUL", name: "ATUL" },
  { sym: "MEDANTA", name: "MEDANTA" },
  { sym: "GNFC", name: "GNFC" },
  { sym: "GICRE", name: "GICRE" },
  { sym: "EIHOTEL", name: "EIHOTEL" },
  { sym: "INDIAGLYCO", name: "INDIAGLYCO" },
  { sym: "RATNAMANI", name: "RATNAMANI" },
  { sym: "BECTORFOOD", name: "BECTORFOOD" },
  { sym: "BBTC", name: "BBTC" },
  { sym: "RTNINDIA", name: "RTNINDIA" },
  { sym: "JSFB", name: "JSFB" },
  { sym: "SOBHA", name: "SOBHA" },
  { sym: "CHALET", name: "CHALET" },
  { sym: "ORCHPHARMA", name: "ORCHPHARMA" },
  { sym: "ROUTE", name: "ROUTE" },
  { sym: "HONAUT", name: "HONAUT" },
  { sym: "SURYAROSNI", name: "SURYAROSNI" },
  { sym: "FACT", name: "FACT" },
  { sym: "GAEL", name: "GAEL" },
  { sym: "MANORAMA", name: "MANORAMA" },
  { sym: "SUDARSCHEM", name: "SUDARSCHEM" },
  { sym: "CRISIL", name: "CRISIL" },
  { sym: "HERITGFOOD", name: "HERITGFOOD" },
  { sym: "RHIM", name: "RHIM" },
  { sym: "ELECON", name: "ELECON" },
  { sym: "SHILPAMED", name: "SHILPAMED" },
  { sym: "CIEINDIA", name: "CIEINDIA" },
  { sym: "JKIL", name: "JKIL" },
  { sym: "THELEELA", name: "THELEELA" },
  { sym: "STARHEALTH", name: "STARHEALTH" },
  { sym: "VIJAYA", name: "VIJAYA" },
  { sym: "MINDACORP", name: "MINDACORP" },
  { sym: "JUBLPHARMA", name: "JUBLPHARMA" },
  { sym: "RKFORGE", name: "RKFORGE" },
  { sym: "GMMPFAUDLR", name: "GMMPFAUDLR" },
  { sym: "THYROCARE", name: "THYROCARE" },
  { sym: "FINEORG", name: "FINEORG" },
  { sym: "JUBLINGREA", name: "JUBLINGREA" },
  { sym: "AHLUCONT", name: "AHLUCONT" },
  { sym: "ANUP", name: "ANUP" },
  { sym: "ENTERO", name: "ENTERO" },
  { sym: "ARVINDFASN", name: "ARVINDFASN" },
  { sym: "RTNPOWER", name: "RTNPOWER" },
  { sym: "CAPLIPOINT", name: "CAPLIPOINT" },
  { sym: "MMTC", name: "MMTC" },
  { sym: "INDIACEM", name: "INDIACEM" },
  { sym: "PGHH", name: "PGHH" },
  { sym: "HEMIPROP", name: "HEMIPROP" },
  { sym: "TARC", name: "TARC" },
  { sym: "INOXINDIA", name: "INOXINDIA" },
  { sym: "DEVYANI", name: "DEVYANI" },
  { sym: "ACMESOLAR", name: "ACMESOLAR" },
  { sym: "ELECTCAST", name: "ELECTCAST" },
  { sym: "PNCINFRA", name: "PNCINFRA" },
  { sym: "DATAMATICS", name: "DATAMATICS" },
  { sym: "HIKAL", name: "HIKAL" },
  { sym: "NESCO", name: "NESCO" },
  { sym: "DOMS", name: "DOMS" },
  { sym: "VAIBHAVGBL", name: "VAIBHAVGBL" },
  { sym: "VARROC", name: "VARROC" },
  { sym: "JKLAKSHMI", name: "JKLAKSHMI" },
  { sym: "FINPIPE", name: "FINPIPE" },
  { sym: "SKIPPER", name: "SKIPPER" },
  { sym: "ACI", name: "ACI" },
  { sym: "CAMPUS", name: "CAMPUS" },
  { sym: "THOMASCOOK", name: "THOMASCOOK" },
  { sym: "SBFC", name: "SBFC" },
  { sym: "SUMICHEM", name: "SUMICHEM" },
  { sym: "POLYPLEX", name: "POLYPLEX" },
  { sym: "NIVABUPA", name: "NIVABUPA" },
  { sym: "RALLIS", name: "RALLIS" },
  { sym: "SUNTECK", name: "SUNTECK" },
  { sym: "CELLO", name: "CELLO" },
  { sym: "BASF", name: "BASF" },
  { sym: "BIKAJI", name: "BIKAJI" },
  { sym: "SAFARI", name: "SAFARI" },
  { sym: "TSFINV", name: "TSFINV" },
  { sym: "BBL", name: "BBL" },
  { sym: "VESUVIUS", name: "VESUVIUS" },
  { sym: "SANOFICONR", name: "SANOFICONR" },
  { sym: "INDIGOPNTS", name: "INDIGOPNTS" },
  { sym: "KANSAINER", name: "KANSAINER" },
  { sym: "PURVA", name: "PURVA" },
  { sym: "MAHLIFE", name: "MAHLIFE" },
  { sym: "KIRLOSBROS", name: "KIRLOSBROS" },
  { sym: "EMIL", name: "EMIL" },
  { sym: "EPIGRAL", name: "EPIGRAL" },
  { sym: "IFBIND", name: "IFBIND" },
  { sym: "ICIL", name: "ICIL" },
  { sym: "BLUEDART", name: "BLUEDART" },
  { sym: "ITI", name: "ITI" },
  { sym: "STYRENIX", name: "STYRENIX" },
  { sym: "PRUDENT", name: "PRUDENT" },
  { sym: "NFL", name: "NFL" },
  { sym: "GODREJIND", name: "GODREJIND" },
  { sym: "ALOKINDS", name: "ALOKINDS" },
  { sym: "ASTRAZEN", name: "ASTRAZEN" },
  { sym: "RAYMONDLSL", name: "RAYMONDLSL" },
  { sym: "ADVENZYMES", name: "ADVENZYMES" },
  { sym: "STARCEMENT", name: "STARCEMENT" },
  { sym: "EMUDHRA", name: "EMUDHRA" },
  { sym: "AGARWALEYE", name: "AGARWALEYE" },
  { sym: "AWFIS", name: "AWFIS" },
  { sym: "LMW", name: "LMW" },
  { sym: "AKUMS", name: "AKUMS" },
  { sym: "AKZOINDIA", name: "AKZOINDIA" },
  { sym: "ALIVUS", name: "ALIVUS" },
  { sym: "ISGEC", name: "ISGEC" },
  { sym: "EMBDL", name: "EMBDL" },
  { sym: "CARBORUNIV", name: "CARBORUNIV" },
  { sym: "AARTIDRUGS", name: "AARTIDRUGS" },
  { sym: "BAYERCROP", name: "BAYERCROP" },
  { sym: "ETHOSLTD", name: "ETHOSLTD" },
  { sym: "MAHSCOOTER", name: "MAHSCOOTER" },
  { sym: "DCAL", name: "DCAL" },
  { sym: "TTML", name: "TTML" },
  { sym: "CYIENTDLM", name: "CYIENTDLM" },
  { sym: "NUVOCO", name: "NUVOCO" },
  { sym: "DCMSHRIRAM", name: "DCMSHRIRAM" },
  { sym: "ERIS", name: "ERIS" },
  { sym: "CERA", name: "CERA" },
  { sym: "SUPRIYA", name: "SUPRIYA" },
  { sym: "ORIENTCEM", name: "ORIENTCEM" },
  { sym: "SAREGAMA", name: "SAREGAMA" },
  { sym: "CENTURYPLY", name: "CENTURYPLY" },
  { sym: "IONEXCHANG", name: "IONEXCHANG" },
  { sym: "IMAGICAA", name: "IMAGICAA" },
  { sym: "SANOFI", name: "SANOFI" },
  { sym: "ASKAUTOLTD", name: "ASKAUTOLTD" },
  { sym: "GHCL", name: "GHCL" },
  { sym: "TVSSCS", name: "TVSSCS" },
  { sym: "VGUARD", name: "VGUARD" },
  { sym: "NIACL", name: "NIACL" },
  { sym: "GODREJAGRO", name: "GODREJAGRO" },
  { sym: "GULFOILLUB", name: "GULFOILLUB" },
  { sym: "SUBROS", name: "SUBROS" },
  { sym: "HCG", name: "HCG" },
  { sym: "PFIZER", name: "PFIZER" },
  { sym: "VMART", name: "VMART" },
  { sym: "BALAMINES", name: "BALAMINES" },
  { sym: "MSTCLTD", name: "MSTCLTD" },
  { sym: "ZYDUSWELL", name: "ZYDUSWELL" },
  { sym: "NEOGEN", name: "NEOGEN" },
  { sym: "PARKHOTELS", name: "PARKHOTELS" },
  { sym: "VIPIND", name: "VIPIND" },
  { sym: "SHAREINDIA", name: "SHAREINDIA" },
  { sym: "DHANUKA", name: "DHANUKA" },
  { sym: "DODLA", name: "DODLA" },
  { sym: "VSTIND", name: "VSTIND" },
  { sym: "GATEWAY", name: "GATEWAY" },
  { sym: "OPTIEMUS", name: "OPTIEMUS" },
  { sym: "SPARC", name: "SPARC" },
  { sym: "SHARDAMOTR", name: "SHARDAMOTR" },
  { sym: "GALLANTT", name: "GALLANTT" },
  { sym: "WELENT", name: "WELENT" },
  { sym: "APLLTD", name: "APLLTD" },
  { sym: "ALKYLAMINE", name: "ALKYLAMINE" },
  { sym: "PRSMJOHNSN", name: "PRSMJOHNSN" },
  { sym: "AJAXENGG", name: "AJAXENGG" },
  { sym: "INGERRAND", name: "INGERRAND" },
  { sym: "UNIMECH", name: "UNIMECH" },
  { sym: "CEIGALL", name: "CEIGALL" },
  { sym: "EUREKAFORB", name: "EUREKAFORB" },
  { sym: "ALLCARGO", name: "ALLCARGO" },
  { sym: "SFL", name: "SFL" },
  { sym: "VINATIORGA", name: "VINATIORGA" },
  { sym: "VENTIVE", name: "VENTIVE" },
  { sym: "GANECOS", name: "GANECOS" },
  { sym: "KSL", name: "KSL" },
  { sym: "METROPOLIS", name: "METROPOLIS" },
  { sym: "GARFIBRES", name: "GARFIBRES" },
  { sym: "RELAXO", name: "RELAXO" },
  { sym: "MANINFRA", name: "MANINFRA" },
  { sym: "FDC", name: "FDC" },
  { sym: "PRINCEPIPE", name: "PRINCEPIPE" },
  { sym: "WESTLIFE", name: "WESTLIFE" },
  { sym: "SAPPHIRE", name: "SAPPHIRE" },
  { sym: "LUXIND", name: "LUXIND" },
  { sym: "SUNFLAG", name: "SUNFLAG" },
  { sym: "BAJAJELEC", name: "BAJAJELEC" },
  { sym: "GRINFRA", name: "GRINFRA" },
  { sym: "QUESS", name: "QUESS" },
  { sym: "MAXESTATES", name: "MAXESTATES" },
  { sym: "GANESHHOU", name: "GANESHHOU" },
  { sym: "TEAMLEASE", name: "TEAMLEASE" },
  { sym: "INNOVACAP", name: "INNOVACAP" },
  { sym: "GREENPANEL", name: "GREENPANEL" },
  { sym: "BOSCH-HCIL", name: "BOSCH-HCIL" },
  { sym: "JINDWORLD", name: "JINDWORLD" },
];

// ─── LOT SIZES ──
// Index lot sizes
const NIFTY_LOT_SIZE = 65;
const BANKNIFTY_LOT_SIZE = 30;
const _FINNIFTY_LOT_SIZE = 60;
const _MIDCPNIFTY_LOT_SIZE = 120;
const _NIFTYNXT50_LOT_SIZE = 25;

// Stock lot sizes keyed by NSE symbol
const LOT_SIZES: Record<string, number> = {
  "360ONE": 500,
  ABB: 125,
  ABCAPITAL: 3100,
  ADANIENSOL: 675,
  ADANIENT: 309,
  ADANIGREEN: 600,
  ADANIPORTS: 475,
  ALKEM: 125,
  AMBER: 100,
  AMBUJACEM: 1050,
  ANGELONE: 2500,
  APLAPOLLO: 350,
  APOLLOHOSP: 125,
  ASHOKLEY: 5000,
  ASIANPAINT: 250,
  ASTRAL: 425,
  AUBANK: 1000,
  AUROPHARMA: 550,
  AXISBANK: 625,
  "BAJAJ-AUTO": 75,
  BAJAJFINSV: 250,
  BAJAJHLDNG: 50,
  BAJFINANCE: 750,
  BANDHANBNK: 3600,
  BANKBARODA: 2925,
  BANKINDIA: 5200,
  BDL: 350,
  BEL: 1425,
  BHARATFORG: 500,
  BHARTIARTL: 475,
  BHEL: 2625,
  BIOCON: 2500,
  BLUESTARCO: 325,
  BOSCHLTD: 25,
  BPCL: 1975,
  BRITANNIA: 125,
  BSE: 375,
  CAMS: 750,
  CANBK: 6750,
  CDSL: 475,
  CGPOWER: 850,
  CHOLAFIN: 625,
  CIPLA: 375,
  COALINDIA: 1350,
  COFORGE: 375,
  COLPAL: 225,
  CONCOR: 1250,
  CROMPTON: 1800,
  CUMMINSIND: 200,
  DABUR: 1250,
  DALBHARAT: 325,
  DELHIVERY: 2075,
  DIVISLAB: 100,
  DIXON: 50,
  DLF: 825,
  DMART: 150,
  DRREDDY: 625,
  EICHERMOT: 100,
  ETERNAL: 2425,
  EXIDEIND: 1800,
  FEDERALBNK: 5000,
  FORTIS: 775,
  GAIL: 3150,
  GLENMARK: 375,
  GMRAIRPORT: 6975,
  GODREJCP: 500,
  GODREJPROP: 275,
  GRASIM: 250,
  HAL: 150,
  HAVELLS: 500,
  HCLTECH: 350,
  HDFCAMC: 300,
  HDFCBANK: 550,
  HDFCLIFE: 1100,
  HEROMOTOCO: 150,
  HINDALCO: 700,
  HINDPETRO: 2025,
  HINDUNILVR: 300,
  HINDZINC: 1225,
  HUDCO: 2775,
  ICICIBANK: 700,
  ICICIGI: 325,
  ICICIPRULI: 925,
  IDEA: 71475,
  IDFCFIRSTB: 9275,
  IEX: 3750,
  INDHOTEL: 1000,
  INDIANB: 1000,
  INDIGO: 150,
  INDUSINDBK: 700,
  INDUSTOWER: 1700,
  INFY: 400,
  INOXWIND: 3575,
  IOC: 4875,
  IREDA: 3450,
  IRFC: 4250,
  ITC: 1600,
  JINDALSTEL: 625,
  JIOFIN: 2350,
  JSWENERGY: 1000,
  JSWSTEEL: 675,
  JUBLFOOD: 1250,
  KALYANKJIL: 1175,
  KAYNES: 100,
  KEI: 175,
  KFINTECH: 500,
  KOTAKBANK: 2000,
  KPITTECH: 425,
  LAURUSLABS: 850,
  LICHSGFIN: 1000,
  LICI: 700,
  LODHA: 450,
  LT: 175,
  LTF: 2250,
  LTM: 150,
  LUPIN: 425,
  "M&M": 200,
  MANAPPURAM: 3000,
  MANKIND: 225,
  MARICO: 1200,
  MARUTI: 50,
  MAXHEALTH: 525,
  MAZDOCK: 200,
  MCX: 625,
  MFSL: 400,
  MOTHERSON: 6150,
  MPHASIS: 275,
  MUTHOOTFIN: 275,
  NATIONALUM: 3750,
  NAUKRI: 375,
  NBCC: 6500,
  NESTLEIND: 500,
  NHPC: 6400,
  NMDC: 6750,
  NTPC: 1500,
  NUVAMA: 500,
  NYKAA: 3125,
  OBEROIRLTY: 350,
  OFSS: 75,
  OIL: 1400,
  ONGC: 2250,
  PAGEIND: 15,
  PATANJALI: 900,
  PAYTM: 725,
  PERSISTENT: 100,
  PETRONET: 1900,
  PFC: 1300,
  PGEL: 950,
  PHOENIXLTD: 350,
  PIDILITIND: 500,
  PIIND: 175,
  PNB: 8000,
  PNBHOUSING: 650,
  POLICYBZR: 350,
  POLYCAB: 125,
  POWERGRID: 1900,
  POWERINDIA: 50,
  PPLPHARMA: 2625,
  PREMIERENE: 575,
  PRESTIGE: 450,
  RBLBANK: 3175,
  RECLTD: 1400,
  RELIANCE: 500,
  RVNL: 1525,
  SAIL: 4700,
  SAMMAANCAP: 4300,
  SBICARD: 800,
  SBILIFE: 375,
  SBIN: 750,
  SHREECEM: 25,
  SHRIRAMFIN: 825,
  SIEMENS: 175,
  SOLARINDS: 50,
  SONACOMS: 1225,
  SRF: 200,
  SUNPHARMA: 350,
  SUPREMEIND: 175,
  SUZLON: 9025,
  SWIGGY: 1300,
  SYNGENE: 1000,
  TATACONSUM: 550,
  TATAELXSI: 100,
  TATAPOWER: 1450,
  TATASTEEL: 5500,
  TATATECH: 800,
  TCS: 175,
  TECHM: 600,
  TIINDIA: 200,
  TITAN: 175,
  TMPV: 800,
  TORNTPHARM: 250,
  TORNTPOWER: 425,
  TRENT: 100,
  TVSMOTOR: 175,
  ULTRACEMCO: 50,
  UNIONBANK: 4425,
  UNITDSPR: 400,
  UNOMINDA: 550,
  UPL: 1355,
  VBL: 1125,
  VEDL: 1150,
  VOLTAS: 375,
  WAAREEENER: 175,
  WIPRO: 3000,
  YESBANK: 31100,
  ZYDUSLIFE: 900,
};

// Stocks that have options — derived from the CSV (all symbols except NIFTY/BANKNIFTY)
const STOCKS_WITH_OPTIONS = new Set(Object.keys(LOT_SIZES));

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

// IPO year overrides for stocks that listed after 2005
const STOCK_IPO_YEAR: Record<string, number> = {
  // ~2007-2012 listings
  COALINDIA: 2010,
  POWERGRID: 2007,
  NTPC: 2004,
  // ~2015-2018
  INDIGO: 2015,
  LICI: 2022,
  PAYTM: 2021,
  NYKAA: 2021,
  POLICYBZR: 2021,
  ZOMATO: 2021,
  ETERNAL: 2019,
  SWIGGY: 2024,
  HYUNDAI: 2024,
  OLAELEC: 2024,
  // ~2016-2019
  BSE: 2017,
  CDSL: 2017,
  HAL: 2018,
  BDL: 2020,
  IRCTC: 2019,
  IRFC: 2021,
  IREDA: 2023,
  RVNL: 2019,
  MAZDOCK: 2020,
  GRSE: 2015,
  COCHINSHIP: 2021,
  PATANJALI: 2019,
  JIOFIN: 2023,
  WAAREEENER: 2024,
  NTPCGREEN: 2023,
  ADANIENSOL: 2023,
  ACMESOLAR: 2024,
  SAGILITY: 2024,
  ITCHOTELS: 2025,
  ABREL: 2024,
  VENTIVE: 2024,
  FIRSTCRY: 2024,
  BLACKBUCK: 2024,
  VISHAL: 2024,
  BAJAJHFL: 2024,
  INOXGREEN: 2023,
  JSWCEMENT: 2023,
  JSWINFRA: 2023,
  AFCONS: 2024,
  CEIGALL: 2024,
  SAMBAV: 2024,
  // 2020-2022
  NAZARA: 2021,
  NUVAMA: 2023,
  SBFC: 2023,
  TBOTEK: 2022,
  IXIGO: 2024,
  ZAGGLE: 2023,
  KAYNES: 2022,
  SYRMA: 2022,
  PRIVISCL: 2024,
  UNIMECH: 2024,
  BELRISE: 2024,
  AVALON: 2024,
  SIGNATURE: 2021,
  SAMHI: 2023,
  BLUEJET: 2023,
  YATHARTH: 2023,
  GODIGIT: 2024,
  MEDANTA: 2023,
  EMCURE: 2024,
  NIVABUPA: 2024,
  OSWALPUMPS: 2024,
  MAXESTATES: 2024,
  CCAVENUE: 2024,
  AGARWALEYE: 2024,
  TARC: 2024,
  ACUTAAS: 2024,
  IKS: 2024,
  ENTERO: 2023,
  CELLO: 2023,
  DOMS: 2024,
  BIKAJI: 2022,
  DELHIVERY: 2022,
  CAMPUS: 2022,
  INNOVACAP: 2024,
  GRWRHITECH: 2024,
  AWFIS: 2024,
  WEBELSOLAR: 2024,
};

const stockDataCache: Record<string, OHLCWithVolume[]> = {};
function getStockData(sym: string): OHLCWithVolume[] {
  if (!stockDataCache[sym]) {
    const ipoYear = STOCK_IPO_YEAR[sym] ?? 2005;
    const fromDate = new Date(`${ipoYear}-01-03`);
    const toDate = PRICE_END_DATE;
    const seed = symSeed(sym);
    const rng = mulberry32(seed + 1);

    // Current price (end of series)
    const currentPrice = STOCK_BASE_PRICES[sym] ?? 100 + rng() * 4900;
    // Derive start price from current using inverse drift
    const years = 2026 - ipoYear;
    const annualReturn = 0.12 + rng() * 0.1; // 12-22% annual return
    const startPrice = currentPrice / (1 + annualReturn) ** years;
    const volatilityPct = 0.015 + rng() * 0.02;

    const ohlc = genPriceSeriesRange(
      fromDate,
      toDate,
      startPrice,
      currentPrice,
      volatilityPct,
      seed,
    );

    // Generate volume with a per-symbol seeded RNG
    const volRng = mulberry32(seed + 2);
    const baseVol = 100000 + volRng() * 9900000;

    stockDataCache[sym] = ohlc.map((d) => ({
      ...d,
      volume: Math.round(baseVol * (0.5 + volRng() * 1.5)),
    }));
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

// ─── MARKET PERIOD BOUNDARY UTILITIES ─────────────────────────────────────────
// Regime change date: 1 Sep 2025
const SEPT_2025_CUTOFF = new Date(2025, 8, 1); // Month is 0-indexed

/**
 * Returns the last occurrence of a given weekday in a calendar month.
 * weekday: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
function getLastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): Date {
  // Start from last day of month and go back
  const lastDay = new Date(year, month + 1, 0); // day 0 of next month = last day of this month
  const diff = (lastDay.getDay() - weekday + 7) % 7;
  const result = new Date(lastDay);
  result.setDate(lastDay.getDate() - diff);
  return result;
}

/**
 * Returns the start of the market week containing `date`.
 * On/after 1 Sep 2025: week starts on Wednesday
 * Before 1 Sep 2025: week starts on Friday of the PREVIOUS week
 */
function getMarketWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const isNewRegime = d >= SEPT_2025_CUTOFF;
  const startDow = isNewRegime ? 3 : 5; // 3=Wed, 5=Fri
  const currentDow = d.getDay();
  let daysBack = (currentDow - startDow + 7) % 7;
  // For old regime (Fri start): if today is Thu (4), daysBack would be 6 (go back 6 to previous Fri) — correct
  // For new regime (Wed start): if today is Tue (2), daysBack would be 6 (go back 6 to previous Wed) — correct
  const result = new Date(d);
  result.setDate(d.getDate() - daysBack);
  return result;
}

/**
 * Returns the end of the market week containing `date`.
 * On/after 1 Sep 2025: week ends on Tuesday (next week's Tuesday)
 * Before 1 Sep 2025: week ends on Thursday of the current week
 */
/**
 * Returns the end of the market week containing `date`.
 * On/after 1 Sep 2025: week ends on Tuesday (next week's Tuesday)
 * Before 1 Sep 2025: week ends on Thursday of the current week
 */
function getMarketWeekEnd(date: Date): Date {
  const start = getMarketWeekStart(date);
  const result = new Date(start);
  // New regime: Wed→Tue = 6 days forward; Old regime: Fri→Thu = 6 days forward
  result.setDate(start.getDate() + 6);
  return result;
}

/**
 * Returns the start of the market month containing `date`.
 * On/after 1 Sep 2025: last Wednesday of previous calendar month
 * Before 1 Sep 2025: last Friday of previous calendar month
 */
function getMarketMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const isNewRegime = d >= SEPT_2025_CUTOFF;
  const prevMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
  const prevYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const weekday = isNewRegime ? 3 : 5; // 3=Wed, 5=Fri
  return getLastWeekdayOfMonth(prevYear, prevMonth, weekday);
}

/**
 * Returns the end of the market month containing `date`.
 * On/after 1 Sep 2025: last Tuesday of current calendar month
 * Before 1 Sep 2025: last Thursday of current calendar month
 */
function getMarketMonthEnd(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const isNewRegime = d >= SEPT_2025_CUTOFF;
  const weekday = isNewRegime ? 2 : 4; // 2=Tue, 4=Thu
  return getLastWeekdayOfMonth(d.getFullYear(), d.getMonth(), weekday);
}

const SHORT_MONTHS = [
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

function formatDateShort(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Given a selected year+month (e.g. from OI panel dropdowns), returns
 * the market-period-aware range label for those 4 months.
 * Uses the market month boundaries for the END month (selected month).
 */
function getOIRangeLabel(endYear: number, endMonth: number): string {
  const endMonthDate = new Date(endYear, endMonth, 15);
  const monthEnd = getMarketMonthEnd(endMonthDate);

  // Start = 3 months back from the selected month
  const startMonthDate = new Date(endYear, endMonth - 3, 15);
  const startNorm = new Date(
    startMonthDate.getFullYear(),
    startMonthDate.getMonth(),
    15,
  );
  const monthStart = getMarketMonthStart(startNorm);

  return `${formatDateShort(monthStart)} – ${formatDateShort(monthEnd)}`;
}

// ─── HOLIDAY REGISTRY ─────────────────────────────────────────────────────────
/**
 * Notified market holidays in "YYYY-MM-DD" format.
 * Add holiday dates here when they are announced.
 * Example: "2025-08-15" (Independence Day), "2025-10-02" (Gandhi Jayanti)
 */
const NOTIFIED_HOLIDAYS: Set<string> = new Set([
  // Holiday dates will be added here e.g.: "2025-08-15"
]);

/**
 * Returns true if the given date is a market holiday:
 * - Saturdays (day 6)
 * - Sundays (day 0)
 * - Notified holidays (in NOTIFIED_HOLIDAYS)
 */
function isMarketHoliday(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return NOTIFIED_HOLIDAYS.has(key);
}

/**
 * Returns true if the given date is the first trading day of its market week.
 * On/after 1 Sep 2025: market week starts Wednesday
 * Before 1 Sep 2025: market week starts Friday
 * The first day is NOT a holiday; if the start day falls on a holiday,
 * the next non-holiday day is the first trading day.
 */
function isFirstTradingDayOfWeek(date: Date): boolean {
  if (isMarketHoliday(date)) return false;
  const weekStart = getMarketWeekStart(date);
  // Find the first non-holiday trading day from weekStart
  const candidate = new Date(weekStart);
  while (isMarketHoliday(candidate)) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return (
    date.getFullYear() === candidate.getFullYear() &&
    date.getMonth() === candidate.getMonth() &&
    date.getDate() === candidate.getDate()
  );
}

/**
 * Returns true if the given date is the first trading day of its market month.
 * The market month start is the last Wednesday (post-Sep 2025) or last Friday
 * (pre-Sep 2025) of the previous calendar month. If that day is a holiday,
 * the next non-holiday day is the first trading day.
 */
function isFirstTradingDayOfMonth(date: Date): boolean {
  if (isMarketHoliday(date)) return false;
  const monthStart = getMarketMonthStart(date);
  const candidate = new Date(monthStart);
  while (isMarketHoliday(candidate)) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return (
    date.getFullYear() === candidate.getFullYear() &&
    date.getMonth() === candidate.getMonth() &&
    date.getDate() === candidate.getDate()
  );
}

// Suppress unused warning for helper functions that are exported for future use
void isFirstTradingDayOfWeek;
void isFirstTradingDayOfMonth;

// ─── MACRO DATA ────────────────────────────────────────────────────────────────

// Helper: year options from 2005 to current year
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2005; y <= currentYear; y++) years.push(y);
  return years;
}
const _YEAR_OPTIONS = getYearOptions();
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

// ─── NIFTY INDICES DATA (from CSV) ───────────────────────────────────────────────
const NIFTY_INDICES = [
  "NIFTY 50",
  "NIFTY BANK",
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
  "NIFTY HEALTHCARE INDEX",
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
  "NIFTY 50": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "BHARTIARTL", symbol: "BHARTIARTL" },
    { name: "HDFCBANK", symbol: "HDFCBANK" },
    { name: "LT", symbol: "LT" },
    { name: "ICICIBANK", symbol: "ICICIBANK" },
    { name: "INFY", symbol: "INFY" },
    { name: "SBIN", symbol: "SBIN" },
    { name: "BEL", symbol: "BEL" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "M&M", symbol: "M&M" },
    { name: "TATASTEEL", symbol: "TATASTEEL" },
    { name: "INDIGO", symbol: "INDIGO" },
    { name: "ETERNAL", symbol: "ETERNAL" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "SHRIRAMFIN", symbol: "SHRIRAMFIN" },
    { name: "TCS", symbol: "TCS" },
    { name: "SUNPHARMA", symbol: "SUNPHARMA" },
    { name: "BAJFINANCE", symbol: "BAJFINANCE" },
    { name: "POWERGRID", symbol: "POWERGRID" },
    { name: "COALINDIA", symbol: "COALINDIA" },
    { name: "AXISBANK", symbol: "AXISBANK" },
    { name: "ITC", symbol: "ITC" },
    { name: "KOTAKBANK", symbol: "KOTAKBANK" },
    { name: "HINDALCO", symbol: "HINDALCO" },
    { name: "TMPV", symbol: "TMPV" },
    { name: "HINDUNILVR", symbol: "HINDUNILVR" },
    { name: "ADANIPORTS", symbol: "ADANIPORTS" },
    { name: "APOLLOHOSP", symbol: "APOLLOHOSP" },
    { name: "ULTRACEMCO", symbol: "ULTRACEMCO" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "HCLTECH", symbol: "HCLTECH" },
    { name: "TITAN", symbol: "TITAN" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "BAJAJFINSV", symbol: "BAJAJFINSV" },
    { name: "HDFCLIFE", symbol: "HDFCLIFE" },
    { name: "WIPRO", symbol: "WIPRO" },
    { name: "ASIANPAINT", symbol: "ASIANPAINT" },
    { name: "MAXHEALTH", symbol: "MAXHEALTH" },
    { name: "JIOFIN", symbol: "JIOFIN" },
    { name: "ADANIENT", symbol: "ADANIENT" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "TRENT", symbol: "TRENT" },
    { name: "CIPLA", symbol: "CIPLA" },
    { name: "GRASIM", symbol: "GRASIM" },
    { name: "TECHM", symbol: "TECHM" },
    { name: "DRREDDY", symbol: "DRREDDY" },
    { name: "JSWSTEEL", symbol: "JSWSTEEL" },
    { name: "SBILIFE", symbol: "SBILIFE" },
    { name: "NESTLEIND", symbol: "NESTLEIND" },
    { name: "TATACONSUM", symbol: "TATACONSUM" },
  ],
  "NIFTY BANK": [
    { name: "HDFCBANK", symbol: "HDFCBANK" },
    { name: "ICICIBANK", symbol: "ICICIBANK" },
    { name: "SBIN", symbol: "SBIN" },
    { name: "AXISBANK", symbol: "AXISBANK" },
    { name: "KOTAKBANK", symbol: "KOTAKBANK" },
    { name: "CANBK", symbol: "CANBK" },
    { name: "BANKBARODA", symbol: "BANKBARODA" },
    { name: "UNIONBANK", symbol: "UNIONBANK" },
    { name: "PNB", symbol: "PNB" },
    { name: "IDFCFIRSTB", symbol: "IDFCFIRSTB" },
    { name: "FEDERALBNK", symbol: "FEDERALBNK" },
    { name: "INDUSINDBK", symbol: "INDUSINDBK" },
    { name: "AUBANK", symbol: "AUBANK" },
    { name: "YESBANK", symbol: "YESBANK" },
  ],
  "NIFTY NEXT 50": [
    { name: "VEDL", symbol: "VEDL" },
    { name: "HAL", symbol: "HAL" },
    { name: "SOLARINDS", symbol: "SOLARINDS" },
    { name: "DLF", symbol: "DLF" },
    { name: "CANBK", symbol: "CANBK" },
    { name: "BANKBARODA", symbol: "BANKBARODA" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "IOC", symbol: "IOC" },
    { name: "GAIL", symbol: "GAIL" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "HINDZINC", symbol: "HINDZINC" },
    { name: "PFC", symbol: "PFC" },
    { name: "RECLTD", symbol: "RECLTD" },
    { name: "VBL", symbol: "VBL" },
    { name: "JINDALSTEL", symbol: "JINDALSTEL" },
    { name: "IRFC", symbol: "IRFC" },
    { name: "LODHA", symbol: "LODHA" },
    { name: "PNB", symbol: "PNB" },
    { name: "CGPOWER", symbol: "CGPOWER" },
    { name: "CHOLAFIN", symbol: "CHOLAFIN" },
    { name: "DIVISLAB", symbol: "DIVISLAB" },
    { name: "ADANIPOWER", symbol: "ADANIPOWER" },
    { name: "DMART", symbol: "DMART" },
    { name: "MAZDOCK", symbol: "MAZDOCK" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "INDHOTEL", symbol: "INDHOTEL" },
    { name: "GODREJCP", symbol: "GODREJCP" },
    { name: "MOTHERSON", symbol: "MOTHERSON" },
    { name: "HYUNDAI", symbol: "HYUNDAI" },
    { name: "TORNTPHARM", symbol: "TORNTPHARM" },
    { name: "NAUKRI", symbol: "NAUKRI" },
    { name: "BRITANNIA", symbol: "BRITANNIA" },
    { name: "ADANIGREEN", symbol: "ADANIGREEN" },
    { name: "BOSCHLTD", symbol: "BOSCHLTD" },
    { name: "ADANIENSOL", symbol: "ADANIENSOL" },
    { name: "ABB", symbol: "ABB" },
    { name: "PIDILITIND", symbol: "PIDILITIND" },
    { name: "ENRIN", symbol: "ENRIN" },
    { name: "SIEMENS", symbol: "SIEMENS" },
    { name: "ICICIGI", symbol: "ICICIGI" },
    { name: "HAVELLS", symbol: "HAVELLS" },
    { name: "ZYDUSLIFE", symbol: "ZYDUSLIFE" },
    { name: "UNITDSPR", symbol: "UNITDSPR" },
    { name: "AMBUJACEM", symbol: "AMBUJACEM" },
    { name: "LICI", symbol: "LICI" },
    { name: "SHREECEM", symbol: "SHREECEM" },
    { name: "LTM", symbol: "LTM" },
    { name: "JSWENERGY", symbol: "JSWENERGY" },
    { name: "BAJAJHLDNG", symbol: "BAJAJHLDNG" },
    { name: "BAJAJHFL", symbol: "BAJAJHFL" },
  ],
  "NIFTY AUTO": [
    { name: "M&M", symbol: "M&M" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "TMPV", symbol: "TMPV" },
    { name: "ASHOKLEY", symbol: "ASHOKLEY" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "BHARATFORG", symbol: "BHARATFORG" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "HEROMOTOCO", symbol: "HEROMOTOCO" },
    { name: "MOTHERSON", symbol: "MOTHERSON" },
    { name: "BOSCHLTD", symbol: "BOSCHLTD" },
    { name: "UNOMINDA", symbol: "UNOMINDA" },
    { name: "TIINDIA", symbol: "TIINDIA" },
    { name: "SONACOMS", symbol: "SONACOMS" },
    { name: "EXIDEIND", symbol: "EXIDEIND" },
  ],
  "NIFTY FMCG": [
    { name: "ITC", symbol: "ITC" },
    { name: "HINDUNILVR", symbol: "HINDUNILVR" },
    { name: "VBL", symbol: "VBL" },
    { name: "GODREJCP", symbol: "GODREJCP" },
    { name: "BRITANNIA", symbol: "BRITANNIA" },
    { name: "NESTLEIND", symbol: "NESTLEIND" },
    { name: "TATACONSUM", symbol: "TATACONSUM" },
    { name: "PATANJALI", symbol: "PATANJALI" },
    { name: "UNITDSPR", symbol: "UNITDSPR" },
    { name: "MARICO", symbol: "MARICO" },
    { name: "DABUR", symbol: "DABUR" },
    { name: "RADICO", symbol: "RADICO" },
    { name: "COLPAL", symbol: "COLPAL" },
    { name: "UBL", symbol: "UBL" },
    { name: "EMAMILTD", symbol: "EMAMILTD" },
  ],
  "NIFTY IT": [
    { name: "INFY", symbol: "INFY" },
    { name: "TCS", symbol: "TCS" },
    { name: "HCLTECH", symbol: "HCLTECH" },
    { name: "WIPRO", symbol: "WIPRO" },
    { name: "COFORGE", symbol: "COFORGE" },
    { name: "PERSISTENT", symbol: "PERSISTENT" },
    { name: "TECHM", symbol: "TECHM" },
    { name: "MPHASIS", symbol: "MPHASIS" },
    { name: "LTM", symbol: "LTM" },
    { name: "OFSS", symbol: "OFSS" },
  ],
  "NIFTY MEDIA": [
    { name: "PFOCUS", symbol: "PFOCUS" },
    { name: "ZEEL", symbol: "ZEEL" },
    { name: "PVRINOX", symbol: "PVRINOX" },
    { name: "NAZARA", symbol: "NAZARA" },
    { name: "SUNTV", symbol: "SUNTV" },
    { name: "NETWORK18", symbol: "NETWORK18" },
    { name: "TIPSMUSIC", symbol: "TIPSMUSIC" },
    { name: "SAREGAMA", symbol: "SAREGAMA" },
    { name: "HATHWAY", symbol: "HATHWAY" },
    { name: "DBCORP", symbol: "DBCORP" },
  ],
  "NIFTY METAL": [
    { name: "TATASTEEL", symbol: "TATASTEEL" },
    { name: "VEDL", symbol: "VEDL" },
    { name: "HINDCOPPER", symbol: "HINDCOPPER" },
    { name: "NATIONALUM", symbol: "NATIONALUM" },
    { name: "HINDALCO", symbol: "HINDALCO" },
    { name: "SAIL", symbol: "SAIL" },
    { name: "HINDZINC", symbol: "HINDZINC" },
    { name: "JINDALSTEL", symbol: "JINDALSTEL" },
    { name: "ADANIENT", symbol: "ADANIENT" },
    { name: "NMDC", symbol: "NMDC" },
    { name: "JSWSTEEL", symbol: "JSWSTEEL" },
    { name: "APLAPOLLO", symbol: "APLAPOLLO" },
    { name: "JSL", symbol: "JSL" },
    { name: "WELCORP", symbol: "WELCORP" },
    { name: "LLOYDSME", symbol: "LLOYDSME" },
  ],
  "NIFTY PHARMA": [
    { name: "SUNPHARMA", symbol: "SUNPHARMA" },
    { name: "LUPIN", symbol: "LUPIN" },
    { name: "CIPLA", symbol: "CIPLA" },
    { name: "DRREDDY", symbol: "DRREDDY" },
    { name: "DIVISLAB", symbol: "DIVISLAB" },
    { name: "TORNTPHARM", symbol: "TORNTPHARM" },
    { name: "LAURUSLABS", symbol: "LAURUSLABS" },
    { name: "MANKIND", symbol: "MANKIND" },
    { name: "ZYDUSLIFE", symbol: "ZYDUSLIFE" },
    { name: "BIOCON", symbol: "BIOCON" },
    { name: "AUROPHARMA", symbol: "AUROPHARMA" },
    { name: "WOCKPHARMA", symbol: "WOCKPHARMA" },
    { name: "GLENMARK", symbol: "GLENMARK" },
    { name: "ABBOTINDIA", symbol: "ABBOTINDIA" },
    { name: "ALKEM", symbol: "ALKEM" },
    { name: "JBCHEPHARM", symbol: "JBCHEPHARM" },
    { name: "PPLPHARMA", symbol: "PPLPHARMA" },
    { name: "AJANTPHARM", symbol: "AJANTPHARM" },
    { name: "GLAND", symbol: "GLAND" },
    { name: "IPCALAB", symbol: "IPCALAB" },
  ],
  "NIFTY PSU BANK": [
    { name: "SBIN", symbol: "SBIN" },
    { name: "CANBK", symbol: "CANBK" },
    { name: "BANKBARODA", symbol: "BANKBARODA" },
    { name: "UNIONBANK", symbol: "UNIONBANK" },
    { name: "PNB", symbol: "PNB" },
    { name: "INDIANB", symbol: "INDIANB" },
    { name: "MAHABANK", symbol: "MAHABANK" },
    { name: "BANKINDIA", symbol: "BANKINDIA" },
    { name: "CENTRALBK", symbol: "CENTRALBK" },
    { name: "IOB", symbol: "IOB" },
    { name: "UCOBANK", symbol: "UCOBANK" },
    { name: "PSB", symbol: "PSB" },
  ],
  "NIFTY PRIVATE BANK": [
    { name: "HDFCBANK", symbol: "HDFCBANK" },
    { name: "ICICIBANK", symbol: "ICICIBANK" },
    { name: "AXISBANK", symbol: "AXISBANK" },
    { name: "KOTAKBANK", symbol: "KOTAKBANK" },
    { name: "IDFCFIRSTB", symbol: "IDFCFIRSTB" },
    { name: "FEDERALBNK", symbol: "FEDERALBNK" },
    { name: "INDUSINDBK", symbol: "INDUSINDBK" },
    { name: "YESBANK", symbol: "YESBANK" },
    { name: "RBLBANK", symbol: "RBLBANK" },
    { name: "BANDHANBNK", symbol: "BANDHANBNK" },
  ],
  "NIFTY REALTY": [
    { name: "DLF", symbol: "DLF" },
    { name: "GODREJPROP", symbol: "GODREJPROP" },
    { name: "LODHA", symbol: "LODHA" },
    { name: "ANANTRAJ", symbol: "ANANTRAJ" },
    { name: "OBEROIRLTY", symbol: "OBEROIRLTY" },
    { name: "PRESTIGE", symbol: "PRESTIGE" },
    { name: "PHOENIXLTD", symbol: "PHOENIXLTD" },
    { name: "SIGNATURE", symbol: "SIGNATURE" },
    { name: "BRIGADE", symbol: "BRIGADE" },
    { name: "SOBHA", symbol: "SOBHA" },
  ],
  "NIFTY HEALTHCARE INDEX": [
    { name: "SUNPHARMA", symbol: "SUNPHARMA" },
    { name: "APOLLOHOSP", symbol: "APOLLOHOSP" },
    { name: "MAXHEALTH", symbol: "MAXHEALTH" },
    { name: "LUPIN", symbol: "LUPIN" },
    { name: "CIPLA", symbol: "CIPLA" },
    { name: "DRREDDY", symbol: "DRREDDY" },
    { name: "DIVISLAB", symbol: "DIVISLAB" },
    { name: "FORTIS", symbol: "FORTIS" },
    { name: "TORNTPHARM", symbol: "TORNTPHARM" },
    { name: "LAURUSLABS", symbol: "LAURUSLABS" },
    { name: "MANKIND", symbol: "MANKIND" },
    { name: "ZYDUSLIFE", symbol: "ZYDUSLIFE" },
    { name: "BIOCON", symbol: "BIOCON" },
    { name: "AUROPHARMA", symbol: "AUROPHARMA" },
    { name: "GLENMARK", symbol: "GLENMARK" },
    { name: "ABBOTINDIA", symbol: "ABBOTINDIA" },
    { name: "ALKEM", symbol: "ALKEM" },
    { name: "SYNGENE", symbol: "SYNGENE" },
    { name: "PPLPHARMA", symbol: "PPLPHARMA" },
    { name: "IPCALAB", symbol: "IPCALAB" },
  ],
  "NIFTY CONSUMER DURABLES": [
    { name: "DIXON", symbol: "DIXON" },
    { name: "TITAN", symbol: "TITAN" },
    { name: "AMBER", symbol: "AMBER" },
    { name: "PGEL", symbol: "PGEL" },
    { name: "KALYANKJIL", symbol: "KALYANKJIL" },
    { name: "HAVELLS", symbol: "HAVELLS" },
    { name: "VOLTAS", symbol: "VOLTAS" },
    { name: "BLUESTARCO", symbol: "BLUESTARCO" },
    { name: "CROMPTON", symbol: "CROMPTON" },
    { name: "KAJARIACER", symbol: "KAJARIACER" },
    { name: "BATAINDIA", symbol: "BATAINDIA" },
    { name: "WHIRLPOOL", symbol: "WHIRLPOOL" },
    { name: "CERA", symbol: "CERA" },
    { name: "CENTURYPLY", symbol: "CENTURYPLY" },
    { name: "VGUARD", symbol: "VGUARD" },
  ],
  "NIFTY OIL & GAS": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "OIL", symbol: "OIL" },
    { name: "PETRONET", symbol: "PETRONET" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "IOC", symbol: "IOC" },
    { name: "GAIL", symbol: "GAIL" },
    { name: "HINDPETRO", symbol: "HINDPETRO" },
    { name: "MGL", symbol: "MGL" },
    { name: "GUJGASLTD", symbol: "GUJGASLTD" },
    { name: "IGL", symbol: "IGL" },
    { name: "CASTROLIND", symbol: "CASTROLIND" },
    { name: "GSPL", symbol: "GSPL" },
    { name: "ATGL", symbol: "ATGL" },
    { name: "AEGISLOG", symbol: "AEGISLOG" },
  ],
  "NIFTY COMMODITIES": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "TATASTEEL", symbol: "TATASTEEL" },
    { name: "VEDL", symbol: "VEDL" },
    { name: "OIL", symbol: "OIL" },
    { name: "COALINDIA", symbol: "COALINDIA" },
    { name: "HINDALCO", symbol: "HINDALCO" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "IOC", symbol: "IOC" },
    { name: "ULTRACEMCO", symbol: "ULTRACEMCO" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "JINDALSTEL", symbol: "JINDALSTEL" },
    { name: "HINDPETRO", symbol: "HINDPETRO" },
    { name: "GRASIM", symbol: "GRASIM" },
    { name: "TORNTPOWER", symbol: "TORNTPOWER" },
    { name: "NMDC", symbol: "NMDC" },
    { name: "ADANIPOWER", symbol: "ADANIPOWER" },
    { name: "UPL", symbol: "UPL" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "JSWSTEEL", symbol: "JSWSTEEL" },
    { name: "ADANIGREEN", symbol: "ADANIGREEN" },
    { name: "ADANIENSOL", symbol: "ADANIENSOL" },
    { name: "PIDILITIND", symbol: "PIDILITIND" },
    { name: "NHPC", symbol: "NHPC" },
    { name: "APLAPOLLO", symbol: "APLAPOLLO" },
    { name: "AMBUJACEM", symbol: "AMBUJACEM" },
    { name: "SRF", symbol: "SRF" },
    { name: "SHREECEM", symbol: "SHREECEM" },
    { name: "JSWENERGY", symbol: "JSWENERGY" },
    { name: "PIIND", symbol: "PIIND" },
  ],
  "NIFTY INDIA CONSUMPTION": [
    { name: "BHARTIARTL", symbol: "BHARTIARTL" },
    { name: "M&M", symbol: "M&M" },
    { name: "INDIGO", symbol: "INDIGO" },
    { name: "ETERNAL", symbol: "ETERNAL" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "DIXON", symbol: "DIXON" },
    { name: "DLF", symbol: "DLF" },
    { name: "ITC", symbol: "ITC" },
    { name: "HINDUNILVR", symbol: "HINDUNILVR" },
    { name: "APOLLOHOSP", symbol: "APOLLOHOSP" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "TITAN", symbol: "TITAN" },
    { name: "ASIANPAINT", symbol: "ASIANPAINT" },
    { name: "VBL", symbol: "VBL" },
    { name: "MAXHEALTH", symbol: "MAXHEALTH" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "TRENT", symbol: "TRENT" },
    { name: "HEROMOTOCO", symbol: "HEROMOTOCO" },
    { name: "ADANIPOWER", symbol: "ADANIPOWER" },
    { name: "DMART", symbol: "DMART" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "INDHOTEL", symbol: "INDHOTEL" },
    { name: "GODREJCP", symbol: "GODREJCP" },
    { name: "NAUKRI", symbol: "NAUKRI" },
    { name: "BRITANNIA", symbol: "BRITANNIA" },
    { name: "NESTLEIND", symbol: "NESTLEIND" },
    { name: "TATACONSUM", symbol: "TATACONSUM" },
    { name: "HAVELLS", symbol: "HAVELLS" },
    { name: "UNITDSPR", symbol: "UNITDSPR" },
  ],
  "NIFTY ENERGY": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "OIL", symbol: "OIL" },
    { name: "POWERGRID", symbol: "POWERGRID" },
    { name: "COALINDIA", symbol: "COALINDIA" },
    { name: "PETRONET", symbol: "PETRONET" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "IOC", symbol: "IOC" },
    { name: "GAIL", symbol: "GAIL" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "BHEL", symbol: "BHEL" },
    { name: "POWERINDIA", symbol: "POWERINDIA" },
    { name: "GVT&D", symbol: "GVT&D" },
    { name: "SUZLON", symbol: "SUZLON" },
    { name: "HINDPETRO", symbol: "HINDPETRO" },
    { name: "CGPOWER", symbol: "CGPOWER" },
    { name: "TORNTPOWER", symbol: "TORNTPOWER" },
    { name: "ADANIPOWER", symbol: "ADANIPOWER" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "RPOWER", symbol: "RPOWER" },
    { name: "ADANIGREEN", symbol: "ADANIGREEN" },
    { name: "ADANIENSOL", symbol: "ADANIENSOL" },
    { name: "ABB", symbol: "ABB" },
    { name: "ENRIN", symbol: "ENRIN" },
    { name: "NHPC", symbol: "NHPC" },
    { name: "SIEMENS", symbol: "SIEMENS" },
    { name: "MGL", symbol: "MGL" },
    { name: "GUJGASLTD", symbol: "GUJGASLTD" },
    { name: "INOXWIND", symbol: "INOXWIND" },
    { name: "IGL", symbol: "IGL" },
    { name: "JSWENERGY", symbol: "JSWENERGY" },
    { name: "JPPOWER", symbol: "JPPOWER" },
    { name: "NLCINDIA", symbol: "NLCINDIA" },
    { name: "CASTROLIND", symbol: "CASTROLIND" },
    { name: "GSPL", symbol: "GSPL" },
    { name: "SJVN", symbol: "SJVN" },
    { name: "ATGL", symbol: "ATGL" },
    { name: "CESC", symbol: "CESC" },
    { name: "THERMAX", symbol: "THERMAX" },
    { name: "AEGISLOG", symbol: "AEGISLOG" },
  ],
  "NIFTY INFRASTRUCTURE": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "BHARTIARTL", symbol: "BHARTIARTL" },
    { name: "LT", symbol: "LT" },
    { name: "ONGC", symbol: "ONGC" },
    { name: "INDIGO", symbol: "INDIGO" },
    { name: "DLF", symbol: "DLF" },
    { name: "POWERGRID", symbol: "POWERGRID" },
    { name: "ASHOKLEY", symbol: "ASHOKLEY" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "ADANIPORTS", symbol: "ADANIPORTS" },
    { name: "IOC", symbol: "IOC" },
    { name: "APOLLOHOSP", symbol: "APOLLOHOSP" },
    { name: "ULTRACEMCO", symbol: "ULTRACEMCO" },
    { name: "GAIL", symbol: "GAIL" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "CUMMINSIND", symbol: "CUMMINSIND" },
    { name: "MAXHEALTH", symbol: "MAXHEALTH" },
    { name: "GODREJPROP", symbol: "GODREJPROP" },
    { name: "BHARATFORG", symbol: "BHARATFORG" },
    { name: "SUZLON", symbol: "SUZLON" },
    { name: "HINDPETRO", symbol: "HINDPETRO" },
    { name: "CGPOWER", symbol: "CGPOWER" },
    { name: "GRASIM", symbol: "GRASIM" },
    { name: "INDUSTOWER", symbol: "INDUSTOWER" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "INDHOTEL", symbol: "INDHOTEL" },
    { name: "MOTHERSON", symbol: "MOTHERSON" },
    { name: "ADANIGREEN", symbol: "ADANIGREEN" },
    { name: "AMBUJACEM", symbol: "AMBUJACEM" },
    { name: "SHREECEM", symbol: "SHREECEM" },
  ],
  "NIFTY INDIA DEFENCE": [
    { name: "PARAS", symbol: "PARAS" },
    { name: "BEL", symbol: "BEL" },
    { name: "HAL", symbol: "HAL" },
    { name: "SOLARINDS", symbol: "SOLARINDS" },
    { name: "ZENTEC", symbol: "ZENTEC" },
    { name: "BHARATFORG", symbol: "BHARATFORG" },
    { name: "DATAPATTNS", symbol: "DATAPATTNS" },
    { name: "MTARTECH", symbol: "MTARTECH" },
    { name: "MAZDOCK", symbol: "MAZDOCK" },
    { name: "BDL", symbol: "BDL" },
    { name: "GRSE", symbol: "GRSE" },
    { name: "COCHINSHIP", symbol: "COCHINSHIP" },
    { name: "DYNAMATECH", symbol: "DYNAMATECH" },
    { name: "ASTRAMICRO", symbol: "ASTRAMICRO" },
    { name: "BEML", symbol: "BEML" },
    { name: "MIDHANI", symbol: "MIDHANI" },
    { name: "CYIENTDLM", symbol: "CYIENTDLM" },
    { name: "UNIMECH", symbol: "UNIMECH" },
  ],
  "NIFTY INDIA TOURISM": [
    { name: "INDIGO", symbol: "INDIGO" },
    { name: "ITCHOTELS", symbol: "ITCHOTELS" },
    { name: "INDHOTEL", symbol: "INDHOTEL" },
    { name: "JUBLFOOD", symbol: "JUBLFOOD" },
    { name: "IRCTC", symbol: "IRCTC" },
    { name: "GMRAIRPORT", symbol: "GMRAIRPORT" },
    { name: "LEMONTREE", symbol: "LEMONTREE" },
    { name: "BLS", symbol: "BLS" },
    { name: "TBOTEK", symbol: "TBOTEK" },
    { name: "DBREALTY", symbol: "DBREALTY" },
    { name: "EIHOTEL", symbol: "EIHOTEL" },
    { name: "CHALET", symbol: "CHALET" },
    { name: "THELEELA", symbol: "THELEELA" },
    { name: "DEVYANI", symbol: "DEVYANI" },
    { name: "VENTIVE", symbol: "VENTIVE" },
    { name: "SAPPHIRE", symbol: "SAPPHIRE" },
  ],
  "NIFTY CAPITAL MARKETS": [
    { name: "BSE", symbol: "BSE" },
    { name: "MCX", symbol: "MCX" },
    { name: "CDSL", symbol: "CDSL" },
    { name: "HDFCAMC", symbol: "HDFCAMC" },
    { name: "CAMS", symbol: "CAMS" },
    { name: "360ONE", symbol: "360ONE" },
    { name: "ANGELONE", symbol: "ANGELONE" },
    { name: "KFINTECH", symbol: "KFINTECH" },
    { name: "NAM-INDIA", symbol: "NAM-INDIA" },
    { name: "NUVAMA", symbol: "NUVAMA" },
    { name: "IEX", symbol: "IEX" },
    { name: "MOTILALOFS", symbol: "MOTILALOFS" },
    { name: "ANANDRATHI", symbol: "ANANDRATHI" },
    { name: "ABSLAMC", symbol: "ABSLAMC" },
    { name: "UTIAMC", symbol: "UTIAMC" },
  ],
  "NIFTY EV & NEW AGE AUTOMOTIVE": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "M&M", symbol: "M&M" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "TMPV", symbol: "TMPV" },
    { name: "ASHOKLEY", symbol: "ASHOKLEY" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "OLAELEC", symbol: "OLAELEC" },
    { name: "FORCEMOT", symbol: "FORCEMOT" },
    { name: "BHARATFORG", symbol: "BHARATFORG" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "KEI", symbol: "KEI" },
    { name: "CGPOWER", symbol: "CGPOWER" },
    { name: "HEROMOTOCO", symbol: "HEROMOTOCO" },
    { name: "MOTHERSON", symbol: "MOTHERSON" },
    { name: "HYUNDAI", symbol: "HYUNDAI" },
    { name: "BOSCHLTD", symbol: "BOSCHLTD" },
    { name: "UNOMINDA", symbol: "UNOMINDA" },
    { name: "TIINDIA", symbol: "TIINDIA" },
    { name: "KPITTECH", symbol: "KPITTECH" },
    { name: "TATAELXSI", symbol: "TATAELXSI" },
    { name: "ATHERENERG", symbol: "ATHERENERG" },
    { name: "HSCL", symbol: "HSCL" },
    { name: "SONACOMS", symbol: "SONACOMS" },
    { name: "SCHAEFFLER", symbol: "SCHAEFFLER" },
    { name: "TATATECH", symbol: "TATATECH" },
    { name: "OLECTRA", symbol: "OLECTRA" },
    { name: "EXIDEIND", symbol: "EXIDEIND" },
    { name: "TATACHEM", symbol: "TATACHEM" },
    { name: "ARE&M", symbol: "ARE&M" },
    { name: "JWL", symbol: "JWL" },
    { name: "LTTS", symbol: "LTTS" },
    { name: "FLUOROCHEM", symbol: "FLUOROCHEM" },
    { name: "MSUMI", symbol: "MSUMI" },
    { name: "JBMA", symbol: "JBMA" },
  ],
  "NIFTY MOBILITY": [
    { name: "RELIANCE", symbol: "RELIANCE" },
    { name: "M&M", symbol: "M&M" },
    { name: "INDIGO", symbol: "INDIGO" },
    { name: "ETERNAL", symbol: "ETERNAL" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "TMPV", symbol: "TMPV" },
    { name: "PETRONET", symbol: "PETRONET" },
    { name: "ASHOKLEY", symbol: "ASHOKLEY" },
    { name: "SWIGGY", symbol: "SWIGGY" },
    { name: "BPCL", symbol: "BPCL" },
    { name: "ADANIPORTS", symbol: "ADANIPORTS" },
    { name: "IOC", symbol: "IOC" },
    { name: "GAIL", symbol: "GAIL" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "BHARATFORG", symbol: "BHARATFORG" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "HINDPETRO", symbol: "HINDPETRO" },
    { name: "HEROMOTOCO", symbol: "HEROMOTOCO" },
    { name: "MOTHERSON", symbol: "MOTHERSON" },
    { name: "HYUNDAI", symbol: "HYUNDAI" },
    { name: "BOSCHLTD", symbol: "BOSCHLTD" },
    { name: "IRCTC", symbol: "IRCTC" },
    { name: "TIINDIA", symbol: "TIINDIA" },
    { name: "MRF", symbol: "MRF" },
    { name: "GMRAIRPORT", symbol: "GMRAIRPORT" },
    { name: "CONCOR", symbol: "CONCOR" },
    { name: "SONACOMS", symbol: "SONACOMS" },
    { name: "BALKRISIND", symbol: "BALKRISIND" },
    { name: "ATGL", symbol: "ATGL" },
  ],
  "NIFTY RURAL": [
    { name: "BHARTIARTL", symbol: "BHARTIARTL" },
    { name: "SBIN", symbol: "SBIN" },
    { name: "M&M", symbol: "M&M" },
    { name: "MARUTI", symbol: "MARUTI" },
    { name: "DIXON", symbol: "DIXON" },
    { name: "SHRIRAMFIN", symbol: "SHRIRAMFIN" },
    { name: "BAJFINANCE", symbol: "BAJFINANCE" },
    { name: "ITC", symbol: "ITC" },
    { name: "TMPV", symbol: "TMPV" },
    { name: "HINDUNILVR", symbol: "HINDUNILVR" },
    { name: "ASHOKLEY", symbol: "ASHOKLEY" },
    { name: "BANKBARODA", symbol: "BANKBARODA" },
    { name: "IDEA", symbol: "IDEA" },
    { name: "ULTRACEMCO", symbol: "ULTRACEMCO" },
    { name: "TVSMOTOR", symbol: "TVSMOTOR" },
    { name: "EICHERMOT", symbol: "EICHERMOT" },
    { name: "NTPC", symbol: "NTPC" },
    { name: "CUMMINSIND", symbol: "CUMMINSIND" },
    { name: "HDFCLIFE", symbol: "HDFCLIFE" },
    { name: "ASIANPAINT", symbol: "ASIANPAINT" },
    { name: "BAJAJ-AUTO", symbol: "BAJAJ-AUTO" },
    { name: "PNB", symbol: "PNB" },
    { name: "INDIANB", symbol: "INDIANB" },
    { name: "MUTHOOTFIN", symbol: "MUTHOOTFIN" },
    { name: "HEROMOTOCO", symbol: "HEROMOTOCO" },
    { name: "GRASIM", symbol: "GRASIM" },
    { name: "TORNTPOWER", symbol: "TORNTPOWER" },
    { name: "CHOLAFIN", symbol: "CHOLAFIN" },
    { name: "ADANIPOWER", symbol: "ADANIPOWER" },
    { name: "BANKINDIA", symbol: "BANKINDIA" },
    { name: "UPL", symbol: "UPL" },
    { name: "TATAPOWER", symbol: "TATAPOWER" },
    { name: "GODREJCP", symbol: "GODREJCP" },
    { name: "HYUNDAI", symbol: "HYUNDAI" },
    { name: "SBILIFE", symbol: "SBILIFE" },
    { name: "BRITANNIA", symbol: "BRITANNIA" },
    { name: "ADANIGREEN", symbol: "ADANIGREEN" },
    { name: "IRCTC", symbol: "IRCTC" },
    { name: "BANDHANBNK", symbol: "BANDHANBNK" },
    { name: "SUPREMEIND", symbol: "SUPREMEIND" },
    { name: "NESTLEIND", symbol: "NESTLEIND" },
    { name: "NHPC", symbol: "NHPC" },
    { name: "TATACONSUM", symbol: "TATACONSUM" },
    { name: "HAVELLS", symbol: "HAVELLS" },
    { name: "MFSL", symbol: "MFSL" },
    { name: "POONAWALLA", symbol: "POONAWALLA" },
    { name: "PATANJALI", symbol: "PATANJALI" },
    { name: "AMBUJACEM", symbol: "AMBUJACEM" },
    { name: "LICI", symbol: "LICI" },
    { name: "COROMANDEL", symbol: "COROMANDEL" },
    { name: "VOLTAS", symbol: "VOLTAS" },
    { name: "SHREECEM", symbol: "SHREECEM" },
    { name: "SUNDARMFIN", symbol: "SUNDARMFIN" },
    { name: "LICHSGFIN", symbol: "LICHSGFIN" },
    { name: "MARICO", symbol: "MARICO" },
    { name: "DABUR", symbol: "DABUR" },
    { name: "BLUESTARCO", symbol: "BLUESTARCO" },
    { name: "SBICARD", symbol: "SBICARD" },
    { name: "ASTRAL", symbol: "ASTRAL" },
    { name: "JSWENERGY", symbol: "JSWENERGY" },
    { name: "PIIND", symbol: "PIIND" },
    { name: "CROMPTON", symbol: "CROMPTON" },
    { name: "M&MFIN", symbol: "M&MFIN" },
    { name: "PNBHOUSING", symbol: "PNBHOUSING" },
    { name: "COLPAL", symbol: "COLPAL" },
    { name: "ICICIPRULI", symbol: "ICICIPRULI" },
    { name: "ZEEL", symbol: "ZEEL" },
    { name: "ACC", symbol: "ACC" },
    { name: "DALBHARAT", symbol: "DALBHARAT" },
    { name: "TATACOMM", symbol: "TATACOMM" },
    { name: "JKCEMENT", symbol: "JKCEMENT" },
    { name: "ESCORTS", symbol: "ESCORTS" },
    { name: "BERGEPAINT", symbol: "BERGEPAINT" },
    { name: "EMAMILTD", symbol: "EMAMILTD" },
    { name: "ELGIEQUIP", symbol: "ELGIEQUIP" },
  ],
};

// ─── STOCK TO INDICES MAP ────────────────────────────────────────────────────────
const STOCK_TO_INDICES: Record<string, string[]> = {
  TEJASNET: ["NIFTY TOTAL MARKET"],
  RELIANCE: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  BHARTIARTL: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  HDFCBANK: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY PRIVATE BANK",
  ],
  LT: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY INFRASTRUCTURE"],
  ICICIBANK: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY PRIVATE BANK",
  ],
  INFY: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY IT"],
  PARAS: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  SBIN: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY PSU BANK",
    "NIFTY RURAL",
  ],
  BEL: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY INDIA DEFENCE"],
  ONGC: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
  ],
  "M&M": [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  TATASTEEL: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY METAL",
    "NIFTY COMMODITIES",
  ],
  NETWEB: ["NIFTY TOTAL MARKET"],
  BSE: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  INDIGO: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
    "NIFTY INDIA TOURISM",
    "NIFTY MOBILITY",
  ],
  ETERNAL: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY MOBILITY",
  ],
  VEDL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY METAL",
    "NIFTY COMMODITIES",
  ],
  OIL: [
    "NIFTY TOTAL MARKET",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
  ],
  MARUTI: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  HAL: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY INDIA DEFENCE"],
  HINDCOPPER: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  NATIONALUM: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  DIXON: [
    "NIFTY TOTAL MARKET",
    "NIFTY CONSUMER DURABLES",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  SOLARINDS: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY INDIA DEFENCE"],
  SHRIRAMFIN: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY RURAL"],
  TCS: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY IT"],
  SUNPHARMA: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  BAJFINANCE: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY RURAL"],
  DLF: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY REALTY",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
  ],
  POWERGRID: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
  ],
  COALINDIA: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
  ],
  SAGILITY: ["NIFTY TOTAL MARKET"],
  AXISBANK: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY PRIVATE BANK",
  ],
  CHENNPETRO: ["NIFTY TOTAL MARKET"],
  ITC: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  KOTAKBANK: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY PRIVATE BANK",
  ],
  MCX: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  HINDALCO: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY METAL",
    "NIFTY COMMODITIES",
  ],
  TMPV: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  HINDUNILVR: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  PETRONET: [
    "NIFTY TOTAL MARKET",
    "NIFTY OIL & GAS",
    "NIFTY ENERGY",
    "NIFTY MOBILITY",
  ],
  ASHOKLEY: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY INFRASTRUCTURE",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  SAIL: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  SWIGGY: ["NIFTY TOTAL MARKET", "NIFTY MOBILITY"],
  CANBK: [
    "NIFTY TOTAL MARKET",
    "NIFTY BANK",
    "NIFTY NEXT 50",
    "NIFTY PSU BANK",
  ],
  BANKBARODA: [
    "NIFTY TOTAL MARKET",
    "NIFTY BANK",
    "NIFTY NEXT 50",
    "NIFTY PSU BANK",
    "NIFTY RURAL",
  ],
  BPCL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY MOBILITY",
  ],
  ADANIPORTS: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY INFRASTRUCTURE",
    "NIFTY MOBILITY",
  ],
  IDEA: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  IOC: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY MOBILITY",
  ],
  APOLLOHOSP: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY HEALTHCARE INDEX",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
  ],
  ULTRACEMCO: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY COMMODITIES",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  ZENTEC: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  GAIL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY OIL & GAS",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY MOBILITY",
  ],
  UNIONBANK: ["NIFTY TOTAL MARKET", "NIFTY BANK", "NIFTY PSU BANK"],
  TVSMOTOR: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  EICHERMOT: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  KAYNES: ["NIFTY TOTAL MARKET"],
  HINDZINC: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY METAL"],
  HCLTECH: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY IT"],
  OLAELEC: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  PAYTM: ["NIFTY TOTAL MARKET"],
  TITAN: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY CONSUMER DURABLES",
    "NIFTY INDIA CONSUMPTION",
  ],
  PFC: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  NTPC: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  CUMMINSIND: ["NIFTY TOTAL MARKET", "NIFTY INFRASTRUCTURE", "NIFTY RURAL"],
  BAJAJFINSV: ["NIFTY TOTAL MARKET", "NIFTY 50"],
  HDFCLIFE: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY RURAL"],
  POLYCAB: ["NIFTY TOTAL MARKET"],
  BHEL: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  POWERINDIA: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  WIPRO: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY IT"],
  RECLTD: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  ASIANPAINT: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  VBL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
  ],
  COFORGE: ["NIFTY TOTAL MARKET", "NIFTY IT"],
  MAXHEALTH: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY HEALTHCARE INDEX",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
  ],
  FORCEMOT: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  PRAJIND: ["NIFTY TOTAL MARKET"],
  JINDALSTEL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY METAL",
    "NIFTY COMMODITIES",
  ],
  "GVT&D": ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  GODREJPROP: ["NIFTY TOTAL MARKET", "NIFTY REALTY", "NIFTY INFRASTRUCTURE"],
  JIOFIN: ["NIFTY TOTAL MARKET", "NIFTY 50"],
  BALRAMCHIN: ["NIFTY TOTAL MARKET"],
  PERSISTENT: ["NIFTY TOTAL MARKET", "NIFTY IT"],
  VMM: ["NIFTY TOTAL MARKET"],
  ADANIENT: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY METAL"],
  IRFC: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  LODHA: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY REALTY"],
  BHARATFORG: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY INFRASTRUCTURE",
    "NIFTY INDIA DEFENCE",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  CDSL: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  DATAPATTNS: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  LUPIN: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  "BAJAJ-AUTO": [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  PNB: [
    "NIFTY TOTAL MARKET",
    "NIFTY BANK",
    "NIFTY NEXT 50",
    "NIFTY PSU BANK",
    "NIFTY RURAL",
  ],
  TRENT: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY INDIA CONSUMPTION"],
  NATCOPHARM: ["NIFTY TOTAL MARKET"],
  SUZLON: ["NIFTY TOTAL MARKET", "NIFTY ENERGY", "NIFTY INFRASTRUCTURE"],
  IDFCFIRSTB: ["NIFTY TOTAL MARKET", "NIFTY BANK", "NIFTY PRIVATE BANK"],
  WAAREEENER: ["NIFTY TOTAL MARKET"],
  KEI: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  INDIANB: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK", "NIFTY RURAL"],
  RVNL: ["NIFTY TOTAL MARKET"],
  SUNDRMFAST: ["NIFTY TOTAL MARKET"],
  HINDPETRO: [
    "NIFTY TOTAL MARKET",
    "NIFTY OIL & GAS",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY MOBILITY",
  ],
  CGPOWER: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
  ],
  CIPLA: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  HDFCAMC: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  MTARTECH: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  MUTHOOTFIN: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  FEDERALBNK: ["NIFTY TOTAL MARKET", "NIFTY BANK", "NIFTY PRIVATE BANK"],
  HEROMOTOCO: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  GRASIM: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY COMMODITIES",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  TORNTPOWER: [
    "NIFTY TOTAL MARKET",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY RURAL",
  ],
  CHOLAFIN: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY RURAL"],
  MRPL: ["NIFTY TOTAL MARKET"],
  TECHM: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY IT"],
  DRREDDY: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  NMDC: ["NIFTY TOTAL MARKET", "NIFTY METAL", "NIFTY COMMODITIES"],
  MAHABANK: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK"],
  INDUSTOWER: ["NIFTY TOTAL MARKET", "NIFTY INFRASTRUCTURE"],
  ITCHOTELS: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  INDUSINDBK: ["NIFTY TOTAL MARKET", "NIFTY BANK", "NIFTY PRIVATE BANK"],
  DIVISLAB: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  ADANIPOWER: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY ENERGY",
    "NIFTY RURAL",
  ],
  DMART: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY INDIA CONSUMPTION"],
  AMBER: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  LTF: ["NIFTY TOTAL MARKET"],
  BANKINDIA: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK", "NIFTY RURAL"],
  AUBANK: ["NIFTY TOTAL MARKET", "NIFTY BANK"],
  IDBI: ["NIFTY TOTAL MARKET"],
  YESBANK: ["NIFTY TOTAL MARKET", "NIFTY BANK", "NIFTY PRIVATE BANK"],
  UPL: ["NIFTY TOTAL MARKET", "NIFTY COMMODITIES", "NIFTY RURAL"],
  POLYMED: ["NIFTY TOTAL MARKET"],
  MAZDOCK: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY INDIA DEFENCE"],
  RBLBANK: ["NIFTY TOTAL MARKET", "NIFTY PRIVATE BANK"],
  POLICYBZR: ["NIFTY TOTAL MARKET"],
  TATAPOWER: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  JSWSTEEL: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY METAL",
    "NIFTY COMMODITIES",
  ],
  INDHOTEL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY INFRASTRUCTURE",
    "NIFTY INDIA TOURISM",
  ],
  GODREJCP: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  MOTHERSON: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY AUTO",
    "NIFTY INFRASTRUCTURE",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  CAMS: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  HYUNDAI: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  BDL: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  JUBLFOOD: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  ABCAPITAL: ["NIFTY TOTAL MARKET"],
  FORTIS: ["NIFTY TOTAL MARKET", "NIFTY HEALTHCARE INDEX"],
  RPOWER: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  SBILIFE: ["NIFTY TOTAL MARKET", "NIFTY 50", "NIFTY RURAL"],
  TORNTPHARM: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  KARURVYSYA: ["NIFTY TOTAL MARKET"],
  APARINDS: ["NIFTY TOTAL MARKET"],
  NEWGEN: ["NIFTY TOTAL MARKET"],
  MANAPPURAM: ["NIFTY TOTAL MARKET"],
  NAUKRI: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY INDIA CONSUMPTION"],
  BRITANNIA: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  ADANIGREEN: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  BOSCHLTD: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  ADANIENSOL: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
  ],
  SAMMAANCAP: ["NIFTY TOTAL MARKET"],
  REDINGTON: ["NIFTY TOTAL MARKET"],
  IRCTC: [
    "NIFTY TOTAL MARKET",
    "NIFTY INDIA TOURISM",
    "NIFTY MOBILITY",
    "NIFTY RURAL",
  ],
  ABB: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY ENERGY"],
  PIDILITIND: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY COMMODITIES"],
  PGEL: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  STLTECH: ["NIFTY TOTAL MARKET"],
  BANDHANBNK: ["NIFTY TOTAL MARKET", "NIFTY PRIVATE BANK", "NIFTY RURAL"],
  LAURUSLABS: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  JKTYRE: ["NIFTY TOTAL MARKET"],
  MPHASIS: ["NIFTY TOTAL MARKET", "NIFTY IT"],
  MANKIND: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  UNOMINDA: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
  ],
  NAVINFLUOR: ["NIFTY TOTAL MARKET"],
  TIINDIA: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  ENRIN: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY ENERGY"],
  KRN: ["NIFTY TOTAL MARKET"],
  SUPREMEIND: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  GRSE: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  NESTLEIND: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  NHPC: [
    "NIFTY TOTAL MARKET",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY RURAL",
  ],
  RAIN: ["NIFTY TOTAL MARKET"],
  TATACONSUM: [
    "NIFTY TOTAL MARKET",
    "NIFTY 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  SIEMENS: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY ENERGY"],
  MRF: ["NIFTY TOTAL MARKET", "NIFTY MOBILITY"],
  GMRAIRPORT: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM", "NIFTY MOBILITY"],
  ICICIGI: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  KALYANKJIL: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  AVANTIFEED: ["NIFTY TOTAL MARKET"],
  "360ONE": ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  APLAPOLLO: ["NIFTY TOTAL MARKET", "NIFTY METAL", "NIFTY COMMODITIES"],
  ANANTRAJ: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  KPITTECH: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  HAVELLS: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY CONSUMER DURABLES",
    "NIFTY INDIA CONSUMPTION",
    "NIFTY RURAL",
  ],
  ANGELONE: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  TARIL: ["NIFTY TOTAL MARKET"],
  TATAELXSI: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  ECLERX: ["NIFTY TOTAL MARKET"],
  MGL: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  GUJGASLTD: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  GMDCLTD: ["NIFTY TOTAL MARKET"],
  SCI: ["NIFTY TOTAL MARKET"],
  IREDA: ["NIFTY TOTAL MARKET"],
  RENUKA: ["NIFTY TOTAL MARKET"],
  MFSL: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  POONAWALLA: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  COCHINSHIP: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  OBEROIRLTY: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  PRESTIGE: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  NBCC: ["NIFTY TOTAL MARKET"],
  ZYDUSLIFE: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY PHARMA",
    "NIFTY HEALTHCARE INDEX",
  ],
  PATANJALI: ["NIFTY TOTAL MARKET", "NIFTY FMCG", "NIFTY RURAL"],
  CONCOR: ["NIFTY TOTAL MARKET", "NIFTY MOBILITY"],
  ATHERENERG: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  UNITDSPR: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY FMCG",
    "NIFTY INDIA CONSUMPTION",
  ],
  BIOCON: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  AMBUJACEM: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  AUROPHARMA: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  GRAPHITE: ["NIFTY TOTAL MARKET"],
  TRIVENI: ["NIFTY TOTAL MARKET"],
  KTKBANK: ["NIFTY TOTAL MARKET"],
  ENGINERSIN: ["NIFTY TOTAL MARKET"],
  CARTRADE: ["NIFTY TOTAL MARKET"],
  ACUTAAS: ["NIFTY TOTAL MARKET"],
  WOCKPHARMA: ["NIFTY TOTAL MARKET", "NIFTY PHARMA"],
  UJJIVANSFB: ["NIFTY TOTAL MARKET"],
  KFINTECH: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  LICI: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY RURAL"],
  NYKAA: ["NIFTY TOTAL MARKET"],
  COROMANDEL: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  SYRMA: ["NIFTY TOTAL MARKET"],
  VOLTAS: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES", "NIFTY RURAL"],
  "NAM-INDIA": ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  SRF: ["NIFTY TOTAL MARKET", "NIFTY COMMODITIES"],
  SHREECEM: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY INFRASTRUCTURE",
    "NIFTY RURAL",
  ],
  "J&KBANK": ["NIFTY TOTAL MARKET"],
  SUNDARMFIN: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  LICHSGFIN: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  TDPOWERSYS: ["NIFTY TOTAL MARKET"],
  SOUTHBANK: ["NIFTY TOTAL MARKET"],
  MARICO: ["NIFTY TOTAL MARKET", "NIFTY FMCG", "NIFTY RURAL"],
  NUVAMA: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  JSL: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  GODFRYPHLP: ["NIFTY TOTAL MARKET"],
  HSCL: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  GLENMARK: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  DABUR: ["NIFTY TOTAL MARKET", "NIFTY FMCG", "NIFTY RURAL"],
  HFCL: ["NIFTY TOTAL MARKET"],
  LTM: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50", "NIFTY IT"],
  BLUESTARCO: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES", "NIFTY RURAL"],
  OFSS: ["NIFTY TOTAL MARKET", "NIFTY IT"],
  INOXWIND: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  CREDITACC: ["NIFTY TOTAL MARKET"],
  GESHIP: ["NIFTY TOTAL MARKET"],
  HBLENGINE: ["NIFTY TOTAL MARKET"],
  SBICARD: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  LALPATHLAB: ["NIFTY TOTAL MARKET"],
  SAILIFE: ["NIFTY TOTAL MARKET"],
  IFCI: ["NIFTY TOTAL MARKET"],
  RADICO: ["NIFTY TOTAL MARKET", "NIFTY FMCG"],
  ASTRAL: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  FINCABLES: ["NIFTY TOTAL MARKET"],
  IGL: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  JAMNAAUTO: ["NIFTY TOTAL MARKET"],
  JSWENERGY: [
    "NIFTY TOTAL MARKET",
    "NIFTY NEXT 50",
    "NIFTY COMMODITIES",
    "NIFTY ENERGY",
    "NIFTY RURAL",
  ],
  CUB: ["NIFTY TOTAL MARKET"],
  PAGEIND: ["NIFTY TOTAL MARKET"],
  ABBOTINDIA: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  IIFL: ["NIFTY TOTAL MARKET"],
  DYNAMATECH: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  PIIND: ["NIFTY TOTAL MARKET", "NIFTY COMMODITIES", "NIFTY RURAL"],
  BELRISE: ["NIFTY TOTAL MARKET"],
  PREMIERENE: ["NIFTY TOTAL MARKET"],
  ABLBL: ["NIFTY TOTAL MARKET"],
  CROMPTON: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES", "NIFTY RURAL"],
  TITAGARH: ["NIFTY TOTAL MARKET"],
  LUMAXTECH: ["NIFTY TOTAL MARKET"],
  PHOENIXLTD: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  HUDCO: ["NIFTY TOTAL MARKET"],
  "M&MFIN": ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  HEG: ["NIFTY TOTAL MARKET"],
  AWL: ["NIFTY TOTAL MARKET"],
  IEX: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  EIDPARRY: ["NIFTY TOTAL MARKET"],
  PNBHOUSING: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  IIFLCAPS: ["NIFTY TOTAL MARKET"],
  RELIGARE: ["NIFTY TOTAL MARKET"],
  COLPAL: ["NIFTY TOTAL MARKET", "NIFTY FMCG", "NIFTY RURAL"],
  EDELWEISS: ["NIFTY TOTAL MARKET"],
  MOTILALOFS: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  WELCORP: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  SONACOMS: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
    "NIFTY MOBILITY",
  ],
  BAJAJHLDNG: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  FSL: ["NIFTY TOTAL MARKET"],
  PARADEEP: ["NIFTY TOTAL MARKET"],
  ANANDRATHI: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  ICICIPRULI: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  SCHAEFFLER: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  BAJAJHFL: ["NIFTY TOTAL MARKET", "NIFTY NEXT 50"],
  ASTRAMICRO: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  GRANULES: ["NIFTY TOTAL MARKET"],
  KAJARIACER: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  TATATECH: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  THANGAMAYL: ["NIFTY TOTAL MARKET"],
  CENTRALBK: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK"],
  LEMONTREE: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  GPIL: ["NIFTY TOTAL MARKET"],
  AFFLE: ["NIFTY TOTAL MARKET"],
  NCC: ["NIFTY TOTAL MARKET"],
  HOMEFIRST: ["NIFTY TOTAL MARKET"],
  ANURAS: ["NIFTY TOTAL MARKET"],
  JSWINFRA: ["NIFTY TOTAL MARKET"],
  JPPOWER: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  DCBBANK: ["NIFTY TOTAL MARKET"],
  CEATLTD: ["NIFTY TOTAL MARKET"],
  ALKEM: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  BSOFT: ["NIFTY TOTAL MARKET"],
  ASTERDM: ["NIFTY TOTAL MARKET"],
  NH: ["NIFTY TOTAL MARKET"],
  YATHARTH: ["NIFTY TOTAL MARKET"],
  APTUS: ["NIFTY TOTAL MARKET"],
  DELHIVERY: ["NIFTY TOTAL MARKET"],
  PTCIL: ["NIFTY TOTAL MARKET"],
  VOLTAMP: ["NIFTY TOTAL MARKET"],
  ZEEL: ["NIFTY TOTAL MARKET", "NIFTY MEDIA", "NIFTY RURAL"],
  SWANCORP: ["NIFTY TOTAL MARKET"],
  CHOLAHLDNG: ["NIFTY TOTAL MARKET"],
  LLOYDSME: ["NIFTY TOTAL MARKET", "NIFTY METAL"],
  GOKEX: ["NIFTY TOTAL MARKET"],
  BEML: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  OLECTRA: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  RAILTEL: ["NIFTY TOTAL MARKET"],
  KIRLOSENG: ["NIFTY TOTAL MARKET"],
  AARTIIND: ["NIFTY TOTAL MARKET"],
  APOLLOTYRE: ["NIFTY TOTAL MARKET"],
  JMFINANCIL: ["NIFTY TOTAL MARKET"],
  EXIDEIND: [
    "NIFTY TOTAL MARKET",
    "NIFTY AUTO",
    "NIFTY EV & NEW AGE AUTOMOTIVE",
  ],
  RRKABEL: ["NIFTY TOTAL MARKET"],
  ACC: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  SHAKTIPUMP: ["NIFTY TOTAL MARKET"],
  IRB: ["NIFTY TOTAL MARKET"],
  CHAMBLFERT: ["NIFTY TOTAL MARKET"],
  IRCON: ["NIFTY TOTAL MARKET"],
  DALBHARAT: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  NLCINDIA: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  GABRIEL: ["NIFTY TOTAL MARKET"],
  SHARDACROP: ["NIFTY TOTAL MARKET"],
  JINDALSAW: ["NIFTY TOTAL MARKET"],
  EQUITASBNK: ["NIFTY TOTAL MARKET"],
  AZAD: ["NIFTY TOTAL MARKET"],
  AADHARHFC: ["NIFTY TOTAL MARKET"],
  JBCHEPHARM: ["NIFTY TOTAL MARKET", "NIFTY PHARMA"],
  STAR: ["NIFTY TOTAL MARKET"],
  IKS: ["NIFTY TOTAL MARKET"],
  IOB: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK"],
  TRANSRAILL: ["NIFTY TOTAL MARKET"],
  SYNGENE: ["NIFTY TOTAL MARKET", "NIFTY HEALTHCARE INDEX"],
  SANDUMA: ["NIFTY TOTAL MARKET"],
  IGIL: ["NIFTY TOTAL MARKET"],
  WABAG: ["NIFTY TOTAL MARKET"],
  HEXT: ["NIFTY TOTAL MARKET"],
  CASTROLIND: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  PVRINOX: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  KPIGREEN: ["NIFTY TOTAL MARKET"],
  SHAILY: ["NIFTY TOTAL MARKET"],
  FIRSTCRY: ["NIFTY TOTAL MARKET"],
  UCOBANK: ["NIFTY TOTAL MARKET", "NIFTY PSU BANK"],
  TATACHEM: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  SANSERA: ["NIFTY TOTAL MARKET"],
  FIVESTAR: ["NIFTY TOTAL MARKET"],
  PRIVISCL: ["NIFTY TOTAL MARKET"],
  NEULANDLAB: ["NIFTY TOTAL MARKET"],
  GSPL: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  SHYAMMETL: ["NIFTY TOTAL MARKET"],
  BATAINDIA: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  TATACOMM: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  BALUFORGE: ["NIFTY TOTAL MARKET"],
  EMCURE: ["NIFTY TOTAL MARKET"],
  PCJEWELLER: ["NIFTY TOTAL MARKET"],
  GRWRHITECH: ["NIFTY TOTAL MARKET"],
  HCC: ["NIFTY TOTAL MARKET"],
  NAZARA: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  IXIGO: ["NIFTY TOTAL MARKET"],
  "ARE&M": ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  SIGNATURE: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  PPLPHARMA: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  SARDAEN: ["NIFTY TOTAL MARKET"],
  JWL: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  CMSINFO: ["NIFTY TOTAL MARKET"],
  SJVN: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  BLS: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  LTTS: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  ZENSARTECH: ["NIFTY TOTAL MARKET"],
  MOIL: ["NIFTY TOTAL MARKET"],
  ENDURANCE: ["NIFTY TOTAL MARKET"],
  INDIAMART: ["NIFTY TOTAL MARKET"],
  BLACKBUCK: ["NIFTY TOTAL MARKET"],
  JKCEMENT: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  ZAGGLE: ["NIFTY TOTAL MARKET"],
  KSB: ["NIFTY TOTAL MARKET"],
  AETHER: ["NIFTY TOTAL MARKET"],
  ABSLAMC: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  BALKRISIND: ["NIFTY TOTAL MARKET", "NIFTY MOBILITY"],
  PRICOLLTD: ["NIFTY TOTAL MARKET"],
  ATGL: [
    "NIFTY TOTAL MARKET",
    "NIFTY OIL & GAS",
    "NIFTY ENERGY",
    "NIFTY MOBILITY",
  ],
  DEEPAKNTR: ["NIFTY TOTAL MARKET"],
  ONESOURCE: ["NIFTY TOTAL MARKET"],
  WEBELSOLAR: ["NIFTY TOTAL MARKET"],
  CRAFTSMAN: ["NIFTY TOTAL MARKET"],
  BIRLACORPN: ["NIFTY TOTAL MARKET"],
  SENCO: ["NIFTY TOTAL MARKET"],
  PCBL: ["NIFTY TOTAL MARKET"],
  SHRIPISTON: ["NIFTY TOTAL MARKET"],
  LLOYDSENT: ["NIFTY TOTAL MARKET"],
  CHOICEIN: ["NIFTY TOTAL MARKET"],
  AJANTPHARM: ["NIFTY TOTAL MARKET", "NIFTY PHARMA"],
  KRBL: ["NIFTY TOTAL MARKET"],
  SAMHI: ["NIFTY TOTAL MARKET"],
  BRIGADE: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  JYOTICNC: ["NIFTY TOTAL MARKET"],
  TIMETECHNO: ["NIFTY TOTAL MARKET"],
  INOXGREEN: ["NIFTY TOTAL MARKET"],
  CESC: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  GREAVESCOT: ["NIFTY TOTAL MARKET"],
  RELINFRA: ["NIFTY TOTAL MARKET"],
  SKYGOLD: ["NIFTY TOTAL MARKET"],
  SWSOLAR: ["NIFTY TOTAL MARKET"],
  TECHNOE: ["NIFTY TOTAL MARKET"],
  AEGISVOPAK: ["NIFTY TOTAL MARKET"],
  CYIENT: ["NIFTY TOTAL MARKET"],
  JAIBALAJI: ["NIFTY TOTAL MARKET"],
  AAVAS: ["NIFTY TOTAL MARKET"],
  GRAVITA: ["NIFTY TOTAL MARKET"],
  TATAINVEST: ["NIFTY TOTAL MARKET"],
  GPPL: ["NIFTY TOTAL MARKET"],
  KEC: ["NIFTY TOTAL MARKET"],
  LINDEINDIA: ["NIFTY TOTAL MARKET"],
  RBA: ["NIFTY TOTAL MARKET"],
  KSCL: ["NIFTY TOTAL MARKET"],
  RAINBOW: ["NIFTY TOTAL MARKET"],
  BLUEJET: ["NIFTY TOTAL MARKET"],
  FLUOROCHEM: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  PATELENG: ["NIFTY TOTAL MARKET"],
  WAAREERTL: ["NIFTY TOTAL MARKET"],
  AURIONPRO: ["NIFTY TOTAL MARKET"],
  SONATSOFTW: ["NIFTY TOTAL MARKET"],
  KNRCON: ["NIFTY TOTAL MARKET"],
  NTPCGREEN: ["NIFTY TOTAL MARKET"],
  TEXRAIL: ["NIFTY TOTAL MARKET"],
  JSWCEMENT: ["NIFTY TOTAL MARKET"],
  INTELLECT: ["NIFTY TOTAL MARKET"],
  DEEPAKFERT: ["NIFTY TOTAL MARKET"],
  SUNTV: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  ASHOKA: ["NIFTY TOTAL MARKET"],
  WHIRLPOOL: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  UBL: ["NIFTY TOTAL MARKET", "NIFTY FMCG"],
  UTIAMC: ["NIFTY TOTAL MARKET", "NIFTY CAPITAL MARKETS"],
  SYMPHONY: ["NIFTY TOTAL MARKET"],
  ACE: ["NIFTY TOTAL MARKET"],
  PTC: ["NIFTY TOTAL MARKET"],
  CEMPRO: ["NIFTY TOTAL MARKET"],
  INDGN: ["NIFTY TOTAL MARKET"],
  ZFCVINDIA: ["NIFTY TOTAL MARKET"],
  HAPPSTMNDS: ["NIFTY TOTAL MARKET"],
  GLAND: ["NIFTY TOTAL MARKET", "NIFTY PHARMA"],
  ESCORTS: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  LTFOODS: ["NIFTY TOTAL MARKET"],
  MAPMYINDIA: ["NIFTY TOTAL MARKET"],
  WELSPUNLIV: ["NIFTY TOTAL MARKET"],
  ABDL: ["NIFTY TOTAL MARKET"],
  NAVA: ["NIFTY TOTAL MARKET"],
  BERGEPAINT: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  V2RETAIL: ["NIFTY TOTAL MARKET"],
  EMAMILTD: ["NIFTY TOTAL MARKET", "NIFTY FMCG", "NIFTY RURAL"],
  GSFC: ["NIFTY TOTAL MARKET"],
  BHARTIHEXA: ["NIFTY TOTAL MARKET"],
  "3MINDIA": ["NIFTY TOTAL MARKET"],
  ELGIEQUIP: ["NIFTY TOTAL MARKET", "NIFTY RURAL"],
  GILLETTE: ["NIFTY TOTAL MARKET"],
  CONCORDBIO: ["NIFTY TOTAL MARKET"],
  CIGNITITEC: ["NIFTY TOTAL MARKET"],
  DIACABS: ["NIFTY TOTAL MARKET"],
  COHANCE: ["NIFTY TOTAL MARKET"],
  KITEX: ["NIFTY TOTAL MARKET"],
  MSUMI: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  TI: ["NIFTY TOTAL MARKET"],
  NSLNISP: ["NIFTY TOTAL MARKET"],
  KPIL: ["NIFTY TOTAL MARKET"],
  INDIASHLTR: ["NIFTY TOTAL MARKET"],
  VTL: ["NIFTY TOTAL MARKET"],
  ABFRL: ["NIFTY TOTAL MARKET"],
  DBL: ["NIFTY TOTAL MARKET"],
  KIMS: ["NIFTY TOTAL MARKET"],
  IMFA: ["NIFTY TOTAL MARKET"],
  JBMA: ["NIFTY TOTAL MARKET", "NIFTY EV & NEW AGE AUTOMOTIVE"],
  CSBBANK: ["NIFTY TOTAL MARKET"],
  THERMAX: ["NIFTY TOTAL MARKET", "NIFTY ENERGY"],
  AARTIPHARM: ["NIFTY TOTAL MARKET"],
  AIIL: ["NIFTY TOTAL MARKET"],
  CLEAN: ["NIFTY TOTAL MARKET"],
  VIYASH: ["NIFTY TOTAL MARKET"],
  CANFINHOME: ["NIFTY TOTAL MARKET"],
  EASEMYTRIP: ["NIFTY TOTAL MARKET"],
  PNGJL: ["NIFTY TOTAL MARKET"],
  CCL: ["NIFTY TOTAL MARKET"],
  TRIDENT: ["NIFTY TOTAL MARKET"],
  "GMRP&UI": ["NIFTY TOTAL MARKET"],
  TIMKEN: ["NIFTY TOTAL MARKET"],
  ARVIND: ["NIFTY TOTAL MARKET"],
  HONASA: ["NIFTY TOTAL MARKET"],
  RITES: ["NIFTY TOTAL MARKET"],
  AEGISLOG: ["NIFTY TOTAL MARKET", "NIFTY OIL & GAS", "NIFTY ENERGY"],
  EPL: ["NIFTY TOTAL MARKET"],
  ASAHIINDIA: ["NIFTY TOTAL MARKET"],
  AVALON: ["NIFTY TOTAL MARKET"],
  TANLA: ["NIFTY TOTAL MARKET"],
  KPRMILL: ["NIFTY TOTAL MARKET"],
  JYOTHYLAB: ["NIFTY TOTAL MARKET"],
  AIAENG: ["NIFTY TOTAL MARKET"],
  CGCL: ["NIFTY TOTAL MARKET"],
  AFCONS: ["NIFTY TOTAL MARKET"],
  TEGA: ["NIFTY TOTAL MARKET"],
  RATEGAIN: ["NIFTY TOTAL MARKET"],
  GODIGIT: ["NIFTY TOTAL MARKET"],
  MANYAVAR: ["NIFTY TOTAL MARKET"],
  AGI: ["NIFTY TOTAL MARKET"],
  LLOYDSENGG: ["NIFTY TOTAL MARKET"],
  JUSTDIAL: ["NIFTY TOTAL MARKET"],
  BORORENEW: ["NIFTY TOTAL MARKET"],
  EIEL: ["NIFTY TOTAL MARKET"],
  SCHNEIDER: ["NIFTY TOTAL MARKET"],
  TBOTEK: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  JISLJALEQS: ["NIFTY TOTAL MARKET"],
  NETWORK18: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  USHAMART: ["NIFTY TOTAL MARKET"],
  MIDHANI: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  MAHSEAMLES: ["NIFTY TOTAL MARKET"],
  MEDPLUS: ["NIFTY TOTAL MARKET"],
  LATENTVIEW: ["NIFTY TOTAL MARKET"],
  MASTEK: ["NIFTY TOTAL MARKET"],
  RCF: ["NIFTY TOTAL MARKET"],
  OSWALPUMPS: ["NIFTY TOTAL MARKET"],
  TRITURBINE: ["NIFTY TOTAL MARKET"],
  HGINFRA: ["NIFTY TOTAL MARKET"],
  JKPAPER: ["NIFTY TOTAL MARKET"],
  TIPSMUSIC: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  FIEMIND: ["NIFTY TOTAL MARKET"],
  DBREALTY: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  GLAXO: ["NIFTY TOTAL MARKET"],
  LXCHEM: ["NIFTY TOTAL MARKET"],
  REFEX: ["NIFTY TOTAL MARKET"],
  IPCALAB: ["NIFTY TOTAL MARKET", "NIFTY PHARMA", "NIFTY HEALTHCARE INDEX"],
  PGIL: ["NIFTY TOTAL MARKET"],
  KIRLPNU: ["NIFTY TOTAL MARKET"],
  ABREL: ["NIFTY TOTAL MARKET"],
  BANCOINDIA: ["NIFTY TOTAL MARKET"],
  RAMCOCEM: ["NIFTY TOTAL MARKET"],
  MARKSANS: ["NIFTY TOTAL MARKET"],
  CCAVENUE: ["NIFTY TOTAL MARKET"],
  POWERMECH: ["NIFTY TOTAL MARKET"],
  ATUL: ["NIFTY TOTAL MARKET"],
  MEDANTA: ["NIFTY TOTAL MARKET"],
  GNFC: ["NIFTY TOTAL MARKET"],
  GICRE: ["NIFTY TOTAL MARKET"],
  EIHOTEL: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  INDIAGLYCO: ["NIFTY TOTAL MARKET"],
  RATNAMANI: ["NIFTY TOTAL MARKET"],
  BECTORFOOD: ["NIFTY TOTAL MARKET"],
  BBTC: ["NIFTY TOTAL MARKET"],
  RTNINDIA: ["NIFTY TOTAL MARKET"],
  JSFB: ["NIFTY TOTAL MARKET"],
  SOBHA: ["NIFTY TOTAL MARKET", "NIFTY REALTY"],
  CHALET: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  ORCHPHARMA: ["NIFTY TOTAL MARKET"],
  ROUTE: ["NIFTY TOTAL MARKET"],
  HONAUT: ["NIFTY TOTAL MARKET"],
  SURYAROSNI: ["NIFTY TOTAL MARKET"],
  FACT: ["NIFTY TOTAL MARKET"],
  GAEL: ["NIFTY TOTAL MARKET"],
  MANORAMA: ["NIFTY TOTAL MARKET"],
  SUDARSCHEM: ["NIFTY TOTAL MARKET"],
  CRISIL: ["NIFTY TOTAL MARKET"],
  HERITGFOOD: ["NIFTY TOTAL MARKET"],
  RHIM: ["NIFTY TOTAL MARKET"],
  ELECON: ["NIFTY TOTAL MARKET"],
  SHILPAMED: ["NIFTY TOTAL MARKET"],
  CIEINDIA: ["NIFTY TOTAL MARKET"],
  JKIL: ["NIFTY TOTAL MARKET"],
  THELEELA: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  STARHEALTH: ["NIFTY TOTAL MARKET"],
  VIJAYA: ["NIFTY TOTAL MARKET"],
  MINDACORP: ["NIFTY TOTAL MARKET"],
  JUBLPHARMA: ["NIFTY TOTAL MARKET"],
  RKFORGE: ["NIFTY TOTAL MARKET"],
  GMMPFAUDLR: ["NIFTY TOTAL MARKET"],
  THYROCARE: ["NIFTY TOTAL MARKET"],
  FINEORG: ["NIFTY TOTAL MARKET"],
  JUBLINGREA: ["NIFTY TOTAL MARKET"],
  AHLUCONT: ["NIFTY TOTAL MARKET"],
  ANUP: ["NIFTY TOTAL MARKET"],
  ENTERO: ["NIFTY TOTAL MARKET"],
  ARVINDFASN: ["NIFTY TOTAL MARKET"],
  RTNPOWER: ["NIFTY TOTAL MARKET"],
  CAPLIPOINT: ["NIFTY TOTAL MARKET"],
  MMTC: ["NIFTY TOTAL MARKET"],
  INDIACEM: ["NIFTY TOTAL MARKET"],
  PGHH: ["NIFTY TOTAL MARKET"],
  HEMIPROP: ["NIFTY TOTAL MARKET"],
  TARC: ["NIFTY TOTAL MARKET"],
  INOXINDIA: ["NIFTY TOTAL MARKET"],
  DEVYANI: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  ACMESOLAR: ["NIFTY TOTAL MARKET"],
  ELECTCAST: ["NIFTY TOTAL MARKET"],
  PNCINFRA: ["NIFTY TOTAL MARKET"],
  DATAMATICS: ["NIFTY TOTAL MARKET"],
  HIKAL: ["NIFTY TOTAL MARKET"],
  NESCO: ["NIFTY TOTAL MARKET"],
  DOMS: ["NIFTY TOTAL MARKET"],
  VAIBHAVGBL: ["NIFTY TOTAL MARKET"],
  VARROC: ["NIFTY TOTAL MARKET"],
  JKLAKSHMI: ["NIFTY TOTAL MARKET"],
  FINPIPE: ["NIFTY TOTAL MARKET"],
  SKIPPER: ["NIFTY TOTAL MARKET"],
  ACI: ["NIFTY TOTAL MARKET"],
  CAMPUS: ["NIFTY TOTAL MARKET"],
  THOMASCOOK: ["NIFTY TOTAL MARKET"],
  SBFC: ["NIFTY TOTAL MARKET"],
  SUMICHEM: ["NIFTY TOTAL MARKET"],
  POLYPLEX: ["NIFTY TOTAL MARKET"],
  NIVABUPA: ["NIFTY TOTAL MARKET"],
  RALLIS: ["NIFTY TOTAL MARKET"],
  SUNTECK: ["NIFTY TOTAL MARKET"],
  CELLO: ["NIFTY TOTAL MARKET"],
  BASF: ["NIFTY TOTAL MARKET"],
  BIKAJI: ["NIFTY TOTAL MARKET"],
  SAFARI: ["NIFTY TOTAL MARKET"],
  TSFINV: ["NIFTY TOTAL MARKET"],
  BBL: ["NIFTY TOTAL MARKET"],
  VESUVIUS: ["NIFTY TOTAL MARKET"],
  SANOFICONR: ["NIFTY TOTAL MARKET"],
  INDIGOPNTS: ["NIFTY TOTAL MARKET"],
  KANSAINER: ["NIFTY TOTAL MARKET"],
  PURVA: ["NIFTY TOTAL MARKET"],
  MAHLIFE: ["NIFTY TOTAL MARKET"],
  KIRLOSBROS: ["NIFTY TOTAL MARKET"],
  EMIL: ["NIFTY TOTAL MARKET"],
  EPIGRAL: ["NIFTY TOTAL MARKET"],
  IFBIND: ["NIFTY TOTAL MARKET"],
  ICIL: ["NIFTY TOTAL MARKET"],
  BLUEDART: ["NIFTY TOTAL MARKET"],
  ITI: ["NIFTY TOTAL MARKET"],
  STYRENIX: ["NIFTY TOTAL MARKET"],
  PRUDENT: ["NIFTY TOTAL MARKET"],
  NFL: ["NIFTY TOTAL MARKET"],
  GODREJIND: ["NIFTY TOTAL MARKET"],
  ALOKINDS: ["NIFTY TOTAL MARKET"],
  ASTRAZEN: ["NIFTY TOTAL MARKET"],
  RAYMONDLSL: ["NIFTY TOTAL MARKET"],
  ADVENZYMES: ["NIFTY TOTAL MARKET"],
  STARCEMENT: ["NIFTY TOTAL MARKET"],
  EMUDHRA: ["NIFTY TOTAL MARKET"],
  AGARWALEYE: ["NIFTY TOTAL MARKET"],
  AWFIS: ["NIFTY TOTAL MARKET"],
  LMW: ["NIFTY TOTAL MARKET"],
  AKUMS: ["NIFTY TOTAL MARKET"],
  AKZOINDIA: ["NIFTY TOTAL MARKET"],
  ALIVUS: ["NIFTY TOTAL MARKET"],
  ISGEC: ["NIFTY TOTAL MARKET"],
  EMBDL: ["NIFTY TOTAL MARKET"],
  CARBORUNIV: ["NIFTY TOTAL MARKET"],
  AARTIDRUGS: ["NIFTY TOTAL MARKET"],
  BAYERCROP: ["NIFTY TOTAL MARKET"],
  ETHOSLTD: ["NIFTY TOTAL MARKET"],
  MAHSCOOTER: ["NIFTY TOTAL MARKET"],
  DCAL: ["NIFTY TOTAL MARKET"],
  TTML: ["NIFTY TOTAL MARKET"],
  CYIENTDLM: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  NUVOCO: ["NIFTY TOTAL MARKET"],
  DCMSHRIRAM: ["NIFTY TOTAL MARKET"],
  ERIS: ["NIFTY TOTAL MARKET"],
  CERA: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  SUPRIYA: ["NIFTY TOTAL MARKET"],
  ORIENTCEM: ["NIFTY TOTAL MARKET"],
  SAREGAMA: ["NIFTY TOTAL MARKET", "NIFTY MEDIA"],
  CENTURYPLY: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  IONEXCHANG: ["NIFTY TOTAL MARKET"],
  IMAGICAA: ["NIFTY TOTAL MARKET"],
  SANOFI: ["NIFTY TOTAL MARKET"],
  ASKAUTOLTD: ["NIFTY TOTAL MARKET"],
  GHCL: ["NIFTY TOTAL MARKET"],
  TVSSCS: ["NIFTY TOTAL MARKET"],
  VGUARD: ["NIFTY TOTAL MARKET", "NIFTY CONSUMER DURABLES"],
  NIACL: ["NIFTY TOTAL MARKET"],
  GODREJAGRO: ["NIFTY TOTAL MARKET"],
  GULFOILLUB: ["NIFTY TOTAL MARKET"],
  SUBROS: ["NIFTY TOTAL MARKET"],
  HCG: ["NIFTY TOTAL MARKET"],
  PFIZER: ["NIFTY TOTAL MARKET"],
  VMART: ["NIFTY TOTAL MARKET"],
  BALAMINES: ["NIFTY TOTAL MARKET"],
  MSTCLTD: ["NIFTY TOTAL MARKET"],
  ZYDUSWELL: ["NIFTY TOTAL MARKET"],
  NEOGEN: ["NIFTY TOTAL MARKET"],
  PARKHOTELS: ["NIFTY TOTAL MARKET"],
  VIPIND: ["NIFTY TOTAL MARKET"],
  SHAREINDIA: ["NIFTY TOTAL MARKET"],
  DHANUKA: ["NIFTY TOTAL MARKET"],
  DODLA: ["NIFTY TOTAL MARKET"],
  VSTIND: ["NIFTY TOTAL MARKET"],
  GATEWAY: ["NIFTY TOTAL MARKET"],
  OPTIEMUS: ["NIFTY TOTAL MARKET"],
  SPARC: ["NIFTY TOTAL MARKET"],
  SHARDAMOTR: ["NIFTY TOTAL MARKET"],
  GALLANTT: ["NIFTY TOTAL MARKET"],
  WELENT: ["NIFTY TOTAL MARKET"],
  APLLTD: ["NIFTY TOTAL MARKET"],
  ALKYLAMINE: ["NIFTY TOTAL MARKET"],
  PRSMJOHNSN: ["NIFTY TOTAL MARKET"],
  AJAXENGG: ["NIFTY TOTAL MARKET"],
  INGERRAND: ["NIFTY TOTAL MARKET"],
  UNIMECH: ["NIFTY TOTAL MARKET", "NIFTY INDIA DEFENCE"],
  CEIGALL: ["NIFTY TOTAL MARKET"],
  EUREKAFORB: ["NIFTY TOTAL MARKET"],
  ALLCARGO: ["NIFTY TOTAL MARKET"],
  SFL: ["NIFTY TOTAL MARKET"],
  VINATIORGA: ["NIFTY TOTAL MARKET"],
  VENTIVE: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  GANECOS: ["NIFTY TOTAL MARKET"],
  KSL: ["NIFTY TOTAL MARKET"],
  METROPOLIS: ["NIFTY TOTAL MARKET"],
  GARFIBRES: ["NIFTY TOTAL MARKET"],
  RELAXO: ["NIFTY TOTAL MARKET"],
  MANINFRA: ["NIFTY TOTAL MARKET"],
  FDC: ["NIFTY TOTAL MARKET"],
  PRINCEPIPE: ["NIFTY TOTAL MARKET"],
  WESTLIFE: ["NIFTY TOTAL MARKET"],
  SAPPHIRE: ["NIFTY TOTAL MARKET", "NIFTY INDIA TOURISM"],
  LUXIND: ["NIFTY TOTAL MARKET"],
  SUNFLAG: ["NIFTY TOTAL MARKET"],
  BAJAJELEC: ["NIFTY TOTAL MARKET"],
  GRINFRA: ["NIFTY TOTAL MARKET"],
  QUESS: ["NIFTY TOTAL MARKET"],
  MAXESTATES: ["NIFTY TOTAL MARKET"],
  GANESHHOU: ["NIFTY TOTAL MARKET"],
  TEAMLEASE: ["NIFTY TOTAL MARKET"],
  INNOVACAP: ["NIFTY TOTAL MARKET"],
  GREENPANEL: ["NIFTY TOTAL MARKET"],
  "BOSCH-HCIL": ["NIFTY TOTAL MARKET"],
  JINDWORLD: ["NIFTY TOTAL MARKET"],
  PFOCUS: ["NIFTY MEDIA"],
  HATHWAY: ["NIFTY MEDIA"],
  DBCORP: ["NIFTY MEDIA"],
  PSB: ["NIFTY PSU BANK"],
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

  const todayForCalendar = new Date();
  const currentMarketMonthLabel = `${formatDateShort(getMarketMonthStart(todayForCalendar))} – ${formatDateShort(getMarketMonthEnd(todayForCalendar))}`;
  const currentWeekStart = getMarketWeekStart(todayForCalendar);
  const currentWeekEnd = getMarketWeekEnd(todayForCalendar);
  const currentMarketWeekLabel = `${formatDateShort(currentWeekStart)} – ${formatDateShort(currentWeekEnd)}`;

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

      {/* Market Calendar Rules */}
      <Card>
        <h2 className="text-sm font-bold text-slate-100 mb-4">
          Market Calendar Rules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Regime: On/after 1 Sep 2025 */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wide">
              On / After 1 Sep 2025
            </div>
            <ul className="text-xs text-slate-300 space-y-1">
              <li>
                <span className="text-slate-500">Week start:</span> Wednesday
              </li>
              <li>
                <span className="text-slate-500">Week end:</span> Tuesday (next
                week)
              </li>
              <li>
                <span className="text-slate-500">Month start:</span> Last
                Wednesday of previous calendar month
              </li>
              <li>
                <span className="text-slate-500">Month end:</span> Last Tuesday
                of current calendar month
              </li>
              <li>
                <span className="text-slate-500">First trading day:</span>{" "}
                Wednesday (not a holiday)
              </li>
              <li>
                <span className="text-slate-500">Holidays:</span> Saturday,
                Sunday + Notified Holidays
              </li>
            </ul>
          </div>
          {/* Regime: Before 1 Sep 2025 */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
            <div className="text-xs font-semibold text-amber-400 mb-2 uppercase tracking-wide">
              Before 1 Sep 2025
            </div>
            <ul className="text-xs text-slate-300 space-y-1">
              <li>
                <span className="text-slate-500">Week start:</span> Friday
                (previous week)
              </li>
              <li>
                <span className="text-slate-500">Week end:</span> Thursday
                (running week)
              </li>
              <li>
                <span className="text-slate-500">Month start:</span> Last Friday
                of previous calendar month
              </li>
              <li>
                <span className="text-slate-500">Month end:</span> Last Thursday
                of current calendar month
              </li>
              <li>
                <span className="text-slate-500">First trading day:</span>{" "}
                Friday (not a holiday)
              </li>
              <li>
                <span className="text-slate-500">Holidays:</span> Saturday,
                Sunday + Notified Holidays
              </li>
            </ul>
          </div>
        </div>
        {/* Current period info */}
        <div className="bg-slate-900 border border-blue-900 rounded-lg p-3 mb-3">
          <div className="text-xs font-semibold text-slate-300 mb-2">
            Current Period (Active Regime:{" "}
            <span className="text-blue-400">On/After 1 Sep 2025</span>)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>
              <div className="text-slate-500 mb-0.5">Market Month</div>
              <div className="text-slate-200 font-medium">
                {currentMarketMonthLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Market Week</div>
              <div className="text-emerald-400 font-medium">
                {currentMarketWeekLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Week Start Day</div>
              <div className="text-slate-200 font-medium">Wednesday</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Week End Day</div>
              <div className="text-slate-200 font-medium">Tuesday</div>
            </div>
          </div>
        </div>
        {/* Notified holidays placeholder */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-300">
              Notified Holidays
            </div>
            <span className="bg-amber-950 text-amber-400 text-xs px-2 py-0.5 rounded border border-amber-900">
              Pending — To Be Updated
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Exchange-notified holidays (e.g. Republic Day, Diwali) will be
            listed here once added. These are excluded from all market period
            calculations and data windows.
          </div>
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
                ["Stocks & Stocks Options OI", "Mock Data", "Simulated", "—"],
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
  lotSize,
}: {
  indexName: string;
  pcrSourceFull: Record<string, ExtendedPCRBarData[]>;
  expiries: string[];
  ocidPrefix: string;
  lotSize: number;
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
  const calRangeLabel = `${MONTH_NAMES[fourMonthRange[0].month]} ${fourMonthRange[0].year} – ${MONTH_NAMES[fourMonthRange[3].month]} ${fourMonthRange[3].year}`;
  const marketRangeLabel = getOIRangeLabel(oiYear, oiMonth);
  const weekStart = getMarketWeekStart(today);
  const weekEnd = getMarketWeekEnd(today);
  const marketWeekLabel = `${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)}`;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-slate-100">
            {indexName} OI Data
          </h2>
          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-medium">
            Lot Size: {lotSize.toLocaleString()}
          </span>
        </div>
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
          Showing: <span className="text-slate-300">{calRangeLabel}</span>
        </span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        Market Period:{" "}
        <span className="text-blue-400 font-medium">{marketRangeLabel}</span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        Market Week:{" "}
        <span className="text-emerald-400 font-medium">{marketWeekLabel}</span>
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
        lotSize={NIFTY_LOT_SIZE}
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
        lotSize={BANKNIFTY_LOT_SIZE}
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
          placeholder="Search Nifty Total Market..."
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
  const calRangeLabel = `${MONTH_NAMES[fourMonthRange[0].month]} ${fourMonthRange[0].year} – ${MONTH_NAMES[fourMonthRange[3].month]} ${fourMonthRange[3].year}`;
  const marketRangeLabel = getOIRangeLabel(oiYear, oiMonth);
  const stockWeekStart = getMarketWeekStart(today);
  const stockWeekEnd = getMarketWeekEnd(today);
  const marketWeekLabel = `${formatDateShort(stockWeekStart)} – ${formatDateShort(stockWeekEnd)}`;

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
  const lotSize = LOT_SIZES[sym];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-slate-100">{sym} — OI Data</h2>
          {lotSize !== undefined && (
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-medium">
              Lot Size: {lotSize.toLocaleString()}
            </span>
          )}
        </div>
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
          Showing: <span className="text-slate-300">{calRangeLabel}</span>
        </span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        Market Period:{" "}
        <span className="text-blue-400 font-medium">{marketRangeLabel}</span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        Market Week:{" "}
        <span className="text-emerald-400 font-medium">{marketWeekLabel}</span>
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

function IndexMembershipBadges({ sym }: { sym: string }) {
  const indices = STOCK_TO_INDICES[sym] ?? [];
  if (indices.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-700">
      <div className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">
        Index Membership ({indices.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {indices.map((idx) => (
          <span
            key={idx}
            className="bg-blue-950 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-800 font-medium"
          >
            {idx}
          </span>
        ))}
      </div>
    </div>
  );
}

function TabStocks() {
  const [sym, setSym] = useState("RELIANCE");
  return (
    <div className="space-y-4">
      <Card>
        <StockSearch value={sym} onChange={setSym} />
        <IndexMembershipBadges sym={sym} />
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

// ─── Date Window Helpers ──────────────────────────────────────────────────────

function addMonthsToDate(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function getDailyWindow<T extends { year: number; month: number }>(
  data: T[],
  endDate: Date,
  monthsBack: number,
): T[] {
  const start = addMonthsToDate(endDate, -monthsBack);
  const sVal = start.getFullYear() * 12 + start.getMonth();
  const eVal = endDate.getFullYear() * 12 + endDate.getMonth();
  return data.filter((d) => {
    const dVal = d.year * 12 + d.month;
    return dVal >= sVal && dVal <= eVal;
  });
}

function getQtrWindow<
  T extends { calStartYear: number; fyYear: number; date: string },
>(data: T[], endDate: Date, quartersBack: number): T[] {
  // Convert endDate to a sequential calendar quarter index
  const endQtrYear = endDate.getFullYear();
  const endQtrMonth = endDate.getMonth(); // 0-indexed
  const calQEnd = endQtrYear * 4 + Math.floor(endQtrMonth / 3);
  const calQStart = calQEnd - quartersBack + 1;

  return data.filter((d) => {
    // Parse qNum from date label e.g. "Q1FY06" -> 1
    const qMatch = d.date.match(/Q(\d)/);
    const qNum = qMatch ? Number.parseInt(qMatch[1], 10) : 1;
    // Q1=Apr-Jun (calQNum=1), Q2=Jul-Sep (calQNum=2), Q3=Oct-Dec (calQNum=3), Q4=Jan-Mar (calQNum=0)
    let calQNum: number;
    if (qNum === 1)
      calQNum = 1; // Apr-Jun
    else if (qNum === 2)
      calQNum = 2; // Jul-Sep
    else if (qNum === 3)
      calQNum = 3; // Oct-Dec
    else calQNum = 0; // Jan-Mar (Q4)
    const calQ = d.calStartYear * 4 + calQNum;
    return calQ >= calQStart && calQ <= calQEnd;
  });
}

function formatMonthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatQtrLabel(date: Date): string {
  // Convert date to FY quarter label
  const m = date.getMonth(); // 0-indexed
  const y = date.getFullYear();
  // FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  let q: number;
  let fy: number;
  if (m >= 3 && m <= 5) {
    q = 1;
    fy = y + 1;
  } else if (m >= 6 && m <= 8) {
    q = 2;
    fy = y + 1;
  } else if (m >= 9 && m <= 11) {
    q = 3;
    fy = y + 1;
  } else {
    // Jan-Mar
    q = 4;
    fy = y;
  }
  return `Q${q}FY${String(fy).slice(2)}`;
}

// ─── Navigation Controls ─────────────────────────────────────────────────────

function WindowNav({
  label,
  onPrev,
  onNext,
  disableNext,
  dateValue,
  onDateChange,
  dateOcid,
  prevOcid,
  nextOcid,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  disableNext: boolean;
  dateValue: string;
  onDateChange: (v: string) => void;
  dateOcid: string;
  prevOcid: string;
  nextOcid: string;
}) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-ocid={prevOcid}
        onClick={onPrev}
        className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-400 transition-colors text-sm"
        title="Go further back"
      >
        ◀
      </button>
      <span className="text-xs text-slate-300 min-w-[130px] text-center font-medium">
        {label}
      </span>
      <button
        type="button"
        data-ocid={nextOcid}
        onClick={onNext}
        disabled={disableNext}
        className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors text-sm ${
          disableNext
            ? "border-slate-700 text-slate-600 cursor-not-allowed"
            : "border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-400"
        }`}
        title="Go forward"
      >
        ▶
      </button>
      <input
        type="date"
        data-ocid={dateOcid}
        value={dateValue}
        min="2005-01-01"
        max={today}
        onChange={(e) => onDateChange(e.target.value)}
        className="bg-slate-800 border border-slate-600 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
      />
    </div>
  );
}

// ─── DailyIndicatorsCard ──────────────────────────────────────────────────────

function DailyIndicatorsCard() {
  const [sub, setSub] = useState<"usd" | "fiidii" | "crude" | "gsec">("usd");
  const todayStr = new Date().toISOString().split("T")[0];
  const [anchorDateStr, setAnchorDateStr] = useState(todayStr);
  const [windowOffset, setWindowOffset] = useState(0);
  const touchStartX = useRef(0);

  const anchorDate = useMemo(() => new Date(anchorDateStr), [anchorDateStr]);
  const endDate = useMemo(
    () => addMonthsToDate(anchorDate, windowOffset),
    [anchorDate, windowOffset],
  );
  const startDate = useMemo(() => addMonthsToDate(endDate, -12), [endDate]);

  const rangeLabel = `${formatMonthLabel(startDate)} – ${formatMonthLabel(endDate)}`;

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
    () => getDailyWindow(MACRO_USDINT_FULL, endDate, 12),
    [endDate],
  );
  const fiiData = useMemo(
    () => getDailyWindow(MACRO_FII_FULL, endDate, 12),
    [endDate],
  );
  const crudeData = useMemo(
    () => getDailyWindow(MACRO_CRUDE_FULL, endDate, 12),
    [endDate],
  );
  const gsecData = useMemo(
    () => getDailyWindow(MACRO_GSEC_FULL, endDate, 12),
    [endDate],
  );

  const xAxisInterval = (len: number) => (len <= 10 ? 0 : len <= 20 ? 2 : 5);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) setWindowOffset((o) => o - 1);
    if (dx < -50) setWindowOffset((o) => Math.min(0, o + 1));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Daily Indicators</h2>
        </div>
        <WindowNav
          label={rangeLabel}
          onPrev={() => setWindowOffset((o) => o - 1)}
          onNext={() => setWindowOffset((o) => Math.min(0, o + 1))}
          disableNext={windowOffset >= 0}
          dateValue={anchorDateStr}
          onDateChange={(v) => {
            setAnchorDateStr(v);
            setWindowOffset(0);
          }}
          dateOcid="macro.daily.date.input"
          prevOcid="macro.daily.prev.button"
          nextOcid="macro.daily.next.button"
        />
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
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sub === "usd" && (
          <>
            <div className="text-xs text-slate-500 mb-2">
              USD/INR Exchange Rate (₹/USD) — Daily — {rangeLabel}
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
              {rangeLabel}
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
              {rangeLabel}
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
              {rangeLabel}
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
      </div>
    </Card>
  );
}

// ─── MoMIndicatorsCard ────────────────────────────────────────────────────────

function MoMIndicatorsCard() {
  const [sub, setSub] = useState<"cpiwpi" | "autogst" | "pmi">("cpiwpi");
  const todayStr = new Date().toISOString().split("T")[0];
  const [anchorDateStr, setAnchorDateStr] = useState(todayStr);
  const [windowOffset, setWindowOffset] = useState(0);
  const touchStartX = useRef(0);

  const anchorDate = useMemo(() => new Date(anchorDateStr), [anchorDateStr]);
  const endDate = useMemo(
    () => addMonthsToDate(anchorDate, windowOffset),
    [anchorDate, windowOffset],
  );
  const startDate = useMemo(() => addMonthsToDate(endDate, -59), [endDate]);

  const rangeLabel = `${formatMonthLabel(startDate)} – ${formatMonthLabel(endDate)}`;

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
    () => getDailyWindow(MACRO_CPI_WPI_FULL, endDate, 59),
    [endDate],
  );
  const autoGstData = useMemo(
    () => getDailyWindow(MACRO_AUTO_GST_FULL, endDate, 59),
    [endDate],
  );
  const pmiData = useMemo(
    () => getDailyWindow(MACRO_PMI_FULL, endDate, 59),
    [endDate],
  );

  const xInterval = (len: number) =>
    len <= 12 ? 0 : len <= 24 ? 2 : len <= 48 ? 5 : 11;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) setWindowOffset((o) => o - 1);
    if (dx < -50) setWindowOffset((o) => Math.min(0, o + 1));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">
            Month-on-Month (MoM) Indicators
          </h2>
        </div>
        <WindowNav
          label={rangeLabel}
          onPrev={() => setWindowOffset((o) => o - 1)}
          onNext={() => setWindowOffset((o) => Math.min(0, o + 1))}
          disableNext={windowOffset >= 0}
          dateValue={anchorDateStr}
          onDateChange={(v) => {
            setAnchorDateStr(v);
            setWindowOffset(0);
          }}
          dateOcid="macro.mom.date.input"
          prevOcid="macro.mom.prev.button"
          nextOcid="macro.mom.next.button"
        />
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
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sub === "cpiwpi" && (
          <>
            <div className="text-xs text-slate-500 mb-2">
              CPI (Blue) & WPI (Green) — MoM % — {rangeLabel}
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
                    label={{
                      value: "RBI Target",
                      fill: "#64748b",
                      fontSize: 9,
                    }}
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
              Auto Sales (Lakhs, bars) & GST Collections (₹ L Cr, line) — MoM —{" "}
              {rangeLabel}
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
              India Manufacturing PMI (Blue) & Services PMI (Green) — MoM —{" "}
              {rangeLabel}
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
      </div>
    </Card>
  );
}

// ─── QoQIndicatorsCard ────────────────────────────────────────────────────────

function QoQIndicatorsCard() {
  const [sub, setSub] = useState<"gdpcad" | "rates" | "fxreserve">("gdpcad");
  const todayStr = new Date().toISOString().split("T")[0];
  const [anchorDateStr, setAnchorDateStr] = useState(todayStr);
  const [windowOffset, setWindowOffset] = useState(0); // each unit = 1 quarter (3 months)
  const touchStartX = useRef(0);

  const anchorDate = useMemo(() => new Date(anchorDateStr), [anchorDateStr]);
  const endDate = useMemo(
    () => addMonthsToDate(anchorDate, windowOffset * 3),
    [anchorDate, windowOffset],
  );
  // Start = 40 quarters back = 120 months back
  const startDate = useMemo(() => addMonthsToDate(endDate, -120), [endDate]);

  const startQtrLabel = formatQtrLabel(startDate);
  const endQtrLabel = formatQtrLabel(endDate);
  const rangeLabel = `${startQtrLabel} – ${endQtrLabel}`;

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
    () => getQtrWindow(MACRO_GDP_CAD_FULL, endDate, 40),
    [endDate],
  );
  const ratesData = useMemo(
    () => getQtrWindow(MACRO_RATES_FULL, endDate, 40),
    [endDate],
  );
  const fxAndRatesData = useMemo(
    () => getQtrWindow(MACRO_FX_AND_RATES_FULL, endDate, 40),
    [endDate],
  );

  const xInterval = (len: number) =>
    len <= 8 ? 0 : len <= 16 ? 1 : len <= 32 ? 3 : 7;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) setWindowOffset((o) => o - 1);
    if (dx < -50) setWindowOffset((o) => Math.min(0, o + 1));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">
            Quarter-on-Quarter (QoQ) Indicators
          </h2>
        </div>
        <WindowNav
          label={rangeLabel}
          onPrev={() => setWindowOffset((o) => o - 1)}
          onNext={() => setWindowOffset((o) => Math.min(0, o + 1))}
          disableNext={windowOffset >= 0}
          dateValue={anchorDateStr}
          onDateChange={(v) => {
            setAnchorDateStr(v);
            setWindowOffset(0);
          }}
          dateOcid="macro.qoq.date.input"
          prevOcid="macro.qoq.prev.button"
          nextOcid="macro.qoq.next.button"
        />
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
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sub === "gdpcad" && (
          <>
            <div className="text-xs text-slate-500 mb-2">
              GDP Growth % (bars, left) & CAD as % of GDP (line, right) — QoQ —{" "}
              {rangeLabel}
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
              Repo Rate % (Blue, left) & FX Reserve USD Bn (Orange, right) — QoQ
              — {rangeLabel}
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
              FX Reserve USD Bn (Purple, left) &amp; Repo Rate % (Blue
              step-line, right) — QoQ — {rangeLabel}
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
      </div>
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
// TAB 7: STOCK RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Data Types ──────────────────────────────────────────────────────────────
interface QuarterlyResult {
  quarter: string; // e.g. "Q1 FY06"
  quarterDate: Date; // start date of quarter (April 1, July 1, Oct 1, Jan 1)
  revenue: number; // in Crores INR
  netProfit: number;
  ebitda: number;
  eps: number;
  revenueGrowthYoY: number | null;
  netProfitGrowthYoY: number | null;
  ebitdaMargin: number;
  netProfitMargin: number;
}

interface CustomMetric {
  id: string;
  name: string;
  formula: string;
  note?: string; // plain text note for this custom metric
  value: number | null;
  error: string | null;
  isGlobal?: boolean; // true = stored in global_custom_metrics
}

// ─── Quarter Generator ────────────────────────────────────────────────────────
const quarterlyResultsCache: Record<string, QuarterlyResult[]> = {};

function genQuarterlyResults(sym: string): QuarterlyResult[] {
  if (quarterlyResultsCache[sym]) return quarterlyResultsCache[sym];

  const seed = symSeed(sym);
  const rng = mulberry32(seed + 77);

  // Determine IPO year for this stock
  const ipoYear = STOCK_IPO_YEAR[sym] ?? 2005;
  const startYear = Math.max(ipoYear, 2005);

  // Generate all FY quarters from Q1 FY06 (Apr 2005) through latest completed quarter
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth(); // 0-indexed

  // FY quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  // Q1 FY06 = April 2005
  // Generate all quarters up to most recently completed quarter
  const quarters: QuarterlyResult[] = [];

  // Determine current FY and quarter
  // A quarter is "completed" if the end month has passed
  // Q1 end = Jun, Q2 end = Sep, Q3 end = Dec, Q4 end = Mar
  let currentFY = nowMonth >= 3 ? nowYear + 1 : nowYear; // FY year
  let currentQ: number;
  if (nowMonth >= 3 && nowMonth <= 5) currentQ = 1;
  else if (nowMonth >= 6 && nowMonth <= 8) currentQ = 2;
  else if (nowMonth >= 9 && nowMonth <= 11) currentQ = 3;
  else currentQ = 4;

  // Go back one quarter for "completed" quarters
  let lastCompletedQ = currentQ - 1;
  let lastCompletedFY = currentFY;
  if (lastCompletedQ === 0) {
    lastCompletedQ = 4;
    lastCompletedFY--;
  }

  // Seed-based base financials
  const baseRevenue = 500 + rng() * 49500; // 500 to 50000 Cr
  const baseMg = 0.08 + rng() * 0.22; // 8-30% net margin
  const baseEbitdaMg = baseMg + 0.05 + rng() * 0.1; // ebitda > net profit
  const baseEPS = 2 + rng() * 198;
  const revenueGrowthTrend = 0.06 + rng() * 0.14; // 6-20% annual growth
  const volatility = 0.03 + rng() * 0.07;

  // Starting FY is either 2006 or IPO year FY
  const startFY = startYear <= 2005 ? 2006 : startYear + 1;
  const startQ = 1;

  let revenue =
    baseRevenue * (1 - revenueGrowthTrend) ** (lastCompletedFY - startFY);
  // Avoid negative revenue from poor math
  if (revenue < 10) revenue = 10;

  const allQData: {
    q: number;
    fy: number;
    rev: number;
    np: number;
    ebitda: number;
    eps: number;
  }[] = [];

  // Generate from start to lastCompleted
  for (let fy = startFY; fy <= lastCompletedFY; fy++) {
    const maxQ = fy === lastCompletedFY ? lastCompletedQ : 4;
    const minQ = fy === startFY ? startQ : 1;
    for (let q = minQ; q <= maxQ; q++) {
      const qGrowth = (1 + revenueGrowthTrend) ** (1 / 4);
      const noise = 1 + (rng() - 0.5) * volatility * 2;
      revenue = revenue * qGrowth * noise;
      const npMargin = Math.max(0.01, baseMg + (rng() - 0.5) * 0.06);
      const ebitdaMarginVal = Math.max(
        npMargin + 0.02,
        baseEbitdaMg + (rng() - 0.5) * 0.04,
      );
      const np = revenue * npMargin;
      const ebitdaVal = revenue * ebitdaMarginVal;
      const epsVal =
        baseEPS *
        (1 + revenueGrowthTrend * 0.7) ** (fy - startFY + (q - 1) / 4) *
        (0.9 + rng() * 0.2);

      allQData.push({
        q,
        fy,
        rev: +revenue.toFixed(2),
        np: +np.toFixed(2),
        ebitda: +ebitdaVal.toFixed(2),
        eps: +epsVal.toFixed(2),
      });
    }
  }

  // Now build QuarterlyResult with YoY
  for (let i = 0; i < allQData.length; i++) {
    const d = allQData[i];
    // Quarter label e.g. "Q1 FY06"
    const fyShort = String(d.fy).slice(-2);
    const label = `Q${d.q} FY${fyShort}`;

    // Quarter start date
    let qStartMonth: number;
    let qYear: number;
    if (d.q === 1) {
      qStartMonth = 3;
      qYear = d.fy - 1;
    } // Apr = month 3, year = fy-1
    else if (d.q === 2) {
      qStartMonth = 6;
      qYear = d.fy - 1;
    } // Jul = month 6
    else if (d.q === 3) {
      qStartMonth = 9;
      qYear = d.fy - 1;
    } // Oct = month 9
    else {
      qStartMonth = 0;
      qYear = d.fy;
    } // Jan = month 0, year = fy

    const quarterDate = new Date(qYear, qStartMonth, 1);

    // Find same quarter last year for YoY
    const prevIdx = allQData.findIndex((p) => p.q === d.q && p.fy === d.fy - 1);
    const prev = prevIdx >= 0 ? allQData[prevIdx] : null;

    const revYoY = prev ? +((d.rev / prev.rev - 1) * 100).toFixed(1) : null;
    const npYoY = prev ? +((d.np / prev.np - 1) * 100).toFixed(1) : null;

    quarters.push({
      quarter: label,
      quarterDate,
      revenue: d.rev,
      netProfit: d.np,
      ebitda: d.ebitda,
      eps: d.eps,
      revenueGrowthYoY: revYoY,
      netProfitGrowthYoY: npYoY,
      ebitdaMargin: +((d.ebitda / d.rev) * 100).toFixed(1),
      netProfitMargin: +((d.np / d.rev) * 100).toFixed(1),
    });
  }

  // Store all, sorted newest first
  quarters.reverse();
  quarterlyResultsCache[sym] = quarters;
  return quarters;
}

// ─── Analytics helpers ────────────────────────────────────────────────────────
function calcCAGR(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return +(((end / start) ** (1 / years) - 1) * 100).toFixed(1);
}

function computeBuiltinMetrics(
  quarters: QuarterlyResult[],
  periodQ = 20,
): { name: string; value: string; description: string }[] {
  if (quarters.length < 4) return [];

  const effectivePeriod = Math.min(periodQ, quarters.length);
  const recentQ = quarters.slice(0, effectivePeriod);
  const last = recentQ[0];
  // Use periodQ as the look-back; periodQ/4 = years
  const years = periodQ / 4;
  const periodIdx = Math.min(effectivePeriod - 1, quarters.length - 1);
  const periodAgo = quarters[periodIdx];

  const revCAGR = calcCAGR(periodAgo.revenue, last.revenue, years);
  const npCAGR = calcCAGR(
    Math.abs(periodAgo.netProfit),
    Math.abs(last.netProfit),
    years,
  );
  const epsCAGR = calcCAGR(Math.abs(periodAgo.eps), Math.abs(last.eps), years);

  const avgEbitdaMargin = +(
    recentQ.reduce((s, q) => s + q.ebitdaMargin, 0) / recentQ.length
  ).toFixed(1);
  const avgNpMargin = +(
    recentQ.reduce((s, q) => s + q.netProfitMargin, 0) / recentQ.length
  ).toFixed(1);

  const revWithYoY = recentQ.filter((q) => q.revenueGrowthYoY !== null);
  const revConsistency =
    revWithYoY.length > 0
      ? +(
          (revWithYoY.filter((q) => (q.revenueGrowthYoY ?? 0) > 0).length /
            revWithYoY.length) *
          100
        ).toFixed(0)
      : 0;
  const npWithYoY = recentQ.filter((q) => q.netProfitGrowthYoY !== null);
  const npConsistency =
    npWithYoY.length > 0
      ? +(
          (npWithYoY.filter((q) => (q.netProfitGrowthYoY ?? 0) > 0).length /
            npWithYoY.length) *
          100
        ).toFixed(0)
      : 0;

  const yLabel = years % 1 === 0 ? `${years}Y` : `${effectivePeriod}Q`;
  // Dynamic period label for metric names
  const periodLabel = periodQ % 4 === 0 ? `${periodQ / 4}Y` : `${periodQ}Q`;

  return [
    {
      name: `Revenue CAGR (${periodLabel})`,
      value: `${revCAGR}%`,
      description: `Compounded annual growth rate of revenue over last ${yLabel}`,
    },
    {
      name: `Net Profit CAGR (${periodLabel})`,
      value: `${npCAGR}%`,
      description: `Compounded annual growth rate of net profit over last ${yLabel}`,
    },
    {
      name: `EPS CAGR (${periodLabel})`,
      value: `${epsCAGR}%`,
      description: `Compounded annual growth rate of earnings per share over last ${yLabel}`,
    },
    {
      name: `Avg EBITDA Margin (${periodLabel})`,
      value: `${avgEbitdaMargin}%`,
      description: `Average EBITDA margin over last ${effectivePeriod} quarters`,
    },
    {
      name: `Avg NP Margin (${periodLabel})`,
      value: `${avgNpMargin}%`,
      description: `Average net profit margin over last ${effectivePeriod} quarters`,
    },
    {
      name: "Revenue Consistency",
      value: `${revConsistency}%`,
      description: `% of quarters with positive YoY revenue growth (last ${effectivePeriod} qtrs)`,
    },
    {
      name: "Profit Consistency",
      value: `${npConsistency}%`,
      description: `% of quarters with positive YoY net profit growth (last ${effectivePeriod} qtrs)`,
    },
  ];
}

// ─── OI / Macro aggregation helpers ──────────────────────────────────────────

// Helper: aggregate daily OI data into quarterly buckets (3-month window from quarterDate)
function getQuarterlyOIValue(
  oiData: ExtendedPCRBarData[],
  quarterDate: Date,
  field: "pcrRatio" | "peOI" | "ceOI",
): number {
  const y = quarterDate.getFullYear();
  const m = quarterDate.getMonth();
  const rows = oiData.filter((row) => {
    const rd = new Date(row.date);
    const ry = rd.getFullYear();
    const rm = rd.getMonth();
    return ry === y && (rm === m || rm === m + 1 || rm === m + 2);
  });
  if (rows.length === 0) return 0;
  const sum = rows.reduce((s, r) => s + r[field], 0);
  return field === "pcrRatio"
    ? +(sum / rows.length).toFixed(3)
    : Math.round(sum / rows.length);
}

// Helper: get macro value closest to a date from a time-series
function getMacroValueNearDate<T extends { date: string | Date }>(
  arr: T[],
  targetDate: Date,
  field: keyof T,
): number {
  if (arr.length === 0) return 0;
  let best = arr[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const entry of arr) {
    const d = new Date(entry.date as string);
    const diff = Math.abs(d.getTime() - targetDate.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  const val = best[field];
  return typeof val === "number" ? val : 0;
}

function evalCustomMetric(
  formula: string,
  quarters: QuarterlyResult[],
  sym?: string,
  periodQ?: number,
): { value: number | null; error: string | null } {
  const maxPeriod = periodQ ?? 20;
  const recent = quarters.slice(0, Math.min(maxPeriod, quarters.length));
  if (recent.length === 0) return { value: null, error: "No data" };

  const avgRevenue = recent.reduce((s, q) => s + q.revenue, 0) / recent.length;
  const avgNetProfit =
    recent.reduce((s, q) => s + q.netProfit, 0) / recent.length;
  const avgEBITDA = recent.reduce((s, q) => s + q.ebitda, 0) / recent.length;
  const avgEPS = recent.reduce((s, q) => s + q.eps, 0) / recent.length;
  const avgEbitdaMargin =
    recent.reduce((s, q) => s + q.ebitdaMargin, 0) / recent.length;
  const avgNpMargin =
    recent.reduce((s, q) => s + q.netProfitMargin, 0) / recent.length;

  // Real macro values pulled from live data arrays
  const NiftyClose = NIFTY_DATA[NIFTY_DATA.length - 1]?.close ?? 22000;
  const MacroCPI =
    MACRO_CPI_WPI_FULL[MACRO_CPI_WPI_FULL.length - 1]?.cpi ?? 5.2;
  const MacroWPI =
    MACRO_CPI_WPI_FULL[MACRO_CPI_WPI_FULL.length - 1]?.wpi ?? 2.1;
  const FIIFlow = MACRO_FII_FULL[MACRO_FII_FULL.length - 1]?.fii ?? -1200;
  const MacroDII = MACRO_FII_FULL[MACRO_FII_FULL.length - 1]?.dii ?? 800;
  const MacroUSDINR =
    MACRO_USDINT_FULL[MACRO_USDINT_FULL.length - 1]?.value ?? 83.5;
  const MacroCrudeWTI =
    MACRO_CRUDE_FULL[MACRO_CRUDE_FULL.length - 1]?.wti ?? 75;
  const MacroCrudeBrent =
    MACRO_CRUDE_FULL[MACRO_CRUDE_FULL.length - 1]?.brent ?? 78;
  const Macro3YGsec = MACRO_GSEC_FULL[MACRO_GSEC_FULL.length - 1]?.y3 ?? 6.8;
  const Macro5YGsec = MACRO_GSEC_FULL[MACRO_GSEC_FULL.length - 1]?.y5 ?? 7.0;
  const Macro10YGsec = MACRO_GSEC_FULL[MACRO_GSEC_FULL.length - 1]?.y10 ?? 7.2;
  const MacroGDP =
    MACRO_GDP_CAD_FULL[MACRO_GDP_CAD_FULL.length - 1]?.gdp ?? 7.0;
  const MacroRepoRate =
    MACRO_RATES_FULL[MACRO_RATES_FULL.length - 1]?.repoRate ?? 6.5;
  const MacroFXReserve =
    MACRO_FXRESERVE_FULL[MACRO_FXRESERVE_FULL.length - 1]?.value ?? 650;

  // Index & Stock OI variables (averaged over selected period using most recent quarter date)
  const niftyCM = NIFTY_PCR_OI_FULL.CM;
  const bnkCM = BANKNIFTY_PCR_OI_FULL.CM;
  const stockOIKey = sym
    ? Object.keys(stockPCROIFullCache).find(
        (k) => k === `${sym}_CM` || k.startsWith(`${sym}_`),
      )
    : undefined;
  const stockOIArr: ExtendedPCRBarData[] =
    sym && stockOIKey ? (stockPCROIFullCache[stockOIKey] ?? []) : [];

  // Use most recent quarter's date for OI reference
  const refDate = recent[0]?.quarterDate ?? new Date();
  const NiftyOI_PE = getQuarterlyOIValue(niftyCM, refDate, "peOI");
  const NiftyOI_CE = getQuarterlyOIValue(niftyCM, refDate, "ceOI");
  const NiftyPCR =
    getQuarterlyOIValue(niftyCM, refDate, "pcrRatio") ||
    NiftyOI_PE / (NiftyOI_CE || 1);
  const BankNiftyOI_PE = getQuarterlyOIValue(bnkCM, refDate, "peOI");
  const BankNiftyOI_CE = getQuarterlyOIValue(bnkCM, refDate, "ceOI");
  const BankNiftyPCR =
    getQuarterlyOIValue(bnkCM, refDate, "pcrRatio") ||
    BankNiftyOI_PE / (BankNiftyOI_CE || 1);

  const StockOI_PE = getQuarterlyOIValue(stockOIArr, refDate, "peOI");
  const StockOI_CE = getQuarterlyOIValue(stockOIArr, refDate, "ceOI");
  const StockPCR =
    getQuarterlyOIValue(stockOIArr, refDate, "pcrRatio") ||
    StockOI_PE / (StockOI_CE || 1);

  // Stock price / volume (last close and average volume in period)
  const stockPriceData = sym ? getStockData(sym) : [];
  const _sOhlc = stockPriceData.filter((d) => {
    const dy = d.date.getFullYear();
    const dm = d.date.getMonth();
    return (
      dy === refDate.getFullYear() &&
      dm >= refDate.getMonth() &&
      dm <= refDate.getMonth() + 2
    );
  });
  const StockClose =
    _sOhlc.length > 0
      ? _sOhlc[_sOhlc.length - 1].close
      : (stockPriceData[stockPriceData.length - 1]?.close ?? 0);
  const StockVolume =
    _sOhlc.length > 0
      ? Math.round(_sOhlc.reduce((s, d) => s + d.volume, 0) / _sOhlc.length)
      : 0;

  try {
    const evalCode = `const Revenue=${avgRevenue};const NetProfit=${avgNetProfit};const EBITDA=${avgEBITDA};const EPS=${avgEPS};const EbitdaMargin=${avgEbitdaMargin};const NpMargin=${avgNpMargin};const NiftyClose=${NiftyClose};const MacroCPI=${MacroCPI};const MacroWPI=${MacroWPI};const FIIFlow=${FIIFlow};const MacroDII=${MacroDII};const MacroUSDINR=${MacroUSDINR};const MacroCrudeWTI=${MacroCrudeWTI};const MacroCrudeBrent=${MacroCrudeBrent};const Macro3YGsec=${Macro3YGsec};const Macro5YGsec=${Macro5YGsec};const Macro10YGsec=${Macro10YGsec};const MacroGDP=${MacroGDP};const MacroRepoRate=${MacroRepoRate};const MacroFXReserve=${MacroFXReserve};const NiftyOI_PE=${NiftyOI_PE};const NiftyOI_CE=${NiftyOI_CE};const NiftyPCR=${NiftyPCR};const BankNiftyOI_PE=${BankNiftyOI_PE};const BankNiftyOI_CE=${BankNiftyOI_CE};const BankNiftyPCR=${BankNiftyPCR};const StockOI_PE=${StockOI_PE};const StockOI_CE=${StockOI_CE};const StockPCR=${StockPCR};const StockClose=${StockClose};const StockVolume=${StockVolume};(${formula})`;
    // biome-ignore lint/security/noGlobalEval: intentional formula evaluator for user-defined metrics
    const result = eval(evalCode);
    if (typeof result === "number" && Number.isFinite(result)) {
      return { value: +result.toFixed(2), error: null };
    }
    return { value: null, error: "Formula did not return a number" };
  } catch (e) {
    return { value: null, error: String(e) };
  }
}

// ─── Stock Results Search (inline, reuses STOCKS array) ─────────────────────
function StockResultsSearch({
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
      <div className="flex flex-wrap gap-3 items-center p-4 border-b border-slate-700">
        <span className="text-slate-400 text-sm font-medium">Stock:</span>
        <button
          type="button"
          data-ocid="stockresults.stock.select"
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
          placeholder="Search Nifty Total Market..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          data-ocid="stockresults.stock.search_input"
          className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none w-52 focus:border-blue-500 transition-colors"
        />
      </div>
      {open && (
        <div className="absolute top-16 left-4 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50 w-80 mt-1">
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

// ─── Global Custom Metrics localStorage helpers ───────────────────────────────
function loadGlobalMetrics(): CustomMetric[] {
  try {
    const saved = localStorage.getItem("global_custom_metrics");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveGlobalMetrics(metrics: CustomMetric[]) {
  try {
    localStorage.setItem("global_custom_metrics", JSON.stringify(metrics));
  } catch {
    /* ignore */
  }
}

// ─── Panel 2: Analytics Matrix ────────────────────────────────────────────────

// Base keys for standard metrics (period-independent identifiers for selection persistence)
const STANDARD_METRIC_BASE_KEYS = [
  "Revenue CAGR",
  "Net Profit CAGR",
  "EPS CAGR",
  "Avg EBITDA Margin",
  "Avg NP Margin",
  "Revenue Consistency",
  "Profit Consistency",
] as const;

// Extract base key from a metric name by stripping trailing (XY) or (XQ) suffix
function metricBaseKey(name: string): string {
  return name.replace(/\s*\(\d+[YQ]\)$/, "").trim();
}

function AnalyticsMatrixPanel({ sym }: { sym: string }) {
  // Generate quarters internally
  const allQuarters = useMemo(() => genQuarterlyResults(sym), [sym]);

  // --- Period inputs ---
  const [numQuarters, setNumQuarters] = useState<number | "">(20);
  const [numYears, setNumYears] = useState<number | "">("");

  const periodQuarters: number =
    numYears !== ""
      ? Number(numYears) * 4
      : numQuarters !== ""
        ? Number(numQuarters)
        : 20;

  const computeQuarters = useMemo(
    () => allQuarters.slice(0, Math.max(4, periodQuarters)),
    [allQuarters, periodQuarters],
  );

  // --- Multi-select metrics panel ---
  const [showMetricPanel, setShowMetricPanel] = useState(false);
  const metricPanelRef = useRef<HTMLDivElement>(null);

  // Close metric panel on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        metricPanelRef.current &&
        !metricPanelRef.current.contains(e.target as Node)
      )
        setShowMetricPanel(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // --- Notes ---
  const [note, setNote] = useState<string>(() => {
    try {
      return localStorage.getItem(`analytics_notes_${sym}`) ?? "";
    } catch {
      return "";
    }
  });
  const [noteSaved, setNoteSaved] = useState(false);

  // --- Active standard metrics per stock (stored as base keys, period-independent) ---
  const [activeStdMetrics, setActiveStdMetrics] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`stock_active_metrics_${sym}`);
      if (saved) {
        // Migrate legacy "Revenue CAGR (5Y)" style entries to base keys
        const parsed: string[] = JSON.parse(saved);
        return new Set(parsed.map(metricBaseKey));
      }
      return new Set(STANDARD_METRIC_BASE_KEYS);
    } catch {
      return new Set(STANDARD_METRIC_BASE_KEYS);
    }
  });

  // --- Custom metrics for this stock ---
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>(() => {
    try {
      const saved = localStorage.getItem(`custom_metrics_${sym}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // --- Global custom metrics ---
  const [globalMetrics, setGlobalMetrics] = useState<CustomMetric[]>(() =>
    loadGlobalMetrics(),
  );

  // --- Active global metrics applied to this stock ---
  const [activeGlobalMetricIds, setActiveGlobalMetricIds] = useState<
    Set<string>
  >(() => {
    try {
      const saved = localStorage.getItem(`stock_global_metric_ids_${sym}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // --- Custom form ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricFormula, setNewMetricFormula] = useState("");
  const [newMetricNote, setNewMetricNote] = useState("");

  // --- Inline edit state ---
  const [editingIdx, setEditingIdx] = useState<{
    type: "builtin" | "custom";
    idx: number;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editFormula, setEditFormula] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savedRowIdx, setSavedRowIdx] = useState<number | null>(null);

  // Reload when sym changes
  useEffect(() => {
    try {
      setNote(localStorage.getItem(`analytics_notes_${sym}`) ?? "");
    } catch {
      setNote("");
    }
    try {
      const saved = localStorage.getItem(`custom_metrics_${sym}`);
      setCustomMetrics(saved ? JSON.parse(saved) : []);
    } catch {
      setCustomMetrics([]);
    }
    try {
      const saved = localStorage.getItem(`stock_active_metrics_${sym}`);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        setActiveStdMetrics(new Set(parsed.map(metricBaseKey)));
      } else {
        setActiveStdMetrics(new Set(STANDARD_METRIC_BASE_KEYS));
      }
    } catch {
      setActiveStdMetrics(new Set(STANDARD_METRIC_BASE_KEYS));
    }
    try {
      const saved = localStorage.getItem(`stock_global_metric_ids_${sym}`);
      setActiveGlobalMetricIds(saved ? new Set(JSON.parse(saved)) : new Set());
    } catch {
      setActiveGlobalMetricIds(new Set());
    }
    setGlobalMetrics(loadGlobalMetrics());
    setShowAddForm(false);
    setEditingIdx(null);
  }, [sym]);

  const builtinMetrics = useMemo(
    () => computeBuiltinMetrics(computeQuarters, periodQuarters),
    [computeQuarters, periodQuarters],
  );

  const activeBuiltinMetrics = useMemo(
    () =>
      builtinMetrics.filter((m) => activeStdMetrics.has(metricBaseKey(m.name))),
    [builtinMetrics, activeStdMetrics],
  );

  // Active global metrics evaluated for this stock
  const activeGlobalMetricsEval = useMemo(() => {
    return globalMetrics
      .filter((m) => activeGlobalMetricIds.has(m.id))
      .map((m) => {
        const { value, error } = evalCustomMetric(
          m.formula,
          computeQuarters,
          sym,
          periodQuarters,
        );
        return { ...m, value, error };
      });
  }, [
    globalMetrics,
    activeGlobalMetricIds,
    computeQuarters,
    sym,
    periodQuarters,
  ]);

  const saveCustomMetrics = useCallback(
    (metrics: CustomMetric[]) => {
      setCustomMetrics(metrics);
      try {
        localStorage.setItem(`custom_metrics_${sym}`, JSON.stringify(metrics));
      } catch {
        /* ignore */
      }
    },
    [sym],
  );

  const persistActiveStd = useCallback(
    (s: Set<string>) => {
      setActiveStdMetrics(new Set(s));
      try {
        localStorage.setItem(
          `stock_active_metrics_${sym}`,
          JSON.stringify([...s]),
        );
      } catch {
        /* ignore */
      }
    },
    [sym],
  );

  const persistActiveGlobal = useCallback(
    (s: Set<string>) => {
      setActiveGlobalMetricIds(new Set(s));
      try {
        localStorage.setItem(
          `stock_global_metric_ids_${sym}`,
          JSON.stringify([...s]),
        );
      } catch {
        /* ignore */
      }
    },
    [sym],
  );

  const addCustomMetric = useCallback(() => {
    if (!newMetricName.trim() || !newMetricFormula.trim()) return;
    const { value, error } = evalCustomMetric(
      newMetricFormula,
      computeQuarters,
      sym,
      periodQuarters,
    );
    const metric: CustomMetric = {
      id: `${Date.now()}`,
      name: newMetricName.trim(),
      formula: newMetricFormula.trim(),
      note: newMetricNote.trim() || undefined,
      value,
      error,
      isGlobal: true,
    };
    // Save to global
    const updatedGlobal = [...loadGlobalMetrics(), metric];
    saveGlobalMetrics(updatedGlobal);
    setGlobalMetrics(updatedGlobal);
    // Save to this stock's custom metrics too
    saveCustomMetrics([...customMetrics, metric]);
    // Auto-activate for this stock
    const next = new Set(activeGlobalMetricIds);
    next.add(metric.id);
    persistActiveGlobal(next);
    setNewMetricName("");
    setNewMetricFormula("");
    setNewMetricNote("");
    setShowAddForm(false);
  }, [
    newMetricName,
    newMetricFormula,
    newMetricNote,
    computeQuarters,
    customMetrics,
    saveCustomMetrics,
    activeGlobalMetricIds,
    persistActiveGlobal,
    sym,
    periodQuarters,
  ]);

  const saveRowMetric = useCallback(
    (
      type: "builtin" | "custom",
      idx: number,
      name: string,
      formula: string,
      rowNote: string,
    ) => {
      try {
        const existing: {
          type: string;
          idx: number;
          name: string;
          formula: string;
          note: string;
        }[] = JSON.parse(localStorage.getItem(`stock_metrics_${sym}`) ?? "[]");
        const key = `${type}-${idx}`;
        const filtered = existing.filter((e) => `${e.type}-${e.idx}` !== key);
        filtered.push({ type, idx, name, formula, note: rowNote });
        localStorage.setItem(`stock_metrics_${sym}`, JSON.stringify(filtered));
        setSavedRowIdx(idx);
        setTimeout(() => setSavedRowIdx(null), 1800);
      } catch {
        /* ignore */
      }
    },
    [sym],
  );

  const startEdit = (type: "builtin" | "custom", idx: number) => {
    setEditingIdx({ type, idx });
    if (type === "builtin") {
      const m = activeBuiltinMetrics[idx];
      setEditName(m?.name ?? "");
      // Load any existing override formula from localStorage
      try {
        const overrideKey = `stock_metric_formula_${sym}_${idx}`;
        const overrideFormula = localStorage.getItem(overrideKey) ?? "";
        setEditFormula(overrideFormula);
      } catch {
        setEditFormula("");
      }
      setEditNote("");
    } else {
      const m = customMetrics[idx];
      setEditName(m?.name ?? "");
      setEditFormula(m?.formula ?? "");
      setEditNote(m?.note ?? "");
    }
  };

  const applyEdit = useCallback(() => {
    if (!editingIdx) return;
    if (editingIdx.type === "custom") {
      const updated = customMetrics.map((m, i) =>
        i === editingIdx.idx
          ? {
              ...m,
              name: editName || m.name,
              formula: editFormula || m.formula,
              note: editNote || undefined,
            }
          : m,
      );
      saveCustomMetrics(updated);
      // Also update in global if isGlobal
      const oldM = customMetrics[editingIdx.idx];
      if (oldM?.isGlobal) {
        const updatedGlobal = loadGlobalMetrics().map((gm) =>
          gm.id === oldM.id
            ? {
                ...gm,
                name: editName || gm.name,
                formula: editFormula || gm.formula,
                note: editNote || undefined,
              }
            : gm,
        );
        saveGlobalMetrics(updatedGlobal);
        setGlobalMetrics(updatedGlobal);
      }
    }
    // For builtin: store formula override in localStorage if provided
    if (editingIdx.type === "builtin" && editFormula.trim()) {
      try {
        localStorage.setItem(
          `stock_metric_formula_${sym}_${editingIdx.idx}`,
          editFormula.trim(),
        );
      } catch {
        /* ignore */
      }
    }
    // Save note for builtin
    const metric =
      editingIdx.type === "builtin"
        ? activeBuiltinMetrics[editingIdx.idx]
        : customMetrics[editingIdx.idx];
    if (metric) {
      saveRowMetric(
        editingIdx.type,
        editingIdx.idx,
        editName || metric.name,
        editFormula ||
          (editingIdx.type === "custom"
            ? (metric as CustomMetric).formula
            : ""),
        editNote,
      );
    }
    setEditingIdx(null);
  }, [
    editingIdx,
    editName,
    editFormula,
    editNote,
    customMetrics,
    saveCustomMetrics,
    activeBuiltinMetrics,
    saveRowMetric,
    sym,
  ]);

  const deleteCustomMetric = useCallback(
    (id: string) => {
      saveCustomMetrics(customMetrics.filter((m) => m.id !== id));
    },
    [customMetrics, saveCustomMetrics],
  );

  const removeGlobalMetric = useCallback(
    (id: string) => {
      const next = new Set(activeGlobalMetricIds);
      next.delete(id);
      persistActiveGlobal(next);
    },
    [activeGlobalMetricIds, persistActiveGlobal],
  );

  const saveNote = () => {
    try {
      localStorage.setItem(`analytics_notes_${sym}`, note);
    } catch {
      /* ignore */
    }
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1800);
  };
  const clearNote = () => {
    setNote("");
    try {
      localStorage.removeItem(`analytics_notes_${sym}`);
    } catch {
      /* ignore */
    }
  };

  const totalRows =
    activeBuiltinMetrics.length +
    activeGlobalMetricsEval.length +
    customMetrics.length;

  return (
    <Card>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Analytics Matrix</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pre-built metrics + custom formulas for {sym}
          </p>
        </div>

        {/* Period inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="period-quarters"
              className="text-xs text-slate-400 whitespace-nowrap"
            >
              # Quarters
            </label>
            <input
              id="period-quarters"
              type="number"
              min={1}
              max={80}
              value={numQuarters}
              data-ocid="resultsanalytics.period.quarters.input"
              onChange={(e) => {
                setNumQuarters(
                  e.target.value === "" ? "" : Number(e.target.value),
                );
                setNumYears("");
              }}
              className="w-16 bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <span className="text-xs text-slate-600">or</span>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="period-years"
              className="text-xs text-slate-400 whitespace-nowrap"
            >
              # Years
            </label>
            <input
              id="period-years"
              type="number"
              min={1}
              max={20}
              value={numYears}
              data-ocid="resultsanalytics.period.years.input"
              onChange={(e) => {
                setNumYears(
                  e.target.value === "" ? "" : Number(e.target.value),
                );
                setNumQuarters("");
              }}
              className="w-16 bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
            {periodQuarters}Q / {(periodQuarters / 4).toFixed(1)}Y
          </span>
        </div>
      </div>

      {/* Notes section */}
      <div className="mb-4 bg-slate-900/60 border border-slate-700 rounded-lg p-3 space-y-2">
        <label
          htmlFor="analytics-notes"
          className="text-xs font-semibold text-slate-300 block"
        >
          Notes
        </label>
        <textarea
          id="analytics-notes"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-ocid="resultsanalytics.notes.textarea"
          placeholder={`Add plain text notes for ${sym}...`}
          rows={3}
          className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors resize-y"
        />
        <div className="flex gap-2">
          <button
            type="button"
            data-ocid="resultsanalytics.notes.save_button"
            onClick={saveNote}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
          >
            {noteSaved ? "✓ Saved" : "Save Note"}
          </button>
          {note && (
            <button
              type="button"
              data-ocid="resultsanalytics.notes.clear_button"
              onClick={clearNote}
              className="px-3 py-1.5 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-red-700 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Multi-select Metric Panel */}
      <div
        className="mb-4 flex flex-wrap items-center gap-3"
        ref={metricPanelRef}
      >
        <div className="relative">
          <button
            type="button"
            data-ocid="resultsanalytics.metrics.panel.toggle"
            onClick={() => setShowMetricPanel((o) => !o)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            Select Metrics ▾
            <span className="bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded text-xs">
              {activeStdMetrics.size + activeGlobalMetricIds.size}
            </span>
          </button>
          {showMetricPanel && (
            <div className="absolute top-9 left-0 z-40 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-72 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-400 px-1 mb-1">
                Standard Metrics
              </div>
              {STANDARD_METRIC_BASE_KEYS.map((baseKey, si) => (
                <label
                  key={baseKey}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    data-ocid={`resultsanalytics.metrics.std.checkbox.${si + 1}`}
                    checked={activeStdMetrics.has(baseKey)}
                    onChange={() => {
                      const next = new Set(activeStdMetrics);
                      if (next.has(baseKey)) next.delete(baseKey);
                      else next.add(baseKey);
                      persistActiveStd(next);
                    }}
                    className="w-3 h-3 rounded accent-blue-500"
                  />
                  <span className="text-xs text-slate-300">{baseKey}</span>
                  {activeStdMetrics.has(baseKey) && (
                    <span className="ml-auto text-green-400 text-xs">✓</span>
                  )}
                </label>
              ))}
              {globalMetrics.length > 0 && (
                <>
                  <div className="text-xs font-semibold text-slate-400 px-1 pt-2 border-t border-slate-700">
                    Saved Custom Metrics
                  </div>
                  {globalMetrics.map((m, gi) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        data-ocid={`resultsanalytics.metrics.custom.checkbox.${gi + 1}`}
                        checked={activeGlobalMetricIds.has(m.id)}
                        onChange={() => {
                          const next = new Set(activeGlobalMetricIds);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          persistActiveGlobal(next);
                        }}
                        className="w-3 h-3 rounded accent-purple-500"
                      />
                      <span className="text-xs text-slate-300">{m.name}</span>
                      <span className="ml-auto text-purple-400 text-xs">
                        global
                      </span>
                    </label>
                  ))}
                </>
              )}
              <div className="pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    setShowMetricPanel(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  + Create Custom Metric...
                </button>
              </div>
            </div>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {computeQuarters.length} periods computed
        </span>
      </div>

      {/* Add Custom Metric Form */}
      {showAddForm && (
        <div
          data-ocid="stockresults.analytics.modal"
          className="mb-4 bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3"
        >
          <h3 className="text-xs font-semibold text-slate-300">
            New Custom Metric{" "}
            <span className="text-purple-400 font-normal">
              (saved globally — available for all stocks)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="custom-metric-name"
                className="text-xs text-slate-500 block mb-1"
              >
                Metric Name
              </label>
              <input
                id="custom-metric-name"
                type="text"
                placeholder="e.g. P/E Proxy"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
                data-ocid="resultsanalytics.analytics.input"
                className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="custom-metric-formula"
                className="text-xs text-slate-500 block mb-1"
              >
                Formula
              </label>
              <input
                id="custom-metric-formula"
                type="text"
                placeholder="e.g. Revenue / NetProfit * 100"
                value={newMetricFormula}
                onChange={(e) => setNewMetricFormula(e.target.value)}
                data-ocid="resultsanalytics.analytics.textarea"
                className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="custom-metric-note"
              className="text-xs text-slate-500 block mb-1"
            >
              Note (optional)
            </label>
            <input
              id="custom-metric-note"
              type="text"
              placeholder="Plain text note for this metric..."
              value={newMetricNote}
              onChange={(e) => setNewMetricNote(e.target.value)}
              data-ocid="resultsanalytics.analytics.note.input"
              className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 space-y-1">
            <div>
              <span className="text-slate-300 font-medium">
                Financial variables:{" "}
              </span>
              <span className="text-emerald-400">
                Revenue, NetProfit, EBITDA, EPS, EbitdaMargin, NpMargin
              </span>
              <span className="text-slate-500"> (period averages)</span>
            </div>
            <div>
              <span className="text-slate-300 font-medium">Index: </span>
              <span className="text-amber-400">NiftyClose</span>
            </div>
            <div>
              <span className="text-slate-300 font-medium">
                Macro Indicators:{" "}
              </span>
              <span className="text-sky-400">
                MacroCPI (
                {(
                  MACRO_CPI_WPI_FULL[MACRO_CPI_WPI_FULL.length - 1]?.cpi ?? 5.2
                ).toFixed(1)}
                %), MacroWPI (
                {(
                  MACRO_CPI_WPI_FULL[MACRO_CPI_WPI_FULL.length - 1]?.wpi ?? 2.1
                ).toFixed(1)}
                %), FIIFlow, MacroDII, MacroUSDINR (
                {(
                  MACRO_USDINT_FULL[MACRO_USDINT_FULL.length - 1]?.value ?? 83.5
                ).toFixed(1)}
                ), MacroCrudeWTI, MacroCrudeBrent, Macro3YGsec, Macro5YGsec,
                Macro10YGsec, MacroGDP (
                {(
                  MACRO_GDP_CAD_FULL[MACRO_GDP_CAD_FULL.length - 1]?.gdp ?? 7.0
                ).toFixed(1)}
                %), MacroRepoRate (
                {(
                  MACRO_RATES_FULL[MACRO_RATES_FULL.length - 1]?.repoRate ?? 6.5
                ).toFixed(2)}
                %), MacroFXReserve
              </span>
            </div>
            <div>
              <span className="text-slate-300 font-medium">
                Index &amp; Stock OI:{" "}
              </span>
              <span className="text-emerald-400">
                {(() => {
                  const refD = new Date();
                  const nCM = NIFTY_PCR_OI_FULL.CM;
                  const bCM = BANKNIFTY_PCR_OI_FULL.CM;
                  const nPE = getQuarterlyOIValue(nCM, refD, "peOI");
                  const nCE = getQuarterlyOIValue(nCM, refD, "ceOI");
                  const nPCR =
                    getQuarterlyOIValue(nCM, refD, "pcrRatio") ||
                    +(nPE / (nCE || 1)).toFixed(3);
                  const bPE = getQuarterlyOIValue(bCM, refD, "peOI");
                  const bCE = getQuarterlyOIValue(bCM, refD, "ceOI");
                  const bPCR =
                    getQuarterlyOIValue(bCM, refD, "pcrRatio") ||
                    +(bPE / (bCE || 1)).toFixed(3);
                  const stockOIKey = Object.keys(stockPCROIFullCache).find(
                    (k) => k === `${sym}_CM` || k.startsWith(`${sym}_`),
                  );
                  const sArr = stockOIKey
                    ? (stockPCROIFullCache[stockOIKey] ?? [])
                    : [];
                  const sPE = getQuarterlyOIValue(sArr, refD, "peOI");
                  const sCE = getQuarterlyOIValue(sArr, refD, "ceOI");
                  const sPCR =
                    getQuarterlyOIValue(sArr, refD, "pcrRatio") ||
                    +(sPE / (sCE || 1)).toFixed(3);
                  const sData = getStockData(sym);
                  const sClose = sData[sData.length - 1]?.close ?? 0;
                  return `NiftyOI_PE (${nPE.toLocaleString()}), NiftyOI_CE (${nCE.toLocaleString()}), NiftyPCR (${nPCR}), BankNiftyOI_PE (${bPE.toLocaleString()}), BankNiftyOI_CE (${bCE.toLocaleString()}), BankNiftyPCR (${bPCR}), StockOI_PE (${sPE.toLocaleString()}), StockOI_CE (${sCE.toLocaleString()}), StockPCR (${sPCR}), StockClose (${sClose.toFixed(0)}), StockVolume`;
                })()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-ocid="stockresults.analytics.save_button"
              onClick={addCustomMetric}
              className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              Save Metric
            </button>
            <button
              type="button"
              data-ocid="stockresults.analytics.cancel_button"
              onClick={() => {
                setShowAddForm(false);
                setNewMetricName("");
                setNewMetricFormula("");
                setNewMetricNote("");
              }}
              className="px-4 py-1.5 text-xs border border-slate-600 text-slate-400 rounded-lg hover:border-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Metrics Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-xs"
          data-ocid="stockresults.analytics.table"
        >
          <thead>
            <tr className="bg-slate-900">
              {[
                "Metric",
                "Value",
                "Description / Formula",
                "Note",
                "Actions",
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
            {/* Standard (builtin) metrics */}
            {activeBuiltinMetrics.map((m, i) =>
              editingIdx?.type === "builtin" && editingIdx.idx === i ? (
                <tr
                  key={m.name}
                  className="bg-slate-800/60"
                  data-ocid={`stockresults.analytics.row.${i + 1}`}
                >
                  <td
                    className="px-3 py-2 border-b border-slate-800"
                    colSpan={5}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none w-36"
                        placeholder="Name"
                      />
                      <input
                        value={editFormula}
                        onChange={(e) => setEditFormula(e.target.value)}
                        className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none w-52"
                        placeholder="Formula override (optional)..."
                      />
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none flex-1 min-w-32"
                        placeholder="Add note..."
                      />
                      <button
                        type="button"
                        onClick={applyEdit}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="px-3 py-1 text-xs border border-slate-600 text-slate-400 rounded hover:border-slate-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={m.name}
                  className="hover:bg-slate-700/30 transition-colors"
                  data-ocid={`stockresults.analytics.row.${i + 1}`}
                >
                  <td className="px-3 py-2.5 text-slate-200 border-b border-slate-800 font-medium">
                    {m.name}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-800">
                    {(() => {
                      try {
                        const overrideFormula = localStorage.getItem(
                          `stock_metric_formula_${sym}_${i}`,
                        );
                        if (overrideFormula) {
                          const { value, error } = evalCustomMetric(
                            overrideFormula,
                            computeQuarters,
                            sym,
                            periodQuarters,
                          );
                          if (error)
                            return (
                              <span className="text-red-400 text-xs">
                                {error}
                              </span>
                            );
                          return (
                            <span
                              className="font-semibold text-amber-400"
                              title="Formula override active"
                            >
                              {value}{" "}
                              <span className="text-xs text-amber-600">†</span>
                            </span>
                          );
                        }
                      } catch {
                        /* ignore */
                      }
                      return (
                        <span className="font-semibold text-blue-400">
                          {m.value}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 border-b border-slate-800 max-w-xs">
                    {(() => {
                      try {
                        const overrideFormula = localStorage.getItem(
                          `stock_metric_formula_${sym}_${i}`,
                        );
                        if (overrideFormula)
                          return (
                            <span
                              className="font-mono text-xs text-amber-600/80"
                              title="Formula override"
                            >
                              {overrideFormula}
                            </span>
                          );
                      } catch {
                        /* ignore */
                      }
                      return m.description;
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 border-b border-slate-800 text-xs italic max-w-[120px] truncate">
                    {/* Saved note if any */}
                    {(() => {
                      try {
                        const arr = JSON.parse(
                          localStorage.getItem(`stock_metrics_${sym}`) ?? "[]",
                        );
                        const found = arr.find(
                          (e: { type: string; idx: number; note?: string }) =>
                            e.type === "builtin" && e.idx === i,
                        );
                        return found?.note ?? "—";
                      } catch {
                        return "—";
                      }
                    })()}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-800">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        type="button"
                        data-ocid={`resultsanalytics.analytics.save_button.${i + 1}`}
                        onClick={() =>
                          saveRowMetric("builtin", i, m.name, "", "")
                        }
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${savedRowIdx === i ? "border-green-700 text-green-400" : "border-slate-600 text-slate-400 hover:border-blue-600 hover:text-blue-400"}`}
                      >
                        {savedRowIdx === i ? "✓ Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        data-ocid={`resultsanalytics.analytics.edit_button.${i + 1}`}
                        onClick={() => startEdit("builtin", i)}
                        className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:border-amber-600 hover:text-amber-400 transition-colors"
                      >
                        Modify
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}

            {/* Active global custom metrics */}
            {activeGlobalMetricsEval.map((m, gi) => {
              const i = activeBuiltinMetrics.length + gi;
              return (
                <tr
                  key={`global-${m.id}`}
                  className="hover:bg-slate-700/30 transition-colors"
                  data-ocid={`stockresults.analytics.custom.row.${gi + 1}`}
                >
                  <td className="px-3 py-2.5 text-slate-200 border-b border-slate-800 font-medium">
                    {m.name}
                    <span className="ml-2 text-xs text-purple-400 bg-purple-950 px-1.5 py-0.5 rounded">
                      global
                    </span>
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-800">
                    {m.error ? (
                      <span className="text-red-400 text-xs">{m.error}</span>
                    ) : (
                      <span className="font-semibold text-amber-400">
                        {m.value}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-slate-500 border-b border-slate-800 font-mono text-xs max-w-xs truncate"
                    title={m.formula}
                  >
                    {m.formula}
                  </td>
                  <td
                    className="px-3 py-2.5 text-slate-500 border-b border-slate-800 text-xs italic max-w-[120px] truncate"
                    title={m.note}
                  >
                    {m.note ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-800">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        type="button"
                        data-ocid={`resultsanalytics.analytics.save_button.${i + 1}`}
                        onClick={() =>
                          saveRowMetric(
                            "custom",
                            gi,
                            m.name,
                            m.formula,
                            m.note ?? "",
                          )
                        }
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${savedRowIdx === i ? "border-green-700 text-green-400" : "border-slate-600 text-slate-400 hover:border-blue-600 hover:text-blue-400"}`}
                      >
                        {savedRowIdx === i ? "✓ Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGlobalMetric(m.id)}
                        className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-500 hover:border-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Stock-specific custom metrics */}
            {customMetrics
              .filter((m) => !m.isGlobal)
              .map((m, ci) => {
                const i =
                  activeBuiltinMetrics.length +
                  activeGlobalMetricsEval.length +
                  ci;
                return editingIdx?.type === "custom" &&
                  editingIdx.idx === ci ? (
                  <tr
                    key={m.id}
                    className="bg-slate-800/60"
                    data-ocid={`stockresults.analytics.custom.row.${activeGlobalMetricsEval.length + ci + 1}`}
                  >
                    <td
                      className="px-3 py-2 border-b border-slate-800"
                      colSpan={5}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none w-28"
                          placeholder="Name"
                        />
                        <input
                          value={editFormula}
                          onChange={(e) => setEditFormula(e.target.value)}
                          className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none w-48"
                          placeholder="Formula"
                        />
                        <input
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="bg-slate-700 border border-slate-500 text-slate-200 text-xs rounded px-2 py-1 outline-none flex-1 min-w-28"
                          placeholder="Note"
                        />
                        <button
                          type="button"
                          onClick={applyEdit}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIdx(null)}
                          className="px-3 py-1 text-xs border border-slate-600 text-slate-400 rounded hover:border-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-700/30 transition-colors"
                    data-ocid={`stockresults.analytics.custom.row.${activeGlobalMetricsEval.length + ci + 1}`}
                  >
                    <td className="px-3 py-2.5 text-slate-200 border-b border-slate-800 font-medium">
                      {m.name}
                      <span className="ml-2 text-xs text-teal-400 bg-teal-950 px-1.5 py-0.5 rounded">
                        custom
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-800">
                      {m.error ? (
                        <span className="text-red-400 text-xs">{m.error}</span>
                      ) : (
                        <span className="font-semibold text-amber-400">
                          {m.value}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-slate-500 border-b border-slate-800 font-mono text-xs max-w-xs truncate"
                      title={m.formula}
                    >
                      {m.formula}
                    </td>
                    <td
                      className="px-3 py-2.5 text-slate-500 border-b border-slate-800 text-xs italic max-w-[120px] truncate"
                      title={m.note}
                    >
                      {m.note ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-800">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          type="button"
                          data-ocid={`resultsanalytics.analytics.save_button.${i + 1}`}
                          onClick={() =>
                            saveRowMetric(
                              "custom",
                              ci,
                              m.name,
                              m.formula,
                              m.note ?? "",
                            )
                          }
                          className={`text-xs px-2 py-0.5 rounded border transition-colors ${savedRowIdx === i ? "border-green-700 text-green-400" : "border-slate-600 text-slate-400 hover:border-blue-600 hover:text-blue-400"}`}
                        >
                          {savedRowIdx === i ? "✓ Saved" : "Save"}
                        </button>
                        <button
                          type="button"
                          data-ocid={`resultsanalytics.analytics.edit_button.${i + 1}`}
                          onClick={() => startEdit("custom", ci)}
                          className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:border-amber-600 hover:text-amber-400 transition-colors"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          data-ocid={`stockresults.analytics.delete_button.${ci + 1}`}
                          onClick={() => deleteCustomMetric(m.id)}
                          className="text-red-500 hover:text-red-400 transition-colors text-xs px-2 py-0.5 rounded border border-red-900 hover:border-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

            {totalRows === 0 && (
              <tr>
                <td
                  colSpan={5}
                  data-ocid="stockresults.analytics.empty_state"
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No data available for analytics
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Panel 3: Visualization ───────────────────────────────────────────────────
const CHART_SERIES_COLORS: Record<string, string> = {
  Revenue: "#3b82f6",
  NetProfit: "#22c55e",
  EBITDA: "#f97316",
  EPS: "#a855f7",
  EbitdaMargin: "#14b8a6",
  NpMargin: "#eab308",
};

// Extra colors for custom series added via condition dropdown
const EXTRA_CONDITION_COLORS = [
  "#f43f5e",
  "#06b6d4",
  "#84cc16",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

type ChartType = "Bar" | "Line" | "Composed";

// Macro series definitions for Visualization Panel
const MACRO_VIZ_SERIES = [
  { key: "macro_cpi", label: "CPI (MoM %)", color: "#f59e0b" },
  { key: "macro_wpi", label: "WPI (MoM %)", color: "#fbbf24" },
  { key: "macro_fii", label: "FII Flow (Cr)", color: "#f97316" },
  { key: "macro_dii", label: "DII Flow (Cr)", color: "#fb923c" },
  { key: "macro_usdinr", label: "USD/INR", color: "#f43f5e" },
  { key: "macro_wti", label: "Crude WTI", color: "#ec4899" },
  { key: "macro_brent", label: "Crude Brent", color: "#e879f9" },
  { key: "macro_gsec10y", label: "G-Sec 10Y", color: "#a78bfa" },
  { key: "macro_gdp", label: "GDP Growth %", color: "#818cf8" },
  { key: "macro_repo", label: "Repo Rate", color: "#60a5fa" },
  { key: "macro_fxres", label: "FX Reserve", color: "#34d399" },
] as const;

// OI series definitions for Visualization Panel
const OI_VIZ_SERIES = [
  {
    key: "oi_nifty_pcr",
    label: "Nifty PCR",
    color: "#22c55e",
    oiField: "pcrRatio" as const,
    source: "nifty",
  },
  {
    key: "oi_nifty_pe",
    label: "Nifty PE OI (right)",
    color: "#4ade80",
    oiField: "peOI" as const,
    source: "nifty",
  },
  {
    key: "oi_nifty_ce",
    label: "Nifty CE OI (right)",
    color: "#86efac",
    oiField: "ceOI" as const,
    source: "nifty",
  },
  {
    key: "oi_bnk_pcr",
    label: "BankNifty PCR",
    color: "#06b6d4",
    oiField: "pcrRatio" as const,
    source: "banknifty",
  },
  {
    key: "oi_bnk_pe",
    label: "BankNifty PE OI (right)",
    color: "#22d3ee",
    oiField: "peOI" as const,
    source: "banknifty",
  },
  {
    key: "oi_bnk_ce",
    label: "BankNifty CE OI (right)",
    color: "#67e8f9",
    oiField: "ceOI" as const,
    source: "banknifty",
  },
  {
    key: "oi_stock_pcr",
    label: "Stock PCR",
    color: "#a855f7",
    oiField: "pcrRatio" as const,
    source: "stock",
  },
  {
    key: "oi_stock_pe",
    label: "Stock PE OI (right)",
    color: "#c084fc",
    oiField: "peOI" as const,
    source: "stock",
  },
  {
    key: "oi_stock_ce",
    label: "Stock CE OI (right)",
    color: "#d8b4fe",
    oiField: "ceOI" as const,
    source: "stock",
  },
  {
    key: "oi_stock_close",
    label: "Stock Close (right)",
    color: "#f472b6",
    oiField: "pcrRatio" as const,
    source: "stock_close",
  },
  {
    key: "oi_stock_vol",
    label: "Stock Volume (right)",
    color: "#fb7185",
    oiField: "peOI" as const,
    source: "stock_vol",
  },
] as const;

function VisualizationPanel({ sym }: { sym: string }) {
  // Generate quarters internally
  const allQuarters = useMemo(() => genQuarterlyResults(sym), [sym]);

  // --- Period inputs (same as AnalyticsMatrixPanel) ---
  const [numQuarters, setNumQuarters] = useState<number | "">(20);
  const [numYears, setNumYears] = useState<number | "">("");

  const periodQuarters: number =
    numYears !== ""
      ? Number(numYears) * 4
      : numQuarters !== ""
        ? Number(numQuarters)
        : 20;

  const [selectedSeries, setSelectedSeries] = useState<Record<string, boolean>>(
    {
      Revenue: true,
      NetProfit: true,
      EBITDA: false,
      EPS: false,
    },
  );
  const [chartType, setChartType] = useState<ChartType>("Composed");

  // Multi-select conditions panel
  const [showCondPanel, setShowCondPanel] = useState(false);
  const condPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        condPanelRef.current &&
        !condPanelRef.current.contains(e.target as Node)
      )
        setShowCondPanel(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Custom series added from condition selection: { key, label, formula, color }
  const [customConditionSeries, setCustomConditionSeries] = useState<
    {
      key: string;
      label: string;
      formula: string;
      color: string;
      yAxis?: "left" | "right";
    }[]
  >([]);

  // Active macro/OI series keys
  const [activeMacroKeys, setActiveMacroKeys] = useState<Set<string>>(
    new Set(),
  );
  const [activeOIKeys, setActiveOIKeys] = useState<Set<string>>(new Set());

  const display = useMemo(
    () =>
      allQuarters
        .slice(0, Math.min(periodQuarters, allQuarters.length))
        .reverse(),
    [allQuarters, periodQuarters],
  );

  // Get stock OI data for the selected stock
  const stockOIArr = useMemo((): ExtendedPCRBarData[] => {
    const k = Object.keys(stockPCROIFullCache).find(
      (key) => key === `${sym}_CM` || key.startsWith(`${sym}_`),
    );
    return k ? (stockPCROIFullCache[k] ?? []) : [];
  }, [sym]);

  const stockPriceArr = useMemo(() => getStockData(sym), [sym]);

  const chartData = useMemo(
    () =>
      display.map((q) => {
        const base: Record<string, number | string> = {
          name: q.quarter,
          Revenue: q.revenue,
          NetProfit: q.netProfit,
          EBITDA: q.ebitda,
          EPS: q.eps,
          EbitdaMargin: q.ebitdaMargin,
          NpMargin: q.netProfitMargin,
        };
        // Evaluate custom condition series per quarter
        for (const cs of customConditionSeries) {
          const { value } = evalCustomMetric(
            cs.formula,
            [q],
            sym,
            periodQuarters,
          );
          base[cs.key] = value ?? 0;
        }
        // Macro series: use nearest value to quarter date
        for (const ms of MACRO_VIZ_SERIES) {
          if (!activeMacroKeys.has(ms.key)) continue;
          let val = 0;
          switch (ms.key) {
            case "macro_cpi":
              val = getMacroValueNearDate(
                MACRO_CPI_WPI_FULL,
                q.quarterDate,
                "cpi",
              );
              break;
            case "macro_wpi":
              val = getMacroValueNearDate(
                MACRO_CPI_WPI_FULL,
                q.quarterDate,
                "wpi",
              );
              break;
            case "macro_fii":
              val = getMacroValueNearDate(MACRO_FII_FULL, q.quarterDate, "fii");
              break;
            case "macro_dii":
              val = getMacroValueNearDate(MACRO_FII_FULL, q.quarterDate, "dii");
              break;
            case "macro_usdinr":
              val = getMacroValueNearDate(
                MACRO_USDINT_FULL,
                q.quarterDate,
                "value",
              );
              break;
            case "macro_wti":
              val = getMacroValueNearDate(
                MACRO_CRUDE_FULL,
                q.quarterDate,
                "wti",
              );
              break;
            case "macro_brent":
              val = getMacroValueNearDate(
                MACRO_CRUDE_FULL,
                q.quarterDate,
                "brent",
              );
              break;
            case "macro_gsec10y":
              val = getMacroValueNearDate(
                MACRO_GSEC_FULL,
                q.quarterDate,
                "y10",
              );
              break;
            case "macro_gdp":
              val = getMacroValueNearDate(
                MACRO_GDP_CAD_FULL,
                q.quarterDate,
                "gdp",
              );
              break;
            case "macro_repo":
              val = getMacroValueNearDate(
                MACRO_RATES_FULL,
                q.quarterDate,
                "repoRate",
              );
              break;
            case "macro_fxres":
              val = getMacroValueNearDate(
                MACRO_FXRESERVE_FULL,
                q.quarterDate,
                "value",
              );
              break;
          }
          base[ms.key] = val;
        }
        // OI series: aggregate quarterly window
        for (const os of OI_VIZ_SERIES) {
          if (!activeOIKeys.has(os.key)) continue;
          let val = 0;
          if (os.source === "nifty") {
            val = getQuarterlyOIValue(
              NIFTY_PCR_OI_FULL.CM,
              q.quarterDate,
              os.oiField,
            );
          } else if (os.source === "banknifty") {
            val = getQuarterlyOIValue(
              BANKNIFTY_PCR_OI_FULL.CM,
              q.quarterDate,
              os.oiField,
            );
          } else if (os.source === "stock") {
            val = getQuarterlyOIValue(stockOIArr, q.quarterDate, os.oiField);
          } else if (os.source === "stock_close") {
            // Average close price in the quarter window
            const m = q.quarterDate.getMonth();
            const y = q.quarterDate.getFullYear();
            const rows = stockPriceArr.filter((d) => {
              const dm = d.date.getMonth();
              const dy = d.date.getFullYear();
              return dy === y && (dm === m || dm === m + 1 || dm === m + 2);
            });
            val =
              rows.length > 0
                ? +(
                    rows.reduce((s, d) => s + d.close, 0) / rows.length
                  ).toFixed(2)
                : (stockPriceArr[stockPriceArr.length - 1]?.close ?? 0);
          } else if (os.source === "stock_vol") {
            const m = q.quarterDate.getMonth();
            const y = q.quarterDate.getFullYear();
            const rows = stockPriceArr.filter((d) => {
              const dm = d.date.getMonth();
              const dy = d.date.getFullYear();
              return dy === y && (dm === m || dm === m + 1 || dm === m + 2);
            });
            val =
              rows.length > 0
                ? Math.round(
                    rows.reduce((s, d) => s + d.volume, 0) / rows.length,
                  )
                : 0;
          }
          base[os.key] = val;
        }
        return base;
      }),
    [
      display,
      customConditionSeries,
      activeMacroKeys,
      activeOIKeys,
      sym,
      periodQuarters,
      stockOIArr,
      stockPriceArr,
    ],
  );

  const financialSeries = useMemo(() => ["Revenue", "NetProfit", "EBITDA"], []);
  const perShareSeries = useMemo(() => ["EPS"], []);
  const marginSeries = useMemo(() => ["EbitdaMargin", "NpMargin"], []);
  const stdAllSeries = useMemo(
    () => [...financialSeries, ...perShareSeries, ...marginSeries],
    [financialSeries, perShareSeries, marginSeries],
  );

  // OI keys that use right axis (large OI values)
  const oiRightAxisKeys = new Set([
    "oi_nifty_pe",
    "oi_nifty_ce",
    "oi_bnk_pe",
    "oi_bnk_ce",
    "oi_stock_pe",
    "oi_stock_ce",
    "oi_stock_close",
    "oi_stock_vol",
  ]);

  const allSeries = useMemo(
    () => [
      ...stdAllSeries,
      ...customConditionSeries.map((cs) => cs.key),
      ...[...activeMacroKeys],
      ...[...activeOIKeys],
    ],
    [stdAllSeries, customConditionSeries, activeMacroKeys, activeOIKeys],
  );

  // Build combined selected + active state
  const allSelectedSeries: Record<string, boolean> = { ...selectedSeries };
  for (const cs of customConditionSeries) allSelectedSeries[cs.key] = true;
  for (const k of activeMacroKeys) allSelectedSeries[k] = true;
  for (const k of activeOIKeys) allSelectedSeries[k] = true;

  const activeFinancial = financialSeries.filter((s) => allSelectedSeries[s]);
  const activeEPS = perShareSeries.filter((s) => allSelectedSeries[s]);
  const activeMargins = marginSeries.filter((s) => allSelectedSeries[s]);
  const hasActiveMacroOrOI =
    activeMacroKeys.size > 0 ||
    activeOIKeys.size > 0 ||
    customConditionSeries.some((cs) => cs.yAxis === "right");
  const hasRightAxis = activeMargins.length > 0 || hasActiveMacroOrOI;

  const baseSeriesLabels: Record<string, string> = useMemo(
    () => ({
      Revenue: "Revenue (Cr)",
      NetProfit: "Net Profit (Cr)",
      EBITDA: "EBITDA (Cr)",
      EPS: "EPS (₹)",
      EbitdaMargin: "EBITDA Margin%",
      NpMargin: "NP Margin%",
    }),
    [],
  );

  const seriesLabels: Record<string, string> = { ...baseSeriesLabels };
  for (const cs of customConditionSeries) seriesLabels[cs.key] = cs.label;
  for (const ms of MACRO_VIZ_SERIES) seriesLabels[ms.key] = ms.label;
  for (const os of OI_VIZ_SERIES) seriesLabels[os.key] = os.label;

  const seriesColors: Record<string, string> = { ...CHART_SERIES_COLORS };
  for (const cs of customConditionSeries) seriesColors[cs.key] = cs.color;
  for (const ms of MACRO_VIZ_SERIES) seriesColors[ms.key] = ms.color;
  for (const os of OI_VIZ_SERIES) seriesColors[os.key] = os.color;

  function getYAxisId(key: string): "left" | "right" {
    if (marginSeries.includes(key)) return "right";
    if (activeMacroKeys.has(key)) return "right";
    if (activeOIKeys.has(key))
      return oiRightAxisKeys.has(key) ? "right" : "right"; // OI PCR also on right for clarity
    const cs = customConditionSeries.find((c) => c.key === key);
    if (cs?.yAxis === "right") return "right";
    return "left";
  }

  function renderSeries(key: string) {
    const color = seriesColors[key] ?? SECTOR_COLORS[0];
    const yAxisId = getYAxisId(key);
    const isCustomCondition = customConditionSeries.some(
      (cs) => cs.key === key,
    );
    const isMacroOrOI = activeMacroKeys.has(key) || activeOIKeys.has(key);

    if (chartType === "Bar") {
      return (
        <Bar
          key={key}
          dataKey={key}
          name={seriesLabels[key]}
          fill={color}
          yAxisId={yAxisId}
        />
      );
    }
    if (chartType === "Line") {
      return (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          name={seriesLabels[key]}
          stroke={color}
          dot={false}
          yAxisId={yAxisId}
        />
      );
    }
    // Composed
    if (marginSeries.includes(key) || isCustomCondition || isMacroOrOI) {
      return (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          name={seriesLabels[key]}
          stroke={color}
          dot={false}
          yAxisId={yAxisId}
          strokeWidth={2}
        />
      );
    }
    return (
      <Bar
        key={key}
        dataKey={key}
        name={seriesLabels[key]}
        fill={color}
        yAxisId="left"
      />
    );
  }

  const periodLabel =
    periodQuarters % 4 === 0 ? `${periodQuarters / 4}Y` : `${periodQuarters}Q`;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Visualization</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Last {periodLabel} ({display.length} quarters) — {sym}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Period inputs */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="viz-period-quarters"
              className="text-xs text-slate-400 whitespace-nowrap"
            >
              # Quarters
            </label>
            <input
              id="viz-period-quarters"
              type="number"
              min={1}
              max={80}
              value={numQuarters}
              data-ocid="resultsanalytics.viz.quarters.input"
              onChange={(e) => {
                setNumQuarters(
                  e.target.value === "" ? "" : Number(e.target.value),
                );
                setNumYears("");
              }}
              className="w-16 bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <span className="text-xs text-slate-600">or</span>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="viz-period-years"
              className="text-xs text-slate-400 whitespace-nowrap"
            >
              # Years
            </label>
            <input
              id="viz-period-years"
              type="number"
              min={1}
              max={20}
              value={numYears}
              data-ocid="resultsanalytics.viz.years.input"
              onChange={(e) => {
                setNumYears(
                  e.target.value === "" ? "" : Number(e.target.value),
                );
                setNumQuarters("");
              }}
              className="w-16 bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
            {periodQuarters}Q / {(periodQuarters / 4).toFixed(1)}Y
          </span>
          {/* Chart type toggle */}
          <div className="flex gap-1">
            {(["Bar", "Line", "Composed"] as ChartType[]).map((ct) => (
              <button
                type="button"
                key={ct}
                data-ocid={`stockresults.viz.${ct.toLowerCase()}.toggle`}
                onClick={() => setChartType(ct)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${chartType === ct ? "bg-blue-600 border-blue-600 text-white" : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400"}`}
              >
                {ct}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-select Conditions Panel */}
      <div
        className="flex flex-wrap items-center gap-3 mb-3"
        ref={condPanelRef}
      >
        <div className="relative">
          <button
            type="button"
            data-ocid="resultsanalytics.viz.conditions.panel.toggle"
            onClick={() => setShowCondPanel((o) => !o)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            Add Conditions ▾
            {customConditionSeries.length +
              activeMacroKeys.size +
              activeOIKeys.size >
              0 && (
              <span className="bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded text-xs">
                {customConditionSeries.length +
                  activeMacroKeys.size +
                  activeOIKeys.size}
              </span>
            )}
          </button>
          {showCondPanel && (
            <div className="absolute top-9 left-0 z-40 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-80 p-3 space-y-2 max-h-[520px] overflow-y-auto">
              {/* Standard Series */}
              <div className="text-xs font-semibold text-slate-400 px-1 mb-1">
                Standard Series
              </div>
              {stdAllSeries.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={!!selectedSeries[s]}
                    onChange={(e) =>
                      setSelectedSeries((prev) => ({
                        ...prev,
                        [s]: e.target.checked,
                      }))
                    }
                    className="w-3 h-3 rounded accent-blue-500"
                  />
                  <span
                    className="text-xs"
                    style={{ color: CHART_SERIES_COLORS[s] ?? "#94a3b8" }}
                  >
                    {seriesLabels[s]}
                  </span>
                </label>
              ))}

              {/* Saved Custom Metrics */}
              {(() => {
                const globalMetrics = loadGlobalMetrics();
                if (globalMetrics.length === 0) return null;
                return (
                  <>
                    <div className="text-xs font-semibold text-slate-400 px-1 pt-2 border-t border-slate-700">
                      Saved Custom Metrics
                    </div>
                    {globalMetrics.map((m, gi) => {
                      const key = `global_${m.id}`;
                      const isActive = customConditionSeries.some(
                        (cs) => cs.key === key,
                      );
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => {
                              if (isActive) {
                                setCustomConditionSeries((prev) =>
                                  prev.filter((cs) => cs.key !== key),
                                );
                              } else {
                                const color =
                                  EXTRA_CONDITION_COLORS[
                                    gi % EXTRA_CONDITION_COLORS.length
                                  ];
                                setCustomConditionSeries((prev) => [
                                  ...prev,
                                  {
                                    key,
                                    label: `${m.name} (global)`,
                                    formula: m.formula,
                                    color,
                                  },
                                ]);
                              }
                            }}
                            className="w-3 h-3 rounded accent-purple-500"
                          />
                          <span className="text-xs text-slate-300">
                            {m.name}
                          </span>
                          <span className="ml-auto text-purple-400 text-xs">
                            global
                          </span>
                        </label>
                      );
                    })}
                  </>
                );
              })()}

              {/* Stock-Saved Metrics */}
              {(() => {
                try {
                  const stockSaved: { name: string; formula: string }[] =
                    JSON.parse(
                      localStorage.getItem(`stock_metrics_${sym}`) ?? "[]",
                    ).filter((m: { formula?: string }) => !!m.formula);
                  if (stockSaved.length === 0) return null;
                  return (
                    <>
                      <div className="text-xs font-semibold text-slate-400 px-1 pt-2 border-t border-slate-700">
                        Stock-Saved Metrics
                      </div>
                      {stockSaved.map((m, si) => {
                        const key = `saved_${m.name}`;
                        const isActive = customConditionSeries.some(
                          (cs) => cs.key === key,
                        );
                        return (
                          <label
                            key={m.name}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={() => {
                                if (isActive) {
                                  setCustomConditionSeries((prev) =>
                                    prev.filter((cs) => cs.key !== key),
                                  );
                                } else {
                                  const color =
                                    EXTRA_CONDITION_COLORS[
                                      (si + 3) % EXTRA_CONDITION_COLORS.length
                                    ];
                                  setCustomConditionSeries((prev) => [
                                    ...prev,
                                    {
                                      key,
                                      label: `${m.name} (saved)`,
                                      formula: m.formula,
                                      color,
                                    },
                                  ]);
                                }
                              }}
                              className="w-3 h-3 rounded accent-teal-500"
                            />
                            <span className="text-xs text-slate-300">
                              {m.name}
                            </span>
                            <span className="ml-auto text-teal-400 text-xs">
                              saved
                            </span>
                          </label>
                        );
                      })}
                    </>
                  );
                } catch {
                  return null;
                }
              })()}

              {/* Macro Indicators Section */}
              <div className="text-xs font-semibold text-amber-400 px-1 pt-2 border-t border-slate-700">
                Macro Indicators{" "}
                <span className="text-slate-500 font-normal">(right axis)</span>
              </div>
              {MACRO_VIZ_SERIES.map((ms, mi) => {
                const isActive = activeMacroKeys.has(ms.key);
                return (
                  <label
                    key={ms.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      data-ocid={`resultsanalytics.viz.macro.checkbox.${mi + 1}`}
                      checked={isActive}
                      onChange={() => {
                        setActiveMacroKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(ms.key)) next.delete(ms.key);
                          else next.add(ms.key);
                          return next;
                        });
                      }}
                      className="w-3 h-3 rounded accent-amber-500"
                    />
                    <span className="text-xs" style={{ color: ms.color }}>
                      {ms.label}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-amber-500 text-xs">✓</span>
                    )}
                  </label>
                );
              })}

              {/* Index & Stock OI Section */}
              <div className="text-xs font-semibold text-emerald-400 px-1 pt-2 border-t border-slate-700">
                Index &amp; Stock OI{" "}
                <span className="text-slate-500 font-normal">
                  (quarterly avg)
                </span>
              </div>
              {OI_VIZ_SERIES.map((os, oi) => {
                const isActive = activeOIKeys.has(os.key);
                return (
                  <label
                    key={os.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      data-ocid={`resultsanalytics.viz.oi.checkbox.${oi + 1}`}
                      checked={isActive}
                      onChange={() => {
                        setActiveOIKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(os.key)) next.delete(os.key);
                          else next.add(os.key);
                          return next;
                        });
                      }}
                      className="w-3 h-3 rounded accent-emerald-500"
                    />
                    <span className="text-xs" style={{ color: os.color }}>
                      {os.label}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-emerald-500 text-xs">
                        ✓
                      </span>
                    )}
                  </label>
                );
              })}

              {/* Clear all */}
              {customConditionSeries.length +
                activeMacroKeys.size +
                activeOIKeys.size >
                0 && (
                <div className="pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomConditionSeries([]);
                      setActiveMacroKeys(new Set());
                      setActiveOIKeys(new Set());
                      setShowCondPanel(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Clear all custom conditions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {customConditionSeries.length +
          activeMacroKeys.size +
          activeOIKeys.size >
          0 && (
          <span className="text-xs text-slate-500">
            {customConditionSeries.length +
              activeMacroKeys.size +
              activeOIKeys.size}{" "}
            condition
            {customConditionSeries.length +
              activeMacroKeys.size +
              activeOIKeys.size !==
            1
              ? "s"
              : ""}{" "}
            active
          </span>
        )}
      </div>

      {/* Series checkboxes */}
      <div className="flex flex-wrap gap-3 mb-4">
        {stdAllSeries.map((s) => (
          <label
            key={s}
            className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
          >
            <input
              type="checkbox"
              checked={!!selectedSeries[s]}
              onChange={(e) =>
                setSelectedSeries((prev) => ({
                  ...prev,
                  [s]: e.target.checked,
                }))
              }
              data-ocid={`stockresults.viz.${s.toLowerCase()}.checkbox`}
              className="w-3 h-3 rounded accent-blue-500"
            />
            <span style={{ color: CHART_SERIES_COLORS[s] ?? "#94a3b8" }}>
              {seriesLabels[s]}
            </span>
          </label>
        ))}
        {customConditionSeries.map((cs) => (
          <label
            key={cs.key}
            className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
          >
            <input
              type="checkbox"
              checked
              onChange={() =>
                setCustomConditionSeries((prev) =>
                  prev.filter((c) => c.key !== cs.key),
                )
              }
              className="w-3 h-3 rounded accent-blue-500"
            />
            <span style={{ color: cs.color }}>{cs.label}</span>
          </label>
        ))}
        {[...activeMacroKeys].map((k) => {
          const ms = MACRO_VIZ_SERIES.find((m) => m.key === k);
          if (!ms) return null;
          return (
            <label
              key={k}
              className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
            >
              <input
                type="checkbox"
                checked
                onChange={() =>
                  setActiveMacroKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(k);
                    return next;
                  })
                }
                className="w-3 h-3 rounded accent-amber-500"
              />
              <span style={{ color: ms.color }}>{ms.label}</span>
            </label>
          );
        })}
        {[...activeOIKeys].map((k) => {
          const os = OI_VIZ_SERIES.find((o) => o.key === k);
          if (!os) return null;
          return (
            <label
              key={k}
              className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
            >
              <input
                type="checkbox"
                checked
                onChange={() =>
                  setActiveOIKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(k);
                    return next;
                  })
                }
                className="w-3 h-3 rounded accent-emerald-500"
              />
              <span style={{ color: os.color }}>{os.label}</span>
            </label>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div
          data-ocid="stockresults.viz.empty_state"
          className="h-64 flex items-center justify-center text-slate-500 text-sm"
        >
          No data to visualize
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart
            data={chartData}
            margin={{
              top: 8,
              right: hasRightAxis ? 70 : 10,
              bottom: 0,
              left: 8,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: "#64748b" }}
              interval={Math.floor(display.length / 8)}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 9, fill: "#64748b" }}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
              }
              width={52}
              label={{
                value:
                  [...activeFinancial, ...activeEPS].length > 0
                    ? "₹ Cr / ₹"
                    : "",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#64748b", fontSize: 9 },
                offset: 10,
              }}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 9, fill: "#64748b" }}
                tickFormatter={(v: number) => {
                  if (Math.abs(v) >= 1_000_000)
                    return `${(v / 1_000_000).toFixed(1)}M`;
                  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
                  return v.toFixed(1);
                }}
                width={52}
                label={{
                  value: "Macro/OI/Margin",
                  angle: 90,
                  position: "insideRight",
                  style: { fill: "#64748b", fontSize: 9 },
                  offset: 10,
                }}
              />
            )}
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => [
                Math.abs(value) >= 1_000_000
                  ? `${(value / 1_000_000).toFixed(2)}M`
                  : marginSeries.includes(name.split(" ")[0]) ||
                      name.includes("%")
                    ? `${value.toFixed(2)}%`
                    : value.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      }),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
            {allSeries
              .filter((key) => !!allSelectedSeries[key])
              .map((key) => renderSeries(key))}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Custom Logic Store ───────────────────────────────────────────────────────
function CustomLogicStore({ sym }: { sym: string }) {
  const [logic, setLogic] = useState<string>(() => {
    try {
      return localStorage.getItem(`stock_logic_${sym}`) ?? "";
    } catch {
      return "";
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [saveCounter, setSaveCounter] = useState(0);
  const [loadFromSym, setLoadFromSym] = useState("");

  // Count how many symbols have saved logic — re-runs after saves
  // biome-ignore lint/correctness/useExhaustiveDependencies: saveCounter triggers localStorage re-scan intentionally
  const savedCount = useMemo(() => {
    try {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("stock_logic_")) count++;
      }
      return count;
    } catch {
      return 0;
    }
  }, [saveCounter, sym]);

  // Symbols with saved logic — re-runs after saves
  // biome-ignore lint/correctness/useExhaustiveDependencies: saveCounter triggers localStorage re-scan intentionally
  const symsWithLogic = useMemo(() => {
    try {
      const result: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("stock_logic_")) {
          const s = k.replace("stock_logic_", "");
          if (s !== sym) result.push(s);
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [sym, saveCounter]);

  // Auto-load when sym changes
  useEffect(() => {
    try {
      setLogic(localStorage.getItem(`stock_logic_${sym}`) ?? "");
    } catch {
      setLogic("");
    }
  }, [sym]);

  const saveLogic = () => {
    try {
      localStorage.setItem(`stock_logic_${sym}`, logic);
      setSavedMsg(true);
      setSaveCounter((c) => c + 1);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const loadFromOther = (otherSym: string) => {
    if (!otherSym) return;
    try {
      const loaded = localStorage.getItem(`stock_logic_${otherSym}`);
      if (loaded) setLogic(loaded);
    } catch {
      /* ignore */
    }
    setLoadFromSym("");
  };

  return (
    <Card>
      <button
        type="button"
        data-ocid="stockresults.logic.toggle"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between text-sm font-bold text-slate-100"
      >
        <div className="flex items-center gap-2">
          <span>Custom Logic &amp; Notes</span>
          {savedCount > 0 && (
            <span className="text-xs bg-purple-950 text-purple-400 border border-purple-800 px-2 py-0.5 rounded-full">
              Logic saved for {savedCount} stock{savedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs">
          {isOpen ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-slate-500">
            Write custom JS/Python-style formulas, notes, and logic for{" "}
            <span className="text-blue-400 font-medium">{sym}</span>. Logic is
            saved per-stock in your browser.
          </div>

          <textarea
            value={logic}
            onChange={(e) => setLogic(e.target.value)}
            data-ocid="stockresults.logic.textarea"
            placeholder={`// Custom logic for ${sym}\n// Example:\n// const peRatio = Revenue / NetProfit;\n// const growthScore = (revCAGR + npCAGR) / 2;\n// Logic is stored per-stock and can be recalled across stocks`}
            rows={10}
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 transition-colors resize-y"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-ocid="stockresults.logic.save_button"
              onClick={saveLogic}
              className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              {savedMsg ? "✓ Saved!" : "Save Logic"}
            </button>

            {symsWithLogic.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Load from:</span>
                <select
                  value={loadFromSym}
                  onChange={(e) => loadFromOther(e.target.value)}
                  data-ocid="stockresults.logic.select"
                  className={`${selectCls} text-xs`}
                >
                  <option value="">-- Select stock --</option>
                  {symsWithLogic.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Tab Component ───────────────────────────────────────────────────────
function TabStockResults() {
  const [sym, setSym] = useState("RELIANCE");
  const allQuarters = useMemo(() => genQuarterlyResults(sym), [sym]);

  return (
    <div className="space-y-4" data-ocid="stockresults.page">
      {/* Stock Selector */}
      <Card className="p-0">
        <StockResultsSearch value={sym} onChange={setSym} />
        <div className="px-4 py-3 flex flex-wrap gap-3 items-center border-t border-slate-700">
          <div className="text-xs text-slate-500">
            <span className="text-slate-300 font-medium">{sym}</span>
            {" — "}
            <span className="text-slate-400">
              {allQuarters.length} quarters of financial data
              {allQuarters.length > 0 &&
                ` (${allQuarters[allQuarters.length - 1].quarter} – ${allQuarters[0].quarter})`}
            </span>
          </div>
          <IndexMembershipBadges sym={sym} />
        </div>
      </Card>

      {/* Panel 1: Analytics Matrix */}
      <AnalyticsMatrixPanel sym={sym} />

      {/* Panel 2: Visualization */}
      <VisualizationPanel sym={sym} />

      {/* Custom Logic Store */}
      <CustomLogicStore sym={sym} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { label: "Analysis", comp: <TabAnalysis /> },
  { label: "Index & Index Options OI", comp: <TabIndex /> },
  { label: "Stocks & Stocks Options OI", comp: <TabStocks /> },
  { label: "Results & Analytics", comp: <TabStockResults /> },
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
