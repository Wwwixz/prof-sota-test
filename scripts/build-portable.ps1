param([ValidatePattern('^v22\.\d+\.\d+$')][string]$NodeVersion = 'v22.22.0', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$portableSource = Split-Path $PSScriptRoot -Parent
$portableOutput = Join-Path $portableSource 'portable'
if (-not $SkipBuild) {
  Push-Location $portableSource
  try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить зависимости' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Ошибка сборки' }
  } finally { Pop-Location }
}
if (Test-Path -LiteralPath $portableOutput) { throw 'Каталог portable уже существует. Переименуйте его перед новой сборкой.' }
New-Item -ItemType Directory -Path $portableOutput | Out-Null
$portableRuntime = Join-Path $portableOutput 'runtime'
New-Item -ItemType Directory -Path $portableRuntime | Out-Null
foreach ($portableItem in @('dist','public','assets','scripts','index.html','questions.json','start.bat','package.json','package-lock.json','README.md','event-config.example.json')) {
  Copy-Item -LiteralPath (Join-Path $portableSource $portableItem) -Destination $portableOutput -Recurse
}
$portableArchive = Join-Path $portableRuntime 'node.zip'
$portableBase = "https://nodejs.org/dist/$NodeVersion"
$portableName = "node-$NodeVersion-win-x64.zip"
Write-Host 'Загружаем переносимый Node.js и проверяем SHA-256...'
Invoke-WebRequest -UseBasicParsing -Uri "$portableBase/$portableName" -OutFile $portableArchive
$portableChecksums = (Invoke-WebRequest -UseBasicParsing -Uri "$portableBase/SHASUMS256.txt").Content
$portableMatch = [regex]::Match($portableChecksums, "(?m)^([a-f0-9]{64})\s+" + [regex]::Escape($portableName) + '\r?$')
if (-not $portableMatch.Success -or (Get-FileHash -LiteralPath $portableArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $portableMatch.Groups[1].Value) { throw 'Контрольная сумма Node.js не совпала' }
Expand-Archive -LiteralPath $portableArchive -DestinationPath $portableRuntime
Copy-Item -LiteralPath (Join-Path $portableRuntime "node-$NodeVersion-win-x64/node.exe") -Destination $portableRuntime
$portableExtract = [IO.Path]::GetFullPath((Join-Path $portableRuntime "node-$NodeVersion-win-x64"))
if (-not $portableExtract.StartsWith([IO.Path]::GetFullPath($portableRuntime) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Неверный путь временной распаковки' }
Remove-Item -LiteralPath $portableExtract -Recurse -Force
Remove-Item -LiteralPath $portableArchive
Write-Host 'Загружаем cloudflared из официального репозитория...'
$portableRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest'
$portableAsset = $portableRelease.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
if (-not $portableAsset) { throw 'Windows-версия cloudflared не найдена' }
$portableTunnel = Join-Path $portableRuntime 'cloudflared.exe'
Invoke-WebRequest -UseBasicParsing -Uri $portableAsset.browser_download_url -OutFile $portableTunnel
if ($portableAsset.digest -and $portableAsset.digest.StartsWith('sha256:')) {
  if ((Get-FileHash -LiteralPath $portableTunnel -Algorithm SHA256).Hash.ToLowerInvariant() -ne $portableAsset.digest.Substring(7)) { throw 'Контрольная сумма cloudflared не совпала' }
} else { Write-Warning 'В ответе GitHub нет SHA-256. Проверьте подпись cloudflared перед мероприятием.' }
@{ node = $NodeVersion; cloudflared = $portableRelease.tag_name; architecture = 'win-x64' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $portableRuntime 'versions.json') -Encoding UTF8
Push-Location $portableOutput
try {
  & npm.cmd ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось подготовить рабочие зависимости' }
  & (Join-Path $portableRuntime 'node.exe') --check 'dist/server/index.js'
  if ($LASTEXITCODE -ne 0) { throw 'Проверка переносимого Node.js не прошла' }
} finally { Pop-Location }
Write-Host "Готово: $portableOutput. Скопируйте папку целиком на ноутбук Windows x64 и запустите start.bat."
