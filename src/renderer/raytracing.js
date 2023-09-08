import { Vector3 } from "../math.mjs"

let canvas
let context
let imageData
let drawBuffer

let dimensions
let aspectRatio

let width, height
let cWidth, cHeight
let vWidth, vHeight

let xMax, yMax
let xScale, yScale, zDistance

let camera
let scene

let animationRequestId
let previousTimeStamp

let actions = {
    "up": false,
    "right": false,
    "down": false,
    "left": false
}

export default {
    setCanvas: setCanvas,
    setScene: setScene,
    setActions: setActions,
    setDimensions: setDimensions
}

onmessage = (event) => {
    if (event.data instanceof Object) {
        if (Object.hasOwn(event.data, "canvas")) {
            setCanvas(event.data.canvas)
        } else if (Object.hasOwn(event.data, "scene")) {
            setScene(event.data.scene)
        } else if (Object.hasOwn(event.data, "actions")) {
            setActions(event.data.actions)
        } else if (Object.hasOwn(event.data, "dimensions")) {
            setDimensions(event.data.dimensions)
        }
    }
}

onerror = (event) => {
    console.error(event)
}

function setCanvas(c) {
    canvas = c
    context = canvas.getContext("2d", {willReadFrequently: true})

    dimensions = {width: canvas.offsetWidth, height: canvas.offsetHeight}
    width = canvas.width
    height = canvas.height
    initialize()

    camera = new Vector3()
}

function setScene(s) {
    scene = s
    for (const sphere of scene.shapes) {
        sphere.center = new Vector3(sphere.center.x, sphere.center.y, sphere.center.z)
        sphere.specularity = ~~(sphere.shininess === 1 ? 1000 : 100 * sphere.shininess / (1 - sphere.shininess))
    }
    for (const light of scene.lights) {
        switch (light.type) {
            case "DirectionalLight":
                light.direction = new Vector3(-light.direction.x, -light.direction.y, -light.direction.z)
                break
            case "PointLight":
                light.position = new Vector3(light.position.x, light.position.y, light.position.z)
                break
            default:
        }
    }
    requestAnimationFrame(paint)
}

function setActions(a) {
    Object.assign(actions, a)
    if (!animationRequestId) {
        previousTimeStamp = performance.now()
        animationRequestId = requestAnimationFrame((t) => animate(t))
    }
}

function setDimensions(d) {
    dimensions = d
    initialize()
    requestAnimationFrame(paint)
}

function initialize() {
    aspectRatio = dimensions.width / dimensions.height

    if (aspectRatio > 1) { // landscape
        canvas.width = width
        canvas.height = ~~(height / aspectRatio)
        vWidth = aspectRatio
        vHeight = 1
    } else { // portrait
        canvas.width = ~~(width * aspectRatio)
        canvas.height = height
        vWidth = 1
        vHeight = 1 / aspectRatio
    }
    cWidth = canvas.width
    cHeight = canvas.height

    xMax = ~~(cWidth / 2)
    yMax = ~~(cHeight / 2)

    const scale = Math.tan(53 * (Math.PI / 180) * 0.5)
    xScale = (vWidth / cWidth) * scale
    yScale = (vHeight / cHeight) * scale
    zDistance = (aspectRatio > 1 ? aspectRatio : 1 / aspectRatio) * scale

    imageData = context.getImageData(0, 0, cWidth, cHeight)
    drawBuffer = imageData.data
}

function animate(timeStamp) {
    if (Object.values(actions).every(a => a === false)) {
        animationRequestId = null
        return
    }
    animationRequestId = requestAnimationFrame((t) => animate(t))

    const deltaSeconds = (timeStamp - previousTimeStamp) / 1000
    previousTimeStamp = timeStamp

    update(deltaSeconds)
    paint()
}

function update(deltaSeconds) {
    camera.x += ((actions.right ? 1 : 0) + (actions.left ? -1 : 0)) * deltaSeconds
    camera.y += ((actions.up ? 1 : 0) + (actions.down ? -1 : 0)) * deltaSeconds
}

function paint() { // basic raytracing
    for (let cy = -yMax; cy <= yMax; cy++) {
        for (let cx = -xMax; cx <= xMax; cx++) {
            // we compute the ray direction
            const V = new Vector3(cx * xScale + camera.x, cy * yScale + camera.y, zDistance)
            const D = Vector3.difference(V, camera)
            // we determine the color seen through the viewport
            const [r, g, b] = computePixelColor(D, 1, Number.MAX_SAFE_INTEGER)
            paintPixel(cx, cy, [r, g, b])
        }
    }
    context.putImageData(imageData, 0, 0)
}

function computePixelColor(D, tMin, tMax) {
    let tClosest, sphereClosest
    // we compute the intersections of the ray and each sphere in the scene
    for (const sphere of scene.shapes) {
        const sphere_camera = Vector3.difference(camera, sphere.center)
        const a = Vector3.dot(D, D)
        const b = 2 * Vector3.dot(sphere_camera, D)
        const c = Vector3.dot(sphere_camera, sphere_camera) - sphere.radius * sphere.radius
        const discriminant = b * b - 4 * a * c
        if (discriminant >= 0) {
            const d = Math.sqrt(discriminant)
            const t1 = (-b + d) / (2 * a)
            const t2 = (-b - d) / (2 * a)
            if ((t1 > tMin && t1 < tMax) || (t2 > tMin && t2 < tMax)) {
                const t = Math.min(t1, t2)
                if (!tClosest || t < tClosest) {
                    tClosest = t
                    sphereClosest = sphere
                }
            }
        }
    }
    if (tClosest) {
        const P = new Vector3(camera.x + tClosest * D.x, camera.y + tClosest * D.y, camera.z + tClosest * D.z)
        const C_P = Vector3.difference(P, sphereClosest.center)
        const C_P_length = C_P.norm()
        const N = new Vector3(C_P.x / C_P_length, C_P.y / C_P_length, C_P.z / C_P_length)
        const i = computePixelIntensity(P, N, Vector3.multiplication(D, -1), sphereClosest.specularity)
        return [~~(sphereClosest.color[0] * i), ~~(sphereClosest.color[1] * i), ~~(sphereClosest.color[2] * i)]
    } else {
        return [255, 255, 255]
    }
}

function computePixelIntensity(P, N, V, specularity) {
    let i = 0
    for (const light of scene.lights) {
        if (light.type === "AmbientLight") {
            i += light.intensity
        } else {
            let L
            if (light.type === "DirectionalLight") {
                L = light.direction
            } else if (light.type === "PointLight") {
                L = Vector3.difference(light.position, P)
            }
            const R = Vector3.difference(Vector3.multiplication(N, 2 * Vector3.dot(N, L)), L)
            const id = Math.max(0, Vector3.dot(N, L) / (N.norm() * L.norm()))
            const is = Math.max(0, Vector3.dot(R, V) / (R.norm() * V.norm()))
            i += light.intensity * (id + is ** specularity)
        }
    }
    return Math.min(1, i)
}

function paintPixel(cx, cy, [r, g, b]) {
    // we convert the position (cx, cy) from our coordinate space to the canvas grid
    const x = xMax + cx
    const y = yMax - cy
    if ((x >= 0 && x < cWidth) && (y >= 0 && y < cHeight)) {
        let indexOffset = (y * cWidth + x) * 4
        drawBuffer[indexOffset] = r
        drawBuffer[++indexOffset] = g
        drawBuffer[++indexOffset] = b
        drawBuffer[++indexOffset] = 255
    }
}
