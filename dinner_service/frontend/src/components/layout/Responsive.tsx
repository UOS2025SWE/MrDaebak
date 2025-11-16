'use client'

import type { PropsWithChildren, ReactNode } from 'react'
import Header from '../Header'
import Footer from '../Footer'

type PageContainerProps = PropsWithChildren<{
  currentPage: string
  headerExtra?: ReactNode
}>

export function PageContainer({ currentPage, headerExtra, children }: PageContainerProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col">
      <Header currentPage={currentPage} />
      {headerExtra}
      <main className="flex-1 w-full py-6 px-3 sm:py-8 sm:px-4">
        <div className="max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}

type SectionProps = PropsWithChildren<{
  className?: string
}>

export function Section({ className = '', children }: SectionProps) {
  return (
    <section className={`mb-6 sm:mb-8 ${className}`}>
      {children}
    </section>
  )
}

type GridListProps = PropsWithChildren<{
  className?: string
}>

// 기본 카드 리스트용 그리드: 모바일 2열, sm 3열, lg 4열
export function GridList({ className = '', children }: GridListProps) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
      {children}
    </div>
  )
}

export function MobileOnly({ children }: PropsWithChildren) {
  return <div className="block lg:hidden">{children}</div>
}

export function DesktopOnly({ children }: PropsWithChildren) {
  return <div className="hidden lg:block">{children}</div>
}


