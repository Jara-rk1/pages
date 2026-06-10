#!/usr/bin/env python3
"""
KPMG Newsletter Minigames -- QR Code SVG Generator
===================================================

Generates scannable SVG QR codes for each of the 12 newsletter minigames.
Pure Python 3.8+ stdlib -- no pip installs required.

Implements QR Code specification (ISO/IEC 18004) for versions 1-6,
byte mode encoding, error correction level M (15% recovery).

Usage:
    python generate_qr.py --edition 2026-04 --base-url http://games.kpmg.internal:8080

Outputs:
    newsletters/{edition}/qr-{game-id}.svg   (12 individual SVG files)
    newsletters/{edition}/qr-codes.html       (printable A4 sheet, 3x4 grid)
"""

import argparse
import os
from typing import List, Tuple, Optional

# ---------------------------------------------------------------------------
# Game registry
# ---------------------------------------------------------------------------
GAMES: List[Tuple[str, str]] = [
    ("consultant-rush", "Consultant Rush"),
    ("audit-ascent", "Audit Ascent"),
    ("flappy-brief", "Flappy Brief"),
    ("deal-spell", "Deal Spell"),
    ("tax-tetris", "Tax Tetris"),
    ("slide-deck-stacker", "Slide Deck Stacker"),
    ("budget-blitz", "Budget Blitz"),
    ("merger-match", "Merger Match"),
    ("risk-radar", "Risk Radar"),
    ("pipeline-plumber", "Pipeline Plumber"),
    ("kpi-catcher", "KPI Catcher"),
    ("strategy-snake", "Strategy Snake"),
]

# KPMG Blue -- used instead of black for branded QR codes
KPMG_BLUE = "#00338D"

# ---------------------------------------------------------------------------
# QR Code constants
# ---------------------------------------------------------------------------

# Version info: (version, size, total_codewords, ec_codewords_per_block,
#                num_blocks_group1, data_cw_per_block_g1,
#                num_blocks_group2, data_cw_per_block_g2)
# For EC level M only.
VERSION_TABLE = {
    # ver: (size, total_data_cw, ec_cw_per_block, nblocks_g1, dcw_g1, nblocks_g2, dcw_g2)
    # Source: ISO/IEC 18004, Table 9 -- EC level M
    # total_data_cw = total codewords available for data (excl. EC)
    # For V1: 26 total cw, 10 EC cw => 16 data cw, 1 block of 16
    # For V2: 44 total cw, 16 EC cw => 28 data cw, 1 block of 28
    # For V3: 70 total cw, 26 EC cw => 44 data cw, 1 block of 44
    # For V4: 100 total cw, 36 EC cw => 64 data cw, 2 blocks of 32
    # For V5: 134 total cw, 48 EC cw => 86 data cw, 2 blocks of 43
    # For V6: 172 total cw, 64 EC cw => 108 data cw, 4 blocks (2x27 + 2x28)
    1: (21, 16, 10, 1, 16, 0, 0),
    2: (25, 28, 16, 1, 28, 0, 0),
    3: (29, 44, 26, 1, 44, 0, 0),
    4: (33, 64, 18, 2, 32, 0, 0),
    5: (37, 86, 24, 2, 43, 0, 0),
    6: (41, 108, 16, 2, 27, 2, 28),
}

# Maximum *data* bytes (after mode/length/terminator overhead) for byte mode, EC-M
# Overhead: 4 bits mode + 8 bits length (v1-9) + up to 4 bits terminator = 2 codewords
# So usable payload ~ total_data_cw - 2  (conservative; exact calc done in code)
VERSION_CAPACITY_BYTES_M = {
    1: 14,
    2: 26,
    3: 42,
    4: 62,
    5: 84,
    6: 106,
}

# Alignment pattern centre coordinates per version
ALIGNMENT_PATTERNS = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
}

# Format information is computed dynamically by compute_format_bits() below.

# ---------------------------------------------------------------------------
# Galois Field GF(256) arithmetic  (primitive polynomial 0x11d = x^8+x^4+x^3+x^2+1)
# ---------------------------------------------------------------------------

