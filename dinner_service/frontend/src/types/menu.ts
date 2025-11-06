/**
 * 메뉴 관련 타입 정의
 */

// 메뉴 스타일 정보
export interface MenuStyle {
  id?: string
  code: string
  name: string
  price: number
  cooking_time: number
  description?: string
  base_ingredients?: { [key: string]: number }
}

// 메뉴 아이템 정보
export interface MenuItem {
  id: number
  code: string
  name: string
  base_price: number
  description: string
  styles: MenuStyle[]
  available: boolean
  image_url: string
}
