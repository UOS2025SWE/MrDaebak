/**
 * 음성 주문 페이지 관련 타입 정의
 */

// 메뉴 옵션 정보
export interface MenuOption {
  code: string
  name: string
  style: string
  price: number
  cooking_time?: number
  reason?: string
  customization?: {
    extra_wine?: number
    extra_champagne?: number
    side_dishes?: string[]
    overrides?: Record<string, number>
    special_requests?: string
  }
}

// 채팅 메시지 정보
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  menuInfo?: MenuOption
  alternatives?: MenuOption[]  // 대안 메뉴 옵션들
  recommendedStyle?: number | null  // 추천 스타일 (1=Simple, 2=Grand, 3=Deluxe)
}
