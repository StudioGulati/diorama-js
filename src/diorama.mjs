import raytracer from "./renderer/raytracing.js"

const canvases = new WeakMap()

export const initializeDiorama = function (canvas, options) {
    if (!canvas) {
        throw new Error("The Canvas is invalid.")
    } else if (canvases.has(canvas)) {
        throw new Error("The Canvas is already associated with a Diorama.")
    } else {
        const diorama = new Diorama(canvas, options)
        canvases.set(canvas, diorama)
        return diorama
    }
}

class Diorama {
    #options = {
        useWorker: false
    }

    #renderer
    #scene
    #actions

    constructor(canvas, options) {
        Object.assign(this.#options, options)

        if (this.#options.useWorker) {
            const offscreen = canvas.transferControlToOffscreen()
            this.#renderer = new Worker(new URL("./renderer/raytracing.js", import.meta.url), {
                type: "module"
            })
            this.#renderer.postMessage({canvas: offscreen}, [offscreen])
        } else {
            this.#renderer = raytracer
            this.#renderer.setCanvas(canvas)
        }

        this.#scene = {
            shapes: [],
            lights: []
        }

        this.#actions = {
            "up": false,
            "right": false,
            "down": false,
            "left": false
        }
    }

    loadScene(scene) {
        const parser = new DOMParser()
        const document = parser.parseFromString(scene, "text/xml")
        const errorNode = document.querySelector("parsererror")
        if (errorNode) {
            throw new Error("The scene cannot be loaded.")
        } else {
            for (const transform of document.getElementsByTagName("Transform")) {
                const shape = transform.children[0]
                const geometry = shape.children[0]
                const center = parseVector(transform.getAttribute("translation"))
                const radius = parseInt(geometry.getAttribute("radius")) || 1
                const color = shape.getElementsByTagName("Appearance")[0]
                    .getElementsByTagName("Material")[0].getAttribute("diffuseColor")
                    .split(" ").map(c => Math.floor(255 * parseFloat(c)))
                this.#scene.shapes.push({
                    type: geometry.nodeName,
                    center: center,
                    radius: radius,
                    color: color
                })
            }
            for (const light of document.querySelectorAll("DirectionalLight, PointLight")) {
                const intensity = parseFloat(light.getAttribute("intensity"))
                switch (light.nodeName) {
                    case "DirectionalLight":
                        const ambientIntensity = parseFloat(light.getAttribute("ambientIntensity"))
                        if (ambientIntensity) {
                            this.#scene.lights.push({
                                type: "AmbientLight",
                                intensity: ambientIntensity
                            })
                        }
                        const direction = parseVector(light.getAttribute("direction"))
                        this.#scene.lights.push({
                            type: light.nodeName,
                            intensity: intensity,
                            direction: direction
                        })
                        break
                    case "PointLight":
                        const position = parseVector(light.getAttribute("location"))
                        this.#scene.lights.push({
                            type: light.nodeName,
                            intensity: intensity,
                            position: position
                        })
                        break
                    default:
                }
            }

            if (this.#options.useWorker) {
                this.#renderer.postMessage({scene: this.#scene})
            } else {
                this.#renderer.setScene(this.#scene)
            }
        }
    }

    setAction(action, value) {
        switch (action) {
            case "ArrowUp":
                this.#actions.up = value
                break
            case "ArrowRight":
                this.#actions.right = value
                break
            case "ArrowDown":
                this.#actions.down = value
                break
            case "ArrowLeft":
                this.#actions.left = value
                break
            default:
        }

        if (this.#options.useWorker) {
            this.#renderer.postMessage({actions: this.#actions})
        } else {
            this.#renderer.setActions(this.#actions)
        }
    }

    get [Symbol.toStringTag]() {
        return "Diorama"
    }
}

/**
 * Parses the X3D string format used to specify 3D coordinates and scale values.
 *
 * See {@link https://www.web3d.org/specifications/X3dSchemaDocumentation4.0/x3d-4.0_SFVec3f.html SFVec3f}
 *
 * @typedef {Object} Vector
 * @property {number} x
 * @property {number} y
 * @property {number} z
 *
 * @param {string} value
 * @returns {Vector}
 */
function parseVector(value) {
    const [x, y, z] = value.split(" ").map(v => parseFloat(v))
    return {x, y, z}
}
