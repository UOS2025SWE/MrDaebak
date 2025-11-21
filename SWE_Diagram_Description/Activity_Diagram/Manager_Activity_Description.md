# 관리자(Manager) Activity 서술

## 관리자(Manager)의 일반적인 업무 흐름

관리자의 업무는 로그인으로 시작된다. 관리자는 `/api/auth/login`을 통해 MANAGER 역할로 인증받고, 시스템이 자격 증명을 검증하여 JWT 토큰을 발급한다[Log In]. 인증에 실패하면 로그인 실패 메시지가 표시되고 종료된다.

인증이 성공하면 관리자는 관리자 대시보드(Manager Dashboard)를 열고, WebSocket을 통해 관리 운영 스트림을 구독한다[Open Dashboard and Subscribe to WebSocket]. 이를 통해 ORDER_STATUS_CHANGED, INQUIRY_CREATED 등의 이벤트를 실시간으로 수신한다.

### 대시보드 메뉴 선택
관리자는 대시보드에서 다음 메뉴 중 하나를 선택하여 업무를 수행한다:

#### 1. Monitor Operations (운영 모니터링)
관리자가 "실시간 운영" 화면을 열면, WebSocket을 통해 ORDER_STATUS_CHANGED, INQUIRY_CREATED 이벤트를 수신한다[Monitor Realtime Events]. 조리 및 배달 타임라인을 실시간으로 관찰하며, 중대한 지연이나 문제가 발생하면 `/api/orders/{id}`를 통해 주문 상세 정보를 확인하고, 조리사 또는 배달 담당자에게 연락하여 문제를 해결한다[Handle Critical Issues]. 필요 시 메모를 업데이트하거나 지원팀으로 에스컬레이션할 수 있다.

#### 2. Inventory Management (재고 관리)
관리자가 "재고 관리" 페이지를 열면, IngredientService가 `list_ingredients()` 메서드를 호출하여 재료 목록을 반환한다[View Inventory]. 관리자는 재고 부족 항목을 검토하고, 필요 시 다음 작업을 수행한다:

- **재고 입고**: `/api/ingredients/intake`를 통해 입고 기록을 생성하고, 시스템이 상태 "PENDING"인 입고 배치를 저장한다[Register Intake]. 관리자가 `/api/ingredients/intake/{id}/confirm`을 통해 입고 배치를 확인하면, 시스템이 상태를 "COMPLETED"로 업데이트하고 수량을 조정한다.

- **재고 폐기/조정**: 관리자가 폐기 또는 조정 기록을 생성하면, 시스템이 재료 수량을 업데이트하고 감사 로그를 생성한다[Dispose or Adjust Stock].

#### 3. Promotion / Event Management (프로모션/이벤트 관리)
관리자가 "이벤트 및 프로모션" 페이지를 열면, EventService가 `list_events()` 메서드를 호출하여 이벤트 목록을 반환한다[View Promotions]. 관리자는 다음 작업을 수행할 수 있다:

- **새 이벤트 생성**: 이벤트 이름, 기간, 메뉴/사이드 할인 정보를 입력하고, 필요 시 배너 이미지를 업로드한다[Create New Event]. 시스템이 `event_promotions` 행과 관련 할인 정보를 생성한다.

- **기존 이벤트 수정**: 기존 이벤트를 선택하여 기간이나 할인율을 수정하거나, `is_published=false` 또는 `end_date=today`로 설정하여 조기 종료할 수 있다[Edit or End Event]. 시스템이 `event_promotions` 및 할인 테이블을 업데이트한다.

#### 4. Support / Inquiry Management (지원/문의 관리)
관리자가 "고객 문의" 페이지를 열면, InquiryService가 `list_inquiries()` 메서드를 호출하여 상태가 "NEW" 또는 "IN_PROGRESS"인 문의 목록을 반환한다[View Inquiries]. 관리자는 문의를 선택하여 다음 작업을 수행한다:

- **문의 처리 시작**: 시스템이 문의 상태를 "IN_PROGRESS"로 업데이트한다[Start Handling]. 관리자가 답변을 작성하거나 고객에게 전화를 건다.

- **문의 해결**: 문제가 해결되면 시스템이 상태를 "RESOLVED"로 업데이트한다[Resolve Inquiry]. 해결되지 않은 경우 "IN_PROGRESS"로 유지하거나 "ARCHIVED"로 이동한다.

