# Setpiece — rebuild appraisal and product contract

Written 10 September 2026, before application code. Status: design decision; implementation and verification have not occurred.

## 1. Scope and provenance

Build a new Windows workspace composer in this project root. An external legacy reference tree was read-only during the initial design work; its implementation, resources, visual structure, palettes, helpers, and compiled output must never enter this project. Public operating-system APIs, externally documented protocols, and serialized field names are interoperability contracts, not implementation templates. Third-party dependencies must come from their upstream distributors with licenses, never from the reference folder.

Observed starting conditions: no application source in the new root; an existing `bin` contains WebView2 browser state. Preserve it. Windows 11 build 26100, .NET SDK 10.0.400, desktop runtime 10.0.11, Node 24.19.0; Rust was not on PATH. Tool availability is evidence about setup cost, not a reason by itself to select a framework.

The legacy development policy belongs to the reference tree. Its instruction to edit that tree conflicts with the explicit rebuild instruction and is not applicable to the new project. Its behavioral requirements are already represented in this contract.

## 2. Stack decision

**Select .NET 10 / C# with a minimal Windows Forms host, WebView2, and an Angular + Angular Material TypeScript UI.** Windows Forms supplies HWNDs, the STA message loop, and WebView2 lifetime; it does not supply the product's visible control design. Angular Material supplies M3 controls. A single native coordinator owns external window state. All product surfaces use one local UI bundle and design system. No HTTP server is required in production.

Use the supported Angular/Material 22 line, exact versions and transitive dependencies locked when restoring. Angular's verified compatibility table supports Node 24.15+ and TypeScript 6.0.x for Angular 22; the installed Node meets that range. See [Angular compatibility](https://angular.dev/reference/versions).

### Trade-off matrix

Scores are engineering judgments, not measured benchmarks. 5 = strongest fit, 3 = practical with additional integration, 1 = substantial mismatch. Every candidate can call Win32 in principle. A high score does not promise arbitrary applications will cooperate.

| Requirement | WPF .NET 10 | WinUI 3 | Avalonia | Blazor Hybrid | .NET + WebView2 + Angular | Tauri | Electron | C++ Win32 + WebView2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| WebView2 embedding/control APIs | 5 | 5 | 3 | 5 | 5 | 4 | 1 | 5 |
| Window placement/tracking, taskbars, displays, DPI | 5 | 4 | 4 | 5 | 5 | 4 | 3 | 5 |
| One owner of external-window operations | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 5 |
| Live resize and drag potential | 4 | 5 | 4 | 3 | 4 | 4 | 4 | 5 |
| DPAPI and durable filesystem storage | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 5 |
| Accessible controls and keyboard behavior | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 4 |
| Dense, consistent Google M3 product UI | 3 | 3 | 3 | 4 | 5 | 5 | 5 | 5 |
| Packaging/deployment burden | 4 | 3 | 4 | 4 | 4 | 4 | 3 | 3 |
| Long-term maintainability for this scope | 5 | 4 | 4 | 4 | 4 | 3 | 3 | 2 |
| Windows tooling/debugging | 5 | 4 | 4 | 4 | 4 | 3 | 4 | 4 |

**WPF:** strongest runner-up. Mature HWND integration and accessible controls suit this application. Its retained UI can be very good, but faithful M3 requires a substantial new component system. Web content mixed with WPF also requires explicit composition/airspace decisions. WPF is not rejected because the old app uses it. It loses because this rebuild specifically prioritizes an independently designed Google M3 UI across many varied surfaces. [WPF/Win32 interoperability](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/wpf-and-win32-interoperation).

**WinUI 3:** capable native composition, modern accessibility, and built-in WebView2. However, its Fluent controls are not M3; retheming them is not automatically a faithful redesign. It adds Windows App SDK deployment and window-lifetime integration without eliminating any of our difficult Win32 services. [WinUI WebView2 hosting](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2).

**Avalonia:** credible custom rendering and cross-platform architecture. This product's hard requirements remain Windows-specific. NativeControlHost has native z-order, transform, transparency, and clipping constraints, so cross-platform abstraction offers little payoff here. [Avalonia Windows integration](https://docs.avaloniaui.net/docs/platform-specific-guides/windows).

**Blazor Hybrid:** can keep business logic in C# and render web UI locally. It remains a good option, but render/event traffic across the hybrid boundary needs care for a high-frequency layout editor. Angular Material is a more direct route to the requested control system than composing a Blazor component ecosystem. This is an architecture preference, not a claim that Blazor cannot resize smoothly. [Blazor Hybrid](https://learn.microsoft.com/en-us/aspnet/core/blazor/hybrid/?view=aspnetcore-10.0).

