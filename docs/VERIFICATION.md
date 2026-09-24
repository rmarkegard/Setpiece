# Verification and environment limits

Updated 24 September 2026. This report describes the latest documented production build and the visual evidence collected from its current source. It does not treat older manual runs as current acceptance.

## Production build

Run `.\build.ps1` from the project root on Windows. The script builds the Angular production bundle and .NET Release host, runs the UI domain/layout/theme tests, and runs the native verification project.

Latest result on Windows 11 x64, .NET SDK 10.0.400, Node.js 24.19.0, and pnpm 11.19.0:

- Angular production build: passed.
- .NET Release build: passed with 0 warnings and 0 errors.
- UI tests: 28 passed, 0 failed.
- Native verification: 37 checks passed, including restore-candidate selection for duplicate titles, exact matches, reserved handles, changed titles, and rejecting title fallback when the sole process window has been renamed.
- Current executable: `Setpiece/bin/Release/net10.0-windows/Setpiece.exe`.

The executable is framework-dependent. A clean machine needs .NET 10 Desktop Runtime x64 and Microsoft Edge WebView2 Evergreen Runtime. The source build also needs the .NET 10 SDK, Node.js 24.15+, and pnpm 11.

The exact build transcript and isolated verification data are generated under `artifacts/`; they are local evidence and are intentionally excluded from a source release. The latest production build includes the duplicate-window restore guard and user-facing notice for unmatched app tiles; the local package was rebuilt from that output.

## Current rendered review

The built native Windows host rendered WebView2 captures from an isolated data root using `--offline-review`. The review filters scenes before capture and does not enumerate Apps or call public weather/transit providers. The 16 curated screenshots are in the [reveal gallery](reveal/SCREENSHOTS.md). A separate package validation run produced 16 diagnostic screenshots from the extracted archive: eight reveal scenes in both themes. Eleven package captures are pixel-identical to the gallery; the five differences are limited to a local clock, hover-card region, and a four-pixel appearance variation. These captures show neutral local demo state, not live connected integrations.

The final4 archive capture produced 16 files across eight scenes and two themes, with exit code 0. Its manifest measured four Studio widget containers across both themes: all four fit, with no internal scroll or horizontal overflow. The Studio page reported page overflow in both themes because its settings column continues below the viewport. These measurements apply to captured containers and do not prove that arbitrary user content or every tiny tile is readable.

The default restricted execution environment did not complete WebView2 navigation: its log showed `GpuProcessExited`, `RenderProcessExited`, and `BrowserProcessExited`, followed by the 30-second `NavigationCompleted` timeout. With approved local execution, the final extracted Release package captured the eight curated reveal scenes in both themes and exited successfully. Its 16-image manifest is under `artifacts/package-final4-data-20260924/`; the screenshots are under `artifacts/package-final4-captures-20260924/`. This verifies those selected packaged routes only; it does not claim an exhaustive capture of every scene, tile size, or arbitrary user content. The demo reset script writes its isolated profile directly and does not depend on the capture suite.

The current screenshots establish rendered appearance for Studio, Widgets, Connections, Appearance, Browsers, the game guide, and Workspace in both themes. Focused native interaction checks supplement those captures for profile switching, tile editing, browser restore, workspace launch/stop, and contained fullscreen. They do not establish taskbar handling, DPI transitions, or external integrations through user interaction.

## Journey coverage

This compact map distinguishes automated or rendered evidence from workflows still requiring live interaction. The open journeys are release-readiness work, not implied passes.

| Journey | Evidence collected | Remaining verification |
|---|---|---|
| First launch and empty profile | Fresh final4 package launched against an isolated data root; native Studio showed the empty `My workspace` profile and stayed responsive. | Repeat first launch on a clean Windows account and runtime install. |
| Create, save, switch, and reopen profiles | Native UI in the isolated final3 run created two profiles and exercised the unsaved-change Save & switch path; final4 saved the edited test layout and used it for workspace launch/stop. | Native UI after an isolated process restart showed the saved My workspace profile and its Local preview browser tile; persistence of multiple profiles across later restarts remains unverified. |
| Select displays and apply layouts | Native Studio enumerated the available displays and applied a split layout to Display 1; geometry checks cover negative display coordinates and tile bounds. | Verify selection and behavior across physical monitors, mixed DPI, and monitor changes. |
| Add, move, resize, split, remove, and drop tiles | Native Studio split the browser and Clock tiles. On a fresh isolated profile, pointer edge-resize changed a full tile from 100% to 85%, header drag moved it, and focused arrow-key movement worked with a visible focus ring. Add tile created a tile in the free space; Ctrl+Z removed it and restored the earlier move/resize state. Domain tests cover move/resize/drop transformations, collisions, vacant-space fill, and tile-count bounds. | Broader canvas geometry, split/remove/drop by pointer, and additional keyboard paths remain untested. |
| Assign apps, widgets, and named browsers | Native UI created `Local preview`, navigated to the local docs page, observed the browser catalog update without a reload, added Clock, and assigned a fresh blank Notepad window to a tile. | Test more application types; one profile and its named browser tab were verified across a process restart, while multiple profiles/tabs remain untested. |
| Launch, detach, stop, and restore a workspace | Final4 launched a workspace with the named browser, Clock, and Notepad in their tiles. The Settings stop command hid workspace surfaces and moved Notepad back out of its tile. | A pre-assignment frame was not recorded, so the exact original Notepad bounds were not compared. Detach, taskbar behavior, and other target applications remain untested. |
| Settings, appearance, and common dialogs | Light/dark screens were captured; native Settings and Stop were exercised; profile switching showed the unsaved-change prompt. Closing with a temporary unsaved resize showed Keep working / Discard & close / Save & close; Keep working was chosen and Ctrl+Z reverted the test change. | Menus, notifications, and save/discard close outcomes remain untested. |
| Widget sizes and service states | A live Clock widget ran in the native workspace; widget layout tests cover sizing; provider checks assert explicit disconnected states; screenshots show the library and disconnected connections. | Review representative small tiles and live loading/error transitions. |
| Browser tabs, toolbar, and persistence | The named browser opened in its tile; toolbar collapse/restore was exercised; the reveal video entered and exited fullscreen inside a half-width tile while Clock remained visible. After an isolated restart, the saved Local preview browser opened its one saved tab at the persisted URL in a contained Setpiece browser window. | Multi-tab restoration and review of external sites/providers remain unverified. |

