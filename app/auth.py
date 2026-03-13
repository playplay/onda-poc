import jwt
from fastapi import Request, HTTPException

from app.config import settings


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("onda_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return {
            "email": payload["email"],
            "name": payload.get("name", ""),
            "role": payload.get("role", "user"),
        }
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_admin(request: Request) -> dict:
    user = get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
