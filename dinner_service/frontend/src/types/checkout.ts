/**
 * FR-012/FR-013: 배송지 입력 및 결제 시스템 타입 정의
 */

export interface DeliveryInfo {
  address: string
  recipient_name?: string
  recipient_phone?: string
  delivery_notes?: string
  scheduled_date?: string
  scheduled_time_slot?: string
}

export interface PaymentInfo {
  card_number: string
  cardholder_name: string
  expiry_date: string  // MM/YY
  cvc: string
}

export interface CheckoutRequest {
  // 주문 정보
  menu_code: string
  style: string
  quantity: number

  // 배송 정보
  delivery: DeliveryInfo

  // 결제 정보
  payment: PaymentInfo

  // 사용자 정보
  user_id?: string
  save_as_default_address?: boolean

  // 커스터마이징 정보
  customizations?: { [key: string]: number } | null
}

export interface CheckoutResponse {
  success: boolean
  order_id: string
  order_number: string
  payment_id: string
  transaction_id: string
  total_price: number
  delivery_address: string
  masked_card_number: string
  payment_status: string
  message: string
}

export interface DeliveryInfoResponse {
  has_default: boolean
  delivery_info: {
    recipient_name: string | null
    recipient_phone: string | null
    address: string | null
  } | null
}
