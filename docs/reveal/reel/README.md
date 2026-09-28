# Setpiece motion reel (15 s)

`../setpiece-reel-15s.mp4` is a 1920 × 1080, 60 fps motion piece built entirely in code. It uses no screen recording and no samples. It is an illustration of Setpiece's features in the app's own design language. It is not a capture of the running app.

| Time | Beat |
|---|---|
| 0–2 s | A line of light draws the Setpiece mark. Its three cells fill in, and the wordmark rises. |
| 2–4 s | The camera dives into the mark. Its cells become tiles that split on the beat: **Apps. Widgets. Browsers.** |
| 4–7 s | The tiles become layout slots on a monitor. Clock, Weather, System, a group chat and a music player fly in and land in their slots. |
| 7–10 s | A named browser (Media) flies in and opens the *Blue hour* video. It goes **fullscreen inside its tile**, and the widgets keep running. The clock rolls over to 10:25 while the video plays. |
| 10–12.5 s | The camera pulls back to three displays, each with its own layout. Three accent waves recolor every widget: Iris, Rose, Sage, then Iris again. |
| 12.5–15 s | The displays flatten and swirl back into the three cells of the mark, and the piece ends on the end card. |

## Files

- `reel.html`: the whole composition. `render(t)` is a pure function of time, so any frame can be rendered in any order. Open it in a browser for a live preview with a scrubber. Add `?t=9.2` to start at a given time.
- `render.mjs`: loads the page in headless Edge/Chrome over the DevTools protocol and pipes frames into ffmpeg. Motion blur comes from temporal supersampling: each output frame is the average of `--sub` subframes across a 180° shutter.
- `sound.mjs`: synthesizes the sound design (pad, risers, panned whooshes, landings, UI clicks, accent chimes and the final hit, through a Freeverb) as a WAV, cued to the same timeline.
- `fonts/roboto-flex-latin.woff2`: Roboto Flex (SIL OFL 1.1), the app's UI font. Icons come from `UI/public/fonts`, and images come from `docs/assets`.

## Build

Requires Node.js 22+ (for the built-in WebSocket), ffmpeg on `PATH`, and Microsoft Edge or Chrome. Set `EDGE_PATH` if the browser is not found automatically. Run these from this folder:

```powershell
node render.mjs video --sub 4 --out out/reel-silent.mp4   # about 5 minutes with a GPU
node sound.mjs out/reel-audio.wav
ffmpeg -y -i out/reel-silent.mp4 -i out/reel-audio.wav -c:v libx264 -preset slower -crf 21 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart ../setpiece-reel-15s.mp4
```

The master render is kept at CRF 14 in `out/`. The published file is a web encode of about 7.6 MB. It plays in the project page's Reel section, and `../setpiece-reel-poster.jpg` is its poster frame. `../setpiece-reel-cover.jpg` is the frame at 10 s with a play button overlaid, and the repository README uses it as a link to the page.

For quick checks, `node render.mjs stills 4.8 9.5` writes PNG stills to `out/`. `node render.mjs video --sub 1 --format jpeg --out out/preview.mp4` renders a preview in about a minute.
