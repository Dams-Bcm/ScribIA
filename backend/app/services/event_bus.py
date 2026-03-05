"""Thread-safe event bus for Server-Sent Events (SSE).

The transcription pipeline runs in sync threads while the SSE endpoint is async.
This bus bridges both worlds using loop.call_soon_threadsafe.
"""

import asyncio
import logging
import threading
from collections import defaultdict

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self):
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def subscribe(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        with self._lock:
            self._subscribers[job_id].add(queue)
        logger.debug(f"[SSE] Client subscribed to job {job_id}")
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue):
        with self._lock:
            self._subscribers[job_id].discard(queue)
            if not self._subscribers[job_id]:
                del self._subscribers[job_id]

    def publish(self, job_id: str, data: dict):
        """Publish an event to all subscribers of a job. Thread-safe."""
        with self._lock:
            queues = list(self._subscribers.get(job_id, []))
        if not queues:
            return
        for q in queues:
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(self._safe_put, q, data)
            else:
                self._safe_put(q, data)

    @staticmethod
    def _safe_put(q: asyncio.Queue, data: dict):
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(data)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass


event_bus = EventBus()
