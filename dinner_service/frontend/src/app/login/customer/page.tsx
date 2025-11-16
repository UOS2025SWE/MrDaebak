'use client';

import { Suspense } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

function CustomerLoginPageContent() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(formData.email, formData.password);

      if (result.success) {
        // redirect 파라미터가 있으면 해당 경로로, 없으면 홈으로 이동
        const redirectPath = searchParams?.get('redirect') || '/';
        router.push(redirectPath);
      } else {
        const fallback = '이메일 또는 비밀번호가 올바르지 않습니다.';
        setError(result.error ?? fallback);
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="login" />

      <main className="w-full py-16">
        <div className="max-w-md mx-auto px-6">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-blue-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-8 text-center">
              <div className="mb-4">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">고객 로그인</h2>
              <p className="text-blue-100">미스터 대박에 오신 것을 환영합니다</p>
            </div>

            {/* Form */}
            <div className="px-8 py-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-2">
                    이메일
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-blue-500 focus:outline-none transition-all duration-300"
                    placeholder="이메일을 입력하세요"
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-2">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-blue-500 focus:outline-none transition-all duration-300"
                    placeholder="비밀번호를 입력하세요"
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
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin"></div>
                      로그인 중...
                    </div>
                  ) : (
                    '로그인'
                  )}
                </button>
              </form>

              {/* Additional Links */}
              <div className="mt-8 text-center space-y-4">
                <div className="pt-4 border-t border-stone-200">
                  <p className="text-sm text-gray-600 mb-2">
                    아직 계정이 없으신가요?
                  </p>
                  <Link
                    href="/register/customer"
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    고객 회원가입하기
                  </Link>
                </div>

                <div className="pt-4 border-t border-stone-200">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-stone-600 hover:text-amber-700 transition-colors text-sm"
                  >
                    <span>←</span>
                    로그인 선택으로 돌아가기
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

export default function CustomerLoginPage() {
  // useSearchParams 사용 부분을 Suspense로 감싸서 Next.js 빌드 에러를 방지
  return (
    <Suspense fallback={null}>
      <CustomerLoginPageContent />
    </Suspense>
  );
}
