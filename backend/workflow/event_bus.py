import asyncio
import logging
from typing import Dict, Any, List, Callable, Awaitable
from backend.workflow.business_events import BusinessEventCreator

logger = logging.getLogger("event_bus")

# Type alias for event listeners/subscribers
EventListener = Callable[[Dict[str, Any]], Awaitable[None]]

class EventBus:
    _listeners: Dict[str, List[EventListener]] = {}

    @classmethod
    def subscribe(cls, event_type: str, listener: EventListener):
        """
        Subscribes a module function/method to a specific business event type.
        """
        if event_type not in cls._listeners:
            cls._listeners[event_type] = []
        cls._listeners[event_type].append(listener)
        logger.info(f"Subscribed listener to event: {event_type}")

    @classmethod
    async def publish(
        cls,
        company_id: str,
        event_type: str,
        source_id: str,
        user_id: str,
        payload: Dict[str, Any],
        description: str = None
    ) -> Dict[str, Any]:
        """
        Publishes a business event, logs it to database, and triggers all registered listeners.
        """
        # 1. Create and store event
        event_doc = await BusinessEventCreator.create_event(
            company_id=company_id,
            event_type=event_type,
            source_id=source_id,
            user_id=user_id,
            payload=payload,
            description=description
        )

        # 2. Fire listeners in a non-blocking task
        listeners = cls._listeners.get(event_type, [])
        generic_listeners = cls._listeners.get("*", [])  # Optional wildcard match
        all_listeners = listeners + generic_listeners

        for listener in all_listeners:
            asyncio.create_task(cls._execute_listener(listener, event_doc))

        # 3. Dynamic automation rule triggering
        # We also trigger automation rule checks here as requested
        from backend.workflow.automation_engine import AutomationEngine
        asyncio.create_task(cls._trigger_automation(event_doc))

        return event_doc

    @classmethod
    async def _execute_listener(cls, listener: EventListener, event_doc: Dict[str, Any]):
        try:
            await listener(event_doc)
        except Exception as e:
            logger.error(f"Error executing listener for event {event_doc.get('event_type')}: {e}", exc_info=True)

    @classmethod
    async def _trigger_automation(cls, event_doc: Dict[str, Any]):
        try:
            from backend.workflow.automation_engine import AutomationEngine
            await AutomationEngine.trigger_by_event(event_doc)
        except Exception as e:
            logger.error(f"Error in automatic workflow event routing: {e}", exc_info=True)