#### 5. Staff Overview (직원 개요)
관리자가 "직원 개요" 페이지를 열면, 시스템이 직원 계정 및 역할 목록을 표시한다[View Staff]. 관리자는 조리사 및 배달 담당자의 작업량을 확인하고, 필요 시 근무 일정을 조정한다(오프라인 또는 별도 HR 시스템을 통해).

#### 6. Log Out (로그아웃)
관리자가 "로그아웃"을 클릭하면, 시스템이 세션 토큰을 삭제하고 대시보드에서 나간다.

관리자는 대시보드에 머물며 필요한 메뉴를 반복적으로 선택하여 업무를 수행한다.

---

## 주요 액티비티 상세 서술

### Log In
관리자가 `/api/auth/login`을 통해 로그인하며, 시스템이 역할이 MANAGER인지 확인한다. 인증이 성공하면 JWT 토큰이 발급되고, 실패하면 로그인 실패 메시지가 표시된다.

### Open Dashboard and Subscribe to WebSocket
관리자가 관리자 대시보드를 열면, 시스템이 WebSocket을 통해 관리 운영 스트림(ORDER_STATUS_CHANGED, INQUIRY_CREATED 등)을 구독한다. 이를 통해 실시간 이벤트를 수신한다.

### Monitor Realtime Events
관리자가 "실시간 운영" 화면을 열면, WebSocket을 통해 ORDER_STATUS_CHANGED, INQUIRY_CREATED 이벤트를 수신한다. 조리 및 배달 타임라인을 실시간으로 관찰한다.

### Handle Critical Issues
중대한 지연이나 문제가 발생하면, 관리자가 `/api/orders/{id}`를 통해 주문 상세 정보를 확인한다. 조리사 또는 배달 담당자에게 연락하여 문제를 해결하고, 필요 시 메모를 업데이트하거나 지원팀으로 에스컬레이션한다.

### View Inventory
관리자가 "재고 관리" 페이지를 열면, IngredientService가 `list_ingredients()` 메서드를 호출하여 재료 목록을 반환한다. 재고 부족 항목이 강조 표시된다.

### Register Intake
관리자가 재고 입고를 등록하면, `/api/ingredients/intake`를 통해 입고 기록을 생성하고, 시스템이 상태 "PENDING"인 입고 배치를 저장한다. 관리자가 `/api/ingredients/intake/{id}/confirm`을 통해 입고 배치를 확인하면, 시스템이 `mark_completed()` 메서드를 호출하여 상태를 "COMPLETED"로 업데이트하고 재료 수량을 조정한다.

### Dispose or Adjust Stock
관리자가 재고 폐기 또는 조정 기록을 생성하면, 시스템이 재료 수량을 업데이트하고 감사 로그를 생성하여 변경 이력을 추적한다.

### View Promotions
관리자가 "이벤트 및 프로모션" 페이지를 열면, EventService가 `list_events()` 메서드를 호출하여 이벤트 목록을 반환한다.

### Create New Event
관리자가 새 이벤트를 생성하기 위해 이벤트 이름, 기간, 메뉴/사이드 할인 정보를 입력하고, 필요 시 배너 이미지를 업로드한다. 시스템이 `event_promotions` 행과 관련 할인 정보를 생성한다.

### Edit or End Event
관리자가 기존 이벤트를 선택하여 기간이나 할인율을 수정하면, 시스템이 `event_promotions` 및 할인 테이블을 업데이트한다. 조기 종료 시 `is_published=false` 또는 `end_date=today`로 설정하여 이벤트를 종료한다.

### View Inquiries
관리자가 "고객 문의" 페이지를 열면, InquiryService가 `list_inquiries()` 메서드를 호출하여 상태가 "NEW" 또는 "IN_PROGRESS"인 문의 목록을 반환한다.

### Start Handling
관리자가 문의를 선택하여 처리를 시작하면, 시스템이 문의 상태를 "IN_PROGRESS"로 업데이트한다. 관리자가 답변을 작성하거나 고객에게 전화를 건다.

### Resolve Inquiry
문제가 해결되면 시스템이 문의 상태를 "RESOLVED"로 업데이트한다. 해결되지 않은 경우 "IN_PROGRESS"로 유지하거나 "ARCHIVED"로 이동한다.

### View Staff
관리자가 "직원 개요" 페이지를 열면, 시스템이 직원 계정 및 역할 목록을 표시한다. 관리자는 조리사 및 배달 담당자의 작업량을 확인하고, 필요 시 근무 일정을 조정한다(오프라인 또는 별도 HR 시스템을 통해).
