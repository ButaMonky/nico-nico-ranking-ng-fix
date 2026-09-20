  var SearchPage = (function(_super) {

    var AbstractMovieRoot = (function(_super) {
      var AbstractMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      AbstractMovieRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          return this.elem.querySelector('.itemTitle a')
        },
        get _movieAnchorSelectors() {
          return ['.itemTitle a', '.itemThumbWrap']
        },
        bindToConfig(config) {
          _super.prototype.bindToConfig.call(this, config)
          this.movieInfoTogglable = config.movieInfoTogglable.value
          config.movieInfoTogglable.on('changed', set(this, 'movieInfoTogglable'))
          this.descriptionTogglable = config.descriptionTogglable.value
          config.descriptionTogglable.on('changed', set(this, 'descriptionTogglable'))
        },
      })
      return AbstractMovieRoot
    })(_super.MovieRoot)

    var FixedThumbMovieRoot = (function(_super) {
      var FixedThumbMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      FixedThumbMovieRoot.prototype = createObject(_super.prototype, {
        _getThumbElement() {
          const e = this.elem.querySelector('.thumb')
          return e ? e : this.elem.querySelector('.backgroundThumbnail')
        },
        _halfThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-9px'
          s.width = '80px'
          s.height = '63px'
        },
        _restoreThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-15px'
          s.width = '160px'
          s.height = ''
        },
      })
      return FixedThumbMovieRoot
    })(AbstractMovieRoot)

    var TwoColumnMovieRoot = (function(_super) {
      var TwoColumnMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      TwoColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return TwoColumnMovieRoot
    })(FixedThumbMovieRoot)

    var FourColumnMovieRoot = (function(_super) {
      var FourColumnMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-4-column-item')
      }
      FourColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return FourColumnMovieRoot
    })(FixedThumbMovieRoot)

    var MovieRoot = (function(_super) {
      var MovieRoot = function(elem) {
        _super.call(this, elem)
      }
      MovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.querySelector('.itemContent')
            .appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return MovieRoot
    })(FixedThumbMovieRoot)

    var SubMovieRoot = (function(_super) {
      var SubMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-sub-movie-root')
      }
      SubMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return SubMovieRoot
    })(AbstractMovieRoot)

    var createMainMovieRoot = function(rootElem) {
      var singleColumnView = Boolean(rootElem.getElementsByClassName('videoList01Wrap').length)
      if (singleColumnView) return new MovieRoot(rootElem)
      var twoColumnView = Boolean(rootElem.getElementsByClassName('videoList02Wrap').length)
      if (twoColumnView) return new TwoColumnMovieRoot(rootElem)
      return new FourColumnMovieRoot(rootElem)
    }
    var SearchPage = function(doc) {
      _super.call(this, doc)
    }
    SearchPage.prototype = createObject(_super.prototype, {
      removeEmbeddedStyle() {
        const nodeList = document.querySelectorAll('.itemContent[style="visibility: visible;"]');
        for (const node of Array.from(nodeList)) {
          node.style.visibility = '';
        }
      },
      parse(target) {
        target = target || this.doc
        return this._parseMain(target).concat(this._parseSub(target))
      },
      _parseItem(item) {
        return {
          type: 'main',
          movie: {
            id: item.dataset.videoId,
            title: item.querySelector('.itemTitle a').title,
          },
          rootElem: item,
        }
      },
      parseAutoPagerizedNodes(target) {
        return [this._parseItem(target)]
      },
      _parseMain(target) {
        return Array.from(target.querySelectorAll('.contentBody.video.uad .item[data-video-item]'))
          .map(item => this._parseItem(item))
      },
      _parseSub(target) {
        return Array.from(target.querySelectorAll('#tsukuaso .item'))
          .map(function(item) {
            return {
              type: 'sub',
              movie: {
                id: item.querySelector('.itemThumb').dataset.id,
                title: item.querySelector('.itemTitle a').textContent,
              },
              rootElem: item,
            }
          })
      },
      get _configBarContainer() {
        return this.doc.querySelector('.column.main')
      },
      createMovieRoot(resultOfParsing) {
        switch (resultOfParsing.type) {
          case 'main':
          case 'ad':
            return createMainMovieRoot(resultOfParsing.rootElem)
          case 'sub':
            return new SubMovieRoot(resultOfParsing.rootElem)
          default:
            throw new Error(resultOfParsing.type)
        }
      },
      observeMutation(callback) {
        this._observers = []
        const nodeList = document.querySelectorAll('.contentBody.video.uad .item.nicoadVideoItem .itemContent')
        for (const node of Array.from(nodeList)) {
          const watcher = new MutationObserver((records, observer) => {
            if (this._disposed) return
            for (const r of records) {
              if (SearchPage._isGettingAdDone(r)) {
                observer.disconnect()
                r.target.style.visibility = ''
                const item = ancestor(r.target, '.item.nicoadVideoItem')
                callback([SearchPage._parseAdItem(item)])
                return
              }
            }
          })
          this._observers.push(watcher)
          watcher.observe(node, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['style'],
          })
        }
      },
      get css() {
        return `#nrn-config-bar {
  margin: 10px 0;
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:6px;
}
#nrn-open-all-movie-info,
#nrn-close-all-movie-info {
  padding:2px 7px;
  border:1px solid #ccd1d8;
  border-radius:6px;
  background:#fff;
  color:#4e5661;
  cursor:pointer;
}
#nrn-open-all-movie-info:hover,
#nrn-close-all-movie-info:hover { background:#eef2f6; }
.nrn-detail-bulk-label { color:#6c737d; font-size:.92em; }
.nrn-config-separator { color:#b0b5bc; }
#nrn-config-button,
.nrn-visit-button:hover,
.nrn-movie-ng-button:hover,
.nrn-title-ng-button:hover,
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-movie-info-toggle:hover,
.nrn-description-open-button:hover,
.nrn-description-close-button:hover {
  text-decoration: underline;
  cursor: pointer;
}
.nrn-description-open-button {
  position: absolute;
  bottom: 0;
  right: 0;
  background-color: white;
}
.nrn-description-text,
.nrn-description-close-button {
  display: block;
}
.nrn-description-close-button {
  text-align: right;
}
.itemData,
.itemDescription,
.nicoadVideoItemWrapper {
  position: relative;
}
.nrn-movie-tag {
  display:grid;
  grid-template-columns:18px minmax(0,1fr) auto;
  align-items:start;
  gap:5px;
  min-width:0;
  margin:0;
  padding:6px 2px;
  border:0;
  border-bottom:1px solid #edf0f2;
  border-radius:0;
  background:transparent;
  font-size:13px;
  line-height:1.55;
}
.nrn-movie-tag:last-child { border-bottom:0; }
.nrn-movie-tag:hover { background:#f6f7f8; }
.nrn-movie-tag.nrn-locked-tag { background:transparent; }
.nrn-tag-lock-indicator { display:inline-flex; width:18px; min-width:18px; justify-content:center; color:#9b7c23; font-size:12px; line-height:1.55; filter:saturate(.72); }
.nrn-tag-lock-placeholder { visibility:hidden; }
.nrn-movie-tag-link { min-width:0; overflow-wrap:anywhere; word-break:break-word; }
.nrn-description-open-button,
.nrn-description-close-button,
.nrn-movie-tag-link,
.nrn-contributor-link {
  color: #333333;
}
.nrn-tag-ng-button,
.nrn-contributor-ng-button,
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button {
  display:inline-flex;
  align-items:center;
  min-height:20px;
  padding:1px 6px;
  border:1px solid #d3d7dc;
  border-radius:6px;
  background:transparent;
  color:#6f7781;
  font-size:11px;
  line-height:1.4;
  cursor:pointer;
}
.nrn-tag-ng-button { align-self:center; white-space:nowrap; opacity:.78; transition:opacity .12s ease,background-color .12s ease,border-color .12s ease; }
.nrn-movie-tag:hover .nrn-tag-ng-button,
.nrn-tag-ng-button:focus-visible { opacity:1; }
@media (hover:none) { .nrn-tag-ng-button { opacity:1; } }
.nrn-info-section + .nrn-info-section { margin-top:9px; padding-top:9px; border-top:1px solid #eceef1; }
.nrn-info-section-title { margin-bottom:5px; color:#717782; font-size:11px; font-weight:700; }
.nrn-tag-container { display:block; min-width:0; }
.nrn-contributor { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:7px 8px; min-width:0; padding:7px 2px; font-size:13px; line-height:1.5; border-radius:0; background:transparent; }
.nrn-contributor .nrn-user-ng-button,.nrn-contributor > .nrn-contributor-ng-button { grid-column:1 / -1; justify-self:start; }
.nrn-contributor-link { min-width:0; overflow-wrap:anywhere; }
.nrn-contributor-kind { padding:2px 6px; border-radius:999px; background:#e9edf2; color:#626a75; font-size:10px; font-weight:700; }
.nrn-user-ng-button { display:inline-flex; flex-wrap:wrap; gap:4px; margin-left:auto; }
.nrn-movie-tag-link.nrn-movie-ng-tag-link,
.nrn-contributor-link.nrn-ng-contributor-link,
.nrn-matched-ng-contributor-name,
.nrn-matched-ng-title {
  color: white;
  background-color: fuchsia;
}
.nrn-movie-info-container {
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  z-index:12;
  box-sizing:border-box;
  width:100%;
  margin:0;
  padding:8px 0 4px;
  background:transparent;
  color:#262b31;
  border:0;
  border-top:1px solid #e1e4e8;
  border-radius:0;
  box-shadow:none;
  overflow:visible;
}
.nrn-parsed {
  align-self: start !important;
}
.nrn-parsed.nrn-info-expanded {
  position:relative !important;
  margin-bottom:var(--nrn-detail-reserve,0px) !important;
  overflow:visible !important;
}
.nrn-movie-info-container .nrn-action-pane {
  line-height: 1.3em;
  padding: 0 0 6px;
  margin-bottom: 7px;
  border-bottom: 1px dashed #e2e5e8;
}
.nrn-movie-info-container .nrn-tag-container,
.nrn-movie-info-container .nrn-contributor-container {
  line-height: 1.5em;
  padding-top: 4px;
}
.videoList01 .itemContent .itemDescription.ranking.nrn-description {
  height: auto;
  width: auto;
}
.nrn-movie-info-toggle {
  color: #333333;
  font-size: 85%;
}
.videoList01 .nrn-movie-info-toggle {
  position: absolute;
  right: 0;
  top: 0;
}
.videoList02 .nrn-movie-info-toggle,
.nrn-4-column-item .nrn-movie-info-toggle {
  display: block;
  text-align: right;
}
.videoList02 .nrn-movie-info-container {
  clear: both;
}
.nrn-hide,
.videoList02 .item.nrn-hide,
.video .item.nrn-4-column-item.nrn-hide,
.uad .nicoadVideoItemWrapper .nicoadVideoItem.nrn-hide,
.item[data-video-item-muted] {
  display: none;
}
.item.nrn-reduce .videoList01Wrap,
.item.nrn-reduce .videoList02Wrap {
  width: 80px;
}
.item.nrn-reduce .itemThumbBox,
.item.nrn-reduce .itemThumbBox .itemThumb,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap img,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap img {
  width: 80px;
  height: 45px;
}
.videoList01 .nrn-action-pane,
.videoList02 .nrn-action-pane {
  display: none;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 3px;
  color: #999;
  background-color: rgb(105, 105, 105);
  z-index: 11;
}
.videoList02 .nrn-action-pane {
  font-size: 85%;
}
.videoList01 .item:hover .nrn-action-pane,
.videoList02 .item:hover .nrn-action-pane,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane {
  display: block;
}
.videoList01 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  color: white;
}
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  margin-left: 5px;
  border-left: solid thin;
  padding-left: 5px;
}
.nrn-user-ng-button,
.nrn-tag-ng-button {
  display: inline-block;
}
.nrn-ng-movie-title,
.nrn-contributor-link.nrn-ng-id-contributor-link {
  text-decoration: line-through;
}
.nrn-sub-movie-root {
  position: relative;
}
.nrn-sub-movie-root .nrn-movie-info-toggle {
  display: block;
  text-align: right;
  background-color: white;
}
.nrn-sub-movie-root .nrn-movie-info-container {
  clear: left;
  padding: 10px 0 15px 0;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-title-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-title-ng-button {
  display: inline-block;
  color: #333333;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button {
  margin-right: 0.5em;
}
.nrn-movie-info-toggle.nrn-toggle-pinned {
  top: var(--nrn-toggle-top) !important;
  right: 0 !important;
  bottom: auto !important;
  left: auto !important;
}
.nrn-self-ad-warning {
  margin: 0 0 7px;
  padding: 5px 7px;
  border-left: 3px solid #c77c12;
  background: #fff4dd;
  color: #704500;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}
.nrn-self-ad-card-badge {
  position: absolute !important;
  left: 4px !important;
  top: 4px !important;
  bottom: auto !important;
  z-index: 80 !important;
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(104, 62, 0, .90);
  color: #fff4d6;
  font-size: 10px;
  line-height: 1.35;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,.65);
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.nrn-self-ad-card-badge[data-confidence="name"] {
  background: rgba(103, 76, 25, .88);
}
.nrn-error {
  color: red;
}

/* ============================================================
 * v12.9 Classic Functional Detail
 * 「タグ名 🔒 [+]」を基準にした、常時見えるシンプルUI。
 * ============================================================ */
.nrn-movie-info-container {
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-info-section-title {
  margin: 0 0 5px !important;
  color: #6c737d !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}
.nrn-tag-container {
  display: block !important;
}
.nrn-movie-tag {
  display: block !important;
  margin: 0 !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  white-space: normal !important;
}
.nrn-movie-tag:hover {
  background: transparent !important;
}
.nrn-movie-tag-link {
  display: inline !important;
  overflow-wrap: anywhere;
  word-break: normal;
}
.nrn-tag-lock-indicator {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-left: 4px !important;
  color: #a67818 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  vertical-align: baseline !important;
}
.nrn-tag-lock-placeholder {
  display: none !important;
}
.nrn-tag-ng-button {
  display: inline !important;
  margin-left: 4px !important;
  padding: 0 !important;
  min-height: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  opacity: 1 !important;
  cursor: pointer !important;
}
.nrn-tag-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}
.nrn-contributor {
  display: block !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-contributor-kind {
  display: inline !important;
  margin: 0 4px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #555e68 !important;
  font-size: 13px !important;
  font-weight: 400 !important;
}
.nrn-contributor-link:not(.nrn-owner-row) {
  display: inline !important;
}
/* Legacy search does not provide the current site's visual utility classes. */
.nrn-owner-row { display:inline-flex; align-items:center; gap:4px; min-width:0; font-weight:bold; }
.nrn-owner-row img { width:24px; height:24px; min-width:24px; border-radius:50%; object-fit:cover; }
.nrn-owner-row .nrn-owner-name { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nrn-user-ng-button {
  display: inline !important;
  margin-left: 4px !important;
}
.nrn-user-ng-button::before {
  content: '[';
  color: #727b85;
}
.nrn-user-ng-button::after {
  content: ']';
  color: #727b85;
}
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button,
.nrn-contributor-ng-button {
  display: inline !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  cursor: pointer !important;
}
.nrn-contributor-ng-name-button::before {
  content: '/';
  color: #727b85;
  margin: 0 1px;
}
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-contributor-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}

.videoList02 .item,
.video .item.nrn-4-column-item {
  float: none;
  display: inline-block;
  vertical-align: top;
}
.video .item.nrn-4-column-item:nth-child(4n+1) {
  clear: none;
}
.nrn-4-column-item .nrn-movie-tag {
  display: block;
}
`
      },
    })
    Object.assign(SearchPage, {
      TwoColumnMovieRoot,
      FourColumnMovieRoot,
      is(location) {
        var p = location.pathname
        return p.startsWith('/search/') || p.startsWith('/tag/')
      },
      _isGettingAdDone(mutationRecord) {
        const r = mutationRecord
        return r.attributeName === 'style'
            && r.oldValue.includes('visibility: hidden;')
            && r.target.getAttribute('style').includes('visibility: visible;')
      },
      _parseAdItem(item) {
        const p = item.querySelector('.count.ads .value a').pathname
        return {
          type: 'ad',
          movie: {
            id: p.slice(p.lastIndexOf('/') + 1),
            title: item.querySelector('.itemTitle a').textContent,
          },
          rootElem: ancestor(item, '.nicoadVideoItemWrapper'),
        }
      },
      pendingMoviesInvisibleCss() {
        return `.contentBody.video.uad .item,
#tsukuaso .item,
.contentBody.video.uad .nicoadVideoItemWrapper {
  visibility: hidden;
}
.contentBody.video.uad .item[data-video-item-muted],
.contentBody.video.uad .item[data-video-item-sensitive],
.contentBody.video.uad .item.nrn-thumb-info-done,
.contentBody.video.uad .item.nrn-metadata-settled,
#tsukuaso .item.nrn-thumb-info-done,
#tsukuaso .item.nrn-metadata-settled,
.contentBody.video.uad.searchUad .item,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-metadata-settled,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-metadata-settled .item,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done .item {
  visibility: inherit;
}
`
      },
    })
    return SearchPage
  })(NicoPage)

  // ========================================================================
  // Runtime services (v14.0)
  // Cross-cutting behavior belongs here instead of individual card classes.
  // ========================================================================
