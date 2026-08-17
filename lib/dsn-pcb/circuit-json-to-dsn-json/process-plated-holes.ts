import { su } from "@tscircuit/soup-util"
import type {
  AnyCircuitElement,
  SourceComponentBase,
  SourcePort,
} from "circuit-json"
import {
  createCircularHoleRectangularPadstack,
  createCircularPadstack,
  createOvalPadstack,
} from "lib/utils/create-padstack"
import { getComponentValue } from "lib/utils/get-component-value"
import { getFootprintName } from "lib/utils/get-footprint-name"
import { getPadstackName } from "lib/utils/get-padstack-name"
import { applyToPoint, scale } from "transformation-matrix"
import type { ComponentGroup, DsnPcb, Image, Pin } from "../types"

export function processPlatedHoles(
  componentGroups: ComponentGroup[],
  circuitElements: AnyCircuitElement[],
  pcb: DsnPcb,
  numLayers = 2,
) {
  /**
   * Helpers
   */
  const processedPadstacks = new Set<string>()

  /** Guarantee that a padstack for the given plated-hole exists, return its name */
  function ensurePadstack(hole: any): string {
    switch (hole.shape) {
      case "circle": {
        const name = getPadstackName({
          shape: "circle",
          holeDiameter: hole.hole_diameter * 1000,
          outerDiameter: hole.outer_diameter * 1000,
          layer: "all",
        })
        if (!processedPadstacks.has(name)) {
          const d = Math.round(hole.outer_diameter * 1000)
          pcb.library.padstacks.push(
            createCircularPadstack(name, d, d, numLayers),
          )
          processedPadstacks.add(name)
        }
        return name
      }
      case "oval":
      case "pill": {
        const name = getPadstackName({
          shape: hole.shape,
          width: hole.hole_width * 1000,
          height: hole.hole_height * 1000,
          layer: "all",
        })
        if (!processedPadstacks.has(name)) {
          pcb.library.padstacks.push(
            createOvalPadstack(
              name,
              Math.round(hole.outer_width * 1000),
              Math.round(hole.outer_height * 1000),
              Math.round(hole.hole_width * 1000),
              Math.round(hole.hole_height * 1000),
              numLayers,
            ),
          )
          processedPadstacks.add(name)
        }
        return name
      }
      default:
        return ""
    }
  }

  for (const group of componentGroups) {
    if (group.pcb_plated_holes.length === 0) continue

    const pcbComponent = circuitElements.find(
      (e) =>
        e.type === "pcb_component" &&
        e.pcb_component_id === group.pcb_component_id,
    ) as any
    if (!pcbComponent) continue

    const sourceComponent = circuitElements.find(
      (e) =>
        e.type === "source_component" &&
        e.source_component_id === pcbComponent.source_component_id,
    ) as SourceComponentBase
    if (!sourceComponent) continue

    const footprintName = getFootprintName(pcbComponent, sourceComponent)
    let image = pcb.library.images.find((img) => img.name === footprintName)

    if (!image) {
      image = {
        name: footprintName,
        pins: [],
      }
      pcb.library.images.push(image)
    }

    const resolution = pcb.resolution.value
    const multiplier = 1000 * resolution

    for (const hole of group.pcb_plated_holes) {
      const padstackName = ensurePadstack(hole)
      const sourcePort = circuitElements.find(
        (e) =>
          e.type === "source_port" && e.source_port_id === hole.source_port_id,
      ) as SourcePort

      if (
        !image.pins.some(
          (p) =>
            p.pin_number ===
            (sourcePort?.port_hints?.find(
              (h) => !Number.isNaN(Number(h)),
            ) || 1),
        )
      ) {
        // Apply rotation to the hole offset
        const rotationRad = (pcbComponent.rotation * Math.PI) / 180
        const cosR = Math.cos(rotationRad)
        const sinR = Math.sin(rotationRad)

        const dx = hole.x - pcbComponent.center.x
        const dy = hole.y - pcbComponent.center.y

        // The DSN format expects coordinates relative to the component center
        // but rotated by the component's rotation.
        // FREEROUTING/DSN coordinate system:
        // x' = dx * cos(R) + dy * sin(R)
        // y' = -dx * sin(R) + dy * cos(R)
        const rotatedX = dx * cosR + dy * sinR
        const rotatedY = -dx * sinR + dy * cosR

        image.pins.push({
          padstack_name: padstackName,
          pin_number:
            sourcePort?.port_hints?.find((h) => !Number.isNaN(Number(h))) ||
            1,
          x: Math.round(rotatedX * multiplier),
          y: Math.round(rotatedY * multiplier),
        })
      }
    }

    const dsnComponent = {
      name: group.pcb_component_id,
      image_name: footprintName,
      placements: [
        {
          x: Math.round(pcbComponent.center.x * multiplier),
          y: Math.round(pcbComponent.center.y * multiplier),
          side: pcbComponent.side === "bottom" ? "back" : "front",
          rotation: pcbComponent.rotation,
        },
      ],
    }
    pcb.placement.components.push(dsnComponent)
  }
}
