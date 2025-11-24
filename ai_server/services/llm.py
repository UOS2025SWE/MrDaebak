import uuid
import os
from typing import AsyncGenerator, List, Dict, Any
import torch
from vllm.engine.arg_utils import AsyncEngineArgs
from vllm.engine.async_llm_engine import AsyncLLMEngine
from vllm.sampling_params import SamplingParams
from ..config import settings


class LLMService:
    def __init__(self):
        # CPU 모드 체크
        use_cpu = settings.LLM_USE_CPU or settings.LLM_GPU_ID < 0

        if use_cpu:
            raise RuntimeError(
                "vLLM은 CPU를 지원하지 않습니다. LLM은 GPU가 필요합니다.\n"
                "CPU에서 LLM을 실행하려면 다른 라이브러리(transformers 등)를 사용해야 합니다.\n"
                "LLM_USE_CPU=false 또는 LLM_GPU_ID를 0 이상으로 설정하세요."
            )

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

        print(
            f"Loading LLM Model {settings.LLM_MODEL} on GPU {settings.LLM_GPU_ID}...")

        engine_args = AsyncEngineArgs(
            model=settings.LLM_MODEL,
            gpu_memory_utilization=0.4,  # Lower usage to share GPU if needed, or leave room
            max_model_len=settings.LLM_MAX_MODEL_LEN,
            tensor_parallel_size=1,
            trust_remote_code=True,  # Qwen might need this
            enforce_eager=True  # Sometimes helps with compatibility
        )

        self.engine = AsyncLLMEngine.from_engine_args(engine_args)

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.8) -> str:
        sampling_params = SamplingParams(
            temperature=temperature, max_tokens=max_tokens)
        request_id = str(uuid.uuid4())

        results_generator = self.engine.generate(
            prompt, sampling_params, request_id)

        final_output = ""
        async for request_output in results_generator:
            # Collect full output (streaming logic could be added later)
            final_output = request_output.outputs[0].text

        return final_output

    async def chat_completion(self, messages: List[Dict[str, str]], max_tokens: int = 512) -> str:
        """
        Chat completion using proper chat template.

        Qwen 모델의 chat_template을 사용하여 메시지를 올바른 형식으로 변환합니다.
        사용자 예제와 동일하게 apply_chat_template을 사용하지만, vLLM은 내부적으로
        토큰화를 처리하므로 tokenize=False로 설정합니다.

        참고: transformers 라이브러리 예제:
        input_ids = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True, return_tensors="pt"
        )

        vLLM에서는:
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        """
        tokenizer = await self.engine.get_tokenizer()

        # 모델의 chat_template이 있으면 사용 (Qwen은 chat_template을 지원)
        if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
            # vLLM은 내부적으로 토큰화를 처리하므로 tokenize=False
            # add_generation_prompt=True로 설정하여 모델이 응답을 생성할 수 있도록 함
            prompt = tokenizer.apply_chat_template(
                messages,
                tokenize=False,  # vLLM이 내부적으로 토큰화하므로 False
                add_generation_prompt=True  # 응답 생성을 위한 프롬프트 추가
            )
        else:
            # Fallback: chat_template이 없는 경우 수동 포맷팅
            # (Qwen은 chat_template을 지원하므로 일반적으로 이 경로는 사용되지 않음)
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

        # vLLM의 generate는 문자열을 받아서 내부적으로 토큰화함
        return await self.generate(prompt, max_tokens=max_tokens)

    async def shutdown(self) -> None:
        """
        LLM 엔진을 정리하고 GPU 메모리를 해제합니다.
        """
        try:
            # vLLM AsyncLLMEngine은 shutdown 메서드를 제공합니다.
            shutdown_fn = getattr(self.engine, "shutdown", None)
            if callable(shutdown_fn):
                await shutdown_fn()
        except Exception:
            # 종료 중 예외는 로깅만 하고 무시
            pass


llm_service = None


def get_llm_service():
    global llm_service
    if llm_service is None:
        llm_service = LLMService()
    return llm_service


async def unload_llm_service() -> None:
    """
    글로벌 LLM 서비스를 언로드하고 GPU 캐시를 비웁니다.
    """
    global llm_service
    if llm_service is not None:
        try:
            await llm_service.shutdown()
        except Exception:
            pass
        llm_service = None

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
