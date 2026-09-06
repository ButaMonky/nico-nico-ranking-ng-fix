  var DetailUiTheme = (function() {
    var parseRgb = function(value) {
      var m = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i)
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
    }
    var luminance = function(rgb) {
      if (!rgb) return null
      var f = function(v) {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    var elementBackground = function(doc, el) {
      if (!el) return null
      try {
        var style = doc.defaultView.getComputedStyle(el)
        var color = style && style.backgroundColor
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null
        return parseRgb(color)
      } catch (e) { return null }
    }
    var detect = function(doc) {
      doc = doc || document
      var candidates = [
        doc.body,
        doc.documentElement,
        doc.querySelector('main'),
        doc.querySelector('[data-anchor-area="main"]') && doc.querySelector('[data-anchor-area="main"]').parentElement
      ].filter(Boolean)
      for (var el of candidates) {
        var rgb = elementBackground(doc, el)
        var lum = luminance(rgb)
        if (lum != null) {
          return {
            theme: lum < 0.18 ? 'dark' : 'light',
            luminance: Number(lum.toFixed(4)),
            rgb: rgb,
            source: el === doc.body ? 'body-background'
              : el === doc.documentElement ? 'html-background' : 'page-background'
          }
        }
      }
      var mediaDark = Boolean(doc.defaultView && doc.defaultView.matchMedia
        && doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches)
      return {
        theme: mediaDark ? 'dark' : 'light',
        luminance: null,
        rgb: null,
        source: 'prefers-color-scheme'
      }
    }
    var resolve = function(config, doc) {
      var requested = config && config.detailUiTheme
        ? String(config.detailUiTheme.value || 'auto') : 'auto'
      if (requested === 'dark' || requested === 'light') {
        return {requested:requested, resolved:requested, source:'setting'}
      }
      var detected = detect(doc)
      return Object.assign({requested:'auto', resolved:detected.theme}, detected)
    }
    var apply = function(config, doc, reason) {
      doc = doc || document
      var result = resolve(config, doc)
      doc.documentElement.dataset.nrnUiTheme = result.resolved
      if (doc.body) doc.body.dataset.nrnUiTheme = result.resolved
      window.__nrnDetailUiTheme = result
      console.log('[NicoNicoRankingNG theme]', reason || 'apply', result)
      return result
    }
    var watch = function(config, doc) {
      doc = doc || document
      if (window.__nrnDetailUiThemeWatcherInstalled) return
      window.__nrnDetailUiThemeWatcherInstalled = true
      var scheduled = false
      var schedule = function(reason) {
        if (String(config.detailUiTheme.value || 'auto') !== 'auto') return
        if (scheduled) return
        scheduled = true
        setTimeout(function() {
          scheduled = false
          apply(config, doc, reason)
        }, 80)
      }
      var observer = new MutationObserver(function() { schedule('page-theme-mutation') })
      if (doc.documentElement) observer.observe(doc.documentElement, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.body) observer.observe(doc.body, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.defaultView && doc.defaultView.matchMedia) {
        var media = doc.defaultView.matchMedia('(prefers-color-scheme: dark)')
        if (media.addEventListener) media.addEventListener('change', function() { schedule('system-theme-change') })
      }
    }
    var CSS = `
html[data-nrn-ui-theme="dark"] {
  --nrn-bg: #202429;
  --nrn-panel: #252a30;
  --nrn-panel-soft: #2b3037;
  --nrn-text: #d8dee8;
  --nrn-muted: #9fa9b6;
  --nrn-border: #3b424c;
  --nrn-link: #91b9f8;
  --nrn-hover: #333943;
  --nrn-lock-bg: #393522;
  --nrn-lock-border: #756a3d;
  --nrn-lock-text: #e6d99a;
}
html[data-nrn-ui-theme="dark"] #nrn-config-bar {
  color: var(--nrn-text) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle {
  color: var(--nrn-text) !important;
  background: var(--nrn-panel-soft) !important;
  border-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle:hover {
  background: var(--nrn-hover) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-detail-bulk-label,
html[data-nrn-ui-theme="dark"] .nrn-config-separator,
html[data-nrn-ui-theme="dark"] .nrn-info-section-title {
  color: var(--nrn-muted) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-info-container {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-top-color: var(--nrn-border) !important;
  box-shadow: none !important;
}
html[data-nrn-ui-theme="dark"] .nrn-info-section + .nrn-info-section {
  border-top-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-bottom-color: #353c45 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag:hover {
  background: #2a3037 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag.nrn-locked-tag {
  color: var(--nrn-lock-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag-link,
html[data-nrn-ui-theme="dark"] .nrn-contributor-link {
  color: var(--nrn-link) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor {
  color: var(--nrn-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #c3cad4 !important;
  background: #353b44 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #c9d0da !important;
  background: #30363e !important;
  border-color: #48515d !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #e4e9ef !important;
  background: #39414b !important;
  border-color: #626e7d !important;
}

html[data-nrn-ui-theme="dark"] .nrn-info-section-title,
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #aab3bf !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-lock-indicator {
  color: #d0ad55 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-warning {
  background: #3a3020 !important;
  border-left-color: #d4a24b !important;
  color: #ead7ab !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-inline-badge {
  display: inline-block;
  margin: 0 5px 3px 0;
  padding: 1px 5px;
  border: 1px solid #b56a00;
  border-radius: 4px;
  background: #fff0cf;
  color: #7a4700;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 800;
  vertical-align: baseline;
  white-space: nowrap;
}
.nrn-self-ad-inline-badge[data-confidence="name"] {
  border-color: #9a7a3b;
  background: #f7f0dd;
  color: #66501f;
}
.nrn-self-ad-card-badge {
  background: rgba(76, 55, 19, .94) !important;
  color: #ead7ab !important;
  outline: 1px solid rgba(212,162,75,.45);
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #91b9f8 !important;
  background: transparent !important;
  border: 0 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #b7d2ff !important;
  background: transparent !important;
}
`
    return {detect:detect, resolve:resolve, apply:apply, watch:watch, CSS:CSS}
  })()

