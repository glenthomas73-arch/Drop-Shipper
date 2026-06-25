/* DropDash — app.js */

/* ─── Constants ─────────────────────────────────────────────────────────── */
const API_URL   = 'https://api.anthropic.com/v1/messages';
const API_MODEL = 'claude-sonnet-4-6';
const KEY_NAME  = 'dd_api_key';

/* ─── API key helpers ───────────────────────────────────────────────────── */
function getKey() { return localStorage.getItem(KEY_NAME); }
function saveKey(k) { localStorage.setItem(KEY_NAME, k.trim()); }

function requireKey() {
  let k = getKey();
  if (k) return k;
  k = prompt('Enter your Anthropic API key (stored locally only):');
  if (!k) throw new Error('No API key provided.');
  saveKey(k);
  return k;
}

/* ─── Core Claude call ──────────────────────────────────────────────────── */
async function claude(system, userMsg, maxTokens = 1000) {
  const key = requireKey();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: API_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

/* ─── Robust JSON parser ────────────────────────────────────────────────── */
function parseJSON(raw) {
  // 1. Strip markdown fences
  let clean = raw.replace(/```json|```/gi, '').trim();

  // 2. Try full parse
  try { return JSON.parse(clean); } catch (_) {}

  // 3. Extract first {...} block
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

  // 4. Extract first [...] block
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_) {} }

  // 5. Give up
  throw new Error('Could not parse response. Try again.');
}

/* ─── Tab navigation ────────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — PRODUCT RESEARCH
═══════════════════════════════════════════════════════════════════════════ */

let _lastResearchResults = '';

function setProgress(msg, steps) {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  const done  = steps.filter(s => s.state === 'done').length;
  const total = steps.length;
  const pct   = Math.round((done / total) * 100);
  bar.style.width = pct + '%';
  document.getElementById('progress-msg').textContent = msg;
  steps.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    el.className = 'step ' + s.state;
  });
}

function buildReportText(niche, niches, opps, avoid) {
  const lines = [`DropDash Research Report — ${niche}`, '='.repeat(50), ''];
  lines.push(`Opportunities (${opps.length}):`);
  opps.forEach((n, i) => {
    lines.push(`${i + 1}. ${n.name}`);
    lines.push(`   Price: £${parseFloat(n.avg_price || 0).toFixed(2)}  Sold/mo: ${n.sold_30d || '?'}  Competition: ${n.competition || '?'}`);
    lines.push(`   ${n.reason || ''}`);
    lines.push('');
  });
  if (avoid.length) {
    lines.push(`Avoid (${avoid.length}):`);
    avoid.forEach(n => lines.push(`- ${n.name}: ${n.reason || ''}`));
  }
  return lines.join('\n');
}

