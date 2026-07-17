"""ASGI middleware and error shaping for the OneDish privacy boundary."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


LOGGER = logging.getLogger("onedish.request")


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                await self._reject(scope, receive, send)
                return

        consumed = 0
        rejected = False

        async def limited_receive() -> Message:
            nonlocal consumed, rejected
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > self.max_bytes:
                    rejected = True
                    return {"type": "http.disconnect"}
            return message

        started = False

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if rejected:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not rejected:
                raise
        if rejected and not started:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse({"detail": "request body too large"}, status_code=413)
        await response(scope, receive, send)


class PrivacyHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid.uuid4().hex
        method = scope.get("method", "")
        path = scope.get("path", "")
        status = 500

        async def secure_send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-request-id", request_id.encode()),
                        (b"x-content-type-options", b"nosniff"),
                        (b"referrer-policy", b"no-referrer"),
                        (b"x-frame-options", b"DENY"),
                        (
                            b"content-security-policy",
                            b"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'",
                        ),
                    ]
                )
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, secure_send)
        finally:
            LOGGER.info(
                "request method=%s path=%s status=%s request_id=%s",
                method,
                path,
                status,
                request_id,
            )


async def sanitized_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    safe_errors: list[dict[str, Any]] = []
    for error in exc.errors():
        safe_errors.append(
            {
                "loc": error.get("loc", ()),
                "msg": error.get("msg", "Invalid value"),
                "type": error.get("type", "validation_error"),
            }
        )
    return JSONResponse({"detail": safe_errors}, status_code=422)
