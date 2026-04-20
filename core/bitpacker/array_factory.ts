import { type FieldDescriptor, swapBytes } from ".";

export type ArrayAccessor = {
    /**Array size */
    length: number;
    get(view: DataView, byte_offset: number, index: number): number;
    set(view: DataView, byte_offset: number, index: number, value: number): void;
}

export const BitArrayFactory = {
    alignedAccessor(descriptor: FieldDescriptor): ArrayAccessor {
        const { bitLength, littleEndian: little_endian = false, bucket, array } = descriptor;
        if (!array) throw new Error("Array metadata missing");

        const baseByteOffset = bucket.index * bucket.sizeInBytes;
        const stride = bucket.sizeInBytes; // In an aligned array, each element is a full bucket
        const mask = bitLength === 32 ? 0xFFFFFFFF : (1 << bitLength) - 1;

        switch (bitLength) {
            case 8: return {
                length: array.length,
                get: (v, b, i) => v.getUint8(b + baseByteOffset + (i * stride)) & mask,
                set: (v, b, i, val) => v.setUint8(b + baseByteOffset + (i * stride), val & mask)
            };
            case 16: return {
                length: array.length,
                get: (v, b, i) => v.getUint16(b + baseByteOffset + (i * stride), little_endian) & mask,
                set: (v, b, i, val) => v.setUint16(b + baseByteOffset + (i * stride), val & mask, little_endian)
            };
            case 32: return {
                length: array.length,
                get: (v, b, i) => v.getUint32(b + baseByteOffset + (i * stride), little_endian) >>> 0,
                set: (v, b, i, val) => v.setUint32(b + baseByteOffset + (i * stride), val >>> 0, little_endian)
            };
        }
        throw new Error(`Unsupported aligned length ${bitLength}`);
    },

    unalignedAccessor(descriptor: FieldDescriptor): ArrayAccessor {
        const { bitLength, littleEndian: little_endian = false, bucket, array, packLSBFirst } = descriptor;
        if (!array) throw new Error("Array metadata missing");

        const mask = (1 << bitLength) - 1;
        const bucketSize = bucket.sizeInBytes;
        const elementsPerBucket = array.elementsPerBucket;
        const baseByteOffset = bucket.index * bucketSize;

        if (!packLSBFirst) {
            const startBitPos = bucket.sizeInBytes * 8 - bitLength; // Start from the most significant bit
            return {
                length: array.length,
                get(view, byte_offset, index) {
                    // Calculate which bucket the index belongs to
                    const bucketIdx = (index / elementsPerBucket) | 0;
                    const bitOffset = startBitPos - (index % elementsPerBucket) * bitLength;

                    const addr = byte_offset + baseByteOffset + (bucketIdx * bucketSize);
                    const data = view.getUint32(addr, false);
                    const value = (data >>> bitOffset) & mask;

                    return little_endian ? swapBytes(value, bitLength) : value;
                },
                set(view, byte_offset, index, value) {
                    const bucketIdx = (index / elementsPerBucket) | 0;
                    const bitOffset = startBitPos - (index % elementsPerBucket) * bitLength;

                    let finalValue = value & mask;
                    if (little_endian) finalValue = swapBytes(finalValue, bitLength);

                    const addr = byte_offset + baseByteOffset + (bucketIdx * bucketSize);
                    const currentData = view.getUint32(addr, false);

                    const maskShifted = (mask << bitOffset) >>> 0;
                    const newData = ((currentData & ~maskShifted) | (finalValue << bitOffset)) >>> 0;

                    view.setUint32(addr, newData, false);
                }
            }

        }

        return {
            length: array.length,
            get(view, byte_offset, index) {
                // Calculate which bucket the index belongs to
                const bucketIdx = (index / elementsPerBucket) | 0;
                const bitOffset = (index % elementsPerBucket) * bitLength;

                const addr = byte_offset + baseByteOffset + (bucketIdx * bucketSize);
                const data = view.getUint32(addr, false);
                const value = (data >>> bitOffset) & mask;

                return little_endian ? swapBytes(value, bitLength) : value;
            },
            set(view, byte_offset, index, value) {
                const bucketIdx = (index / elementsPerBucket) | 0;
                const bitOffset = (index % elementsPerBucket) * bitLength;

                let finalValue = value & mask;
                if (little_endian) finalValue = swapBytes(finalValue, bitLength);

                const addr = byte_offset + baseByteOffset + (bucketIdx * bucketSize);
                const currentData = view.getUint32(addr, false);

                const maskShifted = (mask << bitOffset) >>> 0;
                const newData = ((currentData & ~maskShifted) | (finalValue << bitOffset)) >>> 0;

                view.setUint32(addr, newData, false);
            }
        };
    }
};