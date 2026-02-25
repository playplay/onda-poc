from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.auth import get_current_user

router = APIRouter(prefix="/auth")


class LoginRequest(BaseModel):
    email: str
    password: str
    remember: bool = False


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    if body.email != settings.AUTH_EMAIL or body.password != settings.AUTH_PASSWORD:
        return JSONResponse(status_code=401, content={"detail": "Invalid credentials"})

    exp_days = 30 if body.remember else 1
    payload = {
        "email": body.email,
        "exp": datetime.now(timezone.utc) + timedelta(days=exp_days),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    # Only set Secure flag on actual HTTPS deployments (Vercel)
    # POSTGRES_URL alone doesn't mean HTTPS — check for Vercel env
    secure = settings.is_serverless and bool(settings.VERCEL_OIDC_TOKEN)
    response = JSONResponse(content={"email": body.email})
    response.set_cookie(
        key="onda_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=exp_days * 24 * 3600 if body.remember else None,
        path="/",
    )
    return response


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key="onda_token", path="/")
    return response
