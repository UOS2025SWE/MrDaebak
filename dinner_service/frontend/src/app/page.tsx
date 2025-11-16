'use client'

import { PageContainer, Section } from '../components/layout/Responsive'

export default function Home() {
  return (
    <PageContainer currentPage="main">
      {/* Hero Section */}
      <Section className="relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-stone-100 opacity-60"></div>
          <div className="max-w-[1200px] mx-auto px-3 sm:px-6 relative z-10">
            <div className="lg:grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-10 items-start">
              <div>
                <div className="text-center mb-10 sm:mb-14">
                  <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-stone-900 mb-4 sm:mb-6 leading-tight">
                    프리미엄 디너의 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">새로운 경험</span>
                  </h1>
                  <p className="text-base sm:text-lg text-stone-600 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-2 sm:px-0">
                    최고급 재료로 만든 특별한 디너를 집에서 편안하게 즐기세요
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-6 justify-center mb-10 sm:mb-16">
                  <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-white rounded-full shadow-lg border border-amber-100">
                    <span className="text-2xl">🎙️</span>
                    <span className="text-sm sm:text-base font-medium text-stone-700">음성 주문</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-white rounded-full shadow-lg border border-amber-100">
                    <span className="text-2xl">🤖</span>
                    <span className="text-sm sm:text-base font-medium text-stone-700">AI 추천</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-white rounded-full shadow-lg border border-amber-100">
                    <span className="text-2xl">🚚</span>
                    <span className="text-sm sm:text-base font-medium text-stone-700">빠른 배달</span>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block sticky top-10 self-start">
                <div className="bg-gradient-to-b from-amber-600 to-amber-800 rounded-2xl shadow-2xl p-5 min-w-[200px] max-w-[220px]">
                  <h3 className="text-white text-sm sm:text-base font-bold text-center mb-3 sm:mb-4">빠른 주문</h3>
                  <div className="space-y-4">
                    <a
                      href="/menu"
                      className="block w-full bg-white text-amber-700 font-bold text-center py-3 px-4 rounded-xl hover:bg-amber-50 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">🍽️</span>
                      <span className="text-sm sm:text-base">메뉴 보기</span>
                    </a>
                    <a
                      href="/voice"
                      className="block w-full bg-white/20 backdrop-blur text-white font-bold text-center py-3 px-4 rounded-xl hover:bg-white/30 transition-all transform hover:scale-105 border-2 border-white/50 flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">🎙️</span>
                      <span className="text-sm sm:text-base">음성 주문</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Hero Image & Message Section */}
            <div className="flex flex-col lg:flex-row items-stretch gap-6 sm:gap-8">
              {/* Left: Image (더 큰 비율) */}
              <div className="w-full lg:w-2/3">
                <div className="w-full h-64 sm:h-80 lg:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
                  <img 
                    src="/images/mister-daebak.jpg"
                    alt="미스터 대박 프리미엄 디너"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              
              {/* Right: Message from Mr. Daebak (더 좁은 비율) */}
              <div className="w-full lg:w-1/3">
                <div className="bg-white/80 backdrop-blur-sm p-5 sm:p-6 rounded-3xl shadow-lg border border-amber-100 h-auto lg:h-[500px] flex flex-col justify-center">
                  <div className="text-center mb-4 sm:mb-5">
                    <h3 className="text-lg sm:text-xl font-bold text-amber-800 mb-2">미스터 대박</h3>
                    <div className="w-12 h-0.5 bg-gradient-to-r from-amber-600 to-amber-800 mx-auto rounded"></div>
                  </div>
                  
                  <div className="space-y-3 text-stone-700 leading-relaxed text-sm sm:text-base flex-1 flex flex-col justify-center">
                    <p>
                      안녕하세요. <span className="font-semibold text-amber-800">미스터 대박</span>입니다.
                    </p>
                    
                    <p>
                      저는 여러분들을 위해서 최상의 디너를 집에서도 마음껏 누릴 수 있게 하자는 신념 아래 저의 사업을 시작하게 되었습니다. 42년간 요리 분야에서 쌓아온 노하우와 경험을 바탕으로, 고객 한 분 한 분께 최고의 맛을 선사하고자 합니다.
                    </p>
                    
                    <div className="space-y-2">
                      <p className="font-medium text-amber-800 text-xs sm:text-sm">특별한 4가지 디너 메뉴</p>
                      <div className="grid grid-cols-1 gap-1">
                        <div className="group border-l-4 border-amber-300 pl-3 py-2 rounded-r-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-amber-50 hover:to-transparent hover:border-amber-500 cursor-pointer">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-amber-800 text-xs group-hover:text-amber-900 transition-colors">발렌타인 디너</span>
                            <span className="text-stone-400 text-xs group-hover:text-amber-600 transition-colors">로맨틱한 분위기</span>
                          </div>
                        </div>
                        <div className="group border-l-4 border-amber-300 pl-3 py-2 rounded-r-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-amber-50 hover:to-transparent hover:border-amber-500 cursor-pointer">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-amber-800 text-xs group-hover:text-amber-900 transition-colors">프렌치 디너</span>
                            <span className="text-stone-400 text-xs group-hover:text-amber-600 transition-colors">정통 프랑스 요리</span>
                          </div>
                        </div>
                        <div className="group border-l-4 border-amber-300 pl-3 py-2 rounded-r-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-amber-50 hover:to-transparent hover:border-amber-500 cursor-pointer">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-amber-800 text-xs group-hover:text-amber-900 transition-colors">잉글리시 디너</span>
                            <span className="text-stone-400 text-xs group-hover:text-amber-600 transition-colors">클래식 영국 전통</span>
                          </div>
                        </div>
                        <div className="group border-l-4 border-amber-300 pl-3 py-2 rounded-r-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-amber-50 hover:to-transparent hover:border-amber-500 cursor-pointer">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-amber-800 text-xs group-hover:text-amber-900 transition-colors">샴페인 디너</span>
                            <span className="text-stone-400 text-xs group-hover:text-amber-600 transition-colors">프리미엄 특별 코스</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <p className="font-medium text-amber-800">
                      여러분께서 저의 음식들을 즐길 수 있으면 좋겠습니다.
                    </p>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-amber-100">
                    <p className="text-xs text-stone-500 text-center italic">
                      &ldquo;집에서도 특별한 순간을, 최고의 맛으로&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Service Info Section */}
        <Section className="bg-gradient-to-b from-white to-amber-50 rounded-2xl sm:rounded-3xl py-8 sm:py-10 px-4 sm:px-6">
          <div className="max-w-[1200px] mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 text-center mb-8 sm:mb-10">
              프리미엄 디너 메뉴
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white p-6 sm:p-8 rounded-2xl text-center transition-all hover:-translate-y-1 hover:shadow-xl border border-amber-100 hover:border-amber-200">
                <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🍷</div>
                <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">발렌타인 디너</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">로맨틱한 분위기를 위한 특별한 디너 코스</p>
              </div>
              
              <div className="bg-white p-6 sm:p-8 rounded-2xl text-center transition-all hover:-translate-y-1 hover:shadow-xl border border-amber-100 hover:border-amber-200">
                <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🗼</div>
                <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">프렌치 디너</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">정통 프랑스 요리의 깊은 맛과 향</p>
              </div>
              
              <div className="bg-white p-6 sm:p-8 rounded-2xl text-center transition-all hover:-translate-y-1 hover:shadow-xl border border-amber-100 hover:border-amber-200">
                <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">👑</div>
                <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">잉글리시 디너</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">클래식한 영국 전통 요리의 진수</p>
              </div>
              
              <div className="bg-white p-6 sm:p-8 rounded-2xl text-center transition-all hover:-translate-y-1 hover:shadow-xl border border-amber-100 hover:border-amber-200">
                <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🥂</div>
                <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">샴페인 디너</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">특별한 날을 위한 프리미엄 디너</p>
              </div>
            </div>
          </div>
        </Section>
    </PageContainer>
  )
}