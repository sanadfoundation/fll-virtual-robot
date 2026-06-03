'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function attach(app, doc, opts) {
    opts = opts || {};
    const storage = opts.storage || global.localStorage;

    const modal      = doc.getElementById('mission-library-modal');
    const backdrop   = doc.getElementById('mission-library-backdrop');
    const closeBtn   = doc.getElementById('btn-library-close');
    const newBtn     = doc.getElementById('btn-library-new');
    const importBtn  = doc.getElementById('btn-library-import');
    const fileInput  = doc.getElementById('library-file-input');
    const rail       = doc.getElementById('library-rail');
    const grid       = doc.getElementById('library-grid');
    const empty      = doc.getElementById('library-empty');
    const countBadge = doc.getElementById('library-count-badge');

    if (!modal) return;

    // Start hidden
    modal.hidden = true;

    let currentSource = 'all';

    function close() { modal.hidden = true; }
    function isOpen() { return !modal.hidden; }

    async function open() {
      modal.hidden = false;
      await refresh();
    }

    if (backdrop) backdrop.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    if (rail) {
      rail.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest && ev.target.closest('.library-rail-btn');
        if (!btn) return;
        currentSource = btn.getAttribute('data-source') || 'all';
        for (const b of rail.querySelectorAll('.library-rail-btn')) {
          b.classList.toggle('active', b === btn);
        }
        refresh();
      });
    }

    if (newBtn) {
      newBtn.addEventListener('click', () => {
        close();
        app.enterEditor();
      });
    }

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (ev) => {
        const file = ev.target && ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const { mission, screenshot } = await MISSIONS.editor.io.readBundle(new Uint8Array(buf));
          const dataUrl = await _bytesToPngDataUrl(screenshot);
          MISSIONS.library.saveImportedMission(storage, mission, dataUrl);
          refresh();
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('library: import failed', e);
        }
        fileInput.value = '';
      });
    }

    async function _bytesToPngDataUrl(bytes) {
      if (!bytes) return null;
      if (typeof global.Blob !== 'function' || typeof global.FileReader !== 'function') return null;
      return await new Promise((resolve) => {
        const blob = new global.Blob([bytes], { type: 'image/png' });
        const fr = new global.FileReader();
        fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    }

    async function _getAllForSource(source) {
      const out = { bundled: [], mine: [], imported: [] };
      if (source === 'all' || source === 'bundled') {
        try {
          const missions = await MISSIONS.library.loadAllBundled();
          for (const m of missions) {
            out.bundled.push({ mission: m, screenshot: null, source: 'bundled' });
          }
        } catch (_e) { /* manifest fetch may fail; show empty bundled */ }
      }
      if (source === 'all' || source === 'mine') {
        const mine = MISSIONS.library.readUserMissions(storage);
        for (const entry of mine) {
          out.mine.push({ mission: entry.mission, screenshot: entry.screenshot, source: 'mine' });
        }
      }
      if (source === 'all' || source === 'imported') {
        const imp = MISSIONS.library.readImportedMissions(storage);
        for (const entry of imp) {
          out.imported.push({ mission: entry.mission, screenshot: entry.screenshot, source: 'imported' });
        }
      }
      return out;
    }

    async function refresh() {
      if (!grid) return;
      grid.innerHTML = '';
      const all = await _getAllForSource('all');
      const counts = {
        all:      all.bundled.length + all.mine.length + all.imported.length,
        bundled:  all.bundled.length,
        mine:     all.mine.length,
        imported: all.imported.length,
      };

      if (countBadge) {
        countBadge.textContent = `${counts.all} MISSION${counts.all === 1 ? '' : 'S'}`;
      }
      const railEl = (id) => doc.getElementById(id);
      if (railEl('rail-count-all'))      railEl('rail-count-all').textContent      = String(counts.all);
      if (railEl('rail-count-bundled'))  railEl('rail-count-bundled').textContent  = String(counts.bundled);
      if (railEl('rail-count-mine'))     railEl('rail-count-mine').textContent     = String(counts.mine);
      if (railEl('rail-count-imported')) railEl('rail-count-imported').textContent = String(counts.imported);

      let visible;
      if (currentSource === 'all')           visible = [...all.bundled, ...all.mine, ...all.imported];
      else if (currentSource === 'bundled')  visible = all.bundled;
      else if (currentSource === 'mine')     visible = all.mine;
      else if (currentSource === 'imported') visible = all.imported;
      else visible = [];

      if (visible.length === 0) {
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;

      for (const entry of visible) {
        grid.appendChild(renderCard(entry));
      }
    }

    function renderCard({ mission, screenshot, source }) {
      const card = doc.createElement('div');
      card.classList.add('library-card');

      // Thumbnail
      const thumb = doc.createElement('div');
      thumb.classList.add('library-card-thumb');
      if (screenshot) {
        const img = doc.createElement('img');
        img.src = screenshot;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        const noThumb = doc.createElement('div');
        noThumb.classList.add('no-thumb');
        noThumb.textContent = '🎯';
        thumb.appendChild(noThumb);
      }
      const tier = doc.createElement('span');
      tier.classList.add('library-card-tier', mission.difficulty_tier || 'beginner');
      tier.textContent = mission.difficulty_tier || 'beginner';
      thumb.appendChild(tier);
      const ribbon = doc.createElement('span');
      ribbon.classList.add('library-card-ribbon');
      ribbon.textContent = source === 'bundled' ? '⭐ Bundled'
                         : source === 'mine'    ? '👤 Mine'
                         : '📥 Imported';
      thumb.appendChild(ribbon);
      card.appendChild(thumb);

      // Meta
      const meta = doc.createElement('div');
      meta.classList.add('library-card-meta');

      const title = doc.createElement('div');
      title.classList.add('library-card-title');
      title.textContent = mission.title || '(untitled)';
      meta.appendChild(title);

      const authorEl = doc.createElement('div');
      authorEl.classList.add('library-card-author');
      const stepCount = (mission.steps || []).length;
      const totalPts  = (mission.steps || []).reduce((s, st) => s + (st.points || 0), 0);
      authorEl.textContent = `${mission.author || '—'} · ${stepCount} step${stepCount === 1 ? '' : 's'} · ${totalPts} pts`;
      meta.appendChild(authorEl);

      const mods = mission.modifiers;
      if (mods && (mods.poke && mods.poke.enabled || mods.friction && mods.friction.enabled)) {
        const modsRow = doc.createElement('div');
        modsRow.classList.add('library-card-modifiers');
        if (mods.poke && mods.poke.enabled) {
          const chip = doc.createElement('span');
          chip.classList.add('library-card-mod-badge', 'mod-poke');
          chip.textContent = `👉 Poke · ${mods.poke.severity}`;
          modsRow.appendChild(chip);
        }
        if (mods.friction && mods.friction.enabled) {
          const chip = doc.createElement('span');
          chip.classList.add('library-card-mod-badge', 'mod-friction');
          chip.textContent = `≈ Friction · ${mods.friction.multiplier}×`;
          modsRow.appendChild(chip);
        }
        meta.appendChild(modsRow);
      }

      // Stars
      const stars = doc.createElement('div');
      stars.classList.add('library-card-stars');
      const best = MISSIONS.persistence && MISSIONS.persistence.getBest
        ? MISSIONS.persistence.getBest(storage, mission.id) : null;
      const litCount = best && best.stars ? best.stars : 0;
      for (let i = 0; i < 3; i++) {
        const s = doc.createElement('span');
        s.textContent = '★';
        if (i < litCount) s.classList.add('lit');
        stars.appendChild(s);
      }
      meta.appendChild(stars);

      // Actions
      const actions = doc.createElement('div');
      actions.classList.add('library-card-actions');

      const editBtn = doc.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('type', 'button');
      editBtn.addEventListener('click', () => {
        close();
        app.enterEditor(mission);
      });
      actions.appendChild(editBtn);

      if (source !== 'bundled') {
        const delBtn = doc.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.classList.add('delete-btn');
        delBtn.setAttribute('type', 'button');
        delBtn.setAttribute('title', `Delete from ${source === 'mine' ? 'My Missions' : 'Imported'}`);
        delBtn.addEventListener('click', () => {
          if (source === 'mine') MISSIONS.library.deleteUserMission(storage, mission.id);
          else if (source === 'imported') MISSIONS.library.deleteImportedMission(storage, mission.id);
          refresh();
        });
        actions.appendChild(delBtn);
      }

      const playBtn = doc.createElement('button');
      playBtn.classList.add('play-btn');
      playBtn.textContent = '▶ Play';
      playBtn.setAttribute('type', 'button');
      playBtn.addEventListener('click', () => {
        close();
        app.enterPlay(mission);
      });
      actions.appendChild(playBtn);

      meta.appendChild(actions);
      card.appendChild(meta);
      return card;
    }

    return { open, close, isOpen, refresh };
  }

  MISSIONS.libraryUi = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
