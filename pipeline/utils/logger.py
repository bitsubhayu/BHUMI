"""Structured logger for the BHUMI data ingestion pipeline.

Ensures credentials, auth headers, and secrets are never emitted to logs or standard out.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Optional


class CredentialSanitizingFilter(logging.Filter):
    """Filter that scrubs bearer tokens, passwords, and sensitive strings from log messages."""

    PATTERNS = [
        re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]+", re.IGNORECASE),
        re.compile(r"(password|apikey|key|secret)=([^\s&]+)", re.IGNORECASE),
        re.compile(r"eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*"),  # JWT
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            sanitized = record.msg
            for pattern in self.PATTERNS:
                sanitized = pattern.sub("[REDACTED_CREDENTIAL]", sanitized)
            record.msg = sanitized
        return True


def get_logger(name: str = "bhumi.pipeline", level: int = logging.INFO) -> logging.Logger:
    """Return a configured logger with formatting and security filtering."""
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(CredentialSanitizingFilter())
        logger.addHandler(handler)

    logger.propagate = False
    return logger
