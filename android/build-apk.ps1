param([string]$AppUrl='https://chem-study-rho.vercel.app')
$ErrorActionPreference='Stop'
if($AppUrl -notmatch '^https://[a-zA-Z0-9.-]+(?::\d+)?/?$'){throw 'Vercel에 배포한 HTTPS 사이트 주소를 입력해 주세요.'}
$projectAndroidRoot=[System.IO.Path]::GetFullPath($PSScriptRoot)
$androidRoot=$projectAndroidRoot
if($projectAndroidRoot -match '[^\x00-\x7F]') {
  $androidRoot=[System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ChemStudyBuild\android'))
  if($androidRoot -match '[^\x00-\x7F]'){throw '한글이 없는 빌드 작업 경로를 정하지 못했습니다. 한글 없는 경로로 프로젝트를 복사한 뒤 실행해 주세요.'}
  Write-Output ('한글 없는 작업 폴더에서 빌드합니다: '+$androidRoot)
  New-Item -ItemType Directory -Path $androidRoot -Force | Out-Null
  & robocopy.exe $projectAndroidRoot $androidRoot /E /XD build .gradle /XF local.properties /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if($LASTEXITCODE -ge 8){throw '빌드 소스를 작업 폴더로 복사하지 못했습니다.'}
}
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
  $builtApk=Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
  if(-not (Test-Path -LiteralPath $builtApk)){throw '빌드는 끝났지만 APK 파일을 찾지 못했습니다.'}
  $outputApk=Join-Path $projectAndroidRoot 'app\build\outputs\apk\debug\app-debug.apk'
  if($builtApk -ne $outputApk){
    New-Item -ItemType Directory -Path (Split-Path -Parent $outputApk) -Force | Out-Null
    Copy-Item -LiteralPath $builtApk -Destination $outputApk -Force
  }
  Write-Output ('APK: '+$outputApk)
} finally {Pop-Location}
