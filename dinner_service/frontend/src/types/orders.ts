/**
 * 주문 목록 관련 타입 정의
 */

// 주문 정보
export interface Order {
  id: string  // UUID 문자열
  order_number: string
  // 백엔드 응답에는 메뉴 코드가 포함될 수 있으므로 선택 필드로 허용
  menu_code?: string
  menu_name: string
  style: string
  quantity: number
  total_price: number
  status: string
  order_date: string
  estimated_time_minutes: number
  // 옵션 커스터마이징 정보 (재주문 시 사용)
  customizations?: { [key: string]: number } | null
  side_dishes?: Array<{ code: string; name?: string; quantity: number; total_price?: number }>;
  cake_customization?: {
    message?: string
    flavor?: string
    size?: string
    image_path?: string
    status?: string
  } | null;
}
