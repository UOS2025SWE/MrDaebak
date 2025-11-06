"""
WebSocket 라우터
실시간 주문 업데이트를 위한 WebSocket 엔드포인트
"""

import asyncio
import logging
from typing import Annotated
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from fastapi.responses import JSONResponse

from ..services.websocket_manager import manager
from ..services.login_service import LoginService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Annotated[str, Query(description="JWT 토큰")]
):
    """
    WebSocket 연결 엔드포인트

    연결 방법:
    ws://localhost:8000/api/ws?token=YOUR_JWT_TOKEN

    메시지 타입:
    - CONNECTED: 연결 성공
    - ORDER_CREATED: 새 주문 생성
    - ORDER_STATUS_CHANGED: 주문 상태 변경
    - ORDER_UPDATED: 주문 정보 수정
    - HEARTBEAT: 연결 유지 ping
    - ERROR: 오류 메시지
    """
    user_id = None

    try:
        # 1. JWT 토큰 검증
        logger.info(f"WebSocket 연결 시도 - 토큰 검증 중")

        payload = LoginService.verify_token(token)

        if payload is None:
            logger.warning("WebSocket 연결 거부: 유효하지 않은 토큰")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return

        user_id = payload.get("user_id")
        user_type = payload.get("user_type", "CUSTOMER")

        if not user_id:
            logger.warning("WebSocket 연결 거부: user_id 없음")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing user_id")
            return

        logger.info(f"WebSocket 토큰 검증 성공: user_id={user_id}, user_type={user_type}")

        # 2. 연결 등록 (manager.connect()에서 accept() 처리)
        await manager.connect(user_id, user_type, websocket)

        logger.info(f"WebSocket 연결 등록 완료: user_id={user_id}")

        # 3. Heartbeat 태스크 시작
        async def send_heartbeat():
            """30초마다 heartbeat 전송"""
            try:
                while True:
                    await asyncio.sleep(30)
                    await manager.send_heartbeat(user_id)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Heartbeat 오류: {e}")

        heartbeat_task = asyncio.create_task(send_heartbeat())

        try:
            # 4. 메시지 수신 루프
            while True:
                try:
                    # 클라이언트로부터 메시지 수신 (주로 ping/pong)
                    data = await websocket.receive_text()

                    # Echo back (간단한 응답)
                    if data == "ping":
                        await websocket.send_json({
                            "type": "PONG",
                            "timestamp": datetime.now().isoformat()
                        })

                except WebSocketDisconnect:
                    logger.info(f"WebSocket 정상 종료: user_id={user_id}")
                    break

                except Exception as e:
                    # 개별 메시지 처리 오류는 로그만 남기고 연결 유지
                    logger.warning(f"WebSocket 메시지 처리 오류 (연결 유지): user_id={user_id}, error={e}")
                    try:
                        await websocket.send_json({
                            "type": "ERROR",
                            "message": "메시지 처리 오류",
                            "timestamp": datetime.now().isoformat()
                        })
                    except:
                        # 에러 메시지 전송 실패 시 연결 종료
                        logger.error(f"WebSocket 연결 끊김: user_id={user_id}")
                        break

        except Exception as e:
            logger.error(f"WebSocket 치명적 오류: user_id={user_id}, error={e}")

        finally:
            # Heartbeat 태스크 취소
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        logger.error(f"WebSocket 연결 오류: error={e}")

    finally:
        # 5. 연결 정리
        if user_id:
            manager.disconnect(user_id)


@router.get("/ws/stats")
async def get_websocket_stats() -> dict:
    """
    WebSocket 연결 통계 조회 (디버깅용)

    Returns:
        연결 통계 정보
    """
    try:
        stats = manager.get_connection_count()
        return {
            "success": True,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"WebSocket 통계 조회 실패: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": "통계 조회 중 오류가 발생했습니다"
            }
        )
