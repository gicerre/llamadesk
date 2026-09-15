import { forwardRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/* Menu a tendina. Stessa anatomia del futuro menu contestuale: icona, testo,
   scorciatoia a destra, voci distruttive in fondo e separate. */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export const menuSurface =
  'z-50 min-w-[220px] overflow-hidden rounded-lg bg-raised p-1 text-sm text-ink shadow-2 ' +
  'origin-(--radix-dropdown-menu-content-transform-origin) ' +
  'data-[state=open]:animate-[menu-in_140ms_var(--ease-out)]';

export const MenuContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className, sideOffset = 6, align = 'start', ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={8}
      className={cn(menuSurface, className)}
      {...props}
    />
  </DropdownMenu.Portal>
));
MenuContent.displayName = 'MenuContent';

export const menuItem =
  'relative flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 outline-none select-none ' +
  'data-[highlighted]:bg-hover data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3';

interface MenuItemProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
  icon?: React.ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
  selected?: boolean;
}

export const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  ({ className, icon, shortcut, tone = 'default', selected, children, ...props }, ref) => (
    <DropdownMenu.Item
      ref={ref}
      className={cn(menuItem, tone === 'danger' && 'text-danger [&_svg]:text-danger', className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="text-accent!" aria-hidden />}
      {shortcut && <span className="text-2xs text-ink-3">{shortcut}</span>}
    </DropdownMenu.Item>
  ),
);
MenuItem.displayName = 'MenuItem';

export const MenuSeparator = () => <DropdownMenu.Separator className="bg-line mx-1 my-1 h-px" />;

export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DropdownMenu.Label className="text-2xs text-ink-3 px-2 pt-2 pb-1 font-semibold tracking-[0.06em] uppercase">
    {children}
  </DropdownMenu.Label>
);
