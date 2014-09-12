(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
var TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":2,"ieee754":3}],2:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],3:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],4:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],5:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],6:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],7:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],9:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":7,"./encode":8}],10:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":6,"querystring":9}],11:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/*

    This code is not formatted for readability, but rather run-speed and to assist compilers.

    However, the code's intention should be transparent.

    *** IE SUPPORT ***

    If you require this library to work in IE7, add the following after declaring crel.

    var testDiv = document.createElement('div'),
        testLabel = document.createElement('label');

    testDiv.setAttribute('class', 'a');
    testDiv['className'] !== 'a' ? crel.attrMap['class'] = 'className':undefined;
    testDiv.setAttribute('name','a');
    testDiv['name'] !== 'a' ? crel.attrMap['name'] = function(element, value){
        element.id = value;
    }:undefined;


    testLabel.setAttribute('for', 'a');
    testLabel['htmlFor'] !== 'a' ? crel.attrMap['for'] = 'htmlFor':undefined;



*/

(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.crel = factory();
    }
}(this, function () {
    // based on http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
    var isNode = typeof Node === 'function'
        ? function (object) { return object instanceof Node; }
        : function (object) {
            return object
                && typeof object === 'object'
                && typeof object.nodeType === 'number'
                && typeof object.nodeName === 'string';
        };
    var isArray = function(a){ return a instanceof Array; };
    var appendChild = function(element, child) {
      if(!isNode(child)){
          child = document.createTextNode(child);
      }
      element.appendChild(child);
    };


    function crel(){
        var document = window.document,
            args = arguments, //Note: assigned to a variable to assist compilers. Saves about 40 bytes in closure compiler. Has negligable effect on performance.
            element = args[0],
            child,
            settings = args[1],
            childIndex = 2,
            argumentsLength = args.length,
            attributeMap = crel.attrMap;

        element = isNode(element) ? element : document.createElement(element);
        // shortcut
        if(argumentsLength === 1){
            return element;
        }

        if(typeof settings !== 'object' || isNode(settings) || isArray(settings)) {
            --childIndex;
            settings = null;
        }

        // shortcut if there is only one child that is a string
        if((argumentsLength - childIndex) === 1 && typeof args[childIndex] === 'string' && element.textContent !== undefined){
            element.textContent = args[childIndex];
        }else{
            for(; childIndex < argumentsLength; ++childIndex){
                child = args[childIndex];

                if(child == null){
                    continue;
                }

                if (isArray(child)) {
                  for (var i=0; i < child.length; ++i) {
                    appendChild(element, child[i]);
                  }
                } else {
                  appendChild(element, child);
                }
            }
        }

        for(var key in settings){
            if(!attributeMap[key]){
                element.setAttribute(key, settings[key]);
            }else{
                var attr = crel.attrMap[key];
                if(typeof attr === 'function'){
                    attr(element, settings[key]);
                }else{
                    element.setAttribute(attr, settings[key]);
                }
            }
        }

        return element;
    }

    // Used for mapping one kind of attribute to the supported version of that in bad browsers.
    // String referenced so that compilers maintain the property name.
    crel['attrMap'] = {};

    // String referenced so that compilers maintain the property name.
    crel["isNode"] = isNode;

    return crel;
}));

},{}],12:[function(require,module,exports){
var doc = {
    document: typeof document !== 'undefined' ? document : null,
    setDocument: function(d){
        this.document = d;
    }
};

var arrayProto = [],
    isList = require('./isList');
    getTargets = require('./getTargets')(doc.document),
    getTarget = require('./getTarget')(doc.document),
    space = ' ';


///[README.md]

function isIn(array, item){
    for(var i = 0; i < array.length; i++) {
        if(item === array[i]){
            return true;
        }
    }
}

/**

    ## .find

    finds elements that match the query within the scope of target

        //fluent
        doc(target).find(query);

        //legacy
        doc.find(target, query);
*/

function find(target, query){
    target = getTargets(target);
    if(query == null){
        return target;
    }

    if(isList(target)){
        var results = [];
        for (var i = 0; i < target.length; i++) {
            var subResults = doc.find(target[i], query);
            for(var j = 0; j < subResults.length; j++) {
                if(!isIn(results, subResults[j])){
                    results.push(subResults[j]);
                }
            }
        }
        return results;
    }

    return target ? target.querySelectorAll(query) : [];
};

/**

    ## .findOne

    finds the first element that matches the query within the scope of target

        //fluent
        doc(target).findOne(query);

        //legacy
        doc.findOne(target, query);
*/

function findOne(target, query){
    target = getTarget(target);
    if(query == null){
        return target;
    }

    if(isList(target)){
        var result;
        for (var i = 0; i < target.length; i++) {
            result = findOne(target[i], query);
            if(result){
                break;
            }
        }
        return result;
    }

    return target ? target.querySelector(query) : null;
};

/**

    ## .closest

    recurses up the DOM from the target node, checking if the current element matches the query

        //fluent
        doc(target).closest(query);

        //legacy
        doc.closest(target, query);
*/

function closest(target, query){
    target = getTarget(target);

    if(isList(target)){
        target = target[0];
    }

    while(
        target &&
        target.ownerDocument &&
        !is(target, query)
    ){
        target = target.parentNode;
    }

    return target === doc.document && target !== query ? null : target;
};

/**

    ## .is

    returns true if the target element matches the query

        //fluent
        doc(target).is(query);

        //legacy
        doc.is(target, query);
*/

function is(target, query){
    target = getTarget(target);

    if(isList(target)){
        target = target[0];
    }

    if(!target.ownerDocument || typeof query !== 'string'){
        return target === query;
    }
    return target === query || arrayProto.indexOf.call(find(target.parentNode, query), target) >= 0;
};

/**

    ## .addClass

    adds classes to the target

        //fluent
        doc(target).addClass(query);

        //legacy
        doc.addClass(target, query);
*/

function addClass(target, classes){
    target = getTargets(target);

    if(isList(target)){
        for (var i = 0; i < target.length; i++) {
            addClass(target[i], classes);
        }
        return this;
    }
    if(!classes){
        return this;
    }

    var classes = classes.split(space),
        currentClasses = target.classList ? null : target.className.split(space);

    for(var i = 0; i < classes.length; i++){
        var classToAdd = classes[i];
        if(!classToAdd || classToAdd === space){
            continue;
        }
        if(target.classList){
            target.classList.add(classToAdd);
        } else if(!currentClasses.indexOf(classToAdd)>=0){
            currentClasses.push(classToAdd);
        }
    }
    if(!target.classList){
        target.className = currentClasses.join(space);
    }
    return this;
};

/**

    ## .removeClass

    removes classes from the target

        //fluent
        doc(target).removeClass(query);

        //legacy
        doc.removeClass(target, query);
*/

function removeClass(target, classes){
    target = getTargets(target);

    if(isList(target)){
        for (var i = 0; i < target.length; i++) {
            removeClass(target[i], classes);
        }
        return this;
    }

    if(!classes){
        return this;
    }

    var classes = classes.split(space),
        currentClasses = target.classList ? null : target.className.split(space);

    for(var i = 0; i < classes.length; i++){
        var classToRemove = classes[i];
        if(!classToRemove || classToRemove === space){
            continue;
        }
        if(target.classList){
            target.classList.remove(classToRemove);
            continue;
        }
        var removeIndex = currentClasses.indexOf(classToRemove);
        if(removeIndex >= 0){
            currentClasses.splice(removeIndex, 1);
        }
    }
    if(!target.classList){
        target.className = currentClasses.join(space);
    }
    return this;
};

function addEvent(settings){
    var target = getTarget(settings.target);
    if(target){
        target.addEventListener(settings.event, settings.callback, false);
    }else{
        console.warn('No elements matched the selector, so no events were bound.');
    }
}

/**

    ## .on

    binds a callback to a target when a DOM event is raised.

        //fluent
        doc(target/proxy).on(events, target[optional], callback);

    note: if a target is passed to the .on function, doc's target will be used as the proxy.

        //legacy
        doc.on(events, target, query, proxy[optional]);
*/

function on(events, target, callback, proxy){

    proxy = getTargets(proxy);

    if(!proxy){
        target = getTargets(target);
        // handles multiple targets
        if(isList(target)){
            var multiRemoveCallbacks = [];
            for (var i = 0; i < target.length; i++) {
                multiRemoveCallbacks.push(on(events, target[i], callback, proxy));
            }
            return function(){
                while(multiRemoveCallbacks.length){
                    multiRemoveCallbacks.pop();
                }
            };
        }
    }

    // handles multiple proxies
    // Already handles multiple proxies and targets,
    // because the target loop calls this loop.
    if(isList(proxy)){
        var multiRemoveCallbacks = [];
        for (var i = 0; i < proxy.length; i++) {
            multiRemoveCallbacks.push(on(events, target, callback, proxy[i]));
        }
        return function(){
            while(multiRemoveCallbacks.length){
                multiRemoveCallbacks.pop();
            }
        };
    }

    var removeCallbacks = [];

    if(typeof events === 'string'){
        events = events.split(space);
    }

    for(var i = 0; i < events.length; i++){
        var eventSettings = {};
        if(proxy){
            if(proxy === true){
                proxy = doc.document;
            }
            eventSettings.target = proxy;
            eventSettings.callback = function(event){
                var closestTarget = closest(event.target, target);
                if(closestTarget){
                    callback(event, closestTarget);
                }
            };
        }else{
            eventSettings.target = target;
            eventSettings.callback = callback;
        }

        eventSettings.event = events[i];

        addEvent(eventSettings);

        removeCallbacks.push(eventSettings);
    }

    return function(){
        while(removeCallbacks.length){
            var removeCallback = removeCallbacks.pop();
            getTarget(removeCallback.target).removeEventListener(removeCallback.event, removeCallback.callback);
        }
    }
};

/**

    ## .off

    removes events assigned to a target.

        //fluent
        doc(target/proxy).off(events, target[optional], callback);

    note: if a target is passed to the .on function, doc's target will be used as the proxy.

        //legacy
        doc.off(events, target, callback, proxy);
*/

function off(events, target, callback, proxy){
    if(isList(target)){
        for (var i = 0; i < target.length; i++) {
            off(events, target[i], callback, proxy);
        }
        return this;
    }
    if(proxy instanceof Array){
        for (var i = 0; i < proxy.length; i++) {
            off(events, target, callback, proxy[i]);
        }
        return this;
    }

    if(typeof events === 'string'){
        events = events.split(space);
    }

    if(typeof callback !== 'function'){
        proxy = callback;
        callback = null;
    }

    proxy = proxy ? getTarget(proxy) : doc.document;

    var targets = typeof target === 'string' ? find(target, proxy) : [target];

    for(var targetIndex = 0; targetIndex < targets.length; targetIndex++){
        var currentTarget = targets[targetIndex];

        for(var i = 0; i < events.length; i++){
            currentTarget.removeEventListener(events[i], callback);
        }
    }
    return this;
};

/**

    ## .append

    adds elements to a target

        //fluent
        doc(target).append(children);

        //legacy
        doc.append(target, children);
*/

function append(target, children){
    var target = getTarget(target),
        children = getTarget(children);

    if(isList(target)){
        target = target[0];
    }

    if(isList(children)){
        for (var i = 0; i < children.length; i++) {
            append(target, children[i]);
        }
        return;
    }

    target.appendChild(children);
};

/**

    ## .prepend

    adds elements to the front of a target

        //fluent
        doc(target).prepend(children);

        //legacy
        doc.prepend(target, children);
*/

function prepend(target, children){
    var target = getTarget(target),
        children = getTarget(children);

    if(isList(target)){
        target = target[0];
    }

    if(isList(children)){
        //reversed because otherwise the would get put in in the wrong order.
        for (var i = children.length -1; i; i--) {
            prepend(target, children[i]);
        }
        return;
    }

    target.insertBefore(children, target.firstChild);
};

/**

    ## .isVisible

    checks if an element or any of its parents display properties are set to 'none'

        //fluent
        doc(target).isVisible();

        //legacy
        doc.isVisible(target);
*/

function isVisible(target){
    var target = getTarget(target);
    if(!target){
        return;
    }
    if(isList(target)){
        var i = -1;

        while (target[i++] && isVisible(target[i])) {}
        return target.length >= i;
    }
    while(target.parentNode && target.style.display !== 'none'){
        target = target.parentNode;
    }

    return target === doc.document;
};



/**

    ## .ready

    call a callback when the document is ready.

        //fluent
        doc().ready(callback);

        //legacy
        doc.ready(callback);
*/

function ready(target, callback){
    if(typeof target === 'function' && !callback){
        callback = target;
    }
    if(doc.document.body){
        callback();
    }else{
        doc.on('load', window, function(){
            callback();
        });
    }
};

doc.find = find;
doc.findOne = findOne;
doc.closest = closest;
doc.is = is;
doc.addClass = addClass;
doc.removeClass = removeClass;
doc.off = off;
doc.on = on;
doc.append = append;
doc.prepend = prepend;
doc.isVisible = isVisible;
doc.ready = ready;

module.exports = doc;
},{"./getTarget":14,"./getTargets":15,"./isList":16}],13:[function(require,module,exports){
var doc = require('./doc'),
    isList = require('./isList'),
    getTargets = require('./getTargets')(doc.document),
    flocProto = [];

function Floc(items){
    this.push.apply(this, items);
}
Floc.prototype = flocProto;
flocProto.constructor = Floc;

function floc(target){
    var instance = getTargets(target);

    if(!isList(instance)){
        if(instance){
            instance = [instance];
        }else{
            instance = [];
        }
    }
    return new Floc(instance);
}

var returnsSelf = 'addClass removeClass append prepend'.split(' ');

for(var key in doc){
    if(typeof doc[key] === 'function'){
        floc[key] = doc[key];
        flocProto[key] = (function(key){
            var instance = this;
            // This is also extremely dodgy and fast
            return function(a,b,c,d,e,f){
                var result = doc[key](this, a,b,c,d,e,f);

                if(result !== doc && isList(result)){
                    return floc(result);
                }
                if(returnsSelf.indexOf(key) >=0){
                    return instance;
                }
                return result;
            };
        }(key));
    }
}
flocProto.on = function(events, target, callback){
    var proxy = this;
    if(typeof target === 'function'){
        callback = target;
        target = this;
        proxy = null;
    }
    doc.on(events, target, callback, proxy);
    return this;
};

flocProto.off = function(events, target, callback){
    var reference = this;
    if(typeof target === 'function'){
        callback = target;
        target = this;
        reference = null;
    }
    doc.off(events, target, callback, reference);
    return this;
};

flocProto.addClass = function(className){
    doc.addClass(this, className);
    return this;
};

flocProto.removeClass = function(className){
    doc.removeClass(this, className);
    return this;
};

module.exports = floc;
},{"./doc":12,"./getTargets":15,"./isList":16}],14:[function(require,module,exports){
var singleId = /^#\w+$/;

module.exports = function(document){
    return function getTarget(target){
        if(typeof target === 'string'){
            if(singleId.exec(target)){
                return document.getElementById(target.slice(1));
            }
            return document.querySelector(target);
        }

        return target;
    };
};
},{}],15:[function(require,module,exports){

var singleClass = /^\.\w+$/,
    singleId = /^#\w+$/,
    singleTag = /^\w+$/;

module.exports = function(document){
    return function getTargets(target){
        if(typeof target === 'string'){
            if(singleId.exec(target)){
                // If you have more than 1 of the same id in your page,
                // thats your own stupid fault.
                return [document.getElementById(target.slice(1))];
            }
            if(singleTag.exec(target)){
                return document.getElementsByTagName(target);
            }
            if(singleClass.exec(target)){
                return document.getElementsByClassName(target.slice(1));
            }
            return document.querySelectorAll(target);
        }

        return target;
    };
};
},{}],16:[function(require,module,exports){
module.exports = function isList(object){
    return object !== window && (
        object instanceof Array ||
        (typeof HTMLCollection === 'function' && object instanceof HTMLCollection) ||
        (typeof NodeList === 'function' && object instanceof NodeList) ||
        Array.isArray(object) ||
        ''+object === '[object StaticNodeList]' ||
        ''+object === '[object HTMLCollection]'
    );
}

},{}],17:[function(require,module,exports){
var doc = require('doc-js'),
    EventEmitter = require('events').EventEmitter,
    interact = require('interact-js'),
    pythagoreanEquation = require('math-js/geometry/pythagoreanEquation'),
    crel = require('crel'),
    venfix = require('venfix'),
    unitr = require('unitr'),
    laidout = require('laidout');

var LEFT = 'left';
    RIGHT = 'right';
    BOTTOM = 'bottom';
    TOP = 'top',
    CLOSED = 'closed',
    OPEN = 'open',
    CLOSE = 'close'
    HORIZONTAL = 'horizontal',
    VERTICAL = 'vertical',
    CLOSE = 'close',
    NE = 45,
    NW = -45,
    SE = 135,
    SW = -135,
    opposites = {};

opposites[LEFT] = RIGHT;
opposites[RIGHT] = LEFT;
opposites[TOP] = BOTTOM;
opposites[BOTTOM] = TOP;

var allFlaps = [],
    openStack = [];

function getSideForAngle(angle){
    return angle > SW ?
        angle > NW ?
            angle > NE ?
                angle > SE ? BOTTOM : RIGHT :
            TOP :
        LEFT :
    BOTTOM;
}

function getPlane(angle){
    return ((angle > NE && angle < SE) || (angle < NW && angle > SW)) ? HORIZONTAL : VERTICAL;
}

function getPlaneForSide(side){
    return (side === LEFT || side === RIGHT) ? HORIZONTAL : VERTICAL;
}

function getFlapBoxInfo(flap){
    var targetElement = flap.distance ? flap.element : flap.content,
        boundingRect = targetElement.getBoundingClientRect(),
        gutter = flap.gutter,
        box = {
            left: boundingRect.left,
            marginLeft: boundingRect.left,
            top: boundingRect.top,
            marginTop: boundingRect.top,
            right: boundingRect.right,
            marginRight: boundingRect.right,
            bottom: boundingRect.bottom,
            marginBottom: boundingRect.bottom,
            width: boundingRect.width,
            marginWidth: boundingRect.width,
            height: boundingRect.height,
            marginHeight: boundingRect.height
        }

    if(flap.side === LEFT){
        box.marginWidth += gutter;
        box.marginRight += gutter;
    }else if(flap.side === RIGHT){
        box.marginWidth += gutter;
        box.marginLeft -= gutter;
    }else if(flap.side === BOTTOM){
        box.marginHeight += gutter;
        box.marginTop -= gutter;
    }else if(flap.side === TOP){
        box.marginHeight += gutter;
        box.marginBottom += gutter;
    }

    return box;
}

function bound(min, max, value){
    return Math.min(Math.max(value, min), max);
}

function getDistanceFromInteraction(interaction, flapInfo){
    var horizontalBound = bound.bind(null, window.scrollX, window.innerWidth + window.scrollX),
        verticalBound = bound.bind(null, window.scrollY, window.innerHeight + window.scrollY);

    return pythagoreanEquation(
        interaction.pageX - horizontalBound(flapInfo.box.marginLeft + flapInfo.box.marginWidth) - horizontalBound(flapInfo.box.marginWidth) / 2,
        interaction.pageY - verticalBound(flapInfo.box.marginTop + flapInfo.box.marginHeight) - verticalBound(flapInfo.box.marginHeight) / 2
    );
}

function getWorthyness(interaction, flapInfo1, flapInfo2){
    var interactionProximity = getDistanceFromInteraction(interaction, flapInfo2) - getDistanceFromInteraction(interaction, flapInfo1);

    return interactionProximity;
}

function getCandidatesForInteraction(interaction,flaps){
    return flaps.reduce(function(results, flap) {
        var box = getFlapBoxInfo(flap),
            angle = interaction.getCurrentAngle(true);

        if(
            !flap.beingDragged &&
            getPlaneForSide(flap.side) === getPlane(angle) &&
            interaction.pageX - window.scrollX > box.marginLeft &&
            interaction.pageX - window.scrollX < box.marginRight &&
            interaction.pageY - window.scrollY > box.marginTop &&
            interaction.pageY - window.scrollY < box.marginBottom
        ){
            results.push({
                box: box,
                flap: flap
            });
        }


        return results;

    }, []);
}

function moveableCandidates(interaction, candidate){
    var angle = interaction.getCurrentAngle(true),
        plane = getPlane(angle),
        flap = candidate.flap,
        side = flap.side,
        distance = flap.distance,
        maxPosition = flap.renderedWidth(),
        minPosition = 0;

    if(distance > minPosition && distance < maxPosition){
        return true;
    }

    var canMoveDirection = distance === minPosition ? opposites[side] : side;

    return canMoveDirection === getSideForAngle(angle);
}

function setLastInList(array, item){
    var index = array.indexOf(item);

    if(index>=0){
        array.splice(index, 1);
        array.push(item);
    }
}

function setFirstInList(array, item){
    var index = array.indexOf(item);

    if(index>=0){
        array.splice(index, 1);
        array.unshift(item);
    }
}

function forEachOpenFlap(fn){
    var i = allFlaps.length;
    while (i) {
        i--;
        var flap = allFlaps[i];
        if(flap.state === OPEN){
            fn(flap);
        }else{
            break;
        }
    };
}

function delegateInteraction(interaction){
    if(interaction._flap){
        interaction._flap._drag(interaction);
    }

    if(interaction._delegated){
        return;
    }

    interaction._delegated = true;

    var candidates = getCandidatesForInteraction(interaction, allFlaps),
        moveable = candidates.filter(moveableCandidates.bind(null, interaction));

    if(moveable.length){
        candidates = moveable;
    }

    var flapCandidate = candidates
        .sort(getWorthyness.bind(null, interaction))
        .pop();

    if(!flapCandidate){
        return;
    }

    interaction.preventDefault();

    interaction._flap = flapCandidate.flap;
    flapCandidate.flap._start(interaction);

    forEachOpenFlap(function(flap){
        if(
            flap !== flapCandidate.flap &&
            !doc(flapCandidate.flap.element).closest(flap.element)
        ){
            flap.close();
        }
    });
}

function endInteraction(interaction){
    if(interaction._flap){
        interaction._flap._end(interaction);
        interaction._flap = null;
    }else{
        forEachOpenFlap(function(flap){
            //if(doc(interaction.target).closest(flap.element)){
                flap._activate(interaction.originalEvent);
            //}
        });
    }
}

function bindEvents(){
    interact.on('drag', document, delegateInteraction);
    interact.on('end', document, endInteraction);
    interact.on('cancel', document, endInteraction);
}

if(typeof window !== 'undefined'){
    bindEvents();
}

function Flap(element){
    this.render(element);
    this.init();
    allFlaps.push(this);
}
Flap.prototype = Object.create(EventEmitter.prototype);

Flap.prototype.constructor = Flap;
Flap.prototype.distance = 0;
Flap.prototype.state = CLOSED;
Flap.prototype.width = 280;
Flap.prototype.side = LEFT;
Flap.prototype.gutter = 50;

Flap.prototype.destroy = function(){
    var index = allFlaps.indexOf(this);

    if(index >= 0){
        allFlaps.splice(index, 1);
    }
};
Flap.prototype.render = function(element){
    this.element = element || crel('div',
        crel('div')
    );
    this.element.style.opacity = '0';

    this.content = this.element.childNodes[0];
    this.element.flap = this;
};
Flap.prototype.init = function(){
    var flap = this;
    laidout(this.element, function(){
        if(this.enabled !== false){
            flap.enable();
        }else{
            flap.disable();
        }
        flap.updateStyle();
        flap.element.style.opacity = null;
        flap.emit('ready');
    });
};
Flap.prototype.enable = function(){
    this.enabled = true;

    this.element.style.position = 'fixed';
    this.element.style.top = unitr(0);
    this.element.style.bottom = unitr(0);
    this.element.style.left = unitr(0);
    this.element.style.right = unitr(0);
    this.close();

    this.content.style[venfix('boxSizing')] = 'border-box';
    this.content.style.position = 'absolute';
    this.content.style['overflow-x'] = 'hidden';
    this.content.style['overflow-y'] = 'auto';

    if(getPlaneForSide(this.side) === HORIZONTAL){
        this.content.style.top = unitr(0);
        this.content.style.bottom = unitr(0);
        this.content.style.width = unitr(this.width);
    }else{
        this.content.style.left = unitr(0);
        this.content.style.right = unitr(0);
        this.content.style.height = unitr(this.width);
    }

    if(this.side === LEFT){
        this.content.style.left = unitr(0);
    }else if(this.side === RIGHT){
        this.content.style.left = unitr(100, '%');
    }else if(this.side === BOTTOM){
        this.content.style.top = unitr(100, '%');
    }else if(this.side === TOP){
        this.content.style.top = unitr(0);
    }
    this.hide();
    this.update();
};
Flap.prototype.disable = function(){
    this.enabled = false;
    this.distance = 0;

    this.element.style.position = null;
    this.element.style.top = null;
    this.element.style.bottom = null;
    this.element.style.width = null;
    this.element.style[venfix('pointerEvents')] = null;

    this.content.style[venfix('boxSizing')] = null;
    this.content.style[venfix('transform')] = null;
    this.content.style.width = null;
    this.content.style.position = null;
    this.content.style.top = null;
    this.content.style.bottom = null;
    this.content.style.width = null;
    this.content.style['overflow-x'] = null;
    this.content.style['overflow-y'] = null;

    this.element.style.left = null;
    this.content.style.left = null;
    this.element.style.right = null;
    this.content.style.left = null;

    cancelAnimationFrame(this.settleFrame);

    this.show();
    this.update();
};
Flap.prototype._start = function(interaction){
    if(!this.enabled){
        return;
    }

    this._interaction = interaction;
    this._setOpen();
};
Flap.prototype._drag = function(interaction){
    if(!this.enabled){
        return;
    }

    var flap = this;

    var side = flap.side;

    flap.beingDragged = true;
    flap.startDistance = flap.startDistance || flap.distance;
    if(flap.side === LEFT){
        flap.distance = flap.startDistance + interaction.pageX - interaction.lastStart.pageX;
    }else if(flap.side === RIGHT){
        flap.distance = flap.startDistance - interaction.pageX + interaction.lastStart.pageX;
    }else if(flap.side === BOTTOM){
        flap.distance = flap.startDistance - interaction.pageY + interaction.lastStart.pageY;
    }else if(flap.side === TOP){
        flap.distance = flap.startDistance + interaction.pageY - interaction.lastStart.pageY;
    }
    flap.distance = Math.max(Math.min(flap.distance, flap.renderedWidth()), 0);
    flap.update();
    flap.speed = flap.distance - flap.oldDistance;
    flap.oldDistance = flap.distance;
};
Flap.prototype._end = function(interaction){
    if(!this.enabled){
        return;
    }

    this._interaction = null;

    this.startDistance = null;
    this.beingDragged = false;

    var direction = CLOSE;

    if(Math.abs(this.speed) >= 3){
        direction = this.speed < 0 ? CLOSE : OPEN;
    }else if(this.distance < this.renderedWidth() / 2){
        direction = CLOSE;
    }else{
        direction = OPEN;
    }

    this.settle(direction);
};
Flap.prototype._activate = function(event){
    if(!this.enabled){
        return;
    }

    if(
        !this.beingDragged &&
        !doc(event.target).closest(this.content)
    ){
        event.preventDefault();
        this.beingDragged = false;
        this.settle(CLOSE);
    }
};
Flap.prototype._setOpen = function(){
    var flap = this;
    this.show();
    this.state = OPEN;
    setLastInList(allFlaps, this);
    this.emit(OPEN);

    // This prevents the flap from screwing up
    // events on elements that may be under the swipe zone
    clearTimeout(this._pointerEventTimeout);
    this._pointerEventTimeout = setTimeout(function(){
        flap.element.style[venfix('pointerEvents')] = 'all';
    },500);
};
Flap.prototype.hide = function(){
    if(this.element.style.visibility !== 'hidden'){
        this.element.style.visibility = 'hidden';
    }
};
Flap.prototype.show = function(){
    if(this.element.style.visibility !== ''){
        this.element.style.visibility = '';
    }
};
Flap.prototype._setClosed = function(){
    clearTimeout(this._pointerEventTimeout);
    this.element.style[venfix('pointerEvents')] = 'none';
    this.hide();
    this.state = CLOSED;
    this.emit(CLOSE);
    setFirstInList(allFlaps, this);
};
Flap.prototype.update = function(interaction){
    var flap = this;

    if(this.distance > 0){
        this._setOpen();
    }

    if(this.side === LEFT || this.side === TOP){
        this.displayPosition = flap.distance - flap.renderedWidth();
    }else{
        this.displayPosition = -flap.distance;
    }

    if(flap.distance != flap.lastDistance){
        requestAnimationFrame(function(){
            flap.updateStyle(flap.displayPosition);
            flap.emit('move');
            flap.lastDistance = flap.distance;
        });
    }
};
Flap.prototype.updateStyle = function(displayPosition){
    if(this.enabled){
        if(getPlaneForSide(this.side) === HORIZONTAL){
            this.content.style[venfix('transform')] = 'translate3d(' + unitr(displayPosition) + ',0,0)';
        }else{
            this.content.style[venfix('transform')] = 'translate3d(0,' + unitr(displayPosition) + ',0)';
        }
    }
};
Flap.prototype.settle = function(direction){
    var flap = this;

    cancelAnimationFrame(this.settleFrame);

    if(this.beingDragged){
        return;
    }

    flap.distance += direction === CLOSE ? -1 : 1;

    if(this.distance <= 0){
        this.distance = 0;
        this._setClosed();
        this.update();
        this.emit('settle');
        return;
    }else if(this.distance >= this.renderedWidth()){
        this.distance = this.renderedWidth();
        this.update();
        this.emit('settle');
        return;
    }

    this.settleFrame = requestAnimationFrame(function(){
        var step = flap.tween(direction);
        flap.distance += direction === CLOSE ? -step : step;
        flap.update();
        flap.settle(direction);
    });
};
Flap.prototype.tween = function(direction){
    return direction === OPEN ?
        (this.renderedWidth() - this.distance) / 3 + 1:
        this.distance / 3 + 1;
};
Flap.prototype.percentOpen = function(){
    return parseFloat(100 / this.renderedWidth() * this.distance) || 0;
};
Flap.prototype.open = function(){
    if(!this.enabled || this._interaction){
        return;
    }
    this.settle(OPEN);
};
Flap.prototype.close = function(){
    if(!this.enabled || this._interaction){
        return;
    }
    this.settle(CLOSE);
};
var widthFrame;
Flap.prototype.renderedWidth = function(){
    if(getPlaneForSide(this.side) === HORIZONTAL){
        return this.content.clientWidth;
    }else{
        return this.content.clientHeight;
    }
};
module.exports = Flap;
},{"crel":11,"doc-js":13,"events":4,"interact-js":18,"laidout":19,"math-js/geometry/pythagoreanEquation":20,"unitr":21,"venfix":22}],18:[function(require,module,exports){
var interactions = [],
    minMoveDistance = 5,
    interact,
    maximumMovesToPersist = 1000, // Should be plenty..
    propertiesToCopy = 'target,pageX,pageY,clientX,clientY,offsetX,offsetY,screenX,screenY,shiftKey,x,y'.split(','), // Stuff that will be on every interaction.
    d = typeof document !== 'undefined' ? document : null;

function Interact(){
    this._elements = [];
}
Interact.prototype.on = function(eventName, target, callback){
    if(!target){
        return;
    }
    target._interactEvents = target._interactEvents || {};
    target._interactEvents[eventName] = target._interactEvents[eventName] || []
    target._interactEvents[eventName].push({
        callback: callback,
        interact: this
    });

    return this;
};
Interact.prototype.emit = function(eventName, target, event, interaction){
    if(!target){
        return;
    }

    var interact = this,
        currentTarget = target;

    interaction.originalEvent = event;
    interaction.preventDefault = function(){
        event.preventDefault();
    }
    interaction.stopPropagation = function(){
        event.stopPropagation();
    }

    while(currentTarget){
        currentTarget._interactEvents &&
        currentTarget._interactEvents[eventName] &&
        currentTarget._interactEvents[eventName].forEach(function(listenerInfo){
            if(listenerInfo.interact === interact){
                listenerInfo.callback.call(interaction, interaction);
            }
        });
        currentTarget = currentTarget.parentNode;
    }

    return this;
};
Interact.prototype.off =
Interact.prototype.removeListener = function(eventName, target, callback){
    if(!target || !target._interactEvents || !target._interactEvents[eventName]){
        return;
    }
    var interactListeners = target._interactEvents[eventName],
        listenerInfo;
    for(var i = 0; i < interactListeners.length; i++) {
        listenerInfo = interactListeners[i];
        if(listenerInfo.interact === interact && listenerInfo.callback === callback){
            interactListeners.splice(i,1);
            i--;
        }
    }

    return this;
};
interact = new Interact();

    // For some reason touch browsers never change the event target during a touch.
    // This is, lets face it, fucking stupid.
function getActualTarget() {
    var scrollX = window.scrollX,
        scrollY = window.scrollY;

    // IE is stupid and doesn't support scrollX/Y
    if(scrollX === undefined){
        scrollX = d.body.scrollLeft;
        scrollY = d.body.scrollTop;
    }

    return d.elementFromPoint(this.pageX - window.scrollX, this.pageY - window.scrollY);
}

function getMoveDistance(x1,y1,x2,y2){
    var adj = Math.abs(x1 - x2),
        opp = Math.abs(y1 - y2);

    return Math.sqrt(Math.pow(adj,2) + Math.pow(opp,2));
}

function destroyInteraction(interaction){
    for(var i = 0; i < interactions.length; i++){
        if(interactions[i].identifier === interaction.identifier){
            interactions.splice(i,1);
        }
    }
}

function getInteraction(identifier){
    for(var i = 0; i < interactions.length; i++){
        if(interactions[i].identifier === identifier){
            return interactions[i];
        }
    }
}

function setInheritedData(interaction, data){
    for(var i = 0; i < propertiesToCopy.length; i++) {
        interaction[propertiesToCopy[i]] = data[propertiesToCopy[i]]
    }
}

function getAngle(deltaPoint){
    return Math.atan2(deltaPoint.x, -deltaPoint.y) * 180 / Math.PI;
}

function Interaction(event, interactionInfo){
    // If there is no event (eg: desktop) just make the identifier undefined
    if(!event){
        event = {};
    }
    // If there is no extra info about the interaction (eg: desktop) just use the event itself
    if(!interactionInfo){
        interactionInfo = event;
    }

    // If there is another interaction with the same ID, something went wrong.
    // KILL IT WITH FIRE!
    var oldInteraction = getInteraction(interactionInfo.identifier);
    oldInteraction && oldInteraction.destroy();

    this.identifier = interactionInfo.identifier;

    this.moves = [];

    interactions.push(this);
}

Interaction.prototype = {
    constructor: Interaction,
    getActualTarget: getActualTarget,
    destroy: function(){
        interact.on('destroy', this.target, this, this);
        destroyInteraction(this);
    },
    start: function(event, interactionInfo){
        // If there is no extra info about the interaction (eg: desktop) just use the event itself
        if(!interactionInfo){
            interactionInfo = event;
        }

        var lastStart = {
                time: new Date(),
                phase: 'start'
            };
        setInheritedData(lastStart, interactionInfo);
        this.lastStart = lastStart;

        setInheritedData(this, interactionInfo);

        this.phase = 'start';
        interact.emit('start', event.target, event, this);
        return this;
    },
    move: function(event, interactionInfo){
        // If there is no extra info about the interaction (eg: desktop) just use the event itself
        if(!interactionInfo){
            interactionInfo = event;
        }

        var currentTouch = {
                time: new Date(),
                phase: 'move'
            };

        setInheritedData(currentTouch, interactionInfo);

        // Update the interaction
        setInheritedData(this, interactionInfo);

        this.moves.push(currentTouch);

        // Memory saver, culls any moves that are over the maximum to keep.
        this.moves = this.moves.slice(-maximumMovesToPersist);

        var moveDelta = this.getMoveDelta(),
            angle = 0;
        if(moveDelta){
            angle = getAngle(moveDelta);
        }

        this.angle = currentTouch.angle = angle;

        this.phase = 'move';
        interact.emit('move', event.target, event, this);
        return this;
    },
    drag: function(event, interactionInfo){
        // If there is no extra info about the interaction (eg: desktop) just use the event itself
        if(!interactionInfo){
            interactionInfo = event;
        }

        var currentTouch = {
                time: new Date(),
                phase: 'drag'
            };

        setInheritedData(currentTouch, interactionInfo);

        // Update the interaction
        setInheritedData(this, interactionInfo);

        if(!this.moves){
            this.moves = [];
        }

        this.moves.push(currentTouch);

        // Memory saver, culls any moves that are over the maximum to keep.
        this.moves = this.moves.slice(-maximumMovesToPersist);

        if(!this.dragStarted && getMoveDistance(this.lastStart.pageX, this.lastStart.pageY, currentTouch.pageX, currentTouch.pageY) > minMoveDistance){
            this.dragStarted = true;
        }

        var moveDelta = this.getMoveDelta(),
            angle = 0;
        if(moveDelta){
            angle = getAngle(moveDelta);
        }

        this.angle = currentTouch.angle = angle;

        if(this.dragStarted){
            this.phase = 'drag';
            interact.emit('drag', event.target, event, this);
        }
        return this;
    },
    end: function(event, interactionInfo){
        if(!interactionInfo){
            interactionInfo = event;
        }

        // Update the interaction
        setInheritedData(this, interactionInfo);

        if(!this.moves){
            this.moves = [];
        }

        // Update the interaction
        setInheritedData(this, interactionInfo);

        this.phase = 'end';
        interact.emit('end', event.target, event, this);

        return this;
    },
    cancel: function(event, interactionInfo){
        if(!interactionInfo){
            interactionInfo = event;
        }

        // Update the interaction
        setInheritedData(this, interactionInfo);

        this.phase = 'cancel';
        interact.emit('cancel', event.target, event, this);

        return this;
    },
    getMoveDistance: function(){
        if(this.moves.length > 1){
            var current = this.moves[this.moves.length-1],
                previous = this.moves[this.moves.length-2];

            return getMoveDistance(current.pageX, current.pageY, previous.pageX, previous.pageY);
        }
    },
    getMoveDelta: function(){
        var current = this.moves[this.moves.length-1],
            previous = this.moves[this.moves.length-2] || this.lastStart;

        if(!current || !previous){
            return;
        }

        return {
            x: current.pageX - previous.pageX,
            y: current.pageY - previous.pageY
        };
    },
    getSpeed: function(){
        if(this.moves.length > 1){
            var current = this.moves[this.moves.length-1],
                previous = this.moves[this.moves.length-2];

            return this.getMoveDistance() / (current.time - previous.time);
        }
        return 0;
    },
    getCurrentAngle: function(blend){
        var phase = this.phase,
            currentPosition,
            lastAngle,
            i = this.moves.length-1,
            angle,
            firstAngle,
            angles = [],
            blendSteps = 20/(this.getSpeed()*2+1),
            stepsUsed = 1;

        if(this.moves && this.moves.length){

            currentPosition = this.moves[i];
            angle = firstAngle = currentPosition.angle;

            if(blend && this.moves.length > 1){
                while(
                    --i > 0 &&
                    this.moves.length - i < blendSteps &&
                    this.moves[i].phase === phase
                ){
                    lastAngle = this.moves[i].angle;
                    if(Math.abs(lastAngle - firstAngle) > 180){
                        angle -= lastAngle;
                    }else{
                        angle += lastAngle;
                    }
                    stepsUsed++;
                }
                angle = angle/stepsUsed;
            }
        }
        if(angle === Infinity){
            return firstAngle;
        }
        return angle;
    },
    getAllInteractions: function(){
        return interactions.slice();
    }
};

function start(event){
    var touch;

    for(var i = 0; i < event.changedTouches.length; i++){
        touch = event.changedTouches[i];
        new Interaction(event, event.changedTouches[i]).start(event, touch);
    }
}
function drag(event){
    var touch;

    for(var i = 0; i < event.changedTouches.length; i++){
        touch = event.changedTouches[i];
        getInteraction(touch.identifier).drag(event, touch);
    }
}
function end(event){
    var touch;

    for(var i = 0; i < event.changedTouches.length; i++){
        touch = event.changedTouches[i];
        getInteraction(touch.identifier).end(event, touch).destroy();
    }
}
function cancel(event){
    var touch;

    for(var i = 0; i < event.changedTouches.length; i++){
        touch = event.changedTouches[i];
        getInteraction(touch.identifier).cancel(event, touch).destroy();
    }
}

addEvent(d, 'touchstart', start);
addEvent(d, 'touchmove', drag);
addEvent(d, 'touchend', end);
addEvent(d, 'touchcancel', cancel);

var mouseIsDown = false;
addEvent(d, 'mousedown', function(event){
    mouseIsDown = true;

    if(!interactions.length){
        new Interaction(event);
    }

    var interaction = getInteraction();

    if(!interaction){
        return;
    }

    getInteraction().start(event);
});
addEvent(d, 'mousemove', function(event){
    if(!interactions.length){
        new Interaction(event);
    }

    var interaction = getInteraction();

    if(!interaction){
        return;
    }

    if(mouseIsDown){
        interaction.drag(event);
    }else{
        interaction.move(event);
    }
});
addEvent(d, 'mouseup', function(event){
    mouseIsDown = false;

    var interaction = getInteraction();

    if(!interaction){
        return;
    }

    interaction.end(event, null);
    interaction.destroy();
});

function addEvent(element, type, callback) {
    if(element == null){
        return;
    }

    if(element.addEventListener){
        element.addEventListener(type, callback);
    }
    else if(d.attachEvent){
        element.attachEvent("on"+ type, callback);
    }
}

module.exports = interact;
},{}],19:[function(require,module,exports){
function checkElement(element){
    if(!element){
        return false;
    }
    var parentNode = element.parentNode;
    while(parentNode){
        if(parentNode === element.ownerDocument){
            return true;
        }
        parentNode = parentNode.parentNode;
    }
    return false;
}

module.exports = function laidout(element, callback){
    if(checkElement(element)){
        return callback();
    }

    var recheckElement = function(){
            if(checkElement(element)){
                document.removeEventListener('DOMNodeInserted', recheckElement);
                callback();
            }
        };

    document.addEventListener('DOMNodeInserted', recheckElement);
};
},{}],20:[function(require,module,exports){
module.exports = function(sideA, sideB){
    return Math.sqrt(Math.pow(sideA, 2) + Math.pow(sideB, 2));
}
},{}],21:[function(require,module,exports){
var parseRegex = /^(-?(?:\d+|\d+\.\d+|\.\d+))([^\.]*?)$/;

function parse(input){
    var valueParts = parseRegex.exec(input);

    if(!valueParts){
        return;
    }

    return {
        value: parseFloat(valueParts[1]),
        unit: valueParts[2]
    };
}

function addUnit(input, unit){
    var parsedInput = parse(input),
        parsedUnit = parse(unit);

    if(!parsedInput && parsedUnit){
        unit = input;
        parsedInput = parsedUnit;
    }

    if(!isNaN(unit)){
        unit = null;
    }

    if(!parsedInput){
        return input;
    }

    if(parsedInput.unit == null || parsedInput.unit == ''){
        parsedInput.unit = unit || 'px';
    }

    return parsedInput.value + parsedInput.unit;
};

module.exports = addUnit;
module.exports.parse = parse;
},{}],22:[function(require,module,exports){
var cache = {},
    bodyStyle = {};

if(typeof window !== 'undefined'){
    window.addEventListener('load', getBodyStyleProperties);
}

function getBodyStyleProperties(){
    var shortcuts = {},
        items = document.defaultView.getComputedStyle(document.body);

    for(var i = 0; i < items.length; i++){
        bodyStyle[items[i]] = null;

        // This is kinda dodgy but it works.
        baseName = items[i].match(/^(\w+)-.*$/);
        if(baseName){
            if(shortcuts[baseName[1]]){
                bodyStyle[baseName[1]] = null;
            }else{
                shortcuts[baseName[1]] = true;
            }
        }
    }
}

function venfix(property, target){
    if(!target && cache[property]){
        return cache[property];
    }

    target = target || bodyStyle;

    var props = [];

    for(var key in target){
        cache[key] = key;
        props.push(key);
    }

    if(property in target){
        return property;
    }

    var propertyRegex = new RegExp('^-(' + venfix.prefixes.join('|') + ')-' + property + '$', 'i');

    for(var i = 0; i < props.length; i++) {
        if(props[i].match(propertyRegex)){
            if(target === bodyStyle){
                cache[property] = props[i]
            }
            return props[i];
        }
    }
}

// Add extensibility
venfix.prefixes = ['webkit', 'moz', 'ms', 'o'];

module.exports = venfix;
},{}],23:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "ajax";

