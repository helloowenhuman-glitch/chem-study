from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor

root = Path(__file__).resolve().parents[1]
doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Inches(8.5), Inches(11)
section.top_margin = section.bottom_margin = Inches(.8)
section.left_margin = section.right_margin = Inches(.85)
for style_name in ['Normal', 'Title', 'Heading 1', 'Heading 2']:
    style = doc.styles[style_name]
    style.font.name = '맑은 고딕'
    style.font.color.rgb = RGBColor(0, 0, 0)
doc.styles['Normal'].font.size = Pt(10)
doc.styles['Normal'].paragraph_format.space_after = Pt(6)
doc.add_heading('화학 복습 앱 구현 계획', 0)
doc.add_paragraph('2026년 11월 1일 승인된 화면 시안을 바탕으로 사용자님과 친구분들이 사용할 웹사이트를 구현합니다. 개인 리포트의 오답 개념 복습과 화학Ⅰ 심화 선수노트 1회부터 10회까지의 시험 대비 문제 풀이가 목적입니다. 이후 같은 웹사이트를 여는 안드로이드 WebView 프로젝트를 제공합니다.')
sections = [
('확정된 방향', 'Vercel에 웹사이트를 배포하고 Supabase의 이메일 로그인과 데이터베이스를 사용합니다. 아이보리 배경과 짙은 녹색을 유지합니다. 홈과 회차 선택과 문제 풀이 화면은 승인된 시안을 따릅니다. 문제를 새로 생성하지 않고 DT와 exam의 기존 문항과 해설을 불러옵니다.'),
('구현 방식', '추가 패키지 설치가 필요 없는 HTML CSS JavaScript와 Vercel Node.js 함수를 사용합니다. Supabase 공식 JavaScript SDK는 버전을 고정해 불러옵니다. 이 선택은 소규모 개인 학습 앱의 설치와 관리 부담을 줄이기 위한 구현 판단입니다. PWA 대신 사용자가 선택하신 웹사이트와 WebView APK 순서를 따릅니다.'),
('작업 1 데이터와 채점', 'server/core.js에서 리포트 링크 검증과 문항 정규화와 오답 개념 매칭과 채점을 구현합니다. server/data.js에서 공식 저장소의 필요한 파일만 읽고 짧게 캐시합니다. server/api.js와 api/index.js에서 설정과 문제와 리포트 연결과 답안 저장을 제공합니다. 리포트 연결 실패와 개념 매칭 실패를 빈 성과나 예시 데이터로 숨기지 않습니다.'),
('작업 2 화면과 계정', 'public/index.html과 styles.css와 app.js와 client.js에서 반응형 화면과 이메일 로그인과 리포트 링크 등록과 문제 풀이와 기록 조회를 연결합니다. 로그인 전에도 실제 기존 문제를 체험할 수 있지만 개인 기록은 저장하지 않습니다. 개인별 데이터는 서버의 토큰 검증과 Supabase RLS로 제한합니다.'),
('작업 3 데이터베이스와 배포', 'supabase/schema.sql에 리포트 연결과 답안 기록 테이블과 본인 기록에 대한 정책을 정의합니다. .env.local은 Git에서 제외합니다. 공개 저장소는 helloowenhuman-glitch/chem-study입니다. 서비스 역할 비밀키를 사용하거나 저장하지 않습니다. 배포 전에 실제 원격 리포트 API의 정상 응답과 Supabase 테이블 적용이 필요합니다.'),
('작업 4 안드로이드', 'android에 HTTPS 사이트만 내부에서 여는 WebView 프로젝트를 추가합니다. 외부 링크는 브라우저로 전달하고 로컬 파일 접근과 혼합 콘텐츠를 차단합니다. 뒤로 가기와 네트워크 오류 재시도를 제공합니다. 오래 걸리는 SDK 설치와 APK 빌드는 직접 실행하지 않고 명령어를 안내합니다.'),
('필요한 확인', '자동 테스트는 리포트 링크 허용 범위와 제외 문항 처리와 오답 개념 매칭과 채점과 로그인 없는 리포트 접근 차단과 공개 설정의 비밀키 미노출만 확인합니다. 문법 검사와 실제 회차 자료 읽기와 모바일 화면의 핵심 흐름을 한 번 확인합니다. 실제 계정 간 RLS 검증은 테이블 적용 후 가능합니다.'),
('현재 외부 조건', 'Supabase 주소와 공개키의 인증 API 응답은 확인했습니다. 기존 DT 리포트의 Apps Script 주소는 연결 확인 당시 정상 JSON을 받지 못했습니다. REPORT_API_URL 환경 변수로 교체할 수 있도록 준비합니다. APK의 실제 설치 결과는 빌드와 기기 확인 전까지 검증한 것으로 표시하지 않습니다.')]
for title, text in sections:
    doc.add_heading(title, level=1)
    doc.add_paragraph(text)
output = root / 'docs' / '구현계획.docx'
output.parent.mkdir(parents=True, exist_ok=True)
doc.save(output)
print(output)
