'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useWebSocket } from '@/hooks/useWebSocket';

// 재료 한글 이름 매핑
const ingredientNames: { [key: string]: string } = {
  // Valentine 디너 구성품
  heart_plate: '하트 모양 접시',
  cupid_decoration: '큐피드 장식',
  napkin: '냅킨',
  wine: '와인',
  premium_steak: '프리미엄 스테이크',
  // French 디너 구성품
  coffee: '커피',
  fresh_salad: '신선한 샐러드',
  // English 디너 구성품
  scrambled_eggs: '에그 스크램블',
  bacon: '베이컨',
  bread: '빵',
  // Champagne 디너 구성품
  champagne_bottle: '샴페인',
  baguette: '바게트빵',
  coffee_pot: '커피 포트'
}

// 메뉴별 기본 재료 구성
const menuIngredients: { [key: string]: { [key: string]: { [key: string]: number } } } = {
  valentine: {
    simple: { heart_plate: 1, cupid_decoration: 1, napkin: 1, wine: 1, premium_steak: 1 },
    grand: { heart_plate: 1, cupid_decoration: 2, napkin: 1, wine: 1, premium_steak: 1 },
    deluxe: { heart_plate: 1, cupid_decoration: 3, napkin: 2, wine: 1, premium_steak: 1 }
  },
  french: {
    simple: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    grand: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    deluxe: { coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 }
  },
  english: {
    simple: { scrambled_eggs: 1, bacon: 2, bread: 1, premium_steak: 1 },
    grand: { scrambled_eggs: 2, bacon: 3, bread: 1, premium_steak: 1 },
    deluxe: { scrambled_eggs: 2, bacon: 4, bread: 2, premium_steak: 1 }
  },
  champagne: {
    grand: { champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 },
    deluxe: { champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 }
  }
}

type IntakeItemTemplate = {
  code: string
  label: string
  unit: string
  defaultQuantity: number
}

type IntakeItemState = {
  code: string
  label: string
  unit: string
  quantity: number
}

const intakeTemplate: IntakeItemTemplate[] = [
  { code: 'premium_steak', label: '고기 (프리미엄 스테이크)', unit: '개', defaultQuantity: 20 },
  { code: 'vegetables', label: '채소 믹스', unit: '팩', defaultQuantity: 25 },
  { code: 'wine', label: '와인', unit: '병', defaultQuantity: 8 },
  { code: 'champagne_bottle', label: '샴페인', unit: '병', defaultQuantity: 4 },
  { code: 'coffee', label: '커피 포트', unit: '포트', defaultQuantity: 6 },
  { code: 'baguette', label: '바게트빵', unit: '개', defaultQuantity: 18 },
  { code: 'scrambled_eggs', label: '계란 (스크램블용)', unit: '개', defaultQuantity: 30 }
]

const createDefaultIntakeState = (): IntakeItemState[] =>
  intakeTemplate.map(item => ({
    code: item.code,
    label: item.label,
    unit: item.unit,
    quantity: item.defaultQuantity
  }))

interface Order {
  id: string;
  order_number: string;
  status: 'RECEIVED' | 'PREPARING' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
  payment_status: string;
  menu_name: string;
  menu_code: string;
  style: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  delivery_address: string;
  order_date: string;
  estimated_delivery_time: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customizations?: { [key: string]: number } | null;
}