GF_EXP = [0] * 512  # anti-log table
GF_LOG = [0] * 256  # log table


def _init_gf_tables() -> None:
    """Initialise GF(256) exponent and logarithm lookup tables."""
    x = 1
    for i in range(255):
        GF_EXP[i] = x
        GF_LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D  # reduce by primitive polynomial
    # Extend exp table for convenience (so we can index up to 509)
    for i in range(255, 512):
        GF_EXP[i] = GF_EXP[i - 255]


_init_gf_tables()


def gf_mul(a: int, b: int) -> int:
    """Multiply two GF(256) elements."""
    if a == 0 or b == 0:
        return 0
    return GF_EXP[GF_LOG[a] + GF_LOG[b]]


def gf_poly_mul(p: List[int], q: List[int]) -> List[int]:
    """Multiply two polynomials over GF(256). Coefficients are high-order first."""
    result = [0] * (len(p) + len(q) - 1)
    for i, a in enumerate(p):
        for j, b in enumerate(q):
            result[i + j] ^= gf_mul(a, b)
    return result


def gf_poly_div(dividend: List[int], divisor: List[int]) -> List[int]:
    """
    Divide dividend by divisor over GF(256).
    Returns the remainder (= error correction codewords).
    """
    result = list(dividend)
    for i in range(len(dividend) - len(divisor) + 1):
        coef = result[i]
        if coef != 0:
            for j in range(1, len(divisor)):
                result[i + j] ^= gf_mul(divisor[j], coef)
    # Remainder is the last (len(divisor)-1) coefficients
    return result[-(len(divisor) - 1):]


def rs_generator_poly(nsym: int) -> List[int]:
    """
    Build the Reed-Solomon generator polynomial for *nsym* error correction symbols.
    g(x) = (x - a^0)(x - a^1)...(x - a^{nsym-1})
    """
    g = [1]
    for i in range(nsym):
        g = gf_poly_mul(g, [1, GF_EXP[i]])
    return g


def rs_encode(data: List[int], nsym: int) -> List[int]:
    """
    Compute Reed-Solomon error correction codewords for *data*.
    Returns list of *nsym* EC codewords.
    """
    gen = rs_generator_poly(nsym)
    # Pad data with nsym zeros (multiply by x^nsym)
    padded = data + [0] * nsym
    remainder = gf_poly_div(padded, gen)
    return remainder


# ---------------------------------------------------------------------------
# QR data encoding (byte mode)
# ---------------------------------------------------------------------------

def select_version(data_len: int) -> int:
    """Choose the smallest QR version (1-6) that fits *data_len* bytes in byte mode, EC-M."""
    for ver in range(1, 7):
        if data_len <= VERSION_CAPACITY_BYTES_M[ver]:
            return ver
    raise ValueError(
        f"Data too long ({data_len} bytes). Max supported is "
        f"{VERSION_CAPACITY_BYTES_M[6]} bytes (version 6, EC-M)."
    )


def encode_data_codewords(text: str, version: int) -> List[int]:
    """
    Encode *text* into QR data codewords (byte mode, EC level M).

    Structure:
        [mode indicator 4 bits][char count 8 bits (v1-9)][data bytes][terminator][padding]

    Returns a list of codeword integers.
    """
    data_bytes = text.encode("utf-8")
    data_len = len(data_bytes)

    info = VERSION_TABLE[version]
    total_data_cw = info[1]  # total data codewords (before EC)

    # Build the bit stream
    bits: List[int] = []  # list of 0/1

    def add_bits(value: int, length: int) -> None:
        for i in range(length - 1, -1, -1):
            bits.append((value >> i) & 1)

    # Mode indicator: byte mode = 0100
    add_bits(0b0100, 4)

    # Character count indicator: 8 bits for versions 1-9
    add_bits(data_len, 8)

    # Data bytes
    for b in data_bytes:
        add_bits(b, 8)

    # Terminator: up to 4 zero bits (don't exceed total capacity)
    total_bits = total_data_cw * 8
    terminator_len = min(4, total_bits - len(bits))
    add_bits(0, terminator_len)

    # Pad to byte boundary
    while len(bits) % 8 != 0:
        bits.append(0)

    # Convert bits to codewords
    codewords: List[int] = []
    for i in range(0, len(bits), 8):
        byte_val = 0
        for j in range(8):
            byte_val = (byte_val << 1) | bits[i + j]
        codewords.append(byte_val)

    # Pad with alternating 0xEC / 0x11 to fill total_data_cw
    pad_bytes = [0xEC, 0x11]
    idx = 0
    while len(codewords) < total_data_cw:
        codewords.append(pad_bytes[idx % 2])
        idx += 1

    return codewords


