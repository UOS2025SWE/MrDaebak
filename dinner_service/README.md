# 🍽️ 미스터 대박 디너 서비스

음성 주문과 AI 추천이 가능한 프리미엄 디너 서비스

## 📋 필수 설치 프로그램

### 1. Python 환경 (uv)
```bash
# Python uv 설치
pip install uv

# 프로젝트 Python 환경 설정
uv python install 3.12
uv sync
```

### 2. Node.js 환경
```bash
# Node.js 최신 버전 설치 (https://nodejs.org)
# 설치 후 버전 확인
node --version
npm --version
```

### 3. Docker Desktop
- Windows: https://www.docker.com/products/docker-desktop/ 에서 설치
- **중요**: 개발 중에는 Docker Desktop이 항상 실행되어 있어야 합니다. (.\start 하기전에 docker desktop을 반드시 켜야함)

### 4. VS Code (권장)
- VS Code 설치 후 Python Extension Pack 설치 
- 프로젝트 폴더 열기 → Ctrl+Shift+P → "Python: Select Interpreter" → `.venv/Scripts/python.exe` 선택

## 🚀 프로젝트 설정 (최초 1회만)

### 1. 프로젝트 클론
```bash
git clone https://github.com/Munine69/dinner_service.git
```

### 2. 의존성 설치
```bash
npm install
npm run setup
```

## ▶️ 개발 서버 실행 (매번 사용)

### 1. 개발 서버 실행
```bash
.\start
```

### 2. 접속
브라우저에서 http://localhost:8000 접속

## 🛑 서버 중지

```bash
.\stop
```

## 🔐 HTTPS 배포 (Caddy 리버스 프록시)

