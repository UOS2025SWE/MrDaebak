/**
 * FR-012/FR-013: 체크아웃 페이지
 * 배송지 입력 + Mock 결제 시스템
 */

'use client'

import { Suspense } from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FormEvent } from 'react'
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
import { INGREDIENT_DISPLAY_NAMES, MENU_INGREDIENTS } from '@/utils/ingredients'

// 공통 스케줄 유틸 함수들 (훅 의존성 경고 방지를 위해 컴포넌트 밖으로 분리)
const SCHEDULE_TIME_SLOTS = ['17:00', '18:00', '19:00'] as const

const normalizeScheduleDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

const normalizeScheduleTime = (value?: string | null) => {
  if (!value) return null
  return SCHEDULE_TIME_SLOTS.includes(value as (typeof SCHEDULE_TIME_SLOTS)[number]) ? value : null
}

const formatScheduleLabel = (dateStr?: string, timeStr?: string) => {
  if (!dateStr) return ''
  const dateObj = new Date(`${dateStr}T00:00:00`)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const label = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dayNames[dateObj.getDay()]})`
  return timeStr ? `${label} ${timeStr}` : label
}

type MenuEventDiscountInfo = {
  eventId: string
  title: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  targetName?: string
}

// 재료/메뉴 구성은 utils/ingredients에서 공통 관리

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
  napkin: 500,
  paper_napkin: 100,
  cotton_napkin: 800,
  linen_napkin: 1200,
  plastic_tray: 800,
  wooden_tray: 4000,
  plastic_plate: 500,
  plastic_cup: 300,
  ceramic_plate: 5000,
  ceramic_cup: 3000,
  plastic_wine_glass: 700,
  glass_wine_glass: 3500,
  vase_with_flowers: 8000,
  cake_base: 12000,
  buttercream_frosting: 5000,
  fresh_berries: 4500,
  fondant: 6000,
  edible_gold_leaf: 9000,
  chocolate_ganache: 5500,
  cake_board: 1500,
  edible_flowers: 5000
}

const CUSTOM_CAKE_FLAVORS = [
  { code: 'vanilla', label: '바닐라' },
  { code: 'chocolate', label: '초콜릿' },
  { code: 'red_velvet', label: '레드벨벳' },
  { code: 'green_tea', label: '녹차' }
] as const

const CUSTOM_CAKE_SIZES = [
  { code: 'size_1', label: '1호 (2~3인)' },
  { code: 'size_2', label: '2호 (3~4인)' },
  { code: 'size_3', label: '3호 (4~6인)' }
] as const

const GEMINI_ASPECT_RATIOS = [
  { value: '1:1', label: '정사각형 (1:1)' },
  { value: '4:5', label: '포스터 (4:5)' },
  { value: '3:4', label: '세로 (3:4)' },
  { value: '4:3', label: '가로 (4:3)' },
  { value: '16:9', label: '와이드 (16:9)' },
  { value: '9:16', label: '세로 와이드 (9:16)' },
  { value: '3:2', label: '사진 (3:2)' },
  { value: '2:3', label: '사진 (2:3)' },
  { value: '5:4', label: '갤러리 (5:4)' },
  { value: '21:9', label: '시네마 (21:9)' }
] as const

const CAKE_AI_MODES = [
  { value: 'upload', label: '이미지 업로드' },
  { value: 'prompt', label: '프롬프트로 생성' },
  { value: 'edit', label: '이미지 + 프롬프트 수정' }
] as const

type CakeAiMode = (typeof CAKE_AI_MODES)[number]['value']

type CakeAiStatus = {
  type: 'success' | 'error'
  message: string
}

type CustomCakeRecipeVariant = {
  ingredients: SideDishIngredient[]
  price: number
}

type CustomCakeRecipeMap = Record<string, Record<string, CustomCakeRecipeVariant>>

const calculateCustomizationCost = (
  menuCode: string,
  style: string,
  customizationsTotals: Record<string, number> | null,
  quantity: number
): number => {
  if (!customizationsTotals || quantity <= 0) return 0

  const baseIngredients = MENU_INGREDIENTS[menuCode]?.[style] || {}
  let additionalCost = 0

  for (const [ingredient, value] of Object.entries(customizationsTotals)) {
    const qtyNum = Number(value)
    if (!Number.isFinite(qtyNum)) continue

    const baseQtyPerUnit = baseIngredients[ingredient] || 0
    const baseQtyForQuantity = baseQtyPerUnit * quantity
    const diff = qtyNum - baseQtyForQuantity

    if (diff > 0) {
      const unitPrice = ingredientUnitPrices[ingredient] || 0
      additionalCost += unitPrice * diff
    }
  }

  return additionalCost
}

type SideDishIngredient = {
  ingredient_code: string
  ingredient_id?: string
  quantity: number
  ingredient_name: string
}

type SideDishOption = {
  side_dish_id: string
  code: string
  name: string
  description?: string
  base_price: number
  is_available: boolean
  ingredients: SideDishIngredient[]
  unit_price: number
}

const getIngredientDisplayName = (code: string): string => {
  if (!code) return ''
  return INGREDIENT_DISPLAY_NAMES[code] || code.replace(/_/g, ' ')
}

const toSideDishIngredients = (raw: any): SideDishIngredient[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const ingredientCode = item?.ingredient_code ?? item?.code ?? ''
      const quantityValue = Number(item?.quantity ?? 0)
      return {
        ingredient_code: ingredientCode,
        ingredient_id: item?.ingredient_id,
        quantity: Number.isFinite(quantityValue) ? quantityValue : 0,
        ingredient_name: getIngredientDisplayName(ingredientCode)
      }
    })
    .filter((item) => item.ingredient_code)
}

const deriveSideDishUnitPrice = (basePrice: number, ingredients: SideDishIngredient[]): number => {
  const normalizedBase = Number.isFinite(basePrice) ? basePrice : 0
  if (normalizedBase > 0) {
    return normalizedBase
  }

  const ingredientsTotal = ingredients.reduce((sum, ingredient) => {
    const unitPrice = ingredientUnitPrices[ingredient.ingredient_code] ?? 0
    return sum + unitPrice * ingredient.quantity
  }, 0)

  return Math.max(0, Math.round(ingredientsTotal))
}

const buildCustomCakeFallbackOption = (): SideDishOption => {
  const deluxeIngredients = MENU_INGREDIENTS.cake?.deluxe || {}
  const ingredientList = Object.entries(deluxeIngredients).map(([ingredientCode, quantity]) => ({
    ingredient_code: ingredientCode,
    ingredient_id: undefined,
    quantity: Number(quantity) || 0,
    ingredient_name: getIngredientDisplayName(ingredientCode)
  }))

  const fallbackPrice = 42000

  return {
    side_dish_id: 'custom_cake',
    code: 'custom_cake',
    name: '커스터마이징 케이크',
    description: '사진과 메시지를 첨부하여 맞춤 제작합니다.',
    base_price: fallbackPrice,
    is_available: true,
    ingredients: ingredientList,
    unit_price: fallbackPrice
  }
}

const generateSideDishFallbackId = (): string => {
  const globalCrypto = typeof globalThis !== 'undefined' && 'crypto' in globalThis ? (globalThis as any).crypto : undefined
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `side-${Math.random().toString(36).slice(2, 10)}`
}

const formatIngredientQuantity = (quantity: number): string => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return ''
  }
  const rounded = Math.round(quantity)
  if (Math.abs(quantity - rounded) < 0.001) {
    return `${rounded}개`
  }
  return `${quantity.toFixed(2).replace(/\.00$/, '')}단위`
}

const createSideDishOptionFromResponse = (dish: any): SideDishOption => {
  const ingredients = toSideDishIngredients(dish?.ingredients)
  const basePrice = Number(dish?.base_price ?? dish?.price ?? 0)
  const unitPrice = deriveSideDishUnitPrice(basePrice, ingredients)

  return {
    side_dish_id: dish?.side_dish_id ?? dish?.id ?? dish?.code ?? generateSideDishFallbackId(),
    code: (dish?.code ?? '').toLowerCase(),
    name: dish?.name ?? '사이드 메뉴',
    description: dish?.description ?? undefined,
    base_price: Number.isFinite(basePrice) ? basePrice : 0,
    is_available: Boolean(dish?.is_available ?? true),
    ingredients,
    unit_price: unitPrice
  }
}

function CheckoutPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, token } = useAuth()

  const scheduleDateOptions = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 3 }, (_, idx) => {
      const option = new Date(base)
      option.setDate(option.getDate() + idx + 1)
      return option.toISOString().split('T')[0]
    })
  }, [])

  // URL에서 주문 정보 가져오기
  const menuCode = searchParams.get('menu') || ''
  const style = searchParams.get('style') || ''
  const quantity = parseInt(searchParams.get('quantity') || '1')
  const deliveryDateParam = searchParams.get('deliveryDate')
  const deliveryTimeParam = searchParams.get('deliveryTime')

  // 커스터마이징 정보 파싱
  const customizationsParam = searchParams.get('customizations')
  const customizationsModeParam = (searchParams.get('customizationsMode') || 'per_set').toLowerCase()
  const customizationsMode = customizationsModeParam === 'total' ? 'total' : 'per_set'
  const sideDishesParam = searchParams.get('sideDishes')
  const cakeCustomizationParam = searchParams.get('cakeCustomization')
  const rawCustomizations = useMemo<Record<string, number> | null>(() => {
    if (!customizationsParam) return null
    try {
      const decoded = decodeURIComponent(customizationsParam)
      const parsed = JSON.parse(decoded)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, number>
      }
    } catch (error) {
      console.error('커스터마이징 파라미터 파싱 실패:', error)
    }
    return null
  }, [customizationsParam])
  const customizationsTotals = useMemo<Record<string, number> | null>(() => {
    if (!rawCustomizations) return null
    const baseForStyle = MENU_INGREDIENTS[menuCode]?.[style] || {}
    const safeQuantity = Math.max(1, quantity)
    const totals: Record<string, number> = {}

    Object.entries(baseForStyle).forEach(([ingredient, baseQty]) => {
      const perSet = Number(baseQty) || 0
      totals[ingredient] = perSet * safeQuantity
    })

    Object.entries(rawCustomizations).forEach(([ingredient, value]) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return
      const totalValue = customizationsMode === 'total'
        ? numeric
        : numeric * safeQuantity
      totals[ingredient] = Math.max(0, Math.round(totalValue))
    })

    return totals
  }, [rawCustomizations, customizationsMode, menuCode, style, quantity])

  useEffect(() => {
    if (!sideDishesParam) return
    try {
      const decoded = decodeURIComponent(sideDishesParam)
      const parsed = JSON.parse(decoded) as Record<string, number>
      if (parsed && typeof parsed === 'object') {
        const next: Record<string, number> = {}
        Object.entries(parsed).forEach(([code, qty]) => {
          const value = Number(qty)
          if (!Number.isNaN(value) && value > 0) {
            next[code] = value
          }
        })
        if (Object.keys(next).length > 0) {
          setSideDishSelections(next)
        }
      }
    } catch (error) {
      console.error('사이드 디시 파라미터 파싱 실패:', error)
    }
  }, [sideDishesParam])

  useEffect(() => {
    if (!cakeCustomizationParam) return
    try {
      const decoded = decodeURIComponent(cakeCustomizationParam)
      const parsed = JSON.parse(decoded) as Record<string, any>
      if (parsed?.include) {
        setIncludeCustomCake(true)
        setCakeCustomizationState(prev => ({
          ...prev,
          flavor: parsed.flavor || prev.flavor,
          size: parsed.size || prev.size,
          message: parsed.message || ''
        }))
      }
    } catch (error) {
      console.error('케이크 커스터마이징 파라미터 파싱 실패:', error)
    }
  }, [cakeCustomizationParam])

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
  const [basePrice, setBasePrice] = useState(0)
  const [sideDishOptions, setSideDishOptions] = useState<SideDishOption[]>([])
  const [sideDishSelections, setSideDishSelections] = useState<Record<string, number>>({})
  const [sideDishCost, setSideDishCost] = useState(0)
  const [customCakeOption, setCustomCakeOption] = useState<SideDishOption | null>(null)
  const [includeCustomCake, setIncludeCustomCake] = useState(false)
  const [customCakeCost, setCustomCakeCost] = useState(0)
  const [customCakeRecipes, setCustomCakeRecipes] = useState<CustomCakeRecipeMap>({})
  const [cakeCustomizationState, setCakeCustomizationState] = useState({
    message: '',
    flavor: CUSTOM_CAKE_FLAVORS[0].code,
    size: CUSTOM_CAKE_SIZES[0].code,
    imagePath: ''
  })
  const [cakeImagePreview, setCakeImagePreview] = useState<string | null>(null)
  const [isUploadingCakeImage, setIsUploadingCakeImage] = useState(false)
  const [cakeAiMode, setCakeAiMode] = useState<CakeAiMode>('upload')
  const [cakePrompt, setCakePrompt] = useState('')
  const [cakeAspectRatio, setCakeAspectRatio] = useState<string>(GEMINI_ASPECT_RATIOS[0].value)
  const [isGeneratingCakeImage, setIsGeneratingCakeImage] = useState(false)
  const [cakeEditBaseFile, setCakeEditBaseFile] = useState<File | null>(null)
  const [cakeEditBasePreview, setCakeEditBasePreview] = useState<string | null>(null)
  const [cakeAiStatus, setCakeAiStatus] = useState<CakeAiStatus | null>(null)
  const revokeIfObjectUrl = useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }, [])
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null)
  const [menuEventDiscountMap, setMenuEventDiscountMap] = useState<Record<string, MenuEventDiscountInfo[]>>({})
  const [sideDishEventDiscountMap, setSideDishEventDiscountMap] = useState<Record<string, MenuEventDiscountInfo[]>>({})

  // 배송 정보
  // 사용자가 직접 수정했는지 추적
  const [isScheduleManuallyEdited, setIsScheduleManuallyEdited] = useState(false)

  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>(() => {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + 1)
    const fallbackDate = fallback.toISOString().split('T')[0]
    const normalizedDate = normalizeScheduleDate(deliveryDateParam) || scheduleDateOptions[0] || fallbackDate
    const normalizedTime = normalizeScheduleTime(deliveryTimeParam) || '18:00'

    return {
      address: '',
      recipient_name: '',
      recipient_phone: '',
      delivery_notes: '',
      scheduled_date: normalizedDate,
      scheduled_time_slot: normalizedTime
    }
  })

  // URL 파라미터가 변경될 때만 업데이트 (사용자가 직접 수정한 경우 제외)
  useEffect(() => {
    if (isScheduleManuallyEdited) return // 사용자가 직접 수정한 경우 무시

    const newDate = normalizeScheduleDate(deliveryDateParam)
    if (newDate && newDate !== deliveryInfo.scheduled_date) {
      setDeliveryInfo((prev) => ({
        ...prev,
        scheduled_date: newDate
      }))
    }
  }, [deliveryDateParam, deliveryInfo.scheduled_date, isScheduleManuallyEdited])

  useEffect(() => {
    if (isScheduleManuallyEdited) return // 사용자가 직접 수정한 경우 무시

    const newTime = normalizeScheduleTime(deliveryTimeParam)
    if (newTime && newTime !== deliveryInfo.scheduled_time_slot) {
      setDeliveryInfo((prev) => ({
        ...prev,
        scheduled_time_slot: newTime
      }))
    }
  }, [deliveryTimeParam, deliveryInfo.scheduled_time_slot, isScheduleManuallyEdited])
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
  const fetchMenuInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/menu/${menuCode}`)
      const data = await response.json()

      if (data.success && data.data) {
        setMenuInfo(data.data)
        const selectedStyle = data.data.styles?.find((s: any) => s.code === style)
        const stylePrice = selectedStyle?.price || 0
        const basePriceTotal = stylePrice * quantity
        const customizationAddition = calculateCustomizationCost(menuCode, style, customizationsTotals, quantity)
        setBasePrice(basePriceTotal)
        setCustomizationCost(customizationAddition)
      } else {
        console.error('메뉴 정보 조회 실패:', data)
      }
    } catch (error) {
      console.error('메뉴 정보 조회 실패:', error)
    }
  }, [menuCode, style, quantity, customizationsTotals])

  useEffect(() => {
    if (menuCode && style) {
      fetchMenuInfo()
    }
  }, [menuCode, style, fetchMenuInfo])

  const fetchCustomCakeRecipes = useCallback(async () => {
    try {
      const response = await fetch('/api/side-dishes/custom-cake/recipes', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.detail || '커스텀 케이크 레시피를 불러오지 못했습니다.')
      }
      const recipeMap: CustomCakeRecipeMap = {}
      if (data.data && typeof data.data === 'object') {
        Object.entries(data.data as Record<string, Record<string, any>>).forEach(([flavor, sizeMap]) => {
          recipeMap[flavor] = {}
          if (sizeMap && typeof sizeMap === 'object') {
            Object.entries(sizeMap).forEach(([size, variantPayload]) => {
              const rawIngredients = Array.isArray(variantPayload)
                ? variantPayload
                : Array.isArray(variantPayload?.ingredients)
                  ? variantPayload.ingredients
                  : []
              const processed = Array.isArray(rawIngredients)
                ? rawIngredients.map((ingredient: any) => ({
                  ingredient_code: ingredient?.ingredient_code ?? '',
                  quantity: Number(ingredient?.quantity ?? 0),
                  ingredient_name: getIngredientDisplayName(ingredient?.ingredient_code ?? '')
                })).filter((item) => item.ingredient_code)
                : []
              const priceCandidate = Array.isArray(variantPayload)
                ? 0
                : Number(variantPayload?.price ?? 0)
              recipeMap[flavor][size] = {
                ingredients: processed,
                price: Number.isFinite(priceCandidate) ? Math.max(0, priceCandidate) : 0
              }
            })
          }
        })
      }
      setCustomCakeRecipes(recipeMap)
      setCakeCustomizationState((prev) => {
        const nextFlavor = recipeMap[prev.flavor] ? prev.flavor : CUSTOM_CAKE_FLAVORS[0].code
        const nextSize = recipeMap[nextFlavor]?.[prev.size] ? prev.size : CUSTOM_CAKE_SIZES[0].code
        return {
          ...prev,
          flavor: nextFlavor,
          size: nextSize
        }
      })
    } catch (error) {
      console.error('커스텀 케이크 레시피 조회 실패:', error)
    }
  }, [token])

  useEffect(() => {
    const fetchSideDishes = async () => {
      try {
        const response = await fetch('/api/side-dishes', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        })
        const data = await response.json()

        if (data.success && Array.isArray(data.data)) {
          const mappedDishes: SideDishOption[] = data.data.map(createSideDishOptionFromResponse)

          const customCake = mappedDishes.find((dish) => dish.code === 'custom_cake')
          if (customCake) {
            setCustomCakeOption(customCake)
          } else {
            setCustomCakeOption(buildCustomCakeFallbackOption())
          }

          const filtered = mappedDishes
            .filter((dish) => dish.code !== 'custom_cake')
            .filter((dish) => dish.is_available)
          setSideDishOptions(filtered)
        } else {
          setCustomCakeOption(buildCustomCakeFallbackOption())
          setSideDishOptions([])
        }
      } catch (error) {
        console.error('사이드 디시 정보를 불러오는데 실패했습니다:', error)
        setCustomCakeOption(buildCustomCakeFallbackOption())
        setSideDishOptions([])
      }
    }

    fetchSideDishes()
  }, [token])

  useEffect(() => {
    let isMounted = true

    const fetchEventDiscounts = async () => {
      const hasMenuCode = typeof menuCode === 'string' && menuCode.length > 0
      if (!hasMenuCode && (!sideDishOptions || sideDishOptions.length === 0)) {
        if (isMounted) {
          setMenuEventDiscountMap({})
          setSideDishEventDiscountMap({})
        }
        return
      }

      try {
        const response = await fetch('/api/events')
        if (!response.ok) {
          if (isMounted) {
            setMenuEventDiscountMap({})
            setSideDishEventDiscountMap({})
          }
          return
        }

        const data = await response.json().catch(() => null)
        if (!data || !Array.isArray(data.events)) {
          if (isMounted) {
            setMenuEventDiscountMap({})
            setSideDishEventDiscountMap({})
          }
          return
        }

        const normalizedMenuCode = hasMenuCode ? menuCode.toLowerCase() : ''
        const sideDishLookup = new Map<string, SideDishOption>()
          ; (sideDishOptions || []).forEach((option) => {
            const codeKey = option.code ? option.code.toLowerCase() : ''
            const idKey = option.side_dish_id ? option.side_dish_id.toLowerCase() : ''
            if (codeKey) {
              sideDishLookup.set(codeKey, option)
            }
            if (idKey) {
              sideDishLookup.set(idKey, option)
            }
          })
        if (customCakeOption) {
          const cakeCodeKey = customCakeOption.code ? customCakeOption.code.toLowerCase() : ''
          const cakeIdKey = customCakeOption.side_dish_id ? customCakeOption.side_dish_id.toLowerCase() : ''
          if (cakeCodeKey) {
            sideDishLookup.set(cakeCodeKey, customCakeOption)
          }
          if (cakeIdKey) {
            sideDishLookup.set(cakeIdKey, customCakeOption)
          }
        }

        const menuMap: Record<string, MenuEventDiscountInfo[]> = {}
        const sideMap: Record<string, MenuEventDiscountInfo[]> = {}

        data.events.forEach((event: any) => {
          const discounts = Array.isArray(event?.menu_discounts) ? event.menu_discounts : []
          discounts.forEach((discount: any) => {
            const targetType = String(discount?.target_type ?? discount?.targetType ?? 'MENU').toUpperCase()
            const rawDiscountValue = Number(discount?.discount_value ?? discount?.discountValue ?? 0)
            if (!Number.isFinite(rawDiscountValue) || rawDiscountValue <= 0) {
              return
            }

            const discountType: 'PERCENT' | 'FIXED' = (discount?.discount_type ?? discount?.discountType ?? 'PERCENT') === 'FIXED' ? 'FIXED' : 'PERCENT'
            const normalizedDiscount: MenuEventDiscountInfo = {
              eventId: String(discount?.event_id ?? discount?.eventId ?? event?.event_id ?? event?.id ?? ''),
              title: String(discount?.title ?? event?.title ?? '이벤트 할인'),
              discountType,
              discountValue: rawDiscountValue,
              targetName: undefined,
            }

            if (targetType === 'MENU') {
              const codeRaw = String(discount?.menu_code ?? discount?.menuCode ?? '').toLowerCase()
              if (!codeRaw) {
                return
              }
              if (hasMenuCode && codeRaw !== normalizedMenuCode) {
                return
              }

              normalizedDiscount.targetName = String(discount?.menu_name ?? discount?.menuName ?? event?.title ?? '') || undefined

              if (!menuMap[codeRaw]) {
                menuMap[codeRaw] = []
              }
              menuMap[codeRaw].push(normalizedDiscount)
            } else if (targetType === 'SIDE_DISH') {
              const identifierCandidates = [
                discount?.side_dish_code ?? discount?.sideDishCode,
                discount?.side_dish_id ?? discount?.sideDishId,
              ]
                .map((value) => (value ? String(value).toLowerCase() : ''))
                .filter(Boolean)

              const matchedOption = identifierCandidates
                .map((identifier) => sideDishLookup.get(identifier))
                .find(Boolean)

              if (!matchedOption && identifierCandidates.length === 0) {
                return
              }

              const canonicalKey = matchedOption?.code
                ? matchedOption.code.toLowerCase()
                : identifierCandidates[0]

              if (!canonicalKey) {
                return
              }

              normalizedDiscount.targetName = matchedOption?.name
                || String(discount?.side_dish_name ?? discount?.sideDishName ?? '')
                || undefined

              if (!sideMap[canonicalKey]) {
                sideMap[canonicalKey] = []
              }
              sideMap[canonicalKey].push(normalizedDiscount)
            }
          })
        })

        if (isMounted) {
          setMenuEventDiscountMap(menuMap)
          setSideDishEventDiscountMap(sideMap)
        }
      } catch (error) {
        console.error('이벤트 할인 정보를 불러오는데 실패했습니다:', error)
        if (isMounted) {
          setMenuEventDiscountMap({})
          setSideDishEventDiscountMap({})
        }
      }
    }

    fetchEventDiscounts()

    return () => {
      isMounted = false
    }
  }, [menuCode, sideDishOptions, customCakeOption])

  useEffect(() => {
    fetchCustomCakeRecipes()
  }, [fetchCustomCakeRecipes])

  const selectedFlavorCode = cakeCustomizationState.flavor
  const selectedSizeCode = cakeCustomizationState.size

  const selectedCustomCakeVariant = useMemo<CustomCakeRecipeVariant | null>(() => {
    const flavorMap = customCakeRecipes[selectedFlavorCode]
    if (flavorMap && flavorMap[selectedSizeCode]) {
      return flavorMap[selectedSizeCode]
    }
    return null
  }, [customCakeRecipes, selectedFlavorCode, selectedSizeCode])

  const selectedCustomCakeIngredients = useMemo<SideDishIngredient[]>(() => {
    if (selectedCustomCakeVariant && selectedCustomCakeVariant.ingredients.length > 0) {
      return selectedCustomCakeVariant.ingredients
    }
    if (customCakeOption?.ingredients) {
      return customCakeOption.ingredients
    }
    return []
  }, [selectedCustomCakeVariant, customCakeOption])

  const selectedFlavorLabel = useMemo(() => {
    return CUSTOM_CAKE_FLAVORS.find((item) => item.code === selectedFlavorCode)?.label || '기본'
  }, [selectedFlavorCode])

  const selectedSizeLabel = useMemo(() => {
    return CUSTOM_CAKE_SIZES.find((item) => item.code === selectedSizeCode)?.label || '기본'
  }, [selectedSizeCode])

  const selectedCustomCakeUnitPrice = useMemo(() => {
    if (selectedCustomCakeVariant && Number.isFinite(Number(selectedCustomCakeVariant.price))) {
      return Math.max(0, selectedCustomCakeVariant.price)
    }
    return customCakeOption?.unit_price ?? 0
  }, [selectedCustomCakeVariant, customCakeOption?.unit_price])

  const cakePreviewSrc = cakeImagePreview || cakeCustomizationState.imagePath || ''

  useEffect(() => {
    const cost = sideDishOptions.reduce<number>((sum, dish) => {
      const qty = sideDishSelections[dish.code] || 0
      return sum + dish.unit_price * qty
    }, 0)
    setSideDishCost(cost)
  }, [sideDishOptions, sideDishSelections])

  useEffect(() => {
    if (includeCustomCake) {
      setCustomCakeCost(selectedCustomCakeUnitPrice)
    } else {
      setCustomCakeCost(0)
    }
  }, [includeCustomCake, selectedCustomCakeUnitPrice])

  useEffect(() => {
    if (menuCode === 'cake' && customCakeOption) {
      setIncludeCustomCake(true)
    }
  }, [menuCode, customCakeOption])

  const fetchDefaultDeliveryInfo = useCallback(async () => {
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
  }, [user?.id])

  // 기본 배송지 정보 가져오기
  useEffect(() => {
    if (user?.id) {
      fetchDefaultDeliveryInfo()
    } else {
      // 비로그인 사용자는 바로 입력 모드
      setIsEditingAddress(true)
      setHasDefaultAddress(false)
    }
  }, [user?.id, fetchDefaultDeliveryInfo])

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

  useEffect(() => {
    setOriginalPrice(basePrice + customizationCost + sideDishCost + customCakeCost)
  }, [basePrice, customizationCost, sideDishCost, customCakeCost])

  const calculateSequentialDiscounts = useCallback(
    (baseAmount: number, quantityValue: number, discounts: MenuEventDiscountInfo[]) => {
      const normalizedBase = Math.max(0, Math.round(Number(baseAmount) || 0))
      const normalizedQuantity = Math.max(1, Math.round(Number(quantityValue) || 0))

      if (normalizedBase <= 0 || !Array.isArray(discounts) || discounts.length === 0) {
        return { total: 0, breakdown: [] as Array<{ info: MenuEventDiscountInfo; amount: number }> }
      }

      let remaining = normalizedBase
      const breakdown: Array<{ info: MenuEventDiscountInfo; amount: number }> = []

      discounts.forEach((discount) => {
        if (!discount) return
        const value = Number(discount.discountValue)
        if (!Number.isFinite(value) || value <= 0 || remaining <= 0) return

        let calculated = 0
        if (discount.discountType === 'PERCENT') {
          calculated = Math.round(normalizedBase * (value / 100))
        } else {
          calculated = Math.round(value * normalizedQuantity)
        }

        if (calculated <= 0) return

        const applied = Math.min(calculated, remaining)
        if (applied <= 0) return

        breakdown.push({ info: discount, amount: applied })
        remaining = Math.max(0, remaining - applied)
      })

      const total = breakdown.reduce((sum, entry) => sum + entry.amount, 0)
      return { total, breakdown }
    },
    []
  )

  type EventDiscountBreakdownEntry = {
    info: MenuEventDiscountInfo
    amount: number
    targetType: 'MENU' | 'SIDE_DISH'
    targetCode?: string
    targetName?: string
  }

  const normalizedMenuCode = useMemo(() => (menuCode ? menuCode.toLowerCase() : ''), [menuCode])

  const menuEventDiscountBreakdown = useMemo<EventDiscountBreakdownEntry[]>(() => {
    if (!normalizedMenuCode) return []
    const discounts = menuEventDiscountMap[normalizedMenuCode] || []
    if (!discounts.length) return []

    const { breakdown } = calculateSequentialDiscounts(basePrice, quantity, discounts)
    return breakdown.map((entry) => ({
      info: entry.info,
      amount: entry.amount,
      targetType: 'MENU',
      targetCode: normalizedMenuCode,
      targetName: entry.info.targetName || menuInfo?.name,
    }))
  }, [normalizedMenuCode, menuEventDiscountMap, calculateSequentialDiscounts, basePrice, quantity, menuInfo?.name])

  const sideDishEventDiscountSummary = useMemo(() => {
    const byCode: Record<string, number> = {}
    const breakdown: EventDiscountBreakdownEntry[] = []
    let total = 0

    const selectionEntries: Array<{ code: string; quantity: number }> = Object.entries(sideDishSelections).map(
      ([code, qty]) => ({
        code,
        quantity: Number(qty) || 0,
      })
    )

    if (includeCustomCake && customCakeOption) {
      selectionEntries.push({
        code: customCakeOption.code,
        quantity: 1,
      })
    }

    selectionEntries.forEach(({ code, quantity }) => {
      const safeQty = Math.max(0, Math.round(Number(quantity) || 0))
      if (safeQty <= 0) return

      const normalizedCode = String(code || '').toLowerCase()
      const discounts = sideDishEventDiscountMap[normalizedCode] || []
      if (!discounts.length) return

      const dish =
        sideDishOptions.find((option) => option.code === code) ||
        (customCakeOption && customCakeOption.code === code ? customCakeOption : undefined)
      if (!dish) return

      const dishUnitPrice = customCakeOption && customCakeOption.code === code
        ? selectedCustomCakeUnitPrice
        : dish.unit_price
      const baseAmount = Math.max(0, Math.round(dishUnitPrice * safeQty))
      if (baseAmount <= 0) return

      const { breakdown: dishBreakdown, total: dishTotal } = calculateSequentialDiscounts(baseAmount, safeQty, discounts)
      if (dishTotal <= 0) return

      byCode[normalizedCode] = dishTotal
      total += dishTotal

      dishBreakdown.forEach((entry) => {
        breakdown.push({
          info: entry.info,
          amount: entry.amount,
          targetType: 'SIDE_DISH',
          targetCode: normalizedCode,
          targetName: dish.name,
        })
      })
    })

    return { total, breakdown, byCode }
  }, [sideDishSelections, sideDishEventDiscountMap, sideDishOptions, calculateSequentialDiscounts, includeCustomCake, customCakeOption, selectedCustomCakeUnitPrice])

  const menuEventDiscountAmount = useMemo(
    () => menuEventDiscountBreakdown.reduce((sum, entry) => sum + entry.amount, 0),
    [menuEventDiscountBreakdown]
  )

  const sideDishEventDiscountAmount = sideDishEventDiscountSummary.total
  const sideDishEventDiscountByCode = sideDishEventDiscountSummary.byCode
  const sideDishEventDiscountBreakdown = sideDishEventDiscountSummary.breakdown

  const combinedEventDiscountBreakdown = useMemo(
    () => [...menuEventDiscountBreakdown, ...sideDishEventDiscountBreakdown],
    [menuEventDiscountBreakdown, sideDishEventDiscountBreakdown]
  )

  const totalEventDiscountAmount = menuEventDiscountAmount + sideDishEventDiscountAmount
  const loyaltyDiscountAmount = discountInfo?.eligible
    ? Math.round(originalPrice * discountInfo.discount_rate)
    : 0
  const finalPrice = Math.max(0, originalPrice - totalEventDiscountAmount - loyaltyDiscountAmount)
  const totalSavings = totalEventDiscountAmount + loyaltyDiscountAmount
  const loyaltyRatePercent = discountInfo?.eligible ? Math.round(discountInfo.discount_rate * 100) : 0

  const totalSideDishOriginalCost = sideDishCost + customCakeCost
  const totalSideDishFinalCost = Math.max(0, totalSideDishOriginalCost - sideDishEventDiscountAmount)

  const customCakeEventDiscountAmount = useMemo(() => {
    if (!includeCustomCake || !customCakeOption) return 0
    const key = customCakeOption.code ? customCakeOption.code.toLowerCase() : ''
    if (!key) return 0
    return sideDishEventDiscountByCode?.[key] || 0
  }, [includeCustomCake, customCakeOption, sideDishEventDiscountByCode])

  const customCakeFinalAddition = useMemo(() => {
    if (!includeCustomCake || !customCakeOption) return 0
    return Math.max(0, selectedCustomCakeUnitPrice - customCakeEventDiscountAmount)
  }, [includeCustomCake, customCakeOption, selectedCustomCakeUnitPrice, customCakeEventDiscountAmount])

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const validation = validateForm()

    if (!validation.isValid) {
      // 어떤 필드가 문제인지 사용자에게 알려주기
      const errorMessages = Object.entries(validation.errors).map(([, message]) => `- ${message}`).join('\n')
      alert(`입력 정보를 확인해주세요:\n\n${errorMessages}`)
      return
    }

    setIsProcessing(true)

    try {
      const sideDishPayload: Array<{ code: string; quantity: number; flavor?: string; size?: string }> = Object.entries(sideDishSelections)
        .map(([code, qty]) => ({ code, quantity: Number(qty) || 0 }))
        .filter((item) => item.quantity > 0)

      if (includeCustomCake && customCakeOption) {
        sideDishPayload.push({
          code: customCakeOption.code,
          quantity: 1,
          flavor: cakeCustomizationState.flavor,
          size: cakeCustomizationState.size
        })
      }

      const cakeCustomizationPayloadRaw = includeCustomCake
        ? {
          message: cakeCustomizationState.message || undefined,
          flavor: cakeCustomizationState.flavor || undefined,
          size: cakeCustomizationState.size || undefined,
          image_path: cakeCustomizationState.imagePath || undefined,
          status: 'REQUESTED'
        }
        : undefined

      const hasCakeCustomization = includeCustomCake && !!cakeCustomizationPayloadRaw

      const checkoutRequest: CheckoutRequest = {
        menu_code: menuCode,
        style: style,
        quantity: quantity,
        delivery: deliveryInfo,
        payment: paymentInfo,
        user_id: user?.id,
        save_as_default_address: saveAsDefault,
        customizations: customizationsTotals || undefined,
        side_dishes: sideDishPayload.length > 0 ? sideDishPayload : undefined,
        cake_customization: hasCakeCustomization ? cakeCustomizationPayloadRaw : undefined
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
        if (data.pricing) {
          const serializedPricing = JSON.stringify(data.pricing)
          sessionStorage.setItem('lastOrderPricing', serializedPricing)
          sessionStorage.setItem('lastPricingInfo', serializedPricing)
        }

        // 결제 성공 → 주문 완료 페이지로 이동
        router.push(`/order-complete/${data.order_id}`)
      } else {
        alert(data.message || '결제 처리에 실패했습니다.')
        setIsProcessing(false)
      }
    } catch {
      alert('결제 처리 중 오류가 발생했습니다.')
      setIsProcessing(false)
    }
  }

  const handleSideDishQuantityChange = (code: string, quantity: number) => {
    setSideDishSelections(prev => {
      const next = { ...prev }
      const safeQuantity = Number.isNaN(quantity) ? 0 : Math.max(0, Math.floor(quantity))
      if (safeQuantity > 0) {
        next[code] = safeQuantity
      } else {
        delete next[code]
      }
      return next
    })
  }

  const handleCakeCustomizationChange = (field: 'message' | 'flavor' | 'size', value: string) => {
    setCakeCustomizationState(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleCakeImageUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    setCakeAiStatus(null)
    setCakeAiMode('upload')
    setIsUploadingCakeImage(true)
    try {
      const response = await fetch('/api/cake/customizations/upload-image', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setCakeCustomizationState(prev => ({
          ...prev,
          imagePath: data.image_path || ''
        }))
        revokeIfObjectUrl(cakeImagePreview)
        setCakeImagePreview(URL.createObjectURL(file))
        revokeIfObjectUrl(cakeEditBasePreview)
        setCakeEditBaseFile(null)
        setCakeEditBasePreview(null)
        setCakeAiStatus({ type: 'success', message: '참고 이미지를 업로드했어요.' })
      } else {
        const message = data.detail || data.error || '이미지 업로드에 실패했습니다.'
        setCakeAiStatus({ type: 'error', message })
        alert(message)
      }
    } catch (error) {
      console.error('케이크 이미지 업로드 실패:', error)
      const message = '이미지 업로드 중 오류가 발생했습니다.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
    } finally {
      setIsUploadingCakeImage(false)
    }
  }

  const handleCakeEditBaseFileChange = (file: File | null) => {
    revokeIfObjectUrl(cakeEditBasePreview)
    if (file) {
      setCakeEditBaseFile(file)
      setCakeEditBasePreview(URL.createObjectURL(file))
    } else {
      setCakeEditBaseFile(null)
      setCakeEditBasePreview(null)
    }
  }

  const handleCakePromptGenerate = async () => {
    const trimmed = cakePrompt.trim()
    if (!trimmed) {
      const message = '생성할 케이크에 대한 프롬프트를 입력해주세요.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
      return
    }

    setCakePrompt(trimmed)
    setCakeAiStatus(null)
    setIsGeneratingCakeImage(true)
    setCakeAiMode('prompt')

    try {
      const response = await fetch('/api/cake/customizations/generate-ai-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: trimmed,
          aspect_ratio: cakeAspectRatio
        })
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setCakeCustomizationState((prev) => ({
          ...prev,
          imagePath: data.image_path || ''
        }))
        revokeIfObjectUrl(cakeImagePreview)
        setCakeImagePreview(data.image_path || '')
        handleCakeEditBaseFileChange(null)
        setCakeAiStatus({ type: 'success', message: 'Gemini가 케이크 이미지를 생성했어요.' })
      } else {
        const message = data.detail || data.error || 'AI 이미지 생성에 실패했습니다.'
        setCakeAiStatus({ type: 'error', message })
        alert(message)
      }
    } catch (error) {
      console.error('케이크 이미지 생성 실패:', error)
      const message = 'AI 이미지 생성 중 오류가 발생했습니다.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
    } finally {
      setIsGeneratingCakeImage(false)
    }
  }

  const handleCakePromptEdit = async () => {
    const trimmed = cakePrompt.trim()
    if (!trimmed) {
      const message = '수정할 내용을 프롬프트로 입력해주세요.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
      return
    }

    if (!cakeEditBaseFile && !cakeCustomizationState.imagePath) {
      const message = '먼저 수정할 케이크 이미지를 업로드하거나 생성해주세요.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
      return
    }

    setCakePrompt(trimmed)
    setCakeAiStatus(null)
    setIsGeneratingCakeImage(true)
    setCakeAiMode('edit')

    const formData = new FormData()
    formData.append('prompt', trimmed)
    formData.append('aspect_ratio', cakeAspectRatio)
    if (cakeEditBaseFile) {
      formData.append('file', cakeEditBaseFile)
    } else if (cakeCustomizationState.imagePath) {
      formData.append('existing_image_path', cakeCustomizationState.imagePath)
    }

    try {
      const response = await fetch('/api/cake/customizations/edit-ai-image', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setCakeCustomizationState((prev) => ({
          ...prev,
          imagePath: data.image_path || ''
        }))
        revokeIfObjectUrl(cakeImagePreview)
        setCakeImagePreview(data.image_path || '')
        handleCakeEditBaseFileChange(null)
        setCakeAiStatus({ type: 'success', message: 'Gemini가 이미지를 반영해 케이크를 수정했어요.' })
      } else {
        const message = data.detail || data.error || 'AI 이미지 수정에 실패했습니다.'
        setCakeAiStatus({ type: 'error', message })
        alert(message)
      }
    } catch (error) {
      console.error('케이크 이미지 수정 실패:', error)
      const message = 'AI 이미지 수정 중 오류가 발생했습니다.'
      setCakeAiStatus({ type: 'error', message })
      alert(message)
    } finally {
      setIsGeneratingCakeImage(false)
    }
  }
  useEffect(() => {
    return () => {
      revokeIfObjectUrl(cakeImagePreview)
    }
  }, [cakeImagePreview, revokeIfObjectUrl])

  useEffect(() => {
    if (!includeCustomCake) {
      revokeIfObjectUrl(cakeImagePreview)
      setCakeImagePreview(null)
      revokeIfObjectUrl(cakeEditBasePreview)
      setCakeEditBaseFile(null)
      setCakeEditBasePreview(null)
      setCakeCustomizationState({
        message: '',
        flavor: CUSTOM_CAKE_FLAVORS[0].code,
        size: CUSTOM_CAKE_SIZES[0].code,
        imagePath: ''
      })
      setCakeAiStatus(null)
      setCakePrompt('')
      setCakeAspectRatio(GEMINI_ASPECT_RATIOS[0].value)
      setCakeAiMode('upload')
      setIsGeneratingCakeImage(false)
    }
  }, [includeCustomCake, cakeImagePreview, cakeEditBasePreview, revokeIfObjectUrl])

  useEffect(() => {
    return () => {
      revokeIfObjectUrl(cakeEditBasePreview)
    }
  }, [cakeEditBasePreview, revokeIfObjectUrl])

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

                        {customizationsTotals && Object.keys(customizationsTotals).length > 0 && (() => {
                          const baseIngredients = MENU_INGREDIENTS[menuCode]?.[style] || {}
                          const changedItems = Object.entries(customizationsTotals).filter(([ingredient, qty]) => {
                            const basePerSet = baseIngredients[ingredient] || 0
                            const baseTotal = basePerSet * quantity
                            return baseTotal !== Number(qty)
                          })

                          if (changedItems.length === 0) return null

                          return (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h4 className="text-sm font-bold text-gray-800 mb-2">🔧 재료 커스터마이징</h4>
                              <div className="space-y-1">
                                {changedItems.map(([ingredient, qty]) => {
                                  const basePerSet = baseIngredients[ingredient] || 0
                                  const baseTotal = basePerSet * quantity
                                  const qtyNum = Number(qty)
                                  const diff = qtyNum - baseTotal

                                  return (
                                    <div key={ingredient} className="flex justify-between text-xs">
                                      <span className="text-gray-700">{INGREDIENT_DISPLAY_NAMES[ingredient] || ingredient}</span>
                                      <span className="font-medium text-blue-600">
                                        {baseTotal}개 → {qtyNum}개
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

                        {(Object.keys(sideDishSelections).length > 0 || (includeCustomCake && customCakeOption)) && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-bold text-gray-800 mb-2">🍽️ 추가 사이드 디시</h4>
                            <div className="space-y-2">
                              {Object.entries(sideDishSelections).map(([code, qty]) => {
                                const dish = sideDishOptions.find(d => d.code === code)
                                if (!dish) return null

                                const normalizedCode = String(code || '').toLowerCase()
                                const originalAddition = Math.max(0, Math.round(dish.unit_price * (Number(qty) || 0)))
                                const discountAmountForDish = sideDishEventDiscountByCode?.[normalizedCode] || 0
                                const finalAddition = Math.max(0, originalAddition - discountAmountForDish)

                                return (
                                  <div key={code} className="flex justify-between text-xs items-start gap-3">
                                    <div className="flex flex-col">
                                      <span className="text-gray-700 font-medium">{dish.name}</span>
                                      {discountAmountForDish > 0 && (
                                        <span className="text-[11px] text-blue-600 font-semibold mt-1">
                                          이벤트 할인 -{discountAmountForDish.toLocaleString()}원
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <div className="text-xs text-purple-600 font-medium">
                                        {Number(qty) || 0}개
                                      </div>
                                      {discountAmountForDish > 0 ? (
                                        <div className="mt-0.5">
                                          <div className="text-[11px] text-gray-400 line-through">
                                            +{originalAddition.toLocaleString()}원
                                          </div>
                                          <div className="text-xs font-semibold text-purple-700">
                                            +{finalAddition.toLocaleString()}원
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-xs font-semibold text-purple-700 mt-0.5">
                                          +{originalAddition.toLocaleString()}원
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              {includeCustomCake && customCakeOption && (
                                <div className="flex justify-between text-xs items-start gap-3">
                                  <div className="text-gray-700">
                                    <span className="font-medium">{customCakeOption.name}</span>
                                    <span className="ml-2 text-pink-500">{selectedFlavorLabel} · {selectedSizeLabel}</span>
                                    {customCakeEventDiscountAmount > 0 && (
                                      <div className="text-[11px] text-pink-600 font-semibold mt-1">
                                        이벤트 할인 -{customCakeEventDiscountAmount.toLocaleString()}원
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-pink-600 font-medium">1개</div>
                                    {customCakeEventDiscountAmount > 0 ? (
                                      <div className="mt-0.5">
                                        <div className="text-[11px] text-gray-400 line-through">
                                          +{selectedCustomCakeUnitPrice.toLocaleString()}원
                                        </div>
                                        <div className="text-xs font-semibold text-pink-700">
                                          +{customCakeFinalAddition.toLocaleString()}원
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-xs font-semibold text-pink-700 mt-0.5">
                                        +{selectedCustomCakeUnitPrice.toLocaleString()}원
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {combinedEventDiscountBreakdown.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-blue-100">
                            <h4 className="text-sm font-bold text-blue-800 mb-2">🎉 이벤트 할인 적용 내역</h4>
                            <ul className="space-y-1 text-xs text-blue-700">
                              {combinedEventDiscountBreakdown.map((entry) => (
                                <li
                                  key={`${entry.info.eventId}-${entry.targetType}-${entry.targetCode}-${entry.amount}`}
                                  className="flex justify-between items-center gap-3"
                                >
                                  <span className="flex-1">
                                    {entry.info.title}
                                    {entry.targetType === 'SIDE_DISH' && (
                                      <span className="text-[11px] text-blue-500 ml-1">(사이드: {entry.targetName || '사이드 메뉴'})</span>
                                    )}
                                    <span className="ml-1 text-[11px] text-blue-500">
                                      {entry.info.discountType === 'PERCENT'
                                        ? `(${entry.info.discountValue}% 할인)`
                                        : `(${entry.info.discountValue.toLocaleString()}원 할인)`}
                                    </span>
                                  </span>
                                  <span className="font-semibold text-blue-900">
                                    -{entry.amount.toLocaleString()}원
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {includeCustomCake && (
                          (cakeCustomizationState.message || cakeCustomizationState.flavor || cakeCustomizationState.size || cakeCustomizationState.imagePath) && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h4 className="text-sm font-bold text-gray-800 mb-2">🎂 케이크 커스터마이징</h4>
                              <div className="space-y-1 text-xs text-gray-700">
                                {cakeCustomizationState.message && (
                                  <div>
                                    <span className="font-medium text-gray-800">메시지: </span>
                                    {cakeCustomizationState.message}
                                  </div>
                                )}
                                {selectedFlavorLabel && (
                                  <div>
                                    <span className="font-medium text-gray-800">맛: </span>
                                    {selectedFlavorLabel}
                                  </div>
                                )}
                                {selectedSizeLabel && (
                                  <div>
                                    <span className="font-medium text-gray-800">사이즈: </span>
                                    {selectedSizeLabel}
                                  </div>
                                )}
                                {cakeCustomizationState.imagePath && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-800">참고 이미지:</span>
                                    <span className="text-blue-600 underline text-xs">
                                      업로드 완료
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* 가격 정보 */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>기본 금액</span>
                        <span>{basePrice.toLocaleString()}원</span>
                      </div>
                      {customizationCost > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>커스터마이징 추가금</span>
                          <span className="text-blue-600">+{customizationCost.toLocaleString()}원</span>
                        </div>
                      )}
                      {sideDishCost > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>사이드 디시</span>
                          <span className="text-purple-600">+{sideDishCost.toLocaleString()}원</span>
                        </div>
                      )}
                      {customCakeCost > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>커스터마이징 케이크</span>
                          <span className="text-pink-600">+{customCakeCost.toLocaleString()}원</span>
                        </div>
                      )}
                      {(customizationCost > 0 || sideDishCost > 0 || customCakeCost > 0) && <div className="h-px bg-gray-200" />}

                      {totalSavings > 0 ? (
                        <>
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>원가</span>
                            <span className="line-through">{originalPrice.toLocaleString()}원</span>
                          </div>
                          {totalEventDiscountAmount > 0 && (
                            <div className="flex justify-between text-sm text-blue-600">
                              <span>이벤트 할인</span>
                              <span>-{totalEventDiscountAmount.toLocaleString()}원</span>
                            </div>
                          )}
                          {loyaltyDiscountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm text-red-600">
                              <span>{discountInfo?.customer_type || '단골'} 할인</span>
                              <div className="flex items-center gap-2">
                                {loyaltyRatePercent > 0 && (
                                  <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs font-medium">
                                    {loyaltyRatePercent}% 할인
                                  </span>
                                )}
                                <span>-{loyaltyDiscountAmount.toLocaleString()}원</span>
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between text-lg font-bold border-t pt-3">
                            <span>최종 결제 금액</span>
                            <span className="text-blue-600">{finalPrice.toLocaleString()}원</span>
                          </div>
                          <div className="text-right text-xs text-green-600 font-medium">
                            총 {totalSavings.toLocaleString()}원 절약!
                          </div>
                        </>
                      ) : (
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
                            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.address ? 'border-red-500' : 'border-gray-300'
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
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${!isEditingAddress
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
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${!isEditingAddress
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
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => {
                              const selectedDate = e.target.value
                              const today = new Date().toISOString().split('T')[0]

                              // 과거 날짜 검증
                              if (selectedDate && selectedDate < today) {
                                setErrors({ ...errors, scheduled_date: '과거 날짜는 선택할 수 없습니다' })
                                return
                              }

                              setIsScheduleManuallyEdited(true) // 사용자가 직접 수정했음을 표시
                              setDeliveryInfo({ ...deliveryInfo, scheduled_date: selectedDate })
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
                                  setIsScheduleManuallyEdited(true) // 사용자가 직접 수정했음을 표시
                                  setDeliveryInfo({ ...deliveryInfo, scheduled_date: dateOption })
                                  if (errors.scheduled_date) setErrors({ ...errors, scheduled_date: '' })
                                }}
                                className={`px-3 py-1 rounded-lg text-sm transition-colors ${deliveryInfo.scheduled_date === dateOption
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
                              setIsScheduleManuallyEdited(true) // 사용자가 직접 수정했음을 표시
                              setDeliveryInfo({ ...deliveryInfo, scheduled_time_slot: e.target.value })
                              if (errors.scheduled_time_slot) setErrors({ ...errors, scheduled_time_slot: '' })
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">시간 선택</option>
                            {SCHEDULE_TIME_SLOTS.map((slot: (typeof SCHEDULE_TIME_SLOTS)[number]) => (
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

                {/* 사이드 디시 선택 섹션 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">사이드 디시 추가</h2>
                    {totalSideDishOriginalCost > 0 && (
                      <div className="text-right text-sm font-medium text-purple-600">
                        {sideDishEventDiscountAmount > 0 && (
                          <div className="text-xs text-gray-400 line-through">
                            +{totalSideDishOriginalCost.toLocaleString()}원
                          </div>
                        )}
                        <div>+{totalSideDishFinalCost.toLocaleString()}원</div>
                      </div>
                    )}
                  </div>
                  {sideDishOptions.length === 0 && !customCakeOption ? (
                    <p className="text-sm text-gray-600">현재 추가 가능한 사이드 디시가 없습니다.</p>
                  ) : (
                    <div className="space-y-4">
                      {sideDishOptions.length > 0 &&
                        sideDishOptions.map((dish) => (
                          <div key={dish.code} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-800">{dish.name}</h3>
                                {dish.description && (
                                  <p className="text-sm text-gray-600 mt-1">{dish.description}</p>
                                )}
                                <p className="text-sm text-gray-600 mt-1">1개당 {dish.unit_price.toLocaleString()}원</p>
                                {dish.base_price <= 0 && (
                                  <p className="text-xs text-gray-500 mt-1">※ 재료 원가를 기준으로 산출한 예상 금액입니다.</p>
                                )}
                                {dish.ingredients.length > 0 && (
                                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">구성 재료</p>
                                    <ul className="space-y-1 text-xs text-gray-600">
                                      {dish.ingredients.map((ingredient) => (
                                        <li key={`${dish.code}-${ingredient.ingredient_code}`} className="flex justify-between gap-6">
                                          <span className="truncate">{ingredient.ingredient_name}</span>
                                          <span className="font-medium text-gray-700">{formatIngredientQuantity(ingredient.quantity)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <div className="w-32">
                                <label className="block text-xs font-medium text-gray-600 mb-1">수량</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={sideDishSelections[dish.code] || 0}
                                  onChange={(e) => handleSideDishQuantityChange(dish.code, Number(e.target.value))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                      {customCakeOption && (
                        <div className="border border-pink-200 rounded-lg p-4 bg-pink-50">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-pink-800 flex items-center gap-2">
                                🎂 {customCakeOption.name}
                              </h3>
                              <p className="text-sm text-pink-700 mt-1">
                                {customCakeOption.description || '메인 디너와 함께 제공되는 맞춤형 케이크 옵션입니다.'}
                              </p>
                              <p className="text-sm text-pink-600 mt-1">
                                1개당 {selectedCustomCakeUnitPrice.toLocaleString()}원
                              </p>
                              {customCakeEventDiscountAmount > 0 && (
                                <p className="text-xs text-pink-700 mt-1 font-semibold">
                                  이벤트 할인 -{customCakeEventDiscountAmount.toLocaleString()}원 → +{customCakeFinalAddition.toLocaleString()}원
                                </p>
                              )}
                              <p className="text-xs text-pink-600 mt-1">현재 선택: {selectedFlavorLabel} · {selectedSizeLabel}</p>
                              {customCakeOption.base_price <= 0 && (
                                <p className="text-xs text-pink-500 mt-1">※ 재료 원가를 기준으로 산출한 예상 금액입니다.</p>
                              )}
                              {selectedCustomCakeIngredients.length > 0 && (
                                <div className="mt-3 bg-white border border-pink-200 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-pink-700 mb-2">기본 구성 재료</p>
                                  <ul className="space-y-1 text-xs text-pink-700">
                                    {selectedCustomCakeIngredients.map((ingredient) => (
                                      <li key={`custom-cake-${ingredient.ingredient_code}`} className="flex justify-between gap-6">
                                        <span className="truncate">{ingredient.ingredient_name}</span>
                                        <span className="font-medium text-pink-800">{formatIngredientQuantity(ingredient.quantity)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setIncludeCustomCake((prev) => !prev)}
                              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${includeCustomCake
                                ? 'bg-pink-600 text-white hover:bg-pink-700'
                                : 'bg-white border border-pink-300 text-pink-700 hover:bg-pink-100'
                                }`}
                            >
                              {includeCustomCake ? '추가됨' : '추가하기'}
                            </button>
                          </div>

                          {includeCustomCake && (
                            <div className="space-y-5 bg-white border border-pink-200 rounded-lg p-4">
                              <p className="text-xs text-pink-600">
                                원하는 메시지, 맛, 사이즈와 이미지를 지정하면 제빵사가 참고해 맞춤 제작합니다. AI를 활용해 아이디어를 얻을 수도 있어요.
                              </p>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">케이크 메시지</label>
                                <textarea
                                  value={cakeCustomizationState.message}
                                  onChange={(e) => handleCakeCustomizationChange('message', e.target.value)}
                                  rows={2}
                                  placeholder="예: Happy Anniversary!"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">맛 선택</label>
                                  <select
                                    value={cakeCustomizationState.flavor}
                                    onChange={(e) => handleCakeCustomizationChange('flavor', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  >
                                    {CUSTOM_CAKE_FLAVORS.map((flavor) => (
                                      <option key={flavor.code} value={flavor.code}>{flavor.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">사이즈</label>
                                  <select
                                    value={cakeCustomizationState.size}
                                    onChange={(e) => handleCakeCustomizationChange('size', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  >
                                    {CUSTOM_CAKE_SIZES.map((size) => (
                                      <option key={size.code} value={size.code}>{size.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="pt-4 border-t border-pink-100 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div>
                                    <h4 className="text-sm font-semibold text-pink-800">Gemini 케이크 디자인 도구</h4>
                                    <p className="text-xs text-pink-600">
                                      Google Gemini 2.5 Flash Image 모델을 사용해 텍스트나 이미지를 기반으로 케이크 디자인을 제안합니다.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-gray-600">출력 비율</label>
                                    <select
                                      value={cakeAspectRatio}
                                      onChange={(e) => setCakeAspectRatio(e.target.value)}
                                      className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    >
                                      {GEMINI_ASPECT_RATIOS.map((ratio) => (
                                        <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {CAKE_AI_MODES.map((mode) => (
                                    <button
                                      key={mode.value}
                                      type="button"
                                      onClick={() => setCakeAiMode(mode.value)}
                                      className={`px-3 py-1.5 text-sm rounded-full border transition ${cakeAiMode === mode.value
                                        ? 'bg-pink-600 text-white border-pink-600'
                                        : 'bg-white text-pink-700 border-pink-200 hover:bg-pink-50'
                                        }`}
                                    >
                                      {mode.label}
                                    </button>
                                  ))}
                                </div>
                                {cakeAiStatus && (
                                  <div
                                    className={`text-xs font-medium px-3 py-2 rounded-md border ${cakeAiStatus.type === 'success'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                      }`}
                                  >
                                    {cakeAiStatus.message}
                                  </div>
                                )}
                                {cakeAiMode === 'upload' && (
                                  <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">참고 이미지 업로드</label>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] || null
                                          if (file) {
                                            handleCakeImageUpload(file)
                                          }
                                        }}
                                        className="w-full text-sm"
                                      />
                                      {isUploadingCakeImage && <span className="text-sm text-gray-600">업로드 중...</span>}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                      직접 촬영한 케이크나 참고 이미지를 업로드하면 그대로 제작팀에 전달돼요.
                                    </p>
                                  </div>
                                )}
                                {cakeAiMode === 'prompt' && (
                                  <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">프롬프트</label>
                                    <textarea
                                      value={cakePrompt}
                                      onChange={(e) => setCakePrompt(e.target.value)}
                                      rows={3}
                                      placeholder="예: 새하얀 크림에 딸기와 금박을 올린 2단 기념일 케이크"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    />
                                    <div className="flex flex-wrap items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={handleCakePromptGenerate}
                                        disabled={isGeneratingCakeImage}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                      >
                                        {isGeneratingCakeImage ? '생성 중...' : 'AI로 생성'}
                                      </button>
                                      <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
                                        프롬프트는 케이크 중심으로 자동 보정되어 안전하게 생성돼요.
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {cakeAiMode === 'edit' && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700">수정할 이미지 선택</label>
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => handleCakeEditBaseFileChange(e.target.files?.[0] || null)}
                                          className="w-full text-sm"
                                        />
                                        {!cakeEditBaseFile && cakeCustomizationState.imagePath && (
                                          <span className="text-xs text-gray-500">
                                            현재 선택된 이미지를 기반으로 수정합니다.
                                          </span>
                                        )}
                                      </div>
                                      {cakeEditBasePreview && (
                                        <div className="mt-2">
                                          <img src={cakeEditBasePreview} alt="AI 수정용 원본" className="w-32 h-32 object-cover rounded-lg border" />
                                        </div>
                                      )}
                                      {!cakeEditBaseFile && !cakeCustomizationState.imagePath && (
                                        <p className="text-xs text-red-500 mt-2">
                                          먼저 이미지 생성 또는 업로드 후 수정할 수 있습니다.
                                        </p>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block text-sm font-medium text-gray-700">프롬프트</label>
                                      <textarea
                                        value={cakePrompt}
                                        onChange={(e) => setCakePrompt(e.target.value)}
                                        rows={3}
                                        placeholder="예: 윗면에 축하 메시지를 추가하고 분홍색 리본으로 장식해 주세요."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleCakePromptEdit}
                                      disabled={isGeneratingCakeImage}
                                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {isGeneratingCakeImage ? '수정 중...' : 'AI로 수정'}
                                    </button>
                                  </div>
                                )}
                                {cakePreviewSrc && (
                                  <div className="pt-3 border-t border-pink-100">
                                    <h5 className="text-xs font-semibold text-pink-700 mb-2">현재 참고 이미지</h5>
                                    <img src={cakePreviewSrc} alt="커스텀 케이크 미리보기" className="w-40 h-40 object-cover rounded-lg border" />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.card_number ? 'border-red-500' : 'border-gray-300'
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
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.cardholder_name ? 'border-red-500' : 'border-gray-300'
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
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.expiry_date ? 'border-red-500' : 'border-gray-300'
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
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.cvc ? 'border-red-500' : 'border-gray-300'
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
                    disabled={isProcessing || basePrice === 0}
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
                    ) : basePrice === 0 ? (
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

export default function CheckoutPage() {
  // useSearchParams 사용 부분을 Suspense로 감싸서 Next.js 경고/에러를 해결
  return (
    <Suspense fallback={null}>
      <CheckoutPageContent />
    </Suspense>
  )
}
