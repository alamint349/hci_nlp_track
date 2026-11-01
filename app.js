(() => {
  'use strict';

  // ── Settings ─────────────────────────────────────────────────────────
  const SITE = {
    dataUrl: 'data/conferences.yml',
    // Your repository URL, e.g. 'https://github.com/you/hci-nlp-deadlines'.
    // When set, the footer links straight to the data file's edit page.
    repo: '',
    branch: 'main'
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const DAY = 864e5;
  const FIELD_NAMES = { hci: 'HCI', nlp: 'NLP' };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const userTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })() || 'your time zone';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem('deadlines:' + k); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(k, v) { try { localStorage.setItem('deadlines:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  const state = {
    confs: [],
    updated: '',
    field: ['all', 'hci', 'nlp'].includes(store.get('field', 'all')) ? store.get('field', 'all') : 'all',
    query: '',
    tracks: store.get('tracks', false) === true,
    starredOnly: store.get('starredOnly', false) === true,
    stars: new Set(store.get('stars', [])),
    openMore: new Set(),
    openGroups: new Set(['rolling'])
  };

  // ── Time zones and dates ─────────────────────────────────────────────
  // "AoE" = UTC-12. Also accepts "UTC", "UTC+9", "UTC-7", "UTC+5:30".
  function tzOffset(tz) {
    const t = String(tz || 'AoE').trim();
    if (/^aoe$/i.test(t)) return -12;
    if (/^(utc|gmt|z)$/i.test(t)) return 0;
    const m = /^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(t);
    if (!m) return null;
    const v = Number(m[2]) + Number(m[3] || 0) / 60;
    return m[1] === '-' ? -v : v;
  }
  const tzLabel = (tz) => (/^aoe$/i.test(String(tz || 'AoE').trim()) ? 'AoE' : String(tz).trim().toUpperCase());

  function parseParts(v) {
    if (v instanceof Date) return { y: v.getUTCFullYear(), mo: v.getUTCMonth() + 1, d: v.getUTCDate(), h: null, mi: null };
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(v ?? '').trim());
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null };
  }

  // A date with no time means 23:59 in the venue's time zone.
  function toInstant(v, tz) {
    const p = parseParts(v);
    const off = tzOffset(tz);
    if (!p || off == null) return null;
    const h = p.h == null ? 23 : p.h;
    const mi = p.h == null ? 59 : p.mi;
    return new Date(Date.UTC(p.y, p.mo - 1, p.d, h, mi) - off * 3600e3);
  }
  const toCalDate = (v) => { const p = parseParts(v); return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d)) : null; };

  function fmtInZone(at, off) {
    const d = new Date(at.getTime() + off * 3600e3);
    return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  // The deadline's calendar date in the venue's own time zone (read with getUTC*).
  const venueDate = (d) => new Date(d.at.getTime() + tzOffset(d.tz) * 3600e3);
  const fmtVenue = (d) => `${fmtInZone(d.at, tzOffset(d.tz))} ${tzLabel(d.tz)}`;
  const fmtLocal = (at, withYear) =>
    `${WD[at.getDay()]} ${at.getDate()} ${MON[at.getMonth()]}${withYear ? ' ' + at.getFullYear() : ''}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const fmtDay = (d) => `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  function fmtRange(a, b) {
    if (!a) return '';
    if (!b || +a === +b) return fmtDay(a);
    if (a.getUTCFullYear() === b.getUTCFullYear()) {
      if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
      return `${a.getUTCDate()} ${MON[a.getUTCMonth()]} – ${b.getUTCDate()} ${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
    }
    return `${fmtDay(a)} – ${fmtDay(b)}`;
  }

  // ── Data ─────────────────────────────────────────────────────────────
  function normalize(raw, i) {
    raw = raw || {};
    const tz = raw.timezone || 'AoE';
    const est = raw.estimated === true;
    const deadlines = (Array.isArray(raw.deadlines) ? raw.deadlines : [])
      .map((d) => {
        d = d || {};
        const dtz = d.timezone || tz;
        return {
          label: String(d.label || 'Deadline'),
          kind: d.kind === 'track' ? 'track' : 'paper',
          at: toInstant(d.date, dtz),
          tz: dtz,
          estimated: d.estimated != null ? d.estimated === true : est
        };
      })
      .filter((d) => d.at && !isNaN(d.at))
      .sort((a, b) => a.at - b.at);

    const name = String(raw.name || 'Untitled');
    const year = raw.year != null && raw.year !== '' ? String(raw.year) : '';
    const field = String(raw.field || '').toLowerCase();
    return {
      id: slug(raw.id || `${name}-${year}` || `conf-${i}`),
      name,
      year,
      title: year ? `${name} ${year}` : name,
      short: year ? `${name} ’${year.slice(-2)}` : name,
      field: FIELD_NAMES[field] ? field : 'hci',
      full: raw.full ? String(raw.full) : '',
      rank: raw.rank ? String(raw.rank) : '',
      place: raw.place ? String(raw.place) : 'TBA',
      start: toCalDate(raw.start),
      end: toCalDate(raw.end),
      when: raw.when ? String(raw.when) : '',
      link: raw.link ? String(raw.link) : '',
      note: raw.note ? String(raw.note) : '',
      notification: toCalDate(raw.notification),
      estimated: est,
      rolling: raw.rolling === true,
      deadlines
    };
  }

  const relevant = (c) => c.deadlines.filter((d) => state.tracks || d.kind === 'paper');
  const nextOf = (c, now) => relevant(c).find((d) => d.at > now) || null;

  function matches(c) {
    if (state.field !== 'all' && c.field !== state.field) return false;
    if (state.starredOnly && !state.stars.has(c.id)) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [c.title, c.full, c.place, c.when, FIELD_NAMES[c.field], c.rank].join(' ').toLowerCase();
    return q.split(/\s+/).every((t) => hay.includes(t));
  }

  // ── Countdown ────────────────────────────────────────────────────────
  function cdParts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  }
  function cdHTML(ms, mode) {
    const p = cdParts(ms);
    if (mode === 'big') {
      const u = (n, unit) => `<span><b>${n}</b><i>${unit}</i></span>`;
      return u(p.d, p.d === 1 ? 'day' : 'days') + u(pad(p.h), 'hrs') + u(pad(p.m), 'min') + u(pad(p.s), 'sec');
    }
    if (p.d >= 2) return `<b>${p.d}</b><i>days</i><b>${p.h}</b><i>h</i>`;
    return `${p.d ? `<b>${p.d}</b><i>d</i>` : ''}<b>${pad(p.h)}</b><i>h</i><b>${pad(p.m)}</b><i>m</i><b>${pad(p.s)}</b><i>s</i>`;
  }

  // ── Icons ────────────────────────────────────────────────────────────
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
    dl: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
    ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>')
  };

  // ── Rendering ────────────────────────────────────────────────────────
  function render() {
    const now = new Date();
    const visible = state.confs.filter(matches);
    renderNext(visible, now);
    renderTimeline(visible, now);
    renderList(visible, now);
    syncControls(visible, now);
    tick();
  }

  function renderNext(visible, now) {
    const el = $('#next');
    let best = null;
    for (const c of visible) {
      const d = nextOf(c, now);
      if (d && (!best || d.at < best.d.at)) best = { c, d };
    }
    if (!best) {
      el.className = 'next is-empty';
      el.innerHTML = '<p class="next-kicker">Next deadline</p><p class="next-name">Nothing due</p><p class="next-label">No upcoming deadlines match your filters.</p>';
      return;
    }
    const { c, d } = best;
    el.className = 'next' + (d.at - now < 7 * DAY ? ' is-urgent' : '');
    const name = c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title);
    el.innerHTML = `
      <p class="next-kicker">Next deadline${d.estimated ? ', estimated' : ''}</p>
      <h2 class="next-name">${name}</h2>
      <p class="next-label">${esc(d.label)}</p>
      <p class="next-cd" data-at="${+d.at}" data-mode="big"></p>
      <p class="next-when">${esc(fmtVenue(d))}<br>${esc(fmtLocal(d.at, true))} in ${esc(userTz)}</p>`;
  }

  function renderTimeline(visible, now) {
    const host = $('#timeline');
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);
    const span = end - start;
    const pct = (t) => ((t - start) / span) * 100;
    const lanes = state.field === 'all' ? ['hci', 'nlp'] : [state.field];

    let months = '';
    let grid = '';
    for (let i = 0; i < 12; i++) {
      const m = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const yr = i === 0 || m.getMonth() === 0 ? ` ’${String(m.getFullYear()).slice(-2)}` : '';
      months += `<span class="tl-month" style="left:${pct(m)}%">${MON[m.getMonth()]}${yr}</span>`;
      if (i) grid += `<span class="tl-grid" style="left:${pct(m)}%"></span>`;
    }
    const todayX = pct(now);

    // One marker per conference per cluster of deadlines (abstract → paper within 14 days).
    const byLane = { hci: [], nlp: [] };
    for (const c of visible) {
      let cl = null;
      for (const d of relevant(c).filter((x) => x.at > now && x.at < end)) {
        if (cl && cl.kind === d.kind && d.at - cl.to <= 14 * DAY) {
          cl.to = d.at; cl.parts.push(d); cl.est = cl.est || d.estimated;
        } else {
          cl = { c, kind: d.kind, from: d.at, to: d.at, parts: [d], est: d.estimated };
          byLane[c.field].push(cl);
        }
      }
    }

    const item = (it) => {
      const x0 = pct(it.from);
      const x1 = pct(it.to);
      const what = it.parts.map((d) => `${d.label} ${fmtInZone(d.at, tzOffset(d.tz)).replace(/, \d\d:\d\d$/, '')}`).join('; ');
      const label = `${it.c.title}${it.est ? ' (estimated)' : ''}: ${what}`;
      return `<a class="tl-item${it.est ? ' est' : ''}" data-field="${it.c.field}" href="#c-${it.c.id}"
          style="left:${x0}%;width:${x1 - x0}%" title="${esc(label)}" aria-label="${esc(label)}">
          ${x1 > x0 ? '<span class="tl-bar"></span>' : ''}<span class="tl-stem"></span><span class="tl-dot"></span>
          <span class="tl-label">${esc(it.c.short)}</span></a>`;
    };

    let html = `<div class="tl"><div class="tl-months"><span></span><div class="tl-axis">${months}
      <span class="tl-today-tag" style="left:${todayX}%;transform:translateX(${todayX < 4 ? '-1px' : '-50%'})">Today</span></div></div>`;
    for (const f of lanes) {
      const items = byLane[f].sort((a, b) => a.to - b.to);
      html += `<div class="tl-lane" data-field="${f}"><span class="tl-lane-name">${FIELD_NAMES[f]}</span>
        <div class="tl-track">${grid}<span class="tl-today" style="left:${todayX}%"></span>${items.map(item).join('')}</div></div>`;
    }
    html += '</div>';
    host.innerHTML = html;
    layoutTimeline();
  }

  // Stack labels so they don't collide, and flip them left near the right edge.
  function layoutTimeline() {
    $$('.tl-track').forEach((track) => {
      const W = track.clientWidth;
      const levels = [];
      const BASE = 30, STEP = 22, MAX = 3;
      $$('.tl-item', track).forEach((item) => {
        const label = $('.tl-label', item);
        const stem = $('.tl-stem', item);
        const x = item.offsetLeft + item.offsetWidth;
        const w = label.offsetWidth;
        const flip = x + w > W - 4;
        const l = flip ? x - w : x - 2;
        const r = flip ? x + 2 : x + w;
        let lvl = levels.findIndex((edge) => edge + 6 <= l);
        if (lvl === -1) lvl = levels.length < MAX ? levels.length : levels.indexOf(Math.min(...levels));
        levels[lvl] = r;
        const bottom = BASE + lvl * STEP;
        label.style.bottom = bottom + 'px';
        label.classList.toggle('flip', flip);
        stem.style.height = bottom - 24 + 'px';
      });
    });
  }

  function rowHTML(c, d, now, kind) {
    const left = d ? d.at - now : 0;
    const cls = ['row'];
    if (d && d.estimated) cls.push('est');
    if (d && left < 7 * DAY) cls.push('urgent');
    else if (d && left < 30 * DAY) cls.push('soon');
    if (kind === 'closed') cls.push('closed');

    const vd = d ? venueDate(d) : null;
    const dateBlock = d
      ? `<div class="row-date${d.estimated ? ' is-est' : ''}" aria-hidden="true"><span class="row-day">${vd.getUTCDate()}</span><span class="row-wd">${WD[vd.getUTCDay()]}</span></div>`
      : `<div class="row-date" aria-hidden="true"><span class="row-day">${kind === 'rolling' ? '∞' : '–'}</span><span class="row-wd">${kind === 'rolling' ? 'Any time' : 'Closed'}</span></div>`;

    const pills = [`<span class="pill pill-field">${FIELD_NAMES[c.field]}</span>`];
    if (c.rank) pills.push(`<span class="pill pill-rank" title="CORE rank">${esc(c.rank)}</span>`);
    if ((d && d.estimated) || (!d && c.estimated)) pills.push('<span class="pill pill-est" title="Projected from the previous edition. Check the official site.">Estimated</span>');
    if (d && d.kind === 'track') pills.push('<span class="pill pill-track">Other track</span>');

    const nameHTML = c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title);

    let due;
    if (d) {
      due = `<p class="row-due"><strong>${esc(d.label)}</strong> due ${esc(fmtVenue(d))}
        <span class="row-local">${esc(fmtLocal(d.at, d.at.getFullYear() !== now.getFullYear()))} in ${esc(userTz)}</span></p>`;
    } else if (kind === 'rolling') {
      due = '<p class="row-due"><strong>Rolling submissions.</strong> Submit whenever your paper is ready.</p>';
    } else {
      const past = c.deadlines.filter((x) => x.at <= now && (state.tracks || x.kind === 'paper')).pop();
      due = `<p class="row-due">Submissions closed.${past ? ` Last deadline: ${esc(past.label)}, ${esc(fmtInZone(past.at, tzOffset(past.tz)).replace(/, \d\d:\d\d$/, ''))}.` : ''}</p>`;
    }

    const when = c.when || (c.start && !c.end ? `starts ${fmtDay(c.start)}` : fmtRange(c.start, c.end));
    const meta = `<p class="row-meta">Conference: ${esc([c.place, when].filter(Boolean).join(', '))}</p>`;

    const items = c.deadlines.map((x) => `<li class="${x.at <= now ? 'past' : ''}"><span class="d-label">${esc(x.label)}${x.estimated ? ' ≈' : ''}${x.kind === 'track' ? ' <span class="pill pill-track">Other track</span>' : ''}</span><span class="d-when">${esc(fmtVenue(x))}</span></li>`);
    if (c.notification) items.push(`<li class="${c.notification < now ? 'past' : ''}"><span class="d-label">Notification</span><span class="d-when">${fmtDay(c.notification)}</span></li>`);
    if (c.start || c.when) items.push(`<li><span class="d-label">Conference</span><span class="d-when">${esc(when)}</span></li>`);
    const more = items.length || c.note
      ? `<details class="row-more" data-id="${c.id}"${state.openMore.has(c.id) ? ' open' : ''}><summary>All dates${c.note ? ' and notes' : ''}</summary>
          ${items.length ? `<ul>${items.join('')}</ul>` : ''}${c.note ? `<p class="row-note">${esc(c.note)}</p>` : ''}</details>`
      : '';

    const starred = state.stars.has(c.id);
    const actions = [
      `<button type="button" class="icon-btn star" data-star="${c.id}" aria-pressed="${starred}" aria-label="Star ${esc(c.title)}" title="${starred ? 'Unstar' : 'Star'}">${ICON.star}</button>`,
      d ? `<a class="icon-btn" href="${esc(gcalUrl(c, d))}" target="_blank" rel="noopener" aria-label="Add ${esc(c.title)} ${esc(d.label)} to Google Calendar" title="Add to Google Calendar">${ICON.cal}</a>` : '',
      d ? `<button type="button" class="icon-btn" data-ics="${c.id}" aria-label="Download ${esc(c.title)} deadlines as an .ics file" title="Download .ics">${ICON.dl}</button>` : '',
      c.link ? `<a class="icon-btn" href="${esc(c.link)}" target="_blank" rel="noopener" aria-label="${esc(c.title)} official site" title="Official site">${ICON.ext}</a>` : ''
    ].join('');

    return `<li class="${cls.join(' ')}" id="c-${c.id}" data-field="${c.field}">
      ${dateBlock}
      <div class="row-main">
        <div class="row-head"><h3 class="row-name">${nameHTML}</h3>${pills.join('')}</div>
        ${c.full ? `<p class="row-full">${esc(c.full)}</p>` : ''}
        ${due}${meta}${more}
      </div>
      <div class="row-side">${d ? `<div class="cd" data-at="${+d.at}"></div>` : ''}<div class="row-actions">${actions}</div></div>
    </li>`;
  }

  function renderList(visible, now) {
    const el = $('#list');
    const upcoming = [];
    const rolling = [];
    const closed = [];
    for (const c of visible) {
      if (c.rolling) { rolling.push(c); continue; }
      const d = nextOf(c, now);
      if (d) upcoming.push({ c, d }); else closed.push(c);
    }
    upcoming.sort((a, b) => a.d.at - b.d.at);
    closed.sort((a, b) => (a.start ? +a.start : Infinity) - (b.start ? +b.start : Infinity));

    if (!upcoming.length && !rolling.length && !closed.length) {
      el.innerHTML = `<div class="empty"><strong>No conferences match.</strong> Try a different search, switch the field to All, or turn off “Starred only”.
        <div><button type="button" class="btn" data-reset>Clear filters</button></div></div>`;
      return;
    }

    const groups = new Map();
    for (const it of upcoming) {
      const vd = venueDate(it.d);
      const key = `${vd.getUTCFullYear()}-${pad(vd.getUTCMonth())}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }

    let html = '';
    for (const items of groups.values()) {
      const vd = venueDate(items[0].d);
      html += `<section class="month"><h2 class="month-title">${MONTH_LONG[vd.getUTCMonth()]} ${vd.getUTCFullYear()}<small>${items.length} ${items.length === 1 ? 'deadline' : 'deadlines'}</small></h2>
        <ol class="rows">${items.map((it) => rowHTML(it.c, it.d, now, 'open')).join('')}</ol></section>`;
    }
    if (!upcoming.length) {
      html += '<div class="empty"><strong>No dated deadlines match these filters.</strong> Rolling and closed venues are listed below.</div>';
    }
    const group = (key, title, list, kind) =>
      `<details class="group" data-group="${key}"${state.openGroups.has(key) ? ' open' : ''}><summary>${title}<small>${list.length}</small></summary>
        <ol class="rows">${list.map((c) => rowHTML(c, null, now, kind)).join('')}</ol></details>`;
    if (rolling.length) html += group('rolling', 'Rolling submissions', rolling, 'rolling');
    if (closed.length) html += group('closed', 'Closed for this edition', closed, 'closed');
    el.innerHTML = html;
  }

  function syncControls(visible, now) {
    $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.field === state.field)));
    $('#tracks').checked = state.tracks;
    $('#starred').checked = state.starredOnly;
    $('#tz-name').textContent = userTz;
    const n = visible.reduce((sum, c) => sum + relevant(c).filter((d) => d.at > now).length, 0);
    const btn = $('#ics-all');
    btn.disabled = n === 0;
    btn.textContent = n ? `Download ${n} ${n === 1 ? 'deadline' : 'deadlines'} (.ics)` : 'Nothing to download';
  }

  function renderFoot() {
    const p = parseParts(state.updated);
    const updated = p ? fmtDay(new Date(Date.UTC(p.y, p.mo - 1, p.d))) : '';
    const edit = SITE.repo
      ? ` or <a href="${esc(SITE.repo.replace(/\/$/, ''))}/edit/${esc(SITE.branch)}/${esc(SITE.dataUrl)}">edit it on GitHub</a>`
      : '';
    $('#foot').innerHTML = `
      <p>Dates come from each venue’s official call for papers where one exists. Rows marked Estimated are projected from the previous edition, so confirm on the official site before you plan around them.</p>
      <p>${updated ? `Data last checked ${esc(updated)}. ` : ''}To add or correct a venue, change <code>${esc(SITE.dataUrl)}</code>${edit}. A date without a time counts down to 23:59 in the venue’s time zone.</p>
      Copyright © 2026 Md Al Amin. All rights reserved.`;
  }

  // ── Calendar export ──────────────────────────────────────────────────
  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const fold = (line) => {
    const out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  };
  const summaryOf = (c, d) => `${c.title}: ${d.label}${d.estimated ? ' (estimated)' : ''}`;
  const detailsOf = (c, d) => [
    c.full,
    `Deadline: ${fmtVenue(d)}`,
    d.estimated ? 'Estimated from the previous edition. Check the official site.' : '',
    c.link
  ].filter(Boolean).join('\n');

  function buildICS(pairs) {
    const stamp = icsStamp(new Date());
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HCI and NLP deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:HCI and NLP deadlines'];
    for (const { c, d } of pairs) {
      L.push(
        'BEGIN:VEVENT',
        `UID:${c.id}-${slug(d.label)}-${+d.at}@hci-nlp-deadlines`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(new Date(+d.at - 3600e3))}`,
        `DTEND:${icsStamp(d.at)}`,
        `SUMMARY:${icsEsc(summaryOf(c, d))}`,
        `DESCRIPTION:${icsEsc(detailsOf(c, d))}`
      );
      if (c.link) L.push(`URL:${c.link}`);
      for (const trigger of ['-P7D', '-P1D']) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(summaryOf(c, d))}`, `TRIGGER:${trigger}`, 'END:VALARM');
      }
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function gcalUrl(c, d) {
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: summaryOf(c, d),
      dates: `${icsStamp(new Date(+d.at - 3600e3))}/${icsStamp(d.at)}`,
      details: detailsOf(c, d)
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  // ── Live updates ─────────────────────────────────────────────────────
  function tick() {
    const now = Date.now();
    let crossed = false;
    $$('[data-at]').forEach((el) => {
      const ms = Number(el.dataset.at) - now;
      if (ms <= 0) { crossed = true; return; }
      el.innerHTML = cdHTML(ms, el.dataset.mode);
    });
    if (crossed) render();
  }

  // ── Events ───────────────────────────────────────────────────────────
  function wire() {
    $$('.seg button').forEach((b) => b.addEventListener('click', () => {
      state.field = b.dataset.field;
      store.set('field', state.field);
      render();
    }));
    $('#q').addEventListener('input', (e) => { state.query = e.target.value; render(); });
    $('#tracks').addEventListener('change', (e) => { state.tracks = e.target.checked; store.set('tracks', state.tracks); render(); });
    $('#starred').addEventListener('change', (e) => { state.starredOnly = e.target.checked; store.set('starredOnly', state.starredOnly); render(); });

    $('#ics-all').addEventListener('click', () => {
      const now = new Date();
      const pairs = [];
      state.confs.filter(matches).forEach((c) => relevant(c).filter((d) => d.at > now).forEach((d) => pairs.push({ c, d })));
      pairs.sort((a, b) => a.d.at - b.d.at);
      if (pairs.length) download('hci-nlp-deadlines.ics', buildICS(pairs));
    });

    $('#list').addEventListener('click', (e) => {
      const starBtn = e.target.closest('[data-star]');
      if (starBtn) {
        const id = starBtn.dataset.star;
        if (state.stars.has(id)) state.stars.delete(id); else state.stars.add(id);
        store.set('stars', [...state.stars]);
        const on = state.stars.has(id);
        starBtn.setAttribute('aria-pressed', String(on));
        starBtn.title = on ? 'Unstar' : 'Star';
        if (state.starredOnly) render();
        return;
      }
      const icsBtn = e.target.closest('[data-ics]');
      if (icsBtn) {
        const c = state.confs.find((x) => x.id === icsBtn.dataset.ics);
        const now = new Date();
        const pairs = c ? relevant(c).filter((d) => d.at > now).map((d) => ({ c, d })) : [];
        if (pairs.length) download(`${c.id}.ics`, buildICS(pairs));
        return;
      }
      if (e.target.closest('[data-reset]')) {
        state.field = 'all'; state.query = ''; state.starredOnly = false;
        $('#q').value = '';
        store.set('field', 'all'); store.set('starredOnly', false);
        render();
      }
    });

    // Remember which "All dates" panels and groups are open across re-renders.
    $('#list').addEventListener('toggle', (e) => {
      const t = e.target;
      if (t.matches('.row-more')) { if (t.open) state.openMore.add(t.dataset.id); else state.openMore.delete(t.dataset.id); }
      if (t.matches('.group')) { if (t.open) state.openGroups.add(t.dataset.group); else state.openGroups.delete(t.dataset.group); }
    }, true);

    // Jumping from the timeline into a closed group opens it first.
    window.addEventListener('hashchange', revealTarget);

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        $('#q').focus();
      }
    });

    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutTimeline); });
  }

  function revealTarget() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    const group = el && el.closest('details.group');
    if (group && !group.open) { group.open = true; el.scrollIntoView(); }
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  async function load() {
    wire();
    $('#tz-name').textContent = userTz;
    try {
      if (!window.jsyaml) throw new Error('The YAML parser (js-yaml) did not load, so check your connection or the script tag in index.html.');
      const res = await fetch(SITE.dataUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Fetching ${SITE.dataUrl} returned HTTP ${res.status}.`);
      const doc = window.jsyaml.load(await res.text(), { schema: window.jsyaml.CORE_SCHEMA });
      const list = Array.isArray(doc) ? doc : (doc && doc.conferences) || [];
      state.updated = doc && doc.updated ? String(doc.updated) : '';
      const seen = new Map();
      state.confs = list.map(normalize).map((c) => {
        const n = (seen.get(c.id) || 0) + 1;
        seen.set(c.id, n);
        if (n > 1) c.id = `${c.id}-${n}`;
        return c;
      });
    } catch (err) {
      $('#next').className = 'next is-empty';
      $('#next').innerHTML = '<p class="next-kicker">Next deadline</p><p class="next-name">Unavailable</p>';
      $('#list').innerHTML = `<div class="error"><p><strong>The conference list didn’t load.</strong> ${esc(err.message)}</p>
        <p>If you opened <code>index.html</code> directly from your disk, your browser blocks reading the data file. Run <code>python3 -m http.server</code> in this folder and open <code>http://localhost:8000</code>, or publish the folder with GitHub Pages.</p></div>`;
      return;
    }
    render();
    renderFoot();
    revealTarget();
    setInterval(tick, 1000);
  }

  load();
})();
