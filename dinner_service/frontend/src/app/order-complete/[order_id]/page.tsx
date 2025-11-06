/**
 * FR-012/FR-013: 주문 완료 페이지
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'

export default function OrderCompletePage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params?.order_id as string

  const [orderInfo, setOrderInfo] = useState<any>(null)
  const [paymentInfo, setPaymentInfo] = useState<any>(null)
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
      <>
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">주문 정보를 불러오는 중...</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!orderInfo) {
    return null
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* 성공 아이콘 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">주문이 완료되었습니다!</h1>
          <p className="text-gray-600">주문번호: <span className="font-bold text-blue-600">{orderInfo.order_number}</span></p>
        </div>

        {/* 주문 정보 카드 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">주문 정보</h2>

          <div className="space-y-3">
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
              <span className="font-bold text-lg text-blue-600">
                {orderInfo.total_price?.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {/* 배송 정보 카드 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">배송 정보</h2>

          <div className="space-y-3">
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
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">결제 정보</h2>

            <div className="space-y-3">
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
                <span className="font-medium text-sm">{paymentInfo.transaction_id}</span>
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
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/orders')}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            주문 내역 보기
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            메인으로
          </button>
        </div>
      </div>
      </div>
      <Footer />
    </>
  )
}
