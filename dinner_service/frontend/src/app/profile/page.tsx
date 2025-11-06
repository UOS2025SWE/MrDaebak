'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import type { UserProfile } from '@/types/profile'
import type { RecentOrder } from '@/types/common'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [recentOrder, setRecentOrder] = useState<RecentOrder | null>(null)
  const [discountInfo, setDiscountInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)

  // 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (authLoading) return // Auth 로딩 중이면 기다림
    
    if (!isAuthenticated || !user?.id) {
      console.log('Not authenticated, redirecting to login...', { isAuthenticated, user })
      router.push('/login')
      return
    }
  }, [isAuthenticated, user, router, authLoading])

  // 프로필 및 최근 주문 데이터 로드 (하이브리드 방식)
  useEffect(() => {
    if (authLoading) return
    
    if (isAuthenticated && user?.id) {
      loadProfileData()
    }
  }, [isAuthenticated, user, authLoading])

  const loadProfileData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('인증 토큰이 없습니다.')
        setLoading(false)
        return
      }

      // 1. 상세 프로필 정보 조회 (전화번호, 주소, 총주문수 등)
      const profileResponse = await fetch(`/api/auth/profile/${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        if (profileData.success) {
          setProfile(profileData.profile)
        } else {
          console.error('프로필 정보 조회 실패:', profileData.error)
          // 실패해도 기본 정보(AuthContext user)는 사용 가능
        }
      } else if (profileResponse.status === 401) {
        localStorage.removeItem('auth_token')
        router.push('/login')
        return
      } else {
        console.error('프로필 조회 실패:', profileResponse.statusText)
      }

      // 2. 최근 주문 정보 조회 (orders 페이지와 같은 방식)
      const orderResponse = await fetch(`/api/orders/user/${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (orderResponse.ok) {
        const orderData = await orderResponse.json()
        if (orderData.success && orderData.orders && orderData.orders.length > 0) {
          // 가장 최근 주문만 사용
          const mostRecentOrder = orderData.orders[0]
          setRecentOrder({
            id: mostRecentOrder.id,
            order_number: mostRecentOrder.order_number,
            status: mostRecentOrder.status,
            menu_name: mostRecentOrder.menu_name,
            style: mostRecentOrder.style,
            quantity: mostRecentOrder.quantity,
            total_price: mostRecentOrder.total_price,
            delivery_address: mostRecentOrder.delivery_address,
            order_date: mostRecentOrder.order_date || mostRecentOrder.created_at
          })

        } else {
          setRecentOrder(null)
        }
      } else {
        console.error('최근 주문 조회 실패:', orderResponse.statusText)
        setRecentOrder(null)
      }

      // 3. 할인 정보 조회
      const discountResponse = await fetch(`/api/discount/${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (discountResponse.ok) {
        const discountData = await discountResponse.json()
        if (discountData.success && discountData.data) {
          setDiscountInfo(discountData.data)
        } else {
          setDiscountInfo(null)
        }
      } else {
        console.error('할인 정보 조회 실패:', discountResponse.statusText)
        setDiscountInfo(null)
      }

    } catch (error) {
      console.error('데이터 로드 실패:', error)
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '정보 없음'
    return new Date(dateString).toLocaleString('ko-KR')
  }

  const getStatusText = (status: string) => {
    const statusMap: {[key: string]: string} = {
      'RECEIVED': '주문 접수',
      'PREPARING': '조리 중',
      'DELIVERING': '배달 중',
      'COMPLETED': '배달 완료',
      'CANCELLED': '취소됨',
      'cancelled': '주문 취소'
    }
    return statusMap[status] || status
  }

  const getStyleKoreanName = (style: string) => {
    const styleMap: {[key: string]: string} = {
      'simple': '심플',
      'grand': '그랜드',
      'deluxe': '디럭스'
    }
    return styleMap[style] || style
  }

  const getStatusColor = (status: string) => {
    const colorMap: {[key: string]: string} = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'cooking': 'bg-blue-100 text-blue-800',
      'delivering': 'bg-purple-100 text-purple-800',
      'completed': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800'
    }
    return colorMap[status] || 'bg-gray-100 text-gray-800'
  }

  // 회원 등급 판별 함수
  const getUserGrade = (profile: UserProfile | null, user: any) => {
    // 관리자 우선 체크
    if (profile?.is_admin || user.is_admin || user.role === 'admin') {
      return '관리자'
    }

    // STAFF 계정인 경우 직책(position) 표시
    if (user?.user_type === 'STAFF' && user?.position) {
      if (user.position === 'COOK') {
        return '요리사'
      } else if (user.position === 'RIDER') {
        return '배달원'
      }
      return '직원'  // fallback
    }

    // total_orders를 기반으로 등급 구분 (DiscountService와 동일)
    const totalOrders = profile?.total_orders || 0
    if (totalOrders >= 10) {
      return 'VIP 회원'
    } else if (totalOrders >= 5) {  // 5회 이상이어야 단골 회원
      return '단골 회원'
    } else {
      return '일반 회원'
    }
  }

  // 등급별 색상 구분
  const getUserGradeColor = (grade: string) => {
    const colorMap: {[key: string]: string} = {
      '관리자': 'bg-red-100 text-red-700',
      '요리사': 'bg-orange-100 text-orange-700',
      '배달원': 'bg-indigo-100 text-indigo-700',
      'VIP 회원': 'bg-purple-100 text-purple-700',
      '단골 회원': 'bg-green-100 text-green-700',
      '일반 회원': 'bg-blue-100 text-blue-700'
    }
    return colorMap[grade] || 'bg-gray-100 text-gray-700'
  }

  // 계정 유형 한국어 변환
  const getAccountTypeInKorean = (role: string) => {
    const roleMap: {[key: string]: string} = {
      'admin': '관리자',
      'customer': '고객'
    }
    return roleMap[role] || role
  }

  // 통합 사용자 데이터 (profile 우선, user fallback)
  const getUserData = () => {
    return {
      id: profile?.id || user?.id,
      email: profile?.email || user?.email,
      name: profile?.name || user?.name,
      role: profile?.is_admin ? 'admin' : user?.role || 'customer',
      is_admin: profile?.is_admin || user?.is_admin || false
    }
  }

  // AuthContext 로딩 중이거나 최근 주문 로딩 중일 때
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">
          {authLoading ? "인증 정보 확인 중..." : "회원 정보를 불러오는 중..."}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50">
      {/* Header Navigation */}
      <Header currentPage="profile" />

      {/* Main Content */}
      <main className="w-full py-20">
        <div className="max-w-[1000px] mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-6">
              회원 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">정보</span>
            </h1>
            <p className="text-xl text-stone-600">
              내 계정 정보와 최근 주문 내역
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 회원 정보 카드 */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-amber-100">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">👤</span>
                <h2 className="text-2xl font-bold text-stone-900">
                  {profile?.name || user?.name || '사용자'}님의 회원정보
                </h2>
              </div>
              
              {user && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">이메일</span>
                    <span className="text-stone-900">{profile?.email || user.email}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">이름</span>
                    <span className="text-stone-900">{profile?.name || user.name || '정보 없음'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">전화번호</span>
                    <span className="text-stone-900">{profile?.phone || '정보 없음'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">주소</span>
                    <span className="text-stone-900 text-right max-w-xs">{profile?.address || '정보 없음'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">총 주문 수</span>
                    <span className="text-amber-600 font-semibold">
                      {profile?.total_orders !== undefined ? `${profile.total_orders}회` : '로딩 중...'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">회원 등급</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getUserGradeColor(getUserGrade(profile, user))}`}>
                      {getUserGrade(profile, user)}
                    </span>
                  </div>

                  {/* 할인 정보 섹션 */}
                  {discountInfo && (
                    <div className="py-3 border-b border-gray-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-stone-700">할인 혜택</span>
                        {discountInfo.eligible && (
                          <span className="px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                            {Math.floor(discountInfo.discount_rate * 100)}% 할인
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-stone-600 mt-2">
                        {discountInfo.discount_message}
                      </div>
                      {discountInfo.eligible && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                          <p className="text-xs text-amber-800 font-medium mb-1">💰 할인 예시</p>
                          <div className="text-xs text-amber-700 space-y-1">
                            <div className="flex justify-between">
                              <span>50,000원 메뉴</span>
                              <span className="font-bold">→ {(50000 * (1 - discountInfo.discount_rate)).toLocaleString()}원</span>
                            </div>
                            <div className="flex justify-between">
                              <span>100,000원 메뉴</span>
                              <span className="font-bold">→ {(100000 * (1 - discountInfo.discount_rate)).toLocaleString()}원</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">계정 유형</span>
                    <span className="text-stone-900">{getAccountTypeInKorean(user.role)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">가입일</span>
                    <span className="text-stone-600 text-sm">
                      {profile?.created_at ? formatDate(profile.created_at) : '로딩 중...'}
                    </span>
                  </div>

                </div>
              )}
            </div>

            {/* 최근 주문 정보 카드 (두 번째 그리드 아이템) */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-amber-100">
              <h2 className="text-2xl font-bold text-stone-900 mb-6 flex items-center gap-3">
                <span>🍽️</span>
                <span>최근 주문</span>
              </h2>

              {recentOrder ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">주문번호</span>
                    <span className="text-stone-900 font-mono">{recentOrder.order_number}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">메뉴</span>
                    <span className="text-stone-900">{recentOrder.menu_name} ({getStyleKoreanName(recentOrder.style)})</span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">상태</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(recentOrder.status)}`}>
                      {getStatusText(recentOrder.status)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">총 금액</span>
                    <span className="text-amber-600 font-semibold">{recentOrder.total_price.toLocaleString()}원</span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-medium text-stone-700">주문일</span>
                    <span className="text-stone-600 text-sm">{formatDate(recentOrder.order_date)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <span className="text-6xl mb-4 block">📋</span>
                  <p className="text-xl text-stone-600">아직 주문 내역이 없습니다</p>
                  <p className="text-sm text-stone-500 mt-2">첫 주문을 해보세요!</p>
                </div>
              )}
            </div>
          </div>
          
          {/* 액션 버튼들 */}
          <div className="mt-12 flex justify-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium px-6 py-3 rounded-lg hover:from-amber-700 hover:to-amber-800 transition-all duration-300 shadow-md hover:shadow-lg"
            >
              메인으로 돌아가기
            </button>
            
            {recentOrder && (
              <button
                onClick={() => router.push('/orders')}
                className="bg-gradient-to-r from-stone-600 to-stone-700 text-white font-medium px-6 py-3 rounded-lg hover:from-stone-700 hover:to-stone-800 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                전체 주문 내역 보기
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* 비밀번호 변경 모달 */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          // 비밀번호 변경 성공 시 프로필 정보 새로고침 (선택적)
          loadProfileData()
        }}
      />
    </div>
  )
}