def compute_ec_and_interleave(data_cw: List[int], version: int) -> List[int]:
    """
    Split data into blocks, compute EC for each, then interleave as per QR spec.
    Returns the final codeword sequence (data interleaved + EC interleaved).
    """
    _, _, ec_per_block, nb_g1, dcw_g1, nb_g2, dcw_g2 = VERSION_TABLE[version]

    # Split into blocks
    blocks_data: List[List[int]] = []
    offset = 0
    for _ in range(nb_g1):
        blocks_data.append(data_cw[offset: offset + dcw_g1])
        offset += dcw_g1
    for _ in range(nb_g2):
        blocks_data.append(data_cw[offset: offset + dcw_g2])
        offset += dcw_g2

    # Compute EC for each block
    blocks_ec: List[List[int]] = []
    for block in blocks_data:
        ec = rs_encode(block, ec_per_block)
        blocks_ec.append(ec)

    # Interleave data codewords
    max_data_len = max(len(b) for b in blocks_data)
    interleaved: List[int] = []
    for i in range(max_data_len):
        for block in blocks_data:
            if i < len(block):
                interleaved.append(block[i])

    # Interleave EC codewords
    for i in range(ec_per_block):
        for block_ec in blocks_ec:
            if i < len(block_ec):
                interleaved.append(block_ec[i])

    return interleaved


# ---------------------------------------------------------------------------
# QR matrix construction
# ---------------------------------------------------------------------------

# Cell states
UNSET = -1
WHITE = 0
BLACK = 1


def make_matrix(size: int) -> List[List[int]]:
    """Create a size x size matrix filled with UNSET."""
    return [[UNSET] * size for _ in range(size)]


def place_finder_pattern(matrix: List[List[int]], row: int, col: int) -> None:
    """
    Place a 7x7 finder pattern with top-left corner at (row, col).
    Also places the 1-module white separator border around it.
    """
    size = len(matrix)
    # The 7x7 pattern
    pattern = [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1],
    ]
    for r in range(7):
        for c in range(7):
            matrix[row + r][col + c] = pattern[r][c]

    # White separator (row above/below the pattern, column left/right)
    for i in range(-1, 8):
        for r, c in [(row - 1, col + i), (row + 7, col + i),
                      (row + i, col - 1), (row + i, col + 7)]:
            if 0 <= r < size and 0 <= c < size:
                matrix[r][c] = WHITE


def place_alignment_pattern(matrix: List[List[int]], row: int, col: int) -> None:
    """Place a 5x5 alignment pattern centred at (row, col), skipping finder areas."""
    pattern = [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
    ]
    for dr in range(-2, 3):
        for dc in range(-2, 3):
            r, c = row + dr, col + dc
            if matrix[r][c] == UNSET:
                matrix[r][c] = pattern[dr + 2][dc + 2]


def place_timing_patterns(matrix: List[List[int]], size: int) -> None:
    """Place horizontal and vertical timing patterns (row 6, col 6)."""
    for i in range(8, size - 8):
        val = 1 if i % 2 == 0 else 0
        if matrix[6][i] == UNSET:
            matrix[6][i] = val
        if matrix[i][6] == UNSET:
            matrix[i][6] = val


def place_dark_module(matrix: List[List[int]], version: int) -> None:
    """Place the mandatory dark module at (4*version + 9, 8)."""
    matrix[4 * version + 9][8] = BLACK


