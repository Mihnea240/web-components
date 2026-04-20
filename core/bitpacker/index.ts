import { BitArrayFactory, type ArrayAccessor } from "./array_factory";
import { BitFieldFactory, type FieldAccessor } from "./field_factory";

// --- TYPE SYSTEM ---  Ai type magic

/** Converts string type definitions into JS types */
export type FieldTypeToValue<T extends string> =
    T extends `${string}[${number}]` ? number[] : number;

/** Filters out directives (align) and maps field names to their JS types */
export type InferSchema<T extends readonly BitField[]> = {
    [K in T[number] as K extends { name: infer N extends string } ? N : never]: 
        K extends { type: infer Ty extends string } 
            ? Ty extends `${string}[${number}]` // Explicitly check for array string
                ? number[] 
                : number 
            : never;
};

export type BitField = 
    | {
        /**The name of the field */
        name: string;
        /**The type */
        type: `u${8 | 16 | 32}` | `bits${number}` | `u${8 | 16 | 32}[${number}]` | `bits${number}[${number}]`;
        /**If the field shoul be stored in little endian order, has no effects for fields that are not a multiple of 8*/
        littleEndian?: boolean
    }
    | {
        /**Forces alingment to the next N bytes boundary */
        align: number
    };

export function swapBytes(val: number, bitLen: number): number {
    switch (bitLen) {
        case 16: return ((val & 0xFF) << 8) | (val >>> 8);
        case 24: return ((val & 0xFF) << 16) | (val & 0xFF00) | (val >>> 16);
        case 32: 
            return ((val & 0xFF) << 24) | ((val & 0xFF00) << 8) | 
                   ((val >> 8) & 0xFF00) | (val >>> 24);
        default: return val;
    }
}

function isMachineLittleEndian() {
    const buffer = new ArrayBuffer(4);
    const uint32 = new Uint32Array(buffer);
    const uint8 = new Uint8Array(buffer);
    uint32[0] = 0x01020304;

    return uint8[0] === 0x04;
}

export type FieldDescriptor = {
    bitLength: number;
    bucket: {
        index: number;
        offsetInBucket: number;
        sizeInBytes: number;
    }
    array?: {
        length: number;
        elementsPerBucket: number;
    }
    littleEndian?: boolean;
    packLSBFirst?: boolean;
}

export function createAccessor(descriptor: FieldDescriptor): FieldAccessor | ArrayAccessor {
    const isArray = !!descriptor.array;
    const isAligned = descriptor.bucket.offsetInBucket === 0 &&
        descriptor.bitLength === descriptor.bucket.sizeInBytes * 8;

    if (isArray) {
        return isAligned
            ? BitArrayFactory.alignedAccessor(descriptor)
            : BitArrayFactory.unalignedAccessor(descriptor);
    }

    return isAligned
        ? BitFieldFactory.allignedAccessor(descriptor)
        : BitFieldFactory.unalignedAccessor(descriptor);
}

function parseType(typeStr: string) {
    const arrayMatch = typeStr.match(/\[(\d+)\]$/);
    const arrayLength = arrayMatch ? parseInt(arrayMatch[1]) : undefined;
    const baseType = typeStr.replace(/\[\d+\]$/, '');

    let bitLength = 0;
    if (baseType.startsWith('u')) bitLength = parseInt(baseType.slice(1));
    else if (baseType.startsWith('bits')) bitLength = parseInt(baseType.slice(4));
    else throw new Error(`Invalid type string: ${typeStr}`);

    return arrayLength 
        ? { bitLength, array: { length: arrayLength } } 
        : { bitLength };
}

export interface BitPackerOptions {
    /**
     * If true, bitfields are packed LSB-first (first field in least significant bits).
     * If false (default), bitfields are packed MSB-first (first field in most significant bits).
     *
     * Example:
     *   packLSBFirst: true  => bits4[2] with values [0x1, 0x2] => 0x21 in bucket
     *   packLSBFirst: false => bits4[2] with values [0xA, 0xB] => 0xAB in bucket
     */
    packLSBFirst?: boolean;

    /**
     * If true, multi-byte fields (u16, u24, u32) are stored in little-endian order.
     * Defaults to the machine's endianness if not specified.
     * Note: This only affects multi-byte fields, not the bucket order.
     *
     * Example:
     *   littleEndian: true  => u16 value 0x1234 => [0x34, 0x12]
     *   littleEndian: false => u16 value 0x1234 => [0x12, 0x34]
     */
    littleEndian?: boolean;

    /**The bucket size in bytes */
    alignment?: number;    
}

export class BitPacker<const T extends readonly BitField[]> {
    static isLittleEndian = isMachineLittleEndian();
    private alignment: number;
    private packLSBFirst: boolean;
    
