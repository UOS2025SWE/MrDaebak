"""
WebSocket 연결 관리 서비스
실시간 주문 업데이트를 위한 WebSocket 연결 관리
"""

import asyncio
import json
import logging
from typing import Dict, Set
from datetime import datetime
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket 연결 관리 클래스"""

    def __init__(self):
        # 활성 연결: user_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}

        # 직원/관리자 연결 추적
        self.staff_connections: Set[str] = set()

        # 고객 연결 추적: user_id -> WebSocket
        self.customer_connections: Dict[str, WebSocket] = {}

        # 연결 메타데이터: user_id -> {user_type, connected_at}
        self.connection_metadata: Dict[str, dict] = {}

    async def connect(
        self,
        user_id: str,
        user_type: str,
        websocket: WebSocket
    ) -> None:
        """
        새로운 WebSocket 연결 수락 및 등록

        Args:
            user_id: 사용자 ID (UUID 문자열)
            user_type: 사용자 타입 (CUSTOMER, STAFF, MANAGER)
            websocket: WebSocket 연결 객체
        """
        try:
            await websocket.accept()

            # 기존 연결이 있다면 종료 (중복 연결 방지)
            if user_id in self.active_connections:
                try:
                    await self.active_connections[user_id].close()
                except:
                    pass

            # 새 연결 등록
            self.active_connections[user_id] = websocket
            self.connection_metadata[user_id] = {
                "user_type": user_type,
                "connected_at": datetime.now().isoformat()
            }

            # 직원/고객 그룹 분류
            if user_type in ["STAFF", "MANAGER"]:
                self.staff_connections.add(user_id)
            else:
                self.customer_connections[user_id] = websocket

            logger.info(
                f"WebSocket 연결 성공: user_id={user_id}, "
                f"type={user_type}, "
                f"총 연결 수={len(self.active_connections)}"
            )

            # 연결 성공 메시지 전송
            await self.send_to_user(user_id, {
                "type": "CONNECTED",
                "message": "WebSocket 연결이 성공했습니다",
                "timestamp": datetime.now().isoformat()
            })

        except Exception as e:
            logger.error(f"WebSocket 연결 실패: user_id={user_id}, error={e}")
            raise

    def disconnect(self, user_id: str) -> None:
        """
        WebSocket 연결 해제 및 정리

        Args:
            user_id: 사용자 ID
        """
        try:
            if user_id in self.active_connections:
                del self.active_connections[user_id]

            if user_id in self.staff_connections:
                self.staff_connections.remove(user_id)

            if user_id in self.customer_connections:
                del self.customer_connections[user_id]

            if user_id in self.connection_metadata:
                del self.connection_metadata[user_id]

            logger.info(
                f"WebSocket 연결 해제: user_id={user_id}, "
                f"남은 연결 수={len(self.active_connections)}"
            )

        except Exception as e:
            logger.error(f"WebSocket 연결 해제 오류: user_id={user_id}, error={e}")

    async def send_to_user(self, user_id: str, message: dict) -> bool:
        """
        특정 사용자에게 메시지 전송

        Args:
            user_id: 대상 사용자 ID
            message: 전송할 메시지 (dict)

        Returns:
            전송 성공 여부
        """
        if user_id not in self.active_connections:
            logger.warning(f"연결되지 않은 사용자: user_id={user_id}")
            return False

        try:
            websocket = self.active_connections[user_id]
            await websocket.send_json(message)
            logger.debug(f"메시지 전송 성공: user_id={user_id}, type={message.get('type')}")
            return True

        except Exception as e:
            logger.error(f"메시지 전송 실패: user_id={user_id}, error={e}")
            # 연결 오류 시 자동 해제
            self.disconnect(user_id)
            return False

    async def broadcast_to_staff(self, message: dict) -> int:
        """
        모든 직원/관리자에게 메시지 브로드캐스트

        Args:
            message: 전송할 메시지

        Returns:
            전송 성공한 연결 수
        """
        if not self.staff_connections:
            logger.debug("브로드캐스트할 직원 연결이 없습니다")
            return 0

        success_count = 0
        failed_users = []

        for user_id in list(self.staff_connections):
            try:
                websocket = self.active_connections.get(user_id)
                if websocket:
                    await websocket.send_json(message)
                    success_count += 1

            except Exception as e:
                logger.error(f"직원 브로드캐스트 실패: user_id={user_id}, error={e}")
                failed_users.append(user_id)

        # 실패한 연결 정리
        for user_id in failed_users:
            self.disconnect(user_id)

        logger.info(
            f"직원 브로드캐스트 완료: 성공={success_count}, "
            f"실패={len(failed_users)}, type={message.get('type')}"
        )

        return success_count

    async def broadcast_to_all(self, message: dict) -> int:
        """
        모든 연결된 클라이언트에게 메시지 브로드캐스트

        Args:
            message: 전송할 메시지

        Returns:
            전송 성공한 연결 수
        """
        if not self.active_connections:
            logger.debug("브로드캐스트할 연결이 없습니다")
            return 0

        success_count = 0
        failed_users = []

        for user_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_json(message)
                success_count += 1

            except Exception as e:
                logger.error(f"전체 브로드캐스트 실패: user_id={user_id}, error={e}")
                failed_users.append(user_id)

        # 실패한 연결 정리
        for user_id in failed_users:
            self.disconnect(user_id)

        logger.info(
            f"전체 브로드캐스트 완료: 성공={success_count}, "
            f"실패={len(failed_users)}, type={message.get('type')}"
        )

        return success_count

    async def send_heartbeat(self, user_id: str) -> bool:
        """
        특정 연결에 Heartbeat 전송 (연결 유지)

        Args:
            user_id: 대상 사용자 ID

        Returns:
            전송 성공 여부
        """
        return await self.send_to_user(user_id, {
            "type": "HEARTBEAT",
            "timestamp": datetime.now().isoformat()
        })

    def get_connection_count(self) -> dict:
        """
        현재 연결 통계 반환

        Returns:
            연결 통계 정보
        """
        return {
            "total": len(self.active_connections),
            "staff": len(self.staff_connections),
            "customers": len(self.customer_connections),
            "connections": [
                {
                    "user_id": user_id,
                    **metadata
                }
                for user_id, metadata in self.connection_metadata.items()
            ]
        }


# 싱글톤 인스턴스
manager = ConnectionManager()
