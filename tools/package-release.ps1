[CmdletBinding()]
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $repoRoot 'release'
$stagingParent = Join-Path $releaseRoot '.staging'
$stageRoot = Join-Path $stagingParent 'package'
$source = Join-Path $repoRoot 'Setpiece\bin\Release\net10.0-windows'
$project = [xml](Get-Content -LiteralPath (Join-Path $repoRoot 'Setpiece\Setpiece.csproj') -Raw)
$version = [string]$project.Project.PropertyGroup.Version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Setpiece.csproj must declare a three-part release version.' }
$archive = Join-Path $releaseRoot "Setpiece-$version-windows-x64.zip"

function Assert-ContainedPath([string]$Candidate, [string]$Parent) {
  $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $prefix = $parentPath + [IO.Path]::DirectorySeparatorChar
  if (-not $candidatePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing a path outside the intended release folder: $candidatePath"
  }
}

if (-not $SkipBuild) {
  & (Join-Path $repoRoot 'build.ps1')
}

if (-not (Test-Path -LiteralPath (Join-Path $source 'Setpiece.exe'))) {
  throw 'The Release executable is missing. Run .\build.ps1 first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'Setpiece.runtimeconfig.json'))) {
  throw 'The Release runtime configuration is missing.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'UI\dist\3rdpartylicenses.txt'))) {
  throw 'Angular third-party license bundle is missing. Run the production build first.'
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if ((Get-Item -LiteralPath $releaseRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'The release folder cannot be a link or junction.'
}
New-Item -ItemType Directory -Path $stagingParent -Force | Out-Null
if ((Get-Item -LiteralPath $stagingParent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'The staging folder cannot be a link or junction.'
}
Assert-ContainedPath $stageRoot $stagingParent
if (Test-Path -LiteralPath $stageRoot) {
  if ((Get-Item -LiteralPath $stageRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'The package staging folder cannot be a link or junction.'
  }
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

$appStage = Join-Path $stageRoot 'Setpiece'
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $appStage -Recurse
Get-ChildItem -LiteralPath $appStage -Filter '*.pdb' -File -Recurse | Remove-Item -Force
$sourceRootText = [IO.Path]::GetFullPath($repoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$assemblies = Get-ChildItem -LiteralPath $appStage -File -Recurse | Where-Object { $_.Extension -in '.exe', '.dll' }
foreach ($assembly in $assemblies) {
  $bytes = [IO.File]::ReadAllBytes($assembly.FullName)
  $ascii = [Text.Encoding]::ASCII.GetString($bytes)
  $unicode = [Text.Encoding]::Unicode.GetString($bytes)
  if ($ascii.IndexOf($sourceRootText, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $unicode.IndexOf($sourceRootText, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw "A compiled file contains this machine's source path: $($assembly.Name)"
  }
}

Copy-Item -LiteralPath (Join-Path $repoRoot 'docs\DISTRIBUTION-README.txt') -Destination (Join-Path $stageRoot 'README.txt')
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $stageRoot 'LICENSE')
Copy-Item -LiteralPath (Join-Path $repoRoot 'THIRD-PARTY-NOTICES.md') -Destination (Join-Path $stageRoot 'THIRD-PARTY-NOTICES.md')
$licenseStage = Join-Path $stageRoot 'THIRD-PARTY-LICENSES'
New-Item -ItemType Directory -Path $licenseStage -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $repoRoot 'THIRD-PARTY-LICENSES') -File | Copy-Item -Destination $licenseStage
Copy-Item -LiteralPath (Join-Path $repoRoot 'UI\dist\3rdpartylicenses.txt') -Destination (Join-Path $licenseStage 'UI-3rdpartylicenses.txt')

if (Test-Path -LiteralPath $archive) {
  if ((Get-Item -LiteralPath $archive -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'The output archive cannot be a link.'
  }
  Remove-Item -LiteralPath $archive -Force
}
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archive -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  $names = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  $required = @(
    'Setpiece/Setpiece.exe',
    'Setpiece/Setpiece.runtimeconfig.json',
    'README.txt',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'THIRD-PARTY-LICENSES/UI-3rdpartylicenses.txt',
    'THIRD-PARTY-LICENSES/Microsoft-WebView2-SDK-LICENSE.txt',
    'THIRD-PARTY-LICENSES/MQTTnet-LICENSE.txt',
    'THIRD-PARTY-LICENSES/HidSharp-LICENSE.txt'
  )
  $missing = @($required | Where-Object { $_ -notin $names })
  if ($missing.Count) { throw "Required package entries are missing: $($missing -join ', ')" }
  $unsafe = @($names | Where-Object { $_ -match '(^|/)\.\.?(/|$)|\.pdb$|(^|/)artifacts(/|$)|Browser-v2|\.log$' })
  if ($unsafe.Count) { throw "Unexpected developer or profile entries in archive: $($unsafe -join ', ')" }
  if ($names -notcontains 'Setpiece/Assets/Extensions/uBOLite/LICENSE.txt') {
    throw 'The bundled extension license is missing from the app output.'
  }
}
finally {
  $zip.Dispose()
}

$item = Get-Item -LiteralPath $archive
Write-Output "Package: $($item.FullName)"
Write-Output "Size: $([math]::Round($item.Length / 1MB, 2)) MiB"
Write-Output "Entries verified: $($names.Count)"