function Ajax(actionDefinition){
}
Ajax = Gaffa.createSpec(Ajax, Gaffa.Action);
Ajax.prototype.type = actionType;
Ajax.prototype.method = new Gaffa.Property({
    value: 'GET'
});
Ajax.prototype.auth = new Gaffa.Property();
Ajax.prototype.dataType = 'json';
Ajax.prototype.cors = new Gaffa.Property();
Ajax.prototype.trigger = function(parent, scope, event){

    var action = this,
        gaffa = this.gaffa,
        data = action.source.value,
        errorHandler = function (xhrEvent, error) {
            action.errors.set(error);

            scope.data = error;

            // EventEmitter will throw an error if you emit an error
            // and have no handler attached to handle it.
            // this event is only here as a convenience, not as the
            // primary means of handling errors.
            if(action._events.error){
                action.emit('error', {
                    domEvent: event,
                    scope: scope,
                    error: error
                });
            }
            action.triggerActions('error', scope, event);
        };

    if(action.dataType === 'formData'){
        var formData = new FormData();
        for(var key in data){
            if(data.hasOwnProperty(key)){
                data[key] != null && formData.append(key, data[key]);
            }
        }
        data = formData;
    }

    scope = scope || {};

    var ajaxSettings = {
        cors: action.cors.value,
        cache: action.cache,
        type: action.method.value,
        headers: action.headers.value,
        url: action.url.value || window.location.pathname,
        data: data,
        dataType: action.dataType,
        auth: action.auth.value,
        contentType: action.contentType,
        success:function(data){
            if(gaffa.responseIsError && gaffa.responseIsError(data)){
                errorHandler(data);
                return;
            }

            // Set the response into the model
            // and mark a portion of the model
            // as clean after a successful request.
            action.target.set(data, action.cleans === false);

            scope.data = data;

            action.emit('success', {
                domEvent: event,
                scope: scope,
                data: data
            });

            action.triggerActions('success', scope, event);
        },
        error: errorHandler,
        complete:function(){
            action.emit('complete', {
                domEvent: event,
                scope: scope
            });
            action.triggerActions('complete', scope, event);
        }
    };

    if(action.dataType === 'file'){
        data = new FormData();
        data.append("file", action.source.value);
        ajaxSettings.contentType = false;
        ajaxSettings.processData = false;
        ajaxSettings.data = data;
        dataType = false;
    }

    gaffa.ajax(ajaxSettings);

};
Ajax.prototype.target = new Gaffa.Property();
Ajax.prototype.source = new Gaffa.Property();
Ajax.prototype.errors = new Gaffa.Property();
Ajax.prototype.dirty = new Gaffa.Property();
Ajax.prototype.headers = new Gaffa.Property();
Ajax.prototype.url = new Gaffa.Property();

module.exports = Ajax;
},{"gaffa":56}],24:[function(require,module,exports){
"use strict";

var Gaffa = require('gaffa'),
    crel = require('crel'),
    viewType = "anchor",
	cachedElement;

function Anchor(){
}
Anchor = Gaffa.createSpec(Anchor, Gaffa.ContainerView);
Anchor.prototype.type = viewType;

Anchor.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel('a',textNode),
        viewModel = this;

    this.views.content.element = renderedElement;

    this.renderedElement = renderedElement;

    this.text.textNode = textNode;

    if(!this.external){
        // Prevent default click action reguardless of gaffa.event implementation
        renderedElement.onclick = function(event){
            if(event.which === 1){
                event.preventDefault()
            }
        };

        this.gaffa.events.on('click', renderedElement, function(event){
            if(event.which === 1){
                viewModel.gaffa.navigate(viewModel.href.value, viewModel.target.value);
            }
        });
    }
};

Anchor.prototype.text = new Gaffa.Property(function(view, value){
    if(value !== null && value !== undefined){
        this.textNode.textContent = value;
    }else{
        this.textNode.textContent = '';
    }
});

Anchor.prototype.target = new Gaffa.Property(function(viewModel, value){
    if(typeof value === 'string'){
        viewModel.renderedElement.setAttribute('target', value);
    }else{
        viewModel.renderedElement.removeAttribute('target');
    }
});

Anchor.prototype.href = new Gaffa.Property(function(viewModel, value){
    if(value !== null && value !== undefined){
        viewModel.renderedElement.setAttribute("href",value);
    }else{
        viewModel.renderedElement.removeAttribute("href");
    }
});

module.exports = Anchor;
},{"crel":11,"gaffa":56}],25:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel');

function Button(){}
Button = Gaffa.createSpec(Button, Gaffa.ContainerView);
Button.prototype._type = 'button';

Button.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel('button', textNode);

    this.views.content.element = renderedElement;

    this.textNode = textNode;

    this.renderedElement = renderedElement;

};

Button.prototype.text = new Gaffa.Property(function(view, value){
    if(value !== null && value !== undefined){
        view.textNode.textContent = value;
    }else{
        view.textNode.textContent = '';
    }
});

Button.prototype.type = new Gaffa.Property(function(viewModel, value){
    viewModel.renderedElement.setAttribute("type", value || 'button');
});

Button.prototype.disabled = new Gaffa.Property(function(viewModel, value){
    if(value){
        viewModel.renderedElement.setAttribute("disabled", "disabled");
    }else{
        viewModel.renderedElement.removeAttribute("disabled");
    }
});

module.exports = Button;
},{"crel":11,"gaffa":56}],26:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "concat";

function Concat(){}
Concat = Gaffa.createSpec(Concat, Gaffa.Action);
Concat.prototype.type = actionType;
Concat.prototype.trigger = function(){

    var gaffa = this.gaffa,
        target = this.target.value,
        source = this.source.value


    if(source && source.slice){
        source = source.slice();
    }

    if(target && target.concat){
        if(Array.isArray(target) && !(this.clone && this.clone.value === false)){
            for(var i = 0; i < source.length; i++) {
                source[i] = gaffa.clone(source[i]);
            }
        }
        this.target.set(this.target.value.concat(source), this);
    }
};
Concat.prototype.target = new Gaffa.Property();
Concat.prototype.source = new Gaffa.Property();
Concat.prototype.clone = new Gaffa.Property();



module.exports = Concat;
},{"gaffa":56}],27:[function(require,module,exports){
var Gaffa = require('gaffa');

function Container(){}
Container = Gaffa.createSpec(Container, Gaffa.ContainerView);
Container.prototype.type = 'container';

Container.prototype.render = function(){
    this.views.content.element =
    this.renderedElement =
    document.createElement(this.tagName || 'div');
};

module.exports = Container;
},{"gaffa":56}],28:[function(require,module,exports){
var Gaffa = require('gaffa'),
    doc = require('doc-js'),
    crel = require('crel');

function Form(){}
Form = Gaffa.createSpec(Form, Gaffa.ContainerView);
Form.prototype._type = 'form';

Form.prototype.render = function(){
    var view = this,
        renderedElement = crel('form')

    if (this.action) {
        renderedElement.setAttribute("action", this.action);
    } else {
        renderedElement.addEventListener('submit', function (event) {
            if(view.actions.submit){
                event.preventDefault();
            }
        });
    }

    this.views.content.element = renderedElement;

    this.renderedElement = renderedElement;

    doc(renderedElement).on('change', function(){
        if(!renderedElement.checkValidity){
            // This browser is old.
            return;
        }

        // https://code.google.com/p/chromium/issues/detail?can=2&q=checkValidity&colspec=ID%20Pri%20M%20Iteration%20ReleaseBlock%20Cr%20Status%20Owner%20Summary%20OS%20Modified&id=360444&thanks=360444&ts=1396842451
        setTimeout(function(){
            view.valid.set(renderedElement.checkValidity());
        },0);
    });

};

Form.prototype.method = new Gaffa.Property({
    update: function(view, value){
        view.renderedElement.setAttribute('method', value);
    },
    value: 'POST'
});
Form.prototype.valid = new Gaffa.Property();

module.exports = Form;
},{"crel":11,"doc-js":13,"gaffa":56}],29:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel'),
    statham = require('statham');

function Frame(){}
Frame = Gaffa.createSpec(Frame, Gaffa.ContainerView);
Frame.prototype._type = 'frame';

Frame.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel(this.tagName || 'div');

    this.views.content.element = renderedElement;

    this.renderedElement = renderedElement;
};

Frame.prototype.url = new Gaffa.Property(function(view, value){
    var gaffa = this.gaffa;

    if(value == null){
        return;
    }

    if(view._pendingRequest){
        view._pendingRequest.abort();
        view._pendingRequest = null;
    }

    view._pendingRequest = gaffa.ajax({
        url: value,
        type: 'get',
        dataType: 'json',
        success: function(data){
            var viewDefinition = statham.revive(data),
                child = gaffa.initialiseView(viewDefinition);

            if(view._loadedView){
                view._loadedView.remove();
                view._loadedView = null;
            }

            view._loadedView = child;
            view.views.content.abortDeferredAdd();
            view.views.content.add(child);
            view.triggerActions('success');
        },
        error: function(error){
            view.triggerActions('error', {error: error});
        },
        complete: function(){
            view.triggerActions('complete');
            view._pendingRequest = null;
        }
    });
});

module.exports = Frame;
},{"crel":11,"gaffa":56,"statham":115}],30:[function(require,module,exports){
"use strict";

var Gaffa = require('gaffa'),
    crel = require('crel'),
    viewType = "heading";

function Heading(){    }
Heading = Gaffa.createSpec(Heading, Gaffa.View);
Heading.prototype.type = viewType;

Heading.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel('h' + (parseInt(this.level) || 1),textNode);

    this.renderedElement = renderedElement;

    this.text.textNode = textNode;

};

Heading.prototype.text = new Gaffa.Property(function(view, value){
    if(value !== null && value !== undefined){
        this.textNode.textContent = value;
    }else{
        this.textNode.textContent = '';
    }
});

module.exports = Heading;
},{"crel":11,"gaffa":56}],31:[function(require,module,exports){
"use strict";

var Gaffa = require('gaffa'),
    crel = require('crel'),
    viewType = "html";

function Html(){}
Html = Gaffa.createSpec(Html, Gaffa.View);
Html.prototype.type = viewType;

Html.prototype.render = function(){
    var classes = viewType;

    var renderedElement = crel('span');

    this.renderedElement = renderedElement;

};

Html.prototype.html = new Gaffa.Property(function(viewModel, value){
    viewModel.renderedElement.innerHTML = (typeof value === 'string' || typeof value === 'number') ? value : null;
});

module.exports = Html;
},{"crel":11,"gaffa":56}],32:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel'),
	cachedElement;

function imageToURI(image, callback) {
    var reader = new window.FileReader();
    reader.onload = function(event) {
        callback(event.target.result);
    };
    reader.readAsDataURL(image);
}

function Image(){}
Image = Gaffa.createSpec(Image, Gaffa.View);
Image.prototype._type = 'image';

Image.prototype.render = function(){
    this.renderedElement = crel('img');
};

Image.prototype.source = new Gaffa.Property(function (viewModel, value) {
    viewModel.renderedElement[value != null ? 'setAttribute' : 'removeAttribute']('src', value);
});

Image.prototype.image = new Gaffa.Property(function (viewModel, value) {
    if(!value){
        return;
    }
    if(typeof value === 'string'){
        viewModel.renderedElement.setAttribute("src", value);
    }else{
        imageToURI(value, function(dataURI){
            viewModel.renderedElement.setAttribute("src", dataURI);
        });
    }
});

module.exports = Image;
},{"crel":11,"gaffa":56}],33:[function(require,module,exports){
"use strict";

var Gaffa = require('gaffa'),
    crel = require('crel'),
    viewType = 'label';

function Label(){}
Label = Gaffa.createSpec(Label, Gaffa.View);
Label.prototype.type = viewType;

Label.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel(this.tagName || 'label', textNode);

    this.renderedElement = renderedElement;

    this.text.textNode = textNode;

};

Label.prototype.text = new Gaffa.Property(function(view, value){
    if(value !== null && value !== undefined){
        this.textNode.textContent = value;
    }else{
        this.textNode.textContent = '';
    }
});

Label.prototype.labelFor = new Gaffa.Property(function (viewModel, value) {
    if (value === null || value === undefined) {
        viewModel.renderedElement.removeAttribute("labelFor");
    } else {
        viewModel.renderedElement.setAttribute("labelFor", value);
    }
});

module.exports = Label;
},{"crel":11,"gaffa":56}],34:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel'),
    TemplaterProperty = require('gaffa/templaterProperty');

function List(){
    this.views.list = new Gaffa.ViewContainer(this.views.list);
    this.views.empty = new Gaffa.ViewContainer(this.views.empty);
}
List = Gaffa.createSpec(List, Gaffa.ContainerView);
List.prototype._type = 'list';

List.prototype.render = function(){
    var renderedElement = crel(this.tagName || 'div');

    this.views.content.element = renderedElement;
    this.views.list.element = renderedElement;
    this.views.empty.element = renderedElement;
    this.renderedElement = renderedElement;

};

List.prototype.list = new TemplaterProperty({
    viewsName: 'list'
});

module.exports = List;
},{"crel":11,"gaffa":56,"gaffa/templaterProperty":105}],35:[function(require,module,exports){
var Gaffa = require('gaffa');

function change(behaviour){
    var gaffa = behaviour.gaffa;

    if(!behaviour.condition.value){
        return;
    }

    var throttleTime = behaviour.throttle;
    if(!isNaN(throttleTime)){
        var now = new Date();
        if(!behaviour.lastTrigger || now - behaviour.lastTrigger > throttleTime){
            behaviour.lastTrigger = now;
            behaviour.triggerActions('change');
        }else{
            clearTimeout(behaviour.timeout);
            behaviour.timeout = setTimeout(function(){
                    behaviour.lastTrigger = now;
                    behaviour.triggerActions('change');
                },
                throttleTime - (now - behaviour.lastTrigger)
            );
        }
    }else{
        behaviour.triggerActions('change');
    }
}

function ModelChangeBehaviour(){}
ModelChangeBehaviour = Gaffa.createSpec(ModelChangeBehaviour, Gaffa.Behaviour);
ModelChangeBehaviour.prototype._type = 'modelChange';
ModelChangeBehaviour.prototype.condition = new Gaffa.Property({
    update: change,
    value: true
});
ModelChangeBehaviour.prototype.watch = new Gaffa.Property(change);

module.exports = ModelChangeBehaviour;
},{"gaffa":56}],36:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "navigate";

function Navigate(){}
Navigate = Gaffa.createSpec(Navigate, Gaffa.Action);
Navigate.prototype.type = actionType;
Navigate.prototype.url = new Gaffa.Property();
Navigate.prototype.target = new Gaffa.Property();
Navigate.prototype.data = new Gaffa.Property();
Navigate.prototype.pushstate = new Gaffa.Property();
Navigate.prototype.external = new Gaffa.Property();
Navigate.prototype.trigger = function() {

    if(this.external.value){
        window.location = this.url.value;
        return;
    }
    this.gaffa.navigate(this.url.value, this.target.value, this.pushstate.value, this.data.value);
}

module.exports = Navigate;
},{"gaffa":56}],37:[function(require,module,exports){
var Gaffa = require('gaffa'),
    behaviourType = 'pageLoad';

function PageLoadBehaviour(){}
PageLoadBehaviour = Gaffa.createSpec(PageLoadBehaviour, Gaffa.Behaviour);
PageLoadBehaviour.prototype.type = behaviourType;
PageLoadBehaviour.prototype.bind = function(){

    this.gaffa.actions.trigger(this.actions.load, this);
};

module.exports = PageLoadBehaviour;
},{"gaffa":56}],38:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "push";

function Push(){}
Push = Gaffa.createSpec(Push, Gaffa.Action);
Push.prototype.type = actionType;
Push.prototype.trigger = function(){

    var toObject = this.target.value;
    if(toObject == null){
        toObject = [];
        this.target.set(toObject);
    }
    if(Array.isArray(toObject)){
        var fromObj = this.source.value;
        if(!(this.clone && this.clone.value === false)){
            fromObj = this.gaffa.clone(fromObj);
        }
        var pushToBinding = this.gaffa.gedi.paths.append(this.target.binding, this.gaffa.gedi.paths.create(toObject.length.toString()));
        this.gaffa.model.set(pushToBinding, fromObj, this, this.cleans.value ? false : null);
    }else{
        throw "Attempted to push to model property that was not an array, null, or undefined";
    }
};
Push.prototype.target = new Gaffa.Property();
Push.prototype.source = new Gaffa.Property();
Push.prototype.cleans = new Gaffa.Property();
Push.prototype.clone = new Gaffa.Property({
    value: true
});



module.exports = Push;
},{"gaffa":56}],39:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "remove";

function Remove(){}
Remove = Gaffa.createSpec(Remove, Gaffa.Action);
Remove.prototype.type = actionType;
Remove.prototype.trigger = function(){

    this.gaffa.model.remove(this.target.binding, this, this.cleans.value ? false : null);
};
Remove.prototype.target = new Gaffa.Property();
Remove.prototype.cleans = new Gaffa.Property();



module.exports = Remove;
},{"gaffa":56}],40:[function(require,module,exports){
var Gaffa = require('gaffa');

function Set(){}
Set = Gaffa.createSpec(Set, Gaffa.Action);
Set.prototype._type = 'set';
Set.prototype.trigger = function(){

    var fromObj = this.source.value;
    if(this.clone.value){
        fromObj = this.gaffa.clone(fromObj);
    }
    this.target.set(fromObj, !this.cleans.value);
};
Set.prototype.target = new Gaffa.Property();
Set.prototype.source = new Gaffa.Property();
Set.prototype.clone = new Gaffa.Property({
    value: false
});
Set.prototype.cleans = new Gaffa.Property({
    value: false
});

module.exports = Set;
},{"gaffa":56}],41:[function(require,module,exports){
var Gaffa = require('gaffa');

function Switch(){}
Switch = Gaffa.createSpec(Switch, Gaffa.Action);
Switch.prototype._type = 'switch';
Switch.prototype['switch'] = new Gaffa.Property();

Switch.prototype.trigger = function(parent, scope, event) {

    var switchValue = this['switch'].value;

    if(this.actions[switchValue]){
        this.triggerActions(switchValue, scope, event);
    }else if(this.actions['default']){
        this.triggerActions('default', scope, event);
    }
};

module.exports = Switch;
},{"gaffa":56}],42:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel'),
    viewType = "text";

function Text(){}
Text = Gaffa.createSpec(Text, Gaffa.View);
Text.prototype.type = viewType;

Text.prototype.render = function(){
    this.renderedElement = document.createTextNode('');

};

Text.prototype.text = new Gaffa.Property(function(viewModel, value){
    viewModel.renderedElement.data = value || '';
});

Text.prototype.visible = new Gaffa.Property(function(viewModel, value){
    viewModel.renderedElement.data = (value === false ? '' : viewModel.text.value || '');
});

Text.prototype.title = undefined;
Text.prototype.enabled = undefined;
Text.prototype.classes = undefined;

