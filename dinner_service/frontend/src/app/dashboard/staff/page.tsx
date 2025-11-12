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
  heart_plate: '하트 모양 접시',
  cupid_decoration: '큐피드 장식',
  napkin: '냅킨',
  paper_napkin: '종이 냅킨',
  cotton_napkin: '면 냅킨',
  linen_napkin: '린넨 냅킨',
  plastic_tray: '플라스틱 쟁반',
  wooden_tray: '나무 쟁반',
  plastic_plate: '플라스틱 접시',
  plastic_cup: '플라스틱 컵',
  ceramic_plate: '도자기 접시',
  ceramic_cup: '도자기 컵',
  plastic_wine_glass: '플라스틱 와인잔',
  glass_wine_glass: '유리 와인잔',
  vase_with_flowers: '꽃병 장식',
  wine: '와인',
  premium_steak: '프리미엄 스테이크',
  coffee: '커피',
  fresh_salad: '신선한 샐러드',
  scrambled_eggs: '에그 스크램블',
  bacon: '베이컨',
  bread: '빵',
  champagne_bottle: '샴페인',
  baguette: '바게트빵',
  coffee_pot: '커피 포트',
  cake_base: '케이크 시트',
  buttercream_frosting: '버터크림',
  fresh_berries: '신선한 베리',
  fondant: '폰단트',
  edible_gold_leaf: '식용 금박',
  chocolate_ganache: '초콜릿 가나슈',
  cake_board: '케이크 보드',
  edible_flowers: '식용 꽃'
}

