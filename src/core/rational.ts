/*Copyright 2015-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

// Parses an integer string. Accepts surrounding whitespace, a sign, and exponent notation
// such as "1e3", which BigInt() rejects.
function parseInteger(s: string): bigint {
    const exponent = /^\s*([+-]?\d+)[eE]\+?(\d+)\s*$/.exec(s)
    if (exponent) {
        return BigInt(exponent[1]) * 10n ** BigInt(exponent[2])
    }
    return BigInt(s)
}

function gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) {
        [a, b] = [b, a % b]
    }
    return a
}

/** Result of an integer division: quotient rounded down and the remainder. */
export interface DivMod {
    quotient: Rational
    remainder: Rational
}

/**
 * An exact fraction p/q of two big integers. Always reduced, with a positive denominator.
 * The solver uses it for all quantities, so results have no rounding errors.
 */
export class Rational {
    readonly p: bigint
    readonly q: bigint

    constructor(p: bigint, q: bigint) {
        if (q < 0n) {
            p = -p
            q = -q
        }
        const divisor = gcd(p < 0n ? -p : p, q)
        if (divisor > 1n) {
            p /= divisor
            q /= divisor
        }
        this.p = p
        this.q = q
    }

    /** Returns the nearest JS number. Loses precision; use only for display and layout. */
    toFloat(): number {
        return Number(this.p) / Number(this.q)
    }

    /** Returns "p" for integers and "p/q" otherwise. from_string() parses this format. */
    toString(): string {
        if (this.q === 1n) {
            return this.p.toString()
        }
        return `${this.p}/${this.q}`
    }

    /**
     * Returns a decimal string rounded to maxDigits fractional digits, without trailing zeros.
     *
     * @param maxDigits - Maximum number of fractional digits. Defaults to 3.
     * @param roundingFactor - Amount added before truncating. Defaults to half of the last digit.
     */
    toDecimal(maxDigits?: number | null, roundingFactor?: Rational | null): string {
        if (maxDigits == null) {
            maxDigits = 3
        }
        if (roundingFactor == null) {
            roundingFactor = new Rational(5n, 10n ** BigInt(maxDigits + 1))
        }

        const negative = this.less(zero)
        const sign = negative ? "-" : ""
        const x = (negative ? zero.sub(this) : this).add(roundingFactor)
        const integerPart = (x.p / x.q).toString()
        let decimalPart = ""
        let fraction = new Rational(x.p % x.q, x.q)
        const ten = new Rational(10n, 1n)
        while (maxDigits > 0 && !fraction.equal(roundingFactor)) {
            fraction = fraction.mul(ten)
            roundingFactor = roundingFactor.mul(ten)
            decimalPart += (fraction.p / fraction.q).toString()
            fraction = new Rational(fraction.p % fraction.q, fraction.q)
            maxDigits--
        }
        if (fraction.equal(roundingFactor)) {
            decimalPart = decimalPart.replace(/0+$/, "")
        }
        if (decimalPart !== "") {
            return `${sign}${integerPart}.${decimalPart}`
        }
        return sign + integerPart
    }

    /** Returns a decimal string rounded up to maxDigits fractional digits. */
    toUpDecimal(maxDigits: number): string {
        const fraction = new Rational(1n, 10n ** BigInt(maxDigits))
        const divmod = this.divmod(fraction)
        const x = divmod.remainder.isZero() ? this : this.add(fraction)
        return x.toDecimal(maxDigits, zero)
    }

    /** Returns a mixed number such as "1 + 1/2", or toString() if there is no integer part. */
    toMixed(): string {
        const quotient = this.p / this.q
        const remainder = this.p % this.q
        if (quotient === 0n || remainder === 0n) {
            return this.toString()
        }
        return `${quotient} + ${remainder}/${this.q}`
    }

    /** Returns whether the value is 0. */
    isZero(): boolean {
        return this.p === 0n
    }

    /** Returns whether the value is 1. */
    isOne(): boolean {
        return this.p === 1n && this.q === 1n
    }

    /** Returns whether the value is a whole number. */
    isInteger(): boolean {
        return this.q === 1n
    }

    /** Returns the smallest integer that is not less than this value. */
    ceil(): Rational {
        let result = new Rational(this.p / this.q, 1n)
        if (this.p % this.q !== 0n) {
            result = result.add(one)
        }
        return result
    }

    /** Returns the largest integer that is not greater than this value. */
    floor(): Rational {
        let result = new Rational(this.p / this.q, 1n)
        if (result.less(zero) && this.p % this.q !== 0n) {
            result = result.sub(one)
        }
        return result
    }

    /** Returns whether both values are equal. */
    equal(other: Rational): boolean {
        return this.p === other.p && this.q === other.q
    }

    /** Returns whether this value is less than other. */
    less(other: Rational): boolean {
        return this.p * other.q < this.q * other.p
    }

