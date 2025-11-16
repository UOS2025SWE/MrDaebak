'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Staff, Ingredient, IngredientCategory } from '@/types/manage'
import type { WebSocketMessage } from '@/hooks/useWebSocket'

type TabType = 'accounting' | 'staff' | 'inventory' | 'menu' | 'events' | 'inquiries'

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
  batch_id: string
  status: string
  note: string | null
  created_at: string | null
  reviewed_at: string | null
  manager_name: string | null
  manager_email: string | null
  cook_name: string | null
  total_expected_cost: number
  total_actual_cost: number
  intake_items: Array<{
    intake_item_id: string
    ingredient_code: string
    expected_quantity: number
    actual_quantity: number
    unit_price: number
    expected_total_cost: number
    actual_total_cost: number
    remarks: string | null
  }>
}

interface PendingIntakeBatch {
  batch_id: string
  manager_id: string
  manager_name: string
  note: string | null
  created_at: string | null
  total_expected_cost: number
  total_actual_cost: number
  intake_items: Array<{
    intake_item_id: string
    ingredient_code: string
    expected_quantity: number
    actual_quantity: number
    unit_price: number
    expected_total_cost: number
    actual_total_cost: number
    remarks: string | null
  }>
}

type SideDishSummary = {
  side_dish_id: string
  code: string
  name: string
  description?: string
  base_price: number
  is_available?: boolean
  ingredients: Array<{
    ingredient_code: string
    ingredient_id?: string
    quantity: number
  }>
  created_at?: string | null
}

interface MenuStyleSummary {
  id: string
  code: string
  name: string
  price: number
  description?: string
  available?: boolean
  base_ingredients?: Record<string, number>
}

interface MenuSummary {
  id: string
  code: string
  name: string
  description: string
  base_price: number
  styles: MenuStyleSummary[]
  image_url?: string
  available?: boolean
}

type MenuBaseMap = Record<string, Record<string, Record<string, number>>>

type MenuIngredientDraft = {
  ingredient_code: string
  quantity: number
}

type CategoryKey = 'alcohol' | 'ingredients' | 'supplies'
const CATEGORY_KEYS: CategoryKey[] = ['alcohol', 'ingredients', 'supplies']

