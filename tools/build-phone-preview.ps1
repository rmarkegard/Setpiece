param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\artifacts\phone-preview.html')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$docsRoot = Join-Path $repoRoot 'docs'
$sourcePath = Join-Path $docsRoot 'index.html'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)

$html = [System.IO.File]::ReadAllText($sourcePath, [System.Text.Encoding]::UTF8)
$cssPath = Join-Path $docsRoot 'site.css'
$css = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)
$html = $html.Replace('<link rel="stylesheet" href="site.css">', "<style>`n$css`n</style>")

$assets = [ordered]@{}
$matches = [regex]::Matches($html, '(?:href|src|poster)="([^"]+)"')
foreach ($match in $matches) {
    $reference = $match.Groups[1].Value
    if ($reference.StartsWith('#') -or $reference -match '^(https?:|mailto:|tel:|data:)') {
        continue
    }

    $assetPath = Join-Path $docsRoot ($reference.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        throw "Referenced page asset was not found: $reference"
    }

    $extension = [System.IO.Path]::GetExtension($assetPath).ToLowerInvariant()
    $mimeType = switch ($extension) {
        '.css'  { 'text/css' }
        '.html' { 'text/html' }
        '.md'   { 'text/markdown;charset=utf-8' }
        '.mp4'  { 'video/mp4' }
        '.png'  { 'image/png' }
        '.svg'  { 'image/svg+xml' }
        default { throw "Unsupported page asset type: $extension ($reference)" }
    }

    if (-not $assets.Contains($reference)) {
        $bytes = [System.IO.File]::ReadAllBytes($assetPath)
        $assets[$reference] = 'data:' + $mimeType + ';base64,' + [Convert]::ToBase64String($bytes)
    }

    foreach ($attribute in @('href', 'src', 'poster')) {
        $html = $html.Replace($attribute + '="' + $reference + '"', 'data-preview-attribute="' + $attribute + '" data-preview-asset="' + $reference + '"')
    }
}

$unresolved = [regex]::Matches($html, '(?:src|poster|href)="(?!data:|https?:|mailto:|tel:|#)([^"]+)"')
if ($unresolved.Count -gt 0) {
    throw "The standalone page still has unresolved local assets: $($unresolved | ForEach-Object { $_.Groups[1].Value } -join ', ')"
}

$assetMapJson = ConvertTo-Json -InputObject $assets -Compress
$bootstrap = @"
<script>
const previewAssets = $assetMapJson;
document.querySelectorAll('[data-preview-asset]').forEach((element) => {
  const key = element.getAttribute('data-preview-asset');
  const attribute = element.getAttribute('data-preview-attribute');
  if (previewAssets[key] && attribute) element.setAttribute(attribute, previewAssets[key]);
});
document.querySelectorAll('video').forEach((element) => element.load());
</script>
"@
$html = $html.Replace('</body>', $bootstrap + '</body>')

$outputFolder = Split-Path -Parent $resolvedOutput
[System.IO.Directory]::CreateDirectory($outputFolder) | Out-Null
[System.IO.File]::WriteAllText($resolvedOutput, $html, [System.Text.UTF8Encoding]::new($false))
Write-Output "Standalone phone preview: $resolvedOutput"
Write-Output "Bytes: $([System.IO.FileInfo]::new($resolvedOutput).Length)"
