'use client'

import React from 'react'
import { getOrderStatusColorClass, getOrderStatusIcon, getOrderStatusLabel, type OrderStatus } from '@/utils/orderStatus'

interface OrderStatusBadgeProps {
  status: OrderStatus
  className?: string
  showIcon?: boolean
  size?: 'sm' | 'md'
}

export default function OrderStatusBadge({
  status,
  className,
  showIcon = true,
  size = 'md',
}: OrderStatusBadgeProps) {
  const colorClass = getOrderStatusColorClass(status)
  const label = getOrderStatusLabel(status)
  const icon = getOrderStatusIcon(status)

  const baseClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs font-medium'
      : 'px-3 py-1 text-sm font-semibold'

  const combinedClass = ['inline-flex items-center rounded-full', baseClass, colorClass, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={combinedClass}>
      {showIcon && (
        <span className="mr-1">
          {icon}
        </span>
      )}
      {label}
    </span>
  )
}