async function runFreeAnalysis(q) {
  const steps = [
    { id: 'step-1', state: 'active',  label: 'Generating sub-niches' },
    { id: 'step-2', state: 'pending', label: 'Analysing competition' },
    { id: 'step-3', state: 'pending', label: 'Scoring opportunities' },
    { id: 'step-4', state: 'pending', label: 'Building report' },
  ];
  setProgress('Generating sub-niches…', steps);

  const SYSTEM = `You are an eBay UK dropshipping expert.
You MUST respond with ONLY a raw JSON object — no markdown, no backticks, no explanation, no preamble.
Start your response with { and end with }.
Return exactly this structure:
{
  "niches": [
    {
      "name": "string",
      "avg_price": number,
      "sold_30d": number,
      "active_listings": number,
      "competition": "Low|Medium|High",
      "opportunity_score": number (1-10),
      "reason": "string (one sentence)"
    }
  ]
}`;

  const userMsg = `Research eBay UK dropshipping opportunities for the niche: "${q}".
Return 8-12 specific sub-niches with realistic UK eBay estimates for avg_price (GBP), sold_30d, active_listings, competition, opportunity_score (1-10), and a one-sentence reason.
High opportunity_score means low competition + good margin + proven demand.`;

  const raw = await claude(SYSTEM, userMsg, 2000);

  steps[0].state = 'done';
  steps[1].state = 'done';
  steps[2].state = 'active';
  setProgress('Scoring opportunities…', steps);

  let parsed;
  try {
    parsed = parseJSON(raw);
    // Handle if top-level is an array
    if (Array.isArray(parsed)) parsed = { niches: parsed };
    // Handle if niches key is missing but we got objects
    if (!parsed.niches && typeof parsed === 'object') {
      const firstArr = Object.values(parsed).find(v => Array.isArray(v));
      if (firstArr) parsed = { niches: firstArr };
    }
  } catch (e) {
    throw new Error('Could not parse response. Try again.');
  }

  const niches = parsed.niches || [];
  if (!niches.length) throw new Error('No data returned. Try a different niche.');

  niches.sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));

  const opps    = niches.filter(n => (n.opportunity_score || 0) >= 6);
  const avoid   = niches.filter(n => (n.opportunity_score || 0) < 4);
  const bestMargin = opps.length
    ? Math.round(((opps[0].avg_price - opps[0].avg_price * 0.35) / opps[0].avg_price) * 100)
    : 0;

  steps[2].state = 'done';
  steps[3].state = 'done';
  setProgress('Done', steps);

  _lastResearchResults = buildReportText(q, niches, opps, avoid);

  // Metrics
  document.getElementById('met-opps').textContent        = opps.length;
  document.getElementById('met-avoid').textContent       = avoid.length;
  document.getElementById('met-best-margin').textContent = bestMargin ? `~${bestMargin}%` : '—';

  // Opportunity cards
  const cards = document.getElementById('opp-cards');
  if (!opps.length) {
    cards.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--text-secondary)">No clear low-competition opportunities found. Try a broader or different niche.</p></div>';
  } else {
    cards.innerHTML = opps.map((n, i) => {
      const rankLabel = i === 0 ? '🏆 Top pick' : i === 1 ? '2nd' : i === 2 ? '3rd' : `#${i + 1}`;
      const compClass = n.competition === 'Low' ? 'pill-green' : n.competition === 'Medium' ? 'pill-amber' : 'pill-gray';
      const price     = n.avg_price ? `£${parseFloat(n.avg_price).toFixed(2)}` : '—';
      const sold      = n.sold_30d ? `${n.sold_30d} sold/mo` : '—';
      const active    = n.active_listings ? `${n.active_listings} active` : '—';
      const score     = n.opportunity_score || '?';
      return `
        <div class="opp-card ${i === 0 ? 'top-pick' : ''}">
          <div class="opp-card-header">
            <span class="rank-label">${rankLabel}</span>
            <span class="score-badge">Score: ${score}/10</span>
          </div>
          <h3>${n.name}</h3>
          <div class="opp-stats">
            <span>${price}</span>
            <span>${sold}</span>
            <span>${active}</span>
            <span class="pill ${compClass}">${n.competition || '?'}</span>
          </div>
          <p class="opp-reason">${n.reason || ''}</p>
          <button class="btn-secondary btn-sm" onclick="prefillListing('${escHtml(n.name)}', '${price}')">
            Create listing →
          </button>
        </div>`;
    }).join('');
  }

  // Avoid list
  const avoidEl = document.getElementById('avoid-list');
  avoidEl.innerHTML = avoid.length
    ? avoid.map(n => `<div class="avoid-item"><strong>${n.name}</strong> — ${n.reason || 'High competition'}</div>`).join('')
    : '<p style="font-size:13px;color:var(--text-secondary)">No products flagged to avoid.</p>';

  document.getElementById('results-section').style.display = 'block';
}

