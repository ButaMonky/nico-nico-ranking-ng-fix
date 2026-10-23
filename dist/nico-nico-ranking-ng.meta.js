// ==UserScript==
// @name         Nico Nico Ranking NG
// @namespace    http://userscripts.org/users/121129
// @author       ButaMonky
// @contributor  kengo321 (original)
// @description  ニコニコ動画のランキング・検索結果にNG、複合NG、検索結果の自動補充を追加する非公式の改変版
// @match        *://www.nicovideo.jp/ranking*
// @match        *://www.nicovideo.jp/search/*
// @match        *://www.nicovideo.jp/tag/*
// @version      160.29
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @license      MIT (main code); see bundled notices and LICENSING.md for component terms
// @noframes
// @run-at       document-start
// @connect      ext.nicovideo.jp
// @connect      snapshot.search.nicovideo.jp
// @connect      api.nicoad.nicovideo.jp
// @updateURL    https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.meta.js
// @downloadURL  https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.user.js
// @homepageURL  https://github.com/ButaMonky/nico-nico-ranking-ng-fix
// @supportURL   https://github.com/ButaMonky/nico-nico-ranking-ng-fix/issues
// ==/UserScript==
