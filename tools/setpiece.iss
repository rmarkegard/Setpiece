#ifndef SourceDir
  #error SourceDir must be supplied by package-installer.ps1
#endif
#ifndef AppVersion
  #error AppVersion must be supplied by package-installer.ps1
#endif

[Setup]
AppId={{C40EB3D6-42FC-40F8-A94D-45E85409E28A}
AppName=Setpiece
AppVersion={#AppVersion}
AppPublisher=Setpiece
DefaultDirName={localappdata}\Programs\Setpiece
DefaultGroupName=Setpiece
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
MinVersion=10.0.22000
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\Setpiece.exe
OutputDir={#SourcePath}\..\release
OutputBaseFilename=Setpiece-{#AppVersion}-windows-x64-setup

[Files]
Source: "{#SourceDir}\Setpiece\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#SourceDir}\README.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\THIRD-PARTY-LICENSES\*"; DestDir: "{app}\THIRD-PARTY-LICENSES"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Setpiece"; Filename: "{app}\Setpiece.exe"
Name: "{autodesktop}\Setpiece"; Filename: "{app}\Setpiece.exe"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "{app}\Setpiece.exe"; Description: "Launch Setpiece"; Flags: nowait postinstall skipifsilent
