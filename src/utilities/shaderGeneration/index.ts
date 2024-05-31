import { compileWithEnvironment } from './compiler/compileWithEnvironment'
import { Glsl } from './glsl/Glsl'
import {
  createGenerators,
  createTransformChainClass
} from './glsl/createGenerators'
import {
  generatorTransforms,
  modifierTransforms
} from './glsl/transformDefinitions'

const TransformChainClass = createTransformChainClass(modifierTransforms)
const fragmentGenerators = createGenerators(
  generatorTransforms,
  TransformChainClass
)

export const compileFragmentShader = (
  generator: (input: typeof fragmentGenerators) => Glsl
) => {
  const generated = generator(fragmentGenerators)
  return compileWithEnvironment(generated.transforms)
}
