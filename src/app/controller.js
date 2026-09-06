  var Controller = (function() {
    var isMovieAnchor = function(e) {
      return e.dataset.nrnMovieAnchor === 'true'
    }
    var movieAnchor = function(child) {
      for (var n = child; n; n = n.parentNode) {
        if (n.nodeType !== Node.ELEMENT_NODE) return null
        if (n.tagName === 'BUTTON') return null
        if (isMovieAnchor(n)) return n
      }
    }
    var dataOfMovieAnchor = function(e) {
      return {
        id: e.dataset.nrnMovieId,
        title: e.dataset.nrnMovieTitle,
      }
    }
    var Controller = function(config, page) {
      this.config = config
      this.page = page
    }
    Controller.prototype = {
      addListenersTo(eventTarget) {
        eventTarget.addEventListener('change', this._changed.bind(this))
        eventTarget.addEventListener('click', this._clicked.bind(this))
      },
      _changed(event) {
        switch (event.target.id) {
          case 'nrn-visited-movie-view-mode-select':
            this.config.visitedMovieViewMode.value = event.target.value; break
          case 'nrn-visible-contributor-type-select':
            this.config.visibleContributorType.value = event.target.value; break
          case 'nrn-ng-movie-visible-checkbox':
            this.config.ngMovieVisible.value = event.target.checked; break
        }
      },
      _auditLayout(reason) {
        var rows = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root._auditMovieInfoLayout) continue
          if (!root._movieInfoVisible) continue
          var row = root._auditMovieInfoLayout(reason || 'bulk-layout')
          if (row) rows.push(row)
        }
        var bad = rows.filter(function(r) { return !r.ok })
        var result = {
          checked:rows.length,
          errors:bad.length,
          overlapCards:rows.reduce(function(n,r){ return n + Number(r.overlaps || 0) }, 0),
          maxToggleDelta:rows.length
            ? Math.max.apply(Math, rows.map(function(r){ return Number(r.toggleDelta || 0) }))
            : 0
        }
        console.log('[NicoNicoRankingNG detail] レイアウト全体監査:', result)
        if (bad.length) console.table(bad)
        window.__nrnLayoutDiagnostics = {summary:result, rows:rows}
        return result
      },
      _auditTogglePositions(reason) {
        var rows = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root._auditMovieInfoTogglePosition) continue
          var row = root._auditMovieInfoTogglePosition(reason || 'bulk')
          if (row) rows.push(row)
        }
        var maxDelta = rows.length ? Math.max.apply(Math, rows.map(function(r) { return r.delta })) : 0
        var moved = rows.filter(function(r) { return r.delta > 1.5 })
        var result = {
          checked: rows.length,
          moved: moved.length,
          maxDelta: Math.round(maxDelta * 100) / 100
        }
        console.log('[NicoNicoRankingNG detail] ▲▼位置監査:', result)
        if (moved.length) console.table(moved)
        return result
      },
      _auditDetailActionVisibility() {
        var tagButtons = Array.from(this.page.doc.querySelectorAll('.nrn-tag-ng-button'))
        var contributorButtons = Array.from(this.page.doc.querySelectorAll(
          '.nrn-contributor-ng-button, .nrn-contributor-ng-id-button, .nrn-contributor-ng-name-button'))
        var isVisible = function(el) {
          if (!el || !el.isConnected) return false
          var s = el.ownerDocument.defaultView.getComputedStyle(el)
          var r = el.getBoundingClientRect()
          return s.display !== 'none'
            && s.visibility !== 'hidden'
            && Number(s.opacity || 1) > 0.2
            && r.width > 0 && r.height > 0
        }
        var result = {
          tagNgButtons: tagButtons.length,
          visibleTagNgButtons: tagButtons.filter(isVisible).length,
          contributorNgButtons: contributorButtons.length,
          visibleContributorNgButtons: contributorButtons.filter(isVisible).length
        }
        result.ok = result.tagNgButtons === result.visibleTagNgButtons
          && result.contributorNgButtons === result.visibleContributorNgButtons
        console.log('[NicoNicoRankingNG detail] 操作ボタン可視性監査:', result)
        if (!result.ok) console.warn('[NicoNicoRankingNG detail] NG操作の一部が見えていません', result)
        return result
      },
      _setAllMovieInfoVisible(visible) {
        var total = 0
        var eligible = 0
        var skippedHidden = 0
        var changed = 0
        var widths = []
        var reserves = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root.movieInfo) continue
          if (!root.movieInfo.hasAny()) continue
          total++
          var s = root.elem.ownerDocument.defaultView.getComputedStyle(root.elem)
          var r0 = root.elem.getBoundingClientRect()
          var interactive = !root.elem.classList.contains('nrn-autofill-pending')
            && !root.elem.classList.contains('nrn-autofill-overflow')
            && !root.elem.classList.contains('nrn-hide')
            && s.display !== 'none' && s.visibility !== 'hidden'
            && r0.width > 2 && r0.height > 2
          if (!interactive) {
            skippedHidden++
            continue
          }
          eligible++
          if (root.setMovieInfoVisible(visible, 'user-bulk')) {
            if (visible && root._syncMovieInfoReserve) root._syncMovieInfoReserve()
            if (visible && root.elem) {
              var r = root.elem.getBoundingClientRect()
              if (r && r.width) widths.push(Math.round(r.width * 10) / 10)
              var reserve = Number(root.elem.dataset.nrnDetailReserve || 0)
              if (reserve) reserves.push(reserve)
            }
            changed++
          }
        }
        if (visible) {
          setTimeout(function() {
            this._auditDetailActionVisibility()
            this._auditTogglePositions('open-all')
            this._auditLayout('open-all')
          }.bind(this), 80)
        } else {
          setTimeout(function() {
            this._auditTogglePositions('close-all')
          }.bind(this), 80)
        }
        console.log('[NicoNicoRankingNG detail]', visible ? '全て開く' : '全て閉じる', {
          total: total,
          eligible: eligible,
          skippedHiddenOrPending: skippedHidden,
          changed: changed,
          cardWidthMin: widths.length ? Math.min.apply(Math, widths) : null,
          cardWidthMax: widths.length ? Math.max.apply(Math, widths) : null,
          cardWidthSample: widths.slice(0, 12),
          detailReserveMin: reserves.length ? Math.min.apply(Math, reserves) : null,
          detailReserveMax: reserves.length ? Math.max.apply(Math, reserves) : null,
          detailReserveSample: reserves.slice(0, 12),
          invariant:'動画カード幅は変更せず、detailReserve分だけ下方向へ余白を確保'
        })
      },
      _addVisitedMovie(target) {
        var d = dataOfMovieAnchor(movieAnchor(target))
        this.config.visitedMovies.addAsync(d.id, d.title)
      },
      _toggleData(target, add, remove) {
        var ds = target.dataset
        switch (ds.type) {
          case 'add': add.call(this, ds); break
          case 'remove': remove.call(this, ds); break
          default: throw new Error(ds.type)
        }
      },
      _toggleVisitedMovie(target) {
        this._toggleData(target, function(ds) {
          this.config.visitedMovies.addAsync(ds.movieId, ds.movieTitle)
        }, function(ds) {
          this.config.visitedMovies.removeAsync([ds.movieId])
        })
      },
      _toggleNgMovie(target) {
        this._toggleData(target, function(ds) {
          this.config.ngMovies.addAsync(ds.movieId, ds.movieTitle)
        }, function(ds) {
          this.config.ngMovies.removeAsync([ds.movieId])
        })
      },
      _toggleNgTitle(target) {
        this._toggleData(target, function(ds) {
          ConfigDialog.promptNgTitle(this.config, ds.movieTitle)
        }, function(ds) {
          this.config.ngTitles.removeAsync([ds.ngTitle])
        })
      },
      _toggleNgTag(target) {
        this._toggleData(target, function(ds) {
          if (this.config.addToNgLockedTags.value && ds.lock) {
            this.config.ngLockedTags.addAsync(ds.tagName);
          } else {
            this.config.ngTags.addAsync(ds.tagName);
          }
        }, function(ds) {
          this.config.ngTags.removeAsync([ds.tagName])
          this.config.ngLockedTags.removeAsync([ds.tagName])
        })
      },
      async _toggleContributorNgId(target) {
        var ds = target.dataset
        var contributor = Contributor.new(ds.contributorType, parseInt(ds.id, 10), ds.name)
        var storeName = contributor.ngIdStoreName
        var store = this.config[storeName]
        var id = Math.trunc(Number(ds.id))

        if (!Number.isFinite(id) || id <= 0) {
          console.error('[NicoNicoRankingNG NG-ID] 不正な投稿者IDのため操作を中止:', {
            contributorType: ds.contributorType,
            rawId: ds.id,
            name: ds.name
          })
          return
        }

        var operation = ds.type
        var before = store.set.has(id) || store.set.has(String(id))
        console.group('[NicoNicoRankingNG NG-ID] ' + operation)
        console.log('操作前:', {
          store: storeName,
          id: id,
          name: ds.name,
          inMemoryPresent: before,
          count: store.array.length
        })

        try {
          var changed
          if (operation === 'add') {
            changed = await store.addAsync(id, ds.name)
          } else if (operation === 'remove') {
            changed = await store.removeAsync([id])
          } else {
            throw new Error('unknown operation: ' + operation)
          }

          var expectedPresent = operation === 'add'
          var memoryPresent = store.set.has(id) || store.set.has(String(id))
          var persisted = await store.verifyPersisted(id)
          var ok = memoryPresent === expectedPresent
            && persisted.present === expectedPresent

          console.log('操作後:', {
            changed: changed,
            expectedPresent: expectedPresent,
            inMemoryPresent: memoryPresent,
            persistedPresent: persisted.present,
            count: store.array.length,
            persistedCount: persisted.storedCount,
            result: ok ? '✓ 保存確認OK' : '⚠ 保存状態不一致'
          })

          if (!ok) {
            console.error('[NicoNicoRankingNG NG-ID] 保存検証に失敗しました', {
              store: storeName, id: id, operation: operation
            })
          }

          // モデル/DOM反映はイベント伝播後に監査する。
          setTimeout(function() {
            if (typeof this.config._nrnDiagnosticHook === 'function') {
              this.config._nrnDiagnosticHook('ng-id-mutated', {
                storeName: storeName,
                contributorType: ds.contributorType,
                id: id,
                name: ds.name,
                operation: operation,
                persistedOk: ok
              })
            }
          }.bind(this), 50)
        } catch (e) {
          console.error('[NicoNicoRankingNG NG-ID] 操作失敗:', e)
        } finally {
          console.groupEnd()
        }
      },
      _toggleNgUserName(target) {
        this._toggleData(target, function(ds) {
          ConfigDialog.promptNgUserName(this.config, ds.name)
        }, function(ds) {
          this.config.ngUserNames.removeAsync([ds.matched])
        })
      },
      _clicked(event) {
        var e = event.target
        if (e.id === 'nrn-config-button') {
          this.page.showConfigDialog(this.config)
        } else if (e.id === 'nrn-open-all-movie-info') {
          this._setAllMovieInfoVisible(true)
        } else if (e.id === 'nrn-close-all-movie-info') {
          this._setAllMovieInfoVisible(false)
        } else if (movieAnchor(e)) {
          this._addVisitedMovie(e)
        } else if (e.classList.contains('nrn-visit-button')) {
          this._toggleVisitedMovie(e)
        } else if (e.classList.contains('nrn-movie-ng-button')) {
          this._toggleNgMovie(e)
        } else if (e.classList.contains('nrn-title-ng-button')) {
          this._toggleNgTitle(e)
        } else if (e.classList.contains('nrn-movie-info-toggle')) {
          this.page.getMovieRootBy(e).toggleMovieInfo()
        } else if (e.classList.contains('nrn-description-open-button')
                || e.classList.contains('nrn-description-close-button')) {
          this.page.getMovieRootBy(e).toggleDescription()
        } else if (e.classList.contains('nrn-tag-ng-button')) {
          this._toggleNgTag(e)
        } else if (e.classList.contains('nrn-contributor-ng-button')) {
          this._toggleContributorNgId(e)
        } else if (e.classList.contains('nrn-contributor-ng-id-button')) {
          this._toggleContributorNgId(e)
        } else if (e.classList.contains('nrn-contributor-ng-name-button')) {
          this._toggleNgUserName(e)
        }
      },
    }
    return Controller
  })()

  // ========================================================================
  // Composition root / application startup
  // ========================================================================