## Reveal video and project page

The local reveal video is `reveal/setpiece-reveal-20s.mp4`: silent H.264 MP4, 1920 × 1080, 30 fps, 20.00 seconds, and 600 frames. A full decode completed without errors. The cut uses real screenshots from the isolated reveal profile and does not imply that Weather or another integration is connected. Its poster and representative frames were inspected. The shot list remains a separate 25-second interactive recording guide for a later native demo.

The GitHub Pages source is `docs/index.html`, with relative references to the reveal video, poster, screenshots, and stylesheet. HTML structure and local asset paths were checked. Direct `file://` navigation was rejected, so the local `docs/` folder was served on `127.0.0.1` and inspected in the in-app browser at a phone-width viewport. The review covered the hero, embedded 20-second player and poster, feature cards, integrated browser and contained-fullscreen illustrations/copy, setup steps, requirements, license, and footer; no clipping was seen in the inspected sections. Native playback of the silent reveal was exercised in a half-width workspace browser tile: fullscreen stayed inside that tile, the neighboring Clock remained visible, and the browser toolbar returned on exit. GitHub Pages is being published from `main`/`docs`; deployment completion is recorded in the release-readiness report.

Earlier manual verification described in the September 13 report was performed on older source and is not repeated here as current evidence. Its detailed captures and user-specific test data stay in ignored local artifacts and are not linked from this public-facing report.

## Release and data checks

- `.gitignore` excludes build output, package caches, the full `artifacts/` tree, local reveal data, staging folders, and generated zip files.
- The planned archive contains only the current Release output, its runtime assets, the PolyForm license, and third-party notices. It excludes symbols, logs, user data roots, browser profiles, screenshots from private artifacts, and repository development tools.
- The final zip is 46.82 MiB with 1,256 archive entries. A fresh extraction contained the required app, UI, license, and notice files; no PDBs, logs, nested archives, browser data, or development artifacts were found. Its extracted app rendered the curated eight-scene capture in both themes and exited with code 0. A file-by-file SHA-256 comparison against Release output found no missing, extra, or different non-PDB app files.
- The working directory did not contain Git metadata when this work began. A public remote, push, or upload has not been created. Local Git readiness is recorded in the release checklist.
- No normal `%APPDATA%/Setpiece` profiles, connection secrets, or existing browser sessions were reset for these checks.

## Not verified in this environment

These checks affect acceptance and must not be read as passed:

- Persistence of multiple saved profiles and multiple browser tabs across restarts; one profile and its saved named-browser tab were verified.
- Detach behavior, notification behavior, taskbar transitions, crash recovery, broader pointer/keyboard journeys, and save/discard close outcomes.
- Multiple physical displays, mixed DPI, monitor disconnect/reconnect, Explorer restart, and arbitrary target application compatibility. Display choices and geometry were inspected, but no monitor was unplugged or moved during these checks.
- Google Calendar/Gmail, Spotify, Discord voice, Reddit authorization, Bambu printer/camera, classic Outlook, CPU temperature, and battery charging/discharging. Account sign-in or required devices were not provided.
- A clean-machine installation, downloaded runtime setup, signing/SmartScreen behavior, and a second Windows build. `WindowsSandbox.exe` is not installed in this environment, so no separate clean Windows environment was available for that check.

Native Computer Use was available after initializing `@oai/sky`; the owner also approved using it on isolated test profiles. The final3 run exercised profile creation and Save & switch; final4 exercised browser setup and toolbar behavior, native app assignment, workspace launch/stop, and contained fullscreen. A normal restricted launch exposed a live Setpiece window handle but Computer Use omitted it from its app/window lists. After an approved local launch, Computer Use selected the isolated app. Studio showed the saved My workspace profile and its Local preview browser tile; the Browsers route displayed the saved entry with one tab at http://127.0.0.1:8765/#reveal. Opening that entry loaded the saved URL in a contained Setpiece browser window and rendered the landing page at the reveal section. The two-theme Browsers capture and manifest are under artifacts/restart-persistence-capture-20260924. Closing the app persisted the selected one-tab URL. This verifies one profile and browser tab through a process restart; multiple-profile and multi-tab restoration remain unverified. A separate fresh-profile interaction pass verified pointer drag/resize, focused keyboard movement, add and undo, plus the unsaved close prompt; no changes were kept. A second-tab add/restart journey was not exercised. Restore matching is protected by automated checks and was also exercised with a fresh Notepad window, but an exact pre-assignment bounds baseline was not recorded. The static landing page passed local phone-width visual review over loopback. The default restricted execution environment still exits WebView2 child processes during capture, while the same eight curated scenes captured successfully from the final extracted package under approved local execution.