const CATEGORY_METADATA: Record<CategoryKey, { icon: string; title: string; subtitle: string; fallbackName: string; fallbackDescription: string }> = {
  alcohol: {
    icon: '🍷',
    title: '주류 발주',
    subtitle: '메뉴와 별개로 주류 재고를 추가하세요.',
    fallbackName: '주류',
    fallbackDescription: '주류 재고'
  },
  ingredients: {
    icon: '🥘',
    title: '재료 발주',
    subtitle: '요리에 쓰이는 재료를 추가 발주합니다.',
    fallbackName: '재료',
    fallbackDescription: '요리 재료'
  },
  supplies: {
    icon: '🍽️',
    title: '용품 발주',
    subtitle: '식기와 소모품 재고를 관리하세요.',
    fallbackName: '용품',
    fallbackDescription: '소모품'
  }
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

type CustomCakeRecipeMap = Record<string, Record<string, Array<{ ingredient_code: string; quantity: number }>>>;

type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'ARCHIVED'

type InquiryItem = {
  id: string
  name: string
  email: string
  topic: string
  message: string
  status: InquiryStatus
  managerNote: string | null
  createdAt: string
  updatedAt: string
}

type DiscountType = 'PERCENT' | 'FIXED'

type EventMenuDiscount = {
  menuItemId: string
  menuCode?: string
  menuName?: string
  sideDishCode?: string
  sideDishName?: string
  discountType: DiscountType
  discountValue: number
  targetType: 'MENU' | 'SIDE_DISH'
}

type EventMenuDiscountDraft = {
  menuItemId: string
  targetType: 'MENU' | 'SIDE_DISH'
  discountType: DiscountType
  discountValue: number
}

type DiscountTargetOption =
  | { kind: 'MENU'; id: string; display: string; price?: number | null }
  | { kind: 'SIDE_DISH'; id: string; display: string; price?: number | null }

type EventDiscountPayload = {
  target_type: 'MENU' | 'SIDE_DISH'
  target_id: string
  discount_type: DiscountType
  discount_value: number
  menu_item_id?: string
  side_dish_id?: string
}

const createDefaultEventDiscount = (): EventMenuDiscountDraft => ({
  menuItemId: '',
  targetType: 'MENU',
  discountType: 'PERCENT',
  discountValue: 0
})

type AdminEventItem = {
  id: string
  title: string
  description: string
  imagePath: string | null
  discountLabel: string | null
  startDate: string | null
  endDate: string | null
  tags: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
  menuDiscounts: EventMenuDiscount[]
}

type EventDraft = {
  title: string
  description: string
  discountLabel: string
  startDate: string
  endDate: string
  tags: string
  isPublished: boolean
}

const INQUIRY_STATUS_OPTIONS: InquiryStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED']
const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  NEW: '신규',
  IN_PROGRESS: '처리 중',
  RESOLVED: '완료',
  ARCHIVED: '보관'
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
  const [pendingIntakes, setPendingIntakes] = useState<PendingIntakeBatch[]>([])
  const [intakeHistory, setIntakeHistory] = useState<IntakeHistoryItem[]>([])
  const [ingredientPricingMap, setIngredientPricingMap] = useState<Record<string, number>>({})
  const [ingredientsFlat, setIngredientsFlat] = useState<Ingredient[]>([])
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({})
  const [menuList, setMenuList] = useState<MenuSummary[]>([])
  const [menuBaseMap, setMenuBaseMap] = useState<MenuBaseMap>({})
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [menuIngredientEdits, setMenuIngredientEdits] = useState<Record<string, number>>({})
  const [menuIngredientDrafts, setMenuIngredientDrafts] = useState<Record<string, MenuIngredientDraft>>({})
  const [menuActionLoading, setMenuActionLoading] = useState<Record<string, boolean>>({})
  const [sideDishList, setSideDishList] = useState<SideDishSummary[]>([])
  const [sideDishIngredientEdits, setSideDishIngredientEdits] = useState<Record<string, number>>({})
  const [sideDishIngredientDrafts, setSideDishIngredientDrafts] = useState<Record<string, MenuIngredientDraft>>({})
  const [sideDishActionLoading, setSideDishActionLoading] = useState<Record<string, boolean>>({})
  const [managerSideDishForm, setManagerSideDishForm] = useState({ code: '', name: '', description: '', basePrice: 0 })
  const [managerSideDishIngredients, setManagerSideDishIngredients] = useState<Array<{ ingredientCode: string; quantity: number }>>([
    { ingredientCode: '', quantity: 0 }
  ])
  const [managerSideDishMessage, setManagerSideDishMessage] = useState<string | null>(null)
  const [isSubmittingManagerSideDish, setIsSubmittingManagerSideDish] = useState(false)
  const [quickRestockForms, setQuickRestockForms] = useState<Record<CategoryKey, { ingredient_code: string; quantity: number }>>({
    alcohol: { ingredient_code: '', quantity: 0 },
    ingredients: { ingredient_code: '', quantity: 0 },
    supplies: { ingredient_code: '', quantity: 0 }
  })
  const [quickRestockLoading, setQuickRestockLoading] = useState<Record<CategoryKey, boolean>>({
    alcohol: false,
    ingredients: false,
    supplies: false
  })
  const [newIngredientForm, setNewIngredientForm] = useState({ name: '', unit: 'piece', unitPrice: 0, initialStock: 0 })
  const [ingredientCreationMessage, setIngredientCreationMessage] = useState<string | null>(null)
  const [isSubmittingIngredient, setIsSubmittingIngredient] = useState(false)
  const [customCakeRecipes, setCustomCakeRecipes] = useState<CustomCakeRecipeMap>({})
  const [customCakeRecipeLoading, setCustomCakeRecipeLoading] = useState(false)
  const [customCakeRecipeError, setCustomCakeRecipeError] = useState<string | null>(null)
  const [selectedCakeFlavor, setSelectedCakeFlavor] = useState<string>(CUSTOM_CAKE_FLAVORS[0].code)
  const [selectedCakeSize, setSelectedCakeSize] = useState<string>(CUSTOM_CAKE_SIZES[0].code)
  const [customCakeRecipeEdits, setCustomCakeRecipeEdits] = useState<Record<string, number>>({})
  const [customCakeRecipeDraft, setCustomCakeRecipeDraft] = useState<{ ingredient_code: string; quantity: number }>({ ingredient_code: '', quantity: 0 })
  const [customCakeRecipeActionLoading, setCustomCakeRecipeActionLoading] = useState<Record<string, boolean>>({})
  const [sideDishDeleteLoading, setSideDishDeleteLoading] = useState<Record<string, boolean>>({})

  const [inquiries, setInquiries] = useState<InquiryItem[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [inquiriesError, setInquiriesError] = useState<string | null>(null)
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState<'ALL' | InquiryStatus>('ALL')
  const [inquiryNotes, setInquiryNotes] = useState<Record<string, string>>({})
  const [inquiryStatusDrafts, setInquiryStatusDrafts] = useState<Record<string, InquiryStatus>>({})
  const [inquiryActionLoading, setInquiryActionLoading] = useState<Record<string, boolean>>({})

  const [managerEvents, setManagerEvents] = useState<AdminEventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    discountLabel: '',
    startDate: '',
    endDate: '',
    tags: '',
    isPublished: true,
  })
  const [eventDiscountForm, setEventDiscountForm] = useState<EventMenuDiscountDraft[]>([createDefaultEventDiscount()])
  const [eventImageFile, setEventImageFile] = useState<File | null>(null)
  const [tabPage, setTabPage] = useState<1 | 2>(1)
  const [eventSubmitting, setEventSubmitting] = useState(false)
  const [eventActionLoading, setEventActionLoading] = useState<Record<string, boolean>>({})
  const [eventEditDrafts, setEventEditDrafts] = useState<Record<string, EventDraft>>({})
  const [eventDiscountDrafts, setEventDiscountDrafts] = useState<Record<string, EventMenuDiscountDraft[]>>({})
  const [eventImageUploading, setEventImageUploading] = useState<Record<string, boolean>>({})
  const discountTargetOptions = useMemo<DiscountTargetOption[]>(() => {
    const menuOptions: DiscountTargetOption[] = menuList.map((menu) => ({
      kind: 'MENU',
      id: menu.id,
      display: `메뉴 · ${menu.name} (${Number(menu.base_price ?? 0).toLocaleString()}원)`,
      price: Number(menu.base_price ?? 0)
    }))
    const sideDishOptions: DiscountTargetOption[] = sideDishList.map((dish) => ({
      kind: 'SIDE_DISH',
      id: dish.side_dish_id,
      display: `사이드 · ${dish.name} (${Number(dish.base_price ?? 0).toLocaleString()}원)`,
      price: Number(dish.base_price ?? 0)
    }))
    return [...menuOptions, ...sideDishOptions].sort((a, b) => a.display.localeCompare(b.display, 'ko'))
  }, [menuList, sideDishList])

  const isCategoryKey = useCallback((value: string | undefined): value is CategoryKey => {
    if (!value) return false
    return (CATEGORY_KEYS as readonly string[]).includes(value)
  }, [])

  type CombinedCategory = IngredientCategory & { key: string }

  const combinedCategories = useMemo<CombinedCategory[]>(() => {
    const map = new Map<string, CombinedCategory>()

    const createCategory = (key: string, base?: IngredientCategory | null): CombinedCategory => {
      const metadata = CATEGORY_METADATA[key as CategoryKey]
      return {
        key,
        name: base?.name ?? metadata?.fallbackName ?? key,
        description: base?.description ?? metadata?.fallbackDescription ?? '',
        restock_frequency: base?.restock_frequency ?? 'as_needed',
        items: []
      }
    }

    Object.entries(categorizedIngredients).forEach(([key, category]) => {
      if (!category) {
        return
      }
      const entry = createCategory(key, category)
      category.items.forEach((catItem: Ingredient) => {
        const match = ingredientsFlat.find((ingredient: Ingredient) => ingredient.name === catItem.name)
        entry.items.push(match ?? catItem)
      })
      map.set(key, entry)
    })

    ingredientsFlat.forEach((ingredient: Ingredient) => {
      const rawKey = ingredient.category?.key
      const normalizedKey: string = isCategoryKey(rawKey) ? rawKey : (rawKey ?? 'ingredients')
      let entry = map.get(normalizedKey)
      if (!entry) {
        entry = createCategory(normalizedKey)
        map.set(normalizedKey, entry)
      }
      if (ingredient.category) {
        entry.name = ingredient.category.name || entry.name
        entry.description = ingredient.category.description || entry.description
        entry.restock_frequency = ingredient.category.restock_frequency || entry.restock_frequency
      }
      if (!entry.items.some(existing => existing.id === ingredient.id || existing.name === ingredient.name)) {
        entry.items.push(ingredient)
      }
    })

    CATEGORY_KEYS.forEach((key) => {
      if (!map.has(key)) {
        map.set(key, createCategory(key))
      }
    })

    return Array.from(map.values()).map(category => ({
      ...category,
      items: [...category.items].sort((a, b) => (a.korean_name || a.name).localeCompare(b.korean_name || b.name, 'ko'))
    })).sort((a, b) => {
      const indexA = CATEGORY_KEYS.indexOf(a.key as CategoryKey)
      const indexB = CATEGORY_KEYS.indexOf(b.key as CategoryKey)
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name, 'ko')
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [categorizedIngredients, ingredientsFlat, isCategoryKey])

  const ingredientMap = useMemo<Record<string, Ingredient>>(() => {
    const map: Record<string, Ingredient> = {}
    ingredientsFlat.forEach((ingredient) => {
      map[ingredient.name] = ingredient
    })
    return map
  }, [ingredientsFlat])

  const getCategoryOptions = useCallback((categoryKey: CategoryKey) => {
    const category = combinedCategories.find(cat => cat.key === categoryKey)
    return category ? category.items : []
  }, [combinedCategories])

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
          const parsed: IntakeHistoryItem[] = (data.history || []).map((item: any) => {
            let intakeItems = item.intake_items
            if (typeof intakeItems === 'string') {
              try {
                intakeItems = JSON.parse(intakeItems)
              } catch {
                intakeItems = []
              }
            }
            if (!Array.isArray(intakeItems)) {
              intakeItems = []
            }
            return {
              batch_id: item.batch_id,
              status: item.status,
              note: item.note ?? null,
              created_at: item.created_at ?? null,
              reviewed_at: item.reviewed_at ?? null,
              manager_name: item.manager_name ?? null,
              manager_email: item.manager_email ?? null,
              cook_name: item.cook_name ?? null,
              total_expected_cost: Number(item.total_expected_cost || 0),
              total_actual_cost: Number(item.total_actual_cost || 0),
              intake_items: intakeItems.map((detail: any) => ({
                intake_item_id: detail.intake_item_id,
                ingredient_code: detail.ingredient_code,
                expected_quantity: Number(detail.expected_quantity || 0),
                actual_quantity: Number(detail.actual_quantity || detail.expected_quantity || 0),
                unit_price: Number(detail.unit_price || 0),
                expected_total_cost: Number(detail.expected_total_cost || 0),
                actual_total_cost: Number(detail.actual_total_cost || detail.expected_total_cost || 0),
                remarks: detail.remarks ?? null
              }))
            }
          })
          setIntakeHistory(parsed)
        }
      }
    } catch (error) {
      console.error('입고 기록 조회 실패:', error)
    }
  }, [token])

  const fetchIngredientPricing = useCallback(async () => {
    try {
      const response = await fetch('/api/ingredients/pricing')
      if (!response.ok) return
      const data = await response.json()
      if (data.success) {
        setIngredientPricingMap(data.pricing || {})
      }
    } catch (error) {
      console.error('재료 단가 조회 실패:', error)
    }
  }, [])

  const fetchAllIngredients = useCallback(async () => {
    try {
      const response = await fetch('/api/ingredients/')
      if (!response.ok) return
      const data = await response.json()
      if (data.success) {
        const items = Array.isArray(data.data) ? data.data : []
        setIngredientsFlat(items)
      }
    } catch (error) {
      console.error('재료 목록 조회 실패:', error)
    }
  }, [])

  const fetchSideDishes = useCallback(async () => {
    try {
      const response = await fetch('/api/side-dishes?include_inactive=true', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      })
      if (!response.ok) return
      const data = await response.json()

      if (data.success) {
        const items: SideDishSummary[] = Array.isArray(data.data)
          ? data.data.map((dish: any) => ({
              side_dish_id: dish.side_dish_id ?? dish.code ?? `fallback-${Math.random().toString(36).slice(2)}`,
              code: dish.code,
              name: dish.name,
              description: dish.description,
              base_price: Number(dish.base_price ?? 0),
              is_available: dish.is_available,
              ingredients: Array.isArray(dish.ingredients)
                ? dish.ingredients.map((item: any) => ({
                    ingredient_code: item.ingredient_code,
                    ingredient_id: item.ingredient_id,
                    quantity: Number(item.quantity ?? 0)
                  }))
                : [],
              created_at: dish.created_at ?? null
            }))
          : []
        setSideDishList(items)
      }
    } catch (error) {
      console.error('사이드 디시 목록 조회 실패:', error)
    }
  }, [token])

  const fetchCustomCakeRecipes = useCallback(async () => {
    setCustomCakeRecipeLoading(true)
    setCustomCakeRecipeError(null)
    try {
      const response = await fetch('/api/side-dishes/custom-cake/recipes', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.detail || '커스텀 케이크 레시피 조회 실패')
      }
      const recipeMap: CustomCakeRecipeMap = {}
      if (data.data && typeof data.data === 'object') {
        Object.entries(data.data as Record<string, Record<string, any>>).forEach(([flavor, sizeMap]) => {
          recipeMap[flavor] = {}
          if (sizeMap && typeof sizeMap === 'object') {
            Object.entries(sizeMap).forEach(([size, ingredients]) => {
              const processed = Array.isArray(ingredients)
                ? ingredients.map((item: any) => ({
                    ingredient_code: item?.ingredient_code ?? '',
                    quantity: Number(item?.quantity ?? 0)
                  })).filter((item) => item.ingredient_code)
                : []
              recipeMap[flavor][size] = processed
            })
          }
        })
      }
      setCustomCakeRecipes(recipeMap)
      const nextFlavor = recipeMap[selectedCakeFlavor] ? selectedCakeFlavor : CUSTOM_CAKE_FLAVORS[0].code
      const nextSize = recipeMap[nextFlavor]?.[selectedCakeSize] ? selectedCakeSize : CUSTOM_CAKE_SIZES[0].code
      setSelectedCakeFlavor(nextFlavor)
      setSelectedCakeSize(nextSize)
    } catch (error: any) {
      console.error('커스텀 케이크 레시피 조회 실패:', error)
      setCustomCakeRecipeError(error.message || '커스텀 케이크 레시피를 불러오지 못했습니다')
    } finally {
      setCustomCakeRecipeLoading(false)
    }
  }, [token, selectedCakeFlavor, selectedCakeSize])

  const refreshMenuData = useCallback(async () => {
    if (!token) return
    setMenuLoading(true)
    setMenuError(null)
    try {
      const authHeaders = {
        'Authorization': `Bearer ${token}`
      }

      const [menuRes, baseRes] = await Promise.all([
        fetch('/api/menu/', {
          headers: authHeaders
        }),
        fetch('/api/menu/base-ingredients', {
          headers: authHeaders
        })
      ])

      const menuJson = await menuRes.json().catch(() => null)
      if (!menuRes.ok || !(menuJson?.success ?? false)) {
        throw new Error(menuJson?.error || menuJson?.detail || '메뉴 정보를 불러오지 못했습니다.')
      }
      const menuData = Array.isArray(menuJson?.data) ? menuJson.data : []
      setMenuList(menuData)

      const baseJson = await baseRes.json().catch(() => null)
      if (baseRes.ok && (baseJson?.success ?? false)) {
        const baseMap = (baseJson?.data as MenuBaseMap) ?? {}
        const normalizedBaseMap: MenuBaseMap = { ...baseMap }
        menuData.forEach((menu: MenuSummary) => {
          if (!normalizedBaseMap[menu.code]) {
            normalizedBaseMap[menu.code] = {}
          }
        })
        setMenuBaseMap(normalizedBaseMap)
      } else {
        const baseError = baseJson?.error || baseJson?.detail
        if (baseError) {
          console.warn('메뉴 구성 재료 조회 경고:', baseError)
          setMenuError(prev => prev ?? baseError)
        }
        setMenuBaseMap({})
      }
    } catch (error) {
      console.error('메뉴 데이터 조회 실패:', error)
      setMenuError(error instanceof Error ? error.message : '메뉴 데이터를 불러오지 못했습니다.')
    } finally {
      setMenuLoading(false)
    }
  }, [token, fetchAllIngredients, fetchIngredientPricing, fetchSideDishes])

  const buildMenuIngredientKey = (menuCode: string, styleCode: string, ingredientCode: string) => `${menuCode}::${styleCode}::${ingredientCode}`
  const buildMenuStyleKey = (menuCode: string, styleCode: string) => `${menuCode}::${styleCode}`
  const buildSideDishIngredientKey = useCallback((sideDishId: string, ingredientCode: string) => `${sideDishId}::${ingredientCode}`, [])
  const buildSideDishKey = useCallback((sideDishId: string) => sideDishId, [])
  const buildCustomCakeRecipeKey = useCallback((flavor: string, size: string, ingredientCode: string) => `${flavor}::${size}::${ingredientCode}`, [])

  const handlePriceChange = (ingredientCode: string, value: number) => {
    const safeValue = Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value))
    setEditedPrices((prev: Record<string, number>) => ({
      ...prev,
      [ingredientCode]: safeValue
    }))
  }

  const handleSavePrice = async (ingredientCode: string, price: number) => {
    try {
      const response = await fetch(`/api/ingredients/pricing/${ingredientCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          unit_price: price
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '단가 업데이트 실패')
      }

      await fetchIngredientPricing()
      setEditedPrices((prev: Record<string, number>) => {
        const next = { ...prev }
        delete next[ingredientCode]
        return next
      })
      alert('재료 단가를 업데이트했습니다.')
    } catch (error) {
      console.error('재료 단가 업데이트 실패:', error)
      alert('재료 단가 수정 중 오류가 발생했습니다.')
    }
  }

  const handleMenuIngredientQuantityChange = (menuCode: string, styleCode: string, ingredientCode: string, value: number) => {
    const normalizedStyle = styleCode.toLowerCase()
    const key = buildMenuIngredientKey(menuCode, normalizedStyle, ingredientCode)
    const baseQuantity = menuBaseMap[menuCode]?.[normalizedStyle]?.[ingredientCode] ?? 0
    const safeValue = Number.isNaN(value) ? baseQuantity : Math.max(0, Math.floor(value))

    setMenuIngredientEdits((prev) => {
      const next = { ...prev }
      if (safeValue === baseQuantity) {
        delete next[key]
      } else {
        next[key] = safeValue
      }
      return next
    })
  }

  const handleSaveMenuIngredient = async (menuCode: string, styleCode: string, ingredientCode: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }
    const normalizedStyle = styleCode.toLowerCase()
    const key = buildMenuIngredientKey(menuCode, normalizedStyle, ingredientCode)
    const baseQuantity = menuBaseMap[menuCode]?.[normalizedStyle]?.[ingredientCode] ?? 0
    const targetQuantity = menuIngredientEdits[key] ?? baseQuantity

    if (targetQuantity < 0) {
      alert('수량은 0 이상이어야 합니다.')
      return
    }

    if (targetQuantity === baseQuantity) {
      alert('변경 사항이 없습니다.')
      return
    }

    try {
      setMenuActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/menu/base-ingredients/${menuCode}/${normalizedStyle}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_code: ingredientCode,
          base_quantity: targetQuantity
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 수량 저장에 실패했습니다.')
      }

      await refreshMenuData()
      setMenuIngredientEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('재료 수량을 업데이트했습니다.')
    } catch (error) {
      console.error('메뉴 재료 수량 저장 실패:', error)
      alert(error instanceof Error ? error.message : '재료 수량 저장 중 오류가 발생했습니다.')
    } finally {
      setMenuActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleRemoveMenuIngredient = async (menuCode: string, styleCode: string, ingredientCode: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }
    const normalizedStyle = styleCode.toLowerCase()
    const key = buildMenuIngredientKey(menuCode, normalizedStyle, ingredientCode)

    if (!confirm('이 재료를 메뉴 구성에서 제거하시겠습니까?')) {
      return
    }

    try {
      setMenuActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/menu/base-ingredients/${menuCode}/${normalizedStyle}/${ingredientCode}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 제거에 실패했습니다.')
      }

      await refreshMenuData()
      setMenuIngredientEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('재료를 구성에서 제거했습니다.')
    } catch (error) {
      console.error('메뉴 재료 제거 실패:', error)
      alert(error instanceof Error ? error.message : '재료 제거 중 오류가 발생했습니다.')
    } finally {
      setMenuActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleMenuIngredientDraftChange = (menuCode: string, styleCode: string, field: keyof MenuIngredientDraft, value: string | number) => {
    const normalizedStyle = styleCode.toLowerCase()
    const key = buildMenuStyleKey(menuCode, normalizedStyle)
    setMenuIngredientDrafts((prev) => {
      const next = { ...prev }
      const current = next[key] ?? { ingredient_code: '', quantity: 0 }
      if (field === 'ingredient_code') {
        next[key] = {
          ...current,
          ingredient_code: typeof value === 'string' ? value : current.ingredient_code
        }
      } else {
        const numeric = typeof value === 'number' ? value : Number(value)
        next[key] = {
          ...current,
          quantity: Number.isNaN(numeric) ? 0 : Math.max(0, Math.floor(numeric))
        }
      }
      return next
    })
  }

  const handleAddMenuIngredient = async (menuCode: string, styleCode: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }
    const normalizedStyle = styleCode.toLowerCase()
    const key = buildMenuStyleKey(menuCode, normalizedStyle)
    const draft = menuIngredientDrafts[key] ?? { ingredient_code: '', quantity: 0 }
    const ingredientCode = (draft.ingredient_code || '').trim()
    const quantity = draft.quantity ?? 0

    if (!ingredientCode) {
      alert('추가할 재료를 선택해주세요.')
      return
    }

    if (quantity <= 0) {
      alert('추가 수량은 1 이상이어야 합니다.')
      return
    }

    if (menuBaseMap[menuCode]?.[normalizedStyle]?.[ingredientCode] !== undefined) {
      alert('이미 구성에 포함된 재료입니다.')
      return
    }

    try {
      setMenuActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/menu/base-ingredients/${menuCode}/${normalizedStyle}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_code: ingredientCode,
          base_quantity: quantity
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 추가에 실패했습니다.')
      }

      await refreshMenuData()
      setMenuIngredientDrafts((prev) => {
        const next = { ...prev }
        next[key] = { ingredient_code: '', quantity: 0 }
        return next
      })
      alert('재료를 추가했습니다.')
    } catch (error) {
      console.error('메뉴 재료 추가 실패:', error)
      alert(error instanceof Error ? error.message : '재료 추가 중 오류가 발생했습니다.')
    } finally {
      setMenuActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleSideDishIngredientChange = (sideDishId: string, ingredientCode: string, value: number) => {
    const key = buildSideDishIngredientKey(sideDishId, ingredientCode)
    const baseQuantity = (() => {
      const dish = sideDishList.find((item) => item.side_dish_id === sideDishId)
      const current = dish?.ingredients?.find((ingredient) => ingredient.ingredient_code === ingredientCode)
      return Number(current?.quantity ?? 0)
    })()
    const rawValue = Number.isNaN(value) ? baseQuantity : value
    const safeValue = Math.max(0, Math.round(rawValue * 100) / 100)

    setSideDishIngredientEdits((prev) => {
      const next = { ...prev }
      if (safeValue === baseQuantity) {
        delete next[key]
      } else {
        next[key] = safeValue
      }
      return next
    })
  }

  const handleSaveSideDishIngredient = async (sideDishId: string, ingredientCode: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }

    const key = buildSideDishIngredientKey(sideDishId, ingredientCode)
    const baseQuantity = (() => {
      const dish = sideDishList.find((item) => item.side_dish_id === sideDishId)
      const current = dish?.ingredients?.find((ingredient) => ingredient.ingredient_code === ingredientCode)
      return Number(current?.quantity ?? 0)
    })()
    const targetQuantity = sideDishIngredientEdits[key] ?? baseQuantity

    if (targetQuantity <= 0) {
      alert('수량은 0보다 커야 합니다. 재료를 제거하려면 제거 버튼을 사용하세요.')
      return
    }

    if (targetQuantity === baseQuantity) {
      alert('변경 사항이 없습니다.')
      return
    }

    try {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/side-dishes/${sideDishId}/ingredients`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_code: ingredientCode,
          quantity: Math.round(targetQuantity * 100) / 100
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 수량 저장에 실패했습니다.')
      }

      await fetchSideDishes()
      setSideDishIngredientEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('재료 수량을 업데이트했습니다.')
    } catch (error) {
      console.error('사이드 메뉴 재료 수량 저장 실패:', error)
      alert(error instanceof Error ? error.message : '재료 수량 저장 중 오류가 발생했습니다.')
    } finally {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleRemoveSideDishIngredient = async (sideDishId: string, ingredientCode: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }

    if (!confirm('이 재료를 사이드 메뉴 구성에서 제거하시겠습니까?')) {
      return
    }

    const key = buildSideDishIngredientKey(sideDishId, ingredientCode)

    try {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/side-dishes/${sideDishId}/ingredients/${ingredientCode}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 제거에 실패했습니다.')
      }

      await fetchSideDishes()
      setSideDishIngredientEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('재료를 구성에서 제거했습니다.')
    } catch (error) {
      console.error('사이드 메뉴 재료 제거 실패:', error)
      alert(error instanceof Error ? error.message : '재료 제거 중 오류가 발생했습니다.')
    } finally {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleSideDishIngredientDraftChange = (
    sideDishId: string,
    field: keyof MenuIngredientDraft,
    value: string | number
  ) => {
    const key = buildSideDishKey(sideDishId)
    setSideDishIngredientDrafts((prev) => {
      const next = { ...prev }
      const current = next[key] ?? { ingredient_code: '', quantity: 0 }
      if (field === 'ingredient_code') {
        next[key] = {
          ...current,
          ingredient_code: typeof value === 'string' ? value : current.ingredient_code
        }
      } else {
        const numeric = typeof value === 'number' ? value : Number(value)
        const normalized = Number.isNaN(numeric) ? 0 : Math.max(0, Math.round(numeric * 100) / 100)
        next[key] = {
          ...current,
          quantity: normalized
        }
      }
      return next
    })
  }

  const handleAddSideDishIngredient = async (sideDishId: string) => {
    if (!token) {
      alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.')
      return
    }

    const key = buildSideDishKey(sideDishId)
    const draft = sideDishIngredientDrafts[key] ?? { ingredient_code: '', quantity: 0 }
    const ingredientCode = (draft.ingredient_code || '').trim()
    const quantity = draft.quantity ?? 0

    if (!ingredientCode) {
      alert('추가할 재료를 선택해주세요.')
      return
    }

    if (quantity <= 0) {
      alert('추가 수량은 0보다 커야 합니다.')
      return
    }

    const dish = sideDishList.find((item) => item.side_dish_id === sideDishId)
    const alreadyIncluded = dish?.ingredients?.some((item) => item.ingredient_code === ingredientCode)
    if (alreadyIncluded) {
      alert('이미 구성에 포함된 재료입니다.')
      return
    }

    try {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: true }))
      const response = await fetch(`/api/side-dishes/${sideDishId}/ingredients`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_code: ingredientCode,
          quantity: Math.round(quantity * 100) / 100
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !(data?.success ?? false)) {
        throw new Error(data?.error || data?.detail || '재료 추가에 실패했습니다.')
      }

      await fetchSideDishes()
      setSideDishIngredientDrafts((prev) => {
        const next = { ...prev }
        next[key] = { ingredient_code: '', quantity: 0 }
        return next
      })
      alert('사이드 메뉴에 재료를 추가했습니다.')
    } catch (error) {
      console.error('사이드 메뉴 재료 추가 실패:', error)
      alert(error instanceof Error ? error.message : '재료 추가 중 오류가 발생했습니다.')
    } finally {
      setSideDishActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleRemoveIngredient = async (ingredientCode: string) => {
    if (!confirm('해당 재료를 삭제하시겠습니까? 관련된 구성에서도 제거됩니다.')) return

    try {
      const response = await fetch(`/api/ingredients/manage/${ingredientCode}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const message = data?.detail || data?.error || '재료 삭제 중 오류가 발생했습니다.'
        throw new Error(message)
      }

      alert('재료를 삭제했습니다.')
      await fetchAllIngredients()
      await fetchIngredientPricing()
      await fetchCategorizedIngredientsData()
      await refreshMenuData()
    } catch (error) {
      console.error('재료 삭제 실패:', error)
      const message = error instanceof Error ? error.message : '재료 삭제 중 오류가 발생했습니다.'
      alert(message)
    }
  }

  const handleManagerSideDishIngredientChange = (index: number, field: 'ingredientCode' | 'quantity', value: string | number) => {
    setManagerSideDishIngredients((prev: Array<{ ingredientCode: string; quantity: number }>) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [field]: field === 'quantity'
                ? (() => {
                    const numeric = typeof value === 'number' ? value : Number(value)
                    return Number.isNaN(numeric) ? 0 : Math.max(0, Math.round(numeric * 100) / 100)
                  })()
                : (value as string)
            }
          : row
      )
    )
  }

  const handleAddManagerSideDishIngredientRow = () => {
    setManagerSideDishIngredients((prev: Array<{ ingredientCode: string; quantity: number }>) => [
      ...prev,
      { ingredientCode: '', quantity: 0 }
    ])
  }

  const handleRemoveManagerSideDishIngredientRow = (index: number) => {
    setManagerSideDishIngredients((prev: Array<{ ingredientCode: string; quantity: number }>) =>
      prev.filter((_, idx) => idx !== index)
    )
  }

  const handleSubmitManagerSideDish = async () => {
    if (!managerSideDishForm.code.trim() || !managerSideDishForm.name.trim()) {
      alert('코드와 이름을 입력해주세요.')
      return
    }

    if (managerSideDishForm.basePrice < 0) {
      alert('기본 가격은 0 이상이어야 합니다.')
      return
    }

    const ingredientsPayload = managerSideDishIngredients
      .filter(item => item.ingredientCode && item.quantity > 0)
      .map(item => ({
        ingredient_code: item.ingredientCode,
        quantity: item.quantity
      }))

    if (ingredientsPayload.length === 0) {
      alert('사이드 디시에 필요한 재료를 한 개 이상 추가해주세요.')
      return
    }

    try {
      setIsSubmittingManagerSideDish(true)
      setManagerSideDishMessage(null)

      const response = await fetch('/api/side-dishes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: managerSideDishForm.code.trim(),
          name: managerSideDishForm.name.trim(),
          description: managerSideDishForm.description?.trim() || undefined,
          base_price: managerSideDishForm.basePrice,
          ingredients: ingredientsPayload
        })
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const message = data?.detail || data?.error || `사이드 디시 생성 실패 (HTTP ${response.status})`
        throw new Error(message)
      }

      if (!data?.success) {
        const message = data?.error || data?.detail || '사이드 디시 생성 실패'
        throw new Error(message)
      }

      setManagerSideDishMessage(`사이드 디시 "${data.name}" 등록 완료`)
      setManagerSideDishForm({ code: '', name: '', description: '', basePrice: 0 })
      setManagerSideDishIngredients([{ ingredientCode: '', quantity: 0 }])
      await fetchSideDishes()
    } catch (error) {
      console.error('사이드 디시 등록 오류:', error)
      const message = error instanceof Error ? error.message : '사이드 디시 등록 중 오류가 발생했습니다.'
      alert(message)
    } finally {
      setIsSubmittingManagerSideDish(false)
    }
  }

  useEffect(() => {
    setEditedPrices({})
  }, [ingredientPricingMap])

  useEffect(() => {
    if (!managerSideDishMessage) return
    const timer = setTimeout(() => setManagerSideDishMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [managerSideDishMessage])

  useEffect(() => {
    if (!ingredientCreationMessage) return
    const timer = setTimeout(() => setIngredientCreationMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [ingredientCreationMessage])

  const handleSubmitNewIngredient = async () => {
    if (!newIngredientForm.name.trim()) {
      alert('재료 이름을 입력해주세요.')
      return
    }

    if (newIngredientForm.unitPrice <= 0) {
      alert('재료 단가는 0보다 커야 합니다.')
      return
    }

    try {
      setIsSubmittingIngredient(true)
      setIngredientCreationMessage(null)

      const response = await fetch('/api/ingredients/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newIngredientForm.name.trim(),
          unit: newIngredientForm.unit.trim() || 'piece',
          unit_price: newIngredientForm.unitPrice,
          initial_stock: newIngredientForm.initialStock || undefined
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '재료 등록에 실패했습니다')
      }

      setIngredientCreationMessage(`재료 "${data.name || newIngredientForm.name}" 등록 완료`)
      setNewIngredientForm({ name: '', unit: 'piece', unitPrice: 0, initialStock: 0 })
      await fetchAllIngredients()
      await fetchIngredientPricing()
    } catch (error) {
      console.error('재료 등록 오류:', error)
      alert('재료 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmittingIngredient(false)
    }
  }

  const getIngredientDisplayName = useCallback((code: string) => {
    const item = ingredientsFlat.find((ingredient) => ingredient.name === code)
    return item?.korean_name || code
  }, [ingredientsFlat])

  useEffect(() => {
    setQuickRestockForms((prev: Record<CategoryKey, { ingredient_code: string; quantity: number }>) => {
      let changed = false
      const updated: Record<CategoryKey, { ingredient_code: string; quantity: number }> = {
        alcohol: { ...prev.alcohol },
        ingredients: { ...prev.ingredients },
        supplies: { ...prev.supplies }
      }

      CATEGORY_KEYS.forEach((key) => {
        const options = getCategoryOptions(key)
        if (!options.some(option => option.name === updated[key].ingredient_code)) {
          if (updated[key].ingredient_code !== '' || updated[key].quantity !== 0) {
            changed = true
          }
          updated[key] = { ingredient_code: '', quantity: 0 }
        }
      })

      return changed ? updated : prev
    })
  }, [combinedCategories, getCategoryOptions])

  useEffect(() => {
    if (activeTab === 'menu') {
      refreshMenuData()
    }
  }, [activeTab, refreshMenuData])

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
  const { status: wsStatus } = useWebSocket({
    token,
    onMessage: handleWebSocketMessage,
    showToasts: false,
    reconnect: true
  })

  const fetchAccountingStats = useCallback(async () => {
    if (!token) return

    try {
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
    }
  }, [token])

  const fetchStaffData = useCallback(async () => {
    if (!token) return

    try {
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
    }
  }, [token])

  const fetchPendingStaff = useCallback(async () => {
    if (!token) return

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
  }, [token])

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

  const handleTerminateStaff = async (staffId: string) => {
    if (!token) return

    const confirmed = window.confirm('이 직원과의 계약을 종료하고 계정을 삭제하시겠습니까?')
    if (!confirmed) return

    const reason = window.prompt('계약 종료 사유를 입력하세요 (선택 사항)', '')
    const payload: { reason?: string } = {}
    if (reason && reason.trim().length > 0) {
      payload.reason = reason.trim()
    }

    try {
      const response = await fetch(`/api/staff/${staffId}/terminate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(data.message || '직원과의 계약이 종료되었습니다')
        await Promise.all([fetchStaffData(), fetchPendingStaff()])
      } else {
        alert(data.error || data.detail || '직원 계약 종료에 실패했습니다')
      }
    } catch (error) {
      console.error('직원 계약 종료 실패:', error)
      alert('직원 계약 종료 중 오류가 발생했습니다')
    }
  }

  const fetchCategorizedIngredientsData = useCallback(async () => {
    if (!token) return

    try {
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
    }
  }, [token])

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

  const handleQuickCategoryRestock = async (categoryKey: CategoryKey) => {
    const form = quickRestockForms[categoryKey]

    if (!form.ingredient_code) {
      alert('발주할 항목을 선택해주세요.')
      return
    }

    if (form.quantity <= 0) {
      alert('추가 수량은 1 이상이어야 합니다.')
      return
    }

    const unitPrice = ingredientPricingMap[form.ingredient_code] ?? 0
    if (unitPrice <= 0) {
      alert('먼저 해당 재료의 단가를 설정해주세요. 단가가 0원 이하인 경우 입고 요청을 보낼 수 없습니다.')
      return
    }

    try {
      setQuickRestockLoading(prev => ({ ...prev, [categoryKey]: true }))
      const response = await fetch(`/api/ingredients/intake`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intake_items: [
            {
              ingredient_code: form.ingredient_code,
              expected_quantity: form.quantity,
              unit_price: unitPrice
            }
          ],
          intake_note: `빠른 발주 (${CATEGORY_METADATA[categoryKey].title})`
        })
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const message = data?.detail || data?.error || '재고 추가 중 오류가 발생했습니다.'
        throw new Error(message)
      }

      if (!data?.success) {
        const message = data?.error || data?.detail || '입고 요청 생성에 실패했습니다.'
        throw new Error(message)
      }

      alert('입고 요청을 등록했습니다. 요리사가 확인하면 재고에 반영됩니다.')
      setQuickRestockForms(prev => ({
        ...prev,
        [categoryKey]: { ingredient_code: '', quantity: 0 }
      }))

      await Promise.all([
        fetchPendingIntakes(),
        fetchIntakeHistory(),
        fetchCategorizedIngredientsData(),
        fetchAllIngredients()
      ])
    } catch (error) {
      console.error('빠른 입고 요청 생성 실패:', error)
      const message = error instanceof Error ? error.message : '입고 요청 생성 중 오류가 발생했습니다.'
      alert(message)
    } finally {
      setQuickRestockLoading(prev => ({ ...prev, [categoryKey]: false }))
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
        if (data.success && Array.isArray(data.batches)) {
          const parsed: PendingIntakeBatch[] = data.batches.map((batch: any) => {
            let intakeItems = batch.intake_items
            if (typeof intakeItems === 'string') {
              try {
                intakeItems = JSON.parse(intakeItems)
              } catch {
                intakeItems = []
              }
            }
            if (!Array.isArray(intakeItems)) {
              intakeItems = []
            }
            return {
              batch_id: batch.batch_id,
              manager_id: batch.manager_id,
              manager_name: batch.manager_name,
              note: batch.note ?? null,
              created_at: batch.created_at ?? null,
              total_expected_cost: Number(batch.total_expected_cost || 0),
              total_actual_cost: Number(batch.total_actual_cost || 0),
              intake_items: intakeItems.map((item: any) => ({
                intake_item_id: item.intake_item_id,
                ingredient_code: item.ingredient_code,
                expected_quantity: Number(item.expected_quantity || 0),
                actual_quantity: Number(item.actual_quantity || item.expected_quantity || 0),
                unit_price: Number(item.unit_price || 0),
                expected_total_cost: Number(item.expected_total_cost || 0),
                actual_total_cost: Number(item.actual_total_cost || item.expected_total_cost || 0),
                remarks: item.remarks ?? null
              }))
            }
          })
          setPendingIntakes(parsed)
        }
      }
    } catch (error) {
      console.error('입고 승인 대기 목록 조회 실패:', error)
    }
  }, [token])

  const cookStaff = staffList.filter(staff => staff.type === 'cook')
  const deliveryStaff = staffList.filter(staff => staff.type === 'delivery')

  useEffect(() => {
    const validIds = new Set(sideDishList.map((dish) => dish.side_dish_id))
    setSideDishIngredientEdits((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const next: Record<string, number> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const [sideDishId] = key.split('::')
        if (validIds.has(sideDishId)) {
          next[key] = value
        }
      })
      return next
    })
    setSideDishIngredientDrafts((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const next: Record<string, MenuIngredientDraft> = {}
      Object.entries(prev).forEach(([key, value]) => {
        if (validIds.has(key)) {
          next[key] = value
        }
      })
      return next
    })
  }, [sideDishList])

  const visibleMenuList = useMemo(() => menuList.filter((menu) => menu.code !== 'cake'), [menuList])

  const handleCustomCakeRecipeQuantityChange = useCallback((ingredientCode: string, value: number) => {
    const safeValue = Number.isNaN(value) ? 0 : Math.max(0, value)
    const key = buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, ingredientCode)
    setCustomCakeRecipeEdits((prev) => ({
      ...prev,
      [key]: safeValue
    }))
  }, [buildCustomCakeRecipeKey, selectedCakeFlavor, selectedCakeSize])

  const handleSaveCustomCakeRecipeIngredient = useCallback(async (ingredientCode: string) => {
    const key = buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, ingredientCode)
    const editedQuantity = customCakeRecipeEdits[key]
    if (editedQuantity === undefined) return
    if (editedQuantity <= 0) {
      alert('수량은 0보다 커야 합니다.')
      return
    }
    setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [key]: true }))
    try {
      const response = await fetch('/api/side-dishes/custom-cake/recipes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          flavor: selectedCakeFlavor,
          size: selectedCakeSize,
          ingredient_code: ingredientCode,
          quantity: editedQuantity
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '커스텀 케이크 레시피 저장 실패')
      }
      await fetchCustomCakeRecipes()
      setCustomCakeRecipeEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('커스텀 케이크 레시피를 저장했습니다.')
    } catch (error: any) {
      console.error('커스텀 케이크 레시피 저장 실패:', error)
      alert(`커스텀 케이크 레시피 저장 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }, [buildCustomCakeRecipeKey, customCakeRecipeEdits, fetchCustomCakeRecipes, selectedCakeFlavor, selectedCakeSize, token])

  const handleRemoveCustomCakeRecipeIngredient = useCallback(async (ingredientCode: string) => {
    if (!confirm('선택한 재료를 해당 레시피에서 제거하시겠습니까?')) return
    const key = buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, ingredientCode)
    setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [key]: true }))
    try {
      const response = await fetch(`/api/side-dishes/custom-cake/recipes/${selectedCakeFlavor}/${selectedCakeSize}/${ingredientCode}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '커스텀 케이크 레시피 삭제 실패')
      }
      await fetchCustomCakeRecipes()
      setCustomCakeRecipeEdits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('커스텀 케이크 레시피에서 재료를 제거했습니다.')
    } catch (error: any) {
      console.error('커스텀 케이크 레시피 삭제 실패:', error)
      alert(`커스텀 케이크 레시피 삭제 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }, [buildCustomCakeRecipeKey, fetchCustomCakeRecipes, selectedCakeFlavor, selectedCakeSize, token])

  const handleCustomCakeRecipeDraftChange = useCallback((field: 'ingredient_code' | 'quantity', value: string | number) => {
    setCustomCakeRecipeDraft((prev) => ({
      ...prev,
      [field]: field === 'quantity' ? Number(value) : value
    }))
  }, [])

  const handleAddCustomCakeRecipeIngredient = useCallback(async () => {
    if (!customCakeRecipeDraft.ingredient_code || (customCakeRecipeDraft.quantity ?? 0) <= 0) {
      alert('추가할 재료와 수량을 입력해주세요.')
      return
    }
    const draftKey = buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, customCakeRecipeDraft.ingredient_code)
    setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [draftKey]: true }))
    try {
      const response = await fetch('/api/side-dishes/custom-cake/recipes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          flavor: selectedCakeFlavor,
          size: selectedCakeSize,
          ingredient_code: customCakeRecipeDraft.ingredient_code,
          quantity: Number(customCakeRecipeDraft.quantity)
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '커스텀 케이크 레시피 추가 실패')
      }
      await fetchCustomCakeRecipes()
      setCustomCakeRecipeDraft({ ingredient_code: '', quantity: 0 })
      alert('커스텀 케이크 레시피에 재료를 추가했습니다.')
    } catch (error: any) {
      console.error('커스텀 케이크 레시피 추가 실패:', error)
      alert(`커스텀 케이크 레시피 추가 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setCustomCakeRecipeActionLoading((prev) => ({ ...prev, [draftKey]: false }))
    }
  }, [buildCustomCakeRecipeKey, customCakeRecipeDraft, fetchCustomCakeRecipes, selectedCakeFlavor, selectedCakeSize, token])

  const handleDeleteSideDish = useCallback(async (sideDishId: string, code: string) => {
    if (!confirm('해당 사이드 디시를 삭제하시겠습니까?')) return
    setSideDishDeleteLoading((prev) => ({ ...prev, [sideDishId]: true }))
    try {
      const response = await fetch(`/api/side-dishes/${sideDishId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '사이드 디시 삭제 실패')
      }
      alert('사이드 디시를 삭제했습니다.')
      await fetchSideDishes()
    } catch (error: any) {
      console.error('사이드 디시 삭제 실패:', error)
      alert(`사이드 디시 삭제 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setSideDishDeleteLoading((prev) => ({ ...prev, [sideDishId]: false }))
    }
  }, [fetchSideDishes, token])

  const currentCustomCakeRecipe = useMemo(() => {
    const flavorMap = customCakeRecipes[selectedCakeFlavor]
    if (flavorMap && flavorMap[selectedCakeSize]) {
      return flavorMap[selectedCakeSize]
    }
    return []
  }, [customCakeRecipes, selectedCakeFlavor, selectedCakeSize])

  useEffect(() => {
    setCustomCakeRecipeEdits({})
    setCustomCakeRecipeDraft({ ingredient_code: '', quantity: 0 })
  }, [selectedCakeFlavor, selectedCakeSize])

  const fetchInquiries = useCallback(async () => {
    if (!token) return

    setInquiriesLoading(true)
    setInquiriesError(null)
    try {
      const params = new URLSearchParams()
      if (inquiryStatusFilter !== 'ALL') {
        params.set('status', inquiryStatusFilter)
      }

      const response = await fetch(`/api/inquiries?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '문의 목록을 불러오지 못했습니다.')
      }

      const items: InquiryItem[] = Array.isArray(data.items)
        ? data.items
            .map((item: any): InquiryItem => ({
              id: item.inquiry_id ?? item.id ?? '',
              name: item.name ?? '익명',
              email: item.email ?? '',
              topic: item.topic ?? '',
              message: item.message ?? '',
              status: (item.status ?? 'NEW') as InquiryStatus,
              managerNote: item.manager_note ?? null,
              createdAt: item.created_at ?? '',
              updatedAt: item.updated_at ?? ''
            }))
            .filter((item: InquiryItem) => !!item.id)
        : []

      setInquiries(items)

      const noteMap: Record<string, string> = {}
      const statusMap: Record<string, InquiryStatus> = {}
      items.forEach((item) => {
        noteMap[item.id] = item.managerNote ?? ''
        statusMap[item.id] = item.status
      })
      setInquiryNotes(noteMap)
      setInquiryStatusDrafts(statusMap)
      setInquiryActionLoading({})
    } catch (error: any) {
      console.error('문의 목록 조회 실패:', error)
      setInquiriesError(error?.message || '문의 목록을 불러오지 못했습니다.')
    } finally {
      setInquiriesLoading(false)
    }
  }, [token, inquiryStatusFilter])

  const fetchManagerEvents = useCallback(async () => {
    if (!token) return

    setEventsLoading(true)
    setEventsError(null)
    try {
      const response = await fetch('/api/events/manage', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '이벤트 목록을 불러오지 못했습니다.')
      }

      const items: AdminEventItem[] = Array.isArray(data.events)
        ? data.events.map((event: any) => ({
            id: event.event_id ?? event.id ?? '',
            title: event.title ?? '',
            description: event.description ?? '',
            imagePath: event.image_path ?? null,
            discountLabel: event.discount_label ?? null,
            startDate: event.start_date ?? null,
            endDate: event.end_date ?? null,
            tags: Array.isArray(event.tags) ? event.tags : [],
            isPublished: Boolean(event.is_published ?? true),
            createdAt: event.created_at ?? '',
            updatedAt: event.updated_at ?? '',
            menuDiscounts: Array.isArray(event.menu_discounts)
              ? event.menu_discounts
                  .map((discount: any) => {
                    const targetType: 'MENU' | 'SIDE_DISH' =
                      (discount.target_type ?? discount.targetType ?? 'MENU') === 'SIDE_DISH' ? 'SIDE_DISH' : 'MENU'
                    const menuId = String(discount.menu_item_id ?? discount.menuItemId ?? discount.target_id ?? discount.targetId ?? '')
                    const sideId = String(discount.side_dish_id ?? discount.sideDishId ?? '')
                    const resolvedId = targetType === 'SIDE_DISH' ? (sideId || menuId) : menuId
                    const mapped: EventMenuDiscount = {
                      menuItemId: resolvedId,
                      menuCode: discount.menu_code ?? discount.menuCode ?? undefined,
                      menuName: discount.menu_name ?? discount.menuName ?? discount.side_dish_name ?? discount.sideDishName ?? '',
                      sideDishCode: discount.side_dish_code ?? discount.sideDishCode ?? undefined,
                      sideDishName: discount.side_dish_name ?? discount.sideDishName ?? undefined,
                      discountType: (discount.discount_type ?? discount.discountType ?? 'PERCENT') as DiscountType,
                      discountValue: Number(discount.discount_value ?? discount.discountValue ?? 0),
                      targetType
                    }
                    return mapped
                  })
                  .filter((discount: EventMenuDiscount) => Boolean(discount.menuItemId))
              : []
          })).filter((event: AdminEventItem) => !!event.id)
        : []

      setManagerEvents(items)
      const draftMap: Record<string, EventDraft> = {}

      const discountDraftMap: Record<string, EventMenuDiscountDraft[]> = {}

      items.forEach((event) => {
        draftMap[event.id] = {
          title: event.title,
          description: event.description,
          discountLabel: event.discountLabel ?? '',
          startDate: event.startDate ?? '',
          endDate: event.endDate ?? '',
          tags: event.tags.join(', '),
          isPublished: event.isPublished
        }
        const draftDiscounts = event.menuDiscounts.map(discount => ({
          menuItemId: discount.menuItemId,
          targetType: discount.targetType,
          discountType: discount.discountType,
          discountValue: discount.discountValue
        }))
        discountDraftMap[event.id] = draftDiscounts.length > 0 ? draftDiscounts : [createDefaultEventDiscount()]
      })

      setEventEditDrafts(draftMap)
      setEventDiscountDrafts(discountDraftMap)
      setEventActionLoading({})
      setEventImageUploading({})
    } catch (error: any) {
      console.error('이벤트 목록 조회 실패:', error)
      setEventsError(error?.message || '이벤트 목록을 불러오지 못했습니다.')
    } finally {
      setEventsLoading(false)
    }
  }, [token])

  const loadTabData = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      if (activeTab === 'accounting') {
        await fetchAccountingStats()
      } else if (activeTab === 'staff') {
        await Promise.all([fetchStaffData(), fetchPendingStaff()])
      } else if (activeTab === 'inventory') {
        await Promise.all([
          fetchIntakeHistory(),
          fetchPendingIntakes(),
          fetchCategorizedIngredientsData(),
          fetchIngredientPricing(),
          fetchAllIngredients()
        ])
      } else if (activeTab === 'menu') {
        await Promise.all([
          fetchAllIngredients(),
          fetchIngredientPricing(),
          fetchSideDishes(),
          fetchCustomCakeRecipes()
        ])
        await refreshMenuData()
      } else if (activeTab === 'inquiries') {
        await fetchInquiries()
      } else if (activeTab === 'events') {
        await Promise.all([fetchSideDishes(), refreshMenuData()])
      }
    } catch (error) {
      console.error('탭 데이터 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [
    activeTab,
    token,
    fetchAccountingStats,
    fetchStaffData,
    fetchPendingStaff,
    fetchIntakeHistory,
    fetchPendingIntakes,
    fetchCategorizedIngredientsData,
    fetchIngredientPricing,
    fetchAllIngredients,
    fetchSideDishes,
    fetchCustomCakeRecipes,
    refreshMenuData,
    fetchInquiries,
    fetchManagerEvents
  ])

  useEffect(() => {
    loadTabData()
  }, [loadTabData])

  useEffect(() => {
    if (activeTab === 'inquiries') {
      fetchInquiries()
    }
  }, [activeTab, inquiryStatusFilter, fetchInquiries])

  useEffect(() => {
    if (activeTab === 'events') {
      fetchManagerEvents()
    }
  }, [activeTab, fetchManagerEvents])

  const handleInquiryNoteChange = useCallback((inquiryId: string, value: string) => {
    setInquiryNotes(prev => ({ ...prev, [inquiryId]: value }))
  }, [])

  const handleInquiryStatusChange = useCallback((inquiryId: string, status: InquiryStatus) => {
    setInquiryStatusDrafts(prev => ({ ...prev, [inquiryId]: status }))
  }, [])

  const handleSaveInquiry = useCallback(async (inquiryId: string) => {
    if (!token) return

    const payload: Record<string, any> = {}
    if (inquiryStatusDrafts[inquiryId]) {
      payload.status = inquiryStatusDrafts[inquiryId]
    }
    if (inquiryNotes[inquiryId] !== undefined) {
      payload.manager_note = inquiryNotes[inquiryId]
    }

    if (Object.keys(payload).length === 0) {
      alert('변경할 내용이 없습니다.')
      return
    }

    setInquiryActionLoading(prev => ({ ...prev, [inquiryId]: true }))
    try {
      const response = await fetch(`/api/inquiries/${inquiryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '문의 업데이트에 실패했습니다.')
      }
      await fetchInquiries()
      alert('문의 상태를 업데이트했습니다.')
    } catch (error: any) {
      console.error('문의 업데이트 실패:', error)
      alert(error?.message || '문의 업데이트 중 오류가 발생했습니다.')
    } finally {
      setInquiryActionLoading(prev => ({ ...prev, [inquiryId]: false }))
    }
  }, [token, inquiryNotes, inquiryStatusDrafts, fetchInquiries])

  const handleEventFormChange = (field: keyof typeof eventForm, value: string | boolean) => {
    setEventForm(prev => ({
      ...prev,
      [field]: field === 'isPublished' ? Boolean(value) : String(value)
    }))
  }

  const handleAddNewEventDiscountRow = () => {
    setEventDiscountForm(prev => [...prev, createDefaultEventDiscount()])
  }

  const handleRemoveNewEventDiscountRow = (index: number) => {
    setEventDiscountForm(prev => {
      const next = prev.filter((_, idx) => idx !== index)
      return next.length > 0 ? next : [createDefaultEventDiscount()]
    })
  }

  const handleChangeNewEventDiscountRow = (
    index: number,
    field: keyof EventMenuDiscountDraft,
    value: string | number
  ) => {
    setEventDiscountForm(prev =>
      prev.map((row, idx) => {
        if (idx !== index) {
          return row
        }

        if (field === 'menuItemId') {
          const raw = String(value)
          if (!raw) {
            return { ...row, menuItemId: '', targetType: 'MENU' }
          }
          const [kind, id] = raw.split('|')
          const normalizedKind: 'MENU' | 'SIDE_DISH' = kind === 'SIDE_DISH' ? 'SIDE_DISH' : 'MENU'
          return { ...row, menuItemId: id ?? '', targetType: normalizedKind }
        }

        if (field === 'discountType') {
          const nextType: DiscountType = value === 'FIXED' ? 'FIXED' : 'PERCENT'
          const adjustedValue = sanitizeDiscountValue(row.discountValue, nextType)
          return { ...row, discountType: nextType, discountValue: adjustedValue }
        }

        if (field === 'discountValue') {
          let nextValue = typeof value === 'number' ? value : Number(value)
          if (!Number.isFinite(nextValue)) {
            nextValue = 0
          }
          return { ...row, discountValue: sanitizeDiscountValue(nextValue, row.discountType) }
        }

        return row
      })
    )
  }

  const handleEventImageInput = (file: File | null) => {
    setEventImageFile(file)
  }

  const handleCreateEvent = async () => {
    if (!token) return
    if (!eventForm.title.trim() || !eventForm.description.trim()) {
      alert('이벤트 제목과 설명을 입력해주세요.')
      return
    }

    setEventSubmitting(true)
    try {
      const payload = {
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        discount_label: eventForm.discountLabel?.trim() || null,
        start_date: eventForm.startDate?.trim() || null,
        end_date: eventForm.endDate?.trim() || null,
        tags: eventForm.tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        is_published: eventForm.isPublished,
        menu_discounts: buildDiscountPayload(eventDiscountForm),
      }

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok || !data.success || !data.event?.event_id) {
        throw new Error(data.detail || data.error || '이벤트 생성에 실패했습니다.')
      }

      const eventId: string = data.event.event_id

      if (eventImageFile) {
        const formData = new FormData()
        formData.append('file', eventImageFile)

        const imageResponse = await fetch(`/api/events/${eventId}/image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        })

        const imageData = await imageResponse.json()
        if (!imageResponse.ok || !imageData.success) {
          throw new Error(imageData.detail || imageData.error || '이벤트 이미지를 업로드하지 못했습니다.')
        }
      }

      setEventForm({
        title: '',
        description: '',
        discountLabel: '',
        startDate: '',
        endDate: '',
        tags: '',
        isPublished: true
      })
      setEventDiscountForm([createDefaultEventDiscount()])
      setEventImageFile(null)
      await fetchManagerEvents()
      alert('새 이벤트를 등록했습니다.')
    } catch (error: any) {
      console.error('이벤트 생성 실패:', error)
      alert(error?.message || '이벤트 생성 중 오류가 발생했습니다.')
    } finally {
      setEventSubmitting(false)
    }
  }

  const handleEventDraftChange = (eventId: string, field: keyof EventDraft, value: string | boolean) => {
    setEventEditDrafts(prev => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] ?? {
          title: '',
          description: '',
          discountLabel: '',
          startDate: '',
          endDate: '',
          tags: '',
          isPublished: true
        }),
        [field]: field === 'isPublished' ? Boolean(value) : String(value)
      }
    }))
  }

  const updateEventDiscountDraftState = (
    eventId: string,
    updater: (rows: EventMenuDiscountDraft[]) => EventMenuDiscountDraft[]
  ) => {
    setEventDiscountDrafts(prev => {
      const current = prev[eventId] && prev[eventId]!.length > 0 ? prev[eventId]! : [createDefaultEventDiscount()]
      return {
        ...prev,
        [eventId]: updater(current)
      }
    })
  }

  const handleAddEventDiscountDraftRow = (eventId: string) => {
    updateEventDiscountDraftState(eventId, rows => [...rows, createDefaultEventDiscount()])
  }

  const handleRemoveEventDiscountDraftRow = (eventId: string, index: number) => {
    updateEventDiscountDraftState(eventId, rows => {
      const next = rows.filter((_, idx) => idx !== index)
      return next.length > 0 ? next : [createDefaultEventDiscount()]
    })
  }

  const handleChangeEventDiscountDraftRow = (
    eventId: string,
    index: number,
    field: keyof EventMenuDiscountDraft,
    value: string | number
  ) => {
    updateEventDiscountDraftState(eventId, rows =>
      rows.map((row, idx) => {
        if (idx !== index) {
          return row
        }

        if (field === 'menuItemId') {
          const raw = String(value)
          if (!raw) {
            return { ...row, menuItemId: '', targetType: 'MENU' }
          }
          const [kind, id] = raw.split('|')
          const normalizedKind: 'MENU' | 'SIDE_DISH' = kind === 'SIDE_DISH' ? 'SIDE_DISH' : 'MENU'
          return { ...row, menuItemId: id ?? '', targetType: normalizedKind }
        }

        if (field === 'discountType') {
          const nextType: DiscountType = value === 'FIXED' ? 'FIXED' : 'PERCENT'
          const adjustedValue = sanitizeDiscountValue(row.discountValue, nextType)
          return { ...row, discountType: nextType, discountValue: adjustedValue }
        }

        if (field === 'discountValue') {
          let nextValue = typeof value === 'number' ? value : Number(value)
          if (!Number.isFinite(nextValue)) {
            nextValue = 0
          }
          return { ...row, discountValue: sanitizeDiscountValue(nextValue, row.discountType) }
        }

        return row
      })
    )
  }

  const sanitizeDiscountValue = (value: number, type: DiscountType): number => {
    const numeric = Number.isFinite(value) ? value : 0
    if (type === 'PERCENT') {
      return Math.min(Math.max(numeric, 0), 100)
    }
    return Math.max(numeric, 0)
  }

  const buildDiscountPayload = (rows: EventMenuDiscountDraft[]): EventDiscountPayload[] => {
    return rows
      .filter(row => row.menuItemId && row.discountValue > 0)
      .map(row => {
        const sanitizedValue = sanitizeDiscountValue(row.discountValue, row.discountType)
        const payload: EventDiscountPayload = {
          target_type: row.targetType,
          target_id: row.menuItemId,
          discount_type: row.discountType,
          discount_value: sanitizedValue
        }
        if (row.targetType === 'SIDE_DISH') {
          payload.side_dish_id = row.menuItemId
        } else {
          payload.menu_item_id = row.menuItemId
        }
        return payload
      })
  }

  const normalizeDiscountsForCompare = (payload: EventDiscountPayload[]) => {
    return payload
      .map(item => ({
        target_type: item.target_type,
        target_id: item.target_id,
        discount_type: item.discount_type,
        // round to 2 decimal places for comparison
        discount_value: Math.round(item.discount_value * 100) / 100
      }))
      .sort((a, b) => {
        const typeCompare = a.target_type.localeCompare(b.target_type)
        if (typeCompare !== 0) return typeCompare
        const idCompare = a.target_id.localeCompare(b.target_id)
        if (idCompare !== 0) return idCompare
        return a.discount_type.localeCompare(b.discount_type)
      })
  }

  const handleSaveEvent = async (eventId: string) => {
    if (!token) return
    const draft = eventEditDrafts[eventId]
    const original = managerEvents.find(event => event.id === eventId)
    if (!draft || !original) return

    const tagsArray = draft.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)

    const payload: Record<string, any> = {}
    if (draft.title.trim() && draft.title.trim() !== original.title) {
      payload.title = draft.title.trim()
    }
    if (draft.description.trim() && draft.description.trim() !== original.description) {
      payload.description = draft.description.trim()
    }
    if ((draft.discountLabel || '') !== (original.discountLabel || '')) {
      payload.discount_label = draft.discountLabel.trim() || null
    }
    if ((draft.startDate || '') !== (original.startDate || '')) {
      payload.start_date = draft.startDate.trim() || null
    }
    if ((draft.endDate || '') !== (original.endDate || '')) {
      payload.end_date = draft.endDate.trim() || null
    }
    if (JSON.stringify(tagsArray) !== JSON.stringify(original.tags)) {
      payload.tags = tagsArray
    }
    if (draft.isPublished !== original.isPublished) {
      payload.is_published = draft.isPublished
    }

    const currentDiscountDrafts = eventDiscountDrafts[eventId] ?? [createDefaultEventDiscount()]
    const draftDiscountPayload = buildDiscountPayload(currentDiscountDrafts)
    const originalDiscountPayload = (original.menuDiscounts ?? []).map(discount => ({
      target_type: discount.targetType ?? 'MENU',
      target_id: discount.menuItemId,
      discount_type: discount.discountType,
      discount_value: sanitizeDiscountValue(discount.discountValue, discount.discountType)
    }))

    const hasDiscountChanged =
      JSON.stringify(normalizeDiscountsForCompare(draftDiscountPayload)) !==
      JSON.stringify(normalizeDiscountsForCompare(originalDiscountPayload))

    if (hasDiscountChanged) {
      payload.menu_discounts = draftDiscountPayload
    }

    if (Object.keys(payload).length === 0) {
      alert('변경된 내용이 없습니다.')
      return
    }

    setEventActionLoading(prev => ({ ...prev, [eventId]: true }))
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '이벤트 정보를 업데이트하지 못했습니다.')
      }
      await fetchManagerEvents()
      alert('이벤트 정보를 저장했습니다.')
    } catch (error: any) {
      console.error('이벤트 업데이트 실패:', error)
      alert(error?.message || '이벤트 업데이트 중 오류가 발생했습니다.')
    } finally {
      setEventActionLoading(prev => ({ ...prev, [eventId]: false }))
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!token) return
    if (!confirm('선택한 이벤트를 삭제하시겠습니까?')) return

    setEventActionLoading(prev => ({ ...prev, [eventId]: true }))
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '이벤트 삭제에 실패했습니다.')
      }
      await fetchManagerEvents()
      alert('이벤트를 삭제했습니다.')
    } catch (error: any) {
      console.error('이벤트 삭제 실패:', error)
      alert(error?.message || '이벤트 삭제 중 오류가 발생했습니다.')
    } finally {
      setEventActionLoading(prev => ({ ...prev, [eventId]: false }))
    }
  }

  const handleToggleEventPublish = async (eventId: string, nextValue: boolean) => {
    if (!token) return

    setEventActionLoading(prev => ({ ...prev, [eventId]: true }))
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_published: nextValue })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '이벤트 공개 상태를 변경하지 못했습니다.')
      }
      await fetchManagerEvents()
    } catch (error: any) {
      console.error('이벤트 공개 상태 변경 실패:', error)
      alert(error?.message || '이벤트 공개 상태 변경 중 오류가 발생했습니다.')
    } finally {
      setEventActionLoading(prev => ({ ...prev, [eventId]: false }))
    }
  }

  const handleUploadEventImage = async (eventId: string, file: File) => {
    if (!token) return

    setEventImageUploading(prev => ({ ...prev, [eventId]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/events/${eventId}/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '이벤트 이미지를 업로드하지 못했습니다.')
      }
      await fetchManagerEvents()
      alert('이벤트 이미지를 업데이트했습니다.')
    } catch (error: any) {
      console.error('이벤트 이미지 업로드 실패:', error)
      alert(error?.message || '이벤트 이미지 업로드 중 오류가 발생했습니다.')
    } finally {
      setEventImageUploading(prev => ({ ...prev, [eventId]: false }))
    }
  }

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
            {/* 데스크톱: 전체 탭 한 번에 표시 */}
            <div className="hidden lg:flex gap-2">
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
              <button
                onClick={() => setActiveTab('menu')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'menu'
                    ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">🍽️</span>
                  <span>메뉴 관리</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('events')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'events'
                    ? 'bg-gradient-to-r from-pink-600 to-pink-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">🎉</span>
                  <span>이벤트</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('inquiries')}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all ${
                  activeTab === 'inquiries'
                    ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">📨</span>
                  <span>문의</span>
                </div>
              </button>
            </div>

            {/* 모바일: 1/2, 2/2 토글로 두 페이지로 나누어 표시 */}
            <div className="lg:hidden">
              <div className="flex justify-end gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setTabPage(1)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    tabPage === 1 ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-600 border-stone-200'
                  }`}
                >
                  1 / 2
                </button>
                <button
                  type="button"
                  onClick={() => setTabPage(2)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    tabPage === 2 ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-600 border-stone-200'
                  }`}
                >
                  2 / 2
                </button>
              </div>

              {tabPage === 1 ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('accounting')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'accounting'
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">💰</span>
                      <span className="text-sm">회계</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('staff')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'staff'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">👥</span>
                      <span className="text-sm">직원 관리</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('inventory')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'inventory'
                        ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">📦</span>
                      <span className="text-sm">재고 관리</span>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('menu')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'menu'
                        ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">🍽️</span>
                      <span className="text-sm">메뉴 관리</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'events'
                        ? 'bg-gradient-to-r from-pink-600 to-pink-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">🎉</span>
                      <span className="text-sm">이벤트</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('inquiries')}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      activeTab === 'inquiries'
                        ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg">📨</span>
                      <span className="text-sm">문의</span>
                    </div>
                  </button>
                </div>
              )}
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
                  {cookStaff.map((staff) => {
                    let statusLabel = '근무중';
                    let statusClasses = 'bg-red-100 text-red-700';
                    if (staff.status === 'free') {
                      statusLabel = '출근';
                      statusClasses = 'bg-green-100 text-green-700';
                    } else if (staff.status === 'off-duty') {
                      statusLabel = '퇴근';
                      statusClasses = 'bg-gray-100 text-gray-600';
                    }
                    return (
                      <div
                        key={staff.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          staff.status === 'free'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div>
                            <h3 className="font-bold text-gray-900">{staff.name}</h3>
                            <p className="text-xs text-gray-500">{staff.id}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleStaffStatus(staff.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                          >
                            출퇴근 토글
                          </button>
                          <button
                            onClick={() => handleTerminateStaff(staff.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                          >
                            계약 종료
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
                  {deliveryStaff.map((staff) => {
                    let statusLabel = '근무중';
                    let statusClasses = 'bg-blue-100 text-blue-700';
                    if (staff.status === 'free') {
                      statusLabel = '출근';
                      statusClasses = 'bg-green-100 text-green-700';
                    } else if (staff.status === 'off-duty') {
                      statusLabel = '퇴근';
                      statusClasses = 'bg-gray-100 text-gray-600';
                    }
                    return (
                      <div
                        key={staff.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          staff.status === 'free'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div>
                            <h3 className="font-bold text-gray-900">{staff.name}</h3>
                            <p className="text-xs text-gray-500">{staff.id}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleStaffStatus(staff.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            출퇴근 토글
                          </button>
                          <button
                            onClick={() => handleTerminateStaff(staff.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                          >
                            계약 종료
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'menu' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-amber-100">
                <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <span className="text-2xl">🍽️</span>
                  메뉴 구성 관리
                </h2>
                <p className="text-sm text-gray-600">
                  입고된 재료를 활용해 메인 메뉴와 사이드 메뉴 구성을 관리하세요. 각 메뉴의 기본 재료를 추가하거나 수량을 조정할 수 있습니다.
                </p>
              </div>

              {menuError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-700">{menuError}</p>
                    <button
                    onClick={refreshMenuData}
                    className="mt-3 inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                  >
                    다시 불러오기
                    </button>
                </div>
              )}

              {menuLoading ? (
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                  <p className="text-center text-gray-500">메뉴 구성을 불러오는 중입니다...</p>
                </div>
              ) : visibleMenuList.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                  <p className="text-center text-gray-500">등록된 메인 메뉴가 없습니다.</p>
                </div>
              ) : (
                <>
                  {visibleMenuList.map((menu) => {
                    const styles = menu.styles && menu.styles.length > 0
                      ? menu.styles
                      : [{ id: 'default', code: 'simple', name: '기본 구성', price: menu.base_price, description: '기본 제공 구성' }]

                        return (
                      <div key={menu.code} className="bg-white rounded-2xl shadow-lg p-6 border border-orange-100">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                          <div>
                            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                              <span className="text-3xl">🥂</span>
                              {menu.name}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">코드: {menu.code}</p>
                            {menu.description && (
                              <p className="mt-2 text-gray-700 text-sm leading-relaxed max-w-2xl">
                                {menu.description}
                              </p>
                      )}
                    </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">기본 가격</p>
                            <p className="text-xl font-semibold text-amber-600">{menu.base_price.toLocaleString()}원</p>
                    </div>
                  </div>

                        <div className="space-y-5">
                          {styles.map((style) => {
                            const normalizedStyle = (style.code || 'simple').toLowerCase()
                            const styleKey = buildMenuStyleKey(menu.code, normalizedStyle)
                            const styleIngredientMap = menuBaseMap[menu.code]?.[normalizedStyle] ?? style.base_ingredients ?? {}
                            const ingredientEntries = Object.entries(styleIngredientMap)
                              .sort((a, b) => {
                                const nameA = ingredientMap[a[0]]?.korean_name || a[0]
                                const nameB = ingredientMap[b[0]]?.korean_name || b[0]
                                return nameA.localeCompare(nameB, 'ko')
                              })
                            const additionDraft = menuIngredientDrafts[styleKey] ?? { ingredient_code: '', quantity: 0 }
                            const isAdding = menuActionLoading[styleKey] ?? false
                            const availableIngredients = ingredientsFlat
                              .filter((ingredient) => !ingredientEntries.some(([code]) => code === ingredient.name))
                              .sort((a, b) => (a.korean_name || a.name).localeCompare(b.korean_name || b.name, 'ko'))
                            const displayPrice = typeof style.price === 'number' ? style.price : menu.base_price

                            return (
                              <div key={style.id || normalizedStyle} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                  <div>
                                    <h4 className="text-lg font-semibold text-gray-800">{style.name || '기본 구성'}</h4>
                                    {style.description && (
                                      <p className="text-sm text-gray-600">{style.description}</p>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    제공 가격 {displayPrice.toLocaleString()}원
                      </div>
                    </div>

                    <div className="space-y-3">
                                  {ingredientEntries.length === 0 ? (
                                    <p className="text-sm text-gray-500">구성된 재료가 없습니다. 아래에서 재료를 추가해주세요.</p>
                                  ) : (
                                    ingredientEntries.map(([ingredientCode, baseQuantity]) => {
                                      const key = buildMenuIngredientKey(menu.code, normalizedStyle, ingredientCode)
                                      const ingredientInfo = ingredientMap[ingredientCode]
                                      const displayName = ingredientInfo?.korean_name || ingredientCode
                                      const unitLabel = ingredientInfo?.korean_unit || ingredientInfo?.unit || ''
                                      const editedQuantity = menuIngredientEdits[key] ?? baseQuantity
                                      const isChanged = editedQuantity !== baseQuantity
                                      const isProcessing = menuActionLoading[key] ?? false

                        return (
                                        <div key={ingredientCode} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3">
                            <div>
                                            <p className="font-medium text-gray-900">{displayName}</p>
                                            <p className="text-xs text-gray-500">코드: {ingredientCode}</p>
                            </div>
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <div className="flex items-center gap-2">
                                              <label className="text-xs text-gray-500">수량</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editedQuantity}
                                                onChange={(e) => handleMenuIngredientQuantityChange(menu.code, normalizedStyle, ingredientCode, Number(e.target.value))}
                                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                disabled={isProcessing}
                                />
                                              {unitLabel && (
                                                <span className="text-xs text-gray-400">{unitLabel}</span>
                                              )}
                                            </div>
                                            <div className="flex gap-2">
                          <button
                                                onClick={() => handleSaveMenuIngredient(menu.code, normalizedStyle, ingredientCode)}
                                                disabled={!isChanged || isProcessing}
                                                className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {isProcessing ? '저장 중...' : '수량 저장'}
                          </button>
                                              <button
                                                onClick={() => handleRemoveMenuIngredient(menu.code, normalizedStyle, ingredientCode)}
                                                disabled={isProcessing}
                                                className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                제거
                                </button>
                              </div>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                  </div>

                                <div className="mt-4 bg-white border border-dashed border-gray-300 rounded-lg p-4">
                                  <h5 className="text-sm font-semibold text-gray-700 mb-3">재료 추가</h5>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <select
                                      value={additionDraft.ingredient_code}
                                      onChange={(e) => handleMenuIngredientDraftChange(menu.code, normalizedStyle, 'ingredient_code', e.target.value)}
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                      disabled={isAdding || availableIngredients.length === 0}
                        >
                          <option value="">재료 선택</option>
                                      {availableIngredients.length === 0 ? (
                                        <option value="" disabled>추가 가능한 재료가 없습니다</option>
                                      ) : (
                                        availableIngredients.map((ingredient) => (
                            <option key={ingredient.id} value={ingredient.name}>
                                            {(ingredient.korean_name || ingredient.name)} · 재고 {ingredient.currentStock}{ingredient.korean_unit || ingredient.unit}
                            </option>
                                        ))
                                      )}
                        </select>
                              <div className="flex items-center gap-2">
                                      <label className="text-xs text-gray-500">수량</label>
                        <input
                          type="number"
                                        min={1}
                                        value={additionDraft.quantity > 0 ? additionDraft.quantity : ''}
                                        onChange={(e) => handleMenuIngredientDraftChange(menu.code, normalizedStyle, 'quantity', e.target.value)}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        disabled={isAdding}
                        />
                              </div>
                        <button
                                      onClick={() => handleAddMenuIngredient(menu.code, normalizedStyle)}
                                      disabled={isAdding || !additionDraft.ingredient_code || (additionDraft.quantity ?? 0) <= 0}
                                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                                      {isAdding ? '추가 중...' : '재료 추가'}
                        </button>
                      </div>
                    </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                    )
                  })}

                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-pink-100">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">🍰</span>
                  <div>
                        <h3 className="text-xl font-bold text-gray-800">사이드 메뉴 구성 관리</h3>
                        <p className="text-sm text-gray-600">커스터마이징 케이크를 포함한 사이드 메뉴의 재료를 관리하세요.</p>
                  </div>
                  </div>

                    {sideDishList.length === 0 ? (
                      <p className="text-sm text-gray-500">등록된 사이드 메뉴가 없습니다. 아래에서 새 사이드 메뉴를 등록하세요.</p>
                    ) : (
                      <div className="space-y-5">
                        {sideDishList.map((dish) => {
                          const sortedIngredients = [...(dish.ingredients ?? [])].sort((a, b) => {
                            const nameA = ingredientMap[a.ingredient_code]?.korean_name || a.ingredient_code
                            const nameB = ingredientMap[b.ingredient_code]?.korean_name || b.ingredient_code
                            return nameA.localeCompare(nameB, 'ko')
                          })
                          const dishKey = buildSideDishKey(dish.side_dish_id)
                          const additionDraft = sideDishIngredientDrafts[dishKey] ?? { ingredient_code: '', quantity: 0 }
                          const isAdding = sideDishActionLoading[dishKey] ?? false
                          const existingCodes = new Set(sortedIngredients.map((item) => item.ingredient_code))
                          const availableIngredients = ingredientsFlat
                            .filter((ingredient) => !existingCodes.has(ingredient.name))
                            .slice()
                            .sort((a, b) => (a.korean_name || a.name).localeCompare(b.korean_name || b.name, 'ko'))

                          return (
                            <div key={dish.side_dish_id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                                  <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <span>{dish.code === 'custom_cake' ? '🎂' : '🥗'}</span>
                                    {dish.name}
                                  </h4>
                                  {dish.description && (
                                    <p className="text-sm text-gray-600">{dish.description}</p>
                                  )}
                                  <p className="text-xs text-gray-500 mt-1">코드: {dish.code}</p>
                  </div>
                                <div className="text-right space-y-1">
                                  <div className="text-sm text-gray-500">기본 가격</div>
                                  <div className="text-lg font-semibold text-pink-600">{Number(dish.base_price ?? 0).toLocaleString()}원</div>
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                      dish.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {dish.is_available ? '판매중' : '일시 중지'}
                                  </span>
                                  {dish.code !== 'custom_cake' && (
                                    <button
                                      onClick={() => handleDeleteSideDish(dish.side_dish_id, dish.code)}
                                      disabled={sideDishDeleteLoading[dish.side_dish_id] ?? false}
                                      className="block w-full mt-2 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {sideDishDeleteLoading[dish.side_dish_id] ? '삭제 중...' : '삭제'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-3">
                                {sortedIngredients.length === 0 ? (
                                  <p className="text-sm text-gray-500">구성된 재료가 없습니다. 아래에서 재료를 추가해주세요.</p>
                                ) : (
                                  sortedIngredients.map((ingredient) => {
                                    const ingredientCode = ingredient.ingredient_code
                                    const key = buildSideDishIngredientKey(dish.side_dish_id, ingredientCode)
                                    const baseQuantity = Number(ingredient.quantity ?? 0)
                                    const editedQuantity = sideDishIngredientEdits[key] ?? baseQuantity
                                    const isChanged = editedQuantity !== baseQuantity
                                    const isProcessing = sideDishActionLoading[key] ?? false
                                    const ingredientInfo = ingredientMap[ingredientCode]
                                    const displayName = ingredientInfo?.korean_name || ingredientCode
                                    const unitLabel = ingredientInfo?.korean_unit || ingredientInfo?.unit || ''

                        return (
                                      <div key={ingredientCode} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3">
                            <div>
                                          <p className="font-medium text-gray-900">{displayName}</p>
                                          <p className="text-xs text-gray-500">코드: {ingredientCode}</p>
                            </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <div className="flex items-center gap-2">
                                            <label className="text-xs text-gray-500">수량</label>
                                <input
                                  type="number"
                                  min={0}
                                              step={0.01}
                                  value={editedQuantity}
                                              onChange={(e) => handleSideDishIngredientChange(dish.side_dish_id, ingredientCode, Number(e.target.value))}
                                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                              disabled={isProcessing}
                                />
                                            {unitLabel && (
                                              <span className="text-xs text-gray-400">{unitLabel}</span>
                                            )}
                                          </div>
                                          <div className="flex gap-2">
                                <button
                                              onClick={() => handleSaveSideDishIngredient(dish.side_dish_id, ingredientCode)}
                                              disabled={!isChanged || isProcessing}
                                              className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {isProcessing ? '저장 중...' : '수량 저장'}
                                            </button>
                                            <button
                                              onClick={() => handleRemoveSideDishIngredient(dish.side_dish_id, ingredientCode)}
                                              disabled={isProcessing}
                                              className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              제거
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                              </div>

                              <div className="mt-4 bg-white border border-dashed border-gray-300 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-3">재료 추가</h5>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <select
                                    value={additionDraft.ingredient_code}
                                    onChange={(e) => handleSideDishIngredientDraftChange(dish.side_dish_id, 'ingredient_code', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    disabled={isAdding || availableIngredients.length === 0}
                                  >
                                    <option value="">재료 선택</option>
                                    {availableIngredients.length === 0 ? (
                                      <option value="" disabled>추가 가능한 재료가 없습니다</option>
                                    ) : (
                                      availableIngredients.map((ingredient) => (
                                        <option key={`${dish.side_dish_id}-${ingredient.id}`} value={ingredient.name}>
                                          {(ingredient.korean_name || ingredient.name)} · 재고 {ingredient.currentStock}{ingredient.korean_unit || ingredient.unit}
                                        </option>
                                      ))
                                    )}
                                  </select>
                              <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-500">수량</label>
                                <input
                                  type="number"
                                      min={0.01}
                                      step={0.01}
                                      value={additionDraft.quantity > 0 ? additionDraft.quantity : ''}
                                      onChange={(e) => handleSideDishIngredientDraftChange(dish.side_dish_id, 'quantity', e.target.value)}
                                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                      disabled={isAdding}
                                    />
                                  </div>
                                <button
                                    onClick={() => handleAddSideDishIngredient(dish.side_dish_id)}
                                    disabled={isAdding || !additionDraft.ingredient_code || (additionDraft.quantity ?? 0) <= 0}
                                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAdding ? '추가 중...' : '재료 추가'}
                                </button>
                              </div>
                              </div>

                              {dish.code === 'custom_cake' && (
                                <div className="mt-6 bg-white border border-pink-200 rounded-xl p-4">
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm font-semibold text-pink-700">맛</label>
                                      <select
                                        value={selectedCakeFlavor}
                                        onChange={(e) => setSelectedCakeFlavor(e.target.value)}
                                        className="px-3 py-2 border border-pink-200 rounded-lg text-sm"
                                      >
                                        {CUSTOM_CAKE_FLAVORS.map((flavor) => (
                                          <option key={flavor.code} value={flavor.code}>{flavor.label}</option>
                                        ))}
                                      </select>
                            </div>
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm font-semibold text-pink-700">사이즈</label>
                                      <select
                                        value={selectedCakeSize}
                                        onChange={(e) => setSelectedCakeSize(e.target.value)}
                                        className="px-3 py-2 border border-pink-200 rounded-lg text-sm"
                                      >
                                        {CUSTOM_CAKE_SIZES.map((size) => (
                                          <option key={size.code} value={size.code}>{size.label}</option>
                                        ))}
                                      </select>
                          </div>
                    </div>

                                  {customCakeRecipeError && (
                                    <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                      {customCakeRecipeError}
                  </div>
                                  )}

                                  {customCakeRecipeLoading ? (
                                    <p className="text-sm text-gray-500">커스텀 케이크 레시피를 불러오는 중입니다...</p>
                                  ) : (
                                    <div className="space-y-3">
                                      {currentCustomCakeRecipe.length === 0 ? (
                                        <p className="text-sm text-gray-500">선택된 맛과 사이즈에 등록된 레시피가 없습니다. 아래에서 재료를 추가해주세요.</p>
                                      ) : (
                                        currentCustomCakeRecipe.map((item) => {
                                          const ingredientInfo = ingredientMap[item.ingredient_code]
                                          const displayName = ingredientInfo?.korean_name || item.ingredient_code
                                          const unitLabel = ingredientInfo?.korean_unit || ingredientInfo?.unit || ''
                                          const key = buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, item.ingredient_code)
                                          const editedQuantity = customCakeRecipeEdits[key] ?? item.quantity
                                          const isChanged = editedQuantity !== item.quantity
                                          const isProcessing = customCakeRecipeActionLoading[key] ?? false

                                          return (
                                            <div key={item.ingredient_code} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-pink-100 rounded-lg p-3">
                  <div>
                                                <p className="font-medium text-gray-900">{displayName}</p>
                                                <p className="text-xs text-gray-500">코드: {item.ingredient_code}</p>
                  </div>
                                              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                  <label className="text-xs text-gray-500">수량</label>
                    <input
                      type="number"
                      min={0}
                                                    step={0.01}
                                                    value={editedQuantity}
                                                    onChange={(e) => handleCustomCakeRecipeQuantityChange(item.ingredient_code, Number(e.target.value))}
                                                    className="w-24 px-3 py-2 border border-pink-200 rounded-lg text-sm"
                                                    disabled={isProcessing}
                                                  />
                                                  {unitLabel && <span className="text-xs text-gray-400">{unitLabel}</span>}
                  </div>
                                                <div className="flex gap-2">
                <button
                                                    onClick={() => handleSaveCustomCakeRecipeIngredient(item.ingredient_code)}
                                                    disabled={!isChanged || isProcessing}
                                                    className="px-3 py-2 bg-pink-600 text-white text-sm font-semibold rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    {isProcessing ? '저장 중...' : '수량 저장'}
                                                  </button>
                                                  <button
                                                    onClick={() => handleRemoveCustomCakeRecipeIngredient(item.ingredient_code)}
                                                    disabled={isProcessing}
                                                    className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    제거
                </button>
              </div>
            </div>
                                            </div>
                                          )
                                        })
                                      )}

                                      <div className="bg-pink-50 border border-dashed border-pink-200 rounded-lg p-4">
                                        <h5 className="text-sm font-semibold text-pink-700 mb-3">레시피 재료 추가</h5>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                          <select
                                            value={customCakeRecipeDraft.ingredient_code}
                                            onChange={(e) => handleCustomCakeRecipeDraftChange('ingredient_code', e.target.value)}
                                            className="flex-1 px-3 py-2 border border-pink-200 rounded-lg text-sm"
                                          >
                                            <option value="">재료 선택</option>
                                            {ingredientsFlat
                                              .filter((ingredient) => !currentCustomCakeRecipe.some((item) => item.ingredient_code === ingredient.name))
                                              .sort((a, b) => (a.korean_name || a.name).localeCompare(b.korean_name || b.name, 'ko'))
                                              .map((ingredient) => (
                                                <option key={`custom-cake-${ingredient.id}`} value={ingredient.name}>
                                                  {(ingredient.korean_name || ingredient.name)} · 재고 {ingredient.currentStock}{ingredient.korean_unit || ingredient.unit}
                                                </option>
                                              ))}
                                          </select>
                                          <div className="flex items-center gap-2">
                                            <label className="text-xs text-gray-500">수량</label>
                                            <input
                                              type="number"
                                              min={0.01}
                                              step={0.01}
                                              value={customCakeRecipeDraft.quantity > 0 ? customCakeRecipeDraft.quantity : ''}
                                              onChange={(e) => handleCustomCakeRecipeDraftChange('quantity', Number(e.target.value))}
                                              className="w-24 px-3 py-2 border border-pink-200 rounded-lg text-sm"
                                            />
                                          </div>
                  <button
                                            onClick={handleAddCustomCakeRecipeIngredient}
                                            className="px-4 py-2 bg-pink-600 text-white text-sm font-semibold rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={
                                              (customCakeRecipeDraft.quantity ?? 0) <= 0 ||
                                              !customCakeRecipeDraft.ingredient_code ||
                                              (customCakeRecipeDraft.ingredient_code
                                                ? customCakeRecipeActionLoading[buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, customCakeRecipeDraft.ingredient_code)]
                                                : false)
                                            }
                                          >
                                            {customCakeRecipeDraft.ingredient_code && customCakeRecipeActionLoading[buildCustomCakeRecipeKey(selectedCakeFlavor, selectedCakeSize, customCakeRecipeDraft.ingredient_code)]
                                              ? '추가 중...'
                                              : '추가'}
                  </button>
                </div>
                        </div>
                        </div>
                                  )}
                      </div>
                  )}
                </div>
                          )
                        })}
              </div>
                  )}

                    <div className="mt-8 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                          <span className="text-2xl">🆕</span>
                          신규 사이드 메뉴 등록
                        </h4>
                  {managerSideDishMessage && (
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">
                      {managerSideDishMessage}
                    </span>
                  )}
                </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">사이드 메뉴 코드</label>
                      <input
                        type="text"
                        value={managerSideDishForm.code}
                            onChange={(e) => setManagerSideDishForm((prev) => ({ ...prev, code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="예: cheese_plate"
                      />
                    </div>
                    <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">사이드 메뉴 이름</label>
                      <input
                        type="text"
                        value={managerSideDishForm.name}
                            onChange={(e) => setManagerSideDishForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="예: 치즈 플레이터"
                      />
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">기본 가격 (원)</label>
                    <input
                      type="number"
                      min={0}
                      value={managerSideDishForm.basePrice}
                            onChange={(e) => setManagerSideDishForm((prev) => ({ ...prev, basePrice: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                      placeholder="예: 15000"
                    />
                  </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">설명 (선택)</label>
                          <textarea
                            rows={3}
                            value={managerSideDishForm.description}
                            onChange={(e) => setManagerSideDishForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="예: 매일 구운 치즈와 과일을 함께 제공합니다."
                          />
                        </div>
                    </div>

                      <div className="mt-4 space-y-3">
                        {managerSideDishIngredients.map((row, index) => {
                          const ingredientOptions = ingredientsFlat
                            .slice()
                            .sort((a, b) => (a.korean_name || a.name).localeCompare(b.korean_name || b.name, 'ko'))

                          return (
                            <div key={index} className="flex flex-col md:flex-row md:items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                              <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                          <select
                            value={row.ingredientCode}
                            onChange={(e) => handleManagerSideDishIngredientChange(index, 'ingredientCode', e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">재료 선택</option>
                                  {ingredientOptions.map((ingredient) => (
                                    <option key={`${ingredient.id}-${index}`} value={ingredient.name}>
                                      {(ingredient.korean_name || ingredient.name)} · 재고 {ingredient.currentStock}{ingredient.korean_unit || ingredient.unit}
                              </option>
                            ))}
                          </select>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500">수량</label>
                          <input
                            type="number"
                                    min={0.01}
                                    step={0.01}
                                    value={row.quantity > 0 ? row.quantity : ''}
                            onChange={(e) => handleManagerSideDishIngredientChange(index, 'quantity', Number(e.target.value))}
                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                                </div>
                              </div>
                              {managerSideDishIngredients.length > 1 && (
                          <button
                            onClick={() => handleRemoveManagerSideDishIngredientRow(index)}
                                  className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600"
                          >
                                  행 삭제
                          </button>
                              )}
                        </div>
                          )
                        })}
                        <button
                          onClick={handleAddManagerSideDishIngredientRow}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-emerald-400 text-emerald-600 text-sm font-semibold rounded-lg hover:bg-emerald-50"
                        >
                          <span className="text-base">+</span>
                          재료 행 추가
                        </button>
                  </div>

                  <button
                    onClick={handleSubmitManagerSideDish}
                    disabled={isSubmittingManagerSideDish}
                        className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                        {isSubmittingManagerSideDish ? '등록 중...' : '사이드 메뉴 등록'}
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {!loading && activeTab === 'inventory' && (
            <div className="space-y-6">
              {/* 입고 승인 대기 목록 */}
              {pendingIntakes.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl shadow-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">⚠️</span>
                    <h2 className="text-xl font-bold text-gray-800">입고 검수 대기 ({pendingIntakes.length}건)</h2>
                  </div>
                  <div className="space-y-3">
                    {pendingIntakes.map((intake) => (
                      <div key={intake.batch_id} className="bg-white rounded-lg p-4 border border-yellow-300">
                        <div className="flex items-start justify-between mb-3 gap-4">
                          <div>
                            <h3 className="font-bold text-gray-900">{intake.manager_name || '알 수 없는 관리자'}</h3>
                            <p className="text-xs text-gray-500 mt-1">
                              {intake.created_at ? new Date(intake.created_at).toLocaleString('ko-KR') : ''}
                            </p>
                            {intake.note && (
                              <p className="text-xs text-gray-500 mt-1">비고: {intake.note}</p>
                            )}
                            <p className="text-xs text-gray-600 mt-2">
                              예상 비용: <span className="font-semibold text-yellow-700">{intake.total_expected_cost.toLocaleString()}원</span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                              요리사 확인 대기
                            </span>
                            <p className="text-xs text-gray-500 text-right">요리사가 확인 후 자동 반영됩니다.</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-700 mb-2">입고 예정 항목</p>
                          <div className="space-y-1">
                            {intake.intake_items.map((item) => (
                              <div key={item.intake_item_id} className="flex items-center justify-between text-xs text-gray-600">
                                <span>{item.ingredient_code}</span>
                                <span className="font-medium text-gray-800">
                                  {item.expected_quantity.toLocaleString()}개 · 단가 {item.unit_price.toLocaleString()}원
                                </span>
                              </div>
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
                    <p className="text-sm text-gray-500">최근 완료된 입고 배치를 확인하세요</p>
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
                      <div key={entry.batch_id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {entry.manager_name || '알 수 없는 관리자'}
                              {entry.manager_email && (
                                <span className="ml-2 text-xs text-gray-500">{entry.manager_email}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              생성: {entry.created_at ? new Date(entry.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                            </p>
                            {entry.reviewed_at && (
                              <p className="text-xs text-gray-500">
                                완료: {new Date(entry.reviewed_at).toLocaleString('ko-KR')}
                                {entry.cook_name && ` · ${entry.cook_name}`}
                              </p>
                            )}
                            {entry.note && (
                              <p className="text-xs text-gray-600 mt-1">비고: {entry.note}</p>
                            )}
                            <p className="text-xs text-gray-600 mt-1">
                              실제 비용: <span className="font-semibold text-green-700">{entry.total_actual_cost.toLocaleString()}원</span>
                              {entry.total_expected_cost !== entry.total_actual_cost && (
                                <span className="ml-2 text-gray-500">(예상 {entry.total_expected_cost.toLocaleString()}원)</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              entry.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-700'
                                : entry.status === 'AWAITING_COOK'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {entry.status === 'COMPLETED' ? '완료' : entry.status === 'AWAITING_COOK' ? '검수 대기' : entry.status}
                            </span>
                          </div>
                        </div>

                        {entry.intake_items.length > 0 && (
                          <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                            <p className="text-xs font-semibold text-gray-700 mb-2">입고 항목</p>
                            <div className="space-y-1">
                              {entry.intake_items.map((item) => (
                                <div key={item.intake_item_id} className="flex items-center justify-between text-xs text-gray-600">
                                  <span>{item.ingredient_code}</span>
                                  <span className="font-medium text-gray-800">
                                    예상 {item.expected_quantity.toLocaleString()}개 → 실제 {item.actual_quantity.toLocaleString()}개
                                    <span className="ml-2 text-gray-500">
                                      단가 {item.unit_price.toLocaleString()}원
                                    </span>
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

              {CATEGORY_KEYS.map((categoryKey) => {
                const category = combinedCategories.find(cat => cat.key === categoryKey)
                const metadata = CATEGORY_METADATA[categoryKey]
                const options = category?.items ?? []
                const form = quickRestockForms[categoryKey]
                const isLoading = quickRestockLoading[categoryKey]
                const sampleItems = options.slice(0, Math.min(options.length, 6))

                return (
                  <div key={categoryKey} className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{metadata.icon}</span>
                      <div>
                        <h2 className="text-xl font-bold text-gray-800">{metadata.title}</h2>
                        <p className="text-sm text-gray-500">{metadata.subtitle}</p>
                      </div>
                      <div className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${
                        category?.restock_frequency === 'daily'
                          ? 'bg-green-100 text-green-800'
                          : category?.restock_frequency === 'twice_weekly'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {category?.restock_frequency === 'daily' ? '매일 추가 가능' :
                         category?.restock_frequency === 'twice_weekly' ? '주 2회 추가' :
                         '필요시 추가'}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <select
                          value={form.ingredient_code}
                          onChange={(e) => setQuickRestockForms(prev => ({
                            ...prev,
                            [categoryKey]: { ...prev[categoryKey], ingredient_code: e.target.value }
                          }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">발주할 항목 선택</option>
                          {options.length === 0 ? (
                            <option value="" disabled>등록된 항목이 없습니다</option>
                          ) : (
                            options.map((item: Ingredient) => (
                              <option key={item.id} value={item.name}>
                                {(item.korean_name || item.name)} · 현재 {item.currentStock}{item.korean_unit || item.unit}
                              </option>
                            ))
                          )}
                        </select>
                      <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">추가 수량</label>
                        <input
                          type="number"
                          min={1}
                            value={form.quantity || ''}
                          onChange={(e) => {
                              const rawValue = e.target.value
                              setQuickRestockForms(prev => ({
                                ...prev,
                                [categoryKey]: {
                                  ...prev[categoryKey],
                                  quantity: rawValue === '' ? 0 : Math.max(1, Math.floor(Number(rawValue)))
                                }
                              }))
                          }}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                          </div>
                      </div>
                      <button
                        onClick={() => handleQuickCategoryRestock(categoryKey)}
                        disabled={isLoading || options.length === 0 || form.quantity <= 0}
                        className={`w-full py-3 px-4 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          categoryKey === 'alcohol'
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : categoryKey === 'ingredients'
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {isLoading ? '입고 요청 중...' : '입고 요청 등록'}
                      </button>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700 mb-2">등록된 항목</p>
                      {options.length === 0 ? (
                        <p className="text-sm text-gray-500">현재 등록된 항목이 없습니다.</p>
                      ) : (
                        <div className="space-y-2">
                          {sampleItems.map((item: Ingredient) => {
                            const isLowStock = item.currentStock <= item.minimumStock
                            return (
                              <div key={item.id} className="flex items-center justify-between text-sm text-gray-600">
                                <span>{item.korean_name || item.name}</span>
                                <span className={`text-xs font-medium ${
                                  isLowStock ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {item.currentStock}{item.korean_unit || item.unit}
                                </span>
                          </div>
                )
              })}
                          {options.length > sampleItems.length && (
                            <p className="text-xs text-gray-500">…외 {options.length - sampleItems.length}개 항목</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-100">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">📊</span>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">재료 단가 및 삭제</h2>
                    <p className="text-sm text-gray-500">등록된 재료의 단가를 조정하거나 필요 없는 재료를 제거하세요.</p>
                  </div>
                </div>

                {ingredientsFlat.length === 0 ? (
                  <p className="text-sm text-gray-500">등록된 재료가 없습니다. 우선 재료를 등록해주세요.</p>
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {ingredientsFlat.map((ingredient: Ingredient) => {
                      const currentPrice = ingredientPricingMap[ingredient.name] ?? 0
                      const editedPrice = editedPrices[ingredient.name] ?? currentPrice
                      return (
                        <div
                          key={ingredient.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-gray-200 rounded-xl bg-gray-50"
                        >
                          <div>
                            <p className="font-semibold text-gray-800">{ingredient.korean_name || ingredient.name}</p>
                            <p className="text-xs text-gray-500">
                              코드: {ingredient.name} · 현재 재고 {ingredient.currentStock}{' '}
                              {ingredient.korean_unit || ingredient.unit}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-600">단가</label>
                        <input
                          type="number"
                                min={0}
                                value={editedPrice}
                                onChange={(e) => handlePriceChange(ingredient.name, Number(e.target.value))}
                                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              <button
                                onClick={() => handleSavePrice(ingredient.name, editedPrice)}
                                className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                              >
                                단가 저장
                              </button>
                            </div>
                            <button
                              onClick={() => handleRemoveIngredient(ingredient.name)}
                              className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span className="text-2xl">➕</span>
                    재료 등록
                  </h3>
                  {ingredientCreationMessage && (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">
                      {ingredientCreationMessage}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">재료 이름</label>
                    <input
                      type="text"
                      value={newIngredientForm.name}
                      onChange={(e) => setNewIngredientForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="예: premium_steak"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">단위</label>
                    <input
                      type="text"
                      value={newIngredientForm.unit}
                      onChange={(e) => setNewIngredientForm(prev => ({ ...prev, unit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="예: piece"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">단가 (원)</label>
                    <input
                      type="number"
                      min={0}
                      value={newIngredientForm.unitPrice}
                      onChange={(e) => setNewIngredientForm(prev => ({ ...prev, unitPrice: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="예: 15000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">초기 재고 (선택)</label>
                    <input
                      type="number"
                      min={0}
                      value={newIngredientForm.initialStock}
                      onChange={(e) => setNewIngredientForm(prev => ({ ...prev, initialStock: Math.max(0, Number(e.target.value)) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="예: 20"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSubmitNewIngredient}
                  disabled={isSubmittingIngredient}
                  className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmittingIngredient ? '등록 중...' : '신규 재료 등록'}
                </button>
              </div>

              {combinedCategories
                .filter(category => !CATEGORY_KEYS.includes(category.key as CategoryKey))
                .map((category: CombinedCategory) => (
                  <div key={category.key} className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">📦</span>
                      <div>
                        <h2 className="text-xl font-bold text-gray-800">{category.name}</h2>
                        <p className="text-sm text-gray-500">{category.description || '등록된 구성 항목'}</p>
                      </div>
                    </div>
                    {category.items.length === 0 ? (
                      <p className="text-sm text-gray-500">현재 등록된 항목이 없습니다.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {category.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-sm text-gray-600">
                            <span>{item.korean_name || item.name}</span>
                            <span>{item.currentStock}{item.korean_unit || item.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {!loading && activeTab === 'events' && (
            <div className="space-y-6">
              {eventsError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl">
                  {eventsError}
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📝</span>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">신규 이벤트 등록</h2>
                      <p className="text-sm text-gray-500">제목, 기간, 태그, 이미지를 등록하여 고객에게 노출할 이벤트를 관리하세요.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 제목</label>
                      <input
                        type="text"
                        value={eventForm.title}
                        onChange={(e) => handleEventFormChange('title', e.target.value)}
                        placeholder="예: 미스터 대박 크리스마스 갈라"
                        className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                      <textarea
                        value={eventForm.description}
                        onChange={(e) => handleEventFormChange('description', e.target.value)}
                        rows={4}
                        placeholder="이벤트 상세 내용을 입력하세요."
                        className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">할인/배지 문구</label>
                        <input
                          type="text"
                          value={eventForm.discountLabel}
                          onChange={(e) => handleEventFormChange('discountLabel', e.target.value)}
                          placeholder="예: Holiday 20% 할인"
                          className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">태그</label>
                        <input
                          type="text"
                          value={eventForm.tags}
                          onChange={(e) => handleEventFormChange('tags', e.target.value)}
                          placeholder="예: 시즌한정, 프리미엄"
                          className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">쉼표(,)로 구분하여 여러 태그를 입력하세요.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                        <input
                          type="date"
                          value={eventForm.startDate}
                          onChange={(e) => handleEventFormChange('startDate', e.target.value)}
                          className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                        <input
                          type="date"
                          value={eventForm.endDate}
                          onChange={(e) => handleEventFormChange('endDate', e.target.value)}
                          className="w-full px-4 py-3 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={eventForm.isPublished}
                          onChange={(e) => handleEventFormChange('isPublished', e.target.checked)}
                          className="w-4 h-4 text-amber-600 border-gray-300 rounded"
                        />
                        공개 상태로 등록
                      </label>
                    </div>

                    <div className="border border-amber-100 rounded-xl p-4 bg-amber-50/60 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">이벤트 할인 구성</span>
                        <button
                          type="button"
                          onClick={handleAddNewEventDiscountRow}
                          className="text-xs font-semibold text-amber-700 hover:text-amber-800"
                        >
                          + 할인 항목 추가
                        </button>
                      </div>

                      {eventDiscountForm.map((row, index) => {
                        const takenTargets = new Set(
                          eventDiscountForm
                            .filter((_, idx) => idx !== index && eventDiscountForm[idx].menuItemId)
                            .map(item => `${item.targetType}|${item.menuItemId}`)
                        )
                        const selectValue = row.menuItemId ? `${row.targetType}|${row.menuItemId}` : ''
                        const optionList = discountTargetOptions
                        const activeTarget = optionList.find(
                          option => option.id === row.menuItemId && option.kind === row.targetType
                        )

                        return (
                          <div
                            key={`new-event-discount-${index}`}
                            className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_auto] gap-3 items-end border border-amber-100 rounded-lg p-3 bg-white shadow-sm"
                          >
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">할인 대상</label>
                              <select
                                value={selectValue}
                                onChange={(e) => handleChangeNewEventDiscountRow(index, 'menuItemId', e.target.value)}
                                className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                              >
                                <option value="">할인 대상을 선택하세요</option>
                                {optionList.map((option) => (
                                  <option
                                    key={`${option.kind}|${option.id}`}
                                    value={`${option.kind}|${option.id}`}
                                    disabled={takenTargets.has(`${option.kind}|${option.id}`)}
                                  >
                                    {option.display}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">할인 유형</label>
                                <select
                                  value={row.discountType}
                                  onChange={(e) => handleChangeNewEventDiscountRow(index, 'discountType', e.target.value)}
                                  className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                >
                                  <option value="PERCENT">퍼센트 (%)</option>
                                  <option value="FIXED">금액 (원)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">할인 값</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={row.discountType === 'PERCENT' ? 100 : undefined}
                                  step={row.discountType === 'PERCENT' ? 0.1 : 1000}
                                  value={row.discountValue}
                                  onChange={(e) => handleChangeNewEventDiscountRow(index, 'discountValue', e.target.value)}
                                  className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveNewEventDiscountRow(index)}
                              className="self-start px-3 py-2 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors"
                            >
                              제거
                            </button>

                            {activeTarget && typeof activeTarget.price === 'number' && !Number.isNaN(activeTarget.price) && (
                              <p className="md:col-span-3 text-xs text-gray-500">
                                기준가 {Number(activeTarget.price).toLocaleString()}원
                              </p>
                            )}
                          </div>
                        )
                      })}

                      {menuList.length === 0 && (
                        <p className="text-xs text-amber-700">
                          메뉴 데이터를 불러오는 중입니다. 잠시 후 다시 시도하거나 메뉴 탭에서 데이터를 갱신하세요.
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        퍼센트 할인은 0~100 사이 값을 입력하고, 금액 할인은 원 단위 금액을 입력하세요. 메뉴와 할인 값이 모두 채워진 항목만 적용됩니다.
                      </p>
                    </div>

                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">대표 이미지 (최대 5MB)</label>
                       <input
                         type="file"
                         accept="image/*"
                         onChange={(e) => handleEventImageInput(e.target.files?.[0] ?? null)}
                         className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                       />
                       {eventImageFile && (
                         <p className="text-xs text-gray-500 mt-1">선택한 파일: {eventImageFile.name}</p>
                       )}
                     </div>

                    <button
                      onClick={handleCreateEvent}
                      disabled={eventSubmitting}
                      className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {eventSubmitting ? '등록 중...' : '이벤트 등록'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">📅</span>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">등록된 이벤트</h2>
                    <p className="text-sm text-gray-500">현재 등록된 이벤트의 노출 여부와 내용을 관리하세요.</p>
                  </div>
                  <button
                    onClick={() => fetchManagerEvents()}
                    className="ml-auto px-3 py-1 text-sm font-medium text-pink-700 bg-pink-100 hover:bg-pink-200 rounded-lg transition-colors"
                  >
                    새로고침
                  </button>
                </div>

                {eventsLoading ? (
                  <div className="flex justify-center items-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div>
                  </div>
                ) : managerEvents.length === 0 ? (
                  <p className="text-center text-gray-500 py-12">등록된 이벤트가 없습니다. 새로운 이벤트를 추가해보세요.</p>
                ) : (
                  <div className="space-y-6">
                    {managerEvents.map((event) => {
                      const draft = eventEditDrafts[event.id] ?? {
                        title: event.title,
                        description: event.description,
                        discountLabel: event.discountLabel ?? '',
                        startDate: event.startDate ?? '',
                        endDate: event.endDate ?? '',
                        tags: event.tags.join(', '),
                        isPublished: event.isPublished
                      }
                      const discountDraft = eventDiscountDrafts[event.id] && eventDiscountDrafts[event.id]!.length > 0
                        ? eventDiscountDrafts[event.id]!
                        : [createDefaultEventDiscount()]

                      return (
                        <div key={event.id} className="border border-gray-200 rounded-2xl p-6 bg-white">
                          <div className="flex flex-col lg:flex-row gap-6">
                            <div className="lg:w-1/3 space-y-3">
                              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 aspect-video">
                                {event.imagePath ? (
                                  <img src={event.imagePath} alt={event.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                                    <span className="text-2xl mb-2">🖼️</span>
                                    이미지가 없습니다
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">이미지 변경</label>
                                <input
                                  type="file"
                                  accept="image/*"
                          onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadEventImage(event.id, file)
                                      e.target.value = ''
                                    }
                                  }}
                                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
                                  disabled={Boolean(eventImageUploading[event.id])}
                                />
                                {eventImageUploading[event.id] && (
                                  <p className="text-xs text-pink-600 mt-1">이미지를 업로드하는 중입니다...</p>
                                )}
                      </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>생성: {event.createdAt ? new Date(event.createdAt).toLocaleString('ko-KR') : '-'}</span>
                                <span>·</span>
                                <span>수정: {event.updatedAt ? new Date(event.updatedAt).toLocaleString('ko-KR') : '-'}</span>
                              </div>
                            </div>

                            <div className="flex-1 space-y-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${draft.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                  {draft.isPublished ? '공개 중' : '비공개'}
                                </span>
                                {event.discountLabel && (
                                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                    {event.discountLabel}
                                  </span>
                                )}
                                {(event.startDate || event.endDate) && (
                                  <span className="text-xs text-gray-500 ml-auto">
                                    {event.startDate ? new Date(event.startDate).toLocaleDateString('ko-KR') : '미정'}
                                    {' '}~{' '}
                                    {event.endDate ? new Date(event.endDate).toLocaleDateString('ko-KR') : '미정'}
                                  </span>
                                )}
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                                <input
                                  type="text"
                                  value={draft.title}
                                  onChange={(e) => handleEventDraftChange(event.id, 'title', e.target.value)}
                                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                                <textarea
                                  value={draft.description}
                                  onChange={(e) => handleEventDraftChange(event.id, 'description', e.target.value)}
                                  rows={4}
                                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">할인 문구</label>
                                  <input
                                    type="text"
                                    value={draft.discountLabel}
                                    onChange={(e) => handleEventDraftChange(event.id, 'discountLabel', e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">태그</label>
                                  <input
                                    type="text"
                                    value={draft.tags}
                                    onChange={(e) => handleEventDraftChange(event.id, 'tags', e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">쉼표로 구분된 태그 목록</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                                  <input
                                    type="date"
                                    value={draft.startDate}
                                    onChange={(e) => handleEventDraftChange(event.id, 'startDate', e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                                  <input
                                    type="date"
                                    value={draft.endDate}
                                    onChange={(e) => handleEventDraftChange(event.id, 'endDate', e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                                  />
                                </div>
                              </div>

                              <div className="border border-pink-100 rounded-xl p-4 bg-pink-50/60 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-700">이벤트 할인 구성</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddEventDiscountDraftRow(event.id)}
                                    className="text-xs font-semibold text-pink-600 hover:text-pink-700"
                                  >
                                    + 할인 항목 추가
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  {discountDraft.map((row, index) => {
                                    const takenTargets = new Set(
                                      discountDraft
                                        .filter((_, idx) => idx !== index && discountDraft[idx].menuItemId)
                                        .map(item => `${item.targetType}|${item.menuItemId}`)
                                    )
                                    const selectValue = row.menuItemId ? `${row.targetType}|${row.menuItemId}` : ''
                                    const optionList = (() => {
                                      const baseOptions = [...discountTargetOptions]
                                      if (row.menuItemId) {
                                        const exists = baseOptions.some(
                                          option => option.id === row.menuItemId && option.kind === row.targetType
                                        )
                                        if (!exists) {
                                          const existingDiscount = event.menuDiscounts.find(
                                            discount => discount.menuItemId === row.menuItemId && discount.targetType === row.targetType
                                          )
                                          const displayName =
                                            row.targetType === 'SIDE_DISH'
                                              ? `사이드 · ${existingDiscount?.sideDishName ?? existingDiscount?.menuName ?? '사이드 메뉴'}`
                                              : `메뉴 · ${existingDiscount?.menuName ?? '메뉴'}`
                                          baseOptions.push({
                                            kind: row.targetType,
                                            id: row.menuItemId,
                                            display: displayName,
                                          })
                                        }
                                      }
                                      return baseOptions
                                    })()
                                    const activeTarget = optionList.find(
                                      option => option.id === row.menuItemId && option.kind === row.targetType
                                    )

                                    return (
                                      <div
                                        key={`event-${event.id}-discount-${index}`}
                                        className="border border-pink-100 rounded-lg bg-white shadow-sm p-3 space-y-3"
                                      >
                                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_auto] md:gap-3 md:items-end">
                                          <div className="mb-3 md:mb-0">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">할인 대상</label>
                                            <select
                                              value={selectValue}
                                              onChange={(e) => handleChangeEventDiscountDraftRow(event.id, index, 'menuItemId', e.target.value)}
                                              className="w-full px-3 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                                            >
                                              <option value="">할인 대상을 선택하세요</option>
                                              {optionList.map((option) => (
                                                <option
                                                  key={`${option.kind}|${option.id}`}
                                                  value={`${option.kind}|${option.id}`}
                                                  disabled={takenTargets.has(`${option.kind}|${option.id}`)}
                                                >
                                                  {option.display}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          <div className="grid grid-cols-2 gap-2 mb-3 md:mb-0">
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 mb-1">할인 유형</label>
                                              <select
                                                value={row.discountType}
                                                onChange={(e) => handleChangeEventDiscountDraftRow(event.id, index, 'discountType', e.target.value)}
                                                className="w-full px-3 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                                              >
                                                <option value="PERCENT">퍼센트 (%)</option>
                                                <option value="FIXED">금액 (원)</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 mb-1">할인 값</label>
                                              <input
                                                type="number"
                                                min={0}
                                                max={row.discountType === 'PERCENT' ? 100 : undefined}
                                                step={row.discountType === 'PERCENT' ? 0.1 : 1000}
                                                value={row.discountValue}
                                                onChange={(e) => handleChangeEventDiscountDraftRow(event.id, index, 'discountValue', e.target.value)}
                                                className="w-full px-3 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                                              />
                                            </div>
                                          </div>

                                          <div className="flex md:block">
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveEventDiscountDraftRow(event.id, index)}
                                              className="md:self-start px-3 py-2 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors"
                                            >
                                              제거
                                            </button>
                                          </div>
                                        </div>

                                        {activeTarget && typeof activeTarget.price === 'number' && !Number.isNaN(activeTarget.price) && (
                                          <p className="text-xs text-gray-500">
                                            기준가 {Number(activeTarget.price).toLocaleString()}원
                                          </p>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>

                                {discountTargetOptions.length === 0 && (
                                  <p className="text-xs text-pink-700">
                                    할인 대상 데이터를 불러오는 중입니다. 잠시 후 다시 시도하거나 메뉴/사이드 메뉴 정보를 갱신하세요.
                                  </p>
                                )}
                                <p className="text-xs text-gray-500">
                                  퍼센트 할인은 0~100 사이 값을 입력하고, 금액 할인은 원 단위 금액을 입력하세요. 할인 대상과 할인 값이 모두 채워진 항목만 적용됩니다.
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  id={`event-publish-${event.id}`}
                                  type="checkbox"
                                  checked={draft.isPublished}
                                  onChange={(e) => handleEventDraftChange(event.id, 'isPublished', e.target.checked)}
                                  className="w-4 h-4 text-pink-600 border-gray-300 rounded"
                                />
                                <label htmlFor={`event-publish-${event.id}`} className="text-sm text-gray-700">공개 상태</label>
                              </div>

                              <div className="flex flex-wrap gap-3 justify-end">
                                <button
                                  onClick={() => handleSaveEvent(event.id)}
                                  disabled={Boolean(eventActionLoading[event.id])}
                                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {eventActionLoading[event.id] ? '저장 중...' : '변경사항 저장'}
                                </button>
                                <button
                                  onClick={() => handleDeleteEvent(event.id)}
                                  disabled={Boolean(eventActionLoading[event.id])}
                                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                           </div>
                         </div>
                       )
                     })}
                   </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'inquiries' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📨</span>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">고객 문의 관리</h2>
                      <p className="text-sm text-gray-500">고객이 남긴 문의에 메모를 남기고 상태를 업데이트하세요.</p>
                    </div>
                  </div>
                  <div className="md:ml-auto flex items-center gap-2">
                    <button
                      onClick={() => fetchInquiries()}
                      className="px-3 py-1 text-sm font-medium text-teal-700 bg-teal-100 hover:bg-teal-200 rounded-lg transition-colors"
                    >
                      새로고침
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {(['ALL', ...INQUIRY_STATUS_OPTIONS] as Array<'ALL' | InquiryStatus>).map((option) => (
                    <button
                      key={option}
                      onClick={() => setInquiryStatusFilter(option)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                        inquiryStatusFilter === option
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {option === 'ALL' ? '전체' : INQUIRY_STATUS_LABELS[option]}
                    </button>
                  ))}
                </div>

                {inquiriesError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl mb-4">
                    {inquiriesError}
                  </div>
                )}

                {inquiriesLoading ? (
                  <div className="flex justify-center items-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
                  </div>
                ) : inquiries.length === 0 ? (
                  <p className="text-center text-gray-500 py-12">조건에 맞는 문의가 없습니다.</p>
                ) : (
                  <div className="space-y-5">
                    {inquiries.map((inquiry) => (
                      <div key={inquiry.id} className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-start gap-3 justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-gray-900">{inquiry.name}</h3>
                              <a href={`mailto:${inquiry.email}`} className="text-sm text-teal-600 hover:underline">{inquiry.email}</a>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {inquiry.createdAt ? new Date(inquiry.createdAt).toLocaleString('ko-KR') : '시간 정보 없음'}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">주제: <span className="font-medium text-gray-800">{inquiry.topic}</span></p>
                          </div>
                          <span className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${
                            inquiry.status === 'NEW'
                              ? 'bg-red-100 text-red-700'
                              : inquiry.status === 'IN_PROGRESS'
                              ? 'bg-amber-100 text-amber-700'
                              : inquiry.status === 'RESOLVED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {INQUIRY_STATUS_LABELS[inquiry.status]}
                          </span>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{inquiry.message}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">처리 상태</label>
                            <select
                              value={inquiryStatusDrafts[inquiry.id] ?? inquiry.status}
                              onChange={(e) => handleInquiryStatusChange(inquiry.id, e.target.value as InquiryStatus)}
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              {INQUIRY_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{INQUIRY_STATUS_LABELS[status]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모</label>
                            <textarea
                              value={inquiryNotes[inquiry.id] ?? ''}
                              onChange={(e) => handleInquiryNoteChange(inquiry.id, e.target.value)}
                              rows={4}
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                              placeholder="고객 응대 기록이나 전달 사항을 입력하세요."
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                          <button
                            onClick={() => handleSaveInquiry(inquiry.id)}
                            disabled={Boolean(inquiryActionLoading[inquiry.id])}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {inquiryActionLoading[inquiry.id] ? '저장 중...' : '변경사항 저장'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
