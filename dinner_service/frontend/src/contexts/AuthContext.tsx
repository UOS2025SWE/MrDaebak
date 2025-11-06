'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;  // UUID string from backend
  email: string;
  role: string;
  name: string;
  is_admin?: boolean;
  user_type?: 'CUSTOMER' | 'STAFF' | 'MANAGER';  // 직원/고객 구분용
  position?: 'COOK' | 'RIDER' | 'STAFF';  // 직원 직종 (요리사/배달원)
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isStaff: boolean;
  isManager: boolean;
  isCustomer: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user && !!token;

  // 페이지 로드 시 저장된 토큰 확인
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user_info');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Failed to parse saved user info:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
      }
    }
    setLoading(false);
  }, []);

  // 토큰 검증 함수
  const verifyToken = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.valid;
      }
      return false;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  };

  // 로그인 함수
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.access_token) {
          const newToken = data.access_token;
          const newUser = data.user;
          
          setToken(newToken);
          setUser(newUser);
          
          // localStorage에 저장
          localStorage.setItem('auth_token', newToken);
          localStorage.setItem('user_info', JSON.stringify(newUser));
          
          return true;
        }
      }
      
      const errorData = await response.json();
      console.error('Login failed:', errorData.detail || 'Unknown error');
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 로그아웃 함수
  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
  };

  // 사용자 정보 새로고침
  const refreshUserInfo = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('user_info', JSON.stringify(data.user));
        }
      } else {
        // 토큰이 만료되었거나 유효하지 않은 경우
        logout();
      }
    } catch (error) {
      console.error('Failed to refresh user info:', error);
    }
  };

  // 토큰이 있을 때 주기적으로 검증
  useEffect(() => {
    if (token && user) {
      const interval = setInterval(() => {
        verifyToken(token).then(isValid => {
          if (!isValid) {
            logout();
          }
        });
      }, 5 * 60 * 1000); // 5분마다 검증

      return () => clearInterval(interval);
    }
  }, [token, user]);

  const isStaff = user?.user_type === 'STAFF';
  const isManager = user?.user_type === 'MANAGER';
  const isCustomer = user?.user_type === 'CUSTOMER';

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isStaff,
    isManager,
    isCustomer,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};