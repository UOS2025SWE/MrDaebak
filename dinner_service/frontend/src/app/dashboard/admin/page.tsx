'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/hooks/useWebSocket'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'
import type { Staff, Ingredient, IngredientCategory } from '@/types/manage'
import type { WebSocketMessage } from '@/hooks/useWebSocket'

type TabType = 'accounting' | 'staff' | 'inventory'

interface AccountingStats {
  total_orders: number
  total_revenue: number
  total_customers: number
  average_order_amount: number
  popular_menus: Array<{
    menu_name: string
    order_count: number
    total_revenue: number
  }>
}

type IntakeHistoryItem = {
  intake_id: string
  staff_id: string | null
  staff_name: string | null
  staff_email: string | null
  intake_items: Array<{
    ingredient_code?: string
    quantity?: number
    unit?: string
  }>
  note: string | null
  status: string
  created_at: string | null
  approved_at: string | null
  approved_by: string | null
}

function AdminDashboardContent() {
  const { user, token } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('accounting')
  const [loading, setLoading] = useState(true)

  // 회계 데이터
  const [accountingStats, setAccountingStats] = useState<AccountingStats | null>(null)

  // 직원 관리 데이터
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [pendingStaff, setPendingStaff] = useState<Array<{
    staff_id: string
    email: string
    name: string
    phone_number: string
    created_at: string | null
    position: string | null
  }>>([])
  const [orderSummary, setOrderSummary] = useState<{
    cooking_orders: number
    delivering_orders: number
    updated_at: string
  } | null>(null)

  // 재고 관리 데이터
  const [categorizedIngredients, setCategorizedIngredients] = useState<{[key: string]: IngredientCategory}>({})
  
  // 입고 승인 대기 목록
  const [pendingIntakes, setPendingIntakes] = useState<Array<{
    intake_id: string
    staff_id: string
    staff_name: string
    intake_items: any
    note: string | null
    created_at: string | null
    status: string
  }>>([])
  const [intakeHistory, setIntakeHistory] = useState<IntakeHistoryItem[]>([])

  const fetchIntakeHistory = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch(`/api/ingredients/intake/history?limit=25`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setIntakeHistory((data.history || []).map((item: any) => ({
            intake_id: item.intake_id,
            staff_id: item.staff_id ?? null,
            staff_name: item.staff_name ?? null,
            staff_email: item.staff_email ?? null,
            intake_items: Array.isArray(item.intake_items) ? item.intake_items : [],
            note: item.note ?? null,
            status: item.status,
            created_at: item.created_at ?? null,
            approved_at: item.approved_at ?? null,
            approved_by: item.approved_by ?? null
          })))
        }
      }
    } catch (error) {
      console.error('입고 기록 조회 실패:', error)
    }
  }, [token])

  // WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    // 주문 관련 이벤트 발생 시 데이터 새로고침
    if (message.type === 'ORDER_CREATED' || message.type === 'ORDER_STATUS_CHANGED' || message.type === 'ORDER_UPDATED') {
      if (activeTab === 'staff') {
        fetchStaffData()
      } else if (activeTab === 'accounting') {
        fetchAccountingStats()
      }
    }
  }, [activeTab])

  // WebSocket 연결
  const { status: wsStatus, isConnected } = useWebSocket({
    token,
    onMessage: handleWebSocketMessage,
    showToasts: false,
    reconnect: true
  })

  useEffect(() => {
    if (token) {
      if (activeTab === 'accounting') {
        fetchAccountingStats()
      } else if (activeTab === 'staff') {
        fetchStaffData()
        fetchPendingStaff()
      } else if (activeTab === 'inventory') {
        fetchCategorizedIngredientsData()
        fetchPendingIntakes()
        fetchIntakeHistory()
      }
    }
  }, [token, activeTab, fetchIntakeHistory])

  const fetchAccountingStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/accounting/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAccountingStats(data.stats)
        }
      }
    } catch (error) {
      console.error('회계 데이터 조회 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStaffData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/staff/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setStaffList(data.data)
          if (data.order_summary) {
            setOrderSummary(data.order_summary)
          }
        }
      }
    } catch (error) {
      console.error('직원 데이터 조회 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingStaff = async () => {
    try {
      const response = await fetch('/api/staff/pending', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPendingStaff(data.staff || [])
        }
      }
    } catch (error) {
      console.error('포지션 미정 직원 조회 실패:', error)
    }
  }

  const handleAssignPosition = async (staffId: string, position: 'COOK' | 'DELIVERY' | 'REJECT') => {
    try {
      const response = await fetch(`/api/staff/${staffId}/assign-position`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ position })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(data.message || '포지션이 할당되었습니다')
        await fetchPendingStaff()
        await fetchStaffData()
      } else {
        alert(data.error || data.detail || '포지션 할당에 실패했습니다')
      }
    } catch (error) {
      console.error('포지션 할당 실패:', error)
      alert('포지션 할당 중 오류가 발생했습니다')
    }
  }

  const fetchCategorizedIngredientsData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/ingredients/categorized', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCategorizedIngredients(data.data)
        }
      }
    } catch (error) {
      console.error('재료 데이터 조회 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleStaffStatus = async (staffId: string) => {
    try {
      const response = await fetch(`/api/staff/${staffId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          fetchStaffData()
        } else {
          alert(`직원 상태 변경 실패: ${data.error}`)
        }
      }
    } catch (error) {
      console.error('직원 상태 변경 실패:', error)
      alert('직원 상태 변경 중 오류가 발생했습니다.')
    }
  }

  const handleBulkRestockCategory = async (categoryKey: string, categoryName: string) => {
    try {
      const response = await fetch(`/api/ingredients/bulk-restock-category/${categoryKey}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          alert(`${categoryName} 카테고리 일괄 재입고 완료: ${data.message}`)
          fetchCategorizedIngredientsData()
        } else {
          alert(`${categoryName} 카테고리 일괄 재입고 실패: ${data.error}`)
        }
      }
    } catch (error) {
      console.error('카테고리별 일괄 재입고 실패:', error)
      alert('카테고리별 일괄 재입고 중 오류가 발생했습니다.')
    }
  }

  // 입고 승인 대기 목록 조회
  const fetchPendingIntakes = useCallback(async () => {
    if (!token) return
    
    try {
      const response = await fetch('/api/ingredients/intake/pending', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPendingIntakes(data.intakes || [])
        }
      }
    } catch (error) {
      console.error('입고 승인 대기 목록 조회 실패:', error)
    }
  }, [token])

  // 입고 승인 처리
  const handleApproveIntake = async (intakeId: string) => {
    if (!confirm('이 입고 기록을 승인하시겠습니까?')) return
    
    try {
      const response = await fetch(`/api/ingredients/intake/${intakeId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        alert(data.message || '입고 기록이 승인되었습니다')
        await fetchPendingIntakes()
        await fetchCategorizedIngredientsData()
        await fetchIntakeHistory()
      } else {
        alert(data.error || data.detail || '입고 승인에 실패했습니다')
      }
    } catch (error) {
      console.error('입고 승인 실패:', error)
      alert('입고 승인 중 오류가 발생했습니다')
    }
  }

  const cookStaff = staffList.filter(staff => staff.type === 'cook')
  const deliveryStaff = staffList.filter(staff => staff.type === 'delivery')

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="dashboard" />

      <main className="w-full py-8">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1">
                  관리자 대시보드
                </h1>
                <p className="text-gray-600">시스템 전체 현황을 관리하세요</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">관리자</p>
                  <p className="text-sm font-semibold text-gray-800">{user?.name || user?.email}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-white rounded-2xl shadow-lg p-2 mb-6 border border-gray-100">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('accounting')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'accounting'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">💰</span>
                  <span>회계</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'staff'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">👥</span>
                  <span>직원 관리</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('inventory')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'inventory'
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">📦</span>
                  <span>재고 관리</span>
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {loading && (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-600">데이터를 불러오는 중...</p>
            </div>
          )}

          {!loading && activeTab === 'accounting' && (
            <div className="space-y-6">
              {/* 요약 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-md p-6 border border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">총 주문 수</h3>
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{accountingStats?.total_orders || 0}건</p>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border border-green-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">총 매출</h3>
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{(accountingStats?.total_revenue || 0).toLocaleString()}원</p>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">고객 수</h3>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{accountingStats?.total_customers || 0}명</p>
                </div>

                <div className="bg-white rounded-xl shadow-md p-6 border border-amber-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">평균 주문 금액</h3>
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{(accountingStats?.average_order_amount || 0).toLocaleString()}원</p>
                </div>
              </div>

              {/* 인기 메뉴 */}
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🏆</span>
                  인기 메뉴
                </h2>
                <div className="space-y-3">
                  {accountingStats?.popular_menus && accountingStats.popular_menus.length > 0 ? (
                    accountingStats.popular_menus.map((menu, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-200 text-gray-700' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{menu.menu_name}</h3>
                            <p className="text-sm text-gray-600">{menu.order_count}회 주문</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-purple-600">{menu.total_revenue.toLocaleString()}원</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 py-8">아직 주문 데이터가 없습니다</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'staff' && (
            <div className="space-y-6">
              {/* 포지션 미정 직원 할당 */}
              {pendingStaff.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-yellow-200">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">⚠️</span>
                    <h2 className="text-xl font-bold text-gray-800">포지션 미정 직원 ({pendingStaff.length}명)</h2>
                  </div>
                  <div className="space-y-3">
                    {pendingStaff.map((staff) => (
                      <div key={staff.staff_id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="font-bold text-gray-900">{staff.name}</h3>
                            <p className="text-sm text-gray-600">{staff.email}</p>
                            <p className="text-xs text-gray-500">{staff.phone_number}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAssignPosition(staff.staff_id, 'COOK')}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
                            >
                              요리사로 할당
                            </button>
                            <button
                              onClick={() => handleAssignPosition(staff.staff_id, 'DELIVERY')}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                            >
                              배달원으로 할당
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('정말 이 직원을 탈락시키겠습니까? 계정이 삭제됩니다.')) {
                                  handleAssignPosition(staff.staff_id, 'REJECT')
                                }
                              }}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                            >
                              탈락
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 주문 현황 요약 */}
              {orderSummary && (
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center justify-center gap-8">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🍳</span>
                      <div>
                        <p className="text-sm text-gray-600">조리중</p>
                        <p className="text-2xl font-bold text-amber-600">{orderSummary.cooking_orders}건</p>
                      </div>
                    </div>
                    <div className="w-px h-12 bg-gray-300"></div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🚚</span>
                      <div>
                        <p className="text-sm text-gray-600">배달중</p>
                        <p className="text-2xl font-bold text-blue-600">{orderSummary.delivering_orders}건</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 조리 직원 */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">👨‍🍳</span>
                    <h2 className="text-xl font-bold text-gray-800">조리 직원 현황</h2>
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                      {cookStaff.filter(s => s.status === 'free').length}/{cookStaff.length} 대기중
                    </span>
                  </div>

                  <div className="space-y-3">
                    {cookStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          staff.status === 'free'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-gray-900">{staff.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            staff.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {staff.status === 'free' ? '자유' : '조리중'}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 배달 직원 */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">🚚</span>
                    <h2 className="text-xl font-bold text-gray-800">배달 직원 현황</h2>
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {deliveryStaff.filter(s => s.status === 'free').length}/{deliveryStaff.length} 대기중
                    </span>
                  </div>

                  <div className="space-y-3">
                    {deliveryStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          staff.status === 'free'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-gray-900">{staff.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            staff.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {staff.status === 'free' ? '자유' : '배달중'}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'inventory' && (
            <div className="space-y-6">
              {/* 입고 승인 대기 목록 */}
              {pendingIntakes.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl shadow-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">⚠️</span>
                    <h2 className="text-xl font-bold text-gray-800">입고 승인 대기 ({pendingIntakes.length}건)</h2>
                  </div>
                  <div className="space-y-3">
                    {pendingIntakes.map((intake) => (
                      <div key={intake.intake_id} className="bg-white rounded-lg p-4 border border-yellow-300">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-gray-900">{intake.staff_name}</h3>
                            <p className="text-sm text-gray-600">
                              {intake.created_at ? new Date(intake.created_at).toLocaleString('ko-KR') : ''}
                            </p>
                            {intake.note && (
                              <p className="text-xs text-gray-500 mt-1">비고: {intake.note}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleApproveIntake(intake.intake_id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                          >
                            승인
                          </button>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-700 mb-2">입고 항목:</p>
                          <div className="space-y-1">
                            {Array.isArray(intake.intake_items) && intake.intake_items.map((item: any, idx: number) => (
                              <p key={idx} className="text-xs text-gray-600">
                                • {item.ingredient_code}: {item.quantity}개
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🗒️</span>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">최근 입고 기록</h2>
                    <p className="text-sm text-gray-500">최근 승인 및 대기 내역을 확인하세요</p>
                  </div>
                  <button
                    onClick={() => fetchIntakeHistory()}
                    className="ml-auto px-3 py-1 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                  >
                    새로고침
                  </button>
                </div>

                {intakeHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">입고 기록이 아직 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {intakeHistory.map((entry) => (
                      <div key={entry.intake_id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {entry.staff_name || '알 수 없는 직원'}
                              {entry.staff_email && (
                                <span className="ml-2 text-xs text-gray-500">{entry.staff_email}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {entry.created_at ? new Date(entry.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                            </p>
                            {entry.note && (
                              <p className="text-xs text-gray-600 mt-1">비고: {entry.note}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              entry.status === 'APPROVED'
                                ? 'bg-green-100 text-green-700'
                                : entry.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {entry.status === 'APPROVED' ? '승인 완료' :
                               entry.status === 'PENDING' ? '승인 대기' :
                               entry.status}
                            </span>
                            {entry.approved_at && (
                              <p className="text-xs text-gray-500 mt-1">
                                승인: {new Date(entry.approved_at).toLocaleString('ko-KR')}
                                {entry.approved_by && ` · ${entry.approved_by}`}
                              </p>
                            )}
                          </div>
                        </div>

                        {Array.isArray(entry.intake_items) && entry.intake_items.length > 0 && (
                          <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                            <p className="text-xs font-semibold text-gray-700 mb-2">입고 항목</p>
                            <div className="space-y-1">
                              {entry.intake_items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-gray-600">
                                  <span>{item.ingredient_code || '미정 재료'}</span>
                                  <span className="font-medium">
                                    {item.quantity ?? '-'}
                                    {item.unit ? ` ${item.unit}` : '개'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {Object.entries(categorizedIngredients).map(([categoryKey, category]) => {
                const typedCategory = category as IngredientCategory
                return (
                  <div key={categoryKey} className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="text-2xl">
                        {categoryKey === 'alcohol' ? '🍷' :
                         categoryKey === 'ingredients' ? '🥘' :
                         categoryKey === 'supplies' ? '🍽️' : '📦'}
                      </span>
                      <div>
                        <h2 className="text-xl font-bold text-gray-800">{typedCategory.name}</h2>
                        <p className="text-sm text-gray-600">{typedCategory.description}</p>
                      </div>
                      <div className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${
                        typedCategory.restock_frequency === 'daily'
                          ? 'bg-green-100 text-green-800'
                          : typedCategory.restock_frequency === 'twice_weekly'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {typedCategory.restock_frequency === 'daily' ? '매일 추가 가능' :
                         typedCategory.restock_frequency === 'twice_weekly' ? '주 2회 추가' :
                         '필요시 추가'}
                      </div>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                      {typedCategory.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{item.korean_name || item.name}</h4>
                            <p className="text-sm text-gray-600">{item.currentStock} {item.korean_unit || item.unit}</p>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.currentStock <= item.minimumStock
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {item.currentStock <= item.minimumStock ? '부족' : '충분'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleBulkRestockCategory(categoryKey, typedCategory.name)}
                      className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                        categoryKey === 'alcohol'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {categoryKey === 'alcohol' ? '주류 일괄 추가' :
                       categoryKey === 'ingredients' ? '재료 일괄 추가' :
                       categoryKey === 'supplies' ? '용품 일괄 추가' :
                       `${typedCategory.name} 일괄 추가`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedTypes={['MANAGER']}>
      <AdminDashboardContent />
    </ProtectedRoute>
  )
}
