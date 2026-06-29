/* DropDash - app.js */

/* - Constants - */
const API_URL      = 'https://api.anthropic.com/v1/messages';
const API_MODEL    = 'claude-sonnet-4-6';
const KEY_NAME     = 'dd_api_key';
const IMAGE_PROXY  = 'https://dropdash-image-proxy.glenthomas73.workers.dev/';

/* - Supplier search URL builders - */
function supplierSearchUrl(platform, searchTerm) {
  var term = encodeURIComponent(searchTerm || '');
  if (platform === 'Avasam') {
    return 'https://supply.avasam.co.uk/search?q=' + term;
  }
  return 'https://app.syncee.com/marketplace?search=' + term + '&warehouseLocation=GB';
}

/* - API key helpers - */
function getKey()    { return localStorage.getItem(KEY_NAME); }
function saveKey(k)  { localStorage.setItem(KEY_NAME, k.trim()); }

function requireKey() {
  var k = getKey();
  if (k) return k;
  k = prompt('Enter your Anthropic API key (stored locally only):');
  if (!k) throw new Error('No API key provided.');
  saveKey(k);
  return k;
}

/* - Core Claude call - */
async function claude(system, userMsg, maxTokens) {
  maxTokens = maxTokens || 1000;
  var key = requireKey();
  var res = await fetch(API_URL, {
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
      system: system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error((err && err.error && err.error.message) || ('API error ' + res.status));
  }
  var data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}

/* - Robust JSON parser - */
function parseJSON(raw) {
  var clean = raw.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(clean); } catch (_) {}
  var objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }
  var arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_) {} }
  throw new Error('Could not parse response. Try again.');
}

/* - HTML escape - */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* - Show / hide - */
function show(id) {
  var el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.style.display = ''; }
}
function hide(id) {
  var el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); }
}

/* - Toast - */
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}

