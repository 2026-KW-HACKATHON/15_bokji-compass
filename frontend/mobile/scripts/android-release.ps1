param(
    [string]$ApiBaseUrl = '',
    [switch]$Unsigned,
    [switch]$SignOnly
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
if ($Unsigned -and $SignOnly) { throw 'Choose either -Unsigned or -SignOnly.' }
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $mobileRoot '../..'))
$releaseRoot = Join-Path $repoRoot 'output/android-release'
$sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA/Android/Sdk")
$sdkPath = $sdkCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools/adb.exe')) } | Select-Object -First 1
if (-not $sdkPath) { throw 'Android SDK를 설치하고 ANDROID_HOME을 설정하세요.' }
$env:ANDROID_HOME = $sdkPath
if (-not $env:JAVA_HOME) {
    $studioJava = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'
    if (Test-Path (Join-Path $studioJava 'bin/java.exe')) { $env:JAVA_HOME = $studioJava }
}
if (-not (Test-Path (Join-Path "$env:JAVA_HOME" 'bin/java.exe'))) { throw 'Android 빌드용 JAVA_HOME을 설정하세요.' }
$tools = Get-ChildItem (Join-Path $sdkPath 'build-tools') -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $tools) { throw 'Android SDK Build Tools가 필요합니다.' }
$python = Join-Path $repoRoot 'backend/.venv/Scripts/python.exe'
if (-not $Unsigned) {
    $credentialFile = Join-Path $repoRoot 'credentials/android-release.json'
    if (-not $env:BOKJI_ANDROID_KEYSTORE -and (Test-Path -LiteralPath $credentialFile)) {
        # A parent PowerShell 7 session can prepend incompatible modules to
        # PSModulePath. Load the security module of this actual shell explicitly.
        Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
        $local = Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json
        $secure = ConvertTo-SecureString $local.password_dpapi
        $plain = (New-Object System.Management.Automation.PSCredential('release', $secure)).GetNetworkCredential().Password
        $env:BOKJI_ANDROID_KEYSTORE = $local.keystore
        $env:BOKJI_ANDROID_KEY_ALIAS = $local.alias
        $env:BOKJI_ANDROID_CERT_SHA256 = $local.certificate_sha256
        $env:BOKJI_ANDROID_STORE_PASSWORD = $plain
        $env:BOKJI_ANDROID_KEY_PASSWORD = $plain
        $plain = $null
    }
    foreach ($name in @('BOKJI_ANDROID_KEYSTORE', 'BOKJI_ANDROID_KEY_ALIAS', 'BOKJI_ANDROID_STORE_PASSWORD', 'BOKJI_ANDROID_KEY_PASSWORD', 'BOKJI_ANDROID_CERT_SHA256')) {
        if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) { throw "$name 환경변수가 필요합니다. 비밀번호는 소스나 명령 인수에 넣지 마세요." }
    }
    if (-not (Test-Path -LiteralPath $env:BOKJI_ANDROID_KEYSTORE -PathType Leaf)) { throw '배포 keystore 파일을 찾지 못했습니다.' }
    if (($env:BOKJI_ANDROID_CERT_SHA256 -replace ':', '') -notmatch '^[a-fA-F0-9]{64}$') { throw '배포 인증서 SHA-256 지문 형식을 확인하세요.' }
    if (-not (Test-Path $python)) { throw 'APK 검사에 필요한 backend Python 환경을 먼저 준비하세요.' }
}

$previousApi = $env:EXPO_PUBLIC_API_BASE_URL
$previousRelease = $env:BOKJI_RELEASE
Push-Location $mobileRoot
try {
    $env:BOKJI_RELEASE = '1'
    if ($ApiBaseUrl) { $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl }
    & npm.cmd run release:check
    if ($LASTEXITCODE -ne 0) { throw '릴리스 설정 검사 실패' }
    # Expo loads .env in its own process. Gradle also needs the effective URL.
    if (-not $env:EXPO_PUBLIC_API_BASE_URL) {
        $env:EXPO_PUBLIC_API_BASE_URL = (& node scripts/check-release.mjs --print-api)
        if ($LASTEXITCODE -ne 0) { throw 'API 환경설정 로드 실패' }
    }
    if (-not $SignOnly) {
        & npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) { throw '타입 검사 실패' }
        & npm.cmd run lint
        if ($LASTEXITCODE -ne 0) { throw '린트 실패' }
        & npm.cmd test
        if ($LASTEXITCODE -ne 0) { throw '앱 회귀 검사 실패' }
        & npx.cmd expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'Android 설정 생성 실패' }
        Push-Location (Join-Path $mobileRoot 'android')
        try {
            # ARM devices and x86_64 emulators; release embeds JS and needs no Metro.
            & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64' --console=plain
            if ($LASTEXITCODE -ne 0) { throw 'Android 릴리스 빌드 실패' }
        } finally { Pop-Location }
    }
    $apk = Join-Path $mobileRoot 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
    if ($SignOnly) { $apk = Join-Path $releaseRoot 'bokji-compass-unsigned.apk' }
    if (-not (Test-Path $apk)) { throw '예상한 unsigned APK가 없습니다. 로컬 release 서명 설정을 확인하세요.' }
    New-Item -ItemType Directory -Force $releaseRoot | Out-Null
    if ($Unsigned) {
        Copy-Item -LiteralPath $apk -Destination (Join-Path $releaseRoot 'bokji-compass-unsigned.apk')
        Write-Host "빌드 검증용 APK: $releaseRoot/bokji-compass-unsigned.apk (서명 전에는 설치·배포할 수 없습니다.)"
    } else {
        $aligned = Join-Path $releaseRoot 'bokji-compass-aligned.apk'
        $candidate = Join-Path $releaseRoot 'bokji-compass-candidate.apk'
        & (Join-Path $tools.FullName 'zipalign.exe') -f -P 16 4 $apk $aligned
        if ($LASTEXITCODE -ne 0) { throw 'APK 정렬 실패' }
        & (Join-Path $tools.FullName 'apksigner.bat') sign --ks $env:BOKJI_ANDROID_KEYSTORE --ks-key-alias $env:BOKJI_ANDROID_KEY_ALIAS --ks-pass env:BOKJI_ANDROID_STORE_PASSWORD --key-pass env:BOKJI_ANDROID_KEY_PASSWORD --out $candidate $aligned
        if ($LASTEXITCODE -ne 0) { throw 'APK 서명 실패' }
        & $python (Join-Path $PSScriptRoot 'audit-apk.py') $candidate --signer-sha256 $env:BOKJI_ANDROID_CERT_SHA256 --report (Join-Path $releaseRoot 'apk-audit.json')
        if ($LASTEXITCODE -ne 0) { throw 'APK 배포 검사 실패. candidate APK와 보고서를 확인하세요.' }
        $verified = Join-Path $releaseRoot ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLower() + '.apk')
        Copy-Item -LiteralPath $candidate -Destination $verified
        Copy-Item -LiteralPath $candidate -Destination (Join-Path $releaseRoot 'bokji-compass.apk')
        Write-Host "서명·정적 검사 완료 APK: $verified"
    }
} finally {
    Pop-Location
    $env:EXPO_PUBLIC_API_BASE_URL = $previousApi
    $env:BOKJI_RELEASE = $previousRelease
}
