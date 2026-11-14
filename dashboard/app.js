// Token Launch Radar dashboard: sortable, filterable board plus a detail
// view per protocol. The page recomputes every implied value from the raw
// snapshot figures with the same radar-2 formula the program used, so the
// screen and the board can never drift apart.

const DATA = window.RADAR_DATA || { as_of: '2026-11-14', rows: [], live: [] };
const AS_OF = DATA.as_of;

const fmtUsd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmtPct = (n) => (n === null || n === undefined ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
const fmtAge = (d) => (d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd');

// --- the radar-2 model, same arithmetic as lib/model.ts --------------------
function ageDays(listedAt) {
  if (!listedAt) return 365;
  const ms = Date.parse(AS_OF + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z');
  return Math.max(0, Math.floor(ms / 86400000));
}
function impliedOf(row) {
  const growth = Math.max(-50, Math.min(200, row.change_7d ?? 0));
  const age = ageDays(row.listed_at);
  const maturity = 0.5 + (Math.min(age, 1460) / 1460) * 0.8;
  return Math.max(1, Math.round(250000000 * Math.pow(row.tvl_usd / 1e9, 0.85) * (1 + growth / 100) * maturity));
}
window.impliedOf = impliedOf;

// --- state ------------------------------------------------------------------
const state = { sort: 'rank', dir: 1, q: '', cat: '', chain: '', mode: 'pre' };

function currentRows() {
  const base = state.mode === 'live' ? DATA.live : DATA.rows;
  const q = state.q.trim().toLowerCase();
  return base.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !(r.chains || []).includes(state.chain)) return false;
    return true;
  });
}

