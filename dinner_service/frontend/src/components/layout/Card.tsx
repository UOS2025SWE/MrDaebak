'use client'

import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padded?: boolean
  borderColorClass?: string
}

export function Card({
  children,
  className = '',
  padded = true,
  borderColorClass = 'border-gray-100',
}: CardProps) {
  const paddingClass = padded ? 'p-6 sm:p-8' : ''
  const baseClass =
    'bg-white rounded-2xl shadow-xl border ' + borderColorClass + ' ' + paddingClass

  return <div className={`${baseClass} ${className}`.trim()}>{children}</div>
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  className?: string
}

export function CardHeader({
  title,
  subtitle,
  icon,
  className = '',
}: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 sm:mb-6 ${className}`}>
      <div className="flex items-center gap-3">
        {icon && <span className="text-2xl">{icon}</span>}
        <h2 className="text-xl sm:text-2xl font-bold text-stone-900">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
    </div>
  )
}


