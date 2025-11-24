'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function ChangePasswordModal({ isOpen, onClose, onSuccess }: ChangePasswordModalProps) {
  const { logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const currentPasswordRef = useRef<HTMLInputElement>(null)

  // 모달이 열릴 때 첫 입력 필드로 포커스
  useEffect(() => {
    if (isOpen && currentPasswordRef.current) {
      setTimeout(() => currentPasswordRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 모달 초기화
  const resetForm = useCallback(() => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    setError(null)
    setSuccess(false)
  }, [])

  const handleClose = useCallback(() => {
    if (!loading) {
      resetForm()
      onClose()
    }
  }, [loading, resetForm, onClose])

  // Escape 키로 모달 닫기
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, loading, handleClose])

  // 폼 검증
  const validateForm = (): string | null => {
    if (!currentPassword) {
      return '현재 비밀번호를 입력해주세요'
    }
    if (!newPassword) {
      return '새 비밀번호를 입력해주세요'
    }
    if (newPassword.length < 6) {
      return '새 비밀번호는 6자 이상이어야 합니다'
    }
    if (newPassword === currentPassword) {
      return '새 비밀번호는 현재 비밀번호와 달라야 합니다'
    }
    if (newPassword !== confirmPassword) {
      return '새 비밀번호가 일치하지 않습니다'
    }
    return null
  }

  // 비밀번호 변경 API 호출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 클라이언트 사이드 검증
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('인증 토큰이 없습니다. 다시 로그인해주세요.')
        logout()
        return
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setSuccess(true)
          setError(null)

          // 성공 메시지 표시 후 2초 뒤 모달 닫기
          setTimeout(() => {
            handleClose()
            onSuccess?.()
          }, 2000)
        } else {
          setError(data.message || '비밀번호 변경에 실패했습니다')
        }
      } else {
        // 에러 응답 처리
        const errorData = await response.json()

        if (response.status === 401) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요.')
          setTimeout(() => {
            logout()
            handleClose()
          }, 2000)
        } else if (response.status === 400) {
          setError(errorData.detail || '현재 비밀번호가 일치하지 않습니다')
        } else if (response.status === 404) {
          setError('사용자를 찾을 수 없습니다')
        } else {
          setError(errorData.detail || '서버 오류가 발생했습니다')
        }
      }
    } catch (error) {
      console.error('비밀번호 변경 중 오류:', error)
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  // 외부 클릭으로 모달 닫기
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      handleClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-labelledby="change-password-title"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 transform transition-all duration-200 scale-100 opacity-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <h2 id="change-password-title" className="text-2xl font-bold text-stone-900">
                비밀번호 변경
              </h2>
            </div>
            {!loading && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-6">
          <div className="space-y-4">
            {/* 현재 비밀번호 */}
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-stone-700 mb-2">
                현재 비밀번호
              </label>
              <div className="relative">
                <input
                  ref={currentPasswordRef}
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  placeholder="현재 비밀번호를 입력하세요"
                  disabled={loading || success}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={loading || success}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* 새 비밀번호 */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-stone-700 mb-2">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  placeholder="새 비밀번호 (6자 이상)"
                  disabled={loading || success}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={loading || success}
                  tabIndex={-1}
                >
                  {showNewPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {newPassword && newPassword.length < 6 && (
                <p className="mt-1 text-sm text-red-600">비밀번호는 6자 이상이어야 합니다</p>
              )}
            </div>

            {/* 새 비밀번호 확인 */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-stone-700 mb-2">
                새 비밀번호 확인
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  placeholder="새 비밀번호를 다시 입력하세요"
                  disabled={loading || success}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={loading || success}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-sm text-red-600">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 성공 메시지 */}
          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">✅ 비밀번호가 성공적으로 변경되었습니다!</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || success}
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium rounded-lg hover:from-amber-700 hover:to-amber-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || success}
            >
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
