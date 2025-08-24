// scripts/settle_picks.mjs
// The Odds API scores -> automata elszámolás + havi P/L
import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.TOA_API_KEY;
if (!API_KEY) { console.error('Missing TOA_API_KEY'); process.exit(1); }

const DATA_DIR = path.join(process.cwd(), 'data');
const PICKS_PATH = path.join(DATA_DIR, 'picks.json');
const PL_PATH = path.join(DATA_DIR, 'monthly-pl.json');

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf-8'));
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2), 'utf-8');

function parseScores(ev){
  const s = { home:null, away:null };
  if (Array.isArray(ev.scores)) {
    for (const row of ev.scores || []) {
      if (!row || row.score==null) continue;
      const n = (row.name||'').toLowerCase();
      const val = Number(row.score);
      if (n==='home' || n===ev.home_team?.toLowerCase()) s.home = val;
      if (n==='away' || n===ev.away_team?.toLowerCase()) s.away = val;
    }
  }
  return s;
}
const settleH2H = (sel,h,a)=>{
  if (h==null||a==null) return null;
  if (h===a) return sel==='draw'?'win':'loss';
  const homeWin = h>a;
  if (sel==='home') return homeWin?'win':'loss';
  if (sel==='away') return homeWin?'loss':'win';
  return null;
};
const settleTotals = (sel,line,h,a)=>{
  if (h==null||a==null) return null;
  const t=h+a;
  if (sel==='over')  return t>line?'win':(t===line?'push':'loss');
  if (sel==='under') return t<line?'win':(t===line?'push':'loss');
  return null;
};
const profitFor = (r,stake,odds)=> r==='win'?Math.round(stake*(odds-1)) : r==='loss'?-stake : 0;

let picks = readJSON(PICKS_PATH);
const open = picks.filter(p=>p.status==='open');
if (open.length===0){ console.log('No open picks.'); process.exit(0); }

const bySport = open.reduce((m,p)=>((m[p.sport]??=[]).push(p),m),{});
const updated = new Map();

async function fetchScoresForSport(sport, ids){
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/scores`);
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('dateFormat','iso');
  url.searchParams.set('daysFrom','3');
  url.searchParams.set('eventIds', ids.join(','));
  const res = await fetch(url, { headers:{Accept:'application/json'} });
  if (!res.ok){ console.error('Error', res.status, await res.text()); return; }
  const data = await res.json();
  for (const ev of data){
    const {home,away} = parseScores(ev);
    updated.set(ev.id, { completed: !!ev.completed, home, away, home_team: ev.home_team, away_team: ev.away_team });
  }
}

for (const [sport, arr] of Object.entries(bySport)){
  const ids = [...new Set(arr.map(p=>p.eventId))];
  if (ids.length) await fetchScoresForSport(sport, ids);
}

let changed=false;
const nowISO = new Date().toISOString();
picks = picks.map(p=>{
  if (p.status!=='open') return p;
  const ev = updated.get(p.eventId);
  if (!ev || !ev.completed) return p;
  const {home,away} = ev;
  let result=null;
  if (p.market==='h2h') result = settleH2H((p.selection||'').toLowerCase(), home, away);
  else if (p.market==='totals') result = settleTotals((p.selection||'').toLowerCase(), Number(p.line), home, away);
  if (!result) return p;
  const profit = profitFor(result, Number(p.stake), Number(p.odds));
  changed=true;
  return {...p, status:'settled', result, profit, settledAt: nowISO,
    meta:{homeScore:home,awayScore:away,homeTeam:ev.home_team,awayTeam:ev.away_team}};
});
if (changed) writeJSON(PICKS_PATH, picks);
console.log(changed?'Settled picks updated.':'No picks settled.');

const settled = picks.filter(p=>p.status==='settled');
const byMonth = new Map();
for (const p of settled){
  const d=new Date(p.settledAt||p.commence_time||Date.now());
  const key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  byMonth.set(key,(byMonth.get(key)||0)+Number(p.profit||0));
}
const monthly = [...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([month,profit],i,arr)=>({month,profit,cum:arr.slice(0,i+1).reduce((s,x)=>s+x[1],0)}));
writeJSON(PL_PATH, monthly);
console.log('monthly-pl.json updated:', monthly);