// 주문 카드 컴포넌트
function OrderCard({
  order,
  isCookingCompleted,
  onStatusChange,
  onCookingComplete,
  userPosition
}: {
  order: Order;
  isCookingCompleted: boolean;
  onStatusChange: (orderId: string, newStatus: string) => void;
  onCookingComplete: (orderId: string) => void;
  userPosition?: 'COOK' | 'RIDER' | 'STAFF';
}) {
  const getStatusDisplay = (status: string, cookingCompleted: boolean) => {
    switch (status) {
      case 'RECEIVED':
        return { text: '접수 완료', color: 'blue' };
      case 'PREPARING':
        return { text: '조리 중', color: 'amber' };
      case 'DELIVERING':
        return { text: '배달 중', color: 'green' };
      case 'COMPLETED':
        return { text: '완료', color: 'gray' };
      default:
        return { text: status, color: 'gray' };
    }
  };

  const getNextAction = (status: string, cookingCompleted: boolean, position?: 'COOK' | 'RIDER' | 'STAFF') => {
    switch (status) {
      case 'RECEIVED':
        // 조리 시작: COOK만 가능
        if (position === 'COOK' || position === 'STAFF') {
          return { label: '조리 시작', nextStatus: 'PREPARING', color: 'blue', isLocal: false };
        }
        return null;
      case 'PREPARING':
        if (cookingCompleted) {
          // 조리 완료 후 배달 시작: RIDER만 가능
          if (position === 'RIDER' || position === 'STAFF') {
            return { label: '배달 시작', nextStatus: 'DELIVERING', color: 'green', isLocal: false };
          }
          return null;
        } else {
          // 조리 완료: COOK만 가능
          if (position === 'COOK' || position === 'STAFF') {
            return { label: '조리 완료', nextStatus: '', color: 'amber', isLocal: true };
          }
          return null;
        }
      case 'DELIVERING':
        // 배달 완료: RIDER만 가능
        if (position === 'RIDER' || position === 'STAFF') {
          return { label: '배달 완료', nextStatus: 'COMPLETED', color: 'green', isLocal: false };
        }
        return null;
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay(order.status, isCookingCompleted);
  const nextAction = getNextAction(order.status, isCookingCompleted, userPosition);

  const styleNames: Record<string, string> = {
    'simple': '심플',
    'grand': '그랜드',
    'deluxe': '디럭스'
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 hover:shadow-lg transition-shadow">
      {/* 주문 번호 및 상태 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-500">주문번호</p>
          <p className="text-sm font-bold text-gray-800">{order.order_number}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold bg-${statusDisplay.color}-100 text-${statusDisplay.color}-700`}>
          {statusDisplay.text}
        </div>
      </div>

      {/* 메뉴 정보 */}
      <div className="mb-4">
        <p className="text-lg font-bold text-gray-900 mb-1">{order.menu_name}</p>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="px-2 py-1 bg-gray-100 rounded">{styleNames[order.style] || order.style}</span>
          <span>{order.quantity}인분</span>
          <span className="font-semibold text-gray-800">{order.total_price.toLocaleString()}원</span>
        </div>
      </div>

      {/* 커스터마이징 정보 */}
      {order.customizations && Object.keys(order.customizations).length > 0 && (() => {
        const baseIngredients = menuIngredients[order.menu_code]?.[order.style] || {}
        const changedItems = Object.entries(order.customizations).filter(([ingredient, qty]) => {
          const baseQty = baseIngredients[ingredient] || 0
          return baseQty !== Number(qty)
        })

        if (changedItems.length === 0) return null

        return (
          <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <h4 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              재료 커스터마이징
            </h4>
            <div className="space-y-1">
              {changedItems.map(([ingredient, qty]) => {
                const baseQty = baseIngredients[ingredient] || 0
                const qtyNum = Number(qty)
                const diff = qtyNum - baseQty

                return (
                  <div key={ingredient} className="flex justify-between text-xs">
                    <span className="text-gray-700">{ingredientNames[ingredient] || ingredient}</span>
                    <span className="font-medium text-amber-700">
                      {baseQty}개 → {qtyNum}개
                      <span className="text-xs ml-1 text-gray-600">
                        ({diff > 0 ? `+${diff}` : diff})
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 고객 정보 */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm font-semibold text-gray-700">{order.customer_name}</p>
          {order.customer_phone && (
            <span className="text-xs text-gray-500">{order.customer_phone}</span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-gray-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-xs text-gray-600 flex-1">{order.delivery_address || '주소 없음'}</p>
        </div>
      </div>

      {/* 시간 정보 */}
      <div className="mb-4 text-xs text-gray-500">
        <p>주문시간: {order.order_date}</p>
        {order.estimated_delivery_time && (
          <p>예상배달: {order.estimated_delivery_time}</p>
        )}
      </div>

      {/* 액션 버튼 */}
      {nextAction && (
        <button
          onClick={() => {
            if (nextAction.isLocal) {
              // 로컬 state만 변경 (조리 완료 → 배달 탭으로 이동)
              onCookingComplete(order.id);
            } else {
              // API 호출하여 DB 상태 변경
              onStatusChange(order.id, nextAction.nextStatus);
            }
          }}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors bg-gradient-to-r from-${nextAction.color}-600 to-${nextAction.color}-700 hover:from-${nextAction.color}-700 hover:to-${nextAction.color}-800 shadow-md hover:shadow-lg`}
        >
          {nextAction.label}
        </button>
      )}
      {order.status === 'COMPLETED' && (
        <div className="w-full py-3 px-4 rounded-lg font-semibold text-center text-gray-500 bg-gray-100">
          완료됨
        </div>
      )}
    </div>
  );
}

function StaffDashboardContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [intakeItems, setIntakeItems] = useState<IntakeItemState[]>(createDefaultIntakeState);
  const [intakeNote, setIntakeNote] = useState('');
  const [isSubmittingIntake, setIsSubmittingIntake] = useState(false);
  const [intakeResult, setIntakeResult] = useState<string | null>(null);

  // 조리 완료된 주문 추적 (로컬 state - 배달 탭으로 이동하기 위한 플래그)
  const [cookingCompletedOrders, setCookingCompletedOrders] = useState<Set<string>>(new Set());

  // 주문 목록 가져오기 (useCallback으로 메모이제이션)
  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch('/api/orders/staff/all', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('주문 목록을 가져오는데 실패했습니다');
      }

      const data = await response.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('주문 조회 오류:', err);
      setError('주문 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleIntakeQuantityChange = (code: string, value: number) => {
    const safeValue = Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value));
    setIntakeItems(prev => prev.map(item => item.code === code ? { ...item, quantity: safeValue } : item));
  };

  const handleResetIntake = () => {
    setIntakeItems(createDefaultIntakeState());
    setIntakeNote('');
    setIntakeResult(null);
  };

  const handleSubmitIntake = useCallback(async () => {
    if (!token) {
      alert('인증 토큰을 확인할 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    const payloadItems = intakeItems
      .filter(item => item.quantity > 0)
      .map(item => ({ ingredient_code: item.code, quantity: item.quantity }));

    if (payloadItems.length === 0) {
      alert('입고할 수량을 1개 이상 입력해주세요.');
      return;
    }

    setIsSubmittingIntake(true);

    try {
      const response = await fetch('/api/ingredients/intake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          intake_items: payloadItems,
          intake_note: intakeNote || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '입고 처리 실패');
      }

      setIntakeResult(`재료 ${data.processed.length}건 입고 완료`);
      setIntakeItems(createDefaultIntakeState());
      setIntakeNote('');
    } catch (err) {
      console.error('재료 입고 오류:', err);
      alert('재료 입고 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmittingIntake(false);
    }
  }, [intakeItems, intakeNote, token]);

  useEffect(() => {
    if (!intakeResult) return;
    const timer = setTimeout(() => setIntakeResult(null), 4000);
    return () => clearTimeout(timer);
  }, [intakeResult]);

  // 주문 상태 변경 (API 호출)
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_status: newStatus })
      });

      if (!response.ok) {
        throw new Error('상태 변경에 실패했습니다');
      }

      // 성공 시 주문 목록 새로고침
      await fetchOrders();
    } catch (err) {
      console.error('상태 변경 오류:', err);
      alert('주문 상태 변경에 실패했습니다');
    }
  };

  // 조리 완료 처리 (로컬 state만 변경 - 배달 탭으로 이동)
  const handleCookingComplete = useCallback((orderId: string) => {
    setCookingCompletedOrders(prev => {
      const newSet = new Set(prev);
      newSet.add(orderId);
      return newSet;
    });
  }, []);

  // WebSocket 연결 및 실시간 업데이트
  const { status: wsStatus, lastMessage } = useWebSocket({
    token,
    showToasts: true, // Toast 알림 자동 표시
    reconnect: true,
    onMessage: (message) => {
      // 주문 관련 메시지 수신 시 목록 새로고침
      if (message.type === 'ORDER_CREATED' || message.type === 'ORDER_STATUS_CHANGED' || message.type === 'ORDER_UPDATED') {
        fetchOrders();
      }
    },
  });

  // 컴포넌트 마운트 시 주문 목록 가져오기
  useEffect(() => {
    if (token) {
      fetchOrders();
    }
  }, [token, fetchOrders]);

  // 조리 관련 주문: RECEIVED + (PREPARING이면서 조리완료 안누른것)
  const cookingOrders = orders.filter(o =>
    o.status === 'RECEIVED' || (o.status === 'PREPARING' && !cookingCompletedOrders.has(o.id))
  );

  // 배달 관련 주문: (PREPARING이면서 조리완료 누른것) + DELIVERING
  const deliveringOrders = orders.filter(o =>
    (o.status === 'PREPARING' && cookingCompletedOrders.has(o.id)) || o.status === 'DELIVERING'
  );

  // 완료된 주문
  const completedOrders = orders.filter(o =>
    o.status === 'COMPLETED'
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">주문 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-stone-100">
      <Header currentPage="dashboard" />

      <main className="w-full py-8">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Welcome Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1">
                  직원 대시보드
                </h1>
                <p className="text-gray-600">실시간 주문 현황을 관리하세요</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {user?.position === 'COOK' ? '요리사' :
                     user?.position === 'RIDER' ? '배달원' :
                     '직원'}
                  </p>
                  <p className="text-sm font-semibold text-gray-800">{user?.name || user?.email}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Intake Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-green-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">재료 입고 기록</h2>
                <p className="text-sm text-gray-600">
                  고기, 채소, 음료, 바게트빵, 계란 입고를 즉시 반영하세요.
                </p>
              </div>
              {intakeResult && (
                <div className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                  {intakeResult}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {intakeItems.map(item => (
                <div key={item.code} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {item.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => handleIntakeQuantityChange(item.code, Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-500 whitespace-nowrap">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">비고</label>
              <textarea
                value={intakeNote}
                onChange={(e) => setIntakeNote(e.target.value)}
                rows={2}
                placeholder="예: 새벽 도매 시장 입고분"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
              <button
                type="button"
                onClick={handleResetIntake}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                기본값으로
              </button>
              <button
                type="button"
                onClick={handleSubmitIntake}
                disabled={isSubmittingIntake}
                className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmittingIntake ? '저장 중...' : '입고 저장'}
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">전체 주문</h3>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-amber-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">조리 대기/중</h3>
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{cookingOrders.length}</p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-green-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">배달 중</h3>
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{deliveringOrders.length}</p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">완료</h3>
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{completedOrders.length}</p>
            </div>
          </div>

          {/* Main Content - 조리/배달 두 컬럼 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 조리 컬럼 */}
            <div>
              <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-t-xl p-4 shadow-md">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h2 className="text-xl font-bold">조리 ({cookingOrders.length})</h2>
                </div>
              </div>
              <div className="bg-white rounded-b-xl shadow-lg p-4 min-h-[500px] max-h-[800px] overflow-y-auto">
                {cookingOrders.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-gray-500">조리할 주문이 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cookingOrders.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isCookingCompleted={cookingCompletedOrders.has(order.id)}
                        onStatusChange={handleStatusChange}
                        onCookingComplete={handleCookingComplete}
                        userPosition={user?.position}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 배달 컬럼 */}
            <div>
              <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl p-4 shadow-md">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                  </svg>
                  <h2 className="text-xl font-bold">배달 ({deliveringOrders.length})</h2>
                </div>
              </div>
              <div className="bg-white rounded-b-xl shadow-lg p-4 min-h-[500px] max-h-[800px] overflow-y-auto">
                {deliveringOrders.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                    <p className="text-gray-500">배달할 주문이 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deliveringOrders.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isCookingCompleted={cookingCompletedOrders.has(order.id)}
                        onStatusChange={handleStatusChange}
                        onCookingComplete={handleCookingComplete}
                        userPosition={user?.position}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function StaffDashboardPage() {
  return (
    <ProtectedRoute allowedTypes={['STAFF', 'MANAGER']}>
      <StaffDashboardContent />
    </ProtectedRoute>
  );
}
