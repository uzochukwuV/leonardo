import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/components/wallet-provider'
import { OrderBookProvider } from '@/contexts/order-book-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pteaker - Private Tick-Based Order Book',
  description: 'Zero-knowledge trading on Aleo blockchain - private, secure, compliant',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <WalletProvider>
          <OrderBookProvider>
            {children}
          </OrderBookProvider>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  )
}
