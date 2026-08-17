import type { AnyCircuitElement } from "circuit-json"
import {
  generateLayerNames,
  generateLayers,
  getViaPadstackName,
} from "lib/utils/generate-layers"
import type { ComponentGroup, DsnPcb, Padstack } from "../types"
import { processComponentsAndPads } from "./process-components-and-pads"
import { processNets } from "./process-nets"
import { processPcbTraces } from "./process-pcb-traces"
import { processPlatedHoles } from "./process-plated-holes"

export function convertCircuitJsonToDsnJson(
  circuitElements: AnyCircuitElement[],
  options: {
    traceClearance?: number
  } = {},
): DsnPcb {
  // Find the PCB board element
  const pcbBoard = circuitElements.find(
    (element) => element.type === "pcb_board",
  ) as AnyCircuitElement & {
    width: number
    height: number
    center: { x: number; y: number }
    num_layers?: number
  }

  const numLayers = pcbBoard?.num_layers ?? 2
  const layers = generateLayers(numLayers)
  const layerNames = generateLayerNames(numLayers)
  const defaultViaName = getViaPadstackName(numLayers, 600, 300)

  const pcb: DsnPcb = {
    is_dsn_pcb: true,
    filename: "",
    parser: {
      string_quote: "",
      host_version: "",
      space_in_quoted_tokens: "",
      host_cad: "",
    },
    resolution: {
      unit: "um",
      value: 10,
    },
    unit: "um",
    structure: {
      layers,
      boundary: {
        path: {
          layer: "pcb",
          width: 0,
          coordinates: calculateBoardBoundary(pcbBoard, 10),
        },
      },
      via: defaultViaName,
      rule: {
        width: 250,
        clearance: options.traceClearance ?? 250,
      },
    },
    placement: {
      components: [],
    },
    library: {
      images: [],
      padstacks: [
        {
          name: defaultViaName,
          shapes: [
            {
              shape: "circle",
              layer: "all",
              diameter: 600,
            },
          ],
        },
      ],
    },
    network: {
      nets: [],
    },
    wiring: {
      traces: [],
    },
  }

  const componentGroups = groupCircuitElements(circuitElements)

  processComponentsAndPads(componentGroups, circuitElements, pcb)
  processPlatedHoles(componentGroups, circuitElements, pcb, numLayers)
  processNets(circuitElements, pcb)
  processPcbTraces(circuitElements, pcb)

  return pcb
}

function calculateBoardBoundary(
  pcbBoard:
    | (AnyCircuitElement & {
        width: number
        height: number
        center: { x: number; y: number }
      })
    | undefined,
  resolution: number,
): { x: number; y: number }[] {
  if (!pcbBoard) return []

  const multiplier = 1000 * resolution
  const halfWidth = (pcbBoard.width / 2) * multiplier
  const halfHeight = (pcbBoard.height / 2) * multiplier
  const centerX = pcbBoard.center.x * multiplier
  const centerY = pcbBoard.center.y * multiplier

  return [
    { x: centerX - halfWidth, y: centerY - halfHeight },
    { x: centerX + halfWidth, y: centerY - halfHeight },
    { x: centerX + halfWidth, y: centerY + halfHeight },
    { x: centerX - halfWidth, y: centerY + halfHeight },
  ]
}

function groupCircuitElements(
  circuitElements: AnyCircuitElement[],
): ComponentGroup[] {
  const componentGroups: ComponentGroup[] = []

  const pcbComponents = circuitElements.filter(
    (e) => e.type === "pcb_component",
  ) as any[]

  for (const pcbComponent of pcbComponents) {
    const group: ComponentGroup = {
      pcb_component_id: pcbComponent.pcb_component_id,
      pcb_smt_pads: circuitElements.filter(
        (e) =>
          e.type === "pcb_smt_pad" &&
          e.pcb_component_id === pcbComponent.pcb_component_id,
      ) as any[],
      pcb_plated_holes: circuitElements.filter(
        (e) =>
          e.type === "pcb_plated_hole" &&
          e.pcb_component_id === pcbComponent.pcb_component_id,
      ) as any[],
    }
    componentGroups.push(group)
  }

  return componentGroups
}