function sortedRows(list) {
  const key = state.sort;
  const dir = state.dir;
  return [...list].sort((a, b) => {
    let av = key === 'implied_value_usd' && state.mode === 'live' ? (a.mcap_usd ?? 0) : a[key];
    let bv = key === 'implied_value_usd' && state.mode === 'live' ? (b.mcap_usd ?? 0) : b[key];
    if (key === 'change_7d') { av = av ?? -Infinity; bv = bv ?? -Infinity; }
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
}

function render() {
  const list = sortedRows(currentRows());
  const tbody = document.getElementById('rows');
  tbody.innerHTML = list.map((r) => {
    const value = state.mode === 'live' ? (r.mcap_usd ?? 0) : impliedOf(r);
    const shown = state.mode === 'live' ? fmtUsd(r.mcap_usd ?? 0) : fmtUsd(value);
    const age = state.mode === 'live' ? '—' : fmtAge(r.age_days ?? ageDays(r.listed_at));
    const growth = r.change_7d;
    const cls = growth === null ? '' : growth >= 0 ? 'up' : 'down';
    const rank = state.mode === 'live' ? '—' : r.rank;
    return `<tr data-slug="${r.slug}"><td>${rank}</td>` +
      `<td><b>${r.name}</b> <span class="tag">${r.slug}</span><br><span class="tag">${r.category} · ${(r.chains || []).join(', ')}</span></td>` +
      `<td class="money">${fmtUsd(r.tvl_usd)}</td>` +
      `<td class="num ${cls}">${fmtPct(growth)}</td>` +
      `<td class="num">${age}</td>` +
      `<td class="money">${shown}</td></tr>`;
  }).join('');
  document.getElementById('count').textContent =
    `${list.length} rows shown · ${state.mode === 'live' ? 'live tokens, ranked by market cap' : 'pre-token, ranked by implied value'}`;
  document.querySelectorAll('#board th').forEach((th) => {
    const k = th.dataset.sort;
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (state.sort === k ? (state.dir === 1 ? ' ▲' : ' ▼') : '');
  });
}

function fillFilters() {
  const cats = [...new Set(DATA.rows.map((r) => r.category))].sort();
  const chains = [...new Set(DATA.rows.flatMap((r) => r.chains || []))].sort();
  document.getElementById('cat').innerHTML = '<option value="">All categories</option>' +
    cats.map((c) => `<option>${c}</option>`).join('');
  document.getElementById('chain').innerHTML = '<option value="">All chains</option>' +
    chains.map((c) => `<option>${c}</option>`).join('');
  const top = DATA.rows[0];
  document.getElementById('meta').innerHTML =
    `Snapshot ${AS_OF}\n<b>${DATA.rows.length}</b> pre-token rows · <b>${DATA.live.length}</b> live\nTop: <b>${top ? top.name : '—'}</b> ${top ? fmtUsd(top.implied_value_usd) : ''}`;
}

// --- detail view ------------------------------------------------------------
function openDetail(slug) {
  const row = DATA.rows.find((r) => r.slug === slug) || DATA.live.find((r) => r.slug === slug);
  if (!row) return;
  const age = ageDays(row.listed_at);
  const growth = Math.max(-50, Math.min(200, row.change_7d ?? 0));
  const maturity = 0.5 + (Math.min(age, 1460) / 1460) * 0.8;
  const tvlFactor = Math.pow(row.tvl_usd / 1e9, 0.85);
  const body = document.getElementById('detail-body');
  const farm = (row.farm_steps || []).map((s) => `<li>${s}</li>`).join('');
  body.innerHTML =
    `<h2>${row.name}</h2><p><span class="tag">${row.slug} · ${row.category} · ${(row.chains || []).join(', ')}</span></p>` +
    `<p class="pre">${row.pre_token === false || row.mcap_usd ? 'Token already trades — shown for comparison' : 'Pre-token — no token recorded in the snapshot'}</p>` +
    `<h3>Model inputs</h3><dl class="kv">` +
    `<dt>TVL</dt><dd>${fmtUsd(row.tvl_usd)}</dd>` +
    `<dt>7-day growth</dt><dd>${fmtPct(row.change_7d)} (clamped to ${fmtPct(growth)})</dd>` +
    `<dt>Listed</dt><dd>${row.listed_at || 'unknown'} — age ${age} days</dd>` +
    `<dt>Maturity factor</dt><dd>${maturity.toFixed(4)}</dd></dl>` +
    `<h3>Implied value — radar-2</h3><div class="formula">` +
    `$250,000,000 &times; ${(row.tvl_usd / 1e9).toFixed(4)}^0.85 (${tvlFactor.toFixed(4)}) &times; (1 + ${growth}/100) &times; ${maturity.toFixed(4)}<br>` +
    `= <b>${fmtUsd(impliedOf(row))}</b></div>` +
    (farm ? `<h3>Farm plan — 7 steps</h3><ol>${farm}</ol>` : `<h3>Farm plan</h3><p>No farm plan: this protocol already has a token.</p>`);
  document.getElementById('detail').showModal();
}

// --- wiring -----------------------------------------------------------------
function init() {
  fillFilters();
  document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  document.getElementById('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
  document.getElementById('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
  document.getElementById('mode').addEventListener('change', (e) => {
    state.mode = e.target.value;
    if (state.mode === 'live') { state.sort = 'implied_value_usd'; state.dir = -1; }
    else { state.sort = 'rank'; state.dir = 1; }
    render();
  });
  document.getElementById('clear').addEventListener('click', () => {
    state.q = ''; state.cat = ''; state.chain = ''; state.mode = 'pre';
    document.getElementById('q').value = '';
    document.getElementById('cat').value = '';
    document.getElementById('chain').value = '';
    document.getElementById('mode').value = 'pre';
    render();
  });
  document.querySelectorAll('#board th').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      render();
    });
  });
  document.getElementById('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug);
  });
  document.getElementById('close-detail').addEventListener('click', () => {
    document.getElementById('detail').close();
  });
  // Deep links for screenshots: #detail=<slug> or #category=<name>.
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('category')) {
    state.cat = hash.get('category');
    document.getElementById('cat').value = state.cat;
  }
  render();
  if (hash.get('detail')) openDetail(hash.get('detail'));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
