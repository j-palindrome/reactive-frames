import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Particles from '../../src/asemic/FeedbackTexture'

export default function ParticlesTest() {
  return (
    <Reactive>
      <Asemic name='a'>
        <Particles></Particles>
      </Asemic>
    </Reactive>
  )
}