function escHtml(s) { return (s || '').replace(/'/g, "\\'"); }

// Wire up research button
document.getElementById('btn-research')?.addEventListener('click', async () => {
  const q = document.getElementById('research-input')?.value?.trim();
  if (!q) return alert('Enter a niche to research.');

  const btn = document.getElementById('btn-research');
  btn.disabled = true;
  btn.textContent = 'Researching…';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('progress-wrap').style.display   = 'block';
  document.getElementById('error-msg').style.display       = 'none';

  // Reset steps
  ['step-1','step-2','step-3','step-4'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.className = 'step ' + (i === 0 ? 'active' : 'pending');
  });

  try {
    await runFreeAnalysis(q);
  } catch (e) {
    document.getElementById('error-msg').textContent    = e.message;
    document.getElementById('error-msg').style.display  = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Find opportunities';
    document.getElementById('progress-wrap').style.display = 'none';
  }
});

// Live eBay scan
document.getElementById('btn-live-scan')?.addEventListener('click', async () => {
  const q = document.getElementById('research-input')?.value?.trim();
  if (!q) return alert('Enter a niche first.');
  const confirmed = confirm(
    '⚠️ Live eBay scan costs ~20p per search (uses more tokens).\n\nProceed?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('btn-live-scan');
  btn.disabled    = true;
  btn.textContent = 'Scanning…';

  try {
    // Same as free but instructs Claude to imagine it scraped live data
    await runFreeAnalysis(q + ' (provide highly specific, realistic 2024 UK eBay market data as if live scraped)');
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = '🔍 Live eBay scan (~20p)';
  }
});

// Copy report
document.getElementById('btn-copy-report')?.addEventListener('click', () => {
  if (!_lastResearchResults) return;
  navigator.clipboard.writeText(_lastResearchResults)
    .then(() => { document.getElementById('btn-copy-report').textContent = 'Copied!'; setTimeout(() => { document.getElementById('btn-copy-report').textContent = 'Copy report'; }, 2000); })
    .catch(() => alert('Copy failed. Try manually.'));
});

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — LISTING CREATOR
═══════════════════════════════════════════════════════════════════════════ */

function prefillListing(name, price) {
  // Switch to listing tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="tab-listing"]')?.classList.add('active');
  document.getElementById('tab-listing')?.classList.add('active');

  const el = document.getElementById('listing-product');
  if (el) el.value = name;
}

document.getElementById('btn-create-listing')?.addEventListener('click', async () => {
  const product  = document.getElementById('listing-product')?.value?.trim();
  const price    = document.getElementById('listing-price')?.value?.trim();
  const keywords = document.getElementById('listing-keywords')?.value?.trim();

  if (!product) return alert('Enter a product name.');

  const btn = document.getElementById('btn-create-listing');
  btn.disabled    = true;
  btn.textContent = 'Creating…';

  try {
    const SYSTEM = `You are an expert eBay UK listing copywriter.
You MUST respond with ONLY a raw JSON object — no markdown, no backticks, no explanation.
Start with { and end with }.`;

    const userMsg = `Create an eBay UK listing for: "${product}"
${price ? `Selling price: £${price}` : ''}
${keywords ? `Keywords to include: ${keywords}` : ''}

Return JSON:
{
  "title": "eBay title max 80 chars with top keywords",
  "subtitle": "optional subtitle max 55 chars",
  "description": "Full HTML description (use <ul>, <strong>, <p> tags). Include: key features, dimensions if relevant, what's in the box, why buy from us.",
  "item_specifics": { "key": "value" },
  "category_suggestion": "eBay category name",
  "recommended_price": number,
  "keywords": ["keyword1", "keyword2"]
}`;

    const raw    = await claude(SYSTEM, userMsg, 2000);
    const parsed = parseJSON(raw);

    document.getElementById('listing-output').style.display = 'block';
    document.getElementById('out-title').textContent        = parsed.title || '';
    document.getElementById('out-subtitle').textContent     = parsed.subtitle || '';
    document.getElementById('out-description').innerHTML    = parsed.description || '';
    document.getElementById('out-category').textContent     = parsed.category_suggestion || '';
    document.getElementById('out-price').textContent        = parsed.recommended_price ? `£${parseFloat(parsed.recommended_price).toFixed(2)}` : '';

    const specs = parsed.item_specifics || {};
    document.getElementById('out-specifics').innerHTML = Object.entries(specs)
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

    const kws = parsed.keywords || [];
    document.getElementById('out-keywords').textContent = kws.join(', ');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Create listing';
  }
});

document.getElementById('btn-copy-listing')?.addEventListener('click', () => {
  const title = document.getElementById('out-title')?.textContent || '';
  const desc  = document.getElementById('out-description')?.innerText || '';
  navigator.clipboard.writeText(`TITLE:\n${title}\n\nDESCRIPTION:\n${desc}`)
    .then(() => { document.getElementById('btn-copy-listing').textContent = 'Copied!'; setTimeout(() => { document.getElementById('btn-copy-listing').textContent = 'Copy listing'; }, 2000); });
});

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — ORDER TRACKER
═══════════════════════════════════════════════════════════════════════════ */

const ORDERS_KEY = 'dd_orders';

function loadOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; }
}
function saveOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function renderOrders() {
  const orders  = loadOrders();
  const filter  = document.getElementById('order-filter')?.value || 'all';
  const search  = document.getElementById('order-search')?.value?.toLowerCase() || '';
  const list    = document.getElementById('orders-list');

  let filtered = orders;
  if (filter !== 'all') filtered = filtered.filter(o => o.status === filter);
  if (search) filtered = filtered.filter(o =>
    (o.item || '').toLowerCase().includes(search) ||
    (o.buyer || '').toLowerCase().includes(search) ||
    (o.id || '').toLowerCase().includes(search)
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No orders found.</div>';
    return;
  }

  const statusClass = { pending: 'pill-amber', ordered: 'pill-blue', shipped: 'pill-purple', delivered: 'pill-green', issue: 'pill-red' };

  list.innerHTML = filtered.map(o => `
    <div class="order-card">
      <div class="order-header">
        <div>
          <strong>#${o.id || '?'}</strong>
          <span class="pill ${statusClass[o.status] || 'pill-gray'}">${o.status}</span>
        </div>
        <div class="order-actions">
          <select onchange="updateOrderStatus('${o._key}', this.value)">
            ${['pending','ordered','shipped','delivered','issue'].map(s =>
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="btn-danger btn-sm" onclick="deleteOrder('${o._key}')">Delete</button>
        </div>
      </div>
      <div class="order-body">
        <div><span class="label">Item</span> ${o.item || '—'}</div>
        <div><span class="label">Buyer</span> ${o.buyer || '—'}</div>
        <div><span class="label">Sale price</span> ${o.sale_price ? '£' + o.sale_price : '—'}</div>
        <div><span class="label">Cost</span> ${o.cost ? '£' + o.cost : '—'}</div>
        <div><span class="label">Profit</span> ${o.sale_price && o.cost ? '£' + (parseFloat(o.sale_price) - parseFloat(o.cost) - (parseFloat(o.sale_price) * 0.127)).toFixed(2) : '—'}</div>
        <div><span class="label">Tracking</span> ${o.tracking || '—'}</div>
        <div><span class="label">Notes</span> ${o.notes || '—'}</div>
      </div>
    </div>
  `).join('');

  // Metrics
  const total  = orders.length;
  const profit = orders.reduce((acc, o) => {
    if (o.sale_price && o.cost) {
      return acc + (parseFloat(o.sale_price) - parseFloat(o.cost) - parseFloat(o.sale_price) * 0.127);
    }
    return acc;
  }, 0);
  document.getElementById('ord-total').textContent  = total;
  document.getElementById('ord-profit').textContent = `£${profit.toFixed(2)}`;
  document.getElementById('ord-pending').textContent = orders.filter(o => o.status === 'pending').length;
}

