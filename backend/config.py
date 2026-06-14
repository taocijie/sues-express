import os
import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "sues-express-dev-key-2026")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'express.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-sues-express-2026")
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

    # WeChat Pay config (placeholder for prototype)
    WX_APPID = os.environ.get("WX_APPID", "")
    WX_MCHID = os.environ.get("WX_MCHID", "")
    WX_PAY_KEY = os.environ.get("WX_PAY_KEY", "")
    WX_NOTIFY_URL = os.environ.get("WX_NOTIFY_URL", "")

    # Pricing
    PRICE_SMALL = 2
    PRICE_MEDIUM = 4
    PRICE_LARGE = 6
    PRICE_XLARGE = 10
    PRICE_PER_KG_OVER_5 = 2
    WEIGHT_THRESHOLD = 5  # kg

    # Warning limit
    MAX_WARNINGS = 3

