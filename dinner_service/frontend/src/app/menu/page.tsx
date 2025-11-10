'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { MenuItem, MenuStyle } from '@/types/menu'
import type { DiscountInfo, RecentOrder } from '@/types/common'

// 재료 한글 이름 매핑 (order 페이지와 동일)
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

// 스타일별 세부 정보
const styleDetails = {
  '심플': {
    description: '플라스틱 접시와 플라스틱 컵, 종이 냅킨이 플라스틱 쟁반에 제공',
    wineGlass: '와인 포함 시 플라스틱 잔 제공'
  },
  '그랜드': {
    description: '도자기 접시와 도자기 컵, 흰색 면 냅킨이 나무 쟁반에 제공',
    wineGlass: '와인 포함 시 플라스틱 잔 제공'
  },
  '디럭스': {
    description: '꽃들이 있는 작은 꽃병, 도자기 접시와 도자기 컵, 린넨 냅킨이 나무 쟁반에 제공',
    wineGlass: '와인 포함 시 유리 잔 제공'
  }
}

// 메뉴별/스타일별 기본 재료 수량 매핑 (order 페이지와 동일 - 영문 스타일명 사용)
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

export default function MenuPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null)
  const [recentOrder, setRecentOrder] = useState<RecentOrder | null>(null)

  // 직원 및 매니저는 메뉴 페이지 접근 불가
  useEffect(() => {
    if (user && (user.user_type === 'STAFF' || user.user_type === 'MANAGER')) {
      router.push('/dashboard/staff')
      return
    }
  }, [user, router])

  useEffect(() => {
    // 직원/매니저가 아닌 경우에만 메뉴 데이터 로드
    if (user && (user.user_type === 'STAFF' || user.user_type === 'MANAGER')) {
      return
    }
    
    fetchMenuData()
    if (isAuthenticated && user?.id && user?.user_type === 'CUSTOMER') {
      fetchDiscountInfo()
      fetchRecentOrder()
    }
  }, [isAuthenticated, user])

  const fetchMenuData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/menu/')
      const result = await response.json()
      
      if (result.success) {
        setMenuItems(result.data)
      } else {
        setError('메뉴를 불러올 수 없습니다.')
      }
    } catch (err) {
      setError('서버 연결에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchDiscountInfo = async () => {
    if (!user?.id) return

    try {
      const response = await fetch(`/api/discount/${user.id}`)
      const result = await response.json()

      if (result.success) {
        setDiscountInfo(result.data)
      }
    } catch (err) {
      console.error('할인 정보를 불러오는데 실패했습니다:', err)
    }
  }

  const fetchRecentOrder = async () => {
    if (!user?.id) return

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const response = await fetch(`/api/orders/user/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.orders && data.orders.length > 0) {
          const mostRecent = data.orders[0]
          setRecentOrder({
            id: mostRecent.id,
            order_number: mostRecent.order_number,
            menu_name: mostRecent.menu_name,
            menu_code: mostRecent.menu_code,
            style: mostRecent.style,
            quantity: mostRecent.quantity,
            total_price: mostRecent.total_price,
            order_date: mostRecent.order_date || mostRecent.created_at,
            customizations: mostRecent.customizations
          })
        }
      }
    } catch (err) {
      console.error('최근 주문 조회 실패:', err)
    }
  }

  const handleReorder = () => {
    if (!recentOrder || !recentOrder.menu_code) return

    // 최근 주문 정보를 checkout 페이지로 전달
    const params = new URLSearchParams({
      menu: recentOrder.menu_code,  // checkout 페이지는 'menu' 파라미터를 기대함
      style: recentOrder.style,
      quantity: recentOrder.quantity.toString()
    })

    // 커스터마이징 정보가 있으면 추가
    if (recentOrder.customizations) {
      params.append('customizations', JSON.stringify(recentOrder.customizations))
    }

    router.push(`/checkout?${params.toString()}`)
  }

  const getStyleKoreanName = (style: string) => {
    const styleMap: {[key: string]: string} = {
      'simple': '심플',
      'grand': '그랜드',
      'deluxe': '디럭스'
    }
    return styleMap[style] || style
  }

  const handleOrder = (menu: MenuItem, style: MenuStyle) => {
    // order 페이지로 라우팅하면서 주문 정보 전달
    const params = new URLSearchParams({
      menuId: menu.id.toString(),
      menuCode: menu.code,
      menuName: menu.name,
      styleName: style.name,
      stylePrice: style.price.toString(),
      basePrice: menu.base_price.toString(), // 메뉴의 기본 가격 추가
      cookingTime: style.cooking_time.toString(),
      description: menu.description,
      imageUrl: menu.image_url
    })
    
    router.push(`/order?${params.toString()}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">메뉴를 불러오는 중...</div>
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
      {/* Header Navigation */}
      <Header currentPage="menu" />

      {/* Main Content - Constrained width */}
      <main className="w-full py-20">
        <div className="max-w-[1400px] mx-auto px-6">
          {/* Title Section - 컴팩트하게 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold text-stone-900 mb-3">
              프리미엄 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">디너 메뉴</span>
            </h1>
            <p className="text-lg text-stone-600">
              최고급 재료로 만든 특별한 디너를 집에서 편안하게 즐기세요
            </p>
          </div>

          {/* Main Layout - 사이드바 구조 (컴팩트 사이드바) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
            {/* Left: Menu Grid (주요 콘텐츠) */}
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {menuItems.map((menu) => (
                  <div key={menu.id} className="bg-white rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all transform hover:-translate-y-1 border border-amber-100">
                    {/* Menu Image */}
                    <div className="w-full h-48 bg-gradient-to-br from-amber-50 to-stone-100 overflow-hidden">
                      <img
                        src={`/images/${menu.code === 'champagne' ? 'champagne-feast-dinner' : menu.code + '-dinner'}.jpg`}
                        alt={`${menu.name} 이미지`}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>

                    {/* Menu Info */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-stone-900 mb-2">{menu.name}</h3>
                      <p className="text-stone-600 mb-4 text-sm leading-relaxed">{menu.description} (배달시간 20분)</p>

                      {/* Styles */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-stone-800 text-sm mb-2">스타일 선택:</h4>
                        {menu.styles.map((style) => (
                          <div key={style.name} className="relative group flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-stone-50 rounded-xl border border-amber-100 hover:shadow-md transition-all hover:border-amber-200">
                            <div className="flex-1">
                              <div className="font-semibold text-stone-900 relative">
                                {style.name}
                                {/* 툴팁 */}
                                <div className="absolute left-14 top-0 w-64 bg-stone-800 text-white p-2.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                                  <div className="text-xs font-medium mb-1">{style.name} 스타일</div>
                                  <div className="text-xs text-stone-200 mb-1">
                                    {styleDetails[style.name as keyof typeof styleDetails]?.description}
                                  </div>
                                  <div className="text-xs text-amber-300">
                                    {styleDetails[style.name as keyof typeof styleDetails]?.wineGlass}
                                  </div>
                                  <div className="absolute -left-2 top-3 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-stone-800"></div>
                                </div>
                              </div>
                              <div className="text-xs text-stone-600 mt-0.5">
                                조리 {style.cooking_time}분 · 총 {style.cooking_time + 20}분
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                {discountInfo?.eligible ? (
                                  <>
                                    <div className="text-xs text-stone-500 line-through">{style.price.toLocaleString()}원</div>
                                    <div className="text-lg font-bold text-red-600">
                                      {Math.round(style.price * (1 - discountInfo.discount_rate)).toLocaleString()}원
                                    </div>
                                    <div className="text-xs text-red-500 font-medium">
                                      {Math.round(discountInfo.discount_rate * 100)}% 할인
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-lg font-bold bg-gradient-to-r from-amber-600 to-amber-800 text-transparent bg-clip-text">{style.price.toLocaleString()}원</div>
                                )}
                              </div>
                              <button
                                onClick={() => handleOrder(menu, style)}
                                className="mt-2 px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold text-sm rounded-lg hover:shadow-lg transition-all transform hover:scale-105 hover:from-amber-700 hover:to-amber-800"
                              >
                                주문하기
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Sticky Sidebar (부가 정보) */}
            <div className="order-1 lg:order-2">
              <div className="lg:sticky lg:top-24 space-y-4">
                {/* 할인 정보 - 컴팩트 버전 */}
                {isAuthenticated && discountInfo && (
                  discountInfo.eligible ? (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⭐</span>
                      <h3 className="text-sm font-bold text-amber-800">
                        {discountInfo.customer_type}
                      </h3>
                    </div>
                    <p className="text-xs text-amber-700 mb-2">
                      {discountInfo.discount_message}
                    </p>
                    <div className="text-xs text-amber-600">
                      주문 {discountInfo.total_orders}회
                      {discountInfo.next_tier_orders && ` · VIP까지 ${discountInfo.next_tier_orders}회`}
                    </div>
                  </div>
                ) : discountInfo.total_orders >= 3 ? (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">💡</span>
                      <h3 className="text-sm font-bold text-blue-800">단골까지 조금!</h3>
                    </div>
                    <p className="text-xs text-blue-700 mb-1">{discountInfo.discount_message}</p>
                    <div className="text-xs text-blue-600">주문 {discountInfo.total_orders}회</div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🎉</span>
                      <h3 className="text-sm font-bold text-green-800">환영합니다!</h3>
                    </div>
                    <p className="text-xs text-green-700 mb-1">{discountInfo.discount_message}</p>
                    <div className="text-xs text-green-600">주문 {discountInfo.total_orders}회</div>
                  </div>
                  )
                )}

                {/* 최근 주문 - 컴팩트 버전 */}
                {recentOrder && (
                  <div className="bg-white rounded-xl shadow-md border border-amber-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🍽️</span>
                      <h3 className="text-sm font-bold text-stone-900">최근 주문</h3>
                    </div>

                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-3 mb-3">
                      <p className="text-sm font-bold text-stone-900 mb-1">
                        {recentOrder.menu_name}
                      </p>
                      <p className="text-xs text-stone-600 mb-2">
                        {getStyleKoreanName(recentOrder.style)} · {recentOrder.quantity}개
                      </p>

                      {/* 커스터마이징 정보 표시 (변경된 항목만) */}
                      {recentOrder.customizations && recentOrder.menu_code && Object.keys(recentOrder.customizations).length > 0 && (() => {
                        const baseIngredients = menuIngredients[recentOrder.menu_code]?.[recentOrder.style] || {}
                        const changedItems = Object.entries(recentOrder.customizations).filter(([ingredient, qty]) => {
                          const baseQty = baseIngredients[ingredient] || 0
                          return baseQty !== Number(qty)
                        })

                        if (changedItems.length === 0) return null

                        return (
                          <div className="mt-2 pt-2 border-t border-amber-200">
                            <p className="text-xs font-medium text-stone-700 mb-1.5">커스터마이징:</p>
                            <div className="space-y-1">
                              {changedItems.map(([ingredient, qty]) => {
                                const baseQty = baseIngredients[ingredient] || 0
                                const qtyNum = Number(qty)
                                const diff = qtyNum - baseQty
                                return (
                                  <div key={ingredient} className="text-xs text-stone-600 flex justify-between items-center">
                                    <span className="font-medium">{ingredientNames[ingredient] || ingredient}</span>
                                    <span className="text-blue-600">
                                      {baseQty}개 → {qtyNum}개 ({diff > 0 ? `+${diff}` : diff})
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                      <p className="text-base font-bold text-amber-600 mt-2">
                        {recentOrder.total_price.toLocaleString()}원
                      </p>
                    </div>

                    <button
                      onClick={handleReorder}
                      className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-semibold text-sm rounded-lg shadow-sm hover:shadow-md transition-all"
                    >
                      🔄 재주문
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}