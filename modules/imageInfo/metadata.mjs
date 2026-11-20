//@ts-check
"use strict";

// modules/imageInfo/metadata.mjs
// Metadata of an image file — read from the bytes the browser has already loaded (the cache of the page,
// a data: or blob: address, in Firefox the response captured while it loaded), never downloaded again.
// Pure functions without DOM and chrome.*: the frame of the page imports the file (collectFrame.mjs),
// the background part in Firefox (the captured responses) and the tests too.
//
// What is read: the format by the signature of the file (not by Content-Type) and its structure — JPEG
// (JFIF, EXIF with GPS and the thumbnail, XMP, IPTC-IIM and the Photoshop resources, ICC profile, Adobe,
// Ducky, MPF, C2PA, the frame header and an estimate of the quality from the quantization table), PNG and
// APNG (all chunks: text, iCCP, eXIf, pHYs, tIME, cICP, acTL, …), GIF (frames, loop, comments, XMP), WebP
// (VP8, VP8L, VP8X, animation, ICC, EXIF, XMP), AVIF and HEIF (ISOBMFF: brands, the properties of the
// primary item, the Exif and XMP items), JPEG XL (the codestream and its container with Exif and XMP),
// JPEG 2000, TIFF, SVG (also gzipped), BMP, ICO and CUR, PSD and QOI.
//
// The result (Types.ImageInfo.Metadata) is plain data: groups of entries [name, value as text] — EXIF tags
// under the names exiftool uses, XMP properties under prefix:name — plus a summary of the most common
// values (camera, lens, date, GPS position, …) for the listing. Everything is bounded: every read checks the
// length (a cut or broken file gives a warning, never an exception or an endless loop), the number of
// entries, the length of a text and of decompressed data are limited — the file comes from any website.

// The longest text value (characters) and the most entries of one file.
export const MAX_TEXT = 2000;
export const MAX_ENTRIES = 1500;
// The most entries of one TIFF directory, chunks/boxes/blocks of one file and nodes of one XML packet.
const MAX_IFD_ENTRIES = 1000;
const MAX_STRUCTURES = 20000;
const MAX_XML_NODES = 5000;
// The most entries one XMP packet gives (Photoshop writes its whole edit history there).
export const MAX_XMP_ENTRIES = 400;
// MAX_ENTRIES and MAX_XMP_ENTRIES are the defaults — the settings of imageInfo change them (options of
// parseImageMetadata(), see METADATA_LIMITS in module.mjs).
// The largest XMP packet and the largest decompressed data (zTXt, iCCP, SVGZ) that is read.
const MAX_XML_BYTES = 512 * 1024;
const MAX_INFLATE_BYTES = 1024 * 1024;
// The most values of one EXIF tag that are listed.
const MAX_LISTED_VALUES = 16;

/** A read outside the data — the file (or its part) is shorter than its structure says. */
class Truncated extends RangeError {}

// --- Reading bytes ---

/** @type {Functions.ImageInfo.Metadata.need} */
function need(bytes, offset, length) {
	if (!Number.isInteger(offset) || offset < 0 || length < 0 || offset + length > bytes.length) throw new Truncated("truncated");
}

/** @type {Functions.ImageInfo.Metadata.u8} */
function u8(bytes, offset) {
	need(bytes, offset, 1);
	return bytes[offset];
}

/** @type {Functions.ImageInfo.Metadata.u16} */
function u16(bytes, offset, le = false) {
	need(bytes, offset, 2);
	return le ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

/** @type {Functions.ImageInfo.Metadata.u24} */
function u24(bytes, offset, le = false) {
	need(bytes, offset, 3);
	return le ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) : (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

/** @type {Functions.ImageInfo.Metadata.u32} */
function u32(bytes, offset, le = false) {
	need(bytes, offset, 4);
	return le
		? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) + bytes[offset + 3] * 0x1000000
		: bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

/** @type {Functions.ImageInfo.Metadata.i32} */
function i32(bytes, offset, le = false) {
	const value = u32(bytes, offset, le);
	return value > 0x7fffffff ? value - 0x100000000 : value;
}

/** @type {Functions.ImageInfo.Metadata.u64} */
function u64(bytes, offset) {
	return u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4);
}

// Bytes as text, one character per byte (four-character codes, signatures).
/** @type {Functions.ImageInfo.Metadata.ascii} */
function ascii(bytes, offset, length) {
	need(bytes, offset, length);
	let text = "";
	for (let index = offset; index < offset + length; index++) text += String.fromCharCode(bytes[index]);
	return text;
}

/** @type {Functions.ImageInfo.Metadata.startsWith} */
function startsWith(bytes, offset, signature) {
	if (offset < 0 || offset + signature.length > bytes.length) return false;
	for (let index = 0; index < signature.length; index++) if (bytes[offset + index] !== signature.charCodeAt(index)) return false;
	return true;
}

// Bytes as text in the encoding; invalid sequences become U+FFFD.
/** @type {Functions.ImageInfo.Metadata.decode} */
function decode(bytes, encoding = "utf-8") {
	try {
		return new TextDecoder(encoding).decode(bytes);
	} catch {
		return new TextDecoder("utf-8").decode(bytes);
	}
}

// UTF-8 when the bytes are valid UTF-8, otherwise windows-1252 (old IPTC, PNG tEXt in practice).
/** @type {Functions.ImageInfo.Metadata.decodeGuess} */
function decodeGuess(bytes) {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return decode(bytes, "windows-1252");
	}
}

// The position of the first zero byte from offset (the end of a C string), or end.
/** @type {Functions.ImageInfo.Metadata.zeroAt} */
function zeroAt(bytes, offset, end = bytes.length) {
	for (let index = offset; index < end; index++) if (bytes[index] === 0) return index;
	return end;
}

// Inflates zlib ("deflate") or gzip data, at most MAX_INFLATE_BYTES (the rest is cut off).
/** @type {Functions.ImageInfo.Metadata.inflate} */
async function inflate(bytes, format = "deflate") {
	if (typeof DecompressionStream !== "function") throw new Error("DecompressionStream");
	const reader = new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (bytes)]).stream().pipeThrough(new DecompressionStream(format)).getReader();
	/** @type {Uint8Array[]} */
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.length;
		if (total >= MAX_INFLATE_BYTES) {
			await reader.cancel().catch(() => {});
			break;
		}
	}
	const result = new Uint8Array(Math.min(total, MAX_INFLATE_BYTES));
	let offset = 0;
	for (const chunk of chunks) {
		const part = chunk.subarray(0, result.length - offset);
		result.set(part, offset);
		offset += part.length;
		if (offset >= result.length) break;
	}
	return result;
}

// --- Formatting values ---

// A number with at most 4 decimal places, without trailing zeros.
/** @type {Functions.ImageInfo.Metadata.formatNumber} */
export function formatNumber(value) {
	if (!Number.isFinite(value)) return String(value);
	return String(Math.round(value * 10000) / 10000);
}

/** @type {Functions.ImageInfo.Metadata.ratio} */
function ratio(rational) {
	return rational[1] === 0 ? NaN : rational[0] / rational[1];
}

// An exposure time in seconds: 1/250 s, 0.5 s, 2 s.
/** @type {Functions.ImageInfo.Metadata.formatExposure} */
export function formatExposure(seconds) {
	if (!Number.isFinite(seconds) || seconds <= 0) return formatNumber(seconds);
	if (seconds < 0.25001) return `1/${Math.round(1 / seconds)} s`;
	return `${formatNumber(seconds)} s`;
}

/** @type {Functions.ImageInfo.Metadata.formatAperture} */
function formatAperture(value) {
	return Number.isFinite(value) ? `f/${formatNumber(Math.round(value * 10) / 10)}` : "";
}

// A position in degrees as D° M' S" with the hemisphere.
/** @type {Functions.ImageInfo.Metadata.formatDms} */
export function formatDms(degrees, positive, negative) {
	const absolute = Math.abs(degrees);
	let whole = Math.floor(absolute);
	let minutes = Math.floor((absolute - whole) * 60);
	let seconds = Math.round(((absolute - whole) * 60 - minutes) * 60 * 100) / 100;
	if (seconds >= 60) {
		seconds = 0;
		minutes++;
	}
	if (minutes >= 60) {
		minutes = 0;
		whole++;
	}
	return `${whole}° ${minutes}' ${seconds.toFixed(2)}" ${degrees < 0 ? negative : positive}`;
}

