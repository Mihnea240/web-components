


import { BitPacker } from "@core/bitpacker";

const log = (msg: string) => console.log(`[TEST] ${msg}`);
const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
};

function assertBytesEqual(actual: Uint8Array, expected: number[], label: string) {
    assert(actual.length >= expected.length, `${label}: Buffer too small`);
    for (let i = 0; i < expected.length; ++i) {
        assert(actual[i] === expected[i], `${label}: Byte ${i} expected 0x${expected[i].toString(16)}, got 0x${actual[i].toString(16)}`);
    }
}

// --- TEST SUITE ---
const tests: (() => void)[] = [];

// 1. Single 8-bit field, LE
tests.push(() => {
    log("Single 8-bit field, LE");
    const schema = [{ name: "f", type: "u8" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.f = 0x42;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0, 0, 0, 0x42], "u8 LE");
    assert(view.f === 0x42, "Accessor failed");
});

// 2. Single 16-bit field, LE
tests.push(() => {
    log("Single 16-bit field, LE");
    const schema = [{ name: "f", type: "u16" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.f = 0x1234;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0, 0, 0x34, 0x12], "u16 LE");
    assert(view.f === 0x1234, "Accessor failed");
});

// 3. Single 32-bit field, LE
tests.push(() => {
    log("Single 32-bit field, LE");
    const schema = [{ name: "f", type: "u32" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.f = 0xCAFEBABE;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xBE, 0xBA, 0xFE, 0xCA], "u32 LE");
    assert(view.f >>> 0 === 0xCAFEBABE, "Accessor failed");
});

// 4. bits4[2], packLSBFirst: true
tests.push(() => {
    log("bits4[2], packLSBFirst: true");
    const schema = [{ name: "flags", type: "bits4[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: true });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.flags[0] = 0x1;
    view.flags[1] = 0x2;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0, 0, 0, 0x21], "bits4[2] LSBFirst");
    assert(view.flags[0] === 0x1 && view.flags[1] === 0x2, "Accessor failed");
});

// 5. bits4[2], packLSBFirst: false (MSBFirst)
tests.push(() => {
    log("bits4[2], packLSBFirst: false (MSBFirst)");
    const schema = [{ name: "flags", type: "bits4[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.flags[0] = 0xA;
    view.flags[1] = 0xB;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xAB, 0, 0, 0], "bits4[2] MSBFirst");
    assert(view.flags[0] === 0xA && view.flags[1] === 0xB, "Accessor failed");
});

// 6. bits8[4], packLSBFirst: true
tests.push(() => {
    log("bits8[4], packLSBFirst: true");
    const schema = [{ name: "arr", type: "bits8[4]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: true });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0x11;
    view.arr[1] = 0x22;
    view.arr[2] = 0x33;
    view.arr[3] = 0x44;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0x44, 0x33, 0x22, 0x11], "bits8[4] LSBFirst");
    for (let i = 0; i < 4; ++i) assert(view.arr[i] === (i+1)*0x11, "Accessor failed");
});

// 7. bits8[4], packLSBFirst: false
tests.push(() => {
    log("bits8[4], packLSBFirst: false");
    const schema = [{ name: "arr", type: "bits8[4]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0xAA;
    view.arr[1] = 0xBB;
    view.arr[2] = 0xCC;
    view.arr[3] = 0xDD;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xAA, 0xBB, 0xCC, 0xDD], "bits8[4] MSBFirst");
    for (let i = 0; i < 4; ++i) assert(view.arr[i] === 0xAA + i*0x11, "Accessor failed");
});

