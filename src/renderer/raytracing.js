import { Vector3 } from "../math.mjs"

let canvas
let context
let imageData
let drawBuffer

let width, height
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
    setActions: setActions
}

onmessage = (event) => {
    if (event.data instanceof Object && Object.hasOwn(event.data, "canvas")) {
        setCanvas(event.data.canvas)
    } else if (event.data instanceof Object && Object.hasOwn(event.data, "scene")) {
        setScene(event.data.scene)
    } else if (event.data instanceof Object && Object.hasOwn(event.data, "actions")) {
        setActions(event.data.actions)
    }
}

onerror = (event) => {
    console.log(event)
}

function setCanvas(c) {
    canvas = c

    width = canvas.width
    height = canvas.height

    const aspectRatio = width / height
    if (aspectRatio > 1) {
        vWidth = 1
        vHeight = 1 / aspectRatio
    } else {
        vWidth = aspectRatio
        vHeight = 1
    }

    xMax = width / 2
    yMax = height / 2

    xScale = vWidth / width
    yScale = vHeight / height
    zDistance = 1

    camera = new Vector3()

    context = canvas.getContext("2d")
    imageData = context.getImageData(0, 0, width, height)
    drawBuffer = imageData.data
}

function setScene(s) {
    scene = s
    for (const sphere of scene.shapes) {
        sphere.center = new Vector3(sphere.center.x, sphere.center.y, sphere.center.z)
    }
    for (const light of scene.lights) {
        switch (light.type) {
            case "DirectionalLight":
                light.direction = new Vector3(light.direction.x, light.direction.y, light.direction.z)
                break
            case "PointLight":
                light.position = new Vector3(light.position.x, light.position.y, light.position.z)
                break
            default:
        }
    }
    paint()
}

function setActions(a) {
    Object.assign(actions, a)
    if (!animationRequestId) {
        previousTimeStamp = performance.now()
        animationRequestId = requestAnimationFrame((t) => animate(t))
    }
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
    for (let cy = -yMax; cy < yMax; cy++) {
        for (let cx = -xMax; cx < xMax; cx++) {
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
        const i = computePixelIntensity(P, N)
        return [sphereClosest.color[0] * i, sphereClosest.color[1] * i, sphereClosest.color[2] * i]
    } else {
        return [255, 255, 255]
    }
}

function computePixelIntensity(P, N) {
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
            i += light.intensity * Math.max(0, Vector3.dot(N, L) / (N.norm() * L.norm()))
        }
    }
    return i
}

function paintPixel(cx, cy, [r, g, b]) {
    // we convert the position (cx, cy) from our coordinate space to the canvas grid
    const x = xMax + cx
    const y = yMax - cy
    if ((x >= 0 && x < width) && (y >= 0 && y < height)) {
        let indexOffset = (y * width + x) * 4
        drawBuffer[indexOffset] = r
        drawBuffer[++indexOffset] = g
        drawBuffer[++indexOffset] = b
        drawBuffer[++indexOffset] = 255
    }
}
