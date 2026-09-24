# Reveal setup and 25-second shot list

This sequence uses Setpiece’s actual Studio and workspace features. The Clock widget is local. Weather remains disconnected in the prepared demo profile; do not describe it as live data.

## Motion direction from the supplied reference

The supplied LangEase launch video is a loose style reference: a bright, uncluttered canvas; restrained blue and lavender accents; interface cards that enter and settle into a composition; a few short feature labels; and a simple logo end card. Use those ideas where they suit Setpiece; do not copy its product art or branding.

The existing `setpiece-reveal-20s.mp4` is a screenshot-led cut. Matching the reference is optional, not a goal blocker. The motion outline below is a direction for a future edit, not a claim that the current MP4 already uses this treatment. Keep real Setpiece captures wherever the behavior is shown. The final4 native acceptance run verified a named browser in a tile and website fullscreen contained to that tile while the neighboring Clock remained visible; record those shots from the running app rather than substituting the page illustrations.

| Time | Motion beat | Truthful Setpiece content |
|---|---|---|
| 0–2 s | On a warm white canvas, four soft blue/lilac tile shapes assemble into the Setpiece mark. | Brand animation; no app behavior implied. |
| 2–6 s | A real Studio capture slides in as a clean window card. Tile outlines separate, then settle into the prepared layout. | Show the actual app tile, Clock, and Weather states; keep Weather visibly disconnected. |
| 6–10 s | The layout fans into three simple cards, then recomposes: **Apps**, **Widgets**, **Your space**. | Use real crops from the isolated reveal screenshots; avoid mock live data. |
| 10–14 s | A named-browser card joins the layout. Show the actual browser tile and its toolbar beside the Clock tile. | Capture the running named browser and real tabs; do not invent tab contents. |
| 14–17 s | Play the local reveal clip in the browser, then enter website fullscreen inside its half-width tile. | The verified behavior keeps the Clock visible beside fullscreen video while the browser toolbar hides. |
| 17–20 s | The cards settle back into the tile-shaped mark; finish on the Setpiece name and a short tagline. | Keep the end card quiet, with no unsupported feature or integration claims. |

Keep motion slow enough to read on a phone. Use the cursor only to guide one or two transitions; avoid fast zooms and dense copy. The supplied reference is light, so this treatment can use an off-white background even though the app captures themselves use the Terminal dark theme.

## Prepare the isolated profile

From PowerShell at the project root, run:

```powershell
.\tools\prepare-reveal-demo.ps1
```

For offline preparation without opening an app window, add `-PrepareOnly`. This writes only the isolated profile; it does not open Setpiece or make a screenshot capture.

This creates a separate `release/demo-data` profile named **Setpiece Reveal**, with a static Fjord Glass wallpaper, a blank application tile, a Clock tile, and a Weather tile. Normal `%APPDATA%/Setpiece` data is not used. To recreate it, close the demo instance and run:

```powershell
.\tools\prepare-reveal-demo.ps1 -Reset
```

The reset removes only the dedicated `release/demo-data` directory after checking its exact path, then writes the three-tile profile directly. Setpiece fills in its normal profile defaults when the profile is opened. It does not clean other profiles or browser data. The prepared profile contains no connection secrets or browser session data.

Before recording, open [`sample-note.txt`](sample-note.txt) in Notepad. In Setpiece, use Apps to assign that real Notepad window to the left tile, then save the demo profile. Keep Notepad open for the clip. To show the browser feature instead, create a named browser such as `Local preview`, navigate to the local reveal page, assign it to the left tile, and enable **Keep fullscreen inside tile** in that tile's settings. Use the Clock tile as the adjacent tile in the fullscreen shot. Avoid signing in to any service; the Weather tile is intentionally disconnected. You can repeat the capture with the saved prepared profile, or reset and reassign the sample app.

## Timed shot list

| Time | Shot and action | What it shows |
|---|---|---|
| 0–4 s | Start in Studio with the three-tile reveal layout. Select the left tile and show the named browser assignment. | Profile, monitor-aware layout, and an integrated browser alongside widgets. |
| 4–9 s | Launch the workspace. Let the browser, Clock, and adjacent app tile settle. | The saved layout becoming a native desktop workspace. |
| 9–14 s | Navigate the named browser to the reveal page and play its local clip. | Tabs, address/navigation toolbar, and a real browser surface inside a tile. |
| 14–19 s | Enter website fullscreen in the browser tile. Hold the shot with Clock still visible beside it, then exit fullscreen. | Verified **Keep fullscreen inside tile** behavior; the rest of the workspace stays in view. |
| 19–25 s | Return to Setpiece and use Stop workspace & restore applications. | Workspace stop and application restoration. |

If native window restoration or the detach gesture is unreliable on the recording machine, omit those two actions rather than implying a successful run. A shorter Studio-to-workspace clip is preferable to a false demo.

## Recording guidance

- Use the primary display at its native resolution, ideally 1920 × 1080 or larger, with a stable display scale and no monitor hot-plug during the take.
- Maximize the Setpiece window. Use the Terminal dark theme, Fjord Glass wallpaper, and a clean desktop without notifications, unrelated windows, personal names, or location-specific content.
- Keep the cursor visible but move it slowly; pause briefly over the selected tile and workspace controls. Avoid circling, repeated clicking, and accidental hover menus.
- Pre-open the sample note, prepare and save the isolated profile, check that the Weather tile says disconnected, and close unrelated apps before capture.
- Record the app itself with system audio muted unless narration is planned. Do not show the browser’s account sessions or connection settings.
