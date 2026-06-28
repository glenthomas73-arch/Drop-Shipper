/* DropDash - app.js */

/* - Constants - */
const API_URL   = 'https://api.anthropic.com/v1/messages';
const API_MODEL = 'claude-sonnet-4-6';
const KEY_NAME        = 'dd_api_key';

/* - API key helpers - */
function getKey()    { return localStorage.getItem(KEY_NAME); }
function saveKey(k)  { localStorage.setItem(KEY_NAME, k.trim()); }

function requireKey() {
  let k = getKey();
  if (k) return k;
  k = prompt('Enter your Anthropic API key (stored locally only):');
  if (!k) throw new Error('No API key provided.');
  saveKey(k);
  return k;
}


/* - Core Claude call - */
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

/* - Robust JSON parser - */
function parseJSON(raw) {
  let clean = raw.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(clean); } catch (_) {}
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_) {} }
  throw new Error('Could not parse response. Try again.');
}

/* - HTML escape - */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* - Show / hide helper (handles .hidden class + inline style) - */
function show(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.style.display = ''; }
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); }
}

/* - Toast notification - */
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

/* - Tab navigation - */
function switchTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  const panel = document.getElementById('panel-' + name);
  if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
}

/* -
TAB 1 - PRODUCT RESEARCH
- */

let _lastResearchResults = '';

function setProgress(msg, steps) {
  const container = document.getElementById('res-progress');
  const textEl    = document.getElementById('res-progress-text');
  const stepsEl   = document.getElementById('res-progress-steps');
  if (msg === null || msg === false) { hide('res-progress'); return; }
  show('res-progress');
  if (textEl) textEl.textContent = msg || 'Processing...';
  if (steps && stepsEl) {
    stepsEl.innerHTML = steps.map(s =>
      '<div class="step-item step-' + (s.state || 'pending') + '" id="' + s.id + '">' +
      '<span class="step-dot"></span><span>' + escHtml(s.label || '') + '</span></div>'
    ).join('');
  }
}

function buildReportText(niche, niches, opps, avoid) {
  const lines = ['DropDash Research Report - ' + niche, '='.repeat(50), ''];
  lines.push('Opportunities (' + opps.length + '):');
  opps.forEach(function(n, i) {
    lines.push((i + 1) + '. ' + n.name);
    lines.push('   eBay sell: ' + parseFloat(n.ebay_sell_price || n.avg_price || 0).toFixed(2) +
               '  Buy: ' + parseFloat(n.supplier_cost || 0).toFixed(2) +
               '  Profit: ' + parseFloat(n.profit_after_fees || 0).toFixed(2) +
               '  Margin: ' + (n.margin_pct ? Math.round(n.margin_pct) + '%' : '?'));
    lines.push('   Sold/mo: ' + (n.sold_30d || '?') + '  Competition: ' + (n.competition || '?') + '  Score: ' + (n.opportunity_score || '?') + '/10');
    lines.push('   Source: ' + (n.source_platform || 'Syncee') + ' - search "' + (n.syncee_search || n.name) + '"');
    if (n.source_tip) lines.push('   Tip: ' + n.source_tip);
    lines.push('   ' + (n.reason || ''));
    lines.push('');
  });
  if (avoid.length) {
    lines.push('Avoid (' + avoid.length + '):');
    avoid.forEach(function(n) { lines.push('- ' + n.name + ': ' + (n.reason || '')); });
  }
  return lines.join('\n');
}

/* Quick-pick chips */
function fillNiche(niche) {
  const input = document.getElementById('res-query');
  if (input) { input.value = niche; input.focus(); }
}

/* Main search - called by onclick="runResearch()" */
async function runResearch() {
  const input = document.getElementById('res-query');
  const q = input ? input.value.trim() : '';
  if (!q) { alert('Enter a niche to research.'); return; }
  await runFreeAnalysis(q);
}

