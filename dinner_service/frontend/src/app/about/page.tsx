'use client'

import { PageContainer, Section } from '@/components/layout/Responsive'

export default function AboutPage() {
  return (
    <PageContainer currentPage="about">
      <main className="w-full">
        <Section>
          <div className="max-w-[1100px] mx-auto px-3 sm:px-6">
            <div className="text-center mb-8 sm:mb-12">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-3 sm:mb-4">
                미스터 대박을 소개합니다
              </h1>
              <p className="text-sm sm:text-lg text-stone-600 max-w-3xl mx-auto leading-relaxed">
                미스터 대박은 집에서도 호텔급 다이닝을 경험할 수 있도록 기획된 프리미엄 홈 다이닝 서비스입니다. 고급 재료와 셰프의 손길을 담아 당신의 식탁 위에 특별한 순간을 제공합니다.
              </p>
            </div>

            <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
            <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-amber-100">
              <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-3 sm:mb-4">우리의 철학</h2>
              <p className="text-stone-600 leading-relaxed mb-4">
                미스터 대박은 "누구나 집에서 편안하게 최고급 디너를 즐길 수 있어야 한다"는 철학으로 시작했습니다. 셰프의 40여 년 경력과 다양한 미식 경험을 바탕으로 가장 품격 있는 한 끼를 만들기 위해 끊임없이 연구합니다.
              </p>
              <ul className="space-y-3 text-stone-700">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-amber-600">•</span>
                  <span>신선한 재료는 물론, 공정 무역과 지속 가능한 방식으로 수급합니다.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-amber-600">•</span>
                  <span>모든 메뉴는 셰프가 직접 검수하고, 조리 매뉴얼에 따라 일관된 품질을 유지합니다.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-amber-600">•</span>
                  <span>고객 한 분 한 분의 취향을 반영할 수 있도록 커스터마이징을 제공합니다.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-amber-100">
              <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-3 sm:mb-4">서비스 하이라이트</h2>
              <div className="space-y-5">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-stone-900">프리미엄 코스 구성</h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    발렌타인, 프렌치, 잉글리시, 샴페인 디너 등 4가지 대표 코스와 함께 시즌 한정 메뉴를 선보입니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-stone-900">AI &amp; 음성 주문</h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    AI 추천과 음성 주문 기능을 통해 고객은 손쉽게 자신에게 맞는 메뉴를 선택할 수 있습니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-stone-900">맞춤 케이크</h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    다양한 사이즈와 맛을 선택하고 재료를 직접 구성해 나만의 커스텀 케이크를 완성할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </div>
        </Section>

        <Section>
          <div className="bg-white rounded-3xl shadow-lg border border-amber-100 overflow-hidden">
            <div className="md:flex">
              <div className="md:w-1/2 h-56 sm:h-72 md:h-auto">
                <img
                  src="/images/mister-daebak.jpg"
                  alt="셰프 팀"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="md:w-1/2 p-6 sm:p-8 lg:p-10">
                <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-3 sm:mb-4">셰프팀을 소개합니다</h2>
                <p className="text-sm sm:text-base text-stone-600 leading-relaxed mb-4">
                  미스터 대박의 주방은 각 분야에서 오랜 경험을 가진 셰프들로 구성되어 있습니다. 프랑스 미슐랭 레스토랑 출신 셰프, 호텔 출신 파티시에, 소믈리에 등이 함께해 완성도 높은 코스를 선사합니다.
                </p>
                <div className="grid gap-3 text-xs sm:text-sm text-stone-700">
                  <span>• 요리 연구원들과 협업하여 매 시즌 새로운 메뉴를 개발합니다.</span>
                  <span>• 고객 피드백을 분석해 메뉴 개선과 서비스 품질 향상에 반영합니다.</span>
                  <span>• 철저한 위생 관리와 교육을 통해 안전한 조리 환경을 유지합니다.</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="bg-white rounded-3xl shadow-lg border border-amber-100 p-6 sm:p-8 lg:p-10">
            <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-5 sm:mb-6">고객과의 약속</h2>
            <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
              <div className="p-5 sm:p-6 border border-amber-100 rounded-2xl bg-amber-50/30">
                <h3 className="text-base sm:text-lg font-semibold text-stone-900 mb-2">고품질 재료</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  정기적으로 갱신되는 공급망과 셰프의 검수를 통해, 항상 신선하고 믿을 수 있는 재료만 사용합니다.
                </p>
              </div>
              <div className="p-5 sm:p-6 border border-amber-100 rounded-2xl bg-amber-50/30">
                <h3 className="text-base sm:text-lg font-semibold text-stone-900 mb-2">투명한 가격</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  모든 재료와 메뉴 가격은 관리자 대시보드에서 투명하게 관리되며, 고객에게도 명확히 안내됩니다.
                </p>
              </div>
              <div className="p-5 sm:p-6 border border-amber-100 rounded-2xl bg-amber-50/30">
                <h3 className="text-base sm:text-lg font-semibold text-stone-900 mb-2">정성 어린 서비스</h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  주문부터 배송, 사후 케어까지 모든 과정을 주방과 현장 팀이 긴밀히 협력해 책임집니다.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </main>
    </PageContainer>
  )
}
