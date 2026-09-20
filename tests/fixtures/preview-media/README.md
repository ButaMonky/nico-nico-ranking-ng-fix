# Synthetic HLS fixture

Generated locally with FFmpeg 9.0: three seconds of solid blue video and a 440Hz sine wave. Contains no captured site media, account data or real resource URLs. The browser test serves manifests and assets from intercepted synthetic paths only.

Recreate in this directory (FFmpeg is optional; committed fixtures are used by tests):

```sh
ffmpeg -f lavfi -i 'color=c=blue:s=160x90:r=10:d=3' -an -c:v libx264 -pix_fmt yuv420p -g 10 -sc_threshold 0 -hls_time 1 -hls_playlist_type vod -hls_segment_type fmp4 -hls_fmp4_init_filename video-init.mp4 -hls_segment_filename 'video-%d.m4s' video.m3u8
ffmpeg -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=3' -vn -c:a aac -b:a 32k -hls_time 1 -hls_playlist_type vod -hls_segment_type fmp4 -hls_fmp4_init_filename audio-init.mp4 -hls_segment_filename 'audio-%d.m4s' audio.m3u8
```

`scripts/test-preview-hls.mjs` creates a separate-audio master manifest in memory and routes segment paths to the synthetic asset host. Passing this test proves library integration with mock CORS responses, not current NicoNico authentication/CDN behavior.
