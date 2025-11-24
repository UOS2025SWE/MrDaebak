'use client'

import { useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { ChatMessage } from '@/types/voice'

// --- Constants & Helpers ---

// Hardcoded display names and tableware lists are removed.
// They will be fetched from backend metadata.

const SCHEDULE_TIME_SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']
const DEFAULT_TIME_SLOT = '18:00'

const STYLE_CODE_LOOKUP: Record<string, number | undefined> = {
  '1': 1,
  '2': 2,
  '3': 3,
  simple: 1,
  grand: 2,
  deluxe: 3
}

const normalizeRecommendedStyle = (value: unknown): number | null => {
  if (value === undefined || value === null) return null

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null
    return STYLE_CODE_LOOKUP[String(value)] ?? value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return null
    const directMatch = STYLE_CODE_LOOKUP[trimmed]
    if (directMatch !== undefined) return directMatch
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric)) {
      return STYLE_CODE_LOOKUP[String(numeric)] ?? numeric
    }
  }

  return null
}

type ScheduleParseResult =
  | { type: 'date'; value: string; timeSlot?: string }
  | { type: 'unspecified' }
  | { type: 'time'; timeSlot: string }

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

const parseScheduleInput = (input: string): ScheduleParseResult | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/(미정|아직|정하지|모르)/.test(trimmed)) {
    return { type: 'unspecified' }
  }

  const extractTime = (text: string) => {
    const normalized = text.toLowerCase()
    const explicitTimeRegex = /(오전|오후|am|pm)?\s*(\d{1,2})\s*(시|:|시\s*정도|o'clock)/g
    let bestHour: number | null = null
    let bestMeridiem: string | null = null

    for (const match of normalized.matchAll(explicitTimeRegex)) {
      const meridiem = match[1] || null
      const hour = Number(match[2])
      if (Number.isNaN(hour)) continue
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

    const contextualMatch = normalized.match(/(\d{1,2})\s*(시|:)/)
    if (contextualMatch) {
      let hour = Number(contextualMatch[1])
      if (Number.isNaN(hour)) return null
      if (hour <= 12 && (normalized.includes('저녁') || normalized.includes('밤') || normalized.includes('늦게'))) {
        if (hour < 12) hour += 12
      }
      return resolveTimeSlot(hour)
    }
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
    const [, monthStr, dayStr] = monthDay
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (month && day) {
      const year = new Date().getFullYear()
      return {
        type: 'date',
        value: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        timeSlot: extractTime(trimmed) || undefined
      }
    }
  }

  const relativeDays: Record<string, number> = {
    '오늘': 0, '내일': 1, '모레': 2, '글피': 3,
    '사흘 뒤': 3, '나흘 뒤': 4, '이틀 뒤': 2, '다음 주': 7
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

type OrderStage =
  | 'PROMOTION_GREETING' | 'MENU_CONVERSATION' | 'MENU_RECOMMENDATION'
  | 'STYLE_RECOMMENDATION' | 'QUANTITY_SELECTION' | 'INGREDIENT_CUSTOMIZATION'
  | 'SCHEDULING' | 'CHECKOUT_READY'

// --- Reducer Types & Logic ---

interface VoiceState {
  orderState: OrderStage
  menuCode: string | null
  styleCode: string | null
  quantity: number
  backendQuantity: number
  currentIngredients: Record<string, number>
  defaultIngredients: Record<string, number>

  deliveryDate: string
  deliveryTimeSlot: string

  isProcessing: boolean
  isListening: boolean
  transcript: string

  sessionId: string | null
  messages: ChatMessage[]
  allMenuItems: any[]
  recommendedMenus: any[] // 추천된 메뉴들 (복수 가능)
  recommendedStyle: number | null // 추천된 스타일 코드 (1=Simple, 2=Grand, 3=Deluxe)
  styleOptionsVisible: boolean

  // Metadata
  ingredientMeta: Record<string, { display_name: string, category: string }>
  servingStyles: any[]
}

const initialState: VoiceState = {
  orderState: 'MENU_CONVERSATION',
  menuCode: null,
  styleCode: null,
  quantity: 1,
  backendQuantity: 1,
  currentIngredients: {},
  defaultIngredients: {},
  deliveryDate: '',
  deliveryTimeSlot: DEFAULT_TIME_SLOT,
  isProcessing: false,
  isListening: false,
  transcript: '',
  sessionId: null,
  messages: [],
  allMenuItems: [],
  recommendedMenus: [] as any[], // 추천된 메뉴들 (복수 가능)
  recommendedStyle: null,
  styleOptionsVisible: false,
  ingredientMeta: {},
  servingStyles: []
}

type Action =
  | { type: 'INIT_SESSION'; payload: { sessionId: string; message: string } }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'START_PROCESSING' }
  | { type: 'END_PROCESSING' }
  | { type: 'SET_LISTENING'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_MENU_ITEMS'; payload: any[] }
  | { type: 'CLEAR_MENU_UI' }
  | { type: 'CLEAR_STYLE_UI' }
  | { type: 'UPDATE_FROM_BACKEND'; payload: any }
  | { type: 'UPDATE_INGREDIENT'; payload: { code: string; diff: number } }
  | { type: 'RESET_INGREDIENTS' }
  | { type: 'SET_SCHEDULE'; payload: { date: string; time: string } }
  | { type: 'RESET_ALL' }
  | { type: 'SET_QUANTITY_LOCAL'; payload: number }
  | { type: 'SET_METADATA'; payload: { ingredients: any[], styles: any[] } }

function voiceReducer(state: VoiceState, action: Action): VoiceState {
  switch (action.type) {
    case 'INIT_SESSION':
      return {
        ...state,
        sessionId: action.payload.sessionId,
        messages: [{
          role: 'assistant',
          content: action.payload.message,
          timestamp: new Date().toISOString()
        }]
      }
    case 'RESET_ALL':
      return {
        ...initialState,
        ingredientMeta: state.ingredientMeta,
        servingStyles: state.servingStyles
      }
    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload }
    case 'START_PROCESSING':
      return { ...state, isProcessing: true }
    case 'END_PROCESSING':
      return { ...state, isProcessing: false }
    case 'SET_LISTENING':
      return { ...state, isListening: action.payload }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] }
    case 'SET_MENU_ITEMS':
      return { ...state, allMenuItems: action.payload }
    case 'CLEAR_MENU_UI':
      return { ...state, allMenuItems: [], recommendedMenus: [] }
    case 'CLEAR_STYLE_UI':
      return { ...state, recommendedStyle: null, styleOptionsVisible: false }
    case 'SET_SCHEDULE':
      return { ...state, deliveryDate: action.payload.date, deliveryTimeSlot: action.payload.time }
    case 'SET_QUANTITY_LOCAL':
      return { ...state, quantity: action.payload }

    case 'SET_METADATA': {
      const metaMap: Record<string, { display_name: string, category: string }> = {}
      action.payload.ingredients.forEach((item: any) => {
        metaMap[item.code] = { display_name: item.display_name, category: item.category }
      })
      return { ...state, ingredientMeta: metaMap, servingStyles: action.payload.styles }
    }

    case 'UPDATE_FROM_BACKEND': {
      const data = action.payload
      const newState = { ...state }
      const previousState = state.orderState

      // 백엔드에서 대화 기록 정리 요청 시 (CHECKOUT_READY 전환 시)
      // 백엔드가 이미 정리된 메시지를 response로 보내므로, 프론트엔드도 대화 기록을 정리
      if (data.clear_messages) {
        newState.messages = []
      }

      // 상태 변경 감지
      const stateChanged = data.state && data.state !== previousState
      if (data.state) newState.orderState = data.state

      // 스타일 UI 표시 상태 업데이트
      if (newState.orderState === 'STYLE_RECOMMENDATION') {
        newState.styleOptionsVisible = true
      } else {
        newState.styleOptionsVisible = false
      }

      const orderStateObj = data.order_state || {}

      if (data.menu_selection && data.menu_selection > 0) {
        const map: Record<number, string> = { 1: 'french', 2: 'english', 3: 'valentine', 4: 'champagne' }
        newState.menuCode = map[data.menu_selection] || newState.menuCode
      } else if (orderStateObj.menu_code) {
        newState.menuCode = orderStateObj.menu_code
      }

      if (data.style_selection && data.style_selection > 0) {
        const map: Record<number, string> = { 1: 'simple', 2: 'grand', 3: 'deluxe' }
        newState.styleCode = map[data.style_selection] || newState.styleCode
      } else if (orderStateObj.style_code) {
        newState.styleCode = orderStateObj.style_code
      }

      const backendQty = orderStateObj.quantity || data.quantity
      if (backendQty && backendQty > 0) {
        newState.quantity = backendQty
        newState.backendQuantity = backendQty
      }

      if (data.default_ingredients_by_quantity) {
        newState.defaultIngredients = data.default_ingredients_by_quantity
      } else if (newState.orderState !== 'INGREDIENT_CUSTOMIZATION') {
        // DO NOT CLEAR defaultIngredients if backend didn't send it but we are in customization
        // This was the bug: clearing it when we shouldn't.
        // newState.defaultIngredients = {} 
      }

      if (data.current_ingredients) {
        newState.currentIngredients = data.current_ingredients
      } else if (data.default_ingredients_by_quantity) {
        newState.currentIngredients = data.default_ingredients_by_quantity
      } else if (newState.orderState === 'INGREDIENT_CUSTOMIZATION' && Object.keys(newState.currentIngredients).length === 0) {
        // If backend didn't send current, and we have none, try to use default if available
        if (Object.keys(newState.defaultIngredients).length > 0) {
          newState.currentIngredients = { ...newState.defaultIngredients }
        }
      }

      // 상태 변경 시 이전 상태의 UI 데이터 즉시 초기화 (가장 먼저 처리)
      if (stateChanged) {
        // MENU_RECOMMENDATION에서 벗어나면 메뉴 관련 UI 데이터 무조건 초기화
        if (previousState === 'MENU_RECOMMENDATION' && newState.orderState !== 'MENU_RECOMMENDATION') {
          newState.allMenuItems = []
          newState.recommendedMenus = []
        }
        // STYLE_RECOMMENDATION에서 벗어나면 스타일 관련 UI 데이터 무조건 초기화
        if (previousState === 'STYLE_RECOMMENDATION' && newState.orderState !== 'STYLE_RECOMMENDATION') {
          newState.recommendedStyle = null
          newState.styleOptionsVisible = false
        }
      }

      // recommended_menu가 있으면 추천 목록 저장 (강조 표시용) - MENU_RECOMMENDATION 상태일 때만
      if (newState.orderState === 'MENU_RECOMMENDATION' && data.recommended_menu && Array.isArray(data.recommended_menu) && data.recommended_menu.length > 0) {
        // 추천된 메뉴 객체 전체를 저장 (code, name 모두 사용 가능)
        newState.recommendedMenus = data.recommended_menu.filter((menu: any) => {
          // 유효한 객체만 저장
          return typeof menu === 'object' && menu !== null && (menu.code || menu.name)
        })
      } else if (newState.orderState !== 'MENU_RECOMMENDATION') {
        // MENU_RECOMMENDATION 상태가 아니면 recommendedMenus 초기화
        newState.recommendedMenus = []
      }

      // recommended_style이 있으면 저장 (UI에서 사용) - STYLE_RECOMMENDATION 상태일 때만
      if (Object.prototype.hasOwnProperty.call(data, 'recommended_style')) {
        newState.recommendedStyle = normalizeRecommendedStyle(data.recommended_style)
      }
      if (newState.orderState !== 'STYLE_RECOMMENDATION') {
        // STYLE_RECOMMENDATION 상태가 아니면 recommendedStyle 초기화
        newState.recommendedStyle = null
        newState.styleOptionsVisible = false
      }

      // 상태별 데이터 정리 (추가 정리)
      if (newState.orderState !== 'MENU_RECOMMENDATION') {
        newState.allMenuItems = []
      }

      if (data.scheduled_for) {
        const [datePart, timePart] = data.scheduled_for.split(' ')
        if (datePart) newState.deliveryDate = datePart
        if (timePart) newState.deliveryTimeSlot = timePart
      } else if (orderStateObj.scheduled_for) {
        const [datePart, timePart] = orderStateObj.scheduled_for.split(' ')
        if (datePart) newState.deliveryDate = datePart
        if (timePart) newState.deliveryTimeSlot = timePart
      }

      return newState
    }

    case 'UPDATE_INGREDIENT': {
      const { code, diff } = action.payload
      const currentVal = state.currentIngredients[code] || 0
      let nextVal = currentVal + diff
      if (nextVal < 0) nextVal = 0
      return {
        ...state,
        currentIngredients: {
          ...state.currentIngredients,
          [code]: nextVal
        }
      }
    }

    case 'RESET_INGREDIENTS': {
      return {
        ...state,
        currentIngredients: { ...state.defaultIngredients }
      }
    }

    default:
      return state
  }
}

