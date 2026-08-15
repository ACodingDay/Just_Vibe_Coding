# NetClumsy 发布包组装脚本
# 用法（管理员 PowerShell）: .\script\package.ps1
# 产物: dist\netclumsy-<version>\ 与 dist\netclumsy-<version>.zip
# 包含: netclumsy.exe + WinDivert.dll + WinDivert64.sys + config.txt + 许可证文本
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$verMatch = Select-String -Path (Join-Path $root "Cargo.toml") -Pattern '^version\s*=\s*"([^"]+)"'
$version = $verMatch.Matches[0].Groups[1].Value
if (-not $version) { throw "无法从 Cargo.toml 读取版本号" }

$env:WINDIVERT_PATH = Join-Path $root "windivert\WinDivert-2.2.2-A\x64"

Write-Host "==> cargo build --release (version $version)"
Push-Location $root
cargo build --release
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "release 构建失败" }

$dist = Join-Path $root "dist\netclumsy-$version"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Copy-Item "target\release\netclumsy.exe" $dist -Force
Copy-Item "windivert\WinDivert-2.2.2-A\x64\WinDivert.dll" $dist -Force
Copy-Item "windivert\WinDivert-2.2.2-A\x64\WinDivert64.sys" $dist -Force
Copy-Item "etc\config.txt" $dist -Force
Copy-Item "script\THIRD-PARTY-NOTICES.txt" $dist -Force
Copy-Item "windivert\WinDivert-2.2.2-A\LICENSE" (Join-Path $dist "LICENSE.WinDivert-LGPL.txt") -Force
Pop-Location

$zip = Join-Path $root "dist\netclumsy-$version.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip

Write-Host "==> 完成: $dist"
Write-Host "==> 压缩包: $zip"
