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

// ─── Research tab ──────────────────────────────────────────────────────────

function fillNiche(niche) {
  document.getElementById('res-query').value = niche;
  document.getElementById('res-query').focus();
}

async function runResearch() {
  const q = document.getElementById('res-query').value.trim();
  if (!q) { document.getElementById('res-query').focus(); return; }

  setLoading('res-btn', 'res-btn-text', true, 'Research');
  document.getElementById('res-result').classList.add('hidden');

  try {
    const sys = `You are a dropshipping expert specialising in eBay UK. Return ONLY valid JSON — no markdown, no backticks — with exactly these keys:
margin (string e.g. "25–40%"), competition ("Low" | "Medium" | "High"), trend ("Rising" | "Stable" | "Declining"),
analysis (3–4 sentences covering opportunity, top product ideas, pricing advice, and supplier tips).`;

    const txt = await callClaude(sys, `Research this niche for eBay UK dropshipping: ${q}`);
    const d = safeParseJSON(txt);

    document.getElementById('met-margin').textContent = d.margin      || '—';
    document.getElementById('met-comp').textContent   = d.competition || '—';
    document.getElementById('met-trend').textContent  = d.trend       || '—';
    document.getElementById('res-ai-text').textContent = d.analysis   || txt;
    document.getElementById('res-result').classList.remove('hidden');
    window._lastResearchNiche = q;
  } catch (e) {
    alert('Error: ' + e.message);
  }

  setLoading('res-btn', 'res-btn-text', false, 'Research');
}

function goToListing() {
  if (window._lastResearchNiche) {
    document.getElementById('lst-product').value = window._lastResearchNiche;
  }
  document.querySelectorAll('.tab')[1].click();
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
