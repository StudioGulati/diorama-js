import { Vector3 } from "./math.mjs"

const canvases = new WeakMap()

export const initializeDiorama = function (canvas) {
    if (!canvas) {
        throw new Error("The Canvas is invalid.")
    } else if (canvases.has(canvas)) {
        throw new Error("The Canvas is already associated with a Diorama.")
    } else {
        const diorama = new Diorama(canvas)
        canvases.set(canvas, diorama)
        return diorama
    }
}

class Diorama {
    #canvas
    #viewport
    #camera
    #scene
    #actions
    #animationRequestId
    #previousTimeStamp = 0

    constructor(canvas) {
        this.#canvas = {
            context: canvas.getContext("2d"),
            width: canvas.width,
            height: canvas.height,
            xMax: canvas.width / 2,
            yMax: canvas.height / 2
        }

        this.#viewport = {}
        const aspectRatio = this.#canvas.width / this.#canvas.height
        if (aspectRatio > 1) {
            this.#viewport.width = 1
            this.#viewport.height = 1 / aspectRatio
        } else {
            this.#viewport.width = aspectRatio
            this.#viewport.height = 1
        }
        this.#viewport.xScale = this.#viewport.width / this.#canvas.width
        this.#viewport.yScale = this.#viewport.height / this.#canvas.height
        this.#viewport.zDistance = 1

        this.imageData = this.#canvas.context.getImageData(0, 0, this.#canvas.width, this.#canvas.height)
        this.drawBuffer = this.imageData.data

        this.#camera = new Vector3() // the camera is initially positioned at the origin
        this.#scene = []
        this.#actions = {
            "up": false,
            "right": false,
            "down": false,
            "left": false
        }

        this.#animationRequestId = null
    }

    #animate(timeStamp) {
        if (Object.values(this.#actions).every(a => a === false)) {
            this.#animationRequestId = null
            return
        }
        this.#animationRequestId = requestAnimationFrame((t) => this.#animate(t))

        const deltaSeconds = (timeStamp - this.#previousTimeStamp) / 1000
        this.#previousTimeStamp = timeStamp

        this.#update(deltaSeconds)
        this.#draw()
    }

    #update(deltaSeconds) {
        this.#camera.x += ((this.#actions.right ? 1 : 0) + (this.#actions.left ? -1 : 0)) * deltaSeconds
        this.#camera.y += ((this.#actions.up ? 1 : 0) + (this.#actions.down ? -1 : 0)) * deltaSeconds
    }

    #draw() { // basic raytracing
        for (let cy = -this.#canvas.yMax; cy < this.#canvas.yMax; cy++) {
            for (let cx = -this.#canvas.xMax; cx < this.#canvas.xMax; cx++) {
                // we compute the ray direction
                const V = new Vector3()
                V.x = cx * this.#viewport.xScale + this.#camera.x
                V.y = cy * this.#viewport.yScale + this.#camera.y
                V.z = this.#viewport.zDistance
                const D = Vector3.difference(V, this.#camera)
                // we determine the color seen through the viewport
                const [r, g, b] = this.#getPixelColor(D, 1, Number.MAX_SAFE_INTEGER)
                this.#setPixelColor(cx, cy, [r, g, b])
            }
        }
        this.#canvas.context.putImageData(this.imageData, 0, 0)
    }

    #getPixelColor(D, tmin, tmax) {
        let t
        let color
        // we compute the intersections of the ray and each sphere in the scene
        for (const sphere of this.#scene) {
            const C_camera = Vector3.difference(this.#camera, sphere.center)
            const a = Vector3.dot(D, D)
            const b = 2 * Vector3.dot(C_camera, D)
            const c = Vector3.dot(C_camera, C_camera) - sphere.radius * sphere.radius
            const discriminant = Math.sqrt(b * b - 4 * a * c)
            const t1 = (-b + discriminant) / (2 * a)
            const t2 = (-b - discriminant) / (2 * a)
            if ((t1 > tmin && t1 < tmax) || (t2 > tmin && t2 < tmax)) {
                const ti = Math.min(t1, t2)
                if (!t || ti < t) {
                    t = ti
                    color = sphere.color
                }
            }
        }
        if (t) return color
        else return [255, 255, 255]
    }

    #setPixelColor(cx, cy, [r, g, b]) {
        // we convert the position (cx, cy) from our coordinate space to the canvas grid
        const x = this.#canvas.xMax + cx
        const y = this.#canvas.yMax - cy
        if ((x >= 0 && x < this.#canvas.width) && (y >= 0 && y < this.#canvas.height)) {
            const indexOffset = (y * this.#canvas.width + x) * 4
            this.drawBuffer[indexOffset] = r
            this.drawBuffer[indexOffset + 1] = g
            this.drawBuffer[indexOffset + 2] = b
            this.drawBuffer[indexOffset + 3] = 255
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
                const [x, y, z] = transform.getAttribute("translation")
                    .split(" ").map(c => parseFloat(c))
                const radius = parseInt(geometry.getAttribute("radius")) | 1
                const color = shape.getElementsByTagName("Appearance")[0]
                    .getElementsByTagName("Material")[0].getAttribute("diffuseColor")
                    .split(" ").map(c => Math.floor(255 * parseFloat(c)))
                this.#scene.push({
                    type: geometry.nodeName,
                    center: new Vector3(x, y, z),
                    radius: radius,
                    color: color
                })
            }
            this.#draw()
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

        if (!this.#animationRequestId) {
            this.#previousTimeStamp = window.performance.now()
            this.#animationRequestId = requestAnimationFrame((t) => this.#animate(t))
        }
    }

    get [Symbol.toStringTag]() {
        return "Diorama"
    }
}