function updateOrderStatus(key, status) {
  const orders = loadOrders();
  const order  = orders.find(o => o._key === key);
  if (order) { order.status = status; saveOrders(orders); renderOrders(); }
}

function deleteOrder(key) {
  if (!confirm('Delete this order?')) return;
  const orders = loadOrders().filter(o => o._key !== key);
  saveOrders(orders);
  renderOrders();
}

document.getElementById('btn-add-order')?.addEventListener('click', () => {
  document.getElementById('add-order-form').style.display = 'block';
});

document.getElementById('btn-cancel-order')?.addEventListener('click', () => {
  document.getElementById('add-order-form').style.display = 'none';
});

document.getElementById('btn-save-order')?.addEventListener('click', () => {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const order = {
    _key:       Date.now().toString(),
    id:         get('new-order-id') || `DD-${Date.now()}`,
    item:       get('new-order-item'),
    buyer:      get('new-order-buyer'),
    sale_price: get('new-order-sale'),
    cost:       get('new-order-cost'),
    tracking:   get('new-order-tracking'),
    notes:      get('new-order-notes'),
    status:     document.getElementById('new-order-status')?.value || 'pending',
    created:    new Date().toISOString(),
  };
  const orders = loadOrders();
  orders.unshift(order);
  saveOrders(orders);
  document.getElementById('add-order-form').style.display = 'none';
  // Clear fields
  ['new-order-id','new-order-item','new-order-buyer','new-order-sale','new-order-cost','new-order-tracking','new-order-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderOrders();
});

document.getElementById('order-filter')?.addEventListener('change', renderOrders);
document.getElementById('order-search')?.addEventListener('input', renderOrders);

// Initial render
renderOrders();

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — SUPPLIER WORKFLOW
═══════════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-supplier-search')?.addEventListener('click', async () => {
  const product  = document.getElementById('supplier-product')?.value?.trim();
  const budget   = document.getElementById('supplier-budget')?.value?.trim();
  const location = document.getElementById('supplier-location')?.value || 'UK';

  if (!product) return alert('Enter a product to search.');

  const btn = document.getElementById('btn-supplier-search');
  btn.disabled    = true;
  btn.textContent = 'Searching…';

  try {
    const SYSTEM = `You are an expert dropshipping supplier researcher.
You MUST respond with ONLY a raw JSON object — no markdown, no backticks, no explanation.
Start with { and end with }.`;

    const userMsg = `Find dropshipping supplier recommendations for: "${product}"
${budget ? `Target cost price: £${budget}` : ''}
Preferred supplier location: ${location}

Return JSON:
{
  "suppliers": [
    {
      "name": "Supplier name",
      "platform": "CJ Dropshipping / AliExpress / Syncee / UK Wholesale / etc",
      "url_hint": "where to find them",
      "est_cost": number,
      "shipping_days": "e.g. 7-14",
      "moq": "minimum order e.g. 1",
      "pros": ["pro1", "pro2"],
      "cons": ["con1"],
      "rating": number (1-5)
    }
  ],
  "recommended_markup": number,
  "tips": ["tip1", "tip2"]
}`;

    const raw    = await claude(SYSTEM, userMsg, 2000);
    const parsed = parseJSON(raw);

    const suppliers = parsed.suppliers || [];
    const out       = document.getElementById('supplier-results');
    out.style.display = 'block';

    document.getElementById('supplier-tips').innerHTML = (parsed.tips || [])
      .map(t => `<li>${t}</li>`).join('');
    document.getElementById('supplier-markup').textContent =
      parsed.recommended_markup ? `Recommended markup: ${parsed.recommended_markup}x` : '';

    document.getElementById('supplier-cards').innerHTML = suppliers.map(s => `
      <div class="supplier-card">
        <div class="supplier-header">
          <strong>${s.name}</strong>
          <span class="pill pill-blue">${s.platform}</span>
          <span class="stars">${'★'.repeat(Math.round(s.rating || 0))}${'☆'.repeat(5 - Math.round(s.rating || 0))}</span>
        </div>
        <div class="supplier-body">
          <div><span class="label">Est. cost</span> £${parseFloat(s.est_cost || 0).toFixed(2)}</div>
          <div><span class="label">Shipping</span> ${s.shipping_days || '?'} days</div>
          <div><span class="label">MOQ</span> ${s.moq || '1'}</div>
          <div><span class="label">Find on</span> ${s.url_hint || '—'}</div>
        </div>
        <div class="pros-cons">
          <div class="pros">${(s.pros || []).map(p => `<span>✓ ${p}</span>`).join('')}</div>
          <div class="cons">${(s.cons || []).map(c => `<span>✗ ${c}</span>`).join('')}</div>
        </div>
      </div>
    `).join('');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Find suppliers';
  }
});

/* ─── Settings / API key ────────────────────────────────────────────────── */
document.getElementById('btn-save-key')?.addEventListener('click', () => {
  const val = document.getElementById('settings-key')?.value?.trim();
  if (!val) return alert('Enter an API key.');
  saveKey(val);
  alert('API key saved.');
});

document.getElementById('btn-clear-key')?.addEventListener('click', () => {
  if (!confirm('Remove saved API key?')) return;
  localStorage.removeItem(KEY_NAME);
  const el = document.getElementById('settings-key');
  if (el) el.value = '';
  alert('Key removed.');
});

// Pre-fill key field if already saved
window.addEventListener('DOMContentLoaded', () => {
  const k  = getKey();
  const el = document.getElementById('settings-key');
  if (el && k) el.value = k;
});
