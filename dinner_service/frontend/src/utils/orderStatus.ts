export type OrderStatus =
  | 'RECEIVED'
  | 'PREPARING'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PAYMENT_FAILED'
  | string

export const getOrderStatusLabel = (status: OrderStatus): string => {
  switch (status) {
    case 'RECEIVED':
      return '주문 접수'
    case 'PREPARING':
      return '조리 중'
    case 'DELIVERING':
      return '배달 중'
    case 'COMPLETED':
      return '배달 완료'
    case 'CANCELLED':
      return '취소됨'
    case 'PAYMENT_FAILED':
      return '결제 실패'
    default:
      return typeof status === 'string' && status.trim().length > 0 ? status : '알 수 없음'
  }
}

export const getOrderStatusColorClass = (status: OrderStatus): string => {
  switch (status) {
    case 'RECEIVED':
      return 'bg-blue-100 text-blue-800'
    case 'PREPARING':
      return 'bg-yellow-100 text-yellow-800'
    case 'DELIVERING':
      return 'bg-purple-100 text-purple-800'
    case 'COMPLETED':
      return 'bg-green-100 text-green-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    case 'PAYMENT_FAILED':
      return 'bg-orange-100 text-orange-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export const getOrderStatusIcon = (status: OrderStatus): string => {
  switch (status) {
    case 'RECEIVED':
      return '📋'
    case 'PREPARING':
      return '👨‍🍳'
    case 'DELIVERING':
      return '🚗'
    case 'COMPLETED':
      return '✅'
    case 'CANCELLED':
      return '❌'
    case 'PAYMENT_FAILED':
      return '💳'
    default:
      return '📦'
  }
}


