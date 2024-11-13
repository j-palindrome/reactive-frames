import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { QuadraticBezierCurve, Vector2 } from 'three'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const kf = new Builder(g =>
    g.text('abcdefghijklmnopqrstuvwxyz', { width: 1, origin: [0, 0.5] })
  )
    .to({ translate: [0, -0.5] })
    .groups((g, p) => {
      g.transform.rotate += 2 * Math.PI * 1 * (Math.random() - 0.5)
    })
    .to({ translate: [0, 0] })
    .groups(g => (g.transform.rotate = 0))

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            a: 1,
            size: [1, 1]
          }}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
