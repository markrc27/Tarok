import React, { useRef } from 'react'

interface Section {
  id: string
  title: string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    content: (
      <>
        <p>Slovenian Tarok is a 4-player trick-taking card game. Players bid to become the <strong>declarer</strong>, who then tries to win enough card points — together with a partner in most contracts — to beat the other side.</p>
        <p>Play proceeds <strong>anticlockwise</strong>. The player to the right of the dealer is called <strong>forehand</strong> and leads the first trick.</p>
        <p>For the full authoritative rules, see: <a href="https://www.pagat.com/tarot/sltarok.html" target="_blank" rel="noreferrer" style={{ color: '#7ab8e8' }}>www.pagat.com/tarot/sltarok.html</a></p>
      </>
    ),
  },
  {
    id: 'cards',
    title: 'Cards',
    content: (
      <>
        <p>The Tarok pack has <strong>54 cards</strong>: 22 trumps (taroki) plus four suits of 8 cards each.</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Trumps (highest → lowest)</h4>
        <p><strong>Škis</strong> (highest) › <strong>Mond</strong> (XXI) › XX › XIX › … › II › <strong>Pagat</strong> (I, lowest trump)</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Suit cards (highest → lowest)</h4>
        <p>Red suits (hearts, diamonds): K › Q › Kn › J › 4 › 3 › 2 › 1</p>
        <p>Black suits (clubs, spades): K › Q › Kn › J › 10 › 9 › 8 › 7</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Card point values</h4>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr style={{ color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Cards</th>
              <th style={{ textAlign: 'right', padding: '3px 8px' }}>Points each</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Škis, Mond, Pagat; all Kings', '5'],
              ['Queens', '4'],
              ['Knights (Cavaliers)', '3'],
              ['Jacks', '2'],
              ['All other cards', '1'],
            ].map(([label, pts]) => (
              <tr key={label} style={{ borderTop: '1px solid #333' }}>
                <td style={{ padding: '3px 8px' }}>{label}</td>
                <td style={{ padding: '3px 8px', textAlign: 'right' }}>{pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: '#888', fontSize: 12, marginTop: 6 }}>The total card points in the pack is 70. Card points are counted in groups of three (two cards + one "empty" = value of the two minus 1).</p>
      </>
    ),
  },
  {
    id: 'contracts',
    title: 'Contracts',
    content: (
      <>
        <p>The contract determines how many talon cards the declarer may pick up, whether they have a partner, and the base point value. Contracts are listed from lowest to highest bid.</p>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Contract</th>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Score</th>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Klop (sometimes called klopecki)', 'points taken, or 70', 'Avoid taking points; all players play individually; no bonuses; available to forehand only'],
              ['Three (tri or trojka)', '10 + difference', 'Call a king; take 3 cards from the talon; win at least 36 card points; available to forehand only'],
              ['Two (dva or dve or dvojka)', '20 + difference', 'Call a king; take 2 cards from the talon; win at least 36 card points'],
              ['One (ena or enka or enica)', '30 + difference', 'Call a king; take 1 card from the talon; win at least 36 card points'],
              ['Solo Three (solo tri)', '40 + difference', 'Play alone; take 3 cards from the talon; win at least 36 card points'],
              ['Solo Two (solo dva)', '50 + difference', 'Play alone; take 2 cards from the talon; win at least 36 card points'],
              ['Solo One (solo ena)', '60 + difference', 'Play alone; take 1 card from the talon; win at least 36 card points'],
              ['Beggar (berač)', '70', 'Play alone; take no tricks; no bonuses'],
              ['Solo Without (solo brez or brez talona)', '80', 'Play alone; no cards from the talon; win at least 36 card points; no bonuses'],
              ['Open Beggar (odprti berač)', '90', "Play alone; take no tricks; declarer's cards are exposed face-up; no bonuses"],
              ['Colour Valat Without (barvni valat brez)', '125', 'Play alone; no cards from the talon; taroks are not trumps; win all tricks; no bonuses'],
              ['Valat Without (valat brez)', '500', 'Play alone; no cards from the talon; win all tricks; no bonuses'],
            ] as [string, string, string][]).map(([name, score, desc]) => (
              <tr key={name} style={{ borderTop: '1px solid #2a2a2a' }}>
                <td style={{ padding: '4px 8px', fontWeight: 'bold', color: '#e0e0e0', whiteSpace: 'nowrap' }}>{name}</td>
                <td style={{ padding: '4px 8px', color: '#f0c040', whiteSpace: 'nowrap' }}>{score}</td>
                <td style={{ padding: '4px 8px', color: '#aaa', fontSize: 11 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'bonuses',
    title: 'Bonuses',
    content: (
      <>
        <p>Bonuses can be won unannounced (standard value) or announced before play begins (double value). Opponents may <strong>kontra</strong> an announcement to double it again; the announcing side may <strong>rekontra</strong> (×4), and so on.</p>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Bonus</th>
              <th style={{ textAlign: 'right', padding: '3px 8px' }}>Unannounced</th>
              <th style={{ textAlign: 'right', padding: '3px 8px' }}>Announced</th>
              <th style={{ textAlign: 'left', padding: '3px 8px' }}>Condition</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Trula', '10', '20', 'Declarer side holds Škis, Mond, and Pagat at end of last trick'],
              ['Kings', '10', '20', 'Declarer side captures all four kings'],
              ['King Ultimo', '10', '20', 'Declarer side wins last trick containing the called king'],
              ['Pagat Ultimo', '25', '50', 'Declarer wins the very last trick with the Pagat (I)'],
              ['Valat', '250', '500', 'Declarer side wins every trick'],
            ].map(([name, una, ann, cond]) => (
              <tr key={name} style={{ borderTop: '1px solid #2a2a2a' }}>
                <td style={{ padding: '4px 8px', fontWeight: 'bold', color: '#e0e0e0' }}>{name}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{una}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#f0c040' }}>{ann}</td>
                <td style={{ padding: '4px 8px', color: '#aaa', fontSize: 11 }}>{cond}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>If a bonus is announced but not achieved, the same value is deducted. If it is neither announced nor achieved, there is no score effect.</p>
      </>
    ),
  },
  {
    id: 'deal',
    title: 'Deal',
    content: (
      <>
        <p>The dealer deals <strong>anticlockwise</strong>, starting with forehand (the player to the dealer's right). Each player receives <strong>12 cards</strong>; the remaining <strong>6 cards</strong> form the <strong>talon</strong>, dealt face-down to the centre.</p>
        <p>Cards are dealt in batches: typically 6 to each player and 6 to the talon. The dealer role rotates anticlockwise each round.</p>
        <p>If a player has too few card points (a <strong>missdeal</strong> — no face cards), they may ask for a redeal. House rules vary on the exact threshold.</p>
      </>
    ),
  },
  {
    id: 'bidding',
    title: 'Bidding',
    content: (
      <>
        <p>Bidding proceeds <strong>anticlockwise</strong> starting with forehand. Each player must either <strong>pass</strong> or bid a contract <em>higher</em> than the current highest bid.</p>
        <p><strong>Klop</strong> and <strong>Three</strong> are only available to forehand when all other players have passed and forehand has not yet bid.</p>
        <p>When three players have passed, the highest bidder becomes the declarer. If all four players pass (including forehand declining klop/three), <strong>klop</strong> is played with no declarer.</p>
        <p>The <strong>forehand</strong> has priority: if a non-forehand player bids a contract, forehand may "hold" the same contract to take it over (forehand wins ties).</p>
      </>
    ),
  },
  {
    id: 'calling-king',
    title: 'Calling a King',
    content: (
      <>
        <p>After winning the bid in a contract with a partner (Three, Two, or One), the declarer <strong>calls a king by suit</strong>. The player holding that king becomes the declarer's secret partner.</p>
        <p>The partner's identity is hidden until the called king is played in a trick. Until then, opponents do not know who the partner is.</p>
        <p>If the declarer holds <strong>all four kings</strong> themselves, they may call a queen instead. If the called king is in the talon (discovered during talon exchange), the declarer plays alone.</p>
      </>
    ),
  },
  {
    id: 'announcements',
    title: 'Announcements',
    content: (
      <>
        <p>After the talon exchange (and king call), the declarer's side may <strong>announce</strong> bonuses they intend to achieve. Announced bonuses are worth double but are also lost at double value if failed.</p>
        <p>For each announcement, opponents may bid <strong>kontra</strong> (×2). The announcing side may answer with <strong>rekontra</strong> (×4), then <strong>subkontra</strong> (×8), and <strong>mordkontra</strong> (×16).</p>
        <p>Opponents may also kontra the <strong>game</strong> (the contract itself), not just individual bonuses.</p>
        <p>Announceable bonuses: <em>Trula, Kings, King Ultimo, Pagat Ultimo, Valat</em>.</p>
      </>
    ),
  },
  {
    id: 'talon',
    title: 'Talon Exchange',
    content: (
      <>
        <p>In contracts that use the talon (Three, Two, One, Solo Three, Solo Two, Solo One), the declarer picks up the relevant talon cards.</p>
        <p>The talon is split into groups equal in size to the number of talon cards allowed by the contract. The declarer <strong>chooses one group</strong>, adds those cards to their hand, then <strong>discards</strong> the same number of cards face-down into their capture pile.</p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Discarded trumps <strong>must be declared</strong> publicly.</li>
          <li><strong>Kings cannot be discarded.</strong></li>
          <li>The unchosen talon groups go to the opponents' capture pile.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'play',
    title: 'The Play',
    content: (
      <>
        <p>Tricks are played <strong>anticlockwise</strong>. Forehand leads the first trick; thereafter the winner of each trick leads the next.</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Follow-suit rules</h4>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Players must <strong>follow the led suit</strong> if they have cards of that suit.</li>
          <li>If void in the led suit, players <strong>must play a trump</strong> if they have one.</li>
          <li>If void in both, any card may be played.</li>
          <li>Trumps beat all suit cards. The highest trump played wins any trick containing a trump; otherwise the highest card of the led suit wins.</li>
        </ul>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Special rules</h4>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li><strong>Captured Mond penalty:</strong> If the Mond (XXI) is captured by the Škis, the player who held the Mond loses 20 points.</li>
          <li><strong>Pagat Ultimo:</strong> Winning the last trick with the Pagat scores the pagat-ultimo bonus.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'scoring',
    title: 'Scoring',
    content: (
      <>
        <p>After all 12 tricks are played, card points are counted for the declarer's side. The total of all card points in the pack is <strong>70</strong>.</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Win condition</h4>
        <p>The declarer's side must capture <strong>≥ 35 card points</strong> to win (or in Beggar/Valat, meet their specific objective).</p>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Score formula</h4>
        <p style={{ background: '#1a1a1a', padding: '8px 12px', borderRadius: 4, fontFamily: 'monospace', fontSize: 13 }}>
          score = (base_value + |card_pts − 35|) + bonuses
        </p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>On a <strong>win</strong>: declarers gain this amount; each opponent loses the same.</li>
          <li>On a <strong>loss</strong>: declarers lose this amount; each opponent gains the same.</li>
          <li>The <strong>difference</strong> (card_pts − 35) is added if won, subtracted if lost.</li>
          <li>In a 2-vs-2 game, partner scores separately from declarer.</li>
        </ul>
        <h4 style={{ color: '#ccc', margin: '10px 0 4px' }}>Klop scoring</h4>
        <p>Each player scores individually based on the card points they captured. Specific penalties apply for capturing the most tricks or holding specific cards — see the full rules for details.</p>
      </>
    ),
  },
  {
    id: 'radli',
    title: 'Radli',
    content: (
      <>
        <p>All four players receive a new <strong>radlc</strong> (radli token) whenever:</p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>A <em>klop</em> is played</li>
          <li>A contract of <em>Beggar</em> or higher is played</li>
          <li>Any kind of <em>valat</em> is won or lost</li>
        </ul>
        <p>When scoring, if the declarer holds outstanding radli, their score (and the partner's, if any) is <strong>doubled</strong> and one radlc is annulled — but <em>only on a win</em>. On a loss the score is still doubled but the radlc is not cancelled.</p>
        <p>Uncancelled radli at the end of the session cost <strong>100 points each</strong>.</p>
      </>
    ),
  },
  {
    id: 'variations',
    title: 'Variations',
    content: (
      <>
        <p>Many local variations of Slovenian Tarok exist. Common differences include:</p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li><strong>Klop scoring:</strong> Some groups score klop differently — e.g. the player with the most card points loses a fixed amount rather than proportionally.</li>
          <li><strong>King calling:</strong> Some groups allow calling a jack if holding all kings and queens.</li>
          <li><strong>Pagat/King Ultimo:</strong> Alternative rules about when ultimo applies or is lost.</li>
          <li><strong>Money games:</strong> Many groups play for stakes, converting points to currency at an agreed rate.</li>
          <li><strong>3- and 5-player variants:</strong> Modified contracts and rules for different player counts.</li>
        </ul>
        <p>For the complete official variations, visit the full rules page.</p>
      </>
    ),
  },
]

interface Props {
  onClose: () => void
}

export default function HelpDialog({ onClose }: Props) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 560, maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0 }}>

        {/* Fixed header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #333', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>Rules</h2>
            <a
              href="https://www.pagat.com/tarot/sltarok.html"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: '#7ab8e8' }}
            >
              Full rules at pagat.com ↗
            </a>
          </div>

          {/* Table of contents */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 10 }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  background: 'none', border: 'none', color: '#7ab8e8',
                  cursor: 'pointer', fontSize: 12, padding: '2px 0',
                  textDecoration: 'underline',
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', padding: '0 20px 20px', flex: 1 }}>
          {SECTIONS.map((s, i) => (
            <div
              key={s.id}
              ref={el => { sectionRefs.current[s.id] = el }}
              style={{ paddingTop: 20, borderTop: i > 0 ? '1px solid #2a2a2a' : 'none', marginTop: i > 0 ? 4 : 0 }}
            >
              <h3 style={{ color: '#f0f0f0', margin: '0 0 10px' }}>{s.title}</h3>
              <div style={{ color: '#ccc', fontSize: 13, lineHeight: 1.7 }}>
                {s.content}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid #333', flexShrink: 0 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