def reserve_format_areas(matrix: List[List[int]], size: int) -> None:
    """
    Reserve format information areas (around finders + dark module column).
    Mark them as WHITE temporarily; they'll be overwritten with real format bits later.
    """
    # Around top-left finder
    for i in range(9):
        if matrix[8][i] == UNSET:
            matrix[8][i] = WHITE
        if matrix[i][8] == UNSET:
            matrix[i][8] = WHITE
    # Around top-right finder
    for i in range(8):
        if matrix[8][size - 1 - i] == UNSET:
            matrix[8][size - 1 - i] = WHITE
    # Around bottom-left finder
    for i in range(7):
        if matrix[size - 1 - i][8] == UNSET:
            matrix[size - 1 - i][8] = WHITE


def place_data_bits(matrix: List[List[int]], codewords: List[int], size: int) -> None:
    """
    Place data + EC codewords into the matrix using the QR upward-zigzag pattern.
    Skips column 6 (timing pattern column).
    """
    bit_index = 0
    total_bits = len(codewords) * 8

    def get_bit(idx: int) -> int:
        if idx >= total_bits:
            return 0
        byte_idx = idx // 8
        bit_pos = 7 - (idx % 8)
        return (codewords[byte_idx] >> bit_pos) & 1

    # Columns are traversed right-to-left in pairs
    col = size - 1
    while col >= 0:
        # Skip column 6 (timing pattern)
        if col == 6:
            col -= 1
            continue

        # Traverse upward or downward
        # Determine direction: right-to-left column pairs
        # Column pair: col and col-1
        # Direction alternates: first pair (rightmost) goes upward
        pair_index = (size - 1 - col) // 2
        going_up = (pair_index % 2 == 0)

        rows = range(size - 1, -1, -1) if going_up else range(size)

        for row in rows:
            for dc in [0, -1]:  # right column first, then left
                c = col + dc
                if c < 0:
                    continue
                if matrix[row][c] == UNSET:
                    matrix[row][c] = get_bit(bit_index)
                    bit_index += 1

        col -= 2


# ---------------------------------------------------------------------------
# Masking
# ---------------------------------------------------------------------------

MASK_FUNCTIONS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


def is_function_module(matrix_reserved: List[List[int]], r: int, c: int) -> bool:
    """Check if (r,c) is a function pattern module (finder, timing, alignment, format, dark)."""
    return matrix_reserved[r][c] != UNSET


def apply_mask(matrix: List[List[int]], matrix_reserved: List[List[int]],
               mask_id: int) -> List[List[int]]:
    """Apply mask pattern to data modules, returning a new matrix."""
    size = len(matrix)
    result = [row[:] for row in matrix]
    mask_fn = MASK_FUNCTIONS[mask_id]
    for r in range(size):
        for c in range(size):
            if not is_function_module(matrix_reserved, r, c):
                if mask_fn(r, c):
                    result[r][c] ^= 1
    return result


