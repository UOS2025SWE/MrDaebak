'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';

export type WebSocketMessage = {
  type: 'CONNECTED' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_UPDATED' | 'HEARTBEAT' | 'PONG' | 'ERROR';
  data?: any;
  message?: string;
  timestamp: string;
};

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

interface UseWebSocketOptions {
  token: string | null;
  onMessage?: (message: WebSocketMessage) => void;
  showToasts?: boolean; // 자동 Toast 알림 표시 여부
  reconnect?: boolean; // 자동 재연결 여부
  maxReconnectAttempts?: number; // 최대 재연결 시도 횟수
}

export function useWebSocket({
  token,
  onMessage,
  showToasts = true,
  reconnect = true,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions) {
  const { showToast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // 재연결 지연 시간 계산 (Exponential Backoff)
  const getReconnectDelay = useCallback(() => {
    const baseDelay = 1000; // 1초
    const maxDelay = 30000; // 30초
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptsRef.current), maxDelay);
    return delay;
  }, []);

  // Heartbeat 전송
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send('ping');
      } catch (error) {
        console.error('Heartbeat 전송 실패:', error);
      }
    }
  }, []);

  // WebSocket 연결
  const connect = useCallback(() => {
    if (!token) {
      setStatus('disconnected');
      return;
    }

    // 이미 연결 중이거나 연결되어 있으면 중단
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      setStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

      const protocol = typeof window !== 'undefined' ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:') : 'ws:'
      const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000'
      const wsBase = process.env.NEXT_PUBLIC_WS_BASE ?? `${protocol}//${host}`
      const wsUrl = `${wsBase.replace(/\/$/, '')}/api/ws?token=${token}`
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0; // 재연결 카운터 초기화

        // Heartbeat 시작 (30초마다)
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data.trim() : event.data
          if (!raw) {
            return
          }

          const message: WebSocketMessage = typeof raw === 'string' ? JSON.parse(raw) : raw
          setLastMessage(message);

          // 콜백 호출
          if (onMessage) {
            onMessage(message);
          }

          // Toast 알림 자동 표시
          if (showToasts && message.type !== 'HEARTBEAT' && message.type !== 'PONG' && message.type !== 'CONNECTED') {
            let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
            let title = '';

            switch (message.type) {
              case 'ORDER_CREATED':
                toastType = 'info';
                title = '새 주문 접수';
                break;
              case 'ORDER_STATUS_CHANGED':
                toastType = 'success';
                title = '주문 상태 변경';
                break;
              case 'ORDER_UPDATED':
                toastType = 'info';
                title = '주문 정보 업데이트';
                break;
              case 'ERROR':
                toastType = 'error';
                title = '오류';
                break;
            }

            if (title && message.message) {
              showToast({
                type: toastType,
                title,
                message: message.message,
                duration: 5000,
              });
            }
          }
        } catch (error) {
          console.error('WebSocket 메시지 파싱 오류:', error);
        }
      };

      ws.onerror = (error) => {
        let derivedMessage: string | undefined
        let readyState: string | undefined
        let socketUrl: string | undefined

        if (error instanceof Event) {
          const target = error.currentTarget || error.target
          if (target instanceof WebSocket) {
            socketUrl = target.url
            const stateNames: Record<number, string> = {
              [WebSocket.CONNECTING]: 'CONNECTING',
              [WebSocket.OPEN]: 'OPEN',
              [WebSocket.CLOSING]: 'CLOSING',
              [WebSocket.CLOSED]: 'CLOSED',
            }
            readyState = stateNames[target.readyState] ?? String(target.readyState)
            derivedMessage = `연결 오류 (state=${readyState})`
          }
        }

        if (!derivedMessage && typeof error === 'object' && error && 'message' in error) {
          derivedMessage = String((error as { message?: unknown }).message)
        }

        const message = derivedMessage && derivedMessage.trim() ? derivedMessage : '연결 오류가 발생했습니다.'
        console.error('WebSocket 오류 이벤트:', {
          message,
          readyState,
          url: socketUrl,
          raw: error,
        })

        if (showToasts) {
          showToast({
            type: 'error',
            title: 'WebSocket 오류',
            message,
            duration: 4000,
          })
        }
        setStatus('error')
      };

      ws.onclose = (event) => {
        console.warn('WebSocket 연결 종료:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
        setStatus('disconnected')

        // Heartbeat 중지
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // 자동 재연결
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = getReconnectDelay();

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          if (showToasts) {
            showToast({
              type: 'error',
              title: '연결 실패',
              message: '서버와의 연결이 끊어졌습니다. 페이지를 새로고침해주세요.',
              duration: 0,
            });
          }
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket 연결 오류:', error);
      setStatus('error');
    }
  }, [token, onMessage, showToasts, reconnect, maxReconnectAttempts, getReconnectDelay, sendHeartbeat, showToast]);

  // WebSocket 연결 해제
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, []);

  // 메시지 전송
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        wsRef.current.send(messageStr);
        return true;
      } catch (error) {
        console.error('메시지 전송 실패:', error);
        return false;
      }
    }
    return false;
  }, []);

  // 초기 연결 및 정리
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return {
    status,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    isConnected: status === 'connected',
  };
}
