'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

type UserType = 'CUSTOMER' | 'STAFF' | 'MANAGER';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedTypes: UserType[];
}

export default function ProtectedRoute({ children, allowedTypes }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 로딩 중이면 대기
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user && user.user_type && !allowedTypes.includes(user.user_type)) {
      router.push('/unauthorized');
    }
  }, [isAuthenticated, user, allowedTypes, router, loading]);

  // 로딩 중일 때는 아무것도 렌더링하지 않음
  if (loading) {
    return null;
  }

  if (isAuthenticated && user && user.user_type && allowedTypes.includes(user.user_type)) {
    return <>{children}</>;
  }

  return null;
}
