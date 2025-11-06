/**
 * 프로필 페이지 관련 타입 정의
 */

// 사용자 프로필 정보
export interface UserProfile {
  id: string  // UUID
  email: string
  name: string | null
  phone: string | null
  address: string | null
  total_orders: number  // customer_loyalty.order_count
  user_type: string
  is_admin: boolean
  privacy_consent: boolean
  created_at: string | null
  updated_at: string | null
}
