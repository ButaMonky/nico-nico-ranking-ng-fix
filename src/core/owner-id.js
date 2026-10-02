
  // BRUSH-012A: one place that parses user/channel IDs without rounding.
  // A string is validated as decimal digits first and never passes through
  // Number before that, so "9007199254740993" cannot become ...992.
  // Inside the safe integer range IDs stay numbers, exactly as stored today.
  var OwnerId = (function() {
    const maxSafe = '9007199254740991'
    // Canonical decimal string of a positive ID, or null. Leading zeros are
    // dropped ("000123" -> "123"); "0", signs, fractions, exponents, spaces
    // inside, empty values and non-integral numbers are rejected.
    function canonical(value) {
      if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null
      if (typeof value === 'bigint') return value > 0n ? value.toString() : null
      if (typeof value !== 'string') return null
      const text = value.trim()
      if (!/^[0-9]+$/.test(text)) return null
      const digits = text.replace(/^0+/,'')
      return digits ? digits : null
    }
    function isSafeDigits(digits) {
      return digits.length < maxSafe.length || (digits.length === maxSafe.length && digits <= maxSafe)
    }
    // The ID as a safe integer number, or null when absent, invalid or beyond
    // Number.MAX_SAFE_INTEGER (such IDs are never rounded into another ID).
    function safe(value) {
      const digits = canonical(value)
      return digits !== null && isSafeDigits(digits) ? Number(digits) : null
    }
    function same(a, b) {
      const left = canonical(a)
      return left !== null && left === canonical(b)
    }
    // User icon CDN bucket: floor(id / 10000) computed on the digits.
    function bucket(value) {
      const digits = canonical(value)
      if (digits === null) return null
      return digits.length > 4 ? digits.slice(0,-4) : '0'
    }
    return {canonical, safe, same, bucket, isSafeDigits}
  })()
