/**
 * 관리 페이지 관련 타입 정의
 */

// 직원 정보
export interface Staff {
  id: string  // UUID
  name: string
  type: 'cook' | 'delivery'
  status: 'free' | 'busy'
  currentTask?: string
  updatedAt: string
}

// 재료 정보
export interface Ingredient {
  id: number
  name: string
  korean_name: string
  currentStock: number
  unit: string
  korean_unit: string
  minimumStock: number
  restockAmount: number
  category?: {
    key: string
    name: string
    description: string
    restock_frequency: string
  }
}

// 재료 카테고리
export interface IngredientCategory {
  name: string
  description: string
  restock_frequency: string
  items: Ingredient[]
}

// 사용자 정보
export interface User {
  id: number
  email: string
  role: string
  name: string
  is_admin?: boolean
}