/* Free analysis core */
async function runFreeAnalysis(q) {
  const btn     = document.getElementById('res-btn');
  const btnText = document.getElementById('res-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Researching...';
  hide('res-result');

  const steps = [
    { id: 'step-1', state: 'active',  label: 'Generating sub-niches' },
    { id: 'step-2', state: 'pending', label: 'Analysing competition' },
    { id: 'step-3', state: 'pending', label: 'Scoring opportunities' },
    { id: 'step-4', state: 'pending', label: 'Building report' },
  ];
  setProgress('Generating sub-niches...', steps);

  try {
    const SYSTEM = 'You are an eBay UK dropshipping expert specialising in UK-warehouse sourcing via Syncee and Avasam.\n' +
      'CRITICAL RULE: Only recommend products that can be sourced from UK-based warehouses. Never suggest AliExpress, CJ Dropshipping, or any supplier shipping from China or outside the UK/EU. UK buyers expect 2-5 day delivery - overseas shipping destroys eBay feedback and listing rank.\n' +
      'Preferred source platforms: Syncee (filter by UK warehouse) and Avasam (all suppliers are UK-based).\n' +
      'You MUST respond with ONLY a raw JSON object - no markdown, no backticks, no explanation, no preamble.\n' +
      'Start your response with { and end with }.\n' +
      'Return exactly this structure:\n' +
      '{\n  "niches": [\n    {\n' +
      '      "name": "string",\n' +
      '      "avg_price": number,\n' +
      '      "sold_30d": number,\n' +
      '      "active_listings": number,\n' +
      '      "competition": "Low|Medium|High",\n' +
      '      "opportunity_score": number,\n' +
      '      "reason": "string",\n' +
      '      "supplier_cost": number,\n' +
      '      "ebay_sell_price": number,\n' +
      '      "profit_after_fees": number,\n' +
      '      "margin_pct": number,\n' +
      '      "source_platform": "Syncee|Avasam",\n' +
      '      "syncee_search": "string",\n' +
      '      "source_tip": "string"\n' +
      '    }\n  ]\n}';

    const userMsg = 'Research eBay UK dropshipping opportunities for the niche: "' + q + '".\n' +
      'Return 8-12 specific sub-niches with realistic UK eBay data AND sourcing info.\n\n' +
      'IMPORTANT: Only include products you can source from UK-warehouse suppliers on Syncee or Avasam. Do not suggest anything sourced from China or with overseas shipping.\n\n' +
      'For each niche:\n' +
      '- avg_price: typical eBay UK selling price in GBP\n' +
      '- sold_30d: estimated units sold per month\n' +
      '- active_listings: number of competing listings\n' +
      '- competition: Low/Medium/High\n' +
      '- opportunity_score: 1-10 (high = low competition + good margin + proven demand)\n' +
      '- reason: one sentence why this is a good/bad opportunity\n' +
      '- supplier_cost: realistic buy price from a UK-warehouse supplier in GBP\n' +
      '- ebay_sell_price: recommended listing price on eBay in GBP (must be at least 2.5x supplier_cost)\n' +
      '- profit_after_fees: ebay_sell_price minus supplier_cost minus eBay fees (13% of sell price)\n' +
      '- margin_pct: profit_after_fees / ebay_sell_price * 100 rounded to nearest integer\n' +
      '- source_platform: Syncee or Avasam (never AliExpress or CJ Dropshipping)\n' +
      '- syncee_search: exact search term to use on Syncee or Avasam to find this product\n' +
      '- source_tip: one sentence tip about sourcing from a UK warehouse (e.g. filter by UK dispatch, check stock levels, look for suppliers with tracked shipping)';

    const raw = await claude(SYSTEM, userMsg, 4000);

    steps[0].state = 'done'; steps[1].state = 'done'; steps[2].state = 'active';
    setProgress('Scoring opportunities...', steps);

    let parsed;
    try {
      parsed = parseJSON(raw);
      console.log('[DropDash] Raw API response:', raw.substring(0, 500));
      console.log('[DropDash] Parsed niches sample:', JSON.stringify((parsed.niches || [])[0], null, 2));
      if (Array.isArray(parsed)) parsed = { niches: parsed };
      if (!parsed.niches && typeof parsed === 'object') {
        const firstArr = Object.values(parsed).find(function(v) { return Array.isArray(v); });
        if (firstArr) parsed = { niches: firstArr };
      }
      /* Back-fill missing pricing fields so cards always render */
      (parsed.niches || []).forEach(function(n) {
        if (!n.supplier_cost && n.avg_price) n.supplier_cost = parseFloat((n.avg_price / 3).toFixed(2));
        if (!n.ebay_sell_price && n.avg_price) n.ebay_sell_price = n.avg_price;
        if (!n.profit_after_fees && n.ebay_sell_price && n.supplier_cost) {
          n.profit_after_fees = parseFloat((n.ebay_sell_price - n.supplier_cost - n.ebay_sell_price * 0.13).toFixed(2));
        }
        if (!n.margin_pct && n.profit_after_fees && n.ebay_sell_price) {
          n.margin_pct = Math.round(n.profit_after_fees / n.ebay_sell_price * 100);
        }
        if (!n.syncee_search) n.syncee_search = n.name;
        if (!n.source_platform) n.source_platform = 'Syncee';
      });
    } catch (e) {
      throw new Error('Could not parse response. Try again.');
    }

    const niches = parsed.niches || [];
    if (!niches.length) throw new Error('No data returned. Try a different niche.');

    niches.sort(function(a, b) { return (b.opportunity_score || 0) - (a.opportunity_score || 0); });
    const opps  = niches.filter(function(n) { return (n.opportunity_score || 0) >= 6; });
    const avoid = niches.filter(function(n) { return (n.opportunity_score || 0) < 4; });
    const bestMargin = opps.length
      ? Math.round(((opps[0].avg_price - opps[0].avg_price * 0.35) / opps[0].avg_price) * 100)
      : 0;

    steps[2].state = 'done'; steps[3].state = 'done';
    setProgress('Done', steps);

    _lastResearchResults = buildReportText(q, niches, opps, avoid);

    document.getElementById('met-opps').textContent        = opps.length;
    document.getElementById('met-avoid').textContent       = avoid.length;
    document.getElementById('met-best-margin').textContent = bestMargin ? ('~' + bestMargin + '%') : '-';

    const cards = document.getElementById('opp-cards');
    if (!opps.length) {
      cards.innerHTML = '<p style="font-size:13px;color:var(--text-secondary)">No clear low-competition opportunities found. Try a broader or different niche.</p>';
    } else {
      cards.innerHTML = opps.map(function(n, i) {
        const rankLabel    = i === 0 ? ' Top pick' : i === 1 ? '2nd' : i === 2 ? '3rd' : ('#' + (i + 1));
        const compClass    = n.competition === 'Low' ? 'pill-green' : n.competition === 'Medium' ? 'pill-amber' : 'pill-gray';
        const price        = n.avg_price       ? ('' + parseFloat(n.avg_price).toFixed(2))       : '-';
        const sold         = n.sold_30d        ? (n.sold_30d + ' sold/mo')                        : '-';
        const active       = n.active_listings ? (n.active_listings + ' active')                  : '-';
        const score        = n.opportunity_score || '?';
        const buyCost      = n.supplier_cost    ? ('' + parseFloat(n.supplier_cost).toFixed(2))  : '-';
        const sellPrice    = n.ebay_sell_price  ? ('' + parseFloat(n.ebay_sell_price).toFixed(2)): '-';
        const profit       = (n.profit_after_fees != null) ? ('' + parseFloat(n.profit_after_fees).toFixed(2)) : '-';
        const marginPct    = n.margin_pct       ? (Math.round(n.margin_pct) + '%')                : '-';
        const platform     = escHtml(n.source_platform || 'Syncee');
        const synceeSearch = escHtml(n.syncee_search  || n.name);
        const sourceTip    = escHtml(n.source_tip     || '');
        const nameSafe     = escHtml(n.name);
        const priceSafe    = escHtml(sellPrice);
        const platformClass= n.source_platform === 'Avasam' ? 'pill-green' : 'pill-blue';

        return '<div class="opp-card ' + (i === 0 ? 'top-pick' : '') + '">' +
          '<div class="opp-card-header">' +
          '<span class="rank-label">' + rankLabel + '</span>' +
          '<span class="score-badge">Score: ' + score + '/10</span>' +
          '</div>' +
          '<h3>' + nameSafe + '</h3>' +
          '<div class="opp-stats">' +
          '<span>' + price + '</span><span>' + sold + '</span><span>' + active + '</span>' +
          '<span class="pill ' + compClass + '">' + (n.competition || '?') + '</span>' +
          '</div>' +
          '<p class="opp-reason">' + escHtml(n.reason || '') + '</p>' +

          /* - Pricing breakdown - */
          '<div style="margin:.75rem 0;padding:.65rem .75rem;background:var(--bg-secondary,#f8f9fa);border-radius:6px;font-size:13px">' +
          '<div style="font-weight:600;margin-bottom:.4rem;color:var(--text-primary)"> Buy / Sell breakdown</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.25rem .5rem;color:var(--text-secondary)">' +
          '<div><span style="font-size:11px;display:block">Buy price</span><strong style="color:var(--danger,#dc2626)">' + buyCost + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">eBay sell</span><strong style="color:var(--success,#16a34a)">' + sellPrice + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">Profit/item</span><strong>' + profit + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">Margin</span><strong>' + marginPct + '</strong></div>' +
          '</div>' +
          '</div>' +

          /* - Sourcing info - */
          '<div style="margin-bottom:.75rem;padding:.65rem .75rem;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:13px">' +
          '<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem">' +
          '<span style="font-weight:600;color:var(--text-primary)"> Source on</span>' +
          '<span class="pill ' + platformClass + '" style="font-size:11px">' + platform + '</span>' +
          '</div>' +
          '<div style="margin-bottom:.3rem"><span style="color:var(--text-secondary);font-size:11px">Search term: </span>' +
          '<code style="background:var(--bg-secondary,#f1f5f9);padding:1px 5px;border-radius:3px;font-size:12px">' + synceeSearch + '</code></div>' +
          (sourceTip ? '<div style="color:var(--text-secondary);font-size:12px;margin-top:.3rem"> ' + sourceTip + '</div>' : '') +
          '</div>' +

          '<button class="btn btn-sm" onclick="prefillListing(' + "'" + nameSafe.replace(/'/g, "\\'") + "'" + ', ' + "'" + priceSafe + "'" + ')">Create listing -></button>' +
          '</div>';
      }).join('');
    }

    const avoidEl = document.getElementById('avoid-list');
    avoidEl.innerHTML = avoid.length
      ? avoid.map(function(n) {
          return '<div class="avoid-item"><strong>' + escHtml(n.name) + '</strong> - ' + escHtml(n.reason || 'High competition') + '</div>';
        }).join('')
      : '<p style="font-size:13px;color:var(--text-secondary)">No products flagged to avoid.</p>';

    show('res-result');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Find opportunities';
  }
}

/* Live eBay scan */
async function confirmLiveScan() {
  const input = document.getElementById('res-query');
  const q = input ? input.value.trim() : '';
  if (!q) { alert('Enter a niche first.'); return; }
  if (!confirm('This will run a live eBay scan costing ~15-20p. Continue?')) return;
  await runFreeAnalysis(q + ' (provide highly specific, realistic 2024 UK eBay market data as if live scraped)');
}

/* Copy report */
function copyResults() {
  if (!_lastResearchResults) return;
  navigator.clipboard.writeText(_lastResearchResults)
    .then(function() { showToast('Report copied!'); })
    .catch(function() { alert('Copy failed. Try manually.'); });
}

/* -
TAB 2 - LISTING CREATOR
- */

function prefillListing(name, price) {
  switchTab('listing', document.querySelector('.tab:nth-child(2)'));
  const el = document.getElementById('lst-product');
  if (el) el.value = name;
}

async function runListing() {
  const product  = (document.getElementById('lst-product')  && document.getElementById('lst-product').value  || '').trim();
  const cost     = (document.getElementById('lst-cost')     && document.getElementById('lst-cost').value     || '').trim();
  const features = (document.getElementById('lst-features') && document.getElementById('lst-features').value || '').trim();
  const cat      = (document.getElementById('lst-cat')      && document.getElementById('lst-cat').value      || '');

  if (!product) { alert('Enter a product name.'); return; }

  const btn     = document.getElementById('lst-btn');
  const btnText = document.getElementById('lst-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Creating...';

  try {
    const SYSTEM = 'You are an expert eBay UK listing copywriter.\n' +
      'You MUST respond with ONLY a raw JSON object - no markdown, no backticks, no explanation.\n' +
      'Start with { and end with }.';

    const userMsg = 'Create an eBay UK listing for: "' + product + '"\n' +
      (cost     ? ('Cost price: ' + cost + '\n')       : '') +
      (cat      ? ('Category: ' + cat + '\n')           : '') +
      (features ? ('Key features: ' + features + '\n')  : '') +
      '\nReturn JSON:\n' +
      '{\n' +
      '  "title": "eBay title max 80 chars with top keywords",\n' +
      '  "description": "2-3 sentence description highlighting benefits, what is in the box, why buy from us.",\n' +
      '  "item_specifics": [{"name": "...", "value": "..."}],\n' +
      '  "category_suggestion": "eBay category name",\n' +
      '  "recommended_price": 0.00,\n' +
      '  "keywords": ["keyword1", "keyword2", "keyword3"]\n' +
      '}';

    const raw    = await claude(SYSTEM, userMsg, 2000);
    const parsed = parseJSON(raw);

    const titleEl   = document.getElementById('lst-title');
    const descEl    = document.getElementById('lst-desc');
    const specsEl   = document.getElementById('lst-specifics');
    const tagsEl    = document.getElementById('lst-tags');
    const priceEl   = document.getElementById('lst-price');
    const marginEl  = document.getElementById('lst-margin-note');
    const charCount = document.getElementById('title-chars');

    if (titleEl) titleEl.textContent = parsed.title || '';
    if (charCount && parsed.title) charCount.textContent = parsed.title.length + '/80';
    if (descEl) descEl.innerHTML = escHtml(parsed.description || '').replace(/\n/g, '<br>');
    if (specsEl && Array.isArray(parsed.item_specifics)) {
      specsEl.innerHTML = parsed.item_specifics.map(function(s) {
        return '<div><strong>' + escHtml(s.name) + ':</strong> ' + escHtml(s.value) + '</div>';
      }).join('');
    }
    if (tagsEl && parsed.keywords) tagsEl.textContent = parsed.keywords.join(', ');
    if (priceEl && parsed.recommended_price) {
      priceEl.textContent = '' + Number(parsed.recommended_price).toFixed(2);
    }
    if (marginEl && cost && parsed.recommended_price) {
      const margin = ((parsed.recommended_price - parseFloat(cost)) / parsed.recommended_price * 100).toFixed(0);
      marginEl.textContent = '~' + margin + '% margin at this price';
    }

    show('lst-result');


  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Generate listing';
  }
}

/* -
IMAGE SECTION - supplier URL paste & select
- */

let _selectedImages = []; // { url, filename }
let _currentImages  = [];

let _supplierUrls = [];

// Store pasted URL via clipboard event to bypass password manager interference
var _pendingPastedUrl = '';

document.addEventListener('paste', function(e) {
  if (e.target && e.target.id === 'supplier-url-input') {
    var pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (pasted) {
      _pendingPastedUrl = pasted;
      setTimeout(function() {
        var input = document.getElementById('supplier-url-input');
        if (input) input.value = _pendingPastedUrl;
      }, 10);
    }
  }
});

function pasteAndAddUrl() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function(text) {
      var url = text.trim();
      if (!url || url.indexOf('http') !== 0) { showToast('Nothing to paste — copy an image URL first'); return; }
      if (_supplierUrls.indexOf(url) > -1) { showToast('URL already added'); return; }
      _supplierUrls.push(url);
      updateSupplierUrlList();
      buildImageGrid();
      showToast('Image added (' + _supplierUrls.length + ' total)');
    }).catch(function() {
      showToast('Could not read clipboard — try allowing clipboard access');
    });
  } else {
    showToast('Clipboard API not available in this browser');
  }
}

