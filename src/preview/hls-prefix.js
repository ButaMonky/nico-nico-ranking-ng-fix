  // HLS.js 1.6.19, Apache-2.0. Copyright 2017 Dailymotion.
  // Vendored unmodified; license and provenance: vendor/hls.js/.
  // Initialize only after an eligible hover; never replace the site's globals.
  var getNnrPreviewHls = (function() {
    var cached
    return function() {
      if (cached) return cached
      var module = {exports:{}}, exports = module.exports

