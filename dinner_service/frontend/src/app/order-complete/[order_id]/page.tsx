/**
 * FR-012/FR-013: 주문 완료 페이지
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PageContainer, Section } from '../../../components/layout/Responsive'

export default function OrderCompletePage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params?.order_id as string

  const [orderInfo, setOrderInfo] = useState<any>(null)
  const [paymentInfo, setPaymentInfo] = useState<any>(null)
  const [pricingInfo, setPricingInfo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const paymentStatusLabel = paymentInfo?.payment_status === 'FAILED' ? '결제 실패' : '결제 완료'
  const paymentStatusClass = paymentInfo?.payment_status === 'FAILED' ? 'text-red-600' : 'text-green-600'

  useEffect(() => {
    if (orderId) {
      fetchOrderInfo()
      // sessionStorage에서 결제 정보 가져오기
      const savedPaymentInfo = sessionStorage.getItem('lastPaymentInfo')
      if (savedPaymentInfo) {
        setPaymentInfo(JSON.parse(savedPaymentInfo))
        // 사용 후 삭제
        sessionStorage.removeItem('lastPaymentInfo')
      }
      const savedPricingInfo = sessionStorage.getItem('lastOrderPricing')
      if (savedPricingInfo) {
        setPricingInfo(JSON.parse(savedPricingInfo))
        sessionStorage.removeItem('lastOrderPricing')
      }
    }
  }, [orderId])

  const fetchOrderInfo = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}`)
      const data = await response.json()

      if (data.success) {
        setOrderInfo(data.order)
      } else {
        alert('주문 정보를 찾을 수 없습니다.')
        router.push('/')
      }
    } catch (error) {
      console.error('주문 정보 조회 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }


  if (isLoading) {
    return (
      <PageContainer currentPage="orders">
        <div className="min-h-[60vh] bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-sm sm:text-base">주문 정보를 불러오는 중...</p>
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!orderInfo) {
    return null
  }

  return (
    <PageContainer currentPage="orders">
      <Section>
      <div className="max-w-3xl mx-auto px-3 sm:px-4">
        {/* 성공 아이콘 */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">주문이 완료되었습니다!</h1>
          <p className="text-gray-600 text-sm sm:text-base">주문번호: <span className="font-bold text-blue-600">{orderInfo.order_number}</span></p>
        </div>

        {/* 주문 정보 카드 */}
        <div className="bg-white rounded-lg shadow-md p-5 sm:p-6 mb-5 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">주문 정보</h2>

          <div className="space-y-2 sm:space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">주문 상태</span>
              <span className="font-medium text-blue-600">접수 완료</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">주문 일시</span>
              <span className="font-medium">
                {orderInfo.created_at ? new Date(orderInfo.created_at).toLocaleString('ko-KR') : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">결제 금액</span>
              <span className="font-bold text-base sm:text-lg text-blue-600">
                {orderInfo.total_price?.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {pricingInfo && (
          <div className="bg-white rounded-lg shadow-md p-5 sm:p-6 mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">가격 내역</h2>
            <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-700">
              <div className="flex justify-between">
                <span>기본 금액</span>
                <span>{Number(pricingInfo.base_price_total ?? 0).toLocaleString()}원</span>
              </div>
              {Number(pricingInfo.customization_cost ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>커스터마이징 추가금</span>
                  <span>+{Number(pricingInfo.customization_cost ?? 0).toLocaleString()}원</span>
                </div>
              )}
              {Number(pricingInfo.side_dish_total ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>사이드 메뉴 추가</span>
                  <span>+{Number(pricingInfo.side_dish_total ?? 0).toLocaleString()}원</span>
                </div>
              )}
              {Number(pricingInfo.event_discount_total ?? 0) > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>이벤트 할인</span>
                  <span>-{Number(pricingInfo.event_discount_total ?? 0).toLocaleString()}원</span>
                </div>
              )}
              {Number(pricingInfo.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>단골 할인</span>
                  <span>-{Number(pricingInfo.discount_amount ?? 0).toLocaleString()}원</span>
                </div>
              )}
            </div>

            {Array.isArray(pricingInfo.event_discounts) && pricingInfo.event_discounts.length > 0 && (
              <div className="mt-3 sm:mt-4 border-t pt-2 sm:pt-3">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-2">적용된 이벤트</h3>
                <ul className="space-y-1 text-xs sm:text-sm text-gray-600">
                  {pricingInfo.event_discounts.map((discount: any) => (
                    <li key={`${discount.event_id}-${discount.discount_type}`} className="flex justify-between">
                      <span>
                        {discount.title ?? '이벤트 할인'}
                        {discount.discount_type === 'PERCENT'
                          ? ` (${discount.discount_value}% 할인)`
                          : ` (${Number(discount.discount_value ?? 0).toLocaleString()}원 할인)`}
                      </span>
                      <span className="font-medium text-blue-700">
                        -{Number(discount.applied_amount ?? 0).toLocaleString()}원
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 sm:mt-4 flex justify-between items-center border-t pt-2 sm:pt-3">
              <span className="text-sm sm:text-base font-semibold text-gray-800">최종 결제 금액</span>
              <span className="text-xl sm:text-2xl font-bold text-blue-600">
                {Number(pricingInfo.final_price ?? orderInfo.total_price ?? 0).toLocaleString()}원
              </span>
            </div>
          </div>
        )}

        {/* 배송 정보 카드 */}
        <div className="bg-white rounded-lg shadow-md p-5 sm:p-6 mb-5 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">배송 정보</h2>

          <div className="space-y-2 sm:space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">배송 주소</span>
              <span className="font-medium text-right">{orderInfo.delivery_address}</span>
            </div>
            {orderInfo.delivery_time_estimated && (
              <div className="flex justify-between">
                <span className="text-gray-600">예상 배송 시간</span>
                <span className="font-medium">
                  {new Date(orderInfo.delivery_time_estimated).toLocaleString('ko-KR')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 결제 정보 카드 */}
        {paymentInfo && (
          <div className="bg-white rounded-lg shadow-md p-5 sm:p-6 mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">결제 정보</h2>

            <div className="space-y-2 sm:space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">결제 수단</span>
                <span className="font-medium">신용카드</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">카드 번호</span>
                <span className="font-medium">{paymentInfo.masked_card_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">카드 소유자</span>
                <span className="font-medium">{paymentInfo.cardholder_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제 금액</span>
                <span className="font-medium">{paymentInfo.payment_amount?.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">거래 번호</span>
                <span className="font-medium text-xs sm:text-sm">{paymentInfo.transaction_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제 상태</span>
                <span className={`font-medium ${paymentStatusClass}`}>
                  {paymentStatusLabel}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 버튼 */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push('/orders')}
            className="flex-1 px-5 sm:px-6 py-2.5 sm:py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm sm:text-base"
          >
            주문 내역 보기
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm sm:text-base"
          >
            메인으로
          </button>
        </div>
      </div>
      </Section>
    </PageContainer>
  )
}