def penalty_score(matrix: List[List[int]]) -> int:
    """
    Compute the QR mask penalty score (rules 1-4).
    Lower is better.
    """
    size = len(matrix)
    score = 0

    # Rule 1: Runs of 5+ same-colour modules in a row/column
    for r in range(size):
        count = 1
        for c in range(1, size):
            if matrix[r][c] == matrix[r][c - 1]:
                count += 1
            else:
                if count >= 5:
                    score += count - 2
                count = 1
        if count >= 5:
            score += count - 2

    for c in range(size):
        count = 1
        for r in range(1, size):
            if matrix[r][c] == matrix[r - 1][c]:
                count += 1
            else:
                if count >= 5:
                    score += count - 2
                count = 1
        if count >= 5:
            score += count - 2

    # Rule 2: 2x2 blocks of same colour
    for r in range(size - 1):
        for c in range(size - 1):
            v = matrix[r][c]
            if v == matrix[r][c + 1] == matrix[r + 1][c] == matrix[r + 1][c + 1]:
                score += 3

    # Rule 3: Finder-like patterns (1011101 preceded/followed by 0000)
    pattern_a = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
    pattern_b = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for r in range(size):
        for c in range(size - 10):
            row_seg = [matrix[r][c + i] for i in range(11)]
            if row_seg == pattern_a or row_seg == pattern_b:
                score += 40
    for c in range(size):
        for r in range(size - 10):
            col_seg = [matrix[r + i][c] for i in range(11)]
            if col_seg == pattern_a or col_seg == pattern_b:
                score += 40

    # Rule 4: Proportion of dark modules
    total = size * size
    dark = sum(matrix[r][c] for r in range(size) for c in range(size))
    pct = dark * 100 // total
    # Find previous and next multiples of 5
    prev5 = pct - (pct % 5)
    next5 = prev5 + 5
    score += min(abs(prev5 - 50) // 5, abs(next5 - 50) // 5) * 10

    return score


# ---------------------------------------------------------------------------
# Format information
# ---------------------------------------------------------------------------

def compute_format_bits(ec_level: int, mask_id: int) -> int:
    """
    Compute 15-bit format information for the given EC level and mask.
    EC levels: L=01, M=00, Q=11, H=10
    """
    # For EC-M, the 2-bit indicator is 00
    data = (ec_level << 3) | mask_id  # 5 bits

    # BCH(15,5) encoding with generator polynomial x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
    # = 10100110111 = 0x537
    generator = 0x537
    remainder = data << 10
    for i in range(4, -1, -1):
        if remainder & (1 << (i + 10)):
            remainder ^= generator << i

    encoded = (data << 10) | remainder

    # XOR with mask pattern 101010000010010
    encoded ^= 0x5412

    return encoded


def place_format_info(matrix: List[List[int]], format_bits: int) -> None:
    """Write the 15 format bits into the two format information areas."""
    size = len(matrix)

    # Bit positions around top-left finder (bits 0-14)
    # Horizontal strip (row 8): columns 0-5, skip 6 (timing), 7, 8
    # Vertical strip (col 8): rows 0-5, skip 6 (timing), 7, 8
    # Plus the areas near the other two finders

    bits = []
    for i in range(14, -1, -1):
        bits.append((format_bits >> i) & 1)

    # First copy: around top-left finder
    # Horizontal: row 8, columns 0,1,2,3,4,5, [skip 6], 7,8
    h_cols = [0, 1, 2, 3, 4, 5, 7, 8]
    # Vertical: col 8, rows 8 (already done in h), 7, [skip 6], 5,4,3,2,1,0
    v_rows = [7, 5, 4, 3, 2, 1, 0]

    # QR spec format bit placement (top-left):
    #   bits[0..5] -> (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5)
    #   bits[6]    -> (8, 7)
    #   bits[7]    -> (8, 8)
    #   bits[8]    -> (7, 8)
    #   bits[9..14] -> (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)
    tl_positions = [
        (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5),
        (8, 7), (8, 8),
        (7, 8),
        (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8),
    ]
    for i, (r, c) in enumerate(tl_positions):
        matrix[r][c] = bits[i]

    # Second copy:
    #   bits[0..6]  -> (size-1, 8), (size-2, 8), ..., (size-7, 8)
    #   bits[7..14] -> (8, size-8), (8, size-7), ..., (8, size-1)
    for i in range(7):
        matrix[size - 1 - i][8] = bits[i]
    for i in range(8):
        matrix[8][size - 8 + i] = bits[7 + i]


# ---------------------------------------------------------------------------
# Main QR generation pipeline
# ---------------------------------------------------------------------------

def generate_qr_matrix(text: str) -> List[List[int]]:
    """
    Generate a QR code matrix for the given text string.
    Returns a 2D list of 0 (white) and 1 (black) values.
    """
    data_bytes = text.encode("utf-8")
    version = select_version(len(data_bytes))
    size = VERSION_TABLE[version][0]

    # Step 1: Encode data into codewords
    data_cw = encode_data_codewords(text, version)

    # Step 2: Compute error correction and interleave
    final_codewords = compute_ec_and_interleave(data_cw, version)

    # Step 3: Build the function-pattern matrix (to track which cells are reserved)
    reserved = make_matrix(size)

    # Place finder patterns (top-left, top-right, bottom-left)
    place_finder_pattern(reserved, 0, 0)
    place_finder_pattern(reserved, 0, size - 7)
    place_finder_pattern(reserved, size - 7, 0)

    # Place alignment patterns (version 2+)
    ap_coords = ALIGNMENT_PATTERNS[version]
    if len(ap_coords) >= 2:
        for ar in ap_coords:
            for ac in ap_coords:
                # Skip if overlapping a finder pattern
                if (ar <= 8 and ac <= 8):
                    continue  # top-left
                if (ar <= 8 and ac >= size - 8):
                    continue  # top-right
                if (ar >= size - 8 and ac <= 8):
                    continue  # bottom-left
                place_alignment_pattern(reserved, ar, ac)

    # Place timing patterns
    place_timing_patterns(reserved, size)

    # Dark module
    place_dark_module(reserved, version)

    # Reserve format info areas
    reserve_format_areas(reserved, size)

    # Step 4: Create the actual data matrix (copy of reserved)
    matrix = [row[:] for row in reserved]

    # Step 5: Place data bits into the matrix
    place_data_bits(matrix, final_codewords, size)

    # Any remaining UNSET cells should be 0 (shouldn't happen if codeword count is right)
    for r in range(size):
        for c in range(size):
            if matrix[r][c] == UNSET:
                matrix[r][c] = 0

    # Step 6: Try all 8 mask patterns, pick the one with lowest penalty
    best_mask = 0
    best_score = float("inf")
    best_matrix: Optional[List[List[int]]] = None

    for mask_id in range(8):
        candidate = apply_mask(matrix, reserved, mask_id)
        # Place format info for this mask
        fmt_bits = compute_format_bits(0b00, mask_id)  # EC-M = 00
        place_format_info(candidate, fmt_bits)
        score = penalty_score(candidate)
        if score < best_score:
            best_score = score
            best_mask = mask_id
            best_matrix = candidate

    assert best_matrix is not None
    return best_matrix


# ---------------------------------------------------------------------------
# SVG output
# ---------------------------------------------------------------------------

def matrix_to_svg(matrix: List[List[int]], module_size: int = 10,
                  quiet_zone: int = 4) -> str:
    """
    Convert a QR matrix to an SVG string.

    Args:
        matrix: 2D list of 0/1 values
        module_size: pixel size of each module
        quiet_zone: number of quiet-zone modules around the QR code

    Returns:
        SVG string
    """
    qr_size = len(matrix)
    total_modules = qr_size + 2 * quiet_zone
    total_px = total_modules * module_size

    rects: List[str] = []
    for r in range(qr_size):
        for c in range(qr_size):
            if matrix[r][c] == 1:
                x = (c + quiet_zone) * module_size
                y = (r + quiet_zone) * module_size
                rects.append(
                    f'  <rect x="{x}" y="{y}" '
                    f'width="{module_size}" height="{module_size}" '
                    f'fill="{KPMG_BLUE}"/>'
                )

    svg = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {total_px} {total_px}" '
        f'width="{total_px}" height="{total_px}">\n'
        f'  <rect width="{total_px}" height="{total_px}" fill="white"/>\n'
        + "\n".join(rects) + "\n"
        f"</svg>\n"
    )
    return svg


