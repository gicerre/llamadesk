import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { router } from './app/router';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { BootstrapGate } from './app/providers/BootstrapGate';
import { ShortcutBridge } from './app/providers/ShortcutBridge';
import { Wallpaper } from './app/providers/Wallpaper';
import { DangerZoneHost } from './features/danger-zone/DangerZoneHost';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <Wallpaper />
        <ShortcutBridge />
        <BootstrapGate>
          <RouterProvider router={router} />
        </BootstrapGate>
        {/* I modali di conferma vivono qui: non appartengono a nessuna pagina. */}
        <DangerZoneHost />
      </ThemeProvider>
    </MotionConfig>
  );
}
