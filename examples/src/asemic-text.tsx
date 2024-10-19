import { Vector2 } from 'three'
import Asemic from '../../src/asemic/Asemic'
import useText from '../../src/asemic/StrokeTExt'
import { Brush } from '../../src/asemic/Brush'

export default function AsemicText() {
  const text = useText('this')
  return (
    <Asemic>
      <Brush
        keyframes={[{ curves: text, rotation: 0 }]}
        spacing={10}
        jitter={{
          rotation: 0.5 * Math.PI * 2,
          position: new Vector2(15, 0)
        }}
        size={new Vector2(5, 5)}
      />
    </Asemic>
  )
}
