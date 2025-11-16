'use client'

import { useState } from 'react'
import { PageContainer, Section } from '@/components/layout/Responsive'

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    topic: 'general',
    message: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleChange = (field: string, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitted(false)
    setSubmitting(true)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formState)
      })

      const raw = await response.text()
      const data = raw ? JSON.parse(raw) : {}

      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '문의 접수에 실패했습니다.')
      }

      setSubmitted(true)
      setFormState({ name: '', email: '', topic: 'general', message: '' })
    } catch (error: any) {
      console.error('문의 접수 실패:', error)
      let message = '문의 접수 중 오류가 발생했습니다.'
      if (error instanceof SyntaxError) {
        message = '서버 응답을 해석할 수 없습니다. 잠시 후 다시 시도해주세요.'
      } else if (error?.message) {
        message = error.message
      }
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer currentPage="contact">
      <main className="w-full">
        <Section>
          <div className="max-w-[1100px] mx-auto px-3 sm:px-6">
        <section className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-3 sm:mb-4">문의하기</h1>
          <p className="text-sm sm:text-lg text-stone-600 max-w-2xl mx-auto leading-relaxed">
            미스터 대박 서비스에 대해 궁금한 점이나 제안하고 싶은 내용이 있으시면 언제든지 연락주세요. 고객님의 목소리를 소중하게 듣겠습니다.
          </p>
        </section>

        <section className="grid gap-6 sm:gap-8 md:grid-cols-2 mb-12 sm:mb-16">
          <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-amber-100">
            <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-3 sm:mb-4">고객 상담 센터</h2>
            <div className="space-y-4 text-sm sm:text-base text-stone-700">
              <div>
                <p className="text-sm text-stone-500 mb-1">전화 상담</p>
                <p className="text-lg font-semibold">070-1234-5678</p>
                <p className="text-xs text-stone-500">평일 10:00 - 19:00 (점심 13:00 - 14:00)</p>
              </div>
              <div>
                <p className="text-sm text-stone-500 mb-1">이메일</p>
                <a href="mailto:hello@misterdaebak.com" className="text-lg font-semibold text-amber-700 hover:underline">
                  hello@misterdaebak.com
                </a>
              </div>
              <div>
                <p className="text-sm text-stone-500 mb-1">주소</p>
                <p className="text-lg font-semibold">서울특별시 강남구 테이스트로 77, 3층 미스터 대박</p>
              </div>
            </div>
            <div className="mt-6 sm:mt-8 p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-100 text-xs sm:text-sm text-stone-600">
              <p className="font-semibold text-amber-800 mb-2">빠른 답변을 원하시나요?</p>
              <p>관리자 전용 대시보드 &gt; 고객 지원 메뉴에서도 실시간 문의 상태를 확인할 수 있습니다.</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 border border-amber-100"
          >
            <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-4">문의 남기기</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2" htmlFor="contact-name">
                  이름
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  placeholder="이름을 입력해주세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2" htmlFor="contact-email">
                  이메일
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={formState.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2" htmlFor="contact-topic">
                  문의 유형
                </label>
                <select
                  id="contact-topic"
                  value={formState.topic}
                  onChange={(e) => handleChange('topic', e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-sm"
                >
                  <option value="general">일반 문의</option>
                  <option value="order">주문/배송</option>
                  <option value="menu">메뉴 및 커스터마이징</option>
                  <option value="partnership">제휴/협찬</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2" htmlFor="contact-message">
                  문의 내용
                </label>
                <textarea
                  id="contact-message"
                  rows={5}
                  required
                  value={formState.message}
                  onChange={(e) => handleChange('message', e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  placeholder="문의 내용을 작성해주세요"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold rounded-xl hover:from-amber-700 hover:to-amber-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {submitting ? '전송 중...' : '문의 보내기'}
              </button>

              {submitted && (
                <div className="mt-4 p-3 sm:p-4 text-xs sm:text-sm rounded-xl bg-green-50 text-green-700 border border-green-200">
                  문의가 접수되었습니다. 빠른 시일 내에 연락드리겠습니다.
                </div>
              )}
              {submitError && (
                <div className="mt-4 p-3 sm:p-4 text-xs sm:text-sm rounded-xl bg-red-50 text-red-600 border border-red-200">
                  {submitError}
                </div>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white rounded-3xl shadow-lg border border-amber-100 p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-semibold text-amber-800 mb-5 sm:mb-6">자주 묻는 질문</h2>
          <div className="space-y-4 text-xs sm:text-sm text-stone-600">
            <details className="group border border-amber-100 rounded-2xl overflow-hidden">
              <summary className="cursor-pointer bg-amber-50 px-5 py-4 font-semibold text-stone-800 flex justify-between items-center">
                <span>배송은 어느 지역까지 가능한가요?</span>
                <span className="text-amber-500 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 py-4 bg-white border-t border-amber-100">
                현재는 서울 및 수도권 일부 지역에 한해 프리미엄 배송 서비스를 제공하고 있습니다. 서비스 지역은 계속 확대될 예정입니다.
              </div>
            </details>
            <details className="group border border-amber-100 rounded-2xl overflow-hidden">
              <summary className="cursor-pointer bg-amber-50 px-5 py-4 font-semibold text-stone-800 flex justify_between items-center">
                <span>메뉴 커스터마이징은 어떻게 하나요?</span>
                <span className="text-amber-500 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 py-4 bg-white border-t border-amber-100">
                체크아웃 페이지에서 사이드 메뉴와 커스텀 케이크 옵션을 선택할 수 있으며, 관리자 대시보드에서 등록된 재료와 레시피가 자동으로 반영됩니다.
              </div>
            </details>
            <details className="group border border-amber-100 rounded-2xl overflow-hidden">
              <summary className="cursor-pointer bg-amber-50 px-5 py-4 font-semibold text-stone-800 flex justify-between items-center">
                <span>기업/단체 주문도 가능한가요?</span>
                <span className="text-amber-500 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 py-4 bg-white border-t border-amber-100">
                네, 기업 행사나 단체 주문을 위한 맞춤 플랜을 운영하고 있습니다. 문의 양식을 통해 예상 인원과 일정을 알려주시면 담당자가 연락드립니다.
              </div>
            </details>
          </div>
        </section>
        </div>
      </Section>
      </main>
    </PageContainer>
  )
}
