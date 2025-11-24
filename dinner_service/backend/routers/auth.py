"""
인증 API 라우터
JWT 토큰 기반 인증 시스템
URL 일관성을 위해 login.py에서 auth.py로 변경
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.login_service import (
    authenticate_user,
    create_login_response,
    LoginService,
    verify_admin_access,
    register_customer,
    register_staff_user
)

# 로그인 요청 모델
class LoginRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=6)]

# 회원가입 요청 모델
class RegisterRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=6)]
    name: Annotated[str, Field(min_length=1)]
    phone: Annotated[str, Field(min_length=1)]
    address: Annotated[str, Field(min_length=1)]

# 직원 회원가입 요청 모델
class StaffRegisterRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=6)]
    name: Annotated[str, Field(min_length=1)]
    phone_number: Annotated[str, Field(min_length=1)]
    address: Annotated[str, Field(min_length=1)]
    store_id: str | None = None  # UUID 문자열

# 비밀번호 변경 요청 모델
class ChangePasswordRequest(BaseModel):
    current_password: Annotated[str, Field(min_length=1)]
    new_password: Annotated[str, Field(min_length=6)]

# 로그인 응답 모델
class LoginResponse(BaseModel):
    success: bool
    access_token: str | None = None
    token_type: str | None = None
    expires_in: int | None = None
    user: dict[str, Any] | None = None
    show_admin_button: bool | None = None
    message: str
    error: str | None = None

# JWT 토큰 검증용
security = HTTPBearer()

router = APIRouter(tags=["authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(
    login_request: LoginRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """사용자 로그인 - JWT 토큰 발급"""
    try:
        logger = logging.getLogger(__name__)
        logger.info(f"로그인 요청 수신: email={login_request.email}")
        
        # 사용자 인증
        auth_result = authenticate_user(db, login_request.email, login_request.password)
        
        if not auth_result["success"]:
            logger.warning(f"로그인 실패: {auth_result.get('error', 'Unknown error')} - email={login_request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=auth_result["error"],
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # 로그인 성공 응답 생성
        response = create_login_response(auth_result["user"])
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"로그인 처리 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/customer/register")
async def register(
    register_request: RegisterRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """고객 회원가입"""
    try:
        # 회원가입 처리
        registration_result = register_customer(
            db,
            register_request.email,
            register_request.password,
            register_request.name,
            register_request.phone,
            register_request.address
        )

        if not registration_result["success"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=registration_result["error"]
            )

        # 회원가입 성공 응답
        return {
            "success": True,
            "message": registration_result["message"],
            "user": registration_result["user"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"회원가입 처리 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/staff/register")
async def register_staff(
    request: StaffRegisterRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """직원 회원가입"""
    try:
        # 직원 회원가입 처리 (포지션은 매니저가 나중에 할당)
        result = register_staff_user(
            db,
            request.email,
            request.password,
            request.name,
            request.phone_number,
            request.address,
            None,  # job_type 제거
            request.store_id
        )

        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["error"]
            )

        return {
            "success": True,
            "user": result["user"],
            "message": "직원 회원가입이 완료되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"직원 회원가입 처리 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/verify-token")
async def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """JWT 토큰 검증"""
    try:
        token = credentials.credentials
        payload = LoginService.verify_token(token)
        
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return {
            "success": True,
            "valid": True,
            "user": {
                "email": payload.get("sub"),
                "role": payload.get("role")
            },
            "message": "토큰이 유효합니다"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"토큰 검증 중 오류: {str(e)}"
        )


@router.get("/me")
async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """현재 로그인한 사용자 정보 조회"""
    try:
        token = credentials.credentials
        payload = LoginService.verify_token(token)
        
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_email = payload.get("sub")
        user_id = payload.get("user_id")
        user_type = payload.get("user_type", "CUSTOMER")
        user_role = payload.get("role")
        is_admin = payload.get("is_admin", False)  # JWT 토큰에서 is_admin 가져오기

        return {
            "success": True,
            "user": {
                "id": user_id,
                "email": user_email,
                "user_type": user_type,  # user_type 추가
                "role": user_role,
                "is_admin": is_admin,
                "show_admin_button": verify_admin_access(is_admin)  # boolean 전달
            },
            "message": "사용자 정보 조회 성공"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"사용자 정보 조회 중 오류: {str(e)}"
        )






@router.get("/profile/{user_id}")
async def get_user_profile(
    user_id: str,
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """현재 사용자의 상세 프로필 정보 조회 (UUID 기반)"""
    try:
        logger = logging.getLogger(__name__)
        logger.info(f"프로필 조회 요청: user_id={user_id}")

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            logger.error("JWT 토큰 검증 실패")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 사용자 정보 조회 (password_hash 제외, UUID 기반, total_orders 포함)
        query = text("""
            SELECT
                u.user_id, u.email, u.name, u.phone_number, u.address,
                u.user_type, u.privacy_consent,
                u.created_at,
                COALESCE(cl.order_count, 0) as total_orders
            FROM users u
            LEFT JOIN customer_loyalty cl ON u.user_id = cl.customer_id
            WHERE u.user_id = CAST(:user_id AS uuid)
        """)
        
        result = db.execute(query, {"user_id": user_id})
        user_data = result.fetchone()

        if not user_data:
            logger.error(f"사용자 ID {user_id}를 찾을 수 없습니다")
            return {
                "success": False,
                "error": "사용자 정보를 찾을 수 없습니다"
            }

        logger.info(f"프로필 조회 성공: {user_data.email}")

        # 결과를 딕셔너리로 변환 (UUID, user_type 기반)
        profile = {
            "id": str(user_data.user_id),  # UUID를 문자열로 변환
            "email": user_data.email,
            "name": user_data.name,
            "phone": user_data.phone_number,
            "address": user_data.address,
            "user_type": user_data.user_type,  # ENUM: CUSTOMER, STAFF, MANAGER
            "is_admin": (user_data.user_type == 'MANAGER'),  # 하위 호환성
            "privacy_consent": user_data.privacy_consent,
            "total_orders": user_data.total_orders,  # customer_loyalty에서 가져온 총 주문 수
            "created_at": user_data.created_at.isoformat() if user_data.created_at else None
        }
        
        return {
            "success": True,
            "profile": profile
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"프로필 조회 실패: {e}")
        return {
            "success": False,
            "error": f"프로필 조회 중 오류가 발생했습니다: {str(e)}"
        }


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """로그인된 사용자의 비밀번호 변경"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="토큰에서 사용자 정보를 찾을 수 없습니다"
            )

        # 사용자 조회 (password_hash 포함)
        query = text("""
            SELECT user_id, email, password_hash
            FROM users
            WHERE user_id = CAST(:user_id AS uuid)
        """)

        result = db.execute(query, {"user_id": user_id}).fetchone()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="사용자를 찾을 수 없습니다"
            )

        # 현재 비밀번호 검증
        if not LoginService.verify_password(request.current_password, result.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="현재 비밀번호가 일치하지 않습니다"
            )

        # 새 비밀번호 해싱
        new_password_hash = LoginService.get_password_hash(request.new_password)

        # 비밀번호 업데이트
        update_query = text("""
            UPDATE users
            SET password_hash = :password_hash
            WHERE user_id = CAST(:user_id AS uuid)
        """)

        db.execute(update_query, {
            "password_hash": new_password_hash,
            "user_id": user_id
        })
        db.commit()

        logger.info(f"비밀번호 변경 성공: user_id={user_id}")

        return {
            "success": True,
            "message": "비밀번호가 성공적으로 변경되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"비밀번호 변경 중 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"비밀번호 변경 중 오류가 발생했습니다: {str(e)}"
        )


