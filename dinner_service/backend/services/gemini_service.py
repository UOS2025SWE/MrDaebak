"""
Gemini API 서비스
음성 주문 분석 및 메뉴 추천 시스템 (고도화 버전)
새로운 google-genai 패키지 사용 및 주문 단계별 상태 관리
"""

import os
import json
import logging
import re
from pathlib import Path
from datetime import datetime
from typing import Any, Optional
from enum import Enum
from google import genai
from sqlalchemy.orm import Session
from sqlalchemy import text


# 로깅 설정
logger = logging.getLogger(__name__)

# 대화 단계 확인 키워드
CONFIRMATION_KEYWORDS = [
    "맞아요", "네", "좋아요", "확인", "주문", "결제", "이제", "됐어", "완료", "그대로"
]

# 대화 세션 저장소 (인메모리)
conversation_sessions = {}


class OrderStage(str, Enum):
    """주문 단계"""
    INITIAL = "initial"  # 초기, 이벤트 확인 및 추천
    MENU_SELECTED = "menu_selected"  # 메뉴 선택됨
    STYLE_SELECTED = "style_selected"  # 스타일 선택됨
    QUANTITY_SELECTED = "quantity_selected"  # 수량 선택됨
    CUSTOMIZING = "customizing"  # 커스터마이징 중 (재료 조정)
    CHECKOUT_READY = "checkout_ready"  # 체크아웃 준비 완료


