# Steam first-run prerequisite. Do not reinstall an existing shared runtime.
$ErrorActionPreference = 'Stop'
function Test-WebView2 {
    $keys = @(
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    )
    foreach ($key in $keys) {
        $version = (Get-ItemProperty -LiteralPath $key -Name pv -ErrorAction SilentlyContinue).pv
        if ($version -and $version -match '^\d+\.\d+\.\d+\.\d+$' -and [version]$version -gt [version]'0.0.0.0') { return $true }
    }
    return $false
}
if (Test-WebView2) { exit 0 }
$installer = Join-Path $PSScriptRoot 'MicrosoftEdgeWebview2Setup.exe'
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
    throw 'The WebView2 installer must have a valid Microsoft signature.'
}
$install = Start-Process -FilePath $installer -ArgumentList '/silent', '/install' -Wait -PassThru
if (Test-WebView2) { exit 0 }
Write-Error "WebView2 installation failed (exit $($install.ExitCode)). Internet access is required for the first installation."
exit 1
