'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import UserDropdown from '@/components/UserDropdown'

interface HeaderProps {
  currentPage?: string
}

export default function Header({ currentPage }: HeaderProps) {
  const { isAuthenticated, user, isStaff, isManager } = useAuth()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <header className={`w-full bg-white/95 backdrop-blur-sm border-b border-amber-200 sticky top-0 z-50 shadow-sm transition-all duration-300 ${isScrolled ? 'py-2' : 'py-4'}`}>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div
            className={`
              flex items-center justify-between
              lg:grid lg:grid-cols-3
              transition-all duration-300
              ${isScrolled ? 'h-16' : 'h-24'}
            `}
          >
            <Link href="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition duration-300 min-w-0">
              <img
                src="/images/mister-daebak-logo.jpg"
                alt="미스터 대박 로고"
                className={`rounded-full object-cover transition-all duration-300 ${isScrolled ? 'w-10 h-10' : 'w-16 h-16'}`}
              />
              <h1
                className={`
                  font-bold text-stone-900 transition-all duration-300 break-keep leading-tight
                  ${isScrolled ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'}
                `}
              >
                미스터 대박
              </h1>
            </Link>

            <nav
              className={`
                hidden lg:flex items-center justify-center transition-all duration-300
                ${isScrolled ? 'gap-4' : 'gap-6'}
              `}
            >
              <NavLink href={isManager ? '/dashboard/admin' : isStaff ? '/dashboard/staff' : '/'} active={currentPage === 'main' || currentPage === 'dashboard'}>
                {isStaff || isManager ? '대시보드' : '메인'}
              </NavLink>
              {!isStaff && !isManager && <NavLink href="/menu" active={currentPage === 'menu'}>메뉴</NavLink>}
              {isAuthenticated && !isStaff && !isManager && <NavLink href="/orders" active={currentPage === 'orders'}>주문 내역</NavLink>}
              <NavLink href="/events" active={currentPage === 'events'}>이벤트</NavLink>
              <NavLink href="/about" active={currentPage === 'about'}>소개</NavLink>
              <NavLink href="/contact" active={currentPage === 'contact'}>문의</NavLink>
            </nav>

            <div className="flex items-center justify-self-end transition-all duration-300 lg:justify-end gap-2">
              <div className="hidden lg:flex items-center gap-4">
                {isAuthenticated ? (
                  <UserDropdown />
                ) : (
                  <>
                    <Link href="/login" className={`text-stone-700 font-medium transition duration-300 relative group ${isScrolled ? 'text-sm' : 'text-base'}`}>
                      로그인
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-amber-600 transition-all duration-300 group-hover:w-full"></span>
                    </Link>
                    <Link href="/register" className={`text-stone-700 font-medium transition duration-300 relative group ${isScrolled ? 'text-sm' : 'text-base'}`}>
                      회원가입
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-amber-600 transition-all duration-300 group-hover:w-full"></span>
                    </Link>
                  </>
                )}
              </div>

              <div className="flex lg:hidden items-center gap-2">
                {/* 고객만 빠른 주문 버튼 노출 (직원/매니저는 숨김) */}
                {!isStaff && !isManager && (
                  <>
                    <QuickAction label="메뉴" href="/menu" />
                    <QuickAction label="🎙️ 음성" href="/voice" outline />
                  </>
                )}
                <button
                  type="button"
                  aria-label="메뉴 열기"
                  onClick={() => setIsMobileMenuOpen(prev => !prev)}
                  className="w-10 h-10 flex items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm active:scale-95 transition-transform"
                >
                  <span className="sr-only">메뉴</span>
                  <div className="space-y-1.5">
                    <span className="block w-5 h-0.5 bg-stone-700 rounded"></span>
                    <span className="block w-5 h-0.5 bg-stone-700 rounded"></span>
                    <span className="block w-5 h-0.5 bg-stone-700 rounded"></span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-black/40 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute top-0 left-0 right-0 h-full w-full bg-white shadow-2xl flex flex-col z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <img src="/images/mister-daebak-logo.jpg" alt="미스터 대박 로고" className="w-8 h-8 rounded-full object-cover" />
                <span className="font-semibold text-stone-900 text-sm">미스터 대박</span>
              </div>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-32">
              {/* 모바일 사이드바의 빠른 주문 섹션도 고객에게만 노출 */}
              {!isStaff && !isManager && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">빠른 주문</p>
                  <div className="grid grid-cols-2 gap-2">
                    <QuickAction label="🍽️ 메뉴 보기" href="/menu" />
                    <QuickAction label="🎙️ 음성 주문" href="/voice" solid />
                  </div>
                </div>
              )}
              <nav className="space-y-1">
                <MobileNav
                  link={isManager ? '/dashboard/admin' : isStaff ? '/dashboard/staff' : '/'}
                  label={isStaff || isManager ? '대시보드' : '메인'}
                  active={currentPage === 'main' || currentPage === 'dashboard'}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                {!isStaff && !isManager && (
                  <>
                    <MobileNav link="/menu" label="메뉴" active={currentPage === 'menu'} onClick={() => setIsMobileMenuOpen(false)} />
                    {isAuthenticated && (
                      <MobileNav link="/orders" label="주문 내역" active={currentPage === 'orders'} onClick={() => setIsMobileMenuOpen(false)} />
                    )}
                  </>
                )}
                <MobileNav link="/events" label="이벤트" active={currentPage === 'events'} onClick={() => setIsMobileMenuOpen(false)} />
                <MobileNav link="/about" label="소개" active={currentPage === 'about'} onClick={() => setIsMobileMenuOpen(false)} />
                <MobileNav link="/contact" label="문의" active={currentPage === 'contact'} onClick={() => setIsMobileMenuOpen(false)} />
              </nav>
              <div className="border-t border-stone-100 px-4 py-3">
                {isAuthenticated ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <span className="font-semibold text-stone-900">{user?.name || user?.email || '로그인됨'}</span>
                      <span className="text-xs text-stone-500">{isStaff ? '직원 계정' : isManager ? '매니저 계정' : '고객 계정'}</span>
                    </div>
                    <UserDropdown />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-800 text-center">
                      로그인
                    </Link>
                    <Link href="/register" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium text-center">
                      회원가입
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NavLink({ href, children, active }: { href: string; children: ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap px-3 py-2 ${active ? 'text-amber-700 font-semibold' : ''}`}
    >
      {children}
      {active && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>}
    </Link>
  )
}

function QuickAction({ label, href, outline, solid }: { label: string; href: string; outline?: boolean; solid?: boolean }) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-transform active:scale-95'
  const cls = solid ? 'bg-amber-600 text-white' : outline ? 'bg-white text-amber-700 border border-amber-300' : 'bg-amber-600 text-white'
  return (
    <Link href={href} className={`${base} ${cls}`}>
      {label}
    </Link>
  )
}

function MobileNav({ link, label, active, onClick }: { link: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <Link
      href={link}
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${active ? 'bg-amber-100 text-amber-800 font-semibold' : 'text-stone-700 hover:bg-stone-50'}`}
    >
      <span>{label}</span>
    </Link>
  )
}
