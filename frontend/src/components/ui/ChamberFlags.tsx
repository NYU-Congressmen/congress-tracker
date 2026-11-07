// The two chamber-passage flags the API tracks independently for every bill.
interface ChamberFlagsProps {
  passedHouse: boolean
  passedSenate: boolean
}

export function ChamberFlags({ passedHouse, passedSenate }: ChamberFlagsProps) {
  return (
    <span className="chamber-flags">
      <span
        className={`chamber-flag${passedHouse ? ' is-passed' : ''}`}
        title={passedHouse ? 'Passed the House' : 'Not yet passed by the House'}
      >
        H<span className="sr-only">{passedHouse ? ', passed' : ', not yet passed'}</span>
      </span>
      <span
        className={`chamber-flag${passedSenate ? ' is-passed' : ''}`}
        title={passedSenate ? 'Passed the Senate' : 'Not yet passed by the Senate'}
      >
        S<span className="sr-only">{passedSenate ? ', passed' : ', not yet passed'}</span>
      </span>
    </span>
  )
}
