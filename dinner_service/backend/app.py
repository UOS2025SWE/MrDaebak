"""
미스터 대박 디너 서비스 - FastAPI 애플리케이션
음성 주문과 AI 추천이 가능한 디너 서비스
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
import os
import httpx

# 라우터 임포트
from .routers import (
    auth,
    menu,
    order,
    discount,
    admin,
    voice,
    staff,
    ingredients,
    checkout,
    websocket,
    side_dishes,
    cake,
    events,
    inquiries,
)

# 데이터베이스 서비스 임포트
from .services.database import init_database

@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 생명주기 관리 - 시작 및 종료 이벤트"""
    print("미스터 대박 디너 서비스 시작...")

    try:
        init_database()  # 연결 확인 + 초기화 통합
        print("데이터베이스 초기화 완료")

    except Exception as e:
        print(f"데이터베이스 초기화 실패: {e}")

    yield

    print("미스터 대박 디너 서비스 종료...")

# FastAPI 앱 생성
app = FastAPI(
    title="미스터 대박 디너 서비스",
    description="음성 주문과 AI 추천이 가능한 디너 서비스 API",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc",  # ReDoc
    lifespan=lifespan
)

# CORS 설정 (프론트엔드 연결용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 라우터를 가장 먼저 등록 (우선순위 확보)
app.include_router(websocket.router, prefix="/api")  # WebSocket 엔드포인트

# 나머지 라우터 등록
app.include_router(auth.router, prefix="/api/auth")
app.include_router(menu.router, prefix="/api/menu")
app.include_router(order.router, prefix="/api/orders")
app.include_router(discount.router, prefix="/api/discount")
app.include_router(admin.router, prefix="/api/admin")
app.include_router(voice.router, prefix="/api/voice")
app.include_router(staff.router, prefix="/api/staff")
app.include_router(ingredients.router, prefix="/api/ingredients")
app.include_router(side_dishes.router, prefix="/api/side-dishes")
app.include_router(cake.router, prefix="/api/cake")
app.include_router(checkout.router, prefix="/api/checkout")
app.include_router(events.router, prefix="/api")
app.include_router(inquiries.router, prefix="/api")

# 간단 헬스체크 엔드포인트 (무인증)
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# React 프록시 함수
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


async def proxy_to_react(path: str = ""):
    """React 서버로 프록시"""
    try:
        async with httpx.AsyncClient() as client:
            base = FRONTEND_URL.rstrip('/')
            url = f"{base}/{path}".rstrip('/')
            response = await client.get(url, timeout=5.0)

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    "content-type": response.headers.get("content-type", "text/html"),
                    "cache-control": "no-cache"
                }
            )
    except Exception as e:
        return HTMLResponse(content=f"""
        <html>
        <head><title>미스터 대박 디너 서비스</title></head>
        <body>
            <h1>🍽️ 미스터 대박 디너 서비스</h1>
            <p style="color: red;">React 서버 연결 실패: {str(e)}</p>
            <p>React 서버를 실행해주세요: <code>npm run dev</code></p>
        </body>
        </html>
        """, status_code=503)

# 루트 엔드포인트 - React 앱 프록시
@app.get("/")
async def serve_react_app():
    """React 앱 메인 페이지를 8000포트에서 서빙"""
    return await proxy_to_react("")

# React의 모든 페이지를 프록시 (단, API/WebSocket은 제외)
# 주의: 이 라우터는 가장 마지막에 등록되어야 함
@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
async def serve_react_pages(request: Request, full_path: str):
    """React 앱의 모든 페이지를 8000포트에서 서빙 (API는 제외)"""
    # WebSocket 업그레이드 요청은 여기서 처리하지 않음
    if request.headers.get("upgrade", "").lower() == "websocket":
        raise HTTPException(status_code=404, detail="WebSocket endpoint not found")

    # API 경로는 FastAPI 라우터가 처리하도록 404 반환
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")

    # 나머지 경로는 React로 프록시
    return await proxy_to_react(full_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)