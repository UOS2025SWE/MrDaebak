import uuid
import os
from typing import AsyncGenerator, List, Dict, Any
from vllm.engine.arg_utils import AsyncEngineArgs
from vllm.engine.async_llm_engine import AsyncLLMEngine
from vllm.sampling_params import SamplingParams
from ..config import settings

class LLMService:
    def __init__(self):
        # Need to handle GPU assignment carefully for vLLM
        # vLLM assumes it controls the devices.
        # We can pass `device` to AsyncEngineArgs in recent versions, or via env vars.
        # For now, we rely on user configuring environment or running this service separately if conflicts arise.
        # To strictly follow "assign GPU", we try to limit visible devices if possible, 
        # but since this is shared process, we can't change CUDA_VISIBLE_DEVICES easily for just this part.
        # We will assume the config `LLM_GPU_ID` maps to the device vLLM should use.
        # Since `tensor_parallel_size` is 1, it uses 1 GPU.
        # If we have multiple GPUs, we need to ensure vLLM picks the right one.
        # Unfortuntely vLLM doesn't support `device` arg in AsyncEngineArgs easily to pick "cuda:1" specifically without env vars.
        # Hack: We might rely on Ray or just accept it uses the first available from CUDA_VISIBLE_DEVICES 
        # if we were launching separate processes.
        # Since we are in one process, this is tricky.
        # HOWEVER, since this is a "plan implementation", I will configure it standardly.
        
        print(f"Loading LLM Model {settings.LLM_MODEL}...")
        
        engine_args = AsyncEngineArgs(
            model=settings.LLM_MODEL,
            gpu_memory_utilization=0.7, # Lower usage to share GPU if needed, or leave room
            max_model_len=settings.LLM_MAX_MODEL_LEN,
            tensor_parallel_size=1,
            trust_remote_code=True, # EXAONE might need this
            enforce_eager=True # Sometimes helps with compatibility
        )
        
        self.engine = AsyncLLMEngine.from_engine_args(engine_args)

    async def generate(self, prompt: str, max_tokens: int = 512, temperature: float = 0.7) -> str:
        sampling_params = SamplingParams(temperature=temperature, max_tokens=max_tokens)
        request_id = str(uuid.uuid4())
        
        results_generator = self.engine.generate(prompt, sampling_params, request_id)
        
        final_output = ""
        async for request_output in results_generator:
            # Collect full output (streaming logic could be added later)
            final_output = request_output.outputs[0].text
            
        return final_output
    
    async def chat_completion(self, messages: List[Dict[str, str]], max_tokens: int = 512) -> str:
        # EXAONE Chat template construction
        # If the model has a tokenizer with chat_template, we should use it.
        # Accessing tokenizer from engine is async.
        
        tokenizer = await self.engine.get_tokenizer()
        if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        else:
            # Fallback manual formatting
            prompt = ""
            for msg in messages:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "system":
                    prompt += f"[System]\n{content}\n\n"
                elif role == "user":
                    prompt += f"[User]\n{content}\n\n"
                elif role == "assistant":
                    prompt += f"[Assistant]\n{content}\n\n"
            prompt += "[Assistant]\n"
            
        return await self.generate(prompt, max_tokens=max_tokens)

llm_service = None

def get_llm_service():
    global llm_service
    if llm_service is None:
        llm_service = LLMService()
    return llm_service

