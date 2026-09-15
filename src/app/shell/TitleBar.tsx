import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, PanelLeft, Search } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { LockButton } from '@/features/protection/parts';
import { usePalette } from '@/stores/palette';
import { useUi } from '@/stores/ui';
import { SIDEBAR_WIDTH } from './layout';
import { PathBar } from './PathBar';
import { WindowControls } from './WindowControls';
import { useHistoryAvailability } from './useHistoryAvailability';

/**
 * Barra del titolo (docs/REDESIGN.md § 6): sopra la sidebar il simbolo e il
 * pulsante che la riduce; poi avanti/indietro, il percorso con i fratelli, la
 * ricerca e i controlli della finestra. Il resto e' area di trascinamento:
 * doppio clic ingrandisce, come in ogni finestra di Windows.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const collapsed = useUi((state) => state.sidebarCollapsed);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const history = useHistoryAvailability();

  return (
    <header data-tauri-drag-region className="flex h-10 shrink-0 items-center">
      <div
        data-tauri-drag-region
        className="flex h-full shrink-0 items-center gap-2 pr-2 pl-3.5 transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded }}
      >
        {!collapsed && (
          <span data-brand-anchor className="pointer-events-none flex">
            <BrandMark size={18} decorative />
          </span>
        )}
        <Tip
          label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          shortcut="Ctrl+B"
        >
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={toggleSidebar}
            aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
            aria-expanded={!collapsed}
            className={cn(!collapsed && 'ml-auto')}
          >
            <PanelLeft />
          </Button>
        </Tip>
      </div>

      <div className="flex items-center gap-0.5 pr-2">
        <Tip label={t('shell.back')} shortcut="Alt+←">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!history.back}
            onClick={() => navigate(-1)}
            aria-label={t('shell.back')}
          >
            <ArrowLeft />
          </Button>
        </Tip>
        <Tip label={t('shell.forward')} shortcut="Alt+→">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!history.forward}
            onClick={() => navigate(1)}
            aria-label={t('shell.forward')}
          >
            <ArrowRight />
          </Button>
        </Tip>
      </div>

      <PathBar />

      <div data-tauri-drag-region className="h-full min-w-6 flex-1" />

      <LockButton />
      <SearchTrigger />
      <WindowControls />
    </header>
  );
}

/** Ingresso della Command Palette: sembra un campo, apre la palette. */
function SearchTrigger() {
  const { t } = useTranslation();
  const show = usePalette((state) => state.show);
  return (
    <span className="mr-2">
      <button
        type="button"
        onClick={() => show()}
        aria-label={t('shell.search')}
        aria-keyshortcuts="Control+K"
        className="bg-hover text-ink-3 hover:text-ink-2 hover:bg-press hidden h-7 w-60 items-center gap-2 rounded-sm px-2.5 text-sm transition-colors duration-120 md:flex lg:w-72"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="flex-1 text-left">{t('shell.search')}</span>
        <Kbd>Ctrl+K</Kbd>
      </button>
      <Tip label={t('shell.search')} shortcut="Ctrl+K">
        <button
          type="button"
          onClick={() => show()}
          aria-label={t('shell.search')}
          className="text-ink-2 hover:bg-hover flex size-7 items-center justify-center rounded-sm md:hidden"
        >
          <Search className="size-4" aria-hidden />
        </button>
      </Tip>
    </span>
  );
}