// Text without control characters (except a tab and a line break), trimmed and shortened to MAX_TEXT.
/** @type {Functions.ImageInfo.Metadata.cleanText} */
export function cleanText(value) {
	// eslint-disable-next-line no-control-regex
	const text = value.replace(/\u0000+$/, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** @type {Functions.ImageInfo.Metadata.hex} */
function hex(bytes) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// --- The result being built ---

/** @type {Functions.ImageInfo.Metadata.createContext} */
function createContext(bytes, complete, limits) {
	return {
		bytes,
		limits,
		meta: {
			format: null,
			mime: null,
			width: null,
			height: null,
			animated: false,
			frames: null,
			complete,
			size: bytes.length,
			summary: {
				camera: null,
				lens: null,
				taken: null,
				software: null,
				author: null,
				copyright: null,
				title: null,
				description: null,
				gps: null,
				place: null,
				orientation: null,
				colorProfile: null,
				quality: null,
				bitDepth: null,
				colorType: null,
			},
			groups: [],
			warnings: [],
		},
		groups: new Map(),
		first: new Map(),
		warnings: new Set(),
		count: 0,
		gps: {},
		depth: 0,
	};
}

// One entry into a group; an empty value is left out. The first value of every name is noted for the
// summary.
/** @type {Functions.ImageInfo.Metadata.add} */
function add(ctx, group, name, value) {
	if (value === null || value === undefined) return;
	const text = cleanText(typeof value === "string" ? value : String(value));
	if (!text) return;
	if (ctx.count >= ctx.limits.maxEntries) {
		ctx.warnings.add("limit");
		return;
	}
	ctx.count++;
	let entries = ctx.groups.get(group);
	if (!entries) {
		entries = [];
		ctx.groups.set(group, entries);
	}
	entries.push([name, text]);
	if (!ctx.first.has(name)) ctx.first.set(name, text);
}

/** @type {Functions.ImageInfo.Metadata.setFormat} */
function setFormat(ctx, format, mime) {
	ctx.meta.format = format;
	ctx.meta.mime = mime;
}

/** @type {Functions.ImageInfo.Metadata.setSize} */
function setSize(ctx, width, height) {
	if (ctx.meta.width === null && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		ctx.meta.width = width;
		ctx.meta.height = height;
	}
}

// Runs one part of the parsing; an error is only a warning — the other parts are read anyway.
/** @type {Functions.ImageInfo.Metadata.attempt} */
async function attempt(ctx, part, work) {
	try {
		await work();
	} catch (err) {
		ctx.warnings.add(`${err instanceof Truncated ? "truncated" : "corrupt"}:${part}`);
	}
}

// --- TIFF / EXIF ---

/** Byte sizes of the TIFF field types (1 BYTE … 13 IFD). */
const TIFF_TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];

/** @type {Readonly<Record<string, Readonly<Record<number, string>>>>} */
const ENUMS = {
	orientation: {
		1: "Horizontal (normal)",
		2: "Mirror horizontal",
		3: "Rotate 180",
		4: "Mirror vertical",
		5: "Mirror horizontal and rotate 270 CW",
		6: "Rotate 90 CW",
		7: "Mirror horizontal and rotate 90 CW",
		8: "Rotate 270 CW",
	},
	resolutionUnit: { 1: "None", 2: "inches", 3: "cm", 4: "mm", 5: "µm" },
	yCbCrPositioning: { 1: "Centered", 2: "Co-sited" },
	compression: {
		1: "Uncompressed",
		2: "CCITT 1D",
		3: "T4/Group 3 Fax",
		4: "T6/Group 4 Fax",
		5: "LZW",
		6: "JPEG (old-style)",
		7: "JPEG",
		8: "Adobe Deflate",
		32773: "PackBits",
		32946: "Deflate",
		34712: "JPEG 2000",
		34892: "Lossy JPEG",
		50001: "WebP",
	},
	photometric: {
		0: "WhiteIsZero",
		1: "BlackIsZero",
		2: "RGB",
		3: "RGB Palette",
		4: "Transparency Mask",
		5: "CMYK",
		6: "YCbCr",
		8: "CIELab",
		32803: "Color Filter Array",
		34892: "Linear Raw",
	},
	planar: { 1: "Chunky", 2: "Planar" },
	exposureProgram: {
		0: "Not Defined",
		1: "Manual",
		2: "Program AE",
		3: "Aperture-priority AE",
		4: "Shutter speed priority AE",
		5: "Creative (Slow speed)",
		6: "Action (High speed)",
		7: "Portrait",
		8: "Landscape",
		9: "Bulb",
	},
	meteringMode: { 0: "Unknown", 1: "Average", 2: "Center-weighted average", 3: "Spot", 4: "Multi-spot", 5: "Multi-segment", 6: "Partial", 255: "Other" },
	lightSource: {
		0: "Unknown",
		1: "Daylight",
		2: "Fluorescent",
		3: "Tungsten (Incandescent)",
		4: "Flash",
		9: "Fine Weather",
		10: "Cloudy",
		11: "Shade",
		12: "Daylight Fluorescent",
		13: "Day White Fluorescent",
		14: "Cool White Fluorescent",
		15: "White Fluorescent",
		16: "Warm White Fluorescent",
		17: "Standard Light A",
		18: "Standard Light B",
		19: "Standard Light C",
		20: "D55",
		21: "D65",
		22: "D75",
		23: "D50",
		24: "ISO Studio Tungsten",
		255: "Other",
	},
	colorSpace: { 1: "sRGB", 2: "Adobe RGB", 65533: "Wide Gamut RGB", 65534: "ICC Profile", 65535: "Uncalibrated" },
	sensingMethod: {
		1: "Not defined",
		2: "One-chip color area",
		3: "Two-chip color area",
		4: "Three-chip color area",
		5: "Color sequential area",
		7: "Trilinear",
		8: "Color sequential linear",
	},
	fileSource: { 1: "Film Scanner", 2: "Reflection Print Scanner", 3: "Digital Camera" },
	sceneType: { 1: "Directly photographed" },
	customRendered: { 0: "Normal", 1: "Custom" },
	exposureMode: { 0: "Auto", 1: "Manual", 2: "Auto bracket" },
	whiteBalance: { 0: "Auto", 1: "Manual" },
	sceneCaptureType: { 0: "Standard", 1: "Landscape", 2: "Portrait", 3: "Night", 4: "Other" },
	gainControl: { 0: "None", 1: "Low gain up", 2: "High gain up", 3: "Low gain down", 4: "High gain down" },
	contrast: { 0: "Normal", 1: "Low", 2: "High" },
	sharpness: { 0: "Normal", 1: "Soft", 2: "Hard" },
	subjectDistanceRange: { 0: "Unknown", 1: "Macro", 2: "Close", 3: "Distant" },
	sensitivityType: {
		0: "Unknown",
		1: "Standard Output Sensitivity",
		2: "Recommended Exposure Index",
		3: "ISO Speed",
		4: "Standard Output Sensitivity and Recommended Exposure Index",
		5: "Standard Output Sensitivity and ISO Speed",
		6: "Recommended Exposure Index and ISO Speed",
		7: "Standard Output Sensitivity, Recommended Exposure Index and ISO Speed",
	},
	altitudeRef: { 0: "Above Sea Level", 1: "Below Sea Level" },
	compositeImage: { 0: "Unknown", 1: "Not a Composite Image", 2: "General Composite Image", 3: "Composite Image Captured While Shooting" },
	differential: { 0: "No Correction", 1: "Differential Corrected" },
};

// The tags of the TIFF directories: [name, how to show the value]. The value kinds: "enum:<ENUMS key>",
// "exposure", "fnumber", "mm", "apexShutter", "apexAperture", "ev", "meters", "version", "components",
// "userComment", "xp", "lensInfo", "binary", "flash", "gpsCoord", "gpsTime", "gpsVersion", "gpsAltitude",
// "skip" (offsets of the image data — only the number of values); without a kind by the field type.
/** @type {Readonly<Record<number, readonly [string, string?]>>} */
const IFD0_TAGS = {
	0x00fe: ["SubfileType"],
	0x0100: ["ImageWidth"],
	0x0101: ["ImageHeight"],
	0x0102: ["BitsPerSample"],
	0x0103: ["Compression", "enum:compression"],
	0x0106: ["PhotometricInterpretation", "enum:photometric"],
	0x010a: ["FillOrder"],
	0x010d: ["DocumentName"],
	0x010e: ["ImageDescription"],
	0x010f: ["Make"],
	0x0110: ["Model"],
	0x0111: ["StripOffsets", "skip"],
	0x0112: ["Orientation", "enum:orientation"],
	0x0115: ["SamplesPerPixel"],
	0x0116: ["RowsPerStrip"],
	0x0117: ["StripByteCounts", "skip"],
	0x011a: ["XResolution"],
	0x011b: ["YResolution"],
	0x011c: ["PlanarConfiguration", "enum:planar"],
	0x0128: ["ResolutionUnit", "enum:resolutionUnit"],
	0x012d: ["TransferFunction", "skip"],
	0x0131: ["Software"],
	0x0132: ["ModifyDate"],
	0x013b: ["Artist"],
	0x013c: ["HostComputer"],
	0x013e: ["WhitePoint"],
	0x013f: ["PrimaryChromaticities"],
	0x0140: ["ColorMap", "skip"],
	0x0142: ["TileWidth"],
	0x0143: ["TileLength"],
	0x0144: ["TileOffsets", "skip"],
	0x0145: ["TileByteCounts", "skip"],
	0x014a: ["SubIFDs", "skip"],
	0x0152: ["ExtraSamples"],
	0x0153: ["SampleFormat"],
	0x0201: ["ThumbnailOffset"],
	0x0202: ["ThumbnailLength"],
	0x0211: ["YCbCrCoefficients"],
	0x0212: ["YCbCrSubSampling"],
	0x0213: ["YCbCrPositioning", "enum:yCbCrPositioning"],
	0x0214: ["ReferenceBlackWhite"],
	0x4746: ["Rating"],
	0x4749: ["RatingPercent"],
	0x8298: ["Copyright"],
	0x882a: ["TimeZoneOffset"],
	0x9c9b: ["XPTitle", "xp"],
	0x9c9c: ["XPComment", "xp"],
	0x9c9d: ["XPAuthor", "xp"],
	0x9c9e: ["XPKeywords", "xp"],
	0x9c9f: ["XPSubject", "xp"],
	0xc4a5: ["PrintIM", "binary"],
	0xc612: ["DNGVersion"],
	0xc614: ["UniqueCameraModel"],
	0xea1c: ["Padding", "binary"],
	0xea1d: ["OffsetSchema"],
};

/** @type {Readonly<Record<number, readonly [string, string?]>>} */
const EXIF_TAGS = {
	0x829a: ["ExposureTime", "exposure"],
	0x829d: ["FNumber", "fnumber"],
	0x8822: ["ExposureProgram", "enum:exposureProgram"],
	0x8824: ["SpectralSensitivity"],
	0x8827: ["ISO"],
	0x8828: ["OECF", "binary"],
	0x8830: ["SensitivityType", "enum:sensitivityType"],
	0x8831: ["StandardOutputSensitivity"],
	0x8832: ["RecommendedExposureIndex"],
	0x8833: ["ISOSpeed"],
	0x9000: ["ExifVersion", "version"],
	0x9003: ["DateTimeOriginal"],
	0x9004: ["CreateDate"],
	0x9010: ["OffsetTime"],
	0x9011: ["OffsetTimeOriginal"],
	0x9012: ["OffsetTimeDigitized"],
	0x9101: ["ComponentsConfiguration", "components"],
	0x9102: ["CompressedBitsPerPixel"],
	0x9201: ["ShutterSpeedValue", "apexShutter"],
	0x9202: ["ApertureValue", "apexAperture"],
	0x9203: ["BrightnessValue"],
	0x9204: ["ExposureCompensation", "ev"],
	0x9205: ["MaxApertureValue", "apexAperture"],
	0x9206: ["SubjectDistance", "meters"],
	0x9207: ["MeteringMode", "enum:meteringMode"],
	0x9208: ["LightSource", "enum:lightSource"],
	0x9209: ["Flash", "flash"],
	0x920a: ["FocalLength", "mm"],
	0x9214: ["SubjectArea"],
	0x927c: ["MakerNote", "binary"],
	0x9286: ["UserComment", "userComment"],
	0x9290: ["SubSecTime"],
	0x9291: ["SubSecTimeOriginal"],
	0x9292: ["SubSecTimeDigitized"],
	0x9400: ["AmbientTemperature"],
	0x9401: ["Humidity"],
	0x9402: ["Pressure"],
	0x9403: ["WaterDepth"],
	0x9404: ["Acceleration"],
	0x9405: ["CameraElevationAngle"],
	0xa000: ["FlashpixVersion", "version"],
	0xa001: ["ColorSpace", "enum:colorSpace"],
	0xa002: ["ExifImageWidth"],
	0xa003: ["ExifImageHeight"],
	0xa004: ["RelatedSoundFile"],
	0xa20b: ["FlashEnergy"],
	0xa20e: ["FocalPlaneXResolution"],
	0xa20f: ["FocalPlaneYResolution"],
	0xa210: ["FocalPlaneResolutionUnit", "enum:resolutionUnit"],
	0xa214: ["SubjectLocation"],
	0xa215: ["ExposureIndex"],
	0xa217: ["SensingMethod", "enum:sensingMethod"],
	0xa300: ["FileSource", "enum:fileSource"],
	0xa301: ["SceneType", "enum:sceneType"],
	0xa302: ["CFAPattern", "binary"],
	0xa401: ["CustomRendered", "enum:customRendered"],
	0xa402: ["ExposureMode", "enum:exposureMode"],
	0xa403: ["WhiteBalance", "enum:whiteBalance"],
	0xa404: ["DigitalZoomRatio"],
	0xa405: ["FocalLengthIn35mmFormat", "mm"],
	0xa406: ["SceneCaptureType", "enum:sceneCaptureType"],
	0xa407: ["GainControl", "enum:gainControl"],
	0xa408: ["Contrast", "enum:contrast"],
	0xa409: ["Saturation", "enum:contrast"],
	0xa40a: ["Sharpness", "enum:sharpness"],
	0xa40b: ["DeviceSettingDescription", "binary"],
	0xa40c: ["SubjectDistanceRange", "enum:subjectDistanceRange"],
	0xa420: ["ImageUniqueID"],
	0xa430: ["OwnerName"],
	0xa431: ["SerialNumber"],
	0xa432: ["LensInfo", "lensInfo"],
	0xa433: ["LensMake"],
	0xa434: ["LensModel"],
	0xa435: ["LensSerialNumber"],
	0xa436: ["ImageTitle"],
	0xa437: ["Photographer"],
	0xa438: ["ImageEditor"],
	0xa439: ["CameraFirmware"],
	0xa43a: ["RAWDevelopingSoftware"],
	0xa43b: ["ImageEditingSoftware"],
	0xa43c: ["MetadataEditingSoftware"],
	0xa460: ["CompositeImage", "enum:compositeImage"],
	0xa461: ["CompositeImageCount"],
	0xa462: ["CompositeImageExposureTimes", "binary"],
	0xa500: ["Gamma"],
};

/** @type {Readonly<Record<number, readonly [string, string?]>>} */
const GPS_TAGS = {
	0x0000: ["GPSVersionID", "gpsVersion"],
	0x0001: ["GPSLatitudeRef"],
	0x0002: ["GPSLatitude", "gpsCoord"],
	0x0003: ["GPSLongitudeRef"],
	0x0004: ["GPSLongitude", "gpsCoord"],
	0x0005: ["GPSAltitudeRef", "enum:altitudeRef"],
	0x0006: ["GPSAltitude", "gpsAltitude"],
	0x0007: ["GPSTimeStamp", "gpsTime"],
	0x0008: ["GPSSatellites"],
	0x0009: ["GPSStatus"],
	0x000a: ["GPSMeasureMode"],
	0x000b: ["GPSDOP"],
	0x000c: ["GPSSpeedRef"],
	0x000d: ["GPSSpeed"],
	0x000e: ["GPSTrackRef"],
	0x000f: ["GPSTrack"],
	0x0010: ["GPSImgDirectionRef"],
	0x0011: ["GPSImgDirection"],
	0x0012: ["GPSMapDatum"],
	0x0013: ["GPSDestLatitudeRef"],
	0x0014: ["GPSDestLatitude", "gpsCoord"],
	0x0015: ["GPSDestLongitudeRef"],
	0x0016: ["GPSDestLongitude", "gpsCoord"],
	0x0017: ["GPSDestBearingRef"],
	0x0018: ["GPSDestBearing"],
	0x0019: ["GPSDestDistanceRef"],
	0x001a: ["GPSDestDistance"],
	0x001b: ["GPSProcessingMethod", "userComment"],
	0x001c: ["GPSAreaInformation", "userComment"],
	0x001d: ["GPSDateStamp"],
	0x001e: ["GPSDifferential", "enum:differential"],
	0x001f: ["GPSHPositioningError"],
};

/** @type {Readonly<Record<number, readonly [string, string?]>>} */
const INTEROP_TAGS = {
	0x0001: ["InteropIndex"],
	0x0002: ["InteropVersion", "version"],
	0x1000: ["RelatedImageFileFormat"],
	0x1001: ["RelatedImageWidth"],
	0x1002: ["RelatedImageHeight"],
};

/** @type {Readonly<Record<number, readonly [string, string?]>>} */
const MPF_TAGS = {
	0xb000: ["MPFVersion", "version"],
	0xb001: ["NumberOfImages"],
	0xb002: ["MPImageList", "binary"],
	0xb003: ["ImageUIDList", "binary"],
	0xb004: ["TotalFrames"],
};

/** @type {Readonly<Record<Types.ImageInfo.IfdKind, Readonly<Record<number, readonly [string, string?]>>>>} */
const IFD_TAGS = { ifd0: IFD0_TAGS, ifd1: IFD0_TAGS, exif: EXIF_TAGS, gps: GPS_TAGS, interop: INTEROP_TAGS, mpf: MPF_TAGS };

// The group the entries of a directory go to.
/** @type {Readonly<Record<Types.ImageInfo.IfdKind, string>>} */
const IFD_GROUPS = { ifd0: "exif", exif: "exif", ifd1: "thumbnail", gps: "gps", interop: "interop", mpf: "mpf" };

// The values of one TIFF field — numbers, rationals as [numerator, denominator], or the bytes (BYTE,
// UNDEFINED, ASCII).
/** @type {Functions.ImageInfo.Metadata.readTiffValues} */
function readTiffValues(tiff, type, count, at) {
	const { bytes, le } = tiff;
	if (type === 1 || type === 2 || type === 6 || type === 7) {
		need(bytes, at, count);
		return bytes.subarray(at, at + count);
	}
	/** @type {(number | [number, number])[]} */
	const values = [];
	const listed = Math.min(count, 256);
	for (let index = 0; index < listed; index++) {
		if (type === 3) values.push(u16(bytes, at + index * 2, le));
		else if (type === 8) {
			const value = u16(bytes, at + index * 2, le);
			values.push(value > 0x7fff ? value - 0x10000 : value);
		} else if (type === 4 || type === 13) values.push(u32(bytes, at + index * 4, le));
		else if (type === 9) values.push(i32(bytes, at + index * 4, le));
		else if (type === 5) values.push([u32(bytes, at + index * 8, le), u32(bytes, at + index * 8 + 4, le)]);
		else if (type === 10) values.push([i32(bytes, at + index * 8, le), i32(bytes, at + index * 8 + 4, le)]);
		else if (type === 11) {
			need(bytes, at + index * 4, 4);
			values.push(new DataView(bytes.buffer, bytes.byteOffset + at + index * 4, 4).getFloat32(0, le));
		} else if (type === 12) {
			need(bytes, at + index * 8, 8);
			values.push(new DataView(bytes.buffer, bytes.byteOffset + at + index * 8, 8).getFloat64(0, le));
		}
	}
	return values;
}

/** @type {Functions.ImageInfo.Metadata.toNumbers} */
function toNumbers(values) {
	if (values instanceof Uint8Array) return Array.from(values);
	return values.map((value) => (Array.isArray(value) ? ratio(value) : value));
}

// Bytes that are text (printable ASCII and white space), e.g. in an UNDEFINED field.
/** @type {Functions.ImageInfo.Metadata.isPrintable} */
function isPrintable(bytes) {
	for (const byte of bytes) if (byte !== 0 && (byte < 0x20 || byte > 0x7e) && byte !== 0x0a && byte !== 0x0d && byte !== 0x09) return false;
	return true;
}

// UserComment, GPSProcessingMethod: 8 bytes of the character code, then the text.
/** @type {Functions.ImageInfo.Metadata.readCommentText} */
function readCommentText(bytes, le) {
	const code = ascii(bytes, 0, Math.min(8, bytes.length)).replace(/\0+$/, "");
	const text = bytes.subarray(Math.min(8, bytes.length));
	if (code === "UNICODE") return decode(text, le ? "utf-16le" : "utf-16be");
	if (code === "JIS") return decode(text, "shift_jis");
	return decodeGuess(text);
}

// The value of a field as text by its kind (the tables above) or by its type.
/** @type {Functions.ImageInfo.Metadata.formatTiffValue} */
function formatTiffValue(tiff, kind, type, values) {
	const numbers = () => toNumbers(values);
	const list = (/** @type {string[]} */ items) =>
		items.length > MAX_LISTED_VALUES ? `${items.slice(0, MAX_LISTED_VALUES).join(", ")}, … (${items.length})` : items.join(", ");
	if (kind === "skip") return `(${values.length} values)`;
	if (kind === "binary") return `(binary data, ${values.length} bytes)`;
	if (kind && kind.startsWith("enum:")) {
		const table = ENUMS[kind.slice(5)] || {};
		return list(numbers().map((value) => table[value] ?? String(value)));
	}
	switch (kind) {
		case "exposure":
			return formatExposure(numbers()[0]);
		case "fnumber":
			return formatAperture(numbers()[0]);
		case "mm":
			return `${formatNumber(numbers()[0])} mm`;
		case "apexShutter":
			return formatExposure(2 ** -numbers()[0]);
		case "apexAperture":
			return formatAperture(2 ** (numbers()[0] / 2));
		case "ev": {
			const value = numbers()[0];
			return `${value > 0 ? "+" : ""}${formatNumber(value)} EV`;
		}
		case "meters":
			return `${formatNumber(numbers()[0])} m`;
		case "version": {
			const text = values instanceof Uint8Array ? ascii(values, 0, values.length) : numbers().join(".");
			return /^\d{4}$/.test(text) ? `${Number(text.slice(0, 2))}.${text.slice(2)}` : text;
		}
		case "components": {
			const names = ["-", "Y", "Cb", "Cr", "R", "G", "B"];
			return numbers()
				.map((value) => names[value] ?? String(value))
				.join(", ");
		}
		case "userComment":
			return values instanceof Uint8Array ? readCommentText(values, tiff.le) : "";
		case "xp":
			return values instanceof Uint8Array ? decode(values, "utf-16le") : "";
		case "lensInfo": {
			const [minFocal, maxFocal, minAperture, maxAperture] = numbers();
			if (!Number.isFinite(minFocal)) return "";
			const focal = minFocal === maxFocal ? `${formatNumber(minFocal)}mm` : `${formatNumber(minFocal)}-${formatNumber(maxFocal)}mm`;
			const aperture = !Number.isFinite(minAperture) ? "" : minAperture === maxAperture || !Number.isFinite(maxAperture) ? ` f/${formatNumber(minAperture)}` : ` f/${formatNumber(minAperture)}-${formatNumber(maxAperture)}`;
			return `${focal}${aperture}`;
		}
		case "flash": {
			const value = numbers()[0];
			const parts = [value & 1 ? "Fired" : "No flash"];
			const mode = (value >> 3) & 3;
			if (mode === 1) parts.push("compulsory");
			else if (mode === 2) parts.push("off");
			else if (mode === 3) parts.push("auto");
			const returned = (value >> 1) & 3;
			if (returned === 2) parts.push("return not detected");
			else if (returned === 3) parts.push("return detected");
			if (value & 0x20) parts.push("no flash function");
			if (value & 0x40) parts.push("red-eye reduction");
			return parts.join(", ");
		}
		case "gpsCoord": {
			const [degrees = NaN, minutes = 0, seconds = 0] = numbers();
			return formatDms(degrees + minutes / 60 + seconds / 3600, "", "-").trim();
		}
		case "gpsTime": {
			const [hours = 0, minutes = 0, seconds = 0] = numbers();
			const pad = (/** @type {number} */ value) => String(Math.floor(value)).padStart(2, "0");
			const fraction = seconds % 1 ? formatNumber(seconds % 1).slice(1) : "";
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${fraction} UTC`;
		}
		case "gpsVersion":
			return numbers().join(".");
		case "gpsAltitude":
			return `${formatNumber(numbers()[0])} m`;
		default:
			break;
	}
	if (values instanceof Uint8Array) {
		if (type === 2) return decodeGuess(values.subarray(0, zeroAt(values, 0)));
		if (type === 7 && values.length <= 512 && isPrintable(values)) return ascii(values, 0, values.length);
		if (values.length > MAX_LISTED_VALUES) return `(binary data, ${values.length} bytes)`;
	}
	return list(numbers().map((value) => formatNumber(value)));
}

// One TIFF directory: its tags into the group of its kind, the subdirectories (EXIF, GPS, Interop) and the
// embedded packets (XMP, IPTC, Photoshop, ICC) parsed right away. Returns the offset of the next directory
// (0 = none).
/** @type {Functions.ImageInfo.Metadata.readIfd} */
async function readIfd(ctx, tiff, offset, kind) {
	const at = tiff.start + offset;
	if (offset <= 0 || tiff.visited.has(at) || at >= tiff.end) return 0;
	tiff.visited.add(at);
	const { bytes, le } = tiff;
	const count = u16(bytes, at, le);
	if (count > MAX_IFD_ENTRIES) throw new Error("too many entries");
	const tags = IFD_TAGS[kind];
	const group = IFD_GROUPS[kind];
	for (let index = 0; index < count; index++) {
		const entry = at + 2 + index * 12;
		const tag = u16(bytes, entry, le);
		const type = u16(bytes, entry + 2, le);
		const valueCount = u32(bytes, entry + 4, le);
		const size = (TIFF_TYPE_SIZES[type] ?? 0) * valueCount;
		if (!size) continue;
		const valueAt = size <= 4 ? entry + 8 : tiff.start + u32(bytes, entry + 8, le);
		if (valueAt + size > tiff.end) {
			ctx.warnings.add(`truncated:${group}`);
			continue;
		}
		await attempt(ctx, group, async () => {
			const subOffset = () => u32(bytes, entry + 8, le);
			if ((kind === "ifd0" || kind === "ifd1") && tag === 0x8769) {
				await readIfd(ctx, tiff, subOffset(), "exif");
			} else if ((kind === "ifd0" || kind === "ifd1") && tag === 0x8825) {
				await readIfd(ctx, tiff, subOffset(), "gps");
			} else if (kind === "exif" && tag === 0xa005) {
				await readIfd(ctx, tiff, subOffset(), "interop");
			} else if (tag === 0x02bc && kind === "ifd0") {
				parseXmp(ctx, decode(bytes.subarray(valueAt, valueAt + size)));
			} else if (tag === 0x83bb && kind === "ifd0") {
				parseIptc(ctx, bytes.subarray(valueAt, valueAt + size));
			} else if (tag === 0x8649 && kind === "ifd0") {
				await parsePhotoshop(ctx, bytes.subarray(valueAt, valueAt + size));
			} else if (tag === 0x8773 && kind === "ifd0") {
				parseIcc(ctx, bytes.subarray(valueAt, valueAt + size));
			} else {
				const [name, valueKind] = tags[tag] ?? [`Tag 0x${tag.toString(16).padStart(4, "0")}`];
				const values = readTiffValues(tiff, type, valueCount, valueAt);
				add(ctx, group, name, formatTiffValue(tiff, valueKind, type, values));
				if (kind === "gps") noteGps(ctx, name, values);
				if (kind === "ifd0" && (tag === 0x0100 || tag === 0x0101)) {
					const number = toNumbers(values)[0];
					if (tag === 0x0100) tiff.width = number;
					else tiff.height = number;
				}
			}
		});
	}
	// The offset of the next directory — a directory cut off right after its entries has none.
	try {
		return u32(bytes, at + 2 + count * 12, le);
	} catch {
		return 0;
	}
}

// The raw GPS values for the decimal position in the summary.
/** @type {Functions.ImageInfo.Metadata.noteGps} */
function noteGps(ctx, name, values) {
	if (name === "GPSLatitudeRef" || name === "GPSLongitudeRef") {
		ctx.gps[name === "GPSLatitudeRef" ? "latitudeRef" : "longitudeRef"] = values instanceof Uint8Array ? ascii(values, 0, Math.min(1, values.length)) : "";
	} else if (name === "GPSLatitude" || name === "GPSLongitude") {
		const [degrees = NaN, minutes = 0, seconds = 0] = toNumbers(values);
		ctx.gps[name === "GPSLatitude" ? "latitude" : "longitude"] = degrees + minutes / 60 + seconds / 3600;
	} else if (name === "GPSAltitude") {
		ctx.gps.altitude = toNumbers(values)[0];
	} else if (name === "GPSAltitudeRef") {
		ctx.gps.altitudeRef = toNumbers(values)[0];
	}
}

// A TIFF structure (EXIF in JPEG, PNG, WebP, HEIF, a TIFF file): the header, IFD0 with its subdirectories and
// IFD1 (the thumbnail). Returns the size of the image from IFD0 (a TIFF file).
/** @type {Functions.ImageInfo.Metadata.parseTiff} */
async function parseTiff(ctx, bytes, start = 0, kind = "ifd0") {
	const order = ascii(bytes, start, 2);
	if (order !== "II" && order !== "MM") throw new Error("not TIFF");
	const le = order === "II";
	const magic = u16(bytes, start + 2, le);
	if (magic !== 42) throw new Error(magic === 43 ? "BigTIFF" : "not TIFF");
	/** @type {Types.ImageInfo.TiffState} */
	const tiff = { bytes, start, end: bytes.length, le, visited: new Set(), width: null, height: null };
	const first = await readIfd(ctx, tiff, u32(bytes, start + 4, le), kind);
	if (kind === "ifd0" && first) await attempt(ctx, "thumbnail", () => readIfd(ctx, tiff, first, "ifd1"));
	return { width: tiff.width, height: tiff.height, byteOrder: le ? "Little-endian (Intel, II)" : "Big-endian (Motorola, MM)" };
}

// --- XMP (RDF/XML) ---

/** @type {Functions.ImageInfo.Metadata.decodeEntities} */
function decodeEntities(text) {
	return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (match, entity) => {
		const lower = String(entity).toLowerCase();
		if (lower === "lt") return "<";
		if (lower === "gt") return ">";
		if (lower === "amp") return "&";
		if (lower === "quot") return '"';
		if (lower === "apos") return "'";
		const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
		return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
	});
}

// A tolerant XML tokenizer into a tree of elements (attributes, children, text) — enough for XMP and SVG
// metadata; at most MAX_XML_NODES elements.
/** @type {Functions.ImageInfo.Metadata.parseXml} */
export function parseXml(text) {
	/** @type {Types.ImageInfo.XmlNode} */
	const root = { name: "#root", attrs: {}, children: [], text: "" };
	/** @type {Types.ImageInfo.XmlNode[]} */
	const stack = [root];
	const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
	let nodes = 0;
	/** @type {RegExpExecArray | null} */
	let match;
	while ((match = pattern.exec(text))) {
		const top = stack[stack.length - 1];
		if (match[1] !== undefined) {
			top.text += match[1];
		} else if (match[2] !== undefined) {
			const index = stack.map((node) => node.name).lastIndexOf(match[2]);
			if (index > 0) stack.length = index;
		} else if (match[3] !== undefined) {
			if (++nodes > MAX_XML_NODES) break;
			/** @type {Record<string, string>} */
			const attrs = {};
			for (const attr of (match[4] || "").matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]] = decodeEntities(attr[2] ?? attr[3] ?? "");
			/** @type {Types.ImageInfo.XmlNode} */
			const node = { name: match[3], attrs, children: [], text: "" };
			top.children.push(node);
			if (!match[5]) stack.push(node);
		} else if (match[6] !== undefined) {
			top.text += decodeEntities(match[6]);
		}
	}
	return root;
}

/** @type {Functions.ImageInfo.Metadata.findNodes} */
function findNodes(node, name, found = []) {
	for (const child of node.children) {
		if (child.name === name) found.push(child);
		else findNodes(child, name, found);
	}
	return found;
}

// Attributes that describe the RDF structure, not a property.
/** @type {Functions.ImageInfo.Metadata.isRdfAttribute} */
function isRdfAttribute(name) {
	return name.startsWith("xmlns") || name === "rdf:about" || name === "rdf:parseType" || name === "xml:lang" || name === "rdf:resource" || name === "rdf:nodeID";
}

/** @type {Functions.ImageInfo.Metadata.isStruct} */
function isStruct(node) {
	return node.children.length > 0 || Object.keys(node.attrs).some((name) => !isRdfAttribute(name));
}

// One entry of an XMP packet within its budget (ctx.limits.maxXmpEntries): an empty value does not count,
// one over the budget is left out and marks the packet cut (the warning "limit:xmp").
/** @type {Functions.ImageInfo.Metadata.addXmpEntry} */
function addXmpEntry(ctx, budget, name, value) {
	if (!value.trim()) return;
	if (budget.left <= 0) {
		budget.cut = true;
		return;
	}
	budget.left--;
	add(ctx, "xmp", name, value);
}

// One XMP property (or a field of a structure) as entries "path" → value: a simple value, a resource, an
// array (rdf:Bag, rdf:Seq — the items joined; rdf:Alt — the default language), a structure (its fields
// under "path/field") and arrays of structures ("path[1]/field").
/** @type {Functions.ImageInfo.Metadata.addXmpProperty} */
function addXmpProperty(ctx, path, node, depth, budget) {
	if (depth > 6) return;
	const entry = (/** @type {string} */ name, /** @type {string} */ value) => addXmpEntry(ctx, budget, name, value);
	if (node.attrs["rdf:resource"] !== undefined) {
		entry(path, node.attrs["rdf:resource"]);
		return;
	}
	const container = node.children.find((child) => child.name === "rdf:Bag" || child.name === "rdf:Seq" || child.name === "rdf:Alt");
	if (container) {
		const items = container.children.filter((child) => child.name === "rdf:li");
		if (container.name === "rdf:Alt") {
			const preferred = items.find((item) => item.attrs["xml:lang"] === "x-default") || items[0];
			if (preferred) addXmpProperty(ctx, path, preferred, depth + 1, budget);
			return;
		}
		if (items.every((item) => !isStruct(item))) {
			entry(path, items.map((item) => item.text.trim()).filter(Boolean).join("; "));
			return;
		}
		items.forEach((item, index) => addXmpProperty(ctx, `${path}[${index + 1}]`, item, depth + 1, budget));
		return;
	}
	if (isStruct(node)) {
		const fields = node.children.length === 1 && node.children[0].name === "rdf:Description" ? node.children[0] : node;
		for (const [name, value] of Object.entries({ ...node.attrs, ...fields.attrs })) if (!isRdfAttribute(name)) entry(`${path}/${name}`, value);
		for (const child of fields.children) if (child.name !== "rdf:Description") addXmpProperty(ctx, `${path}/${child.name}`, child, depth + 1, budget);
		return;
	}
	entry(path, node.text.trim());
}

// An XMP packet (or another RDF document, e.g. the <metadata> of an SVG) into the "xmp" group.
/** @type {Functions.ImageInfo.Metadata.parseXmp} */
function parseXmp(ctx, text) {
	const xml = text.length > MAX_XML_BYTES ? text.slice(0, MAX_XML_BYTES) : text;
	if (text.length > MAX_XML_BYTES) ctx.warnings.add("truncated:xmp");
	const root = parseXml(xml);
	const budget = { left: ctx.limits.maxXmpEntries, cut: false };
	for (const meta of findNodes(root, "x:xmpmeta")) if (meta.attrs["x:xmptk"]) add(ctx, "xmp", "XMPToolkit", meta.attrs["x:xmptk"]);
	for (const rdf of findNodes(root, "rdf:RDF")) {
		for (const description of rdf.children.filter((child) => child.name === "rdf:Description")) {
			for (const [name, value] of Object.entries(description.attrs)) {
				if (!isRdfAttribute(name)) addXmpEntry(ctx, budget, name, value);
			}
			for (const child of description.children) addXmpProperty(ctx, child.name, child, 0, budget);
		}
		// RDF without rdf:Description (cc:Work in an SVG from Inkscape): the typed nodes themselves.
		for (const typed of rdf.children.filter((child) => child.name !== "rdf:Description")) {
			for (const child of typed.children) addXmpProperty(ctx, child.name, child, 0, budget);
		}
	}
	if (budget.cut) ctx.warnings.add("limit:xmp");
}

// --- IPTC-IIM and the Photoshop resources ---

/** @type {Readonly<Record<string, string>>} */
const IPTC_NAMES = {
	"1:0": "EnvelopeRecordVersion",
	"1:20": "FileFormat",
	"1:90": "CodedCharacterSet",
	"2:0": "ApplicationRecordVersion",
	"2:3": "ObjectTypeReference",
	"2:4": "ObjectAttributeReference",
	"2:5": "ObjectName",
	"2:7": "EditStatus",
	"2:10": "Urgency",
	"2:12": "SubjectReference",
	"2:15": "Category",
	"2:20": "SupplementalCategories",
	"2:22": "FixtureIdentifier",
	"2:25": "Keywords",
	"2:26": "ContentLocationCode",
	"2:27": "ContentLocationName",
	"2:30": "ReleaseDate",
	"2:35": "ReleaseTime",
	"2:37": "ExpirationDate",
	"2:38": "ExpirationTime",
	"2:40": "SpecialInstructions",
	"2:45": "ReferenceService",
	"2:47": "ReferenceDate",
	"2:50": "ReferenceNumber",
	"2:55": "DateCreated",
	"2:60": "TimeCreated",
	"2:62": "DigitalCreationDate",
	"2:63": "DigitalCreationTime",
	"2:65": "OriginatingProgram",
	"2:70": "ProgramVersion",
	"2:75": "ObjectCycle",
	"2:80": "By-line",
	"2:85": "By-lineTitle",
	"2:90": "City",
	"2:92": "Sub-location",
	"2:95": "Province-State",
	"2:100": "Country-PrimaryLocationCode",
	"2:101": "Country-PrimaryLocationName",
	"2:103": "OriginalTransmissionReference",
	"2:105": "Headline",
	"2:110": "Credit",
	"2:115": "Source",
	"2:116": "CopyrightNotice",
	"2:118": "Contact",
	"2:120": "Caption-Abstract",
	"2:121": "LocalCaption",
	"2:122": "Writer-Editor",
	"2:130": "ImageType",
	"2:131": "ImageOrientation",
	"2:135": "LanguageIdentifier",
	"2:184": "JobID",
	"2:221": "Prefs",
};

// IPTC-IIM datasets (0x1C, record, dataset, length); repeated datasets (Keywords) joined with "; ".
/** @type {Functions.ImageInfo.Metadata.parseIptc} */
function parseIptc(ctx, bytes) {
	let offset = 0;
	let utf8 = false;
	/** @type {Map<string, string[]>} */
	const values = new Map();
	for (let count = 0; offset + 5 <= bytes.length && count < MAX_STRUCTURES; count++) {
		if (bytes[offset] !== 0x1c) {
			offset++;
			continue;
		}
		const record = bytes[offset + 1];
		const dataset = bytes[offset + 2];
		let length = u16(bytes, offset + 3);
		offset += 5;
		if (length & 0x8000) {
			const size = length & 0x7fff;
			if (size > 4) break;
			length = 0;
			for (let index = 0; index < size; index++) length = length * 256 + u8(bytes, offset + index);
			offset += size;
		}
		need(bytes, offset, length);
		const data = bytes.subarray(offset, offset + length);
		offset += length;
		const key = `${record}:${dataset}`;
		if (key === "1:90") utf8 = data.length >= 3 && data[0] === 0x1b && data[1] === 0x25 && data[2] === 0x47;
		const name = IPTC_NAMES[key] ?? `IPTC ${key}`;
		const value = (key === "2:0" || key === "1:0") && data.length === 2 ? String(u16(data, 0)) : key === "1:90" ? (utf8 ? "UTF-8" : hex(data)) : utf8 ? decode(data) : decodeGuess(data);
		const list = values.get(name) ?? [];
		list.push(value);
		values.set(name, list);
	}
	for (const [name, list] of values) add(ctx, "iptc", name, list.join("; "));
}

// The image resources of Photoshop (8BIM blocks in the APP13 of a JPEG, a TIFF tag or a PSD): IPTC, the
// resolution, the version info, ICC, EXIF and XMP; the other resources only by their numbers.
/** @type {Functions.ImageInfo.Metadata.parsePhotoshop} */
async function parsePhotoshop(ctx, bytes) {
	let offset = 0;
	/** @type {string[]} */
	const others = [];
	for (let count = 0; offset + 12 <= bytes.length && count < MAX_STRUCTURES; count++) {
		const signature = ascii(bytes, offset, 4);
		if (signature !== "8BIM" && signature !== "PHUT" && signature !== "AgHg" && signature !== "DCSR") break;
		const id = u16(bytes, offset + 4);
		const nameLength = u8(bytes, offset + 6);
		let at = offset + 7 + nameLength;
		if ((nameLength + 1) % 2) at++;
		const size = u32(bytes, at);
		at += 4;
		const data = bytes.subarray(at, Math.min(at + size, bytes.length));
		offset = at + size + (size % 2);
		await attempt(ctx, "photoshop", async () => {
			if (id === 0x0404) parseIptc(ctx, data);
			else if (id === 0x03ed) {
				const units = ["", "pixels/inch", "pixels/cm"];
				add(ctx, "photoshop", "XResolution", `${formatNumber(u32(data, 0) / 65536)} ${units[u16(data, 4)] ?? ""}`.trim());
				add(ctx, "photoshop", "YResolution", `${formatNumber(u32(data, 8) / 65536)} ${units[u16(data, 12)] ?? ""}`.trim());
			} else if (id === 0x0421) {
				const writerLength = u32(data, 5);
				add(ctx, "photoshop", "WriterName", decode(data.subarray(9, 9 + writerLength * 2), "utf-16be"));
				const readerAt = 9 + writerLength * 2;
				const readerLength = u32(data, readerAt);
				add(ctx, "photoshop", "ReaderName", decode(data.subarray(readerAt + 4, readerAt + 4 + readerLength * 2), "utf-16be"));
			} else if (id === 0x040f) parseIcc(ctx, data);
			else if (id === 0x0422) await parseTiff(ctx, data);
			else if (id === 0x0424) parseXmp(ctx, decode(data));
			else if (id === 0x0425) add(ctx, "photoshop", "IPTCDigest", hex(data));
			else if (id === 0x040c || id === 0x0409) add(ctx, "photoshop", "PhotoshopThumbnail", `(${data.length} bytes)`);
			else if (id === 0x0406) add(ctx, "photoshop", "JPEGQuality", String(u16(data, 0) + 4));
			else others.push(`0x${id.toString(16).padStart(4, "0")}`);
		});
	}
	if (others.length) add(ctx, "photoshop", "OtherResources", others.join(", "));
}

// --- ICC profile ---

/** @type {Readonly<Record<string, string>>} */
const ICC_CLASSES = { scnr: "Input Device", mntr: "Display Device", prtr: "Output Device", link: "Device Link", spac: "Color Space", abst: "Abstract", nmcl: "Named Color" };
/** @type {readonly string[]} */
const ICC_INTENTS = ["Perceptual", "Media-Relative Colorimetric", "Saturation", "ICC-Absolute Colorimetric"];
/** @type {Readonly<Record<string, string>>} */
const ICC_TEXT_TAGS = { desc: "ProfileDescription", cprt: "ProfileCopyright", dmnd: "DeviceManufacturerDesc", dmdd: "DeviceModelDesc", vued: "ViewingCondDesc" };

// The text of an ICC tag of the type desc, text or mluc (the first record).
/** @type {Functions.ImageInfo.Metadata.readIccText} */
function readIccText(bytes, offset, size) {
	const type = ascii(bytes, offset, 4);
	if (type === "desc") return decodeGuess(bytes.subarray(offset + 12, offset + 12 + Math.max(0, u32(bytes, offset + 8) - 1)));
	if (type === "text") return decodeGuess(bytes.subarray(offset + 8, offset + size).subarray(0, zeroAt(bytes, offset + 8, offset + size) - offset - 8));
	if (type === "mluc") {
		const records = u32(bytes, offset + 8);
		if (!records) return "";
		const length = u32(bytes, offset + 20);
		const at = offset + u32(bytes, offset + 24);
		need(bytes, at, length);
		return decode(bytes.subarray(at, at + length), "utf-16be");
	}
	return "";
}

/** @type {Functions.ImageInfo.Metadata.parseIcc} */
function parseIcc(ctx, bytes) {
	if (ascii(bytes, 36, 4) !== "acsp") throw new Error("not ICC");
	const group = "icc";
	add(ctx, group, "ProfileSize", `${u32(bytes, 0)} bytes`);
	add(ctx, group, "ProfileCMMType", ascii(bytes, 4, 4).trim());
	add(ctx, group, "ProfileVersion", `${bytes[8]}.${bytes[9] >> 4}.${bytes[9] & 15}`);
	const deviceClass = ascii(bytes, 12, 4);
	add(ctx, group, "ProfileClass", ICC_CLASSES[deviceClass] ?? deviceClass);
	add(ctx, group, "ColorSpaceData", ascii(bytes, 16, 4).trim());
	add(ctx, group, "ProfileConnectionSpace", ascii(bytes, 20, 4).trim());
	const date = [0, 1, 2, 3, 4, 5].map((index) => u16(bytes, 24 + index * 2));
	if (date[0]) add(ctx, group, "ProfileDateTime", `${date[0]}:${String(date[1]).padStart(2, "0")}:${String(date[2]).padStart(2, "0")} ${date.slice(3).map((value) => String(value).padStart(2, "0")).join(":")}`);
	add(ctx, group, "PrimaryPlatform", ascii(bytes, 40, 4).replace(/\0/g, "").trim());
	add(ctx, group, "DeviceManufacturer", ascii(bytes, 48, 4).replace(/\0/g, "").trim());
	add(ctx, group, "RenderingIntent", ICC_INTENTS[u32(bytes, 64)] ?? String(u32(bytes, 64)));
	add(ctx, group, "ProfileCreator", ascii(bytes, 80, 4).replace(/\0/g, "").trim());
	const id = bytes.subarray(84, 100);
	if (id.length === 16 && id.some((byte) => byte !== 0)) add(ctx, group, "ProfileID", hex(id));
	const tags = u32(bytes, 128);
	for (let index = 0; index < Math.min(tags, 200); index++) {
		const entry = 132 + index * 12;
		const signature = ascii(bytes, entry, 4);
		const name = ICC_TEXT_TAGS[signature];
		if (!name) continue;
		try {
			add(ctx, group, name, readIccText(bytes, u32(bytes, entry + 4), u32(bytes, entry + 8)));
		} catch {
			ctx.warnings.add("corrupt:icc");
		}
	}
}

// --- JPEG ---

// The natural positions of the coefficients in the zig-zag order of a quantization table, and the
// luminance table of the JPEG standard (quality 50, natural order) — the estimate of the quality compares
// the table of the file with it (the same estimate as ImageMagick and others).
const ZIGZAG = [
	0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37,
	44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const STANDARD_LUMINANCE = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35,
	55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

// The quality (1–100) the luminance quantization table (in zig-zag order) was made with — an estimate.
/** @type {Functions.ImageInfo.Metadata.estimateJpegQuality} */
export function estimateJpegQuality(table) {
	if (table.length !== 64) return null;
	let sum = 0;
	for (let index = 0; index < 64; index++) sum += (table[index] * 100) / STANDARD_LUMINANCE[ZIGZAG[index]];
	const scale = sum / 64;
	if (!(scale > 0)) return null;
	const quality = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
	return Math.max(1, Math.min(100, Math.round(quality)));
}

/** @type {Readonly<Record<number, string>>} */
const JPEG_PROCESSES = {
	0xc0: "Baseline DCT, Huffman coding",
	0xc1: "Extended sequential DCT, Huffman coding",
	0xc2: "Progressive DCT, Huffman coding",
	0xc3: "Lossless, Huffman coding",
	0xc5: "Differential sequential DCT, Huffman coding",
	0xc6: "Differential progressive DCT, Huffman coding",
	0xc7: "Differential lossless, Huffman coding",
	0xc9: "Extended sequential DCT, arithmetic coding",
	0xca: "Progressive DCT, arithmetic coding",
	0xcb: "Lossless, arithmetic coding",
	0xcd: "Differential sequential DCT, arithmetic coding",
	0xce: "Differential progressive DCT, arithmetic coding",
	0xcf: "Differential lossless, arithmetic coding",
};

// The chroma subsampling from the sampling factors of the components (Y, Cb, Cr).
/** @type {Functions.ImageInfo.Metadata.chromaSubsampling} */
function chromaSubsampling(factors) {
	if (factors.length !== 3) return null;
	const [y, cb, cr] = factors;
	if (cb[0] !== cr[0] || cb[1] !== cr[1] || cb[0] !== 1 || cb[1] !== 1) return factors.map((factor) => `${factor[0]}x${factor[1]}`).join(" ");
	const key = `${y[0]}x${y[1]}`;
	return { "1x1": "4:4:4", "2x1": "4:2:2", "2x2": "4:2:0", "1x2": "4:4:0", "4x1": "4:1:1", "4x2": "4:1:0" }[key] ?? key;
}

/** @type {Functions.ImageInfo.Metadata.parseJpeg} */
async function parseJpeg(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "JPEG", "image/jpeg");
	/** @type {Map<number, Uint8Array>} */
	const iccChunks = new Map();
	/** @type {number[] | null} */
	let luminance = null;
	let adobeTransform = -1;
	/** @type {number[]} */
	let componentIds = [];
	/** @type {string[]} */
	const otherMarkers = [];
	let offset = 2;
	for (let count = 0; offset + 4 <= bytes.length && count < MAX_STRUCTURES; count++) {
		if (bytes[offset] !== 0xff) {
			ctx.warnings.add("corrupt:jpeg");
			break;
		}
		const marker = bytes[offset + 1];
		if (marker === 0xff) {
			offset++;
			continue;
		}
		offset += 2;
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		if (marker === 0xd9 || marker === 0xda) break;
		const length = u16(bytes, offset);
		if (length < 2) {
			ctx.warnings.add("corrupt:jpeg");
			break;
		}
		const end = offset + length;
		const data = bytes.subarray(offset + 2, Math.min(end, bytes.length));
		await attempt(ctx, "jpeg", async () => {
			if (marker === 0xe0 && startsWith(data, 0, "JFIF\0")) {
				add(ctx, "jfif", "JFIFVersion", `${data[5]}.${String(data[6]).padStart(2, "0")}`);
				const units = ["(aspect ratio)", "dpi", "dpcm"][data[7]] ?? String(data[7]);
				add(ctx, "jfif", "Density", `${u16(data, 8)} × ${u16(data, 10)} ${units}`);
				if (data[12] && data[13]) add(ctx, "jfif", "ThumbnailSize", `${data[12]} × ${data[13]}`);
			} else if (marker === 0xe0 && startsWith(data, 0, "JFXX\0")) {
				add(ctx, "jfif", "JFXXThumbnail", `(${data.length - 6} bytes)`);
			} else if (marker === 0xe1 && startsWith(data, 0, "Exif\0")) {
				await parseTiff(ctx, data, 6);
			} else if (marker === 0xe1 && startsWith(data, 0, "http://ns.adobe.com/xap/1.0/\0")) {
				parseXmp(ctx, decode(data.subarray(29)));
			} else if (marker === 0xe1 && startsWith(data, 0, "http://ns.adobe.com/xmp/extension/\0")) {
				add(ctx, "xmp", "HasExtendedXMP", ascii(data, 35, 32));
			} else if (marker === 0xe2 && startsWith(data, 0, "ICC_PROFILE\0")) {
				iccChunks.set(data[12], data.subarray(14));
			} else if (marker === 0xe2 && startsWith(data, 0, "MPF\0")) {
				await parseTiff(ctx, data, 4, "mpf");
			} else if (marker === 0xec && startsWith(data, 0, "Ducky")) {
				let at = 5;
				while (at + 4 <= data.length) {
					const tag = u16(data, at);
					const size = u16(data, at + 2);
					if (tag === 0) break;
					if (tag === 1 && size >= 4) add(ctx, "ducky", "Quality", `${u32(data, at + 4)} %`);
					else if (tag === 2) add(ctx, "ducky", "Comment", decode(data.subarray(at + 8, at + 4 + size), "utf-16be"));
					else if (tag === 3) add(ctx, "ducky", "Copyright", decode(data.subarray(at + 8, at + 4 + size), "utf-16be"));
					at += 4 + size;
				}
			} else if (marker === 0xed && startsWith(data, 0, "Photoshop 3.0\0")) {
				await parsePhotoshop(ctx, data.subarray(14));
			} else if (marker === 0xee && startsWith(data, 0, "Adobe")) {
				adobeTransform = data[11];
				add(ctx, "adobe", "DCTEncodeVersion", String(u16(data, 5)));
				add(ctx, "adobe", "ColorTransform", ["Unknown (RGB or CMYK)", "YCbCr", "YCCK"][adobeTransform] ?? String(adobeTransform));
			} else if (marker === 0xeb && data.length > 8 && decode(data.subarray(0, Math.min(data.length, 200)), "latin1").includes("c2pa")) {
				add(ctx, "file", "ContentCredentials", `C2PA (JUMBF, ${data.length} bytes)`);
			} else if (marker === 0xfe) {
				add(ctx, "file", "Comment", decodeGuess(data));
			} else if (marker === 0xdb) {
				let at = 0;
				while (at < data.length) {
					const precision = data[at] >> 4;
					const id = data[at] & 15;
					const table = [];
					for (let index = 0; index < 64; index++) table.push(precision ? u16(data, at + 1 + index * 2) : u8(data, at + 1 + index));
					if (id === 0 && !luminance) luminance = table;
					at += 1 + 64 * (precision ? 2 : 1);
				}
			} else if (JPEG_PROCESSES[marker] && ctx.meta.width === null) {
				const precision = data[0];
				const height = u16(data, 1);
				const width = u16(data, 3);
				const components = data[5];
				setSize(ctx, width, height);
				ctx.meta.summary.bitDepth = precision;
				add(ctx, "file", "EncodingProcess", JPEG_PROCESSES[marker]);
				add(ctx, "file", "BitsPerSample", String(precision));
				add(ctx, "file", "ColorComponents", String(components));
				/** @type {[number, number][]} */
				const factors = [];
				componentIds = [];
				for (let index = 0; index < components; index++) {
					componentIds.push(data[6 + index * 3]);
					const sampling = u8(data, 7 + index * 3);
					factors.push([sampling >> 4, sampling & 15]);
				}
				const subsampling = chromaSubsampling(factors);
				if (subsampling) add(ctx, "file", "YCbCrSubSampling", subsampling);
			} else if (marker >= 0xe0 && marker <= 0xef) {
				const label = ascii(data, 0, Math.min(data.length, 12)).replace(/[^\x20-\x7e].*$/s, "");
				otherMarkers.push(`APP${marker - 0xe0}${label ? ` (${label})` : ""}`);
			}
		});
		if (end > bytes.length) {
			ctx.warnings.add("truncated:jpeg");
			break;
		}
		offset = end;
	}
	if (otherMarkers.length) add(ctx, "file", "OtherSegments", otherMarkers.join(", "));
	const components = componentIds.length;
	ctx.meta.summary.colorType =
		components === 1
			? "Grayscale"
			: components === 3
				? adobeTransform === 0 || (componentIds[0] === 82 && componentIds[1] === 71 && componentIds[2] === 66)
					? "RGB"
					: "YCbCr"
				: components === 4
					? adobeTransform === 2
						? "YCCK"
						: "CMYK"
					: null;
	if (ctx.meta.summary.colorType) add(ctx, "file", "ColorType", ctx.meta.summary.colorType);
	if (luminance) {
		const quality = estimateJpegQuality(luminance);
		ctx.meta.summary.quality = quality;
		if (quality !== null) add(ctx, "file", "QualityEstimate", `≈ ${quality}`);
	}
	if (iccChunks.size) {
		const parts = [...iccChunks.keys()].sort((a, b) => a - b).map((key) => /** @type {Uint8Array} */ (iccChunks.get(key)));
		const total = parts.reduce((sum, part) => sum + part.length, 0);
		const profile = new Uint8Array(total);
		let at = 0;
		for (const part of parts) {
			profile.set(part, at);
			at += part.length;
		}
		await attempt(ctx, "icc", () => parseIcc(ctx, profile));
	}
}

// --- PNG ---

/** @type {readonly string[]} */
const PNG_COLOR_TYPES = ["Grayscale", "", "RGB", "Palette", "Grayscale with Alpha", "", "RGB with Alpha"];
/** @type {readonly string[]} */
const SRGB_INTENTS = ["Perceptual", "Relative Colorimetric", "Saturation", "Absolute Colorimetric"];
/** @type {Readonly<Record<number, string>>} */
const CICP_PRIMARIES = { 1: "BT.709", 4: "BT.470 M", 5: "BT.470 BG", 6: "BT.601", 9: "BT.2020", 11: "DCI-P3", 12: "Display P3" };
/** @type {Readonly<Record<number, string>>} */
const CICP_TRANSFER = { 1: "BT.709", 4: "Gamma 2.2", 5: "Gamma 2.8", 6: "BT.601", 8: "Linear", 13: "sRGB", 14: "BT.2020 10-bit", 15: "BT.2020 12-bit", 16: "PQ (SMPTE ST 2084)", 18: "HLG" };
/** @type {Readonly<Record<number, string>>} */
const CICP_MATRIX = { 0: "Identity", 1: "BT.709", 5: "BT.470 BG", 6: "BT.601", 9: "BT.2020 (non-constant)", 10: "BT.2020 (constant)" };

/** @type {Functions.ImageInfo.Metadata.describeCicp} */
function describeCicp(primaries, transfer, matrix, fullRange) {
	return [
		`${CICP_PRIMARIES[primaries] ?? primaries}`,
		`${CICP_TRANSFER[transfer] ?? transfer}`,
		`${CICP_MATRIX[matrix] ?? matrix}`,
		fullRange ? "full range" : "limited range",
	].join(", ");
}

/** @type {Functions.ImageInfo.Metadata.parsePng} */
async function parsePng(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "PNG", "image/png");
	let offset = 8;
	let dataChunks = 0;
	let dataBytes = 0;
	let frameControls = 0;
	/** @type {Map<string, number>} */
	const others = new Map();
	for (let count = 0; offset + 8 <= bytes.length && count < MAX_STRUCTURES; count++) {
		const length = u32(bytes, offset);
		const type = ascii(bytes, offset + 4, 4);
		const start = offset + 8;
		const end = start + length;
		const data = bytes.subarray(start, Math.min(end, bytes.length));
		if (type === "IDAT" || type === "fdAT") {
			dataChunks++;
			dataBytes += length;
		} else {
			await attempt(ctx, `png:${type}`, async () => {
				if (end > bytes.length) throw new Truncated("truncated");
				if (type === "IHDR") {
					setSize(ctx, u32(data, 0), u32(data, 4));
					const bitDepth = u8(data, 8);
					const colorType = u8(data, 9);
					ctx.meta.summary.bitDepth = bitDepth;
					ctx.meta.summary.colorType = PNG_COLOR_TYPES[colorType] || String(colorType);
					add(ctx, "file", "BitDepth", String(bitDepth));
					add(ctx, "file", "ColorType", ctx.meta.summary.colorType);
					add(ctx, "file", "Compression", data[10] === 0 ? "Deflate/Inflate" : String(data[10]));
					add(ctx, "file", "Filter", data[11] === 0 ? "Adaptive" : String(data[11]));
					add(ctx, "file", "Interlace", data[12] === 1 ? "Adam7 Interlace" : "Noninterlaced");
				} else if (type === "PLTE") {
					add(ctx, "file", "PaletteColors", String(Math.floor(length / 3)));
				} else if (type === "tRNS") {
					add(ctx, "file", "Transparency", `tRNS (${length} bytes)`);
				} else if (type === "gAMA") {
					add(ctx, "file", "Gamma", formatNumber(100000 / u32(data, 0)));
				} else if (type === "cHRM") {
					const values = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => formatNumber(u32(data, index * 4) / 100000));
					add(ctx, "file", "WhitePoint", `${values[0]} ${values[1]}`);
					add(ctx, "file", "Primaries", `R ${values[2]} ${values[3]}, G ${values[4]} ${values[5]}, B ${values[6]} ${values[7]}`);
				} else if (type === "sRGB") {
					add(ctx, "file", "SRGBRendering", SRGB_INTENTS[u8(data, 0)] ?? String(data[0]));
				} else if (type === "cICP") {
					add(ctx, "file", "ColorDescription", describeCicp(u8(data, 0), u8(data, 1), u8(data, 2), u8(data, 3) === 1));
				} else if (type === "cLLi") {
					add(ctx, "file", "MaxContentLightLevel", `${formatNumber(u32(data, 0) / 10000)} cd/m²`);
					add(ctx, "file", "MaxFrameAverageLightLevel", `${formatNumber(u32(data, 4) / 10000)} cd/m²`);
				} else if (type === "mDCv") {
					add(ctx, "file", "MasteringDisplayLuminance", `${formatNumber(u32(data, 20) / 10000)}–${formatNumber(u32(data, 16) / 10000)} cd/m²`);
				} else if (type === "iCCP") {
					const zero = zeroAt(data, 0, Math.min(data.length, 80));
					add(ctx, "icc", "ProfileName", decode(data.subarray(0, zero), "latin1"));
					parseIcc(ctx, await inflate(data.subarray(zero + 2)));
				} else if (type === "sBIT") {
					add(ctx, "file", "SignificantBits", Array.from(data).join(", "));
				} else if (type === "bKGD") {
					add(ctx, "file", "BackgroundColor", data.length === 1 ? `palette index ${data[0]}` : data.length === 2 ? String(u16(data, 0)) : `${u16(data, 0)} ${u16(data, 2)} ${u16(data, 4)}`);
				} else if (type === "pHYs") {
					const x = u32(data, 0);
					const y = u32(data, 4);
					const unit = u8(data, 8);
					add(ctx, "file", "PixelsPerUnit", unit === 1 ? `${x} × ${y} per meter (${Math.round(x * 0.0254)} × ${Math.round(y * 0.0254)} dpi)` : `${x} × ${y} (aspect ratio)`);
				} else if (type === "oFFs") {
					add(ctx, "file", "ImageOffset", `${i32(data, 0)}, ${i32(data, 4)} ${data[8] === 1 ? "µm" : "px"}`);
				} else if (type === "tIME") {
					const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");
					add(ctx, "file", "ModifyDate", `${u16(data, 0)}:${pad(u8(data, 2))}:${pad(u8(data, 3))} ${pad(u8(data, 4))}:${pad(u8(data, 5))}:${pad(u8(data, 6))} UTC`);
				} else if (type === "tEXt") {
					const zero = zeroAt(data, 0);
					add(ctx, "text", decode(data.subarray(0, zero), "latin1"), decode(data.subarray(zero + 1), "latin1"));
				} else if (type === "zTXt") {
					const zero = zeroAt(data, 0);
					add(ctx, "text", decode(data.subarray(0, zero), "latin1"), decode(await inflate(data.subarray(zero + 2)), "latin1"));
				} else if (type === "iTXt") {
					const keywordEnd = zeroAt(data, 0);
					const keyword = decode(data.subarray(0, keywordEnd), "latin1");
					const compressed = u8(data, keywordEnd + 1) === 1;
					const languageEnd = zeroAt(data, keywordEnd + 3);
					const translatedEnd = zeroAt(data, languageEnd + 1);
					const raw = data.subarray(translatedEnd + 1);
					const text = decode(compressed ? await inflate(raw) : raw);
					if (keyword === "XML:com.adobe.xmp") parseXmp(ctx, text);
					else add(ctx, "text", keyword, text);
				} else if (type === "eXIf") {
					await parseTiff(ctx, data);
				} else if (type === "acTL") {
					const frames = u32(data, 0);
					const plays = u32(data, 4);
					ctx.meta.animated = frames > 1;
					ctx.meta.frames = frames;
					ctx.meta.mime = "image/apng";
					ctx.meta.format = "APNG";
					add(ctx, "animation", "AnimationFrames", String(frames));
					add(ctx, "animation", "AnimationPlays", plays === 0 ? "inf" : String(plays));
				} else if (type === "fcTL") {
					frameControls++;
				} else if (type === "caBX") {
					add(ctx, "file", "ContentCredentials", `C2PA (JUMBF, ${length} bytes)`);
				} else if (type !== "IEND") {
					others.set(type, (others.get(type) ?? 0) + 1);
				}
			});
		}
		if (type === "IEND") break;
		if (end + 4 > bytes.length) {
			if (ctx.meta.complete) ctx.warnings.add("truncated:png");
			break;
		}
		offset = end + 4;
	}
	add(ctx, "file", "ImageDataChunks", `${dataChunks} (${dataBytes} bytes)`);
	if (frameControls) add(ctx, "animation", "FrameControlChunks", String(frameControls));
	if (others.size) add(ctx, "file", "OtherChunks", [...others].map(([type, count]) => (count > 1 ? `${type} ×${count}` : type)).join(", "));
}

// --- GIF ---

// Skips the data sub-blocks from offset (each is a length byte and the data, the last one is 0).
/** @type {Functions.ImageInfo.Metadata.skipSubBlocks} */
function skipSubBlocks(bytes, offset) {
	for (let count = 0; count < 1000000; count++) {
		const length = u8(bytes, offset);
		offset += 1 + length;
		if (length === 0) return offset;
	}
	throw new Error("sub-blocks");
}

/** @type {Functions.ImageInfo.Metadata.readSubBlocks} */
function readSubBlocks(bytes, offset) {
	/** @type {number[]} */
	const data = [];
	for (let count = 0; count < 100000; count++) {
		const length = u8(bytes, offset);
		need(bytes, offset + 1, length);
		if (data.length < MAX_TEXT * 4) data.push(...bytes.subarray(offset + 1, offset + 1 + length));
		offset += 1 + length;
		if (length === 0) break;
	}
	return { data: Uint8Array.from(data), end: offset };
}

/** @type {Functions.ImageInfo.Metadata.parseGif} */
function parseGif(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "GIF", "image/gif");
	add(ctx, "file", "GIFVersion", ascii(bytes, 3, 3));
	setSize(ctx, u16(bytes, 6, true), u16(bytes, 8, true));
	const packed = u8(bytes, 10);
	const globalColors = packed & 0x80 ? 2 << (packed & 7) : 0;
	ctx.meta.summary.bitDepth = ((packed >> 4) & 7) + 1;
	add(ctx, "file", "ColorResolutionDepth", String(ctx.meta.summary.bitDepth));
	add(ctx, "file", "GlobalColorTable", globalColors ? `${globalColors} colors` : "none");
	if (globalColors) add(ctx, "file", "BackgroundColorIndex", String(u8(bytes, 11)));
	const aspect = u8(bytes, 12);
	if (aspect) add(ctx, "file", "PixelAspectRatio", formatNumber((aspect + 15) / 64));
	let offset = 13 + globalColors * 3;
	let frames = 0;
	let duration = 0;
	let transparent = false;
	/** @type {string[]} */
	const comments = [];
	for (let count = 0; offset < bytes.length && count < MAX_STRUCTURES * 10; count++) {
		const introducer = bytes[offset];
		if (introducer === 0x3b) break;
		if (introducer === 0x2c) {
			const local = u8(bytes, offset + 9);
			if (frames === 0) add(ctx, "file", "Interlaced", local & 0x40 ? "yes" : "no");
			offset += 10 + (local & 0x80 ? (2 << (local & 7)) * 3 : 0);
			offset = skipSubBlocks(bytes, offset + 1);
			frames++;
		} else if (introducer === 0x21) {
			const label = u8(bytes, offset + 1);
			offset += 2;
			if (label === 0xf9) {
				const flags = u8(bytes, offset + 1);
				duration += u16(bytes, offset + 2, true) * 10;
				if (flags & 1) transparent = true;
				offset = skipSubBlocks(bytes, offset);
			} else if (label === 0xfe) {
				const { data, end } = readSubBlocks(bytes, offset);
				comments.push(decodeGuess(data));
				offset = end;
			} else if (label === 0xff) {
				const size = u8(bytes, offset);
				const id = ascii(bytes, offset + 1, Math.min(size, 11));
				const blocksAt = offset + 1 + size;
				if ((id === "NETSCAPE2.0" || id === "ANIMEXTS1.0") && u8(bytes, blocksAt) >= 3 && u8(bytes, blocksAt + 1) === 1) {
					const loops = u16(bytes, blocksAt + 2, true);
					add(ctx, "animation", "AnimationIterations", loops === 0 ? "Infinite" : String(loops));
				} else if (id === "XMP DataXMP") {
					const text = decode(bytes.subarray(blocksAt, Math.min(bytes.length, blocksAt + MAX_XML_BYTES)), "latin1");
					const end = text.indexOf("<?xpacket end");
					if (end > 0) parseXmp(ctx, decode(bytes.subarray(blocksAt, blocksAt + text.indexOf("?>", end) + 2)));
				} else if (id === "ICCRGBG1012") {
					add(ctx, "icc", "ProfileInGIF", "yes");
				} else {
					add(ctx, "file", "ApplicationExtension", id);
				}
				offset = skipSubBlocks(bytes, blocksAt);
			} else {
				offset = skipSubBlocks(bytes, offset);
			}
		} else {
			ctx.warnings.add("corrupt:gif");
			break;
		}
	}
	ctx.meta.frames = frames;
	ctx.meta.animated = frames > 1;
	add(ctx, "animation", "FrameCount", String(frames));
	if (frames > 1) add(ctx, "animation", "Duration", `${formatNumber(duration / 1000)} s`);
	if (transparent) add(ctx, "file", "Transparency", "yes");
	for (const comment of comments) add(ctx, "file", "Comment", comment);
}

// --- WebP ---

/** @type {Functions.ImageInfo.Metadata.parseWebp} */
async function parseWebp(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "WebP", "image/webp");
	let offset = 12;
	let frames = 0;
	let duration = 0;
	/** @type {string[]} */
	const chunks = [];
	for (let count = 0; offset + 8 <= bytes.length && count < MAX_STRUCTURES; count++) {
		const type = ascii(bytes, offset, 4);
		const size = u32(bytes, offset + 4, true);
		const data = bytes.subarray(offset + 8, Math.min(offset + 8 + size, bytes.length));
		chunks.push(type.trim());
		await attempt(ctx, `webp:${type.trim()}`, async () => {
			if (type === "VP8 ") {
				add(ctx, "file", "Compression", "Lossy (VP8)");
				if (data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) setSize(ctx, u16(data, 6, true) & 0x3fff, u16(data, 8, true) & 0x3fff);
			} else if (type === "VP8L") {
				add(ctx, "file", "Compression", "Lossless (VP8L)");
				if (data[0] === 0x2f) {
					const bits = u32(data, 1, true);
					setSize(ctx, (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
					if ((bits >>> 28) & 1) add(ctx, "file", "Alpha", "yes");
				}
			} else if (type === "VP8X") {
				const flags = u8(data, 0);
				setSize(ctx, u24(data, 4, true) + 1, u24(data, 7, true) + 1);
				const features = [flags & 0x20 && "ICC", flags & 0x10 && "Alpha", flags & 0x08 && "EXIF", flags & 0x04 && "XMP", flags & 0x02 && "Animation"].filter(Boolean);
				add(ctx, "file", "Features", features.join(", ") || "none");
				if (flags & 0x02) ctx.meta.animated = true;
			} else if (type === "ICCP") {
				parseIcc(ctx, data);
			} else if (type === "ANIM") {
				add(ctx, "animation", "BackgroundColor", `#${hex(Uint8Array.of(data[2], data[1], data[0], data[3]))}`);
				const loops = u16(data, 4, true);
				add(ctx, "animation", "AnimationLoopCount", loops === 0 ? "Infinite" : String(loops));
			} else if (type === "ANMF") {
				frames++;
				duration += u24(data, 12, true);
			} else if (type === "ALPH") {
				add(ctx, "file", "AlphaCompression", (u8(data, 0) & 3) === 1 ? "Lossless" : "None");
			} else if (type === "EXIF") {
				await parseTiff(ctx, data, startsWith(data, 0, "Exif\0\0") ? 6 : 0);
			} else if (type === "XMP ") {
				parseXmp(ctx, decode(data));
			}
		});
		offset += 8 + size + (size & 1);
	}
	if (frames) {
		ctx.meta.frames = frames;
		ctx.meta.animated = frames > 1 || ctx.meta.animated;
		add(ctx, "animation", "FrameCount", String(frames));
		add(ctx, "animation", "Duration", `${formatNumber(duration / 1000)} s`);
	}
	add(ctx, "file", "Chunks", chunks.join(", "));
}

