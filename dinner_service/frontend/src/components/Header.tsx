'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import UserDropdown from '@/components/UserDropdown'

interface HeaderProps {
  currentPage?: string  // 현재 페이지를 표시하기 위한 prop
}

export default function Header({ currentPage }: HeaderProps) {
  const { isAuthenticated, user, isStaff, isManager } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      setIsScrolled(scrollTop > 50)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`w-full bg-white/95 backdrop-blur-sm border-b border-amber-200 sticky top-0 z-50 shadow-sm transition-all duration-300 ${isScrolled ? 'py-2' : 'py-4'}`}>
      <div className="max-w-[1200px] mx-auto px-6">
        <div className={`grid grid-cols-3 items-center transition-all duration-300 ${isScrolled ? 'h-16' : 'h-24'}`}>
          {/* Left: Logo Section */}
          <Link href="/" className="flex items-center gap-3 justify-self-start hover:opacity-80 transition-all duration-300">
            <img 
              src="/images/mister-daebak-logo.jpg" 
              alt="미스터 대박 로고"
              className={`rounded-full object-cover transition-all duration-300 ${isScrolled ? 'w-10 h-10' : 'w-16 h-16'}`}
            />
            <h1 className={`font-bold text-stone-900 transition-all duration-300 ${isScrolled ? 'text-xl' : 'text-3xl'}`}>미스터 대박</h1>
          </Link>
          
          {/* Center: Navigation Menu */}
          <nav className={`flex items-center justify-center transition-all duration-300 ${isScrolled ? 'gap-6' : 'gap-8'}`}>
            <Link
              href={
                isManager ? '/dashboard/admin' :
                isStaff ? '/dashboard/staff' :
                '/'
              }
              className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
            >
              {isStaff || isManager ? '대시보드' : '메인'}
              {(currentPage === 'main' || currentPage === 'dashboard') && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>
              )}
            </Link>
            {!isStaff && !isManager && (
              <Link 
                href="/menu" 
                className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
              >
                메뉴
                {currentPage === 'menu' && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>
                )}
              </Link>
            )}
            {(isAuthenticated && !isStaff && !isManager) && (
              <Link 
                href="/orders" 
                className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
              >
                주문 내역
                {currentPage === 'orders' && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>
                )}
              </Link>
            )}
            <Link
              href="#events"
              className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
            >
              이벤트
            </Link>
            <Link
              href="/about"
              className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
            >
              소개
              {currentPage === 'about' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>
              )}
            </Link>
            <Link
              href="/contact"
              className={`text-stone-700 font-medium rounded-md hover:bg-amber-50 hover:text-amber-700 transition-all duration-300 relative whitespace-nowrap ${isScrolled ? 'text-sm px-3 py-2' : 'text-base px-5 py-3'}`}
            >
              문의
              {currentPage === 'contact' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-600 rounded-full"></span>
              )}
            </Link>
          </nav>
          
          {/* Right: User Section */}
          <div className={`flex items-center justify-self-end transition-all duration-300 ${isScrolled ? 'gap-1' : 'gap-2'}`}>
            {/* User Authentication Section */}
            {isAuthenticated ? (
              <UserDropdown />
            ) : (
              <div className={`flex items-center ${isScrolled ? 'gap-4' : 'gap-6'}`}>
                <Link
                  href="/login"
                  className={`text-stone-700 font-medium transition-all duration-300 relative group ${isScrolled ? 'text-sm' : 'text-base'}`}
                >
                  로그인
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-amber-600 transition-all duration-300 group-hover:w-full"></span>
                </Link>
                <Link
                  href="/register"
                  className={`text-stone-700 font-medium transition-all duration-300 relative group ${isScrolled ? 'text-sm' : 'text-base'}`}
                >
                  회원가입
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-amber-600 transition-all duration-300 group-hover:w-full"></span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}