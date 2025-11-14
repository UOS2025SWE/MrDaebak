"""
직원 관리 서비스 - 직원 상태 및 관리 비즈니스 로직
Staff management service for handling staff status and management logic
"""

import logging
from typing import Any
from datetime import datetime
import json
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.orm import Session

# 로깅 설정
logger = logging.getLogger(__name__)

class StaffService:
    """직원 관리 관련 비즈니스 로직 처리"""

    def __init__(self):
        self.data_dir = Path(__file__).parent.parent / "data"
        self.staff_file = self.data_dir / "staff_data.json"
        self._ensure_data_file()

    def _ensure_data_file(self):
        """데이터 파일이 존재하지 않으면 생성"""
        if not self.data_dir.exists():
            self.data_dir.mkdir(parents=True, exist_ok=True)

        if not self.staff_file.exists():
            # 초기 직원 데이터 생성
            initial_staff = [
                # 조리 직원 5명
                {"id": 1, "name": "직원1", "type": "cook", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
                {"id": 2, "name": "직원2", "type": "cook", "status": "busy", "currentTask": "발렌타인 디너 조리중", "updatedAt": datetime.now().isoformat()},
                {"id": 3, "name": "직원3", "type": "cook", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
                {"id": 4, "name": "직원4", "type": "cook", "status": "busy", "currentTask": "프렌치 디너 조리중", "updatedAt": datetime.now().isoformat()},
                {"id": 5, "name": "직원5", "type": "cook", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
                # 배달 직원 5명
                {"id": 6, "name": "직원1", "type": "delivery", "status": "busy", "currentTask": "강남구 배달중", "updatedAt": datetime.now().isoformat()},
                {"id": 7, "name": "직원2", "type": "delivery", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
                {"id": 8, "name": "직원3", "type": "delivery", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
                {"id": 9, "name": "직원4", "type": "delivery", "status": "busy", "currentTask": "서초구 배달중", "updatedAt": datetime.now().isoformat()},
                {"id": 10, "name": "직원5", "type": "delivery", "status": "free", "currentTask": None, "updatedAt": datetime.now().isoformat()},
            ]

            self._save_staff_data(initial_staff)

    def _load_staff_data(self) -> list[dict[str, Any]]:
        """직원 데이터 로드"""
        try:
            with open(self.staff_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"직원 데이터 로드 실패: {e}")
            return []

    def _save_staff_data(self, staff_data: list[dict[str, Any]]):
        """직원 데이터 저장"""
        try:
            with open(self.staff_file, 'w', encoding='utf-8') as f:
                json.dump(staff_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"직원 데이터 저장 실패: {e}")
            raise


    def get_staff_by_type(self, staff_type: str) -> dict[str, Any]:
        """직원 유형별 조회 (cook 또는 delivery)"""
        try:
            if staff_type not in ['cook', 'delivery']:
                return {
                    "success": False,
                    "error": "잘못된 직원 유형입니다. 'cook' 또는 'delivery'만 가능합니다.",
                    "data": []
                }

            staff_data = self._load_staff_data()
            filtered_staff = [staff for staff in staff_data if staff['type'] == staff_type]

            return {
                "success": True,
                "data": filtered_staff,
                "count": len(filtered_staff)
            }
        except Exception as e:
            logger.error(f"유형별 직원 조회 오류: {e}")
            return {
                "success": False,
                "error": f"직원 데이터 조회 실패: {str(e)}",
                "data": []
            }

    def get_staff_status_summary(self) -> dict[str, Any]:
        """직원 상태 요약 정보"""
        try:
            staff_data = self._load_staff_data()

            cook_staff = [s for s in staff_data if s['type'] == 'cook']
            delivery_staff = [s for s in staff_data if s['type'] == 'delivery']

            summary = {
                "cook": {
                    "total": len(cook_staff),
                    "free": len([s for s in cook_staff if s['status'] == 'free']),
                    "busy": len([s for s in cook_staff if s['status'] == 'busy'])
                },
                "delivery": {
                    "total": len(delivery_staff),
                    "free": len([s for s in delivery_staff if s['status'] == 'free']),
                    "busy": len([s for s in delivery_staff if s['status'] == 'busy'])
                },
                "overall": {
                    "total": len(staff_data),
                    "free": len([s for s in staff_data if s['status'] == 'free']),
                    "busy": len([s for s in staff_data if s['status'] == 'busy'])
                }
            }

            return {
                "success": True,
                "data": summary
            }
        except Exception as e:
            logger.error(f"직원 상태 요약 조회 오류: {e}")
            return {
                "success": False,
                "error": f"직원 상태 요약 조회 실패: {str(e)}",
                "data": {}
            }

    def update_staff_status(self, staff_id: int, status: str, current_task: str | None = None) -> dict[str, Any]:
        """직원 상태 업데이트"""
        try:
            if status not in ['free', 'busy']:
                return {
                    "success": False,
                    "error": "잘못된 상태입니다. 'free' 또는 'busy'만 가능합니다."
                }

            staff_data = self._load_staff_data()
            staff_found = False

            for staff in staff_data:
                if staff['id'] == staff_id:
                    staff['status'] = status
                    staff['currentTask'] = current_task if status == 'busy' else None
                    staff['updatedAt'] = datetime.now().isoformat()
                    staff_found = True
                    break

            if not staff_found:
                return {
                    "success": False,
                    "error": f"ID {staff_id}인 직원을 찾을 수 없습니다."
                }

            self._save_staff_data(staff_data)

            return {
                "success": True,
                "message": f"직원 {staff_id}의 상태가 업데이트되었습니다.",
                "data": next(s for s in staff_data if s['id'] == staff_id)
            }

        except Exception as e:
            logger.error(f"직원 상태 업데이트 오류: {e}")
            return {
                "success": False,
                "error": f"직원 상태 업데이트 실패: {str(e)}"
            }

    def toggle_staff_status(self, staff_id: str) -> dict[str, Any]:
        """직원 상태 토글 (free ↔ busy) - UUID 기반"""
        try:
            staff_data = self._load_staff_data()
            staff_found = None

            for staff in staff_data:
                if str(staff['id']) == str(staff_id):
                    staff_found = staff
                    break

            # 상태 정보가 없으면 새로 생성
            if not staff_found:
                # 새 직원 상태 생성 (기본값: free → busy)
                new_status = {
                    'id': staff_id,
                    'status': 'busy',
                    'currentTask': '작업 중',
                    'updatedAt': datetime.now().isoformat()
                }
                staff_data.append(new_status)
                self._save_staff_data(staff_data)
                return {
                    "success": True,
                    "message": f"직원 {staff_id}의 상태가 업데이트되었습니다.",
                    "data": new_status
                }

            # 상태 토글
            new_status = 'busy' if staff_found['status'] == 'free' else 'free'
            new_task = '작업 중' if new_status == 'busy' else None

            staff_found['status'] = new_status
            staff_found['currentTask'] = new_task
            staff_found['updatedAt'] = datetime.now().isoformat()

            self._save_staff_data(staff_data)

            return {
                "success": True,
                "message": f"직원 {staff_id}의 상태가 업데이트되었습니다.",
                "data": staff_found
            }

        except Exception as e:
            logger.error(f"직원 상태 토글 오류: {e}")
            return {
                "success": False,
                "error": f"직원 상태 토글 실패: {str(e)}"
            }

    def assign_task_to_staff(self, staff_type: str, task_description: str) -> dict[str, Any]:
        """가용한 직원에게 작업 할당"""
        try:
            if staff_type not in ['cook', 'delivery']:
                return {
                    "success": False,
                    "error": "잘못된 직원 유형입니다."
                }

            staff_data = self._load_staff_data()
            available_staff = [
                s for s in staff_data
                if s['type'] == staff_type and s['status'] == 'free'
            ]

            if not available_staff:
                return {
                    "success": False,
                    "error": f"현재 가용한 {staff_type} 직원이 없습니다."
                }

            # 첫 번째 가용한 직원에게 작업 할당
            selected_staff = available_staff[0]
            result = self.update_staff_status(
                selected_staff['id'],
                'busy',
                task_description
            )

            if result['success']:
                return {
                    "success": True,
                    "message": f"{selected_staff['name']}에게 작업이 할당되었습니다.",
                    "data": result['data']
                }
            else:
                return result

        except Exception as e:
            logger.error(f"작업 할당 오류: {e}")
            return {
                "success": False,
                "error": f"작업 할당 실패: {str(e)}"
            }

    def update_staff_status_from_orders(self, db: Session) -> dict[str, Any]:
        """주문 데이터를 기반으로 직원 상태 자동 업데이트"""
        try:
            current_time = datetime.now()
            staff_data = self._load_staff_data()

            # 현재 진행 중인 주문 조회 (조리 중 또는 배달 중)
            query = text("""
                SELECT
                    o.order_id, o.order_number,
                    o.estimated_cooking_start, o.estimated_cooking_end,
                    o.estimated_delivery_start, o.estimated_delivery_end,
                    o.delivery_address
                FROM orders o
                WHERE o.order_status NOT IN ('COMPLETED', 'CANCELLED')
                ORDER BY o.created_at ASC
            """)

            active_orders = db.execute(query).fetchall()

            # 조리 중인 주문 수 계산
            cooking_orders = []
            delivering_orders = []

            for order in active_orders:
                order_id, order_number, items, cook_start, cook_end, del_start, del_end, address = order

                # 현재 시간이 조리 시간 범위 내에 있는지 확인
                if cook_start and cook_end:
                    if cook_start <= current_time <= cook_end:
                        order_info = json.loads(items) if isinstance(items, str) else items
                        cooking_orders.append({
                            "order_number": order_number,
                            "menu": order_info.get("dinner_name", "메뉴"),
                            "style": order_info.get("style", "")
                        })

                # 현재 시간이 배달 시간 범위 내에 있는지 확인
                if del_start and del_end:
                    if del_start <= current_time <= del_end:
                        delivering_orders.append({
                            "order_number": order_number,
                            "address": address or "주소 미정"
                        })

            # 조리 직원 상태 업데이트
            cook_staff = [s for s in staff_data if s['type'] == 'cook']
            for i, staff in enumerate(cook_staff):
                if i < len(cooking_orders):
                    # 조리 중인 주문이 있으면 busy 상태로
                    order = cooking_orders[i]
                    staff['status'] = 'busy'
                    staff['currentTask'] = f"{order['menu']} {order['style']} 조리중 ({order['order_number']})"
                else:
                    # 조리할 주문이 없으면 free 상태로
                    staff['status'] = 'free'
                    staff['currentTask'] = None
                staff['updatedAt'] = current_time.isoformat()

            # 배달 직원 상태 업데이트
            delivery_staff = [s for s in staff_data if s['type'] == 'delivery']
            for i, staff in enumerate(delivery_staff):
                if i < len(delivering_orders):
                    # 배달 중인 주문이 있으면 busy 상태로
                    order = delivering_orders[i]
                    staff['status'] = 'busy'
                    staff['currentTask'] = f"{order['address']} 배달중 ({order['order_number']})"
                else:
                    # 배달할 주문이 없으면 free 상태로
                    staff['status'] = 'free'
                    staff['currentTask'] = None
                staff['updatedAt'] = current_time.isoformat()

            # 업데이트된 데이터 저장
            self._save_staff_data(staff_data)

            return {
                "success": True,
                "message": "주문 기반 직원 상태 업데이트 완료",
                "summary": {
                    "cooking_orders": len(cooking_orders),
                    "delivering_orders": len(delivering_orders),
                    "updated_at": current_time.isoformat()
                }
            }

        except Exception as e:
            logger.error(f"주문 기반 직원 상태 업데이트 오류: {e}")
            return {
                "success": False,
                "error": f"직원 상태 업데이트 실패: {str(e)}"
            }

    def get_staff_with_order_status(self, db: Session) -> dict[str, Any]:
        """주문 상태와 연동된 직원 목록 조회 (주문 기반 자동 상태 계산)"""
        try:
            # 데이터베이스에서 STAFF 사용자 조회 (출퇴근 정보 포함)
            query = text("""
                SELECT
                    u.user_id::text as id,
                    u.name,
                    sd.position,
                    u.created_at,
                    sd.is_on_duty,
                    sd.last_check_in,
                    sd.last_check_out,
                    sd.salary,
                    sd.last_payday,
                    sd.next_payday
                FROM users u
                INNER JOIN staff_details sd ON u.user_id = sd.staff_id
                WHERE u.user_type = 'STAFF'
                ORDER BY u.created_at ASC
            """)

            db_staff = db.execute(query).fetchall()

            # 현재 진행 중인 주문 조회
            orders_query = text("""
                SELECT
                    o.order_id::text,
                    o.order_number,
                    o.order_status,
                    mi.name as menu_name,
                    o.delivery_address
                FROM orders o
                LEFT JOIN order_items oi ON o.order_id = oi.order_id
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
                WHERE o.order_status IN ('PREPARING', 'DELIVERING')
                ORDER BY o.created_at ASC
            """)

            active_orders = db.execute(orders_query).fetchall()

            # 주문을 타입별로 분류
            preparing_orders = [order for order in active_orders if order[2] == 'PREPARING']
            delivering_orders = [order for order in active_orders if order[2] == 'DELIVERING']

            # 직원 목록 생성
            staff_list: list[dict[str, Any]] = []
            cook_staff_on_duty: list[dict[str, Any]] = []
            delivery_staff_on_duty: list[dict[str, Any]] = []
            off_duty_staff: list[dict[str, Any]] = []

            for row in db_staff:
                staff_id = row[0]
                name = row[1]
                position = row[2]  # 'COOK' or 'DELIVERY'
                is_on_duty = row[4] if len(row) > 4 else False
                last_check_in = row[5] if len(row) > 5 else None
                last_check_out = row[6] if len(row) > 6 else None
                salary = row[7] if len(row) > 7 else None
                last_payday = row[8] if len(row) > 8 else None
                next_payday = row[9] if len(row) > 9 else None

                # 포지션이 확정되지 않은 직원은 조리/배달 현황에서 제외
                if position not in ('COOK', 'DELIVERY'):
                    logger.debug("Skipping staff %s with pending position", staff_id)
                    continue

                # position을 type으로 매핑
                staff_type = 'cook' if position == 'COOK' else 'delivery'

                staff_info: dict[str, Any] = {
                    'id': staff_id,
                    'name': name,
                    'type': staff_type,
                    'status': 'free',
                    'currentTask': None,
                    'updatedAt': datetime.now().isoformat(),
                    'is_on_duty': is_on_duty or False,
                    'last_check_in': last_check_in.isoformat() if last_check_in else None,
                    'last_check_out': last_check_out.isoformat() if last_check_out else None,
                    'salary': float(salary) if salary else None,
                    'last_payday': last_payday.isoformat() if last_payday else None,
                    'next_payday': next_payday.isoformat() if next_payday else None
                }

                if not is_on_duty:
                    staff_info['status'] = 'off-duty'
                    off_duty_staff.append(staff_info)
                    continue

                if staff_type == 'cook':
                    cook_staff_on_duty.append(staff_info)
                else:
                    delivery_staff_on_duty.append(staff_info)

            # 조리 중인 주문을 요리사에게 할당
            for i, order in enumerate(preparing_orders):
                if i < len(cook_staff_on_duty):
                    cook_staff_on_duty[i]['status'] = 'busy'
                    cook_staff_on_duty[i]['currentTask'] = f"{order[3] or '메뉴'} 조리중 ({order[1]})"

            # 배달 중인 주문을 배달원에게 할당
            for i, order in enumerate(delivering_orders):
                if i < len(delivery_staff_on_duty):
                    delivery_staff_on_duty[i]['status'] = 'busy'
                    delivery_staff_on_duty[i]['currentTask'] = f"{order[4] or '주소'} 배달중 ({order[1]})"

            # 전체 리스트 병합 (출근자 우선, 퇴근자는 마지막)
            staff_list.extend(cook_staff_on_duty)
            staff_list.extend(delivery_staff_on_duty)
            staff_list.extend(off_duty_staff)

            return {
                "success": True,
                "data": staff_list,
                "count": len(staff_list),
                "order_summary": {
                    "cooking_orders": len(preparing_orders),
                    "delivering_orders": len(delivering_orders),
                    "updated_at": datetime.now().isoformat()
                }
            }

        except Exception as e:
            logger.error(f"직원 상태 조회 오류: {e}")
            return {
                "success": False,
                "error": f"직원 상태 조회 실패: {str(e)}",
                "data": []
            }

# 싱글톤 인스턴스
staff_service = StaffService()