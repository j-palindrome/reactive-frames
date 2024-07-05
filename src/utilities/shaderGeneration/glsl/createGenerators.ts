import {
  ProcessedTransformDefinition,
  TransformDefinition,
  TransformDefinitionType
} from './transformDefinitions'
import { Glsl } from './Glsl'
import ImmutableList from './ImmutableList'

type Generator = (...args: unknown[]) => Glsl

export function createTransformChainClass<
  T extends readonly TransformDefinition[]
>(modifierTransforms: T): typeof Glsl {
  const sourceClass = class extends Glsl {}

  for (const transform of modifierTransforms) {
    const processed = processGlsl(transform)

    addTransformChainMethod(sourceClass, processed)
  }

  return sourceClass
}

export function createGenerator(
  generatorTransform: TransformDefinition,
  TransformChainClass: typeof Glsl
): Generator {
  const processed = processGlsl(generatorTransform)

  return (...args: unknown[]) =>
    new TransformChainClass(
      new ImmutableList({
        transform: processed,
        userArgs: args
      })
    )
}

export function createGenerators<K extends readonly TransformDefinition[]>(
  generatorTransforms: K,
  sourceClass: typeof Glsl
) {
  const generatorMap = Object.fromEntries(
    generatorTransforms.map(transform => [
      transform.name,
      createGenerator(transform, sourceClass)
    ])
  )

  return generatorMap as { [Key in K[number]['name']]: Generator }
}

export function addTransformChainMethod(
  cls: typeof Glsl,
  processedTransformDefinition: ProcessedTransformDefinition
) {
  function addTransformApplicationToInternalChain(
    this: Glsl,
    ...args: unknown[]
  ): Glsl {
    const transform = {
      transform: processedTransformDefinition,
      userArgs: args
    }

    return new cls(this.transforms.append(transform))
  }

  // @ts-ignore
  cls.prototype[processedTransformDefinition.name] =
    addTransformApplicationToInternalChain
}

const typeLookup: Record<
  TransformDefinitionType,
  { returnType: string; implicitFirstArg: string }
> = {
  src: {
    returnType: 'vec4',
    implicitFirstArg: 'vec2 _st'
  },
  coord: {
    returnType: 'vec2',
    implicitFirstArg: 'vec2 _st'
  },
  color: {
    returnType: 'vec4',
    implicitFirstArg: 'vec4 _c0'
  },
  combine: {
    returnType: 'vec4',
    implicitFirstArg: 'vec4 _c0'
  },
  combineCoord: {
    returnType: 'vec2',
    implicitFirstArg: 'vec2 _st'
  }
}

export function processGlsl(
  transformDefinition: TransformDefinition
): ProcessedTransformDefinition {
  const { implicitFirstArg, returnType } = typeLookup[transformDefinition.type]

  const signature = [
    implicitFirstArg,
    ...transformDefinition.inputs.map(input => `${input.type} ${input.name}`)
  ].join(', ')

  const glslFunction = `
  ${returnType} ${transformDefinition.name}(${signature}) {
      ${transformDefinition.glsl}
  }
`

  return {
    ...transformDefinition,
    glsl: glslFunction,
    processed: true
  }
}