    /** Returns the absolute value. */
    abs(): Rational {
        if (this.less(zero)) {
            return this.mul(minusOne)
        }
        return this
    }

    /** Returns this + other. */
    add(other: Rational): Rational {
        return new Rational(this.p * other.q + this.q * other.p, this.q * other.q)
    }

    /** Returns this - other. */
    sub(other: Rational): Rational {
        if (other.isZero()) {
            return this
        }
        return new Rational(this.p * other.q - this.q * other.p, this.q * other.q)
    }

    /** Returns this * other. */
    mul(other: Rational): Rational {
        if (this.isZero() || other.isZero()) {
            return zero
        }
        if (this.isOne()) {
            return other
        }
        if (other.isOne()) {
            return this
        }
        return new Rational(this.p * other.p, this.q * other.q)
    }

    /** Returns this / other. */
    div(other: Rational): Rational {
        return new Rational(this.p * other.q, this.q * other.p)
    }

    /** Returns the quotient of this / other rounded down, and the remainder. */
    divmod(other: Rational): DivMod {
        const quotient = this.div(other).floor()
        const remainder = this.sub(other.mul(quotient))
        return { quotient, remainder }
    }

    /** Returns 1 / this. */
    reciprocate(): Rational {
        return new Rational(this.q, this.p)
    }

    /** Returns this to the power of exp, a non-negative whole number. */
    pow(exp: number): Rational {
        const e = BigInt(exp)
        return new Rational(this.p ** e, this.q ** e)
    }

    /** Parses a decimal string such as "12" or "1.25". */
    static from_decimal(s: string): Rational {
        const i = s.indexOf(".")
        if (i === -1 || i === s.length - 1) {
            return new Rational(parseInteger(s.slice(0, i === -1 ? undefined : i)), 1n)
        }
        const integerPart = new Rational(parseInteger(s.slice(0, i)), 1n)
        const numerator = parseInteger(s.slice(i + 1))
        const denominator = 10n ** BigInt(s.length - i - 1)
        return integerPart.add(new Rational(numerator, denominator))
    }

    /** Parses a decimal, a fraction "p/q", or a mixed number "a+p/q". Throws on invalid input. */
    static from_string(s: string): Rational {
        const i = s.indexOf("/")
        if (i === -1) {
            return Rational.from_decimal(s)
        }
        const j = s.indexOf("+")
        const q = parseInteger(s.slice(i + 1))
        let p: bigint
        if (j !== -1) {
            const integer = parseInteger(s.slice(0, j))
            p = parseInteger(s.slice(j + 1, i)) + integer * q
        } else {
            p = parseInteger(s.slice(0, i))
        }
        return new Rational(p, q)
    }

    /** Converts a whole JS number. */
    static from_integer(x: number): Rational {
        return Rational.from_floats(x, 1)
    }

    /** Converts a JS number exactly, including its binary rounding error. NaN and infinities become 0. */
    static from_float(arg: number): Rational {
        if (arg === 0 || !Number.isFinite(arg)) {
            return zero
        }
        if (Number.isInteger(arg)) {
            return Rational.from_integer(arg)
        }
        const x = Math.abs(arg)
        let exp = Math.max(-1023, Math.floor(Math.log2(x)) + 1)
        let floatPart = x * Math.pow(2, -exp)
        for (let i = 0; i < 300 && floatPart !== Math.floor(floatPart); i++) {
            floatPart *= 2
            exp--
        }
        let numerator = BigInt(floatPart)
        let denominator = 1n
        if (exp > 0) {
            numerator <<= BigInt(exp)
        } else {
            denominator <<= BigInt(-exp)
        }
        return new Rational(numerator, denominator)
    }

    /**
     * Converts a JS number from game data, rounded to 5 decimal places. Values that round to
     * thirds become exact thirds. This hides floating-point noise in the dumped data.
     */
    static from_float_approximate(x: number): Rational {
        if (Number.isInteger(x)) {
            return Rational.from_floats(x, 1)
        }
        const r = new Rational(BigInt(Math.round(x * 100000)), 100000n)
        const divmod = r.divmod(one)
        if (divmod.remainder.equal(approximateOneThird)) {
            return divmod.quotient.add(oneThird)
        } else if (divmod.remainder.equal(approximateTwoThirds)) {
            return divmod.quotient.add(twoThirds)
        }
        return r
    }

    /** Builds p/q from two whole JS numbers. */
    static from_floats(p: number, q: number): Rational {
        return new Rational(BigInt(p), BigInt(q))
    }
}

// Five-digit decimal approximations of 1/3 and 2/3.
const approximateOneThird = new Rational(33333n, 100000n)
const approximateTwoThirds = new Rational(33333n, 50000n)

export const minusOne = new Rational(-1n, 1n)
export const zero = new Rational(0n, 1n)
export const one = new Rational(1n, 1n)
export const half = new Rational(1n, 2n)
export const oneThird = new Rational(1n, 3n)
export const twoThirds = new Rational(2n, 3n)
