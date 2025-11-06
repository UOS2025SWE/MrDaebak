/**
 * 주문 목록 관련 타입 정의
 */

// 주문 정보
export interface Order {
  id: string  // UUID 문자열
  order_number: string
  menu_name: string
  style: string
  quantity: number
  total_price: number
  status: string
  order_date: string
  estimated_time_minutes: number
}
