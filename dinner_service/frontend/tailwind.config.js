/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Apple HIG 기반 색상 팔레트
      colors: {
        primary: {
          DEFAULT: '#007AFF',
          hover: '#0051D0',
        },
        secondary: '#5856D6',
        success: '#30D158',
        warning: '#FF9F0A',
        danger: '#FF3B30',
        
        // Neutral 색상
        gray: {
          1: '#F2F2F7',
          2: '#E5E5EA',
          3: '#C7C7CC',
          4: '#8E8E93',
          5: '#636366',
          6: '#48484A',
        }
      },
      
      // 폰트 패밀리
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      
      // 폰트 굵기
      fontWeight: {
        light: '300',
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      
      // 간격
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
      },
      
      // 보더 반지름
      borderRadius: {
        'sm': '6px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      
      // 그림자
      boxShadow: {
        'sm': '0 2px 4px rgba(0, 0, 0, 0.06)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.08)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
      
      // 백드롭 필터
      backdropBlur: {
        'apple': '20px',
      }
    },
  },
  plugins: [],
}