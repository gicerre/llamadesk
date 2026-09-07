import { motion } from 'framer-motion';
import { SQUIRCLE_512 } from '@/assets/squircle-path';
import { cn } from '@/lib/cn';

interface LogoProps {
  size?: number;
  className?: string;
  /** Anima l'ingresso del glifo (usato nella schermata di benvenuto). */
  animated?: boolean;
}

/** Logo LlamaDesk: uno squircle di vetro e un hub di collegamenti. */
export function Logo({ size = 48, className, animated = false }: LogoProps) {
  const glyph = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { pathLength: 1, opacity: 0.95 },
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="LlamaDesk"
    >
      <defs>
        <linearGradient
          id="ld-surface"
          x1="64"
          y1="32"
          x2="448"
          y2="480"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7C7CF0" />
          <stop offset="0.45" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient
          id="ld-sheen"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(150 110) rotate(52) scale(330 300)"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="ld-rim"
          x1="256"
          y1="0"
          x2="256"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.18" />
        </linearGradient>
        <clipPath id="ld-clip">
          <path d={SQUIRCLE_512} />
        </clipPath>
      </defs>

      <path d={SQUIRCLE_512} fill="url(#ld-surface)" />
      <g clipPath="url(#ld-clip)">
        <ellipse cx="150" cy="110" rx="300" ry="270" fill="url(#ld-sheen)" />
      </g>
      <path d={SQUIRCLE_512} fill="none" stroke="url(#ld-rim)" strokeWidth="3" />

      <g stroke="#ffffff" strokeWidth="26" strokeLinecap="round" opacity="0.95">
        {['M256 272 L150 168', 'M256 272 L362 168', 'M256 272 L256 388'].map((d, index) => (
          <motion.path
            key={d}
            d={d}
            variants={animated ? glyph : undefined}
            initial={animated ? 'hidden' : false}
            animate={animated ? 'visible' : undefined}
            transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: [0.32, 0.72, 0, 1] }}
          />
        ))}
      </g>
      <g fill="#ffffff">
        <circle cx="256" cy="272" r="42" />
        <circle cx="150" cy="168" r="27" />
        <circle cx="362" cy="168" r="27" />
        <circle cx="256" cy="388" r="27" />
      </g>
    </svg>
  );
}
