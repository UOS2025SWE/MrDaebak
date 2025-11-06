'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function StaffRegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    phoneNumber: '',
    address: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 필수 필드 검증
    if (!formData.email || !formData.password || !formData.name || !formData.phoneNumber || !formData.address) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    // 비밀번호 길이 검증
    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    // 비밀번호 확인 검증
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/staff/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          phone_number: formData.phoneNumber,
          address: formData.address
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 회원가입 성공 - 로그인 페이지로 이동
        router.push('/login/staff?registered=true');
      } else {
        setError(data.error || '회원가입 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('Register error:', error);
      setError('서버와의 통신 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="register" />

      <main className="w-full py-16">
        <div className="max-w-md mx-auto px-6">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-8 py-8 text-center">
              <div className="mb-4">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-12 h-12 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">직원 회원가입</h2>
              <p className="text-gray-300">미스터 대박 직원 계정 생성</p>
            </div>

            {/* Form */}
            <div className="px-8 py-8">
              {/* 안내 메시지 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-800">
                  💡 직원 포지션(요리사/배달원)은 가입 후 매니저가 할당해드립니다.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-2">
                    이메일 *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="이메일을 입력하세요"
                    required
                  />
                </div>

                {/* Name Field */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-2">
                    이름 *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="이름을 입력하세요"
                    required
                  />
                </div>

                {/* Phone Number Field */}
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-stone-700 mb-2">
                    전화번호 *
                  </label>
                  <input
                    type="tel"
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="010-1234-5678"
                    required
                  />
                </div>

                {/* Address Field */}
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-stone-700 mb-2">
                    주소 *
                  </label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="주소를 입력하세요"
                    required
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-2">
                    비밀번호 * (최소 6자)
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="비밀번호를 입력하세요"
                    required
                    minLength={6}
                  />
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700 mb-2">
                    비밀번호 확인 *
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-gray-500 focus:outline-none transition-all duration-300"
                    placeholder="비밀번호를 다시 입력하세요"
                    required
                  />
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl ${
                    isLoading
                      ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-gray-700 to-gray-900 text-white hover:from-gray-800 hover:to-black'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin"></div>
                      가입 처리 중...
                    </div>
                  ) : (
                    '회원가입'
                  )}
                </button>
              </form>

              {/* Additional Links */}
              <div className="mt-8 text-center space-y-4">
                <div className="pt-4 border-t border-stone-200">
                  <p className="text-sm text-gray-600 mb-2">
                    이미 계정이 있으신가요?
                  </p>
                  <Link
                    href="/login/staff"
                    className="text-gray-700 hover:text-gray-900 font-semibold"
                  >
                    직원 로그인하기
                  </Link>
                </div>

                <div className="pt-4 border-t border-stone-200">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 text-stone-600 hover:text-amber-700 transition-colors text-sm"
                  >
                    <span>←</span>
                    회원가입 선택으로 돌아가기
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
