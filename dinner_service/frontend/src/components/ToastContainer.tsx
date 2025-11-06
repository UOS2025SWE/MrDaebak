'use client';

import React from 'react';
import { useToast, Toast, ToastType } from '@/contexts/ToastContext';

// Toast 타입별 아이콘 및 스타일
const toastStyles: Record<ToastType, {
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  success: {
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    icon: (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
    icon: (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-500',
    icon: (
      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  error: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-500',
    icon: (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const style = toastStyles[toast.type];

  return (
    <div
      className={`
        ${style.bgColor} ${style.borderColor}
        border-l-4 rounded-lg shadow-lg p-4 mb-3
        animate-slide-in-right
        max-w-sm w-full
        transition-all duration-300 ease-in-out
      `}
    >
      <div className="flex items-start gap-3">
        {/* 아이콘 */}
        <div className="flex-shrink-0 mt-0.5">{style.icon}</div>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 mb-1">{toast.title}</p>
          <p className="text-xs text-gray-700">{toast.message}</p>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, hideToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => hideToast(toast.id)} />
      ))}
    </div>
  );
}
