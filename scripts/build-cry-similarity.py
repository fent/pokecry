#!/usr/bin/env python3
"""
Build the hard-mode cry similarity table.

Pipeline:
1. Read species/form generations from src/pokemon.ts.
2. Enumerate every base and alternate-form MP3 in media/cries.
3. Decode, trim silence, normalize, then extract MFCC + deltas + pitch.
4. Prefilter candidates by a compact summary vector.
5. Refine the best candidates with DTW on the time sequence.
6. Store the eight nearest cries from other species in the same generation.

Only exact decoded-PCM duplicates are excluded. Near-identical cries are kept;
they are the point of hard mode. Same-species forms are excluded because a
decoy must be a different Pokemon.

Output layout in src/cry-similarity.ts:

    cryKeys[i]         relative cry path, e.g. "latest/25-original-cap"
    crySimilarity[i]   indices into cryKeys for cryKeys[i]'s neighbors

Requires ffmpeg and numpy. Run from the repository root:

    python3 scripts/build-cry-similarity.py
"""

import hashlib
import json
import re
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "src/cry-similarity.ts"

# Audio analysis settings.
SAMPLE_RATE = 16000  # Mono decode rate; cries are short, so this is sufficient.
FRAME = 400  # 25 ms analysis window.
HOP = 160  # 10 ms hop.
N_FFT = 512
N_MELS = 40
N_MFCC = 13
SEQUENCE_FRAMES = 16  # Time-normalized frames used for DTW and summaries.

# Search settings.
PREFILTER_CANDIDATES = 16  # Cheap cosine pass before DTW.
NEIGHBORS = 8  # Stored per cry.


def load_generations():
    """Return native species generations and later-generation form mappings."""
    species_generations = {}
    form_generations = {}
    source = (ROOT / "src/pokemon.ts").read_text()

    # The data file is JSON-compatible inside each generation array.
    for generation in range(1, 10):
        match = re.search(rf"pokemon\.gen{generation} = \[(.*?)\n\];", source, re.S)
        if not match:
            continue
        for block in re.finditer(r"  \{\n(.*?)\n  \}", match.group(1), re.S):
            try:
                entry = json.loads("{" + block.group(1) + "}")
            except json.JSONDecodeError:
                continue
            species_id = int(entry["species_id"])
            species_generations[species_id] = generation
            for form, form_generation in (entry.get("formGenerations") or {}).items():
                form_generations[(species_id, form)] = int(form_generation)

    return species_generations, form_generations


def mel_filterbank():
    """Build a triangular mel filter bank for the configured FFT size."""
    def hz_to_mel(hz):
        return 2595 * np.log10(1 + hz / 700)

    def mel_to_hz(mel):
        return 700 * (10 ** (mel / 2595) - 1)

    mel_points = np.linspace(0, hz_to_mel(SAMPLE_RATE / 2), N_MELS + 2)
    hz_points = mel_to_hz(mel_points)
    bins = np.floor((N_FFT + 1) * hz_points / SAMPLE_RATE).astype(int)
    filters = np.zeros((N_MELS, N_FFT // 2 + 1))

    for index in range(N_MELS):
        left, center, right = bins[index], bins[index + 1], bins[index + 2]
        if center > left:
            filters[index, left:center] = np.linspace(0, 1, center - left, endpoint=False)
        if right > center:
            filters[index, center:right] = np.linspace(1, 0, right - center, endpoint=False)

    return filters


MEL_FILTERS = mel_filterbank()
DCT = np.cos(
    np.pi
    * np.arange(N_MFCC)[:, None]
    * (np.arange(N_MELS)[None, :] + 0.5)
    / N_MELS
) * np.sqrt(2.0 / N_MELS)


def cry_assets(species_generations, form_generations):
    """Return (key, species, form, generation, path) for each cry file."""
    assets = []
    # legacy covers generations 1-5; latest covers 6-9.
    for directory in ("legacy", "latest"):
        for path in sorted((ROOT / "media/cries" / directory).glob("*.mp3")):
            match = re.match(r"^(\d+)(?:-(.+))?$", path.stem)
            if not match:
                continue
            species_id = int(match.group(1))
            form = match.group(2) or ""
            generation = form_generations.get(
                (species_id, form), species_generations.get(species_id)
            )
            if generation is None:
                continue
            assets.append((f"{directory}/{path.stem}", species_id, form, generation, path))
    return assets


def extract_features(path):
    """Decode one cry into a time-normalized sequence and summary vector."""
    # Decode to the format used by the analysis below.
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "s16le",
            "-",
        ],
        stderr=subprocess.DEVNULL,
    )
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if len(samples) < FRAME:
        return None, None, None

    # Trim near-silence and normalize peak amplitude so loudness does not
    # dominate the comparison.
    peak = np.max(np.abs(samples))
    if peak <= 1e-6:
        return None, None, None
    loud = np.where(np.abs(samples) > peak * 0.01)[0]
    if len(loud):
        samples = samples[max(0, loud[0] - 80) : min(len(samples), loud[-1] + 81)]
    samples -= samples.mean()
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples /= peak

    # Frame the waveform and compute the short-time power spectrum.
    frame_count = 1 + (len(samples) - FRAME) // HOP
    indices = np.arange(FRAME)[None, :] + HOP * np.arange(frame_count)[:, None]
    frames = samples[indices] * np.hanning(FRAME)[None, :]

    # MFCCs summarize timbre; deltas capture how the sound changes over time.
    spectrum = np.abs(np.fft.rfft(frames, n=N_FFT)) ** 2
    log_mel = np.log(MEL_FILTERS @ spectrum.T + 1e-8)
    mfcc = DCT @ log_mel
    delta = np.gradient(mfcc, axis=1)
    delta2 = np.gradient(delta, axis=1)

    # Pitch via normalized autocorrelation. It is one feature per frame, not a
    # separate DTW term, so it contributes without dominating the comparison.
    auto_spectrum = np.fft.rfft(frames, n=1024)
    autocorrelation = np.fft.irfft(
        auto_spectrum * np.conj(auto_spectrum), n=1024
    )[:, :161]
    autocorrelation /= autocorrelation[:, 0:1] + 1e-9
    lags = np.arange(16, 161)
    values = autocorrelation[:, 16:161]
    best = np.argmax(values, axis=1)
    strength = values[np.arange(len(values)), best]
    f0 = SAMPLE_RATE / lags[best]
    pitch = np.where(strength > 0.3, np.log2(f0 / 440.0), 0.0)

    # Stack all per-frame features, then normalize the time axis so DTW starts
    # from a common sequence length.
    sequence = np.vstack([mfcc, delta, delta2, pitch[None, :]])
    old_time = np.linspace(0, 1, sequence.shape[1])
    new_time = np.linspace(0, 1, SEQUENCE_FRAMES)
    sequence = np.stack(
        [np.interp(new_time, old_time, row) for row in sequence],
        axis=1,
    )

    # Cheap summary used for the initial cosine prefilter.
    duration = len(samples) / SAMPLE_RATE
    zero_crossings = np.mean(np.abs(np.diff(np.signbit(samples).astype(np.int8))))
    summary = np.concatenate(
        [sequence.mean(axis=1), sequence.std(axis=1), [duration * 4, zero_crossings]]
    )
    # Hash decoded PCM, not MP3 bytes, so exact audio duplicates are detected.
    return sequence, summary, hashlib.sha256(raw).hexdigest()


