# First-release key creation only. Never overwrites an existing key or credentials.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$credentialRoot = Join-Path $repoRoot 'credentials'
$credentialFile = Join-Path $credentialRoot 'android-release.json'
$keystore = Join-Path $credentialRoot 'bokji-compass-release.p12'
if ((Test-Path -LiteralPath $keystore) -or (Test-Path -LiteralPath $credentialFile)) { throw 'Release credentials already exist; keep the existing key for updates.' }
$javaRoot = $env:JAVA_HOME
if (-not $javaRoot) { $javaRoot = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr' }
$keytool = Join-Path $javaRoot 'bin/keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { throw 'Set JAVA_HOME to a JDK with keytool.' }
New-Item -ItemType Directory -Force $credentialRoot | Out-Null
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password = [Convert]::ToBase64String($bytes)
$previousPassword = $env:BOKJI_NEW_KEY_PASSWORD
$env:BOKJI_NEW_KEY_PASSWORD = $password
try {
    & $keytool -genkeypair -keystore $keystore -alias bokji-compass -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -storetype PKCS12 -dname 'CN=Bokji Compass Release, OU=Hackathon, O=Bokji Compass, C=KR' -storepass:env BOKJI_NEW_KEY_PASSWORD -keypass:env BOKJI_NEW_KEY_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed.' }
    $certificate = Join-Path $credentialRoot 'bokji-compass-release.cer'
    & $keytool -exportcert -keystore $keystore -alias bokji-compass -storepass:env BOKJI_NEW_KEY_PASSWORD -file $certificate
    if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed; preserve the generated keystore.' }
    $encrypted = ConvertFrom-SecureString (ConvertTo-SecureString $password -AsPlainText -Force)
    [ordered]@{
        keystore = $keystore
        alias = 'bokji-compass'
        certificate_sha256 = (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash.ToLower()
        password_dpapi = $encrypted
    } | ConvertTo-Json | Set-Content -LiteralPath $credentialFile -Encoding UTF8
    Write-Host "Release key created. Local credentials: $credentialFile"
    Write-Host 'Password is protected with Windows DPAPI for this Windows account. Preserve the keystore and credentials together.'
} finally {
    $env:BOKJI_NEW_KEY_PASSWORD = $previousPassword
    $password = $null
}
