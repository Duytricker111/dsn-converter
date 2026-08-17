import type { PcbSmtPad } from "circuit-json"
import type { PcbComponent, SourcePort } from "circuit-json"
import type { Pin } from "lib"
import { type PadstackNameArgs, getPadstackName } from "./get-padstack-name"
import { getPolygonSmtPadGeometry } from "./get-polygon-smt-pad-geometry"

export function createPinForImage({
  pad,
  pcbComponent,
  sourcePort,
}: {
  pad: PcbSmtPad
  pcbComponent: PcbComponent
  sourcePort: SourcePort | undefined
}): Pin | undefined {
  if (!sourcePort) return undefined

  const isCircle = pad.shape === "circle"
  const isPolygon = pad.shape === "polygon"
  const polygonPadGeometry = isPolygon
    ? getPolygonSmtPadGeometry(pad)
    : undefined

  let shape: PadstackNameArgs["shape"] = "rect"
  let outerDiameter: number | undefined
  let holeDiameter: number | undefined
  let width: number | undefined
  let height: number | undefined
  let customDescriptor: string | undefined

  if (isCircle) {
    shape = "circle"
    outerDiameter = pad.radius * 1000 * 2 // Radius to diameter
    holeDiameter = pad.radius * 1000 * 2 // Radius to diameter
  } else if (isPolygon) {
    shape = "polygon"
    width = polygonPadGeometry?.widthUm
    height = polygonPadGeometry?.heightUm
    customDescriptor = `${polygonPadGeometry?.widthUm}x${polygonPadGeometry?.heightUm}_${polygonPadGeometry?.relativePointsUm.join("_")}`
  } else {
    width = pad.width * 1000
    height = pad.height * 1000
  }

  const padstackParams: PadstackNameArgs = {
    shape,
    outerDiameter,
    holeDiameter,
    width,
    height,
    layer: pad.layer as PcbSmtPad["layer"],
    customDescriptor,
  }

  const padCenter = isPolygon
    ? polygonPadGeometry!.center
    : { x: pad.x, y: pad.y }

  // TODO resolution is not passed here, defaulting to 10 for now to match SmoothieBoard
  // In a real fix, we should pass the pcb object or resolution value
  const resolution = 10
  const multiplier = 1000 * resolution

  return {
    name: sourcePort.name,
    padstack: getPadstackName(padstackParams),
    x: (pcbComponent.center.x + padCenter.x) * multiplier,
    y: (pcbComponent.center.y + padCenter.y) * multiplier,
    rotation: pcbComponent.rotation ?? 0,
  }
}
