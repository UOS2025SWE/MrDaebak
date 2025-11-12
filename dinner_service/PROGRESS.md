# 🍽️ 미스터 대박 디너 서비스 - 개발 진행 상황

**마지막 업데이트**: 2025-11-10
**현재 완성도**: 약 95% (20/21 FR 완료)
**팀원용 문서**: 각 FR별 구현 내용, 사용된 서비스/API/페이지 상세 설명

---

## 📊 FR별 구현 상태 요약

| FR | 기능명 | 상태 | 완성도 |
|----|--------|------|--------|
| FR-001 | 회원가입 | ✅ 완료 | 100% |
| FR-002 | 로그인/로그아웃 | ✅ 완료 | 100% |
| FR-003 | 비밀번호 변경 | ✅ 완료 | 100% |
| FR-004 | 고객 정보 저장 | ✅ 완료 | 100% |
| FR-005 | 직원 정보 저장 | ✅ 완료 | 100% |
| FR-006 | VIP 할인 + 사이드디쉬 | ⚠️ 부분 | 50% |
| FR-007 | 메뉴 재고 관리 | ✅ 완료 | 100% |
| FR-008 | 주문 인터페이스 | ✅ 완료 | 100% |
| FR-009 | 메뉴 조회 | ✅ 완료 | 100% |
| FR-010 | 주문 생성 | ✅ 완료 | 100% |
| FR-011 | 주문 커스터마이징 | ✅ 완료 | 100% |
| FR-012 | 배달 정보 입력 | ✅ 완료 | 100% |
| FR-013 | Mock 결제 시스템 | ✅ 완료 | 100% |
| FR-014 | 과거 주문 조회 | ✅ 완료 | 100% |
| FR-015 | 간편 재주문 | ✅ 완료 | 100% |
| FR-016 | 직원의 주문 조회 | ✅ 완료 | 100% |
| FR-017 | 주문 처리 상태 관리 | ✅ 완료 | 100% |
| FR-018 | 직원의 주문 상세 정보 | ✅ 완료 | 100% |
| FR-019 | 단골 고객 할인 | ✅ 완료 | 100% |
| FR-020 | ASR 챗봇 주문 | ✅ 완료 | 100% |
| FR-021 | 커스텀 데코레이션 | ❌ 미구현 | 0% |

---