def write_svg(matrix: List[List[int]], filepath: str, module_size: int = 10) -> None:
    """Write a QR matrix to an SVG file."""
    svg_content = matrix_to_svg(matrix, module_size=module_size)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(svg_content)


# ---------------------------------------------------------------------------
# Printable HTML sheet
# ---------------------------------------------------------------------------

def generate_html_sheet(
    games: List[Tuple[str, str]],
    edition: str,
    base_url: str,
    output_dir: str,
) -> str:
    """
    Generate an A4-printable HTML page with all 12 QR codes in a 3x4 grid.
    QR codes are embedded inline as SVG.
    """
    cells: List[str] = []
    for game_id, game_name in games:
        url = f"{base_url}/games/{game_id}/?edition={edition}"
        matrix = generate_qr_matrix(url)
        svg = matrix_to_svg(matrix, module_size=4, quiet_zone=2)
        # Strip XML declaration for inline embedding
        svg_inline = svg.replace('<?xml version="1.0" encoding="UTF-8"?>\n', "")

        cells.append(
            f'      <div class="qr-cell">\n'
            f"        {svg_inline}\n"
            f'        <div class="game-title">{game_name}</div>\n'
            f'        <div class="game-url">{url}</div>\n'
            f"      </div>"
        )

    grid_html = "\n".join(cells)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KPMG Newsletter Minigames -- QR Codes -- {edition}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}

    body {{
      font-family: 'KPMG Extralight', 'Segoe UI', Arial, sans-serif;
      color: #333333;
      padding: 20px;
    }}

    .header {{
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 3px solid {KPMG_BLUE};
    }}

    .header h1 {{
      color: {KPMG_BLUE};
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 4px;
    }}

    .header .edition {{
      color: #666666;
      font-size: 14px;
    }}

    .grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      max-width: 720px;
      margin: 0 auto;
    }}

    .qr-cell {{
      text-align: center;
      padding: 12px 8px;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
    }}

    .qr-cell svg {{
      width: 150px;
      height: 150px;
      display: block;
      margin: 0 auto 8px auto;
    }}

    .game-title {{
      font-size: 13px;
      font-weight: 600;
      color: {KPMG_BLUE};
      margin-bottom: 2px;
    }}

    .game-url {{
      font-size: 9px;
      color: #666666;
      word-break: break-all;
    }}

    /* Print styles */
    @media print {{
      body {{ padding: 10mm; }}
      .header {{ margin-bottom: 8mm; }}
      .grid {{ gap: 6mm; }}
      .qr-cell {{
        border: 0.5pt solid #B2B2B2;
        page-break-inside: avoid;
        padding: 6px 4px;
      }}
      .qr-cell svg {{ width: 120px; height: 120px; }}
      .game-url {{ font-size: 7px; }}
      @page {{
        size: A4 portrait;
        margin: 10mm;
      }}
    }}
  </style>
