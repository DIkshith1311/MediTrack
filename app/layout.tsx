import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'MediTrack | Pharmacy workspace',description:'Smart pharmacy inventory, expiry tracking and transactional billing.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
