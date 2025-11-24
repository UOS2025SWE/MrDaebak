#!/usr/bin/env bash
set -e

# ai_server.worker 프로세스를 종료
pkill -f "ai_server.worker" || true