function addSupplierUrl() {
  const input = document.getElementById('supplier-url-input');
  if (!input) return;
  // Try .value first, fall back to the clipboard-captured value
  const url = (input.value || _pendingPastedUrl || '').trim();
  _pendingPastedUrl = '';
  if (!url || url.indexOf('http') !== 0) { showToast('Paste a valid image URL starting with http'); return; }
  if (_supplierUrls.indexOf(url) > -1) { showToast('URL already added'); return; }
  _supplierUrls.push(url);
  input.value = '';
  input.focus();
  updateSupplierUrlList();
  buildImageGrid();
  showToast('Image added (' + _supplierUrls.length + ' total)');
}

function updateSupplierUrlList() {
  const el = document.getElementById('supplier-url-list');
  if (!el) return;
  if (_supplierUrls.length === 0) { el.textContent = ''; return; }
  el.innerHTML = _supplierUrls.map(function(url, i) {
    const short = url.length > 60 ? url.substring(0, 60) + '...' : url;
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (i+1) + '. ' + escHtml(short) + '</span>' +
      '<button onclick="removeSupplierUrl(' + i + ')" style="border:none;background:none;cursor:pointer;color:var(--text-secondary);font-size:16px;padding:0 4px">&times;</button>' +
      '</div>';
  }).join('');
}