module.exports = Text;
},{"crel":11,"gaffa":56}],43:[function(require,module,exports){
var Gaffa = require('gaffa'),
    crel = require('crel'),
    doc = require('doc-js');

function FormElement(){}
FormElement = Gaffa.createSpec(FormElement, Gaffa.View);
FormElement.prototype._type = 'formElement';

FormElement.prototype.render = function(){
    var view = this,
        renderedElement = this.renderedElement = this.renderedElement || crel('input'),
        formElement = this.formElement = this.formElement || renderedElement,
        updateEventNames = (this.updateEventName || "change").split(' ');

    doc.on(this.updateEventName || "change", formElement, function(){
        view.value.set(formElement.value);
        view.valid.set(formElement.validity.valid);
    });
};

FormElement.prototype.value = new Gaffa.Property(function(view, value){
    value = value || '';

    var element = view.formElement,
        caretPosition = 0,
        hasCaret = element === document.activeElement; //this is only necissary because IE10 is a pile of crap (i know what a surprise)

    // Skip if the text hasnt changed
    if(value === element.value){
        return;
    }

    // Inspiration taken from http://stackoverflow.com/questions/2897155/get-caret-position-within-an-text-input-field
    // but WOW is that some horrendous code!
    if(hasCaret){
        if (window.document.selection) {
            var selection = window.document.selection.createRange();
            selection.moveStart('character', -element.value.length);
            caretPosition = selection.text.length;
        }
        else if (element.selectionStart || element.selectionStart == '0'){
            caretPosition = element.selectionStart;
        }
    }

    element.value = value;

    if(hasCaret){
        if(element.createTextRange) {
            var range = element.createTextRange();

            range.move('character', caretPosition);

            range.select();
        }
        if(element.selectionStart) {
            element.setSelectionRange(caretPosition, caretPosition);
        }
    }

    view.valid.set(element.validity.valid);
});

FormElement.prototype.type = new Gaffa.Property(function(view, value){
    view.formElement.setAttribute('type', value != null ? value : "");
});

FormElement.prototype.placeholder = new Gaffa.Property(function(view, value){
    view.formElement.setAttribute('placeholder', value != null ? value : "");
});

FormElement.prototype.required = new Gaffa.Property(function(view, value){
    if (value){
        view.formElement.setAttribute('required', 'required');
    }else{
        view.formElement.removeAttribute('required');
    }
});

FormElement.prototype.valid = new Gaffa.Property();
FormElement.prototype.validity = new Gaffa.Property(function(view, value){
    value = value || '';

    view.formElement.setCustomValidity(value);
});
FormElement.prototype.enabled = new Gaffa.Property({
    update: function(view, value){
        view.formElement[value ? 'removeAttribute' : 'setAttribute']('disabled','disabled');
    },
    value: true
});

module.exports = FormElement;
},{"crel":11,"doc-js":45,"gaffa":56}],44:[function(require,module,exports){
module.exports=require(12)
},{"./getTarget":46,"./getTargets":47,"./isList":48}],45:[function(require,module,exports){
module.exports=require(13)
},{"./doc":44,"./getTargets":47,"./isList":48}],46:[function(require,module,exports){
module.exports=require(14)
},{}],47:[function(require,module,exports){
module.exports=require(15)
},{}],48:[function(require,module,exports){
module.exports=require(16)
},{}],49:[function(require,module,exports){
var Gaffa = require('gaffa'),
    FormElement = require('gaffa-formelement');

function Textbox(){}
Textbox = Gaffa.createSpec(Textbox, FormElement);
Textbox.prototype._type = 'textbox';

Textbox.prototype.render = function(){
    FormElement.prototype.render.call(this);
};

Textbox.prototype.maxLength = new Gaffa.Property(function(view, value){
    if(value != null){
        view.formElement.setAttribute('maxlength', value);
    }else{
        view.formElement.removeAttribute('maxlength');
    }
});

module.exports = Textbox;
},{"gaffa":56,"gaffa-formelement":43}],50:[function(require,module,exports){
var Gaffa = require('gaffa'),
    actionType = "toggle";

function Toggle(){}
Toggle = Gaffa.createSpec(Toggle, Gaffa.Action);
Toggle.prototype.type = actionType;
Toggle.prototype.trigger = function(){

    this.target.set(!this.target.value, this);
};
Toggle.prototype.target = new Gaffa.Property();

module.exports = Toggle;
},{"gaffa":56}],51:[function(require,module,exports){
var createSpec = require('spec-js'),
    Property = require('./property'),
    ViewItem = require('./viewItem');

function Action(actionDescription){
}
Action = createSpec(Action, ViewItem);
Action.prototype.trigger = function(){
    throw 'Nothing is implemented for this action (' + this.constructor.name + ')';
};
Action.prototype.condition = new Property({
    value: true
});
Action.prototype.debind = function(){
    // Some actions are asynchronous.
    // They should not debind until they are truely complete,
    // or they are destroyed.
    if(!this._async || this._destroyed){
        this.complete();
    }
};
Action.prototype.complete = function(){
    this.emit('complete');
    ViewItem.prototype.debind.apply(this, arguments);
};

module.exports = Action;
},{"./property":101,"./viewItem":108,"spec-js":90}],52:[function(require,module,exports){
var createSpec = require('spec-js'),
    ViewItem = require('./viewItem');

function Behaviour(behaviourDescription){}
Behaviour = createSpec(Behaviour, ViewItem);
Behaviour.prototype.bind = function(parent){
    ViewItem.prototype.bind.apply(this, arguments);
}

module.exports = Behaviour;
},{"./viewItem":108,"spec-js":90}],53:[function(require,module,exports){
var createSpec = require('spec-js'),
    EventEmitter = require('events').EventEmitter,
    jsonConverter = require('./jsonConverter');

var stack = [];
function eventually(fn){
    stack.push(fn);
    if(stack.length === 1){
        setTimeout(function(){
            while(stack.length){
                stack.pop()();
            }
        },100);
    }
}

function getItemPath(item){
    var gedi = item.gaffa.gedi,
        paths = [],
        referencePath,
        referenceItem = item;

    while(referenceItem){

        // item.path should be a child ref after item.sourcePath
        if(referenceItem.path != null){
            paths.push(referenceItem.path);
        }

        // item.sourcePath is most root level path
        if(referenceItem.sourcePath != null){
            paths.push(gedi.paths.create(referenceItem.sourcePath));
        }

        referenceItem = referenceItem.parent;
    }

    return gedi.paths.resolve.apply(this, paths.reverse());
}

var iuid = 0;
function Bindable(){
    this.setMaxListeners(1000);
    // instance unique ID
    this.__iuid = iuid++;
}
Bindable = createSpec(Bindable, EventEmitter);
Bindable.prototype.getPath = function(){
    return getItemPath(this);
};
Bindable.prototype.getDataAtPath = function(){
    if(!this.gaffa){
        return;
    }
    return this.gaffa.model.get(getItemPath(this));
};
Bindable.prototype.toJSON = function(){
    var tempObject = jsonConverter(this, this.__serialiseExclude__, this.__serialiseInclude__);

    return tempObject;
};
Bindable.prototype.bind = function(parent){
    var bindable = this;

    if(parent && !parent._bound){
        console.warn('Attempted to bind to a parent who was not bound.');
        return;
    }
    if(this._bound){
        this.debind();
        console.warn('Attempted to bind an already bound item.');
    }

    if(parent){
        this.gaffa = parent.gaffa;
        this.parent = parent;
        parent.once('debind', this.debind.bind(this));
        parent.once('destroy', this.destroy.bind(this));
    }

    this.updatePath();

    this._bound = true;
    this.emit('bind');
    this.removeAllListeners('bind');
};
Bindable.prototype.getSourcePath = function(){
    return this.gaffa.gedi.paths.resolve(this.parent && this.parent.getPath(), this.sourcePath);
}
Bindable.prototype.updatePath = function(){
    if(!this.pathBinding){
        return;
    }

    var bindable = this,
        absoluteSourcePath = this.getSourcePath(),
        lastPath = this.path,
        gaffa = this.gaffa;

    function setPath(valueTokens){
        if(valueTokens){
            var valueToken = valueTokens[valueTokens.length - 1];
            bindable.path = valueToken.sourcePathInfo && valueToken.sourcePathInfo.path;
        }

        if(lastPath !== bindable.path && bindable._bound){
            bindable.debind();
            bindable.bind(bindable.parent);
        }
    }

    setPath(gaffa.gedi.get(this.pathBinding, absoluteSourcePath, null, true));

    function handlePathChange(event){
        setPath(event.getValue(null, true));
    }

    gaffa.gedi.bind(this.pathBinding, handlePathChange, absoluteSourcePath);
    this.on('debind', function(){
        gaffa.gedi.debind(bindable.pathBinding, handlePathChange, absoluteSourcePath);
    });
};
Bindable.prototype.debind = function(){
    var bindable = this;

    if(!this._bound){
        // ToDo: This happens with actions, resolve.
        return;
    }
    this._bound = false;

    this.emit('debind');
    this.removeAllListeners('debind');
};
Bindable.prototype.destroy = function(){
    var bindable = this;

    this._destroyed = true;

    if(this._bound){
        this.debind();
    }

    this.emit('destroy');
    this.removeAllListeners('destroy');

    // Let any children bound to 'destroy' do their thing before actually destroying this.
    eventually(function(){
        bindable.gaffa = null;
        bindable.parent = null;
    });
};

module.exports = Bindable;
},{"./jsonConverter":62,"events":4,"spec-js":90}],54:[function(require,module,exports){
/**
    ## ContainerView

    A base constructor for gaffa Views that can hold child views.

    All Views that inherit from ContainerView will have:

        someView.views.content
*/

var createSpec = require('spec-js'),
    View = require('./view'),
    ViewContainer = require('./viewContainer'),
    Property = require('./property');

function ContainerView(viewDescription){
    this.views = this.views || {};
    this.views.content = new ViewContainer(this.views.content);
}
ContainerView = createSpec(ContainerView, View);
ContainerView.prototype.bind = function(parent){
    View.prototype.bind.apply(this, arguments);
    for(var key in this.views){
        var viewContainer = this.views[key];

        if(viewContainer instanceof ViewContainer){
            viewContainer.bind(this);
        }
    }
};
ContainerView.prototype.renderChildren = new Property({
    update: function(view, value){
        for(var key in view.views){
            view.views[key][value ? 'render' : 'derender']();
        }
    },
    value: true
})

module.exports = ContainerView;
},{"./property":101,"./view":106,"./viewContainer":107,"spec-js":90}],55:[function(require,module,exports){
function createModelScope(parent, gediEvent){
    var possibleGroup = parent,
        groupKey,
        scope = {};

    while(possibleGroup && !groupKey){
        groupKey = possibleGroup.group;
        possibleGroup = possibleGroup.parent;
    }

    scope.viewItem = parent;
    scope.groupKey = groupKey;
    scope.modelTarget = gediEvent && gediEvent.target;

    return scope;
}
module.exports = createModelScope;
},{}],56:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn, Matt Ginty & Maurice Butler

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

///[README.md]

"use strict";

var Gedi = require('gedi'),
    doc = require('doc-js'),
    crel = require('crel'),
    createSpec = require('spec-js'),
    EventEmitter = require('events').EventEmitter,
    animationFrame = require('./raf.js'),
    merge = require('merge'),
    statham = require('statham'),
    requestAnimationFrame = animationFrame.requestAnimationFrame,
    cancelAnimationFrame = animationFrame.cancelAnimationFrame,
    resolvePath = require('./resolvePath');

// Storage for applications default styles.
var defaultViewStyles;

var removeViews = require('./removeViews'),
    getClosestItem = require('./getClosestItem'),
    jsonConverter = require('./jsonConverter');

var Property = require('./property'),
    ViewContainer = require('./viewContainer'),
    ViewItem = require('./viewItem'),
    View = require('./view'),
    ContainerView = require('./containerView'),
    Action = require('./action'),
    Behaviour = require('./behaviour');

function parseQueryString(url){
    var urlParts = url.split('?'),
        result = {};

    if(urlParts.length>1){

        var queryStringData = urlParts.pop().split("&");

        for(var i = 0; i < queryStringData.length; i++) {
            var parts = queryStringData[i].split("="),
                key = unescape(parts[0]),
                value = unescape(parts[1]);

            result[key] = value;
        }
    }

    return result;
}

function toQueryString(data){
    var queryString = '';

    for(var key in data){
        if(data.hasOwnProperty(key) && data[key] !== undefined){
            queryString += (queryString.length ? '&' : '?') + key + '=' + data[key];
        }
    }

    return queryString;
}

function clone(value){
    return statham.revive(value);
}

function tryParseJson(data){
    try{
        return JSON.parse(data);
    }catch(error){
        return error;
    }
}

function ajax(settings){
    var queryStringData,
        request = new XMLHttpRequest();
    if(typeof settings !== 'object'){
        settings = {};
    }

    if(settings.cors){
        //http://www.html5rocks.com/en/tutorials/cors/

        if ("withCredentials" in request) {

            // all good.

        } else if (typeof XDomainRequest != "undefined") {

            // Otherwise, check if XDomainRequest.
            // XDomainRequest only exists in IE, and is IE's way of making CORS requests.
            request = new XDomainRequest();
        } else {

            // Otherwise, CORS is not supported by the browser.
            throw "Cors is not supported by this browser";
        }
    }else{
        request = new XMLHttpRequest();
    }

    if(settings.cache === false){
        settings.data = settings.data || {};
        settings.data['_'] = new Date().getTime();
    }

    if(settings.type.toLowerCase() === 'get' && typeof settings.data === 'object'){
        queryStringData = parseQueryString(settings.url);
        for(var key in settings.data){
            if(settings.data.hasOwnProperty(key)){
                queryStringData[key] = settings.data[key];
            }
        }

        settings.url  = settings.url.split('?').shift() + toQueryString(queryStringData);
        settings.data = null;
    }

    request.addEventListener("progress", settings.progress, false);
    request.addEventListener("load", function(event){
        var data = event.target.responseText;

        if(settings.dataType === 'json'){
            if(data === ''){
                data = undefined;
            }else{
                data = tryParseJson(data);
            }
        }

        if(event.target.status >= 400){
            settings.error && settings.error(event, data instanceof Error ? undefined : data);
        }else{
            if(data instanceof Error){
                settings.error && settings.error(event, data);
            }else{
                settings.success && settings.success(data, event);
            }
        }
        settings.complete.apply(this, arguments);
    }, false);
    request.addEventListener("error", settings.error, false);
    request.addEventListener("abort", settings.abort, false);

    request.open(settings.type || "get", settings.url, true);

    // Set default headers
    if(settings.contentType !== false){
        request.setRequestHeader('Content-Type', settings.contentType || 'application/json; charset=utf-8');
    }
    request.setRequestHeader('X-Requested-With', settings.requestedWith || 'XMLHttpRequest');
    if(settings.auth){
        request.setRequestHeader('Authorization', settings.auth);
    }

    // Set custom headers
    for(var key in settings.headers){
        request.setRequestHeader(key, settings.headers[key]);
    }

    if(settings.processData !== false && settings.dataType === 'json'){
        settings.data = JSON.stringify(settings.data);
    }

    request.send(settings.data && settings.data);

    return request;
}

function triggerAction(action, parent, scope, event) {
    // clone
    action = parent.gaffa.initialiseAction(statham.revive(JSON.parse(statham.stringify(action))));

    action.bind(parent, scope);

    scope || (scope = {});

    if(action.condition.value){
        action.trigger(parent, scope, event);
    }

    action.debind();
}

function triggerActions(actions, parent, scope, event) {
    if(Array.isArray(actions)){
        for(var i = 0; i < actions.length; i++) {
            triggerAction(actions[i], parent, scope, event);
        }
    }
}

var initialiseViewItem = require('./initialiseViewItem');
var initialiseView = require('./initialiseView');
var initialiseAction = require('./initialiseAction');
var initialiseBehaviour = require('./initialiseBehaviour');

function Gaffa(){
    var gedi,
        gaffa = Object.create(EventEmitter.prototype);

    // internal varaibles

        // Storage for the applications model.
    var internalModel = {},

        // Storage for the applications view.
        internalViewItems = [],

        // Storage for application actions.
        internalActions = {},

        // Storage for application behaviours.
        internalBehaviours = [],

        // Storage for interval based behaviours.
        internalIntervals = [];


    // Gedi initialisation
    gedi = new Gedi(internalModel);

    // Add gedi instance to gaffa.
    gaffa.gedi = gedi;

    function addBehaviour(behaviour) {
        //if the views isnt an array, make it one.
        if (Array.isArray(behaviour)) {
            for(var i = 0; i < behaviour.length; i++) {
                addBehaviour(behaviour[i]);
            }
            return;
        }

        behaviour.gaffa = gaffa;
        behaviour.parentContainer = internalBehaviours;

        Behaviour.prototype.bind.call(behaviour);
        behaviour.bind();

        internalBehaviours.push(behaviour);
    }


    function load(app, target){

        app = statham.revive(app);

        while(internalIntervals.length){
            clearInterval(internalIntervals.pop());
        }

        //clear state first
        if (app.views) {
            targetView.empty();
        }

        //set up state
        if (app.model) {
            gedi.set({});
            gaffa.model.set(app.model, null, null, false);
        }
        if (app.views) {
            for(var i = 0; i < app.views.length; i++) {
                app.views[i] = initialiseView(app.views[i], gaffa);
            }
            targetView.add(app.views);
        }
        if (app.behaviours) {
            for(var i = 0; i < app.behaviours.length; i++) {
                app.behaviours[i] = initialiseBehaviour(app.behaviours[i], gaffa);
            }
            gaffa.behaviours.add(app.behaviours);
        }

        gaffa.emit("load");
    }

    function addDefaultsToScope(scope){
        scope.windowLocation = location.toString();
    }

    function modelGet(path, viewItem, scope, asTokens) {
        if(!(viewItem instanceof ViewItem || viewItem instanceof Property)){
            scope = viewItem;
            viewItem = undefined;
        }

        scope = scope || {};

        addDefaultsToScope(scope);
        var parentPath = resolvePath(viewItem);

        return gedi.get(path, parentPath, scope, asTokens);
    }

    function modelSet(expression, value, viewItem, dirty, scope){
        if(expression == null){
            return;
        }

        var parentPath = resolvePath(viewItem);

        if(typeof expression === 'object'){
            value = expression;
            expression = '[]';
        }

        gedi.set(expression, value, parentPath, dirty, scope);
    }

    function modelRemove(expression, viewItem, dirty, scope) {
        var parentPath;

        if(expression == null){
            return;
        }

        var parentPath = resolvePath(viewItem);

        gedi.remove(expression, parentPath, dirty, scope);
    }

    function modelIsDirty(path, viewItem) {
        if(path == null){
            return;
        }

        var parentPath = resolvePath(viewItem);

        return gedi.isDirty(path, parentPath);
    }

    function modelSetDirtyState(expression, value, viewItem, scope) {
        if(expression == null){
            return;
        }

        var parentPath = resolvePath(viewItem);

        gedi.setDirtyState(expression, value, parentPath, scope);
    }


/**
    ## The gaffa instance

    Instance of Gaffa

        var gaffa = new Gaffa();
*/

    var gaffaPublicObject = {

        /**
            ### .createSpec

                function myConstructor(){}
                myConstructor = gaffa.createSpec(myConstructor, inheritedConstructor);

            npm module: [spec-js](https://npmjs.org/package/spec-js)
        */
        createSpec: createSpec,

        /**
            ### .jsonConverter

            default jsonification for ViewItems
        */
        jsonConverter: jsonConverter,

        /**
            ### .initialiseViewItem

            takes the plain old object representation of a viewItem and returns an instance of ViewItem with all the settings applied.

            Also recurses through the ViewItem's tree and inflates children.
        */
        initialiseViewItem: function(viewItem, specCollection, references){
            return initialiseViewItem(viewItem, this, specCollection, references);
        },

        initialiseView: function(view, references){
            return initialiseView(view, this, references);
        },

        initialiseAction: function(action, references){
            return initialiseAction(action, this, references);
        },

        initialiseBehaviour: function(behaviour, references){
            return initialiseBehaviour(behaviour, this, references);
        },

        /**
            ### .initialiseViewItem

            takes the plain old object representation of a viewItem and returns an instance of ViewItem with all the settings applied.

            Also recurses through the ViewItem's tree and inflates children.
        */
        registerConstructor: function(constructor){
            if(Array.isArray(constructor)){
                for(var i = 0; i < constructor.length; i++){
                    gaffa.registerConstructor(constructor[i]);
                }
            }

            var constructorType = constructor.prototype instanceof View && 'views' ||
                constructor.prototype instanceof Action && 'actions' ||
                constructor.prototype instanceof Behaviour && 'behaviours';

            if(constructorType){
                // ToDo: Deprecate .type
                gaffa[constructorType]._constructors[constructor.prototype._type || constructor.prototype.type] = constructor;
            }else{
                throw "The provided constructor was not an instance of a View, Action, or Behaviour" +
                    "\n This is likely due to having two version of Gaffa installed" +
                    "\n Run 'npm ls gaffa' to check, and 'npm dedupe to fix'";
            }
        },

        /**
            ### .events

            used throughout gaffa for binding DOM events.
        */
        events:{

            /**
                ### .on

                usage:

                    gaffa.events.on('eventname', target, callback);
            */
            on: function(eventName, target, callback){
                if('on' + eventName.toLowerCase() in target){
                    return doc.on(eventName, target, callback);
                }
            }
        },

        /**
            ## .model

            access to the applications model
        */
        model: {

            /**
                ### .get(path, viewItem, scope, asTokens)

                used to get data from the model.
                path is relative to the viewItems path.

                    gaffa.model.get('[someProp]', parentViewItem);
            */
            get: modelGet,

            /**
                ### .set(path, value, viewItem, dirty)

                used to set data into the model.
                path is relative to the viewItems path.

                    gaffa.model.set('[someProp]', 'hello', parentViewItem);
            */
            set: modelSet,

            /**
                ### .remove(path, viewItem, dirty)

                used to remove data from the model.
                path is relative to the viewItems path.

                    gaffa.model.remove('[someProp]', parentViewItem);
            */
            remove: modelRemove,

            /**
                ### .isDirty(path, viewItem)

                check if a part of the model is dirty.
                path is relative to the viewItems path.

                    gaffa.model.isDirty('[someProp]', viewItem); // true/false?
            */
            isDirty: modelIsDirty,

            /**
                ### .setDirtyState(path, value, viewItem)

                set a part of the model to be dirty or not.
                path is relative to the viewItems path.

                    gaffa.model.setDirtyState('[someProp]', true, viewItem);
            */
            setDirtyState: modelSetDirtyState
        },

        /**
            ## .views

                gaffa.views //Object.

            contains functions and properties for manipulating the application's views.
        */
        views: {

            /**
                ### .renderTarget

                Overrideable DOM selector that top level view items will be inserted into.

                    gaffa.views.renderTarget = 'body';
            */
            renderTarget: 'body',

            /**
                ### .add(View/viewModel, insertIndex)

                Add a view or views to the root list of viewModels.
                When a view is added, it will be rendered _bound, and inserted into the DOM.

                    gaffa.views.add(myView);

                Or:

                    gaffa.views.add([
                        myView1,
                        myView1,
                        myView1
                    ]);
            */
            add: function(view, insertIndex){
                if(Array.isArray(view)){
                    for(var i = 0; i < view.length; i++) {
                        gaffa.views.add(view[i]);
                    }
                    return;
                }

                view.gaffa = gaffa;
                view.parentContainer = internalViewItems;
                view.render();
                view.renderedElement.viewModel = view;
                view.bind();
                view.insert(internalViewItems, insertIndex);
            },

            /**
                ### .remove(view/views)

                Remove a view or views from anywhere in the application.

                    gaffa.views.remove(myView);
            */
            remove: removeViews,

            /**
                ### .empty()

                empty the application of all views.

                    gaffa.views.empty();
            */
            empty: function(){
                removeViews(internalViewItems);
            },

            _constructors: {}
        },

        /**
            ## .actions

                gaffa.actions //Object.

            contains functions and properties for manipulating the application's actions.
        */
        actions: {

            /**
                ### .trigger(actions, parent, scope, event)

                trigger a gaffa action where:

                 - actions is an array of actions to trigger.
                 - parent is an instance of ViewItem that the action is on.
                 - scope is an arbitrary object to be passed in as scope to all expressions in the action
                 - event is an arbitrary event object that may have triggered the action, such as a DOM event.
            */
            trigger: triggerActions,

            _constructors: {}
        },

        /**
            ## .behaviours

                gaffa.behaviours //Object.

            contains functions and properties for manipulating the application's behaviours.
        */
        behaviours: {

            /**
                ### .add(behaviour)

                add a behaviour to the root of the appliaction

                    gaffa.behaviours.add(someBehaviour);
            */
            add: addBehaviour,

            _constructors: {}
        },

        utils: {
            // Get a deep property on an object without doing if(obj && obj.prop && obj.prop.prop) etc...
            getProp: function (object, propertiesString) {
                var properties = propertiesString.split(Gaffa.pathSeparator).reverse();
                while (properties.length) {
                    var nextProp = properties.pop();
                    if (object[nextProp] !== undefined && object[nextProp] !== null) {
                        object = object[nextProp];
                    } else {
                        return;
                    }
                }
                return object;
            },
            // See if a property exists on an object without doing if(obj && obj.prop && obj.prop.prop) etc...
            propExists: function (object, propertiesString) {
                var properties = propertiesString.split(".").reverse();
                while (properties.length) {
                    var nextProp = properties.pop();
                    if (object[nextProp] !== undefined && object[nextProp] !== null) {
                        object = object[nextProp];
                    } else {
                        return false;
                    }
                }
                return true;
            }
        },

        load: load,
        extend: merge, // DEPRICATED
        merge: merge,
        clone: clone,
        ajax: ajax,
        crel: crel,
        doc: doc,
        getClosestItem: getClosestItem,
        browser: require('bowser')
    };

    merge(gaffa, gaffaPublicObject);

    return gaffa;
}


// "constants"
Gaffa.pathSeparator = "/";

Gaffa.Property = Property;
Gaffa.ViewContainer = ViewContainer;
Gaffa.ViewItem = ViewItem;
Gaffa.View = View;
Gaffa.ContainerView = ContainerView;
Gaffa.Action = Action;
Gaffa.createSpec = createSpec;
Gaffa.Behaviour = Behaviour;

module.exports = Gaffa;

