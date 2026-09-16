import { createElement } from 'react';
import { cn } from '@/lib/cn';
import { ICON_LIBRARY } from '@/lib/icons';
import { BRAND_COLOR, initials } from '@/lib/identity';
import type { Profile } from '@/types/generated/Profile';

/* Avatar di un profilo: una tessera del suo colore con l'icona scelta, o le
   iniziali del nome. Stessa forma delle tessere di workspace e progetti. */

const SIZE = {
  xs: 'size-5 rounded-[5px] text-[9px]',
  sm: 'size-6 rounded-md text-[10px]',
  md: 'size-9 rounded-[9px] text-sm',
  lg: 'size-16 rounded-2xl text-xl',
} as const;

const GLYPH = { xs: 'size-3', sm: 'size-3.5', md: 'size-5', lg: 'size-8' } as const;

export function ProfileAvatar({
  profile,
  size = 'sm',
  className,
}: {
  profile: Pick<Profile, 'name' | 'colorMain' | 'avatarIcon'>;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const icon = profile.avatarIcon?.startsWith('lucide:')
    ? ICON_LIBRARY[profile.avatarIcon.slice('lucide:'.length)]
    : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        'font-display dark:text-sunken flex shrink-0 items-center justify-center font-bold tracking-tight text-white',
        SIZE[size],
        className,
      )}
      style={{ background: profile.colorMain ?? BRAND_COLOR }}
    >
      {icon
        ? createElement(icon, { className: cn(GLYPH[size], 'text-white dark:text-sunken') })
        : initials(profile.name)}
    </span>
  );
}
