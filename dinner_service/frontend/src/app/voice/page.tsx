'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import type { ChatMessage } from '@/types/voice'

// 음성 인식 지원 여부 체크
const isSpeechRecognitionSupported = () => {
  if (typeof window === 'undefined') return false
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

const ingredientDisplayNames: Record<string, string> = {
  wine: '와인',
  champagne_bottle: '샴페인',
  baguette: '바게트빵',
  coffee_pot: '커피 포트',
  coffee: '커피',
  premium_steak: '프리미엄 스테이크',
  fresh_salad: '신선한 샐러드',
  scrambled_eggs: '스크램블 에그',
  bacon: '베이컨',
  bread: '빵'
}

export default function VoicePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)

  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // 컴포넌트 마운트 시 음성 인식 초기화 및 채팅 세션 시작
  useEffect(() => {
    // 음성 인식 지원 체크
    setIsSpeechSupported(isSpeechRecognitionSupported())
    
    if (isSpeechRecognitionSupported()) {
      initializeSpeechRecognition()
    }
    
    // 채팅 세션 초기화
    initChatSession()
    
    return () => {
      // 컴포넌트 언마운트 시 음성 인식 중지
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])
  
  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // 음성 인식 초기화
  const initializeSpeechRecognition = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      
      // 음성 인식 설정
      recognition.continuous = false // 한 번에 하나의 인식
      recognition.interimResults = true // 중간 결과 표시
      recognition.lang = 'ko-KR' // 한국어
      
      // 음성 인식 결과 처리
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('')
        
        setTranscript(transcript)
        
        // 최종 결과일 때 자동으로 서버로 전송
        if (event.results[0].isFinal) {
          handleSendMessage(transcript)
        }
      }
      
      // 에러 처리
      recognition.onerror = (event: any) => {
        console.error('음성 인식 오류:', event.error)
        setIsListening(false)
        
        // 에러 메시지 표시
        if (event.error === 'no-speech') {
          alert('음성이 감지되지 않았습니다. 다시 시도해주세요.')
        } else if (event.error === 'not-allowed') {
          alert('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
        } else {
          alert(`음성 인식 오류: ${event.error}`)
        }
      }
      
      // 음성 인식 종료 처리
      recognition.onend = () => {
        setIsListening(false)
      }
      
      recognitionRef.current = recognition
    }
  }
  
  // 채팅 세션 초기화
  const initChatSession = async () => {
    try {
      const response = await fetch('/api/voice/chat/init', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        setSessionId(data.session_id)
        
        // 환영 메시지 추가
        setMessages([{
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString()
        }])
      }
    } catch (error) {
      console.error('채팅 세션 초기화 실패:', error)
    }
  }
  
  // 음성 인식 시작/중지 토글
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('음성 인식이 지원되지 않는 브라우저입니다.')
      return
    }
    
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
      setTranscript('')
    }
  }
  
  // 메시지 전송 처리
  const handleSendMessage = async (text: string = transcript) => {
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

        // AI 응답 메시지 추가 (alternatives 포함)
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          menuInfo: data.recommended_menu,
          alternatives: data.alternatives || []
        }
        setMessages(prev => [...prev, assistantMessage])
        
        // TTS 기능 제거됨 - 음성 출력하지 않음
      } else {
        const errorData = await response.json()
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
  }
  
  // 메뉴 주문 - checkout 페이지로 직접 이동
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

      // 커스터마이징 옵션 처리 - checkout 형식으로 변환
      const customization = menuInfo.customization || {}
      const params = new URLSearchParams({
        menu: menu.code,
        style: styleInfo.code,
        quantity: '1'
      })

      // 커스터마이징 정보가 있으면 checkout 형식으로 변환하여 추가
      if (
        customization.extra_wine ||
        customization.extra_champagne ||
        (customization.side_dishes && customization.side_dishes.length > 0) ||
        (customization.overrides && Object.keys(customization.overrides).length > 0)
      ) {
        const checkoutCustomizations: any = {}

        // 메뉴별 기본 재료 구성 (checkout 페이지와 동일)
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

        // extra_wine 처리: 기본 수량 + 추가 수량
        if (customization.extra_wine && customization.extra_wine > 0) {
          const baseWineQty = baseQty['wine'] || 0
          checkoutCustomizations['wine'] = baseWineQty + customization.extra_wine
        }

        if (customization.extra_champagne && customization.extra_champagne > 0 && checkoutCustomizations['champagne_bottle'] === undefined) {
          const baseChampagneQty = baseQty['champagne_bottle'] || 0
          checkoutCustomizations['champagne_bottle'] = baseChampagneQty + customization.extra_champagne
        }

        // side_dishes 처리: 각 사이드 디시를 1개씩 추가
        if (customization.side_dishes && customization.side_dishes.length > 0) {
          customization.side_dishes.forEach((dish: string) => {
            // 한글 이름을 영어 키로 변환
            const dishKey = dish === '샐러드' ? 'fresh_salad' : dish
            checkoutCustomizations[dishKey] = 1
          })
        }

        if (customization.overrides) {
          Object.entries(customization.overrides).forEach(([key, qty]) => {
            const parsedQty = typeof qty === 'number' ? qty : Number(qty)
            if (!Number.isNaN(parsedQty) && parsedQty > 0) {
              checkoutCustomizations[key] = parsedQty
            }
          })
        }

        if (Object.keys(checkoutCustomizations).length > 0) {
          params.append('customizations', encodeURIComponent(JSON.stringify(checkoutCustomizations)))
        }
      }

      // checkout 페이지로 바로 이동
      router.push(`/checkout?${params.toString()}`)
    } catch (error) {
      console.error('메뉴 정보 조회 실패:', error)
      alert('메뉴 정보를 가져오는 중 오류가 발생했습니다.')
    }
  }
  
  // Enter 키로 메시지 전송
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col">
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
          
          <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
            {/* 왼쪽: 음성 컨트롤 */}
            <div className="lg:w-1/3">
              <div className="bg-white rounded-2xl shadow-xl p-8 h-full flex flex-col">
                <h2 className="text-2xl font-bold text-stone-900 mb-6">음성 인식</h2>
                
                {/* 마이크 버튼 */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <button
                    onClick={toggleListening}
                    disabled={!isSpeechSupported || isProcessing}
                    className={`
                      w-32 h-32 rounded-full flex items-center justify-center text-6xl
                      transition-all transform hover:scale-110 shadow-lg
                      ${isListening 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse text-white' 
                        : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white'
                      }
                      ${!isSpeechSupported || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
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
                        ⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다.
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
            <div className="lg:w-2/3">
              <div className="bg-white rounded-2xl shadow-xl h-full flex flex-col">
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

                        {/* 추천 메뉴 카드 */}
                        {message.menuInfo && (
                          <div className="mt-3 space-y-2">
                            {/* 메인 추천 메뉴 */}
                            <div className="p-3 bg-white/20 backdrop-blur rounded-lg border-2 border-white/40">
                              <p className="font-semibold mb-1">
                                📍 {message.alternatives && message.alternatives.length > 0 ? '옵션 1' : '추천 메뉴'}
                                {message.menuInfo.customization && (message.menuInfo.customization.extra_wine || message.menuInfo.customization.side_dishes?.length) && (
                                  <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded">커스터마이징</span>
                                )}
                              </p>
                              <p className="text-sm">{message.menuInfo.name} ({message.menuInfo.style})</p>
                              {message.menuInfo.customization && (() => {
                                const customization = message.menuInfo?.customization
                                if (!customization) return null

                                const overrideEntries = customization.overrides
                                  ? Object.entries(customization.overrides).filter(([, qty]) => typeof qty === 'number' && qty > 0)
                                  : []

                                if (
                                  !(customization.extra_wine && customization.extra_wine > 0) &&
                                  !(customization.extra_champagne && customization.extra_champagne > 0) &&
                                  !(customization.side_dishes && customization.side_dishes.length > 0) &&
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
                                    {customization.side_dishes && customization.side_dishes.length > 0 && (
                                      <p>🥗 추가: {customization.side_dishes.join(', ')}</p>
                                    )}
                                    {overrideEntries.length > 0 && (
                                      <p>
                                        🧺 수량 조정: {overrideEntries.map(([key, qty]) => formatOverride(key, qty)).join(', ')}
                                      </p>
                                    )}
                                    {customization.special_requests && (
                                      <p>✨ {customization.special_requests}</p>
                                    )}
                                  </div>
                                )
                              })()}
                              <button
                                onClick={() => handleOrderMenu(message.menuInfo)}
                                className="mt-2 px-4 py-2 bg-white text-amber-600 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors w-full"
                              >
                                주문하기 →
                              </button>
                            </div>

                            {/* 대안 메뉴들 */}
                            {message.alternatives && message.alternatives.map((alt, idx) => (
                              <div key={idx} className="p-3 bg-white/10 backdrop-blur rounded-lg border border-white/20">
                                <p className="font-semibold mb-1">
                                  📌 옵션 {idx + 2}
                                  {!alt.customization || (!alt.customization.extra_wine && !alt.customization.side_dishes?.length) ? (
                                    <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">기본</span>
                                  ) : null}
                                </p>
                                <p className="text-sm">{alt.name} ({alt.style})</p>
                                {alt.reason && <p className="text-xs mt-1 opacity-75">{alt.reason}</p>}
                                {alt.customization && (() => {
                                  const customization = alt.customization
                                  const overrideEntries = customization.overrides
                                    ? Object.entries(customization.overrides).filter(([, qty]) => typeof qty === 'number' && qty > 0)
                                    : []

                                  if (
                                    !(customization.extra_wine && customization.extra_wine > 0) &&
                                    !(customization.extra_champagne && customization.extra_champagne > 0) &&
                                    !(customization.side_dishes && customization.side_dishes.length > 0) &&
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
                                      {customization.side_dishes && customization.side_dishes.length > 0 && (
                                        <p>🥗 추가: {customization.side_dishes.join(', ')}</p>
                                      )}
                                      {overrideEntries.length > 0 && (
                                        <p>
                                          🧺 수량 조정: {overrideEntries.map(([key, qty]) => formatOverride(key, qty)).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  )
                                })()}
                                <button
                                  onClick={() => handleOrderMenu(alt)}
                                  className="mt-2 px-4 py-2 bg-white/80 text-stone-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors w-full"
                                >
                                  주문하기 →
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
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
                <div className="p-4 border-t">
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
      
      <Footer />
    </div>
  )
}