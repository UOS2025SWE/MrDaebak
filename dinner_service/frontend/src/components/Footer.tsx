import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="w-full bg-stone-800 text-white py-12 mt-12 relative z-10">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image 
              src="/images/mister-daebak-logo.jpg" 
              alt="미스터 대박 로고" 
              width={40} 
              height={40}
              className="rounded-full object-cover"
              unoptimized
            />
            <span className="font-semibold text-lg">미스터 대박</span>
          </div>
          <div className="text-center md:text-right">
            <p className="text-stone-300 text-sm">© Team JKL</p>
            <p className="text-stone-300 text-sm mt-1">미스터 대박 프리미엄 디너 서비스</p>
          </div>
        </div>
      </div>
    </footer>
  )
}