#!/usr/bin/env python3
"""비밀번호 해시 생성 및 검증 스크립트"""
import sys
import os

# 프로젝트 루트를 Python path에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

# 테스트용 비밀번호
test_password = 'testtest'

# 기존 해시 (init.sql에 있는 값)
existing_hash = '$2b$12$tq7a9CLVXKlCwsaWkBWyncFHQkX3eGUB7n/flQKXnfY5ZwdlQriu6'

print("=== 비밀번호 해시 생성 및 검증 ===\n")
print(f"테스트 비밀번호: {test_password}\n")

# 새 해시 생성
new_hash = pwd_context.hash(test_password)
print(f"새로 생성된 해시: {new_hash}\n")

# 기존 해시 검증
is_valid = pwd_context.verify(test_password, existing_hash)
print(f"기존 해시 검증 결과: {is_valid}")

if is_valid:
    print("✅ 기존 해시는 올바릅니다!")
else:
    print("❌ 기존 해시가 올바르지 않습니다!")
    print(f"\n올바른 해시: {new_hash}")

