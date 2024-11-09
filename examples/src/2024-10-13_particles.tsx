import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { KeyframeBuilder } from '../../src/asemic/drawingSystem/KeyframeBuilder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  const kf = new KeyframeBuilder(g => g.text('a poem in space'))
    .to({}, 0)
    .to({}, 0)

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            size: [0.25, 0.25],
            a: 25
          }}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
