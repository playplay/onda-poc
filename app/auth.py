import jwt
from fastapi import Request, HTTPException

from app.config import settings


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("onda_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return {"email": payload["email"]}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
