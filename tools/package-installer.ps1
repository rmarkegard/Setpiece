[CmdletBinding()]
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project = [xml](Get-Content -LiteralPath (Join-Path $repoRoot 'Setpiece\Setpiece.csproj') -Raw)
$version = [string]$project.Project.PropertyGroup.Version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Setpiece.csproj must declare a three-part release version.' }
$archive = Join-Path $repoRoot "release\Setpiece-$version-windows-x64.zip"
$releaseRoot = Join-Path $repoRoot 'release'
$stageRoot = Join-Path $releaseRoot '.staging\installer'

if ($env:ISCC_PATH) { $compiler = $env:ISCC_PATH }
else {
  $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  $compiler = if ($command) { $command.Source } else { @(
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
}
if (-not $compiler -or -not (Test-Path -LiteralPath $compiler)) {
  throw 'Inno Setup 6 ISCC.exe is required. Install Inno Setup or set ISCC_PATH to its compiler.'
}

& (Join-Path $PSScriptRoot 'package-release.ps1') -SkipBuild:$SkipBuild
if (-not (Test-Path -LiteralPath $archive)) { throw "Release archive is missing: $archive" }
if ((Get-Item -LiteralPath $releaseRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The release folder cannot be a link or junction.' }
if (Test-Path -LiteralPath $stageRoot) {
  if ((Get-Item -LiteralPath $stageRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The installer staging folder cannot be a link or junction.' }
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $stageRoot
& $compiler "/DSourceDir=$stageRoot" "/DAppVersion=$version" (Join-Path $PSScriptRoot 'setpiece.iss')
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE" }
$installer = Join-Path $releaseRoot "Setpiece-$version-windows-x64-setup.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw "Installer is missing: $installer" }
Write-Output "Installer: $installer"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash)"