export default function VoicePage() {
  const router = useRouter()
  const { user, isAuthenticated, loading } = useAuth()

  const [state, dispatch] = useReducer(voiceReducer, initialState)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // --- Effects ---

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/voice')
    }
  }, [loading, isAuthenticated, router])

  // Init Metadata
  useEffect(() => {
    fetch('/api/menu/metadata')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          dispatch({ type: 'SET_METADATA', payload: data.data })
        }
      })
      .catch(console.error)
  }, [])

  const initChatSession = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch('/api/voice/chat/init', { method: 'POST', headers })
      if (response.ok) {
        const data = await response.json()
        dispatch({
          type: 'INIT_SESSION',
          payload: { sessionId: data.session_id, message: data.message }
        })
      }
    } catch (error) {
      console.error('Session init failed:', error)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && !loading && !state.sessionId) {
      initChatSession()
    }
  }, [isAuthenticated, loading, state.sessionId, initChatSession])

  useEffect(() => {
    // MENU_RECOMMENDATION 상태이고 메뉴 아이템이 없으며 현재 처리 중이 아닐 때만 로드
    if (
      state.orderState === 'MENU_RECOMMENDATION' &&
      state.allMenuItems.length === 0 &&
      !state.isProcessing
    ) {
      fetch('/api/menu/')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) {
            dispatch({ type: 'SET_MENU_ITEMS', payload: data.data })
          }
        })
        .catch(console.error)
    }
  }, [state.orderState, state.allMenuItems.length, state.isProcessing])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // --- Actions ---

  const handleSendMessage = useCallback(async (
    text: string = state.transcript,
    options?: { ingredientAdditions?: Record<string, number> }
  ) => {
    if (!text.trim() || state.isProcessing) return

    dispatch({
      type: 'ADD_MESSAGE',
      payload: { role: 'user', content: text, timestamp: new Date().toISOString() }
    })
    dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
    dispatch({ type: 'START_PROCESSING' })

    // Client-side schedule parsing/handling
    if (state.orderState === 'SCHEDULING' && !options?.ingredientAdditions) {
      const parsed = parseScheduleInput(text)
      // const wantsCheckout = shouldProceedToCheckout(text) // unused
      if (parsed) {
        let d = state.deliveryDate
        let t = state.deliveryTimeSlot
        if (parsed.type === 'date') {
          d = parsed.value
          if (parsed.timeSlot) t = parsed.timeSlot
        } else if (parsed.type === 'time') {
          t = parsed.timeSlot
        }
        dispatch({ type: 'SET_SCHEDULE', payload: { date: d, time: t } })

        // If user said "Checkout", we could auto-submit, but let's just update fields
        // and let backend confirm or user click button.
      }
    }

    try {
      const body = {
        transcript: text,
        user_id: user?.id || null,
        session_id: state.sessionId,
        ingredient_additions: options?.ingredientAdditions
      }

      const response = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        const data = await response.json()
        dispatch({ type: 'UPDATE_FROM_BACKEND', payload: data })

        let responseContent = data.response || "응답을 처리할 수 없습니다."
        if (data.quantity && data.quantity > 1) {
          const pricePattern = /(\d{1,3}(?:,\d{3})*)\s*원/g
          responseContent = responseContent.replace(pricePattern, (match: string, priceStr: string) => {
            const priceNum = parseInt(priceStr.replace(/,/g, ''), 10)
            if (!isNaN(priceNum)) {
              const totalPrice = priceNum * data.quantity
              return `${totalPrice.toLocaleString()}원`
            }
            return match
          })
        }

        // 백엔드에서 대화 기록을 정리한 경우 (clear_messages가 true) 메시지를 추가하지 않음
        // 백엔드가 이미 정리된 메시지를 response로 보냄
        if (!data.clear_messages) {
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              role: 'assistant',
              content: responseContent,
              timestamp: new Date().toISOString(),
              menuInfo: data.recommended_menu,
              alternatives: data.alternatives,
              recommendedStyle: data.recommended_style
            }
          })
        } else {
          // 백엔드에서 정리된 메시지를 사용
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              role: 'assistant',
              content: responseContent,
              timestamp: new Date().toISOString()
            }
          })
        }

      } else {
        throw new Error('Backend error')
      }
    } catch (error) {
      console.error('Message send failed:', error)
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.', timestamp: new Date().toISOString() }
      })
    } finally {
      dispatch({ type: 'END_PROCESSING' })
    }
  }, [state.transcript, state.isProcessing, state.sessionId, user?.id, state.orderState, state.deliveryDate, state.deliveryTimeSlot])

  const handleIngredientConfirm = useCallback(async () => {
    // "변경 완료" 버튼 클릭 시 현재 상태와 기본 상태의 차이를 계산하여
    // 최종 변경안을 백엔드에 전달합니다.
    // ingredientAdditions는 "추가"가 아니라 "최종 변경안"을 나타냅니다.
    const additions: Record<string, number> = {}
    const { currentIngredients, defaultIngredients } = state

    const baseRef = defaultIngredients
    const allKeys = new Set([...Object.keys(currentIngredients), ...Object.keys(baseRef)])
    allKeys.forEach(key => {
      const curr = currentIngredients[key] || 0
      const def = baseRef[key] || 0
      const diff = curr - def
      if (diff !== 0) {
        additions[key] = diff
      }
    })

    // 최종 변경안을 백엔드에 전달 (추가가 아니라 설정)
    await handleSendMessage('재료 커스터마이징 완료', { ingredientAdditions: additions })
  }, [state, handleSendMessage])

  const handleScheduleConfirm = useCallback(async (goToCheckout: boolean) => {
    const { deliveryDate, deliveryTimeSlot, menuCode, styleCode, quantity, currentIngredients } = state

    if (goToCheckout) {
      // 결제 페이지로 이동
      if (!deliveryDate) return

      if (!menuCode || !styleCode) return

      try {
        const params = new URLSearchParams({
          menu: menuCode,
          style: styleCode,
          quantity: quantity.toString()
        })

        params.append('deliveryDate', deliveryDate)
        params.append('deliveryTime', deliveryTimeSlot)

        if (Object.keys(currentIngredients).length > 0) {
          params.append('customizations', encodeURIComponent(JSON.stringify(currentIngredients)))
          params.append('customizationsMode', 'total')
        }

        router.push(`/checkout?${params.toString()}`)
      } catch (e) {
        console.error("Checkout navigation failed", e)
      }
    } else {
      // 날짜/시간 확인 - CHECKOUT_READY 상태로 전환
      if (!deliveryDate) {
        await handleSendMessage('날짜를 선택해주세요')
        return
      }

      // 날짜/시간 확인 메시지를 백엔드에 보내서 CHECKOUT_READY 상태로 전환
      const confirmMessage = deliveryTimeSlot
        ? `${deliveryDate} ${deliveryTimeSlot} 확인`
        : `${deliveryDate} 확인`
      await handleSendMessage(confirmMessage)
    }

  }, [state, router, handleSendMessage])

  // --- Audio Recording ---

  const processRecordedAudio = useCallback(async (audioBlob: Blob) => {
    try {
      if (!audioBlob || audioBlob.size === 0) throw new Error('녹음된 오디오가 비어 있습니다.')
      dispatch({ type: 'SET_TRANSCRIPT', payload: '음성을 해석하는 중입니다...' })

      const formData = new FormData()
      const extension = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('mpeg') ? 'mp3' : 'webm'
      formData.append('audio_file', audioBlob, `recording.${extension}`)
      formData.append('language', 'ko')

      const response = await fetch('/api/voice/stt', { method: 'POST', body: formData })
      if (!response.ok) throw new Error(`음성 인식 실패: ${response.status}`)

      const data = await response.json()
      const recognizedText = (data?.transcript || '').trim()

      if (recognizedText) {
        dispatch({ type: 'SET_TRANSCRIPT', payload: recognizedText })
        await handleSendMessage(recognizedText)
      } else {
        dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
      }
    } catch (error) {
      console.error('음성 인식 실패:', error)
      dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '음성 인식에 실패했습니다.', timestamp: new Date().toISOString() } })
    } finally {
      dispatch({ type: 'SET_LISTENING', payload: false })
    }
  }, [handleSendMessage])

  const startRecording = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('마이크를 사용할 수 없습니다.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mimeType = 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        processRecordedAudio(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      dispatch({ type: 'SET_LISTENING', payload: true })
      dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
    } catch (error) {
      console.error('Mic error:', error)
      alert('마이크 권한이 필요합니다.')
    }
  }, [processRecordedAudio])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    dispatch({ type: 'SET_LISTENING', payload: false })
  }, [])

  const toggleListening = useCallback(() => {
    if (state.isListening) stopRecording()
    else startRecording()
  }, [state.isListening, startRecording, stopRecording])


  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col">
        <Header currentPage="voice" />
        <main className="flex-1 flex items-center justify-center">
          <div>로그인 확인 중...</div>
        </main>
        <Footer />
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
          </div>

          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100dvh-16rem)] lg:h-[600px] min-h-[500px]">
            {/* Left: Voice Control */}
            <div className="lg:w-1/3">
              <div className="bg-white rounded-2xl shadow-xl p-8 h-full flex flex-col">
                <div className="flex-1 flex flex-col items-center justify-center">
                  <button onClick={toggleListening} disabled={state.isProcessing}
                    className={`w-32 h-32 rounded-full flex items-center justify-center text-6xl transition-all shadow-lg ${state.isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-amber-600 text-white'}`}>
                    {state.isListening ? '🔴' : '🎤'}
                  </button>
                  <p className="mt-4 font-semibold">{state.isListening ? '듣고 있습니다...' : '마이크를 눌러 말씀하세요'}</p>
                </div>
                {state.transcript && (
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                    <p className="text-sm text-stone-600">인식된 음성:</p>
                    <p className="font-medium">{state.transcript}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Chat UI */}
            <div className="lg:w-2/3 relative z-20">
              <div className="bg-white rounded-2xl shadow-xl h-full flex flex-col relative">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {state.messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-900'}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>



                        {state.orderState === 'QUANTITY_SELECTION' && msg.role === 'assistant' && idx === state.messages.length - 1 && (
                          <div className="mt-3 p-3 border rounded bg-white">
                            <div className="flex items-center gap-4 mb-2">
                              <button onClick={() => dispatch({ type: 'SET_QUANTITY_LOCAL', payload: Math.max(1, state.quantity - 1) })}>-</button>
                              <span>{state.quantity}</span>
                              <button onClick={() => dispatch({ type: 'SET_QUANTITY_LOCAL', payload: state.quantity + 1 })}>+</button>
                            </div>
                            <button onClick={() => handleSendMessage(`${state.quantity}개로 할게`)} className="bg-amber-600 text-white px-4 py-1 rounded">확인</button>
                          </div>
                        )}

                        {state.orderState === 'INGREDIENT_CUSTOMIZATION' && msg.role === 'assistant' && idx === state.messages.length - 1 && (
                          <div className="mt-3 p-3 border rounded bg-white max-h-96 overflow-y-auto">
                            <div className="flex justify-between mb-2">
                              <span className="font-bold">재료 구성 ({state.quantity}인분 기준)</span>
                              <button onClick={() => dispatch({ type: 'RESET_INGREDIENTS' })} className="text-xs underline">초기화</button>
                            </div>
                            {Object.entries(state.currentIngredients).map(([code, qty]) => (
                              <div key={code} className="flex justify-between items-center mb-1">
                                <span>{state.ingredientMeta[code]?.display_name || code}</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => dispatch({ type: 'UPDATE_INGREDIENT', payload: { code, diff: -1 } })}>-</button>
                                  <span>{qty}</span>
                                  <button onClick={() => dispatch({ type: 'UPDATE_INGREDIENT', payload: { code, diff: 1 } })}>+</button>
                                </div>
                              </div>
                            ))}
                            <button onClick={handleIngredientConfirm} className="w-full mt-2 bg-amber-600 text-white py-2 rounded">변경 완료</button>
                          </div>
                        )}

                        {/* SCHEDULING 상태일 때만 스케줄링 UI 표시 */}
                        {state.orderState === 'SCHEDULING' && msg.role === 'assistant' && idx === state.messages.length - 1 && (
                          <div className="mt-3 p-3 border rounded bg-white">
                            <input
                              type="date"
                              value={state.deliveryDate}
                              min={new Date().toISOString().split('T')[0]}
                              onChange={e => {
                                const selectedDate = e.target.value
                                const today = new Date().toISOString().split('T')[0]

                                // 과거 날짜 검증
                                if (selectedDate && selectedDate < today) {
                                  alert('과거 날짜는 선택할 수 없습니다. 오늘 이후의 날짜를 선택해주세요.')
                                  return
                                }

                                dispatch({ type: 'SET_SCHEDULE', payload: { date: selectedDate, time: state.deliveryTimeSlot } })
                              }}
                              className="border p-1 rounded w-full mb-2"
                            />
                            <select value={state.deliveryTimeSlot} onChange={e => dispatch({ type: 'SET_SCHEDULE', payload: { date: state.deliveryDate, time: e.target.value } })} className="border p-1 rounded w-full mb-2">
                              {SCHEDULE_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <div className="flex gap-2">
                              <button onClick={() => handleScheduleConfirm(false)} className="bg-gray-300 text-gray-800 px-4 py-2 rounded flex-1">날짜/시간 확인</button>
                              <button onClick={() => handleScheduleConfirm(true)} className="bg-amber-600 text-white px-4 py-2 rounded flex-1">결제 페이지로 이동</button>
                            </div>
                          </div>
                        )}

                        {/* CHECKOUT_READY 상태일 때 주문 완료 메시지와 결제 버튼만 표시 */}
                        {state.orderState === 'CHECKOUT_READY' && msg.role === 'assistant' && idx === state.messages.length - 1 && (
                          <div className="mt-3 p-4 border-2 border-amber-500 rounded-lg bg-amber-50">
                            <div className="mb-4">
                              <h3 className="text-xl font-bold text-amber-900 mb-3 flex items-center gap-2">
                                <span className="text-2xl">✅</span>
                                주문이 완료되었습니다!
                              </h3>
                              <p className="text-sm text-amber-800 mb-3">주문 내용을 확인하시고 결제를 진행해주세요.</p>
                              <div className="bg-white p-3 rounded border border-amber-200">
                                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{msg.content}</pre>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleScheduleConfirm(true)}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg flex-1 transition-colors shadow-md hover:shadow-lg"
                              >
                                💳 결제 페이지로 이동
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* MENU_RECOMMENDATION 상태일 때만 메시지 목록 아래에 메뉴 선택 UI 표시 */}
                  {state.orderState === 'MENU_RECOMMENDATION' && state.allMenuItems.length > 0 && state.recommendedMenus.length > 0 && (
                    <div className="mt-4 p-4 bg-stone-50 rounded-2xl border-2 border-amber-200">
                      <p className="text-sm text-stone-600 mb-3 font-semibold">메뉴를 선택해주세요:</p>
                      <div className="space-y-2">
                        {state.allMenuItems.map(menu => {
                          const menuCode = (menu.code || '').toLowerCase()
                          const menuName = menu.name || ''
                          // 추천된 메뉴인지 확인 (code 또는 name으로 매칭)
                          const isRecommended = state.recommendedMenus.some((rec: any) => {
                            if (!rec) return false

                            // rec이 객체인 경우
                            if (typeof rec === 'object' && rec !== null) {
                              const recCode = (rec.code || '').toLowerCase()
                              const recName = (rec.name || '').toLowerCase()

                              // code 매칭 (정확히 일치)
                              if (recCode && recCode === menuCode) {
                                return true
                              }

                              // name 매칭 (정확히 일치)
                              if (recName && recName === menuName.toLowerCase()) {
                                return true
                              }
                            }

                            // rec이 문자열인 경우
                            if (typeof rec === 'string') {
                              const recStr = rec.toLowerCase()
                              if (recStr === menuCode || recStr === menuName.toLowerCase()) {
                                return true
                              }
                            }

                            return false
                          })
                          return (
                            <button
                              key={menuCode || menuName}
                              onClick={() => {
                                dispatch({ type: 'CLEAR_MENU_UI' })
                                handleSendMessage(`${menuName} 선택`)
                              }}
                              className={`block w-full text-left p-3 border-2 rounded-lg transition-all ${isRecommended
                                ? 'border-amber-500 bg-amber-50 font-semibold shadow-md'
                                : 'border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{menuName}</span>
                                {isRecommended && (
                                  <span className="text-amber-600 text-sm">⭐ 추천</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* STYLE_RECOMMENDATION 상태일 때 메시지 목록 아래에 스타일 선택 UI 표시 */}
                  {state.orderState === 'STYLE_RECOMMENDATION' && state.styleOptionsVisible && (
                    <div className="mt-4 p-4 bg-stone-50 rounded-2xl border-2 border-amber-200">
                      <p className="text-sm text-stone-600 mb-3 font-semibold">스타일을 선택해주세요:</p>
                      <div className="space-y-2">
                        {[
                          { code: 1, name: 'Simple', label: '심플', styleCode: 'simple' },
                          { code: 2, name: 'Grand', label: '그랜드', styleCode: 'grand' },
                          { code: 3, name: 'Deluxe', label: '디럭스', styleCode: 'deluxe' }
                        ].map(style => {
                          const isRecommended = Number(state.recommendedStyle) === Number(style.code)
                          const isSelected = state.styleCode === style.styleCode
                          const isHighlighted = isRecommended || isSelected
                          return (
                            <button
                              key={style.name}
                              onClick={() => {
                                dispatch({ type: 'CLEAR_STYLE_UI' })
                                handleSendMessage(`${style.label} 스타일`)
                              }}
                              className={`block w-full text-left p-3 border-2 rounded-lg transition-all ${isHighlighted
                                ? 'border-amber-500 bg-amber-50 font-semibold shadow-md'
                                : 'border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{style.label}</span>
                                {isRecommended && (
                                  <span className="text-amber-600 text-sm">⭐ 추천</span>
                                )}
                                {isSelected && !isRecommended && (
                                  <span className="text-amber-600 text-sm">✓ 선택됨</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <input
                      value={state.transcript}
                      onChange={e => dispatch({ type: 'SET_TRANSCRIPT', payload: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 border p-2 rounded"
                      placeholder="메시지 입력..."
                      disabled={state.isProcessing}
                    />
                    <button onClick={() => handleSendMessage()} disabled={state.isProcessing} className="bg-amber-600 text-white px-4 py-2 rounded">전송</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <div className="hidden lg:block"><Footer /></div>
    </div>
  )
}
