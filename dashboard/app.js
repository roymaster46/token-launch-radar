// Token Radar's dashboard, radar-6. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board: a KPI strip, the 758-protocol coverage bar, the farm-next
// strip, the fitted value model with its held-out ablation on both tests, the scatter the
// board sits on, the cohort chart, the best farms, and a sortable, filterable table with
// a per-protocol detail view. No network: every byte it shows is in data.js. Farm
// economics recompute live from the ticket, drop-share and T-bill controls; the board
// itself never re-ranks: rank is by implied value, the verdicts ride along.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var V = DATA.validation;
  var state = { q: '', category: 'all', chain: 'all', wl: false, verdict: 'any', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, ticket: DATA.model.ticket_usd, share: DATA.model.drop_share, yield: DATA.model.opp_rate };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 100) return sign + '$' + Math.round(a);
    return sign + '$' + a.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtOdds(o) { return Math.round(o * 100) + '%'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return 'x' + n.toFixed(2); }

  // One farmer's slice at the ticket and drop share on screen: the implied value times the
  // drop share times the launch odds, times the ticket's share of the protocol's TVL. The
  // net takes off the plan's fees and the ticket's risk-free yield forgone over the hold.
  function econ(r) {
    var slice = r.implied_value_usd * state.share * r.launch_odds * (state.ticket / r.tvl_usd);
    var scale = r.farm_capital_usd / DATA.model.ticket_usd;
    var opp = Math.round(state.ticket * scale * state.yield * (r.farm_days / 365) * 100) / 100;
    var net = Math.round((slice - r.farm_fees_usd - opp) * 100) / 100;
    var full = r.implied_value_usd * state.share * (state.ticket / r.tvl_usd);
    var be = full <= 0 ? 1 : Math.min(1, (r.farm_fees_usd + opp) / full);
    var verdict = net >= DATA.model.farm_threshold_usd ? 'FARM' : net >= DATA.model.thin_threshold_usd ? 'THIN' : 'SKIP';
    return { slice: slice, opp: opp, net: net, be: be, verdict: verdict, perHour: r.farm_hours > 0 ? net / r.farm_hours : 0 };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('ticket')) { var t = parseInt(params.get('ticket'), 10); if ([500, 1000, 5000, 10000].indexOf(t) >= 0) state.ticket = t; }
    if (params.get('share')) { var s = parseFloat(params.get('share')); if ([0.035, 0.07, 0.14].indexOf(s) >= 0) state.share = s; }
    if (params.get('yield')) { var y = parseFloat(params.get('yield')); if ([0, 0.04, 0.08].indexOf(y) >= 0) state.yield = y; }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.verdict !== 'any') params.set('verdict', state.verdict);
    if (state.ticket !== DATA.model.ticket_usd) params.set('ticket', String(state.ticket));
    if (state.share !== DATA.model.drop_share) params.set('share', String(state.share));
    if (state.yield !== DATA.model.opp_rate) params.set('yield', String(state.yield));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function countsAtTicket() {
    var c = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (r) { var e = econ(r); c[e.verdict === 'FARM' ? 'farm' : e.verdict === 'THIN' ? 'thin' : 'skip']++; });
    return c;
  }

  function kpis() {
    var c = countsAtTicket();
    var top = DATA.rows[0];
    function kpi(label, value, note) {
      return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { html: value }), el('small', { text: note }));
    }
    return el('section', { class: 'kpis' },
      kpi('Ranked', String(DATA.board_size), '40/40 watchlist covered'),
      kpi('Implied value', fmtUsd(DATA.implied_total_usd), 'rank 1 ' + (top ? top.name + ' ' + fmtUsd(top.implied_value_usd) : '')),
      kpi('Out-of-sample miss', fmtX(V.loo_final_med), 'flat ' + fmtX(V.loo_flat_med) + ' · walk-forward ' + fmtX(V.wf_final_med)),
      kpi('Range holds', Math.round(V.band_p2575 * 100) + '%', 'P25–P75 holds ' + Math.round(V.band_p2575 * 100) + '% · P10–P90 ' + Math.round(V.band_p1090 * 100) + '%'),
      kpi('Token-or-not, held out', Math.round(V.odds_acc * 100) + '%', 'classifier · base rate ' + Math.round(V.odds_base * 100) + '%'),
      kpi('Worth farming', '<em>' + c.farm + ' FARM</em>', c.thin + ' THIN · ' + c.skip + ' SKIP at $' + state.ticket.toLocaleString() + ', ' + Math.round(state.share * 100) + '%')
    );
  }

  var COVER_COLORS = ['#2dd4a7', '#5aa9ff', '#8b9bb4', '#f5b94e', '#b678f5', '#f26d6d', '#e8833a', '#3fa7a0'];
  function coverage() {
    var total = DATA.total_protocols;
    var bar = el('div', { class: 'bar cover-bar' });
    DATA.coverage.forEach(function (b, i) {
      bar.appendChild(el('i', { style: 'width:' + (b.count / total * 100).toFixed(2) + '%;background:' + COVER_COLORS[i % COVER_COLORS.length] }));
    });
    var legend = el('div', { class: 'cover-legend' },
      DATA.coverage.map(function (b, i) {
        return el('span', null, el('i', { class: 'dot', style: 'background:' + COVER_COLORS[i % COVER_COLORS.length] }), b.label + ' ', el('b', { text: String(b.count) }));
      })
    );
    return el('section', { class: 'cover' },
      el('div', null, el('b', { text: total + ' protocols read' }), el('span', { class: 'sub', text: ' · every one accounted for, ranked or set aside for one reason' })),
      bar, legend
    );
  }

  function farmNext() {
    var c = countsAtTicket();
    var list = DATA.rows.map(function (r) { return { r: r, e: econ(r) }; })
      .filter(function (x) { return x.e.verdict === 'FARM'; })
      .sort(function (a, b) { return b.e.perHour - a.e.perHour; })
      .slice(0, 3);
    var line;
    if (list.length === 0) {
      line = 'No farm clears $' + DATA.model.farm_threshold_usd + ' at $' + state.ticket.toLocaleString() + ', ' + Math.round(state.share * 100) + '% and a ' + Math.round(state.yield * 100) + '% T-bill: raise the ticket or the drop share, or lower the yield, to see one.';
    } else {
      line = list.map(function (x) {
        return x.r.name + ' +' + fmtMoney(x.e.net) + ' · ' + fmtMoney(x.e.perHour) + '/h';
      }).join('   ·   ') + ' — ' + c.farm + ' FARM, ' + c.thin + ' THIN, ' + c.skip + ' SKIP at $' + state.ticket.toLocaleString() + ', ' + Math.round(state.share * 100) + '%, ' + Math.round(state.yield * 100) + '% T-bill';
    }
    return el('section', { class: 'cover farmnext' },
      el('div', null, el('b', { text: 'Farm next: ' }), el('span', { text: line }))
    );
  }

  function ablationTable() {
    function row(label, med, within, rank, wf) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: fmtX(med) }),
        el('td', { class: 'num', text: Math.round(within * 100) + '%' }),
        el('td', { class: 'num', text: rank === null ? '—' : rank.toFixed(2) }),
        el('td', { class: 'num', text: wf === null ? '—' : fmtX(wf) })
      );
    }
    return el('table', { class: 'mini' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Model' }), el('th', { class: 'num', text: 'LOO' }),
        el('th', { class: 'num', text: '≤3x' }), el('th', { class: 'num', text: 'ρ' }), el('th', { class: 'num', text: 'WF' }))),
      el('tbody', null,
        row('Flat TVL multiple', V.loo_flat_med, V.loo_flat_within3, V.rank_flat, V.wf_flat_med),
        row('+ size curve (log-log fit)', V.loo_size_med, V.loo_size_within3, V.rank_size, V.wf_size_med),
        row('+ curvature on the size curve', V.loo_curve_med, V.loo_curve_within3, V.rank_curve, V.wf_curve_med),
        row('+ 7-day growth', V.loo_growth_med, V.loo_growth_within3, null, V.wf_growth_med),
        row('+ listing age', V.loo_age_med, V.loo_age_within3, V.rank_age, V.wf_age_med),
        row('+ category, shrunk — final model', V.loo_final_med, V.loo_final_within3, V.rank_final, V.wf_final_med)
      )
    );
  }

  function scatterSvg() {
    var pts = DATA.scatter;
    var xs = pts.comps.map(function (p) { return p[0]; }).concat(pts.board.map(function (p) { return p[0]; }));
    var ys = pts.comps.map(function (p) { return p[1]; }).concat(pts.board.map(function (p) { return p[1]; }));
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var W = 460, H = 190, PL = 44, PR = 8, PT = 8, PB = 22;
    function X(v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (y1 - v) / (y1 - y0) * (H - PT - PB); }
    function money(v) { return '$' + (v >= 9 ? '1B' : v >= 8 ? '100M' : v >= 7 ? '10M' : v >= 6 ? '1M' : v >= 5 ? '100K' : '10K'); }
    var s = '';
    for (var gx = x0; gx <= x1; gx++) {
      s += '<line x1="' + X(gx) + '" y1="' + PT + '" x2="' + X(gx) + '" y2="' + (H - PB) + '" stroke="#22314d" stroke-width="1"/>';
      s += '<text x="' + X(gx) + '" y="' + (H - 6) + '" fill="#8b9bb4" font-size="10" text-anchor="middle">' + money(gx) + '</text>';
    }
    for (var gy = y0; gy <= y1; gy++) {
      s += '<line x1="' + PL + '" y1="' + Y(gy) + '" x2="' + (W - PR) + '" y2="' + Y(gy) + '" stroke="#22314d" stroke-width="1"/>';
      s += '<text x="' + (PL - 4) + '" y="' + (Y(gy) + 3) + '" fill="#8b9bb4" font-size="10" text-anchor="end">' + money(gy) + '</text>';
    }
    var l = pts.line;
    function curvePath(off) {
      return l.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1] + off).toFixed(1); }).join(' ');
    }
    s += '<polyline points="' + curvePath(0) + '" fill="none" stroke="#2dd4a7" stroke-width="2"/>';
    s += '<polyline points="' + curvePath(V.band_q75) + '" fill="none" stroke="#2dd4a7" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>';
    s += '<polyline points="' + curvePath(V.band_q25) + '" fill="none" stroke="#2dd4a7" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>';
    pts.comps.forEach(function (p) { s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.2" fill="#8b9bb4" opacity="0.75"/>'; });
    pts.board.forEach(function (p) { s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.2" fill="#2dd4a7"/>'; });
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for traded tokens and the board">' + s + '</svg>';
  }

  function cohortSvg() {
    var rows = V.cohort;
    var W = 460, H = 150, PL = 36, PR = 8, PT = 14, PB = 34;
    var bw = (W - PL - PR) / rows.length;
    function Y(v) { return PT + (1 - v) * (H - PT - PB); }
    var s = '';
    for (var g = 0; g <= 4; g++) {
      var gv = g / 4;
      s += '<line x1="' + PL + '" y1="' + Y(gv) + '" x2="' + (W - PR) + '" y2="' + Y(gv) + '" stroke="#22314d" stroke-width="1"/>';
      s += '<text x="' + (PL - 4) + '" y="' + (Y(gv) + 3) + '" fill="#8b9bb4" font-size="10" text-anchor="end">' + Math.round(gv * 100) + '%</text>';
    }
    s += '<line x1="' + PL + '" y1="' + Y(V.cohort_plateau) + '" x2="' + (W - PR) + '" y2="' + Y(V.cohort_plateau) + '" stroke="#2dd4a7" stroke-width="1" stroke-dasharray="4 3"/>';
    s += '<text x="' + (PL + 4) + '" y="' + (Y(V.cohort_plateau) - 4) + '" fill="#2dd4a7" font-size="10" text-anchor="start">plateau ' + Math.round(V.cohort_plateau * 100) + '%</text>';
    rows.forEach(function (c, i) {
      var x = PL + i * bw + 6;
      var w = bw - 12;
      s += '<rect x="' + x.toFixed(1) + '" y="' + Y(c.rate).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (Y(0) - Y(c.rate)).toFixed(1) + '" fill="#5aa9ff" opacity="0.85"/>';
      s += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (Y(c.rate) - 4).toFixed(1) + '" fill="#e8eef7" font-size="10" text-anchor="middle">' + Math.round(c.rate * 100) + '%</text>';
      s += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - PB + 12) + '" fill="#8b9bb4" font-size="10" text-anchor="middle">' + c.label + '</text>';
      s += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - PB + 24) + '" fill="#2dd4a7" font-size="10" text-anchor="middle">odds ' + Math.round(c.odds * 100) + '%</text>';
    });
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Share of protocols with a token by listing age, and the launch odds each age bucket implies">' + s + '</svg>';
  }

  function bestFarms() {
    var list = DATA.rows.map(function (r) { return { r: r, e: econ(r) }; })
      .filter(function (x) { return x.e.net > 0; })
      .sort(function (a, b) { return b.e.perHour - a.e.perHour; })
      .slice(0, 3);
    var body;
    if (list.length === 0) {
      body = [el('p', { class: 'note', text: 'No farm clears $0 at this ticket and drop share: the slices are too thin for the fees. Raise the ticket or the drop share to see one.' })];
    } else {
      body = list.map(function (x) {
        return el('div', { class: 'bestfarm' },
          el('div', null,
            el('b', { text: x.r.name }),
            el('div', { class: 'sub', text: (x.r.category || 'Other') + ' · ' + x.r.farm_days + 'd · $' + x.r.farm_fees_usd + ' fees' })
          ),
          el('div', null, el('span', { class: 'net', text: '+' + fmtMoney(x.e.net) }), el('div', { class: 'sub', text: fmtMoney(x.e.perHour) + '/h' }))
        );
      });
    }
    return el('div', null,
      el('h3', { text: 'Best farms now, by net per hour' }),
      body,
      el('h3', { text: 'Launch odds by age — the cohort read' }),
      el('div', { html: cohortSvg() }),
      el('p', { class: 'note', text: 'Blue bars: the share of each age cohort that records a token. Green odds under each bar: the share of the cohort\u2019s pre-token remainder that would have to launch for it to reach the 3+ year plateau. Of protocols listed 3+ years ago, ' + Math.round(V.cohort_plateau * 100) + '% record a token: the launch window is mostly the first three years.' })
    );
  }

  function sidePanels() {
    return el('div', { class: 'side' },
      el('div', { class: 'panel' },
        el('h2', { text: 'How a value is built — impliedValue()' }),
        el('div', { class: 'formula', text: 'implied = 10^' + V.fit_a.toFixed(3) + ' × TVL^' + V.fit_b.toFixed(3) + ' × 10^(' + V.curve_c.toFixed(2) + ' × (log10 TVL − ' + V.fit_mx.toFixed(2) + ')²) × (1 + ' + DATA.model.growth_weight.toFixed(2) + ' × growth) × 10^(−0.05 × log10(age / 365)) × category' }),
        el('p', { class: 'sub', text: 'A power-law size curve, fitted on the ' + V.n_comps + ' traded tokens (R² ' + V.fit_r2.toFixed(2) + ', ' + V.fit_r2_final.toFixed(2) + ' with the category term): the market pays less per dollar of TVL as TVL grows, so a flat multiple overprices giants fivefold. The curve bends down at both ends by ' + V.curve_c.toFixed(2) + ' × (log10 TVL − ' + V.fit_mx.toFixed(2) + ')², which wins both held-out tests. Category is the shrunk median of the category\u2019s own residuals, prior ' + V.cat_prior + ', at least ' + V.cat_min_n + ' traded tokens: CEX ×' + (V.category_factors[0] ? V.category_factors[0].factor.toFixed(2) : '—') + ' down to Liquid Staking ×' + (V.category_factors.length ? V.category_factors[V.category_factors.length - 1].factor.toFixed(2) : '—') + '.' }),
        ablationTable(),
        el('p', { class: 'note', text: 'Tried and dropped: a uniform 0.80 discount (LOO ' + fmtX(V.loo_discount_med) + ', WF ' + fmtX(V.wf_discount_med) + '), a chain-count term (LOO ' + fmtX(V.loo_chains_med) + ', WF ' + fmtX(V.wf_chains_med) + '), a coarse sector grouping (LOO ' + fmtX(V.loo_coarse_med) + ', WF ' + fmtX(V.wf_coarse_med) + ') and a free quadratic whose curvature is fitted, not fixed (LOO ' + fmtX(V.loo_quadols_med) + ', WF ' + fmtX(V.wf_quadols_med) + ') — none beats the final model on both tests. A term joins only when it wins both. Walk-forward fits on the older half and prices the newer half.' })
      ),
      el('div', { class: 'panel' },
        el('h2', { text: 'Traded tokens set the curve; the board sits on it' }),
        el('div', { html: scatterSvg() }),
        el('div', { class: 'legend' },
          el('span', { text: '● traded tokens, in the fit' }),
          el('span', { text: '● board rows, at implied value' }),
          el('span', { text: '— fitted curve, dashed P25–P75' })
        ),
        el('p', { class: 'note', text: 'Each held-out token is priced from the rest: typical miss ' + fmtX(V.loo_final_med) + ', ' + Math.round(V.loo_final_within3 * 100) + '% within 3x.' })
      ),
      el('div', { class: 'panel' },
        el('h2', { text: 'What farming it pays' }),
        bestFarms()
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search the board', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var verdictSel = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict' },
      [['any', 'Any verdict'], ['FARM', 'Farm'], ['THIN', 'Thin'], ['SKIP', 'Skip']].map(function (v) {
        return el('option', { value: v[0], text: v[1], selected: v[0] === state.verdict ? 'selected' : null });
      })
    );
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null, onchange: function (e) { state.wl = e.target.checked; writeHash(); render(); } }),
      'Watchlist'
    );
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var ticketSel = el('select', { id: 'ticket', 'aria-label': 'Deposit size' },
      [500, 1000, 5000, 10000].map(function (t) { return el('option', { value: String(t), text: '$' + t.toLocaleString(), selected: t === state.ticket ? 'selected' : null }); })
    );
    ticketSel.addEventListener('change', function () { state.ticket = parseInt(ticketSel.value, 10); writeHash(); render(); });
    var shareSel = el('select', { id: 'share', 'aria-label': 'Drop share' },
      [[0.035, '3.5%'], [0.07, '7%'], [0.14, '14%']].map(function (s) { return el('option', { value: String(s[0]), text: s[1], selected: s[0] === state.share ? 'selected' : null }); })
    );
    shareSel.addEventListener('change', function () { state.share = parseFloat(shareSel.value); writeHash(); render(); });
    var yieldSel = el('select', { id: 'yield', 'aria-label': 'T-bill yield' },
      [[0, '0%'], [0.04, '4%'], [0.08, '8%']].map(function (s) { return el('option', { value: String(s[0]), text: s[1], selected: s[0] === state.yield ? 'selected' : null }); })
    );
    yieldSel.addEventListener('change', function () { state.yield = parseFloat(yieldSel.value); writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSel),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('setaside', 'Set aside'))),
      el('div', { class: 'field' }, el('label', { for: 'ticket', text: 'Deposit' }), ticketSel),
      el('div', { class: 'field' }, el('label', { for: 'share', text: 'Drop share' }), shareSel),
      el('div', { class: 'field' }, el('label', { for: 'yield', text: 'T-bill yield' }), yieldSel)
    );
  }

  function matchCommon(r) {
    if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
    if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function preRows() {
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.verdict !== 'any' && econ(r).verdict !== state.verdict) return false;
      return matchCommon(r);
    });
  }
  function liveRows() { return DATA.live.filter(matchCommon); }
  function asideRows() { return DATA.setaside.filter(matchCommon); }

  function sortedRows(list) {
    var key = state.sort;
    var vrank = { FARM: 0, THIN: 1, SKIP: 2 };
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null || a.age_days === undefined ? Infinity : a.age_days; bv = b.age_days === null || b.age_days === undefined ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.launch_odds === undefined ? -Infinity : a.launch_odds; bv = b.launch_odds === undefined ? -Infinity : b.launch_odds; }
      else if (key === 'net') { av = a.implied_value_usd === undefined ? -Infinity : econ(a).net; bv = b.implied_value_usd === undefined ? -Infinity : econ(b).net; }
      else if (key === 'verdict') { av = a.implied_value_usd === undefined ? 3 : vrank[econ(a).verdict]; bv = b.implied_value_usd === undefined ? 3 : vrank[econ(b).verdict]; }
      else if (key === 'slice') { av = a.implied_value_usd === undefined ? -Infinity : econ(a).slice; bv = b.implied_value_usd === undefined ? -Infinity : econ(b).slice; }
      else { av = a.implied_value_usd === undefined ? a.tvl_usd : a.implied_value_usd; bv = b.implied_value_usd === undefined ? b.tvl_usd : b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function emptyPanel() {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.verdict = 'any'; writeHash(); render(); } })
    ));
  }

  function boardTable() {
    var list = sortedRows(preRows());
    if (list.length === 0) return emptyPanel();
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var e = econ(r);
      var netClass = e.net >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e2) { if (e2.key === 'Enter' || e2.key === ' ') { e2.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('div', { text: String(r.rank) }), el('div', { class: 'sub', text: r.rank_low === r.rank_high ? 'holds ' + r.rank : r.rank_low + '–' + r.rank_high })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
          WATCH[r.slug] ? el('span', null, el('span', { class: 'badge', text: 'Watchlist' })) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtOdds(r.launch_odds) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })
        )),
        el('td', { class: 'num', text: fmtMoney(e.slice) }),
        el('td', { class: 'num ' + netClass, text: fmtMoney(e.net) }),
        el('td', null, el('span', { class: 'verdict ' + e.verdict.toLowerCase(), text: e.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: list.length + ' rows shown · ' + countsAtTicket().farm + ' FARM, ' + countsAtTicket().thin + ' THIN, ' + countsAtTicket().skip + ' SKIP at $' + state.ticket.toLocaleString() + ', ' + Math.round(state.share * 100) + '%. Pre-token protocols, strongest implied value first. Select a row for its model, its odds and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'No token'),
            sortHeader('odds', 'Odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('slice', 'Slice'),
            sortHeader('net', 'Net'),
            sortHeader('verdict', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = sortedRows(liveRows());
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are the comparables the size curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function asideTable() {
    var list = sortedRows(asideRows());
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: 'aside' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'sub', text: r.reason }),
        el('td', null, el('span', { class: 'status aside', text: 'set aside' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Set aside: pre-token on record, but a wrapped, staked or bridged product of a token that already trades, so there is no launch of its own to rank. The largest ' + DATA.setaside.length + ' are shown here of ' + DATA.setaside_size + ' set aside.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Why set aside' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    var live = !row ? DATA.live.filter(function (r) { return r.slug === slug; })[0] : null;
    var aside = !row && !live ? DATA.setaside.filter(function (r) { return r.slug === slug; })[0] : null;
    if (!row && !live && !aside) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var item = row || live || aside;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: row ? 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · holds ' + row.rank_low + '–' + row.rank_high + ' over 200 refits' : live ? 'Live token' : 'Set aside' }),
        el('h2', { id: 'detail-title', text: item.name }),
        el('p', { class: 'sub', text: (item.category || 'Other') + ' on ' + (item.chains && item.chains.length ? item.chains.join(', ') : 'an unnamed chain') + (WATCH[item.slug] ? ' · on the watchlist' : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    if (live) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Already trading' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(live.tvl_usd) })),
          el('div', null, el('span', { text: 'Market cap' }), el('b', { class: 'num', text: fmtUsd(live.mcap_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(live.change_7d) })),
          el('div', { class: 'total' }, el('span', { text: 'Market cap / TVL' }), el('b', { class: 'num', text: live.tvl_usd ? (live.mcap_usd / live.tvl_usd).toFixed(2) + 'x' : 'n/a' }))
        ),
        el('p', { class: 'sub', text: 'This protocol already trades, so its market cap is a fact, not a model. It is one of the ' + V.n_comps + ' comparables the size curve is fitted on.' })
      ));
      showDialog();
      return;
    }
    if (aside) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Why set aside' }),
        el('p', { class: 'sub', text: aside.reason + '. Its TVL is ' + fmtUsd(aside.tvl_usd) + ', but the token it would launch already trades under another name, so there is no launch of its own to rank or farm.' })
      ));
      showDialog();
      return;
    }
    var e = econ(row);
    var curve = Math.pow(10, V.fit_a) * Math.pow(row.tvl_usd, V.fit_b) * Math.pow(10, V.curve_c * Math.pow(Math.log10(row.tvl_usd) - V.fit_mx, 2));
    var cohort = V.cohort.filter(function (c) {
      if (row.age_days === null || row.age_days === undefined) return false;
      if (row.age_days < 180) return c.label === 'under 6 months';
      if (row.age_days < 365) return c.label === '6-12 months';
      if (row.age_days < 730) return c.label === '1-2 years';
      if (row.age_days < 1095) return c.label === '2-3 years';
      return c.label === '3+ years';
    })[0];
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — one function scores every row' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size curve' }), el('b', { class: 'num', text: fmtUsd(curve) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Age multiplier' }), el('b', { class: 'num', text: row.age_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Category (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: '×' + row.category_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Plausible range (P25–P75)' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Rank over 200 refits' }), el('b', { class: 'num', text: row.rank_low + '–' + row.rank_high }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': log10(market cap) = ' + V.fit_a.toFixed(3) + ' + ' + V.fit_b.toFixed(3) + ' × log10(TVL) ' + V.curve_c.toFixed(2) + ' × (log10(TVL) − ' + V.fit_mx.toFixed(2) + ')², fitted on ' + V.n_comps + ' traded tokens. Held out, the typical miss is ' + fmtX(V.loo_final_med) + ' and ' + Math.round(V.loo_final_within3 * 100) + '% land within 3x. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Launch odds — the cohort read' }),
      el('div', { class: 'equation' },
        el('div', { class: 'total' }, el('span', { text: 'Launch odds' }), el('b', { class: 'num', text: fmtOdds(row.launch_odds) })),
        el('div', null, el('span', { text: 'Cohort' }), el('b', { class: 'num', text: cohort ? cohort.label + ' · ' + cohort.n + ' protocols' : 'no listing date' })),
        el('div', null, el('span', { text: 'Cohort token rate' }), el('b', { class: 'num', text: cohort ? Math.round(cohort.rate * 100) + '% record a token' : 'n/a' })),
        el('div', null, el('span', { text: 'Plateau (3+ years)' }), el('b', { class: 'num', text: Math.round(V.cohort_plateau * 100) + '% record a token' }))
      ),
      el('p', { class: 'sub', text: 'Odds are the share of this age cohort\u2019s pre-token remainder that would have to launch for the cohort to reach the 3+ year plateau. A classifier on size, age, growth and name kinship — whether another protocol with the same name stem already has a token — calls token-or-not at ' + Math.round(V.odds_acc * 100) + '% held out, against ' + Math.round(V.odds_base * 100) + '% for guessing the majority — the features carry signal, but the odds are a cohort read, not a forecast.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — at $' + state.ticket.toLocaleString() + ' and ' + Math.round(state.share * 100) + '% to farmers' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Slice if it launches' }), el('b', { class: 'num', text: fmtMoney(e.slice) })),
        el('div', null, el('span', { text: 'Plan fees (L2 rates)' }), el('b', { class: 'num', text: fmtMoney(row.farm_fees_usd) })),
        el('div', null, el('span', { text: 'Yield forgone (' + row.farm_days + 'd at ' + Math.round(state.yield * 100) + '%)' }), el('b', { class: 'num', text: fmtMoney(e.opp) })),
        el('div', null, el('span', { text: 'Hours' }), el('b', { class: 'num', text: row.farm_hours + 'h over ' + row.farm_days + 'd' })),
        el('div', { class: 'total' }, el('span', { text: 'Net' }), el('b', { class: 'num', text: fmtMoney(e.net) + ' · ' + fmtMoney(e.perHour) + '/h' })),
        el('div', { class: 'total' }, el('span', { text: 'Break-even odds' }), el('b', { class: 'num', text: e.be >= 1 ? '>100% — never' : fmtOdds(e.be) })),
        el('div', { class: 'total' }, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: e.verdict + (e.verdict === 'FARM' ? ' — clears $' + DATA.model.farm_threshold_usd : e.verdict === 'THIN' ? ' — clears $0' : ' — loses money') }))
      ),
      el('p', { class: 'sub', text: 'Slice = implied × ' + Math.round(state.share * 100) + '% × odds × ($' + state.ticket.toLocaleString() + ' ÷ TVL). A big TVL thins the slice, so the best farms are small and young. Fees are L2 rates; a mainnet-only plan costs more.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — $' + row.farm_capital_usd + ' at the $' + DATA.model.ticket_usd + ' ticket' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    showDialog();
  }

  function showDialog() {
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(kpis());
    shell.appendChild(coverage());
    shell.appendChild(farmNext());
    shell.appendChild(controls());
    var main = el('div', { class: 'main' });
    main.appendChild(el('div', { class: 'boardcol' }, state.tab === 'pre-token' ? boardTable() : state.tab === 'live' ? liveTable() : asideTable()));
    if (state.tab === 'pre-token') main.appendChild(sidePanels());
    shell.appendChild(main);
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: DefiLlama protocol index, snapshot ' + DATA.as_of + '. The snapshot records no token where it carries none; a protocol on the list may still have a token its record does not carry.' }),
      el('p', { text: 'Implied value is this entry\u2019s own model, never a price and never a prediction that a token is issued. Launch odds are a cohort read, not a forecast. Farm steps are general guidance, not financial advice.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
