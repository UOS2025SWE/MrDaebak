'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/hooks/useWebSocket'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'
import type { Staff, Ingredient, IngredientCategory } from '@/types/manage'
import type { WebSocketMessage } from '@/hooks/useWebSocket'

type TabType = 'accounting' | 'staff' | 'inventory' | 'menu'

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
  const [selectedCakeFlavor, setSelectedCakeFlavor] = useState(CUSTOM_CAKE_FLAVORS[0].code)
  const [selectedCakeSize, setSelectedCakeSize] = useState(CUSTOM_CAKE_SIZES[0].code)
  const [customCakeRecipeEdits, setCustomCakeRecipeEdits] = useState<Record<string, number>>({})
  const [customCakeRecipeDraft, setCustomCakeRecipeDraft] = useState<{ ingredient_code: string; quantity: number }>({ ingredient_code: '', quantity: 0 })
  const [customCakeRecipeActionLoading, setCustomCakeRecipeActionLoading] = useState<Record<string, boolean>>({})
  const [sideDishDeleteLoading, setSideDishDeleteLoading] = useState<Record<string, boolean>>({})

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
      const response = await fetch('/api/side-dishes', {
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
  }, [token])

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
  const { status: wsStatus, isConnected } = useWebSocket({
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

  const handleRestockQuantityChange = () => {}

  const handleRestockSelectedItems = async () => {}

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
    refreshMenuData
  ])

  useEffect(() => {
    loadTabData()
  }, [loadTabData])

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
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-gray-900">{staff.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
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
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-gray-900">{staff.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {staff.currentTask && (
                          <p className="text-sm text-gray-600">{staff.currentTask}</p>
                        )}
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
