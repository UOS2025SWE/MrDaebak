/**
 * FR-012/FR-013: 체크아웃 페이지
 * 배송지 입력 + Mock 결제 시스템
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import {
  formatCardNumber,
  formatExpiryDate,
  formatCVC,
  validateExpiryDate,
  validateCVC
} from '../../lib/cardUtils'
import type { DeliveryInfo, PaymentInfo, CheckoutRequest } from '../../types/checkout'
import type { DiscountInfo } from '../../types/common'

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

// 메뉴별 기본 재료 구성 (order 페이지와 동일)
const menuIngredients: { [key: string]: { [key: string]: { [key: string]: number } } } = {
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

const ingredientUnitPrices: Record<string, number> = {
  premium_steak: 18000,
  wine: 15000,
  champagne_bottle: 55000,
  champagne: 45000,
  coffee_pot: 8000,
  coffee: 4000,
  fresh_salad: 6000,
  baguette: 3000,
  scrambled_eggs: 2000,
  bacon: 2000,
  bread: 1500,
  heart_plate: 1000,
  cupid_decoration: 1500,
  napkin: 500
}

const calculateCustomizationCost = (
  menuCode: string,
  style: string,
  customizations: Record<string, number> | null,
  quantity: number
): number => {
  if (!customizations || quantity <= 0) return 0

  const baseIngredients = menuIngredients[menuCode]?.[style] || {}
  let additionalCost = 0

  for (const [ingredient, value] of Object.entries(customizations)) {
    const qtyNum = Number(value)
    if (Number.isNaN(qtyNum)) continue

    const baseQty = baseIngredients[ingredient] || 0
    const diff = qtyNum - baseQty

    if (diff > 0) {
      const unitPrice = ingredientUnitPrices[ingredient] || 0
      additionalCost += unitPrice * diff
    }
  }

  return additionalCost * quantity
}

export default function CheckoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  const scheduleDateOptions = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 3 }, (_, idx) => {
      const option = new Date(base)
      option.setDate(option.getDate() + idx + 1)
      return option.toISOString().split('T')[0]
    })
  }, [])

  const scheduleTimeSlots = ['17:00', '18:00', '19:00']

  const formatScheduleLabel = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return ''
    const dateObj = new Date(`${dateStr}T00:00:00`)
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const label = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dayNames[dateObj.getDay()]})`
    return timeStr ? `${label} ${timeStr}` : label
  }

  // URL에서 주문 정보 가져오기
  const menuCode = searchParams.get('menu') || ''
  const style = searchParams.get('style') || ''
  const quantity = parseInt(searchParams.get('quantity') || '1')

  // 커스터마이징 정보 파싱
  const customizationsParam = searchParams.get('customizations')
const customizations = customizationsParam
  ? (JSON.parse(decodeURIComponent(customizationsParam)) as Record<string, number>)
  : null

  // 메뉴 정보가 없으면 주문 페이지로 리다이렉트
  useEffect(() => {
    if (!menuCode || !style) {
      alert('주문 정보가 없습니다. 메뉴를 먼저 선택해주세요.')
      router.push('/order')
    }
  }, [menuCode, style, router])

  // 비로그인 사용자 차단 (로딩 완료 후에만 체크)
  useEffect(() => {
    if (!loading && !user) {
      alert('로그인이 필요한 서비스입니다.')
      router.push('/login')
    }
  }, [loading, user, router])

  // 메뉴 정보 (실제로는 API에서 가져와야 함)
  const [menuInfo, setMenuInfo] = useState<any>(null)
  const [originalPrice, setOriginalPrice] = useState(0)
  const [customizationCost, setCustomizationCost] = useState(0)
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null)

  // 배송 정보
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>(() => {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + 1)
    const fallbackDate = fallback.toISOString().split('T')[0]

    return {
      address: '',
      recipient_name: '',
      recipient_phone: '',
      delivery_notes: '',
      scheduled_date: scheduleDateOptions[0] || fallbackDate,
      scheduled_time_slot: '18:00'
    }
  })
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [hasDefaultAddress, setHasDefaultAddress] = useState(false)

  // 결제 정보
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    card_number: '',
    cardholder_name: '',
    expiry_date: '',
    cvc: ''
  })

  // 에러 상태
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isProcessing, setIsProcessing] = useState(false)

  // 메뉴 정보 및 가격 가져오기
  useEffect(() => {
    if (menuCode && style) {
      fetchMenuInfo()
    }
  }, [menuCode, style])

  // 기본 배송지 정보 가져오기
  useEffect(() => {
    if (user?.id) {
      fetchDefaultDeliveryInfo()
    } else {
      // 비로그인 사용자는 바로 입력 모드
      setIsEditingAddress(true)
      setHasDefaultAddress(false)
    }
  }, [user])

  // 할인 정보 가져오기
  useEffect(() => {
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

    fetchDiscountInfo()
  }, [user?.id])

  const fetchMenuInfo = async () => {
    try {
      const response = await fetch(`/api/menu/${menuCode}`)
      const data = await response.json()

      if (data.success && data.data) {
        setMenuInfo(data.data)
        // 가격 계산 (스타일별) - styles 배열에서 찾기
        const selectedStyle = data.data.styles?.find((s: any) => s.code === style)
        const stylePrice = selectedStyle?.price || 0
        const customizationAddition = calculateCustomizationCost(menuCode, style, customizations, quantity)
        setCustomizationCost(customizationAddition)
        setOriginalPrice(stylePrice * quantity + customizationAddition)
      } else {
        console.error('메뉴 정보 조회 실패:', data)
      }
    } catch (error) {
      console.error('메뉴 정보 조회 실패:', error)
    }
  }

  const fetchDefaultDeliveryInfo = async () => {
    try {
      const response = await fetch(`/api/checkout/delivery-info/${user?.id}`)
      const data = await response.json()

      if (data.has_default && data.delivery_info && data.delivery_info.address) {
        setDeliveryInfo(prev => ({
          ...prev,
          address: data.delivery_info.address || '',
          recipient_name: data.delivery_info.recipient_name || '',
          recipient_phone: data.delivery_info.recipient_phone || '',
          delivery_notes: ''
        }))
        setHasDefaultAddress(true)
        setIsEditingAddress(false) // 기본 주소가 있으면 편집 모드 off
      } else {
        setHasDefaultAddress(false)
        setIsEditingAddress(true) // 기본 주소가 없으면 바로 입력 모드
      }
    } catch (error) {
      console.error('기본 배송지 정보 불러오기 실패:', error)
      setIsEditingAddress(true) // 에러 발생 시 입력 모드
    }
  }

  const basePriceForDisplay = Math.max(0, originalPrice - customizationCost)
  const discountAmount = discountInfo?.eligible ? Math.round(originalPrice * discountInfo.discount_rate) : 0
  const finalPrice = Math.max(0, originalPrice - discountAmount)

  const validateForm = (): { isValid: boolean; errors: Record<string, string> } => {
    const newErrors: Record<string, string> = {}

    // 배송지 검증
    const addressValue = deliveryInfo.address?.trim() || ''

    if (!addressValue) {
      newErrors.address = '배송 주소를 입력해주세요'
    } else if (addressValue.length < 2) {
      newErrors.address = '배송 주소를 2자 이상 입력해주세요'
    }

    const scheduleDateValue = deliveryInfo.scheduled_date
    if (!scheduleDateValue) {
      newErrors.scheduled_date = '예약 배송일을 선택해주세요'
    } else {
      const selectedDate = new Date(`${scheduleDateValue}T00:00:00`)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (selectedDate < today) {
        newErrors.scheduled_date = '과거 날짜는 선택할 수 없습니다'
      }
    }

    if (!deliveryInfo.scheduled_time_slot) {
      newErrors.scheduled_time_slot = '배송 시간대를 선택해주세요'
    }

    if (!paymentInfo.card_number.replace(/\s/g, '').trim()) {
      newErrors.card_number = '카드 번호를 입력해주세요'
    }

    if (!paymentInfo.cardholder_name.trim()) {
      newErrors.cardholder_name = '카드 소유자 이름을 입력해주세요'
    }

    if (!validateExpiryDate(paymentInfo.expiry_date)) {
      newErrors.expiry_date = '유효한 유효기간을 입력해주세요 (MM/YY)'
    }

    if (!validateCVC(paymentInfo.cvc)) {
      newErrors.cvc = 'CVC 3자리를 입력해주세요'
    }

    setErrors(newErrors)
    return {
      isValid: Object.keys(newErrors).length === 0,
      errors: newErrors
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validation = validateForm()

    if (!validation.isValid) {
      // 어떤 필드가 문제인지 사용자에게 알려주기
      const errorMessages = Object.entries(validation.errors).map(([field, message]) => `- ${message}`).join('\n')
      alert(`입력 정보를 확인해주세요:\n\n${errorMessages}`)
      return
    }

    setIsProcessing(true)

    try {
      const checkoutRequest: CheckoutRequest = {
        menu_code: menuCode,
        style: style,
        quantity: quantity,
        delivery: deliveryInfo,
        payment: paymentInfo,
        user_id: user?.id,
        save_as_default_address: saveAsDefault,
        customizations: customizations  // 커스터마이징 정보 전달
      }

      const response = await fetch('/api/checkout/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(checkoutRequest)
      })

      const data = await response.json()

      if (data.success) {
        // 결제 정보를 sessionStorage에 저장 (주문 완료 페이지에서 사용)
        sessionStorage.setItem('lastPaymentInfo', JSON.stringify({
          transaction_id: data.transaction_id,
          masked_card_number: data.masked_card_number,
          payment_amount: data.total_price,
          cardholder_name: paymentInfo.cardholder_name,
          payment_status: data.payment_status ?? 'PAID',
          payment_id: data.payment_id
        }))

        // 결제 성공 → 주문 완료 페이지로 이동
        router.push(`/order-complete/${data.order_id}`)
      } else {
        alert(data.message || '결제 처리에 실패했습니다.')
        setIsProcessing(false)
      }
    } catch (error) {
      alert('결제 처리 중 오류가 발생했습니다.')
      setIsProcessing(false)
    }
  }

  if (!menuCode || !style) {
    return null
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            ℹ️ 테스트 결제 시스템입니다. 모든 결제는 자동으로 승인되며 결제 기록이 저장됩니다.
          </div>
          {/* 진행 단계 표시 */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                ✓
              </div>
              <span className="ml-2 text-sm font-medium text-gray-700">메뉴 선택</span>
            </div>
            <div className="w-16 h-1 bg-blue-500"></div>
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                2
              </div>
              <span className="ml-2 text-sm font-medium text-blue-600">배송/결제</span>
            </div>
            <div className="w-16 h-1 bg-gray-300"></div>
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-gray-300 text-white flex items-center justify-center font-bold">
                3
              </div>
              <span className="ml-2 text-sm font-medium text-gray-500">완료</span>
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 좌측: 주문 요약 */}
          <div className="lg:sticky lg:top-4 h-fit">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">주문 요약</h2>

              {menuInfo && (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-full">
                      <h3 className="font-bold text-lg">{menuInfo.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{menuInfo.description}</p>
                      <p className="text-sm text-gray-700 mt-2">
                        스타일: <span className="font-medium capitalize">{style}</span>
                      </p>
                      <p className="text-sm text-gray-700">
                        수량: <span className="font-medium">{quantity}개</span>
                      </p>
                      {deliveryInfo.scheduled_date && (
                        <p className="text-sm text-gray-700">
                          예약 배송: <span className="font-medium">{formatScheduleLabel(deliveryInfo.scheduled_date, deliveryInfo.scheduled_time_slot)}</span>
                        </p>
                      )}

                      {/* 커스터마이징 정보 표시 - 변경된 항목만 */}
                      {customizations && Object.keys(customizations).length > 0 && (() => {
                        const baseIngredients = menuIngredients[menuCode]?.[style] || {}
                        const changedItems = Object.entries(customizations).filter(([ingredient, qty]) => {
                          const baseQty = baseIngredients[ingredient] || 0
                          return baseQty !== Number(qty)
                        })

                        if (changedItems.length === 0) return null

                        return (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-bold text-gray-800 mb-2">🔧 재료 커스터마이징</h4>
                            <div className="space-y-1">
                              {changedItems.map(([ingredient, qty]) => {
                                const baseQty = baseIngredients[ingredient] || 0
                                const qtyNum = Number(qty)
                                const diff = qtyNum - baseQty

                                return (
                                  <div key={ingredient} className="flex justify-between text-xs">
                                    <span className="text-gray-700">{ingredientNames[ingredient] || ingredient}</span>
                                    <span className="font-medium text-blue-600">
                                      {baseQty}개 → {qtyNum}개
                                      <span className="text-xs ml-1 text-gray-500">
                                        ({diff > 0 ? `+${diff}` : diff})
                                      </span>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* 가격 정보 */}
                  <div className="border-t pt-4 space-y-3">
                    {customizationCost > 0 && (
                      <>
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>기본 금액</span>
                          <span>{basePriceForDisplay.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>커스터마이징 추가금</span>
                          <span className="text-blue-600">+{customizationCost.toLocaleString()}원</span>
                        </div>
                        <div className="h-px bg-gray-200" />
                      </>
                    )}
                    {discountInfo?.eligible ? (
                      <>
                        {/* 할인 적용된 경우 */}
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>원가</span>
                          <span className="line-through">{originalPrice.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-red-600 font-medium">
                            {discountInfo.customer_type} 할인
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs font-medium">
                              {Math.round(discountInfo.discount_rate * 100)}% 할인
                            </span>
                            <span className="text-red-600 font-medium">
                              -{discountAmount.toLocaleString()}원
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t pt-3">
                          <span>최종 결제 금액</span>
                          <span className="text-blue-600">{finalPrice.toLocaleString()}원</span>
                        </div>
                      </>
                    ) : (
                      /* 할인 없는 경우 */
                      <div className="flex justify-between text-lg font-bold">
                        <span>총 결제 금액</span>
                        <span className="text-blue-600">{finalPrice.toLocaleString()}원</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 우측: 입력 폼 */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 배송 정보 섹션 */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">배송 정보</h2>

                <div className="space-y-4">
                  {/* 배송 주소 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      배송 주소 <span className="text-red-500">*</span>
                    </label>

                    {/* 기본 배송지가 있고 편집 모드가 아닐 때 */}
                    {user && hasDefaultAddress && !isEditingAddress ? (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">📍</span>
                            <div className="flex-1">
                              <p className="font-medium text-gray-800">{deliveryInfo.address}</p>
                              <p className="text-sm text-gray-600 mt-1">기본 배송지</p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditingAddress(true)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                        >
                          배송지 직접 입력
                        </button>
                      </div>
                    ) : (
                      /* 입력 모드 */
                      <div className="space-y-3">
                        <input
                          type="text"
                          required
                          value={deliveryInfo.address}
                          onChange={(e) => {
                            setDeliveryInfo({ ...deliveryInfo, address: e.target.value })
                            if (errors.address) setErrors({ ...errors, address: '' })
                          }}
                          placeholder="서울시 강남구 테헤란로 123"
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.address ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.address && (
                          <p className="text-red-500 text-sm mt-1">{errors.address}</p>
                        )}

                        {/* 기본 배송지로 저장 체크박스 (직접 입력 모드일 때만 표시) */}
                        {user && (
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="saveAsDefaultEdit"
                              checked={saveAsDefault}
                              onChange={(e) => setSaveAsDefault(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="saveAsDefaultEdit" className="ml-2 text-sm text-gray-700">
                              기본 배송지로 저장
                            </label>
                          </div>
                        )}

                        {/* 기본 배송지로 되돌리기 버튼 */}
                        {user && hasDefaultAddress && (
                          <button
                            type="button"
                            onClick={async () => {
                              await fetchDefaultDeliveryInfo()
                              setIsEditingAddress(false)
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 underline"
                          >
                            기본 배송지 사용
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 수령인 이름 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      수령인 이름
                    </label>
                    <input
                      type="text"
                      value={deliveryInfo.recipient_name}
                      onChange={(e) => setDeliveryInfo({ ...deliveryInfo, recipient_name: e.target.value })}
                      placeholder="홍길동"
                      disabled={!isEditingAddress}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${
                        !isEditingAddress
                          ? 'bg-gray-100 cursor-not-allowed'
                          : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    />
                  </div>

                  {/* 수령인 전화번호 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      수령인 전화번호
                    </label>
                    <input
                      type="tel"
                      value={deliveryInfo.recipient_phone}
                      onChange={(e) => setDeliveryInfo({ ...deliveryInfo, recipient_phone: e.target.value })}
                      placeholder="010-1234-5678"
                      disabled={!isEditingAddress}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${
                        !isEditingAddress
                          ? 'bg-gray-100 cursor-not-allowed'
                          : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    />
                  </div>

                  {/* 예약 배송 일정 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      예약 배송 일정
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <input
                          type="date"
                          value={deliveryInfo.scheduled_date || ''}
                          min={(scheduleDateOptions[0] || new Date().toISOString().split('T')[0])}
                          onChange={(e) => {
                            setDeliveryInfo({ ...deliveryInfo, scheduled_date: e.target.value })
                            if (errors.scheduled_date) setErrors({ ...errors, scheduled_date: '' })
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="flex flex-wrap gap-2">
                          {scheduleDateOptions.map((dateOption) => (
                            <button
                              type="button"
                              key={dateOption}
                          onClick={() => {
                            setDeliveryInfo({ ...deliveryInfo, scheduled_date: dateOption })
                            if (errors.scheduled_date) setErrors({ ...errors, scheduled_date: '' })
                          }}
                              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                                deliveryInfo.scheduled_date === dateOption
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {formatScheduleLabel(dateOption)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <select
                          value={deliveryInfo.scheduled_time_slot || ''}
                          onChange={(e) => {
                            setDeliveryInfo({ ...deliveryInfo, scheduled_time_slot: e.target.value })
                            if (errors.scheduled_time_slot) setErrors({ ...errors, scheduled_time_slot: '' })
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">시간 선택</option>
                          {scheduleTimeSlots.map((slot) => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          고객 요청 시간에 맞춰 준비 시간을 고려해 주세요 (예: 샴페인 디럭스 50분).
                        </p>
                      </div>
                    </div>
                    {(errors.scheduled_date || errors.scheduled_time_slot) && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.scheduled_date || errors.scheduled_time_slot}
                      </p>
                    )}
                  </div>

                  {/* 배송 요청사항 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      배송 요청사항
                    </label>
                    <textarea
                      value={deliveryInfo.delivery_notes}
                      onChange={(e) => setDeliveryInfo({ ...deliveryInfo, delivery_notes: e.target.value })}
                      placeholder="문 앞에 놓아주세요"
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 결제 정보 섹션 */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">결제 정보</h2>

                <div className="space-y-4">
                  {/* Mock 결제 안내 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      ℹ️ 테스트 결제 시스템입니다. 모든 결제는 자동으로 승인됩니다.
                    </p>
                  </div>

                  {/* 카드 번호 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      카드 번호 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={paymentInfo.card_number}
                      onChange={(e) => {
                        const formatted = formatCardNumber(e.target.value)
                        setPaymentInfo({ ...paymentInfo, card_number: formatted })
                        if (errors.card_number) setErrors({ ...errors, card_number: '' })
                      }}
                      placeholder="1234-5678-9012-3456"
                      maxLength={19}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.card_number ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.card_number && (
                      <p className="text-red-500 text-sm mt-1">{errors.card_number}</p>
                    )}
                  </div>

                  {/* 카드 소유자 이름 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      카드 소유자 이름 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={paymentInfo.cardholder_name}
                      onChange={(e) => {
                        setPaymentInfo({ ...paymentInfo, cardholder_name: e.target.value })
                        if (errors.cardholder_name) setErrors({ ...errors, cardholder_name: '' })
                      }}
                      placeholder="HONG GIL DONG"
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.cardholder_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.cardholder_name && (
                      <p className="text-red-500 text-sm mt-1">{errors.cardholder_name}</p>
                    )}
                  </div>

                  {/* 유효기간 & CVC */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        유효기간 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={paymentInfo.expiry_date}
                        onChange={(e) => {
                          const formatted = formatExpiryDate(e.target.value)
                          setPaymentInfo({ ...paymentInfo, expiry_date: formatted })
                          if (errors.expiry_date) setErrors({ ...errors, expiry_date: '' })
                        }}
                        placeholder="MM/YY"
                        maxLength={5}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors.expiry_date ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.expiry_date && (
                        <p className="text-red-500 text-sm mt-1">{errors.expiry_date}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CVC <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={paymentInfo.cvc}
                        onChange={(e) => {
                          const formatted = formatCVC(e.target.value)
                          setPaymentInfo({ ...paymentInfo, cvc: formatted })
                          if (errors.cvc) setErrors({ ...errors, cvc: '' })
                        }}
                        placeholder="123"
                        maxLength={3}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors.cvc ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.cvc && (
                        <p className="text-red-500 text-sm mt-1">{errors.cvc}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 font-medium"
                >
                  이전으로
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || originalPrice === 0}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      결제 처리 중...
                    </>
                  ) : originalPrice === 0 ? (
                    '주문 정보 로딩 중...'
                  ) : (
                    `${finalPrice.toLocaleString()}원 결제하기`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      </div>
      <Footer />
    </>
  )
}
