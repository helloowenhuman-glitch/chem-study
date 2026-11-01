# 화학노트

개인 DT 리포트의 오답 개념을 복습하고 화학Ⅰ 심화 선수노트 1~10회차의 기존 문제를 푸는 웹사이트입니다. 승인된 아이보리·짙은 녹색 시안을 따릅니다. 웹사이트를 먼저 배포하고, 같은 사이트를 여는 안드로이드 WebView APK를 만드실 수 있습니다.

## 로컬 실행

Node.js 24를 사용합니다. 별도 npm 패키지 설치와 웹 빌드는 필요하지 않습니다.

```powershell
Set-Location -LiteralPath 'C:\Users\dhlee\OneDrive\바탕 화면\project\science_DT\web-app'
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:5173`을 여시면 됩니다. 새로운 체크아웃에서는 `.env.example`을 `.env.local`로 복사하고 Supabase 프로젝트 주소와 공개키를 넣어 주세요. 이미 존재하는 `.env.local`은 덮어쓰지 마세요.

## Supabase 설정

1. Supabase 프로젝트의 SQL Editor에서 `supabase/schema.sql` 전체를 실행해 주세요.
2. Authentication의 이메일 로그인을 사용합니다. 회원가입 이메일 확인을 사용하는 경우 인증 메일을 확인한 뒤 로그인해 주세요.
3. Authentication의 URL Configuration에서 Site URL을 배포한 Vercel 주소로 설정하고, Redirect URLs에 해당 주소와 `http://127.0.0.1:5173/`을 추가해 주세요. 이메일 인증과 비밀번호 재설정 링크에서 사용합니다.

테이블은 `study_profiles`, `report_links`, `study_answers`입니다. 모두 RLS를 켜며, 인증된 사용자는 `auth.uid() = user_id`인 자신의 기록만 읽고 추가할 수 있습니다. 프로필과 리포트 연결만 자신의 행을 수정할 수 있습니다. 개인 리포트 원본 전체 대신 오답 개념 요약만 저장합니다. 공개키는 관리자 키가 아니므로 테이블 생성에는 사용할 수 없습니다.

## Vercel 배포

GitHub의 `helloowenhuman-glitch/chem-study`에 이 폴더의 내용을 저장한 후 Vercel에서 Import해 주세요. 이 폴더가 저장소 루트일 때 Root Directory는 기본값입니다. 상위 `science_DT` 전체를 올리셨다면 Root Directory를 `web-app`으로 지정해 주세요.

Framework Preset은 `Other`이며, 저장된 `vercel.json`이 웹 출력 폴더 `public`과 Node.js API를 설정합니다. 빌드와 설치 명령은 비워 둡니다. 다음 환경 변수를 추가해 주세요.

| 변수 | 값 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 주소입니다. `/rest/v1/`은 붙이지 않습니다. |
| `SUPABASE_PUBLISHABLE_KEY` | 프로젝트의 Publishable key 또는 anon key입니다. |
| `REPORT_API_URL` | 기존 DT 리포트가 사용하는 유효한 Apps Script `/exec` 주소입니다. |

`.env.local`, 관리자 비밀키, 개인 리포트 데이터는 Git에 올리지 않습니다. 이 앱은 service-role 키를 요구하지 않습니다.

## 문제와 리포트

- DT 회차 정보: `Chemistreal/DT/appdata/plan_ch1s.json`을 사용합니다.
- DT OX: 선택한 `round_ch1s_XX.json`의 누적 정시 문항에서 고릅니다.
- exam 객관식: `donghyung/index.json`의 개념명과 선택 회차까지의 개념명을 맞춘 뒤 필요한 문제 파일만 읽습니다. 일치하지 않는 개념을 임의로 비슷한 문제에 연결하지 않습니다.
- 오답 복습: 리포트의 과거 오답과 앱에서 최근에 틀린 개념으로 구성합니다. 최근에 맞힌 개념은 대기 목록에서 제외하지만 개념 전체를 숙달했다고 판정하지는 않습니다.
- 자료에 연결되는 문제가 부족하면 실제로 찾은 문항 수만 제공합니다. 리포트와 문제 자료가 열리지 않으면 오류를 표시하며 예시 학생 기록으로 대체하지 않습니다.
- 정답과 해설은 원본 자료를 사용하며, 모든 원문에 대한 독립적인 화학 검산을 완료한 것은 아닙니다.

확인 당시 기존 DT 리포트의 Apps Script 주소는 정상 JSON 응답을 받지 못했습니다. 유효한 `REPORT_API_URL`이 설정되기 전에는 리포트 연결이 실패할 수 있습니다. 이 오류를 오답이 없는 것으로 처리하지 않습니다.

## 필요한 확인만 실행

```powershell
npm.cmd test
npm.cmd run check
```

핵심 자동 테스트 10개와 문법·배포 설정 검사입니다. 실제 계정 두 개 사이의 데이터 분리는 Supabase에 SQL을 적용하고 각 계정으로 로그인한 뒤 확인해 주세요.

## 로그인과 리포트 연결 유지

로그인 세션은 Supabase SDK의 영구 저장과 자동 갱신을 사용합니다. 기존 로그인 저장소 키를 유지하므로 이 변경 때문에 이미 로그인한 사용자를 로그아웃시키지 않습니다. WebView의 DOM 저장소를 사용하며 앱이 닫힐 때 로그인 저장소를 지우지 않습니다.

연결을 완료한 리포트의 주소와 오답 요약은 계정별 Supabase 테이블에 저장합니다. 앱을 다시 열면 저장된 세션으로 로그인 상태를 복원한 뒤 계정의 리포트 연결을 불러옵니다. APK에서는 같은 계정으로 최초 한 번 로그인해 주세요. 직접 로그아웃하거나 앱 데이터를 삭제하셨다면 재로그인이 필요하지만 서버에 저장된 리포트 연결과 풀이 기록은 같은 계정으로 다시 불러올 수 있습니다.

## 안드로이드 APK

웹사이트를 먼저 Vercel에 배포해 주세요. Android Studio에서 `android` 폴더를 여시거나 다음 명령으로 빌드하실 수 있습니다. SDK·Gradle 다운로드와 APK 빌드는 오래 걸릴 수 있어 사용자가 직접 실행하는 단계로 남겨 두었습니다.

JDK 17 이상과 Android SDK 35가 필요합니다. 빌드 스크립트가 설치된 Android Studio의 내장 JDK와 기본 SDK 경로를 자동으로 찾습니다. 기존 `android/local.properties`가 있으면 유지하며, 없을 때만 찾은 SDK 경로를 기록합니다.

```powershell
Set-Location -LiteralPath 'C:\Users\dhlee\OneDrive\바탕 화면\project\science_DT\web-app\android'
.\build-apk.ps1
```

기본 연결 주소는 `https://chem-study-rho.vercel.app`입니다. 다른 배포 주소를 사용하려면 `-AppUrl 'https://배포한주소.vercel.app'`을 지정해 주세요. 완료 파일은 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. 개인 설치용 debug APK이며, 앱 스토어 배포용 서명본은 아닙니다. HTTPS 사이트만 내부에서 열고, 외부 HTTPS 링크는 기본 브라우저로 전달합니다. 웹과 APK는 같은 계정으로 로그인하면 같은 학습 기록을 사용합니다. APK 빌드·설치·기기 동작은 실제 실행 전에는 확인한 것으로 표시하지 않습니다.