// 8. bits12[2], packLSBFirst: true (cross-byte)
tests.push(() => {
    log("bits12[2], packLSBFirst: true");
    const schema = [{ name: "arr", type: "bits12[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: true });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0xABC;
    view.arr[1] = 0xDEF;
    const bytes = new Uint8Array(view.view.buffer);
    // 0xDEF << 12 | 0xABC = 0xDEFABC, so bytes: [0x0D, 0xEF, 0xAB, 0xC0]
    assertBytesEqual(bytes, [0, 0xDE, 0xFA, 0xBC], "bits12[2] LSBFirst");
    assert(view.arr[0] === 0xABC && view.arr[1] === 0xDEF, "Accessor failed");
});

// 9. bits12[2], packLSBFirst: false (cross-byte)
tests.push(() => {
    log("bits12[2], packLSBFirst: false");
    const schema = [{ name: "arr", type: "bits12[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0x123;
    view.arr[1] = 0x456;
    const bytes = new Uint8Array(view.view.buffer);
    // 0x123 in MSB, 0x456 in LSB: [0x12, 0x30, 0x45, 0x60]
    assertBytesEqual(bytes, [0x12, 0x34, 0x56, 0x00], "bits12[2] MSBFirst");
    assert(view.arr[0] === 0x123 && view.arr[1] === 0x456, "Accessor failed");
});

// 10. bits4, bits4, bits8, packLSBFirst: true
tests.push(() => {
    log("bits4, bits4, bits8, packLSBFirst: true");
    const schema = [
        { name: "a", type: "bits4" },
        { name: "b", type: "bits4" },
        { name: "c", type: "bits8" }
    ] as const;
    const packer = new BitPacker(schema, { packLSBFirst: true });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.a = 0xA;
    view.b = 0xB;
    view.c = 0xCC;
    const bytes = new Uint8Array(view.view.buffer);
    // a=0xA, b=0xB, c=0xCC: [0, 0, 0xBA, 0xCC]
    assertBytesEqual(bytes, [0, 0, 0xCC, 0xBA], "bits4+bits4+bits8 LSBFirst");
    assert(view.a === 0xA && view.b === 0xB && view.c === 0xCC, "Accessor failed");
});

// 11. bits4, bits4, bits8, packLSBFirst: false
tests.push(() => {
    log("bits4, bits4, bits8, packLSBFirst: false");
    const schema = [
        { name: "a", type: "bits4" },
        { name: "b", type: "bits4" },
        { name: "c", type: "bits8" }
    ] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.a = 0x1;
    view.b = 0x2;
    view.c = 0x33;
    const bytes = new Uint8Array(view.view.buffer);
    // a=0x1, b=0x2, c=0x33: [0, 0, 0x12, 0x33]
    assertBytesEqual(bytes, [0x12, 0x33, 0, 0], "bits4+bits4+bits8 MSBFirst");
    assert(view.a === 0x1 && view.b === 0x2 && view.c === 0x33, "Accessor failed");
});

// 12. bits16[2], packLSBFirst: true
tests.push(() => {
    log("bits16[2], packLSBFirst: true");
    const schema = [{ name: "arr", type: "bits16[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: true });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0x1234;
    view.arr[1] = 0x5678;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0x78, 0x56, 0x34, 0x12], "bits16[2] LSBFirst");
    assert(view.arr[0] === 0x1234 && view.arr[1] === 0x5678, "Accessor failed");
});

// 13. bits16[2], packLSBFirst: false
tests.push(() => {
    log("bits16[2], packLSBFirst: false");
    const schema = [{ name: "arr", type: "bits16[2]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0xAAAA;
    view.arr[1] = 0xBBBB;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xAA, 0xAA, 0xBB, 0xBB], "bits16[2] MSBFirst");
    assert(view.arr[0] === 0xAAAA && view.arr[1] === 0xBBBB, "Accessor failed");
});

// 14. Alignment: bits4, align:4, u8[2]
tests.push(() => {
    log("Alignment: bits4, align:4, u8[2]");
    const schema = [
        { name: "header", type: "bits4" },
        { align: 4 },
        { name: "payload", type: "u8[2]" }
    ] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.header = 0xF;
    view.payload[0] = 0xAA;
    view.payload[1] = 0xBB;
    const bytes = new Uint8Array(view.view.buffer);
    assert((bytes[0] >> 4) === 0xF, "Header bits misplaced");
    assert(bytes[4] === 0xAA, "Aligned array index 0 failed");
    assert(bytes[5] === 0xBB, "Aligned array index 1 failed");
});

// 15. bits12[4] spanning buckets
tests.push(() => {
    log("bits12[4] spanning buckets");
    const schema = [{ name: "data", type: "bits12[4]" }] as const;
    const packer = new BitPacker(schema, { packLSBFirst: false });
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.data[0] = 0xAAA;
    view.data[1] = 0xBBB;
    view.data[2] = 0xCCC;
    view.data[3] = 0xDDD;
    assert(view.data[0] === 0xAAA, "Index 0 corruption");
    assert(view.data[1] === 0xBBB, "Index 1 corruption");
    assert(view.data[2] === 0xCCC, "Index 2 corruption");
    assert(view.data[3] === 0xDDD, "Index 3 corruption");
});

// 16. Full bucket, bits32[1]
tests.push(() => {
    log("Full bucket, bits32[1]");
    const schema = [{ name: "f", type: "bits32" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.f = 0xDEADBEEF;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xEF, 0xBE, 0xAD, 0xDE], "bits32 full bucket");
    assert(view.f >>> 0 === 0xDEADBEEF, "Accessor failed");
});

// 17. Partial bucket, bits24
tests.push(() => {
    log("Partial bucket, bits24");
    const schema = [{ name: "f", type: "bits24" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.f = 0x123456;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0x00, 0x56, 0x34, 0x12], "bits24 partial bucket");
    assert(view.f === 0x123456, "Accessor failed");
});

// 18. Array crossing buckets, bits16[3]
tests.push(() => {
    log("Array crossing buckets, bits16[3]");
    const schema = [{ name: "arr", type: "bits16[3]" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    view.arr[0] = 0x1111;
    view.arr[1] = 0x2222;
    view.arr[2] = 0x3333;
    assert(view.arr[0] === 0x1111, "arr[0] fail");
    assert(view.arr[1] === 0x2222, "arr[1] fail");
    assert(view.arr[2] === 0x3333, "arr[2] fail");
});

// 19. bits1[32], all bits set
tests.push(() => {
    log("bits1[32], all bits set");
    const schema = [{ name: "arr", type: "bits1[32]" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    for (let i = 0; i < 32; ++i) view.arr[i] = 1;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0xFF, 0xFF, 0xFF, 0xFF], "bits1[32] all set");
    for (let i = 0; i < 32; ++i) assert(view.arr[i] === 1, `arr[${i}] fail`);
});

// 20. bits1[32], all bits clear
tests.push(() => {
    log("bits1[32], all bits clear");
    const schema = [{ name: "arr", type: "bits1[32]" }] as const;
    const packer = new BitPacker(schema);
    const view = packer.createView(new ArrayBuffer(packer.stride));
    for (let i = 0; i < 32; ++i) view.arr[i] = 0;
    const bytes = new Uint8Array(view.view.buffer);
    assertBytesEqual(bytes, [0x00, 0x00, 0x00, 0x00], "bits1[32] all clear");
    for (let i = 0; i < 32; ++i) assert(view.arr[i] === 0, `arr[${i}] fail`);
});

// --- RUN ALL TESTS ---
try {
    for (const t of tests) t();
    console.log("\n[COMPLETE] ALL BITPACKER TESTS PASSED.");
} catch (e) {
    console.error("\n[FATAL] TEST SUITE FAILED:");
    console.error(e);
}