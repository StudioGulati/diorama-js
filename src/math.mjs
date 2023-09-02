class Vector3 {
    x
    y
    z

    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }

    /**
     * Returns the result of subtracting one vector from another.
     *
     * @param {Vector3} a
     * @param {Vector3} b
     * @returns {Vector3}
     */
    static difference(a, b) {
        return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z)
    }

    /**
     * Returns the scalar product of two vectors.
     *
     * @param {Vector3} a
     * @param {Vector3} b
     * @returns {number}
     */
    static dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z
    }
}

export {Vector3}
