# 배달 담당자(Delivery Staff) Activity 서술

## 배달 담당자(Delivery Staff)의 일반적인 업무 흐름

배달 담당자의 업무는 로그인으로 시작된다. 배달 담당자는 `/api/auth/login`을 통해 STAFF_DELIVERY 역할로 인증받고, LoginService가 자격 증명을 검증하여 JWT 토큰을 발급한다[Log In].

로그인 후 배달 담당자는 배달 대시보드(Delivery Dashboard)를 열고, StaffRouter를 통해 할당된 주문 목록(`/api/staff/orders?role=DELIVERY`)을 로드한다[Open Dashboard and Load Orders]. 동시에 ORDER_STATUS_CHANGED WebSocket 스트림을 구독하여 실시간으로 상태 변경 알림을 받는다.

### 배달 프로세스
배달 담당자는 근무 시간 동안 반복적으로 다음 작업을 수행한다:

1. **배달 준비 완료 주문 확인**: 상태가 "PREPARING"이고 `ready_for_delivery` 플래그가 설정된 주문이 있는지 확인한다[Check for Ready Orders].

2. **주문 픽업**:
   - 배달 담당자는 배달 준비가 완료된 주문 목록을 지도/경로와 함께 확인한다.
   - 배달할 주문을 선택하고 티켓을 스캔하거나 픽업을 확인한다[Pickup Order].
   - OrderService가 주문 상태를 "DELIVERING"으로 업데이트하고, ORDER_STATUS_CHANGED(DELIVERING) 이벤트를 고객 및 관리자 대시보드로 브로드캐스트한다.

3. **고객 주소로 이동**: 배달 담당자가 고객 주소로 운전한다[Drive to Location].

4. **배달 완료**:
   - **정상 배달**: 배달 담당자가 주소에 도착하면, 필요 시 고객에게 전화를 걸고, 패키지를 전달하며 이름과 주문 번호를 확인한다[Deliver Successfully]. 앱에서 "배달 완료"를 표시하면, OrderService가 주문 상태를 "COMPLETED"로 업데이트하고 ORDER_STATUS_CHANGED(COMPLETED) 이벤트를 브로드캐스트한다.

   - **배달 불가 (고객 연락 불가 / 잘못된 주소)**: 배달 담당자가 고객이나 지원팀에 연락을 시도한다[Contact Customer/Support].
     - **재스케줄**: 시스템이 문제 메모를 기록하고 예상 시간을 업데이트한다.
     - **반환/취소**: OrderService가 주문 상태를 "CANCELLED"로 업데이트하고, 정책에 따라 PaymentService를 통해 환불을 처리한다. ORDER_STATUS_CHANGED(CANCELLED) 이벤트가 브로드캐스트된다.

5. **대시보드 모니터링**: 배달 준비 완료 주문이 없는 경우, 배달 담당자는 대시보드와 내비게이션을 모니터링한다[Monitor Dashboard].

### 근무 종료
배달 담당자는 근무가 끝나면 차량과 디바이스를 반납하고 근무를 종료한다[Close Shift].

---

## 주요 액티비티 상세 서술

### Log In
배달 담당자가 `/api/auth/login`을 통해 STAFF_DELIVERY 역할로 로그인한다. LoginService가 자격 증명을 검증하고 JWT 토큰을 발급하여 인증 상태를 유지한다.

### Open Dashboard and Load Orders
배달 담당자가 배달 대시보드를 열면, StaffRouter를 통해 `/api/staff/orders?role=DELIVERY`로 할당된 주문 목록을 로드한다. 동시에 ORDER_STATUS_CHANGED WebSocket 스트림을 구독하여 실시간으로 상태 변경 알림을 받는다.

### Check for Ready Orders
배달 담당자가 근무 시간 동안 반복적으로 상태가 "PREPARING"이고 `ready_for_delivery` 플래그가 설정된 주문이 있는지 확인한다. 준비 완료된 주문은 대시보드에 지도 및 경로와 함께 표시된다.

### Pickup Order
배달 담당자가 배달할 주문을 선택하고 티켓을 스캔하거나 픽업을 확인한다. OrderService가 `update_status(DELIVERING)` 메서드를 호출하여 주문 상태를 "DELIVERING"으로 업데이트하고, ORDER_STATUS_CHANGED(DELIVERING) 이벤트를 고객 및 관리자 대시보드로 브로드캐스트한다.

### Drive to Location
배달 담당자가 내비게이션을 사용하여 고객 주소로 운전한다. 이는 시스템 외부의 물리적 활동이다.

### Deliver Successfully
배달 담당자가 주소에 도착하면, 필요 시 고객에게 전화를 걸고, 패키지를 전달하며 이름과 주문 번호를 확인한다. 앱에서 "배달 완료"를 표시하면, OrderService가 `update_status(COMPLETED)` 메서드를 호출하여 주문 상태를 "COMPLETED"로 업데이트하고 ORDER_STATUS_CHANGED(COMPLETED) 이벤트를 브로드캐스트한다.

### Contact Customer/Support
배달 담당자가 고객에게 연락할 수 없거나 주소가 잘못된 경우, 고객이나 지원팀에 연락을 시도한다. 상황에 따라 다음 중 하나를 선택한다:
- **재스케줄**: 시스템이 문제 메모를 기록하고 예상 배달 시간을 업데이트한다.
- **반환/취소**: OrderService가 주문 상태를 "CANCELLED"로 업데이트하고, 정책에 따라 PaymentService를 통해 `process_refund_if_policy_allows()` 메서드를 호출하여 환불을 처리한다. ORDER_STATUS_CHANGED(CANCELLED) 이벤트가 브로드캐스트된다.

### Monitor Dashboard
배달 준비 완료 주문이 없는 경우, 배달 담당자는 대시보드와 내비게이션을 모니터링하여 새로운 주문을 대기한다.

### Close Shift
배달 담당자가 근무가 끝나면 차량과 디바이스를 반납하고 근무를 종료한다. 이는 시스템 외부의 물리적 작업이다.
