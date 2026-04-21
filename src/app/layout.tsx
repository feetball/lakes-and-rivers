import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "DK's Texas Lake And River Flood Overview",
  description: 'Real-time water levels and flood monitoring for Texas lakes and rivers',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  )
}
