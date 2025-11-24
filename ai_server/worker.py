import os
import json
import asyncio
import redis.asyncio as redis
import base64
import logging
import sys
import argparse

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try importing services. 
# This expects the script to be run as a module (python -m ai_server.worker)
# or with PYTHONPATH set correctly.
try:
    from .services.stt import get_stt_service
    from .services.llm import get_llm_service
    from .services.image import get_image_service
except ImportError:
    try:
        from ai_server.services.stt import get_stt_service
        from ai_server.services.llm import get_llm_service
        from ai_server.services.image import get_image_service
    except ImportError:
        # If we are running inside ai_server directory
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from services.stt import get_stt_service
        from services.llm import get_llm_service
        from services.image import get_image_service

# Global flags for enabled services
ENABLED_SERVICES = {
    "stt": False,
    "llm": False,
    "image": False
}

async def process_task(task: dict):
    task_type = task.get("type")
    payload = task.get("payload")
    
    logger.info(f"Processing task: {task_type}")
    
    try:
        data = {}
        
        if task_type == "transcribe":
            if not ENABLED_SERVICES["stt"]:
                 raise ValueError("STT service is disabled on this worker.")
                 
            service = get_stt_service()
            # decode base64 audio
            audio_bytes = base64.b64decode(payload["audio_data"])
            # filename is optional in service, but good to pass if available?
            # Service signature: transcribe(audio_data: bytes, language="korean") -> dict
            result = service.transcribe(audio_bytes)
            data = {"text": result.get("text", "")}
            
        elif task_type == "chat_completion":
            if not ENABLED_SERVICES["llm"]:
                 raise ValueError("LLM service is disabled on this worker.")

            service = get_llm_service()
            # chat_completion(messages, max_tokens) -> str
            response_text = await service.chat_completion(
                messages=payload["messages"],
                max_tokens=payload.get("max_tokens", 512)
            )
            data = {"content": response_text}
            
        elif task_type == "generate_image":
            if not ENABLED_SERVICES["image"]:
                 raise ValueError("Image Generation service is disabled on this worker.")

            service = get_image_service()
            # generate(prompt, width, height) -> bytes (async, translates Korean to English)
            image_bytes = await service.generate(
                prompt=payload["prompt"],
                width=payload.get("width", 1024),
                height=payload.get("height", 1024)
            )
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            data = {"image_data": image_b64}
            
        else:
            raise ValueError(f"Unknown task type: {task_type}")
            
        return {"status": "success", "data": data}
        
    except Exception as e:
        logger.error(f"Task failed: {e}")
        return {"status": "error", "error": str(e)}

async def run_worker():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="AI Server Worker")
    parser.add_argument("--stt", action="store_true", help="Enable STT service")
    parser.add_argument("--llm", action="store_true", help="Enable LLM service")
    parser.add_argument("--image", action="store_true", help="Enable Image Generation service")
    parser.add_argument("--all", action="store_true", help="Enable all services")
    
    args = parser.parse_args()
    
    # Update global flags based on args or env vars
    # Env vars take precedence if args are not provided, or we can mix.
    # Let's say: if --all is present, enable all.
    # If specific flags are present, enable those.
    # If NO flags are present, check env vars or default to ALL (or NONE? User asked to selectively enable).
    # Let's default to ALL if nothing is specified for backward compatibility, OR force user to specify.
    # User said "change so we can turn on/off".
    
    if args.all:
        ENABLED_SERVICES["stt"] = True
        ENABLED_SERVICES["llm"] = True
        ENABLED_SERVICES["image"] = True
    else:
        # If no specific flags, check if at least one is set.
        # If none set, maybe check env vars?
        # Let's map Env Vars ENABLE_STT, ENABLE_LLM, ENABLE_IMAGE
        if args.stt or os.getenv("ENABLE_STT", "false").lower() == "true":
            ENABLED_SERVICES["stt"] = True
        if args.llm or os.getenv("ENABLE_LLM", "false").lower() == "true":
            ENABLED_SERVICES["llm"] = True
        if args.image or os.getenv("ENABLE_IMAGE", "false").lower() == "true":
            ENABLED_SERVICES["image"] = True
            
        # If still nothing is enabled, and no args were passed, maybe default to ALL?
        # But for safety and explicit testing, let's warn if nothing is enabled.
        if not any(ENABLED_SERVICES.values()):
            # Check if user explicitly passed flags. If not, default to ALL for convenience?
            # The user wants to "enable one by one".
            # If I run `python worker.py` without args, it's ambiguous.
            # Let's default to ALL if no args provided to preserve original behavior,
            # UNLESS environment indicates otherwise.
            # Actually, `args.stt` is False by default.
            # Let's change logic: Default to True unless explicitly disabled?
            # No, "opt-in" is better for "checking one by one".
            
            # But for existing docker setup, we might want everything running.
            # Let's check if we are in a "default" mode.
            if len(sys.argv) == 1 and not any(k.startswith("ENABLE_") for k in os.environ):
                 logger.info("No specific services enabled via args or env. Defaulting to ALL services.")
                 ENABLED_SERVICES["stt"] = True
                 ENABLED_SERVICES["llm"] = True
                 ENABLED_SERVICES["image"] = True

    logger.info(f"Enabled Services: {json.dumps(ENABLED_SERVICES)}")

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    logger.info(f"Connecting to Redis at {redis_url}")
    r = redis.from_url(redis_url)
    task_queue = "ai_task_queue"
    
    # Initialize models (each service independently to avoid one failure blocking others)
    logger.info("Initializing AI models...")
    
    if ENABLED_SERVICES["stt"]:
        try:
            logger.info("Loading STT model...")
            get_stt_service()
            logger.info("STT model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize STT model: {e}")
            ENABLED_SERVICES["stt"] = False  # Disable failed service
    
    if ENABLED_SERVICES["image"]:
        try:
            logger.info("Loading Image model...")
            get_image_service()
            logger.info("Image model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Image model: {e}")
            ENABLED_SERVICES["image"] = False  # Disable failed service
    
    if ENABLED_SERVICES["llm"]:
        try:
            logger.info("Loading LLM model...")
            get_llm_service()
            logger.info("LLM model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize LLM model: {e}")
            ENABLED_SERVICES["llm"] = False  # Disable failed service
    
    logger.info("AI models initialization complete.")
    logger.info(f"Final Enabled Services: {json.dumps(ENABLED_SERVICES)}")
    
    logger.info(f"Worker listening on {task_queue}...")
    
    while True:
        try:
            # Blocking pop
            result = await r.blpop(task_queue, timeout=5)
            if not result:
                continue
                
            _, message_data = result
            
            try:
                message = json.loads(message_data)
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON message")
                continue
            
            request_id = message.get("request_id")
            
            if not request_id:
                logger.error("Received task without request_id")
                continue
                
            response = await process_task(message)
            
            # Push result
            result_key = f"ai_result:{request_id}"
            await r.rpush(result_key, json.dumps(response))
            await r.expire(result_key, 300) # Expire after 5 minutes
            
        except redis.ConnectionError:
            logger.error("Redis connection lost. Reconnecting...")
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(run_worker())
