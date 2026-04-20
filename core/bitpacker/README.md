# BitPacker README

## Overview
BitPacker is a TypeScript utility for packing and unpacking bitfields and typed fields into fixed-size buckets (typically 32 bits, 4 bytes). It is designed for efficient, schema-driven serialization of structured data, such as for GPU uploads, network protocols, or compact storage.

## Key Features
- Schema-driven: Define fields and their types in a schema array.
- Supports bitfields (e.g., bits4, bits12), arrays (e.g., bits4[2]), and standard integer types (u8, u16, u32, etc.).
- Handles alignment and padding.
- Customizable bit packing order (LSB-first or MSB-first).
- Handles endianness for multi-byte fields.
- TypeScript types for schema and options.

## Packing Logic & Quirks
- **Bucket Order:** Buckets are always stored in big-endian order (most significant byte at the lowest address: `[MSB, ..., LSB]`).
- **Bit Packing:**
  - For bitfields (e.g., bits4, bits12), the packing order within the bucket is controlled by the `packLSBFirst` option.
  - For `packLSBFirst: false` (MSB-first), the first field occupies the most significant bits of the bucket.
  - For `packLSBFirst: true` (LSB-first), the first field occupies the least significant bits.
- **Multi-byte Fields:**
  - For fields occupying 2, 3, or 4 bytes (e.g., u16, u24, u32), the field's endianness is respected according to the `littleEndian` option (default: false, i.e., big-endian).
  - For bitfields, the bucket is always big-endian, but the field's value may be byte-swapped if `littleEndian: true`.
- **Accessors:**
  - All fields are accessed via generated getters/setters on the view object.
  - For unsigned fields, use `>>> 0` to force unsigned interpretation if needed.
- **Alignment:**
  - Use `{ align: N }` in the schema to align the next field to the next N-byte boundary.

## Example Usage
```ts
import { BitPacker } from "@core/bitpacker";

const schema = [
  { name: "flags", type: "bits4[2]" },
  { name: "value", type: "u16", littleEndian: true },
  { align: 4 },
  { name: "payload", type: "u8[2]" }
] as const;

const packer = new BitPacker(schema, { packLSBFirst: false });
const view = packer.createView(new ArrayBuffer(packer.stride));
view.flags[0] = 0xA;
view.flags[1] = 0xB;
view.value = 0x1234;
view.payload[0] = 0xAA;
view.payload[1] = 0xBB;
```

## BitPacker Options (TypeScript)
```ts
interface BitPackerOptions {
  /**
   * If true, bitfields are packed LSB-first (first field in least significant bits).
   * If false (default), bitfields are packed MSB-first (first field in most significant bits).
   */
  packLSBFirst?: boolean;

  /**
   * If true, multi-byte fields (u16, u24, u32) are stored in little-endian order.
   * If false (default), multi-byte fields are stored in big-endian order.
   * Note: This only affects multi-byte fields, not the bucket order.
   */
  littleEndian?: boolean;
}
```

## Field Types
- `u8`, `u16`, `u32`: Unsigned integer fields (1, 2, or 4 bytes)
- `bitsN`: Bitfield of N bits (e.g., bits4, bits12, bits24, bits32)
- `bitsN[M]`: Array of M bitfields, each N bits wide
- `u8[M]`, `u16[M]`, `u32[M]`: Array of unsigned integers
- `{ align: N }`: Align next field to N-byte boundary

## Common Pitfalls & Quirks
- Buckets are always big-endian; only multi-byte fields are affected by `littleEndian`.
- For bitfields, the order of bits within the bucket is controlled by `packLSBFirst`.
- When reading unsigned values, use `>>> 0` to avoid negative numbers due to JavaScript's signed 32-bit integer representation.