# HLS.js 1.6.19

- Upstream: https://github.com/video-dev/hls.js/tree/v1.6.19
- Distribution: https://cdn.jsdelivr.net/npm/hls.js@1.6.19/dist/hls.min.js
- License notice: LICENSE (upstream), Apache-2.0.txt (full license).
- SHA-256: `72B87A6E58DB623FECA73AB370970C1126EC06EB3DCD0A67FD14B47B6340B820`

The distribution file is unmodified. The build wraps it in a private lazy CommonJS factory. It is initialized only on an enabled, eligible hover. Workers are disabled; no global Hls object is replaced. The full build retains separate audio playlist support required by video/audio HLS pairs. Native HLS is used only when MSE is unavailable and the browser reports HLS support.

No remote script is loaded during page startup. This avoids a dependency fetch blocking the existing NG behavior. Shipping the vendored file increases userscript size; this is not a claim of reduced script download/parse time. Buffer settings limit normal prefetch behavior, not an absolute byte or request ceiling.