// --- ISOBMFF: AVIF, HEIF, JPEG 2000, JPEG XL container ---

// The boxes between start and end: [type, start of the data, end].
/** @type {Functions.ImageInfo.Metadata.readBoxes} */
function readBoxes(bytes, start, end) {
	/** @type {Types.ImageInfo.Box[]} */
	const boxes = [];
	let offset = start;
	for (let count = 0; offset + 8 <= end && count < MAX_STRUCTURES; count++) {
		let size = u32(bytes, offset);
		const type = ascii(bytes, offset + 4, 4);
		let header = 8;
		if (size === 1) {
			size = u64(bytes, offset + 8);
			header = 16;
		} else if (size === 0) {
			size = end - offset;
		}
		if (size < header) break;
		boxes.push({ type, start: offset + header, end: Math.min(offset + size, end), declaredEnd: offset + size });
		offset += size;
	}
	return boxes;
}

/** @type {Readonly<Record<string, string>>} */
const AUX_TYPES = {
	"urn:mpeg:mpegB:cicp:systems:auxiliary:alpha": "Alpha",
	"urn:mpeg:hevc:2015:auxid:1": "Alpha",
	"urn:mpeg:hevc:2015:auxid:2": "Depth",
	"urn:com:apple:photo:2020:aux:hdrgainmap": "HDR gain map",
};

