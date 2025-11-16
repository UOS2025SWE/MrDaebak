'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { PageContainer, Section } from '../../components/layout/Responsive'
import type { MenuItem, MenuStyle } from '@/types/menu'
import type { DiscountInfo, RecentOrder } from '@/types/common'
import { INGREDIENT_DISPLAY_NAMES, MENU_INGREDIENTS } from '@/utils/ingredients'

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


export default function MenuPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null)
  const [recentOrder, setRecentOrder] = useState<RecentOrder | null>(null)
  type MenuEventDiscountInfo = {
    eventId: string
    title: string
    discountType: 'PERCENT' | 'FIXED'
    discountValue: number
  }

  const [eventDiscountsByMenu, setEventDiscountsByMenu] = useState<Record<string, MenuEventDiscountInfo[]>>({})

  // 직원 및 매니저는 메뉴 페이지 접근 불가
  useEffect(() => {
    if (user && (user.user_type === 'STAFF' || user.user_type === 'MANAGER')) {
      router.push('/dashboard/staff')
      return
    }
  }, [user, router])

  const fetchMenuEventDiscounts = useCallback(async (menus: MenuItem[]) => {
    if (!menus || menus.length === 0) {
      setEventDiscountsByMenu({})
      return
    }

    try {
      const response = await fetch('/api/events')
      if (!response.ok) {
        setEventDiscountsByMenu({})
        return
      }

      const data = await response.json().catch(() => null)
      if (!data || !Array.isArray(data.events)) {
        setEventDiscountsByMenu({})
        return
      }

      const codeSet = new Set(menus.map((menu) => String(menu.code).toLowerCase()))
      const map: Record<string, MenuEventDiscountInfo[]> = {}

      data.events.forEach((event: any) => {
        if (!Array.isArray(event?.menu_discounts)) {
          return
        }

        event.menu_discounts.forEach((discount: any) => {
          const targetType = String(discount?.target_type ?? discount?.targetType ?? 'MENU').toUpperCase()
          if (targetType === 'SIDE_DISH') {
            return
          }

          const codeRaw = String(discount?.menu_code ?? discount?.menuCode ?? '').toLowerCase()
          if (!codeRaw || !codeSet.has(codeRaw)) {
            return
          }

          const discountValue = Number(discount?.discount_value ?? discount?.discountValue ?? 0)
          if (!Number.isFinite(discountValue) || discountValue <= 0) {
            return
          }

          const discountType: 'PERCENT' | 'FIXED' = (discount?.discount_type ?? discount?.discountType ?? 'PERCENT') === 'FIXED' ? 'FIXED' : 'PERCENT'

          const normalized: MenuEventDiscountInfo = {
            eventId: String(discount?.event_id ?? discount?.eventId ?? event?.event_id ?? event?.id ?? ''),
            title: String(discount?.title ?? event?.title ?? '이벤트 할인'),
            discountType,
            discountValue,
          }

          if (!map[codeRaw]) {
            map[codeRaw] = []
          }
          map[codeRaw].push(normalized)
        })
      })

      setEventDiscountsByMenu(map)
    } catch (error) {
      console.error('메뉴 이벤트 할인 정보를 불러오는데 실패했습니다:', error)
      setEventDiscountsByMenu({})
    }
  }, [])

  const fetchMenuData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/menu/')
      const result = await response.json()
      
      if (result.success) {
        const menuData: MenuItem[] = Array.isArray(result.data) ? result.data : []
        setMenuItems(menuData)
        fetchMenuEventDiscounts(menuData)
      } else {
        setError('메뉴를 불러올 수 없습니다.')
      }
    } catch {
      setError('서버 연결에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [fetchMenuEventDiscounts])

  const fetchDiscountInfo = useCallback(async () => {
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
  }, [user?.id])

  const fetchRecentOrder = useCallback(async () => {
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
    } catch (error) {
      console.error('최근 주문 조회 실패:', error)
    }
  }, [user?.id])

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
  }, [isAuthenticated, user, fetchMenuData, fetchDiscountInfo, fetchRecentOrder])

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

  const calculateMenuEventDiscount = (menuCode: string, basePrice: number): number => {
    const price = Number(basePrice)
    if (!Number.isFinite(price) || price <= 0) return 0

    const key = String(menuCode).toLowerCase()
    const discounts = eventDiscountsByMenu[key] ?? []
    if (!discounts.length) return 0

    let remaining = price
    let total = 0

    discounts.forEach((discount) => {
      if (remaining <= 0) return

      const value = Number(discount.discountValue)
      if (!Number.isFinite(value) || value <= 0) return

      let calculated = 0
      if (discount.discountType === 'PERCENT') {
        calculated = Math.round(price * (value / 100))
      } else {
        calculated = Math.round(value)
      }

      if (calculated <= 0) return

      const applied = Math.min(calculated, remaining)
      if (applied <= 0) return

      total += applied
      remaining = Math.max(0, remaining - applied)
    })

    return Math.min(total, price)
  }

  if (loading) {
    return (
      <PageContainer currentPage="menu">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-lg sm:text-2xl text-stone-700">메뉴를 불러오는 중...</div>
        </div>
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer currentPage="menu">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-red-500 text-base sm:text-xl">{error}</div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer currentPage="menu">
      {/* Title Section */}
      <Section>
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-4xl font-bold text-stone-900 mb-2 sm:mb-3">
              프리미엄 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">디너 메뉴</span>
            </h1>
            <p className="text-sm sm:text-lg text-stone-600 max-w-2xl mx-auto">
              최고급 재료로 만든 특별한 디너를 집에서 편안하게 즐기세요
            </p>
          </div>
        </div>
      </Section>

      {/* Main Layout - 사이드바 구조 (컴팩트 사이드바) */}
      <Section>
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 sm:gap-8">
            {/* Left: Menu Grid (주요 콘텐츠) */}
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {menuItems.filter(menu => menu.code !== 'cake').map((menu) => (
                  <div key={menu.id} className="bg-white rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all transform hover:-translate-y-1 border border-amber-100">
                    {/* Menu Image */}
                    <div className="w-full h-48 sm:h-52 bg-gradient-to-br from-amber-50 to-stone-100 overflow-hidden">
                      <img
                        src={`/images/${menu.code === 'champagne' ? 'champagne-feast-dinner' : menu.code + '-dinner'}.jpg`}
                        alt={`${menu.name} 이미지`}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>

                    {/* Menu Info */}
                    <div className="p-4 sm:p-6">
                      <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-1 sm:mb-2">{menu.name}</h3>
                      <p className="text-stone-600 mb-3 sm:mb-4 text-xs sm:text-sm leading-relaxed">{menu.description} (배달시간 20분)</p>

                      {/* Styles */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-stone-800 text-xs sm:text-sm mb-1.5 sm:mb-2">스타일 선택:</h4>
                        {menu.styles.map((style) => {
                          const isAvailable = style.available !== false
                          const originalStylePrice = style.price
                          const menuEventDiscountAmount = calculateMenuEventDiscount(menu.code, originalStylePrice)
                          const loyaltyEligible = Boolean(discountInfo?.eligible)
                          const loyaltyRate = discountInfo?.discount_rate ?? 0
                          const loyaltyDiscountAmount = loyaltyEligible ? Math.round(originalStylePrice * loyaltyRate) : 0
                          const totalDiscount = menuEventDiscountAmount + loyaltyDiscountAmount
                          const finalPrice = Math.max(0, originalStylePrice - totalDiscount)
                          const hasEventDiscount = menuEventDiscountAmount > 0
                          const hasLoyaltyDiscount = loyaltyDiscountAmount > 0
                          return (
                            <div
                              key={style.name}
                              className={`relative group flex items-center justify-between p-3 rounded-xl border transition-all ${
                                isAvailable
                                  ? 'bg-gradient-to-r from-amber-50 to-stone-50 border-amber-100 hover:shadow-md hover:border-amber-200'
                                  : 'bg-stone-50 border-stone-200 opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-stone-900 relative text-sm sm:text-base">
                                  {style.name}
                                  {!isAvailable && (
                                    <span className="ml-2 text-xs font-medium text-red-500">재고 부족</span>
                                  )}
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
                                <div className="text-[11px] sm:text-xs text-stone-600 mt-0.5">
                                  조리 {style.cooking_time}분 · 총 {style.cooking_time + 20}분
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex flex-col items-end gap-0.5">
                                  {hasEventDiscount || hasLoyaltyDiscount ? (
                                    <>
                                      <div className="text-[11px] sm:text-xs text-stone-500 line-through">{style.price.toLocaleString()}원</div>
                                      {hasEventDiscount && (
                                        <div className="text-xs text-blue-600 font-medium">
                                          이벤트 -{menuEventDiscountAmount.toLocaleString()}원
                                        </div>
                                      )}
                                      {hasLoyaltyDiscount && (
                                        <div className="text-xs text-red-600 font-medium">
                                          단골 -{loyaltyDiscountAmount.toLocaleString()}원
                                        </div>
                                      )}
                                      {hasEventDiscount && (
                                        <div className="text-[11px] text-blue-500 font-semibold uppercase tracking-wide">
                                          이벤트 할인 적용중
                                        </div>
                                      )}
                                      <div className="text-base sm:text-lg font-bold text-amber-700">
                                        {finalPrice.toLocaleString()}원
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-base sm:text-lg font-bold bg-gradient-to-r from-amber-600 to-amber-800 text-transparent bg-clip-text">
                                      {style.price.toLocaleString()}원
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleOrder(menu, style)}
                                  disabled={!isAvailable}
                                  className={`mt-2 px-3 sm:px-4 py-1.5 font-semibold text-xs sm:text-sm rounded-lg transition-all ${
                                    isAvailable
                                      ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:shadow-lg hover:scale-105 hover:from-amber-700 hover:to-amber-800'
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  {isAvailable ? '주문하기' : '준비 중'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
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
                        const baseIngredients = MENU_INGREDIENTS[recentOrder.menu_code]?.[recentOrder.style] || {}
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
                                    <span className="font-medium">{INGREDIENT_DISPLAY_NAMES[ingredient] || ingredient}</span>
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
      </Section>
      </PageContainer>
  )
}