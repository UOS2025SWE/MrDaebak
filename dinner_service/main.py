import uvicorn
import os
from pathlib import Path
from dotenv import load_dotenv

def main():
    """개발 서버 시작"""
    
    # .env 파일 로드 (환경변수 설정)
    load_dotenv()
    
    # 환경변수에서 설정 로드
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "8000"))
    debug = os.getenv("DEBUG", "true").lower() == "true"
    
    print("미스터 대박 디너 서비스 시작 중...")
    
    # 사용자에게 올바른 접속 주소 안내
    if host == "0.0.0.0":
        print(f"서버 주소: http://localhost:{port}")
        print(f"API 문서: http://localhost:{port}/docs")
        print(f"외부 접속 가능 (네트워크 내): http://[your-ip]:{port}")
    else:
        print(f"서버 주소: http://{host}:{port}")
        print(f"API 문서: http://{host}:{port}/docs")
    
    print(f"디버그 모드: {debug}")
    
    # FastAPI 앱 실행
    uvicorn.run(
        app="backend.app:app",
        host=host,
        port=port,
        reload=debug,  # 개발 모드에서만 자동 재로드
        log_level="info" if debug else "warning"
    )

if __name__ == "__main__":
    main()