</head>
<body>
  <div class="header">
    <h1>KPMG Newsletter Minigames</h1>
    <div class="edition">Edition: {edition} &mdash; Scan to play!</div>
  </div>
  <div class="grid">
{grid_html}
  </div>
</body>
</html>
"""
    return html


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate QR codes for KPMG Newsletter Minigames"
    )
    parser.add_argument(
        "--edition", required=True,
        help="Edition slug, e.g. 2026-04"
    )
    parser.add_argument(
        "--base-url", default="http://localhost:8080",
        help="Base URL for the game server (default: http://localhost:8080)"
    )
    parser.add_argument(
        "--output",
        help="Output directory (default: newsletters/{edition}/)"
    )
    parser.add_argument(
        "--module-size", type=int, default=10,
        help="QR module size in pixels for individual SVGs (default: 10)"
    )

    args = parser.parse_args()

    # Resolve output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if args.output:
        out_dir = args.output
    else:
        out_dir = os.path.join(script_dir, "newsletters", args.edition)

    os.makedirs(out_dir, exist_ok=True)

    # Strip trailing slash from base URL
    base_url = args.base_url.rstrip("/")

    print(f"Generating QR codes for edition '{args.edition}'")
    print(f"Base URL: {base_url}")
    print(f"Output:   {out_dir}")
    print()

    # Generate individual SVG files
    for game_id, game_name in GAMES:
        url = f"{base_url}/games/{game_id}/?edition={args.edition}"
        filename = f"qr-{game_id}.svg"
        filepath = os.path.join(out_dir, filename)

        matrix = generate_qr_matrix(url)
        write_svg(matrix, filepath, module_size=args.module_size)
        print(f"  {filename:40s}  ({len(url)} chars, {len(matrix)}x{len(matrix)} modules)")

    # Generate printable HTML sheet
    html_path = os.path.join(out_dir, "qr-codes.html")
    html_content = generate_html_sheet(GAMES, args.edition, base_url, out_dir)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"\n  {'qr-codes.html':40s}  (printable A4 sheet, 3x4 grid)")

    print(f"\nDone. {len(GAMES)} QR codes + 1 HTML sheet written to {out_dir}")


if __name__ == "__main__":
    main()
