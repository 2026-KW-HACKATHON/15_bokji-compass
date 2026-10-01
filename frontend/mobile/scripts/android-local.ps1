param(
    [string]$Device = '',
    [string]$ApiBaseUrl = '',
    [int]$Port = 8081
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")
$sdkPath = $sdkCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools\adb.exe')) } | Select-Object -First 1
if (-not $sdkPath) { throw 'Android SDK를 찾지 못했습니다. Android Studio에서 SDK를 설치하거나 ANDROID_HOME을 설정하세요.' }
$env:ANDROID_HOME = $sdkPath
$studioJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
if (Test-Path (Join-Path $studioJava 'bin\java.exe')) { $env:JAVA_HOME = $studioJava }
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME에 Android 빌드용 JDK 경로를 설정하세요.' }
$adbPath = Join-Path $sdkPath 'platform-tools\adb.exe'

$deviceLines = & $adbPath devices
if ($LASTEXITCODE -ne 0) { throw 'adb를 실행하지 못했습니다.' }
$readyDevices = @($deviceLines | ForEach-Object { if ($_ -match '^(\S+)\s+device$') { $Matches[1] } })
if (-not $Device) {
    if ($readyDevices.Count -ne 1) { throw 'Android Studio의 Device Manager에서 에뮬레이터 하나를 켜세요. 여러 기기는 -Device로 지정하세요.' }
    $Device = $readyDevices[0]
}
if ($Device -notin $readyDevices) { throw "연결된 Android 기기를 찾지 못했습니다: $Device" }

# Expo CLI --device expects the AVD/model name; adb uses the serial number.
if ($Device -like 'emulator-*') {
    $avdLines = & $adbPath -s $Device emu avd name
    if ($LASTEXITCODE -ne 0) { throw 'AVD 이름을 확인하지 못했습니다.' }
    $expoDevice = ($avdLines | Select-Object -First 1).Trim()
} else {
    $deviceDetails = & $adbPath devices -l
    if ($LASTEXITCODE -ne 0) { throw '기기 정보를 확인하지 못했습니다.' }
    $deviceLine = $deviceDetails | Where-Object { $_ -match ('^' + [regex]::Escape($Device) + '\s') } | Select-Object -First 1
    $expoDevice = if ($deviceLine -match 'model:(\S+)') { $Matches[1] } else { "Device $Device" }
}

& $adbPath -s $Device reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) { throw '개발 서버 포트 연결에 실패했습니다.' }
if ($ApiBaseUrl) {
    $apiUri = [Uri]$ApiBaseUrl
    if (-not $apiUri.IsAbsoluteUri -or $apiUri.Scheme -notin @('http', 'https')) { throw 'API 주소는 http/https 절대 주소여야 합니다.' }
    $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl
    if ($apiUri.IsLoopback) {
        & $adbPath -s $Device reverse "tcp:$($apiUri.Port)" "tcp:$($apiUri.Port)"
        if ($LASTEXITCODE -ne 0) { throw 'API 포트 연결에 실패했습니다.' }
    }
}

Push-Location $mobileRoot
try {
    & npx.cmd expo run:android --device $expoDevice --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Android 빌드 또는 실행에 실패했습니다. 위 오류를 확인하세요.' }
} finally { Pop-Location }
