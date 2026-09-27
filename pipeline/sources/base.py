"""Base adapter interface and utilities for all BHUMI meteorological data sources.

Enforces retries, timeout handling, structured logging, idempotent ingestion,
and clean isolation of failures.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, Optional, TypeVar

import requests
from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger

T = TypeVar("T")


@dataclass
class AdapterResult(Generic[T]):
    """Standardized response container for source adapters."""
    source_name: str
    success: bool
    data: Optional[T] = None
    records_count: int = 0
    error_message: Optional[str] = None
    execution_time_seconds: float = 0.0
    is_preliminary: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseSourceAdapter(ABC):
    """Abstract base class for all meteorological data source adapters."""

    def __init__(self, config: Optional[PipelineConfig] = None) -> None:
        self.config = config or get_pipeline_config()
        self.logger = get_logger(f"bhumi.sources.{self.name.lower()}")

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the data source (e.g. 'CHIRPS', 'ERA5', 'TELECONNECTIONS')."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Check whether required credentials or endpoints are available."""
        pass

    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BHUMI/0.1.0 (MoES/NCMRWF SIH26086)",
        "Accept": "*/*",
    }

    def request_with_retry(
        self,
        method: str,
        url: str,
        max_retries: Optional[int] = None,
        timeout: Optional[int] = None,
        backoff_factor: Optional[float] = None,
        headers: Optional[dict[str, str]] = None,
        **kwargs: Any,
    ) -> requests.Response:
        """Execute an HTTP request with automatic retry and exponential backoff."""
        retries = max_retries if max_retries is not None else self.config.max_retries
        timeout_sec = timeout if timeout is not None else self.config.request_timeout_seconds
        backoff = backoff_factor if backoff_factor is not None else self.config.retry_backoff_factor

        req_headers = dict(self.DEFAULT_HEADERS)
        if headers:
            req_headers.update(headers)

        last_exception: Optional[Exception] = None
        for attempt in range(1, retries + 1):
            try:
                self.logger.debug(f"HTTP {method.upper()} {url} (Attempt {attempt}/{retries})")
                response = requests.request(method, url, timeout=timeout_sec, headers=req_headers, **kwargs)
                response.raise_for_status()
                return response
            except (requests.RequestException, TimeoutError) as e:
                last_exception = e
                if attempt == retries:
                    self.logger.error(f"Failed {method} {url} after {retries} attempts: {e}")
                    raise
                sleep_time = backoff ** attempt
                self.logger.warning(
                    f"Attempt {attempt}/{retries} failed for {self.name} ({e}). Retrying in {sleep_time:.1f}s..."
                )
                time.sleep(sleep_time)

        raise RuntimeError(f"Unexpected exit in retry loop for {self.name}") from last_exception

    def safe_execute(self, action_name: str, func: Callable[[], T]) -> AdapterResult[T]:
        """Execute a data-fetch function safely with timing, logging, and error catching."""
        start_time = time.time()
        self.logger.info(f"Starting {action_name} for source {self.name}")
        try:
            data = func()
            duration = time.time() - start_time
            count = len(data) if hasattr(data, "__len__") else (1 if data is not None else 0)
            self.logger.info(f"Completed {action_name} for {self.name}: {count} records in {duration:.2f}s")
            return AdapterResult(
                source_name=self.name,
                success=True,
                data=data,
                records_count=count,
                execution_time_seconds=duration,
            )
        except Exception as e:
            duration = time.time() - start_time
            self.logger.error(f"Error in {action_name} for {self.name} after {duration:.2f}s: {e}")
            return AdapterResult(
                source_name=self.name,
                success=False,
                error_message=str(e),
                execution_time_seconds=duration,
            )
