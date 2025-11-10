'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/hooks/useWebSocket'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { Order } from '@/types/orders'

// 재료 한글 이름 매핑
const ingredientNames: { [key: string]: string } = {
  // Valentine 디너 구성품
  heart_plate: '하트 모양 접시',
  cupid_decoration: '큐피드 장식',
  napkin: '냅킨',
  wine: '와인',
  premium_steak: '프리미엄 스테이크',
  // French 디너 구성품
  coffee: '커피',
  fresh_salad: '신선한 샐러드',
  // English 디너 구성품
  scrambled_eggs: '에그 스크램블',
  bacon: '베이컨',
  bread: '빵',
  // Champagne 디너 구성품
  champagne_bottle: '샴페인',
  baguette: '바게트빵',
  coffee_pot: '커피 포트'
}

// 메뉴별/스타일별 기본 재료 수량 매핑
const menuIngredients: Record<string, Record<string, Record<string, number>>> = {
  valentine: {
    simple: { heart_plate: 1, cupid_decoration: 1, napkin: 1, wine: 1, premium_steak: 1 },
    grand: { heart_plate: 1, cupid_decoration: 2, napkin: 1, wine: 1, premium_steak: 1 },
    deluxe: { heart_plate: 1, cupid_decoration: 3, napkin: 2, wine: 1, premium_steak: 1 }
  },
  french: {
    simple: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    grand: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    deluxe: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 }
  },
  english: {
    simple: { scrambled_eggs: 1, bacon: 2, bread: 1, premium_steak: 1 },
    grand: { scrambled_eggs: 2, bacon: 3, bread: 1, premium_steak: 1 },
    deluxe: { scrambled_eggs: 2, bacon: 4, bread: 2, premium_steak: 1 }
  },
  champagne: {
    grand: { champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 },
    deluxe: { champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 }
  }
}