// 메뉴별 기본 재료 구성
const menuIngredients: Record<string, Record<string, Record<string, number>>> = {
  valentine: {
    simple: { heart_plate: 1, cupid_decoration: 1, paper_napkin: 1, plastic_tray: 1, plastic_wine_glass: 1, wine: 1, premium_steak: 1 },
    grand: { heart_plate: 1, cupid_decoration: 2, cotton_napkin: 1, wooden_tray: 1, plastic_wine_glass: 1, wine: 1, premium_steak: 1 },
    deluxe: { heart_plate: 1, cupid_decoration: 3, linen_napkin: 2, wooden_tray: 1, vase_with_flowers: 1, glass_wine_glass: 1, wine: 1, premium_steak: 1 }
  },
  french: {
    simple: { plastic_plate: 1, plastic_cup: 1, paper_napkin: 1, plastic_tray: 1, plastic_wine_glass: 1, coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    grand: { ceramic_plate: 1, ceramic_cup: 1, cotton_napkin: 1, wooden_tray: 1, plastic_wine_glass: 1, coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 },
    deluxe: { ceramic_plate: 1, ceramic_cup: 1, linen_napkin: 1, wooden_tray: 1, vase_with_flowers: 1, glass_wine_glass: 1, coffee: 1, wine: 1, fresh_salad: 1, premium_steak: 1 }
  },
  english: {
    simple: { plastic_plate: 1, plastic_cup: 1, paper_napkin: 1, plastic_tray: 1, scrambled_eggs: 1, bacon: 2, bread: 1, premium_steak: 1 },
    grand: { ceramic_plate: 1, ceramic_cup: 1, cotton_napkin: 1, wooden_tray: 1, scrambled_eggs: 2, bacon: 3, bread: 1, premium_steak: 1 },
    deluxe: { ceramic_plate: 1, ceramic_cup: 1, linen_napkin: 1, wooden_tray: 1, vase_with_flowers: 1, scrambled_eggs: 2, bacon: 4, bread: 2, premium_steak: 1 }
  },
  champagne: {
    grand: { ceramic_plate: 2, ceramic_cup: 2, cotton_napkin: 2, wooden_tray: 1, plastic_wine_glass: 2, champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 },
    deluxe: { ceramic_plate: 2, ceramic_cup: 2, linen_napkin: 2, wooden_tray: 1, vase_with_flowers: 1, glass_wine_glass: 2, champagne_bottle: 1, baguette: 4, coffee_pot: 1, wine: 1, premium_steak: 2 }
  },
  cake: {
    simple: { cake_base: 1, buttercream_frosting: 1, fresh_berries: 1, cake_board: 1, plastic_plate: 1, plastic_tray: 1, paper_napkin: 1 },
    grand: { cake_base: 1, buttercream_frosting: 1, fondant: 1, fresh_berries: 1, cake_board: 1, ceramic_plate: 1, ceramic_cup: 1, cotton_napkin: 1, wooden_tray: 1 },
    deluxe: { cake_base: 1, buttercream_frosting: 1, fondant: 1, edible_gold_leaf: 1, chocolate_ganache: 1, edible_flowers: 1, cake_board: 1, ceramic_plate: 1, ceramic_cup: 1, linen_napkin: 1, wooden_tray: 1, vase_with_flowers: 1 }
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
  unitPrice: number
}

type PendingIntakeItem = {
  intake_item_id: string
  ingredient_code: string
  expected_quantity: number
  actual_quantity: number
  unit_price: number
  remarks: string | null
}

type PendingIntakeBatch = {
  batch_id: string
  manager_id: string | null
  manager_name: string | null
  note: string | null
  created_at: string | null
  total_expected_cost: number
  total_actual_cost: number
  intake_items: PendingIntakeItem[]
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

const createDefaultIntakeState = (pricing: Record<string, number> = {}): IntakeItemState[] =>
  intakeTemplate.map(item => ({
    code: item.code,
    label: item.label,
    unit: item.unit,
    quantity: item.defaultQuantity,
    unitPrice: pricing[item.code] ?? 0
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
  side_dishes?: Array<{ code: string; name?: string; quantity: number; price_per_unit?: number; total_price?: number }>;
  cake_customization?: {
    message?: string;
    flavor?: string;
    size?: string;
    image_path?: string;
  } | null;
}

// 주문 카드 컴포넌트
function OrderCard({
  order,
  onStatusChange,
  userPosition,
  canPerformAction
}: {
  order: Order;
  onStatusChange: (orderId: string, newStatus: string) => Promise<void>;
  userPosition?: 'COOK' | 'DELIVERY' | 'STAFF';
  canPerformAction: boolean;
}) {
  const getStatusDisplay = (status: string) => {
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

  const getNextAction = (status: string, position?: 'COOK' | 'DELIVERY' | 'STAFF') => {
    switch (status) {
      case 'RECEIVED':
        // 조리 수락: COOK만 가능
        if (position === 'COOK') {
          return { label: '조리 수락', nextStatus: 'PREPARING', color: 'blue' };
        }
        return null;
      case 'PREPARING':
        if (position === 'COOK' || position === 'STAFF') {
          return { label: '조리 완료', nextStatus: 'DELIVERING', color: 'amber' };
        }
        if (position === 'DELIVERY') {
          return { label: '배달 시작', nextStatus: 'DELIVERING', color: 'green' };
        }
        return null;
      case 'DELIVERING':
        // 배달 완료: DELIVERY만 가능
        if (position === 'DELIVERY' || position === 'STAFF') {
          return { label: '배달 완료', nextStatus: 'COMPLETED', color: 'green' };
        }
        return null;
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay(order.status);
  const nextAction = getNextAction(order.status, userPosition);

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

      {order.side_dishes && order.side_dishes.length > 0 && (
        <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <h4 className="text-sm font-bold text-purple-800 mb-2 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            추가 사이드 디시
          </h4>
          <div className="space-y-1">
            {order.side_dishes.map(dish => (
              <div key={dish.code} className="flex justify-between text-xs">
                <span className="text-gray-700">{dish.name || dish.code}</span>
                <span className="font-medium text-purple-700">
                  {dish.quantity}개
                  {dish.total_price && (
                    <span className="text-xs ml-1 text-gray-600">(+{dish.total_price.toLocaleString()}원)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {order.cake_customization && (
        (order.cake_customization.message || order.cake_customization.flavor || order.cake_customization.size || order.cake_customization.image_path) && (
          <div className="mb-4 p-3 bg-pink-50 rounded-lg border border-pink-200">
            <h4 className="text-sm font-bold text-pink-700 mb-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422A12.083 12.083 0 0112 21.083 12.083 12.083 0 015.84 10.578L12 14z" />
              </svg>
              케이크 커스터마이징
            </h4>
            <div className="space-y-1 text-xs text-gray-700">
              {order.cake_customization.message && (
                <div><span className="font-medium text-gray-800">메시지: </span>{order.cake_customization.message}</div>
              )}
              {order.cake_customization.flavor && (
                <div><span className="font-medium text-gray-800">맛: </span>{order.cake_customization.flavor}</div>
              )}
              {order.cake_customization.size && (
                <div><span className="font-medium text-gray-800">사이즈: </span>{order.cake_customization.size}</div>
              )}
              {order.cake_customization.image_path && (
                <a
                  href={order.cake_customization.image_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-600 underline"
                >
                  참고 이미지 보기
                </a>
              )}
            </div>
          </div>
        )
      )}

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
          onClick={async () => {
            try {
              await onStatusChange(order.id, nextAction.nextStatus);
            } catch (err) {
              console.error('액션 처리 오류:', err);
              // 에러는 이미 handleStatusChange에서 처리됨
            }
          }}
          disabled={!canPerformAction}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors bg-gradient-to-r from-${nextAction.color}-600 to-${nextAction.color}-700 hover:from-${nextAction.color}-700 hover:to-${nextAction.color}-800 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {nextAction.label}
        </button>
      )}
      {nextAction && !canPerformAction && (
        <p className="mt-2 text-xs text-gray-500 text-center">출근 상태에서만 처리할 수 있습니다.</p>
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

  const [pendingIntakes, setPendingIntakes] = useState<PendingIntakeBatch[]>([]);
  const [pendingIntakeLoading, setPendingIntakeLoading] = useState(false);
  const [pendingIntakeError, setPendingIntakeError] = useState<string | null>(null);
  const [pendingIntakeEdits, setPendingIntakeEdits] = useState<Record<string, number>>({});
  const [pendingIntakeNotes, setPendingIntakeNotes] = useState<Record<string, string>>({});
  const [pendingIntakeSubmitting, setPendingIntakeSubmitting] = useState<Record<string, boolean>>({});
  const [pendingIntakeResult, setPendingIntakeResult] = useState<string | null>(null);

  // 출퇴근 상태
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [lastCheckOut, setLastCheckOut] = useState<string | null>(null);
  
  // 월급 정보
  const [salary, setSalary] = useState<number | null>(null);
  const [nextPayday, setNextPayday] = useState<string | null>(null);

  useEffect(() => {
    if (user?.user_type === 'MANAGER') {
      router.replace('/dashboard/admin');
    }
  }, [router, user?.user_type]);

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

  const fetchPendingIntakes = useCallback(async () => {
    if (!token || user?.position !== 'COOK') {
      setPendingIntakes([]);
      return;
    }

    setPendingIntakeLoading(true);
    try {
      const response = await fetch('/api/ingredients/intake/pending', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('입고 요청을 불러오지 못했습니다.');
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.batches)) {
        const parsed: PendingIntakeBatch[] = data.batches.map((batch: any) => {
          const items = Array.isArray(batch.intake_items) ? batch.intake_items : [];
          return {
            batch_id: batch.batch_id,
            manager_id: batch.manager_id ?? null,
            manager_name: batch.manager_name ?? null,
            note: batch.note ?? null,
            created_at: batch.created_at ?? null,
            total_expected_cost: Number(batch.total_expected_cost || 0),
            total_actual_cost: Number(batch.total_actual_cost || 0),
            intake_items: items.map((item: any) => ({
              intake_item_id: item.intake_item_id,
              ingredient_code: item.ingredient_code,
              expected_quantity: Number(item.expected_quantity || 0),
              actual_quantity: Number(item.actual_quantity ?? item.expected_quantity ?? 0),
              unit_price: Number(item.unit_price || 0),
              remarks: item.remarks ?? null
            }))
          };
        });
        setPendingIntakes(parsed);
        setPendingIntakeError(null);

        const validKeys = new Set(
          parsed.flatMap(batch =>
            batch.intake_items.map(item => `${batch.batch_id}::${item.intake_item_id}`)
          )
        );
        setPendingIntakeEdits(prev => {
          const next: Record<string, number> = {};
          validKeys.forEach((key) => {
            if (prev[key] !== undefined) {
              next[key] = prev[key];
            }
          });
          return next;
        });
        const validBatches = new Set(parsed.map(batch => batch.batch_id));
        setPendingIntakeNotes(prev => {
          const next: Record<string, string> = {};
          validBatches.forEach((batchId) => {
            if (prev[batchId] !== undefined) {
              next[batchId] = prev[batchId];
            }
          });
          return next;
        });
        setPendingIntakeSubmitting(prev => {
          const next: Record<string, boolean> = {};
          Object.entries(prev).forEach(([batchId, submitting]) => {
            if (validBatches.has(batchId)) {
              next[batchId] = submitting;
            }
          });
          return next;
        });
      } else {
        setPendingIntakes([]);
        setPendingIntakeError(null);
      }
    } catch (error) {
      console.error('입고 요청 조회 실패:', error);
      setPendingIntakeError(error instanceof Error ? error.message : '입고 요청을 불러올 수 없습니다.');
      setPendingIntakes([]);
    } finally {
      setPendingIntakeLoading(false);
    }
  }, [token, user?.position]);

  const handlePendingIntakeQuantityChange = useCallback((batchId: string, intakeItemId: string, value: number) => {
    const key = `${batchId}::${intakeItemId}`;
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    setPendingIntakeEdits(prev => ({
      ...prev,
      [key]: safeValue
    }));
  }, []);

  const handlePendingNoteChange = useCallback((batchId: string, note: string) => {
    setPendingIntakeNotes(prev => ({
      ...prev,
      [batchId]: note
    }));
  }, []);

  const handleConfirmPendingIntake = useCallback(async (batchId: string) => {
    if (!token || user?.position !== 'COOK') {
      alert('입고를 확정할 권한이 없습니다.');
      return;
    }

    const batch = pendingIntakes.find(item => item.batch_id === batchId);
    if (!batch) {
      alert('입고 요청 정보를 찾을 수 없습니다.');
      return;
    }

    const adjustments = batch.intake_items
      .map((item) => {
        const key = `${batchId}::${item.intake_item_id}`;
        const edited = pendingIntakeEdits[key];
        if (edited === undefined || edited === item.actual_quantity) {
          return null;
        }
        return {
          intake_item_id: item.intake_item_id,
          actual_quantity: edited
        };
      })
      .filter((item): item is { intake_item_id: string; actual_quantity: number } => item !== null);

    const cookNote = (pendingIntakeNotes[batchId] ?? '').trim();

    setPendingIntakeSubmitting(prev => ({ ...prev, [batchId]: true }));
    try {
      const response = await fetch(`/api/ingredients/intake/${batchId}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: adjustments,
          cook_note: cookNote.length > 0 ? cookNote : undefined
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || '입고 요청 확정에 실패했습니다.');
      }

      setPendingIntakeResult('입고 요청을 확정했습니다.');
      setPendingIntakeEdits(prev => {
        const next = { ...prev };
        batch.intake_items.forEach(item => {
          const key = `${batchId}::${item.intake_item_id}`;
          delete next[key];
        });
        return next;
      });
      setPendingIntakeNotes(prev => {
        const next = { ...prev };
        delete next[batchId];
        return next;
      });

      await fetchPendingIntakes();
    } catch (error) {
      console.error('입고 요청 확정 실패:', error);
      alert(error instanceof Error ? error.message : '입고 요청 확정 중 오류가 발생했습니다.');
    } finally {
      setPendingIntakeSubmitting(prev => ({ ...prev, [batchId]: false }));
    }
  }, [token, user?.position, pendingIntakes, pendingIntakeEdits, pendingIntakeNotes, fetchPendingIntakes]);

  useEffect(() => {
    if (!pendingIntakeResult) return;
    const timer = setTimeout(() => setPendingIntakeResult(null), 4000);
    return () => clearTimeout(timer);
  }, [pendingIntakeResult]);

  useEffect(() => {
    fetchPendingIntakes();
  }, [fetchPendingIntakes]);

  // 출퇴근 상태 조회
  const fetchDutyStatus = useCallback(async () => {
    if (!token || !user?.id) return;
    
    try {
      const response = await fetch('/api/staff/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const myStaff = data.data.find((s: any) => s.id === user.id || s.staff_id === user.id);
          if (myStaff) {
            setIsOnDuty(myStaff.is_on_duty || false);
            setLastCheckIn(myStaff.last_check_in || null);
            setLastCheckOut(myStaff.last_check_out || null);
            setSalary(myStaff.salary || null);
            setNextPayday(myStaff.next_payday || null);
          }
        }
      }
    } catch (err) {
      console.error('출퇴근 상태 조회 오류:', err);
    }
  }, [token, user?.id]);

  useEffect(() => {
    fetchDutyStatus();
  }, [fetchDutyStatus]);

  // 출근 처리
  const handleCheckIn = async () => {
    if (!token || !user?.id) return;
    
    try {
      const response = await fetch(`/api/staff/${user.id}/check-in`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setIsOnDuty(true);
        setLastCheckIn(data.last_check_in);
        await fetchDutyStatus();
        alert('출근 처리되었습니다');
      } else {
        alert(data.error || '출근 처리에 실패했습니다');
      }
    } catch (err) {
      console.error('출근 처리 오류:', err);
      alert('출근 처리 중 오류가 발생했습니다');
    }
  };

  // 퇴근 처리
  const handleCheckOut = async () => {
    if (!token || !user?.id) return;
    
    try {
      const response = await fetch(`/api/staff/${user.id}/check-out`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setIsOnDuty(false);
        setLastCheckOut(data.last_check_out);
        await fetchDutyStatus();
        alert('퇴근 처리되었습니다');
      } else {
        alert(data.error || '퇴근 처리에 실패했습니다');
      }
    } catch (err) {
      console.error('퇴근 처리 오류:', err);
      alert('퇴근 처리 중 오류가 발생했습니다');
    }
  };

  // 주문 상태 변경 (API 호출)
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!isOnDuty) {
      alert('출근 상태에서만 주문 상태를 변경할 수 있습니다.');
      return;
    }

    if (!token) {
      alert('인증 토큰을 확인할 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_status: newStatus })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || '상태 변경에 실패했습니다');
      }

      // 성공 시 주문 목록 새로고침
      await fetchOrders();
    } catch (err) {
      console.error('상태 변경 오류:', err);
      const errorMessage = err instanceof Error ? err.message : '주문 상태 변경에 실패했습니다';
      alert(errorMessage);
      throw err; // 상위로 에러 전파
    }
  };

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

  // 조리 관련 주문: RECEIVED + PREPARING
  const cookingOrders = orders.filter(o =>
    o.status === 'RECEIVED' || o.status === 'PREPARING'
  );

  // 배달 관련 주문: DELIVERING
  const deliveringOrders = orders.filter(o =>
    o.status === 'DELIVERING'
  );

  // 완료된 주문
  const completedOrders = orders.filter(o =>
    o.status === 'COMPLETED'
  );

  if (user?.user_type === 'MANAGER') {
    return null;
  }

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
                     user?.position === 'DELIVERY' ? '배달원' :
                     user?.position ? '직원' : '포지션 미정'}
                  </p>
                  <p className="text-sm font-semibold text-gray-800">{user?.name || user?.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isOnDuty 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {isOnDuty ? '🟢 출근 중' : '⚪ 퇴근'}
                    </span>
                  </div>
                  {user?.user_type === 'STAFF' && user?.position && salary && (
                    <div className="mt-2 text-xs text-gray-600">
                      <p>💰 월급: {salary.toLocaleString()}원</p>
                      <p>📅 월급 지급일: 매월 25일</p>
                      {nextPayday && (
                        <p className="text-amber-600">다음 지급일: {new Date(nextPayday).toLocaleDateString('ko-KR')}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isOnDuty ? (
                    <button
                      onClick={handleCheckIn}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                    >
                      출근
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckOut}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                    >
                      퇴근
                    </button>
                  )}
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Intake Section - COOK 또는 매니저만 표시 */}
          {user?.position === 'COOK' && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-yellow-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">입고 요청 확인</h2>
                    <p className="text-sm text-gray-600">
                      매니저가 등록한 입고 요청을 검수하고 실제 입고 수량을 확정하세요.
                    </p>
                  </div>
                  {pendingIntakeResult && (
                    <div className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                      {pendingIntakeResult}
                    </div>
                  )}
                </div>

                {pendingIntakeLoading ? (
                  <div className="py-10 text-center text-sm text-gray-500">
                    입고 요청을 불러오는 중입니다...
                  </div>
                ) : pendingIntakeError ? (
                  <div className="py-6 px-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
                    {pendingIntakeError}
                  </div>
                ) : pendingIntakes.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">
                    현재 검수할 입고 요청이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingIntakes.map((batch) => {
                      const submitting = pendingIntakeSubmitting[batch.batch_id] ?? false;
                      const noteValue = pendingIntakeNotes[batch.batch_id] ?? '';
                      return (
                        <div key={batch.batch_id} className="border border-yellow-300 rounded-xl bg-yellow-50/60 p-4">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-3">
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                요청자: {batch.manager_name || '알 수 없는 관리자'}
                              </h3>
                              <p className="text-xs text-gray-500 mt-1">
                                요청일시:{' '}
                                {batch.created_at ? new Date(batch.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                              </p>
                              {batch.note && (
                                <p className="text-xs text-gray-600 mt-1">매니저 비고: {batch.note}</p>
                              )}
                              <p className="text-xs text-gray-600 mt-2">
                                총 예상 비용{' '}
                                <span className="font-semibold text-yellow-800">
                                  {batch.total_expected_cost.toLocaleString()}원
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-col items-start md:items-end gap-2">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                                검수 필요
                              </span>
                              {submitting && (
                                <span className="text-xs text-gray-500">확정 처리 중...</span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {batch.intake_items.map((item) => {
                              const key = `${batch.batch_id}::${item.intake_item_id}`;
                              const editedQuantity = pendingIntakeEdits[key] ?? item.actual_quantity;
                              const displayName = ingredientNames[item.ingredient_code] || item.ingredient_code;
                              return (
                                <div
                                  key={item.intake_item_id}
                                  className="bg-white border border-yellow-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                                >
                                  <div>
                                    <p className="font-semibold text-gray-800">{displayName}</p>
                                    <p className="text-xs text-gray-500">코드: {item.ingredient_code}</p>
                                    <p className="text-xs text-gray-500">
                                      요청 수량 {item.expected_quantity.toLocaleString()} · 단가 {item.unit_price.toLocaleString()}원
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-500">확정 수량</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editedQuantity}
                                      onChange={(e) =>
                                        handlePendingIntakeQuantityChange(
                                          batch.batch_id,
                                          item.intake_item_id,
                                          Number(e.target.value)
                                        )
                                      }
                                      className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                      disabled={submitting}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-4">
                            <label className="block text-xs font-medium text-gray-600 mb-1">요리사 비고 (선택)</label>
                            <textarea
                              value={noteValue}
                              onChange={(e) => handlePendingNoteChange(batch.batch_id, e.target.value)}
                              rows={2}
                              placeholder="입고 검수 메모를 남겨주세요."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                              disabled={submitting}
                            />
                          </div>

                          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => handleConfirmPendingIntake(batch.batch_id)}
                              disabled={submitting || !isOnDuty}
                              className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {submitting ? '확정 중...' : !isOnDuty ? '출근이 필요합니다' : '입고 확정'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 재료 및 사이드 디시 관리는 관리자 대시보드에서 수행 */}

          {/* 근태 및 급여 요약 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-md p-5 border border-amber-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">현재 근무 상태</h3>
                  <p className="text-xs text-gray-500">실시간으로 출퇴근 상태를 확인하세요</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  isOnDuty ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {isOnDuty ? '근무중' : '퇴근'}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-2">
                {user?.position === 'COOK' ? '요리사' :
                 user?.position === 'DELIVERY' ? '배달원' :
                 user?.position || '직원'}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>조리 대기: {cookingOrders.length}건</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                <span>배달 진행: {deliveringOrders.length}건</span>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">나의 출근 일지</h3>
                  <p className="text-xs text-gray-500">최근 출근/퇴근 기록을 확인하세요</p>
                </div>
                <button
                  onClick={fetchDutyStatus}
                  className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                >
                  새로고침
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">최근 출근</span>
                  <span className="font-semibold text-gray-900">
                    {lastCheckIn ? new Date(lastCheckIn).toLocaleString('ko-KR') : '기록 없음'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">최근 퇴근</span>
                  <span className="font-semibold text-gray-900">
                    {lastCheckOut ? new Date(lastCheckOut).toLocaleString('ko-KR') : '기록 없음'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-5 border border-green-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">급여 정보</h3>
                  <p className="text-xs text-gray-500">월급과 지급 일정을 확인하세요</p>
                </div>
                <span className="text-xl">💰</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">월급</span>
                  <span className="font-semibold text-gray-900">
                    {salary ? `${salary.toLocaleString()}원` : '미정'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">다음 지급일</span>
                  <span className="font-semibold text-gray-900">
                    {nextPayday ? new Date(nextPayday).toLocaleDateString('ko-KR') : '일정 없음'}
                  </span>
                </div>
              </div>
            </div>
          </div>

        {!isOnDuty && (
          <div className="mb-6 p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-600">
            현재 퇴근 상태입니다. 출근 버튼을 눌러 근무를 시작하면 주문 처리와 재료 입고 작업을 진행할 수 있습니다.
          </div>
        )}

          {/* Main Content - 역할별 컬럼 표시 */}
          {user?.position === 'COOK' ? (
            /* COOK: 조리 컬럼만 표시 */
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
                        onStatusChange={handleStatusChange}
                        userPosition={user?.position}
                        canPerformAction={isOnDuty}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : user?.position === 'DELIVERY' ? (
            /* DELIVERY: 배달 컬럼만 표시 */
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
                        onStatusChange={handleStatusChange}
                        userPosition={user?.position}
                        canPerformAction={isOnDuty}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 포지션 미정 또는 기타: 두 컬럼 모두 표시 */
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
                          onStatusChange={handleStatusChange}
                          userPosition={user?.position}
                          canPerformAction={isOnDuty}
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
                          onStatusChange={handleStatusChange}
                          userPosition={user?.position}
                          canPerformAction={isOnDuty}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
