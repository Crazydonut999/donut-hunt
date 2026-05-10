import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DONUT.HUNT - Micro-Cap Token Scanner',
  description: 'Real-time micro-cap token scanner with donut scoring and rug detection',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#030a12' }}>
        {children}
      </body>
    </html>
  )
}