class ConversationSession:
    """대화 컨텍스트 및 주문 상태 관리 클래스"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages = []  # [{role, content, timestamp}]
        self.context = {}   # {situation, people, budget, constraints}
        self.order_state = {
            "stage": OrderStage.INITIAL.value,
            "menu_code": None,
            "menu_name": None,
            "style_code": None,
            "style_name": None,
            "quantity": None,
            "customizations": {},
            "events_shown": [],  # 이미 보여준 이벤트 ID 목록
            "current_state": "PROMOTION_GREETING"  # 현재 주문 상태
        }
        self.created_at = datetime.now()

    def add_message(self, role: str, content: str):
        """메시지 추가"""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })

    def get_context_summary(self) -> str:
        """대화 요약 (최근 3개 메시지)"""
        if not self.messages:
            return "첫 대화"

        recent = self.messages[-3:]
        summary_lines = []

        for msg in recent:
            summary_lines.append(f"{msg['role']}: {msg['content']}")

        # 컨텍스트 정보 추가
        if self.context:
            context_info = []
            if 'situation' in self.context:
                context_info.append(f"상황: {self.context['situation']}")
            if 'people' in self.context:
                context_info.append(f"인원: {self.context['people']}명")
            if 'budget' in self.context:
                context_info.append(f"예산: {self.context['budget']}원")

            if context_info:
                summary_lines.append(f"파악된 정보: {', '.join(context_info)}")

        return "\n".join(summary_lines)

    def get_order_state_summary(self) -> str:
        """현재 주문 상태 요약"""
        state = self.order_state
        if state["stage"] == OrderStage.INITIAL.value:
            return "주문 시작 전"
        
        parts = []
        if state["menu_name"]:
            parts.append(f"메뉴: {state['menu_name']}")
        if state["style_name"]:
            parts.append(f"스타일: {state['style_name']}")
        if state["quantity"]:
            parts.append(f"수량: {state['quantity']}개")
        if state["customizations"]:
            parts.append("커스터마이징 있음")
        
        return ", ".join(parts) if parts else "주문 진행 중"

    def update_context(self, key: str, value: Any):
        """컨텍스트 업데이트"""
        self.context[key] = value

    def update_order_state(self, **kwargs):
        """주문 상태 업데이트"""
        self.order_state.update(kwargs)

    def advance_stage(self, new_stage: OrderStage):
        """주문 단계 진행"""
        self.order_state["stage"] = new_stage.value


class GeminiService:
    def __init__(self):
        """Gemini API 초기화 - 새로운 google-genai 패키지 사용"""
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다")

        # 새로운 google-genai 패키지 사용
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.5-flash"

        # 외부 파일에서 설정 로드
        self.menu_data = self._load_menu_data()
        self.system_prompt_template = self._load_system_prompt()

    def _load_menu_data(self) -> dict[str, Any]:
        """외부 JSON 파일에서 메뉴 데이터 로드"""
        try:
            config_dir = Path(__file__).parent.parent / "config"
            menu_file = config_dir / "gemini_menu_data.json"

            with open(menu_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"메뉴 데이터 로드 실패: {e}")
            # 폴백 데이터 제공
            return {
                "valentine": {
                    "name": "발렌타인 디너",
                    "styles_detail": {"simple": {"price": 30000, "cooking_time": 25}}
                }
            }

    def _load_system_prompt(self) -> str:
        """외부 텍스트 파일에서 시스템 프롬프트 로드"""
        try:
            config_dir = Path(__file__).parent.parent / "config"
            prompt_file = config_dir / "gemini_system_prompt.txt"

            with open(prompt_file, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except Exception as e:
            logger.error(f"시스템 프롬프트 로드 실패: {e}")
            return "당신은 미스터 대박 디너 서비스의 AI 상담사입니다."

    @staticmethod
    def _contains_confirmation_keyword(text: str | None) -> bool:
        if not text:
            return False
        lowered = text.lower()
        for keyword in CONFIRMATION_KEYWORDS:
            if keyword.lower() in lowered:
                return True
        return False

    async def get_user_order_history(self, user_id: str, db: Session) -> dict[str, Any]:
        """사용자 주문 이력 조회 (UUID 스키마 대응, 커스터마이징 포함)"""
        try:
            # 주문 기본 정보 조회
            query = text("""
                SELECT
                    o.order_id,
                    o.order_number,
                    o.created_at,
                    o.total_price,
                    mi.code AS menu_code,
                    ss.name AS style_name,
                    oi.order_item_id
                FROM orders o
                LEFT JOIN order_items oi ON o.order_id = oi.order_id
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
                LEFT JOIN serving_styles ss ON oi.serving_style_id = ss.serving_style_id
                WHERE o.customer_id = :user_id
                ORDER BY o.created_at DESC
                LIMIT 10
            """)

            result = db.execute(query, {"user_id": user_id})
            rows = result.fetchall()

            if not rows:
                return {"has_history": False}

            # 주문별로 그룹화
            orders_dict = {}
            for row in rows:
                order_id = str(row[0])
                if order_id not in orders_dict:
                    orders_dict[order_id] = {
                        "order_number": row[1],
                        "created_at": row[2],
                        "total_price": row[3],
                        "items": []
                    }
                if row[4]:  # menu_code가 있으면
                    order_item_id = str(row[6])

                    # 커스터마이징 정보 조회
                    customizations_query = text("""
                        SELECT item_name, change_type, quantity_change
                        FROM order_item_customizations
                        WHERE order_item_id = :order_item_id
                    """)
                    custom_result = db.execute(customizations_query, {"order_item_id": order_item_id})
                    custom_rows = custom_result.fetchall()

                    # 커스터마이징 정보 파싱
                    customizations = {}
                    has_customization = False
                    for custom_row in custom_rows:
                        item_name = custom_row[0]
                        change_type = custom_row[1]
                        quantity_change = custom_row[2]

                        # wine 추가 같은 경우만 추출 (기본값과 다른 경우)
                        if item_name == "wine" and quantity_change > 1:
                            customizations["extra_wine"] = quantity_change - 1
                            has_customization = True

                    orders_dict[order_id]["items"].append({
                        "menu_code": row[4],
                        "style": row[5].lower() if row[5] else "simple",  # "Simple" -> "simple"
                        "customizations": customizations if has_customization else None
                    })

            # 최근 5개 주문만
            orders = list(orders_dict.values())[:5]

            if not orders:
                return {"has_history": False}

            # 가장 최근 주문
            latest = orders[0]
            latest_item = latest["items"][0] if latest["items"] else {}

            # 가장 자주 주문한 메뉴
            menu_counts = {}
            for order in orders:
                for item in order["items"]:
                    menu_code = item.get("menu_code")
                    if menu_code:
                        menu_counts[menu_code] = menu_counts.get(menu_code, 0) + 1

            most_frequent = max(menu_counts, key=menu_counts.get) if menu_counts else None

            return {
                "has_history": True,
                "latest_order": {
                    "menu_code": latest_item.get("menu_code"),
                    "style": latest_item.get("style"),
                    "date": latest["created_at"].isoformat() if latest["created_at"] else None,
                    "price": float(latest["total_price"]) if latest["total_price"] else 0,
                    "customizations": latest_item.get("customizations")  # 커스터마이징 정보 추가
                },
                "most_frequent_menu": most_frequent,
                "total_orders": len(orders),
                "order_summary": [
                    {
                        "menu": order["items"][0].get("menu_code") if order["items"] else None,
                        "style": order["items"][0].get("style") if order["items"] else None,
                        "date": order["created_at"].isoformat() if order["created_at"] else None,
                        "customizations": order["items"][0].get("customizations") if order["items"] else None
                    }
                    for order in orders
                ]
            }

        except Exception as e:
            logger.error(f"주문 이력 조회 실패: {e}")
            return {"has_history": False, "error": str(e)}

    def get_or_create_session(self, session_id: str) -> ConversationSession:
        """세션 가져오기 또는 생성"""
        if session_id not in conversation_sessions:
            conversation_sessions[session_id] = ConversationSession(session_id)
        return conversation_sessions[session_id]

    async def get_active_events(self, db: Session) -> dict[str, Any]:
        """활성 이벤트 및 할인 정보 조회"""
        try:
            from datetime import date
            query = text("""
                SELECT 
                    e.event_id,
                    e.title,
                    e.description,
                    e.discount_label,
                    e.start_date,
                    e.end_date,
                    e.is_published,
                    json_agg(
                        json_build_object(
                            'target_type', md.target_type,
                            'discount_type', md.discount_type,
                            'discount_value', md.discount_value,
                            'menu_item_id', md.menu_item_id,
                            'side_dish_id', md.side_dish_id,
                            'menu_name', mi.name,
                            'side_dish_name', sd.name
                        )
                    ) FILTER (WHERE md.menu_discount_id IS NOT NULL) as discounts
                FROM events e
                LEFT JOIN menu_discounts md ON e.event_id = md.event_id
                LEFT JOIN menu_items mi ON md.menu_item_id = mi.menu_item_id
                LEFT JOIN side_dishes sd ON md.side_dish_id = sd.side_dish_id
                WHERE e.is_published = true
                    AND (e.start_date IS NULL OR e.start_date <= :today)
                    AND (e.end_date IS NULL OR e.end_date >= :today)
                GROUP BY e.event_id, e.title, e.description, e.discount_label, 
                         e.start_date, e.end_date, e.is_published
                ORDER BY e.start_date DESC NULLS LAST
                LIMIT 10
            """)
            result = db.execute(query, {"today": date.today()})
            rows = result.fetchall()
            
            events = []
            for row in rows:
                discounts = row[9] if row[9] else []
                # discounts가 리스트가 아닌 경우 처리
                if not isinstance(discounts, list):
                    discounts = []
                
                event_data = {
                    "event_id": str(row[0]),
                    "title": row[1],
                    "description": row[2],
                    "discount_label": row[3],
                    "start_date": row[4].isoformat() if row[4] else None,
                    "end_date": row[5].isoformat() if row[5] else None,
                    "discounts": discounts
                }
                events.append(event_data)
                
                # 이벤트 정보 로깅
                logger.info(f"활성 이벤트 발견: {event_data['title']}, 할인 개수: {len(discounts)}")
            
            logger.info(f"총 {len(events)}개의 활성 이벤트 조회 완료")
            return {"events": events, "count": len(events)}
        except Exception as e:
            # 테이블이 없거나 다른 DB 오류인 경우 조용히 처리
            error_msg = str(e)
            if "does not exist" in error_msg or "relation" in error_msg.lower():
                logger.debug(f"이벤트 테이블이 없거나 접근할 수 없습니다: {error_msg}")
            else:
                logger.warning(f"이벤트 조회 실패: {e}")
            return {"events": [], "count": 0}

    async def analyze_voice_input(
        self,
        transcript: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> dict[str, Any]:
        """음성 입력 분석 및 메뉴 추천 (고도화 버전) - 새로운 Gemini API 사용"""

        # 세션 관리
        session = None
        conversation_context = "첫 대화"
        order_state_summary = ""
        customer_name = None
        
        if session_id:
            session = self.get_or_create_session(session_id)
            conversation_context = session.get_context_summary()
            order_state_summary = session.get_order_state_summary()
            session.add_message("user", transcript)

        # 사용자 정보 조회 (이름 가져오기)
        if user_id and db:
            try:
                from sqlalchemy import text
                user_query = text("SELECT name FROM users WHERE user_id = :user_id")
                user_result = db.execute(user_query, {"user_id": user_id})
                user_row = user_result.fetchone()
                if user_row:
                    customer_name = user_row[0]
            except Exception as e:
                logger.debug(f"사용자 이름 조회 실패: {e}")

        # 과거 주문 이력 조회
        order_history = {"has_history": False}
        if user_id and db:
            order_history = await self.get_user_order_history(user_id, db)

        # 활성 이벤트 조회
        events_data = {"events": [], "count": 0}
        if db:
            events_data = await self.get_active_events(db)

        # 메뉴 데이터를 JSON 문자열로 변환
        menu_data_str = json.dumps(self.menu_data, ensure_ascii=False, indent=2)
        order_history_str = json.dumps(order_history, ensure_ascii=False, indent=2)
        events_str = json.dumps(events_data, ensure_ascii=False, indent=2)

        # JSON 문자열의 중괄호를 이스케이프 처리 (format 메서드가 플레이스홀더로 인식하지 않도록)
        # format 대신 replace를 사용하여 JSON 데이터의 중괄호와 충돌 방지
        try:
            system_prompt = self.system_prompt_template.replace('{menu_data}', menu_data_str)
            system_prompt = system_prompt.replace('{order_history}', order_history_str)
            system_prompt = system_prompt.replace('{conversation_context}', conversation_context)
            system_prompt = system_prompt.replace('{transcript}', transcript)
        except Exception as e:
            logger.error(f"프롬프트 템플릿 처리 오류: {e}")
            # 폴백: format 사용 (JSON 데이터의 중괄호를 이스케이프)
            menu_data_escaped = menu_data_str.replace('{', '{{').replace('}', '}}')
            order_history_escaped = order_history_str.replace('{', '{{').replace('}', '}}')
            system_prompt = self.system_prompt_template.format(
                menu_data=menu_data_escaped,
                order_history=order_history_escaped,
                conversation_context=conversation_context,
                transcript=transcript
            )

        # 이벤트 정보 추가 (구조화된 형태로)
        if events_data["count"] > 0:
            events_list = events_data.get("events", [])
            events_detail = []
            
            for event in events_list:
                event_info = f"이벤트: {event.get('title', '제목 없음')}"
                if event.get('description'):
                    event_info += f"\n설명: {event.get('description')}"
                if event.get('discount_label'):
                    event_info += f"\n할인 라벨: {event.get('discount_label')}"
                
                # 할인 정보 상세
                discounts = event.get('discounts', [])
                if discounts:
                    discount_details = []
                    for discount in discounts:
                        if not isinstance(discount, dict):
                            continue
                            
                        if discount.get('target_type') == 'menu_item':
                            menu_name = discount.get('menu_name') or '알 수 없음'
                            discount_type = discount.get('discount_type') or ''
                            discount_value = discount.get('discount_value')
                            
                            if discount_type == 'percentage' and discount_value is not None:
                                discount_info = f"{menu_name}: {discount_value}% 할인"
                            elif discount_type == 'fixed' and discount_value is not None:
                                discount_info = f"{menu_name}: {discount_value:,}원 할인"
                            elif discount_type:
                                discount_info = f"{menu_name}: {discount_type} 할인"
                            else:
                                discount_info = f"{menu_name}: 할인 적용"
                            
                            discount_details.append(discount_info)
                        elif discount.get('target_type') == 'side_dish':
                            side_dish_name = discount.get('side_dish_name') or '알 수 없음'
                            discount_type = discount.get('discount_type') or ''
                            discount_value = discount.get('discount_value')
                            
                            if discount_type == 'percentage' and discount_value is not None:
                                discount_info = f"사이드 디시 {side_dish_name}: {discount_value}% 할인"
                            elif discount_type == 'fixed' and discount_value is not None:
                                discount_info = f"사이드 디시 {side_dish_name}: {discount_value:,}원 할인"
                            elif discount_type:
                                discount_info = f"사이드 디시 {side_dish_name}: {discount_type} 할인"
                            else:
                                discount_info = f"사이드 디시 {side_dish_name}: 할인 적용"
                            
                            discount_details.append(discount_info)
                    
                    if discount_details:
                        event_info += f"\n할인 대상:\n" + "\n".join(f"  - {detail}" for detail in discount_details)
                
                if event.get('start_date') or event.get('end_date'):
                    date_range = []
                    if event.get('start_date'):
                        date_range.append(f"시작: {event.get('start_date')}")
                    if event.get('end_date'):
                        date_range.append(f"종료: {event.get('end_date')}")
                    if date_range:
                        event_info += f"\n기간: {', '.join(date_range)}"
                
                events_detail.append(event_info)
            
            events_formatted = "\n\n".join(events_detail)
            events_section = f"\n\n[현재 진행 중인 이벤트 및 할인 정보]\n\n{events_formatted}\n\n⚠️ 중요: 위 이벤트 정보를 반드시 고객에게 안내하세요. 특히 PROMOTION_GREETING 상태에서는 이벤트와 할인 정보를 먼저 열거한 후 인사하세요."
            system_prompt += events_section
            logger.info(f"이벤트 정보를 프롬프트에 추가: {len(events_list)}개 이벤트")
        else:
            # 이벤트가 없을 때도 명시
            events_section = "\n\n[현재 진행 중인 이벤트]\n현재 진행 중인 이벤트가 없습니다."
            system_prompt += events_section
            logger.debug("활성 이벤트가 없습니다")

        # 현재 주문 상태 정보 추가
        current_state = "PROMOTION_GREETING"
        if session:
            current_state = session.order_state.get("current_state", "PROMOTION_GREETING")
        
        state_section = f"\n\n[현재 주문 상태]\n상태: {current_state}\n\n"
        if current_state == "PROMOTION_GREETING":
            if events_data["count"] > 0:
                state_section += "⚠️ 필수: 위에 제공된 이벤트와 할인 정보를 반드시 먼저 열거하세요. 이벤트 제목, 할인 대상 메뉴, 할인율/할인금액을 구체적으로 안내한 후, 고객 이름으로 인사하세요. 예: \"현재 진행 중인 이벤트가 있습니다. [이벤트 제목]으로 [메뉴명] [할인율/금액] 할인 중입니다. 안녕하세요, [고객명] 고객님...\""
            else:
                state_section += "현재 진행 중인 이벤트가 없습니다. '현재 진행 중인 특별 이벤트는 없지만, 맛있는 디너를 추천해드릴 수 있습니다'라고 안내한 후, 고객 이름으로 인사하세요."
            state_section += "\n다음 상태로 자동 전환: MENU_CONVERSATION"
        elif current_state == "MENU_CONVERSATION":
            state_section += "고객에게 간단한 질문을 하여 정보를 수집하세요. 정보가 충분하면 state_decision을 1로, 부족하면 0으로 설정하세요."
        elif current_state == "MENU_RECOMMENDATION":
            state_section += "메뉴를 추천하고, 고객이 선택한 메뉴에 따라 menu_selection을 설정하세요 (0=선택 못함, 1=french, 2=english, 3=valentine, 4=champagne)."
        elif current_state == "STYLE_RECOMMENDATION":
            state_section += f"스타일을 추천하세요. 선택된 메뉴: {session.order_state.get('menu_code', '없음')}. 샴페인 축제는 grand(2)와 deluxe(3)만 가능합니다. style_selection을 설정하세요 (0=선택 못함, 1=simple, 2=grand, 3=deluxe)."
        elif current_state == "QUANTITY_SELECTION":
            state_section += "수량을 조정할 수 있도록 안내하세요. quantity 필드에 수량을 설정하세요."
        elif current_state == "INGREDIENT_CUSTOMIZATION":
            state_section += "주 재료와 테이블웨어 수량을 조정하는 단계입니다. 메뉴별 기본 구성은 [3. 메뉴 데이터베이스]의 base_ingredients를 참고하세요. 변경된 수량은 customization_overrides에 기록하고, 확인을 받으세요. 확인 후에는 CHECKOUT_READY 상태로 전환하세요."
        elif current_state == "CHECKOUT_READY":
            state_section += "주문이 완료되었습니다. order 페이지로 이동할 준비가 되었습니다."
        
        system_prompt += state_section

        # 주문 상태 요약 추가
        if order_state_summary and order_state_summary != "주문 시작 전":
            summary_section = f"\n\n[주문 진행 요약]\n{order_state_summary}\n\n위 정보를 참고하여 응답하세요."
            system_prompt += summary_section

        # 고객 이름 정보 추가
        if customer_name:
            name_section = f"\n\n[고객 정보]\n고객 이름: {customer_name}\n\n응답할 때 고객 이름을 자연스럽게 사용하세요. 예: \"{customer_name} 고객님\", \"{customer_name}님\""
            system_prompt += name_section
        else:
            name_section = "\n\n[고객 정보]\n고객 이름이 제공되지 않았습니다. 일반적인 인사로 시작하세요."
            system_prompt += name_section

        response_text = ""  # except 블록에서 접근 가능하도록 미리 선언
        try:
            # 새로운 Gemini API 호출
            # 빠른 시작 문서에 따르면 contents는 문자열로 전달
            logger.debug(f"Gemini API 호출 시작: model={self.model_name}, prompt_length={len(system_prompt)}")
            
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=system_prompt
                )
                logger.debug(f"Gemini API 응답 수신: response_type={type(response)}")
            except Exception as api_error:
                logger.error(f"Gemini API 호출 실패: {type(api_error).__name__}: {api_error}", exc_info=True)
                raise ValueError(f"Gemini API 호출 실패: {str(api_error)}") from api_error

            # 응답 텍스트 추출 (새 API 구조)
            # 빠른 시작 문서에 따르면 response.text로 직접 접근 가능
            try:
                # 먼저 response.text 속성/메서드 확인
                if hasattr(response, 'text'):
                    text_attr = getattr(response, 'text')
                    if callable(text_attr):
                        # 메서드인 경우
                        response_text = text_attr().strip()
                    else:
                        # 속성인 경우
                        response_text = str(text_attr).strip()
                # 그 다음 parts 확인
                elif hasattr(response, 'parts') and response.parts:
                    # parts에서 텍스트 추출
                    for part in response.parts:
                        if hasattr(part, 'text') and part.text:
                            response_text += str(part.text)
                    response_text = response_text.strip()
                # 마지막으로 candidates 확인
                elif hasattr(response, 'candidates') and response.candidates:
                    # candidates에서 텍스트 추출
                    for candidate in response.candidates:
                        if hasattr(candidate, 'content') and candidate.content:
                            content = candidate.content
                            if hasattr(content, 'parts') and content.parts:
                                for part in content.parts:
                                    if hasattr(part, 'text') and part.text:
                                        response_text += str(part.text)
                    response_text = response_text.strip()
                
                if not response_text:
                    # 응답 객체 구조를 로깅하여 디버깅
                    logger.error(f"Gemini API 응답 구조 분석:")
                    logger.error(f"  - 타입: {type(response)}")
                    logger.error(f"  - 속성: {[attr for attr in dir(response) if not attr.startswith('_')]}")
                    if hasattr(response, '__dict__'):
                        logger.error(f"  - __dict__: {response.__dict__}")
                    # response 객체를 문자열로 변환 시도
                    try:
                        response_str = str(response)
                        logger.error(f"  - 문자열 표현: {response_str[:500]}")
                    except:
                        pass
                    raise ValueError("Gemini API 응답에서 텍스트를 찾을 수 없습니다.")
                
                logger.debug(f"Gemini API 응답 텍스트 추출 성공: length={len(response_text)}")
            except AttributeError as e:
                logger.error(f"Gemini API 응답 파싱 오류: {e}, response type: {type(response)}")
                logger.error(f"Response attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")
                raise ValueError(f"Gemini API 응답 구조가 예상과 다릅니다: {e}") from e

            # JSON 코드 블록 제거
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            result = json.loads(response_text)

            # 응답 검증 및 기본값 설정
            if 'intent' not in result:
                result['intent'] = 'other'
            if 'confidence' not in result:
                result['confidence'] = 0.5
            if 'response' not in result:
                result['response'] = "죄송합니다. 다시 한 번 말씀해 주시겠어요?"
            if 'analysis' not in result:
                result['analysis'] = {
                    "situation": "파악 불가",
                    "constraints": [],
                    "user_needs": []
                }
            if 'alternatives' not in result:
                result['alternatives'] = []
            
            # 상태 관련 필드 기본값 설정
            if 'state' not in result:
                result['state'] = current_state if session else 'PROMOTION_GREETING'
            if 'state_decision' not in result:
                result['state_decision'] = 0
            if 'menu_selection' not in result:
                result['menu_selection'] = 0
            if 'style_selection' not in result:
                result['style_selection'] = 0
            if 'quantity' not in result:
                result['quantity'] = 1
            if 'quantity_confirmed' not in result:
                result['quantity_confirmed'] = 0
            if 'customization_overrides' not in result:
                result['customization_overrides'] = {}
            if 'customization_confirmed' not in result:
                result['customization_confirmed'] = 0

            # 세션에 AI 응답 저장 및 주문 상태 업데이트
            if session:
                session.add_message("assistant", result.get('response', ''))

                # 분석 결과를 컨텍스트에 저장
                if 'analysis' in result:
                    analysis = result['analysis']
                    if 'situation' in analysis:
                        session.update_context('situation', analysis['situation'])

                    # 제약조건에서 인원수, 예산 추출
                    for constraint in analysis.get('constraints', []):
                        if '명' in constraint:
                            try:
                                people = int(''.join(filter(str.isdigit, constraint)))
                                session.update_context('people', people)
                            except:
                                pass
                        if '원' in constraint or '예산' in constraint:
                            try:
                                budget = int(''.join(filter(str.isdigit, constraint)))
                                session.update_context('budget', budget)
                            except:
                                pass

                # 상태 전환 로직
                current_state = session.order_state.get("current_state", "PROMOTION_GREETING")
                model_state_hint = result.get('state')
                new_state = current_state
                
                # 상태별 전환 로직
                if current_state == "PROMOTION_GREETING":
                    new_state = "MENU_CONVERSATION"
                
                elif current_state == "MENU_CONVERSATION":
                    state_decision = result.get('state_decision', 0)
                    has_context = any([
                        session.context.get("situation"),
                        session.context.get("people"),
                        session.context.get("budget"),
                        session.context.get("constraints")
                    ])
                    if (state_decision == 1 or model_state_hint == "MENU_RECOMMENDATION") and has_context:
                        new_state = "MENU_RECOMMENDATION"
                    else:
                        new_state = "MENU_CONVERSATION"
                
                elif current_state == "MENU_RECOMMENDATION":
                    menu_selection = result.get('menu_selection', 0)
                    menu_code_map = {1: "french", 2: "english", 3: "valentine", 4: "champagne"}
                    if menu_selection in menu_code_map:
                        menu_code = menu_code_map[menu_selection]
                        menu_name_map = {
                            "french": "프렌치 디너",
                            "english": "잉글리시 디너",
                            "valentine": "발렌타인 디너",
                            "champagne": "샴페인 축제 디너"
                        }
                        session.update_order_state(
                            menu_code=menu_code,
                            menu_name=menu_name_map.get(menu_code, menu_code)
                        )
                        session.advance_stage(OrderStage.MENU_SELECTED)
                        new_state = "STYLE_RECOMMENDATION"
                    elif model_state_hint == "STYLE_RECOMMENDATION":
                        new_state = "STYLE_RECOMMENDATION"
                
                elif current_state == "STYLE_RECOMMENDATION":
                    style_selection = result.get('style_selection', 0)
                    style_code_map = {1: "simple", 2: "grand", 3: "deluxe"}
                    selected_menu_code = session.order_state.get("menu_code")
                    
                    if selected_menu_code == "champagne" and style_selection == 1:
                        new_state = "STYLE_RECOMMENDATION"
                    elif style_selection in style_code_map:
                        style_code = style_code_map[style_selection]
                        style_name_map = {
                            "simple": "심플",
                            "grand": "그랜드",
                            "deluxe": "디럭스"
                        }
                        session.update_order_state(
                            style_code=style_code,
                            style_name=style_name_map.get(style_code, style_code)
                        )
                        session.advance_stage(OrderStage.STYLE_SELECTED)
                        new_state = "QUANTITY_SELECTION"
                    elif model_state_hint == "QUANTITY_SELECTION":
                        new_state = "QUANTITY_SELECTION"
                
                elif current_state == "QUANTITY_SELECTION":
                    quantity = result.get('quantity', session.order_state.get("quantity") or 1)
                    if quantity and quantity > 0:
                        session.update_order_state(quantity=quantity)
                    ready_for_customization = (
                        result.get('quantity_confirmed') == 1
                        or model_state_hint == "INGREDIENT_CUSTOMIZATION"
                        or self._contains_confirmation_keyword(transcript)
                    )
                    if ready_for_customization:
                        session.advance_stage(OrderStage.QUANTITY_SELECTED)
                        new_state = "INGREDIENT_CUSTOMIZATION"
                    else:
                        new_state = "QUANTITY_SELECTION"
                
                elif current_state == "INGREDIENT_CUSTOMIZATION":
                    overrides = result.get('customization_overrides') or {}
                    if overrides:
                        session.update_order_state(customizations=overrides)
                    ready_for_checkout = (
                        result.get('customization_confirmed') == 1
                        or model_state_hint == "CHECKOUT_READY"
                        or self._contains_confirmation_keyword(transcript)
                    )
                    if ready_for_checkout:
                        session.advance_stage(OrderStage.CUSTOMIZING)
                        session.advance_stage(OrderStage.CHECKOUT_READY)
                        new_state = "CHECKOUT_READY"
                    else:
                        new_state = "INGREDIENT_CUSTOMIZATION"

                # ---------------------------------------------
                # 단계 일관성 강제: 메뉴 → 스타일 → 수량 → 커스터마이징 → 체크아웃
                # 프론트엔드와 동일한 순서를 따르도록, 현재 주문 상태를 기준으로
                # 너무 앞 단계로 점프하려는 상태를 클램핑한다.
                # ---------------------------------------------
                menu_code = session.order_state.get("menu_code")
                style_code = session.order_state.get("style_code")
                quantity = session.order_state.get("quantity")

                # 1단계: 메뉴가 아직 없으면 항상 메뉴 추천 단계에 머무르거나 돌아간다.
                if not menu_code:
                    # 프로모션/대화 단계는 그대로 두되, 이후 단계는 메뉴 추천으로 강제
                    if new_state not in ("PROMOTION_GREETING", "MENU_CONVERSATION", "MENU_RECOMMENDATION"):
                        new_state = "MENU_RECOMMENDATION"

                # 2단계: 메뉴는 있지만 스타일이 없으면 스타일 추천 단계까지만 허용
                elif not style_code:
                    if new_state not in ("STYLE_RECOMMENDATION",):
                        new_state = "STYLE_RECOMMENDATION"

                # 3단계: 메뉴와 스타일은 있지만 수량이 없으면 수량 선택 단계까지만 허용
                elif not quantity or quantity <= 0:
                    if new_state not in ("QUANTITY_SELECTION",):
                        new_state = "QUANTITY_SELECTION"

                # 4단계: 메뉴/스타일/수량이 모두 있는 경우에만 커스터마이징/체크아웃으로 진행
                # (INGREDIENT_CUSTOMIZATION, CHECKOUT_READY는 그대로 허용)

                # 상태 업데이트
                session.update_order_state(current_state=new_state)
                
                # 주문 상태 정보를 응답에 추가
                result['order_state'] = {
                    "stage": session.order_state["stage"],
                    "current_state": new_state,  # 업데이트된 상태
                    "menu_code": session.order_state.get("menu_code"),
                    "menu_name": session.order_state.get("menu_name"),
                    "style_code": session.order_state.get("style_code"),
                    "style_name": session.order_state.get("style_name"),
                    "quantity": session.order_state.get("quantity"),
                    "customizations": session.order_state.get("customizations", {}),
                    "has_customizations": bool(session.order_state.get("customizations"))
                }
                
                # 응답에 상태 관련 정보 추가
                result['state'] = new_state
                result['state_decision'] = result.get('state_decision', 0)
                result['menu_selection'] = result.get('menu_selection', 0)
                result['style_selection'] = result.get('style_selection', 0)
                result['quantity'] = session.order_state.get("quantity", 1)
                result['customization_overrides'] = session.order_state.get("customizations", {})
            else:
                # 세션이 없으면 기본 상태
                result['order_state'] = {
                    "stage": OrderStage.INITIAL.value,
                    "menu_code": None,
                    "menu_name": None,
                    "style_code": None,
                    "style_name": None,
                    "quantity": None,
                    "customizations": {},
                    "has_customizations": False,
                    "current_state": "PROMOTION_GREETING"
                }
                result['customization_overrides'] = {}

            logger.info(f"Gemini 분석 성공: intent={result.get('intent')}, confidence={result.get('confidence')}, stage={result.get('order_state', {}).get('stage', 'unknown')}")
            return result

        except json.JSONDecodeError as e:
            response_preview = response_text[:500] if response_text else "(응답 없음)"
            logger.error(f"JSON 파싱 오류: {e}\n응답 (처음 500자): {response_preview}")
            result = {
                "intent": "error",
                "confidence": 0,
                "response": "죄송합니다. 잠시 오류가 발생했습니다. 다시 시도해 주세요.",
                "error": f"JSON 파싱 실패: {str(e)}",
                "analysis": {"situation": "에러", "constraints": [], "user_needs": []},
                "alternatives": []
            }
            if session:
                result["order_state"] = {
                    "stage": session.order_state["stage"],
                    "menu_code": session.order_state.get("menu_code"),
                    "menu_name": session.order_state.get("menu_name"),
                }
            return result
        except ValueError as e:
            # API 키 누락, 응답 구조 오류 등
            logger.error(f"Gemini 서비스 값 오류: {e}", exc_info=True)
            result = {
                "intent": "error",
                "confidence": 0,
                "response": "죄송합니다. 서비스 설정에 문제가 있습니다.",
                "error": str(e),
                "analysis": {"situation": "에러", "constraints": [], "user_needs": []},
                "alternatives": []
            }
            if session:
                result["order_state"] = {
                    "stage": session.order_state["stage"],
                    "menu_code": session.order_state.get("menu_code"),
                    "menu_name": session.order_state.get("menu_name"),
                }
            return result
        except Exception as e:
            logger.error(f"Gemini API 예상치 못한 오류: {e}", exc_info=True)
            logger.error(f"오류 타입: {type(e).__name__}, 오류 메시지: {str(e)}")
            result = {
                "intent": "error",
                "confidence": 0,
                "response": "죄송합니다. 서비스 연결에 문제가 있습니다.",
                "error": f"{type(e).__name__}: {str(e)}",
                "analysis": {"situation": "에러", "constraints": [], "user_needs": []},
                "alternatives": []
            }
            if session:
                result["order_state"] = {
                    "stage": session.order_state["stage"],
                    "menu_code": session.order_state.get("menu_code"),
                    "menu_name": session.order_state.get("menu_name"),
                }
            return result


# 싱글톤 인스턴스
gemini_service = None

def get_gemini_service():
    """Gemini 서비스 인스턴스 반환"""
    global gemini_service
    if gemini_service is None:
        gemini_service = GeminiService()
    return gemini_service