export default function OrdersPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated && user?.user_type === 'STAFF') {
      router.replace('/dashboard/staff')
    } else if (isAuthenticated && user?.user_type === 'MANAGER') {
      router.replace('/dashboard/admin')
    }
  }, [authLoading, isAuthenticated, router, user])

  // 주문 목록 불러오기 함수 (useCallback으로 분리하여 WebSocket 핸들러에서도 사용)
  const fetchOrders = useCallback(async () => {
    // AuthContext가 로딩 중이면 기다림
    if (authLoading) {
      return
    }

    if (!isAuthenticated || !user?.id) {
      router.push('/login')
      return
    }

    if (user.user_type === 'STAFF' || user.user_type === 'MANAGER') {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        router.push('/login')
        return
      }

      const response = await fetch(`/api/orders/user/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setOrders(data.orders)
        } else {
          setError(data.error || '주문 내역을 불러오는데 실패했습니다.')
        }
      } else if (response.status === 401) {
        // 인증 실패시 로그인 페이지로 이동
        localStorage.removeItem('auth_token')
        router.push('/login')
        return
      } else {
        setError('주문 내역을 불러오는데 실패했습니다.')
      }

    } catch (err) {
      console.error('주문 내역 조회 실패:', err)
      setError('주문 내역을 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authLoading, isAuthenticated, user, router])

  // WebSocket 연결 및 실시간 업데이트
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  const { status: wsStatus, lastMessage } = useWebSocket({
    token,
    showToasts: true,
    reconnect: true,
    onMessage: (message) => {
      if (message.type === 'ORDER_CREATED' || message.type === 'ORDER_STATUS_CHANGED') {
        fetchOrders()
      }
    }
  })

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return 'bg-blue-100 text-blue-800'
      case 'PREPARING':
        return 'bg-yellow-100 text-yellow-800'
      case 'DELIVERING':
        return 'bg-purple-100 text-purple-800'
      case 'COMPLETED':
        return 'bg-green-100 text-green-800'
      case 'CANCELLED':
        return 'bg-red-100 text-red-800'
      case 'PAYMENT_FAILED':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return '📋'
      case 'PREPARING':
        return '👨‍🍳'
      case 'DELIVERING':
        return '🚗'
      case 'COMPLETED':
        return '✅'
      case 'CANCELLED':
        return '❌'
      case 'PAYMENT_FAILED':
        return '💳'
      default:
        return '📦'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return '주문접수'
      case 'PREPARING':
        return '조리중'
      case 'DELIVERING':
        return '배달중'
      case 'COMPLETED':
        return '배달완료'
      case 'CANCELLED':
        return '취소'
      case 'PAYMENT_FAILED':
        return '결제실패'
      default:
        return '알 수 없음'
    }
  }


  // 주문 상세 모달 열기
  const handleShowDetail = (order: Order) => {
    setSelectedOrder(order)
    setShowDetailModal(true)
  }

  // 주문 상세 모달에서 재주문
  const handleReorderFromModal = (order: Order) => {
    const params = new URLSearchParams({
      menu: order.menu_code || '',
      style: order.style,
      quantity: order.quantity.toString()
    })

    if (order.customizations) {
      params.append('customizations', JSON.stringify(order.customizations))
    }

    router.push(`/checkout?${params.toString()}`)
  }

  // 주문 취소 핸들러
  const handleCancelOrder = async (order: Order) => {
    if (!confirm('정말 주문을 취소하시겠습니까?')) {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        alert('로그인이 필요합니다.')
        router.push('/login')
        return
      }

      const response = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSuccessMessage(data.message || '주문이 취소되었습니다. 환불 처리가 완료되었습니다.')
        setError(null)
        await fetchOrders() // 주문 목록 새로고침
      } else {
        setError(data.detail || data.message || '주문 취소에 실패했습니다.')
        setSuccessMessage(null)
      }
    } catch (err) {
      console.error('주문 취소 실패:', err)
      setError('주문 취소 중 오류가 발생했습니다.')
      setSuccessMessage(null)
    }
  }

  // AuthContext 로딩 중이거나 주문 내역 로딩 중일 때
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">
          {authLoading ? "인증 정보 확인 중..." : "주문내역을 불러오는 중..."}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-xl">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50">
      <Header currentPage="orders" />

      <main className="w-full py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              주문 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">내역</span>
            </h1>
            <p className="text-xl text-stone-600">
              나의 주문 현황을 확인하세요
            </p>
          </div>

          {/* 성공/에러 메시지 표시 */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-700 font-medium">{successMessage}</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <div className="text-6xl mb-4">🍽️</div>
              <h2 className="text-2xl font-bold text-stone-900 mb-4">주문 내역이 없습니다</h2>
              <p className="text-stone-600 mb-8">
                맛있는 디너를 주문해보세요!
              </p>
              <button
                onClick={() => router.push('/menu')}
                className="px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                메뉴 보러가기
              </button>
            </div>
          ) : (
            <div className="space-y-6">
                    {orders.map((order: Order) => (
                <div key={order.id} className="bg-white rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all">
                  <div className="p-6">
                    {/* 주문 헤더 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-4 border-b border-stone-200">
                      <div>
                        <h3 className="text-xl font-bold text-stone-900 mb-1">
                          {order.order_number}
                        </h3>
                        <p className="text-stone-600">
                          {order.order_date}
                        </p>
                      </div>
                      <div className="flex items-center space-x-3 mt-3 sm:mt-0">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)} {getStatusText(order.status)}
                        </span>
                        {(order.status === 'PREPARING' || order.status === 'DELIVERING') && order.estimated_time_minutes > 0 && (
                          <span className="text-sm text-amber-600 font-semibold">
                            약 {order.estimated_time_minutes}분 남음
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 주문 내용 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-bold text-stone-900 mb-1">
                          {order.menu_name} ({order.style})
                        </h4>
                        <p className="text-stone-600">
                          수량: {order.quantity}개
                        </p>
                      </div>
                      <div className="text-right mt-4 sm:mt-0">
                        <div className="text-2xl font-bold text-amber-600 mb-2">
                          {order.total_price.toLocaleString()}원
                        </div>
                        <div className="space-x-2">
                          <button
                            onClick={() => handleShowDetail(order)}
                            className="px-4 py-2 bg-stone-600 hover:bg-stone-700 text-white font-semibold text-sm rounded-lg transition-colors"
                          >
                            주문 상세
                          </button>
                          {order.status === 'RECEIVED' && (
                            <button
                              onClick={() => handleCancelOrder(order)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg transition-colors"
                            >
                              주문 취소
                            </button>
                          )}
                          {order.status === 'COMPLETED' && (
                            <button
                              onClick={() => handleReorderFromModal(order)}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg transition-colors"
                            >
                              재주문
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* 더 많은 주문 보기 버튼 */}
              <div className="text-center pt-8">
                <button className="px-8 py-4 bg-stone-600 hover:bg-stone-700 text-white font-bold rounded-xl transition-colors">
                  더 많은 주문 보기
                </button>
              </div>
            </div>
          )}

          {/* 새 주문하기 버튼 */}
          <div className="text-center mt-12">
            <button
              onClick={() => router.push('/menu')}
              className="px-12 py-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xl rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              새 주문하기
            </button>
          </div>
        </div>
      </main>

      <Footer />

      {/* 주문 상세 모달 */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-stone-900">주문 상세</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-6">
              {/* 주문 정보 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-stone-900 mb-3">주문 정보</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-stone-600">주문번호</span>
                    <span className="font-semibold text-stone-900">{selectedOrder.order_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">주문일시</span>
                    <span className="font-semibold text-stone-900">{selectedOrder.order_date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600">주문상태</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedOrder.status)}`}>
                      {getStatusIcon(selectedOrder.status)} {getStatusText(selectedOrder.status)}
                    </span>
                  </div>
                  {(selectedOrder.status === 'PREPARING' || selectedOrder.status === 'DELIVERING') && selectedOrder.estimated_time_minutes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-stone-600">예상 시간</span>
                      <span className="font-semibold text-amber-600">약 {selectedOrder.estimated_time_minutes}분 남음</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 메뉴 정보 */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-stone-900 mb-3">메뉴 정보</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-stone-600 text-sm">디너</span>
                    <p className="text-xl font-bold text-stone-900">{selectedOrder.menu_name}</p>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">스타일</span>
                    <span className="font-semibold text-stone-900 capitalize">{selectedOrder.style}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">수량</span>
                    <span className="font-semibold text-stone-900">{selectedOrder.quantity}개</span>
                  </div>
                </div>
              </div>

              {/* 재료 구성 정보 */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-stone-900 mb-3">🍽️ 재료 구성</h3>
                <div className="space-y-2">
                  {(() => {
                    const menuCode = selectedOrder.menu_code || ''
                    const style = selectedOrder.style
                    const baseIngredients = menuIngredients[menuCode]?.[style] || {}
                    const customizations = selectedOrder.customizations || {}

                    // 기본 재료 + 커스터마이징 재료 합치기
                    const allIngredients = new Set([
                      ...Object.keys(baseIngredients),
                      ...Object.keys(customizations)
                    ])

                    return Array.from(allIngredients).map((ingredient) => {
                      const baseQty = baseIngredients[ingredient] || 0
                      const customQty = customizations[ingredient]
                      const finalQty = customQty !== undefined ? Number(customQty) : baseQty
                      const isChanged = customQty !== undefined && baseQty !== finalQty

                      return (
                        <div key={ingredient} className="flex justify-between items-center text-sm">
                          <span className="text-stone-700 font-medium">
                            {ingredientNames[ingredient] || ingredient}
                          </span>
                          <div className="flex items-center gap-2">
                            {isChanged ? (
                              <>
                                <span className="text-gray-400 line-through">{baseQty}개</span>
                                <span className="text-blue-600 font-bold">{finalQty}개</span>
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                  {finalQty - baseQty > 0 ? `+${finalQty - baseQty}` : finalQty - baseQty}
                                </span>
                              </>
                            ) : (
                              <span className="text-stone-900 font-semibold">{finalQty}개</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* 가격 정보 */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-stone-900 mb-3">결제 정보</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-lg">
                    <span className="text-stone-600">총 결제 금액</span>
                    <span className="font-bold text-amber-600 text-2xl">{selectedOrder.total_price.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 모달 푸터 (버튼) */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full px-6 py-3 bg-gradient-to-r from-stone-600 to-stone-700 hover:from-stone-700 hover:to-stone-800 text-white font-semibold rounded-lg transition-all"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}