// An unsigned number of 0, 4 or 8 bytes (the field sizes of iloc).
/** @type {Functions.ImageInfo.Metadata.readSized} */
function readSized(bytes, offset, size) {
	if (size === 0) return 0;
	if (size === 4) return u32(bytes, offset);
	if (size === 8) return u64(bytes, offset);
	if (size === 2) return u16(bytes, offset);
	throw new Error("iloc size");
}

/** @type {Functions.ImageInfo.Metadata.parseHeif} */
async function parseHeif(ctx, boxes) {
	const { bytes } = ctx;
	const meta = boxes.find((box) => box.type === "meta");
	if (boxes.some((box) => box.type === "moov")) {
		ctx.meta.animated = true;
		add(ctx, "file", "ImageSequence", "yes");
	}
	if (!meta) return;
	const children = readBoxes(bytes, meta.start + 4, meta.end);
	/** @type {Map<number, { type: string; name: string; contentType: string }>} */
	const items = new Map();
	/** @type {Map<number, { method: number; extents: [number, number][] }>} */
	const locations = new Map();
	/** @type {Types.ImageInfo.Box[]} */
	let properties = [];
	/** @type {Map<number, number[]>} */
	const associations = new Map();
	let primary = 0;
	/** @type {Types.ImageInfo.Box | undefined} */
	let idat;
	for (const box of children) {
		await attempt(ctx, `heif:${box.type}`, async () => {
			const version = u8(bytes, box.start);
			if (box.type === "hdlr") {
				add(ctx, "heif", "HandlerType", ascii(bytes, box.start + 8, 4));
			} else if (box.type === "pitm") {
				primary = version === 0 ? u16(bytes, box.start + 4) : u32(bytes, box.start + 4);
			} else if (box.type === "idat") {
				idat = box;
			} else if (box.type === "iinf") {
				const entriesAt = box.start + 4 + (version === 0 ? 2 : 4);
				for (const entry of readBoxes(bytes, entriesAt, box.end)) {
					if (entry.type !== "infe") continue;
					const infeVersion = u8(bytes, entry.start);
					if (infeVersion < 2) continue;
					const id = infeVersion === 2 ? u16(bytes, entry.start + 4) : u32(bytes, entry.start + 4);
					const typeAt = entry.start + (infeVersion === 2 ? 8 : 10);
					const type = ascii(bytes, typeAt, 4);
					const nameEnd = zeroAt(bytes, typeAt + 4, entry.end);
					const name = decode(bytes.subarray(typeAt + 4, nameEnd));
					const contentType = type === "mime" ? decode(bytes.subarray(nameEnd + 1, zeroAt(bytes, nameEnd + 1, entry.end))) : "";
					items.set(id, { type, name, contentType });
				}
			} else if (box.type === "iloc") {
				const sizes = u16(bytes, box.start + 4);
				const offsetSize = sizes >> 12;
				const lengthSize = (sizes >> 8) & 15;
				const baseSize = (sizes >> 4) & 15;
				const indexSize = version === 1 || version === 2 ? sizes & 15 : 0;
				let at = box.start + 6;
				const count = version < 2 ? u16(bytes, at) : u32(bytes, at);
				at += version < 2 ? 2 : 4;
				for (let index = 0; index < Math.min(count, MAX_STRUCTURES); index++) {
					const id = version < 2 ? u16(bytes, at) : u32(bytes, at);
					at += version < 2 ? 2 : 4;
					let method = 0;
					if (version === 1 || version === 2) {
						method = u16(bytes, at) & 15;
						at += 2;
					}
					at += 2;
					const base = readSized(bytes, at, baseSize);
					at += baseSize;
					const extentCount = u16(bytes, at);
					at += 2;
					/** @type {[number, number][]} */
					const extents = [];
					for (let extent = 0; extent < Math.min(extentCount, 1000); extent++) {
						at += indexSize;
						const start = base + readSized(bytes, at, offsetSize);
						at += offsetSize;
						const length = readSized(bytes, at, lengthSize);
						at += lengthSize;
						extents.push([start, length]);
					}
					locations.set(id, { method, extents });
				}
			} else if (box.type === "iprp") {
				for (const part of readBoxes(bytes, box.start, box.end)) {
					if (part.type === "ipco") properties = readBoxes(bytes, part.start, part.end);
					if (part.type !== "ipma") continue;
					const ipmaVersion = u8(bytes, part.start);
					const flags = u24(bytes, part.start + 1);
					const count = u32(bytes, part.start + 4);
					let at = part.start + 8;
					for (let index = 0; index < Math.min(count, MAX_STRUCTURES); index++) {
						const id = ipmaVersion < 1 ? u16(bytes, at) : u32(bytes, at);
						at += ipmaVersion < 1 ? 2 : 4;
						const associationCount = u8(bytes, at++);
						/** @type {number[]} */
						const list = [];
						for (let association = 0; association < associationCount; association++) {
							list.push(flags & 1 ? u16(bytes, at) & 0x7fff : u8(bytes, at) & 0x7f);
							at += flags & 1 ? 2 : 1;
						}
						associations.set(id, list);
					}
				}
			}
		});
	}

	// The data of an item from its extents (in the file or in idat).
	const itemData = (/** @type {number} */ id) => {
		const location = locations.get(id);
		if (!location) return null;
		const parts = location.extents.map(([start, length]) => {
			const from = location.method === 1 && idat ? idat.start + start : start;
			need(bytes, from, length || bytes.length - from);
			return bytes.subarray(from, length ? from + length : bytes.length);
		});
		if (parts.length === 1) return parts[0];
		const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
		let at = 0;
		for (const part of parts) {
			result.set(part, at);
			at += part.length;
		}
		return result;
	};

	/** @type {Map<string, number>} */
	const types = new Map();
	for (const item of items.values()) types.set(item.type, (types.get(item.type) ?? 0) + 1);
	add(ctx, "heif", "Items", [...types].map(([type, count]) => `${type.trim()} ×${count}`).join(", "));
	const primaryItem = items.get(primary);
	if (primaryItem) add(ctx, "heif", "PrimaryItemType", primaryItem.type.trim());

	for (const index of associations.get(primary) ?? []) {
		const property = properties[index - 1];
		if (!property) continue;
		await attempt(ctx, `heif:${property.type}`, async () => {
			const at = property.start;
			if (property.type === "ispe") setSize(ctx, u32(bytes, at + 4), u32(bytes, at + 8));
			else if (property.type === "pixi") {
				const channels = u8(bytes, at + 4);
				const depths = Array.from(bytes.subarray(at + 5, at + 5 + channels));
				ctx.meta.summary.bitDepth = depths[0] ?? null;
				add(ctx, "file", "BitsPerChannel", depths.join(", "));
			} else if (property.type === "colr") {
				const colorType = ascii(bytes, at, 4);
				if (colorType === "nclx") add(ctx, "file", "ColorDescription", describeCicp(u16(bytes, at + 4), u16(bytes, at + 6), u16(bytes, at + 8), (u8(bytes, at + 10) & 0x80) !== 0));
				else if (colorType === "rICC" || colorType === "prof") parseIcc(ctx, bytes.subarray(at + 4, property.end));
			} else if (property.type === "irot") add(ctx, "file", "Rotation", `${(u8(bytes, at) & 3) * 90}° CCW`);
			else if (property.type === "imir") add(ctx, "file", "Mirror", u8(bytes, at) & 1 ? "horizontal axis" : "vertical axis");
			else if (property.type === "av1C") {
				const profileByte = u8(bytes, at + 1);
				const flags = u8(bytes, at + 2);
				const highBitDepth = (flags & 0x40) !== 0;
				const twelveBit = (flags & 0x20) !== 0;
				const monochrome = (flags & 0x10) !== 0;
				const subsampling = monochrome ? "4:0:0" : (flags & 0x08) && (flags & 0x04) ? "4:2:0" : flags & 0x08 ? "4:2:2" : "4:4:4";
				add(ctx, "file", "AV1Profile", ["Main", "High", "Professional"][profileByte >> 5] ?? String(profileByte >> 5));
				add(ctx, "file", "AV1Level", String(profileByte & 31));
				add(ctx, "file", "AV1BitDepth", highBitDepth ? (twelveBit ? "12" : "10") : "8");
				add(ctx, "file", "ChromaSubsampling", subsampling);
			} else if (property.type === "hvcC") {
				add(ctx, "file", "HEVCProfile", String(u8(bytes, at + 1) & 31));
				add(ctx, "file", "HEVCLevel", formatNumber(u8(bytes, at + 12) / 30));
			}
		});
	}

	// Auxiliary images (alpha, depth, gain map) and thumbnails among the other items.
	for (const [id] of items) {
		if (id === primary) continue;
		for (const index of associations.get(id) ?? []) {
			const property = properties[index - 1];
			if (property?.type === "auxC") {
				const urn = decode(bytes.subarray(property.start + 4, zeroAt(bytes, property.start + 4, property.end)));
				add(ctx, "heif", "AuxiliaryImage", AUX_TYPES[urn] ?? urn);
			}
		}
	}

	for (const [id, item] of items) {
		if (item.type === "Exif") {
			await attempt(ctx, "exif", async () => {
				const data = itemData(id);
				if (data) await parseTiff(ctx, data, 4 + u32(data, 0));
			});
		} else if (item.type === "mime" && /rdf\+xml|xmp/i.test(item.contentType)) {
			await attempt(ctx, "xmp", async () => {
				const data = itemData(id);
				if (data) parseXmp(ctx, decode(data));
			});
		}
	}
}

