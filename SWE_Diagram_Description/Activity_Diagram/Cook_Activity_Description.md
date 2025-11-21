# 조리사(Cook) Activity 서술

## 조리사(Cook)의 일반적인 업무 흐름

조리사의 업무는 로그인으로 시작된다. 조리사는 `/api/auth/login`을 통해 STAFF_COOK 역할로 인증받고, LoginService가 자격 증명을 검증하여 JWT 토큰을 발급한다[Log In].

로그인 후 조리사는 주방 대시보드(Cook Dashboard)를 열고, StaffRouter와 WebSocket(`/api/ws`)을 통해 ORDER_STATUS_CHANGED 스트림을 구독한다[Open Dashboard and Subscribe to WebSocket]. 이를 통해 새로운 주문이 접수되거나 상태가 변경될 때 실시간으로 알림을 받는다.

### 주문 조리 프로세스
조리사는 근무 시간 동안 반복적으로 다음 작업을 수행한다:

1. **새 주문 확인**: 상태가 "RECEIVED"인 새로운 주문이 있는지 확인한다. `/api/staff/orders?status=RECEIVED`를 통해 할당된 주문 목록을 조회한다[Check for New Orders].

2. **주문 상세 확인**: 조리사는 주문 상세 정보를 열어 요청된 메뉴와 커스터마이징 사항을 확인한다. 시스템은 OrderService를 통해 필요한 재료를 확인하고 예약한다[Check Ingredients].

3. **재료 충분성 검증**:
   - **재료 충분**: 조리사가 "조리 시작(Start Preparing)" 버튼을 클릭하면, OrderService가 주문 상태를 "PREPARING"으로 업데이트하고 ORDER_STATUS_CHANGED(PREPARING) 이벤트를 브로드캐스트한다[Start Cooking]. 조리사는 주요 요리와 사이드를 조리하고, 플레이팅 및 포장을 완료한 후 "배달 준비 완료(Ready for Delivery)"로 표시한다. 시스템은 선택적으로 배달 대기열에 알림을 전송한다.

   - **재료 부족**: 재료가 부족하거나 기계 오류 등의 이유로 조리가 불가능한 경우, 조리사는 "조리 불가" 상태로 표시하고 이유를 선택한다[Mark as Cannot Prepare]. OrderService가 주문 상태를 "CANCELLED"로 업데이트하고, 결제가 완료된 경우 PaymentService를 통해 환불을 처리한다. ORDER_STATUS_CHANGED(CANCELLED) 이벤트가 브로드캐스트된다.

4. **PREPARING 대기열 모니터링**: 새 주문이 없는 경우, 조리사는 현재 조리 중인 주문들의 대기열과 타이머를 모니터링한다[Monitor Queue].

### 재료 입고 관리 (선택적)
경우에 따라 조리사가 재료 입고를 처리할 수도 있다. 조리사는 `/api/ingredients/intake`를 통해 입고 기록을 생성하고, IngredientService가 상태 "PENDING"인 입고 배치를 저장한다[Record Intake]. 이후 관리자가 관리자 UI에서 배치를 확인하면, IngredientService가 상태를 "COMPLETED"로 표시하고 재고를 업데이트한다.

### 근무 종료
조리사는 근무가 끝나면 작업 공간을 정리하고 근무를 종료한다[Clean and Close Shift].

---

## 주요 액티비티 상세 서술

### Log In
조리사가 `/api/auth/login`을 통해 STAFF_COOK 역할로 로그인한다. LoginService가 자격 증명을 검증하고 JWT 토큰을 발급하여 인증 상태를 유지한다.

### Open Dashboard and Subscribe to WebSocket
조리사가 주방 대시보드를 열면, 시스템이 StaffRouter를 통해 WebSocket(`/api/ws`)에 연결하고 ORDER_STATUS_CHANGED 스트림을 구독한다. 이를 통해 새로운 주문 접수 및 상태 변경을 실시간으로 수신한다.

### Check for New Orders
조리사가 근무 시간 동안 반복적으로 상태가 "RECEIVED"인 새로운 주문이 있는지 확인한다. `/api/staff/orders?status=RECEIVED`를 통해 OrderService가 조리사에게 할당된 주문 목록을 반환한다.

### Check Ingredients
조리사가 주문 상세 정보를 열어 요청된 메뉴와 커스터마이징 사항을 확인한다. 시스템은 OrderService를 통해 `check_and_reserve_ingredients()` 메서드를 호출하여 필요한 재료가 충분한지 검증하고 예약한다.

### Start Cooking
재료가 충분한 경우, 조리사가 "조리 시작" 버튼을 클릭하면 OrderService가 주문 상태를 "PREPARING"으로 업데이트하고 ORDER_STATUS_CHANGED(PREPARING) 이벤트를 브로드캐스트한다. 조리사는 주요 요리와 사이드를 조리하고, 플레이팅 및 포장을 완료한 후 "배달 준비 완료"로 표시한다.

### Mark as Cannot Prepare
재료가 부족하거나 기계 오류 등의 이유로 조리가 불가능한 경우, 조리사가 "조리 불가" 상태로 표시하고 이유(shortage / machine error)를 선택한다. OrderService가 주문 상태를 "CANCELLED"로 업데이트하고, 결제가 완료된 경우 PaymentService를 통해 `process_refund_if_paid()` 메서드를 호출하여 환불을 처리한다. ORDER_STATUS_CHANGED(CANCELLED) 이벤트가 브로드캐스트된다.

### Monitor Queue
새 주문이 없는 경우, 조리사는 현재 조리 중인 주문들의 "PREPARING" 대기열과 타이머를 모니터링하여 진행 상황을 관리한다.

### Record Intake
경우에 따라 조리사가 재료 입고를 처리할 수 있다. 조리사는 `/api/ingredients/intake`를 통해 입고 기록을 생성하고, IngredientService가 `create_intake_batch(PENDING)` 메서드를 호출하여 상태 "PENDING"인 입고 배치를 저장한다. 이후 관리자가 관리자 UI에서 배치를 확인하면, IngredientService가 `mark_completed()` 메서드를 호출하여 상태를 "COMPLETED"로 표시하고 재고를 업데이트한다.

### Clean and Close Shift
조리사가 근무가 끝나면 작업 공간(스테이션)을 정리하고 근무를 종료한다. 이는 시스템 외부의 물리적 작업이다.