def dtw_distance(left, right):
    """Dynamic-time-warping distance between two feature sequences."""
    # Local frame-to-frame Euclidean distances.
    distances = np.linalg.norm(left[:, None, :] - right[None, :, :], axis=2)
    rows, columns = distances.shape
    # Accumulate the cheapest alignment path. The first row/column are sentinels.
    accumulated = np.full((rows + 1, columns + 1), np.inf)
    accumulated[0, 0] = 0

    for row in range(1, rows + 1):
        current = accumulated[row]
        previous = accumulated[row - 1]
        for column in range(1, columns + 1):
            current[column] = distances[row - 1, column - 1] + min(
                previous[column],
                current[column - 1],
                previous[column - 1],
            )

    return accumulated[rows, columns] / (rows + columns)


def write_output(result):
    """Write the compact manifest and neighbor-index table."""
    # Lexicographic key order keeps the generated file deterministic. Neighbor
    # references are converted to indices into this same list.
    keys = sorted(result)
    index_by_key = {key: index for index, key in enumerate(keys)}
    lines = [
        "// Generated by scripts/build-cry-similarity.py. Do not edit by hand.",
        "const cryKeys: string[] = [",
    ]
    for key in keys:
        lines.append(f'  "{key}",')
    lines.append("];")
    lines.append("const crySimilarity: number[][] = [")
    for key in keys:
        neighbors = ", ".join(
            str(index_by_key[neighbor]) for neighbor in result[key]
        )
        lines.append(f"  [{neighbors}],")
    lines.extend(
        [
            "];",
            "Object.assign(window, { cryKeys, crySimilarity });",
            "",
        ]
    )
    OUTPUT.write_text("\n".join(lines))


def main():
    """Generate the similarity table from all cry assets."""
    species_generations, form_generations = load_generations()
    assets = cry_assets(species_generations, form_generations)
    sequences = {}
    summaries = {}
    hashes = {}
    species_by_key = {}

    for key, _species_id, _form, _generation, path in assets:
        sequence, summary, digest = extract_features(path)
        if sequence is None:
            continue
        sequences[key] = sequence
        summaries[key] = summary
        hashes[key] = digest
        species_by_key[key] = _species_id

    # Standardize both views so no single feature scale dominates.
    summary_matrix = np.stack(list(summaries.values()))
    summary_mean = summary_matrix.mean(axis=0)
    summary_std = summary_matrix.std(axis=0)
    summary_std[summary_std < 1e-6] = 1
    for key in summaries:
        summaries[key] = (summaries[key] - summary_mean) / summary_std

    all_frames = np.concatenate(list(sequences.values()), axis=1)
    frame_mean = all_frames.mean(axis=1, keepdims=True)
    frame_std = all_frames.std(axis=1, keepdims=True)
    frame_std[frame_std < 1e-6] = 1
    for key in sequences:
        sequences[key] = (sequences[key] - frame_mean) / frame_std

    # Compare only within a generation, as requested by the game semantics.
    groups = {}
    for key, _species_id, _form, generation, _path in assets:
        if key in sequences:
            groups.setdefault(generation, []).append(key)

    result = {}
    for keys in groups.values():
        vectors = np.stack([summaries[key] for key in keys])
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        similarities = vectors @ vectors.T

        for index, key in enumerate(keys):
            # Cheap cosine prefilter, then spend DTW only on the best candidates.
            candidates = []
            for other_index in np.argsort(-similarities[index]):
                if other_index == index:
                    continue
                other = keys[other_index]
                # Decoys are species-unique, so same-species forms never help.
                if species_by_key[key] == species_by_key[other]:
                    continue
                if hashes[key] == hashes[other]:
                    continue
                candidates.append(other)
                if len(candidates) == PREFILTER_CANDIDATES:
                    break

            # Re-rank the prefiltered candidates by DTW and keep the top 8.
            ranked = sorted(
                (dtw_distance(sequences[key], sequences[other]), other)
                for other in candidates
            )
            result[key] = [other for _distance, other in ranked[:NEIGHBORS]]

    write_output(result)
    print(f"Wrote {len(result)} cry keys to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
