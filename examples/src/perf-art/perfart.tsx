import { useState } from 'react'
import Asemic from '../../../src/asemic/Asemic'
import { useEventListener } from '../../../src/utilities/react'

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
  return <Asemic>{}</Asemic>
}
