param([string]$AppUrl='https://chem-study-rho.vercel.app')
$ErrorActionPreference='Stop'
if($AppUrl -notmatch '^https://[a-zA-Z0-9.-]+(?::\d+)?/?$'){throw 'Vercel에 배포한 HTTPS 사이트 주소를 입력해 주세요.'}
$androidRoot=$PSScriptRoot
$studioJava=Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\java.exe'
$javaCommand=if(Test-Path -LiteralPath $studioJava){$studioJava}elseif($env:JAVA_HOME){Join-Path $env:JAVA_HOME 'bin\java.exe'}else{(Get-Command java -ErrorAction Stop).Source}
if(-not (Test-Path -LiteralPath $javaCommand)){throw 'JDK 17 이상을 찾지 못했습니다. Android Studio의 JDK 경로를 확인해 주세요.'}
$taskJdkRoot=Split-Path -Parent (Split-Path -Parent $javaCommand)
$localProperties=Join-Path $androidRoot 'local.properties'
if(-not (Test-Path -LiteralPath $localProperties)) {
  $taskSdkRoot=if($env:ANDROID_HOME){$env:ANDROID_HOME}elseif($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}else{Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
  if(-not (Test-Path -LiteralPath (Join-Path $taskSdkRoot 'platforms\android-35\android.jar'))){throw 'Android SDK 35가 필요합니다. Android Studio의 SDK Manager에서 설치해 주세요.'}
  [System.IO.File]::WriteAllText($localProperties,('sdk.dir='+$taskSdkRoot.Replace('\','/')),[System.Text.UTF8Encoding]::new($false))
}
$wrapperDirectory=Join-Path $androidRoot 'gradle\wrapper'
$wrapperPath=Join-Path $wrapperDirectory 'gradle-wrapper.jar'
New-Item -ItemType Directory -Path $wrapperDirectory -Force | Out-Null
if(-not (Test-Path -LiteralPath $wrapperPath)) {
  Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.11.1/gradle/wrapper/gradle-wrapper.jar' -OutFile $wrapperPath
}
$hashReply=Invoke-WebRequest -UseBasicParsing -Uri 'https://services.gradle.org/distributions/gradle-8.11.1-wrapper.jar.sha256'
$expectedHash=if($hashReply.Content -is [byte[]]){[System.Text.Encoding]::UTF8.GetString($hashReply.Content).Trim()}else{([string]$hashReply.Content).Trim()}
if((Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash.ToLowerInvariant()){throw 'Gradle Wrapper 검증에 실패했습니다.'}
Push-Location -LiteralPath $androidRoot
try {
  & $javaCommand '-classpath' $wrapperPath 'org.gradle.wrapper.GradleWrapperMain' "-Dorg.gradle.java.home=$taskJdkRoot" "-PappUrl=$AppUrl" 'assembleDebug'
  if($LASTEXITCODE -ne 0){throw 'APK 빌드에 실패했습니다. 위 오류를 확인해 주세요.'}
  Write-Output ('APK: '+(Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'))
} finally {Pop-Location}