## ✅ FR-001: 회원가입

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/login_service.py` → `LoginService.register_user()`
- **주요 기능**:
  - bcrypt 비밀번호 해싱 (보안)
  - 이메일 중복 검증
  - users 테이블에 고객 정보 저장

### 🌐 사용 API 엔드포인트
- **POST** `/api/auth/register`
  - Request Body:
    ```json
    {
      "email": "user@example.com",
      "password": "password123",
      "name": "홍길동",
      "phone": "010-1234-5678",
      "address": "서울시 강남구"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "message": "회원가입 성공"
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/register/page.tsx`
- **주요 기능**:
  - 회원가입 폼 (이메일, 비밀번호, 이름, 전화번호, 주소)
  - 유효성 검증 (이메일 형식, 비밀번호 길이)
  - 회원가입 성공 시 로그인 페이지로 이동

### 📝 구현 세부사항
- bcrypt를 사용한 비밀번호 해싱으로 보안 강화
- 이메일 중복 시 에러 메시지 반환
- 회원가입 성공 시 자동으로 customer_loyalty 테이블에 레코드 생성 (order_count=0)

---

## ✅ FR-002: 로그인/로그아웃

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/login_service.py` → `LoginService.authenticate_user()`
- **주요 기능**:
  - JWT 토큰 생성 (24시간 유효)
  - 비밀번호 검증 (bcrypt)
  - 관리자 권한 확인 (is_admin)

### 🌐 사용 API 엔드포인트
- **POST** `/api/auth/login`
  - Request Body:
    ```json
    {
      "email": "user@example.com",
      "password": "password123"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "access_token": "JWT_TOKEN",
      "token_type": "bearer",
      "expires_in": 86400,
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "is_admin": false,
        "role": "customer"
      }
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/login/page.tsx`
- **전역 상태**: `frontend/src/contexts/AuthContext.tsx`
- **주요 기능**:
  - 로그인 폼
  - JWT 토큰 localStorage 저장
  - AuthContext를 통한 전역 인증 상태 관리
  - 로그아웃 시 토큰 삭제 및 상태 초기화

### 📝 구현 세부사항
- JWT 토큰 기반 인증으로 stateless 세션 관리
- 토큰은 localStorage에 저장되어 새로고침 시에도 로그인 상태 유지
- AuthContext를 통해 모든 페이지에서 사용자 정보 접근 가능
- 로그아웃 시 `/api/auth/logout` 호출 (현재는 프론트에서만 처리)

---

## ✅ FR-003: 비밀번호 변경

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/login_service.py` → `LoginService.change_password()`
- **주요 기능**:
  - 현재 비밀번호 검증
  - 새 비밀번호 bcrypt 해싱
  - users 테이블 업데이트

### 🌐 사용 API 엔드포인트
- **POST** `/api/auth/change-password`
  - Headers: `Authorization: Bearer {JWT_TOKEN}`
  - Request Body:
    ```json
    {
      "current_password": "old123",
      "new_password": "new123"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "message": "비밀번호가 성공적으로 변경되었습니다"
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **컴포넌트**: `frontend/src/components/ChangePasswordModal.tsx`
- **사용 위치**: `frontend/src/app/profile/page.tsx` (프로필 페이지 내 모달)
- **주요 기능**:
  - 현재 비밀번호 입력
  - 새 비밀번호 입력 및 확인
  - 비밀번호 불일치 시 에러 메시지

### 📝 구현 세부사항
- JWT 토큰 검증으로 본인만 비밀번호 변경 가능
- 현재 비밀번호 불일치 시 변경 불가
- 새 비밀번호는 bcrypt로 해싱하여 저장

---

## ✅ FR-004: 고객 정보 저장

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/login_service.py` → `LoginService.get_user_profile()`
- **주요 기능**:
  - users 테이블에서 사용자 정보 조회
  - customer_loyalty 테이블과 조인하여 주문 횟수 조회

### 🌐 사용 API 엔드포인트
- **GET** `/api/auth/profile/{user_id}`
  - Headers: `Authorization: Bearer {JWT_TOKEN}`
  - Response:
    ```json
    {
      "success": true,
      "profile": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "홍길동",
        "phone": "010-1234-5678",
        "address": "서울시 강남구",
        "total_orders": 8,
        "created_at": "2025-09-05T10:00:00"
      }
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/profile/page.tsx`
- **주요 기능**:
  - 사용자 정보 표시 (이메일, 이름, 전화번호, 주소)
  - 총 주문 수 표시
  - 회원 등급 표시 (신규고객/단골/VIP)
  - 할인 혜택 정보 표시
  - 최근 주문 내역 표시

### 📝 구현 세부사항
- users 테이블에 모든 고객 정보 저장
- customer_loyalty 테이블과 LEFT JOIN으로 주문 횟수 조회
- 프로필 페이지에서 사용자 정보 조회 및 표시

---

## ✅ FR-005: 직원 정보 저장

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/login_service.py` (users 테이블 통합 관리)
- **테이블**: `users` (user_type 필드로 STAFF 구분)
- **주요 기능**:
  - 직원 계정 생성 (회원가입 시 user_type='STAFF')
  - 직원 정보 조회 및 수정
  - is_admin 권한 관리

### 🌐 사용 API 엔드포인트
- **POST** `/api/auth/register` - 직원 계정 생성 (user_type='STAFF')
- **GET** `/api/auth/profile/{user_id}` - 직원 정보 조회
- **PUT** `/api/auth/profile/{user_id}` - 직원 정보 수정

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/staff/page.tsx` - 직원 전용 페이지
- **주요 기능**:
  - 직원 계정으로 로그인
  - 직원 정보 표시
  - 주문 관리 인터페이스 접근

### 📝 구현 세부사항
- users 테이블에 직원 정보 통합 저장 (고객과 동일 테이블)
- user_type 필드로 CUSTOMER/STAFF 구분
- is_admin=true인 직원은 관리자 권한
- JWT 토큰 기반 인증으로 직원/고객 권한 구분

---

## ⚠️ FR-006: VIP 할인 + 사이드디쉬

### 📌 구현 상태: **부분 완료 (50%)**

### ✅ 완료된 부분: VIP 할인 시스템

#### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/discount_service.py` → `DiscountService`
- **주요 기능**:
  - 주문 횟수 기반 자동 할인
  - 5회 이상: 10% 할인 (단골)
  - 10회 이상: 20% 할인 (VIP)

#### 🌐 사용 API 엔드포인트
- **GET** `/api/discount/{user_id}`
  - Response:
    ```json
    {
      "success": true,
      "data": {
        "eligible": true,
        "discount_rate": 0.1,
        "customer_type": "단골",
        "total_orders": 8,
        "discount_message": "⭐ 단골 고객님, 10% 할인 적용!"
      }
    }
    ```

#### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/profile/page.tsx`
- **주요 기능**:
  - 할인 혜택 정보 표시
  - 다음 등급까지 남은 주문 수 표시

#### 📝 구현 세부사항 (2025-10-05 수정 완료)
- **할인 적용 시점**: 주문 생성 시 자동 계산
- **DB 저장**: 할인된 가격을 orders.total_price에 저장
- **트랜잭션 관리**: order_service.py에서 통합 관리
- **프론트엔드**: DB에 저장된 가격을 그대로 표시

### ❌ 미완성 부분: 사이드디쉬 무료 제공

#### ⚠️ 미완성 세부사항
1. **사이드디쉬 자동 추가 로직 없음**
   - VIP 고객 주문 시 사이드디쉬 자동 추가 기능 필요
   - `order_service.py`에 VIP 사이드디쉬 로직 추가 필요

2. **사이드디쉬 메뉴 정보 부족**
   - 어떤 사이드디쉬를 제공할지 정의 필요
   - `menu_ingredients.json`에 사이드디쉬 목록 추가 필요

3. **프론트엔드 표시 없음**
   - VIP 고객에게 "무료 사이드디쉬 포함" 메시지 표시 필요
   - 주문 상세에 사이드디쉬 항목 표시 필요

---

## ✅ FR-007: 메뉴 재고 관리

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/inventory_service.py` → `InventoryService`
- **테이블**: `ingredients`, `store_inventory`
- **주요 기능**:
  - 재료 재고 조회
  - 주문 시 재료 자동 차감
  - 재고 부족 알림
  - 재료 보충 기능

### 🌐 사용 API 엔드포인트
- **GET** `/api/inventory/list` - 재료 목록 조회
- **GET** `/api/inventory/stock/{ingredient_id}` - 특정 재료 재고 조회
- **POST** `/api/inventory/consume` - 주문 시 재료 차감 (자동 호출)
- **POST** `/api/inventory/restock` - 재료 보충
- **GET** `/api/inventory/low-stock` - 재고 부족 알림

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/admin/dashboard/page.tsx` - 관리자 대시보드 (재고 섹션)
- **주요 기능**:
  - 재고 현황 대시보드
  - 재료별 재고량 표시
  - 재고 부족 경고 표시
  - 재료 보충 입력 폼

### 📝 구현 세부사항
- 주문 생성 시 `order_service.py`에서 자동으로 재료 차감
- 재고 부족 시 주문 거부 (트랜잭션 롤백)
- store_inventory 테이블에 재고 이력 관리
- 재고 부족 알림 기능 (최소 재고량 이하 시)

---

## ✅ FR-008: 주문 인터페이스

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/menu_service.py` → `MenuService`
- **주요 기능**:
  - JSON 파일 기반 메뉴 조회
  - 스타일별 가격/조리시간 조회

### 🌐 사용 API 엔드포인트
- **GET** `/api/menu/list` - 전체 메뉴 목록
- **GET** `/api/menu/{menu_code}` - 특정 메뉴 상세 정보

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/menu/page.tsx`
- **주요 기능**:
  - 4가지 디너 메뉴 카드 표시
  - 스타일 선택 (Simple/Grand/Deluxe)
  - 수량 선택
  - 주문하기 버튼 (checkout 페이지로 이동)

### 📝 구현 세부사항
- 메뉴 정보는 `backend/data/menu_info.json`에서 로드
- 각 메뉴별 스타일별 가격 및 조리시간 표시
- 샴페인 디너는 Simple 스타일 없음 (Grand/Deluxe만 제공)

---

## ✅ FR-009: 메뉴 조회

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/menu_service.py` → `MenuService.get_all_menus()`
- **주요 기능**:
  - `menu_info.json`, `menu_ingredients.json`, `operation_config.json` 통합 조회
  - 메뉴별 스타일별 정보 제공

### 🌐 사용 API 엔드포인트
- **GET** `/api/menu/list`
  - Response:
    ```json
    {
      "success": true,
      "menus": [
        {
          "code": "valentine",
          "name": "발렌타인 디너",
          "description": "로맨틱한 발렌타인 디너",
          "styles": {
            "simple": {
              "name": "심플",
              "price": 30000,
              "cooking_time": 25
            },
            "grand": { ... },
            "deluxe": { ... }
          }
        }
      ]
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/menu/page.tsx`
- **주요 기능**:
  - 메뉴 카드 형태로 표시
  - 각 메뉴의 설명 및 이미지
  - 스타일별 가격 표시
  - 조리시간 표시

### 📝 구현 세부사항
- JSON 파일 기반으로 메뉴 정보 관리
- 메뉴 추가/수정 시 JSON 파일만 수정하면 됨
- DB에는 menu_items 테이블도 존재하지만 현재는 JSON 우선 사용

---

## ✅ FR-010: 주문 생성

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/order_service.py` → `OrderService.create_order()`
- **주요 기능**:
  - 주문번호 생성 (ORD-YYYY-XXX 형식)
  - 가격 계산 (할인 적용)
  - orders 테이블 및 order_items 테이블 저장
  - customer_loyalty 업데이트

### 🌐 사용 API 엔드포인트
- **POST** `/api/orders/create`
  - Request Body:
    ```json
    {
      "dinner_code": "valentine",
      "style": "deluxe",
      "quantity": 1,
      "user_id": "uuid",
      "delivery_address": "서울시 강남구",
      "special_requests": "알레르기 주의"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "order": {
        "id": "uuid",
        "order_number": "ORD-2025-029",
        "status": "RECEIVED",
        "total_price": 36000,
        "pricing": {
          "original_price": 40000,
          "discount_rate": 0.1,
          "final_price": 36000
        }
      }
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/checkout/page.tsx`
- **주요 기능**:
  - 주문 정보 확인
  - 배송지 입력
  - 결제 정보 입력
  - 주문 생성 버튼

### 📝 구현 세부사항
- 트랜잭션으로 orders + order_items + customer_loyalty 동시 처리
- 할인 자동 적용 (discount_service 연동)
- WebSocket으로 직원에게 실시간 알림 (구현됨)
- 조리시간 및 배달시간 자동 계산

---

## ✅ FR-011: 주문 커스터마이징

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/order_service.py`
- **테이블**: `order_item_customizations`
- **주요 기능**:
  - 재료 수량 변경 (wine +2개 등)
  - 특별 요청사항 저장

### 🌐 사용 API 엔드포인트
- **POST** `/api/orders/create` (커스터마이징 포함)
  - Request Body에 customizations 추가:
    ```json
    {
      "dinner_code": "valentine",
      "style": "deluxe",
      "customizations": {
        "wine": 3,
        "premium_steak": 2
      }
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/checkout/page.tsx`
- **주요 기능**:
  - 재료별 수량 조절 UI
  - 추가 비용 계산 및 표시

### 📝 구현 세부사항
- order_item_customizations 테이블에 커스터마이징 정보 저장
- 재료별 change_type (ADD/REMOVE/CHANGE_QUANTITY) 구분
- 과거 주문 재주문 시 커스터마이징 포함 여부 선택 가능

---

## ✅ FR-012: 배달 정보 입력

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/order_service.py`
- **테이블**: `orders.delivery_address`

### 🌐 사용 API 엔드포인트
- **POST** `/api/orders/create`
  - delivery_address 필드로 배송지 저장

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/checkout/page.tsx`
- **주요 기능**:
  - 기본 배송지 자동 로드 (users.address)
  - 배송지 직접 입력 모드
  - 기본 배송지로 저장 체크박스

### 📝 구현 세부사항
- 사용자가 저장한 기본 배송지(users.address)를 자동으로 불러옴
- 다른 주소 입력 시 orders.delivery_address에만 저장
- "기본 배송지로 저장" 체크 시 users.address도 업데이트

---

## ✅ FR-013: Mock 결제 시스템

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/payment_service.py` → `PaymentService`
- **주요 기능**:
  - Mock 결제 처리 (100% 승인)
  - 결제 정보 저장 (payments 테이블)
  - 거래 번호 생성

### 🌐 사용 API 엔드포인트
- **POST** `/api/checkout/process`
  - Request Body:
    ```json
    {
      "order_data": {
        "dinner_code": "valentine",
        "style": "deluxe",
        "quantity": 1,
        "delivery_address": "서울시 강남구"
      },
      "payment_data": {
        "card_number": "1234-5678-9012-3456",
        "card_holder": "홍길동",
        "expiry_date": "12/25",
        "cvv": "123"
      }
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "order_id": "uuid",
      "order_number": "ORD-2025-029",
      "transaction_id": "TXN-20251005123456",
      "amount": 36000
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/checkout/page.tsx`
- **완료 페이지**: `frontend/src/app/order-complete/[order_id]/page.tsx`
- **주요 기능**:
  - 카드 정보 입력 폼
  - 카드 번호 마스킹 (****-****-****-1234)
  - 결제 완료 페이지 (주문번호, 거래번호 표시)

### 📝 구현 세부사항
- Mock 결제이므로 실제 결제 연동 없음 (100% 승인)
- 카드 정보는 마스킹하여 표시 (보안)
- payments 테이블에 결제 정보 저장
- 주문 완료 페이지에서 주문 내역 확인 가능

---

## ✅ FR-014: 과거 주문 조회

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/order_service.py` → `OrderService.get_user_orders()`
- **주요 기능**:
  - 사용자별 주문 내역 조회 (최신순)
  - 주문 상태, 메뉴, 가격, 배송지 정보 제공
  - 커스터마이징 정보 포함

### 🌐 사용 API 엔드포인트
- **GET** `/api/orders/user/{user_id}`
  - Headers: `Authorization: Bearer {JWT_TOKEN}`
  - Response:
    ```json
    {
      "success": true,
      "orders": [
        {
          "id": "uuid",
          "order_number": "ORD-2025-029",
          "status": "RECEIVED",
          "menu_name": "발렌타인 디너",
          "style": "deluxe",
          "quantity": 1,
          "total_price": 36000,
          "delivery_address": "서울시 강남구",
          "order_date": "2025-10-05 12:32",
          "customizations": {
            "wine": 3
          }
        }
      ]
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/orders/page.tsx`
- **주요 기능**:
  - 주문 목록 표시 (카드 형태)
  - 주문 상태별 색상 구분
  - 주문 상세 모달 (재료 구성 표시)
  - 재주문 버튼 (완료된 주문만)

### 📝 구현 세부사항
- 사용자별로 주문 내역 조회 (JWT 토큰으로 본인 확인)
- 주문 상태: RECEIVED(접수) → PREPARING(조리중) → DELIVERING(배달중) → COMPLETED(완료)
- 커스터마이징 정보를 order_item_customizations 테이블에서 조회하여 표시
- WebSocket 연동으로 실시간 주문 상태 업데이트

---

## ✅ FR-015: 간편 재주문

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **서비스**: `backend/services/order_service.py` (기존 주문 생성 API 재사용)
- **주요 기능**:
  - 과거 주문 정보를 그대로 사용하여 새 주문 생성
  - 커스터마이징 정보 포함 재주문 가능

### 🌐 사용 API 엔드포인트
- **POST** `/api/orders/create` (동일한 API 사용)
  - 프론트엔드에서 과거 주문 정보를 그대로 전달

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/orders/page.tsx`
- **주요 기능**:
  - "재주문" 버튼 (완료된 주문만 표시)
  - 클릭 시 checkout 페이지로 이동 (과거 주문 정보 자동 입력)
  - 커스터마이징 포함 여부 선택 가능

### 📝 구현 세부사항
- 재주문 버튼 클릭 시 URL 파라미터로 메뉴, 스타일, 수량, 커스터마이징 전달
- checkout 페이지에서 해당 정보를 자동으로 불러와서 표시
- 사용자는 배송지만 확인하고 바로 주문 가능 (원클릭 재주문)

---

## ✅ FR-016: 직원의 주문 조회

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **라우터**: `backend/routers/order.py` → `get_all_orders_for_staff()`
- **주요 기능**:
  - 전체 주문 목록 조회 (고객 정보 포함)
  - 커스터마이징 정보 포함
  - JWT 토큰 검증 (STAFF/MANAGER 권한)
  - 상태별 필터링 가능

### 🌐 사용 API 엔드포인트
- **GET** `/api/orders/staff/all`
  - Headers: `Authorization: Bearer {JWT_TOKEN}`
  - Query Parameters (선택):
    - `order_status`: RECEIVED, PREPARING, DELIVERING, COMPLETED
  - Response:
    ```json
    {
      "success": true,
      "orders": [
        {
          "id": "uuid",
          "order_number": "ORD-2025-029",
          "customer_name": "홍길동",
          "customer_phone": "010-1234-5678",
          "status": "PREPARING",
          "menu_name": "발렌타인 디너",
          "menu_code": "valentine",
          "style": "deluxe",
          "quantity": 1,
          "total_price": 36000,
          "delivery_address": "서울시 강남구",
          "customizations": { "wine": 3 }
        }
      ],
      "total_count": 10
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/dashboard/staff/page.tsx` - 직원용 대시보드
- **주요 기능**:
  - 조리/배달 2컬럼 레이아웃
  - 주문 카드 형태로 표시
  - 실시간 통계 (전체/조리/배달/완료 주문 수)
  - WebSocket 실시간 업데이트 (useWebSocket 훅 사용)
  - 커스터마이징 정보 표시

### 📝 구현 세부사항
- JWT 토큰으로 STAFF/MANAGER 권한 검증 (user_type 확인)
- 주문 조회 시 고객 정보, 메뉴, 커스터마이징 모두 JOIN
- WebSocket으로 신규 주문/상태 변경 실시간 알림
- 프론트엔드에서 조리/배달 탭 분리 관리

---

## ✅ FR-017: 주문 처리 상태 관리

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **라우터**: `backend/routers/order.py` → `update_order_status()`
- **주요 기능**:
  - 주문 상태 변경 (RECEIVED → PREPARING → DELIVERING → COMPLETED)
  - JWT 토큰 검증 (STAFF/MANAGER 권한)
  - WebSocket 실시간 브로드캐스트 (직원 + 고객)
  - 트랜잭션 처리

### 🌐 사용 API 엔드포인트
- **PATCH** `/api/orders/{order_id}/status`
  - Headers: `Authorization: Bearer {JWT_TOKEN}`
  - Request Body:
    ```json
    {
      "new_status": "PREPARING"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "order": {
        "id": "uuid",
        "order_number": "ORD-2025-029",
        "status": "PREPARING"
      }
    }
    ```

### 🎨 사용 프론트엔드 페이지
- **페이지**: `frontend/src/app/dashboard/staff/page.tsx` - OrderCard 컴포넌트
- **주요 기능**:
  - "조리 시작" 버튼 (RECEIVED → PREPARING)
  - "조리 완료" 버튼 (로컬 state만 변경, 배달 탭 이동)
  - "배달 시작" 버튼 (PREPARING → DELIVERING)
  - "배달 완료" 버튼 (DELIVERING → COMPLETED)
  - 직책별 버튼 표시 (COOK/RIDER/STAFF)

### 📝 구현 세부사항
- 상태 변경 시 DB orders 테이블의 order_status 컬럼 업데이트
- WebSocket으로 직원들에게 브로드캐스트 (`ws_manager.broadcast_to_staff`)
- 고객에게도 개별 전송 (`ws_manager.send_to_user`)
- 직책별 권한 분리 (COOK는 조리만, RIDER는 배달만, STAFF는 전체 가능)

---

## ✅ FR-018: 직원의 주문 상세 정보 조회

### 📌 구현 상태: **완료 (100%)**

### 🔧 사용 백엔드 서비스
- **라우터**: `backend/routers/order.py` → `get_all_orders_for_staff()`
- **주요 기능**:
  - FR-016과 동일한 API 사용
  - 커스터마이징 정보 포함 조회
  - 고객 정보 (이름, 전화번호, 주소) 포함

### 🌐 사용 API 엔드포인트
- **GET** `/api/orders/staff/all` (FR-016과 동일)
  - 응답에 주문 상세 정보 모두 포함:
    - `customer_name`, `customer_phone`, `customer_email`
    - `menu_name`, `menu_code`, `style`
    - `customizations`: 커스터마이징된 재료 정보
    - `delivery_address`, `estimated_delivery_time`

### 🎨 사용 프론트엔드 페이지
- **컴포넌트**: `frontend/src/app/dashboard/staff/page.tsx`