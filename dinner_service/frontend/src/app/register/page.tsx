import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="register" />

      <main className="w-full py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">회원가입</h1>
            <p className="text-gray-600">고객 또는 직원 계정을 생성하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 고객용 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-blue-100 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-3 text-gray-800">고객 회원가입</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  간편한 회원가입으로<br/>
                  프리미엄 디너를 주문하세요
                </p>
                <Link
                  href="/register/customer"
                  className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  고객 가입하기
                </Link>
              </div>
            </div>

            {/* 직원용 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-3 text-gray-800">직원 회원가입</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  미스터 대박 직원 계정을<br/>
                  생성하세요
                </p>
                <Link
                  href="/register/staff"
                  className="inline-block w-full bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  직원 가입하기
                </Link>
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-600">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="text-amber-600 hover:text-amber-700 font-semibold">
                로그인하기
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
