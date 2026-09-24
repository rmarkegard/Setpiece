# Third-party notices

Setpiece’s own source is under the PolyForm Noncommercial License in [`LICENSE`](LICENSE). The components below are separate works and remain under their respective terms. The generated UI bundle’s complete package license texts are in `UI/dist/3rdpartylicenses.txt`; the local package script copies that file into the archive.

## Windows application and sensor helper

| Component | Version | License | Notice/source |
|---|---:|---|---|
| Ical.Net | 5.2.3 | MIT | [Project and source](https://github.com/ical-org/ical.net); copyright ical-org maintainers and contributors. |
| Microsoft.Data.Sqlite.Core | 10.0.9 | MIT | [Microsoft.Data.Sqlite](https://github.com/dotnet/efcore); Microsoft. |
| Microsoft.Web.WebView2 SDK | 1.0.4191.47 | Microsoft package license | The package’s `LICENSE.txt` and `NOTICE.txt` are copied under `THIRD-PARTY-LICENSES/`. The WebView2 Runtime is installed separately; see [distribution guidance](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution). |
| MQTTnet | 5.2.0.1603 | MIT | [Project and source](https://github.com/dotnet/MQTTnet); package license copied under `THIRD-PARTY-LICENSES/`. |
| NAudio.Core and NAudio.Wasapi | 2.3.0 | MIT | [Project and source](https://github.com/naudio/NAudio); copyright Mark Heath. |
| NodaTime | 3.2.2 | Apache-2.0 | [Project and source](https://github.com/nodatime/nodatime); copyright Jon Skeet. |
| SQLitePCLRaw.bundle_winsqlite3, .core, and .provider.winsqlite3 | 2.1.11 | Apache-2.0 | [Project and source](https://github.com/ericsink/SQLitePCL.raw); copyright SourceGear, LLC. |
| LibreHardwareMonitorLib | 0.9.6 | [MPL-2.0](https://mozilla.org/MPL/2.0/) | [Source at the packaged commit](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/3d331e3370efb858411f19511373eff65a218701). The sensor helper is a separate executable. |
| BlackSharp.Core, DiskInfoToolkit, RAMSPDToolkit-NDD | 1.0.7, 1.1.2, 1.4.2 | [MPL-2.0](https://mozilla.org/MPL/2.0/) | [BlackSharp.Core](https://github.com/Blacktempel/BlackSharp), [DiskInfoToolkit](https://github.com/Blacktempel/DiskInfoToolkit), and [RAMSPDToolkit](https://github.com/Blacktempel/RAMSPDToolkit); package-declared MPL-2.0 terms. |
| HidSharp | 2.6.4 | Apache-2.0 | [Project](https://software.seekye.com/hidsharp); package license copied under `THIRD-PARTY-LICENSES/`. |
| Microsoft System.CodeDom, System.IO.Ports, and System.Management | 10.0.2, 10.0.3, and 10.0.2 | MIT | Microsoft NuGet packages used by the sensor helper. Package IDs and resolved versions are retained in `Setpiece.Sensors.deps.json`. |
| Mono.Posix.NETStandard | 1.0.0 | See package terms | [NuGet package license link](https://go.microsoft.com/fwlink/?linkid=869050). |

The .NET package licenses are recorded in the checked-in project references and the generated `.deps.json` files. Standard license texts are available from the linked upstream projects and [NuGet’s license catalog](https://licenses.nuget.org/).

## UI, fonts, and bundled browser extension

| Component | License | Notice/source |
|---|---|---|
| Angular, Angular Material, RxJS, and other bundled UI packages | MIT and Apache-2.0 as declared by each package | The production build’s `3rdpartylicenses.txt` contains the package-specific license text and copyright notices. |
| Roboto | SIL Open Font License 1.1 | [`THIRD-PARTY-LICENSES/Roboto-OFL-1.1.txt`](THIRD-PARTY-LICENSES/Roboto-OFL-1.1.txt); bundled with the UI. |
| Material Symbols | Apache-2.0 | [`THIRD-PARTY-LICENSES/Material-Symbols-Apache-2.0.txt`](THIRD-PARTY-LICENSES/Material-Symbols-Apache-2.0.txt); the original copy is also in `UI/public/fonts/`. |
| uBlock Origin Lite | GPL-3.0 | Bundled extension’s own `LICENSE.txt` and build instructions remain alongside the extension in `Setpiece/Assets/Extensions/uBOLite/`. [Upstream source and build](https://github.com/gorhill/uBlock). The packaged extension is a separate component; this project’s license does not replace its GPL terms. |

Some optional .NET integration libraries retain upstream notices inside their NuGet package metadata rather than shipping a top-level license file. Their exact identities, versions, license expressions, and source locations are listed above; the bundled package includes the corresponding notices or license references. Review each upstream license before redistributing modified third-party components.