/* - Tab navigation - */
function switchTab(name, el) {
  document.querySelectorAll('.panel').forEach(function(p) {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  var panel = document.getElementById('panel-' + name);
  if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
}

/* ================================================================
   TAB 1 - PRODUCT RESEARCH
   ================================================================ */

var _lastResearchResults = '';

function setProgress(msg, steps) {
  var container = document.getElementById('res-progress');
  var textEl    = document.getElementById('res-progress-text');
  var stepsEl   = document.getElementById('res-progress-steps');
  if (msg === null || msg === false) { hide('res-progress'); return; }
  show('res-progress');
  if (textEl) textEl.textContent = msg || 'Processing...';
  if (steps && stepsEl) {
    stepsEl.innerHTML = steps.map(function(s) {
      return '<div class="step-item step-' + (s.state || 'pending') + '" id="' + s.id + '">' +
        '<span class="step-dot"></span><span>' + escHtml(s.label || '') + '</span></div>';
    }).join('');
  }
}

function buildReportText(niche, niches, opps, avoid) {
  var lines = ['DropDash Research Report - ' + niche, '==================================================', ''];
  lines.push('Opportunities (' + opps.length + '):');
  opps.forEach(function(n, i) {
    lines.push((i + 1) + '. ' + n.name);
    lines.push('   eBay sell: GBP' + parseFloat(n.ebay_sell_price || n.avg_price || 0).toFixed(2) +
               '  Buy: GBP' + parseFloat(n.supplier_cost || 0).toFixed(2) +
               '  Profit: GBP' + parseFloat(n.profit_after_fees || 0).toFixed(2) +
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

function fillNiche(niche) {
  var input = document.getElementById('res-query');
  if (input) { input.value = niche; input.focus(); }
}

function copyResults() {
  if (!_lastResearchResults) { showToast('No results to copy yet.'); return; }
  navigator.clipboard.writeText(_lastResearchResults)
    .then(function() { showToast('Report copied!'); })
    .catch(function() { alert('Copy failed. Try manually.'); });
}

async function runResearch() {
  var input = document.getElementById('res-query');
  var q = input ? input.value.trim() : '';
  if (!q) { alert('Enter a niche to research.'); return; }
  await runFreeAnalysis(q);
}

async function runFreeAnalysis(q) {
  var btn     = document.getElementById('res-btn');
  var btnText = document.getElementById('res-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Researching...';
  hide('res-result');

  var steps = [
    { id: 'step-1', state: 'active',  label: 'Generating sub-niches' },
    { id: 'step-2', state: 'pending', label: 'Analysing competition' },
    { id: 'step-3', state: 'pending', label: 'Scoring opportunities' },
    { id: 'step-4', state: 'pending', label: 'Building report' },
  ];
  setProgress('Generating sub-niches...', steps);

  try {
    var SYSTEM =
      'You are an eBay UK dropshipping expert specialising in UK-warehouse sourcing via Syncee and Avasam.\n' +
      'CRITICAL RULE: Only recommend products that can be sourced from UK-based warehouses. Never suggest AliExpress, CJ Dropshipping, or any supplier shipping from China or outside the UK/EU.\n' +
      'UK buyers expect 2-5 day delivery - overseas shipping destroys eBay feedback and listing rank.\n' +
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

    var userMsg =
      'Research eBay UK dropshipping opportunities for the niche: "' + q + '".\n' +
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
      '- source_tip: one sentence tip about sourcing from a UK warehouse';

    var raw = await claude(SYSTEM, userMsg, 4000);

    steps[0].state = 'done'; steps[1].state = 'done'; steps[2].state = 'active';
    setProgress('Scoring opportunities...', steps);

    var parsed;
    try {
      parsed = parseJSON(raw);
      if (Array.isArray(parsed)) parsed = { niches: parsed };
      if (!parsed.niches && typeof parsed === 'object') {
        var firstArr = Object.values(parsed).find(function(v) { return Array.isArray(v); });
        if (firstArr) parsed = { niches: firstArr };
      }
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

    var niches = parsed.niches || [];
    if (!niches.length) throw new Error('No data returned. Try a different niche.');

    niches.sort(function(a, b) { return (b.opportunity_score || 0) - (a.opportunity_score || 0); });
    var opps  = niches.filter(function(n) { return (n.opportunity_score || 0) >= 6; });
    var avoid = niches.filter(function(n) { return (n.opportunity_score || 0) < 4; });
    var bestMargin = opps.length
      ? Math.round(((opps[0].avg_price - opps[0].avg_price * 0.35) / opps[0].avg_price) * 100)
      : 0;

    steps[2].state = 'done'; steps[3].state = 'done';
    setProgress('Done', steps);

    _lastResearchResults = buildReportText(q, niches, opps, avoid);

    document.getElementById('met-opps').textContent        = opps.length;
    document.getElementById('met-avoid').textContent       = avoid.length;
    document.getElementById('met-best-margin').textContent = bestMargin ? ('~' + bestMargin + '%') : '-';

    var cards = document.getElementById('opp-cards');
    if (!opps.length) {
      cards.innerHTML = '<p style="font-size:13px;color:var(--text-secondary)">No clear low-competition opportunities found. Try a broader or different niche.</p>';
    } else {
      cards.innerHTML = opps.map(function(n, i) {
        var rankLabel    = i === 0 ? ' Top pick' : i === 1 ? '2nd' : i === 2 ? '3rd' : ('#' + (i + 1));
        var compClass    = n.competition === 'Low' ? 'pill-green' : n.competition === 'Medium' ? 'pill-amber' : 'pill-gray';
        var price        = n.avg_price       ? ('' + parseFloat(n.avg_price).toFixed(2))       : '-';
        var sold         = n.sold_30d        ? (n.sold_30d + ' sold/mo')                       : '-';
        var active       = n.active_listings ? (n.active_listings + ' active')                 : '-';
        var score        = n.opportunity_score || '?';
        var buyCost      = n.supplier_cost    ? ('' + parseFloat(n.supplier_cost).toFixed(2))  : '-';
        var sellPrice    = n.ebay_sell_price  ? ('' + parseFloat(n.ebay_sell_price).toFixed(2)): '-';
        var profit       = (n.profit_after_fees != null) ? ('' + parseFloat(n.profit_after_fees).toFixed(2)) : '-';
        var marginPct    = n.margin_pct       ? (Math.round(n.margin_pct) + '%')               : '-';
        var platform     = escHtml(n.source_platform || 'Syncee');
        var synceeSearch = escHtml(n.syncee_search || n.name);
        var sourceTip    = escHtml(n.source_tip || '');
        var nameSafe     = escHtml(n.name);
        var priceSafe    = escHtml(sellPrice);
        var platformClass= n.source_platform === 'Avasam' ? 'pill-green' : 'pill-blue';
        var supplierUrl  = supplierSearchUrl(n.source_platform, n.syncee_search || n.name);
        var supplierLabel= n.source_platform === 'Avasam' ? 'View on Avasam' : 'View on Syncee (UK)';

        return '<div class="opp-card ' + (i === 0 ? 'top-pick' : '') + '">' +
          '<div class="opp-card-header">' +
          '<span class="rank-label">' + rankLabel + '</span>' +
          '<span class="score-badge">Score: ' + score + '/10</span>' +
          '</div>' +
          '<h3>' + nameSafe + '</h3>' +
          '<div class="opp-stats">' +
          '<span>' + price + '</span><span>' + sold + '</span><span>' + active + '</span>' +
          '<span class="pill ' + compClass + '">' + escHtml(n.competition || '?') + '</span>' +
          '</div>' +
          '<p class="opp-reason">' + escHtml(n.reason || '') + '</p>' +

          /* Buy/Sell breakdown */
          '<div style="margin:.75rem 0;padding:.65rem .75rem;background:var(--bg-secondary,#f8f9fa);border-radius:6px;font-size:13px">' +
          '<div style="font-weight:600;margin-bottom:.4rem;color:var(--text-primary)"> Buy / Sell breakdown</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.25rem .5rem;color:var(--text-secondary)">' +
          '<div><span style="font-size:11px;display:block">Buy price</span><strong style="color:var(--danger,#dc2626)">' + buyCost + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">eBay sell</span><strong style="color:var(--success,#16a34a)">' + sellPrice + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">Profit/item</span><strong>' + profit + '</strong></div>' +
          '<div><span style="font-size:11px;display:block">Margin</span><strong>' + marginPct + '</strong></div>' +
          '</div>' +
          '</div>' +

          /* Sourcing info with clickable supplier link */
          '<div style="margin-bottom:.75rem;padding:.65rem .75rem;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:13px">' +
          '<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem">' +
          '<span style="font-weight:600;color:var(--text-primary)"> Source on</span>' +
          '<span class="pill ' + platformClass + '" style="font-size:11px">' + platform + '</span>' +
          '</div>' +
          '<div style="margin-bottom:.4rem"><span style="color:var(--text-secondary);font-size:11px">Search term: </span>' +
          '<code style="background:var(--bg-secondary,#f1f5f9);padding:1px 5px;border-radius:3px;font-size:12px">' + synceeSearch + '</code></div>' +
          '<a href="' + escHtml(supplierUrl) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;padding:4px 10px;border:1px solid #2563eb;border-radius:5px;margin-bottom:.3rem" ' +
          'onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'transparent\'">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
          supplierLabel + ' &#x2197;</a>' +
          (sourceTip ? '<div style="color:var(--text-secondary);font-size:12px;margin-top:.3rem"> ' + sourceTip + '</div>' : '') +
          '</div>' +

          '<button class="btn btn-sm" onclick="prefillListing(\'' + nameSafe.replace(/'/g, "\\'") + '\', \'' + priceSafe.replace(/'/g, "\\'") + '\')">Create listing -></button>' +
          '</div>';
      }).join('');
    }

    var avoidEl = document.getElementById('avoid-list');
    var avoidCard = document.getElementById('avoid-card');
    if (avoid.length) {
      avoidEl.innerHTML = avoid.map(function(n) {
        return '<div class="avoid-item"><strong>' + escHtml(n.name) + '</strong> -- ' + escHtml(n.reason || 'High competition') + '</div>';
      }).join('');
      if (avoidCard) avoidCard.style.display = '';
    } else {
      avoidEl.innerHTML = '<p style="font-size:13px;color:var(--text-secondary)">No products flagged to avoid.</p>';
    }

    show('res-result');

  } catch (e) {
    alert('Research error: ' + e.message);
    setProgress(false, null);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Find opportunities';
  }
}

/* ================================================================
   TAB 2 - LISTING CREATOR
   ================================================================ */

function prefillListing(name, price) {
  var el = document.getElementById('lst-product');
  if (el) el.value = name;
  var pr = document.getElementById('lst-cost');
  if (pr && price && price !== '-') {
    var num = parseFloat(price);
    if (!isNaN(num)) pr.value = (num / 3).toFixed(2);
  }
  switchTab('listing', document.querySelector('.tab:nth-child(2)'));
}

async function runListing() {
  var product  = document.getElementById('lst-product')  ? document.getElementById('lst-product').value.trim()  : '';
  var cost     = document.getElementById('lst-cost')     ? document.getElementById('lst-cost').value     : '';
  var category = document.getElementById('lst-cat')      ? document.getElementById('lst-cat').value      : '';
  var features = document.getElementById('lst-features') ? document.getElementById('lst-features').value.trim() : '';

  if (!product) { alert('Enter a product name.'); return; }

  var btn     = document.getElementById('lst-btn');
  var btnText = document.getElementById('lst-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Generating...';
  hide('lst-result');

  try {
    var costNum = parseFloat(cost) || 0;
    var userMsg = 'Create an eBay UK listing for: ' + product + '\n' +
      'Category: ' + category + '\n' +
      (costNum ? 'Cost price: GBP' + costNum.toFixed(2) + ' (recommend sell price at 2.5x minimum after 13% eBay fees)\n' : '') +
      (features ? 'Key features: ' + features + '\n' : '') +
      '\nRespond ONLY with a raw JSON object (no markdown, no backticks):\n' +
      '{"title":"string (max 80 chars, eBay SEO optimised)","description":"string (HTML allowed, 3-5 paragraphs)","sell_price":number,"item_specifics":"string (key: value pairs, one per line)","tags":"string (comma separated search tags)"}';

    var raw = await claude(
      'You are an expert eBay UK listing copywriter. Write listings that rank well and convert. Never mention AliExpress or overseas suppliers. Always imply fast UK delivery.',
      userMsg,
      2000
    );

    var parsed = parseJSON(raw);

    var titleEl = document.getElementById('lst-title');
    var descEl  = document.getElementById('lst-desc');
    var priceEl = document.getElementById('lst-price');
    var noteEl  = document.getElementById('lst-margin-note');
    var specEl  = document.getElementById('lst-specifics');
    var tagsEl  = document.getElementById('lst-tags');
    var charEl  = document.getElementById('title-chars');

    if (titleEl) titleEl.textContent = parsed.title || '';
    if (descEl)  descEl.innerHTML    = parsed.description || '';
    if (specEl)  specEl.textContent  = parsed.item_specifics || '';
    if (tagsEl)  tagsEl.textContent  = parsed.tags || '';

    if (parsed.sell_price && priceEl) {
      priceEl.textContent = 'GBP' + parseFloat(parsed.sell_price).toFixed(2);
      if (costNum && noteEl) {
        var margin = Math.round(((parsed.sell_price - costNum - parsed.sell_price * 0.13) / parsed.sell_price) * 100);
        noteEl.textContent = 'Est. margin after fees: ' + margin + '%';
      }
    }
    if (charEl && parsed.title) charEl.textContent = '(' + parsed.title.length + '/80)';

    show('lst-result');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Generate listing';
  }
}

/* ================================================================
   IMAGE SECTION - supplier URL paste and select
   ================================================================ */

var _selectedImages = [];
var _currentImages  = [];
var _supplierUrls   = [];
var _pendingPastedUrl = '';

/* Capture paste event directly on the input as a fallback */
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

/* Primary method: read the input field (works with Dashlane workaround via paste event above) */
function addSupplierUrl() {
  var input = document.getElementById('supplier-url-input');
  var url = ((input && input.value) || _pendingPastedUrl || '').trim();
  _pendingPastedUrl = '';
  if (!url || url.indexOf('http') !== 0) { showToast('Paste a valid image URL starting with http'); return; }
  if (_supplierUrls.indexOf(url) > -1) { showToast('URL already added'); return; }
  if (_supplierUrls.length >= 3) { showToast('Max 3 images -- remove one first'); return; }
  _supplierUrls.push(url);
  if (input) { input.value = ''; input.focus(); }
  updateSupplierUrlList();
  buildImageGrid();
  showToast('Image added (' + _supplierUrls.length + ' of 3)');
}

/* Secondary method: Clipboard API (needs browser permission) */
function pasteAndAddUrl() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function(text) {
      var url = text.trim();
      if (!url || url.indexOf('http') !== 0) { showToast('Nothing to paste -- copy an image URL first'); return; }
      if (_supplierUrls.indexOf(url) > -1) { showToast('URL already added'); return; }
      if (_supplierUrls.length >= 3) { showToast('Max 3 images -- remove one first'); return; }
      _supplierUrls.push(url);
      updateSupplierUrlList();
      buildImageGrid();
      showToast('Image added (' + _supplierUrls.length + ' of 3)');
    }).catch(function() {
      showToast('Clipboard permission denied -- paste into the box and click Add');
    });
  } else {
    showToast('Clipboard API not available -- paste into the box and click Add');
  }
}

function removeSupplierUrl(i) {
  _supplierUrls.splice(i, 1);
  _selectedImages = _selectedImages.filter(function(s) {
    return _currentImages.some(function(c) { return c.filename === s.filename; });
  });
  updateSupplierUrlList();
  buildImageGrid();
}

function updateSupplierUrlList() {
  var el = document.getElementById('supplier-url-list');
  if (!el) return;
  if (_supplierUrls.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = _supplierUrls.map(function(url, i) {
    var short = url.length > 55 ? url.substring(0, 55) + '...' : url;
    return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(short) + '</span>' +
      '<button onclick="removeSupplierUrl(' + i + ')" style="border:none;background:none;cursor:pointer;color:var(--text-secondary);font-size:16px;padding:0 4px;flex-shrink:0">&times;</button>' +
      '</div>';
  }).join('');
}

function buildImageGrid() {
  _currentImages = _supplierUrls.map(function(url, i) {
    var ext = url.split('?')[0].split('.').pop().toLowerCase();
    var filename = 'product-image-' + (i + 1) + '.' + (ext.length <= 4 && ext.length >= 2 ? ext : 'jpg');
    var thumb = IMAGE_PROXY + '?url=' + encodeURIComponent(url);
    return { url: url, thumb: thumb, filename: filename };
  });
  renderImageGrid();
}

function renderImageGrid() {
  var grid = document.getElementById('lst-img-grid');
  if (!grid) return;
  if (_currentImages.length === 0) { grid.innerHTML = ''; return; }
  grid.innerHTML = _currentImages.map(function(img, i) {
    var alreadySelected = _selectedImages.some(function(s) { return s.filename === img.filename; });
    return '<div class="img-tile' + (alreadySelected ? ' img-tile--selected' : '') + '" id="imgtile-' + i + '" ' +
      'onclick="toggleImageSelect(' + i + ')" ' +
      'data-url="' + escHtml(img.url) + '" data-filename="' + escHtml(img.filename) + '" ' +
      'style="position:relative;cursor:pointer">' +
      '<img src="' + escHtml(img.thumb) + '" ' +
      'alt="Product image ' + (i + 1) + '" loading="lazy" ' +
      'onerror="this.style.display=\'none\';this.parentElement.querySelector(\'.img-err\').style.display=\'flex\'" />' +
      '<div class="img-err" style="display:none;flex-direction:column;align-items:center;justify-content:center;height:80px;font-size:11px;color:#dc2626;text-align:center;padding:4px">' +
      '<span style="font-size:18px">&#x26A0;</span>Cannot load image<br><span style="font-size:10px;opacity:.7">Check URL or proxy</span>' +
      '</div>' +
      '<div class="img-tile-check">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<a class="img-tile-dl" href="' + escHtml(img.url) + '" target="_blank" ' +
      'onclick="event.stopPropagation()" title="Open image in new tab" ' +
      'style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.5);border-radius:3px;padding:2px 4px;display:flex">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      '</a>' +
      '</div>';
  }).join('');
}

function toggleImageSelect(i) {
  var img  = _currentImages[i];
  if (!img) return;
  var tile = document.getElementById('imgtile-' + i);
  var idx  = _selectedImages.findIndex(function(s) { return s.filename === img.filename; });
  if (idx > -1) {
    _selectedImages.splice(idx, 1);
    if (tile) tile.classList.remove('img-tile--selected');
  } else {
    _selectedImages.push(img);
    if (tile) tile.classList.add('img-tile--selected');
  }
  updateSelectedPanel();
}

function updateSelectedPanel() {
  var countEl = document.getElementById('img-selected-count');
  var panel   = document.getElementById('lst-img-selected');
  var listEl  = document.getElementById('lst-img-selected-list');
  var n       = _selectedImages.length;

  if (countEl) countEl.textContent = n ? n + ' selected' : '';
  if (!panel || !listEl) return;
  if (n === 0) { panel.classList.add('hidden'); return; }

  panel.classList.remove('hidden');
  listEl.innerHTML = _selectedImages.map(function(img, i) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
      '<span>' + (i + 1) + '. ' + escHtml(img.filename) + '</span>' +
      '<a class="btn btn-sm" href="' + escHtml(img.url) + '" target="_blank" style="font-size:11px;padding:2px 8px">Open</a>' +
      '</div>';
  }).join('');
}

function clearSupplierImages() {
  _supplierUrls   = [];
  _currentImages  = [];
  _selectedImages = [];
  var input = document.getElementById('supplier-url-input');
  var list  = document.getElementById('supplier-url-list');
  var grid  = document.getElementById('lst-img-grid');
  var panel = document.getElementById('lst-img-selected');
  var count = document.getElementById('img-selected-count');
  if (input) input.value = '';
  if (list)  list.innerHTML = '';
  if (grid)  grid.innerHTML = '';
  if (panel) panel.classList.add('hidden');
  if (count) count.textContent = '';
}

/* ================================================================
   COPY HELPERS
   ================================================================ */

function copyEl(id) {
  var el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText || el.textContent || '')
    .then(function() { showToast('Copied!'); })
    .catch(function() { alert('Copy failed. Try manually.'); });
}

/* ================================================================
   TAB 3 - ORDER TRACKER
   ================================================================ */

var ORDERS_KEY = 'dd_orders';

function loadOrders()       { try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || {}; } catch (e) { return {}; } }
function saveOrders(orders) { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }

function renderOrders() {
  var ordersObj = loadOrders();
  var orders    = Object.entries(ordersObj).map(function(entry) {
    return Object.assign({ _key: entry[0] }, entry[1]);
  });
  var list = document.getElementById('orders-list');
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);padding:1rem 0">No orders yet. Click "Add order" to track your first eBay sale.</p>';
  } else {
    var statusClass = {
      'awaiting supplier order': 'pill-amber',
      'shipped':   'pill-blue',
      'delivered': 'pill-green',
      'issue':     'pill-red'
    };
    list.innerHTML = orders.map(function(o) {
      var sc = statusClass[o.status] || 'pill-gray';
      return '<div class="order-card" style="border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:.75rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<strong>' + escHtml(o.oid || '-') + '</strong>' +
        '<span class="pill ' + sc + '">' + escHtml(o.status || '-') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">' +
        '<div>Item: ' + escHtml(o.item || '-') + '</div>' +
        '<div>Buyer: ' + escHtml(o.buyer || '-') + '</div>' +
        '<div>Sale: GBP' + (o.sale ? parseFloat(o.sale).toFixed(2) : '-') +
        ' &nbsp; Cost: GBP' + (o.cost ? parseFloat(o.cost).toFixed(2) : '-') + '</div>' +
        '</div>' +
        '<div style="margin-top:.5rem;display:flex;gap:.5rem">' +
        '<select onchange="updateOrderStatus(\'' + o._key + '\', this.value)" style="font-size:12px;padding:2px 4px">' +
        ['awaiting supplier order','shipped','delivered','issue'].map(function(s) {
          return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') +
        '</select>' +
        '<button class="btn btn-sm" onclick="deleteOrder(\'' + o._key + '\')" style="color:var(--danger,#dc2626)">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  var total  = orders.length;
  var profit = orders.reduce(function(acc, o) {
    return (o.sale && o.cost) ? acc + (parseFloat(o.sale) - parseFloat(o.cost)) : acc;
  }, 0);
  var withMargin = orders.filter(function(o) { return o.sale && o.cost && parseFloat(o.sale) > 0; });
  var avgMargin  = withMargin.length
    ? Math.round(withMargin.reduce(function(acc, o) {
        return acc + ((parseFloat(o.sale) - parseFloat(o.cost)) / parseFloat(o.sale) * 100);
      }, 0) / withMargin.length)
    : 0;

  var statOrders = document.getElementById('stat-orders');
  var statProfit = document.getElementById('stat-profit');
  var statMargin = document.getElementById('stat-margin');
  if (statOrders) statOrders.textContent = total;
  if (statProfit) statProfit.textContent = 'GBP' + profit.toFixed(2);
  if (statMargin) statMargin.textContent = (isNaN(avgMargin) ? 0 : avgMargin) + '%';
}

function updateOrderStatus(key, status) {
  var orders = loadOrders();
  if (orders[key]) { orders[key].status = status; saveOrders(orders); renderOrders(); }
}

function deleteOrder(key) {
  if (!confirm('Delete this order?')) return;
  var orders = loadOrders();
  delete orders[key];
  saveOrders(orders);
  renderOrders();
}

function toggleAddOrder() {
  var form = document.getElementById('add-order-form');
  if (form) form.classList.toggle('hidden');
}

function saveOrder() {
  var oid    = document.getElementById('new-oid')    ? document.getElementById('new-oid').value.trim()    : '';
  var item   = document.getElementById('new-item')   ? document.getElementById('new-item').value.trim()   : '';
  var buyer  = document.getElementById('new-buyer')  ? document.getElementById('new-buyer').value.trim()  : '';
  var sale   = document.getElementById('new-sale')   ? document.getElementById('new-sale').value   : '';
  var cost   = document.getElementById('new-cost')   ? document.getElementById('new-cost').value   : '';
  var status = document.getElementById('new-status') ? document.getElementById('new-status').value : 'awaiting supplier order';

  if (!oid || !item) { alert('eBay Order ID and Item Name are required.'); return; }

  var orders = loadOrders();
  var key    = Date.now().toString();
  orders[key] = { oid: oid, item: item, buyer: buyer, sale: parseFloat(sale) || 0, cost: parseFloat(cost) || 0, status: status };
  saveOrders(orders);
  renderOrders();
  toggleAddOrder();

  ['new-oid','new-item','new-buyer','new-sale','new-cost'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

renderOrders();

/* ================================================================
   TAB 4 - SUPPLIER WORKFLOW
   ================================================================ */

async function runSupplier() {
  var product = document.getElementById('sup-product') ? document.getElementById('sup-product').value.trim() : '';
  var qty     = document.getElementById('sup-qty')     ? document.getElementById('sup-qty').value     : '1';
  var name    = document.getElementById('sup-name')    ? document.getElementById('sup-name').value.trim()    : '';
  var addr1   = document.getElementById('sup-addr1')   ? document.getElementById('sup-addr1').value.trim()   : '';
  var city    = document.getElementById('sup-city')    ? document.getElementById('sup-city').value.trim()    : '';
  var post    = document.getElementById('sup-post')    ? document.getElementById('sup-post').value.trim()    : '';
  var notes   = document.getElementById('sup-notes')   ? document.getElementById('sup-notes').value.trim()   : '';

  if (!product) { alert('Enter a product name.'); return; }

  var btn     = document.getElementById('sup-btn');
  var btnText = document.getElementById('sup-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Generating...';

  try {
    var delivery = [name, addr1, city, post].filter(Boolean).join(', ');
    var userMsg  =
      'Write a professional dropshipping order message for:\n' +
      'Product: ' + product + '\n' +
      'Quantity: ' + qty + '\n' +
      'Delivery address: ' + (delivery || 'To be provided') + '\n' +
      'Additional notes: ' + (notes || 'None') + '\n\n' +
      'Write a clear, professional email/message suitable for sending to a UK-based supplier on Syncee or Avasam. ' +
      'Include all order details. Mention that you require UK dispatch with tracked shipping. Be concise.';

    var message = await claude(
      'You are a professional eBay UK dropshipper writing supplier order messages. Only work with UK-warehouse suppliers (Syncee, Avasam). Always request UK dispatch with tracked shipping. Be concise and professional.',
      userMsg,
      600
    );

    var msgDiv = document.getElementById('sup-msg');
    if (msgDiv) msgDiv.textContent = message;
    show('sup-result');

  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Generate message';
  }
}