    public readonly descriptors: Record<string, FieldDescriptor> = {};
    public readonly accessors: Record<string, FieldAccessor | ArrayAccessor> = {};
    public readonly stride: number;

    constructor(fields: T, { alignment = 4, packLSBFirst = true, littleEndian } :BitPackerOptions = {}) {
        this.alignment = alignment;
        this.packLSBFirst = packLSBFirst;
        littleEndian ??= BitPacker.isLittleEndian;
        
        const bucketSizeInBits = this.alignment * 8;
        let bucketIndex = 0;
        let offsetInBucket = 0;

        for (const field of fields) {
            if ("align" in field) {
                if (offsetInBucket !== 0) {
                    bucketIndex++;
                    offsetInBucket = 0;
                }
                continue;
            }

            const { bitLength, array } = parseType(field.type);
            const isArray = !!array;

            // Spill Rule
            if (isArray || (offsetInBucket + bitLength > bucketSizeInBits)) {
                if (offsetInBucket > 0) {
                    bucketIndex++;
                    offsetInBucket = 0;
                }
            }

            const descriptor: FieldDescriptor = {
                bitLength,
                bucket: {
                    index: bucketIndex,
                    offsetInBucket: packLSBFirst ? offsetInBucket : bucketSizeInBits - offsetInBucket - bitLength,
                    sizeInBytes: this.alignment
                },
                packLSBFirst,
                littleEndian: field.littleEndian ?? littleEndian,
                array: array ? { ...array, elementsPerBucket: Math.floor(bucketSizeInBits / bitLength) } : undefined
            };

            this.descriptors[field.name] = descriptor;
            this.accessors[field.name] = createAccessor(descriptor);

            // Advance
            if (isArray) {
                const perBucket = descriptor.array!.elementsPerBucket;
                bucketIndex += Math.floor(array.length / perBucket);
                const remainder = array.length % perBucket;
                offsetInBucket = remainder > 0 ? bitLength * remainder : 0;
            } else {
                offsetInBucket += bitLength;
            }

            if (offsetInBucket >= bucketSizeInBits) {
                bucketIndex++;
                offsetInBucket = 0;
            }
        }
        
        this.stride = (bucketIndex + (offsetInBucket > 0 ? 1 : 0)) * this.alignment;
    }

    /** Helper to spawn a typed view directly from the packer */
    createView(buffer: ArrayBuffer, byteOffset = 0): BitView<InferSchema<T>> & InferSchema<T> {
        return new BitView<InferSchema<T>>(this.accessors).setBuffer(buffer, byteOffset, this.packLSBFirst) as any;
    }
}

/** Merged type for the class + the dynamic schema properties */
export interface BitView<T> {
    setBuffer(buffer: ArrayBuffer, byteOffset?: number): this;
    view: DataView;
    byteOffset: number;
}

export class BitView<T = any> {
    private arrayProxies: Record<string, any> = {};
    public packLSBFirst!: boolean;
    public view!: DataView;
    public byteOffset!: number;

    constructor(public accessorsMap: Record<string, FieldAccessor | ArrayAccessor>) {
        // Pre-cache array proxies to maintain referential identity
        for (const key in accessorsMap) {
            const accessor = accessorsMap[key];
            if ("length" in (accessor as any)) {
                this.arrayProxies[key] = this.arrayProxy(accessor as ArrayAccessor);
            }
        }

        return new Proxy(this, {
            get(target, prop: string) {
                if (prop in target) return target[prop];
                const accessor = target.accessorsMap[prop];
                if (!accessor) return target[prop];

                return ("length" in accessor)? target.arrayProxies[prop]: accessor.get(target.view, target.byteOffset);
            },
            set(target, prop: string, value) {
                if (prop in target) {
                    target[prop] = value;
                    return true;
                }

                const accessor = target.accessorsMap[prop];
                if (!accessor) {
                    target[prop] = value; return true;
                }

                if ("length" in accessor) {
                    throw new Error("Cannot assign to array field directly");
                } else {
                    accessor.set(target.view, target.byteOffset, value);
                }

                return true;
            }
        }) as unknown as BitView<T> & T;
    }

    setBuffer(buffer: ArrayBuffer, byteOffset = 0, packLSBFirst = true): this {
        this.view = new DataView(buffer);
        this.byteOffset = byteOffset;
        this.packLSBFirst = packLSBFirst;
        return this;
    }

    private arrayProxy(accessor: ArrayAccessor) {
        return new Proxy([], {
            get: (target, prop) => {
                if (prop === "length") {
                    return accessor.length;
                }
                const index = Number(prop);
                return isNaN(index) ? target[prop] : accessor.get(this.view, this.byteOffset, index);
            },
            set: (target, prop, value) => {
                const index = Number(prop);
                if (isNaN(index)) { target[prop] = value; return true; }
                accessor.set(this.view, this.byteOffset, index, value);
                return true;
            }
        });
    }
}