function removeSupplierUrl(i) {
  _supplierUrls.splice(i, 1);
  updateSupplierUrlList();
  buildImageGrid();
}

function buildImageGrid() {
  _currentImages = _supplierUrls.map(function(url, i) {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const filename = 'product-image-' + (i + 1) + '.' + (ext.length <= 4 ? ext : 'jpg');
    return { url: url, thumb: url, filename: filename };
  });
  renderImageGrid();
}

function loadSupplierImages() { buildImageGrid(); }

function clearSupplierImages() {
  _supplierUrls   = [];
  _currentImages  = [];
  _selectedImages = [];
  const input = document.getElementById('supplier-url-input');
  const list  = document.getElementById('supplier-url-list');
  const grid  = document.getElementById('lst-img-grid');
  if (input) input.value = '';
  if (list)  list.innerHTML = '';
  if (grid)  grid.innerHTML = '';
  updateSelectedPanel();
}

function renderImageGrid() {
  const grid = document.getElementById('lst-img-grid');
  if (!grid) return;
  grid.innerHTML = _currentImages.map(function(img, i) {
    const alreadySelected = _selectedImages.some(function(s) { return s.filename === img.filename; });
    return '<div class="img-tile' + (alreadySelected ? ' img-tile--selected' : '') + '" id="imgtile-' + i + '" onclick="toggleImageSelect(' + i + ')" data-url="' + escHtml(img.url) + '" data-filename="' + escHtml(img.filename) + '">' +
      '<img src="' + escHtml(img.thumb) + '" alt="Product image ' + (i + 1) + '" loading="lazy" onerror="this.style.display=this.style.display" />' +
      '<div class="img-tile-check">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<a class="img-tile-dl" href="' + escHtml(img.url) + '" target="_blank" onclick="event.stopPropagation()" title="Download">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      '</a>' +
      '</div>';
  }).join('');
}

