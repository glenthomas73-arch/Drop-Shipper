// DropDash — eBay Dropshipping Dashboard
// Requires an Anthropic API key set in localStorage: localStorage.setItem('dd_api_key', 'sk-ant-...')

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-sonnet-4-6';

// ─── API key management ────────────────────────────────────────────────────

function getApiKey() {
  let key = localStorage.getItem('dd_api_key') || '';
  if (!key) {
    key = prompt('Enter your Anthropic API key (stored locally, never sent anywhere except Anthropic):');
    if (key && key.startsWith('sk-ant-')) {
      localStorage.setItem('dd_api_key', key.trim());
    } else {
      alert('Invalid API key. It should start with sk-ant-');
      return null;
    }
  }
  return key;
}

async function callClaude(system, user) {
  const key = getApiKey();
  if (!key) throw new Error('No API key');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text;
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  const panel = document.getElementById('panel-' + tab);
  panel.classList.remove('hidden');
  panel.classList.add('active');
}

function setLoading(btnId, spanId, loading, label) {
  const btn  = document.getElementById(btnId);
  const span = document.getElementById(spanId);
  if (loading) {
    span.innerHTML = '<span class="spinner"></span> Working…';
    btn.disabled = true;
  } else {
    span.textContent = label;
    btn.disabled = false;
  }
}

function showToast(msg = 'Copied to clipboard') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function copyEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => showToast());
}

function safeParseJSON(txt) {
  return JSON.parse(txt.replace(/```json|```/g, '').trim());
}

// ─── Research tab — hybrid free / live scan ────────────────────────────────

function fillNiche(niche) {
  document.getElementById('res-query').value = niche;
  document.getElementById('res-query').focus();
}

function setProgress(text, steps) {
  document.getElementById('res-progress-text').textContent = text;
  if (steps) {
    document.getElementById('res-progress-steps').innerHTML = steps.map(s =>
      `<div class="progress-step ${s.state}">
        <span class="step-icon">${s.state === 'done' ? '✓' : s.state === 'active' ? '›' : '·'}</span>
        ${s.label}
      </div>`
    ).join('');
  }
}

