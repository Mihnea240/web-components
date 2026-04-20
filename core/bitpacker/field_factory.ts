import { swapBytes, type FieldDescriptor } from ".";

export type FieldAccessor = {
    get(view: DataView, byte_offset: number): number;
    set(view: DataView, byte_offset: number, value: number): void;
}

export const BitFieldFactory = {
    allignedAccessor(descriptor: FieldDescriptor): FieldAccessor {
        const { bitLength, littleEndian: little_endian = false, bucket } = descriptor;
        const mask = bitLength == 32 ? 0xFFFFFFFF : (1 << bitLength) - 1;
        const bucketByteOffset = bucket.index * bucket.sizeInBytes;

        switch (bitLength) {
            case 8:
                return {
                    get(view: DataView, byte_offset: number): number {
                        return view.getUint8(byte_offset + bucketByteOffset) & mask;
                    },
                    set(view: DataView, byte_offset: number, value: number): void {
                        view.setUint8(byte_offset + bucketByteOffset, value & mask);
                    }
                };

            case 16:
                return {
                    get(view: DataView, byte_offset: number): number {
                        return view.getUint16(byte_offset + bucketByteOffset, little_endian) & mask;
                    },
                    set(view: DataView, byte_offset: number, value: number): void {
                        view.setUint16(byte_offset + bucketByteOffset, value & mask, little_endian);
                    }
                };
            case 32:
                return {
                    get(view: DataView, byte_offset: number): number {
                        return view.getUint32(byte_offset + bucketByteOffset, little_endian) & mask;
                    },
                    set(view: DataView, byte_offset: number, value: number): void {
                        view.setUint32(byte_offset + bucketByteOffset, value & mask, little_endian);
                    }
                };
        }

        throw new Error(`Unsupported bit length ${bitLength} for aligned accessor. Only 8, 16, and 32 are supported.`);
    },

    unalignedAccessor(descriptor: FieldDescriptor): FieldAccessor {
        const { bitLength, littleEndian: little_endian = false, bucket } = descriptor;
        const mask = bitLength == 32 ? 0xFFFFFFFF : (1 << bitLength) - 1;
        const bucketByteOffset = bucket.index * bucket.sizeInBytes;
        const shift = bucket.offsetInBucket;

        return {
            get(view: DataView, byte_offset: number): number {
                const data = view.getUint32(byte_offset + bucketByteOffset, false);
                const value = (data >>> shift) & mask;
                // return value;
                return little_endian ? swapBytes(value, bitLength) : value;
            },
            set(view: DataView, byte_offset: number, value: number): void {
                let finalValue = value & mask;
                if (little_endian) {
                    finalValue = swapBytes(finalValue, bitLength);
                }

                // 2. Read-Modify-Write the bucket
                const currentData = view.getUint32(byte_offset + bucketByteOffset, false);

                const maskShifted = (mask << shift) >>> 0;
                const clearedData = (currentData & ~maskShifted) >>> 0;
                const newData = (clearedData | (finalValue << shift)) >>> 0;

                // 3. Write back the bucket (Always BE to keep neighbors intact)
                view.setUint32(byte_offset + bucketByteOffset, newData, false);
            }
        };
    }
};