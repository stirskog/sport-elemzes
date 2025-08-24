async function loadJSON(path){
  const res = await fetch(path, {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}
function huf(n){
  return new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0}).format(n);
}

async function initPL(){
  try{
    const data = await loadJSON('./data/monthly-pl.json');
    const labels = data.map(d=>d.month);
    const profits = data.map(d=>d.profit);
    const cum = data.map(d=>d.cum);

    const ctx = document.getElementById('plChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type:'bar', label:'Havi profit', data: profits },
          { type:'line', label:'Kumulált', data: cum, tension:0.3 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color:'#ddd' } },
          tooltip: { callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${huf(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks:{ color:'#bbb' }, grid:{ color:'#222' } },
          y: { ticks:{ color:'#bbb', callback:(v)=>`${Math.round(v/1000)}k` }, grid:{ color:'#222' } }
        }
      }
    });

    const total = profits.reduce((a,b)=>a+b,0);
    document.getElementById('plSummary').textContent = `Összesített: ${huf(total)}`;
  }catch(e){
    document.getElementById('plSummary').textContent = 'Nincs még adat a monthly-pl.json-ban.';
  }
}

function renderPicks(rows){
  const tbody = document.querySelector('#picksTable tbody');
  tbody.innerHTML = '';
  for(const p of rows){
    const tr = document.createElement('tr');
    const cells = [
      p.id,
      p.sport,
      p.market,
      p.selection + (p.line ? ` (${p.line})` : ''),
      p.odds?.toFixed?.(2) ?? p.odds,
      p.stake,
      p.status,
      p.result ?? '',
      (p.profit!=null? huf(p.profit) : '')
    ];
    for(const c of cells){
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

async function initPicks(){
  try{
    const data = await loadJSON('./data/picks.json');
    const select = document.getElementById('statusFilter');
    const apply = ()=>{
      const val = select.value;
      const rows = data.filter(p=> val==='all' ? true : p.status===val);
      renderPicks(rows);
    };
    select.addEventListener('change', apply);
    apply();
  }catch(e){
    renderPicks([]);
  }
}

initPL();
initPicks();
