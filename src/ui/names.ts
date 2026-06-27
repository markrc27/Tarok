const SLOVENIAN_NAMES = [
  'Janez', 'Marko', 'Luka', 'Andrej', 'Matej',
  'Gregor', 'Miha', 'Nejc', 'Blaž', 'Gašper',
  'Ana', 'Maja', 'Nina', 'Lea', 'Sara',
  'Tina', 'Katja', 'Urška', 'Špela', 'Vesna',
  'Rok', 'Tilen', 'Matic', 'Petra', 'Mojca',
]

export function pickNames(): [string, string, string] {
  const pool = [...SLOVENIAN_NAMES]
  const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
  return [pick(), pick(), pick()]
}
