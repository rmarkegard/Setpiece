$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$fixtureRoot=Join-Path $projectRoot 'artifacts\refresh-failure'
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'artifacts\production-build.log') -Destination (Join-Path $projectRoot 'artifacts\production-build-passed.log') -Force
Set-Content -LiteralPath (Join-Path $fixtureRoot 'node.cmd') -Encoding ascii -Value '@echo Intentional isolated refresh-failure fixture','@exit /b 23'
$buildFile=Join-Path $projectRoot 'build.ps1'
$originalTime=[IO.File]::GetLastWriteTimeUtc($buildFile)
$process=$null
try {
  [IO.File]::SetLastWriteTimeUtc($buildFile,[DateTime]::UtcNow)
  $start=[Diagnostics.ProcessStartInfo]::new((Join-Path $projectRoot 'Setpiece\bin\Release\net10.0-windows\Setpiece.exe'))
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
  $start.WorkingDirectory=$projectRoot
  $start.Environment['PATH']=$fixtureRoot+';'+$env:PATH
  $start.ArgumentList.Add('--data-root')
  $start.ArgumentList.Add($fixtureRoot)
  $process=[Diagnostics.Process]::Start($start)
  if(!$process.WaitForExit(15000)){throw 'Refresh launcher did not exit within 15 seconds.'}
  [IO.File]::SetLastWriteTimeUtc($buildFile,$originalTime)
  $deadline=[DateTime]::UtcNow.AddSeconds(20)
  $failureFound=$false
  do {
    Start-Sleep -Milliseconds 250
    $failureFound=Select-String -LiteralPath (Join-Path $projectRoot 'artifacts\production-build.log') -Pattern 'Production rebuild failed: The interface build failed.' -Quiet
  } while(!$failureFound -and [DateTime]::UtcNow -lt $deadline)
  if(!$failureFound){throw 'The expected rebuild failure was not logged.'}
  Write-Output "PASS: fault-injected launcher exited with code $($process.ExitCode); the expected build failure was logged."
} finally {
  [IO.File]::SetLastWriteTimeUtc($buildFile,$originalTime)
  if($process){
    $marker='-WaitForProcess '+$process.Id+' '
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($fixtureRoot) -and $_.CommandLine.Contains($marker)} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force}
  }
  Copy-Item -LiteralPath (Join-Path $projectRoot 'artifacts\production-build.log') -Destination (Join-Path $fixtureRoot 'build-failure.log') -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'artifacts\production-build-passed.log') -Destination (Join-Path $projectRoot 'artifacts\production-build.log') -Force
}