// The size from the SizeHeader of a JPEG XL codestream (bits from the lowest).
/** @type {Functions.ImageInfo.Metadata.readJxlSize} */
export function readJxlSize(bytes, offset) {
	let bit = 0;
	const read = (/** @type {number} */ count) => {
		let value = 0;
		for (let index = 0; index < count; index++, bit++) value |= ((u8(bytes, offset + (bit >> 3)) >> (bit & 7)) & 1) << index;
		return value >>> 0;
	};
	// U32(Bits(9), Bits(13), Bits(18), Bits(30)) + 1: two bits choose how many bits the value has.
	const readLength = () => read([9, 13, 18, 30][read(2)]) + 1;
	const small = read(1);
	const height = small ? (read(5) + 1) * 8 : readLength();
	/** @type {([number, number] | null)[]} */
	const ratios = [null, [1, 1], [12, 10], [4, 3], [3, 2], [16, 9], [5, 4], [2, 1]];
	const pair = ratios[read(3)];
	const width = pair ? Math.floor((height * pair[0]) / pair[1]) : small ? (read(5) + 1) * 8 : readLength();
	return { width, height };
}

/** @type {Functions.ImageInfo.Metadata.parseIsoBmff} */
async function parseIsoBmff(ctx) {
	const { bytes } = ctx;
	const boxes = readBoxes(bytes, 0, bytes.length);
	const ftyp = boxes.find((box) => box.type === "ftyp");
	const brands = ftyp ? [ascii(bytes, ftyp.start, 4), ...Array.from({ length: Math.max(0, (ftyp.end - ftyp.start - 8) / 4) }, (_, index) => ascii(bytes, ftyp.start + 8 + index * 4, 4))] : [];
	const major = brands[0] ?? "";
	if (major === "jxl ") {
		setFormat(ctx, "JPEG XL", "image/jxl");
	} else if (major === "avif" || major === "avis" || brands.includes("avif") || brands.includes("avis")) {
		setFormat(ctx, "AVIF", "image/avif");
	} else if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(major) || brands.includes("heic")) {
		setFormat(ctx, "HEIC", "image/heic");
	} else if (major === "jp2 " || major === "jpx " || boxes.some((box) => box.type === "jP  ")) {
		setFormat(ctx, "JPEG 2000", "image/jp2");
	} else {
		setFormat(ctx, "HEIF", "image/heif");
	}
	if (brands.length) {
		add(ctx, "file", "MajorBrand", major.trim());
		add(ctx, "file", "CompatibleBrands", [...new Set(brands.slice(1).map((brand) => brand.trim()).filter(Boolean))].join(", "));
	}
	if (ctx.meta.format === "JPEG XL") {
		for (const box of boxes) {
			await attempt(ctx, `jxl:${box.type}`, async () => {
				if (box.type === "jxlc" && u8(bytes, box.start) === 0xff && u8(bytes, box.start + 1) === 0x0a) {
					const size = readJxlSize(bytes, box.start + 2);
					setSize(ctx, size.width, size.height);
				} else if (box.type === "jxlp" && u8(bytes, box.start + 4) === 0xff && u8(bytes, box.start + 5) === 0x0a) {
					const size = readJxlSize(bytes, box.start + 6);
					setSize(ctx, size.width, size.height);
				} else if (box.type === "Exif") {
					await parseTiff(ctx, bytes.subarray(box.start, box.end), 4 + u32(bytes, box.start));
				} else if (box.type === "xml ") {
					parseXmp(ctx, decode(bytes.subarray(box.start, box.end)));
				} else if (box.type === "jbrd") {
					add(ctx, "file", "JPEGReconstruction", "yes (losslessly recompressed JPEG)");
				} else if (box.type === "jumb") {
					add(ctx, "file", "ContentCredentials", `JUMBF (${box.end - box.start} bytes)`);
				}
			});
		}
		return;
	}
	if (ctx.meta.format === "JPEG 2000") {
		for (const box of boxes) {
			await attempt(ctx, `jp2:${box.type}`, async () => {
				if (box.type === "jp2h") {
					for (const child of readBoxes(bytes, box.start, box.end)) {
						if (child.type === "ihdr") {
							setSize(ctx, u32(bytes, child.start + 4), u32(bytes, child.start));
							add(ctx, "file", "NumberOfComponents", String(u16(bytes, child.start + 8)));
							const depth = u8(bytes, child.start + 10);
							if (depth !== 255) ctx.meta.summary.bitDepth = (depth & 0x7f) + 1;
						} else if (child.type === "colr" && u8(bytes, child.start) === 1) {
							const space = u32(bytes, child.start + 3);
							add(ctx, "file", "ColorSpace", { 16: "sRGB", 17: "Grayscale", 18: "sYCC" }[space] ?? String(space));
						} else if (child.type === "colr" && u8(bytes, child.start) === 2) {
							parseIcc(ctx, bytes.subarray(child.start + 3, child.end));
						}
					}
				} else if (box.type === "uuid" && hex(bytes.subarray(box.start, box.start + 16)) === "be7acfcb97a942e89c71999491e3afac") {
					parseXmp(ctx, decode(bytes.subarray(box.start + 16, box.end)));
				}
			});
		}
		return;
	}
	await parseHeif(ctx, boxes);
}

