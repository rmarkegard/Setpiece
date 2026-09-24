param([switch]$Relaunch, [int]$WaitForProcess=0, [string]$DataRoot='')
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$projectRoot=$PSScriptRoot
if($WaitForProcess -gt 0){Wait-Process -Id $WaitForProcess -ErrorAction SilentlyContinue}
$logFolder=Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
Start-Transcript -Path (Join-Path $logFolder 'production-build.log') -Force
try {
  Push-Location (Join-Path $projectRoot 'UI')
  try { & node node_modules/@angular/cli/bin/ng.js build --configuration production 2>&1 | Out-Host; if($LASTEXITCODE -ne 0){throw 'The interface build failed.'} } finally {Pop-Location}
  & node --test (Join-Path $projectRoot 'UI\tests\domain.test.ts') (Join-Path $projectRoot 'UI\tests\widget-layout.test.ts') (Join-Path $projectRoot 'UI\tests\theme.test.ts') 2>&1 | Out-Host
  if($LASTEXITCODE -ne 0){throw 'The layout tests failed.'}
  & dotnet build (Join-Path $projectRoot 'Setpiece\Setpiece.csproj') -c Release 2>&1 | Out-Host
  if($LASTEXITCODE -ne 0){throw 'The native build failed.'}
  & dotnet run --project (Join-Path $projectRoot 'Verification\Setpiece.Verification.csproj') -c Release 2>&1 | Out-Host
  if($LASTEXITCODE -ne 0){throw 'The native verification failed.'}
  $releasePath=Join-Path $projectRoot 'Setpiece\bin\Release\net10.0-windows\Setpiece.exe'
  Write-Output "Canonical executable: $releasePath"
  if($Relaunch){$arguments=@('--skip-production-refresh');if($DataRoot){$arguments+=@('--data-root',('"'+$DataRoot+'"'))};Start-Process -FilePath $releasePath -ArgumentList $arguments -WindowStyle Hidden}
} catch {
  Write-Output ("Production rebuild failed: "+$_.Exception.Message)
  if($Relaunch){Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show(("Setpiece could not rebuild. Read the build log for the failure details:`n"+(Join-Path $logFolder 'production-build.log')),'Setpiece rebuild') | Out-Null}
  throw
} finally {Stop-Transcript}
