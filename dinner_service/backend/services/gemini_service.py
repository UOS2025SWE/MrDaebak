"""
Gemini API 서비스
음성 주문 분석 및 메뉴 추천 시스템 (고도화 버전)
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Any, Optional
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import text

# 로깅 설정
logger = logging.getLogger(__name__)

# 대화 세션 저장소 (인메모리)
conversation_sessions = {}

class ConversationSession:
    """대화 컨텍스트 관리 클래스"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages = []  # [{role, content, timestamp}]
        self.context = {}   # {situation, people, budget, constraints}
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

    def update_context(self, key: str, value: Any):
        """컨텍스트 업데이트"""
        self.context[key] = value


class GeminiService:
    def __init__(self):
        """Gemini API 초기화"""
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다")

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-exp')

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
                        # 다른 아이템 추가 감지
                        elif change_type == "ADD" or (change_type == "CHANGE_QUANTITY" and quantity_change > 0):
                            if "side_dishes" not in customizations:
                                customizations["side_dishes"] = []
                            if item_name not in ["heart_plate", "cupid_decoration", "napkin", "premium_steak", "coffee", "fresh_salad", "scrambled_eggs", "bacon", "bread", "champagne_bottle", "baguette", "coffee_pot"]:
                                customizations["side_dishes"].append(item_name)
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

    async def analyze_voice_input(
        self,
        transcript: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> dict[str, Any]:
        """음성 입력 분석 및 메뉴 추천 (고도화 버전)"""

        # 세션 관리
        session = None
        conversation_context = "첫 대화"
        if session_id:
            session = self.get_or_create_session(session_id)
            conversation_context = session.get_context_summary()
            session.add_message("user", transcript)

        # 과거 주문 이력 조회
        order_history = {"has_history": False}
        if user_id and db:
            order_history = await self.get_user_order_history(user_id, db)

        # 메뉴 데이터를 JSON 문자열로 변환
        menu_data_str = json.dumps(self.menu_data, ensure_ascii=False, indent=2)
        order_history_str = json.dumps(order_history, ensure_ascii=False, indent=2)

        # 프롬프트 구성
        system_prompt = self.system_prompt_template.format(
            menu_data=menu_data_str,
            order_history=order_history_str,
            conversation_context=conversation_context,
            transcript=transcript
        )

        try:
            # Gemini API 호출
            response = self.model.generate_content(system_prompt)

            # JSON 파싱
            response_text = response.text.strip()

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

            # 세션에 AI 응답 저장
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

            logger.info(f"Gemini 분석 성공: intent={result.get('intent')}, confidence={result.get('confidence')}")
            return result

        except json.JSONDecodeError as e:
            logger.error(f"JSON 파싱 오류: {e}\n응답: {response_text[:200]}")
            return {
                "intent": "error",
                "confidence": 0,
                "response": "죄송합니다. 잠시 오류가 발생했습니다. 다시 시도해 주세요.",
                "error": str(e),
                "analysis": {"situation": "에러", "constraints": [], "user_needs": []},
                "alternatives": []
            }
        except Exception as e:
            logger.error(f"Gemini API 오류: {e}")
            return {
                "intent": "error",
                "confidence": 0,
                "response": "죄송합니다. 서비스 연결에 문제가 있습니다.",
                "error": str(e),
                "analysis": {"situation": "에러", "constraints": [], "user_needs": []},
                "alternatives": []
            }


# 싱글톤 인스턴스
gemini_service = None

def get_gemini_service():
    """Gemini 서비스 인스턴스 반환"""
    global gemini_service
    if gemini_service is None:
        gemini_service = GeminiService()
    return gemini_service
