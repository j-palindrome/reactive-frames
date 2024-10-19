import { Vector2 } from 'three'
import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import { Brush } from '../../src/asemic/Brush'
import Keyframes from '../../src/asemic/Keyframes'

export default function Grass() {
  const kf = new Keyframes(100, 3)
    .line([0, 1])
    .scale([1, 1], [1, 0])
    .translate([0, 0], [1, 0])
    .then(1)
    .clear()
    .line([0, 1])
    .scale([1, 0], [1, 1])
    .translate([1, 0])

  return (
    <Reactive>
      <Asemic name='asemic'>
        <Brush
          name='brush'
          keyframes={kf.keyframes}
          size={new Vector2(2, 2)}
          alpha={0.5 / 2}
          between={[0.2, 0.3]}
        />
      </Asemic>
    </Reactive>
  )
}
