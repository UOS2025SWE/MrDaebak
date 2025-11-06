/**
 * 공통 타입 정의
 * 여러 페이지에서 공유되는 타입들
 */

// 할인 정보 (checkout, menu, order 페이지에서 사용)
export interface DiscountInfo {
  eligible: boolean
  discount_rate: number
  customer_type: string
  total_orders: number
  customer_name: string
  next_tier_orders?: number
  discount_message: string
}

// 최근 주문 정보 (menu, profile 페이지에서 사용)
export interface RecentOrder {
  id: string
  order_number: string
  menu_name: string
  menu_code?: string  // 메뉴 코드 (커스터마이징 정보 표시용)
  style: string
  quantity: number
  total_price: number
  order_date: string
  status?: string  // profile에서 사용
  delivery_address?: string | null  // profile에서 사용
  customizations?: Record<string, number> | null  // 커스터마이징 정보
}
