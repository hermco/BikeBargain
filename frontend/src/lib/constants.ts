export const VARIANTS = ['Base', 'Pass', 'Summit', 'Mana Black'] as const

export const COLORS: Record<string, string[]> = {
  Base: ['Kaza Brown'],
  Pass: ['Slate Himalayan Salt', 'Slate Poppy Blue'],
  Summit: ['Hanle Black', 'Kamet White'],
  'Mana Black': ['Mana Black'],
}

export const WHEEL_TYPES = ['standard', 'tubeless'] as const
