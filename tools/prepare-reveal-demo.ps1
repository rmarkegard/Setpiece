[CmdletBinding()]
param([switch]$Reset, [switch]$PrepareOnly)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $repoRoot 'release'
$demoRoot = Join-Path $releaseRoot 'demo-data'
$expectedDemoRoot = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'demo-data')).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resolvedDemoRoot = [IO.Path]::GetFullPath($demoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$separator = [IO.Path]::DirectorySeparatorChar
if (-not $resolvedDemoRoot.Equals($expectedDemoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    -not $resolvedDemoRoot.StartsWith([IO.Path]::GetFullPath($releaseRoot).TrimEnd($separator) + $separator, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to use a demo data path outside release/demo-data.'
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if ((Get-Item -LiteralPath $releaseRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'The release folder cannot be a link or junction.'
}
if (Test-Path -LiteralPath $demoRoot) {
  if ((Get-Item -LiteralPath $demoRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'The demo data folder cannot be a link or junction.'
  }
  if ($Reset) {
    $check = [IO.Path]::GetFullPath($demoRoot).TrimEnd($separator)
    if (-not $check.Equals($expectedDemoRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'The reset target did not match the expected demo folder.'
    }
    Remove-Item -LiteralPath $demoRoot -Recurse -Force
  }
}

$exe = Join-Path $repoRoot 'Setpiece\bin\Release\net10.0-windows\Setpiece.exe'
$profile = Join-Path $demoRoot 'Profiles\visual-review.json'
if (-not (Test-Path -LiteralPath $profile)) {
  $profileFolder = Split-Path -Parent $profile
  New-Item -ItemType Directory -Path $profileFolder -Force | Out-Null
  $demoProfile = [ordered]@{
    Name = 'Setpiece Reveal'
    MonitorIndex = 0
    WallpaperId = 'fjord-glass'
    AnimatedWallpaper = $false
    Zones = @(
      [ordered]@{ X = 0.0; Y = 0.0; Width = 0.5; Height = 1.0; Name = 'Workspace'; ContentKind = 'Application' }
      [ordered]@{ X = 0.5; Y = 0.0; Width = 0.5; Height = 0.5; Name = 'Clock'; ContentKind = 'Widget'; WidgetId = 'clock' }
      [ordered]@{ X = 0.5; Y = 0.5; Width = 0.5; Height = 0.5; Name = 'Weather'; ContentKind = 'Widget'; WidgetId = 'weather' }
    )
  }
  $json = ConvertTo-Json -InputObject $demoProfile -Depth 8
  [IO.File]::WriteAllText($profile, $json, [Text.UTF8Encoding]::new($false))
  if (-not (Test-Path -LiteralPath $profile)) { throw 'The isolated reveal profile was not created.' }
}

if (-not $PrepareOnly) {
  if (-not (Test-Path -LiteralPath $exe)) { throw 'The Release app is missing. Run .\build.ps1 first.' }
  $runArgs = '--skip-production-refresh --data-root "{0}"' -f $demoRoot
  Start-Process -FilePath $exe -ArgumentList $runArgs -WindowStyle Normal | Out-Null
  Write-Output "Opened Setpiece with isolated reveal data: $demoRoot"
} else {
  Write-Output "Prepared isolated reveal data: $demoRoot"
}
