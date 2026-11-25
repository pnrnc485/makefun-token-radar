// Token Radar dashboard. Everything it shows comes from window.RADAR, which main.ts writes to data.js
// from the same rows as board.json: implied values, factors and farm steps are displayed, never
// recalculated or regenerated here. No network: no fetch, no fonts, no CDN.
(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D || !D.rows) {
    app.textContent = 'data.js did not load: run main.ts so it writes data.js beside dashboard/.';
    return;
  }
  var ROWS = D.rows;
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });

  var LANES = {
    watchlist: { label: 'Watchlist', text: 'On the snapshot\'s watchlist: at least $' + Math.round(D.floor_usd / 1e6) + 'M of TVL, no token on record, not a wrapped or staked product.' },
    radar: { label: 'Early radar', text: 'Passes the same rule but sits below the $' + Math.round(D.floor_usd / 1e6) + 'M floor: the early finds.' },
    'parent-listed': { label: 'Sub-product', text: 'Above the floor yet off the watchlist, so DefiLlama lists a parent protocol: value may accrue to the parent.' },
    product: { label: 'Restake product', text: 'Liquid restaking or restaked BTC: tokenless, but its TVL is mostly another coin it holds.' }
  };

  // ---- formatting -------------------------------------------------------------------------------
  function usd(n) {
    if (n === null || n === undefined) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function exact(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + ' yr' : d + ' d';
  }
  function x(n, dp) { return '×' + n.toFixed(dp === undefined ? 2 : dp); }

  // ---- a tiny element builder: text only, so no protocol string is ever parsed as HTML ------------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (k) { add(el, k); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function laneChip(l) { return h('span', { class: 'lane ' + l, title: LANES[l].text, text: LANES[l].label }); }
  function chg(n) {
    return h('span', { class: n === null ? 'nil' : n > 0 ? 'chg-up' : n < 0 ? 'chg-down' : '', text: pct(n) });
  }

  // ---- state, read from and written back to the URL so every view has a link --------------------
  var params = new URLSearchParams(location.search);
  var categories = count(ROWS.map(function (r) { return r.category || 'Uncategorised'; }));
  var chains = count([].concat.apply([], ROWS.map(function (r) { return r.chains; })));
  function count(list) {
    var m = {};
    list.forEach(function (k) { m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { key: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n || (a.key < b.key ? -1 : 1); });
  }
  function match(list, wanted) {
    if (!wanted) return 'all';
    var w = wanted.toLowerCase();
    var hit = list.filter(function (c) { return c.key.toLowerCase() === w; })[0];
    return hit ? hit.key : 'all';
  }
  var S = {
    view: params.get('view') === 'live' ? 'live' : 'board',
    q: params.get('q') || '',
    category: match(categories, params.get('category')),
    chain: match(chains, params.get('chain')),
    watch: params.get('watchlist') === '1',
    lane: LANES[params.get('lane')] ? params.get('lane') : 'all',
    sort: params.get('sort') || 'rank',
    dir: params.get('dir') === 'desc' ? -1 : params.get('dir') === 'asc' ? 1 : null,
    open: BY_SLUG[params.get('protocol')] ? params.get('protocol') : null
  };
  var SORTS = {
    rank: { label: 'Rank', get: function (r) { return r.rank; }, dir: 1 },
    implied: { label: 'Implied value', get: function (r) { return r.implied_value_usd; }, dir: -1 },
    tvl: { label: 'TVL', get: function (r) { return r.tvl_usd; }, dir: -1 },
    change: { label: '7d', get: function (r) { return r.change_7d; }, dir: -1 },
    age: { label: 'Tokenless age', get: function (r) { return r.age_days; }, dir: -1 }
  };
  if (!SORTS[S.sort]) S.sort = 'rank';
  if (S.dir === null) S.dir = SORTS[S.sort].dir;

  function syncUrl() {
    var p = new URLSearchParams();
    if (S.view === 'live') p.set('view', 'live');
    if (S.q) p.set('q', S.q);
    if (S.category !== 'all') p.set('category', S.category);
    if (S.chain !== 'all') p.set('chain', S.chain);
    if (S.watch) p.set('watchlist', '1');
    if (S.lane !== 'all') p.set('lane', S.lane);
    if (S.sort !== 'rank') { p.set('sort', S.sort); p.set('dir', S.dir < 0 ? 'desc' : 'asc'); }
    if (S.open) p.set('protocol', S.open);
    var qs = p.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// may refuse */ }
  }

  function filtered() {
    var q = S.q.trim().toLowerCase();
    var key = SORTS[S.sort].get;
    return ROWS.filter(function (r) {
      if (S.watch && !r.on_watchlist) return false;
      if (S.lane !== 'all' && r.lane !== S.lane) return false;
      if (S.category !== 'all' && (r.category || 'Uncategorised') !== S.category) return false;
      if (S.chain !== 'all' && r.chains.indexOf(S.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var av = key(a), bv = key(b);
      if (av === null && bv === null) return a.rank - b.rank;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * S.dir || a.rank - b.rank;
    });
  }

  // ---- page skeleton ----------------------------------------------------------------------------
  var live = D.live || [];
  var top = ROWS[0];
  var tableHost = h('div', { class: 'panel', id: 'board', tabindex: '-1' });
  var countEl = h('span', { class: 'count', 'aria-live': 'polite' });
  var drawerHost = h('div');

  function select(id, label, list, value, onchange) {
    return h('select', { id: id, 'aria-label': label, onchange: onchange },
      h('option', { value: 'all', text: label + ': all' }),
      list.map(function (c) { return h('option', { value: c.key, selected: c.key === value, text: c.key + ' (' + c.n + ')' }); }));
  }

  var search = h('input', { type: 'search', placeholder: 'Search protocol, chain, category', value: S.q, 'aria-label': 'Search', oninput: function () { S.q = search.value; draw(); } });
  var catSel = select('f-cat', 'Category', categories, S.category, function () { S.category = catSel.value; draw(); });
  var chainSel = select('f-chain', 'Chain', chains, S.chain, function () { S.chain = chainSel.value; draw(); });
  var laneSel = h('select', { 'aria-label': 'Lane', onchange: function () { S.lane = laneSel.value; draw(); } },
    h('option', { value: 'all', text: 'Lane: all' }),
    Object.keys(LANES).map(function (k) { return h('option', { value: k, selected: S.lane === k, text: LANES[k].label + ' (' + D.lanes[k] + ')' }); }));
  var watchBox = h('input', { type: 'checkbox', checked: S.watch, onchange: function () { S.watch = watchBox.checked; draw(); } });
  var controls = h('div', { class: 'ctl' }, search, catSel, chainSel, laneSel,
    h('label', { class: 'check' }, watchBox, 'Watchlist only'),
    h('button', { class: 'ghost', type: 'button', text: 'Reset', onclick: function () {
      S.q = ''; S.category = 'all'; S.chain = 'all'; S.lane = 'all'; S.watch = false; S.sort = 'rank'; S.dir = 1;
      search.value = ''; catSel.value = 'all'; chainSel.value = 'all'; laneSel.value = 'all'; watchBox.checked = false; draw();
    } }), countEl);

  var tabBtns = {};
  function tab(view, text) {
    tabBtns[view] = h('button', { type: 'button', role: 'tab', text: text, onclick: function () { S.view = view; draw(); } });
    return tabBtns[view];
  }

  app.appendChild(h('div', { class: 'wrap' },
    h('header', { class: 'top' },
      h('div', null,
        h('div', { class: 'brand' }, h('i'), 'Token Radar · model ' + D.model_version),
        h('h1', { text: ROWS.length + ' pre-token protocols, ranked by what their token would be worth' }),
        h('p', { class: 'lede', text: 'Every one of the ' + D.watchlist_size + ' watchlist protocols plus ' + D.early_size + ' found beyond it, all with no token on their DefiLlama record. Protocols whose token already trades are listed apart, never ranked. Implied value is this model\'s estimate, not a price and not a promise of a launch.' })),
      h('div', { class: 'stamp' }, 'Snapshot ' + D.as_of, h('br'), D.source.replace(/^DefiLlama\s+/, 'DefiLlama · ').replace(/, fetched.*/, ''))),
    h('section', { class: 'facts', 'aria-label': 'Board facts' },
      fact('Ranked pre-token rows', String(ROWS.length)),
      fact('Watchlist covered', ROWS.filter(function (r) { return r.on_watchlist; }).length + ' / ' + D.watchlist_size),
      fact('Found beyond the watchlist', String(D.early_size)),
      fact('Token trades: set aside', String(D.tokenized_total)),
      fact('Top implied value', usd(top.implied_value_usd) + ' · ' + top.name, true)),
    h('div', { class: 'formula' },
      h('span', { class: 'lbl', text: 'Implied value =' }),
      h('span', { class: 'tok', text: 'TVL' }), h('span', { class: 'op', text: '×' }),
      h('span', { class: 'tok', text: 'peer multiple' }), h('span', { class: 'op', text: '×' }),
      h('span', { class: 'tok', text: 'lane' }), h('span', { class: 'op', text: '×' }),
      h('span', { class: 'tok', text: '7-day growth' }), h('span', { class: 'op', text: '×' }),
      h('span', { class: 'tok', text: 'tokenless age' }), h('span', { class: 'op', text: '=' }),
      h('span', { class: 'tok out', text: 'rank' }),
      h('a', { href: '#method', text: 'How each factor is set ↓' })),
    h('div', { class: 'bar' }, h('div', { class: 'tabs', role: 'tablist' }, tab('board', 'Pre-token board (' + ROWS.length + ')'), tab('live', 'Token already trades (' + live.length + ')')), controls),
    tableHost,
    methodSection(),
    drawerHost));

  function fact(label, value, acc) {
    return h('div', { class: 'fact' }, h('span', { text: label }), h('b', { class: acc ? 'acc' : null, text: value }));
  }

  // ---- the board ---------------------------------------------------------------------------------
  function sortHead(key, cls) {
    var on = S.sort === key;
    return h('th', { class: cls || null, scope: 'col', 'aria-sort': on ? (S.dir < 0 ? 'descending' : 'ascending') : null },
      h('button', { type: 'button', onclick: function () {
        if (S.sort === key) S.dir = -S.dir; else { S.sort = key; S.dir = SORTS[key].dir; }
        draw();
      } }, SORTS[key].label, on ? h('span', { class: 'arrow', text: S.dir < 0 ? '↓' : '↑' }) : null));
  }

  var LOG_MAX = Math.log10(ROWS[0].implied_value_usd);
  var LOG_MIN = Math.log10(ROWS[ROWS.length - 1].implied_value_usd);
  function meter(v) {
    var w = LOG_MAX === LOG_MIN ? 100 : 6 + 94 * (Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    return h('span', { class: 'meter hide-sm', title: 'Log scale across the board' }, h('i', { style: 'width:' + w.toFixed(1) + '%' }));
  }

  function boardTable() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + ROWS.length + ' shown';
    if (list.length === 0) return h('div', { class: 'empty', text: 'No protocol matches these filters. Reset to see the whole board.' });
    return h('table', null,
      h('caption', { text: 'Pre-token protocols. Rank follows implied value; click a column to sort, a row for its value build and farm plan.' }),
      h('thead', null, h('tr', null,
        sortHead('rank'), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', class: 'hide-sm', text: 'Category' }),
        h('th', { scope: 'col', class: 'hide-sm', text: 'Chains' }), sortHead('tvl', 'num'), sortHead('change', 'num'),
        sortHead('age', 'num'), sortHead('implied', 'num'))),
      h('tbody', null, list.map(function (r) {
        return h('tr', { tabindex: '0', 'aria-label': r.name + ', rank ' + r.rank, onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter') openDetail(r.slug); } },
          h('td', { class: 'rank', text: String(r.rank) }),
          h('td', null, h('div', { class: 'pname' }, h('b', { text: r.name }), laneChip(r.lane))),
          h('td', { class: 'hide-sm sub', text: r.category || 'Uncategorised' }),
          h('td', { class: 'hide-sm sub', text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
          h('td', { class: 'num', text: usd(r.tvl_usd) }),
          h('td', { class: 'num' }, chg(r.change_7d)),
          h('td', { class: 'num', text: age(r.age_days) }),
          h('td', { class: 'num' }, h('div', { class: 'val' }, meter(r.implied_value_usd), h('b', { text: usd(r.implied_value_usd) }))));
      })));
  }

  function liveTable() {
    countEl.textContent = live.length + ' of ' + D.tokenized_total + ' with a token, by market cap';
    return h('table', null,
      h('caption', { text: 'These records carry a token, so the market already prices them: they are kept off the ranking. Their market cap / TVL ratios are where the board\'s peer multiples come from.' }),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', text: '#' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'Symbol' }),
        h('th', { scope: 'col', class: 'hide-sm', text: 'Category' }), h('th', { scope: 'col', class: 'num', text: 'Market cap' }),
        h('th', { scope: 'col', class: 'num', text: 'TVL' }), h('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }), h('th', { scope: 'col', class: 'num', text: '7d' }))),
      h('tbody', null, live.map(function (r, i) {
        return h('tr', { style: 'cursor:default' },
          h('td', { class: 'rank', text: String(i + 1) }), h('td', null, h('b', { text: r.name })),
          h('td', { class: 'sub', text: r.symbol || 'n/a' }), h('td', { class: 'hide-sm sub', text: r.category || 'Uncategorised' }),
          h('td', { class: 'num', text: usd(r.mcap_usd) }), h('td', { class: 'num', text: usd(r.tvl_usd) }),
          h('td', { class: 'num', text: r.mcap_to_tvl === null ? 'n/a' : x(r.mcap_to_tvl) }), h('td', { class: 'num' }, chg(r.change_7d)));
      })));
  }

  // ---- the detail drawer -------------------------------------------------------------------------
  function openDetail(slug) { S.open = slug; drawDetail(); syncUrl(); }
  function closeDetail() { var back = S.open; S.open = null; drawDetail(); syncUrl(); focusRow(back); }
  function focusRow(slug) {
    var r = BY_SLUG[slug];
    var row = r && tableHost.querySelector('tr[aria-label="' + r.name.replace(/"/g, '') + ', rank ' + r.rank + '"]');
    if (row) row.focus();
  }

  function factorRow(sym, name, value, why, bar) {
    return h('tr', null, h('td', { text: sym }),
      h('td', null, h('b', { text: name }), h('div', { class: 'sub', text: why }), bar || null),
      h('td', { class: 'f', text: value }));
  }
  function fbar(v, max) {
    return h('div', { class: 'fbar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.min(100, v / max * 100).toFixed(1) + '%' }), h('em', { style: 'left:' + (100 / max).toFixed(1) + '%' }));
  }
  function parseStep(s) {
    var m = /^([\s\S]*?)\s*Cost: ([\s\S]*?)\.\s*Time: ([\s\S]*?)\.?$/.exec(s);
    return m ? { text: m[1], cost: m[2], time: m[3] } : { text: s, cost: null, time: null };
  }

  function drawDetail() {
    drawerHost.textContent = '';
    if (!S.open) return;
    var r = BY_SLUG[S.open];
    var peer = (D.peers.by_category || {})[r.category || 'Uncategorised'];
    // Wording only: the multiple itself is data.js's. Mirrors the model's rule (peer_min_peers, peer_shrink_k).
    var cat = r.category || 'this category';
    var n = peer ? peer.peers : 0;
    var minPeers = D.model.peer_min_peers, k = D.model.peer_shrink_k;
    var peerWhy = n >= minPeers
      ? cat + ': ' + n + ' traded peers, median mcap/TVL ' + peer.median + ', blended with the market median ' + D.peers.global_median + ' at weight ' + n + '/' + (n + k) + ' on the category'
      : (n === 0 ? 'No traded peer' : 'Only ' + n + ' traded peer' + (n === 1 ? '' : 's')) + ' in ' + cat + ', too few to price it (' + minPeers + ' needed): the market median ' + D.peers.global_median + ' applies';
    var ageWhy = r.age_days === null
      ? 'Listing date unknown: read as the universe median, ' + r.age_days_used + ' days'
      : r.age_days + ' days tracked with no token on record (peaks from 1 to 2 years)';
    var close = h('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: '✕', onclick: closeDetail });
    drawerHost.appendChild(h('div', { class: 'scrim', onclick: closeDetail }));
    drawerHost.appendChild(h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': r.name + ' detail' },
      h('div', { class: 'dh' }, h('span', { class: 'rk', text: '#' + r.rank }), h('h2', { text: r.name }), close),
      h('p', { class: 'meta' }, laneChip(r.lane), (r.category || 'Uncategorised') + ' · ' + r.chains.join(', ') + (r.listed_at ? ' · tracked since ' + r.listed_at : '')),
      h('div', { class: 'figs' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { text: usd(r.tvl_usd) })),
        h('div', null, h('span', { text: '7-day change' }), h('b', null, chg(r.change_7d))),
        h('div', null, h('span', { text: 'Tokenless age' }), h('b', { text: age(r.age_days) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { style: 'color:var(--accent)', text: usd(r.implied_value_usd) }))),
      h('h3', { text: 'How the number is built' }),
      h('table', { class: 'ledger' }, h('tbody', null,
        factorRow('', 'TVL', exact(r.tvl_usd), 'Total value locked on DefiLlama, ' + D.as_of),
        factorRow('×', 'Peer multiple', x(r.peer_multiple, 4), peerWhy),
        factorRow('×', 'Lane: ' + LANES[r.lane].label, x(r.lane_factor), LANES[r.lane].text),
        factorRow('×', '7-day growth', x(r.growth_multiplier, 4), 'TVL ' + pct(r.change_7d) + ' in 7 days, square-rooted and capped', fbar(r.growth_multiplier, 1.5)),
        factorRow('×', 'Tokenless age', x(r.age_multiplier, 4), ageWhy, fbar(r.age_multiplier, 1.5)),
        h('tr', { class: 'total' }, h('td', { text: '=' }), h('td', null, h('b', { text: 'Implied value' }), h('div', { class: 'sub', text: 'As board.json carries it: rank ' + r.rank + ' of ' + ROWS.length })), h('td', { class: 'f', text: exact(r.implied_value_usd) })))),
      h('h3', { text: 'Farm plan · ' + r.farm_steps.length + ' steps' }),
      h('ol', { class: 'steps' }, r.farm_steps.map(function (s) {
        var p = parseStep(s);
        return h('li', null, h('p', { text: p.text }),
          p.cost ? h('div', { class: 'tags' }, h('span', { class: 'tag' }, 'Cost ', h('b', { text: p.cost })), h('span', { class: 'tag' }, 'Time ', h('b', { text: p.time }))) : null);
      })),
      h('p', { class: 'note', text: 'DefiLlama records no token for ' + r.name + '; that is not proof none exists. Implied value is an estimate under this model, not a price.' })));
    close.focus();
  }

  // ---- methodology -------------------------------------------------------------------------------
  function methodSection() {
    var parts = D.methodology_parts || [D.methodology];
    var peerRows = Object.keys(D.peers.by_category).map(function (k) { return D.peers.by_category[k]; })
      .filter(function (p) { return p.peers >= 3; }).sort(function (a, b) { return b.peers - a.peers; });
    return h('section', { class: 'method', id: 'method' },
      h('h2', { text: 'Methodology' }),
      h('div', { class: 'grid' },
        h('div', { class: 'card wide' }, h('p', { text: parts[0] })),
        parts.slice(1).map(function (t) {
          var cut = t.indexOf(':');
          return h('div', { class: 'card' }, h('h3', { text: cut > 0 && cut < 30 ? t.slice(0, cut) : 'Note' }), h('p', { text: cut > 0 && cut < 30 ? t.slice(cut + 1).trim() : t }));
        }),
        h('div', { class: 'card wide' }, h('h3', { text: 'Lanes on this board' }),
          h('div', { class: 'lanes' }, Object.keys(LANES).map(function (k) {
            return h('div', null, h('span', null, laneChip(k), ' ', h('b', { text: String(D.lanes[k]) }), h('span', { class: 'sub', text: ' rows · ' + x(D.model.lane_factor[k]) })), h('span', { class: 'sub', text: LANES[k].text }));
          }))),
        h('div', { class: 'card wide' }, h('h3', { text: 'Peer multiples from this snapshot (categories with 3+ traded peers)' }),
          h('table', { class: 'peers' },
            h('thead', null, h('tr', null, h('th', { text: 'Category' }), h('th', { class: 'num', text: 'Traded peers' }), h('th', { class: 'num', text: 'Median mcap / TVL' }), h('th', { class: 'num', text: 'Multiple used' }))),
            h('tbody', null, peerRows.map(function (p) {
              return h('tr', null, h('td', { text: p.category }), h('td', { class: 'num', text: String(p.peers) }), h('td', { class: 'num', text: x(p.median, 3) }), h('td', { class: 'num', text: x(p.multiple, 3) }));
            }))))));
  }

  // ---- draw --------------------------------------------------------------------------------------
  function draw() {
    tableHost.textContent = '';
    tableHost.appendChild(S.view === 'live' ? liveTable() : boardTable());
    Object.keys(tabBtns).forEach(function (k) { tabBtns[k].setAttribute('aria-selected', String(S.view === k)); });
    controls.querySelectorAll('input, select').forEach(function (el) { el.disabled = S.view === 'live'; });
    syncUrl();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) closeDetail(); });
  draw();
  drawDetail();
  app.removeAttribute('aria-busy');
})();
