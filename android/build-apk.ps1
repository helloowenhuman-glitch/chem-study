param([Parameter(Mandatory=$true)][string]$AppUrl)
$ErrorActionPreference='Stop'
if($AppUrl -notmatch '^https://[a-zA-Z0-9.-]+(?::\d+)?/?$'){throw 'Vercel에 배포한 HTTPS 사이트 주소를 입력해 주세요.'}
$androidRoot=$PSScriptRoot
$wrapperDirectory=Join-Path $androidRoot 'gradle\wrapper'
$wrapperPath=Join-Path $wrapperDirectory 'gradle-wrapper.jar'
New-Item -ItemType Directory -Path $wrapperDirectory -Force | Out-Null
if(-not (Test-Path -LiteralPath $wrapperPath)) {
  Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.11.1/gradle/wrapper/gradle-wrapper.jar' -OutFile $wrapperPath
}
$hashReply=Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-8.11.1-wrapper.jar.sha256'
$expectedHash=if($hashReply.Content -is [byte[]]){[System.Text.Encoding]::UTF8.GetString($hashReply.Content).Trim()}else{([string]$hashReply.Content).Trim()}
if((Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash.ToLowerInvariant()){throw 'Gradle Wrapper 검증에 실패했습니다.'}
$javaCommand=if($env:JAVA_HOME){Join-Path $env:JAVA_HOME 'bin\java.exe'}else{(Get-Command java -ErrorAction Stop).Source}
Push-Location -LiteralPath $androidRoot
try {
  & $javaCommand '-classpath' $wrapperPath 'org.gradle.wrapper.GradleWrapperMain' "-PappUrl=$AppUrl" 'assembleDebug'
  if($LASTEXITCODE -ne 0){throw 'APK 빌드에 실패했습니다. 위 오류를 확인해 주세요.'}
  Write-Output ('APK: '+(Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'))
} finally {Pop-Location}