///[license.md]

},{"./action":51,"./behaviour":52,"./containerView":54,"./getClosestItem":57,"./initialiseAction":58,"./initialiseBehaviour":59,"./initialiseView":60,"./initialiseViewItem":61,"./jsonConverter":62,"./property":101,"./raf.js":102,"./removeViews":103,"./resolvePath":104,"./view":106,"./viewContainer":107,"./viewItem":108,"bowser":63,"crel":65,"doc-js":68,"events":4,"gedi":73,"merge":89,"spec-js":90,"statham":94}],57:[function(require,module,exports){
function getClosestItem(target){
    var viewModel = target.viewModel;

    while(!viewModel && target){
        target = target.parentNode;

        if(target){
            viewModel = target.viewModel;
        }
    }

    return viewModel;
}

module.exports = getClosestItem;
},{}],58:[function(require,module,exports){
var initialiseViewItem = require('./initialiseViewItem');

function initialiseAction(viewItem, gaffa, references) {
    return initialiseViewItem(viewItem, gaffa, gaffa.actions._constructors, references);
}

module.exports = initialiseAction;
},{"./initialiseViewItem":61}],59:[function(require,module,exports){
var initialiseViewItem = require('./initialiseViewItem');

function initialiseBehaviour(viewItem, gaffa, references) {
    return initialiseViewItem(viewItem, gaffa, gaffa.behaviours._constructors, references);
}

module.exports = initialiseBehaviour;
},{"./initialiseViewItem":61}],60:[function(require,module,exports){
var initialiseViewItem = require('./initialiseViewItem');

function initialiseView(viewItem, gaffa, references) {
    return initialiseViewItem(viewItem, gaffa, gaffa.views._constructors, references);
}

module.exports = initialiseView;
},{"./initialiseViewItem":61}],61:[function(require,module,exports){
function initialiseViewItem(viewItem, gaffa, specCollection, references) {
    var ViewItem = require('./viewItem'),
        ViewContainer = require('./viewContainer'),
        initialiseView = require('./initialiseView'),
        initialiseAction = require('./initialiseAction'),
        initialiseBehaviour = require('./initialiseBehaviour');

    references = references || {
        objects: [],
        viewItems: []
    };

    // ToDo: Deprecate .type
    var viewItemType = viewItem._type || viewItem.type;

    if(!(viewItem instanceof ViewItem)){
        if (!specCollection[viewItemType]) {
            throw "No constructor is loaded to handle view of type " + viewItemType;
        }

        var referenceIndex = references.objects.indexOf(viewItem);
        if(referenceIndex >= 0){
            return references.viewItems[referenceIndex];
        }

        references.objects.push(viewItem);
        viewItem = new specCollection[viewItemType](viewItem);
        references.viewItems.push(viewItem);
    }

    for(var key in viewItem.views){
        if(!(viewItem.views[key] instanceof ViewContainer)){
            viewItem.views[key] = new ViewContainer(viewItem.views[key]);
        }
        var views = viewItem.views[key];
        for (var viewIndex = 0; viewIndex < views.length; viewIndex++) {
            var view = initialiseView(views[viewIndex], gaffa, references);
            views[viewIndex] = view;
            view.parentContainer = views;
        }
    }

    for(var key in viewItem.actions){
        var actions = viewItem.actions[key];
        for (var actionIndex = 0; actionIndex < actions.length; actionIndex++) {
            var action = initialiseAction(actions[actionIndex], gaffa, references);
            actions[actionIndex] = action;
            action.parentContainer = actions;
        }
    }

    if(viewItem.behaviours){
        for (var behaviourIndex = 0; behaviourIndex < viewItem.behaviours.length; behaviourIndex++) {
            var behaviour = initialiseBehaviour(viewItem.behaviours[behaviourIndex], gaffa, references);
            viewItem.behaviours[behaviourIndex] = behaviour;
            behaviour.parentContainer = viewItem.behaviours;
        }
    }

    return viewItem;
}

module.exports = initialiseViewItem;
},{"./initialiseAction":58,"./initialiseBehaviour":59,"./initialiseView":60,"./viewContainer":107,"./viewItem":108}],62:[function(require,module,exports){
var deepEqual = require('deep-equal');

function jsonConverter(object, exclude, include){
    var plainInstance = new object.constructor(),
        tempObject = (Array.isArray(object) || object instanceof Array) ? [] : {},
        excludeProps = ["_trackedListeners", "__iuid", "gaffa", "parent", "parentContainer", "renderedElement", "_removeHandlers", "gediCallbacks", "__super__", "_events", "consuela"],
        includeProps = ["type", "_type"];

    //console.log(object.constructor.name);

    if(exclude){
        excludeProps = excludeProps.concat(exclude);
    }

    if(include){
        includeProps = includeProps.concat(include);
    }

    for(var key in object){
        if(typeof object[key] === 'function'){
            continue;
        }
        if(
            includeProps.indexOf(key)>=0 ||
            object.hasOwnProperty(key) &&
            excludeProps.indexOf(key)<0 &&
            !deepEqual(plainInstance[key], object[key])
        ){
            tempObject[key] = object[key];
        }
    }

    if(!Object.keys(tempObject).length){
        return;
    }

    return tempObject;
}

module.exports = jsonConverter;
},{"deep-equal":66}],63:[function(require,module,exports){
/*!
  * Bowser - a browser detector
  * https://github.com/ded/bowser
  * MIT License | (c) Dustin Diaz 2014
  */

!function (name, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports['browser'] = definition()
  else if (typeof define == 'function') define(definition)
  else this[name] = definition()
}('bowser', function () {
  /**
    * See useragents.js for examples of navigator.userAgent
    */

  var t = true

  function detect(ua) {

    function getFirstMatch(regex) {
      var match = ua.match(regex);
      return (match && match.length > 1 && match[1]) || '';
    }

    var iosdevice = getFirstMatch(/(ipod|iphone|ipad)/i).toLowerCase()
      , likeAndroid = /like android/i.test(ua)
      , android = !likeAndroid && /android/i.test(ua)
      , versionIdentifier = getFirstMatch(/version\/(\d+(\.\d+)?)/i)
      , tablet = /tablet/i.test(ua)
      , mobile = !tablet && /[^-]mobi/i.test(ua)
      , result

    if (/opera|opr/i.test(ua)) {
      result = {
        name: 'Opera'
      , opera: t
      , version: versionIdentifier || getFirstMatch(/(?:opera|opr)[\s\/](\d+(\.\d+)?)/i)
      }
    }
    else if (/windows phone/i.test(ua)) {
      result = {
        name: 'Windows Phone'
      , windowsphone: t
      , msie: t
      , version: getFirstMatch(/iemobile\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/msie|trident/i.test(ua)) {
      result = {
        name: 'Internet Explorer'
      , msie: t
      , version: getFirstMatch(/(?:msie |rv:)(\d+(\.\d+)?)/i)
      }
    }
    else if (/chrome|crios|crmo/i.test(ua)) {
      result = {
        name: 'Chrome'
      , chrome: t
      , version: getFirstMatch(/(?:chrome|crios|crmo)\/(\d+(\.\d+)?)/i)
      }
    }
    else if (iosdevice) {
      result = {
        name : iosdevice == 'iphone' ? 'iPhone' : iosdevice == 'ipad' ? 'iPad' : 'iPod'
      }
      // WTF: version is not part of user agent in web apps
      if (versionIdentifier) {
        result.version = versionIdentifier
      }
    }
    else if (/sailfish/i.test(ua)) {
      result = {
        name: 'Sailfish'
      , sailfish: t
      , version: getFirstMatch(/sailfish\s?browser\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/seamonkey\//i.test(ua)) {
      result = {
        name: 'SeaMonkey'
      , seamonkey: t
      , version: getFirstMatch(/seamonkey\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/firefox|iceweasel/i.test(ua)) {
      result = {
        name: 'Firefox'
      , firefox: t
      , version: getFirstMatch(/(?:firefox|iceweasel)[ \/](\d+(\.\d+)?)/i)
      }
      if (/\((mobile|tablet);[^\)]*rv:[\d\.]+\)/i.test(ua)) {
        result.firefoxos = t
      }
    }
    else if (/silk/i.test(ua)) {
      result =  {
        name: 'Amazon Silk'
      , silk: t
      , version : getFirstMatch(/silk\/(\d+(\.\d+)?)/i)
      }
    }
    else if (android) {
      result = {
        name: 'Android'
      , version: versionIdentifier
      }
    }
    else if (/phantom/i.test(ua)) {
      result = {
        name: 'PhantomJS'
      , phantom: t
      , version: getFirstMatch(/phantomjs\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/blackberry|\bbb\d+/i.test(ua) || /rim\stablet/i.test(ua)) {
      result = {
        name: 'BlackBerry'
      , blackberry: t
      , version: versionIdentifier || getFirstMatch(/blackberry[\d]+\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/(web|hpw)os/i.test(ua)) {
      result = {
        name: 'WebOS'
      , webos: t
      , version: versionIdentifier || getFirstMatch(/w(?:eb)?osbrowser\/(\d+(\.\d+)?)/i)
      };
      /touchpad\//i.test(ua) && (result.touchpad = t)
    }
    else if (/bada/i.test(ua)) {
      result = {
        name: 'Bada'
      , bada: t
      , version: getFirstMatch(/dolfin\/(\d+(\.\d+)?)/i)
      };
    }
    else if (/tizen/i.test(ua)) {
      result = {
        name: 'Tizen'
      , tizen: t
      , version: getFirstMatch(/(?:tizen\s?)?browser\/(\d+(\.\d+)?)/i) || versionIdentifier
      };
    }
    else if (/safari/i.test(ua)) {
      result = {
        name: 'Safari'
      , safari: t
      , version: versionIdentifier
      }
    }
    else result = {}

    // set webkit or gecko flag for browsers based on these engines
    if (/(apple)?webkit/i.test(ua)) {
      result.name = result.name || "Webkit"
      result.webkit = t
      if (!result.version && versionIdentifier) {
        result.version = versionIdentifier
      }
    } else if (!result.opera && /gecko\//i.test(ua)) {
      result.name = result.name || "Gecko"
      result.gecko = t
      result.version = result.version || getFirstMatch(/gecko\/(\d+(\.\d+)?)/i)
    }

    // set OS flags for platforms that have multiple browsers
    if (android || result.silk) {
      result.android = t
    } else if (iosdevice) {
      result[iosdevice] = t
      result.ios = t
    }

    // OS version extraction
    var osVersion = '';
    if (iosdevice) {
      osVersion = getFirstMatch(/os (\d+([_\s]\d+)*) like mac os x/i);
      osVersion = osVersion.replace(/[_\s]/g, '.');
    } else if (android) {
      osVersion = getFirstMatch(/android[ \/-](\d+(\.\d+)*)/i);
    } else if (result.windowsphone) {
      osVersion = getFirstMatch(/windows phone (?:os)?\s?(\d+(\.\d+)*)/i);
    } else if (result.webos) {
      osVersion = getFirstMatch(/(?:web|hpw)os\/(\d+(\.\d+)*)/i);
    } else if (result.blackberry) {
      osVersion = getFirstMatch(/rim\stablet\sos\s(\d+(\.\d+)*)/i);
    } else if (result.bada) {
      osVersion = getFirstMatch(/bada\/(\d+(\.\d+)*)/i);
    } else if (result.tizen) {
      osVersion = getFirstMatch(/tizen[\/\s](\d+(\.\d+)*)/i);
    }
    if (osVersion) {
      result.osversion = osVersion;
    }

    // device type extraction
    var osMajorVersion = osVersion.split('.')[0];
    if (tablet || iosdevice == 'ipad' || (android && (osMajorVersion == 3 || (osMajorVersion == 4 && !mobile))) || result.silk) {
      result.tablet = t
    } else if (mobile || iosdevice == 'iphone' || iosdevice == 'ipod' || android || result.blackberry || result.webos || result.bada) {
      result.mobile = t
    }

    // Graded Browser Support
    // http://developer.yahoo.com/yui/articles/gbs
    if ((result.msie && result.version >= 10) ||
        (result.chrome && result.version >= 20) ||
        (result.firefox && result.version >= 20.0) ||
        (result.safari && result.version >= 6) ||
        (result.opera && result.version >= 10.0) ||
        (result.ios && result.osversion && result.osversion.split(".")[0] >= 6)
        ) {
      result.a = t;
    }
    else if ((result.msie && result.version < 10) ||
        (result.chrome && result.version < 20) ||
        (result.firefox && result.version < 20.0) ||
        (result.safari && result.version < 6) ||
        (result.opera && result.version < 10.0) ||
        (result.ios && result.osversion && result.osversion.split(".")[0] < 6)
        ) {
      result.c = t
    } else result.x = t

    return result
  }

  var bowser = detect(typeof navigator !== 'undefined' ? navigator.userAgent : '')


  /*
   * Set our detect method to the main bowser object so we can
   * reuse it to test other user agents.
   * This is needed to implement future tests.
   */
  bowser._detect = detect;

  return bowser
});

},{}],64:[function(require,module,exports){
function getListenerMethod(emitter, methodNames){
    if(typeof methodNames === 'string'){
        methodNames = methodNames.split(' ');
    }
    for(var i = 0; i < methodNames.length; i++){
        if(methodNames[i] in emitter){
            return methodNames[i];
        }
    }
}

function Consuela(){
    this._trackedListeners = [];
}
Consuela.prototype.onNames = 'on addListener addEventListener';
Consuela.prototype.offNames = 'off removeListener removeEventListener';
Consuela.prototype._on = function(emitter, args, offName){
    this._trackedListeners.push({
        emitter: emitter,
        args: Array.prototype.slice.call(args),
        offName: offName
    });
};
function compareArgs(args1, args2){
    if(args1.length !== args2.length){
        return;
    }
    for (var i = 0; i < args1.length; i++) {
        if(args1[i] !== args2[i]){
            return;
        }
    };
    return true;
}
Consuela.prototype._off = function(emitter, args, offName){
    for (var i = 0; i < this._trackedListeners.length; i++) {
        var info = this._trackedListeners[i];

        if(emitter !== info.emitter || !compareArgs(info.args, args)){
            continue;
        }

        this._trackedListeners.splice(i, 1);
        i--;
    };
};
Consuela.prototype.on = function(emitter, args, offName){
    var method = getListenerMethod(emitter, this.onNames),
        oldOn = emitter[method];

    this._on(emitter, args, offName);
    oldOn.apply(emitter, args);
};
Consuela.prototype.cleanup = function(){
    while(this._trackedListeners.length){
        var info = this._trackedListeners.pop(),
            emitter = info.emitter,
            offNames = this.offNames;

        if(info.offName){
            offNames = [info.offName];
        }

        emitter[getListenerMethod(info.emitter, offNames)]
            .apply(emitter, info.args);
    }
};
Consuela.prototype.watch = function(emitter, onName, offName){
    var consuela = this,
        onNames = this.onNames,
        offNames = this.offNames;

    if(onName){
        onNames = [onName];
    }

    var onMethod = getListenerMethod(emitter, onNames),
        oldOn = emitter[onMethod];

    if(emitter[onMethod].__isConsuelaOverride){
        return;
    }

    emitter[onMethod] = function(){
        consuela._on(emitter, arguments, offName);
        oldOn.apply(emitter, arguments);
    };
    emitter[onMethod].__isConsuelaOverride = true;


    if(offName){
        offNames = [offName];
    }

    var offMethod = getListenerMethod(emitter, offNames),
        oldOff = emitter[offMethod];

    if(emitter[offMethod].__isConsuelaOverride){
        return;
    }

    emitter[offMethod] = function(){
        consuela._off(emitter, arguments, offName);
        oldOff.apply(emitter, arguments);
    };
    emitter[offMethod].__isConsuelaOverride = true;
};

module.exports = Consuela;
},{}],65:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/*

    This code is not formatted for readability, but rather run-speed and to assist compilers.

    However, the code's intention should be transparent.

    *** IE SUPPORT ***

    If you require this library to work in IE7, add the following after declaring crel.

    var testDiv = document.createElement('div'),
        testLabel = document.createElement('label');

    testDiv.setAttribute('class', 'a');
    testDiv['className'] !== 'a' ? crel.attrMap['class'] = 'className':undefined;
    testDiv.setAttribute('name','a');
    testDiv['name'] !== 'a' ? crel.attrMap['name'] = function(element, value){
        element.id = value;
    }:undefined;


    testLabel.setAttribute('for', 'a');
    testLabel['htmlFor'] !== 'a' ? crel.attrMap['for'] = 'htmlFor':undefined;



*/

(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.crel = factory();
    }
}(this, function () {
    var fn = 'function',
        isElement = typeof Element === fn ? function (object) {
            return object instanceof Element;
        } :
        // in IE <= 8 Element is an object, obviously..
        function(object){
            return (typeof object==="object") &&
                (object.nodeType===1) &&
                (typeof object.ownerDocument ==="object");
        },
        isArray = function(a){
            return a instanceof Array;
        },
        appendChild = function(element, child) {
          if(!isElement(child)){
              child = document.createTextNode(child);
          }
          element.appendChild(child);
        };


    function crel(){
        var args = arguments, //Note: assigned to a variable to assist compilers. Saves about 40 bytes in closure compiler. Has negligable effect on performance.
            element = args[0],
            child,
            settings = args[1],
            childIndex = 2,
            argumentsLength = args.length,
            attributeMap = crel.attrMap;

        element = crel.isElement(element) ? element : document.createElement(element);
        // shortcut
        if(argumentsLength === 1){
            return element;
        }

        if(typeof settings !== 'object' || crel.isElement(settings) || isArray(settings)) {
            --childIndex;
            settings = null;
        }

        // shortcut if there is only one child that is a string
        if((argumentsLength - childIndex) === 1 && typeof args[childIndex] === 'string' && element.textContent !== undefined){
            element.textContent = args[childIndex];
        }else{
            for(; childIndex < argumentsLength; ++childIndex){
                child = args[childIndex];

                if(child == null){
                    continue;
                }

                if (isArray(child)) {
                  for (var i=0; i < child.length; ++i) {
                    appendChild(element, child[i]);
                  }
                } else {
                  appendChild(element, child);
                }
            }
        }

        for(var key in settings){
            if(!attributeMap[key]){
                element.setAttribute(key, settings[key]);
            }else{
                var attr = crel.attrMap[key];
                if(typeof attr === fn){
                    attr(element, settings[key]);
                }else{
                    element.setAttribute(attr, settings[key]);
                }
            }
        }

        return element;
    }

    // Used for mapping one kind of attribute to the supported version of that in bad browsers.
    // String referenced so that compilers maintain the property name.
    crel['attrMap'] = {};

    // String referenced so that compilers maintain the property name.
    crel["isElement"] = isElement;

    return crel;
}));

},{}],66:[function(require,module,exports){
var pSlice = Array.prototype.slice;
var Object_keys = typeof Object.keys === 'function'
    ? Object.keys
    : function (obj) {
        var keys = [];
        for (var key in obj) keys.push(key);
        return keys;
    }
;

var deepEqual = module.exports = function (actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b);
  }
  try {
    var ka = Object_keys(a),
        kb = Object_keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

},{}],67:[function(require,module,exports){
module.exports=require(12)
},{"./getTarget":69,"./getTargets":70,"./isList":71}],68:[function(require,module,exports){
module.exports=require(13)
},{"./doc":67,"./getTargets":70,"./isList":71}],69:[function(require,module,exports){
module.exports=require(14)
},{}],70:[function(require,module,exports){
module.exports=require(15)
},{}],71:[function(require,module,exports){
module.exports=require(16)
},{}],72:[function(require,module,exports){
var WeakMap = require('./weakmap'),
    paths = require('gedi-paths'),
    pathConstants = paths.constants
    modelOperations = require('./modelOperations'),
    get = modelOperations.get,
    set = modelOperations.set;

var isBrowser = typeof Node != 'undefined';

module.exports = function(modelGet, gel, PathToken){
    var modelBindings,
        modelBindingDetails,
        callbackReferenceDetails,
        modelReferences;

    function resetEvents(){
        modelBindings = {};
        modelBindingDetails = new WeakMap();
        callbackReferenceDetails = new WeakMap();
        modelReferences = new WeakMap();
    }

    resetEvents();

    function createGetValue(expression, parentPath){
        return function(scope, returnAsTokens){
            return modelGet(expression, parentPath, scope, returnAsTokens);
        }
    }

    function ModelEventEmitter(target){
        this.model = modelGet();
        this.events = {};
        this.alreadyEmitted = {};
        this.target = target;
    }
    ModelEventEmitter.prototype.pushPath = function(path, type, skipReferences){
        var currentEvent = this.events[path];

        if(!currentEvent || type === 'target' || type === 'keys'){
            this.events[path] = type;
        }

        if(skipReferences){
            return;
        }

        var modelValue = get(path, this.model),
            references = modelValue && typeof modelValue === 'object' && modelReferences.get(modelValue),
            referencePathParts,
            referenceBubblePath,
            pathParts = paths.toParts(path),
            targetParts = paths.toParts(this.target),
            referenceTarget;

        // If no references, or only in the model once
        // There are no reference events to fire.
        if(!references || Object.keys(references).length === 1){
            return;
        }

        for(var key in references){
            referencePathParts = paths.toParts(key);

            referenceTarget = paths.create(referencePathParts.concat(targetParts.slice(pathParts.length)));

            bubbleTrigger(referenceTarget, this, true);
            this.pushPath(referenceTarget, 'target', true);
            sinkTrigger(referenceTarget, this, true);
        }
    };
    ModelEventEmitter.prototype.emit = function(){
        var emitter = this,
            targetReference,
            referenceDetails;

        for(var path in this.events){
            var type = this.events[path];

            targetReference = get(path, modelBindings);
            referenceDetails = targetReference && modelBindingDetails.get(targetReference);

            if(!referenceDetails){
                continue;
            }

            for(var i = 0; i < referenceDetails.length; i++) {
                var details = referenceDetails[i],
                    binding = details.binding,
                    wildcardPath = matchWildcardPath(binding, emitter.target, details.parentPath);

                // binding had wildcards but
                // did not match the current target
                if(wildcardPath === false){
                    continue;
                }

                details.callback({
                    target: emitter.target,
                    binding: wildcardPath || details.binding,
                    captureType: type,
                    getValue: createGetValue(wildcardPath || details.binding, details.parentPath)
                });
            };
        }
    };

    function sinkTrigger(path, emitter, skipReferences){
        var reference = get(path, modelBindings);

        for(var key in reference){
            var sinkPath = paths.append(path, key);
            emitter.pushPath(sinkPath, 'sink', skipReferences);
            sinkTrigger(sinkPath, emitter, skipReferences);
        }
    }

    function bubbleTrigger(path, emitter, skipReferences){
        var pathParts = paths.toParts(path);

        for(var i = 0; i < pathParts.length - 1; i++){

            emitter.pushPath(
                paths.create(pathParts.slice(0, i+1)),
                'bubble',
                skipReferences
            );
        }
    }

    function trigger(path, keysChange){
        // resolve path to root
        path = paths.resolve(paths.createRoot(), path);

        var emitter = new ModelEventEmitter(path);

        bubbleTrigger(path, emitter);

        if(keysChange){
            emitter.pushPath(paths.resolve(path ,pathConstants.upALevel), 'keys');
        }

        emitter.pushPath(path, 'target');

        sinkTrigger(path, emitter);

        emitter.emit();
    }

    var memoisedExpressionPaths = {};
    function getPathsInExpression(expression) {
        var paths = [];

        if(memoisedExpressionPaths[expression]){
            return memoisedExpressionPaths[expression];
        }

        if (gel) {
            var tokens = gel.tokenise(expression);
            for(var index = 0; index < tokens.length; index++){
            var token = tokens[index];
                if(token.path != null){
                    paths.push(token.path);
                }
            }
        } else {
            return memoisedExpressionPaths[expression] = [paths.create(expression)];
        }
        return memoisedExpressionPaths[expression] = paths;
    }

    function addReferencesForBinding(path){
        var model = modelGet(),
            pathParts = paths.toParts(path),
            itemPath = path,
            item = get(path, model);

        while(typeof item !== 'object' && pathParts.length){
            pathParts.pop();
            itemPath = paths.create(pathParts);
            item = get(itemPath, model);
        }

        addModelReference(itemPath, item);
    }

    function setBinding(path, details){
        // Handle wildcards
        if(path.indexOf(pathConstants.wildcard)>=0){
            var parts = paths.toParts(path);
            path = paths.create(parts.slice(0, parts.indexOf(pathConstants.wildcard)));
        }

        var resolvedPath = paths.resolve(paths.createRoot(), details.parentPath, path),
            reference = get(resolvedPath, modelBindings) || {},
            referenceDetails = modelBindingDetails.get(reference),
            callbackReferences = callbackReferenceDetails.get(details.callback);

        if(!referenceDetails){
            referenceDetails = [];
            modelBindingDetails.set(reference, referenceDetails);
        }

        if(!callbackReferences){
            callbackReferences = [];
            callbackReferenceDetails.set(details.callback, callbackReferences);
        }

        callbackReferences.push(resolvedPath);
        referenceDetails.push(details);

        set(resolvedPath, reference, modelBindings);

        addReferencesForBinding(path);
    }

    function bindExpression(binding, details){
        var expressionPaths = getPathsInExpression(binding),
            boundExpressions = {};

        for(var i = 0; i < expressionPaths.length; i++) {
            var path = expressionPaths[i];
            if(!boundExpressions[path]){
                boundExpressions[path] = true;
                setBinding(path, details);
            }
        }
    }

    function bind(path, callback, parentPath, binding){
        parentPath = parentPath || paths.create();

        var details = {
            binding: binding || path,
            callback: callback,
            parentPath: parentPath
        };

        // If the binding is a simple path, skip the more complex
        // expression path binding.
        if (paths.is(path)) {
            return setBinding(path, details);
        }

        bindExpression(path, details);
    }

    function matchWildcardPath(binding, target, parentPath){
        if(
            binding.indexOf(pathConstants.wildcard) >= 0 &&
            getPathsInExpression(binding)[0] === binding
        ){
            //fully resolve the callback path
            var wildcardParts = paths.toParts(paths.resolve(paths.createRoot(), parentPath, binding)),
                targetParts = paths.toParts(target);

            for(var i = 0; i < wildcardParts.length; i++) {
                var pathPart = wildcardParts[i];
                if(pathPart === pathConstants.wildcard){
                    wildcardParts[i] = targetParts[i];
                }else if (pathPart !== targetParts[i]){
                    return false;
                }
            }

            return paths.create(wildcardParts);
        }
    }

    function debindPath(path, callback){
        var targetReference = get(path, modelBindings),
            referenceDetails = modelBindingDetails.get(targetReference);

        if(referenceDetails){
            for(var i = 0; i < referenceDetails.length; i++) {
                var details = referenceDetails[i];
                if(!callback || callback === details.callback){
                    referenceDetails.splice(i, 1);
                    i--;
                }
            }
        }
    }

    function debindCallbackPaths(path, callback, parentPath){
        if(callback){
            var references = callback && callbackReferenceDetails.get(callback),
                resolvedPath = paths.resolve(paths.createRoot(), parentPath, path);

            if(references){
                for(var i = 0; i < references.length; i++) {
                    if(path != null && references[i] !== resolvedPath){
                        continue;
                    }
                    debindPath(references.splice(i, 1)[0], callback);
                    i--;
                }
            }
            return;
        }
        debindPath(path);
    }

    function debindExpression(binding, callback, parentPath){
        var expressionPaths = getPathsInExpression(binding);

        for(var i = 0; i < expressionPaths.length; i++) {
            var path = expressionPaths[i];
                debindCallbackPaths(path, callback, parentPath);
        }
    }

    function debind(expression, callback, parentPath){

        // If you pass no path and no callback
        // You are trying to debind the entire gedi instance.
        if(!expression && !callback){
            resetEvents();
            return;
        }

        if(typeof expression === 'function'){
            callback = expression;
            expression = null;
        }

        //If the expression is a simple path, skip the expression debind step.
        if (expression == null || paths.is(expression)) {
            return debindCallbackPaths(expression, callback, parentPath);
        }

        debindExpression(expression, callback, parentPath);
    }


    // Add a new object who's references should be tracked.
    function addModelReference(path, object){
        if(!object || typeof object !== 'object'){
            return;
        }

        var path = paths.resolve(paths.createRoot(),path),
            objectReferences = modelReferences.get(object);

        if(!objectReferences){
            objectReferences = {};
            modelReferences.set(object, objectReferences);
        }

        if(!(path in objectReferences)){
            objectReferences[path] = null;
        }

        if(isBrowser && object instanceof Node){
            return;
        }

        for(var key in object){
            var prop = object[key];

            // Faster to check again here than to create pointless paths.
            if(prop && typeof prop === 'object'){
                var refPath = paths.append(path, key);
                if(modelReferences.has(prop)){
                    if(prop !== object){
                        modelReferences.get(prop)[refPath] = null;
                    }
                }else{
                    addModelReference(refPath, prop);
                }
            }
        }
    }

    function removeModelReference(path, object){
        if(!object || typeof object !== 'object'){
            return;
        }

        var path = paths.resolve(paths.createRoot(),path),
            objectReferences = modelReferences.get(object),
            refIndex;

        if(!objectReferences){
            return;
        }

        delete objectReferences[path];

        if(!Object.keys(objectReferences).length){
            modelReferences['delete'](object);
        }

        for(var key in object){
            var prop = object[key];

            // Faster to check again here than to create pointless paths.
            if(prop && typeof prop === 'object' && prop !== object){
                removeModelReference(paths.append(path, paths.create(key)), prop);
            }
        }
    }

    return {
        bind: bind,
        trigger: trigger,
        debind: debind,
        addModelReference: addModelReference,
        removeModelReference: removeModelReference
    };
};
},{"./modelOperations":74,"./weakmap":80,"gedi-paths":76}],73:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var Gel = require('gel-js'),
    createPathToken = require('./pathToken'),
    Token = Gel.Token,
    paths = require('gedi-paths'),
    pathConstants = paths.constants,
    createSpec = require('spec-js'),
    createEvents = require('./events'),
    modelOperations = require('./modelOperations'),
    get = modelOperations.get,
    set = modelOperations.set;

//Create gedi
var gediConstructor = newGedi;

var exceptions = {
    invalidPath: 'Invalid path syntax'
};

var arrayProto = [];


//***********************************************
//
//      Gedi object.
//
//***********************************************

//Creates the public gedi constructor
function newGedi(model) {

    // Storage for the applications model
    model = model || {};


        // gel instance
    var gel = new Gel(),

        // Storage for tracking the dirty state of the model
        dirtyModel = {},

        PathToken = createPathToken(get, model),

        // Storage for model event handles
        events = createEvents(modelGet, gel, PathToken);


    //Initialise model references
    events.addModelReference('[/]', model);

    //internal functions

    //***********************************************
    //
    //      IE indexOf polyfill
    //
    //***********************************************

    //IE Specific idiocy

    Array.prototype.indexOf = Array.prototype.indexOf || function (object) {
        for (var i = 0; i < this.length; i++) {
            if (this === object){
                return i;
            }
        }
    };

    // http://stackoverflow.com/questions/498970/how-do-i-trim-a-string-in-javascript
    String.prototype.trim = String.prototype.trim || function () { return this.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); };

    // http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
    Array.isArray = Array.isArray || function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    };

    //End IE land.

    //***********************************************
    //
    //      Array Fast Each
    //
    //***********************************************

    function each(object, callback) {
        var isArray = Array.isArray(object);
        for (var key in object) {
            if(isArray && isNaN(key)){
                continue;
            }
            if(callback(object[key], key, object)){
                break;
            }
        }
        return object;
    }

    //***********************************************
    //
    //      Gel integration
    //
    //***********************************************

    gel.tokenConverters.push(PathToken);

    gel.scope.isDirty = function(scope, args){
        var token = args.getRaw(0, true);

        if(!token){
            return false;
        }

        var path = (token instanceof PathToken) ? token.original : token.sourcePathInfo && token.sourcePathInfo.path;

        if(!path){
            return false;
        }

        return isDirty(paths.resolve(scope.get('_gmc_'), path));
    };

    gel.scope.getAllDirty = function (scope, args) {
        var token = args.getRaw(0, true),
            source = token && token.result;

        if (source == null) {
            return null;
        }

        var result = source.constructor(),
            path = (token instanceof PathToken) ? token.original : token.sourcePathInfo && token.sourcePathInfo.path;

        if(!path){
            return result;
        }

        var resolvedPath = paths.resolve(scope.get('_gmc_'), path),
            result,
            itemPath;

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                itemPath = paths.resolve(path, paths.create(key));
                if (result instanceof Array) {
                    isDirty(itemPath) && result.push(source[key]);
                } else {
                    isDirty(itemPath) && (result[key] = source[key]);
                }
            }
        }

        return result;
    };

    //***********************************************
    //
    //      Remove
    //
    //***********************************************

    function remove(path, model) {
        var reference = model;

        memoiseCache = {};

        var pathParts = paths.toParts(path),
            index = 0,
            pathLength = pathParts.length;

        if(paths.isRoot(path)){
            overwriteModel({}, model);
            return;
        }

        if(paths.isAbsolute(path)){
            index = 1;
        }

        for(; index < pathLength; index++){
            var key = pathParts[index];
            //if we have hit a non-object and we have more keys after this one
            if (typeof reference[key] !== "object" && index < pathLength - 1) {
                break;
            }
            if (index === pathLength - 1) {
                // if we are at the end of the line, delete the last key

                if (reference instanceof Array) {
                    reference.splice(key, 1);
                } else {
                    delete reference[key];
                }
            } else {
                reference = reference[key];
            }
        }

        return reference;
    }

    //***********************************************
    //
    //      Model Get
    //
    //***********************************************

    function modelGet(binding, parentPath, scope, returnAsTokens) {
        if(parentPath && typeof parentPath !== "string"){
            scope = parentPath;
            parentPath = paths.create();
        }

        if (binding) {
            var gelResult,
                expression = binding;

            scope = scope || {};

            scope['_gmc_'] = parentPath;

            return gel.evaluate(expression, scope, returnAsTokens);
        }

        parentPath = parentPath || paths.create();

        binding = paths.resolve(parentPath, binding);

        return get(binding, model);
    }

    //***********************************************
    //
    //      Model Set
    //
    //***********************************************

    function getSourcePathInfo(expression, parentPath, scope, subPathOpperation){
        var scope = scope || {},
            path;

        scope._gmc_ = parentPath;

        var resultToken = gel.evaluate(expression, scope, true)[0],
            sourcePathInfo = resultToken.sourcePathInfo;

        if(sourcePathInfo){
            if(sourcePathInfo.subPaths){
                each(sourcePathInfo.subPaths, function(item){
                    subPathOpperation(item);
                });
                return;
            }
            path = sourcePathInfo.path;
        }else{
            path = resultToken.path;
        }
        if(path){
            subPathOpperation(path);
        }
    }

    function DeletedItem(){}

    function modelSetPath(path, value, parentPath, dirty, scope){
        parentPath = parentPath || paths.create();
        path = paths.resolve(parentPath, path);

        setDirtyState(path, dirty);

        var previousValue = get(path, model);

        var keysChanged = set(path, value, model);

        if(!(value instanceof DeletedItem)){
            events.addModelReference(path, value);
            events.trigger(path, keysChanged);
        }

        if(!(value && typeof value !== 'object') && previousValue && typeof previousValue === 'object'){
            events.removeModelReference(path, previousValue);
        }
    }

    function modelSet(expression, value, parentPath, dirty, scope) {
        if(typeof expression === 'object' && !paths.create(expression)){
            dirty = value;
            value = expression;
            expression = paths.createRoot();
        }else if(typeof parentPath === 'boolean'){
            dirty = parentPath;
            parentPath = undefined;
        }

        getSourcePathInfo(expression, parentPath, scope, function(subPath){
            modelSetPath(subPath, value, parentPath, dirty, scope);
        });
    }

    //***********************************************
    //
    //      Model Remove
    //
    //***********************************************

    function modelRemove(expression, parentPath, dirty, scope) {
        if(parentPath instanceof Boolean){
            dirty = parentPath;
            parentPath = undefined;
        }

        itemParentPaths = {};
        getSourcePathInfo(expression, parentPath, scope, function(subPath){
            modelSetPath(subPath, new DeletedItem(), parentPath, dirty, scope);
            itemParentPaths[paths.append(subPath, paths.create(pathConstants.upALevel))] = null;
        });

        for(var key in itemParentPaths){
            if(itemParentPaths.hasOwnProperty(key)){
                var itemParentPath = paths.resolve(parentPath || paths.createRoot(), key),
                    parentObject = get(itemParentPath, model),
                    isArray = Array.isArray(parentObject);

                if(isArray){
                    var anyRemoved;
                    for(var i = 0; i < parentObject.length; i++){
                        if(parentObject[i] instanceof DeletedItem){
                            parentObject.splice(i, 1);
                            i--;
                            anyRemoved = true;
                        }
                    }
                    if(anyRemoved){
                        events.trigger(itemParentPath);
                    }
                }
                // Always run keys version, because array's might have non-index keys
                for(var key in parentObject){
                    if(parentObject[key] instanceof DeletedItem){
                        delete parentObject[key];
                        events.trigger(paths.append(itemParentPath, key));
                    }
                }
            }
        }

    }

    //***********************************************
    //
    //      Set Dirty State
    //
    //***********************************************

    function setPathDirtyState(path, dirty, parentPath, scope){
        var reference = dirtyModel;
        if(!paths.create(path)){
            throw exceptions.invalidPath;
        }

        parentPath = parentPath || paths.create();


        dirty = dirty !== false;

        if(paths.isRoot(path)){
            dirtyModel = {
                '_isDirty_': dirty
            };
            return;
        }

        var index = 0;

        if(paths.isAbsolute(path)){
            index = 1;
        }

        var pathParts = paths.toParts(paths.resolve(parentPath, path));

        for(; index < pathParts.length; index++){
            var key = pathParts[index];
            if ((typeof reference[key] !== "object" || reference[key] === null) && index < pathParts.length - 1) {
                reference[key] = {};
            }
            if (index === pathParts.length - 1) {
                reference[key] = {};
                reference[key]['_isDirty_'] = dirty;
            }
            else {
                reference = reference[key];
            }
        }

        if(!pathParts.length){
            dirtyModel['_isDirty_'] = dirty;
        }
    }

    function setDirtyState(expression, dirty, parentPath, scope) {
        getSourcePathInfo(expression, parentPath, scope, function(subPath){
            setPathDirtyState(subPath, dirty, parentPath, scope);
        });
    }

    //***********************************************
    //
    //      Is Dirty
    //
    //***********************************************

    function isDirty(path) {
        var reference,
            hasDirtyChildren = function (ref) {
                if (typeof ref !== 'object') {
                    return false;
                }
                if (ref['_isDirty_']) {
                    return true;
                } else {
                    for (var key in ref) {
                        if (hasDirtyChildren(ref[key])) {
                            return true;
                        }
                    }
                }
            };

        reference = get(path, dirtyModel);

        return !!hasDirtyChildren(reference);
    }

    //Public Objects ******************************************************************************


    function Gedi() {}

    Gedi.prototype = {
        paths: {
            create: paths.create,
            resolve: paths.resolve,
            isRoot: paths.isRoot,
            isAbsolute: paths.isAbsolute,
            append: paths.append,
            toParts: paths.toParts
        },

        /**
            ## .get

            model.get(expression, parentPath, scope, returnAsTokens)

            Get data from the model

                // get model.stuff
                var data = model.get('[stuff]');

            Expressions passed to get will be evaluated by gel:

                // get a list of items that have a truthy .selected property.
                var items = model.get('(filter [items] {item item.selected})');

            You can scope paths in the expression to a parent path:

                // get the last account.
                var items = model.get('(last [])', '[accounts]')'

        */
        get: modelGet,

        /**
            ## .set

            model.set(expression, value, parentPath, dirty)

            Set data into the model

                // set model.stuff to true
                model.set('[stuff]', true);

            Expressions passed to set will be evaluated by gel:

                // find all items that are not selected and set them to be selected
                model.set('(map (filter [items] {item (! item.selected)}) {item item.selected})', true);

            You can scope paths in the expression to a parent path:

                // set the last account to a different account.
                model.set('(last [])', '[accounts]', someAccount);

        */
        set: modelSet,

        /**
            ## .remove

            model.remove(expression, value, parentPath, dirty)

            If the target key is on an object, the key will be deleted.
            If the target key is an index in an array, the item will be spliced out.

            remove data from the model

                // remove model.stuff.
                model.remove('[stuff]');

            Expressions passed to remove will be evaluated by gel:

                // remove all selected items.
                model.remove('(filter [items] {item item.selected})');

            You can scope paths in the expression to a parent path:

                // remove the last account.
                model.remove('(last [])', '[accounts]');

        */
        remove: modelRemove,

        utils: {
            get:get,
            set:set
        },

        init: function (model) {
            this.set(model, false);
        },

        /**
            ## .bind

            model.bind(expression, callback, parentPath)

            bind a callback to change events on the model

        */
        bind: events.bind,

        /**
            ## .debind

            model.debind(expression, callback)

            debind a callback

        */
        debind: events.debind,

        /**
            ## .trigger

            model.trigger(path)

            trigger events for a path

        */
        trigger: events.trigger,

        /**
            ## .isDirty

            model.isDirty(path)

            check if a path in the model has been changed since being marked as clean.

        */
        isDirty: isDirty,

        /**
            ## .setDirtyState

            model.setDirtyState(path, dirty, parentPath)

            explicity mark a path in the model as dirty or clean

        */
        setDirtyState: setDirtyState,

        gel: gel, // expose gel instance for extension

        getNumberOfBindings: function(){
            function getNumCallbacks(reference){
                var length = reference.length;
                for (var key in reference) {
                    if(isNaN(key)){
                        length += getNumCallbacks(reference[key]);
                    }
                }
                return length;
            }

            return getNumCallbacks(internalBindings);
        }
    };

    return new Gedi();
}

module.exports = gediConstructor;
},{"./events":72,"./modelOperations":74,"./pathToken":79,"gedi-paths":76,"gel-js":81,"spec-js":90}],74:[function(require,module,exports){
var paths = require('gedi-paths'),
    memoiseCache = {};

// Lots of similarities between get and set, refactor later to reuse code.
function get(path, model) {
    if (!path) {
        return model;
    }

    var memoiseObject = memoiseCache[path];
    if(memoiseObject && memoiseObject.model === model){
        return memoiseObject.value;
    }

    if(paths.isRoot(path)){
        return model;
    }

    var pathParts = paths.toParts(path),
        reference = model,
        index = 0,
        pathLength = pathParts.length;

    if(paths.isAbsolute(path)){
        index = 1;
    }

    for(; index < pathLength; index++){
        var key = pathParts[index];

        if (reference == null) {
            break;
        } else if (typeof reference[key] === "object") {
            reference = reference[key];
        } else {
            reference = reference[key];

            // If there are still keys in the path that have not been accessed,
            // return undefined.
            if(index < pathLength - 1){
                reference = undefined;
            }
            break;
        }
    }

    memoiseCache[path] = {
        model: model,
        value: reference
    };

    return reference;
}

function overwriteModel(replacement, model){
    if(typeof replacement !== 'object' || replacement === null){
        throw "The model must be an object";
    } 
    if(replacement === model){
        return;
    }
    for (var modelProp in model) {
        delete model[modelProp];
    }
    for (var replacementProp in replacement) {
        model[replacementProp] = replacement[replacementProp];
    }
}

function set(path, value, model) {
    // passed a null or undefined path, do nothing.
    if (!path) {
        return;
    }

    memoiseCache = {};

    // If you just pass in an object, you are overwriting the model.
    if (typeof path === "object") {
        value = path;
        path = paths.createRoot();
    }

    var pathParts = paths.toParts(path),
        index = 0,
        pathLength = pathParts.length;

    if(paths.isRoot(path)){
        overwriteModel(value, model);
        return;
    }

    if(paths.isAbsolute(path)){
        index = 1;
    }

    var reference = model,
        keysChanged,
        previousReference,
        previousKey;

    for(; index < pathLength; index++){
        var key = pathParts[index];

        // if we have hit a non-object property on the reference and we have more keys after this one
        // make an object (or array) here and move on.
        if ((typeof reference !== "object" || reference === null) && index < pathLength) {
            if (!isNaN(key)) {
                reference = previousReference[previousKey] = [];
            }
            else {
                reference = previousReference[previousKey] = {};
            }
        }
        if (index === pathLength - 1) {
            // if we are at the end of the line, set to the model
            if(!(key in reference)){
                keysChanged = true;
            }
            reference[key] = value;
        }
            //otherwise, dig deeper
        else {
            previousReference = reference;
            previousKey = key;
            reference = reference[key];
        }
    }

    return keysChanged;
}

module.exports = {
    get: get,
    set: set
};
},{"gedi-paths":76}],75:[function(require,module,exports){
module.exports = function detectPath(substring){
    if (substring.charAt(0) === '[') {
        var index = 1;

        do {
            if (
                (substring.charAt(index) === '\\' && substring.charAt(index + 1) === '\\') || // escaped escapes
                (substring.charAt(index) === '\\' && (substring.charAt(index + 1) === '[' || substring.charAt(index + 1) === ']')) //escaped braces
            ) {
                index++;
            }
            else if(substring.charAt(index) === ']'){
                return substring.slice(0, index+1);
            }
            index++;
        } while (index < substring.length);
    }
};
},{}],76:[function(require,module,exports){
var detectPath = require('./detectPath');

var pathSeparator = "/",
    upALevel = "..",
    bubbleCapture = "...",
    currentKey = "#",
    rootPath = "",
    pathStart = "[",
    pathEnd = "]",
    pathWildcard = "*";

function pathToRaw(path) {
    return path && path.slice(1, -1);
}

//***********************************************
//
//      Raw To Path
//
//***********************************************

function rawToPath(rawPath) {
    return pathStart + (rawPath == null ? '' : rawPath) + pathEnd;
}

var memoisePathCache = {};
function resolvePath() {
    var memoiseKey,
        pathParts = [];

    for(var argumentIndex = arguments.length; argumentIndex--;){
        var parts = pathToParts(arguments[argumentIndex]);
        if(parts){
            pathParts.unshift.apply(pathParts, parts);
        }
        if(isPathAbsolute(arguments[argumentIndex])){
            break;
        }
    }

    memoiseKey = pathParts.join(',');

    if(memoisePathCache[memoiseKey]){
        return memoisePathCache[memoiseKey];
    }

    var absoluteParts = [],
        lastRemoved,
        pathParts,
        pathPart;

    for(var pathPartIndex = 0; pathPartIndex < pathParts.length; pathPartIndex++){
        pathPart = pathParts[pathPartIndex];

        if (pathPart === currentKey) {
            // Has a last removed? Add it back on.
            if(lastRemoved != null){
                absoluteParts.push(lastRemoved);
                lastRemoved = null;
            }
        } else if (pathPart === rootPath) {
            // Root path? Reset parts to be absolute.
            absoluteParts = [''];

        } else if (pathPart.slice(-bubbleCapture.length) === bubbleCapture) {
            // deep bindings
            if(pathPart !== bubbleCapture){
                absoluteParts.push(pathPart.slice(0, -bubbleCapture.length));
            }
        } else if (pathPart === upALevel) {
            // Up a level? Remove the last item in absoluteParts
            lastRemoved = absoluteParts.pop();
        } else if (pathPart.slice(0,2) === upALevel) {
            var argument = pathPart.slice(2);
            //named
            while(absoluteParts[absoluteParts.length - 1] !== argument){
                if(absoluteParts.length === 0){
                    throw "Named path part was not found: '" + pathPart + "', in path: '" + arguments[argumentIndex] + "'.";
                }
                lastRemoved = absoluteParts.pop();
            }
        } else {
            // any following valid part? Add it to the absoluteParts.
            absoluteParts.push(pathPart);
        }
    }

    // Convert the absoluteParts to a Path and memoise the result.
    return memoisePathCache[memoiseKey] = createPath(absoluteParts);
}

var memoisedPathTokens = {};

function createPath(path){

    if(typeof path === 'number'){
        path = path.toString();
    }

    if(path == null){
        return rawToPath();
    }

    // passed in an Expression or an 'expression formatted' Path (eg: '[bla]')
    if (typeof path === "string"){

        if(memoisedPathTokens[path]){
            return memoisedPathTokens[path];
        }

        if(path.charAt(0) === pathStart) {
            var pathString = path.toString(),
                detectedPath = detectPath(pathString);

            if (detectedPath && detectedPath.length === pathString.length) {
                return memoisedPathTokens[pathString] = detectedPath;
            } else {
                return false;
            }
        }else{
            return createPath(rawToPath(path));
        }
    }

    if(path instanceof Array) {

        var parts = [];
        for (var i = 0; i < path.length; i++) {
            var pathPart = path[i];
            pathPart = pathPart.replace(/([\[|\]|\\|\/])/g, '\\$1');
            parts.push(pathPart);
        }
        if(parts.length === 1 && parts[0] === rootPath){
            return createRootPath();
        }
        return rawToPath(parts.join(pathSeparator));
    }
}

function createRootPath(){
    return createPath([rootPath, rootPath]);
}

function pathToParts(path){
    var pathType = typeof path;

    if(pathType !== 'string' && pathType !== 'number'){
        if(Array.isArray(path)){
            return path;
        }
        return;
    }

    // if we haven't been passed a path, then turn the input into a path
    if (!isPath(path)) {
        path = createPath(path);
        if(path === false){
            return;
        }
    }

    path = path.slice(1,-1);

    if(path === ""){
        return [];
    }

    var lastPartIndex = 0,
        parts,
        nextChar,
        currentChar;

    if(path.indexOf('\\') < 0){
        return path.split(pathSeparator);
    }

    parts = [];

    for(var i = 0; i < path.length; i++){
        currentChar = path.charAt(i);
        if(currentChar === pathSeparator){
            parts.push(path.slice(lastPartIndex,i));
            lastPartIndex = i+1;
        }else if(currentChar === '\\'){
            nextChar = path.charAt(i+1);
            if(nextChar === '\\'){
                path = path.slice(0, i) + path.slice(i + 1);
            }else if(nextChar === ']' || nextChar === '['){
                path = path.slice(0, i) + path.slice(i + 1);
            }else if(nextChar === pathSeparator){
                parts.push(path.slice(lastPartIndex), i);
            }
        }
    }
    parts.push(path.slice(lastPartIndex));

    return parts;
}

function appendPath(){
    var parts = pathToParts(arguments[0]);

    if(!parts){
        return;
    }

    if(isPathRoot(arguments[0])){
        parts.pop();
    }

    for (var argumentIndex = 1; argumentIndex < arguments.length; argumentIndex++) {
        var pathParts = pathToParts(arguments[argumentIndex]);

        pathParts && parts.push.apply(parts, pathParts);
    }

    return createPath(parts);
}

function isPath(path) {
    if(!(typeof path === 'string' || (path instanceof String))){
        return;
    }
    var match = path.match(/\[.*?(?:\\\])*(?:\\\[)*\]/g);
    if(match && match.length === 1 && match[0] === path){
        return true;
    }
}

function isPathAbsolute(path){
    var parts = pathToParts(path);

    if(parts == null){
        return false;
    }

    return parts[0] === rootPath;
}

function isPathRoot(path){
    var parts = pathToParts(path);
    if(parts == null){
        return false;
    }
    return (isPathAbsolute(parts) && parts[0] === parts[1]) || parts.length === 0;
}

function isBubbleCapturePath(path){
    var parts = pathToParts(path),
        lastPart = parts[parts.length-1];
    return lastPart && lastPart.slice(-bubbleCapture.length) === bubbleCapture;
}

module.exports = {
    resolve: resolvePath,
    create: createPath,
    is: isPath,
    isAbsolute: isPathAbsolute,
    isRoot: isPathRoot,
    isBubbleCapture: isBubbleCapturePath,
    append: appendPath,
    toParts: pathToParts,
    createRoot: createRootPath,
    constants:{
        separator: pathSeparator,
        upALevel: upALevel,
        currentKey: currentKey,
        root: rootPath,
        start: pathStart,
        end: pathEnd,
        wildcard: pathWildcard
    }
};
},{"./detectPath":75}],77:[function(require,module,exports){
function validateKey(key){
    if(!key || !(typeof key === 'object' || typeof key === 'function')){
        throw key + " is not a valid WeakMap key.";
    }
}

function LeakMap(){
    this.clear();
}
LeakMap.prototype.clear = function(){
    this._keys = [];
    this._values = [];
};
LeakMap.prototype["delete"] = function(key){
    validateKey(key);
    var keyIndex = this._keys.indexOf(key);
    if(keyIndex>=0){
        this._keys.splice(keyIndex, 1);
        this._values.splice(keyIndex, 1);
    }
    return false;
};
LeakMap.prototype.get = function(key){
    validateKey(key);
    return this._values[this._keys.indexOf(key)];
};
LeakMap.prototype.has = function(key){
    validateKey(key);
    return !!~this._keys.indexOf(key);
};
LeakMap.prototype.set = function(key, value){
    validateKey(key);

    // Favorite piece of koed evor.
    // IE devs would be prowde
    var keyIndex = (~this._keys.indexOf(key) || (this._keys.push(key), this._keys.length)) - 1;

    this._values[keyIndex] = value;
    return this;
};
LeakMap.prototype.toString = function(){
    return '[object WeakMap]';
};

module.exports = LeakMap;
},{}],78:[function(require,module,exports){
// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p>Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * <p>NOTE: Before using this WeakMap emulation in a non-SES
 * environment, see the note below about hiddenRecord.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator, console
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // IE 11 has no Proxy but has a broken WeakMap such that we need to patch
  // it using DoubleWeakMap; this flag tells DoubleWeakMap so.
  var doubleWeakMapCheckSilentFailure = false;

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

    } else {
      // IE 11 bug: WeakMaps silently fail to store frozen objects.
      var testMap = new HostWeakMap();
      var testObject = Object.freeze({});
      testMap.set(testObject, 1);
      if (testMap.get(testObject) !== 1) {
        doubleWeakMapCheckSilentFailure = true;
        // Fall through to installing our WeakMap.
      } else {
        module.exports = WeakMap;
        return;
      }
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }

    // The hiddenRecord and the key point directly at each other, via
    // the "key" and HIDDEN_NAME properties respectively. The key
    // field is for quickly verifying that this hidden record is an
    // own property, not a hidden record from up the prototype chain.
    //
    // NOTE: Because this WeakMap emulation is meant only for systems like
    // SES where Object.prototype is frozen without any numeric
    // properties, it is ok to use an object literal for the hiddenRecord.
    // This has two advantages:
    // * It is much faster in a performance critical place
    // * It avoids relying on Object.create(null), which had been
    //   problematic on Chrome 28.0.1480.0. See
    //   https://code.google.com/p/google-caja/issues/detail?id=1687
    hiddenRecord = { key: key };

    // When using this WeakMap emulation on platforms where
    // Object.prototype might not be frozen and Object.create(null) is
    // reliable, use the following two commented out lines instead.
    // hiddenRecord = Object.create(null);
    // hiddenRecord.key = key;

    // Please contact us if you need this to work on platforms where
    // Object.prototype might not be frozen and
    // Object.create(null) might not be reliable.

    try {
      defProp(key, HIDDEN_NAME, {
        value: hiddenRecord,
        writable: false,
        enumerable: false,
        configurable: false
      });
      return hiddenRecord;
    } catch (error) {
      // Under some circumstances, isExtensible seems to misreport whether
      // the HIDDEN_NAME can be defined.
      // The circumstances have not been isolated, but at least affect
      // Node.js v0.10.26 on TravisCI / Linux, but not the same version of
      // Node.js on OS X.
      return void 0;
    }
  }

  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();

  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  var calledAsFunctionWarningDone = false;
  function calledAsFunctionWarning() {
    // Future ES6 WeakMap is currently (2013-09-10) expected to reject WeakMap()
    // but we used to permit it and do it ourselves, so warn only.
    if (!calledAsFunctionWarningDone && typeof console !== 'undefined') {
      calledAsFunctionWarningDone = true;
      console.warn('WeakMap should be invoked as new WeakMap(), not ' +
          'WeakMap(). This will be an error in the future.');
    }
  }

  var nextId = 0;

  var OurWeakMap = function() {
    if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
      calledAsFunctionWarning();
    }

    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var values = []; // brute force for corresponding values.
    var id = nextId++;

    function get___(key, opt_default) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord ? hiddenRecord[id] : opt_default;
      } else {
        index = keys.indexOf(key);
        return index >= 0 ? values[index] : opt_default;
      }
    }

    function has___(key) {
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord;
      } else {
        return keys.indexOf(key) >= 0;
      }
    }

    function set___(key, value) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        hiddenRecord[id] = value;
      } else {
        index = keys.indexOf(key);
        if (index >= 0) {
          values[index] = value;
        } else {
          // Since some browsers preemptively terminate slow turns but
          // then continue computing with presumably corrupted heap
          // state, we here defensively get keys.length first and then
          // use it to update both the values and keys arrays, keeping
          // them in sync.
          index = keys.length;
          values[index] = value;
          // If we crash here, values will be one longer than keys.
          keys[index] = key;
        }
      }
      return this;
    }

    function delete___(key) {
      var hiddenRecord = getHiddenRecord(key);
      var index, lastIndex;
      if (hiddenRecord) {
        return id in hiddenRecord && delete hiddenRecord[id];
      } else {
        index = keys.indexOf(key);
        if (index < 0) {
          return false;
        }
        // Since some browsers preemptively terminate slow turns but
        // then continue computing with potentially corrupted heap
        // state, we here defensively get keys.length first and then use
        // it to update both the keys and the values array, keeping
        // them in sync. We update the two with an order of assignments,
        // such that any prefix of these assignments will preserve the
        // key/value correspondence, either before or after the delete.
        // Note that this needs to work correctly when index === lastIndex.
        lastIndex = keys.length - 1;
        keys[index] = void 0;
        // If we crash here, there's a void 0 in the keys array, but
        // no operation will cause a "keys.indexOf(void 0)", since
        // getHiddenRecord(void 0) will always throw an error first.
        values[index] = values[lastIndex];
        // If we crash here, values[index] cannot be found here,
        // because keys[index] is void 0.
        keys[index] = keys[lastIndex];
        // If index === lastIndex and we crash here, then keys[index]
        // is still void 0, since the aliasing killed the previous key.
        keys.length = lastIndex;
        // If we crash here, keys will be one shorter than values.
        values.length = lastIndex;
        return true;
      }
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };

  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        return this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      // In this mode we are always using double maps, so we are not proxy-safe.
      // This combination does not occur in any known browser, but we had best
      // be safe.
      if (doubleWeakMapCheckSilentFailure && typeof Proxy !== 'undefined') {
        Proxy = undefined;
      }

      function DoubleWeakMap() {
        if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
          calledAsFunctionWarning();
        }

        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        //
        // (Except in doubleWeakMapCheckSilentFailure mode in which case we
        // disable proxies.)
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        var dset;
        if (doubleWeakMapCheckSilentFailure) {
          dset = function(key, value) {
            hmap.set(key, value);
            if (!hmap.has(key)) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set(key, value);
            }
            return this;
          };
        } else {
          dset = function(key, value) {
            if (enableSwitching) {
              try {
                hmap.set(key, value);
              } catch (e) {
                if (!omap) { omap = new OurWeakMap(); }
                omap.set___(key, value);
              }
            } else {
              hmap.set(key, value);
            }
            return this;
          };
        }

        function ddelete(key) {
          var result = !!hmap['delete'](key);
          if (omap) { return omap.delete___(key) || result; }
          return result;
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();

},{}],79:[function(require,module,exports){
var Lang = require('lang-js'),
    Token = Lang.Token,
    paths = require('gedi-paths'),
    createSpec = require('spec-js'),
    detectPath = require('gedi-paths/detectPath');

module.exports = function(get, model){

    function PathToken(path){
        this.path = path;
    }
    PathToken = createSpec(PathToken, Token);
    PathToken.prototype.name = 'PathToken';
    PathToken.tokenPrecedence = 1;
    PathToken.prototype.parsePrecedence = 2;
    PathToken.tokenise = function(substring){
        var path = detectPath(substring);

        if(path){
            return new PathToken(path, path.length);
        }
    };
    PathToken.prototype.evaluate = function(scope){
        this.path = this.original;
        this.result = get(paths.resolve(scope.get('_gmc_'), this.original), model);
        this.sourcePathInfo = {
            path: this.original
        };
    };

    return PathToken;
}
},{"gedi-paths":76,"gedi-paths/detectPath":75,"lang-js":87,"spec-js":90}],80:[function(require,module,exports){
var WM;

if(typeof WeakMap !== 'undefined'){
    WM = WeakMap;
}else if(typeof window !== 'undefined'){
    var rv = -1; // Return value assumes failure.
    if (navigator.appName == 'Microsoft Internet Explorer'){
        var match = navigator.userAgent.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/);
        if (match && match[1] <= 9){
            WM = require('leak-map');
        }
    }
}

WM || (WM = require('weak-map'));

module.exports = WM;
},{"leak-map":77,"weak-map":78}],81:[function(require,module,exports){
var Lang = require('lang-js'),
    paths = require('gedi-paths'),
    merge = require('merge'),
    createNestingParser = Lang.createNestingParser,
    detectString = Lang.detectString,
    Token = Lang.Token,
    Scope = Lang.Scope,
    createSpec = require('spec-js');

function fastEach(items, callback) {
    for (var i = 0; i < items.length; i++) {
        if (callback(items[i], i, items)) break;
    }
    return items;
}

function quickIndexOf(array, value){
    var length = array.length
    for(var i = 0; i < length && array[i] !== value;i++) {}
    return i < length ? i : -1;
}

function stringFormat(string, values){
    return string.replace(/{(\d+)}/g, function(match, number) {
        return values[number] != null
          ? values[number]
          : ''
        ;
    });
}

function isIdentifier(substring){
    var valid = /^[$A-Z_][0-9A-Z_$]*/i,
        possibleIdentifier = substring.match(valid);

    if (possibleIdentifier && possibleIdentifier.index === 0) {
        return possibleIdentifier[0];
    }
}

function tokeniseIdentifier(substring){
    // searches for valid identifiers or operators
    //operators
    var operators = "!=<>/&|*%-^?+\\",
        index = 0;

    while (operators.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

    if (index > 0) {
        return substring.slice(0, index);
    }

    var identifier = isIdentifier(substring);

    if(identifier != null){
        return identifier;
    }
}

function createKeywordTokeniser(Constructor, keyword){
    return function(substring){
        substring = isIdentifier(substring);
        if (substring === keyword) {
            return new Constructor(substring, substring.length);
        }
    };
}

function StringToken(){}
StringToken = createSpec(StringToken, Token);
StringToken.tokenPrecedence = 2;
StringToken.prototype.parsePrecedence = 2;
StringToken.prototype.stringTerminal = '"';
StringToken.prototype.name = 'StringToken';
StringToken.prototype.static = true;
StringToken.tokenise = function (substring) {
    if (substring.charAt(0) === this.prototype.stringTerminal) {
        var index = 0,
        escapes = 0;

        while (substring.charAt(++index) !== this.prototype.stringTerminal)
        {
           if(index >= substring.length){
                   throw "Unclosed " + this.name;
           }
           if (substring.charAt(index) === '\\' && substring.charAt(index+1) === this.prototype.stringTerminal) {
                   substring = substring.slice(0, index) + substring.slice(index + 1);
                   escapes++;
           }
        }

        return new this(
            substring.slice(0, index+1),
            index + escapes + 1
        );
    }
}
StringToken.prototype.evaluate = function () {
    this.result = this.original.slice(1,-1);
}

function String2Token(){}
String2Token = createSpec(String2Token, StringToken);
String2Token.tokenPrecedence = 1;
String2Token.prototype.parsePrecedence = 1;
String2Token.prototype.stringTerminal = "'";
String2Token.prototype.name = 'String2Token';
String2Token.tokenise = StringToken.tokenise;

function ParenthesesToken(){
}
ParenthesesToken = createSpec(ParenthesesToken, Token);
ParenthesesToken.tokenPrecedence = 1;
ParenthesesToken.prototype.parsePrecedence = 4;
ParenthesesToken.prototype.name = 'ParenthesesToken';
ParenthesesToken.tokenise = function(substring) {
    if(substring.charAt(0) === '('){
        return new ParenthesesToken(substring.charAt(0), 1);
    }
}
var parenthesisParser = createNestingParser(ParenthesesEndToken);
ParenthesesToken.prototype.parse = function(tokens, index, parse){
    parenthesisParser.apply(this, arguments);

    this.hasFill = this.childTokens._hasFill;
    this.partials = this.childTokens._partials;
};

function executeFunction(parenthesesToken, scope, fn){
    var outerArgs = parenthesesToken.childTokens.slice(1);

    if(parenthesesToken.partials || parenthesesToken.hasFill){
        parenthesesToken.result = function(scope, args){
            scope._innerArgs = args;

            var appliedArgs = [];

            for(var i = 0; i < outerArgs.length; i++){
                if(outerArgs[i] instanceof FillToken){
                    appliedArgs.push.apply(appliedArgs, args.sliceRaw(parenthesesToken.partials));
                }else{
                    appliedArgs.push(outerArgs[i]);
                }
            }

            return scope.callWith(fn, appliedArgs, parenthesesToken);
        };
        return;
    }
    parenthesesToken.result = scope.callWith(fn, parenthesesToken.childTokens.slice(1), parenthesesToken);
}
ParenthesesToken.prototype.evaluate = function(scope){
    scope = new Scope(scope);

    var functionToken = this.childTokens[0];

    if(!functionToken){
        throw "Invalid function call. No function was provided to execute.";
    }

    functionToken.evaluate(scope);

    if(typeof functionToken.result !== 'function'){
        throw functionToken.original + " (" + functionToken.result + ")" + " is not a function";
    }

    executeFunction(this, scope, functionToken.result);
};

function ParenthesesEndToken(){}
ParenthesesEndToken = createSpec(ParenthesesEndToken, Token);
ParenthesesEndToken.tokenPrecedence = 1;
ParenthesesEndToken.prototype.parsePrecedence = 4;
ParenthesesEndToken.prototype.name = 'ParenthesesEndToken';
ParenthesesEndToken.tokenise = function(substring) {
    if(substring.charAt(0) === ')'){
        return new ParenthesesEndToken(substring.charAt(0), 1);
    }
};

function NumberToken(){}
NumberToken = createSpec(NumberToken, Token);
NumberToken.tokenPrecedence = 2;
NumberToken.prototype.parsePrecedence = 2;
NumberToken.prototype.name = 'NumberToken';
NumberToken.tokenise = function(substring) {
    var specials = {
        "NaN": Number.NaN,
        "-NaN": -Number.NaN,
        "Infinity": Infinity,
        "-Infinity": -Infinity
    };
    for (var key in specials) {
        if (substring.slice(0, key.length) === key) {
            return new NumberToken(key, key.length);
        }
    }

    var valids = "0123456789-.Eex",
        index = 0;

    while (valids.indexOf(substring.charAt(index)||null) >= 0 && ++index) {}

    if (index > 0) {
        var result = substring.slice(0, index);
        if(isNaN(parseFloat(result))){
            return;
        }
        return new NumberToken(result, index);
    }

    return;
};
NumberToken.prototype.evaluate = function(scope){
    this.result = parseFloat(this.original);
};

function ValueToken(value, sourcePathInfo, key){
    this.original = 'Value';
    this.length = this.original.length,
    this.result = value;

    if(sourcePathInfo){
        this.sourcePathInfo = new SourcePathInfo();
        this.sourcePathInfo.path = sourcePathInfo.path;
        this.sourcePathInfo.subPaths = sourcePathInfo.subPaths && sourcePathInfo.subPaths.slice();
    }

    if(key != null){
        this.sourcePathInfo.drillTo(key);
    }
}
ValueToken = createSpec(ValueToken, Token);
ValueToken.tokenPrecedence = 2;
ValueToken.prototype.parsePrecedence = 2;
ValueToken.prototype.name = 'ValueToken';
ValueToken.prototype.evaluate = function(){};

function NullToken(){}
NullToken = createSpec(NullToken, Token);
NullToken.tokenPrecedence = 2;
NullToken.prototype.parsePrecedence = 2;
NullToken.prototype.name = 'NullToken';
NullToken.tokenise = createKeywordTokeniser(NullToken, "null");
NullToken.prototype.evaluate = function(scope){
    this.result = null;
};

function UndefinedToken(){}
UndefinedToken = createSpec(UndefinedToken, Token);
UndefinedToken.tokenPrecedence = 2;
UndefinedToken.prototype.parsePrecedence = 2;
UndefinedToken.prototype.name = 'UndefinedToken';
UndefinedToken.tokenise = createKeywordTokeniser(UndefinedToken, 'undefined');
UndefinedToken.prototype.evaluate = function(scope){
    this.result = undefined;
};

function TrueToken(){}
TrueToken = createSpec(TrueToken, Token);
TrueToken.tokenPrecedence = 2;
TrueToken.prototype.parsePrecedence = 2;
TrueToken.prototype.name = 'TrueToken';
TrueToken.tokenise = createKeywordTokeniser(TrueToken, 'true');
TrueToken.prototype.evaluate = function(scope){
    this.result = true;
};

function FalseToken(){}
FalseToken = createSpec(FalseToken, Token);
FalseToken.tokenPrecedence = 2;
FalseToken.prototype.parsePrecedence = 2;
FalseToken.prototype.name = 'FalseToken';
FalseToken.tokenise = createKeywordTokeniser(FalseToken, 'false');
FalseToken.prototype.evaluate = function(scope){
    this.result = false;
};

function DelimiterToken(){}
DelimiterToken = createSpec(DelimiterToken, Token);
DelimiterToken.tokenPrecedence = 1;
DelimiterToken.prototype.parsePrecedence = 1;
DelimiterToken.prototype.name = 'DelimiterToken';
DelimiterToken.tokenise = function(substring) {
    var i = 0;
    while(i < substring.length && substring.charAt(i).trim() === "") {
        i++;
    }

    if(i){
        return new DelimiterToken(substring.slice(0, i), i);
    }
};
DelimiterToken.prototype.parse = function(tokens, position){
    tokens.splice(position, 1);
};

function IdentifierToken(){}
IdentifierToken = createSpec(IdentifierToken, Token);
IdentifierToken.tokenPrecedence = 3;
IdentifierToken.prototype.parsePrecedence = 3;
IdentifierToken.prototype.name = 'IdentifierToken';
IdentifierToken.tokenise = function(substring){
    var result = tokeniseIdentifier(substring);

    if(result != null){
        return new IdentifierToken(result, result.length);
    }
};
IdentifierToken.prototype.evaluate = function(scope){
    var value = scope.get(this.original);
    if(value instanceof Token){
        this.result = value.result;
        this.sourcePathInfo = value.sourcePathInfo;
    }else{
        this.result = value;
    }
};

function PeriodToken(){}
PeriodToken = createSpec(PeriodToken, Token);
PeriodToken.prototype.name = 'PeriodToken';
PeriodToken.tokenPrecedence = 2;
PeriodToken.prototype.parsePrecedence = 5;
PeriodToken.tokenise = function(substring){
    var periodConst = ".";
    return (substring.charAt(0) === periodConst) ? new PeriodToken(periodConst, 1) : undefined;
};
PeriodToken.prototype.parse = function(tokens, position){
    this.targetToken = tokens.splice(position-1,1)[0];
    this.identifierToken = tokens.splice(position,1)[0];
};
PeriodToken.prototype.evaluate = function(scope){
    this.targetToken.evaluate(scope);
    if(
        this.targetToken.result &&
        (typeof this.targetToken.result === 'object' || typeof this.targetToken.result === 'function')
        && this.targetToken.result.hasOwnProperty(this.identifierToken.original)
    ){
        this.result = this.targetToken.result[this.identifierToken.original];
    }else{
        this.result = undefined;
    }

    var targetPath;

    if(this.targetToken.sourcePathInfo){
        targetPath = this.targetToken.sourcePathInfo.path
    }

    if(targetPath){
        this.sourcePathInfo = {
            path: paths.append(targetPath, paths.create(this.identifierToken.original))
        };
    }
};

function CommaToken(){}
CommaToken = createSpec(CommaToken, Token);
CommaToken.prototype.name = 'CommaToken';
CommaToken.tokenPrecedence = 2;
CommaToken.prototype.parsePrecedence = 6;
CommaToken.tokenise = function(substring){
    var characterConst = ",";
    return (substring.charAt(0) === characterConst) ? new CommaToken(characterConst, 1) : undefined;
};
CommaToken.prototype.parse = function(tokens, position){
    this.leftToken = tokens.splice(position-1,1)[0];
    this.rightToken = tokens.splice(position,1)[0];
    if(!this.leftToken){
        throw "Invalid syntax, expected token before ,";
    }
    if(!this.rightToken){
        throw "Invalid syntax, expected token after ,";
    }
};
CommaToken.prototype.evaluate = function(scope){
    this.leftToken.evaluate(scope);
    this.rightToken.evaluate(scope);

    var leftToken = this.leftToken,
        rightToken = this.rightToken,
        leftPath = leftToken.sourcePathInfo && leftToken.sourcePathInfo.path,
        leftPaths = leftToken.sourcePathInfo && leftToken.sourcePathInfo.subPaths,
        rightPath = rightToken.sourcePathInfo && rightToken.sourcePathInfo.path;

    this.sourcePathInfo = {
        subPaths: []
    };

    if(leftToken instanceof CommaToken){
        // concat
        this.result = leftToken.result.slice();
        this.sourcePathInfo.subPaths = leftPaths;
    }else{
        this.result = [];

        this.result.push(leftToken.result);
        this.sourcePathInfo.subPaths.push(leftPath);
    }

    this.result.push(rightToken.result);
    this.sourcePathInfo.subPaths.push(rightPath);
};

function PartialToken(){}
PartialToken = createSpec(PartialToken, Token);
PartialToken.prototype.name = 'PartialToken';
PartialToken.tokenPrecedence = 1;
PartialToken.prototype.parsePrecedence = 4;
PartialToken.tokenise = function(substring){
    var characterConst = "_";
    return (substring.charAt(0) === characterConst) ? new PartialToken(characterConst, 1) : undefined;
};
PartialToken.prototype.parse = function(tokens){
    if(tokens._hasFill){
        throw "Partial tokens may only appear before a Fill token";
    }
    tokens._partials = tokens._partials || 0;
    this._partialIndex = tokens._partials;
    tokens._partials++;
};
PartialToken.prototype.evaluate = function(scope){
    this.result = scope._innerArgs.get(this._partialIndex);
};

function FillToken(){}
FillToken = createSpec(FillToken, Token);
FillToken.prototype.name = 'FillToken';
FillToken.tokenPrecedence = 1;
FillToken.prototype.parsePrecedence = 4;
FillToken.tokenise = function(substring){
    var charactersConst = "...";
    return (substring.slice(0,3) === charactersConst) ? new FillToken(charactersConst, 3) : undefined;
};
FillToken.prototype.parse = function(tokens){
    if(tokens._hasFill){
        throw "A function call may only have one fill token"
    };
    tokens._hasFill = true;
};
FillToken.prototype.evaluate = function(){
    this.result = scope._innerArgs.rest();
};

function PipeToken(){}
PipeToken = createSpec(PipeToken, Token);
PipeToken.prototype.name = 'PipeToken';
PipeToken.tokenPrecedence = 1;
PipeToken.prototype.parsePrecedence = 6;
PipeToken.tokenise = function(substring){
    var pipeConst = "|>";
    return (substring.slice(0,2) === pipeConst) ? new PipeToken(pipeConst, pipeConst.length) : undefined;
};
PipeToken.prototype.parse = function(tokens, position){
    this.argumentToken = tokens.splice(position-1,1)[0];
    this.functionToken = tokens.splice(position,1)[0];
};
PipeToken.prototype.evaluate = function(scope){
    if(!this.functionToken){
        throw "Invalid function call. No function was provided to execute.";
    }

    this.functionToken.evaluate(scope);

    if(typeof this.functionToken.result !== 'function'){
        throw this.functionToken.original + " (" + this.functionToken.result + ")" + " is not a function";
    }

    this.result = scope.callWith(this.functionToken.result, [this.argumentToken], this);
};

function PipeApplyToken(){}
PipeApplyToken = createSpec(PipeApplyToken, Token);
PipeApplyToken.prototype.name = 'PipeApplyToken';
PipeApplyToken.tokenPrecedence = 1;
PipeApplyToken.prototype.parsePrecedence = 6;
PipeApplyToken.tokenise = function(substring){
    var pipeConst = "~>";
    return (substring.slice(0,2) === pipeConst) ? new PipeApplyToken(pipeConst, pipeConst.length) : undefined;
};
PipeApplyToken.prototype.parse = function(tokens, position){
    this.argumentsToken = tokens.splice(position-1,1)[0];
    this.functionToken = tokens.splice(position,1)[0];
};
PipeApplyToken.prototype.evaluate = function(scope){
    if(!this.functionToken){
        throw "Invalid function call. No function was provided to execute.";
    }

    if(!this.argumentsToken){
        throw "Invalid function call. No arguments were provided to apply.";
    }

    this.functionToken.evaluate(scope);
    this.argumentsToken.evaluate(scope);

    if(typeof this.functionToken.result !== 'function'){
        throw this.functionToken.original + " (" + this.functionToken.result + ")" + " is not a function";
    }

    if(!Array.isArray(this.argumentsToken.result)){
        this.result = null;
        return;
    }

    this.result = scope.callWith(this.functionToken.result, this.argumentsToken.result, this);
};

function BraceToken(){}
BraceToken = createSpec(BraceToken, Token);
BraceToken.tokenPrecedence = 1;
BraceToken.prototype.parsePrecedence = 3;
BraceToken.prototype.name = 'BraceToken';
BraceToken.tokenise = function(substring) {
    if(substring.charAt(0) === '{'){
        return new BraceToken(substring.charAt(0), 1);
    }
};
BraceToken.prototype.parse = createNestingParser(BraceEndToken);
BraceToken.prototype.evaluate = function(scope){
    var parameterNames = this.childTokens.slice();

    // Object literal
    if(parameterNames.length === 0 || parameterNames[0] instanceof TupleToken){
        this.result = {};
        this.sourcePathInfo = new SourcePathInfo(null, {}, true);

        for(var i = 0; i < parameterNames.length; i++){
            var token = parameterNames[i];
            token.evaluate(scope);
            this.result[token.keyToken.result] = token.valueToken.result;

            if(token.valueToken.sourcePathInfo){
                this.sourcePathInfo.subPaths[key] = token.valueToken.sourcePathInfo.path;
            }
        };

        return;
    }

    // Function expression
    var fnBody = parameterNames.pop();

    this.result = function(scope, args){
        scope = new Scope(scope);

        for(var i = 0; i < parameterNames.length; i++){
            var parameterToken = args.getRaw(i, true);
            scope.set(parameterNames[i].original, parameterToken);
        }

        fnBody.evaluate(scope);

        if(args.callee){
            args.callee.sourcePathInfo = fnBody.sourcePathInfo;
        }

        return fnBody.result;
    };
};

function BraceEndToken(){}
BraceEndToken = createSpec(BraceEndToken, Token);
BraceEndToken.tokenPrecedence = 1;
BraceEndToken.prototype.parsePrecedence = 4;
BraceEndToken.prototype.name = 'BraceEndToken';
BraceEndToken.tokenise = function(substring) {
    if(substring.charAt(0) === '}'){
        return new BraceEndToken(substring.charAt(0), 1);
    }
};

function Tuple(key, value){
    this[key] = value;
}

function TupleToken(){}
TupleToken = createSpec(TupleToken, Token);
TupleToken.prototype.name = 'TupleToken';
TupleToken.tokenPrecedence = 2;
TupleToken.prototype.parsePrecedence = 6;
TupleToken.tokenise = function(substring){
    var tupleConst = ":";
    return (substring.charAt(0) === tupleConst) ? new TupleToken(tupleConst, 1) : undefined;
};
TupleToken.prototype.parse = function(tokens, position){
    this.keyToken = tokens.splice(position-1,1)[0];
    this.valueToken = tokens.splice(position, 1)[0];
};
TupleToken.prototype.evaluate = function(scope){
    this.keyToken.evaluate(scope);
    this.valueToken.evaluate(scope);

    this.result = new Tuple(this.keyToken.result, this.valueToken.result);
};

function SourcePathInfo(token, source, trackSubPaths){
    var innerPathInfo;

    if(trackSubPaths && source){
        this.subPaths = typeof source === 'object' && new source.constructor();
    }

    if(token){
        innerPathInfo = token.sourcePathInfo;

        if(token instanceof Token && token.path){
            originPath = token.original;
            this.original = source;
        }
    }

    this.innerPathInfo = innerPathInfo;


    this.original = innerPathInfo && innerPathInfo.original || source;
    this.path = innerPathInfo && innerPathInfo.path;
}
SourcePathInfo.prototype.setSubPath = function(to, key){
    if(!this.subPaths){
        return;
    }
    this.subPaths[to] = this.innerPathInfo && this.innerPathInfo.subPaths && this.innerPathInfo.subPaths[key] || paths.append(this.path, paths.create(key));
};
SourcePathInfo.prototype.pushSubPath = function(key){
    if(!this.subPaths){
        return;
    }
    this.setSubPath(this.subPaths.length, key);
};
SourcePathInfo.prototype.setSubPaths = function(paths){
    if(!this.subPaths){
        return;
    }
    this.subPaths = paths;
};
SourcePathInfo.prototype.mapSubPaths = function(object){
    for(var key in object){
        if(object.hasOwnProperty(key)){
            this.setSubPath(key, key);
        }
    }
};
SourcePathInfo.prototype.drillTo = function(key){
    if(this.subPaths){
        this.path = this.subPaths[key];
    }else if(this.path){
        this.path = paths.append(this.path, paths.create(key));
    }
};

function addFilterResult(filteredItems, item, key, sourcePathInfo, isArray){
    if(isArray){
        filteredItems.push(item);
    }else{
        filteredItems[key] = item;
    }
    sourcePathInfo.pushSubPath(key);
}

function gelFilter(scope, args) {
    var source = args.get(0),
        sourcePathInfo = new SourcePathInfo(args.getRaw(0), source, true),
        filteredItems = source && typeof source === 'object' && new source.constructor();

    var functionToCompare = args.get(1);

    if(!filteredItems){
        return undefined;
    }

    var isArray = Array.isArray(source),
        item;

    for(var key in source){
        if(isArray && isNaN(key)){
            continue;
        }
        item = source[key];
        if(typeof functionToCompare === "function"){
            if(scope.callWith(functionToCompare, [item])){
                addFilterResult(filteredItems, item, key, sourcePathInfo, isArray);
            }
        }else{
            if(item === functionToCompare){
                addFilterResult(filteredItems, item, key, sourcePathInfo, isArray);
            }
        }
    }

    args.callee.sourcePathInfo = sourcePathInfo;

    return filteredItems;
}

function gelMerge(scope, args){
    var result = {};
    while(args.hasNext()){
        var nextObject = args.next();
        result = merge(result, nextObject);
    }
    return result;
}

var tokenConverters = [
        StringToken,
        String2Token,
        ParenthesesToken,
        ParenthesesEndToken,
        NumberToken,
        NullToken,
        UndefinedToken,
        TrueToken,
        FalseToken,
        DelimiterToken,
        IdentifierToken,
        CommaToken,
        PeriodToken,
        PartialToken,
        FillToken,
        PipeToken,
        PipeApplyToken,
        BraceToken,
        BraceEndToken,
        TupleToken
    ],
    scope = {
        "parseInt":function(scope, args){
            return parseInt(args.next());
        },
        "parseFloat":function(scope, args){
            return parseFloat(args.next());
        },
        "toFixed": function(scope, args){
            var num = args.next(),
                decimals = args.get(1) || 2;

            if(isNaN(num)){
                return;
            }

            return num.toFixed(decimals);
        },
        "toString":function(scope, args){
            return "" + args.next();
        },
        "+":function(scope, args){
            return args.next() + args.next();
        },
        "-":function(scope, args){
            return args.next() - args.next();
        },
        "/":function(scope, args){
            return args.next() / args.next();
        },
        "*":function(scope, args){
            return args.next() * args.next();
        },
        "%":function(scope, args){
            return args.next() % args.next();
        },
        "isNaN":function(scope, args){
            return isNaN(args.get(0));
        },
        "max":function(scope, args){
            var result = args.next();
            while(args.hasNext()){
                result = Math.max(result, args.next());
            }
            return result;
        },
        "min":function(scope, args){
            var result = args.next();
            while(args.hasNext()){
                result = Math.min(result, args.next());
            }
            return result;
        },
        ">":function(scope, args){
            return args.next() > args.next();
        },
        "<":function(scope, args){
            return args.next() < args.next();
        },
        ">=":function(scope, args){
            return args.next() >= args.next();
        },
        "<=":function(scope, args){
            return args.next() <= args.next();
        },
        "?":function(scope, args){
            var result,
                resultToken;
            if(args.next()){
                result = args.get(1);
                resultToken = args.getRaw(1);
            }else{
                result = args.get(2);
                resultToken = args.getRaw(2);
            }

            args.callee.sourcePathInfo = resultToken && resultToken.sourcePathInfo;

            return result;
        },
        "!":function(scope, args){
            return !args.next();
        },
        "=":function(scope, args){
            return args.next() == args.next();
        },
        "==":function(scope, args){
            return args.next() === args.next();
        },
        "!=":function(scope, args){
            return args.next() != args.next();
        },
        "!==":function(scope, args){
            return args.next() !== args.next();
        },
        "||":function(scope, args){
            var nextArg,
                rawResult,
                argIndex = -1;

            while(args.hasNext()){
                argIndex++;
                nextArg = args.next();
                if(nextArg){
                    break;
                }
            }

            rawResult = args.getRaw(argIndex);
            args.callee.sourcePathInfo = rawResult && rawResult.sourcePathInfo;
            return nextArg;
        },
        "|":function(scope, args){
            var nextArg,
                rawResult,
                argIndex = -1;

            while(args.hasNext()){
                argIndex++;
                nextArg = args.next();
                if(nextArg === true){
                    break;
                }
            }

            rawResult = args.getRaw(argIndex);
            args.callee.sourcePathInfo = rawResult && rawResult.sourcePathInfo;
            return nextArg;
        },
        "&&":function(scope, args){
            var nextArg,
                rawResult,
                argIndex = -1;

            while(args.hasNext()){
                argIndex++;
                nextArg = args.next();
                if(!nextArg){
                    break;
                }
            }

            rawResult = args.getRaw(argIndex);
            args.callee.sourcePathInfo = rawResult && rawResult.sourcePathInfo;
            return nextArg;
        },
        "keys":function(scope, args){
            var object = args.next();
            return typeof object === 'object' ? Object.keys(object) : undefined;
        },
        "values":function(scope, args){
            var target = args.next(),
                callee = args.callee,
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), target, true),
                result = [];

            for(var key in target){
                result.push(target[key]);

                sourcePathInfo.setSubPath(result.length - 1, key);
            }

            callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "invert":function(scope, args){
            var target = args.next(),
                result = {};
            for(var key in target){
                result[target[key]] = key;
            }
            return result;
        },
        "extend": gelMerge,
        "merge": gelMerge,
        "array":function(scope, args){
            var argTokens = args.raw(),
                argValues = args.all(),
                result = [],
                callee = args.callee,
                sourcePathInfo = new SourcePathInfo(null, [], true);

            for(var i = 0; i < argValues.length; i++) {
                result.push(argValues[i]);
                if(argTokens[i] instanceof Token && argTokens[i].sourcePathInfo){
                    sourcePathInfo.subPaths[i] = argTokens[i].sourcePathInfo.path;
                }
            }

            callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "object":function(scope, args){
            var result = {},
                callee = args.callee,
                sourcePathInfo = new SourcePathInfo(null, {}, true);

            for(var i = 0; i < args.length; i+=2){
                var key = args.get(i),
                    valueToken = args.getRaw(i+1),
                    value = args.get(i+1);

                result[key] = value;

                if(valueToken instanceof Token && valueToken.sourcePathInfo){
                    sourcePathInfo.subPaths[key] = valueToken.sourcePathInfo.path;
                }
            }

            callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "pairs": function(scope, args){
            var target = args.next(),
                result = [];

            for(var key in target){
                if(target.hasOwnProperty(key)){
                    result.push([key, target[key]]);
                }
            }

            return result;
        },
        "flatten":function(scope, args){
            var target = args.next(),
                shallow = args.hasNext() && args.next();

            function flatten(target){
                var result = [],
                    source;

                for(var i = 0; i < target.length; i++){
                    source = target[i];

                    for(var j = 0; j < source.length; j++){
                        if(!shallow && Array.isArray(source[j])){
                            result.push(flatten(source));
                        }else{
                            result.push(target[i][j]);
                        }
                    }
                }
                return result;
            }
            return flatten(target);
        },
        "sort": function(scope, args) {
            var source = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source, true),
                sortFunction = args.next(),
                result,
                sourceArrayKeys,
                caller = args.callee;

            if(!Array.isArray(source)){
                return;
            }

            // no subpaths, just do a normal sort.
            if(!sourcePathInfo.path){
                return source.slice().sort(function(value1, value2){
                    return scope.callWith(sortFunction, [value1,value2], caller);
                });
            }

            for(var i = 0; i < source.length; i++){
                sourcePathInfo.setSubPath(i, i);
            }

            result = [];
            sortedPaths = sourcePathInfo.subPaths.slice();
            sortedPaths.sort(function(path1, path2){
                var value1 = source[quickIndexOf(sourcePathInfo.subPaths, path1)],
                    value2 = source[quickIndexOf(sourcePathInfo.subPaths, path2)];

                return scope.callWith(sortFunction, [value1,value2], caller);
            });

            for(var i = 0; i < sortedPaths.length; i++) {
                result[i] = sourcePathInfo.original[paths.toParts(sortedPaths[i]).pop()];
            }

            sourcePathInfo.setSubPaths(sortedPaths);

            args.callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "filter": gelFilter,
        "findOne": function(scope, args) {
            var source = args.next(),
                functionToCompare = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source),
                result,
                caller = args.callee;

            if (Array.isArray(source)) {

                fastEach(source, function(item, index){
                    if(scope.callWith(functionToCompare, [item], caller)){
                        result = item;
                        sourcePathInfo.drillTo(index);
                        args.callee.sourcePathInfo = sourcePathInfo;
                        return true;
                    }
                });
                return result;
            }
        },
        "concat":function(scope, args){
            var result = [],
                argCount = 0,
                sourcePathInfo = new SourcePathInfo(),
                sourcePaths = [];

            var addPaths = function(argToken){
                var argSourcePathInfo = argToken.sourcePathInfo;

                if(argSourcePathInfo){
                    if(Array.isArray(argSourcePathInfo.subPaths)){
                        sourcePaths = sourcePaths.concat(argSourcePathInfo.subPaths);
                    }else if(argSourcePathInfo.path){
                        for(var i = 0; i < argToken.result.length; i++){
                            sourcePaths.push(paths.append(argSourcePathInfo.path, paths.create(i)));
                        }
                    }
                }else{
                    // Non-path-tracked array
                    var nullPaths = [];
                    for(var i = 0; i < argToken.result.length; i++) {
                        nullPaths.push(null);
                    };
                    sourcePaths = sourcePaths.concat(nullPaths);
                }
            };

            while(argCount < args.length){
                if(result == null || !result.concat){
                    return undefined;
                }
                var nextRaw = args.getRaw(argCount, true);
                if(Array.isArray(nextRaw.result)){
                    result = result.concat(nextRaw.result);
                    addPaths(nextRaw);
                }
                argCount++;
            }
            sourcePathInfo.subPaths = sourcePaths;
            args.callee.sourcePathInfo = sourcePathInfo;
            return result;
        },
        "join":function(scope, args){
            args = args.all();

            return args.slice(1).join(args[0]);
        },
        "slice":function(scope, args){
            var sourceTokenIndex = 0,
                source = args.next(),
                start,
                end,
                sourcePathInfo;

            if(args.hasNext()){
                start = source;
                source = args.next();
                sourceTokenIndex++;
            }
            if(args.hasNext()){
                end = source;
                source = args.next();
                sourceTokenIndex++;
            }

            if(!source || !source.slice){
                return;
            }

            if(typeof source !== 'string'){

                // clone source
                source = source.slice();

                sourcePathInfo = new SourcePathInfo(args.getRaw(sourceTokenIndex), source, true);

                if(sourcePathInfo.path){
                    if(sourcePathInfo.innerPathInfo && sourcePathInfo.innerPathInfo.subPaths){
                        sourcePathInfo.setSubPaths(sourcePathInfo.innerPathInfo.subPaths.slice(start, end));
                    }else{
                        sourcePathInfo.mapSubPaths(source);
                        sourcePathInfo.setSubPaths(sourcePathInfo.subPaths.slice(start, end));
                    }
                }
            }

            var result = source.slice(start, end);

            args.callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "split":function(scope, args){
            var target = args.next();
            return target ? target.split(args.hasNext() && args.next()) : undefined;
        },
        "last":function(scope, args){
            var source = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source),
                lastIndex;

            if(!Array.isArray(source)){
                return;
            }

            lastIndex = Math.max(0, source.length - 1);

            sourcePathInfo.drillTo(lastIndex);

            args.callee.sourcePathInfo = sourcePathInfo;

            return source[lastIndex];
        },
        "first":function(scope, args){
            var source = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source);

            sourcePathInfo.drillTo(0);

            args.callee.sourcePathInfo = sourcePathInfo;

            if(!Array.isArray(source)){
                return;
            }
            return source[0];
        },
        "length":function(scope, args){
            var value = args.next();
            return value != null ? value.length : undefined;
        },
        "getValue":function(scope, args){
            var source = args.next(),
                key = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source);

            sourcePathInfo.drillTo(key);

            args.callee.sourcePathInfo = sourcePathInfo;

            if(!source || typeof source !== 'object'){
                return;
            }

            return source[key];
        },
        "compare":function(scope, args){
            var args = args.all(),
                comparitor = args.pop(),
                reference = args.pop(),
                result = true,
                objectToCompare;

            while(args.length){
                objectToCompare = args.pop();
                for(var key in objectToCompare){
                    if(!scope.callWith(comparitor, [objectToCompare[key], reference[key]], this)){
                        result = false;
                    }
                }
            }

            return result;
        },
        "contains": function(scope, args){
            var args = args.all(),
                target = args.shift(),
                success = false,
                strict = false,
                arg;

            if(target == null){
                return;
            }

            if(typeof target === 'boolean'){
                strict = target;
                target = args.shift();
            }

            arg = args.pop();

            if(target == null || !target.indexOf){
                return;
            }

            if(typeof arg === "string" && !strict){
                arg = arg.toLowerCase();

                if(Array.isArray(target)){
                    fastEach(target, function(targetItem){
                        if(typeof targetItem === 'string' && targetItem.toLowerCase() === arg.toLowerCase()){
                            return success = true;
                        }
                    });
                }else{
                    if(typeof target === 'string' && target.toLowerCase().indexOf(arg)>=0){
                        return success = true;
                    }
                }
                return success;
            }else{
                return target.indexOf(arg)>=0;
            }
        },
        "charAt":function(scope, args){
            var target = args.next(),
                position;

            if(args.hasNext()){
                position = args.next();
            }

            if(typeof target !== 'string'){
                return;
            }

            return target.charAt(position);
        },
        "toLowerCase":function(scope, args){
            var target = args.next();

            if(typeof target !== 'string'){
                return undefined;
            }

            return target.toLowerCase();
        },
        "toUpperCase":function(scope, args){
            var target = args.next();

            if(typeof target !== 'string'){
                return undefined;
            }

            return target.toUpperCase();
        },
        "format": function format(scope, args) {
            var args = args.all();

            if(!args[0]){
                return;
            }

            return stringFormat(args.shift(), args);
        },
        "refine": function(scope, args){
            var allArgs = args.all(),
                exclude = typeof allArgs[0] === "boolean" && allArgs.shift(),
                original = allArgs.shift(),
                refined = {},
                sourcePathInfo = new SourcePathInfo(args.getRaw(exclude ? 1 : 0), original, true);

            for(var i = 0; i < allArgs.length; i++){
                allArgs[i] = allArgs[i].toString();
            }


            for(var key in original){
                if(allArgs.indexOf(key)>=0){
                    if(!exclude){
                        refined[key] = original[key];
                        sourcePathInfo.setSubPath(key, key);
                    }
                }else if(exclude){
                    refined[key] = original[key];
                    sourcePathInfo.setSubPath(key, key);
                }
            }

            args.callee.sourcePathInfo = sourcePathInfo;

            return refined;
        },
        "date": (function(){
            var date = function(scope, args) {
                return args.length ? new Date(args.length > 1 ? args.all() : args.next()) : new Date();
            };

            date.addDays = function(scope, args){
                var baseDate = args.next();

                return new Date(baseDate.setDate(baseDate.getDate() + args.next()));
            };

            return date;
        })(),
        "toJSON":function(scope, args){
            return JSON.stringify(args.next());
        },
        "fromJSON":function(scope, args){
            return JSON.parse(args.next());
        },
        "map":function(scope, args){
            var source = args.next(),
                sourcePathInfo = new SourcePathInfo(args.getRaw(0), source, true),
                isArray = Array.isArray(source),
                isObject = typeof source === 'object' && source !== null,
                result = isArray ? [] : {},
                functionToken = args.next();

            if(isArray){
                fastEach(source, function(item, index){
                    var callee = {};
                    result[index] = scope.callWith(functionToken, [
                        new ValueToken(item, new SourcePathInfo(args.getRaw(0), source), index)
                    ], callee);
                    if(callee.sourcePathInfo){
                        sourcePathInfo.subPaths[index] = callee.sourcePathInfo.path;
                    }
                });
            }else if(isObject){
                for(var key in source){
                    var callee = {};
                    result[key] = scope.callWith(functionToken, [
                        new ValueToken(source[key], new SourcePathInfo(args.getRaw(0), source), key)
                    ], callee);
                    if(callee.sourcePathInfo){
                        sourcePathInfo.subPaths[key] = callee.sourcePathInfo.path;
                    }
                }
            }else{
                return null;
            }

            args.callee.sourcePathInfo = sourcePathInfo;

            return result;
        },
        "fold": function(scope, args){
            var fn = args.get(2),
                seedToken = args.getRaw(1, true),
                seed = args.get(1),
                sourceToken = args.getRaw(0, true),
                source = args.get(0),
                result = seed;


            var sourcePathInfo = new SourcePathInfo(sourceToken, source, true);
            sourcePathInfo.mapSubPaths(source);

            if(!source || !source.length){
                return result;
            }

            var resultPathInfo = seedToken.sourcePathInfo;

            for(var i = 0; i < source.length; i++){
                var callee = {};
                result = scope.callWith(
                    fn,
                    [
                        new ValueToken(result, resultPathInfo),
                        new ValueToken(source[i], sourcePathInfo, i),
                        i
                    ],
                    callee
                );

                resultPathInfo = callee.sourcePathInfo;
            }

            args.callee.sourcePathInfo = resultPathInfo;

            return result;
        },
        "partial": function(scope, outerArgs){
            var fn = outerArgs.get(0),
                caller = outerArgs.callee;

            return function(scope, innerArgs){
                var result = scope.callWith(fn, outerArgs.raw().slice(1).concat(innerArgs.raw()), caller);

                innerArgs.callee.sourcePathInfo = outerArgs.callee.sourcePathInfo;

                return result;
            };
        },
        "flip": function(scope, args){
            var outerArgs = args.all().reverse(),
                fn = outerArgs.pop(),
                caller = args.callee;

            return function(scope, args){
                return scope.callWith(fn, outerArgs, caller);
            };
        },
        "compose": function(scope, args){
            var outerArgs = args.all().reverse(),
                caller = args.callee;

            return function(scope, args){
                var result = scope.callWith(outerArgs[0], args.all(),caller);

                for(var i = 1; i < outerArgs.length; i++){
                    result = scope.callWith(outerArgs[i], [result],caller);
                }

                return result;
            };
        },
        "apply": function(scope, args){
            var fn = args.next(),
                outerArgs = args.next();

            return scope.callWith(fn, outerArgs, args.callee);
        },
        "zip": function(scope, args){
            var allArgs = args.all(),
                result = [],
                maxLength = 0;

            for(var i = 0; i < allArgs.length; i++){
                if(!Array.isArray(allArgs[i])){
                    allArgs.splice(i,1);
                    i--;
                    continue;
                }
                maxLength = Math.max(maxLength, allArgs[i].length);
            }

            for (var itemIndex = 0; itemIndex < maxLength; itemIndex++) {
                for(var i = 0; i < allArgs.length; i++){
                    if(allArgs[i].length >= itemIndex){
                        result.push(allArgs[i][itemIndex]);
                    }
                }
            }

            return result;
        },
        "keyFor": function(scope, args){
            var value = args.next(),
                target = args.next();

            for(var key in target){
                if(!target.hasOwnProperty(key)){
                    continue;
                }

                if(target[key] === value){
                    return key;
                }
            }
        },
        "regex": function(scope, args){
            var all = args.all();

            return new RegExp(all[0], all[1]);
        },
        "match": function(scope, args){
            var string = args.next();

            if(typeof string !== 'string'){
                return false;
            }

            return string.match(args.next());
        }
    };

function createMathFunction(key){
    return function(scope, args){
        var all = args.all();
        return Math[key].apply(Math, all);
    };
}

scope.math = {};

var mathFunctionNames = ['abs','acos','asin','atan','atan2','ceil','cos','exp','floor','imul','log','max','min','pow','random','round','sin','sqrt','tan'];

for(var i = 0; i < mathFunctionNames.length; i++){
    var key = mathFunctionNames[i];
    scope.math[key] = createMathFunction(key);
}


Gel = function(){
    var gel = {},
        lang = new Lang();

    gel.lang = lang;
    gel.tokenise = function(expression){
        return gel.lang.tokenise(expression, this.tokenConverters);
    };
    gel.evaluate = function(expression, injectedScope, returnAsTokens){
        var scope = new Scope(this.scope);

        scope.add(injectedScope);

        return lang.evaluate(expression, scope, this.tokenConverters, returnAsTokens);
    };
    gel.tokenConverters = tokenConverters.slice();
    gel.scope = merge({}, scope);

    return gel;
};

for (var i = 0; i < tokenConverters.length; i++) {
    Gel[tokenConverters[i].prototype.name] = tokenConverters[i];
};

Gel.Token = Token;
Gel.Scope = Scope;
module.exports = Gel;
},{"gedi-paths":83,"lang-js":84,"merge":89,"spec-js":90}],82:[function(require,module,exports){
module.exports=require(75)
},{}],83:[function(require,module,exports){
var detectPath = require('./detectPath');

var pathSeparator = "/",
    upALevel = "..",
    bubbleCapture = "...",
    currentKey = "#",
    rootPath = "",
    pathStart = "[",
    pathEnd = "]",
    pathWildcard = "*";

function pathToRaw(path) {
    return path && path.slice(1, -1);
}

//***********************************************
//
//      Raw To Path
//
//***********************************************

function rawToPath(rawPath) {
    return pathStart + (rawPath == null ? '' : rawPath) + pathEnd;
}

var memoisePathCache = {};
function resolvePath() {
    var memoiseKey,
        pathParts = [];

    for(var argumentIndex = arguments.length; argumentIndex--;){
        pathParts.unshift.apply(pathParts, pathToParts(arguments[argumentIndex]));
        if(isPathAbsolute(arguments[argumentIndex])){
            break;
        }
    }

    memoiseKey = pathParts.join(',');

    if(memoisePathCache[memoiseKey]){
        return memoisePathCache[memoiseKey];
    }

    var absoluteParts = [],
        lastRemoved,
        pathParts,
        pathPart;

    for(var pathPartIndex = 0; pathPartIndex < pathParts.length; pathPartIndex++){
        pathPart = pathParts[pathPartIndex];

        if (pathPart === currentKey) {
            // Has a last removed? Add it back on.
            if(lastRemoved != null){
                absoluteParts.push(lastRemoved);
                lastRemoved = null;
            }
        } else if (pathPart === rootPath) {
            // Root path? Reset parts to be absolute.
            absoluteParts = [''];

        } else if (pathPart.slice(-bubbleCapture.length) === bubbleCapture) {
            // deep bindings
            if(pathPart !== bubbleCapture){
                absoluteParts.push(pathPart.slice(0, -bubbleCapture.length));
            }
        } else if (pathPart === upALevel) {
            // Up a level? Remove the last item in absoluteParts
            lastRemoved = absoluteParts.pop();
        } else if (pathPart.slice(0,2) === upALevel) {
            var argument = pathPart.slice(2);
            //named
            while(absoluteParts[absoluteParts.length - 1] !== argument){
                if(absoluteParts.length === 0){
                    throw "Named path part was not found: '" + pathPart + "', in path: '" + arguments[argumentIndex] + "'.";
                }
                lastRemoved = absoluteParts.pop();
            }
        } else {
            // any following valid part? Add it to the absoluteParts.
            absoluteParts.push(pathPart);
        }
    }

    // Convert the absoluteParts to a Path and memoise the result.
    return memoisePathCache[memoiseKey] = createPath(absoluteParts);
}

var memoisedPathTokens = {};

function createPath(path){

    if(typeof path === 'number'){
        path = path.toString();
    }

    if(path == null){
        return rawToPath();
    }

    // passed in an Expression or an 'expression formatted' Path (eg: '[bla]')
    if (typeof path === "string"){

        if(memoisedPathTokens[path]){
            return memoisedPathTokens[path];
        }

        if(path.charAt(0) === pathStart) {
            var pathString = path.toString(),
                detectedPath = detectPath(pathString);

            if (detectedPath && detectedPath.length === pathString.length) {
                return memoisedPathTokens[pathString] = detectedPath;
            } else {
                return false;
            }
        }else{
            return createPath(rawToPath(path));
        }
    }

    if(path instanceof Array) {

        var parts = [];
        for (var i = 0; i < path.length; i++) {
            var pathPart = path[i];
            pathPart = pathPart.replace(/([\[|\]|\\|\/])/g, '\\$1');
            parts.push(pathPart);
        }
        if(parts.length === 1 && parts[0] === rootPath){
            return createRootPath();
        }
        return rawToPath(parts.join(pathSeparator));
    }
}

function createRootPath(){
    return createPath([rootPath, rootPath]);
}

function pathToParts(path){
    var pathType = typeof path;

    if(pathType !== 'string' && pathType !== 'number'){
        if(Array.isArray(path)){
            return path;
        }
        return;
    }

    // if we haven't been passed a path, then turn the input into a path
    if (!isPath(path)) {
        path = createPath(path);
        if(path === false){
            return;
        }
    }

    path = path.slice(1,-1);

    if(path === ""){
        return [];
    }

    var lastPartIndex = 0,
        parts,
        nextChar,
        currentChar;

    if(path.indexOf('\\') < 0){
        return path.split(pathSeparator);
    }

    parts = [];

    for(var i = 0; i < path.length; i++){
        currentChar = path.charAt(i);
        if(currentChar === pathSeparator){
            parts.push(path.slice(lastPartIndex,i));
            lastPartIndex = i+1;
        }else if(currentChar === '\\'){
            nextChar = path.charAt(i+1);
            if(nextChar === '\\'){
                path = path.slice(0, i) + path.slice(i + 1);
            }else if(nextChar === ']' || nextChar === '['){
                path = path.slice(0, i) + path.slice(i + 1);
            }else if(nextChar === pathSeparator){
                parts.push(path.slice(lastPartIndex), i);
            }
        }
    }
    parts.push(path.slice(lastPartIndex));

    return parts;
}

function appendPath(){
    var parts = pathToParts(arguments[0]);

    if(!parts){
        return;
    }

    if(isPathRoot(arguments[0])){
        parts.pop();
    }

    for (var argumentIndex = 1; argumentIndex < arguments.length; argumentIndex++) {
        var pathParts = pathToParts(arguments[argumentIndex]);

        pathParts && parts.push.apply(parts, pathParts);
    }

    return createPath(parts);
}

function isPath(path) {
    if(!(typeof path === 'string' || (path instanceof String))){
        return;
    }
    var match = path.match(/\[.*?(?:\\\])*(?:\\\[)*\]/g);
    if(match && match.length === 1 && match[0] === path){
        return true;
    }
}

function isPathAbsolute(path){
    var parts = pathToParts(path);

    if(parts == null){
        return false;
    }

    return parts[0] === rootPath;
}

function isPathRoot(path){
    var parts = pathToParts(path);
    if(parts == null){
        return false;
    }
    return (isPathAbsolute(parts) && parts[0] === parts[1]) || parts.length === 0;
}

function isBubbleCapturePath(path){
    var parts = pathToParts(path),
        lastPart = parts[parts.length-1];
    return lastPart && lastPart.slice(-bubbleCapture.length) === bubbleCapture;
}

module.exports = {
    resolve: resolvePath,
    create: createPath,
    is: isPath,
    isAbsolute: isPathAbsolute,
    isRoot: isPathRoot,
    isBubbleCapture: isBubbleCapturePath,
    append: appendPath,
    toParts: pathToParts,
    createRoot: createRootPath,
    constants:{
        separator: pathSeparator,
        upALevel: upALevel,
        currentKey: currentKey,
        root: rootPath,
        start: pathStart,
        end: pathEnd,
        wildcard: pathWildcard
    }
};
},{"./detectPath":82}],84:[function(require,module,exports){
(function (process){
var Token = require('./token');

function fastEach(items, callback) {
    for (var i = 0; i < items.length; i++) {
        if (callback(items[i], i, items)) break;
    }
    return items;
}

var now;

if(typeof process !== 'undefined' && process.hrtime){
    now = function(){
        var time = process.hrtime();
        return time[0] + time[1] / 1000000;
    };
}else if(typeof performance !== 'undefined' && performance.now){
    now = function(){
        return performance.now();
    };
}else if(Date.now){
    now = function(){
        return Date.now();
    };
}else{
    now = function(){
        return new Date().getTime();
    };
}

function callWith(fn, fnArguments, calledToken){
    if(fn instanceof Token){
        fn.evaluate(scope);
        fn = fn.result;
    }
    var argIndex = 0,
        scope = this,
        args = {
            callee: calledToken,
            length: fnArguments.length,
            raw: function(evaluated){
                var rawArgs = fnArguments.slice();
                if(evaluated){
                    fastEach(rawArgs, function(arg){
                        if(arg instanceof Token){
                            arg.evaluate(scope);
                        }
                    });
                }
                return rawArgs;
            },
            getRaw: function(index, evaluated){
                var arg = fnArguments[index];

                if(evaluated){
                    if(arg instanceof Token){
                        arg.evaluate(scope);
                    }
                }
                return arg;
            },
            get: function(index){
                var arg = fnArguments[index];

                if(arg instanceof Token){
                    arg.evaluate(scope);
                    return arg.result;
                }
                return arg;
            },
            hasNext: function(){
                return argIndex < fnArguments.length;
            },
            next: function(){
                if(!this.hasNext()){
                    throw "Incorrect number of arguments";
                }
                if(fnArguments[argIndex] instanceof Token){
                    fnArguments[argIndex].evaluate(scope);
                    return fnArguments[argIndex++].result;
                }
                return fnArguments[argIndex++];
            },
            all: function(){
                var allArgs = fnArguments.slice();
                for(var i = 0; i < allArgs.length; i++){
                    if(allArgs[i] instanceof Token){
                        allArgs[i].evaluate(scope)
                        allArgs[i] = allArgs[i].result;
                    }
                }
                return allArgs;
            },
            rest: function(){
                var allArgs = [];
                while(this.hasNext()){
                    allArgs.push(this.next());
                }
                return allArgs;
            },
            restRaw: function(evaluated){
                var rawArgs = fnArguments.slice();
                if(evaluated){
                    for(var i = argIndex; i < rawArgs.length; i++){
                        if(rawArgs[i] instanceof Token){
                            rawArgs[i].evaluate(scope);
                        }
                    }
                }
                return rawArgs;
            },
            slice: function(start, end){
                return this.all().slice(start, end);
            },
            sliceRaw: function(start, end, evaluated){
                var rawArgs = fnArguments.slice(start, end);
                if(evaluated){
                    fastEach(rawArgs, function(arg){
                        if(arg instanceof Token){
                            arg.evaluate(scope);
                        }
                    });
                }
                return rawArgs;
            }
        };

    scope._args = args;

    return fn(scope, args);
}

function Scope(oldScope){
    this.__scope__ = {};
    if(oldScope){
        this.__outerScope__ = oldScope instanceof Scope ? oldScope : {__scope__:oldScope};
    }
}
Scope.prototype.get = function(key){
    var scope = this;
    while(scope && !scope.__scope__.hasOwnProperty(key)){
        scope = scope.__outerScope__;
    }
    return scope && scope.__scope__[key];
};
Scope.prototype.set = function(key, value, bubble){
    if(bubble){
        var currentScope = this;
        while(currentScope && !(key in currentScope.__scope__)){
            currentScope = currentScope.__outerScope__;
        }

        if(currentScope){
            currentScope.set(key, value);
        }
    }
    this.__scope__[key] = value;
    return this;
};
Scope.prototype.add = function(obj){
    for(var key in obj){
        this.__scope__[key] = obj[key];
    }
    return this;
};
Scope.prototype.isDefined = function(key){
    if(key in this.__scope__){
        return true;
    }
    return this.__outerScope__ && this.__outerScope__.isDefined(key) || false;
};
Scope.prototype.callWith = callWith;

// Takes a start and end regex, returns an appropriate parse function
function createNestingParser(closeConstructor){
    return function(tokens, index, parse){
        var openConstructor = this.constructor,
            position = index,
            opens = 1;

        while(position++, position <= tokens.length && opens){
            if(!tokens[position]){
                throw "Invalid nesting. No closing token was found";
            }
            if(tokens[position] instanceof openConstructor){
                opens++;
            }
            if(tokens[position] instanceof closeConstructor){
                opens--;
            }
        }

        // remove all wrapped tokens from the token array, including nest end token.
        var childTokens = tokens.splice(index + 1, position - 1 - index);

        // Remove the nest end token.
        childTokens.pop();

        // parse them, then add them as child tokens.
        this.childTokens = parse(childTokens);
    };
}

function scanForToken(tokenisers, expression){
    for (var i = 0; i < tokenisers.length; i++) {
        var token = tokenisers[i].tokenise(expression);
        if (token) {
            return token;
        }
    }
}

function sortByPrecedence(items, key){
    return items.slice().sort(function(a,b){
        var precedenceDifference = a[key] - b[key];
        return precedenceDifference ? precedenceDifference : items.indexOf(a) - items.indexOf(b);
    });
}

function tokenise(expression, tokenConverters, memoisedTokens) {
    if(!expression){
        return [];
    }

    if(memoisedTokens && memoisedTokens[expression]){
        return memoisedTokens[expression].slice();
    }

    tokenConverters = sortByPrecedence(tokenConverters, 'tokenPrecedence');

    var originalExpression = expression,
        tokens = [],
        totalCharsProcessed = 0,
        previousLength,
        reservedKeywordToken;

    do {
        previousLength = expression.length;

        var token;

        token = scanForToken(tokenConverters, expression);

        if(token){
            expression = expression.slice(token.length);
            totalCharsProcessed += token.length;
            tokens.push(token);
            continue;
        }

        if(expression.length === previousLength){
            throw "Unable to determine next token in expression: " + expression;
        }

    } while (expression);

    memoisedTokens && (memoisedTokens[originalExpression] = tokens.slice());

    return tokens;
}

function parse(tokens){
    var parsedTokens = 0,
        tokensByPrecedence = sortByPrecedence(tokens, 'parsePrecedence'),
        currentToken = tokensByPrecedence[0],
        tokenNumber = 0;

    while(currentToken && currentToken.parsed == true){
        currentToken = tokensByPrecedence[tokenNumber++];
    }

    if(!currentToken){
        return tokens;
    }

    if(currentToken.parse){
        currentToken.parse(tokens, tokens.indexOf(currentToken), parse);
    }

    // Even if the token has no parse method, it is still concidered 'parsed' at this point.
    currentToken.parsed = true;

    return parse(tokens);
}

function evaluate(tokens, scope){
    scope = scope || new Scope();
    for(var i = 0; i < tokens.length; i++){
        var token = tokens[i];
        token.evaluate(scope);
    }

    return tokens;
}

function printTopExpressions(stats){
    var allStats = [];
    for(var key in stats){
        allStats.push({
            expression: key,
            time: stats[key].time,
            calls: stats[key].calls,
            averageTime: stats[key].averageTime
        });
    }

    allStats.sort(function(stat1, stat2){
        return stat2.time - stat1.time;
    }).slice(0, 10).forEach(function(stat){
        console.log([
            "Expression: ",
            stat.expression,
            '\n',
            'Average evaluation time: ',
            stat.averageTime,
            '\n',
            'Total time: ',
            stat.time,
            '\n',
            'Call count: ',
            stat.calls
        ].join(''));
    });
}

function Lang(){
    var lang = {},
        memoisedTokens = {},
        memoisedExpressions = {};


    var stats = {};

    lang.printTopExpressions = function(){
        printTopExpressions(stats);
    }

    function addStat(stat){
        var expStats = stats[stat.expression] = stats[stat.expression] || {time:0, calls:0};

        expStats.time += stat.time;
        expStats.calls++;
        expStats.averageTime = expStats.time / expStats.calls;
    }

    lang.parse = parse;
    lang.tokenise = function(expression, tokenConverters){
        return tokenise(expression, tokenConverters, memoisedTokens);
    };
    lang.evaluate = function(expression, scope, tokenConverters, returnAsTokens){
        var langInstance = this,
            memoiseKey = expression,
            expressionTree,
            evaluatedTokens,
            lastToken;

        if(!(scope instanceof Scope)){
            scope = new Scope(scope);
        }

        if(Array.isArray(expression)){
            return evaluate(expression , scope).slice(-1).pop();
        }

        if(memoisedExpressions[memoiseKey]){
            expressionTree = memoisedExpressions[memoiseKey].slice();
        } else{
            expressionTree = langInstance.parse(langInstance.tokenise(expression, tokenConverters, memoisedTokens));

            memoisedExpressions[memoiseKey] = expressionTree;
        }


        var startTime = now();
        evaluatedTokens = evaluate(expressionTree , scope);
        addStat({
            expression: expression,
            time: now() - startTime
        });

        if(returnAsTokens){
            return evaluatedTokens.slice();
        }

        lastToken = evaluatedTokens.slice(-1).pop();

        return lastToken && lastToken.result;
    };

    lang.callWith = callWith;
    return lang;
};

Lang.createNestingParser = createNestingParser;
Lang.Scope = Scope;
Lang.Token = Token;

module.exports = Lang;
}).call(this,require("FWaASH"))
},{"./token":85,"FWaASH":5}],85:[function(require,module,exports){
function Token(substring, length){
    this.original = substring;
    this.length = length;
}
Token.prototype.name = 'token';
Token.prototype.precedence = 0;
Token.prototype.valueOf = function(){
    return this.result;
}

module.exports = Token;
},{}],86:[function(require,module,exports){
module.exports=require(19)
},{}],87:[function(require,module,exports){
module.exports=require(84)
},{"./token":88,"FWaASH":5}],88:[function(require,module,exports){
module.exports=require(85)
},{}],89:[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.2.0
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	/**
	 * Merge one or more objects 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	var Public = function(clone) {

		return merge(clone === true, false, arguments);

	}, publicName = 'merge';

	/**
	 * Merge two or more objects recursively 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	Public.recursive = function(clone) {

		return merge(clone === true, true, arguments);

	};

	/**
	 * Clone the input removing any reference
	 * @param mixed input
	 * @return mixed
	 */

	Public.clone = function(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = Public.clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = Public.clone(input[index]);

		}

		return output;

	};

	/**
	 * Merge two objects recursively
	 * @param mixed input
	 * @param mixed extend
	 * @return mixed
	 */

	function merge_recursive(base, extend) {

		if (typeOf(base) !== 'object')

			return extend;

		for (var key in extend) {

			if (typeOf(base[key]) === 'object' && typeOf(extend[key]) === 'object') {

				base[key] = merge_recursive(base[key], extend[key]);

			} else {

				base[key] = extend[key];

			}

		}

		return base;

	}

	/**
	 * Merge two or more objects
	 * @param bool clone
	 * @param bool recursive
	 * @param array argv
	 * @return object
	 */

	function merge(clone, recursive, argv) {

		var result = argv[0],
			size = argv.length;

		if (clone || typeOf(result) !== 'object')

			result = {};

		for (var index=0;index<size;++index) {

			var item = argv[index],

				type = typeOf(item);

			if (type !== 'object') continue;

			for (var key in item) {

				var sitem = clone ? Public.clone(item[key]) : item[key];

				if (recursive) {

					result[key] = merge_recursive(result[key], sitem);

				} else {

					result[key] = sitem;

				}

			}

		}

		return result;

	}

	/**
	 * Get type of variable
	 * @param mixed input
	 * @return string
	 *
	 * @see http://jsperf.com/typeofvar
	 */

	function typeOf(input) {

		return ({}).toString.call(input).slice(8, -1).toLowerCase();

	}

	if (isNode) {

		module.exports = Public;

	} else {

		window[publicName] = Public;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],90:[function(require,module,exports){
Object.create = Object.create || function (o) {
    if (arguments.length > 1) {
        throw new Error('Object.create implementation only accepts the first parameter.');
    }
    function F() {}
    F.prototype = o;
    return new F();
};

function createSpec(child, parent){
    var parentPrototype;

    if(!parent) {
        parent = Object;
    }

    if(!parent.prototype) {
        parent.prototype = {};
    }

    parentPrototype = parent.prototype;

    child.prototype = Object.create(parent.prototype);
    child.prototype.__super__ = parentPrototype;
    child.__super__ = parent;

    // Yes, This is 'bad'. However, it runs once per Spec creation.
    var spec = new Function("child", "return function " + child.name + "(){child.__super__.apply(this, arguments);return child.apply(this, arguments);}")(child);

    spec.prototype = child.prototype;
    spec.prototype.constructor = child.prototype.constructor = spec;
    spec.__super__ = parent;

    return spec;
}

module.exports = createSpec;
},{}],91:[function(require,module,exports){
function escapeHex(hex){
    return String.fromCharCode(hex);
}

function createKey(number){
    if(number + 0xE001 > 0xFFFF){
        throw "Too many references. Log an issue on gihub an i'll add an order of magnatude to the keys.";
    }
    return escapeHex(number + 0xE001);
}

module.exports = createKey;
},{}],92:[function(require,module,exports){
var revive = require('./revive');

function parse(json, reviver){
    return revive(JSON.parse(json, reviver));
}

module.exports = parse;
},{"./revive":93}],93:[function(require,module,exports){
var createKey = require('./createKey'),
    keyKey = createKey(-1);

function revive(input){
    var objects = {},
        scannedInputObjects = [];
        scannedOutputObjects = [];

    function scan(input){
        var output = input;

        if(typeof output !== 'object'){
            return output;
        }

        if(scannedOutputObjects.indexOf(input) < 0){
            output = input instanceof Array ? [] : {};
            scannedOutputObjects.push(output);
            scannedInputObjects.push(input);
        }


        if(input[keyKey]){
            objects[input[keyKey]] = output;
        }

        for(var key in input){
            var value = input[key];

            if(key === keyKey){
                continue;
            }

            if(value != null && typeof value === 'object'){
                var objectIndex = scannedInputObjects.indexOf(value);
                if(objectIndex<0){
                    output[key] = scan(value);
                }else{
                    output[key] = scannedOutputObjects[objectIndex];
                }
            }else if(
                typeof value === 'string' &&
                value.length === 1 &&
                value.charCodeAt(0) > keyKey.charCodeAt(0) &&
                value in objects
            ){
                output[key] = objects[value];
            }else{
                output[key] = input[key];
            }
        }
        return output;
    }

    return scan(input);
}

module.exports = revive;
},{"./createKey":91}],94:[function(require,module,exports){
module.exports = {
    stringify: require('./stringify'),
    parse: require('./parse'),
    revive: require('./revive')
};
},{"./parse":92,"./revive":93,"./stringify":95}],95:[function(require,module,exports){
var createKey = require('./createKey'),
    keyKey = createKey(-1);

function toJsonValue(value){
    if(value != null && typeof value === 'object'){
        var result = value instanceof Array ? [] : {},
            output = value;
        if('toJSON' in value){
            output = value.toJSON();
        }
        for(var key in output){
            result[key] = output[key];
        }
        return result;
    }

    return value;
}

function stringify(input, replacer, spacer){
    var objects = [],
        outputObjects = [],
        refs = [];

    function scan(input){

        if(input === null || typeof input !== 'object'){
            return input;
        }

        var output,
            index = objects.indexOf(input);

        if(index >= 0){
            outputObjects[index][keyKey] = refs[index]
            return refs[index];
        }

        index = objects.length;
        objects[index] = input;
        output = toJsonValue(input);
        outputObjects[index] = output;
        refs[index] = createKey(index);

        for(var key in output){
            output[key] = scan(output[key]);
        }

        return output;
    }

    return JSON.stringify(scan(input), replacer, spacer);
}

module.exports = stringify;
},{"./createKey":91}],96:[function(require,module,exports){
var clone = require('clone'),
    deepEqual = require('deep-equal');

function keysAreDifferent(keys1, keys2){
    if(keys1 === keys2){
        return;
    }
    if(!keys1 || !keys2 || keys1.length !== keys2.length){
        return true;
    }
    for(var i = 0; i < keys1.length; i++){
        if(!~keys2.indexOf(keys1[i])){
            return true;
        }
    }
}

function getKeys(value){
    if(!value || typeof value !== 'object'){
        return;
    }

    return Object.keys(value);
}

function WhatChanged(value){
    this.update(value);
}
WhatChanged.prototype.update = function(value){
    var result = {},
        newKeys = getKeys(value);

    if(value+'' !== this._lastReference+''){
        result.value = true;
    }
    if(typeof value !== typeof this._lastValue){
        result.type = true;
    }
    if(keysAreDifferent(this._lastKeys, getKeys(value))){
        result.keys = true;
    }

    if(value !== null && typeof value === 'object'){
        if(!deepEqual(value, this._lastValue)){
            result.structure = true;
        }
        if(value !== this._lastReference){
            result.reference = true;
        }
    }

    this._lastValue = clone(value);
    this._lastReference = value;
    this._lastKeys = newKeys;

    return result;
};

module.exports = WhatChanged;
},{"clone":97,"deep-equal":98}],97:[function(require,module,exports){
(function (Buffer){
'use strict';

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

// shim for Node's 'util' package
// DO NOT REMOVE THIS! It is required for compatibility with EnderJS (http://enderjs.com/).
var util = {
  isArray: function (ar) {
    return Array.isArray(ar) || (typeof ar === 'object' && objectToString(ar) === '[object Array]');
  },
  isDate: function (d) {
    return typeof d === 'object' && objectToString(d) === '[object Date]';
  },
  isRegExp: function (re) {
    return typeof re === 'object' && objectToString(re) === '[object RegExp]';
  },
  getRegExpFlags: function (re) {
    var flags = '';
    re.global && (flags += 'g');
    re.ignoreCase && (flags += 'i');
    re.multiline && (flags += 'm');
    return flags;
  }
};


if (typeof module === 'object')
  module.exports = clone;

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
*/

function clone(parent, circular, depth, prototype) {
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  var allParents = [];
  var allChildren = [];

  var useBuffer = typeof Buffer != 'undefined';

  if (typeof circular == 'undefined')
    circular = true;

  if (typeof depth == 'undefined')
    depth = Infinity;

  // recurse this function so we don't reset allParents and allChildren
  function _clone(parent, depth) {
    // cloning null always returns null
    if (parent === null)
      return null;

    if (depth == 0)
      return parent;

    var child;
    if (typeof parent != 'object') {
      return parent;
    }

    if (util.isArray(parent)) {
      child = [];
    } else if (util.isRegExp(parent)) {
      child = new RegExp(parent.source, util.getRegExpFlags(parent));
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
    } else if (util.isDate(parent)) {
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      child = new Buffer(parent.length);
      parent.copy(child);
      return child;
    } else {
      if (typeof prototype == 'undefined') child = Object.create(Object.getPrototypeOf(parent));
      else child = Object.create(prototype);
    }

    if (circular) {
      var index = allParents.indexOf(parent);

      if (index != -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    for (var i in parent) {
      child[i] = _clone(parent[i], depth - 1);
    }

    return child;
  }

  return _clone(parent, depth);
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

}).call(this,require("buffer").Buffer)
},{"buffer":1}],98:[function(require,module,exports){
var pSlice = Array.prototype.slice;
var objectKeys = require('./lib/keys.js');
var isArguments = require('./lib/is_arguments.js');

var deepEqual = module.exports = function (actual, expected, opts) {
  if (!opts) opts = {};
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return opts.strict ? actual === expected : actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected, opts);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isBuffer (x) {
  if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
  if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
    return false;
  }
  if (x.length > 0 && typeof x[0] !== 'number') return false;
  return true;
}

function objEquiv(a, b, opts) {
  var i, key;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b, opts);
  }
  if (isBuffer(a)) {
    if (!isBuffer(b)) {
      return false;
    }
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b);
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], opts)) return false;
  }
  return true;
}

},{"./lib/is_arguments.js":99,"./lib/keys.js":100}],99:[function(require,module,exports){
var supportsArgumentsClass = (function(){
  return Object.prototype.toString.call(arguments)
})() == '[object Arguments]';

exports = module.exports = supportsArgumentsClass ? supported : unsupported;

exports.supported = supported;
function supported(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
};

exports.unsupported = unsupported;
function unsupported(object){
  return object &&
    typeof object == 'object' &&
    typeof object.length == 'number' &&
    Object.prototype.hasOwnProperty.call(object, 'callee') &&
    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
    false;
};

},{}],100:[function(require,module,exports){
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}

},{}],101:[function(require,module,exports){
var createSpec = require('spec-js'),
    Bindable = require('./bindable'),
    IdentifierToken = require('gel-js').IdentifierToken,
    jsonConverter = require('./jsonConverter'),
    createModelScope = require('./createModelScope'),
    WhatChanged = require('what-changed'),
    merge = require('merge'),
    resolvePath = require('./resolvePath');

var nextFrame;
function updateFrame() {
    while(nextFrame.length){
        var property = nextFrame.pop();
        if(property._bound){
            property.update(property.parent, property.value);
        }
        property._queuedForUpdate = false;
    }
    nextFrame = null;
}

function requestUpdate(property){
    if(!nextFrame){
        nextFrame = [];

        requestAnimationFrame(updateFrame);
    }


    if(!property._queuedForUpdate){
        nextFrame.push(property);
        property._queuedForUpdate = true;
    }
}

function getItemPath(item){
    var gedi = item.gaffa.gedi,
        paths = [],
        referencePath,
        referenceItem = item;

    while(referenceItem){

        // item.path should be a child ref after item.sourcePath
        if(referenceItem.path != null){
            paths.push(referenceItem.path);
        }

        // item.sourcePath is most root level path
        if(referenceItem.sourcePath != null){
            paths.push(gedi.paths.create(referenceItem.sourcePath));
        }

        referenceItem = referenceItem.parent;
    }

    return gedi.paths.resolve.apply(this, paths.reverse());
}

function updateProperty(property, firstUpdate){
    // Update immediately, reduces reflows,
    // as things like classes are added before
    //  the element is inserted into the DOM
    if(firstUpdate){
        property.update(property.parent, property.value);
    }

    if(!property._bound){
        return;
    }

    // Still run the _lastValue.update(),
    // because it sets up the state of the last value,
    // and it will be false anyway.

    if(property.hasChanged()){
        if(property.gaffa.debug){
            property.update(property.parent, property.value);
            return;
        }

        requestUpdate(property);
    }
}

function createPropertyCallback(property){
    return function (event) {

        var value,
            scope,
            valueTokens;

        scope = createModelScope(property.parent, event);

        if(event === true || event === false){ // Non-model update.

            valueTokens = property.get(scope, true);

        }else if(event.captureType === 'bubble' && property.ignoreBubbledEvents){

            return;

        }else if(property.binding){ // Model change update.

            if(property.ignoreTargets && event.target.match(property.ignoreTargets)){
                return;
            }

            valueTokens = property.get(scope, true);
        }

        if(valueTokens){
            var valueToken = valueTokens[valueTokens.length - 1];
            value = valueToken.result;
            property._sourcePathInfo = valueToken.sourcePathInfo;
        }

        property.value = value;

        // Call the properties update function, if it has one.
        // Only call if the changed value is an object, or if it actually changed.
        if(!property.update){
            return;
        }

        updateProperty(property, event === true);
    }
}


function Property(propertyDescription){
    if(typeof propertyDescription === 'function'){
        this.update = propertyDescription;
    }else{
        for(var key in propertyDescription){
            this[key] = propertyDescription[key];
        }
    }
}
Property = createSpec(Property, Bindable);
Property.prototype.watchChanges = 'value keys structure reference type';
Property.prototype.hasChanged = function(){
    var changes = this._lastValue.update(this.value),
        watched = this.watchChanges.split(' ');

    for(var i = 0; i < watched.length; i++){
        if(changes[watched[i]]){
            return true;
        }
    }
};
Property.prototype.set = function(value, isDirty, scope){
    if(!this._bound){
        this.value = value;
        return;
    }

    scope = merge(false, this.scope, scope);

    var gaffa = this.gaffa,
        dirty = isDirty;

    if(this.cleans != null){
        dirty = (this.cleans === 'string' ? gaffa.model.get(this.cleans, this) :  this.cleans) === false ;
    }

    if(this.binding){
        var setValue = this.setTransform ? gaffa.model.get(this.setTransform, this, merge(false, this.scope, {value: value})) : value;
        gaffa.model.set(
            this.binding,
            setValue,
            this,
            dirty,
            scope
        );
    }else{
        this.value = value;
        if(this.update && this.parent._bound){
            this.update(this.parent, value);
        }
    }

};
Property.prototype.get = function(scope, asTokens){
    if(!this._bound){
        return this.value;
    }

    scope = merge(false, this.scope, scope);

    if(this.binding){
        var value = this.gaffa.model.get(this.binding, this, scope, asTokens);
        if(this.getTransform){
            scope.value = asTokens ? value[value.length-1].result : value;
            return this.gaffa.model.get(this.getTransform, this, scope, asTokens);
        }
        return value;
    }else{
        return this.value;
    }
};
Property.prototype.bind = function(parent, scope) {
    this.scope = merge(false, scope, this.scope);

    Bindable.prototype.bind.apply(this, arguments);

    this._lastValue = new WhatChanged();

    // Shortcut for properties that have no binding.
    // This has a significant impact on performance.
    if(this.binding == null){
        if(this.update){
            this.update(parent, this.value);
        }
        return;
    }

    var propertyCallback = createPropertyCallback(this),
        parentPath = resolvePath(parent);

    this._currentBinding = [this.binding, propertyCallback, parentPath];
    this.gaffa.gedi.bind(this.binding, propertyCallback, parentPath);
    propertyCallback(true, scope);

    if(this.interval){
        function intervalUpdate(){
            if(!property._bound){
                return true;
            }
            propertyCallback(false, property.scope);
        }
        var property = this;
        if(!isNaN(this.interval)){
            function timeoutUpdate(){
                if(!intervalUpdate()){
                    setTimeout(timeoutUpdate,property.interval);
                }
            };
            timeoutUpdate();
        }else if(this.interval === 'frame'){
            function frameUpdate(){
                if(!intervalUpdate()){
                    requestAnimationFrame(frameUpdate);
                }
            };
            frameUpdate();
        }
    }
};
Property.prototype.debind = function(){
    if(this._currentBinding){
        this.gaffa.gedi.debind.apply(this.gaffa.gedi, this._currentBinding);
        this._currentBinding = null;
    }

    this._lastValue = null;

    Bindable.prototype.debind.call(this);
};
Property.prototype.__serialiseExclude__ = ['_lastValue'];

module.exports = Property;
},{"./bindable":53,"./createModelScope":55,"./jsonConverter":62,"./resolvePath":104,"gel-js":81,"merge":89,"spec-js":90,"what-changed":96}],102:[function(require,module,exports){
/*
 * raf.js
 * https://github.com/ngryman/raf.js
 *
 * original requestAnimationFrame polyfill by Erik Möller
 * inspired from paul_irish gist and post
 *
 * Copyright (c) 2013 ngryman
 * Licensed under the MIT license.
 */

var global = typeof window !== 'undefined' ? window : this;

var lastTime = 0,
    vendors = ['webkit', 'moz'],
    requestAnimationFrame = global.requestAnimationFrame,
    cancelAnimationFrame = global.cancelAnimationFrame,
    i = vendors.length;

// try to un-prefix existing raf
while (--i >= 0 && !requestAnimationFrame) {
    requestAnimationFrame = global[vendors[i] + 'RequestAnimationFrame'];
    cancelAnimationFrame = global[vendors[i] + 'CancelAnimationFrame'];
}

// polyfill with setTimeout fallback
// heavily inspired from @darius gist mod: https://gist.github.com/paulirish/1579671#comment-837945
if (!requestAnimationFrame || !cancelAnimationFrame) {
    requestAnimationFrame = function(callback) {
        var now = +Date.now(),
            nextTime = Math.max(lastTime + 16, now);
        return setTimeout(function() {
            callback(lastTime = nextTime);
        }, nextTime - now);
    };

    cancelAnimationFrame = clearTimeout;
}

if (!cancelAnimationFrame){
    global.cancelAnimationFrame = function(id) {
        clearTimeout(id);
    };
}

global.requestAnimationFrame = requestAnimationFrame;
global.cancelAnimationFrame = cancelAnimationFrame;

module.exports = {
    requestAnimationFrame: requestAnimationFrame,
    cancelAnimationFrame: cancelAnimationFrame
};
},{}],103:[function(require,module,exports){
function removeViews(views){
    if(!views){
        return;
    }

    views = views.slice ? views.slice() : [views];

    for(var i = 0; i < views.length; i++) {
        views[i].remove();
    }
}

module.exports = removeViews;
},{}],104:[function(require,module,exports){
module.exports = function resolvePath(viewItem){
    if(viewItem && viewItem.getPath){
        return viewItem.getPath();
    }
};
},{}],105:[function(require,module,exports){
var Property = require('./property'),
    statham = require('statham'),
    createSpec = require('spec-js');

function TemplaterProperty(){}
TemplaterProperty = createSpec(TemplaterProperty, Property);
TemplaterProperty.prototype.trackKeys = true;

function findValueIn(value, source){
    var isArray = Array.isArray(source);
    for(var key in source){
        if(isArray && isNaN(key)){
            continue;
        }
        if(source[key] === value){
            return key;
        }
    }
}

TemplaterProperty.prototype.watchChanges = 'keys';
TemplaterProperty.prototype.hasChanged = function(){
    var changes = this._lastValue.update(this.value),
        watched = this.watchChanges.split(' '),
        newKeys = [],
        keysChanged;

    if(!this._lastValue._lastKeys){
        this._lastValue._lastKeys = [];
    }

    if(this._sourcePathInfo && this._sourcePathInfo.subPaths){
        for(var key in this._sourcePathInfo.subPaths){
            newKeys.push(this._sourcePathInfo.subPaths[key]);
        }

        if(
            this._lastValue._lastKeys.length !== newKeys.length
        ){
            keysChanged = true;
        }else{
            for (var i = newKeys.length - 1; i >= 0; i--) {
                if(newKeys[i] !== this._lastValue._lastKeys[i]){
                    keysChanged = true;
                    break;
                }
            }
        }

        if(keysChanged){
            changes['keys'] = true;
        }
        this._lastValue._lastKeys = newKeys;
    }

    for(var i = 0; i < watched.length; i++){
        if(changes[watched[i]]){
            return true;
        }
    }
};
TemplaterProperty.prototype.update =function (viewModel, value) {
    if(!this.template){
        return;
    }
    this._templateCache || (this._templateCache = this.template && JSON.parse(statham.stringify(this.template)));
    this._emptyTemplateCache || (this._emptyTemplateCache = this.emptyTemplate && JSON.parse(statham.stringify(this.emptyTemplate)));
    var property = this,
        gaffa = this.gaffa,
        paths = gaffa.gedi.paths,
        viewsName = this.viewsName,
        childViews = viewModel.views[viewsName],
        sourcePathInfo = this._sourcePathInfo,
        viewsToRemove = childViews.slice(),
        isEmpty = true;

    childViews.abortDeferredAdd();

    if (value && typeof value === "object" && sourcePathInfo){

        if(!sourcePathInfo.subPaths){
            sourcePathInfo.subPaths = new value.constructor();

            for(var key in value){
                if(Array.isArray(value) && isNaN(key)){
                    continue;
                }
                sourcePathInfo.subPaths[key] = paths.append(sourcePathInfo.path, paths.create(key));
            }
        }

        var newView,
            itemIndex = 0;

        for(var i = 0; i < childViews.length; i++){

            var childSourcePath = childViews[i].sourcePath;

            if(!findValueIn(childSourcePath, sourcePathInfo.subPaths)){
                if(childViews[i].containerName === viewsName){
                    childViews[i].remove();
                    i--;
                }
            }
        }

        for(var key in sourcePathInfo.subPaths){
            if(Array.isArray(sourcePathInfo.subPaths) && isNaN(key)){
                continue;
            }
            isEmpty = false;
            var sourcePath = sourcePathInfo.subPaths[key],
                existingChild = null,
                existingIndex = null;

            for(var i = 0; i < childViews.length; i++){
                var child = childViews[i];

                if(child.sourcePath === sourcePath){
                    existingChild = child;
                    existingIndex = i;
                    break;
                }
            }

            if(!existingChild){
                newView = statham.revive(this._templateCache);
                newView.scope = {item: value[key], key: key};
                newView.sourcePath = property.ignorePaths ? null : sourcePath;
                newView.containerName = viewsName;
                childViews.deferredAdd(newView, itemIndex);
            }else if(itemIndex !== existingIndex){
                childViews.deferredAdd(existingChild, itemIndex);
            }

            itemIndex++;
        }
    }

    if(isEmpty){
        for(var i = 0; i < childViews.length; i++){
            if(childViews[i].containerName === viewsName){
                childViews[i].remove();
                i--;
            }
        }
        if(this._emptyTemplateCache){
            newView = gaffa.initialiseView(statham.revive(this._emptyTemplateCache));
            newView.containerName = viewsName;
            childViews.add(newView, itemIndex);
        }
    }
};

module.exports = TemplaterProperty;
},{"./property":101,"spec-js":90,"statham":94}],106:[function(require,module,exports){
/**
    ## View

    A base constructor for gaffa Views that have content view.

    All Views that inherit from ContainerView will have:

        someView.views.content
*/

var createSpec = require('spec-js'),
    doc = require('doc-js'),
    crel = require('crel'),
    laidout = require('laidout'),
    ViewItem = require('./viewItem'),
    Property = require('./property'),
    createModelScope = require('./createModelScope'),
    getClosestItem = require('./getClosestItem'),
    Consuela = require('consuela'),
    Behaviour = require('./behaviour');

function insertFunction(selector, renderedElement, insertIndex){
    var target = ((typeof selector === "string") ? document.querySelectorAll(selector)[0] : selector),
        referenceSibling;

    if(target && target.childNodes){
        referenceSibling = target.childNodes[insertIndex];
    }
    if (referenceSibling){
        target.insertBefore(renderedElement, referenceSibling);
    }  else {
        target.appendChild(renderedElement);
    }
}

function langify(fn, context){
    return function(scope, args){
        var args = args.all();

        return fn.apply(context, args);
    }
}

function createEventedActionScope(view, event){
    var scope = createModelScope(view);

    scope.event = {
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        which: event.which,
        target: event.target,
        targetViewItem: getClosestItem(event.target),
        preventDefault: langify(event.preventDefault, event),
        stopPropagation: langify(event.stopPropagation, event)
    };

    return scope;
}

function bindViewEvent(view, eventName){
    return view.gaffa.events.on(eventName, view.renderedElement, function (event) {
        view.triggerActions(eventName, createEventedActionScope(view, event), event);
    });
}

function View(viewDescription){
    var view = this;

    view.behaviours = view.behaviours || [];
    this.consuela = new Consuela();
}
View = createSpec(View, ViewItem);

View.prototype.bind = function(parent, scope){
    ViewItem.prototype.bind.apply(this, arguments);

    for(var key in this){
        if(crel.isElement(this[key])){
            this.consuela.watch(this[key]);
        }
    }

    for(var key in this.actions){
        var actions = this.actions[key],
            off;

        if(actions._bound){
            continue;
        }

        actions._bound = true;

        bindViewEvent(this, key);
    }

    this.triggerActions('load');

    for(var i = 0; i < this.behaviours.length; i++){
        Behaviour.prototype.bind.call(this.behaviours[i], this, scope);
        if(this.behaviours[i].bind !== Behaviour.prototype.bind){
            this.behaviours[i].bind(this, scope);
        }
    }
};

View.prototype.detach = function(){
    this.renderedElement && this.renderedElement.parentNode && this.renderedElement.parentNode.removeChild(this.renderedElement);
};

View.prototype.remove = function(){
    this.detach();
    ViewItem.prototype.remove.call(this);
}

View.prototype.debind = function () {
    if(!this._bound){
        return;
    }
    this.triggerActions('unload');

    this.consuela.cleanup();

    for(var key in this.actions){
        this.actions[key]._bound = false;
    }
    ViewItem.prototype.debind.call(this);
};

View.prototype.destroy = function() {
    ViewItem.prototype.destroy.call(this);

    for(var key in this){
        if(crel.isElement(this[key])){
            this[key] = null;
        }
    }
};

View.prototype.render = function(){};

function insert(view, viewContainer, insertIndex){
    var gaffa = view.gaffa,
        renderTarget = view.insertSelector || view.renderTarget || viewContainer && viewContainer.element || gaffa.views.renderTarget;

    if(view.afterInsert){
        laidout(view.renderedElement, function(){
            view.afterInsert();
        });
    }

    if(viewContainer.indexOf(view) !== insertIndex){
        viewContainer.splice(insertIndex, 1, view);
    }

    view.insertFunction(view.insertSelector || renderTarget, view.renderedElement, insertIndex);
}

View.prototype.insert = function(viewContainer, insertIndex){
    insert(this, viewContainer, insertIndex);
};

function Classes(){};
Classes = createSpec(Classes, Property);
Classes.prototype.update = function(view, value){
    doc.removeClass(view.renderedElement, this._previousClasses);
    this._previousClasses = value;
    doc.addClass(view.renderedElement, value);
};
View.prototype.classes = new Classes();

function Visible(){};
Visible = createSpec(Visible, Property);
Visible.prototype.value = true;
Visible.prototype.update = function(view, value) {
    view.renderedElement.style.display = value ? '' : 'none';
};
View.prototype.visible = new Visible();

function Enabled(){};
Enabled = createSpec(Enabled, Property);
Enabled.prototype.value = true;
Enabled.prototype.update = function(view, value) {
    if(!value === !!view.renderedElement.getAttribute('disabled')){
        return;
    }
    view.renderedElement[!value ? 'setAttribute' : 'removeAttribute']('disabled','disabled');
};
View.prototype.enabled = new Enabled();

function Title(){};
Title = createSpec(Title, Property);
Title.prototype.update = function(view, value) {
    view.renderedElement[value ? 'setAttribute' : 'removeAttribute']('title',value);
};
View.prototype.title = new Title();

View.prototype.insertFunction = insertFunction;

module.exports = View;
},{"./behaviour":52,"./createModelScope":55,"./getClosestItem":57,"./property":101,"./viewItem":108,"consuela":64,"crel":65,"doc-js":68,"laidout":86,"spec-js":90}],107:[function(require,module,exports){
var createSpec = require('spec-js'),
    Bindable = require('./bindable'),
    View = require('./view'),
    initialiseViewItem = require('./initialiseViewItem'),
    removeViews = require('./removeViews'),
    arrayProto = Array.prototype;

function ViewContainer(viewContainerDescription){
    Bindable.call(this);
    var viewContainer = this;

    this._deferredViews = [];

    if(viewContainerDescription instanceof Array){
        viewContainer.add(viewContainerDescription);
    }
}
ViewContainer = createSpec(ViewContainer, Array);
for(var key in Bindable.prototype){
    ViewContainer.prototype[key] = Bindable.prototype[key];
}
ViewContainer.prototype.constructor = ViewContainer;
ViewContainer.prototype._render = true;
ViewContainer.prototype.bind = function(parent){
    Bindable.prototype.bind.apply(this, arguments);

    for(var i = 0; i < this.length; i++){
        this.add(this[i], i);
    }

    return this;
};
ViewContainer.prototype.debind = function(){
    for (var i = 0; i < this.length; i++) {
        this[i].detach();
    }
    Bindable.prototype.debind.call(this);
};
ViewContainer.prototype.getPath = function(){
    return getItemPath(this);
};

/*
    ViewContainers handle their own array state.
    A View that is added to a ViewContainer will
    be automatically removed from its current
    container, if it has one.
*/
ViewContainer.prototype.add = function(view, insertIndex){
    // If passed an array
    if(Array.isArray(view)){
        // Clone the array so splicing can't cause issues
        var views = view.slice();
        for(var i = 0; i < view.length; i++){
            this.add(view[i]);
        }
        return this;
    }

    if(view.parentContainer !== this || this.indexOf(view) !== insertIndex){
        if(view.parentContainer instanceof ViewContainer){
            view.parentContainer.splice(view.parentContainer.indexOf(view),1);
        }

        this.splice(insertIndex >= 0 ? insertIndex : this.length,0,view);
    }

    view.parentContainer = this;

    if(this._bound && this._render){
        if(!(view instanceof View)){
            view = this[this.indexOf(view)] = this.gaffa.initialiseView(view);
        }
        if(view._bound){
            return;
        }

        view.gaffa = this.parent.gaffa;

        if(!view.renderedElement){
            view.render();
            if(view.gaffa.debug && !(view.gaffa.browser.msie && view.gaffa.browser.version <9)){
                view.renderedElement.viewModel = view;
            }
        }
        view.bind(this.parent, this.parent.scope);
        view.insert(this, insertIndex);
    }

    return view;
};

/*
    adds 10 (10 is arbitrary) views at a time to the target viewContainer,
    then queues up another add.
*/
function executeDeferredAdd(viewContainer){
    var currentOpperation = viewContainer._deferredViews.splice(0,10);

    if(!currentOpperation.length){
        return;
    }

    for (var i = 0; i < currentOpperation.length; i++) {
        viewContainer.add(currentOpperation[i][0], currentOpperation[i][1]);
    };
    requestAnimationFrame(function(time){
        executeDeferredAdd(viewContainer);
    });
}

/*
    Adds children to the view container over time, via RAF.
    Will only begin the render cycle if there are no _deferredViews,
    because if _deferredViews.length is > 0, the render loop will
    already be going.
*/
ViewContainer.prototype.deferredAdd = function(view, insertIndex){
    var viewContainer = this,
        shouldStart = !this._deferredViews.length;

    this._deferredViews.push([view, insertIndex]);

    if(shouldStart){
        requestAnimationFrame(function(){
            executeDeferredAdd(viewContainer);
        });
    }
};

ViewContainer.prototype.abortDeferredAdd = function(){
    this._deferredViews = [];
};
ViewContainer.prototype.render = function(){
    this._render = true;
    for(var i = 0; i < this.length; i++){
        this.deferredAdd(this[i], i);
    }
};
ViewContainer.prototype.derender = function(){
    this._render = false;
    for(var i = 0; i < this.length; i++){
        var childView = this[i];

        if(childView._bound){
            childView.detach();
            childView.debind();
        }
    }
};
ViewContainer.prototype.remove = function(view){
    view.remove();
};
ViewContainer.prototype.empty = function(){
    removeViews(this);
};
ViewContainer.prototype.__serialiseExclude__ = ['element'];

module.exports = ViewContainer;
},{"./bindable":53,"./initialiseViewItem":61,"./removeViews":103,"./view":106,"spec-js":90}],108:[function(require,module,exports){
var createSpec = require('spec-js'),
    Bindable = require('./bindable'),
    jsonConverter = require('./jsonConverter'),
    Property = require('./property'),
    merge = require('merge');

function copyProperties(source, target){
    if(
        !source || typeof source !== 'object' ||
        !target || typeof target !== 'object'
    ){
        return;
    }

    for(var key in source){
        if(source.hasOwnProperty(key)){
            target[key] = source[key];
        }
    }
}

function inflateViewItem(viewItem, description){
    var ViewContainer = require('./viewContainer');

    for(var key in viewItem){
        if(viewItem[key] instanceof Property){
            viewItem[key] = new viewItem[key].constructor(viewItem[key]);
        }
    }

    /**
        ## .actions

        All ViewItems have an actions object which can be overriden.

        The actions object looks like this:

            viewItem.actions = {
                click: [action1, action2],
                hover: [action3, action4]
            }

        eg:

            // Some ViewItems
            var someButton = new views.button(),
                removeItem = new actions.remove();

            // Set removeItem as a child of someButton.
            someButton.actions.click = [removeItem];

        If a Views action.[name] matches a DOM event name, it will be automatically _bound.

            myView.actions.click = [
                // actions to trigger when a 'click' event is raised by the views renderedElement
            ];
    */
    viewItem.actions = viewItem.actions ? clone(viewItem.actions) : {};

    for(var key in description){
        var prop = viewItem[key];
        if(prop instanceof Property || prop instanceof ViewContainer){
            copyProperties(description[key], prop);
        }else{
            viewItem[key] = description[key];
        }
    }
}

/**
    ## ViewItem

    The base constructor for all gaffa ViewItems.

    Views, Behaviours, and Actions inherrit from ViewItem.
*/
function ViewItem(viewItemDescription){
    inflateViewItem(this, viewItemDescription);
}
ViewItem = createSpec(ViewItem, Bindable);

    /**
        ## .path

        the base path for a viewItem.

        Any bindings on a ViewItem will recursivly resolve through the ViewItems parent's paths.

        Eg:

            // Some ViewItems
            var viewItem1 = new views.button(),
                viewItem2 = new actions.set();

            // Give viewItem1 a path.
            viewItem1.path = '[things]';
            // Set viewItem2 as a child of viewItem1.
            viewItem1.actions.click = [viewItem2];

            // Give viewItem2 a path.
            viewItem2.path = '[stuff]';
            // Set viewItem2s target binding.
            viewItem2.target.binding = '[majigger]';

        viewItem2.target.binding will resolve to:

            '[/things/stuff/majigger]'
    */
ViewItem.prototype.path = '[]';
ViewItem.prototype.bind = function(parent, scope){

    var viewItem = this,
        property;

    this.scope = merge(false, scope, this.scope);

    Bindable.prototype.bind.apply(this, arguments);

    // Only set up properties that were on the prototype.
    // Faster and 'safer'
    for(var propertyKey in this.constructor.prototype){
        property = this[propertyKey];
        if(property instanceof Property){
            property.bind(this, this.scope);
        }
    }

    // Create item scope
};
ViewItem.prototype.remove = function(){
    if(this.parentContainer){
        var index = this.parentContainer.indexOf(this);
        if(index >= 0){
            this.parentContainer.splice(index, 1);
        }
        this.parentContainer = null;
    }

    this.emit('remove');

    this.debind();

    this.destroy();
};
ViewItem.prototype.triggerActions = function(actionName, scope, event){
    if(!this._bound){
        return;
    }
    scope = merge(false, this.scope, scope);
    this.gaffa.actions.trigger(this.actions[actionName], this, scope, event);
};

module.exports = ViewItem;
},{"./bindable":53,"./jsonConverter":62,"./property":101,"./viewContainer":107,"merge":89,"spec-js":90}],109:[function(require,module,exports){
module.exports = function(gel){
    gel.scope.url = function(scope, args){
        return window.location.toString();
    };
    gel.scope.url.hostname = function(scope, args){
        return window.location.hostname.toString();
    };
    gel.scope.url.pathname = function(scope, args){
        return window.location.pathname.toString();
    };
    gel.scope.url.query = function(scope, args){
        var searchParts = window.location.search.slice(1).split('&'),
            searchPair,
            query = {};

        for(var i = 0; i < searchParts.length; i++) {
            searchPair = searchParts[0].split('=');
            query[searchPair[0]] = searchPair[1];
        }

        return query;
    };
    gel.scope.url.hash = function(scope, args){
        return window.location.hash.split('#').pop();
    };
};
},{}],110:[function(require,module,exports){
module.exports = function intersect(arrayA, arrayB, intersector){
    var results = [];

    function innerCheck(aItem){
        for (var i = 0; i < arrayB.length; i++) {
            if(
                (intersector && intersector(aItem, arrayB[i])) ||
                (!intersector && aItem === arrayB[i])
            ){
                results.push(aItem);
            }
        }
    }

    for (var i = 0; i < arrayA.length; i++) {
        innerCheck(arrayA[i]);
    }

    return results;
};
},{}],111:[function(require,module,exports){
var intersect = require('./intersect'),
    arrayProto = [],
    absolutePath = /^.+?\:\/\//g,
    formatRegex = /\{.*?\}/g,
    keysRegex = /\{(.*?)\}/g,
    nonNameKey = /^_(.*)$/,
    sanitiseRegex = /[#-.\[\]-^?]/g;

function sanitise(string){
    return string.replace(sanitiseRegex, '\\$&');
}

function formatString(string, values) {
    values || (values = {});

    return string.replace(/{(.+?)}/g, function (match, number) {
        return (values[number] === undefined || values[number] === null) ? '' : values[number];
    });
}

function resolve(rootPath, path){
    if(!path){
        return rootPath;
    }
    if(path.match(absolutePath)){
        return path;
    }
    return rootPath + path;
}

function Router(routes){
    this.basePath  = window.location.protocol + '//' + window.location.host;
    this.routes = routes;
    this.homeRoute = 'home';
}

function scanRoutes(routes, fn){
    var route,
        routeKey,
        result;

    for(var key in routes){
        if(key.charAt(0) === '_'){
            continue;
        }

        // Scan children first
        result = scanRoutes(routes[key], fn);
        if(result != null){
            return result;
        }
        // Scan current route
        result = fn(routes[key], key);
        if(result != null){
            return result;
        }
    }
}

Router.prototype.details = function(url){
    var router = this;

    if(url == null){
        url = window.location.href;
    }

    return scanRoutes(this.routes, function(route, routeName){
        var urls = Array.isArray(route._url) ? route._url : [route._url],
            bestMatch,
            mostMatches = 0;

        for(var i = 0; i < urls.length; i++){
            var routeKey = router.resolve(router.basePath, urls[i]),
                match = url.match('^' + sanitise(routeKey).replace(formatRegex, '(.*?)') + '$');

            if(match && match.length > mostMatches){
                mostMatches = match.length;
                bestMatch = routeKey;
            }
        }

        if(!bestMatch){
            return;
        }

        return {
            path: url,
            name: routeName,
            template: bestMatch
        };
    });
};

Router.prototype.info = function(name){
    var router = this;

    return scanRoutes(this.routes, function(route, routeName){
        if(routeName !== name){
            return;
        }

        var info = {
            name: routeName
        };

        for(var key in route){
            var keyNameMatch = key.match(nonNameKey);
            if(keyNameMatch){
                info[keyNameMatch[1]] = route[key];
            }
        }

        return info;
    });
};

Router.prototype.find = function(url){
    var details = this.details(url);

    return details && details.name;
};

Router.prototype.upOneName = function(name){
    if(!name){
        return;
    }

    return scanRoutes(this.routes, function(route, routeName){
        if(name in route){
            return routeName;
        }
    }) || this.homeRoute;
};

Router.prototype.upOne = function(path){
    if(path === undefined){
        path = window.location.href;
    }

    return this.drill(path, this.upOneName(this.find(path)));
};

function cleanTokens(token){
    return token.slice(1,-1);
}

Router.prototype.getRouteTemplate = function(name, values){
    var keys = values && typeof values === 'object' && Object.keys(values) || [];
        routeTemplate = scanRoutes(this.routes, function(route, routeName){
        if(name === routeName){
            var result = {
                route: route
            };

            if(!Array.isArray(route._url)){
                result.template = route._url;
                return result;
            }

            var urlsByDistance = route._url.slice().sort(function(urlA, urlB){
                var keysA = (urlA.match(keysRegex) || []).map(cleanTokens),
                    keysB = (urlB.match(keysRegex) || []).map(cleanTokens),
                    commonAKeys = intersect(keysA, keys),
                    commonBKeys = intersect(keysB, keys),
                    aDistance = Math.abs(commonAKeys.length - keys.length),
                    bDistance = Math.abs(commonBKeys.length - keys.length);

                return aDistance - bDistance;
            });

            result.template = urlsByDistance[0] || route._url[0];

            return result;
        }
    });

    if(!routeTemplate){
        return;
    }

    routeTemplate.template = this.resolve(this.basePath, routeTemplate.template);

    return routeTemplate;
};

Router.prototype.getTemplate = function(name, values){
    return this.getRouteTemplate(name, values).template;
};

Router.prototype.get = function(name, values){
    var routeTemplate = this.getRouteTemplate(name, values);

    if(!routeTemplate){
        return null;
    }

    values || (values = {});

    if(routeTemplate.route._defaults){
        for(var key in routeTemplate.route._defaults){
            var defaultValue = routeTemplate.route._defaults[key];
            if(typeof defaultValue === 'function'){
                defaultValue = defaultValue();
            }
            values[key] || (values[key] = defaultValue);
        }
    }

    return formatString(routeTemplate.template, values);
};

Router.prototype.isIn = function(childName, parentName){
    var currentRoute = childName,
        lastRoute;

    while(currentRoute !== lastRoute && currentRoute !== parentName){
        lastRoute = currentRoute;
        currentRoute = this.upOneName(currentRoute);
    }

    return currentRoute === parentName;
};

Router.prototype.isRoot = function(name){
    return name in this.routes;
};

Router.prototype.values = function(path){
    var details = this.details.apply(this, arguments),
        result = {},
        keys,
        values;

    if(details == null || details.template == null){
        return;
    }

    keys = details.template.match(keysRegex);
    values = details.path.match('^' + sanitise(details.template).replace(formatRegex, '(.*?)') + '$');

    if(keys && values){
        keys = keys.map(function(key){
            return key.slice(1,-1);
        });
        values = values.slice(1);
        for(var i = 0; i < keys.length; i++){
            result[keys[i]] = values[i];
        }
    }

    return result;
};

Router.prototype.drill = function(path, route, newValues){
    if(path == null){
        path = window.location.href;
    }


    var getArguments = this.values(path);

    if(newValues){
        for(var key in newValues){
            getArguments[key] = newValues[key];
        }
    }

    return this.get(route, getArguments);
};

Router.prototype.resolve = resolve;

module.exports = Router;
},{"./intersect":110}],112:[function(require,module,exports){
module.exports=require(91)
},{}],113:[function(require,module,exports){
module.exports=require(92)
},{"./revive":114}],114:[function(require,module,exports){
module.exports=require(93)
},{"./createKey":112}],115:[function(require,module,exports){
module.exports=require(94)
},{"./parse":113,"./revive":114,"./stringify":116}],116:[function(require,module,exports){
module.exports=require(95)
},{"./createKey":112}],117:[function(require,module,exports){
var cache = {};

function venfix(property, target){
    var bodyStyle = document.body.style;

    if(!target && cache[property]){
        return cache[property];
    }

    target = target || bodyStyle;

    var props = [];

    for(var key in target){
        props.push(key);
    }

    if(property in target){
        return property;
    }

    var propertyRegex = new RegExp('^(' + venfix.prefixes.join('|') + ')' + property + '$', 'i');

    for(var i = 0; i < props.length; i++) {
        if(props[i].match(propertyRegex)){
            if(target === bodyStyle){
                cache[property] = props[i]
            }
            return props[i];
        }
    }
}

// Add extensibility
venfix.prefixes = ['webkit', 'moz', 'ms', 'o'];

module.exports = venfix;
},{}],118:[function(require,module,exports){
module.exports = {
    Navigate : require('gaffa-navigate'),
    Set : require('gaffa-set'),
    Push : require('gaffa-push'),
    Concat : require('gaffa-concat'),
    Remove : require('gaffa-remove'),
    Toggle : require('gaffa-toggle'),
    Switch : require('gaffa-switch'),
    Ajax : require('gaffa-ajax'),

    // custom
    Back: require('./gaffaExtensions/actions/back')
};
},{"./gaffaExtensions/actions/back":125,"gaffa-ajax":23,"gaffa-concat":26,"gaffa-navigate":36,"gaffa-push":38,"gaffa-remove":39,"gaffa-set":40,"gaffa-switch":41,"gaffa-toggle":50}],119:[function(require,module,exports){
var app = {},
    Gaffa = require('gaffa'),
    gaffa = new Gaffa(),
    views = app.views = require('./views'),
    actions = app.actions = require('./actions'),
    behaviours = app.behaviours = require('./behaviours');

for(var key in views){
    gaffa.registerConstructor(views[key]);
}

for(var key in actions){
    gaffa.registerConstructor(actions[key]);
}

for(var key in behaviours){
    gaffa.registerConstructor(behaviours[key]);
}

app.gaffa = gaffa;

module.exports = app;
},{"./actions":118,"./behaviours":120,"./views":136,"gaffa":56}],120:[function(require,module,exports){
module.exports = {
    PageLoad : require('gaffa-page-load'),
    ModelChange : require('gaffa-model-change')
};
},{"gaffa-model-change":35,"gaffa-page-load":37}],121:[function(require,module,exports){
module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createAppBody(){
        var appBody = new views.Frame();

        appBody.classes.value = 'appBody';
        appBody.url.binding = '(router.get "page" [/route])';

        return appBody;
    }

    return createAppBody();

};
},{}],122:[function(require,module,exports){
module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createAppWrapper(){
        var wrapper = new views.Container();

        wrapper.views.content.add([
            require('./header')(app),
            require('../controls/mainMenu')(app),
            require('./appBody')(app)
        ]);

        return wrapper;
    }

    return createAppWrapper();

};
},{"../controls/mainMenu":124,"./appBody":121,"./header":123}],123:[function(require,module,exports){
module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createHeader(){
        var header = new views.Container(),
            actionRegion = new views.Container(),
            contextRegion = new views.Container(),
            isHomeAction = new actions.Switch(),
            back = new actions.Back(),
            toggleMenu = new actions.Toggle(),
            logo = new views.Image(),
            title = new views.Heading();

        title.text.value = 'My awesome app';
        logo.source.value = 'images/logo.png';

        header.classes.value = 'header';

        contextRegion.classes.binding = '(join " " "contextRegion" (? (== [currentPage] "home") "menu" "back"))';

        isHomeAction["switch"].binding = '[currentPage]';
        isHomeAction.actions.home = [toggleMenu];
        isHomeAction.actions["default"] = [back];

        toggleMenu.target.binding = '[showMainMenu]';

        actionRegion.classes.value = 'actionRegion';
        actionRegion.views.content.add([
            contextRegion,
            logo,
            title
        ]);
        actionRegion.actions.click = [isHomeAction];

        header.views.content.add([
            actionRegion
        ]);

        return header;
    }

    return createHeader();

};
},{}],124:[function(require,module,exports){
module.exports = function(app){
    var views = app.views,
        actions = app.actions,
        behaviours = app.behaviours;

    function createMenuItem(labelSettings, href){
        var menuItem = new views[href ? 'Anchor' : 'Button']({
                text: labelSettings
            }),
            closeMenu = new actions.Set();

        closeMenu.source.value = false;
        closeMenu.target.binding = '[showMainMenu]';

        menuItem.actions.click = [closeMenu];
        menuItem.classes.value = 'menuItem';

        if(href){
            menuItem.href.binding = href.binding;
            menuItem.href.value = href.value;
        }

        return menuItem;
    }

    function createNavItem(labelSettings, page){
        var navItem = createMenuItem(labelSettings, {
                binding: '(router.get "' + page + '")'
            });

        navItem.classes.binding = '(join " " "menuItem" (? (router.isIn [currentPage] "' + page + '") "current" ""))';

        return navItem;
    }

    function createMenu(){
        var menu = new views.Showable();

        menu.show.binding = '[showMainMenu]';
        menu.views.content.add([
            createNavItem({value:'Something'}, 'something')
        ]);

        return menu;
    }

    return createMenu();

};
},{}],125:[function(require,module,exports){
var Gaffa = require('gaffa');

function Back(){
}
Back = Gaffa.createSpec(Back, Gaffa.Action);

Back.prototype.type = 'back';
Back.prototype.trigger = function(){
    window.history.back();
};

module.exports = Back;
},{"gaffa":56}],126:[function(require,module,exports){
var OldAnchor = require('gaffa-anchor'),
    crel = require('crel'),
    Gaffa = require('gaffa');

function Anchor(){}
Anchor = Gaffa.createSpec(Anchor, OldAnchor);
Anchor.prototype.render = function(){
    var textNode = document.createTextNode(''),
        renderedElement = crel('a',textNode),
        view = this;

    this.views.content.element = renderedElement;

    this.renderedElement = renderedElement;

    this.text.textNode = textNode;

    if(!this.external){
        // Prevent default click action reguardless of gaffa.event implementation
        renderedElement.onclick = function(event){
            if(event.button === 1){
                event.preventDefault();
            }
        };

        this.gaffa.events.on('click', renderedElement, function(event){
            if(event.button === 1){

                // Custom app-specific routing.
                view.gaffa.model.set('[/route]', {
                    name: view.gaffa.gedi.get('(router.find href)', {href: view.href.value}),
                    values: view.gaffa.gedi.get('(router.values href)', {href: view.href.value})
                });
            }
        });
    }
};
Anchor.prototype.route = new Gaffa.Property(function(view, value){
    view.href.set(view.gaffa.gedi.get('(router.get route.name route.values)', {
        route: value
    }));
});

module.exports = Anchor;
},{"crel":11,"gaffa":56,"gaffa-anchor":24}],127:[function(require,module,exports){
var Gaffa = require('gaffa'),
    Flap = require('flaps'),
    crel = require('crel'),
    venfix = require('venfix'),
    doc = require('doc-js');

function Showable(){
}
Showable = Gaffa.createSpec(Showable, Gaffa.ContainerView);

Showable.prototype.type = 'showable';
Showable.prototype.show = new Gaffa.Property({
    update:function(view, value){
        if(value){
            view.flap.open();
        }else{
            view.flap.close();
        }
    },
    value:false
});
Showable.delegateTarget = 'body';
Showable.prototype.render = function(){
    var view = this,
        modal,
        content,
        mask,
        renderedElement = crel('div', {'class':'showableWrapper'},
            content = crel('div', {'class':'showable'}),
            mask = crel('div', {'class':'mask'})
        ),
        flap = new Flap(renderedElement);

    flap.width = 280;
    flap.delegateTarget = this.delegateTarget;
    flap.on('settle', function(){
        view.show.set(flap.state === 'open');
        if(flap.state === 'open'){
            mask.style.display = null;
        }else{
            mask.style.display = 'none';
        }
    });
    flap.on('move', function(){
        mask.style.opacity = this.percentOpen() / 100;
    });
    flap.on('ready', function(){
        setTimeout(resize,300);
    });

    this.flap = flap;

    this.views.content.element = content;

    this.renderedElement = renderedElement;

    function resize(){
        if(window.innerWidth >= 600){
            flap.disable();
        }else{
            flap.enable();
        }
    }

    window.addEventListener('resize', resize);
};

module.exports = Showable;
},{"crel":11,"doc-js":13,"flaps":17,"gaffa":56,"venfix":117}],128:[function(require,module,exports){
module.exports = function(app){
    require('gel-url')(app.gaffa.gedi.gel);

    app.gaffa.gedi.gel.scope.router = {
        get: function(scope, args){
            return app.router.get.apply(app.router, args.all());
        },
        find: function(scope, args){
            return app.router.find.apply(app.router, args.all());
        },
        upOne: function(scope, args){
            return app.router.upOne.apply(app.router, args.all());
        },
        isIn: function(scope, args){
            return app.router.isIn.apply(app.router, args.all());
        },
        values: function(scope, args){
            return app.router.values.apply(app.router, args.all());
        },
        drill: function(scope, args){
            return app.router.drill.apply(app.router, args.all());
        },
        to: function(scope, args){
            var newArgs = args.all();
            newArgs.unshift(null);
            return app.router.drill.apply(app.router, newArgs);
        }
    };
};
},{"gel-url":109}],129:[function(require,module,exports){
require('./polyfills');

var Gaffa = require('gaffa'),
    app = require('./app'),
    gaffa = app.gaffa,
    router = require('./router'),
    url = require('url');

// Debugging
window.gaffa = app.gaffa;

// A custom router
router();

// Add extra gel functions
require('./gelExtensions')(app);

window.addEventListener('load', function(){

    // Add views to gaffa
    gaffa.views.add([
        require('./controls/appWrapper')(app)
    ]);
});
},{"./app":119,"./controls/appWrapper":122,"./gelExtensions":128,"./polyfills":131,"./router":134,"gaffa":56,"url":10}],130:[function(require,module,exports){
document.defaultView = window;
},{}],131:[function(require,module,exports){
require('./validation');
require('./computedStyle');
require('./textContent');
},{"./computedStyle":130,"./textContent":132,"./validation":133}],132:[function(require,module,exports){
if (Object.defineProperty && Object.getOwnPropertyDescriptor && Object.getOwnPropertyDescriptor(Element.prototype, "textContent") && !Object.getOwnPropertyDescriptor(Element.prototype, "textContent").get) {
    var elementInnerText = Object.getOwnPropertyDescriptor(Element.prototype, "innerText");
    Object.defineProperty(Element.prototype, "textContent",
        {
            get: function() {
                return elementInnerText.get.call(this);
            },
            set: function(string) {
                return elementInnerText.set.call(this, string);
            }
        }
    );

    var TextNode = document.createTextNode('').constructor;
    Object.defineProperty(TextNode.prototype, "textContent",
        {
            get: function() {
                return this.data;
            },
            set: function(string) {
                return this.data = string;
            }
        }
    );
}
},{}],133:[function(require,module,exports){
var Node = window.Node || window.Element;

Node.prototype.setCustomValidity || (Node.prototype.setCustomValidity = function(){

});

Node.prototype.validity || (Node.prototype.validity = {});
},{}],134:[function(require,module,exports){
var Router = require('route-tree'),
    routes = require('./routes');

module.exports = function(){
    var app = require('../app'),
        router = new Router(routes);
    router.basePath = window.location.href.match(/(^[^?#]*)\/.*$/)[1];

    function updateRoute(){
        app.gaffa.model.set('[route/name]', router.find());
        app.gaffa.model.set('[route/values]', router.values());
    }

    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('load', updateRoute);

    app.gaffa.gedi.bind('[route]', function(event){
        var route = event.getValue();

        if(!route){
            return;
        }

        var href = router.get(route.name, route.values);

        if(!href){
            console.error('No route was found named "' + route.name + '"');
            return;
        }

        if(href !== window.location.href){
            window.location.hash = href.slice(href.indexOf('#'));
        }
    });

    app.router = router;


    return router;
};

},{"../app":119,"./routes":135,"route-tree":111}],135:[function(require,module,exports){
module.exports = {
    home:{
        _url: ['/', ''],
        something: {
            _url: '/#something'
        }
    },
    page: {
        _url: '/build/pages/{name}.json'
    }
};
},{}],136:[function(require,module,exports){
module.exports = {
    Container : require('gaffa-container'),
    Heading : require('gaffa-heading'),
    List : require('gaffa-list'),
    Form : require('gaffa-form'),
    Label : require('gaffa-label'),
    Text : require('gaffa-text'),
    Button : require('gaffa-button'),
    Image : require('gaffa-image'),
    Html : require('gaffa-html'),
    Textbox : require('gaffa-textbox'),
    Frame : require('gaffa-frame'),

    // --- custom

    Showable: require('./gaffaExtensions/views/showable'),
    Anchor: require('./gaffaExtensions/views/anchor')

};
},{"./gaffaExtensions/views/anchor":126,"./gaffaExtensions/views/showable":127,"gaffa-button":25,"gaffa-container":27,"gaffa-form":28,"gaffa-frame":29,"gaffa-heading":30,"gaffa-html":31,"gaffa-image":32,"gaffa-label":33,"gaffa-list":34,"gaffa-text":42,"gaffa-textbox":49}]},{},[129])