**Tauri:** Windows WebView2 and a small native host are attractive. Rust is a viable interop language, but adding a Rust toolchain and custom Windows bindings is extra complexity with no cross-platform requirement. [Tauri WebView engines](https://v2.tauri.app/reference/webview-versions/).

**Electron:** strong web tooling and UI flexibility. Its normal browser surface is Chromium, while this brief explicitly requires WebView2. A separate WebView2/native integration would create redundant browser infrastructure. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).

**C++ Win32 + WebView2:** maximum control, but COM lifetime, manual ownership, and native diagnostics impose more maintenance cost than justified. The chosen managed host retains direct Win32 access and the official WebView2 wrapper. [Microsoft WinForms WebView2 integration](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winforms).

**Decision correction:** standalone Material Web initially looked like the simplest Google component dependency. Its upstream repository states it is in maintenance mode. Choose Angular Material instead, and isolate its APIs behind Setpiece components. [Material Web project status](https://github.com/material-components/material-web). Angular's own theming source confirms token-based M3 support and distinguishes M3 from older M2 themes. [Angular Material theming](https://github.com/angular/components/blob/main/guides/theming.md).

### Five principal stack risks and mitigations

1. **Browser/native coordinate mismatch.** Native services use physical pixels; the studio uses normalized monitor coordinates. Convert at one boundary using the actual target monitor bounds and DPI. Test negative monitor origins, unequal scales, hot-plug, and maximize/restore. Do not apply desktop-wide scale factors. [Windows DPI guidance](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows).
2. **Reentrant events and blocking interop.** All HWND ownership lives on one coordinator. Hook callbacks enqueue observations; they do not mutate geometry. Coalesce placement requests, retain callback delegates, and distinguish programmatic placement from user movement. Never synchronously wait on WebView2 async operations. [WebView2 threading](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model).
3. **Browser process lifetime and memory.** Reuse environments; instantiate content browsers on demand; keep named shared controllers alive across profile switches. Persistent playback browsers must not be suspended or destroyed. Measure 20-tile resource use and long-running resize behavior. Missing WebView2 gets an actionable startup recovery surface. [Runtime distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
4. **Privileged host bridge exposed to web content.** Only the packaged local application origin gets a schema-validated command bridge. Reject unknown commands, stale revisions, excessive payloads, and navigation away from the local shell. Untrusted websites live in separate controllers with no host commands or secrets. Validate web-message origins. [WebView2 security](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security).
5. **Two toolchains and imperfect M3 fidelity.** Pin dependencies, use one build entry point, check type errors and native warnings, and wrap Material controls once. Do not fork component internals. Keep design tokens centralized and test actual contrast after compositing. Library use alone is not proof of M3 compliance.

## 3. Product information architecture, before UI

### Primary journeys

**First run:** concise introduction → detected displays → name first profile → select editing display → choose a visible layout preview → assign an open window or add a widget. Never require service authorization before the board is usable. Existing compatible profiles appear without migration. Failed data reads retain files and offer a clear recovery path.

**Empty:** the studio explains the selected display and offers three concrete choices: choose a layout, assign an open app, or add a widget. A new board starts as one unassigned application tile. A selected widget's inspector has widget settings, never application controls.

**Populated:** navigation preserves current profile/display context. Select tile → inspect content/geometry → preview a split, swap, or preset → commit → save or undo. Save status remains visible. Launch saves and restores matching already-open windows, then displays the workspace base behind them.

**Power user:** keyboard-local commands, direct shared-edge manipulation, multi-monitor profiles, shared browsers, service-specific settings, and instant appearance controls. Selection and editing target are always explicit. No global hotkeys. Focus stays predictable after tile deletion, dialogs, errors, or a profile switch.

### Shell and navigation

- **Studio:** profile selector and save/launch controls; display strip with editing-target label; live board; contextual inspector; undo/redo and preset preview.
- **Apps:** searchable visible-window picker, assignment destination and occupied-tile replacement details, currently attached windows, detached/missing status.
- **Widgets:** searchable catalog grouped into daily life, services, device, and play; each entry shows real state and fits the board through its own template.
- **Connections:** service cards with state, required inputs, permissions explanation, test result and retry/disconnect. Guided connection panels remain inside the same design system.
- **Appearance:** tonal-scheme cards with independent light/dark miniatures; live accent and surface controls; profile wallpaper chooser and static/moving choice.
- **Browsers:** named sessions, profile links, tabs, pin state and diagnostics. Closing a tile link is distinct from closing a named session.
- **Settings:** runtime/refresh diagnostics, accessibility/motion preference, storage locations, and workspace/taskbar behavior.

A restrained navigation rail plus contextual top app bar replaces the reference panel structure. The board is the dominant working area; the inspector changes with selection. Dialogs handle bounded decisions, not whole alternate applications.

### Content model and ownership

| Model | Responsibility | Persistence |
|---|---|---|
| Profile | Name, display selection, boards, wallpaper, gap/margin, snapping | Compatible profile JSON |
| Display board | Display identity/index, normalized partition, widget scale | Profile |
| Tile | Stable ID, rectangle, discriminated content type | Profile |
| App assignment rule | Process identity and title match; no durable HWND | Profile |
| Runtime attachment | HWND, identity check, original placement/style, tile owner | Native session only |
| Widget instance | Catalog ID, instance configuration, status/data binding | Profile + appropriate separate data store |
| Browser link | Private session or case-insensitive named shared session | Profile / shared browser store |
| Connection document | Service settings, tokens, unknown preserved fields | Shared DPAPI file |
| Appearance preferences | Scheme, mode, accent, opacity, dim, glow, radius | Separate preferences file |
| Edit history | Before/after board/profile edits, bounded to 60 entries | In memory |

Appearance preference edits never enter profile history or dirty state. Wallpaper does, because it is profile-owned. File normalization is in memory on read; it never silently rewrites existing user data. Changing profile must expose unsaved changes with Save, Discard, or Cancel.

## 4. Google Material Design 3 contract

M3 is the system for structure, controls, typography, states, and color—not a palette applied to old layouts. Use M3 Angular Material controls and Setpiece wrappers for icon actions, labeled fields, status messages, widget frames, navigation, chips, segmented choices, and dialogs. No per-widget control styling forks.

- Semantic color roles cover primary/secondary/tertiary/error with on/container pairs, surfaces and container scale, outlines, inverse roles, shadow and scrim. All paint resolves through tokens.
- Terminal and Luna identify independently designed dark and light presentations; themes change color roles only. Each available scheme has both modes. Accent override regenerates only the primary family through tonal color utilities with contrast-derived foregrounds. Do not calculate on-colors by arbitrary light/dark thresholds. [Material color utilities](https://github.com/material-foundation/material-color-utilities).
- Apply the full M3 typography role set: display, headline, title, body and label, each in large/medium/small. Use bundled licensed Roboto for offline consistency. Do not reuse legacy fonts.
- Shape tokens include the requested 4/8/12/16/full values. Elevation levels map to M3 levels 1–5 with physical elevations 1/3/6/8/12dp; level 0 is flat. Do not confuse level number with dp.
- Motion uses the requested 150/220ms eased product timings, plus reduced-motion behavior. These requested timings and shape subset are product constraints; do not describe them as the complete Google token specification.
- Standard controls keep accessible Material target sizes; 24px is a hard lower bound, not the default target. Split handles receive expanded invisible hit areas and keyboard alternatives.
- Widgets first reflow content, then fit the presentation to the available area. Keep interaction hit boxes accessible even if visual content scales. No hidden internal content disguised by `overflow: hidden`; compact templates retain primary information and expose a clear expanded view where appropriate.
- Opacity affects backgrounds, never text opacity. Dim/scrim and tonal container protection must maintain legibility across all 11 wallpapers. Theme cards preview real shared tokens.

The M3 website returned JavaScript-only pages through text retrieval; it has not been visually audited yet. The verified readable Angular Material theming source supports the component/token decision. Visual inspection of specification pages and actual product surfaces remains required. A claim of perfect conformance would be premature.

## 5. The three hardest technical problems

### External windows and workspace lifetime

Use `EnumWindows` with visible/cloaked/owned-window filtering, `EnumDisplayMonitors` and monitor information for displays, and `SetWindowPos`/deferred placement for rectangles. Respect application minimum sizes and privilege boundaries; show an actionable assignment error when a window refuses placement. Foreground activation is best-effort under Windows rules, not forced by input injection. [Monitor enumeration](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaymonitors), [window placement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos).

One coordinator owns an attachment registry and original-window restoration journal. User move/size-start events detach immediately and clear the runtime attachment and saved rule as appropriate; location-change observations never write board rectangles. Protect against HWND recycling with process identity. Safely replacing an assignment restores the old window before committing the new one. On assignment failure, preserve the previous valid state. [WinEvent hooks](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook).

Each selected display gets a click-through full-monitor base behind assigned applications. Interactive widgets and browsers are separate owned surfaces above that base. The base must not be an opaque cutout overlay. Track z-order without setting arbitrary external applications permanently topmost.

Per-display taskbar hiding has no simple guaranteed public API for hiding every Explorer taskbar. `SHAppBarMessage` documents appbar coordination, not a blanket supported per-display taskbar-hide guarantee. Isolate shell-window detection and hide/restore, keep a visibility journal, recover from Explorer restart, and verify on this Windows build. This remains a specific compatibility risk across Windows updates. [Appbar API](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shappbarmessage).

**Trade-off:** external applications stay independent native windows. This preserves normal application behavior but requires robust lifetime, privilege, and z-order handling. Do not solve it by reparenting arbitrary applications into the UI renderer.

### Live layout editing without holes or event loops

Store normalized rectangular partitions, independent of runtime application rectangles. Derive adjacency and connected shared-edge segments from geometry. Dragging an edge updates all participating neighbors simultaneously; dragging a corner composes horizontal and vertical constraints. Clamp by minimum tile size, apply selected snap increment, then validate bounds, coverage and non-overlap. Render a candidate immediately; commit one history step on pointer-up. Cancel restores the baseline.

Splitting replaces one rectangle with two. Deletion first chooses a complete adjacent rectangle cover that can expand into the vacated space; more complex partitions require local repartitioning while preserving surviving content IDs. It must not silently remove unrelated content. Swaps exchange tile positions as one transaction. Presets show affected content placement before commit and preserve assignments where possible. Maximum 20 tiles; the board always remains filled.

History stores up to 60 committed changes; new edits clear redo. Coalesce pointer events to animation frames; send only the latest placement revision to the host. Snap options are off or 1/5/10/20 percent. Verify thousands of generated edit sequences rather than merely testing the same arithmetic twice.

**Trade-off:** general rectangular adjacency is more work than a binary split tree, but legacy profiles can describe layouts that a slicing tree cannot preserve. Compatibility and arbitrary shared-edge editing justify it.

### Per-service data and long-lived widgets

Service adapters return typed data plus loading/empty/disconnected/error/offline/ready status, timestamps, and recoverable actions. Request cancellation follows widget/session lifetime; polling is shared per service, with retry/backoff and rate-limit handling. Never fabricate live measurements. Missing sensors report unavailable with a reason, not zero.

Connection secrets remain native-side. OAuth uses a system-browser flow with state validation, PKCE where supported, explicit requested scopes, refresh-token rotation, and user cancellation. Calendar feed mode supports exclusions and must handle time zones, recurring events, and malformed feeds. Server availability does not imply a successful account connection. Validate each provider's current API before implementing its adapter.

| Catalog surface | Required interior and behavior |
|---|---|
| Clock | Local hero time, world-clock rows, inline timezone pickers |
| System | CPU/GPU/memory/network metrics, temperature availability, responsive metric grouping |
| Google Calendar | Day context, next event and agenda, feed/OAuth states and exclusions |
| Discord | Server/call context based on granted API capabilities, connection/retry state |
| Spotify | Track/artwork, playback progress and permitted playback actions |
| AI Usage | Separate Codex quota windows and Opencode activity, honest source timestamps |
| Weather | Conditions, location, hourly forecast and source state |
| Bambu Lab A1 Mini | Print progress, temperatures, remaining time, camera where available |
| Ruter | Stop search, chosen stop and live departures |
| VG News | Headline, summary, categories and article action |
| Notes | Editable note, durable autosave feedback and recovery |
| Inbox | Unread state and actionable messages from configured provider |
| Battery | Charge, power source, remaining estimate and unavailable-hardware state |
| Volume | Master level, mute and endpoint state |
| Reddit | Hot posts, community, score/comments and source link |
| Scrapbots | Playable pilot/battle/extraction loop, progression and skill-tree views |
| Markets / Focus / GitHub | Three deliberately labeled design previews |
| X / Twitter | Retired state retained for compatible profiles; no app assignment |

This is 16 live widgets + 3 previews + 1 retired surface = the 20 required interiors. Each needs compact/wide/tall states and Terminal/Luna visual verification. A disconnected live widget is a valid state, but is not evidence that its integration works.

**Trade-off:** adapters cost more than embedding websites, but they support fit-to-tile layouts, shared polling, secret isolation and useful offline states. Remote websites belong only to explicit browser tiles.

## 6. Persistence compatibility and safety

Read reference model and storage declarations to extract this contract; do not copy their classes or serializer implementation.

- Profile root: `%APPDATA%/Setpiece/Profiles`. Legacy schema currently declares version 17, PascalCase field names, normalized rectangle coordinates, `MonitorBoards` plus legacy `Zones`/`MonitorIndex` fields, and per-board widget scale. Application rules contain process name/title; widget and web content use distinct persisted tags.
- Preserve unknown JSON properties through an independent document adapter. Avoid renaming files on read. Invalid values normalize in memory with diagnostic feedback; ambiguous malformed geometry must remain recoverable. Clear `ConstrainFullscreenToTile` during normalization as explicitly required; never invoke the legacy virtual-display path.
- Connections: `%APPDATA%/Setpiece/connections.dat`, raw current-user DPAPI ciphertext over UTF-8 JSON with additional entropy `Setpiece.WidgetConnections.v1`. Implement with the platform ProtectedData API, independently of legacy P/Invoke code. [ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=windowsdesktop-10.0).
- Legacy keys include calendar feed/exclusions, Google OAuth fields, Spotify OAuth fields/permissions, clock timezone IDs, Discord server/client/call settings, weather name/coordinates, Bambu host/serial/access code, Ruter stop ID/name, and news source/category/category array. Preserve values and unknown fields; never log credentials.
- Connection writes reread and merge only explicit field changes under an interoperable lock. Never replace an unreadable encrypted file with an empty object. Keep existing saved state outside output directories.
- Profile and connection saves use same-directory temporary files, flush and atomic replacement. Failed saves preserve the previous file and leave a visible unsaved/error state. Test against synthetic files in a separate test data root; actual existing user data stays untouched during automated verification.

## 7. Release architecture and acceptance gates

Planned canonical executable: `Setpiece/bin/Release/net10.0-windows/Setpiece.exe` under the new workspace. One production build entry point builds the UI and native shell. Startup refresh compares source/build freshness, launches a logged rebuild through a separate helper lifetime, waits for success, and relaunches that path with `--skip-production-refresh`. A failed rebuild reports the log and does not loop. Single-instance enforcement plus activate-existing must be tested through the same executable, including during refresh.

Suggested source boundaries: native host/lifecycle, native interop services, domain layout/history, profile/connection persistence, provider adapters, browser coordinator, UI design system, UI routes, widget templates, and verification. Technical services return data/results and never build presentation controls.

Wallpapers comprise ambient plus fresh assets for fjord-glass, paper-horizon, moss-geometry, blue-hour, ember-grid, slate-dunes, orchard-mist, violet-current, quiet-coast and mono-bloom. Each bundled design requires PNG and looping MP4, with a still fallback and profile memory. They must be created or sourced independently, never taken from legacy assets.

Browser acceptance includes per-tile WebView2 controllers, named shared browsers that retain video across profile switches, tabs, pinned toolbars, uBOLite obtained from upstream with license/version provenance, and readable diagnostics. Installing an extension is not proof it is filtering; verify behavior in the actual runtime.

### Required evidence, not yet produced

1. Full Release build output, zero warnings, exact canonical executable and source references.
2. New-user scenario A: create/name profile → select real display → create three tiles → assign two real windows → gap/snap → save and reopen.
3. Scenario B: add Clock, Weather and Ruter → connect one service → resize the board → check content reflow, no internal scrollbars, keyboard targets.
4. Scenario C: switch wallpaper and theme → verify profile wallpaper memory, instant preferences without profile dirtying, light/dark legibility.
5. Scenario D: drag an assigned application's actual frame → verify detach, empty tile, byte-equivalent saved geometry before/after.
6. Scenario E: canonical relaunch, source-refresh success/failure/skip logs, double launch → exactly one responsive application process with visible main window. Browser subprocesses are counted separately.
7. Screenshot and inspect every listed surface in Terminal and Luna, all 20 widget interiors, connections and failure states, browser chrome, game views, workspace base/guides and both app/tile empty states. Cover compact/wide/tall sizes and wallpaper extremes.
8. Additional hard-case checks: shared edges/corners preserve coverage, 20-tile limit, delete expansion, safe assignment replacement, 60-step history and redo invalidation, multi-DPI movement, display disconnect/reconnect, taskbar restoration, encrypted-store compatibility and unknown-field retention.

No completed-build, passing-manual-check, live-service or visual-conformance claim is made in Phase 0. Account-authorized flows and printer hardware checks need real runtime evidence; lack of such evidence must remain visible in the final pass/fail/N-A report. All requirements above remain in scope unless the user explicitly changes them.
