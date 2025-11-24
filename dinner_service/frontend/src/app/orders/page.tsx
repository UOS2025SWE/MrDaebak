'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import OrderStatusBadge from '@/components/orders/OrderStatusBadge'
import { Card } from '@/components/layout/Card'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/hooks/useWebSocket'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { Order } from '@/types/orders'
import { INGREDIENT_DISPLAY_NAMES, MENU_INGREDIENTS } from '@/utils/ingredients'

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
  useWebSocket({
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
            <Card className="text-center" padded>
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
            </Card>
          ) : (
            <div className="space-y-6">
                    {orders.map((order: Order) => (
                <Card key={order.id} className="overflow-hidden hover:shadow-2xl transition-all" padded={false}>
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
                        <OrderStatusBadge status={order.status} />
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
                </Card>
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
                    <OrderStatusBadge status={selectedOrder.status} />
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
                    const baseIngredients = MENU_INGREDIENTS[menuCode]?.[style] || {}
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
                            {INGREDIENT_DISPLAY_NAMES[ingredient] || ingredient}
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

              {selectedOrder.cake_customization && (
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-5">
                  <h3 className="text-lg font-bold text-pink-800 mb-3">🎂 커스터마이징 케이크</h3>
                  <div className="space-y-2 text-sm text-pink-900">
                    {selectedOrder.cake_customization.message && (
                      <div>
                        <span className="font-medium text-pink-900">메시지: </span>
                        {selectedOrder.cake_customization.message}
                      </div>
                    )}
                    {selectedOrder.cake_customization.flavor && (
                      <div>
                        <span className="font-medium text-pink-900">맛: </span>
                        {selectedOrder.cake_customization.flavor}
                      </div>
                    )}
                    {selectedOrder.cake_customization.size && (
                      <div>
                        <span className="font-medium text-pink-900">사이즈: </span>
                        {selectedOrder.cake_customization.size}
                      </div>
                    )}
                    {selectedOrder.cake_customization.status && (
                      <div className="text-xs text-pink-600">
                        상태: {selectedOrder.cake_customization.status === 'REQUESTED' ? '요청됨' : selectedOrder.cake_customization.status}
                      </div>
                    )}
                    {selectedOrder.cake_customization.image_path ? (
                      <a
                        href={selectedOrder.cake_customization.image_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-pink-600 underline"
                      >
                        참고 이미지 보기
                      </a>
                    ) : (
                      <p className="text-xs text-pink-700">
                        참고 이미지가 등록되지 않았습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}

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