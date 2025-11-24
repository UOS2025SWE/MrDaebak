#!/usr/bin/env bash
set -e

# 단일 워커를 띄우는 헬퍼 스크립트
# STT + LLM + IMAGE 모두 활성화하고,
# 이미지 생성 시에는 worker.py 내부 로직이 LLM/SD3.5를 번갈아 언로드/로딩함.

export ENABLE_STT=true
export ENABLE_LLM=true
export ENABLE_IMAGE=true

python -m ai_server.worker


