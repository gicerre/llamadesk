import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/feedback';
import { ThemeController } from './ThemeController';
import { WindowBridge } from './WindowBridge';

/** Cio' che vive sopra ogni pagina: tema, ponte con il sistema, toast. */
export function RootLayout() {
  return (
    <>
      <ThemeController />
      <WindowBridge />
      <Outlet />
      <Toaster />
    </>
  );
}
