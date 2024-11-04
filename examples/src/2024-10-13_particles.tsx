import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { Keyframes } from '../../src/asemic/drawingSystem/KeyframeBuilder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  const kf = new Keyframes(g =>
    g.text('abcdefghijklmnopqrstuvwxyz', { width: 100, origin: [0, 25] })
  )

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          setup={(self, parent) => {}}
          keyframes={kf}
          name='b'
          size={[1, 1]}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