function toggleImageSelect(i) {
  const img  = _currentImages[i];
  if (!img) return;
  const tile = document.getElementById('imgtile-' + i);
  const idx  = _selectedImages.findIndex(function(s) { return s.filename === img.filename; });
  if (idx > -1) {
    _selectedImages.splice(idx, 1);
    if (tile) tile.classList.remove('img-tile--selected');
  } else {
    if (_selectedImages.length >= 12) { showToast('Max 12 images for eBay listing'); return; }
    _selectedImages.push(img);
    if (tile) tile.classList.add('img-tile--selected');
  }
  updateSelectedPanel();
}

function updateSelectedPanel() {
  const countEl = document.getElementById('img-selected-count');
  const panel   = document.getElementById('lst-img-selected');
  const listEl  = document.getElementById('lst-img-selected-list');
  const n       = _selectedImages.length;

  if (countEl) countEl.textContent = n ? n + ' selected' : '';
  if (!panel || !listEl) return;
  if (n === 0) { panel.classList.add('hidden'); return; }

  panel.classList.remove('hidden');
  listEl.innerHTML = _selectedImages.map(function(img, i) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
      '<span>' + (i + 1) + '. ' + escHtml(img.filename) + '</span>' +
      '<a class="btn btn-sm" href="' + escHtml(img.url) + '" target="_blank" style="font-size:11px;padding:2px 8px">Open image</a>' +
      '</div>';
  }).join('');
}

