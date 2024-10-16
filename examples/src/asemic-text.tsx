import { Vector2 } from 'three'
import Asemic from '../../asemic/asemic'
import useText from '../../asemic/StrokeTExt'
import { Brush } from '../../asemic/Brush'

export default function AsemicText() {
  const text = useText('testing this')
  return (
    <Asemic>
      <Brush
        position={new Vector2(0.5, 0.5)}
        rotation={0.5 * Math.PI * 2}
        scale={new Vector2(0.5, 0.5)}
        keyframes={[{ curves: text }]}
        spacing={5}
        jitter={{ size: 0, position: new Vector2(0, 30) }}
        size={1}
      />
    </Asemic>
  )
}
