'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { Staff, Ingredient, IngredientCategory, User } from '@/types/manage'

export default function ManagePage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [categorizedIngredients, setCategorizedIngredients] = useState<{[key: string]: IngredientCategory}>({})
  const [loading, setLoading] = useState(true)
  const [orderSummary, setOrderSummary] = useState<{
    cooking_orders: number
    delivering_orders: number
    updated_at: string
  } | null>(null)

  // 권한 확인 - 관리자만 접근 가능 (리다이렉트 없음)
  useEffect(() => {
    console.log('ManagePage Auth Check:', { isAuthenticated, user })
    
    if (isAuthenticated && user) {
      // role이 admin이거나 is_admin이 true인 경우 접근 허용
      const hasAdminAccess = user.role === 'admin' || (user as User).is_admin === true
      console.log('Admin access check:', { role: user.role, is_admin: (user as User).is_admin, hasAdminAccess })
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (isAuthenticated && user) {
      const hasAdminAccess = user.role === 'admin' || (user as User).is_admin === true
      if (hasAdminAccess) {
        fetchStaffData()
        fetchCategorizedIngredientsData()
        
        // 10초마다 직원 상태 자동 갱신
        const interval = setInterval(() => {
          fetchStaffData()
        }, 10000) // 10초
        
        return () => clearInterval(interval)
      } else {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  const fetchStaffData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        console.log('No token found, skipping API call')
        setLoading(false)
        return
      }

      const response = await fetch('/api/staff/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setStaffList(data.data)
          // 주문 요약 정보도 함께 저장
          if (data.order_summary) {
            setOrderSummary(data.order_summary)
          }
        } else {
          console.error('직원 데이터 조회 실패:', data.error)
        }
      } else {
        console.error('직원 데이터 조회 실패:', response.statusText)
      }
    } catch (error) {
      console.error('직원 데이터 조회 실패:', error)
    }
  }

  const fetchCategorizedIngredientsData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        console.log('No token found, skipping API call')
        setLoading(false)
        return
      }

      const response = await fetch('/api/admin/ingredients/categorized', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCategorizedIngredients(data.data)
          // Also set the flat ingredients list for backward compatibility
          const allIngredients: Ingredient[] = []
          Object.values(data.data).forEach((category) => {
            const typedCategory = category as IngredientCategory
            allIngredients.push(...typedCategory.items)
          })
          setIngredients(allIngredients)
        } else {
          console.error('카테고리별 재료 데이터 조회 실패:', data.error)
        }
      } else {
        console.error('카테고리별 재료 데이터 조회 실패:', response.statusText)
      }
    } catch (error) {
      console.error('카테고리별 재료 데이터 조회 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddStock = async (ingredientId: number, quantity: number) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        console.log('No token found, skipping API call')
        return
      }

      const response = await fetch('/api/admin/ingredients/add-stock', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          ingredientId: ingredientId,
          quantity: quantity 
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          alert(`재료 재고 추가 완료: ${data.message}`)
          fetchCategorizedIngredientsData() // 재료 데이터 새로고침
        } else {
          alert(`재료 재고 추가 실패: ${data.error}`)
        }
      } else {
        alert('재료 재고 추가 실패')
      }
    } catch (error) {
      console.error('재료 재고 추가 실패:', error)
      alert('재료 재고 추가 중 오류가 발생했습니다.')
    }
  }

  const handleBulkRestockCategory = async (categoryKey: string, categoryName: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        console.log('No token found, skipping API call')
        return
      }

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
          fetchCategorizedIngredientsData() // 재료 데이터 새로고침
        } else {
          alert(`${categoryName} 카테고리 일괄 재입고 실패: ${data.error}`)
        }
      } else {
        alert(`${categoryName} 카테고리 일괄 재입고 실패`)
      }
    } catch (error) {
      console.error('카테고리별 일괄 재입고 실패:', error)
      alert('카테고리별 일괄 재입고 중 오류가 발생했습니다.')
    }
  }

  const toggleStaffStatus = async (staffId: number) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        console.log('No token found, skipping API call')
        return
      }

      const response = await fetch(`/api/staff/${staffId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          fetchStaffData() // 직원 데이터 새로고침
        } else {
          alert(`직원 상태 변경 실패: ${data.error}`)
        }
      } else {
        alert('직원 상태 변경 실패')
      }
    } catch (error) {
      console.error('직원 상태 변경 실패:', error)
      alert('직원 상태 변경 중 오류가 발생했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">관리 페이지를 불러오는 중...</div>
      </div>
    )
  }

  const cookStaff = staffList.filter(staff => staff.type === 'cook')
  const deliveryStaff = staffList.filter(staff => staff.type === 'delivery')

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50">
      {/* Header Navigation */}
      <Header currentPage="manage" />

      {/* Main Content */}
      <main className="w-full py-20">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-6">
              직원 관리 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">대시보드</span>
            </h1>
            <p className="text-xl text-stone-600">
              실시간 직원 현황 및 재료 관리 시스템
            </p>
            
            {/* 주문 현황 요약 */}
            {orderSummary && (
              <div className="mt-6 inline-flex items-center gap-6 bg-white px-6 py-3 rounded-full shadow-md border border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🍳</span>
                  <span className="text-sm font-medium text-stone-700">조리중:</span>
                  <span className="text-lg font-bold text-amber-600">{orderSummary.cooking_orders}건</span>
                </div>
                <div className="w-px h-6 bg-gray-300"></div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚚</span>
                  <span className="text-sm font-medium text-stone-700">배달중:</span>
                  <span className="text-lg font-bold text-blue-600">{orderSummary.delivering_orders}건</span>
                </div>
                <div className="w-px h-6 bg-gray-300"></div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔄</span>
                  <span className="text-xs text-stone-500">실시간 자동 갱신</span>
                </div>
              </div>
            )}
          </div>

          {/* 2컬럼 레이아웃 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 왼쪽: 직원 관리 (2/3 너비) */}
            <div className="lg:col-span-2 space-y-8">
              {/* 조리 직원 섹션 */}
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-amber-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">👨‍🍳</span>
                  <h2 className="text-2xl font-bold text-stone-900">조리 직원 현황</h2>
                  <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                    {cookStaff.filter(s => s.status === 'free').length}/{cookStaff.length} 대기중
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cookStaff.map((staff) => (
                    <div 
                      key={staff.id}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
                        staff.status === 'free' 
                          ? 'bg-green-50 border-green-200 hover:border-green-300' 
                          : 'bg-red-50 border-red-200 hover:border-red-300'
                      }`}
                      onClick={() => toggleStaffStatus(staff.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-stone-900">{staff.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          staff.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {staff.status === 'free' ? '자유' : '조리중'}
                        </span>
                      </div>
                      {staff.currentTask && (
                        <p className="text-sm text-stone-600">{staff.currentTask}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 배달 직원 섹션 */}
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-amber-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">🚚</span>
                  <h2 className="text-2xl font-bold text-stone-900">배달 직원 현황</h2>
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    {deliveryStaff.filter(s => s.status === 'free').length}/{deliveryStaff.length} 대기중
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {deliveryStaff.map((staff) => (
                    <div 
                      key={staff.id}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
                        staff.status === 'free' 
                          ? 'bg-green-50 border-green-200 hover:border-green-300' 
                          : 'bg-blue-50 border-blue-200 hover:border-blue-300'
                      }`}
                      onClick={() => toggleStaffStatus(staff.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-stone-900">{staff.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          staff.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {staff.status === 'free' ? '자유' : '배달중'}
                        </span>
                      </div>
                      {staff.currentTask && (
                        <p className="text-sm text-stone-600">{staff.currentTask}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 오른쪽: 재료 현황판 (1/3 너비) */}
            <div className="space-y-6">

              {/* 카테고리별 재료 관리 */}
              {Object.entries(categorizedIngredients).map(([categoryKey, category]) => {
                const typedCategory = category as IngredientCategory;
                return (
                <div key={categoryKey} className="bg-white rounded-2xl shadow-xl p-6 border border-amber-100">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">
                      {categoryKey === 'alcohol' ? '🍷' : 
                       categoryKey === 'ingredients' ? '🥘' : 
                       categoryKey === 'supplies' ? '🍽️' : '📦'}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold text-stone-900">{typedCategory.name}</h2>
                      <p className="text-sm text-stone-600">{typedCategory.description}</p>
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

                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {typedCategory.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-stone-900">{item.korean_name || item.name}</h4>
                          <p className="text-sm text-stone-600">{item.currentStock} {item.korean_unit || item.unit}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.currentStock <= item.minimumStock 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {item.currentStock <= item.minimumStock ? '부족' : '충분'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 카테고리별 재입고 버튼 */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        // Bulk restock for this entire category (all items regardless of stock)
                        handleBulkRestockCategory(categoryKey, typedCategory.name);
                      }}
                      className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                        categoryKey === 'alcohol' 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      }`}
                    >
                      {categoryKey === 'alcohol' ? '주류 일괄 추가' : 
                       categoryKey === 'ingredients' ? '재료 일괄 추가' : 
                       categoryKey === 'supplies' ? '용품 일괄 추가' : 
                       `${typedCategory.name} 일괄 추가`}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}