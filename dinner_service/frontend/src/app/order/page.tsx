'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { OrderItem, PaymentModalProps } from '@/types/order'
import type { MenuStyle } from '@/types/menu'
import type { DiscountInfo } from '@/types/common'

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

const styleEnglishToKorean: Record<string, string> = {
  simple: '심플',
  grand: '그랜드',
  deluxe: '디럭스'
}

const styleKoreanToEnglish: Record<string, string> = {
  '심플': 'simple',
  '그랜드': 'grand',
  '디럭스': 'deluxe'
}

const calculateCustomizationCostPerSet = (
  baseIngredients: { [key: string]: number },
  currentIngredients: { [key: string]: number },
  ingredientPrices: { [key: string]: number }
): number => {
  let additionalCost = 0

  for (const [ingredient, qty] of Object.entries(currentIngredients)) {
    const baseQty = baseIngredients[ingredient] || 0
    const diff = qty - baseQty

    if (diff > 0) {
      const unitPrice = ingredientPrices[ingredient] || 0
      additionalCost += unitPrice * diff
    }
  }

  return additionalCost
}

// 결제 완료 모달 컴포넌트
function PaymentModal({ isOpen, onClose, orderData, finalPrice }: PaymentModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  const handleGoHome = () => {
    router.push('/')
  }

  const handleGoOrders = () => {
    router.push('/orders')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">결제가 완료되었습니다!</h2>
          <p className="text-stone-600 mb-4">
            {orderData.menuName} ({orderData.styleName})<br/>
            {finalPrice.toLocaleString()}원
          </p>
          <div className="flex space-x-3">
            <button
              onClick={handleGoHome}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all transform hover:scale-105"
            >
              메인화면
            </button>
            <button
              onClick={handleGoOrders}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-stone-600 to-stone-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all transform hover:scale-105"
            >
              주문내역
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrderPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const [orderData, setOrderData] = useState<OrderItem | null>(null)
  const [availableStyles, setAvailableStyles] = useState<MenuStyle[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null)
  const [baseIngredients, setBaseIngredients] = useState<Record<string, Record<string, number>>>({})
  const [ingredientPrices, setIngredientPrices] = useState<Record<string, number>>({})

  useEffect(() => {
    const menuId = searchParams?.get('menuId')
    const menuCode = searchParams?.get('menuCode')
    const menuName = searchParams?.get('menuName')
    const styleNameParam = searchParams?.get('styleName')
    const styleCodeParam = searchParams?.get('styleCode')
    const stylePrice = searchParams?.get('stylePrice')
    const basePrice = searchParams?.get('basePrice')
    const cookingTime = searchParams?.get('cookingTime')
    const description = searchParams?.get('description')
    const imageUrl = searchParams?.get('imageUrl')

    if (menuId && menuCode && menuName && stylePrice && basePrice && cookingTime) {
      const resolvedStyleCode = styleCodeParam || (styleNameParam ? styleKoreanToEnglish[styleNameParam] : undefined) || 'simple'
      const resolvedStyleName = styleNameParam || styleEnglishToKorean[resolvedStyleCode] || resolvedStyleCode

      setOrderData({
        menuId,
        menuCode,
        menuName,
        styleCode: resolvedStyleCode,
        styleName: resolvedStyleName,
        stylePrice: parseInt(stylePrice, 10),
        basePrice: parseInt(basePrice, 10),
        cookingTime: parseInt(cookingTime, 10),
        description: description || '',
        imageUrl: imageUrl || '',
        ingredients: {},
        quantity: 1
      })
    } else {
      router.push('/menu')
    }
  }, [searchParams, router])

  // 할인 정보 가져오기
  useEffect(() => {
    const fetchDiscountInfo = async () => {
      if (!isAuthenticated || !user?.id) return
      
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

    fetchDiscountInfo()
  }, [isAuthenticated, user?.id])

  // 메뉴 상세 정보 및 기본 재료 구성 로드
  useEffect(() => {
    const fetchMenuDetail = async () => {
      if (!orderData?.menuCode) return

      try {
        const response = await fetch(`/api/menu/${orderData.menuCode}`)
        const result = await response.json()

        if (result.success && result.data) {
          const styles: MenuStyle[] = result.data.styles || []
          setAvailableStyles(styles)

          const baseMap: Record<string, Record<string, number>> = {}
          styles.forEach(style => {
            if (style.base_ingredients) {
              baseMap[style.code] = style.base_ingredients
            }
          })
          setBaseIngredients(baseMap)

          setOrderData(prev => {
            if (!prev) return prev
            const currentStyle = styles.find(s => s.code === prev.styleCode) || styles[0]
            if (!currentStyle) return prev

            const shouldResetIngredients = Object.keys(prev.ingredients || {}).length === 0

            return {
              ...prev,
              basePrice: Number(result.data.base_price ?? prev.basePrice),
              styleCode: currentStyle.code,
              styleName: currentStyle.name,
              stylePrice: currentStyle.price,
              cookingTime: currentStyle.cooking_time,
              ingredients: shouldResetIngredients ? { ...(currentStyle.base_ingredients || {}) } : prev.ingredients
            }
          })
        }
      } catch (error) {
        console.error('메뉴 정보를 불러오는 중 오류가 발생했습니다:', error)
      }
    }

    fetchMenuDetail()
  }, [orderData?.menuCode])

  // 재료 단가 정보 로드
  useEffect(() => {
    const fetchIngredientPricing = async () => {
      try {
        const response = await fetch('/api/ingredients/pricing')
        const result = await response.json()
        if (result.success) {
          setIngredientPrices(result.pricing || {})
        }
      } catch (error) {
        console.error('재료 단가 정보를 불러오는 중 오류가 발생했습니다:', error)
      }
    }

    fetchIngredientPricing()
  }, [])

  const customizationCostPerSet = useMemo(() => {
    if (!orderData) return 0
    const baseForStyle = baseIngredients[orderData.styleCode] || {}
    return calculateCustomizationCostPerSet(baseForStyle, orderData.ingredients, ingredientPrices)
  }, [orderData, baseIngredients, ingredientPrices])

  const customizationCost = orderData ? customizationCostPerSet * orderData.quantity : 0
  const basePriceWithoutCustomization = orderData ? orderData.stylePrice * orderData.quantity : 0
  const originalPrice = basePriceWithoutCustomization + customizationCost
  const discountAmount = discountInfo?.eligible ? Math.round(originalPrice * discountInfo.discount_rate) : 0
  const finalPrice = Math.max(0, originalPrice - discountAmount)

  if (!orderData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">주문 정보를 불러오는 중...</div>
      </div>
    )
  }

  // 스타일 변경 핸들러
  const handleStyleChange = (newStyle: MenuStyle) => {
    const baseForStyle = baseIngredients[newStyle.code] || {}

    setOrderData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        styleCode: newStyle.code,
        styleName: newStyle.name,
        stylePrice: newStyle.price,
        cookingTime: newStyle.cooking_time,
        ingredients: { ...baseForStyle }
      }
    })
  }

  // 재료 수량 변경 핸들러
  const handleIngredientChange = (ingredient: string, change: number) => {
    const newQuantity = Math.max(0, orderData.ingredients[ingredient] + change)
    setOrderData({
      ...orderData,
      ingredients: {
        ...orderData.ingredients,
        [ingredient]: newQuantity
      }
    })
  }

  // 주문 수량 변경 핸들러
  const handleQuantityChange = (change: number) => {
    const newQuantity = Math.max(1, orderData.quantity + change)
    setOrderData({
      ...orderData,
      quantity: newQuantity
    })
  }

  // 결제하기 핸들러 - checkout 페이지로 이동
  const handlePayment = () => {
    const styleEng = orderData.styleCode
    // 커스터마이징 정보를 URL 파라미터로 전달
    const customizationsJson = JSON.stringify(orderData.ingredients)
    const customizationsParam = encodeURIComponent(customizationsJson)

    // checkout 페이지로 이동 (URL 파라미터로 주문 정보 전달)
    router.push(`/checkout?menu=${orderData.menuCode}&style=${styleEng}&quantity=${orderData.quantity}&customizations=${customizationsParam}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50">
      <Header currentPage="order" />

      <main className="w-full py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              주문 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">커스터마이징</span>
            </h1>
            <p className="text-xl text-stone-600">
              원하는 스타일과 재료로 주문을 맞춤 설정하세요
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* 메뉴 정보 헤더 */}
            <div className="bg-gradient-to-r from-amber-50 to-stone-50 p-8 border-b">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-32 h-32 bg-gradient-to-br from-amber-100 to-stone-200 rounded-2xl flex items-center justify-center text-4xl">
                  🍽️
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-3xl font-bold text-stone-900 mb-2">{orderData.menuName}</h2>
                  <p className="text-stone-600 mb-4">{orderData.description}</p>
                  <div className="space-y-2">
                    {customizationCost > 0 && (
                      <div className="text-sm text-stone-600">
                        기본 {basePriceWithoutCustomization.toLocaleString()}원 + 커스터마이징 {customizationCost.toLocaleString()}원
                      </div>
                    )}
                    {discountInfo?.eligible ? (
                      <>
                        {/* 할인 적용된 경우 */}
                        <div className="flex items-center gap-3">
                          <span className="text-lg text-stone-500 line-through">
                            {originalPrice.toLocaleString()}원
                          </span>
                          <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-sm font-medium">
                            {Math.round(discountInfo.discount_rate * 100)}% 할인
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                          {finalPrice.toLocaleString()}원
                        </div>
                        <div className="text-sm text-green-600 font-medium">
                          💰 {discountAmount.toLocaleString()}원 절약!
                        </div>
                      </>
                    ) : (
                      <div className="text-2xl font-bold text-amber-600">
                        {finalPrice.toLocaleString()}원
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-8">
              {/* 할인 정보 표시 */}
              {isAuthenticated && discountInfo && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">⭐</span>
                    <h4 className="font-bold text-amber-800">
                      {discountInfo.customer_type} 고객 할인 적용
                    </h4>
                  </div>
                  <p className="text-amber-700 text-sm">
                    {discountInfo.discount_message}
                  </p>
                </div>
              )}

              {/* 주문 수량 */}
              <div>
                <h3 className="text-xl font-bold text-stone-900 mb-4">주문 수량</h3>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handleQuantityChange(-1)}
                    className="w-10 h-10 rounded-full bg-stone-200 hover:bg-stone-300 flex items-center justify-center font-bold text-stone-700 transition-colors"
                  >
                    -
                  </button>
                  <span className="text-2xl font-bold text-stone-900 min-w-[3rem] text-center">
                    {orderData.quantity}
                  </span>
                  <button
                    onClick={() => handleQuantityChange(1)}
                    className="w-10 h-10 rounded-full bg-amber-600 hover:bg-amber-700 flex items-center justify-center font-bold text-white transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 스타일 선택 */}
              <div>
                <h3 className="text-xl font-bold text-stone-900 mb-4">스타일 선택</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {availableStyles.map((style) => {
                    const priceAddition = style.price - orderData.basePrice
                    const isSelected = orderData.styleCode === style.code
                    return (
                    <button
                      key={style.code}
                      onClick={() => handleStyleChange(style)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-amber-300'
                      }`}
                    >
                      <div className="font-bold text-lg">{style.name}</div>
                      <div className="text-sm mt-1">
                        {priceAddition > 0 ? `+${priceAddition.toLocaleString()}원` : priceAddition === 0 ? '기본 가격' : `${priceAddition.toLocaleString()}원`}
                      </div>
                    </button>
                    )
                  })}
                </div>
              </div>

              {/* 재료 커스터마이징 */}
              <div>
                <h3 className="text-xl font-bold text-stone-900 mb-4">재료 커스터마이징</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(orderData.ingredients).map(([ingredient, quantity]) => (
                    <div key={ingredient} className="flex items-center justify-between p-4 bg-stone-50 rounded-xl">
                      <span className="font-semibold text-stone-800">
                        {ingredientNames[ingredient] || ingredient}
                      </span>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleIngredientChange(ingredient, -1)}
                          className="w-8 h-8 rounded-full bg-stone-300 hover:bg-stone-400 flex items-center justify-center text-stone-700 font-bold transition-colors"
                        >
                          -
                        </button>
                        <span className="font-bold text-stone-900 min-w-[2rem] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => handleIngredientChange(ingredient, 1)}
                          className="w-8 h-8 rounded-full bg-amber-600 hover:bg-amber-700 flex items-center justify-center text-white font-bold transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>


              {/* 결제 버튼 */}
              <div className="pt-4 border-t">
                {customizationCost > 0 && (
                  <div className="flex justify-between text-sm text-stone-600 mb-4">
                    <span>커스터마이징 추가금</span>
                    <span className="text-blue-600">+{customizationCost.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => router.back()}
                    className="px-8 py-4 bg-stone-600 hover:bg-stone-700 text-white font-bold rounded-xl transition-colors"
                  >
                    이전으로
                  </button>
                  <button
                    onClick={handlePayment}
                    className="flex-1 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xl rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                  >
                    {finalPrice.toLocaleString()}원 결제하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* 결제 완료 모달 */}
      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        orderData={orderData}
        finalPrice={finalPrice}
      />
    </div>
  )
}