도메인으로 서비스를 공개하고 음성 주문(Web Speech API)을 사용하려면 HTTPS가 필수입니다. 프로젝트에는 인증서를 자동으로 발급해 주는 [Caddy](https://caddyserver.com/) 기반 리버스 프록시 구성이 포함되어 있습니다.

### 1. DNS와 포트 개방
- 도메인(A/CNAME)을 서버의 공인 IP에 연결합니다.
- 방화벽/클라우드 보안 그룹에서 **80, 443** 포트를 열어 둡니다.

### 2. `.env` 설정
`.env` 또는 배포 환경 변수에 아래 값을 추가합니다.

```bash
DOMAIN=www.example.com           # 실제 도메인
ACME_EMAIL=admin@example.com      # Let's Encrypt 알림용 이메일
PUBLIC_API_BASE=https://www.example.com/api
```

`PUBLIC_API_BASE`를 설정하면 프런트엔드가 동일한 도메인(`/api`)을 통해 백엔드와 통신하므로 혼합 콘텐츠나 CORS 문제가 발생하지 않습니다.

### 3. Caddy 컨테이너 실행

HTTPS 프로필을 활성화하여 Compose를 실행합니다.

```bash
docker compose --profile https up --build -d
```

Caddy는 자동으로 80→443 리디렉션을 설정하고, `/api` 경로는 FastAPI 백엔드(`backend:8000`)로, 그 외 경로는 Next.js 프런트(`frontend:3000`)로 프록시합니다. 인증서는 `/data` 볼륨에 저장되며 자동 갱신됩니다.

### 4. 로컬/테스트 환경
- 실제 도메인이 없다면 `mkcert` 등으로 로컬 CA를 설치한 뒤 Caddyfile에 `tls internal`을 추가해 자체 서명 인증서를 사용할 수 있습니다.
- 또는 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`에 개발 URL을 추가해 임시로 테스트할 수 있습니다.

## 💳 Mock 결제 시스템

- 가짜 결제는 기본적으로 **항상 성공(자동 승인)** 하도록 구성되어 있습니다.
- 결제 요청은 주문과 함께 저장되며 `mock_payments` 테이블에서 결제 이력(`transaction_id`, 카드 마스킹 번호 등)을 확인할 수 있습니다.
- 브라우저에서는 단순히 카드 번호/유효기간/CVC 필드만 채우면 되며, 특정 길이나 패턴(예: 16자리, 4242...)을 맞출 필요가 없습니다.
- 필요 시 `.env`에 `MOCK_PAYMENT_MODE=force_fail`을 넣어 결제를 강제로 실패시키고 예외 흐름을 테스트할 수 있습니다 (`always_success`가 기본값).

## 🏗️ 프로젝트 구조

```
Dinner Service/
├── main.py                 # 서버 진입점
├── backend/
│   ├── app.py              # FastAPI 애플리케이션
│   ├── models/            # 데이터베이스 모델 (향후 SQLAlchemy)
│   ├── services/          # 비즈니스 로직 클래스 (향후 구현)
│   └── routers/
│       ├── menu.py         # 메뉴 API 엔드포인트
│       └── admin.py        # 관리자 라우터 (향후 구현)
├── frontend/               # Next.js React 앱
│   ├── src/app/            # Next.js 앱 라우터
│   │   ├── menu/           # 메뉴 페이지
│   │   └── globals.css     # 전역 스타일
│   ├── tailwind.config.js  # Tailwind CSS 설정
│   └── package.json        # Node.js 의존성
├── .env                    # 환경변수 (로컬 설정)
├── .env.example            # 환경변수 템플릿
├── docker-compose.yml      # 개발용 데이터베이스
├── pyproject.toml          # Python 의존성 관리
└── package.json           # 통합 개발 스크립트
```

## 🎯 개발 진행 방식

### 현재 구현 상태
- ✅ **개발 환경 설정**: Python(uv) + Node.js + Docker
- ✅ **기본 백엔드**: FastAPI 서버 + 프록시 구조
- ✅ **기본 프론트엔드**: Next.js + React + TypeScript
- ✅ **통합 개발 환경**: 단일 명령어로 서버 실행
- ✅ **메뉴 페이지**: React 컴포넌트 + API 연동

### 향후 개발 계획
1. **데이터베이스 연동**: PostgreSQL + SQLAlchemy 모델
2. **인증 시스템**: JWT 토큰 기반 관리자 인증
3. **음성 주문**: Web Speech API + Gemini AI
4. **관리자 대시보드**: 실시간 주문 관리
5. **배달 시스템**: 조리시간 + 배달시간 계산

### 협업 방식
- **페어 프로그래밍**: 2명이 함께 전체 시스템 개발
- **단계별 구현**: 핵심 기능부터 고급 기능까지 점진적 확장

## 📚 기술 스택

- **Backend**: FastAPI + Python 3.12 + uv
- **Frontend**: Next.js 15 + React 18 + TypeScript  
- **Styling**: Tailwind CSS + Apple HIG 디자인 시스템
- **Database**: PostgreSQL 17
- **AI**: Google Gemini 2.5 Flash lite
- **Development**: Docker Compose + 통합 스크립트

## ⚠️ 개발 시 주의사항

1. **모든 명령어는 루트 "Dinner Service" 폴더에서 실행**
2. **Docker Desktop이 실행 중이어야 합니다**
3. **`.env` 파일은 Git에 커밋하지 마세요**

## 📋 Git 협업 가이드

### 매일 개발 시작 전 (필수!)
```cmd
# 최신 변경사항 받기
git pull

# 현재 상태 확인
git status
```

### 개발 완료 후 업로드
```cmd
# 1. 변경된 파일 확인
git status

# 2. 모든 변경사항 추가
git add .

# 3. 커밋 (의미있는 메시지 작성)
git commit -m "기능: 메뉴 API 엔드포인트 추가"

# 4. GitHub에 업로드
# 최초 Push 시 (한 번만)
git push -u origin main

# 그 이후 Push
git push
```

### 브랜치 작업 (기능별 개발)
```cmd
# 새로운 기능 브랜치 생성
git checkout -b feature/voice-recognition

# 브랜치 확인
git branch

# 메인 브랜치로 돌아가기
git checkout main

# 브랜치 병합 (기능 완료 후)
git merge feature/voice-recognition

# 브랜치 삭제 (병합 완료 후)
git branch -d feature/voice-recognition
```

### 충돌 해결
```cmd
# 충돌 발생 시 파일 확인
git status

# VS Code에서 충돌 파일을 열어 수정 후
git add [수정한파일명]
git commit -m "충돌 해결: 메뉴 데이터 구조 통합"
```

### 협업 시 주의사항 ⚠️

#### 1. 매일 개발 시작 전 필수 명령어
```cmd
git pull  # 팀원의 최신 변경사항 받기
```

#### 2. 동시 편집 방지
- **같은 파일을 동시에 수정하지 않기**
- **작업 전에 Discord/카톡으로 "app.py 수정 중" 등 공유**

#### 3. 의미있는 커밋 메시지
```cmd
# ❌ 나쁜 예시
git commit -m "수정"
git commit -m "버그픽스"

# ✅ 좋은 예시  
git commit -m "기능: 음성 주문 API 엔드포인트 추가"
git commit -m "수정: PostgreSQL 연결 오류 해결"
git commit -m "개선: 메뉴 조회 성능 최적화"
```

#### 4. .env 파일 절대 커밋 금지
- **.env 파일은 각자 로컬에서만 관리**
- **API 키, 비밀번호 등 민감정보 포함**
- **Git에 실수로 올리지 않도록 주의**

### VS Code Python 환경 설정
1. **Ctrl + Shift + P** → "Python: Select Interpreter"
2. **".venv/Scripts/python.exe"** 선택
3. **터미널에서 `uv sync` 실행하여 패키지 동기화**

---

**🎉 개발 시작 준비 완료!**

팀원과 함께 위 가이드를 따라하면 동일한 개발 환경에서 협업할 수 있습니다.
# test change
