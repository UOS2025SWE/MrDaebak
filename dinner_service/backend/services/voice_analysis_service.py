import os
import json
import logging
import re
import traceback
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import text

from .ai_client import get_ai_client
from ..services.menu_service import MenuService

# 로깅 설정
logger = logging.getLogger(__name__)

# 대화 세션 저장소 (인메모리)
conversation_sessions: Dict[str, 'ConversationSession'] = {}

# 세션 만료 시간 (기본 1시간)
SESSION_EXPIRY_HOURS = 1


class OrderStage(str, Enum):
    """주문 단계"""
    INITIAL = "initial"
    MENU_SELECTED = "menu_selected"
    STYLE_SELECTED = "style_selected"
    QUANTITY_SELECTED = "quantity_selected"
    CUSTOMIZING = "customizing"
    CHECKOUT_READY = "checkout_ready"


class ConversationSession:
    """대화 컨텍스트 및 주문 상태 관리 클래스"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages: List[Dict[str, str]] = []  # [{role, content, timestamp}]
        self.context: Dict[str, Any] = {}   # {situation, people, budget, constraints}
        self.order_state: Dict[str, Any] = {
            "stage": OrderStage.INITIAL.value,
            "menu_code": None,
            "menu_name": None,
            "style_code": None,
            "style_name": None,
            "quantity": 1,
            "customizations": {},
            "customization_overrides": {},  # overrides for prompt
            "default_ingredients_by_quantity": {},  # 수량이 반영된 기본 재료 (고정 베이스)
            "events_shown": [],
            "current_state": "MENU_CONVERSATION",
            "scheduled_for": None,
            "previous_state": None
        }
        self.created_at = datetime.now()
        self.last_accessed = datetime.now()

    def add_message(self, role: str, content: str):
        """메시지 추가"""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })

    def get_context_summary(self) -> str:
        """대화 요약 (최근 10개 메시지)"""
        if not self.messages:
            return "첫 대화"

        recent = self.messages[-10:]
        summary_lines = []

        for msg in recent:
            role_kr = "사용자" if msg['role'] == 'user' else "상담사"
            summary_lines.append(f"{role_kr}: {msg['content']}")

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
        parts = []
        if state.get("menu_name"):
            parts.append(f"메뉴: {state['menu_name']}")
        if state.get("style_name"):
            parts.append(f"스타일: {state['style_name']}")
        if state.get("quantity"):
            parts.append(f"수량: {state['quantity']}개")
        if state.get("customizations") or state.get("customization_overrides"):
            parts.append("커스터마이징 있음")
        if state.get("scheduled_for"):
            parts.append(f"배송: {state['scheduled_for']}")
        
        return ", ".join(parts) if parts else "주문 진행 중"

    def update_context(self, key: str, value: Any):
        self.context[key] = value

    def update_order_state(self, **kwargs):
        self.order_state.update(kwargs)


class VoiceAnalysisService:
    def __init__(self):
        """음성 분석 서비스 초기화"""
        self.ai_client = get_ai_client()

        # 외부 파일에서 설정 로드
        self.menu_data = self._load_menu_data()
        self.prompts = self._load_all_prompts()
        
        # 모든 가능한 재료 코드 수집 (유효성 검증용) - DB 세션이 없어 여기서는 빈 세트 초기화
        self.all_ingredient_codes = set()
    
    def _ensure_ingredient_codes_loaded(self, db: Session) -> None:
        """DB에서 유효한 재료 코드 목록 로드"""
        if self.all_ingredient_codes:
            return
            
        try:
            ingredients = MenuService.get_all_ingredients(db)
            self.all_ingredient_codes = {item["code"] for item in ingredients}
            logger.info(f"Loaded {len(self.all_ingredient_codes)} ingredient codes from DB")
        except Exception as e:
            logger.error(f"Failed to load ingredient codes from DB: {e}")
            # Fallback to minimal known set if DB fails (prevent total breakage)
            self.all_ingredient_codes = {
                "premium_steak", "wine", "champagne_bottle", "cake_base", "buttercream_frosting",
                "fresh_berries", "fondant", "edible_gold_leaf", "chocolate_ganache",
                "cake_board", "edible_flowers"
            }

    def _load_menu_data(self) -> dict[str, Any]:
        """외부 JSON 파일에서 메뉴 데이터 로드"""
        try:
            config_dir = Path(__file__).parent.parent / "config"
            menu_file = config_dir / "gemini_menu_data.json"

            with open(menu_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"메뉴 데이터 로드 실패: {e}")
            return {
                "valentine": {
                    "name": "발렌타인 디너",
                    "styles_detail": {"simple": {"price": 30000, "cooking_time": 25}}
                }
            }

    def _load_all_prompts(self) -> dict[str, str]:
        """모든 상태별 프롬프트 로드"""
        prompts = {}
        states = [
            "menu_conversation", "menu_recommendation", "style_recommendation",
            "quantity_selection", "ingredient_customization", "scheduling", "checkout_ready"
        ]
        config_dir = Path(__file__).parent.parent / "config" / "prompts"
        
        for state in states:
            try:
                file_path = config_dir / f"{state}.txt"
                with open(file_path, 'r', encoding='utf-8') as f:
                    prompts[state.upper()] = f.read().strip()
            except Exception as e:
                logger.error(f"프롬프트 로드 실패 ({state}): {e}")
                prompts[state.upper()] = f"Error loading prompt for {state}"
        return prompts

    def get_or_create_session(self, session_id: str) -> ConversationSession:
        if session_id not in conversation_sessions:
            conversation_sessions[session_id] = ConversationSession(session_id)
        else:
            conversation_sessions[session_id].last_accessed = datetime.now()
        return conversation_sessions[session_id]
    
    def cleanup_expired_sessions(self) -> int:
        expiry_time = datetime.now() - timedelta(hours=SESSION_EXPIRY_HOURS)
        expired_sessions = [
            sid for sid, sess in conversation_sessions.items()
            if sess.last_accessed < expiry_time
        ]
        for sid in expired_sessions:
            del conversation_sessions[sid]
        
        if expired_sessions:
            logger.info(f"만료된 세션 {len(expired_sessions)}개 정리 완료")
        return len(expired_sessions)

    # -------------------------------------------------------------------------
    # LLM Helper Methods
    # -------------------------------------------------------------------------
    async def _call_llm(
        self,
        state: str,
        transcript: str,
        session: Optional[ConversationSession],
        customer_name: Optional[str] = None,
        extra_placeholders: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        공통 LLM 호출 및 JSON 파싱 핸들러.
        """
        # 1. 프롬프트 템플릿 로드
        prompt_template = self.prompts.get(state, "")
        if not prompt_template:
            logger.error(f"No prompt found for state: {state}")
            return {"response": "시스템 오류: 프롬프트를 찾을 수 없습니다.", "decision": 0}

        # 2. 기본 플레이스홀더 준비
        conversation_context = session.get_context_summary() if session else ""
        context_summary = json.dumps(session.context, ensure_ascii=False) if session else "{}"
        menu_data_str = self._get_condensed_menu_data(state, session)
        c_name = customer_name or "고객"

        system_prompt = prompt_template
        system_prompt = system_prompt.replace('{conversation_context}', conversation_context)
        system_prompt = system_prompt.replace('{transcript}', transcript)
        system_prompt = system_prompt.replace('{menu_data}', menu_data_str)
        system_prompt = system_prompt.replace('{context_summary}', context_summary)
        system_prompt = system_prompt.replace('{customer_name}', c_name)

        # 3. 추가/상태별 플레이스홀더 적용
        if extra_placeholders:
            for k, v in extra_placeholders.items():
                system_prompt = system_prompt.replace(k, str(v))
        
        # 누락된 플레이스홀더 정리 (안전장치)
        if '{selected_menu_name}' in system_prompt: system_prompt = system_prompt.replace('{selected_menu_name}', "")
        if '{selected_style_name}' in system_prompt: system_prompt = system_prompt.replace('{selected_style_name}', "")
        if '{quantity}' in system_prompt: system_prompt = system_prompt.replace('{quantity}', "1")
        if '{default_ingredients_by_quantity}' in system_prompt: system_prompt = system_prompt.replace('{default_ingredients_by_quantity}', "{}")
        if '{current_ingredients}' in system_prompt: system_prompt = system_prompt.replace('{current_ingredients}', "{}")
        if '{order_summary}' in system_prompt: system_prompt = system_prompt.replace('{order_summary}', "")
        if '{final_order_summary}' in system_prompt: system_prompt = system_prompt.replace('{final_order_summary}', "")

        # 4. 메시지 구성
        messages = [{"role": "system", "content": system_prompt}]
        if session and session.messages:
            # 최근 메시지 포함 (현재 transcript 제외)
            for msg in session.messages:
                if msg.get("content") != transcript:
                    role = msg.get("role", "user")
                    # role은 'user' or 'assistant'만 허용
                    if role in ["user", "assistant"]:
                         messages.append({"role": role, "content": msg.get("content", "")})
        
        # 현재 사용자 메시지
        messages.append({"role": "user", "content": transcript})

        # 5. LLM 호출
        logger.info(f"Calling LLM for state: {state}, transcript: {transcript[:30]}...")
        try:
            response_text = await self.ai_client.chat_completion(messages=messages, temperature=0.7)
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return {"response": "죄송합니다. 잠시 후 다시 시도해 주세요.", "decision": 0, "error": str(e)}

        # 6. JSON 파싱
        return self._parse_json_response(response_text)

    def _parse_json_response(self, response_text: str) -> Dict[str, Any]:
        """응답 텍스트에서 JSON 추출 및 파싱"""
        text_clean = response_text.strip()
        # Markdown code block 제거
        if text_clean.startswith("```json"):
            text_clean = text_clean[7:]
        if text_clean.startswith("```"): # 언어 지정 없는 경우
            lines = text_clean.split('\n')
            if len(lines) > 1:
                text_clean = "\n".join(lines[1:])
            else:
                text_clean = text_clean[3:]
        if text_clean.endswith("```"):
            text_clean = text_clean[:-3]
        
        text_clean = text_clean.strip()

        try:
            return json.loads(text_clean)
        except json.JSONDecodeError:
            # Regex로 재시도
            match = re.search(r"\{.*\}", text_clean, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            
            # 실패 시 Plain text fallback
            logger.warning(f"JSON parsing failed. Raw text: {text_clean[:100]}...")
            return {
                "response": text_clean,
                "decision": 0,
                "parsing_failed": True
            }

    def _get_condensed_menu_data(self, state: str, session: Optional[ConversationSession]) -> str:
        """상태별 메뉴 데이터 JSON 문자열 반환"""
        if state in ["MENU_CONVERSATION", "MENU_RECOMMENDATION"]:
            condensed = {}
            for code, menu in self.menu_data.items():
                condensed[code] = {
                    "name": menu.get("name", ""),
                    "description": menu.get("description", ""),
                    "situations": menu.get("situations", {}),
                    "recommended_people": menu.get("recommended_people", {}),
                    "strengths": menu.get("strengths", []),
                    "styles_detail": {
                        s: {"price": i.get("price", 0), "cooking_time": i.get("cooking_time", 0)}
                        for s, i in menu.get("styles_detail", {}).items()
                    }
                }
            return json.dumps(condensed, ensure_ascii=False, indent=2)
        
        elif state == "STYLE_RECOMMENDATION":
            menu_code = session.order_state.get("menu_code") if session else None
            if menu_code and menu_code in self.menu_data:
                menu = self.menu_data[menu_code]
                return json.dumps({
                    menu_code: {
                        "name": menu.get("name", ""),
                        "styles_detail": menu.get("styles_detail", {}),
                        "special_notes": menu.get("special_notes", [])
                    }
                }, ensure_ascii=False, indent=2)
            return "{}"
        
        return json.dumps({"note": "메뉴 정보는 이미 선택되었습니다."}, ensure_ascii=False)

    # -------------------------------------------------------------------------
    # State Handlers
    # -------------------------------------------------------------------------
    async def _handle_menu_conversation(self, transcript: str, session: ConversationSession, customer_name: str, db: Optional[Session] = None) -> Dict[str, Any]:
        result = await self._call_llm("MENU_CONVERSATION", transcript, session, customer_name)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        analysis = result.get("analysis", {})
        
        # 메뉴 이름 필터링 (이 단계에서 추천 방지)
        menu_names = ["발렌타인", "프렌치", "잉글리시", "샴페인", "valentine", "french", "english", "champagne"]
        if any(m in response for m in menu_names):
            if decision == 1:
                response = "알겠습니다. 맞춤형 메뉴를 추천해드리겠습니다."
            else:
                response = "어떤 상황이신지 알려주시면 더 맞춤형으로 추천해드릴 수 있습니다."
        
        # Decision 검증: analysis가 충분하지 않으면 진행 불가
        situation = str(analysis.get("situation", "")).strip()
        has_valid_info = bool(situation and situation not in ["", "일반", "없음"])
        
        if decision == 1 and not has_valid_info:
            decision = 0
            response = "어떤 상황이신지 알려주시면 더 맞춤형으로 추천해드릴 수 있습니다."

        # 상태 전환
        next_state = "MENU_CONVERSATION"
        final_response = {
            "response": response,
            "decision": decision,
            "state": next_state
        }

        if decision == 1:
            # 정보 저장
            for k, v in analysis.items():
                session.update_context(k, v)
            
            next_state = "MENU_RECOMMENDATION"
            final_response["state"] = next_state
            
            # 즉시 메뉴 추천 호출
            rec_result = await self._handle_menu_recommendation(
                "메뉴를 추천해주세요.", session, customer_name, db, is_auto_trigger=True
            )
            return rec_result

        return final_response

    async def _handle_menu_recommendation(
        self, 
        transcript: str, 
        session: ConversationSession, 
        customer_name: str,
        db: Optional[Session] = None,
        is_auto_trigger: bool = False
    ) -> Dict[str, Any]:
        current_transcript = transcript
        if is_auto_trigger:
            current_transcript = "메뉴를 추천해주세요. 반드시 JSON 형식으로 응답해주세요."
            
        result = await self._call_llm("MENU_RECOMMENDATION", current_transcript, session, customer_name)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        recommended_menu = result.get("recommended_menu")
        
        final_response = {
            "response": response,
            "decision": decision,
            "state": "MENU_RECOMMENDATION",
            "recommended_menu": recommended_menu
        }
        
        # 메뉴 선택 파싱 (DB 기반 매핑이 이상적이나, 프롬프트가 1,2,3,4를 반환하므로 여기서 매핑 유지)
        # 향후 메뉴가 늘어나면 이 부분도 DB 조회로 변경 필요
        menu_code_map = {1: "french", 2: "english", 3: "valentine", 4: "champagne"}
        sel = result.get("menu_selection", 0)
        
        # Fallback parsing
        if not sel:
            t_lower = transcript.lower()
            if "프렌치" in transcript or "french" in t_lower: sel = 1
            elif "잉글리시" in transcript or "english" in t_lower: sel = 2
            elif "발렌타인" in transcript or "valentine" in t_lower: sel = 3
            elif "샴페인" in transcript or "champagne" in t_lower: sel = 4
            
            if sel:
                decision = 1
                logger.info(f"[MENU_RECOMMENDATION] Fallback menu selection: {sel}")

        if recommended_menu and not sel:
            decision = 0
        
        final_response["decision"] = decision
        
        if decision == 1 and sel in menu_code_map:
            code = menu_code_map[sel]
            name = self.menu_data.get(code, {}).get("name", code)
            session.update_order_state(menu_code=code, menu_name=name)
            
            final_response["state"] = "STYLE_RECOMMENDATION"
            
            # 자동 스타일 추천 트리거
            style_res = await self._handle_style_recommendation(
                "스타일을 추천해주세요.", session, customer_name, db, is_auto_trigger=True
            )
            return style_res

        return final_response

    async def _handle_style_recommendation(
        self, 
        transcript: str, 
        session: ConversationSession, 
        customer_name: str,
        db: Optional[Session] = None,
        is_auto_trigger: bool = False
    ) -> Dict[str, Any]:
        
        current_transcript = transcript
        if is_auto_trigger:
            current_transcript = "스타일을 추천해주세요. 반드시 JSON 형식으로 응답해주세요."
            
        placeholders = {
            '{selected_menu_name}': str(session.order_state.get("menu_name", "")),
            '{selected_menu_code}': str(session.order_state.get("menu_code", ""))
        }
        
        result = await self._call_llm("STYLE_RECOMMENDATION", current_transcript, session, customer_name, placeholders)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        recommended_style = result.get("recommended_style")
        
        final_response = {
            "response": response,
            "decision": decision,
            "state": "STYLE_RECOMMENDATION",
            "recommended_style": recommended_style
        }
        
        style_map = {1: "simple", 2: "grand", 3: "deluxe"}
        sel = result.get("style_selection", 0)
        
        # Fallback parsing
        if not sel:
            t_lower = transcript.lower()
            if "심플" in transcript or "simple" in t_lower: sel = 1
            elif "그랜드" in transcript or "grand" in t_lower: sel = 2
            elif "디럭스" in transcript or "deluxe" in t_lower: sel = 3
            
            if sel:
                decision = 1
                logger.info(f"[STYLE_RECOMMENDATION] Fallback style selection: {sel}")

        if sel == 1 and session.order_state.get("menu_code") == "champagne":
            final_response["response"] = "죄송합니다. 샴페인 축제 디너는 심플 스타일을 선택하실 수 없습니다."
            final_response["decision"] = 0
            return final_response

        if decision == 1 and sel in style_map:
            style_name = style_map[sel]
            session.update_order_state(style_code=style_name, style_name=style_name)
            
            final_response["state"] = "QUANTITY_SELECTION"
            final_response["style_selection"] = sel
        
        return final_response

    async def _handle_quantity_selection(self, transcript: str, session: ConversationSession, customer_name: str, db: Optional[Session] = None) -> Dict[str, Any]:
        placeholders = {
            '{selected_menu_name}': str(session.order_state.get("menu_name", "")),
            '{selected_style_name}': str(session.order_state.get("style_name", ""))
        }
        
        result = await self._call_llm("QUANTITY_SELECTION", transcript, session, customer_name, placeholders)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        qty = result.get("quantity", 1)
        
        try:
            qty = int(qty)
        except ValueError:
            qty = 1
            
        # Fallback parsing for quantity
        fallback_qty = None
        num_match = re.search(r'(\d+)\s*(세트|개|인분|명)?', transcript)
        if num_match:
            fallback_qty = int(num_match.group(1))
        else:
            korean_numbers = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4}
            for w, v in korean_numbers.items():
                if w in transcript:
                    fallback_qty = v
                    break
        
        if fallback_qty and (qty <= 1 and fallback_qty > 1):
            qty = fallback_qty
            logger.info(f"[QUANTITY_SELECTION] Override LLM quantity with fallback: {qty}")
            
        final_response = {
            "response": response,
            "decision": decision,
            "state": "QUANTITY_SELECTION",
            "quantity": qty
        }

        if decision == 1:
            if qty < 1: qty = 1
            session.update_order_state(quantity=qty)
            final_response["quantity"] = qty
            final_response["state"] = "INGREDIENT_CUSTOMIZATION"

            # Pre-calculate default ingredients for the next step (Ingredient Customization)
            # ensuring the frontend has data to display immediately
            menu_code = session.order_state.get("menu_code")
            style_code = session.order_state.get("style_code")
            
            logger.info(f"[QUANTITY_SELECTION] Pre-calculating ingredients for Menu: {menu_code}, Style: {style_code}, Qty: {qty}")
            
            base_ingredients = {}
            if db and menu_code:
                 try:
                    menu_base_data = MenuService.get_base_ingredient_data(db, menu_code)
                    base_ingredients = menu_base_data.get(menu_code, {}).get(style_code, {})
                    logger.info(f"[QUANTITY_SELECTION] Fetched {len(base_ingredients)} base ingredients from DB")
                 except Exception as e:
                    logger.error(f"[QUANTITY_SELECTION] Failed to fetch base ingredients: {e}")
            
            default_ingredients = {}
            for k, v in base_ingredients.items():
                default_ingredients[k] = int(v) * qty
            
            # Save to session
            session.update_order_state(default_ingredients_by_quantity=default_ingredients)
            
            # Add to response for frontend
            final_response["default_ingredients_by_quantity"] = default_ingredients
            final_response["current_ingredients"] = default_ingredients # Start same as default
        
        return final_response

    async def _handle_ingredient_customization(
        self, 
        transcript: str, 
        session: ConversationSession, 
        customer_name: str,
        ui_additions: Optional[Dict[str, Any]],
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        
        # 1. 재료 데이터 준비 (Source of Truth) - DB 기반으로 변경
        menu_code = session.order_state.get("menu_code", "")
        style_code = session.order_state.get("style_code", "")
        quantity = int(session.order_state.get("quantity", 1))
        
        # DB에서 기본 재료 조회
        base_ingredients = {}
        if db:
            try:
                menu_base_data = MenuService.get_base_ingredient_data(db, menu_code)
                # structure: {menu_code: {style_code: {ingredient_code: qty}}}
                base_ingredients = menu_base_data.get(menu_code, {}).get(style_code, {})
            except Exception as e:
                logger.error(f"[INGREDIENT_CUSTOMIZATION] Failed to fetch base ingredients from DB: {e}")
        
        if not base_ingredients:
            logger.warning(f"[INGREDIENT_CUSTOMIZATION] No base ingredients found for {menu_code}/{style_code}")
        
        # 기본 구성(고정) 계산/로드
        stored_default = session.order_state.get("default_ingredients_by_quantity")
        default_ingredients: Dict[str, int] = {}
        
        if stored_default:
            for k, v in stored_default.items():
                default_ingredients[k] = int(v)
        else:
            # 초기 진입 시 계산
            for k, v in base_ingredients.items():
                default_ingredients[k] = int(v) * quantity
            session.update_order_state(default_ingredients_by_quantity=default_ingredients)
            
        # 현재 상태(변경사항 적용) 계산
        current_ingredients = self._calculate_current_ingredients(session, default_ingredients)

        # 2. UI 직접 요청 처리 (LLM 호출 생략)
        if ui_additions:
            logger.info(f"[INGREDIENT_CUSTOMIZATION] UI additions received: {ui_additions}")
            self._apply_ingredient_changes(session, ui_additions, default_ingredients)

            return {
                "response": "재료 구성을 적용했습니다. 이제 배송 일정을 정해볼게요.",
                "decision": 1,
                "state": "SCHEDULING",
                "order_state": session.order_state,
                "default_ingredients_by_quantity": default_ingredients,
                "current_ingredients": self._calculate_current_ingredients(session, default_ingredients)
            }
            
        # 3. LLM 호출
        placeholders = {
            '{selected_menu_name}': str(session.order_state.get("menu_name", "")),
            '{selected_style_name}': str(session.order_state.get("style_name", "")),
            '{quantity}': str(quantity),
            '{default_ingredients_by_quantity}': json.dumps(default_ingredients, ensure_ascii=False, indent=2),
            '{current_ingredients}': json.dumps(current_ingredients, ensure_ascii=False, indent=2)
        }
        
        result = await self._call_llm("INGREDIENT_CUSTOMIZATION", transcript, session, customer_name, placeholders)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        additions = result.get("ingredient_additions", {})
        
        # LLM이 계산한 변경사항 적용
        if additions:
            self._apply_ingredient_changes(session, additions, default_ingredients)
        
        # 재계산된 현재 재료
        final_current = self._calculate_current_ingredients(session, default_ingredients)
        
        final_response = {
            "response": response,
            "decision": decision,
            "state": "INGREDIENT_CUSTOMIZATION",
            "default_ingredients_by_quantity": default_ingredients,
            "current_ingredients": final_current
        }
        
        if decision == 1:
            final_response["state"] = "SCHEDULING"
        
        return final_response

    def _apply_ingredient_changes(self, session: ConversationSession, additions: Dict[str, Any], default_ingredients: Dict[str, int]):
        """재료 변경 사항을 세션 overrides에 적용"""
        current_overrides = session.order_state.get("customization_overrides", {})
        
        # 유효성 검사: 모든 알려진 재료 코드 허용
        valid_keys = self.all_ingredient_codes
        
        # 매핑 테이블 (자주 발생하는 오인식 코드 보정)
        key_mapping = {
            "steak": "premium_steak",
            "스테이크": "premium_steak",
            "wine_bottle": "wine",
            "champagne": "champagne_bottle"
        }
        
        for k, v in additions.items():
            mapped_key = key_mapping.get(k, k)
            # DB grounded valid keys check
            if valid_keys and mapped_key not in valid_keys:
                # 로그는 남기지만 처리는 스킵
                logger.warning(f"[INGREDIENT_CUSTOMIZATION] Unknown ingredient code: {k} (mapped: {mapped_key})")
                continue
                
            try:
                delta = int(v)
                if delta == 0: continue
                
                prev_override = int(current_overrides.get(mapped_key, 0))
                new_override = prev_override + delta
                
                # 베이스 수량
                base_qty = default_ingredients.get(mapped_key, 0)
                total_qty = base_qty + new_override
                
                # 0 미만으로 내려가지 않도록 보정
                if total_qty < 0:
                    # 베이스가 2인데 3을 빼려고 하면(delta=-3), total=-1.
                    # new_override를 -2로 설정하여 total=0이 되도록 함.
                    new_override = -base_qty
                
                # 오버라이드가 0이면 삭제 (베이스 그대로)
                if new_override == 0:
                    if mapped_key in current_overrides:
                        del current_overrides[mapped_key]
                else:
                    current_overrides[mapped_key] = new_override
                    
            except ValueError:
                continue
        
        session.update_order_state(customization_overrides=current_overrides)

    def _calculate_current_ingredients(self, session: ConversationSession, default_ingredients: Dict[str, int]) -> Dict[str, int]:
        current = dict(default_ingredients)
        overrides = session.order_state.get("customization_overrides", {})
        for k, v in overrides.items():
            try:
                val = int(v)
                if val != 0:
                    # 음수 오버라이드(감소)도 허용
                    current[k] = current.get(k, 0) + val
                    # 최종 결과가 0 미만이면 0으로 고정
                    if current[k] < 0:
                        current[k] = 0
            except ValueError:
                pass
        return current

    async def _handle_scheduling(self, transcript: str, session: ConversationSession, customer_name: str, db: Optional[Session] = None) -> Dict[str, Any]:
        current_scheduled = session.order_state.get("scheduled_for", "")
        placeholders = {
            '{order_summary}': session.get_order_state_summary(),
            '{final_order_summary}': session.get_order_state_summary(),
            '{scheduled_for}': current_scheduled if current_scheduled else "미정"
        }
        
        result = await self._call_llm("SCHEDULING", transcript, session, customer_name, placeholders)
        
        response = result.get("response", "")
        decision = int(result.get("decision", 0))
        scheduled_for = result.get("scheduled_for")
        
        final_response = {
            "response": response,
            "decision": decision,
            "state": "SCHEDULING"
        }
        
        if scheduled_for:
            session.update_order_state(scheduled_for=scheduled_for)
            final_response["scheduled_for"] = scheduled_for
        elif decision == 1 and current_scheduled:
            # LLM이 decision=1인데 scheduled_for를 반환 안 했을 경우 (기존 값 유지)
            final_response["scheduled_for"] = current_scheduled
            scheduled_for = current_scheduled
        
        if decision == 1 and scheduled_for:
            final_response["state"] = "CHECKOUT_READY"
            
        return final_response

    async def _handle_checkout_ready(self, transcript: str, session: ConversationSession, customer_name: str, db: Optional[Session] = None) -> Dict[str, Any]:
        result = await self._call_llm("CHECKOUT_READY", transcript, session, customer_name)
        return {
            "response": result.get("response", "결제 준비가 완료되었습니다."),
            "decision": 1,
            "state": "CHECKOUT_READY"
        }

    # -------------------------------------------------------------------------
    # Main Entry Point
    # -------------------------------------------------------------------------
    async def analyze_voice_input(
        self,
        transcript: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        db: Optional[Session] = None,
        ingredient_additions: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """
        음성 입력 분석 메인 진입점
        """
        import random
        if random.randint(1, 100) == 1:
            self.cleanup_expired_sessions()
        
        session = None
        if session_id:
            session = self.get_or_create_session(session_id)
            if transcript:
                session.add_message("user", transcript)

        # Ensure ingredient codes are loaded from DB (Lazy Load)
        if db:
            self._ensure_ingredient_codes_loaded(db)

        customer_name = None
        if user_id and db:
            try:
                row = db.execute(text("SELECT name FROM users WHERE user_id = :uid"), {"uid": user_id}).fetchone()
                if row: customer_name = row[0]
            except Exception:
                pass

        current_state = session.order_state.get("current_state", "MENU_CONVERSATION") if session else "MENU_CONVERSATION"
        
        try:
            handler_map = {
                "MENU_CONVERSATION": self._handle_menu_conversation,
                "MENU_RECOMMENDATION": self._handle_menu_recommendation,
                "STYLE_RECOMMENDATION": self._handle_style_recommendation,
                "QUANTITY_SELECTION": self._handle_quantity_selection,
                "INGREDIENT_CUSTOMIZATION": self._handle_ingredient_customization,
                "SCHEDULING": self._handle_scheduling,
                "CHECKOUT_READY": self._handle_checkout_ready
            }
            
            handler = handler_map.get(current_state)
            if not handler:
                logger.error(f"Unknown state: {current_state}")
                return {"intent": "error", "response": "알 수 없는 오류가 발생했습니다.", "state": current_state}

            # Pass db to handlers if they need it
            if current_state == "INGREDIENT_CUSTOMIZATION":
                final_response = await handler(transcript, session, customer_name, ingredient_additions, db)
            else:
                final_response = await handler(transcript, session, customer_name, db)
            
            next_state = final_response.get("state", current_state)
            
            if session and next_state != current_state:
                session.order_state["previous_state"] = current_state
                session.update_order_state(current_state=next_state)
                logger.info(f"[STATE_TRANSITION] {current_state} -> {next_state}")
            
            response_msg = final_response.get("response", "")
            if session and response_msg:
                session.add_message("assistant", response_msg)
            
            final_response["intent"] = "order"
            final_response["confidence"] = 1.0
            if session:
                final_response["order_state"] = session.order_state
            
            return final_response

        except Exception as e:
            logger.error(f"Voice Analysis Error: {e}")
            logger.error(traceback.format_exc())
            return {
                "intent": "error",
                "response": "시스템 오류가 발생했습니다.", 
                "state": current_state,
                "error": str(e)
            }

    async def get_user_order_history(self, user_id: str, db: Session) -> dict[str, Any]:
        try:
            query = text("""
                SELECT o.order_id, o.order_number, o.created_at, o.total_price,
                       mi.code AS menu_code, ss.name AS style_name
                FROM orders o
                LEFT JOIN order_items oi ON o.order_id = oi.order_id
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
                LEFT JOIN serving_styles ss ON oi.serving_style_id = ss.serving_style_id
                WHERE o.customer_id = :user_id
                ORDER BY o.created_at DESC LIMIT 5
            """)
            rows = db.execute(query, {"user_id": user_id}).fetchall()
            if not rows: return {"has_history": False}

            orders = []
            menu_counts = {}
            
            for r in rows:
                orders.append({
                    "order_number": r[1],
                    "created_at": r[2].isoformat() if r[2] else None,
                    "total_price": float(r[3]) if r[3] else 0,
                    "menu_code": r[4],
                    "style": r[5]
                })
                if r[4]: menu_counts[r[4]] = menu_counts.get(r[4], 0) + 1
            
            most_freq = max(menu_counts, key=menu_counts.get) if menu_counts else None
            latest = orders[0]

            return {
                "has_history": True,
                "latest_order": {
                    "menu_code": latest["menu_code"],
                    "style": latest["style"],
                    "date": latest["created_at"],
                    "price": latest["total_price"]
                },
                "most_frequent_menu": most_freq,
                "total_orders": len(orders)
            }
        except Exception as e:
            logger.error(f"History fetch failed: {e}")
            return {"has_history": False}


# 전역 인스턴스
voice_analysis_service = None

def get_voice_analysis_service():
    global voice_analysis_service
    if voice_analysis_service is None:
        voice_analysis_service = VoiceAnalysisService()
    return voice_analysis_service
