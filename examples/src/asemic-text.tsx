import { Vector2 } from 'three'
import Asemic from '../../asemic/asemic'
import useText from '../../asemic/StrokeTExt'
import { Brush } from '../../asemic/Brush'

export default function AsemicText() {
  const text = useText('this')
  return (
    <Asemic>
      <Brush
        keyframes={[{ curves: text, rotation: 0 }]}
        spacing={10}
        // jitter={{
        //   // rotation: 0.5 * Math.PI * 2,
        //   position: new Vector2(15, 0)
        // }}
        size={new Vector2(10, 1)}
      />
    </Asemic>
  )
}