// --- SVG ---

// The size of an SVG from its width/height (in px or without a unit), otherwise from the viewBox.
/** @type {Functions.ImageInfo.Metadata.svgLength} */
function svgLength(value) {
	const match = /^\s*([\d.]+)\s*(px)?\s*$/i.exec(value || "");
	return match ? Number(match[1]) : null;
}

/** @type {Functions.ImageInfo.Metadata.parseSvg} */
async function parseSvg(ctx, compressed) {
	setFormat(ctx, "SVG", "image/svg+xml");
	const raw = compressed ? await inflate(ctx.bytes, "gzip") : ctx.bytes;
	if (compressed) add(ctx, "file", "Compression", "gzip (SVGZ)");
	const text = decode(raw.subarray(0, MAX_XML_BYTES));
	if (raw.length > MAX_XML_BYTES) ctx.warnings.add("truncated:svg");
	const root = parseXml(text);
	const svg = findNodes(root, "svg")[0] ?? findNodes(root, "svg:svg")[0];
	if (!svg) throw new Error("no <svg>");
	for (const name of ["width", "height", "viewBox", "version", "baseProfile", "preserveAspectRatio", "inkscape:version", "sodipodi:docname"]) {
		if (svg.attrs[name] !== undefined) add(ctx, "svg", name, svg.attrs[name]);
	}
	const viewBox = (svg.attrs.viewBox || "").trim().split(/[\s,]+/).map(Number);
	const width = svgLength(svg.attrs.width) ?? (viewBox.length === 4 ? viewBox[2] : null);
	const height = svgLength(svg.attrs.height) ?? (viewBox.length === 4 ? viewBox[3] : null);
	if (width !== null && height !== null) setSize(ctx, width, height);
	const title = svg.children.find((child) => child.name === "title");
	if (title) add(ctx, "svg", "title", title.text);
	const description = svg.children.find((child) => child.name === "desc");
	if (description) add(ctx, "svg", "desc", description.text);
	const generator = /<!--\s*(?:Generator:|Created with)\s*([^>]*?)-->/i.exec(text);
	if (generator) add(ctx, "svg", "Generator", generator[1]);
	const elements = (text.match(/<[A-Za-z]/g) ?? []).length;
	add(ctx, "svg", "Elements", String(elements));
	if (/<script[\s>]/i.test(text) || /\son[a-z]+\s*=/i.test(text)) add(ctx, "svg", "Scripts", "yes");
	if (/<foreignObject[\s>]/i.test(text)) add(ctx, "svg", "ForeignObject", "yes");
	const external = (text.match(/(?:xlink:)?href\s*=\s*["']https?:/gi) ?? []).length;
	if (external) add(ctx, "svg", "ExternalReferences", String(external));
	for (const metadata of findNodes(svg, "metadata")) {
		const rdf = findNodes(metadata, "rdf:RDF");
		if (rdf.length) parseXmp(ctx, text.slice(text.indexOf("<rdf:RDF"), text.indexOf("</rdf:RDF>") + 10));
	}
}

// --- Other formats ---

/** @type {Readonly<Record<number, string>>} */
const BMP_COMPRESSION = { 0: "None (BI_RGB)", 1: "RLE8", 2: "RLE4", 3: "Bitfields", 4: "JPEG", 5: "PNG", 6: "Alpha bitfields" };

/** @type {Functions.ImageInfo.Metadata.parseBmp} */
function parseBmp(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "BMP", "image/bmp");
	const headerSize = u32(bytes, 14, true);
	add(ctx, "file", "BMPVersion", { 12: "OS/2 V1", 40: "Windows V3", 52: "Windows V3 (Adobe)", 56: "Windows V3 (Adobe)", 64: "OS/2 V2", 108: "Windows V4", 124: "Windows V5" }[headerSize] ?? `header ${headerSize} bytes`);
	if (headerSize === 12) {
		setSize(ctx, u16(bytes, 18, true), u16(bytes, 20, true));
		ctx.meta.summary.bitDepth = u16(bytes, 24, true);
	} else {
		const height = i32(bytes, 22, true);
		setSize(ctx, i32(bytes, 18, true), Math.abs(height));
		if (height < 0) add(ctx, "file", "RowOrder", "top-down");
		ctx.meta.summary.bitDepth = u16(bytes, 28, true);
		add(ctx, "file", "Compression", BMP_COMPRESSION[u32(bytes, 30, true)] ?? String(u32(bytes, 30, true)));
		const xppm = i32(bytes, 38, true);
		const yppm = i32(bytes, 42, true);
		if (xppm || yppm) add(ctx, "file", "Resolution", `${Math.round(xppm * 0.0254)} × ${Math.round(yppm * 0.0254)} dpi`);
		const colors = u32(bytes, 46, true);
		if (colors) add(ctx, "file", "PaletteColors", String(colors));
	}
	add(ctx, "file", "BitsPerPixel", String(ctx.meta.summary.bitDepth));
}

/** @type {Functions.ImageInfo.Metadata.parseIco} */
function parseIco(ctx, cursor) {
	const { bytes } = ctx;
	setFormat(ctx, cursor ? "CUR" : "ICO", "image/x-icon");
	const count = u16(bytes, 4, true);
	/** @type {string[]} */
	const images = [];
	let largest = 0;
	for (let index = 0; index < Math.min(count, 256); index++) {
		const at = 6 + index * 16;
		const width = u8(bytes, at) || 256;
		const height = u8(bytes, at + 1) || 256;
		const bits = cursor ? 0 : u16(bytes, at + 6, true);
		const size = u32(bytes, at + 8, true);
		const offset = u32(bytes, at + 12, true);
		const png = startsWith(bytes, offset, "\x89PNG");
		images.push(`${width}×${height}${bits ? ` ${bits} bit` : ""}${png ? " PNG" : ""} (${size} B)`);
		if (width * height > largest) {
			largest = width * height;
			ctx.meta.width = width;
			ctx.meta.height = height;
		}
	}
	add(ctx, "file", "Images", String(count));
	add(ctx, "file", "ImageSizes", images.join(", "));
}

/** @type {Functions.ImageInfo.Metadata.parsePsd} */
async function parsePsd(ctx) {
	const { bytes } = ctx;
	setFormat(ctx, "PSD", "image/vnd.adobe.photoshop");
	const version = u16(bytes, 4);
	add(ctx, "file", "PSDVersion", version === 2 ? "PSB (large document)" : String(version));
	add(ctx, "file", "Channels", String(u16(bytes, 12)));
	setSize(ctx, u32(bytes, 18), u32(bytes, 14));
	ctx.meta.summary.bitDepth = u16(bytes, 22);
	const modes = ["Bitmap", "Grayscale", "Indexed", "RGB", "CMYK", "", "", "Multichannel", "Duotone", "Lab"];
	ctx.meta.summary.colorType = modes[u16(bytes, 24)] || String(u16(bytes, 24));
	add(ctx, "file", "ColorMode", ctx.meta.summary.colorType);
	const resourcesAt = 26 + 4 + u32(bytes, 26);
	const length = u32(bytes, resourcesAt);
	await parsePhotoshop(ctx, bytes.subarray(resourcesAt + 4, Math.min(bytes.length, resourcesAt + 4 + length)));
}

// --- The entry point ---

// The format by the signature of the file.
/** @type {Functions.ImageInfo.Metadata.detectFormat} */
export function detectFormat(bytes) {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
	if (startsWith(bytes, 0, "\x89PNG\r\n\x1a\n")) return "png";
	if (startsWith(bytes, 0, "GIF87a") || startsWith(bytes, 0, "GIF89a")) return "gif";
	if (startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP")) return "webp";
	if (startsWith(bytes, 4, "ftyp") || startsWith(bytes, 0, "\0\0\0\x0cjP  \r\n\x87\n") || startsWith(bytes, 0, "\0\0\0\x0cJXL \r\n\x87\n")) return "isobmff";
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a) return "jxl";
	if (startsWith(bytes, 0, "II*\0") || startsWith(bytes, 0, "MM\0*")) return "tiff";
	if (startsWith(bytes, 0, "BM") && bytes.length >= 26) return "bmp";
	if (startsWith(bytes, 0, "\0\0\x01\0")) return "ico";
	if (startsWith(bytes, 0, "\0\0\x02\0")) return "cur";
	if (startsWith(bytes, 0, "8BPS")) return "psd";
	if (startsWith(bytes, 0, "qoif")) return "qoi";
	if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "gzip";
	const head = decode(bytes.subarray(0, 4096), "latin1");
	if (/^(?:\uFEFF|\xEF\xBB\xBF)?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>:]/i.test(head) || /<svg[\s>]/i.test(head)) return "svg";
	return null;
}

// The metadata of an image file. complete: false — only the beginning of the file is available (the
// response was cut off while capturing); the parts that are missing give no error, only the warning
// "incomplete". maxEntries, maxXmpEntries — the limits from the settings (without them, or not a positive
// number: MAX_ENTRIES, MAX_XMP_ENTRIES).
/** @type {Functions.ImageInfo.Metadata.parseImageMetadata} */
export async function parseImageMetadata(bytes, options = {}) {
	const limit = (/** @type {number | undefined} */ value, /** @type {number} */ fallback) => (typeof value === "number" && value >= 1 ? Math.floor(value) : fallback);
	const ctx = createContext(bytes, options.complete !== false, {
		maxEntries: limit(options.maxEntries, MAX_ENTRIES),
		maxXmpEntries: limit(options.maxXmpEntries, MAX_XMP_ENTRIES),
	});
	const format = detectFormat(bytes);
	await attempt(ctx, format ?? "file", async () => {
		if (format === "jpeg") await parseJpeg(ctx);
		else if (format === "png") await parsePng(ctx);
		else if (format === "gif") parseGif(ctx);
		else if (format === "webp") await parseWebp(ctx);
		else if (format === "isobmff") await parseIsoBmff(ctx);
		else if (format === "jxl") {
			setFormat(ctx, "JPEG XL", "image/jxl");
			const size = readJxlSize(bytes, 2);
			setSize(ctx, size.width, size.height);
			add(ctx, "file", "Container", "none (bare codestream)");
		} else if (format === "tiff") {
			setFormat(ctx, "TIFF", "image/tiff");
			const result = await parseTiff(ctx, bytes);
			add(ctx, "file", "ByteOrder", result.byteOrder);
			if (result.width !== null && result.height !== null) setSize(ctx, result.width, result.height);
		} else if (format === "bmp") parseBmp(ctx);
		else if (format === "ico" || format === "cur") parseIco(ctx, format === "cur");
		else if (format === "psd") await parsePsd(ctx);
		else if (format === "qoi") {
			setFormat(ctx, "QOI", "image/qoi");
			setSize(ctx, u32(bytes, 4), u32(bytes, 8));
			add(ctx, "file", "Channels", u8(bytes, 12) === 4 ? "RGBA" : "RGB");
			add(ctx, "file", "ColorSpace", u8(bytes, 13) === 1 ? "linear" : "sRGB with linear alpha");
		} else if (format === "gzip" || format === "svg") await parseSvg(ctx, format === "gzip");
		else ctx.warnings.add("unknownFormat");
	});
	finish(ctx);
	return ctx.meta;
}

// The summary of the most common values and the groups in the result.
/** @type {Functions.ImageInfo.Metadata.finish} */
function finish(ctx) {
	const value = (/** @type {string[]} */ ...names) => {
		for (const name of names) {
			const found = ctx.first.get(name);
			if (found) return found;
		}
		return null;
	};
	const summary = ctx.meta.summary;
	const make = value("Make");
	const model = value("Model", "tiff:Model");
	summary.camera = make && model ? (model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0]) ? model : `${make} ${model}`) : model || make || value("tiff:Make");
	const lensModel = value("LensModel", "aux:Lens", "exifEX:LensModel");
	const lensMake = value("LensMake");
	summary.lens = lensModel && lensMake && !lensModel.toLowerCase().startsWith(lensMake.toLowerCase()) ? `${lensMake} ${lensModel}` : lensModel || value("LensInfo");
	const taken = value("DateTimeOriginal", "CreateDate", "exif:DateTimeOriginal", "photoshop:DateCreated", "xmp:CreateDate", "DateCreated");
	const offset = value("OffsetTimeOriginal", "OffsetTime");
	summary.taken = taken ? `${taken}${offset && ctx.first.get("DateTimeOriginal") === taken ? ` ${offset}` : ""}` : null;
	summary.software = value("Software", "xmp:CreatorTool", "OriginatingProgram", "Generator", "WriterName");
	summary.author = value("Artist", "XPAuthor", "By-line", "dc:creator", "Photographer", "Author");
	summary.copyright = value("Copyright", "CopyrightNotice", "dc:rights", "Copyright Notice");
	summary.title = value("dc:title", "XPTitle", "ObjectName", "Headline", "ImageTitle", "Title", "title");
	summary.description = value("ImageDescription", "Caption-Abstract", "dc:description", "XPComment", "Description", "desc", "Comment");
	// The place in words — IPTC (IIM, XMP Core and the structures LocationCreated / LocationShown of XMP Extension): the
	// first source that names any part of it, the parts from the smallest without repeating.
	const iptcExt = ["LocationCreated[1]", "LocationCreated", "LocationShown[1]", "LocationShown"].map((path) =>
		["LocationName", "Sublocation", "City", "ProvinceState", "CountryName"].map((field) => value(`Iptc4xmpExt:${path}/Iptc4xmpExt:${field}`))
	);
	const places = [
		[value("Sub-location", "Iptc4xmpCore:Location"), value("City", "photoshop:City"), value("Province-State", "photoshop:State"), value("Country-PrimaryLocationName", "photoshop:Country")],
		...iptcExt,
		[value("ContentLocationName")],
	];
	const parts = (places.find((place) => place.some(Boolean)) ?? []).filter((part) => part !== null);
	summary.place = [...new Map(parts.map((part) => [part.toLowerCase(), part])).values()].join(", ") || null;
	summary.orientation = value("Orientation");
	summary.colorProfile = value("ProfileDescription", "ProfileName");
	const { latitude, longitude, latitudeRef, longitudeRef, altitude, altitudeRef } = ctx.gps;
	if (typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude)) {
		const lat = latitudeRef === "S" ? -latitude : latitude;
		const lon = longitudeRef === "W" ? -longitude : longitude;
		if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
			summary.gps = {
				latitude: Math.round(lat * 1e6) / 1e6,
				longitude: Math.round(lon * 1e6) / 1e6,
				altitude: typeof altitude === "number" && Number.isFinite(altitude) ? Math.round((altitudeRef === 1 ? -altitude : altitude) * 10) / 10 : null,
			};
			add(ctx, "gps", "GPSPosition", `${formatDms(summary.gps.latitude, "N", "S")}, ${formatDms(summary.gps.longitude, "E", "W")}`);
		}
	}
	if (!ctx.meta.complete) ctx.warnings.add("incomplete");
	const order = ["file", "animation", "jfif", "exif", "gps", "interop", "thumbnail", "mpf", "xmp", "iptc", "photoshop", "icc", "adobe", "ducky", "text", "heif", "svg"];
	ctx.meta.groups = [...ctx.groups]
		.sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
		.map(([id, entries]) => ({ id, entries }));
	ctx.meta.warnings = [...ctx.warnings];
}
