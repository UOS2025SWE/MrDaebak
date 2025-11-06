import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="login" />

      <main className="w-full py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">로그인</h1>
            <p className="text-gray-600">고객 또는 직원 계정으로 로그인하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 고객용 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-blue-100 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-3 text-gray-800">고객 로그인</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  일반 회원 계정으로<br/>
                  메뉴를 주문하고 배달받을 수 있습니다
                </p>
                <Link
                  href="/login/customer"
                  className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  고객 로그인하기
                </Link>
              </div>
            </div>

            {/* 직원용 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-3 text-gray-800">직원 로그인</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  미스터 대박 직원 전용<br/>
                  주문 관리 및 배달 업무를 수행합니다
                </p>
                <Link
                  href="/login/staff"
                  className="inline-block w-full bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  직원 로그인하기
                </Link>
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-600">
              계정이 없으신가요?{' '}
              <Link href="/register" className="text-amber-600 hover:text-amber-700 font-semibold">
                회원가입하기
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
