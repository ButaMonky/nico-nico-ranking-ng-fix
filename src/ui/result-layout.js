  // Presentation only. Never starts AutoFill, creates Movies or requests metadata.
  var ResultLayout = (function() {
    const nativeSelector = '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])';
    const route = () => location.pathname + location.search;
    function detect(doc) {
      for (const card of doc.querySelectorAll(nativeSelector)) {
        const host = card.parentElement;
        if (host.classList.contains('d_grid')) return {mode:'tile', host};
        if (host.classList.contains('flex-d_column')) return {mode:'list', host};
      }
      return null;
    }
    function paint(card, mode) {
      if (card.dataset.nrnResultLayout === mode) return false;
      card.dataset.nrnResultLayout = mode;
      return true;
    }
    function refresh(root) {
      root._nrnBaselineRect = null;
      root.movieInfo.toggle.dataset.nrnPinned = 'false';
      root._scheduleMovieInfoTogglePin();
      root._syncMovieInfoReserve();
    }
    // Keep the existing MovieRoot and its model subscriptions when React replaces a card.
    function snapshot(root) {
      return {
        title: root.movieTitle?.elem || root.titleElem,
        classes: Array.from(root.elem.classList).filter(name => name.startsWith('nrn-')),
        nodes: [root._actionPane?.elem, root.movieInfo.elem, root.movieInfo.toggle]
          .filter(node => node && root.elem.contains(node))
      };
    }
    function reattach(root, elem, saved = snapshot(root)) {
      const title = saved.title;
      for (const name of saved.classes) elem.classList.add(name);
      root.elem = elem;
      const newTitle = root.titleElem;
      if (newTitle.parentNode && newTitle !== title) newTitle.replaceWith(title);
      saved.nodes.forEach(node => elem.appendChild(node));
      root.markMovieAnchor();
      root.id = root.movieId;
      root.openNewWindow = root.openNewWindow;
      refresh(root);
    }
    function create(page) {
      const scope = route();
      const injected = new Set();
      const snapshots = new WeakMap();
      let current = null;
      return {
        add(card) {
          injected.add(card);
          paint(card, detect(page.doc)?.mode || current?.mode || 'tile');
        },
        rememberState(elem) {
          if (!elem.classList.contains('nrn-parsed')) return;
          const root = page.movieRoots.find(root => root.elem === elem);
          if (!root) return;
          const saved = snapshots.get(root);
          if (!saved || elem.contains(saved.title)) snapshots.set(root, snapshot(root));
        },
        sync() {
          // Search/order/page navigation belongs to the existing navigation controller.
          if (route() !== scope) return;
          const next = detect(page.doc);
          if (!next) return;
          const changed = !current || current.mode !== next.mode || current.host !== next.host;
          current = next;
          const cards = Array.from(next.host.children).filter(card => card.matches(nativeSelector));
          const byId = new Map(cards.map(card => [card.getAttribute('data-decoration-video-id'), card]));
          for (const root of page.movieRoots) {
            if (injected.has(root.elem)) continue;
            const replacement = byId.get(root.movieId);
            const saved = root.elem.isConnected ? snapshots.get(root) : snapshot(root);
            const replacedContent = replacement === root.elem && saved && !root.elem.contains(saved.title);
            if (replacement && ((!root.elem.isConnected && !replacement.classList.contains('nrn-parsed')) || replacedContent)) {
              reattach(root, replacement, saved);
            }
            if (root.elem.isConnected) snapshots.set(root, snapshot(root));
          }
          for (const card of cards) paint(card, next.mode);
          // Retain the same nodes, order, hidden/overflow flags and bound listeners.
          for (const card of injected) {
            if (!card.isConnected) next.host.appendChild(card);
            paint(card, next.mode);
          }
          if (changed) for (const root of page.movieRoots) refresh(root);
        }
      };
    }
    const css = `
/* Native rows keep their site's horizontal structure and full available width. */
[data-nrn-result-layout="list"].nrn-parsed { align-self: stretch !important; }
[data-nrn-autofill="true"][data-nrn-result-layout="list"] {
  width: 100%; min-width: 0; max-width: none; container-type: normal;
}
[data-nrn-autofill="true"][data-nrn-result-layout="list"] > .nrn-card-body {
  display: grid; grid-template-columns: var(--sizes-thumbnail-l, 320px) minmax(0, 1fr);
  grid-template-rows: auto auto auto 1fr; column-gap: 16px; min-height: 0;
}
[data-nrn-result-layout="list"] .nrn-card-body > .nrn-thumb-anchor-wrap {
  grid-column: 1; grid-row: 1 / -1; align-self: start;
}
[data-nrn-result-layout="list"] .nrn-card-body > :not(.nrn-thumb-anchor-wrap) { grid-column: 2; }
[data-nrn-result-layout="list"] .nrn-card-body > .nrn-movie-title {
  height: auto; margin-top: 0; margin-bottom: 4px; font-size: 16px;
}
.nrn-card-description { display: none; }
[data-nrn-result-layout="list"] .nrn-card-description {
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; margin-bottom: 16px; font-size: 12px; color: #888;
}
/* Hide wins over site utility classes and every result layout. */
.nrn-hide { display: none !important; }
`;
    return {create, detect, css};
  })();
