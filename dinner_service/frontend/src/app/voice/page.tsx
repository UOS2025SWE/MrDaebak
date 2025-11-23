'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { ChatMessage } from '@/types/voice'

const ingredientDisplayNames: Record<string, string> = {
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

const tablewareCodes = new Set([
  'heart_plate',
  'cupid_decoration',
  'paper_napkin',
  'napkin',
  'cotton_napkin',
  'linen_napkin',
  'plastic_tray',
  'wooden_tray',
  'plastic_plate',
  'plastic_cup',
  'ceramic_plate',
  'ceramic_cup',
  'plastic_wine_glass',
  'glass_wine_glass',
  'cake_board',
  'vase_with_flowers'
])

const MENU_INGREDIENTS: Record<string, Record<string, Record<string, number>>> = {
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
  }
}


export default function VoicePage() {
  const router = useRouter()
  const { user, isAuthenticated, loading } = useAuth()
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const [showCustomizationModal, setShowCustomizationModal] = useState(false)
  const [selectedMenuInfo, setSelectedMenuInfo] = useState<any>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [customizationData, setCustomizationData] = useState({
    quantity: 1,
    deliveryDate: '',
    customizations: {} as Record<string, number>
  })

  // 주문 상태 관리
  type OrderState = 
    | 'PROMOTION_GREETING'      // 프로모션과 고객인사
    | 'MENU_CONVERSATION'        // 메뉴 대화 중
    | 'MENU_RECOMMENDATION'      // 메뉴 추천
    | 'STYLE_RECOMMENDATION'     // 스타일 추천
    | 'QUANTITY_SELECTION'       // 수량 추천
    | 'INGREDIENT_CUSTOMIZATION' // 재료 커스터마이징
    | 'SCHEDULING'               // 배송 일정 선택
    | 'CHECKOUT_READY'           // 결제 페이지 이전

  const [orderState, setOrderState] = useState<OrderState>('PROMOTION_GREETING')
  const [selectedMenuCode, setSelectedMenuCode] = useState<string | null>(null)
  const [selectedStyleCode, setSelectedStyleCode] = useState<string | null>(null)
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1)
  const [quantityConfirmed, setQuantityConfirmed] = useState<boolean>(false)
  const [awaitingSchedule, setAwaitingSchedule] = useState(false)
  const [menuConfirmed, setMenuConfirmed] = useState(false)
  const [styleConfirmed, setStyleConfirmed] = useState(false)
  const [ingredientOverrides, setIngredientOverrides] = useState<Record<string, number>>({})
  const SCHEDULE_TIME_SLOTS = ['17:00', '18:00', '19:00']
  const DEFAULT_TIME_SLOT = '18:00'
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState(DEFAULT_TIME_SLOT)

  const formatDisplayDate = (dateStr: string) => {
    const [, month, day] = dateStr.split('-').map(Number)
    return `${month}월 ${day}일`
  }

  const scheduleCheckoutKeywords = [
    '체크아웃',
    'checkout',
    '결제',
    '주문 진행',
    '주문해',
    '주문 완료',
    '주문 끝',
    '주문 마무리',
    '마무리하자',
    '마무리해',
    '마무리',
    '끝내자',
    '끝내',
    '다음 단계',
    '넘어가',
    '완료',
    '진행해줘',
    '확정',
    '확인'
  ]

  const shouldProceedToCheckout = (input: string) => {
    const lowered = input.toLowerCase()
    return scheduleCheckoutKeywords.some(keyword => lowered.includes(keyword))
  }

  const resolveTimeSlot = (hour: number) => {
    let normalizedHour = hour
    if (normalizedHour < 0) return null
    if (normalizedHour === 24) normalizedHour = 0
    if (normalizedHour < 0 || normalizedHour > 23) return null
    const candidates = SCHEDULE_TIME_SLOTS.map(slot => Number(slot.split(':')[0]))
    const matched = SCHEDULE_TIME_SLOTS.find(slot => Number(slot.split(':')[0]) === normalizedHour)
    if (matched) return matched
    const closest = candidates.reduce((prev, curr) =>
      Math.abs(curr - normalizedHour) < Math.abs(prev - normalizedHour) ? curr : prev
    )
    return `${closest.toString().padStart(2, '0')}:00`
  }

  type ScheduleParseResult =
    | { type: 'date'; value: string; timeSlot?: string }
    | { type: 'unspecified' }
    | { type: 'time'; timeSlot: string }

  const parseScheduleInput = (input: string): ScheduleParseResult | null => {
    const trimmed = input.trim()
    if (!trimmed) return null
    if (/(미정|아직|정하지|모르)/.test(trimmed)) {
      return { type: 'unspecified' }
    }

    const extractTime = (text: string) => {
      const normalized = text.toLowerCase()

      // 1) 명시적인 시간 표현 우선 처리: "오후 7시", "19시", "7시 정도", "18:00" 등
      const explicitTimeRegex = /(오전|오후|am|pm)?\s*(\d{1,2})\s*(시|:|시\s*정도|o'clock)/g
      let bestHour: number | null = null
      let bestMeridiem: string | null = null

      for (const match of normalized.matchAll(explicitTimeRegex)) {
        const meridiem = match[1] || null
        const hourStr = match[2]
        const hour = Number(hourStr)
        if (Number.isNaN(hour)) continue

        // 같은 문장에 "17시간이나 오후 7시"처럼 여러 시간이 있으면
        // "오전/오후"가 붙은 시간을 우선 선택하고, 없으면 마지막 것을 사용
        if (meridiem) {
          bestHour = hour
          bestMeridiem = meridiem
          continue
        }

        bestHour = hour
      }

      if (bestHour !== null) {
        let hour = bestHour
        const meridiem = bestMeridiem

        if (meridiem && (meridiem.includes('오후') || meridiem.includes('pm'))) {
          if (hour < 12) hour += 12
        }
        if (meridiem && (meridiem.includes('오전') || meridiem.includes('am'))) {
          if (hour === 12) hour = 0
        }
        return resolveTimeSlot(hour)
      }

      // 2) "저녁 7시", "밤 9시", "늦게 8시쯤" 등 맥락 기반 표현 처리
      const contextualMatch = normalized.match(/(\d{1,2})\s*(시|:)/)
      if (contextualMatch) {
        let hour = Number(contextualMatch[1])
        if (Number.isNaN(hour)) return null
        if (hour <= 12 && (normalized.includes('저녁') || normalized.includes('밤') || normalized.includes('늦게'))) {
          if (hour < 12) hour += 12
        }
        return resolveTimeSlot(hour)
      }

      // 3) 위 케이스에 해당하지 않으면 (예: "17시간", "두 시간 후")는 시간으로 해석하지 않음
      return null
    }

    const isoMatch = trimmed.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      const year = Number(y)
      const month = Number(m)
      const day = Number(d)
      if (year && month && day) {
        return {
          type: 'date',
          value: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
          timeSlot: extractTime(trimmed) || undefined
        }
      }
    }

    const monthDay = trimmed.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    if (monthDay) {
      const [, mStr, dStr] = monthDay
      const month = Number(mStr)
      const day = Number(dStr)
      const year = new Date().getFullYear()
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return {
          type: 'date',
          value: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
          timeSlot: extractTime(trimmed) || undefined
        }
      }
    }

    const relativeDays: Record<string, number> = {
      '오늘': 0,
      '내일': 1,
      '모레': 2,
    }
    for (const key of Object.keys(relativeDays)) {
      if (trimmed.includes(key)) {
        const target = new Date()
        target.setDate(target.getDate() + relativeDays[key])
        return {
          type: 'date',
          value: target.toISOString().split('T')[0],
          timeSlot: extractTime(trimmed) || undefined
        }
      }
    }

    const timeSlotOnly = extractTime(trimmed)
    if (timeSlotOnly) {
      return { type: 'time', timeSlot: timeSlotOnly }
    }

    return null
  }

  const promptScheduleSelection = () => {
    if (awaitingSchedule) return
    setAwaitingSchedule(true)
    setOrderState('SCHEDULING')
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: '배송 날짜와 시간을 선택해주세요. “12월 24일 6시”처럼 말씀하시거나 아래 입력창을 사용하실 수 있습니다.',
        timestamp: new Date().toISOString()
      }
    ])
  }

  const acknowledgeScheduleUpdate = (dateValue: string | null, timeSlot?: string | null) => {
    const datePart = dateValue ? `배송 날짜를 ${formatDisplayDate(dateValue)}` : '배송 날짜를 미정으로'
    const timePart = timeSlot ? `, 시간은 ${timeSlot}로` : ''
    const message = `${datePart}${timePart} 기록했습니다. '체크아웃으로 넘어가'라고 말씀하시거나 아래 버튼으로 다음 단계로 이동할 수 있어요.`
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: message,
        timestamp: new Date().toISOString()
      }
    ])
  }

  const finalizeScheduleAndCheckout = async (dateValue: string | null, timeSlot?: string | null) => {
    setAwaitingSchedule(false)
    if (dateValue) {
      setDeliveryDate(dateValue)
    } else {
      setDeliveryDate('')
    }
    if (timeSlot) {
      setDeliveryTimeSlot(timeSlot)
    }

    if (!selectedMenuCode || !selectedStyleCode) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '주문 정보를 불러올 수 없습니다. 다시 메뉴와 스타일을 선택해주세요.',
          timestamp: new Date().toISOString()
        }
      ])
      return
    }

    try {
      await openCheckoutModalFromState(
        selectedMenuCode,
        selectedStyleCode,
        selectedQuantity || 1,
        ingredientOverrides,
        timeSlot ?? deliveryTimeSlot
      )
    } catch (error) {
      console.error('체크아웃 이동 중 오류:', error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '체크아웃으로 이동하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
          timestamp: new Date().toISOString()
        }
      ])
    }
  }

  const baseIngredientMap = useMemo(() => {
    if (!selectedMenuCode || !selectedStyleCode) return {}
    return MENU_INGREDIENTS[selectedMenuCode]?.[selectedStyleCode] || {}
  }, [selectedMenuCode, selectedStyleCode])

  useEffect(() => {
    if (!selectedMenuCode || !selectedStyleCode) return
    if (Object.keys(baseIngredientMap).length > 0) {
      // baseIngredientMap에 있는 재료만으로 ingredientOverrides 초기화/업데이트
      const sanitized: Record<string, number> = {}
      Object.entries(baseIngredientMap).forEach(([key, value]) => {
        // 기존 ingredientOverrides에 값이 있으면 유지, 없으면 baseIngredientMap의 기본값 사용
        const existingValue = ingredientOverrides[key]
        sanitized[key] = typeof existingValue === 'number' 
          ? existingValue 
          : (typeof value === 'number' ? value : 0)
      })
      // baseIngredientMap에 없는 재료는 제거되도록 설정
      setIngredientOverrides(sanitized)
    } else {
      // baseIngredientMap이 비어있으면 ingredientOverrides도 비우기
      setIngredientOverrides({})
    }
  }, [selectedMenuCode, selectedStyleCode, baseIngredientMap])

  const ingredientGroups = useMemo(() => {
    // baseIngredientMap에 있는 재료만 필터링 (메뉴/스타일에 맞는 재료만 표시)
    const validIngredients = Object.keys(baseIngredientMap)
    const entries = Object.entries(ingredientOverrides)
      .filter(([code]) => validIngredients.includes(code)) // baseIngredientMap에 있는 재료만
      .filter(([, qty]) => typeof qty === 'number') // 숫자 값만 필터링
      .map(([code, qty]) => [code, typeof qty === 'number' ? qty : 0] as [string, number]) // 숫자로 변환
    return {
      food: entries.filter(([code]) => !tablewareCodes.has(code)),
      tableware: entries.filter(([code]) => tablewareCodes.has(code))
    }
  }, [ingredientOverrides, baseIngredientMap])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // 채팅 세션 초기화
  const initChatSession = useCallback(async () => {
    try {
      const response = await fetch('/api/voice/chat/init', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        setSessionId(data.session_id)
        setOrderState('PROMOTION_GREETING')
        
        // 백엔드에서 받은 환영 메시지를 직접 표시 (기본 문구)
        setMessages([{
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString()
        }])
      }
    } catch (error) {
      console.error('채팅 세션 초기화 실패:', error)
    }
  }, [])
  
  // 로그인 체크 - 로그인하지 않은 경우 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (loading) return // 로딩 중이면 대기
    
    if (!isAuthenticated) {
      router.push('/login?redirect=/voice')
      return
    }
  }, [isAuthenticated, loading, router])
  
  // 컴포넌트 마운트 시 채팅 세션 시작 (로그인한 경우만)
  useEffect(() => {
    if (!isAuthenticated || loading || isInitialized) return

    initChatSession()
    setIsInitialized(true)
  }, [isAuthenticated, loading, isInitialized, initChatSession])

  // 마이크 및 MediaRecorder 지원 여부 확인
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return
    const hasMediaDevices = typeof navigator.mediaDevices !== 'undefined'
    const supported = Boolean(
      hasMediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    )
    setIsSpeechSupported(supported)
  }, [])

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop())
        mediaStreamRef.current = null
      }
    }
  }, [])

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  
  const handleIngredientQuantityChange = (ingredient: string, change: number) => {
    // baseIngredientMap에 없는 재료는 처리하지 않음
    if (!baseIngredientMap[ingredient]) return
    
    setIngredientOverrides(prev => {
      const baseQty = typeof baseIngredientMap[ingredient] === 'number' ? baseIngredientMap[ingredient] : 0
      // 현재 수량이 없으면 기본 수량으로 초기화 (숫자로 변환)
      const currentQty = typeof prev[ingredient] === 'number' ? prev[ingredient] : baseQty
      // 변경 후 수량 계산 (최소값은 기본 수량)
      const nextQty = Math.max(baseQty, currentQty + change)
      
      // baseIngredientMap에 있는 재료만 포함한 새 객체 생성
      const updated: Record<string, number> = {}
      // baseIngredientMap의 모든 항목을 숫자로 변환하여 추가
      Object.entries(baseIngredientMap).forEach(([key, value]) => {
        // prev에 값이 있으면 그것을 사용, 없으면 baseIngredientMap의 기본값 사용
        const prevValue = prev[key]
        updated[key] = key === ingredient 
          ? nextQty 
          : (typeof prevValue === 'number' ? prevValue : (typeof value === 'number' ? value : 0))
      })
      return updated
    })
  }


  const ingredientConfirmMessage = useCallback(() => {
    const diffs = Object.entries(ingredientOverrides).filter(([code, qty]) => {
      const baseQty = typeof baseIngredientMap[code] === 'number' ? baseIngredientMap[code] : 0
      const currentQty = typeof qty === 'number' ? qty : 0
      return currentQty !== baseQty
    })

    if (diffs.length === 0) {
      return '재료는 기본 구성 그대로 진행해줘.'
    }

    const parts = diffs.map(([code, qty]) => {
      const qtyNum = typeof qty === 'number' ? qty : 0
      return `${ingredientDisplayNames[code] || code} ${qtyNum}개`
    })
    return `재료를 ${parts.join(', ')}로 맞춰줘.`
  }, [ingredientOverrides, baseIngredientMap])

  const handleIngredientConfirm = async () => {
    if (isProcessing) return
    promptScheduleSelection()
    await handleSendMessage(ingredientConfirmMessage(), { forceScheduling: true })
  }

  const handleScheduleConfirm = async (useSelectedDate: boolean) => {
    if (isProcessing) return
    if (useSelectedDate && !deliveryDate) return
    const dateValue = useSelectedDate ? deliveryDate : null
    const timeValue = useSelectedDate ? deliveryTimeSlot : null
    acknowledgeScheduleUpdate(dateValue, timeValue)
    await finalizeScheduleAndCheckout(dateValue, timeValue)
  }
  
  // 메시지 전송 처리
  const handleSendMessage = useCallback(
    async (text: string = transcript, options?: { forceScheduling?: boolean }) => {
      const forceScheduling = options?.forceScheduling ?? false
      if (!text.trim() || isProcessing) return
      
      // 사용자 메시지 추가
      const userMessage: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, userMessage])
      setTranscript('')
      setIsProcessing(true)

      if (awaitingSchedule && !forceScheduling) {
        const parsed = parseScheduleInput(text)
        const wantsCheckout = shouldProceedToCheckout(text)
        if (parsed) {
          setIsProcessing(false)
          if (parsed.type === 'date') {
            setDeliveryDate(parsed.value)
            if (parsed.timeSlot) {
              setDeliveryTimeSlot(parsed.timeSlot)
            }
            acknowledgeScheduleUpdate(parsed.value, parsed.timeSlot ?? deliveryTimeSlot)
            if (wantsCheckout) {
              await finalizeScheduleAndCheckout(parsed.value, parsed.timeSlot ?? deliveryTimeSlot)
            }
          } else if (parsed.type === 'time') {
            setDeliveryTimeSlot(parsed.timeSlot)
            acknowledgeScheduleUpdate(deliveryDate || null, parsed.timeSlot)
            if (wantsCheckout && deliveryDate) {
              await finalizeScheduleAndCheckout(deliveryDate, parsed.timeSlot)
            }
          } else {
            setDeliveryDate('')
            acknowledgeScheduleUpdate(null, null)
            if (wantsCheckout) {
              await finalizeScheduleAndCheckout(null, null)
            }
          }
          return
        }

        if (wantsCheckout) {
          setIsProcessing(false)
          await finalizeScheduleAndCheckout(deliveryDate || null, deliveryTimeSlot)
          return
        }
      }
      
      try {
        // Gemini API로 음성 분석 요청 (user_id 포함)
        const response = await fetch('/api/voice/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transcript: text,
            user_id: user?.id || null,  // 로그인한 사용자 ID 전달
            session_id: sessionId
          })
        })
        
        if (response.ok) {
          const data = await response.json()

        // 메뉴/스타일/수량 선택 정보 업데이트 (상태 업데이트 전에 먼저 처리)
        let newMenuCode: string | null = null
        const menuSelectionMade = Boolean(data.menu_selection && data.menu_selection > 0)
        if (menuSelectionMade) {
          const menuCodeMap: Record<number, string> = {1: 'french', 2: 'english', 3: 'valentine', 4: 'champagne'}
          newMenuCode = menuCodeMap[data.menu_selection] || null
        } else if (!selectedMenuCode && data.order_state?.menu_code) {
          newMenuCode = data.order_state.menu_code
        }
        
        // 1단계: 메뉴 선택 정보 업데이트
        const menuChanged = newMenuCode && newMenuCode !== selectedMenuCode
        if (menuChanged) {
          setSelectedMenuCode(newMenuCode)
          // 메뉴가 변경되면 스타일과 수량 초기화
          setSelectedStyleCode(null)
          setSelectedQuantity(1)
          setQuantityConfirmed(false)
          setAwaitingSchedule(false)
          setStyleConfirmed(false)
          setMenuConfirmed(menuSelectionMade)
          setDeliveryDate('')
          setDeliveryTimeSlot(DEFAULT_TIME_SLOT)
        } else if (newMenuCode) {
          setSelectedMenuCode(newMenuCode)
        }

        if (menuSelectionMade && newMenuCode) {
          setMenuConfirmed(true)
        }
        
        // 2단계: 스타일 선택 정보 업데이트 (메뉴가 선택된 경우에만)
        let newStyleCode: string | null = null
        const styleSelectionMade = Boolean(data.style_selection && data.style_selection > 0)
        if (newMenuCode || selectedMenuCode) {
          if (styleSelectionMade) {
            const styleCodeMap: Record<number, string> = {1: 'simple', 2: 'grand', 3: 'deluxe'}
            newStyleCode = styleCodeMap[data.style_selection] || null
            setSelectedStyleCode(newStyleCode)
            setStyleConfirmed(true)
          } else if (!selectedStyleCode && data.order_state?.style_code) {
            newStyleCode = data.order_state.style_code
            setSelectedStyleCode(newStyleCode)
          }
        }

        let quantityIsConfirmed = quantityConfirmed

        if (menuChanged) {
          quantityIsConfirmed = false
        }

        if (newStyleCode && newStyleCode !== selectedStyleCode) {
          quantityIsConfirmed = false
          setQuantityConfirmed(false)
          setAwaitingSchedule(false)
        }
        
        // 3단계: 수량 선택 정보 업데이트 (메뉴와 스타일이 선택된 경우에만)
        let newQuantity: number | null = null
        if ((newMenuCode || selectedMenuCode) && (newStyleCode || selectedStyleCode)) {
          if (data.quantity && data.quantity > 0) {
            newQuantity = data.quantity
            setSelectedQuantity(data.quantity)
          } else if (data.order_state?.quantity) {
            newQuantity = data.order_state.quantity
            setSelectedQuantity(data.order_state.quantity)
          }
        }

        if (newQuantity !== null) {
          quantityIsConfirmed = false
          setQuantityConfirmed(false)
          setAwaitingSchedule(false)
        }

        const backendQuantityConfirmed =
          data.quantity_confirmed === 1 ||
          data.order_state?.quantity_confirmed === 1 ||
          data.state === 'INGREDIENT_CUSTOMIZATION' ||
          data.state === 'CHECKOUT_READY' ||
          data.order_state?.current_state === 'INGREDIENT_CUSTOMIZATION' ||
          data.order_state?.current_state === 'CHECKOUT_READY'

        if (backendQuantityConfirmed) {
          quantityIsConfirmed = true
          setQuantityConfirmed(true)
        }

        // 명확한 순서로 상태 결정 (백엔드 응답보다 프론트엔드 로직 우선)
        let newState: OrderState
        
        // 현재 선택된 정보 확인 (최신 업데이트된 값 사용)
        const finalMenuCode = newMenuCode || selectedMenuCode
        const finalStyleCode = newStyleCode || selectedStyleCode
        const finalQuantity = newQuantity ?? selectedQuantity
        const isQuantityConfirmed = backendQuantityConfirmed || quantityIsConfirmed
        const hasMenu = menuConfirmed && Boolean(finalMenuCode)
        const hasStyle = styleConfirmed && Boolean(finalStyleCode)
        
        if (!hasMenu) {
          // 1단계: 메뉴가 없으면 메뉴 추천
          newState = 'MENU_RECOMMENDATION'
        } else if (!hasStyle) {
          // 2단계: 메뉴는 있지만 스타일이 없으면 스타일 추천
          newState = 'STYLE_RECOMMENDATION'
        } else if (!isQuantityConfirmed) {
          // 3단계: 메뉴와 스타일은 있지만 수량이 확정되지 않았으면 수량 선택
          newState = 'QUANTITY_SELECTION'
        } else {
          // 4단계: 메뉴, 스타일, 수량이 모두 확정되었으면 재료 커스터마이징
          newState = 'INGREDIENT_CUSTOMIZATION'
        }

        // 일정이 아직 없는데 체크아웃 단계(또는 강제 스케줄링)로 진입하려 할 때는 먼저 일정 선택으로 보냄
        if (forceScheduling || awaitingSchedule || (!deliveryDate && orderState === 'CHECKOUT_READY')) {
          if (!awaitingSchedule) {
            promptScheduleSelection()
          }
          newState = 'SCHEDULING'
        }
        
        setOrderState(newState)

        const overrideSource = (data.customization_overrides && Object.keys(data.customization_overrides).length > 0)
          ? data.customization_overrides
          : data.order_state?.customizations
        if (overrideSource && Object.keys(overrideSource).length > 0) {
          // baseIngredientMap에 있는 재료만 필터링하여 설정 (메뉴/스타일에 맞는 재료만)
          const validIngredients = Object.keys(baseIngredientMap)
          const sanitized: Record<string, number> = {}
          // 먼저 baseIngredientMap의 모든 재료를 기본값으로 설정
          Object.entries(baseIngredientMap).forEach(([key, value]) => {
            sanitized[key] = typeof value === 'number' ? value : 0
          })
          // overrideSource에서 baseIngredientMap에 있는 재료만 업데이트
          Object.entries(overrideSource).forEach(([key, value]) => {
            if (validIngredients.includes(key)) {
              sanitized[key] = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value) || 0 : 0)
            }
          })
          setIngredientOverrides(sanitized)
        }


        // AI 응답 메시지 추가 (alternatives 포함)
        // 가격이 포함된 경우 수량을 곱해서 표시
        let responseContent = data.response
        const currentQuantity = data.quantity || data.order_state?.quantity || selectedQuantity || 1
        
        // 응답 메시지에서 가격 패턴 찾기 (예: "40,000원", "40000원", "40,000원에")
        if (currentQuantity > 1) {
          // 숫자와 쉼표로 구성된 가격 패턴 찾기 (예: "40,000원", "40,000원에", "40,000원에 20분")
          const pricePattern = /(\d{1,3}(?:,\d{3})*)\s*원/g
          responseContent = responseContent.replace(
            pricePattern,
            (match: string, priceStr: string) => {
              // 쉼표 제거하고 숫자로 변환
              const priceNum = parseInt(priceStr.replace(/,/g, ''), 10)
              if (!isNaN(priceNum)) {
                // 수량 곱하기
                const totalPrice = priceNum * currentQuantity
                // 다시 쉼표 포함 형식으로 변환
                return `${totalPrice.toLocaleString()}원`
              }
              return match
            }
          )
        }
        
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: responseContent,
          timestamp: new Date().toISOString(),
          menuInfo: data.recommended_menu,
          alternatives: data.alternatives || []
        }
        setMessages(prev => [...prev, assistantMessage])
        
          // CHECKOUT_READY 상태면 주문 검증 모달 표시
          if (data.state === 'CHECKOUT_READY' || data.order_state?.current_state === 'CHECKOUT_READY') {
            // checkout-ready 신호가 와도 먼저 배송 일정을 확정하도록 안내
            promptScheduleSelection()
            return
          }
          
        } else {
          await response.json().catch(() => null)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다.',
            timestamp: new Date().toISOString()
          }])
        }
      } catch (error) {
        console.error('메시지 전송 실패:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '네트워크 오류가 발생했습니다. 다시 시도해주세요.',
          timestamp: new Date().toISOString()
        }])
      } finally {
        setIsProcessing(false)
      }
    },
    [
      transcript,
      isProcessing,
      awaitingSchedule,
      parseScheduleInput,
      shouldProceedToCheckout,
      deliveryTimeSlot,
      deliveryDate,
      user?.id,
      sessionId,
      selectedMenuCode,
      selectedStyleCode,
      selectedQuantity,
      menuConfirmed,
      styleConfirmed,
      quantityConfirmed,
      ingredientOverrides,
      baseIngredientMap,
      orderState,
      promptScheduleSelection,
      finalizeScheduleAndCheckout,
      acknowledgeScheduleUpdate,
      DEFAULT_TIME_SLOT,
      setMessages,
    ]
  )
  
  const processRecordedAudio = useCallback(async (audioBlob: Blob) => {
    try {
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('녹음된 오디오가 비어 있습니다.')
      }
      setTranscript('음성을 해석하는 중입니다...')

      const formData = new FormData()
      const extension = audioBlob.type.includes('mp4')
        ? 'mp4'
        : audioBlob.type.includes('mpeg')
          ? 'mp3'
          : 'webm'
      formData.append('audio_file', audioBlob, `recording.${extension}`)
      formData.append('language', 'ko')

      const response = await fetch('/api/voice/stt', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`음성 인식 실패: ${response.status}`)
      }

      const data = await response.json()
      const recognizedText = (data?.transcript || '').trim()

      if (recognizedText) {
        setTranscript(recognizedText)
        await handleSendMessage(recognizedText)
      } else {
        setTranscript('')
      }
    } catch (error) {
      console.error('음성 인식 실패:', error)
      setTranscript('')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '음성 인식에 실패했습니다. 다시 시도하거나 텍스트 입력을 이용해 주세요.',
        timestamp: new Date().toISOString()
      }])
    } finally {
      setIsListening(false)
    }
  }, [handleSendMessage, setMessages])

  const startRecording = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('이 브라우저에서는 마이크를 사용할 수 없습니다.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mpeg'
      ]
      const mimeType = mimeCandidates.find(type =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
      ) || 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event: Event) => {
        console.error('MediaRecorder 오류:', event)
        setIsListening(false)
        setTranscript('')
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop())
          mediaStreamRef.current = null
        }
        processRecordedAudio(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsListening(true)
      setTranscript('')
    } catch (error) {
      console.error('마이크 접근 실패:', error)
      alert('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
    }
  }, [processRecordedAudio])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      mediaStreamRef.current = null
    }
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (!isSpeechSupported) {
      alert('이 브라우저에서는 마이크 녹음을 지원하지 않습니다.')
      return
    }

    if (isListening) {
      stopRecording()
      return
    }

    if (isProcessing) {
      alert('이전 요청을 처리 중입니다. 잠시만 기다려주세요.')
      return
    }

    startRecording()
  }, [isSpeechSupported, isProcessing, isListening, startRecording, stopRecording])

  // 메뉴 주문 - checkout 페이지로 직접 이동
  const openCheckoutModalFromState = async (
    menuCode: string,
    styleCode: string,
    quantityValue: number,
    overrides: Record<string, number>,
    timeSlot?: string | null
  ) => {
    try {
      const response = await fetch(`/api/menu/${menuCode}`)
      if (!response.ok) {
        throw new Error(`메뉴 정보 조회 실패: ${response.status}`)
      }
      const menuData = await response.json()
      if (!menuData.success) {
        throw new Error('메뉴 정보 조회 실패: 응답 실패')
      }
      const menu = menuData.data
      if (!menu || !menu.id) {
        throw new Error('메뉴 정보가 올바르지 않습니다')
      }
      const styleInfo = menu.styles.find((s: any) => s.code === styleCode.toLowerCase())
      if (!styleInfo) {
        throw new Error(`스타일 정보를 찾을 수 없습니다: ${styleCode}`)
      }

      const mergedCustomizations = { ...(styleInfo.base_ingredients || {}), ...(overrides || {}) }

      // checkout 페이지로 직접 이동
      const params = new URLSearchParams({
        menu: menuCode,
        style: styleCode,
        quantity: quantityValue.toString()
      })

      // 커스터마이징 정보 추가
      if (Object.keys(mergedCustomizations).length > 0) {
        params.append('customizations', encodeURIComponent(JSON.stringify(mergedCustomizations)))
      }

      if (deliveryDate) {
        params.append('deliveryDate', deliveryDate)
      }
      if (timeSlot) {
        params.append('deliveryTime', timeSlot)
      }

      // 주문 날짜가 있으면 추가
      router.push(`/checkout?${params.toString()}`)
    } catch (error) {
      console.error('주문 준비 데이터 로드 실패:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 주문 정보를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date().toISOString()
      }])
    }
  }

  const handleOrderMenu = async (menuInfo: any) => {
    if (!menuInfo) return

    // 로그인 확인
    if (!user) {
      alert('주문하려면 로그인이 필요합니다.')
      router.push('/login')
      return
    }

    try {
      // 실제 DB에서 메뉴 정보 조회
      const response = await fetch(`/api/menu/${menuInfo.code}`)
      if (!response.ok) {
        alert('메뉴 정보를 가져올 수 없습니다.')
        return
      }

      const menuData = await response.json()
      if (!menuData.success) {
        alert('메뉴 정보를 가져올 수 없습니다.')
        return
      }

      const menu = menuData.data

      // 스타일에 맞는 가격과 정보 찾기 (code로 비교)
      const styleInfo = menu.styles.find((s: any) => s.code === menuInfo.style.toLowerCase())
      if (!styleInfo) {
        console.error('스타일 찾기 실패:', { menuInfo, availableStyles: menu.styles.map((s: any) => s.code) })
        alert(`해당 스타일(${menuInfo.style})을 찾을 수 없습니다. 사용 가능한 스타일: ${menu.styles.map((s: any) => s.code).join(', ')}`)
        return
      }

      // 커스터마이징 정보 초기화
      const customization = menuInfo.customization || {}
      const initialCustomizations: Record<string, number> = {}

      // 메뉴별 기본 재료 구성
      const baseIngredients: { [key: string]: { [key: string]: { [key: string]: number } } } = {
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

      const baseQty = baseIngredients[menu.code]?.[styleInfo.code] || {}

      // 기존 커스터마이징 정보를 초기값으로 설정
      if (customization.extra_wine && customization.extra_wine > 0) {
        const baseWineQty = baseQty['wine'] || 0
        initialCustomizations['wine'] = baseWineQty + customization.extra_wine
      } else if (baseQty['wine']) {
        initialCustomizations['wine'] = baseQty['wine']
      }

      if (customization.extra_champagne && customization.extra_champagne > 0) {
        const baseChampagneQty = baseQty['champagne_bottle'] || 0
        initialCustomizations['champagne_bottle'] = baseChampagneQty + customization.extra_champagne
      } else if (baseQty['champagne_bottle']) {
        initialCustomizations['champagne_bottle'] = baseQty['champagne_bottle']
      }

      if (customization.overrides) {
        Object.entries(customization.overrides).forEach(([key, qty]) => {
          const parsedQty = typeof qty === 'number' ? qty : Number(qty)
          if (!Number.isNaN(parsedQty) && parsedQty > 0) {
            initialCustomizations[key] = parsedQty
          }
        })
      }

      // 기본 재료도 포함
      Object.entries(baseQty).forEach(([key, qty]) => {
        if (!initialCustomizations[key]) {
          initialCustomizations[key] = qty as number
        }
      })

      // 모달에 표시할 메뉴 정보 저장
      setSelectedMenuInfo({
        ...menuInfo,
        menuData: menu,
        styleInfo
      })

      // 커스터마이징 데이터 초기화
      setCustomizationData({
        quantity: 1,
        deliveryDate: '',
        customizations: initialCustomizations
      })

      // 모달 열기
      setShowCustomizationModal(true)
    } catch (error) {
      console.error('메뉴 정보 조회 실패:', error)
      alert('메뉴 정보를 가져오는 중 오류가 발생했습니다.')
    }
  }

  // 커스터마이징 확인 및 checkout으로 이동
  const handleConfirmCustomization = () => {
    if (!selectedMenuInfo) return

    const { menuData, styleInfo } = selectedMenuInfo
    const params = new URLSearchParams({
      menu: menuData.code,
      style: styleInfo.code,
      quantity: customizationData.quantity.toString()
    })

    // 커스터마이징 정보 추가
    if (Object.keys(customizationData.customizations).length > 0) {
      params.append('customizations', encodeURIComponent(JSON.stringify(customizationData.customizations)))
    }

    // 배송 날짜가 있으면 추가 (deliveryDate state 우선, 없으면 customizationData.deliveryDate)
    const finalDeliveryDate = deliveryDate || customizationData.deliveryDate
    if (finalDeliveryDate) {
      params.append('deliveryDate', finalDeliveryDate)
    }

    // 모달 닫기
    setShowCustomizationModal(false)

    // checkout 페이지로 이동
    router.push(`/checkout?${params.toString()}`)
  }
  
  // Enter 키로 메시지 전송
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }
  
  // 로딩 중이거나 로그인하지 않은 경우
  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col">
        <Header currentPage="voice" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-4">로그인 정보를 확인하는 중...</div>
            {!loading && !isAuthenticated && (
              <div className="text-lg text-stone-600">
                로그인이 필요합니다. 잠시 후 로그인 페이지로 이동합니다.
              </div>
            )}
          </div>
        </main>
        <div className="hidden lg:block">
          <Footer />
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col">
      <Header currentPage="voice" />
      
      <main className="flex-1 w-full py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              🎙️ <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800">AI 음성 주문</span>
            </h1>
            <p className="text-xl text-stone-600">
              음성으로 편하게 메뉴를 추천받고 주문하세요
            </p>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100dvh-16rem)] lg:h-[600px] min-h-[500px]">
            {/* 왼쪽: 음성 컨트롤 */}
            <div className="lg:w-1/3">
              <div className="bg-white rounded-2xl shadow-xl p-8 h-full flex flex-col">
                <h2 className="text-2xl font-bold text-stone-900 mb-6">음성 인식</h2>
                
                {/* 마이크 버튼 */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <button
                    onClick={toggleListening}
                    disabled={!isSpeechSupported || (isProcessing && !isListening)}
                    className={`
                      w-32 h-32 rounded-full flex items-center justify-center text-6xl
                      transition-all transform hover:scale-110 shadow-lg
                      ${isListening 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse text-white' 
                        : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white'
                      }
                      ${!isSpeechSupported || (isProcessing && !isListening) ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {isListening ? '🔴' : '🎤'}
                  </button>
                  
                  <div className="mt-6 text-center">
                    <p className="text-lg font-semibold text-stone-700">
                      {isListening ? '듣고 있습니다...' : '마이크를 눌러 말씀하세요'}
                    </p>
                    {!isSpeechSupported && (
                      <p className="text-sm text-red-600 mt-2">
                        ⚠️ 이 브라우저는 마이크 녹음을 지원하지 않습니다.
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 음성 인식 결과 표시 */}
                {transcript && (
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                    <p className="text-sm text-stone-600 mb-1">인식된 음성:</p>
                    <p className="text-stone-900 font-medium">{transcript}</p>
                  </div>
                )}
                
                {/* 샘플 질문 */}
                <div className="mt-6">
                  <p className="text-sm text-stone-600 mb-2">이렇게 말해보세요:</p>
                  <div className="space-y-2">
                    {user && (
                      <button
                        onClick={() => handleSendMessage('저번에 주문했던 거로 주문해줘')}
                        className="w-full text-left p-2 bg-amber-50 hover:bg-amber-100 rounded-lg text-sm text-stone-700 transition-colors border border-amber-200"
                      >
                        "저번에 주문했던 거로 주문해줘"
                      </button>
                    )}
                    <button
                      onClick={() => handleSendMessage('오늘 로맨틱한 저녁 추천해줘')}
                      className="w-full text-left p-2 bg-stone-50 hover:bg-stone-100 rounded-lg text-sm text-stone-700 transition-colors"
                    >
                      "오늘 로맨틱한 저녁 추천해줘"
                    </button>
                    <button
                      onClick={() => handleSendMessage('가족끼리 먹고 싶은데 추천해줘')}
                      className="w-full text-left p-2 bg-stone-50 hover:bg-stone-100 rounded-lg text-sm text-stone-700 transition-colors"
                    >
                      "가족끼리 먹고 싶은데 추천해줘"
                    </button>
                    <button
                      onClick={() => handleSendMessage('빨리 먹을 수 있는 거 추천해줘')}
                      className="w-full text-left p-2 bg-stone-50 hover:bg-stone-100 rounded-lg text-sm text-stone-700 transition-colors"
                    >
                      "빨리 먹을 수 있는 거 추천해줘"
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 오른쪽: 채팅 UI */}
            <div className="lg:w-2/3 relative z-20">
              <div className="bg-white rounded-2xl shadow-xl h-full flex flex-col relative">
                {/* 채팅 헤더 */}
                <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-stone-50 rounded-t-2xl">
                  <h2 className="text-xl font-bold text-stone-900">AI 상담사와 대화</h2>
                  <p className="text-sm text-stone-600">메뉴 추천과 주문을 도와드립니다</p>
                </div>
                
                {/* 채팅 메시지 영역 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`
                          max-w-[75%] p-4 rounded-2xl
                          ${message.role === 'user' 
                            ? 'bg-amber-600 text-white' 
                            : 'bg-stone-100 text-stone-900'
                          }
                        `}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>

                        {/* 상태별 선택 버튼 - 메뉴 추천 상태 */}
                        {orderState === 'MENU_RECOMMENDATION' && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold mb-2">메뉴를 선택해주세요:</p>
                            
                            {/* 메인 추천 메뉴 선택 버튼 */}
                            {message.menuInfo && (
                              <button
                                onClick={async () => {
                                  const menuName = message.menuInfo?.name
                                  if (!menuName) return
                                  await handleSendMessage(`${menuName} 선택`)
                                }}
                                className="w-full p-3 bg-amber-100/50 backdrop-blur rounded-lg border-2 border-amber-300 hover:bg-amber-200/50 transition-colors text-left"
                              >
                                <p className="font-semibold text-amber-900">{message.menuInfo.name}</p>
                                {message.menuInfo.reason && <p className="text-xs mt-1 opacity-75">{message.menuInfo.reason}</p>}
                              </button>
                            )}
                            
                            {/* 대안 메뉴 선택 버튼 */}
                            {message.alternatives && message.alternatives.map((alt, idx) => (
                              <button
                                key={idx}
                                onClick={async () => {
                                  await handleSendMessage(`${alt.name} 선택`)
                                }}
                                className="w-full p-3 bg-white/20 backdrop-blur rounded-lg border border-white/40 hover:bg-white/30 transition-colors text-left"
                              >
                                <p className="font-semibold">{alt.name}</p>
                                {alt.reason && <p className="text-xs mt-1 opacity-75">{alt.reason}</p>}
                              </button>
                            ))}
                          </div>
                        )}

                        {orderState === 'STYLE_RECOMMENDATION' && selectedMenuCode && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold mb-2">스타일을 선택해주세요:</p>
                            {(() => {
                              const styles = selectedMenuCode === 'champagne' 
                                ? [{code: 'grand', name: '그랜드', value: 2}, {code: 'deluxe', name: '디럭스', value: 3}]
                                : [
                                    {code: 'simple', name: '심플', value: 1},
                                    {code: 'grand', name: '그랜드', value: 2},
                                    {code: 'deluxe', name: '디럭스', value: 3}
                                  ]
                              
                              return styles.map((style) => (
                                <button
                                  key={style.code}
                                  onClick={async () => {
                                    await handleSendMessage(`${style.name} 스타일 선택`)
                                  }}
                                  className="w-full p-3 bg-white/20 backdrop-blur rounded-lg border border-white/40 hover:bg-white/30 transition-colors text-left"
                                >
                                  <p className="font-semibold">{style.name}</p>
                                </button>
                              ))
                            })()}
                          </div>
                        )}

        {orderState === 'QUANTITY_SELECTION' && menuConfirmed && styleConfirmed && (
                          <div className="mt-3 p-3 bg-white/20 backdrop-blur rounded-lg border border-white/40 space-y-3">
                            <div>
                              <p className="text-xs font-semibold mb-2">수량을 조정해주세요:</p>
                              <div className="flex items-center space-x-4">
                                <button
                                  onClick={() => setSelectedQuantity(prev => Math.max(1, prev - 1))}
                                  className="w-10 h-10 rounded-lg bg-white/30 hover:bg-white/40 flex items-center justify-center font-bold"
                                >
                                  -
                                </button>
                                <span className="text-lg font-semibold w-12 text-center">
                                  {selectedQuantity}
                                </span>
                                <button
                                  onClick={() => setSelectedQuantity(prev => prev + 1)}
                                  className="w-10 h-10 rounded-lg bg-white/30 hover:bg-white/40 flex items-center justify-center font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                const message = `수량 ${selectedQuantity}개로 주문하겠습니다`
                                await handleSendMessage(message)
                                // 상태는 handleSendMessage 내부에서 자동으로 전환됨
                              }}
                              className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                            >
                              확인
                            </button>
                          </div>
                        )}

                        {orderState === 'INGREDIENT_CUSTOMIZATION' && (
                          <div className="mt-3 p-3 bg-white/20 backdrop-blur rounded-lg border border-white/40 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold">재료와 테이블웨어를 조정해주세요:</p>
                              <button
                                onClick={() => {
                                  if (selectedMenuCode && selectedStyleCode) {
                                    // baseIngredientMap의 모든 값을 숫자로 변환하여 설정
                                    const sanitized: Record<string, number> = {}
                                    Object.entries(baseIngredientMap).forEach(([key, value]) => {
                                      sanitized[key] = typeof value === 'number' ? value : 0
                                    })
                                    setIngredientOverrides(sanitized)
                                  }
                                }}
                                className="text-xs text-amber-700 underline"
                              >
                                기본 구성으로 초기화
                              </button>
                            </div>
                            {ingredientGroups.food.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-stone-700">요리 재료</p>
                                {ingredientGroups.food.map(([code, qty]) => {
                                  const baseQty = baseIngredientMap[code] ?? 0
                                  const displayedQty = qty * selectedQuantity
                                  const displayedBase = baseQty * selectedQuantity
                                  return (
                                    <div key={code} className="flex items-center justify-between p-2 bg-white/30 rounded-lg">
                                      <div>
                                        <p className="text-sm font-semibold">{ingredientDisplayNames[code] || code}</p>
                                        <p className="text-[11px] text-stone-600">기본 {displayedBase}개 (1인분당 {baseQty}개)</p>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => handleIngredientQuantityChange(code, -1)}
                                          disabled={qty <= baseQty}
                                          className={`w-7 h-7 rounded-full font-bold ${
                                            qty > baseQty
                                              ? 'bg-white/60 hover:bg-white text-stone-800'
                                              : 'bg-white/30 text-stone-400 cursor-not-allowed'
                                          }`}
                                        >
                                          -
                                        </button>
                                        <span className="w-10 text-center text-sm font-semibold">{displayedQty}</span>
                                        <button
                                          onClick={() => handleIngredientQuantityChange(code, 1)}
                                          className="w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {ingredientGroups.tableware.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-stone-700">테이블웨어 & 데코</p>
                                {ingredientGroups.tableware.map(([code, qty]) => {
                                  const baseQty = baseIngredientMap[code] ?? 0
                                  const displayedQty = qty * selectedQuantity
                                  const displayedBase = baseQty * selectedQuantity
                                  return (
                                    <div key={code} className="flex items-center justify-between p-2 bg-white/30 rounded-lg">
                                      <div>
                                        <p className="text-sm font-semibold">{ingredientDisplayNames[code] || code}</p>
                                        <p className="text-[11px] text-stone-600">기본 {displayedBase}개 (1인분당 {baseQty}개)</p>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => handleIngredientQuantityChange(code, -1)}
                                          disabled={qty <= baseQty}
                                          className={`w-7 h-7 rounded-full font-bold ${
                                            qty > baseQty
                                              ? 'bg-white/60 hover:bg-white text-stone-800'
                                              : 'bg-white/30 text-stone-400 cursor-not-allowed'
                                          }`}
                                        >
                                          -
                                        </button>
                                        <span className="w-10 text-center text-sm font-semibold">{displayedQty}</span>
                                        <button
                                          onClick={() => handleIngredientQuantityChange(code, 1)}
                                          className="w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            <button
                              onClick={handleIngredientConfirm}
                              disabled={isProcessing}
                              className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-60"
                            >
                              커스터마이징 완료
                            </button>
                          </div>
                        )}

                        {orderState === 'SCHEDULING' && (
                          <div className="mt-3 p-3 bg-white/20 backdrop-blur rounded-lg border border-white/40 space-y-3">
                            <p className="text-xs font-semibold text-stone-700">배송 날짜를 선택해주세요:</p>
                            <input
                              type="date"
                              value={deliveryDate}
                              onChange={(e) => setDeliveryDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-white/30 border border-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-stone-700">배송 시간을 선택해주세요:</p>
                              <select
                                value={deliveryTimeSlot}
                                onChange={(e) => setDeliveryTimeSlot(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg bg-white/30 border border-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              >
                                {SCHEDULE_TIME_SLOTS.map((slot) => (
                                  <option key={slot} value={slot}>{slot}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                onClick={() => handleScheduleConfirm(true)}
                                disabled={!deliveryDate || isProcessing}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-60"
                              >
                                이 날짜로 진행
                              </button>
                              <button
                                onClick={() => handleScheduleConfirm(false)}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg font-semibold hover:bg-stone-300 disabled:opacity-60"
                              >
                                아직 일정 미정
                              </button>
                            </div>
                            <p className="text-[11px] text-stone-500">
                              배송 일정은 체크아웃 직전에도 다시 확인할 수 있습니다.
                            </p>
                          </div>
                        )}

                        {/* 추천 메뉴 카드 */}
                        {(() => {
                          const hasMainMenu = Boolean(message.menuInfo?.name)
                          const hasAlternatives = Array.isArray(message.alternatives) && message.alternatives.length > 0
                          if (!hasMainMenu && !hasAlternatives) return null

                          return (
                            <div className="mt-3 space-y-2">
                              {hasMainMenu && (
                                <div className="p-3 bg-white/20 backdrop-blur rounded-lg border-2 border-white/40">
                                  <p className="font-semibold mb-1">
                                    📍 {hasAlternatives ? '옵션 1' : '추천 메뉴'}
                                    {message.menuInfo?.customization?.extra_wine && (
                                      <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded">커스터마이징</span>
                                    )}
                                  </p>
                                  <p className="text-sm">
                                    {message.menuInfo?.name}
                                    {message.menuInfo?.style ? ` (${message.menuInfo.style})` : ''}
                                  </p>
                                  {message.menuInfo?.customization && (() => {
                                    const customization = message.menuInfo?.customization
                                    if (!customization) return null
                                    const overrideEntries = customization.overrides
                                      ? Object.entries(customization.overrides)
                                          .filter(([key, qty]) => {
                                            return typeof qty === 'number' && qty > 0 && ingredientDisplayNames.hasOwnProperty(key)
                                          })
                                      : []
                                    if (
                                      !(customization.extra_wine && customization.extra_wine > 0) &&
                                      !(customization.extra_champagne && customization.extra_champagne > 0) &&
                                      !customization.special_requests &&
                                      overrideEntries.length === 0
                                    ) {
                                      return null
                                    }
                                    const formatOverride = (key: string, qty: number) => {
                                      const label = ingredientDisplayNames[key] || key
                                      const unit = key === 'wine' || key === 'champagne_bottle' ? '병' : '개'
                                      return `${label} ${qty}${unit}`
                                    }
                                    return (
                                      <div className="text-xs mt-1 opacity-90">
                                        {customization.extra_wine && customization.extra_wine > 0 && (
                                          <p>🍷 와인 +{customization.extra_wine}병</p>
                                        )}
                                        {customization.extra_champagne && customization.extra_champagne > 0 && (
                                          <p>🥂 샴페인 +{customization.extra_champagne}병</p>
                                        )}
                                        {overrideEntries.length > 0 && (
                                          <p>
                                            🧺 수량 조정: {overrideEntries.map(([key, qty]) => formatOverride(key, qty)).join(', ')}
                                          </p>
                                        )}
                                        {customization.special_requests && (
                                          <p>✨ {typeof customization.special_requests === 'string' ? customization.special_requests : JSON.stringify(customization.special_requests)}</p>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {orderState !== 'MENU_RECOMMENDATION' && orderState !== 'STYLE_RECOMMENDATION' && orderState !== 'QUANTITY_SELECTION' && orderState !== 'SCHEDULING' && (
                                    <button
                                      onClick={() => handleOrderMenu(message.menuInfo)}
                                      className="mt-2 px-4 py-2 bg-white text-amber-600 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors w-full"
                                    >
                                      주문하기 →
                                    </button>
                                  )}
                                </div>
                              )}

                              {hasAlternatives && message.alternatives && message.alternatives.map((alt, idx) => (
                                <div key={idx} className="p-3 bg-white/10 backdrop-blur rounded-lg border border-white/20">
                                  <p className="font-semibold mb-1">
                                    {alt.name} ({alt.style})
                                    {!alt.customization || !alt.customization.extra_wine ? (
                                      <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">기본 구성</span>
                                    ) : null}
                                  </p>
                                  {alt.reason && <p className="text-xs mt-1 opacity-75">{alt.reason}</p>}
                                  {alt.customization && (() => {
                                    const customization = alt.customization
                                    const overrideEntries = customization.overrides
                                      ? Object.entries(customization.overrides)
                                          .filter(([key, qty]) => {
                                            return typeof qty === 'number' && qty > 0 && ingredientDisplayNames.hasOwnProperty(key)
                                          })
                                      : []
                                    if (
                                      !(customization.extra_wine && customization.extra_wine > 0) &&
                                      !(customization.extra_champagne && customization.extra_champagne > 0) &&
                                      overrideEntries.length === 0
                                    ) {
                                      return null
                                    }
                                    const formatOverride = (key: string, qty: number) => {
                                      const label = ingredientDisplayNames[key] || key
                                      const unit = key === 'wine' || key === 'champagne_bottle' ? '병' : '개'
                                      return `${label} ${qty}${unit}`
                                    }
                                    return (
                                      <div className="text-xs mt-1 opacity-90">
                                        {customization.extra_wine && customization.extra_wine > 0 && (
                                          <p>🍷 와인 +{customization.extra_wine}병</p>
                                        )}
                                        {customization.extra_champagne && customization.extra_champagne > 0 && (
                                          <p>🥂 샴페인 +{customization.extra_champagne}병</p>
                                        )}
                                        {overrideEntries.length > 0 && (
                                          <p>
                                            🧺 수량 조정: {overrideEntries.map(([key, qty]) => formatOverride(key, qty)).join(', ')}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {orderState !== 'MENU_RECOMMENDATION' && orderState !== 'STYLE_RECOMMENDATION' && orderState !== 'QUANTITY_SELECTION' && orderState !== 'SCHEDULING' && (
                                    <button
                                      onClick={() => handleOrderMenu(alt)}
                                      className="mt-2 px-4 py-2 bg-white/80 text-stone-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors w-full"
                                    >
                                      주문하기 →
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                        
                        <p className="text-xs opacity-70 mt-2">
                          {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {/* 처리 중 표시 */}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-stone-100 text-stone-900 p-4 rounded-2xl">
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-stone-600 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-stone-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-stone-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
                
                {/* 채팅 입력창 */}
                <div className="p-4 border-t pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white rounded-b-2xl sticky bottom-0 z-30">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="메시지를 입력하거나 마이크를 눌러 말씀하세요..."
                      className="flex-1 px-4 py-3 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-amber-500 transition-colors"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!transcript.trim() || isProcessing}
                      className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold rounded-lg hover:from-amber-700 hover:to-amber-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      전송
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* 커스터마이징 조정 모달 */}
      {showCustomizationModal && selectedMenuInfo && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCustomizationModal(false)
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-2xl font-bold text-stone-900 mb-4">
                주문 커스터마이징
              </h2>
              
              <div className="mb-4 p-4 bg-amber-50 rounded-lg">
                <p className="font-semibold text-stone-900">
                  {selectedMenuInfo.name} ({selectedMenuInfo.style})
                </p>
                <p className="text-sm text-stone-600 mt-1">
                  가격: {selectedMenuInfo.price?.toLocaleString()}원
                </p>
              </div>

              {/* 수량 조정 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  주문 수량
                </label>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setCustomizationData(prev => ({
                      ...prev,
                      quantity: Math.max(1, prev.quantity - 1)
                    }))}
                    className="w-10 h-10 rounded-lg bg-stone-200 hover:bg-stone-300 flex items-center justify-center font-bold"
                  >
                    -
                  </button>
                  <span className="text-lg font-semibold w-12 text-center">
                    {customizationData.quantity}
                  </span>
                  <button
                    onClick={() => setCustomizationData(prev => ({
                      ...prev,
                      quantity: prev.quantity + 1
                    }))}
                    className="w-10 h-10 rounded-lg bg-stone-200 hover:bg-stone-300 flex items-center justify-center font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 배송 날짜 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  배송 날짜 (선택사항)
                </label>
                <input
                  type="date"
                  value={customizationData.deliveryDate}
                  onChange={(e) => setCustomizationData(prev => ({
                    ...prev,
                    deliveryDate: e.target.value
                  }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* 재료 수량 조정 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-stone-700 mb-3">
                  재료 수량 조정
                </label>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(customizationData.customizations).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                      <span className="text-sm font-medium text-stone-700">
                        {ingredientDisplayNames[key] || key}
                      </span>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setCustomizationData(prev => ({
                            ...prev,
                            customizations: {
                              ...prev.customizations,
                              [key]: Math.max(0, (prev.customizations[key] || 0) - 1)
                            }
                          }))}
                          className="w-8 h-8 rounded bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-12 text-center font-semibold">
                          {value}
                        </span>
                        <button
                          onClick={() => setCustomizationData(prev => ({
                            ...prev,
                            customizations: {
                              ...prev.customizations,
                              [key]: (prev.customizations[key] || 0) + 1
                            }
                          }))}
                          className="w-8 h-8 rounded bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCustomizationModal(false)}
                  className="flex-1 px-6 py-3 bg-stone-200 text-stone-700 rounded-lg font-semibold hover:bg-stone-300 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirmCustomization}
                  className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                >
                  주문하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  )
}