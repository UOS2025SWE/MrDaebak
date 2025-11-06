"""
데이터베이스 연결 서비스 - SQLAlchemy 전용 버전
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 환경변수 로드
load_dotenv()

# SQLAlchemy 지원을 위한 DATABASE_URL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:password123@localhost:15432/dinner_service"
)

# SQLAlchemy 엔진 및 세션 설정
engine = create_engine(
    DATABASE_URL,
    echo=False,  # SQL 로그는 필요시에만
    pool_pre_ping=True,
    pool_recycle=3600
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# SQLAlchemy 세션 의존성
def get_db():
    """SQLAlchemy 세션 생성 (FastAPI 의존성)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    """데이터베이스 연결 확인 및 초기화"""
    try:
        # SQLAlchemy 연결 확인
        with engine.connect() as connection:
            result = connection.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print(f"PostgreSQL 버전: {version}")
            print("PostgreSQL 데이터베이스 연결 성공!")

        return True

    except Exception as e:
        print(f"데이터베이스 연결 실패: {e}")
        raise e