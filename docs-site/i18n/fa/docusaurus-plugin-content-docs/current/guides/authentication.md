# احراز هویت

احراز هویت SPA با **Sanctum** و کوکی **HttpOnly** (`webino_auth_token`) انجام می‌شود. از مرورگر `credentials: 'include'` بفرستید و توکن را در `localStorage` نگه ندارید.

## ورود

```http
POST /api/v1/auth/login
```

پاسخ موفق کوکی HttpOnly می‌گذارد. در صورت فعال بودن 2FA فیلدهای `otp` / `recovery_code` لازم است.

## تازه‌سازی و خروج

```http
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```
