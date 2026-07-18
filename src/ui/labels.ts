import type { Contract, BonusName } from '../engine/types'

export const BONUS_LABEL: Record<BonusName, string> = {
  trula: 'Trula', kings: 'Kings', 'king-ultimo': 'King Ultimo',
  'pagat-ultimo': 'Pagat Ultimo', valat: 'Valat',
}

export const SUIT_SYM: Record<string, string> = {
  clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦',
}

export const CONTRACT_LABEL: Record<Contract, string> = {
  'klop':                'Klop',
  'three':               'Three',
  'two':                 'Two',
  'one':                 'One',
  'solo-three':          'Solo Three',
  'solo-two':            'Solo Two',
  'solo-one':            'Solo One',
  'beggar':              'Beggar',
  'solo-without':        'Solo Without',
  'open-beggar':         'Open Beggar',
  'color-valat-without': 'Color Valat Without',
  'valat-without':       'Valat Without',
}

export const CONTRACT_DESC: Record<Contract, string> = {
  'klop':
    'No declarer — everyone plays for themselves. Avoid taking card points. Score: each player loses the card points they took (rounded to 5). Exception: take zero tricks and earn +70; take more than 35 points and lose −70 instead.',
  'three':
    'Call a King suit — whoever holds that King becomes your secret partner. The talon opens as two groups of 3; pick one, add it to your hand, discard the same number. Your side needs 36+ card points to win. Score: 10 + (your points − 35, rounded to 5). More card points = bigger win.',
  'two':
    'Call a King suit for a secret partner. The talon opens as three groups of 2; pick one, discard 2. Win condition: 36+ card points. Score: 20 + (your points − 35, rounded to 5).',
  'one':
    'Call a King suit for a secret partner. The talon opens as six individual cards; pick one, discard 1. Win condition: 36+ card points. Score: 30 + (your points − 35, rounded to 5).',
  'solo-three':
    'Play alone — no partner. The talon opens as two groups of 3; pick one, discard the same number. Win condition: 36+ card points. Score: 40 + (your points − 35, rounded to 5).',
  'solo-two':
    'Play alone. The talon opens as three groups of 2; pick one, discard 2. Win condition: 36+ card points. Score: 50 + (your points − 35, rounded to 5).',
  'solo-one':
    'Play alone. The talon opens as six individual cards; pick one, discard 1. Win condition: 36+ card points. Score: 60 + (your points − 35, rounded to 5).',
  'beggar':
    'Play alone. You must take zero tricks — winning even one trick means you lose. No talon exchange. Score is fixed: win = +70, lose = −70. Card points are irrelevant.',
  'solo-without':
    'Play alone with no talon exchange. Win condition: 36+ card points. Score: 80 + (your points − 35, rounded to 5). Harder than Solo One because you have no talon cards to strengthen your hand.',
  'open-beggar':
    'Like Beggar — take zero tricks or lose — but after the first trick your entire hand is laid face-up for everyone to see. Score is fixed: win = +90, lose = −90.',
  'color-valat-without':
    'Play alone, no talon exchange. Trumps count as a plain suit and cannot beat other suits. You must win every single trick. Score is fixed: win = +125, lose = −125.',
  'valat-without':
    'Play alone, no talon exchange. You must win every single trick — even one trick lost means defeat. Trumps work normally. Score is fixed: win = +500, lose = −500. The hardest contract in the game.',
}
