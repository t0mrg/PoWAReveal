/** Bounded Uint8Array adapter for the vendored decoder. See LZFSE-LICENSE. */
export class OutBuffer {
    length = 0;
    constructor(limit) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 512 * 1024 * 1024)
            throw new Error('lzfse: invalid decoded size');
        this.limit = limit;
        this.buf = new Uint8Array(limit);
    }
    check(n) {
        if (!Number.isSafeInteger(n) || n < 0 || n > this.limit - this.length)
            throw new Error('lzfse: block exceeds the declared decoded size');
    }
    reserve(n) { this.check(n); }
    append(data) {
        this.reserve(data.length);
        this.buf.set(data, this.length);
        this.length += data.length;
    }
    result() { return this.buf.subarray(0, this.length); }
}
