'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

type EventItem = {
  id: string
  title: string
  description: string
  imageUrl: string
  discountLabel?: string
  startDate?: string
  endDate?: string
  tags?: string[]
  menuDiscounts?: EventMenuDiscount[]
}

type EventMenuDiscount = {
  menuItemId: string
  menuName?: string
  sideDishName?: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  menuCode?: string
  sideDishCode?: string
  targetType: 'MENU' | 'SIDE_DISH'
}

const fallbackEvents: EventItem[] = [
  {
    id: 'christmas-2024',
    title: '미스터 대박 크리스마스 갈라',
    description:
      '12월 한정 프리미엄 크리스마스 코스로 연말 분위기를 완성하세요. 커스텀 케이크와 샴페인 디너 세트를 특별가로 제공합니다.',
    imageUrl: '/images/christmas_event.jpg',
    discountLabel: '최대 25% Holiday 할인',
    startDate: '2024-12-01',
    endDate: '2024-12-31',
    tags: ['시즌한정', '프리미엄 디너', '커스텀 케이크'],
    menuDiscounts: []
  }
]

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>(fallbackEvents)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/events')
        if (!response.ok) {
          throw new Error(`이벤트 정보를 불러오지 못했습니다. (status: ${response.status})`)
        }
        const data = await response.json()
        if (isMounted && Array.isArray(data?.events)) {
          const normalized: EventItem[] = data.events
            .map((event: any, index: number) => ({
              id: event.event_id ?? event.id ?? `event-${index}-${Math.random().toString(36).slice(2)}`,
              title: event.title ?? '제목 미지정',
              description: event.description ?? '',
              imageUrl: event.image_path ?? '/images/christmas_event.jpg',
              discountLabel: event.discount_label ?? undefined,
              startDate: event.start_date ?? undefined,
              endDate: event.end_date ?? undefined,
              tags: Array.isArray(event.tags) ? event.tags : [],
              menuDiscounts: Array.isArray(event.menu_discounts)
                ? event.menu_discounts
                    .map((discount: any) => {
                      const targetType: 'MENU' | 'SIDE_DISH' =
                        (discount.target_type ?? discount.targetType ?? 'MENU') === 'SIDE_DISH' ? 'SIDE_DISH' : 'MENU'
                      const menuId = String(discount.menu_item_id ?? discount.menuItemId ?? discount.target_id ?? discount.targetId ?? '')
                      const sideId = String(discount.side_dish_id ?? discount.sideDishId ?? '')
                      const resolvedId = targetType === 'SIDE_DISH' ? (sideId || menuId) : menuId
                      return {
                        menuItemId: resolvedId,
                        menuName: discount.menu_name ?? discount.menuName ?? discount.side_dish_name ?? discount.sideDishName ?? '',
                        sideDishName: discount.side_dish_name ?? discount.sideDishName ?? undefined,
                        discountType: (discount.discount_type ?? discount.discountType ?? 'PERCENT') as 'PERCENT' | 'FIXED',
                        discountValue: Number(discount.discount_value ?? discount.discountValue ?? 0),
                        menuCode: discount.menu_code ?? discount.menuCode ?? undefined,
                        sideDishCode: discount.side_dish_code ?? discount.sideDishCode ?? undefined,
                        targetType
                      } as EventMenuDiscount
                    })
                    .filter((discount: EventMenuDiscount) => Boolean(discount.menuItemId))
                : [],
            }))
            .filter((event: EventItem) => Boolean(event.id))
          setEvents(normalized)
        }
      } catch (err) {
        console.warn('이벤트 데이터를 불러오는 중 문제가 발생했습니다. fallback 데이터를 사용합니다.', err)
        if (isMounted) {
          setEvents(fallbackEvents)
          setError('최신 이벤트 정보를 불러오지 못해 기본 정보를 표시합니다.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchEvents()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-amber-50">
      <Header currentPage="events" />

      <main className="max-w-[1200px] mx-auto px-6 py-16">
        <section className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">진행 중인 이벤트</h1>
          <p className="text-lg text-stone-600 max-w-3xl mx-auto leading-relaxed">
            미스터 대박이 준비한 다양한 프로모션과 시즌 한정 이벤트를 확인하세요. 특별한 날, 더 특별한 혜택을 제공합니다.
          </p>
        </section>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <span className="text-stone-500">이벤트 정보를 불러오는 중입니다...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white border border-amber-100 rounded-3xl shadow-lg p-12 text-center">
            <p className="text-stone-600">현재 진행 중인 이벤트가 없습니다. 곧 새로운 소식을 전해드릴게요!</p>
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            {events.map((event) => (
              <article key={event.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-amber-100">
                <div className="h-64 w-full overflow-hidden bg-stone-100">
                  <img
                    src={event.imageUrl}
                    alt={event.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-8 space-y-4">
                  <div className="flex flex-wrap gap-3 items-center">
                    <h2 className="text-2xl font-semibold text-stone-900 flex-1">{event.title}</h2>
                    {event.discountLabel && (
                      <span className="inline-flex items-center px-3 py-1 text-sm font-semibold text-amber-800 bg-amber-100 rounded-full">
                        {event.discountLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-stone-600 leading-relaxed">{event.description}</p>
                  <div className="flex flex-wrap gap-3 text-sm text-stone-500">
                    {event.startDate && (
                      <span>시작: {new Date(event.startDate).toLocaleDateString('ko-KR')}</span>
                    )}
                    {event.endDate && (
                      <span>종료: {new Date(event.endDate).toLocaleDateString('ko-KR')}</span>
                    )}
                  </div>
                  {event.tags && event.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {event.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 text-xs font-medium bg-amber-50 border border-amber-100 text-amber-700 rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {event.menuDiscounts && event.menuDiscounts.length > 0 && (
                    <div className="mt-4 bg-amber-50/60 border border-amber-200 rounded-2xl p-4 text-left">
                      <h3 className="text-sm font-semibold text-amber-800 mb-2">이벤트 적용 할인 메뉴</h3>
                      <ul className="space-y-1 text-sm text-amber-700">
                        {event.menuDiscounts.map((discount) => (
                          <li key={`${event.id}-${discount.menuItemId}`} className="flex items-center justify-between gap-3">
                            <span className="font-medium text-amber-800">
                              {discount.targetType === 'SIDE_DISH'
                                ? `사이드 · ${discount.sideDishName ?? discount.menuName ?? '사이드 메뉴'}`
                                : discount.menuName || '메뉴'}
                            </span>
                            <span>
                              {discount.discountType === 'PERCENT'
                                ? `${discount.discountValue}% 할인`
                                : `${discount.discountValue.toLocaleString()}원 할인`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-10 p-4 bg-amber-50 border border-amber-200 text-sm text-amber-700 rounded-2xl">
            {error}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
