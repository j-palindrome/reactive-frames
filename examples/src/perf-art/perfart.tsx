import { useState } from 'react'
import Asemic from '../../../asemic/src/Asemic'
import { useEventListener } from '../../../src/utilities/react'
import { slides } from './slides'
import Brush from '../../../asemic/src/Brush'

export default function PerfArt() {
  const [currentChild, setCurrentChild] = useState(0)
  useEventListener(
    'keydown',
    ev => {
      console.log(ev.key)

      switch (ev.key) {
        case 'ArrowLeft':
          setCurrentChild(currentChild - 1)
          break
        case 'ArrowRight':
          setCurrentChild(currentChild + 1)
          break
      }
    },
    [currentChild]
  )
  return (
    <Asemic>
      {slides[currentChild]?.asemic?.map((c, i) => (
        <Brush key={currentChild + '-' + i} render={c} />
      ))}
    </Asemic>
  )
}