/* - Copy helpers - */
function copyEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText || el.textContent || '')
    .then(function() { showToast('Copied!'); })
    .catch(function() { alert('Copy failed. Try manually.'); });
}

/* -
TAB 3 - ORDER TRACKER
- */

const ORDERS_KEY = 'dd_orders';

function loadOrders()       { try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || {}; } catch (e) { return {}; } }
function saveOrders(orders) { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }

function renderOrders() {
  const ordersObj = loadOrders();
  const orders    = Object.entries(ordersObj).map(function(entry) {
    return Object.assign({ _key: entry[0] }, entry[1]);
  });
  const list = document.getElementById('orders-list');
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);padding:1rem 0">No orders found.</p>';
  } else {
    const statusClass = {
      'awaiting supplier order': 'pill-amber',
      'shipped':   'pill-blue',
      'delivered': 'pill-green',
      'issue':     'pill-red'
    };
    list.innerHTML = orders.map(function(o) {
      const sc = statusClass[o.status] || 'pill-gray';
      return '<div class="order-card" style="border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:.75rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<strong>' + escHtml(o.oid || '-') + '</strong>' +
        '<span class="pill ' + sc + '">' + escHtml(o.status || '-') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">' +
        '<div>Item: ' + escHtml(o.item || '-') + '</div>' +
        '<div>Buyer: ' + escHtml(o.buyer || '-') + '</div>' +
        '<div>Sale: ' + (o.sale ? '' + parseFloat(o.sale).toFixed(2) : '-') +
        ' &nbsp; Cost: ' + (o.cost ? '' + parseFloat(o.cost).toFixed(2) : '-') + '</div>' +
        '</div>' +
        '<div style="margin-top:.5rem;display:flex;gap:.5rem">' +
        '<select onchange="updateOrderStatus(' + "'" + o._key + "'" + ', this.value)" style="font-size:12px;padding:2px 4px">' +
        ['awaiting supplier order','shipped','delivered','issue'].map(function(s) {
          return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') +
        '</select>' +
        '<button class="btn btn-sm" onclick="deleteOrder(' + "'" + o._key + "'" + ')" style="color:var(--danger,#dc2626)">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  const orders_all = orders;
  const total  = orders_all.length;
  const profit = orders_all.reduce(function(acc, o) {
    return (o.sale && o.cost) ? acc + (parseFloat(o.sale) - parseFloat(o.cost)) : acc;
  }, 0);
  const withMargin = orders_all.filter(function(o) { return o.sale && o.cost && parseFloat(o.sale) > 0; });
  const avgMargin  = withMargin.length
    ? Math.round(withMargin.reduce(function(acc, o) {
        return acc + ((parseFloat(o.sale) - parseFloat(o.cost)) / parseFloat(o.sale) * 100);
      }, 0) / withMargin.length)
    : 0;

  const statOrders = document.getElementById('stat-orders');
  const statProfit = document.getElementById('stat-profit');
  const statMargin = document.getElementById('stat-margin');
  if (statOrders) statOrders.textContent = total;
  if (statProfit) statProfit.textContent = '' + profit.toFixed(2);
  if (statMargin) statMargin.textContent = (isNaN(avgMargin) ? 0 : avgMargin) + '%';
}

function updateOrderStatus(key, status) {
  const orders = loadOrders();
  if (orders[key]) { orders[key].status = status; saveOrders(orders); renderOrders(); }
}

function deleteOrder(key) {
  if (!confirm('Delete this order?')) return;
  const orders = loadOrders();
  delete orders[key];
  saveOrders(orders);
  renderOrders();
}

function toggleAddOrder() {
  const form = document.getElementById('add-order-form');
  if (form) form.classList.toggle('hidden');
}

function saveOrder() {
  const oid    = (document.getElementById('new-oid')   ? document.getElementById('new-oid').value.trim()   : '');
  const item   = (document.getElementById('new-item')  ? document.getElementById('new-item').value.trim()  : '');
  const buyer  = (document.getElementById('new-buyer') ? document.getElementById('new-buyer').value.trim() : '');
  const sale   = (document.getElementById('new-sale')  ? document.getElementById('new-sale').value   : '');
  const cost   = (document.getElementById('new-cost')  ? document.getElementById('new-cost').value   : '');
  const status = (document.getElementById('new-status') ? document.getElementById('new-status').value : 'awaiting supplier order');

  if (!oid || !item) { alert('eBay Order ID and Item Name are required.'); return; }

  const orders = loadOrders();
  const key    = Date.now().toString();
  orders[key]  = { oid: oid, item: item, buyer: buyer, sale: parseFloat(sale) || 0, cost: parseFloat(cost) || 0, status: status };
  saveOrders(orders);
  renderOrders();
  toggleAddOrder();

  ['new-oid','new-item','new-buyer','new-sale','new-cost'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

renderOrders();

/* -
TAB 4 - SUPPLIER WORKFLOW
- */

async function runSupplier() {
  const product = (document.getElementById('sup-product') ? document.getElementById('sup-product').value.trim() : '');
  const qty     = (document.getElementById('sup-qty')     ? document.getElementById('sup-qty').value     : '1');
  const name    = (document.getElementById('sup-name')    ? document.getElementById('sup-name').value.trim()    : '');
  const addr1   = (document.getElementById('sup-addr1')   ? document.getElementById('sup-addr1').value.trim()   : '');
  const city    = (document.getElementById('sup-city')    ? document.getElementById('sup-city').value.trim()    : '');
  const post    = (document.getElementById('sup-post')    ? document.getElementById('sup-post').value.trim()    : '');
  const notes   = (document.getElementById('sup-notes')   ? document.getElementById('sup-notes').value.trim()   : '');

  if (!product) { alert('Enter a product name.'); return; }

  const btn     = document.getElementById('sup-btn');
  const btnText = document.getElementById('sup-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Generating...';

  try {
    const delivery = [name, addr1, city, post].filter(Boolean).join(', ');
    const userMsg  = 'Write a professional dropshipping order message for:\n' +
      'Product: ' + product + '\n' +
      'Quantity: ' + qty + '\n' +
      'Delivery address: ' + (delivery || 'To be provided') + '\n' +
      'Additional notes: ' + (notes || 'None') + '\n\n' +
      'Write a clear, professional email/message suitable for sending to a UK-based supplier on Syncee or Avasam. Include all order details. Mention that you require UK dispatch with tracked shipping. Be concise.';

    const message = await claude(
      'You are a professional eBay UK dropshipper writing supplier order messages. Only work with UK-warehouse suppliers (Syncee, Avasam). Always request UK dispatch with tracked shipping. Be concise and professional.',
      userMsg,
      500
    );

    const msgDiv = document.getElementById('sup-msg');
    if (msgDiv) msgDiv.textContent = message;
    show('sup-result');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Generate message';
  }
}
