"""
로그인 서비스 - JWT 토큰 기반 인증 시스템
사용자 인증, 토큰 생성, 권한 검증 기능 제공
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Any
from typing_extensions import Annotated

from dotenv import load_dotenv
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.orm import Session

from .database import get_db

# 환경 변수 로드
load_dotenv()

# JWT 설정
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dinner_service_super_secret_jwt_key_2024_very_long_and_secure")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRATION_HOURS", "24")) * 60  # 시간을 분으로 변환

# 비밀번호 해싱 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 로깅 설정
logger = logging.getLogger(__name__)

# HTTP Bearer 스키마 설정
security = HTTPBearer()

class LoginService:
    """로그인 관련 비즈니스 로직 처리"""

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        """비밀번호 해싱"""
        return pwd_context.hash(password)

    @staticmethod
    def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
        """JWT 액세스 토큰 생성"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def verify_token(token: str) -> dict[str, Any] | None:
        """JWT 토큰 검증"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                return None
            return payload
        except JWTError:
            return None

def authenticate_user(db: Session, email: str, password: str) -> dict[str, Any]:
    """사용자 인증 처리"""
    try:
        # STAFF인 경우 staff_details의 position 정보도 함께 조회
        user_query = text("""
            SELECT u.user_id, u.email, u.password_hash, u.user_type, u.name, sd.position
            FROM users u
            LEFT JOIN staff_details sd ON u.user_id = sd.staff_id
            WHERE u.email = :email
        """)

        result = db.execute(user_query, {"email": email}).fetchone()

        if not result:
            return {
                "success": False,
                "error": "사용자를 찾을 수 없습니다",
                "user": None
            }

        # user_type 가져오기
        user_type = result[3]  # 'CUSTOMER', 'STAFF', 'MANAGER'
        position = result[5]  # 'COOK', 'RIDER', 'STAFF' (STAFF 타입인 경우만)

        # user_type을 role로 변환 (하위 호환성)
        if user_type == 'MANAGER':
            role = "admin"
        elif user_type == 'STAFF':
            role = "staff"
        else:
            role = "customer"

        # 이름 결정: 실제 name 컬럼 사용, 없으면 이메일 앞부분 사용
        display_name = result[4] if result[4] else result[1].split('@')[0]

        user_data = {
            "id": str(result[0]),  # UUID를 문자열로 변환
            "email": result[1],
            "user_type": user_type,  # CUSTOMER, STAFF, MANAGER
            "role": role,  # 하위 호환성
            "is_admin": (user_type == 'MANAGER'),  # ENUM을 boolean으로 변환 (하위 호환성)
            "name": display_name,
            "position": position if user_type == 'STAFF' else None  # STAFF인 경우만 position 정보
        }

        if not LoginService.verify_password(password, result[2]):
            return {
                "success": False,
                "error": "비밀번호가 일치하지 않습니다",
                "user": None
            }

        return {
            "success": True,
            "user": user_data,
            "message": "인증 성공"
        }

    except Exception as e:
        logger.error(f"사용자 인증 중 오류: {e}")
        return {
            "success": False,
            "error": f"인증 중 오류가 발생했습니다: {str(e)}",
            "user": None
        }


def create_login_response(user_data: dict[str, Any]) -> dict[str, Any]:
    """로그인 성공 응답 생성"""

    # JWT 토큰 생성
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = LoginService.create_access_token(
        data={
            "sub": user_data["email"],
            "user_id": user_data["id"],
            "user_type": user_data.get("user_type", "CUSTOMER"),  # user_type 추가
            "is_admin": user_data.get("is_admin", False),
            "role": user_data.get("role", "customer")  # role 정보 추가
        },
        expires_delta=access_token_expires
    )

    # 관리자 권한 확인
    show_admin_button = user_data.get("is_admin", False)

    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 초 단위
        "user": {
            "id": user_data["id"],
            "email": user_data["email"],
            "user_type": user_data.get("user_type", "CUSTOMER"),  # user_type 추가
            "is_admin": user_data.get("is_admin", False),
            "role": user_data.get("role", "customer"),  # 하위 호환성을 위해 유지
            "name": user_data["name"],
            "position": user_data.get("position")  # STAFF인 경우 position 정보 (COOK, RIDER)
        },
        "show_admin_button": show_admin_button,
        "message": "로그인 성공"
    }

def register_customer(db: Session, email: str, password: str, name: str, phone: str, address: str) -> dict[str, Any]:
    """신규 고객 회원가입 처리"""
    try:
        # 이메일 중복 확인
        existing_user_query = text("""
            SELECT user_id FROM users WHERE email = :email
        """)

        existing_user = db.execute(existing_user_query, {"email": email}).fetchone()

        if existing_user:
            return {
                "success": False,
                "error": "이미 등록된 이메일입니다.",
                "user": None
            }

        # 비밀번호 해싱
        hashed_password = LoginService.get_password_hash(password)

        # 새 사용자 생성
        insert_user_query = text("""
            INSERT INTO users (email, password_hash, name, phone_number, address, user_type, privacy_consent)
            VALUES (:email, :password_hash, :name, :phone_number, :address, :user_type, :privacy_consent)
            RETURNING user_id, email, name, user_type
        """)

        result = db.execute(insert_user_query, {
            "email": email,
            "password_hash": hashed_password,
            "name": name,
            "phone_number": phone,
            "address": address,
            "user_type": 'CUSTOMER',  # 고객은 기본적으로 CUSTOMER 타입
            "privacy_consent": True  # 회원가입 시 개인정보 동의로 간주
        }).fetchone()

        db.commit()

        # 사용자 데이터 구성
        user_data = {
            "id": str(result[0]),  # UUID를 문자열로 변환
            "email": result[1],
            "name": result[2],
            "user_type": result[3],  # CUSTOMER
            "role": "customer",
            "is_admin": False  # CUSTOMER는 항상 False
        }

        return {
            "success": True,
            "user": user_data,
            "message": "회원가입이 완료되었습니다."
        }

    except Exception as e:
        db.rollback()
        logger.error(f"회원가입 중 오류: {e}")
        return {
            "success": False,
            "error": f"회원가입 중 오류가 발생했습니다: {str(e)}",
            "user": None
        }


def register_staff_user(
    db: Session,
    email: str,
    password: str,
    name: str,
    phone_number: str,
    address: str,
    job_type: str,  # "COOK" 또는 "RIDER"
    store_id: str = None
) -> dict[str, Any]:
    """직원 회원가입 처리 (users + staff_details 테이블)

    job_type에 따라 position, permissions, salary 자동 설정:
    - COOK: 요리사 (조리 권한, 급여 3,500,000원)
    - RIDER: 배달원 (배달 권한, 급여 2,800,000원)
    """
    try:
        # job_type에 따라 position, permissions, salary 설정
        if job_type == "COOK":
            position = "COOK"
            permissions = {"cook": True, "cooking_start": True, "cooking_complete": True}
            salary = 3500000  # 요리사 급여: 350만원
        elif job_type == "RIDER":
            position = "RIDER"
            permissions = {"delivery": True, "delivery_start": True, "delivery_complete": True}
            salary = 2800000  # 배달원 급여: 280만원
        else:
            return {
                "success": False,
                "error": f"잘못된 직종입니다: {job_type}",
                "user": None
            }

        # 이메일 중복 체크
        existing_user_query = text("""
            SELECT user_id FROM users WHERE email = :email
        """)

        existing_user = db.execute(existing_user_query, {"email": email}).fetchone()

        if existing_user:
            return {
                "success": False,
                "error": "이미 존재하는 이메일입니다",
                "user": None
            }

        # 비밀번호 해싱
        password_hash = LoginService.get_password_hash(password)

        # users 테이블 저장
        insert_user_query = text("""
            INSERT INTO users (email, password_hash, user_type, name, phone_number, address, privacy_consent)
            VALUES (:email, :password_hash, 'STAFF', :name, :phone_number, :address, :privacy_consent)
            RETURNING user_id, email, user_type, name
        """)

        user_result = db.execute(insert_user_query, {
            "email": email,
            "password_hash": password_hash,
            "name": name,
            "phone_number": phone_number,
            "address": address,
            "privacy_consent": True  # 직원 회원가입 시 개인정보 동의로 간주
        }).fetchone()

        user_id = user_result[0]

        # staff_details 테이블 저장
        insert_staff_details_query = text("""
            INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
            VALUES (
                :staff_id,
                :store_id,
                :position,
                :salary,
                :permissions
            )
        """)

        # JSON 변환 (PostgreSQL JSON 타입에 맞게)
        import json
        permissions_json = json.dumps(permissions)

        db.execute(insert_staff_details_query, {
            "staff_id": user_id,
            "store_id": store_id if store_id else None,
            "position": position,
            "salary": salary,
            "permissions": permissions_json
        })

        db.commit()

        # 사용자 데이터 구성
        user_data = {
            "id": str(user_result[0]),  # UUID를 문자열로 변환
            "email": user_result[1],
            "user_type": user_result[2],
            "name": user_result[3],
            "role": "staff",  # 직원 역할
            "is_admin": False,  # STAFF는 관리자 아님
            "store_id": store_id,
            "position": position
        }

        return {
            "success": True,
            "user": user_data,
            "message": "직원 회원가입이 완료되었습니다"
        }

    except Exception as e:
        db.rollback()
        logger.error(f"직원 회원가입 중 오류: {e}")
        return {
            "success": False,
            "error": f"회원가입 중 오류가 발생했습니다: {str(e)}",
            "user": None
        }


def verify_admin_access(is_admin: bool) -> bool:
    """관리자 권한 검증"""
    return is_admin


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """현재 사용자 정보 조회 (JWT 토큰 기반)"""

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증 정보를 확인할 수 없습니다",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # JWT 토큰 검증
        payload = LoginService.verify_token(credentials.credentials)
        if payload is None:
            raise credentials_exception

        username: str = payload.get("sub")
        if username is None:
            logger.error("JWT payload에서 'sub' 필드를 찾을 수 없습니다")
            raise credentials_exception

        logger.info(f"JWT에서 추출한 이메일: {username}")

        # 데이터베이스에서 사용자 정보 조회
        user_query = text("""
            SELECT u.user_id,
                   u.email,
                   u.user_type,
                   u.name,
                   sd.position
            FROM users u
            LEFT JOIN staff_details sd ON u.user_id = sd.staff_id
            WHERE u.email = :email
        """)

        result = db.execute(user_query, {"email": username}).fetchone()
        logger.info(f"데이터베이스 조회 결과: {result}")

        if result is None:
            logger.error(f"데이터베이스에서 이메일 '{username}' 사용자를 찾을 수 없습니다")
            raise credentials_exception

        # 사용자 정보 반환
        user_type = result[2]
        position = result[4] if len(result) > 4 else None

        if user_type == 'MANAGER':
            role = "admin"
        elif user_type == 'STAFF':
            role = "staff"
        else:
            role = "customer"

        user_data = {
            "id": str(result[0]),  # UUID를 문자열로 변환
            "email": result[1],
            "is_admin": (user_type == 'MANAGER'),  # user_type을 boolean으로 변환 (하위 호환성)
            "role": role,
            "user_type": user_type,
            "position": position if user_type == 'STAFF' else None,
            "name": result[3] if result[3] else result[1].split('@')[0]
        }

        return user_data

    except JWTError:
        raise credentials_exception
    except Exception as e:
        logger.error(f"사용자 정보 조회 중 오류: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 정보 조회 중 오류가 발생했습니다"
        )