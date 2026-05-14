/* ============================================================
   ui.js — Shared behaviour for all adventure pages.
   Add new interactive features here. Keep this file focused
   on UI behaviour — no content, no styles.
   ============================================================ */

(function () {
  'use strict';

  // ── SIDEBAR: active link tracking via IntersectionObserver ──
  const sections = document.querySelectorAll('.section[id]');
  const navLinks = document.querySelectorAll('#sidebar nav a');

  if (sections.length && navLinks.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('active'));
          const link = document.querySelector(
            `#sidebar nav a[href="#${entry.target.id}"]`
          );
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(s => observer.observe(s));
  }

  // ── SIDEBAR: smooth scroll on nav click ──
  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── PURCHASE / SOURCE LINKS ──
  // Reads window.AdventureLinks (set by each adventure's links.js).
  // Applies low-res swap + blur to ALL uses of a marked image across the page,
  // not just the named container. Also adds a source badge to named containers.
  if (window.AdventureLinks) {
    // Build a map of original filename → info for low-res lookup
    // e.g. "boss-room.jpg" → { lowres, lowresSrc, url, credit }
    const byFilename = new Map();
    Object.entries(window.AdventureLinks).forEach(([id, info]) => {
      if (info.lowres && info.lowresSrc) {
        const srcNoQuery = info.lowresSrc.split('?')[0];
        const ext        = srcNoQuery.match(/\.[^.]+$/)?.[0] || '.jpg';
        const original   = srcNoQuery.replace(`-lowres${ext}`, ext);
        const filename   = original.split('/').pop();
        byFilename.set(filename, info);
      }
    });

    // For low-res gallery items: flag for lightbox handler
    document.querySelectorAll('[data-src]').forEach(el => {
      const filename = el.dataset.src.split('/').pop();
      const info = byFilename.get(filename);
      if (!info) return;
      el.dataset.isLowres = 'true';
      if (info.url) el.dataset.lowresUrl = info.url;
    });

    // Apply low-res to every <img> whose src filename matches
    document.querySelectorAll('img').forEach(img => {
      const filename = img.src.split('/').pop();
      const info = byFilename.get(filename);
      if (!info) return;

      const newSrc = img.src.replace(/images\/[^?]+$/, info.lowresSrc);
      console.log('[lowres] swapping', img.src, '→', newSrc);
      img.src = newSrc;
      img.classList.add('img-lowres');

      // Make the image itself open the purchase URL on click
      if (info.url) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', e => {
          e.stopPropagation();
          window.open(info.url, '_blank', 'noopener,noreferrer');
        });
      }

      // Wrap closest container-like parent for badge + hover class
      const wrap = img.closest('.image-container, .gallery-item, .npc-card') || img.parentElement;
      if (wrap) {
        wrap.classList.add('container-lowres');
        if (info.url && !wrap.querySelector('.purchase-badge')) {
          const badge = document.createElement('a');
          badge.className = 'purchase-badge';
          badge.href = info.url;
          badge.target = '_blank';
          badge.rel = 'noopener noreferrer';
          badge.textContent = info.credit ? `Buy full art: ${info.credit} \u2197` : 'Buy full art \u2197';
          wrap.style.position = 'relative';
          wrap.appendChild(badge);
        }
      }
    });

    // Also handle named containers for source-only badges (lowres: false but has url)
    Object.entries(window.AdventureLinks).forEach(([id, info]) => {
      if (info.lowres || !info.url) return;
      const container = document.querySelector(`[data-link-id="${id}"]`);
      if (!container) return;
      const badge = document.createElement('a');
      badge.className = 'purchase-badge';
      badge.href = info.url;
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.textContent = info.credit ? `Source: ${info.credit} \u2197` : 'Source \u2197';
      container.appendChild(badge);
    });

    // \u2500\u2500 ART CREDITS SECTION \u2500\u2500
    const creditsBody = document.querySelector('#art-credits .section-body');
    if (creditsBody) {
      const entries = Object.values(window.AdventureLinks).filter(info => info.url);
      if (entries.length) {
        const table = document.createElement('table');
        table.className = 'styled-table';
        table.innerHTML = '<thead><tr><th>Preview</th><th>Image</th><th>Artist</th><th>Link</th></tr></thead>';
        const tbody = document.createElement('tbody');
        entries.forEach(info => {
          const srcNoQuery = (info.lowresSrc || '').split('?')[0];
          const filename   = srcNoQuery.split('/').pop().replace(/-lowres\.[^.]+$/, '').replace(/-/g, ' ');
          const label      = filename.replace(/\b\w/g, c => c.toUpperCase());
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><img src="${info.lowresSrc || ''}" alt="${label}" style="height:48px;width:auto;border-radius:3px;display:block;"></td>
            <td>${label}</td>
            <td>${info.credit || '\u2014'}</td>
            <td><a href="${info.url}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">View / Buy \u2197</a></td>`;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        creditsBody.appendChild(table);
      } else {
        creditsBody.innerHTML = '<p>No external art sources recorded for this adventure.</p>';
      }
    }
  }

  // ── IMAGE REVEAL: toggle show/hide for location art ──
  // Works on any element with class .image-reveal containing
  // a .image-toggle button and a .image-container.
  document.querySelectorAll('.image-reveal').forEach(reveal => {
    const btn = reveal.querySelector('.image-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = reveal.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });

  // ── IMAGE HOVER PREVIEW ──
  // Hovering any small/modified image shows a floating full-size version.
  let activeImgPreview = null;
  let imgPreviewTimer  = null;

  function scheduleImgPreviewHide() {
    imgPreviewTimer = setTimeout(() => {
      if (activeImgPreview) { activeImgPreview.remove(); activeImgPreview = null; }
    }, 120);
  }
  function cancelImgPreviewHide() { clearTimeout(imgPreviewTimer); }

  document.querySelectorAll('.npc-img, .img-float').forEach(img => {
    img.addEventListener('mouseenter', e => {
      cancelImgPreviewHide();
      if (activeImgPreview) { activeImgPreview.remove(); }
      const preview = document.createElement('div');
      preview.className = 'img-hover-preview';
      const full = document.createElement('img');
      full.src = img.src;
      full.alt = img.alt;
      preview.appendChild(full);
      document.body.appendChild(preview);
      activeImgPreview = preview;
      positionTooltip(preview, e);
    });

    img.addEventListener('mousemove', e => {
      if (activeImgPreview) positionTooltip(activeImgPreview, e);
    });

    img.addEventListener('mouseleave', () => {
      if (activeImgPreview) scheduleImgPreviewHide();
    });
  });

  document.addEventListener('mouseover', e => {
    if (e.target.closest('.img-hover-preview')) cancelImgPreviewHide();
  });
  document.addEventListener('mouseout', e => {
    if (!activeImgPreview) return;
    if (!e.target.closest('.img-hover-preview')) return;
    if (e.relatedTarget?.closest('.img-hover-preview, .npc-img, .img-float')) return;
    scheduleImgPreviewHide();
  });

  // ── STATBLOCK RENDERER (reads window.AdventureCreatures) ──
  // Must run before wiki-link hover preview setup so the replaced DOM nodes
  // already exist when event listeners are attached below.
  (function renderCreatures() {
    const creatures = window.AdventureCreatures;
    if (!creatures || !creatures.length) return;

    // Helper fns
    const cap  = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const sl   = s => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const fmtSaves = arr => !arr || !arr.length ? '' :
      arr.map(o => { const [k,v] = Object.entries(o)[0]; return `${cap(k.slice(0,3))} ${v}`; }).join(', ');
    const fmtSkills = arr => !arr || !arr.length ? '' :
      arr.map(o => `${sl(o.name||'')} ${o.desc||''}`.trim()).join(', ');
    const fmtActions = arr => !arr || !arr.length ? '' :
      arr.map(o => `<div class="sb-action"><span class="sb-action-name">${o.name||''}.</span> ${sl(o.desc||'')}</div>`).join('');

    function sbHtml(d) {
      if (!d) return '';
      const typeLine = [cap(d.size||''), (d.type||'') + (d.subtype ? ` (${d.subtype})` : ''), d.alignment||''].filter(Boolean).join(', ');
      const ac  = d.ac || '—';
      const acC = d.ac_class ? ` (${sl(d.ac_class)})` : '';
      const hp  = d.hp || '—';
      const hd  = d.hit_dice ? ` (${d.hit_dice})` : '';
      const ABILS = ['STR','DEX','CON','INT','WIS','CHA'];
      const stats = (d.stats || [10,10,10,10,10,10]).map(s => parseInt(s,10));
      const abils = ABILS.map((a,i) => {
        const sc = stats[i]||10, mod = Math.floor((sc-10)/2);
        return `<div class="sb-ability"><span>${a}</span><span>${sc} (${mod>=0?'+'+mod:mod})</span></div>`;
      }).join('');
      const saves  = fmtSaves(d.saves);
      const skills = fmtSkills(d.skillsaves);
      const props2 = [
        saves  ? `<div class="sb-prop"><span class="sb-prop-label">Saving Throws</span> ${saves}</div>` : '',
        skills ? `<div class="sb-prop"><span class="sb-prop-label">Skills</span> ${skills}</div>` : '',
        d['damage-resistances']  ? `<div class="sb-prop"><span class="sb-prop-label">Damage Resistances</span> ${d['damage-resistances']}</div>` : '',
        d['damage-immunities']   ? `<div class="sb-prop"><span class="sb-prop-label">Damage Immunities</span> ${d['damage-immunities']}</div>` : '',
        d['condition-immunities']? `<div class="sb-prop"><span class="sb-prop-label">Condition Immunities</span> ${d['condition-immunities']}</div>` : '',
        d.senses    ? `<div class="sb-prop"><span class="sb-prop-label">Senses</span> ${d.senses}</div>` : '',
        d.languages ? `<div class="sb-prop"><span class="sb-prop-label">Languages</span> ${d.languages}</div>` : '',
        d.cr        ? `<div class="sb-prop"><span class="sb-prop-label">Challenge</span> ${d.cr}</div>` : '',
      ].join('');
      const traits  = fmtActions(d.traits);
      const actions = fmtActions(d.actions);
      const bonus   = d['bonus-actions'] ? `<div class="sb-section-title">Bonus Actions</div>${fmtActions(d['bonus-actions'])}` : '';
      const react   = d.reactions       ? `<div class="sb-section-title">Reactions</div>${fmtActions(d.reactions)}`       : '';
      const leg     = d['legendary-actions'] ? `<div class="sb-section-title">Legendary Actions</div>${fmtActions(d['legendary-actions'])}` : '';
      const lore    = d._lore ? `<div class="sb-lore"><p>${d._lore.trim().replace(/\n\n+/g,'</p><p>')}</p></div>` : '';
      return `<div class="statblock">
  <div class="sb-name">${d.name||'Unknown'}</div>
  <div class="sb-type">${typeLine}</div>
  <hr class="sb-divider">
  <div class="sb-props">
    <div class="sb-prop"><span class="sb-prop-label">Armor Class</span> ${ac}${acC}</div>
    <div class="sb-prop"><span class="sb-prop-label">Hit Points</span> ${hp}${hd}</div>
    <div class="sb-prop"><span class="sb-prop-label">Speed</span> ${d.speed||'—'}</div>
  </div>
  <div class="sb-abilities">${abils}</div>
  <hr class="sb-divider">
  <div class="sb-props">${props2}</div>
  ${traits  ? `<hr class="sb-divider">${traits}` : ''}
  ${actions ? `<div class="sb-section-title">Actions</div>${actions}` : ''}
  ${bonus}${react}${leg}
</div>${lore}`;
    }

    // Expose sbHtml for the combat tracker hover popup
    window._sbHtml = sbHtml;

    // Replace build-generated monster entries in the Misc section
    document.querySelectorAll('.misc-tag-monster').forEach(tag => tag.closest('.misc-entry')?.remove());

    const miscBody = document.querySelector('#misc .section-body');
    if (miscBody) {
      const frag = document.createDocumentFragment();
      [...creatures].reverse().forEach(c => {
        const entry = document.createElement('details');
        entry.className = 'misc-entry';
        entry.id = `misc-${(c.name||'').replace(/[^a-z0-9]/gi,'-').toLowerCase()}`;
        entry.dataset.previewTitle = c.name || '';
        entry.dataset.previewBody  = `${cap(c.size||'')} ${c.type||''}, CR ${c.cr||'?'}`.trim();
        entry.innerHTML = `<summary class="misc-summary"><span class="misc-tag misc-tag-monster">Monster</span> ${c.name||''}</summary><div class="misc-content">${sbHtml(c)}</div>`;
        frag.prepend ? frag.appendChild(entry) : frag.appendChild(entry);
      });
      miscBody.insertBefore(frag, miscBody.firstChild);
    }
  })();

  // ── WIKI LINK HOVER PREVIEW ──
  // Reads data-preview-title and data-preview-body from the target misc-entry.
  // Shows a floating tooltip on mouseenter, removes on mouseleave.
  let activeTooltip = null;
  let tooltipHideTimer = null;

  function scheduleTooltipHide() {
    tooltipHideTimer = setTimeout(() => {
      if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
    }, 120);
  }

  function cancelTooltipHide() { clearTimeout(tooltipHideTimer); }

  // Delegated — works on any a.wiki-link added to the DOM at any time
  document.addEventListener('mouseover', e => {
    const link = e.target.closest('a.wiki-link[href]');
    if (link) {
      cancelTooltipHide();
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;

      const title     = target.dataset.previewTitle || target.querySelector('.sb-name, .npc-name, h2')?.textContent || href.slice(1);
      const tag       = target.querySelector('.misc-tag')?.textContent?.trim() || '';
      const contentEl = target.querySelector('.misc-content');

      if (activeTooltip) activeTooltip.remove();
      activeTooltip = document.createElement('div');
      activeTooltip.className = 'link-preview';
      activeTooltip.innerHTML =
        `<div class="lp-header"><span class="lp-title">${escapeHtml(title)}</span>${tag ? `<span class="lp-tag">${escapeHtml(tag)}</span>` : ''}</div>` +
        (contentEl ? `<div class="lp-content">${contentEl.innerHTML}</div>` : '');
      document.body.appendChild(activeTooltip);
      positionTooltip(activeTooltip, e);
      return;
    }
    if (e.target.closest('.link-preview')) cancelTooltipHide();
  });

  document.addEventListener('mousemove', e => {
    if (activeTooltip && e.target.closest('a.wiki-link[href]')) positionTooltip(activeTooltip, e);
  });

  document.addEventListener('mouseout', e => {
    if (!activeTooltip) return;
    const leavingLink    = e.target.closest('a.wiki-link[href]');
    const leavingTooltip = e.target.closest('.link-preview');
    if (!leavingLink && !leavingTooltip) return;
    if (e.relatedTarget?.closest('.link-preview, a.wiki-link[href]')) return;
    scheduleTooltipHide();
  });

  function positionTooltip(el, e) {
    const margin = 14;
    // Temporarily make it visible off-screen to measure size
    el.style.left = '-9999px';
    el.style.top  = '0';
    const w  = el.offsetWidth;
    const h  = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = e.clientX + margin;
    let y = e.clientY + margin;

    if (x + w > vw - margin) x = e.clientX - w - margin;
    if (y + h > vh - margin) y = e.clientY - h - margin;
    if (y < margin)           y = margin;

    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
  }

  // ── GAME TERM TOOLTIPS ──
  if (window.DndTerms) {
    const { SPELLS, CONDITIONS, CREATURES } = window.DndTerms;

    // Build name → {type, key} map
    const nameMap = new Map();
    Object.entries(SPELLS).forEach(([key, d])      => nameMap.set(d[0].toLowerCase(), { type: 'spell',     key }));
    Object.entries(CONDITIONS).forEach(([key, d])  => nameMap.set(d[0].toLowerCase(), { type: 'condition', key }));
    Object.entries(CREATURES).forEach(([key, d])   => nameMap.set(d[0].toLowerCase(), { type: 'creature',  key }));

    // Sort longest-first so "Greater Invisibility" matches before "Invisibility"
    const sorted = [...nameMap.keys()].sort((a, b) => b.length - a.length);
    const esc    = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const TERM_RE = new RegExp('\\b(' + sorted.map(esc).join('|') + ')\\b', 'gi');

    // Scope: mechanical containers + table cells (for puzzle/encounter tables)
    const SCOPE = '.sb-action, .sb-props, .stat-block, .ba-text, .styled-table td';

    function wrapTerms(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p || p.closest('.game-term, a')) return NodeFilter.FILTER_REJECT;
          if (!node.textContent.trim())          return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach(node => {
        TERM_RE.lastIndex = 0;
        if (!TERM_RE.test(node.textContent)) return;
        TERM_RE.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = TERM_RE.exec(node.textContent)) !== null) {
          const term = nameMap.get(m[1].toLowerCase());
          if (!term) continue;
          if (m.index > last) frag.appendChild(document.createTextNode(node.textContent.slice(last, m.index)));
          const span = document.createElement('span');
          span.className = 'game-term game-term--' + term.type;
          span.dataset.termKey  = term.key;
          span.dataset.termType = term.type;
          span.textContent = m[1];
          frag.appendChild(span);
          last = m.index + m[1].length;
        }
        if (last < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(last)));
        TERM_RE.lastIndex = 0;
        if (frag.childNodes.length > 1 || frag.firstChild?.nodeType !== Node.TEXT_NODE) {
          node.parentNode.replaceChild(frag, node);
        }
      });
    }

    document.querySelectorAll(SCOPE).forEach(wrapTerms);

    // Tooltip
    let activeTip = null;
    let tipHideTimer = null;

    function scheduleTipHide() {
      tipHideTimer = setTimeout(() => {
        if (activeTip) { activeTip.remove(); activeTip = null; }
      }, 120);
    }

    function cancelTipHide() { clearTimeout(tipHideTimer); }

    function showTermTip(span, e) {
      cancelTipHide();
      if (activeTip) { activeTip.remove(); activeTip = null; }
      const { termKey, termType } = span.dataset;
      const data = termType === 'spell' ? SPELLS[termKey] : termType === 'condition' ? CONDITIONS[termKey] : CREATURES[termKey];
      if (!data) return;

      activeTip = document.createElement('div');
      activeTip.className = 'term-tooltip';

      if (termType === 'creature') {
        activeTip.innerHTML =
          '<div class="tt-header"><span class="tt-name">' + escapeHtml(data[0]) + '</span>' +
          '<span class="tt-badge tt-badge--creature">Creature</span></div>' +
          '<div class="tt-meta">' + escapeHtml(data[1]) + '</div>' +
          '<div class="tt-body">' + escapeHtml(data[2]) + '</div>';
      } else if (termType === 'spell') {
        activeTip.innerHTML =
          '<div class="tt-header"><span class="tt-name">' + escapeHtml(data[0]) + '</span>' +
          '<span class="tt-badge tt-badge--spell">Spell</span></div>' +
          '<div class="tt-meta">' + escapeHtml(data[1]) + '</div>' +
          '<div class="tt-props">' +
            '<span>⏱ ' + escapeHtml(data[2]) + '</span>' +
            '<span>📍 ' + escapeHtml(data[3]) + '</span>' +
            '<span>🔮 ' + escapeHtml(data[4]) + '</span>' +
            '<span>⌛ ' + escapeHtml(data[5]) + '</span>' +
          '</div>' +
          '<div class="tt-body">' + escapeHtml(data[6]) + '</div>';
      } else {
        activeTip.innerHTML =
          '<div class="tt-header"><span class="tt-name">' + escapeHtml(data[0]) + '</span>' +
          '<span class="tt-badge tt-badge--condition">Condition</span></div>' +
          '<div class="tt-body tt-body--pre">' + escapeHtml(data[1]) + '</div>';
      }

      document.body.appendChild(activeTip);
      positionTooltip(activeTip, e);
    }

    // mouseover bubbles — reliable for delegation unlike mouseenter
    document.addEventListener('mouseover', e => {
      const span = e.target.closest('.game-term');
      if (span) {
        cancelTipHide();
        if (activeTip && activeTip._span === span) return;
        showTermTip(span, e);
        if (activeTip) activeTip._span = span;
      } else if (e.target.closest('.term-tooltip')) {
        cancelTipHide();
      }
    });

    document.addEventListener('mousemove', e => {
      if (activeTip && e.target.closest('.game-term')) positionTooltip(activeTip, e);
    });

    document.addEventListener('mouseout', e => {
      if (!activeTip) return;
      if (!e.target.closest('.game-term') && !e.target.closest('.term-tooltip')) return;
      if (e.relatedTarget?.closest('.game-term, .term-tooltip')) return;
      scheduleTipHide();
    });
  }

  // ── GALLERY LIGHTBOX ──
  document.querySelectorAll('.gallery-item[data-src]').forEach(item => {
    item.addEventListener('click', () => {
      // Low-res images: open purchase link if available, otherwise block lightbox
      if (item.dataset.isLowres) {
        if (item.dataset.lowresUrl) {
          window.open(item.dataset.lowresUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      const src   = item.dataset.src;
      const label = item.dataset.label || '';

      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay';

      const img = document.createElement('img');
      img.src = src;
      img.alt = label;
      overlay.appendChild(img);

      if (label) {
        const cap = document.createElement('div');
        cap.className = 'lightbox-caption';
        cap.textContent = label;
        overlay.appendChild(cap);
      }

      overlay.addEventListener('click', () => overlay.remove());
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
      });

      document.body.appendChild(overlay);
    });
  });

  // ── NOTES PANEL ──
  const notesPanel = document.getElementById('notes-panel');
  if (notesPanel) {
    const advId = window.location.pathname.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const KEY   = `dm-notes-${advId}`;

    // ── Note Tabs ──
    const tabsBar     = document.getElementById('notes-tabs-bar');
    const tabTextarea = document.getElementById('notes-tab-textarea');

    if (tabsBar && tabTextarea) {
      const TABS_KEY   = `${KEY}-note-tabs`;
      const ACTIVE_KEY = `${KEY}-note-active`;
      const loadContent  = id  => localStorage.getItem(`${KEY}-note-tab-${id}`) || '';
      const saveContent  = (id, v) => localStorage.setItem(`${KEY}-note-tab-${id}`, v);
      const saveTabs     = () => localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
      const saveActiveId = id  => localStorage.setItem(ACTIVE_KEY, id);

      let tabs     = JSON.parse(localStorage.getItem(TABS_KEY) || 'null') || [{ id: 'default', name: 'Session' }];
      let activeId = localStorage.getItem(ACTIVE_KEY) || tabs[0].id;
      if (!tabs.find(t => t.id === activeId)) activeId = tabs[0].id;

      function switchTab(id) {
        saveContent(activeId, tabTextarea.value);
        activeId = id;
        saveActiveId(id);
        tabTextarea.value = loadContent(id);
        renderTabs();
      }

      function startRename(tab, nameEl) {
        const inp = document.createElement('input');
        inp.className = 'notes-tab-rename';
        inp.value = tab.name;
        nameEl.replaceWith(inp);
        inp.focus(); inp.select();
        const apply = () => { tab.name = inp.value.trim() || tab.name; saveTabs(); renderTabs(); };
        inp.addEventListener('blur', apply);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') renderTabs(); });
      }

      function renderTabs() {
        tabsBar.innerHTML = '';

        tabs.forEach(tab => {
          const pill = document.createElement('div');
          pill.className = `notes-tab-pill${tab.id === activeId ? ' active' : ''}`;

          const nameEl = document.createElement('span');
          nameEl.className = 'notes-tab-pill-name';
          nameEl.textContent = tab.name;
          nameEl.addEventListener('click', () => { if (tab.id !== activeId) switchTab(tab.id); });
          nameEl.addEventListener('dblclick', () => startRename(tab, nameEl));
          pill.appendChild(nameEl);

          if (tabs.length > 1) {
            const del = document.createElement('button');
            del.className = 'notes-tab-pill-del';
            del.textContent = '×';
            del.title = 'Delete tab';
            del.addEventListener('click', e => {
              e.stopPropagation();
              saveContent(activeId, tabTextarea.value);
              localStorage.removeItem(`${KEY}-note-tab-${tab.id}`);
              tabs = tabs.filter(t => t.id !== tab.id);
              saveTabs();
              if (activeId === tab.id) {
                activeId = tabs[0].id;
                saveActiveId(activeId);
                tabTextarea.value = loadContent(activeId);
              }
              renderTabs();
            });
            pill.appendChild(del);
          }

          tabsBar.appendChild(pill);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'notes-tab-add';
        addBtn.textContent = '+';
        addBtn.title = 'New tab';
        addBtn.addEventListener('click', () => {
          saveContent(activeId, tabTextarea.value);
          const id = `tab-${Date.now()}`;
          tabs.push({ id, name: 'New' });
          saveTabs();
          activeId = id;
          saveActiveId(id);
          tabTextarea.value = '';
          renderTabs();
          const newName = tabsBar.querySelector('.notes-tab-pill.active .notes-tab-pill-name');
          if (newName) startRename(tabs[tabs.length - 1], newName);
        });
        tabsBar.appendChild(addBtn);
      }

      tabTextarea.value = loadContent(activeId);
      tabTextarea.addEventListener('input', () => saveContent(activeId, tabTextarea.value));
      renderTabs();

      // ── Export Notes ──
      const notesHeader = notesPanel.querySelector('.notes-header');
      if (notesHeader) {
        const exportBtn = document.createElement('button');
        exportBtn.id = 'notes-export-btn';
        exportBtn.textContent = '↓ Export';
        exportBtn.title = 'Download all notes as a text file';
        exportBtn.addEventListener('click', () => {
          saveContent(activeId, tabTextarea.value);
          const title = document.querySelector('#sidebar-header .title')?.textContent?.trim() || 'Adventure';
          const date  = new Date().toLocaleDateString();
          let out = `DM Notes — ${title}\nExported: ${date}\n`;
          tabs.forEach(tab => {
            out += `\n${'─'.repeat(36)}\n${tab.name}\n${'─'.repeat(36)}\n`;
            out += loadContent(tab.id) || '(empty)';
            out += '\n';
          });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
          a.download = `dm-notes-${advId}.txt`;
          a.click();
        });
        notesHeader.appendChild(exportBtn);
      }
    }

    // ── Combat tracker ──
    const combatContainer = document.getElementById('notes-combat');
    const sbPopup         = document.getElementById('sb-popup');

    let sbHideTimer = null;
    const scheduleSbHide = () => { sbHideTimer = setTimeout(() => { if (sbPopup) sbPopup.style.display = 'none'; }, 150); };
    const cancelSbHide   = () => clearTimeout(sbHideTimer);

    if (sbPopup) {
      sbPopup.addEventListener('mouseenter', cancelSbHide);
      sbPopup.addEventListener('mouseleave', scheduleSbHide);
    }

    // Build combatant data from window.AdventureCreatures
    const combatants = [];
    (window.AdventureCreatures || []).forEach(c => {
      const name = c.name || 'Unknown';
      const slug = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const cKey = `${KEY}-combat-${slug}`;
      const ac    = String(c.ac || '—');
      const maxHp = parseInt(c.hp) || 0;

      // Build a detached DOM node for the hover popup
      const tmp = document.createElement('div');
      tmp.innerHTML = (window._sbHtml || (() => ''))(c);
      const sb = tmp.firstChild || tmp;

      const saved = JSON.parse(localStorage.getItem(cKey) || '{}');
      const resolvedAc    = saved.ac    !== undefined ? saved.ac    : ac;
      const resolvedMaxHp = saved.maxHp !== undefined ? saved.maxHp : maxHp;
      combatants.push({
        name, slug, sb, cKey,
        baseAc: ac, baseMaxHp: maxHp,
        ac:          resolvedAc,
        maxHp:       resolvedMaxHp,
        curHp:       saved.hp    !== undefined ? saved.hp    : resolvedMaxHp,
        init:        saved.init  !== undefined ? saved.init  : '',
        inCombat:    saved.inCombat  || false,
        displayName: saved.displayName || '',
      });
    });

    // ── Players ──
    const PLAYERS_KEY = `${KEY}-players`;
    let players = JSON.parse(localStorage.getItem(PLAYERS_KEY) || '[]');

    function savePlayers() {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    }

    function saveCombatant(c) {
      localStorage.setItem(c.cKey, JSON.stringify({
        hp: c.curHp, init: c.init, inCombat: c.inCombat,
        ac: c.ac, maxHp: c.maxHp, displayName: c.displayName,
      }));
    }

    function renderCombat() {
      if (!combatContainer) return;
      combatContainer.innerHTML = '';

      const all = [...combatants, ...players];
      const inCombat  = all.filter(c =>  c.inCombat).sort((a, b) => (Number(b.init) || 0) - (Number(a.init) || 0));
      const outCombat = combatants.filter(c => !c.inCombat);

      // ── Reset + Roll buttons ──
      const btnRow = document.createElement('div');
      btnRow.id = 'combat-btn-row';

      const resetAllBtn = document.createElement('button');
      resetAllBtn.id = 'combat-reset-all';
      resetAllBtn.textContent = '↺ Reset';
      resetAllBtn.addEventListener('click', () => {
        [...combatants, ...players].forEach(c => {
          c.inCombat = false; c.init = '';
          if (c.isPlayer) {
            c.curHp = c.maxHp;
          } else {
            c.ac = c.baseAc; c.maxHp = c.baseMaxHp;
            c.curHp = c.baseMaxHp; c.displayName = '';
            localStorage.removeItem(c.cKey);
          }
        });
        savePlayers();
        renderCombat();
      });

      const rollAllBtn = document.createElement('button');
      rollAllBtn.id = 'combat-roll-all';
      rollAllBtn.textContent = '🎲🎲 Roll Initiative';
      rollAllBtn.addEventListener('click', () => {
        [...combatants, ...players].filter(c => c.inCombat).forEach(c => {
          c.init = Math.floor(Math.random() * 20) + 1;
          if (c.isPlayer) savePlayers(); else saveCombatant(c);
        });
        renderCombat();
      });

      btnRow.appendChild(resetAllBtn);
      btnRow.appendChild(rollAllBtn);
      combatContainer.appendChild(btnRow);

      if (inCombat.length) {
        const header = document.createElement('div');
        header.className = 'combat-table-header';
        [null, 'Name', '♡', '⛨', ''].forEach((label, i) => {
          const cell = document.createElement('span');
          if (i === 0) {
            cell.className = 'combat-hdr-init';
            cell.innerHTML = '<span class="d1">⚄</span><span class="d2">⚄</span>';
          } else {
            cell.textContent = label;
          }
          header.appendChild(cell);
        });
        combatContainer.appendChild(header);
        inCombat.forEach(c => combatContainer.appendChild(buildCombatRow(c)));
      }

      // ── Roster ──
      const rosterHeader = document.createElement('div');
      rosterHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:0.8rem 0 0.4rem;';

      const rosterLabel = document.createElement('div');
      rosterLabel.className = 'notes-label';
      rosterLabel.style.margin = '0';
      rosterLabel.textContent = 'Roster';
      rosterHeader.appendChild(rosterLabel);

      const addPlayerBtn = document.createElement('button');
      addPlayerBtn.className = 'combat-add-player-btn';
      addPlayerBtn.textContent = '+ Player';
      addPlayerBtn.addEventListener('click', () => {
        players.push({ name: '', ac: '—', maxHp: 0, curHp: 0, init: '0', inCombat: true, isPlayer: true, id: Date.now() });
        savePlayers();
        renderCombat();
      });
      rosterHeader.appendChild(addPlayerBtn);

      combatContainer.appendChild(rosterHeader);
      outCombat.forEach(c => combatContainer.appendChild(buildCombatRow(c)));
    }

    function buildCombatRow(c) {
      const save = () => c.isPlayer ? savePlayers() : saveCombatant(c);

      const row = document.createElement('div');
      row.className = `combat-row${c.inCombat ? ' in-combat' : ''}${c.isPlayer ? ' is-player' : ''}`;

      // ── Roster-only row (monster not in combat) ──
      if (!c.inCombat) {
        const addBtn = document.createElement('button');
        addBtn.className = 'combat-hp-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add to combat';
        addBtn.addEventListener('click', () => { c.inCombat = true; save(); renderCombat(); });
        row.appendChild(addBtn);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'combat-name';
        nameSpan.style.cssText = 'margin:0;cursor:default;flex:1;';
        nameSpan.textContent = c.name;
        nameSpan.addEventListener('mouseenter', e => {
          cancelSbHide();
          if (!sbPopup) return;
          const miscContent = document.querySelector(`#misc-${c.slug} .misc-content`);
          sbPopup.innerHTML = miscContent ? miscContent.innerHTML : c.sb.outerHTML;
          sbPopup.style.display = 'block';
          sbPopup.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
        });
        nameSpan.addEventListener('mouseleave', scheduleSbHide);
        row.appendChild(nameSpan);
        return row;
      }

      // ── In-combat row: grid [init | name | HP | AC] ──

      // Col 1: initiative
      const initInput = document.createElement('input');
      initInput.className = 'combat-init-input';
      initInput.type = 'number';
      initInput.placeholder = '0';
      initInput.value = c.init !== '' ? c.init : '0';
      initInput.title = 'Initiative';
      initInput.addEventListener('change', () => { c.init = initInput.value; save(); renderCombat(); });
      row.appendChild(initInput);

      // Col 2: name
      const nameCol = document.createElement('div');
      nameCol.className = 'combat-name-col';

      // Col 5 (end): remove button — listener attached below after player/monster branch
      const removeBtn = document.createElement('button');
      removeBtn.className = 'combat-remove-btn';
      removeBtn.textContent = '×';

      if (c.isPlayer) {
        const makeNameInput = () => {
          const inp = document.createElement('input');
          inp.className = 'combat-name-input';
          inp.placeholder = 'Player name';
          inp.value = c.name;
          inp.style.flex = '1';
          inp.addEventListener('input', () => { c.name = inp.value; save(); });
          inp.addEventListener('blur', () => { if (c.name.trim()) renderCombat(); });
          inp.addEventListener('keydown', e => { if (e.key === 'Enter' && c.name.trim()) renderCombat(); });
          return inp;
        };

        if (!c.name.trim()) {
          nameCol.appendChild(makeNameInput());
        } else {
          const nameText = document.createElement('span');
          nameText.className = 'combat-name-text';
          nameText.textContent = c.name;
          nameText.title = 'Click to rename';
          nameText.addEventListener('click', () => { const inp = makeNameInput(); nameText.replaceWith(inp); inp.focus(); });
          nameCol.appendChild(nameText);
        }

        removeBtn.title = 'Delete player';
        removeBtn.addEventListener('click', () => { players = players.filter(p => p.id !== c.id); savePlayers(); renderCombat(); });
      } else {
        const nameText = document.createElement('span');
        nameText.className = 'combat-name-text';
        nameText.textContent = c.displayName || c.name;
        nameText.title = 'Click to rename / hover for statblock';
        nameText.addEventListener('mouseenter', e => {
          cancelSbHide();
          if (!sbPopup) return;
          const miscContent = document.querySelector(`#misc-${c.slug} .misc-content`);
          sbPopup.innerHTML = miscContent ? miscContent.innerHTML : c.sb.outerHTML;
          sbPopup.style.display = 'block';
          sbPopup.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
        });
        nameText.addEventListener('mouseleave', scheduleSbHide);
        nameText.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.className = 'combat-name-input';
          inp.value = c.displayName || c.name;
          inp.style.flex = '1';
          nameText.replaceWith(inp);
          if (sbPopup) sbPopup.style.display = 'none';
          inp.focus();
          const apply = () => { c.displayName = inp.value.trim() || c.name; save(); renderCombat(); };
          inp.addEventListener('blur', apply);
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
        });
        nameCol.appendChild(nameText);
        removeBtn.title = 'Remove from combat';
        removeBtn.addEventListener('click', () => {
          c.inCombat = false; c.init = '';
          c.ac = c.baseAc; c.maxHp = c.baseMaxHp;
          c.curHp = c.baseMaxHp; c.displayName = '';
          localStorage.removeItem(c.cKey);
          save(); renderCombat();
        });
      }

      row.appendChild(nameCol);

      // Col 3: HP  (editable current / click-max to edit)
      const hpClass = () => c.curHp <= 0 ? 'hp-dead' : c.curHp < c.maxHp * 0.3 ? 'hp-low' : '';

      const hpCol = document.createElement('div');
      hpCol.className = 'combat-hp-col';

      const curHpDisplay = document.createElement('span');
      const refreshHpDisplay = () => {
        curHpDisplay.textContent = c.curHp;
        curHpDisplay.className = `combat-cur-hp-display ${hpClass()}`;
      };
      refreshHpDisplay();
      curHpDisplay.title = 'Click to apply damage / healing';
      curHpDisplay.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'combat-cur-hp-input';
        inp.placeholder = 'dmg';
        inp.title = 'Positive = damage, negative = heal. Enter to apply.';
        curHpDisplay.replaceWith(inp);
        inp.focus();
        let applied = false;
        const apply = () => {
          if (applied) return;
          applied = true;
          const v = parseInt(inp.value);
          if (!isNaN(v)) { c.curHp = Math.max(0, c.curHp - v); save(); }
          inp.replaceWith(curHpDisplay);
          refreshHpDisplay();
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') { applied = true; inp.replaceWith(curHpDisplay); } });
        inp.addEventListener('blur', apply);
      });
      hpCol.appendChild(curHpDisplay);

      const hpSep = document.createElement('span');
      hpSep.textContent = '/';
      hpSep.className = 'combat-hp-sep';
      hpCol.appendChild(hpSep);

      const maxHpSpan = document.createElement('span');
      maxHpSpan.className = 'combat-max-hp';
      maxHpSpan.textContent = c.maxHp;
      maxHpSpan.title = 'Click to edit max HP';
      maxHpSpan.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'combat-cur-hp-input';
        inp.style.width = '30px';
        inp.value = c.maxHp;
        maxHpSpan.replaceWith(inp);
        inp.focus();
        const apply = () => {
          const v = parseInt(inp.value);
          if (!isNaN(v) && v > 0) { c.maxHp = v; if (c.curHp > v) c.curHp = v; }
          save(); renderCombat();
        };
        inp.addEventListener('blur', apply);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
      });
      hpCol.appendChild(maxHpSpan);
      row.appendChild(hpCol);

      // Col 4: AC (click to edit)
      const acSpan = document.createElement('span');
      acSpan.className = 'combat-ac-cell';
      acSpan.textContent = c.ac;
      acSpan.title = 'Click to edit AC';
      acSpan.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.className = 'combat-cur-hp-input';
        inp.style.width = '28px';
        inp.value = c.ac;
        acSpan.replaceWith(inp);
        inp.focus();
        const apply = () => { c.ac = inp.value || c.ac; save(); renderCombat(); };
        inp.addEventListener('blur', apply);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
      });
      row.appendChild(acSpan);
      row.appendChild(removeBtn);

      return row;
    }

    renderCombat();

    // ── Resizable panel ──
    const resizeHandle = document.getElementById('notes-resize-handle');
    const mainEl = document.getElementById('main');
    if (resizeHandle) {
      const WIDTH_KEY = `dm-notes-panel-width`;
      const MIN_W = 220;
      let resizing = false, maxW = MIN_W;

      const savedW = parseInt(localStorage.getItem(WIDTH_KEY));
      if (savedW && savedW >= MIN_W) notesPanel.style.width = savedW + 'px';

      resizeHandle.addEventListener('mousedown', e => {
        resizing = true;
        // Capture how far the panel can grow before its left edge hits the content's right edge
        maxW = mainEl
          ? window.innerWidth - mainEl.getBoundingClientRect().right
          : window.innerWidth - 310;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      document.addEventListener('mousemove', e => {
        if (!resizing) return;
        const w = Math.max(MIN_W, Math.min(maxW, window.innerWidth - e.clientX));
        notesPanel.style.width = w + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(WIDTH_KEY, parseInt(notesPanel.style.width));
      });
    }
  }

  // ── MOBILE PANEL TOGGLES ──
  const sidebarToggle  = document.getElementById('sidebar-toggle');
  const notesToggle    = document.getElementById('notes-toggle');
  const mobileBackdrop = document.getElementById('mobile-backdrop');
  const sidebar        = document.getElementById('sidebar');

  function closeMobilePanels() {
    if (sidebar)        sidebar.classList.remove('mobile-open');
    if (notesPanel)     notesPanel.classList.remove('mobile-open');
    if (mobileBackdrop) mobileBackdrop.classList.remove('active');
  }

  function openMobilePanel(panel) {
    closeMobilePanels();
    panel.classList.add('mobile-open');
    if (mobileBackdrop) mobileBackdrop.classList.add('active');
  }

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('mobile-open')) closeMobilePanels();
      else openMobilePanel(sidebar);
    });
  }

  if (notesToggle && notesPanel) {
    notesToggle.addEventListener('click', () => {
      if (notesPanel.classList.contains('mobile-open')) closeMobilePanels();
      else openMobilePanel(notesPanel);
    });
  }

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobilePanels);
  }

  // Auto-close sidebar after tapping a nav link on mobile
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 767) closeMobilePanels();
    });
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

})();
