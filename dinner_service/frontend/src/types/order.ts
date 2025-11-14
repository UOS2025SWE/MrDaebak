/**
 * 주문 관련 타입 정의
 */

// 주문 아이템 정보
export interface OrderItem {
  menuId: string
  menuCode: string
  menuName: string
  styleCode: string
  styleName: string
  stylePrice: number
  basePrice: number  // 메뉴 기본 가격
  cookingTime: number
  description: string
  imageUrl: string
  ingredients: { [key: string]: number }
  quantity: number
}

// 결제 모달 Props
export interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  orderData: OrderItem
  finalPrice: number
}

export interface EventMenuDiscount {
  event_id: string
  title: string
  discount_label?: string | null
  discount_type: 'PERCENT' | 'FIXED'
  discount_value: number
  start_date?: string | null
  end_date?: string | null
  target_type?: 'MENU' | 'SIDE_DISH'
  menu_item_id?: string
  side_dish_id?: string
  menu_name?: string
  side_dish_name?: string
}