async function callClaudeWithSearch(system, user) {
  const key = getApiKey();
  if (!key) throw new Error('No API key');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

let _lastResearchResults = '';
let _lastNiches = [];

// FREE analysis — AI reasoning only, no web search
async function runResearch() {
  const q = document.getElementById('res-query').value.trim();
  if (!q) { document.getElementById('res-query').focus(); return; }

  const btn  = document.getElementById('res-btn');
  const span = document.getElementById('res-btn-text');
  btn.disabled = true;
  span.innerHTML = '<span class="spinner"></span> Analysing…';
  document.getElementById('res-result').classList.add('hidden');
  document.getElementById('res-progress').classList.remove('hidden');

  const steps = [
    { label: 'Identifying sub-niches', state: 'active' },
    { label: 'Analysing opportunity and competition', state: '' },
    { label: 'Ranking results', state: '' },
  ];
  setProgress('Identifying sub-niches…', steps);

  try {
    const sys = `You are an eBay UK dropshipping expert with deep knowledge of what sells well, what is oversaturated, and where the gaps are. You think like a market analyst.

Return ONLY valid JSON — no markdown, no backticks — in this exact format:
{
  "niches": [
    {
      "name": "specific product name",
      "avg_price": 9.99,
      "competition": "Low",
      "opportunity_score": 8,
      "reason": "2-3 sentences explaining the opportunity or why to avoid it, based on your knowledge of eBay UK market dynamics, seasonality, and dropshipper saturation patterns",
      "supplier_tip": "brief tip on where to source this"
    }
  ]
}

Rules:
- Generate exactly 12 specific sub-niches (e.g. "silicone dog food mat" not "dog accessories")
- Be realistic and opinionated — most mainstream products ARE saturated, say so
- opportunity_score: 1-10 (10 = best). Score honestly. Do not give everything Medium competition.
- competition must be exactly "Low", "Medium", or "High"
- avg_price should be a realistic eBay UK sell price in GBP
- Mix well-known and less obvious products — actively look for gaps a typical dropshipper would miss`;

    steps[0].state = 'done'; steps[1].state = 'active';
    setProgress('Analysing market dynamics…', steps);

    const txt = await callClaude(sys, `Find low-competition dropshipping opportunities within this niche for eBay UK: ${q}\n\nBe honest about saturation. Actively look for underserved sub-niches, unusual product variants, or price point gaps.`);

    steps[1].state = 'done'; steps[2].state = 'active';
    setProgress('Ranking opportunities…', steps);

    let parsed;
    try {
      const jsonMatch = txt.match(/\{[\s\S]*"niches"[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : txt.replace(/```json|```/g,'').trim());
    } catch {
      throw new Error('Could not parse response. Try again.');
    }

    steps[2].state = 'done';
    setProgress('Done', steps);

    _lastNiches = parsed.niches || [];
    renderResults(_lastNiches, q, false);

  } catch (e) {
    document.getElementById('res-progress').classList.add('hidden');
    alert('Error: ' + e.message);
  }

  btn.disabled = false;
  span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Find opportunities`;
}

// LIVE SCAN — web search, costs ~15-20p, behind confirm dialog
function confirmLiveScan() {
  const q = document.getElementById('res-query').value.trim();
  if (!q) { document.getElementById('res-query').focus(); return; }

  const confirmed = confirm(
    '⚠️ Cost warning\n\n' +
    'Live scan searches eBay UK in real time for actual sold listing data.\n\n' +
    'Estimated cost: 15–20p per scan (Anthropic API).\n\n' +
    'Free analysis runs first to identify sub-niches, then live search validates them.\n\n' +
    'Proceed?'
  );
  if (confirmed) runLiveScan(q);
}

async function runLiveScan(q) {
  const btn  = document.getElementById('res-btn');
  const span = document.getElementById('res-btn-text');
  btn.disabled = true;
  span.innerHTML = '<span class="spinner"></span> Live scanning…';
  document.getElementById('res-result').classList.add('hidden');
  document.getElementById('res-progress').classList.remove('hidden');

  const steps = [
    { label: 'Generating sub-niches', state: 'active' },
    { label: 'Searching eBay UK sold listings (live)', state: '' },
    { label: 'Analysing real competition data', state: '' },
    { label: 'Ranking opportunities', state: '' },
  ];
  setProgress('Identifying sub-niches to scan…', steps);

  try {
    // Step 1 — get sub-niches free first
    const subNichesTxt = await callClaude(
      `You are an eBay UK dropshipping expert. Return ONLY a JSON array of 10 strings — no markdown, no backticks. Each string is a specific product sub-niche to search on eBay UK (e.g. "silicone dog food mat", "dog cooling mat", "dog bandana UK"). Mix obvious and less obvious ones. Include some you think might be underserved.`,
      `Broad niche: ${q}`
    );

    let subNiches;
    try {
      subNiches = safeParseJSON(subNichesTxt);
      if (!Array.isArray(subNiches)) throw new Error();
    } catch {
      subNiches = (subNichesTxt.match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g,'')).slice(0,10);
    }
    if (!subNiches.length) throw new Error('Could not generate sub-niches.');

    steps[0].state = 'done'; steps[1].state = 'active';
    setProgress(`Searching eBay UK for ${subNiches.length} products…`, steps);

    // Step 2 — live search
    const searchPrompt = `You are an eBay UK dropshipping market researcher. Search eBay UK sold listings for each product below and gather real data.

Products to research:
${subNiches.map((n,i) => `${i+1}. ${n}`).join('\n')}

For each, search eBay.co.uk sold listings and note: active listing count, recent sold count, price range. Then return ONLY valid JSON — no markdown, no backticks:
{
  "niches": [
    {
      "name": "product name",
      "active_listings": 150,
      "sold_30d": 45,
      "avg_price": 9.99,
      "competition": "Low",
      "opportunity_score": 8,
      "reason": "2-3 sentences based on the real data you found",
      "supplier_tip": "brief sourcing tip"
    }
  ]
}
opportunity_score 1-10. competition = "Low"/"Medium"/"High". Base ONLY on real search results.`;

    steps[1].state = 'done'; steps[2].state = 'active';
    setProgress('Reading live eBay data…', steps);

    const rawResults = await callClaudeWithSearch(
      'You are an eBay UK market research assistant. Always search before responding. Return only valid JSON.',
      searchPrompt
    );

    steps[2].state = 'done'; steps[3].state = 'active';
    setProgress('Ranking opportunities…', steps);

    let parsed;
    try {
      const jsonMatch = rawResults.match(/\{[\s\S]*"niches"[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json block');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Could not parse live data. eBay pages can vary — try again.');
    }

    steps[3].state = 'done';
    setProgress('Done', steps);

    _lastNiches = parsed.niches || [];
    renderResults(_lastNiches, q, true);

  } catch (e) {
    document.getElementById('res-progress').classList.add('hidden');
    alert('Live scan error: ' + e.message);
  }

  btn.disabled = false;
  span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Find opportunities`;
}

// Shared render function used by both free and live scan
function renderResults(niches, q, isLive) {
  if (!niches.length) {
    document.getElementById('res-progress').classList.add('hidden');
    alert('No results returned. Try a different niche.');
    return;
  }

  niches.sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));

  const opportunities = niches.filter(n => (n.opportunity_score || 0) >= 6);
  const avoid         = niches.filter(n => (n.opportunity_score || 0) < 4);
  const bestMargin    = opportunities.length && opportunities[0].avg_price
    ? Math.round(((opportunities[0].avg_price - opportunities[0].avg_price * 0.35) / opportunities[0].avg_price) * 100)
    : 0;

  _lastResearchResults = buildReportText(q, niches, opportunities, avoid, isLive);

  document.getElementById('met-opps').textContent        = opportunities.length;
  document.getElementById('met-avoid').textContent       = avoid.length;
  document.getElementById('met-best-margin').textContent = bestMargin ? `~${bestMargin}%` : '—';

  // Data source badge
  const badge = isLive
    ? `<span class="opp-pill pill-green" style="font-size:11px">● Live eBay data</span>`
    : `<span class="opp-pill pill-amber" style="font-size:11px">◐ AI analysis — use Live scan to validate</span>`;
  document.getElementById('res-data-badge').innerHTML = badge;

  const cards = document.getElementById('opp-cards');
  if (!opportunities.length) {
    cards.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--text-secondary)">No clear opportunities found. Try a broader niche or run a live scan.</p></div>';
  } else {
    cards.innerHTML = opportunities.map((n, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
      const rankLabel = i === 0 ? '🏆 Top pick' : i === 1 ? '2nd' : i === 2 ? '3rd' : `#${i+1}`;
      const compClass = n.competition === 'Low' ? 'pill-green' : n.competition === 'Medium' ? 'pill-amber' : 'pill-gray';
      const price     = n.avg_price ? `£${parseFloat(n.avg_price).toFixed(2)}` : '—';
      const sold      = n.sold_30d  ? `${n.sold_30d} sold/mo` : '';
      const active    = n.active_listings ? `${n.active_listings} listings` : '';
      const name      = n.name.replace(/'/g, "\\'");

      return `<div class="opp-card ${rankClass}">
        <span class="opp-rank">${rankLabel}</span>
        <div class="opp-title">${n.name}</div>
        <div class="opp-meta">
          <span class="opp-pill ${compClass}">${n.competition} competition</span>
          <span class="opp-pill pill-blue">${price} avg</span>
          ${sold  ? `<span class="opp-pill pill-gray">${sold}</span>`  : ''}
          ${active? `<span class="opp-pill pill-gray">${active}</span>`: ''}
        </div>
        <div class="opp-reason">${n.reason || ''}</div>
        ${n.supplier_tip ? `<div class="opp-tip">💡 ${n.supplier_tip}</div>` : ''}
        <div class="opp-actions">
          <button class="btn btn-sm btn-primary" onclick="goToListingWith('${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Create listing
          </button>
          <button class="btn btn-sm" onclick="goToSupplierWith('${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Supplier message
          </button>
        </div>
      </div>`;
    }).join('');
  }

  if (avoid.length) {
    document.getElementById('avoid-list').innerHTML = avoid.map(n =>
      `<span style="margin-right:1.5rem">✗ ${n.name} <span style="color:var(--text-muted);font-size:11px">(${n.competition} competition)</span></span>`
    ).join('<br>');
    document.getElementById('avoid-card').style.display = 'block';
  } else {
    document.getElementById('avoid-card').style.display = 'none';
  }

  document.getElementById('res-progress').classList.add('hidden');
  document.getElementById('res-result').classList.remove('hidden');
}

function buildReportText(niche, all, opps, avoid, isLive) {
  const lines = [
    `DropDash Research Report — ${niche}`,
    `Data source: ${isLive ? 'Live eBay scan' : 'AI analysis'}`,
    '='.repeat(45), '',
    `OPPORTUNITIES (${opps.length} found)`, ''
  ];
  opps.forEach((n, i) => {
    lines.push(`${i+1}. ${n.name}`);
    lines.push(`   Competition: ${n.competition} | Avg price: £${parseFloat(n.avg_price||0).toFixed(2)}${n.sold_30d ? ` | Sold/mo: ${n.sold_30d}` : ''}${n.active_listings ? ` | Active: ${n.active_listings}` : ''}`);
    lines.push(`   ${n.reason}`);
    if (n.supplier_tip) lines.push(`   💡 ${n.supplier_tip}`);
    lines.push('');
  });
  if (avoid.length) {
    lines.push('', `AVOID — SATURATED (${avoid.length})`, '');
    avoid.forEach(n => lines.push(`✗ ${n.name} (${n.competition} competition)`));
  }
  return lines.join('\n');
}

function copyResults() {
  if (_lastResearchResults) {
    navigator.clipboard.writeText(_lastResearchResults).then(() => showToast('Report copied'));
  }
}

function goToListingWith(product) {
  document.getElementById('lst-product').value = product;
  document.querySelectorAll('.tab')[1].click();
}

function goToListing() {
  document.querySelectorAll('.tab')[1].click();
}

function goToSupplierWith(product) {
  document.getElementById('sup-product').value = product;
  document.querySelectorAll('.tab')[3].click();
}

// ─── Listing tab ──────────────────────────────────────────────────────────

async function runListing() {
  const prod  = document.getElementById('lst-product').value.trim();
  const cost  = parseFloat(document.getElementById('lst-cost').value) || 0;
  const cat   = document.getElementById('lst-cat').value;
  const feats = document.getElementById('lst-features').value.trim();
  if (!prod) { document.getElementById('lst-product').focus(); return; }

  setLoading('lst-btn', 'lst-btn-text', true, 'Generate listing');
  document.getElementById('lst-result').classList.add('hidden');

  try {
    const sys = `You are an expert eBay UK listing copywriter. Return ONLY valid JSON — no markdown, no backticks — with exactly these keys:
title (string, max 80 chars, keyword-rich eBay title in sentence case),
description (string, 150–200 words, plain text with dash bullet points, no HTML),
sell_price (number, 2.5–4× the cost price provided, or a realistic market price if cost is unknown),
margin_pct (integer, percentage profit margin based on sell and cost price),
specifics (string, 3–5 item specifics as "Key: Value" lines separated by newlines),
tags (string, 8–10 comma-separated eBay search terms).`;

    const txt = await callClaude(sys,
      `Create a full eBay listing for: ${prod}\nCategory: ${cat}\nCost price: £${cost || 'unknown'}\nKey features: ${feats || 'standard'}`
    );

    const d = safeParseJSON(txt);
    const title = d.title || '';
    const sp    = parseFloat(d.sell_price) || 0;
    const mp    = d.margin_pct || (cost && sp ? Math.round(((sp - cost) / sp) * 100) : null);

    document.getElementById('lst-title').textContent    = title;
    document.getElementById('title-chars').textContent  = `${title.length}/80 chars`;
    document.getElementById('lst-desc').textContent     = d.description  || '';
    document.getElementById('lst-price').textContent    = sp ? '£' + sp.toFixed(2) : '—';
    document.getElementById('lst-margin-note').textContent = mp ? `~${mp}% margin` : '';
    document.getElementById('lst-specifics').textContent = d.specifics   || '';
    document.getElementById('lst-tags').textContent     = d.tags         || '';
    document.getElementById('lst-result').classList.remove('hidden');
  } catch (e) {
    alert('Error: ' + e.message);
  }

  setLoading('lst-btn', 'lst-btn-text', false, 'Generate listing');
}

// ─── Orders tab ───────────────────────────────────────────────────────────

let orders = [];

try { orders = JSON.parse(localStorage.getItem('dd_orders') || '[]'); } catch (_) {}

function saveOrdersToStorage() {
  try { localStorage.setItem('dd_orders', JSON.stringify(orders)); } catch (_) {}
}

function toggleAddOrder() {
  const f = document.getElementById('add-order-form');
  f.classList.toggle('hidden');
}

function statusBadge(s) {
  const map = {
    'Delivered':              'badge-green',
    'Dispatched':             'badge-blue',
    'Supplier order placed':  'badge-amber',
    'Awaiting supplier order':'badge-gray',
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${s}</span>`;
}

function renderOrders() {
  const el = document.getElementById('orders-list');

  if (!orders.length) {
    el.innerHTML = '<div class="orders-empty">No orders yet — add your first eBay sale above.</div>';
  } else {
    el.innerHTML = orders.map((o, i) => {
      const profit = (o.sale - o.cost);
      const cls    = profit >= 0 ? 'pos' : 'neg';
      return `
        <div class="order-row">
          <span class="order-id">${o.id}</span>
          <span class="order-item">${o.item}</span>
          ${statusBadge(o.status)}
          <span style="font-size:12px;color:var(--text-muted)">${o.date}</span>
          <span class="order-profit ${cls}">${profit >= 0 ? '+' : ''}£${profit.toFixed(2)}</span>
          <button class="btn btn-sm" onclick="updateOrderStatus(${i})" title="Change status" style="padding:4px 8px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="btn btn-sm" onclick="deleteOrder(${i})" title="Delete" style="padding:4px 8px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>`;
    }).join('');
  }

  const totalRevenue = orders.reduce((s, o) => s + (o.sale || 0), 0);
  const totalProfit  = orders.reduce((s, o) => s + ((o.sale || 0) - (o.cost || 0)), 0);
  document.getElementById('stat-orders').textContent = orders.length;
  document.getElementById('stat-profit').textContent = '£' + totalProfit.toFixed(2);
  document.getElementById('stat-margin').textContent = totalRevenue
    ? Math.round((totalProfit / totalRevenue) * 100) + '%' : '0%';
}

function saveOrder() {
  const o = {
    id:     document.getElementById('new-oid').value.trim()   || '#' + Date.now(),
    item:   document.getElementById('new-item').value.trim()  || 'Unknown item',
    buyer:  document.getElementById('new-buyer').value.trim() || '—',
    sale:   parseFloat(document.getElementById('new-sale').value)  || 0,
    cost:   parseFloat(document.getElementById('new-cost').value)  || 0,
    status: document.getElementById('new-status').value,
    date:   new Date().toLocaleDateString('en-GB'),
  };
  orders.unshift(o);
  saveOrdersToStorage();
  renderOrders();
  toggleAddOrder();
  ['new-oid','new-item','new-buyer','new-sale','new-cost'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('new-status').selectedIndex = 0;
  showToast('Order saved');
}

const STATUS_CYCLE = [
  'Awaiting supplier order',
  'Supplier order placed',
  'Dispatched',
  'Delivered',
];

function updateOrderStatus(idx) {
  const o   = orders[idx];
  const cur = STATUS_CYCLE.indexOf(o.status);
  o.status  = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length];
  saveOrdersToStorage();
  renderOrders();
}

function deleteOrder(idx) {
  if (!confirm('Delete this order?')) return;
  orders.splice(idx, 1);
  saveOrdersToStorage();
  renderOrders();
}

// ─── Supplier tab ─────────────────────────────────────────────────────────

async function runSupplier() {
  const prod  = document.getElementById('sup-product').value.trim();
  const qty   = document.getElementById('sup-qty').value   || '1';
  const name  = document.getElementById('sup-name').value.trim();
  const addr  = document.getElementById('sup-addr1').value.trim();
  const city  = document.getElementById('sup-city').value.trim();
  const post  = document.getElementById('sup-post').value.trim();
  const notes = document.getElementById('sup-notes').value.trim();
  if (!prod) { document.getElementById('sup-product').focus(); return; }

  setLoading('sup-btn', 'sup-btn-text', true, 'Generate message');
  document.getElementById('sup-result').classList.add('hidden');

  try {
    const sys = `You write professional, concise supplier order messages for a UK dropshipper.
Be polite and clear. Plain text only — no JSON, no markdown.
Always include a note that this is a dropship order and no invoice or promotional material should be placed inside the package.`;

    const txt = await callClaude(sys,
      `Write a supplier order message:\nProduct: ${prod}\nQuantity: ${qty}\n\nShip to:\n  ${name || '[buyer name]'}\n  ${addr || '[address]'}\n  ${city || '[city]'}\n  ${post || '[postcode]'}\n  United Kingdom\n\nAdditional notes: ${notes || 'none'}`
    );

    document.getElementById('sup-msg').textContent = txt;
    document.getElementById('sup-result').classList.remove('hidden');
  } catch (e) {
    alert('Error: ' + e.message);
  }

  setLoading('sup-btn', 'sup-btn-text', false, 'Generate message');
}

// ─── Init ──────────────────────────────────────────────────────────────────

renderOrders();
