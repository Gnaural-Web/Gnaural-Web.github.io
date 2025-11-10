import { ScheduleEditor } from './editor.js';

const TWO_PI = Math.PI * 2;
const DEFAULT_VOLUME = 70;
const RENDER_CONFIG = {
    initialMinutes: 10,
    chunkMinutes: 1
};
const QUICK_SEEK_BUFFER_SECONDS = 15;
const SOUND_LIBRARY = [
    { label: 'Birds', file: 'sounds/birds.ogg', icon: 'icons/birds.svg' },
    { label: 'Boat', file: 'sounds/boat.ogg', icon: 'icons/boat.svg' },
    { label: 'City', file: 'sounds/city.ogg', icon: 'icons/city.svg' },
    { label: 'Coffee Shop', file: 'sounds/coffee-shop.ogg', icon: 'icons/coffee-shop.svg' },
    { label: 'Fireplace', file: 'sounds/fireplace.ogg', icon: 'icons/fireplace.svg' },
    { label: 'Pink Noise', file: 'sounds/pink-noise.ogg', icon: 'icons/pink-noise.svg' },
    { label: 'Rain', file: 'sounds/rain.ogg', icon: 'icons/rain.svg' },
    { label: 'Summer Night', file: 'sounds/summer-night.ogg', icon: 'icons/summer-night.svg' },
    { label: 'Storm', file: 'sounds/storm.ogg', icon: 'icons/storm.svg' },
    { label: 'Stream', file: 'sounds/stream.ogg', icon: 'icons/stream.svg' },
    { label: 'Train', file: 'sounds/train.ogg', icon: 'icons/train.svg' },
    { label: 'Waves', file: 'sounds/waves.ogg', icon: 'icons/waves.svg' },
    { label: 'White Noise', file: 'sounds/white-noise.ogg', icon: 'icons/white-noise.svg' },
    { label: 'Wind', file: 'sounds/wind.ogg', icon: 'icons/wind.svg' }
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toFloat = (value, fallback = 0) => {
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
};
const toInt = (value, fallback = 0) => {
    const num = Number.parseInt(value, 10);
    return Number.isFinite(num) ? num : fallback;
};

class PinkNoiseGenerator {
    constructor(seed = Date.now() & 0xffffffff) {
        this.seed = seed >>> 0 || 1;
        this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
    }

    random() {
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return this.seed / 0xffffffff;
    }

    next() {
        const white = this.random() * 2 - 1;
        this.b0 = 0.99886 * this.b0 + white * 0.0555179;
        this.b1 = 0.99332 * this.b1 + white * 0.0750759;
        this.b2 = 0.969 * this.b2 + white * 0.153852;
        this.b3 = 0.8665 * this.b3 + white * 0.3104856;
        this.b4 = 0.55 * this.b4 + white * 0.5329522;
        this.b5 = -0.7616 * this.b5 - white * 0.016898;
        const output = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
        this.b6 = white * 0.115926;
        return output * 0.11;
    }
}

class WhiteNoiseGenerator {
    constructor(seed = Date.now() & 0xffffffff) {
        this.seed = seed >>> 0 || 1;
    }

    next() {
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return (this.seed / 0xffffffff) * 2 - 1;
    }
}

class BrownNoiseGenerator {
    constructor(seed = Date.now() & 0xffffffff) {
        this.seed = seed >>> 0 || 1;
        this.last = 0;
    }

    #random() {
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return (this.seed / 0xffffffff) * 2 - 1;
    }

    next() {
        const white = this.#random();
        this.last += white * 0.02;
        if (this.last < -1) {
            this.last = -1;
        } else if (this.last > 1) {
            this.last = 1;
        }
        return this.last;
    }
}

class GnauralEngine {
    constructor({ sampleRate = 44100 } = {}) {
        this.sampleRate = sampleRate;
    }

    parseXml(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        if (doc.querySelector('parsererror')) {
            throw new Error('Unable to read gnaural file (invalid XML) ');
        }
        const scheduleNode = doc.querySelector('schedule');
        if (!scheduleNode) {
            throw new Error('Missing <schedule> root element');
        }
        const text = (selector, fallback = '') => {
            const node = scheduleNode.querySelector(selector);
            return node ? node.textContent.trim() : fallback;
        };

        const metadata = {
            title: text('title', 'Untitled Schedule'),
            description: text('schedule_description', ''),
            author: text('author', 'Unknown'),
            version: text('gnaural_version', ''),
            totalTime: toFloat(text('totaltime'), 0),
            loops: Math.max(1, toInt(text('loops'), 1))
        };

        const overallVolumeLeft = clamp(toFloat(text('overallvolume_left'), 1), 0, 1.5);
        const overallVolumeRight = clamp(toFloat(text('overallvolume_right'), 1), 0, 1.5);

        const voiceNodes = [...doc.querySelectorAll('schedule > voice')];
        const voices = voiceNodes.map((node, index) => this.#parseVoice(node, index));
        const computedDuration = voices.reduce((max, voice) => Math.max(max, voice.totalDurationSeconds), 0);
        const totalDurationSeconds = Math.max(metadata.totalTime || 0, computedDuration, 1);
        this.#extendVoicesToDuration(voices, totalDurationSeconds);

        return {
            metadata,
            voices,
            totalDurationSeconds,
            loops: metadata.loops,
            overallVolumeLeft,
            overallVolumeRight
        };
    }

    createStream(schedule, offsetSeconds = 0) {
        return new ScheduleStream(this, schedule, offsetSeconds);
    }

    renderRange(schedule, startSec, durationSec, voiceStates) {
        const chunkDuration = Math.max(0, durationSec);
        const chunkSamples = Math.max(1, Math.ceil(chunkDuration * this.sampleRate));
        const playbackDuration = chunkSamples / this.sampleRate;
        const left = new Float32Array(chunkSamples);
        const right = new Float32Array(chunkSamples);
        const rangeEnd = startSec + chunkDuration;

        schedule.voices.forEach((voice, index) => {
            if (!voice.enabled || voice.totalDurationSeconds <= 0) return;
            this.#renderVoiceRange(voice, schedule, startSec, rangeEnd, left, right, voiceStates[index]);
        });

        if (schedule.overallVolumeLeft !== 1 || schedule.overallVolumeRight !== 1) {
            for (let i = 0; i < chunkSamples; i += 1) {
                left[i] *= schedule.overallVolumeLeft;
                right[i] *= schedule.overallVolumeRight;
            }
        }
        this.#normalizeChunk(left, right);

        return {
            left,
            right,
            duration: chunkDuration,
            playbackDuration,
            samples: chunkSamples
        };
    }

    #parseVoice(node, index) {
        const text = (selector, fallback = '') => {
            const el = node.querySelector(selector);
            return el ? el.textContent.trim() : fallback;
        };
        const type = toInt(text('type'), 0);
        const mute = text('voice_mute', '0') === '1';
        const mono = text('voice_mono', '0') === '1';
        const description = text('description', `Voice ${index + 1}`);
        const file = text('voice_file', '');
        const entries = [...node.querySelectorAll('entries > entry')].map((entryNode) => this.#parseEntry(entryNode));
        const usableEntries = entries.filter((entry) => entry.duration > 0);

        let offsetSeconds = 0;
        usableEntries.forEach((entry) => {
            entry.offsetSeconds = offsetSeconds;
            offsetSeconds += entry.duration;
        });
        this.#applySpreads(usableEntries);

        return {
            id: index,
            type,
            description,
            mono,
            file,
            enabled: !mute && usableEntries.length > 0,
            entries: usableEntries,
            entryDurationSeconds: offsetSeconds,
            totalDurationSeconds: offsetSeconds,
            loopDurationSeconds: offsetSeconds,
            tail: null
        };
    }

    #parseEntry(entryNode) {
        const attr = (name, fallback = '') => {
            if (entryNode.hasAttribute(name)) return entryNode.getAttribute(name);
            const child = entryNode.querySelector(name);
            return child ? child.textContent : fallback;
        };
        const duration = Math.max(0, toFloat(attr('duration'), 0));
        const base = Math.max(0, toFloat(attr('basefreq'), 0));
        const beat = Math.max(0, toFloat(attr('beatfreq'), 0));
        const volume = clamp(toFloat(attr('volume'), 0.7), 0, 1.5);
        const volL = clamp(toFloat(attr('volume_left'), volume), 0, 1.5);
        const volR = clamp(toFloat(attr('volume_right'), volume), 0, 1.5);
        return {
            duration,
            baseStart: base,
            beatHalfStart: beat * 0.5,
            volLStart: volL,
            volRStart: volR,
            offsetSeconds: 0,
            state: attr('state', '1')
        };
    }

    #applySpreads(entries) {
        if (entries.length === 0) return;
        for (let i = 0; i < entries.length; i += 1) {
            const entry = entries[i];
            const next = entries[(i + 1) % entries.length];
            entry.baseSpread = (next?.baseStart ?? entry.baseStart) - entry.baseStart;
            entry.beatHalfSpread = (next?.beatHalfStart ?? entry.beatHalfStart) - entry.beatHalfStart;
            entry.volLSpread = (next?.volLStart ?? entry.volLStart) - entry.volLStart;
            entry.volRSpread = (next?.volRStart ?? entry.volRStart) - entry.volRStart;
        }
    }

    #entryValuesAt(entry, progress) {
        const clamped = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
        return {
            base: entry.baseStart + (entry.baseSpread ?? 0) * clamped,
            beatHalf: entry.beatHalfStart + (entry.beatHalfSpread ?? 0) * clamped,
            volL: entry.volLStart + (entry.volLSpread ?? 0) * clamped,
            volR: entry.volRStart + (entry.volRSpread ?? 0) * clamped
        };
    }

    #extendVoicesToDuration(voices, scheduleDuration) {
        const EPSILON = 1e-6;
        voices.forEach((voice) => {
            const baseDuration = voice.entryDurationSeconds ?? voice.totalDurationSeconds ?? 0;
            voice.tail = null;
            voice.totalDurationSeconds = baseDuration;
            voice.loopDurationSeconds = baseDuration;
            if (!voice.entries.length || baseDuration <= 0) {
                return;
            }
            const gap = scheduleDuration - baseDuration;
            if (gap <= EPSILON) {
                voice.totalDurationSeconds = baseDuration;
                voice.loopDurationSeconds = baseDuration;
                return;
            }
            const lastEntry = voice.entries[voice.entries.length - 1];
            if (!lastEntry) {
                return;
            }
            const finalValues = this.#entryValuesAt(lastEntry, 1);
            voice.tail = {
                duration: gap,
                offsetSeconds: baseDuration,
                baseStart: finalValues.base,
                beatHalfStart: finalValues.beatHalf,
                volLStart: finalValues.volL,
                volRStart: finalValues.volR,
                baseSpread: 0,
                beatHalfSpread: 0,
                volLSpread: 0,
                volRSpread: 0,
                state: lastEntry.state
            };
            voice.totalDurationSeconds = baseDuration + gap;
            voice.loopDurationSeconds = voice.totalDurationSeconds;
        });
    }

    #renderVoiceRange(voice, schedule, rangeStart, rangeEnd, left, right, state) {
        const loopLength = schedule.totalDurationSeconds || 1;
        const totalLoops = schedule.loops;
        const voiceLoopLength = voice.loopDurationSeconds ?? voice.totalDurationSeconds;
        const chunkSamples = left.length;

        const startLoop = Math.max(0, Math.floor(rangeStart / loopLength));
        const endLoop = Math.min(totalLoops, Math.ceil(rangeEnd / loopLength));

        for (let loopIndex = startLoop; loopIndex < endLoop; loopIndex += 1) {
            const loopBase = loopIndex * loopLength;
            const loopEnd = loopBase + voiceLoopLength;
            if (loopBase >= rangeEnd) break;
            const loopActiveEnd = Math.min(rangeEnd, loopEnd);
            if (loopActiveEnd <= rangeStart) continue;

            voice.entries.forEach((entry) => {
                if (entry.duration <= 0) return;
                const entryStart = loopBase + entry.offsetSeconds;
                const entryEnd = entryStart + entry.duration;
                if (entryEnd <= rangeStart || entryStart >= rangeEnd) return;

                const segmentStart = Math.max(entryStart, rangeStart);
                const segmentEnd = Math.min(entryEnd, rangeEnd);
                if (segmentEnd <= segmentStart) return;

                const startSample = Math.max(0, Math.floor((segmentStart - rangeStart) * this.sampleRate));
                const endSample = Math.min(chunkSamples, Math.ceil((segmentEnd - rangeStart) * this.sampleRate));
                const sampleCount = Math.max(1, endSample - startSample);
                const progressStart = entry.duration > 0 ? (segmentStart - entryStart) / entry.duration : 0;
                const progressEnd = entry.duration > 0 ? (segmentEnd - entryStart) / entry.duration : 0;

                this.#mixEntrySegment(
                    voice,
                    entry,
                    startSample,
                    sampleCount,
                    progressStart,
                    progressEnd,
                    state,
                    left,
                    right
                );
            });

            if (voice.tail && voice.tail.duration > 0) {
                const tailStart = loopBase + voice.tail.offsetSeconds;
                const tailEnd = tailStart + voice.tail.duration;
                if (tailEnd > rangeStart && tailStart < rangeEnd) {
                    const segmentStart = Math.max(tailStart, rangeStart);
                    const segmentEnd = Math.min(tailEnd, rangeEnd);
                    if (segmentEnd > segmentStart) {
                        const startSample = Math.max(0, Math.floor((segmentStart - rangeStart) * this.sampleRate));
                        const endSample = Math.min(chunkSamples, Math.ceil((segmentEnd - rangeStart) * this.sampleRate));
                        const sampleCount = Math.max(1, endSample - startSample);
                        const progressStart = voice.tail.duration > 0
                            ? (segmentStart - tailStart) / voice.tail.duration
                            : 0;
                        const progressEnd = voice.tail.duration > 0
                            ? (segmentEnd - tailStart) / voice.tail.duration
                            : 0;

                        this.#mixEntrySegment(
                            voice,
                            voice.tail,
                            startSample,
                            sampleCount,
                            progressStart,
                            progressEnd,
                            state,
                            left,
                            right
                        );
                    }
                }
            }
        }
    }

    #mixEntrySegment(voice, entry, startSample, sampleCount, progressStart, progressEnd, state, left, right) {
        switch (voice.type) {
            case 0:
                this.#mixBinaural(entry, voice.mono, startSample, sampleCount, progressStart, progressEnd, left, right, state);
                break;
            case 1:
                this.#mixPinkNoise(entry, voice.mono, startSample, sampleCount, progressStart, progressEnd, left, right, state);
                break;
            case 2:
                this.#mixSampleVoice(voice, entry, startSample, sampleCount, progressStart, progressEnd, left, right, state);
                break;
            case 3:
                this.#mixWhiteNoise(entry, voice.mono, startSample, sampleCount, progressStart, progressEnd, left, right, state);
                break;
            case 4:
                this.#mixBrownNoise(entry, voice.mono, startSample, sampleCount, progressStart, progressEnd, left, right, state);
                break;
            default:
                break;
        }
    }

    #mixBinaural(entry, mono, startSample, sampleCount, progressStart, progressEnd, left, right, state) {
        const chunkLength = left.length;
        const progressDelta = sampleCount > 1 ? (progressEnd - progressStart) / (sampleCount - 1) : 0;
        let progress = progressStart;
        for (let i = 0; i < sampleCount; i += 1) {
            const clamped = clamp(progress, 0, 1);
            const base = entry.baseStart + entry.baseSpread * clamped;
            const beatHalf = entry.beatHalfStart + entry.beatHalfSpread * clamped;
            const freqL = Math.max(0, base + beatHalf);
            const freqR = Math.max(0, base - beatHalf);
            const deltaL = TWO_PI * freqL / this.sampleRate;
            const deltaR = TWO_PI * freqR / this.sampleRate;
            state.phaseL = (state.phaseL + deltaL) % TWO_PI;
            state.phaseR = (state.phaseR + deltaR) % TWO_PI;
            const volL = entry.volLStart + entry.volLSpread * clamped;
            const volR = entry.volRStart + entry.volRSpread * clamped;
            const gainL = mono ? 0.5 * (volL + volR) : volL;
            const gainR = mono ? 0.5 * (volL + volR) : volR;
            const sampleIndex = startSample + i;
            if (sampleIndex >= chunkLength) break;
            left[sampleIndex] += Math.sin(state.phaseL) * gainL;
            right[sampleIndex] += Math.sin(state.phaseR) * gainR;
            progress += progressDelta;
        }
    }

    #mixPinkNoise(entry, mono, startSample, sampleCount, progressStart, progressEnd, left, right, state) {
        if (!state.noise) {
            state.noise = new PinkNoiseGenerator();
        }
        const chunkLength = left.length;
        const progressDelta = sampleCount > 1 ? (progressEnd - progressStart) / (sampleCount - 1) : 0;
        let progress = progressStart;
        for (let i = 0; i < sampleCount; i += 1) {
            const clamped = clamp(progress, 0, 1);
            const volL = entry.volLStart + entry.volLSpread * clamped;
            const volR = entry.volRStart + entry.volRSpread * clamped;
            const noiseL = state.noise.next();
            const noiseR = state.noise.next();
            const sampleIndex = startSample + i;
            if (sampleIndex >= chunkLength) break;
            if (mono) {
                const monoSample = (noiseL + noiseR) * 0.5;
                const gain = 0.5 * (volL + volR);
                left[sampleIndex] += monoSample * gain;
                right[sampleIndex] += monoSample * gain;
            } else {
                left[sampleIndex] += noiseL * volL;
                right[sampleIndex] += noiseR * volR;
            }
            progress += progressDelta;
        }
    }

    #mixWhiteNoise(entry, mono, startSample, sampleCount, progressStart, progressEnd, left, right, state) {
        if (!state.white) {
            state.white = new WhiteNoiseGenerator();
        }
        const chunkLength = left.length;
        const progressDelta = sampleCount > 1 ? (progressEnd - progressStart) / (sampleCount - 1) : 0;
        let progress = progressStart;
        for (let i = 0; i < sampleCount; i += 1) {
            const clamped = clamp(progress, 0, 1);
            const volL = entry.volLStart + entry.volLSpread * clamped;
            const volR = entry.volRStart + entry.volRSpread * clamped;
            const sampleIndex = startSample + i;
            if (sampleIndex >= chunkLength) break;
            const sampleValue = state.white.next();
            if (mono) {
                const gain = 0.5 * (volL + volR);
                left[sampleIndex] += sampleValue * gain;
                right[sampleIndex] += sampleValue * gain;
            } else {
                left[sampleIndex] += sampleValue * volL;
                right[sampleIndex] += state.white.next() * volR;
            }
            progress += progressDelta;
        }
    }

    #mixBrownNoise(entry, mono, startSample, sampleCount, progressStart, progressEnd, left, right, state) {
        if (!state.brown) {
            state.brown = new BrownNoiseGenerator();
        }
        const chunkLength = left.length;
        const progressDelta = sampleCount > 1 ? (progressEnd - progressStart) / (sampleCount - 1) : 0;
        let progress = progressStart;
        for (let i = 0; i < sampleCount; i += 1) {
            const clamped = clamp(progress, 0, 1);
            const volL = entry.volLStart + entry.volLSpread * clamped;
            const volR = entry.volRStart + entry.volRSpread * clamped;
            const sampleIndex = startSample + i;
            if (sampleIndex >= chunkLength) break;
            const value = state.brown.next();
            if (mono) {
                const gain = 0.5 * (volL + volR);
                left[sampleIndex] += value * gain;
                right[sampleIndex] += value * gain;
            } else {
                left[sampleIndex] += value * volL;
                right[sampleIndex] += state.brown.next() * volR;
            }
            progress += progressDelta;
        }
    }

    #mixSampleVoice(voice, entry, startSample, sampleCount, progressStart, progressEnd, left, right, state) {
        const buffer = voice.sampleBuffer;
        if (!buffer || !buffer.length) return;
        if (typeof state.samplePosition !== 'number') {
            state.samplePosition = 0;
        }
        const sampleLeft = buffer.left;
        const sampleRight = buffer.right || buffer.left;
        const sampleLength = buffer.length;
        const rateRatio = buffer.sampleRate > 0 ? buffer.sampleRate / this.sampleRate : 1;
        if (!sampleLeft || sampleLength <= 0 || rateRatio <= 0) return;
        const chunkLength = left.length;
        const progressDelta = sampleCount > 1 ? (progressEnd - progressStart) / (sampleCount - 1) : 0;
        let progress = progressStart;
        let position = state.samplePosition || 0;
        for (let i = 0; i < sampleCount; i += 1) {
            const sampleIndex = startSample + i;
            if (sampleIndex >= chunkLength) break;
            const clamped = clamp(progress, 0, 1);
            const volL = entry.volLStart + entry.volLSpread * clamped;
            const volR = entry.volRStart + entry.volRSpread * clamped;
            const baseIndex = Math.floor(position) % sampleLength;
            const nextIndex = (baseIndex + 1) % sampleLength;
            const frac = position - Math.floor(position);
            const sampleValueL = sampleLeft[baseIndex] + (sampleLeft[nextIndex] - sampleLeft[baseIndex]) * frac;
            const sampleValueR = sampleRight[nextIndex] !== undefined
                ? sampleRight[baseIndex] + (sampleRight[nextIndex] - sampleRight[baseIndex]) * frac
                : sampleValueL;
            if (voice.mono || sampleRight === sampleLeft) {
                const monoSample = (sampleValueL + sampleValueR) * 0.5;
                const gain = 0.5 * (volL + volR);
                left[sampleIndex] += monoSample * gain;
                right[sampleIndex] += monoSample * gain;
            } else {
                left[sampleIndex] += sampleValueL * volL;
                right[sampleIndex] += sampleValueR * volR;
            }
            progress += progressDelta;
            position += rateRatio;
            if (position >= sampleLength) {
                position %= sampleLength;
            }
        }
        state.samplePosition = position;
    }

    #normalizeChunk(left, right) {
        let peak = 0;
        for (let i = 0; i < left.length; i += 1) {
            peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        }
        if (peak > 0.99) {
            const scale = 0.99 / peak;
            for (let i = 0; i < left.length; i += 1) {
                left[i] *= scale;
                right[i] *= scale;
            }
        }
    }
}

class ScheduleStream {
    constructor(engine, schedule, offsetSeconds = 0) {
        this.engine = engine;
        this.schedule = schedule;
        this.sampleRate = engine.sampleRate;
        this.totalSeconds = schedule.totalDurationSeconds * schedule.loops;
        this.positionSeconds = clamp(offsetSeconds, 0, this.totalSeconds);
        const seedBase = Math.max(1, Math.floor(offsetSeconds * 1000));
        this.voiceStates = schedule.voices.map((voice, index) => ({
            phaseL: 0,
            phaseR: 0,
            noise: voice.type === 1 ? new PinkNoiseGenerator(seedBase + index * 7919) : null,
            white: voice.type === 3 ? new WhiteNoiseGenerator(seedBase + index * 3571) : null,
            samplePosition: voice.type === 2 ? 0 : 0
        }));
    }

    renderSeconds(durationSeconds) {
        if (this.positionSeconds >= this.totalSeconds) return null;
        const chunkDuration = Math.min(durationSeconds, this.totalSeconds - this.positionSeconds);
        if (chunkDuration <= 0) return null;
        const segment = this.engine.renderRange(this.schedule, this.positionSeconds, chunkDuration, this.voiceStates);
        this.positionSeconds += segment.duration;
        return segment;
    }
}

class WaterfallRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyser = null;
        this.freqData = null;
        this.sampleRate = 44100;
        this.binMapCache = { width: 0, bins: 0, map: null };
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.#draw();
    }

    setAnalyser(analyser) {
        this.analyser = analyser;
        if (this.analyser) {
            this.sampleRate = this.analyser.context?.sampleRate || this.sampleRate;
            this.analyser.fftSize = 1024;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        } else {
            this.freqData = null;
        }
        this.binMapCache.width = 0;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.binMapCache.width = 0;
    }

    #getLogBinMap(width) {
        if (!this.freqData || width <= 0) return null;
        if (
            this.binMapCache.width === width &&
            this.binMapCache.bins === this.freqData.length &&
            this.binMapCache.map
        ) {
            return this.binMapCache.map;
        }
        const bins = this.freqData.length;
        const nyquist = Math.max(1000, (this.sampleRate || 44100) / 2);
        const minHz = 20;
        const logMin = Math.log(minHz);
        const logMax = Math.log(nyquist);
        if (!Number.isFinite(logMin) || !Number.isFinite(logMax) || logMax - logMin <= 0) {
            return null;
        }
        const denom = logMax - logMin;
        const map = new Float32Array(width);
        const maxIndex = Math.max(1, bins - 1);
        for (let x = 0; x < width; x += 1) {
            const ratio = width > 1 ? x / (width - 1) : 0;
            const freq = Math.exp(logMin + ratio * denom);
            const binRatio = Math.min(1, Math.max(0, freq / nyquist));
            map[x] = binRatio * maxIndex;
        }
        this.binMapCache = { width, bins, map };
        return map;
    }

    #draw() {
        requestAnimationFrame(() => this.#draw());
        if (!this.analyser || !this.freqData) {
            this.#fadeCanvas();
            return;
        }
        this.analyser.getByteFrequencyData(this.freqData);
        const { width, height } = this.canvas;
        this.ctx.drawImage(this.canvas, 0, 0, width, height, 0, 1, width, height);
        const binMap = this.#getLogBinMap(width);
        if (!binMap) {
            this.#fadeCanvas();
            return;
        }
        const bins = this.freqData.length;
        for (let x = 0; x < width; x += 1) {
            const mapped = binMap[x];
            const i0 = Math.floor(mapped);
            const i1 = Math.min(bins - 1, i0 + 1);
            const frac = mapped - i0;
            const mag0 = this.freqData[i0] ?? 0;
            const mag1 = this.freqData[i1] ?? 0;
            const magnitude = ((mag0 * (1 - frac)) + (mag1 * frac)) / 255;
            const hue = 200 - magnitude * 160;
            const lightness = 10 + magnitude * 60;
            this.ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
            this.ctx.fillRect(x, 0, 1, 1);
        }
        this.ctx.fillStyle = 'rgba(0,0,0,0.015)';
        this.ctx.fillRect(0, 0, width, height);
    }

    #fadeCanvas() {
        const { width, height } = this.canvas;
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#040b1a');
        gradient.addColorStop(1, '#030612');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
    }
}

class GnauralApp {
    constructor() {
        this.engine = new GnauralEngine();
        this.sampleCache = new Map();
        this.decodeContext = null;
        this.state = {
            schedule: null,
            renderStream: null,
            bufferTimeline: [],
            bufferedSeconds: 0,
            totalSeconds: 0,
            loadingStage: '',
            loadingMode: 'buffer',
            loadingManualRatio: 0,
            loadingTargetSeconds: 0,
            loadingBaselineSeconds: 0,
            renderQueue: Promise.resolve(),
            audioCtx: null,
            masterGain: null,
            stereoPanner: null,
            analyser: null,
            isPlaying: false,
            playheadSeconds: 0,
            playStartContextTime: 0,
            playStartOffset: 0,
            audioCtxTailTime: 0,
            activeSources: [],
            bufferMonitorId: null,
            nextMinuteRenderMark: 60,
            timelineScrubbing: false
        };
        this.timelinePointerUpHandler = () => {
            this.state.timelineScrubbing = false;
            document.removeEventListener('pointerup', this.timelinePointerUpHandler);
        };
        this.ui = this.#bindUI();
        this.editor = new ScheduleEditor({ app: this, soundLibrary: SOUND_LIBRARY });
        this.#setTimelineSliderEnabled(false);
        this.preferences = this.#loadPreferences();
        this.standardFiles = [];
        this.restoringFromStorage = false;
        this.waterfall = new WaterfallRenderer(document.getElementById('waterfall'));
        this.#setVolume(this.ui.volumeSlider.value);
        this.#setBalance(this.ui.balanceSlider.value);
        this.#initCookieControls();
        this.#loadStandardFilesConfig();
        if (!this.#maybeRestoreSession()) {
            this.#loadDefaultSchedule();
        }
    }

    #bindUI() {
        const refs = {
            playButton: document.getElementById('playButton'),
            volumeSlider: document.getElementById('volumeSlider'),
            balanceSlider: document.getElementById('balanceSlider'),
            statusLine: document.getElementById('statusLine'),
            scheduleTitle: document.getElementById('scheduleTitle'),
            scheduleAuthor: document.getElementById('scheduleAuthor'),
            scheduleDuration: document.getElementById('scheduleDuration'),
            voiceCount: document.getElementById('voiceCount'),
            volumeValue: document.getElementById('volumeValue'),
            balanceValue: document.getElementById('balanceValue'),
            fileInput: document.getElementById('fileInput'),
            timelineSlider: document.getElementById('timelineSlider'),
            timelineValue: document.getElementById('timelineValue'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingLabel: document.querySelector('.loading-label'),
            loadingProgress: document.getElementById('loadingProgress'),
            loadingDetail: document.getElementById('loadingDetail'),
            gearButton: document.getElementById('gearButton'),
            gearMenu: document.getElementById('gearMenu'),
            standardFilesModal: document.getElementById('standardFilesModal'),
            standardFilesList: document.getElementById('standardFilesList'),
            cookieBanner: document.getElementById('cookieBanner'),
            cookieAccept: document.getElementById('cookieAccept'),
            cookieDecline: document.getElementById('cookieDecline')
        };
        refs.playButton.addEventListener('click', () => this.#togglePlay());
        refs.volumeSlider.addEventListener('input', (event) => this.#setVolume(event.target.value));
        refs.balanceSlider.addEventListener('input', (event) => this.#setBalance(event.target.value));
        refs.fileInput.addEventListener('change', (event) => this.#handleFile(event));
        if (refs.timelineSlider) {
            refs.timelineSlider.addEventListener('input', (event) => this.#handleTimelineInput(event.target.value));
            refs.timelineSlider.addEventListener('change', (event) => this.#handleTimelineCommit(event.target.value));
            refs.timelineSlider.addEventListener('pointerdown', () => {
                this.state.timelineScrubbing = true;
                document.addEventListener('pointerup', this.timelinePointerUpHandler, { once: true });
            });
        }
        if (refs.gearButton && refs.gearMenu) {
            refs.gearButton.addEventListener('click', () => {
                refs.gearMenu.classList.toggle('open');
            });
            refs.gearMenu.querySelectorAll('button').forEach((button) => {
                button.addEventListener('click', () => {
                    refs.gearMenu.classList.remove('open');
                    this.#handleMenuAction(button.dataset.action);
                });
            });
            document.addEventListener('click', (event) => {
                if (!refs.gearMenu.contains(event.target) && !refs.gearButton.contains(event.target)) {
                    refs.gearMenu.classList.remove('open');
                }
            });
        }
        document.querySelectorAll('.footer-button').forEach((button) => {
            button.addEventListener('click', () => this.#openModal(button.dataset.modal));
        });
        document.querySelectorAll('[data-close]').forEach((button) => {
            button.addEventListener('click', () => {
                const modal = button.closest('.modal');
                if (modal) {
                    modal.classList.remove('open');
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        });
        document.querySelectorAll('.modal').forEach((modal) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.classList.remove('open');
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        });
        return refs;
    }

    async #loadDefaultSchedule() {
        this.#setStatus('Loading default schedule…');
        await this.#loadScheduleText(DEFAULT_SCHEDULE_XML.trim(), 'Built-in default');
    }

    async #handleFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        this.#setStatus(`Loading ${file.name}…`);
        const text = await file.text();
        await this.#loadScheduleText(text, file.name);
        event.target.value = '';
    }

    async #loadScheduleText(xmlText, sourceLabel, options = {}) {
        const { fromPersistence = false, resumePosition = 0 } = options;
        try {
            const schedule = this.engine.parseXml(xmlText);
            schedule.metadata.source = sourceLabel;
            this.state.schedule = schedule;
            this.#updateMetadata(schedule);
            this.#rememberCurrentSchedule(xmlText, sourceLabel);
            await this.#prepareSchedule(schedule, { resumePosition: fromPersistence ? resumePosition : 0 });
            if (fromPersistence && resumePosition > 0) {
                await this.#seekTo(resumePosition, { silent: true });
            }
            this.#setStatus(`Ready • ${formatDuration(Math.min(this.state.bufferedSeconds, this.state.totalSeconds))} cached`);
        } catch (error) {
            console.error(error);
            this.#setStatus(error.message || 'Failed to load schedule');
        }
    }

    async #prepareSchedule(schedule, options = {}) {
        this.#stopPlayback(true);
        this.state.renderQueue = Promise.resolve();
        this.state.bufferTimeline = [];
        this.state.bufferedSeconds = 0;
        this.state.playheadSeconds = 0;
        const nextMinuteMark = Math.floor(this.state.playheadSeconds / 60) * 60 + 60;
        this.state.nextMinuteRenderMark = nextMinuteMark;
        this.state.totalSeconds = schedule.totalDurationSeconds * schedule.loops;
        await this.#ensureSampleBuffers(schedule);
        this.state.renderStream = this.engine.createStream(schedule, 0);
        const initialTargetSeconds = Math.min(this.state.totalSeconds, RENDER_CONFIG.initialMinutes * 60);
        if (initialTargetSeconds > 0) {
            this.#beginLoadingStage('Buffering', { mode: 'buffer', baselineSeconds: 0, targetSeconds: initialTargetSeconds });
            await this.#queueRender(initialTargetSeconds);
            this.#endLoadingStage();
        } else {
            this.#endLoadingStage();
        }
        this.#setTimelineSliderEnabled(this.state.totalSeconds > 0);
        this.#updateTimelineUI(this.state.playheadSeconds, { force: true });
    }

    async #queueRender(targetSeconds) {
        if (!this.state.renderStream) return;
        const cappedTarget = Math.min(targetSeconds, this.state.totalSeconds);
        if (cappedTarget <= this.state.bufferedSeconds) return;
        this.state.renderQueue = this.state.renderQueue.then(() => this.#renderUpTo(cappedTarget));
        await this.state.renderQueue;
    }

    async #renderUpTo(targetSeconds) {
        if (!this.state.renderStream) return;
        while (this.state.renderStream && this.state.bufferedSeconds < targetSeconds) {
            const remaining = targetSeconds - this.state.bufferedSeconds;
            const chunkSeconds = Math.min(remaining, RENDER_CONFIG.chunkMinutes * 60);
            if (chunkSeconds <= 0) break;
            const segment = this.state.renderStream.renderSeconds(chunkSeconds);
            if (!segment) {
                this.state.renderStream = null;
                break;
            }
            this.#storeSegment(segment);
            await nextFrame();
        }
    }

    #storeSegment(segment) {
        const start = this.state.bufferTimeline.length
            ? this.state.bufferTimeline[this.state.bufferTimeline.length - 1].end
            : this.state.bufferedSeconds;
        const effectiveDuration = segment.playbackDuration ?? segment.duration;
        const entry = {
            start,
            duration: effectiveDuration,
            playbackDuration: effectiveDuration,
            end: start + effectiveDuration,
            left: segment.left,
            right: segment.right,
            audioBuffer: null
        };
        this.state.bufferTimeline.push(entry);
        this.state.bufferedSeconds = entry.end;
        if (Math.abs(this.state.bufferedSeconds - this.state.totalSeconds) < 1e-6) {
            this.state.renderStream = null;
        }
        this.#updateLoadingProgress();
        if (this.state.isPlaying && entry.end > this.state.playheadSeconds) {
            this.#scheduleSegment(entry);
        }
    }

    async #togglePlay() {
        if (!this.state.schedule) return;
        await this.#ensureAudioGraph();
        if (this.state.isPlaying) {
            this.#pausePlayback();
        } else {
            this.#startPlayback();
        }
    }

    async #ensureAudioGraph() {
        if (this.state.audioCtx) return;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: this.engine.sampleRate
        });
        const masterGain = audioCtx.createGain();
        const stereoPanner = audioCtx.createStereoPanner();
        const analyser = audioCtx.createAnalyser();
        masterGain.gain.value = DEFAULT_VOLUME / 100;
        stereoPanner.pan.value = 0;
        masterGain.connect(stereoPanner).connect(analyser).connect(audioCtx.destination);
        this.state.audioCtx = audioCtx;
        this.state.masterGain = masterGain;
        this.state.stereoPanner = stereoPanner;
        this.state.analyser = analyser;
        this.waterfall.setAnalyser(analyser);
        this.#setVolume(this.ui.volumeSlider.value);
        this.#setBalance(this.ui.balanceSlider.value);
    }

    async #startPlayback() {
        if (this.state.bufferTimeline.length === 0) {
            await this.#queueRender(Math.min(this.state.totalSeconds, RENDER_CONFIG.chunkMinutes * 60));
            if (this.state.bufferTimeline.length === 0) {
                this.#setStatus('Nothing to play yet');
                return;
            }
        }
        const offset = this.state.playheadSeconds;
        const scheduled = this.#scheduleFrom(offset);
        if (!scheduled) {
            this.#setStatus('Need more buffered audio');
            return;
        }
        if (this.state.audioCtx.state === 'suspended') {
            await this.state.audioCtx.resume();
        }
        this.state.isPlaying = true;
        this.ui.playButton.textContent = 'Pause';
        this.#setStatus('Playing');
        this.#startBufferMonitor();
    }

    #scheduleFrom(offsetSeconds) {
        const ctx = this.state.audioCtx;
        if (!ctx || !this.state.masterGain) return false;
        const segments = this.state.bufferTimeline.filter((segment) => segment.end > offsetSeconds);
        if (segments.length === 0) return false;
        const now = ctx.currentTime;
        this.state.playStartContextTime = now;
        this.state.playStartOffset = offsetSeconds;
        this.state.audioCtxTailTime = now;
        this.state.activeSources = [];

        let startTime = now;
        let offsetWithinSegment = offsetSeconds - segments[0].start;
        if (offsetWithinSegment < 0) offsetWithinSegment = 0;

        let scheduledAny = false;
        segments.forEach((segment, index) => {
            const buffer = this.#ensureAudioBuffer(segment);
            if (!buffer) return;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.state.masterGain);
            const offsetInSegment = index === 0 ? offsetWithinSegment : 0;
            const durationRemaining = Math.max(0, segment.playbackDuration - offsetInSegment);
            if (durationRemaining <= 0) return;
            const node = { source, segment };
            source.onended = () => this.#handleSegmentEnded(node);
            source.start(startTime, offsetInSegment);
            this.state.activeSources.push(node);
            startTime += durationRemaining;
            this.state.audioCtxTailTime = startTime;
            scheduledAny = true;
        });
        return scheduledAny;
    }

    #scheduleSegment(segment) {
        if (!this.state.isPlaying || !this.state.audioCtx || !this.state.masterGain) return;
        if (segment.end <= this.state.playheadSeconds) return;
        const buffer = this.#ensureAudioBuffer(segment);
        if (!buffer) return;
        const ctx = this.state.audioCtx;
        const startTime = Math.max(this.state.audioCtxTailTime || ctx.currentTime, ctx.currentTime);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.state.masterGain);
        const node = { source, segment };
        source.onended = () => this.#handleSegmentEnded(node);
        source.start(startTime);
        this.state.activeSources.push(node);
        this.state.audioCtxTailTime = startTime + segment.playbackDuration;
    }

    #ensureAudioBuffer(segment) {
        if (segment.audioBuffer) return segment.audioBuffer;
        if (!this.state.audioCtx) return null;
        const buffer = this.state.audioCtx.createBuffer(2, segment.left.length, this.engine.sampleRate);
        buffer.copyToChannel(segment.left, 0, 0);
        buffer.copyToChannel(segment.right, 1, 0);
        segment.audioBuffer = buffer;
        return buffer;
    }

    #pausePlayback() {
        if (!this.state.isPlaying) return;
        this.state.playheadSeconds = this.#currentPlaybackTime();
        this.#updateTimelineUI(this.state.playheadSeconds, { force: true });
        this.#recordPlaybackPosition();
        this.#unscheduleAllSources();
        this.state.isPlaying = false;
        this.ui.playButton.textContent = 'Play';
        this.#setStatus('Paused');
        if (this.state.bufferMonitorId) {
            cancelAnimationFrame(this.state.bufferMonitorId);
            this.state.bufferMonitorId = null;
        }
    }

    #stopPlayback(silent = false) {
        if (this.state.audioCtx) {
            this.#unscheduleAllSources();
        }
        this.state.isPlaying = false;
        this.state.playheadSeconds = 0;
        if (!silent) {
            this.ui.playButton.textContent = 'Play';
        }
        if (this.state.bufferMonitorId) {
            cancelAnimationFrame(this.state.bufferMonitorId);
            this.state.bufferMonitorId = null;
        }
    }

    #unscheduleAllSources() {
        this.state.activeSources.forEach(({ source }) => {
            try {
                source.stop();
            } catch (e) {
                // no-op
            }
            source.disconnect();
        });
        this.state.activeSources = [];
        this.state.audioCtxTailTime = this.state.audioCtx ? this.state.audioCtx.currentTime : 0;
    }

    #handleSegmentEnded(node) {
        try {
            node.source.disconnect();
        } catch (e) {
            // ignore
        }
        this.state.activeSources = this.state.activeSources.filter((item) => item !== node);
        this.state.playheadSeconds = this.#currentPlaybackTime();
        this.#updateTimelineUI(this.state.playheadSeconds, { force: true });
        this.#recordPlaybackPosition();
        this.#trimConsumedSegments();
        if (
            this.state.activeSources.length === 0 &&
            this.state.bufferedSeconds >= this.state.totalSeconds &&
            !this.state.renderStream
        ) {
            this.#handleEnded();
        }
    }

    #trimConsumedSegments() {
        const playbackSeconds = this.#currentPlaybackTime();
        while (this.state.bufferTimeline.length && this.state.bufferTimeline[0].end <= playbackSeconds - 1) {
            this.state.bufferTimeline.shift();
        }
    }

    #handleEnded() {
        this.state.isPlaying = false;
        this.state.playheadSeconds = this.state.totalSeconds;
        this.ui.playButton.textContent = 'Play';
        this.#setStatus('Playback finished');
        this.#updateTimelineUI(this.state.playheadSeconds, { force: true });
        this.#recordPlaybackPosition();
        this.state.playheadSeconds = 0;
        this.#updateTimelineUI(0, { force: true });
        if (this.state.bufferMonitorId) {
            cancelAnimationFrame(this.state.bufferMonitorId);
            this.state.bufferMonitorId = null;
        }
    }

    #currentPlaybackTime() {
        if (!this.state.isPlaying || !this.state.audioCtx) return this.state.playheadSeconds;
        const elapsed = this.state.audioCtx.currentTime - this.state.playStartContextTime;
        const absolute = this.state.playStartOffset + Math.max(0, elapsed);
        return Math.min(absolute, this.state.totalSeconds);
    }

    #startBufferMonitor() {
        if (this.state.bufferMonitorId) {
            cancelAnimationFrame(this.state.bufferMonitorId);
        }
        const tick = () => {
            if (!this.state.isPlaying) {
                this.state.bufferMonitorId = null;
                return;
            }
            const playbackSeconds = this.#currentPlaybackTime();
            this.state.playheadSeconds = playbackSeconds;
            this.#updateTimelineUI(playbackSeconds);
            if (playbackSeconds >= this.state.nextMinuteRenderMark) {
                this.state.nextMinuteRenderMark += 60;
                this.#queueRender(this.state.bufferedSeconds + RENDER_CONFIG.chunkMinutes * 60);
            }
            this.state.bufferMonitorId = requestAnimationFrame(tick);
        };
        this.state.bufferMonitorId = requestAnimationFrame(tick);
    }

    #setVolume(value) {
        const numeric = clamp(Number(value), 0, 100);
        this.ui.volumeValue.textContent = `${numeric}%`;
        if (this.state.masterGain) {
            this.state.masterGain.gain.value = numeric / 100;
        }
        if (this.preferences.consent) {
            this.preferences.volume = numeric;
            this.#savePreferences();
        }
    }

    #setBalance(value) {
        const numeric = clamp(Number(value), -1, 1);
        this.ui.balanceValue.textContent = formatBalance(numeric);
        if (this.state.stereoPanner) {
            this.state.stereoPanner.pan.value = numeric;
        }
    }

    #handleTimelineInput(value) {
        if (!this.ui.timelineSlider || !this.state.totalSeconds) return;
        const ratio = clamp(Number(value) / 100, 0, 1);
        if (!this.state.timelineScrubbing && document.activeElement === this.ui.timelineSlider) {
            this.state.timelineScrubbing = true;
        }
        const seconds = ratio * this.state.totalSeconds;
        this.#setTimelineProgressVisual(ratio);
        this.ui.timelineValue.textContent = formatTimecode(seconds);
    }

    async #handleTimelineCommit(value) {
        if (!this.state.totalSeconds) return;
        const ratio = clamp(Number(value) / 100, 0, 1);
        this.state.timelineScrubbing = false;
        try {
            await this.#seekTo(ratio * this.state.totalSeconds);
        } catch (error) {
            console.error(error);
            this.#setStatus('Seek failed');
        }
    }

    async #seekTo(seconds, options = {}) {
        if (!this.state.schedule) return;
        const target = clamp(seconds, 0, this.state.totalSeconds || 0);
        const silent = !!options.silent;
        if (!silent) {
            this.#setStatus('Seeking…');
            this.#beginLoadingStage('Seeking', { mode: 'manual' });
            this.#updateManualLoadingProgress(0.1);
        }
        const wasPlaying = this.state.isPlaying;
        if (this.state.isPlaying) {
            this.#pausePlayback();
        }
        if (!silent) this.#updateManualLoadingProgress(0.4);
        this.state.playheadSeconds = target;
        this.state.bufferTimeline = [];
        this.state.bufferedSeconds = target;
        this.state.audioCtxTailTime = this.state.audioCtx ? this.state.audioCtx.currentTime : 0;
        this.state.activeSources = [];
        this.state.renderQueue = Promise.resolve();
        this.state.renderStream = this.engine.createStream(this.state.schedule, target);
        const nextMinuteMark = Math.floor(target / 60) * 60 + 60;
        this.state.nextMinuteRenderMark = nextMinuteMark;
        this.#updateTimelineUI(target, { force: true });
        if (!silent) this.#updateManualLoadingProgress(1);
        const quickEnd = Math.min(this.state.totalSeconds, target + QUICK_SEEK_BUFFER_SECONDS);
        const fullEnd = Math.min(this.state.totalSeconds, target + RENDER_CONFIG.initialMinutes * 60);
        if (quickEnd > target) {
            if (!silent) {
                this.#beginLoadingStage('Buffering', {
                    mode: 'buffer',
                    baselineSeconds: target,
                    targetSeconds: quickEnd
                });
            }
            await this.#queueRender(quickEnd);
            if (!silent) this.#endLoadingStage();
        } else {
            if (!silent) this.#endLoadingStage();
        }
        if (fullEnd > quickEnd) {
            this.#queueRender(fullEnd);
        }
        if (wasPlaying) {
            await this.#startPlayback();
        } else {
            this.#setStatus('Ready');
        }
        if (silent) {
            this.#setStatus('Ready');
        }
        this.#recordPlaybackPosition();
    }

    #updateTimelineUI(seconds, options = {}) {
        if (!this.ui.timelineSlider || !this.state.totalSeconds) return;
        const { force = false } = options;
        if (this.state.timelineScrubbing && !force) return;
        const ratio = clamp(seconds / this.state.totalSeconds, 0, 1);
        this.ui.timelineSlider.value = (ratio * 100).toFixed(3);
        this.#setTimelineProgressVisual(ratio);
        this.ui.timelineValue.textContent = formatTimecode(seconds);
    }

    #setTimelineProgressVisual(ratio) {
        if (!this.ui.timelineSlider) return;
        const percent = `${(ratio * 100).toFixed(2)}%`;
        this.ui.timelineSlider.style.setProperty('--timeline-progress', percent);
    }

    #setTimelineSliderEnabled(enabled) {
        if (!this.ui.timelineSlider) return;
        this.ui.timelineSlider.disabled = !enabled;
    }

    #openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    #handleMenuAction(action) {
        switch (action) {
            case 'standard':
                this.#openStandardFilesModal();
                break;
            case 'import':
                this.ui.fileInput?.click();
                break;
            case 'new':
                this.editor?.open(this.createBlankScheduleData(), { mode: 'new' });
                break;
            case 'edit': {
                const data = this.state.schedule
                    ? this.cloneScheduleData(this.state.schedule)
                    : this.createBlankScheduleData();
                this.editor?.open(data, { mode: 'edit' });
                break;
            }
            default:
        }
    }

    async #loadStandardFilesConfig() {
        try {
            const response = await fetch('standard-files.json');
            if (!response.ok) throw new Error('Failed');
            this.standardFiles = await response.json();
        } catch (error) {
            this.standardFiles = [];
        }
        this.#populateStandardFilesModal();
    }

    #populateStandardFilesModal() {
        if (!this.ui.standardFilesList) return;
        if (!this.standardFiles.length) {
            this.ui.standardFilesList.innerHTML = '<p>No standard files configured.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'standard-files-list';
        this.standardFiles.forEach((file) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'standard-file-item';
            item.innerHTML = `<strong>${file.name}</strong><span>${file.description || file.path}</span>`;
            item.addEventListener('click', () => this.#loadStandardFile(file));
            list.appendChild(item);
        });
        this.ui.standardFilesList.innerHTML = '';
        this.ui.standardFilesList.appendChild(list);
    }

    #openStandardFilesModal() {
        if (this.ui.standardFilesModal) {
            this.ui.standardFilesModal.classList.add('open');
            this.ui.standardFilesModal.setAttribute('aria-hidden', 'false');
        }
    }

    async #loadStandardFile(file) {
        try {
            const response = await fetch(file.path);
            if (!response.ok) throw new Error('Failed to fetch file');
            const xml = await response.text();
            if (this.ui.standardFilesModal) {
                this.ui.standardFilesModal.classList.remove('open');
                this.ui.standardFilesModal.setAttribute('aria-hidden', 'true');
            }
            await this.#loadScheduleText(xml, file.name);
        } catch (error) {
            console.error(error);
            this.#setStatus('Unable to load standard file');
        }
    }

    #updateMetadata(schedule) {
        this.ui.scheduleTitle.textContent = schedule.metadata.title;
        this.ui.scheduleAuthor.textContent = schedule.metadata.author || 'Unknown';
        this.ui.scheduleDuration.textContent = formatDuration(schedule.totalDurationSeconds * schedule.loops);
        const activeVoices = schedule.voices.filter((voice) => voice.enabled).length;
        this.ui.voiceCount.textContent = `${activeVoices}/${schedule.voices.length}`;
    }

    #setStatus(message) {
        this.ui.statusLine.textContent = message;
    }

    #beginLoadingStage(stage, { mode = 'buffer', targetSeconds = 0, baselineSeconds = 0 } = {}) {
        this.state.loadingStage = stage;
        this.state.loadingMode = mode;
        this.state.loadingManualRatio = 0;
        this.state.loadingTargetSeconds = targetSeconds;
        this.state.loadingBaselineSeconds = baselineSeconds;
        if (this.ui.loadingOverlay) {
            this.ui.loadingOverlay.classList.remove('hidden');
        }
        this.#updateLoadingProgress();
    }

    #updateManualLoadingProgress(ratio) {
        this.state.loadingManualRatio = clamp(ratio, 0, 1);
        if (this.state.loadingMode === 'manual') {
            this.#updateLoadingProgress();
        }
    }

    #updateLoadingProgress() {
        if (!this.ui.loadingOverlay) return;
        if (this.ui.loadingLabel) {
            const label = this.state.loadingStage ? `${this.state.loadingStage}…` : 'Working…';
            this.ui.loadingLabel.textContent = label;
        }
        if (this.state.loadingMode === 'manual') {
            const ratio = this.state.loadingManualRatio;
            this.ui.loadingProgress.style.width = `${(ratio * 100).toFixed(1)}%`;
            this.ui.loadingDetail.textContent = `${Math.round(ratio * 100)}%`;
            return;
        }
        if (!this.state.loadingTargetSeconds) {
            this.ui.loadingProgress.style.width = '0%';
            this.ui.loadingDetail.textContent = '';
            return;
        }
        const baseline = this.state.loadingBaselineSeconds || 0;
        const goal = Math.max(this.state.loadingTargetSeconds, baseline + 1e-6);
        const span = goal - baseline;
        const current = clamp(this.state.bufferedSeconds, baseline, goal);
        const ratio = span > 0 ? (current - baseline) / span : 1;
        this.ui.loadingProgress.style.width = `${(ratio * 100).toFixed(1)}%`;
        const buffered = Math.max(0, current - baseline);
        const targetDelta = Math.max(0, span);
        this.ui.loadingDetail.textContent = `${(buffered / 60).toFixed(1)} / ${(targetDelta / 60).toFixed(1)} min cached`;
    }

    #endLoadingStage() {
        this.state.loadingStage = '';
        this.state.loadingTargetSeconds = 0;
        this.state.loadingBaselineSeconds = 0;
        this.state.loadingManualRatio = 0;
        if (this.ui.loadingOverlay) {
            this.ui.loadingOverlay.classList.add('hidden');
        }
    }

    #loadPreferences() {
        try {
            const raw = localStorage.getItem('gnauralweb_prefs');
            if (!raw) return { consent: false };
            const data = JSON.parse(raw);
            return {
                consent: !!data.consent,
                volume: data.volume ?? DEFAULT_VOLUME,
                scheduleXml: data.scheduleXml || '',
                scheduleLabel: data.scheduleLabel || '',
                lastPosition: data.lastPosition || 0
            };
        } catch (error) {
            return { consent: false };
        }
    }

    #savePreferences() {
        if (!this.preferences.consent) return;
        const data = {
            consent: true,
            volume: this.preferences.volume ?? DEFAULT_VOLUME,
            scheduleXml: this.preferences.scheduleXml || '',
            scheduleLabel: this.preferences.scheduleLabel || '',
            lastPosition: this.preferences.lastPosition || 0
        };
        localStorage.setItem('gnauralweb_prefs', JSON.stringify(data));
    }

    #initCookieControls() {
        if (this.preferences.consent) {
            this.ui.cookieBanner?.classList.add('hidden');
            if (typeof this.preferences.volume === 'number') {
                this.ui.volumeSlider.value = this.preferences.volume;
                this.#setVolume(this.preferences.volume);
            }
        } else {
            this.ui.cookieBanner?.classList.remove('hidden');
        }
        this.ui.cookieAccept?.addEventListener('click', () => this.#enablePersistence());
        this.ui.cookieDecline?.addEventListener('click', () => this.#declinePersistence());
    }

    #enablePersistence() {
        this.preferences.consent = true;
        this.preferences.volume = Number(this.ui.volumeSlider.value);
        if (this.state.currentXml) {
            this.preferences.scheduleXml = this.state.currentXml;
            this.preferences.scheduleLabel = this.state.currentLabel || 'Current Session';
            this.preferences.lastPosition = this.state.playheadSeconds || 0;
        }
        this.#savePreferences();
        this.ui.cookieBanner?.classList.add('hidden');
        if (!this.state.schedule && this.preferences.scheduleXml) {
            this.#maybeRestoreSession();
        }
    }

    #declinePersistence() {
        this.preferences = { consent: false };
        localStorage.removeItem('gnauralweb_prefs');
        this.ui.cookieBanner?.classList.add('hidden');
    }

    #maybeRestoreSession() {
        if (!this.preferences.consent || !this.preferences.scheduleXml) {
            return false;
        }
        this.restoringFromStorage = true;
        this.restoringFromStorage = true;
        this.#loadScheduleText(this.preferences.scheduleXml, this.preferences.scheduleLabel || 'Previous Session', {
            fromPersistence: true,
            resumePosition: this.preferences.lastPosition || 0
        }).finally(() => {
            this.restoringFromStorage = false;
        });
        return true;
    }

    #rememberCurrentSchedule(xmlText, label) {
        this.state.currentXml = xmlText;
        this.state.currentLabel = label;
        if (!this.preferences.consent) return;
        this.preferences.scheduleXml = xmlText;
        this.preferences.scheduleLabel = label;
        this.#savePreferences();
    }

    #recordPlaybackPosition() {
        if (!this.preferences.consent) return;
        this.preferences.lastPosition = this.state.playheadSeconds || 0;
        this.#savePreferences();
    }

    createBlankScheduleData() {
        return {
            metadata: {
                title: 'New Schedule',
                description: 'Custom session',
                author: 'You',
                loops: 1
            },
            overallVolumeLeft: 1,
            overallVolumeRight: 1,
            totalDurationSeconds: 600,
            voices: [
                {
                    description: 'Binaural Beat',
                    type: 0,
                    file: '',
                    entries: [
                        { duration: 120, basefreq: 220, beatfreq: 4, volL: 0.7, volR: 0.7 }
                    ]
                }
            ]
        };
    }

    cloneScheduleData(schedule) {
        if (!schedule) return this.createBlankScheduleData();
        return {
            metadata: {
                title: schedule.metadata?.title || '',
                description: schedule.metadata?.description || '',
                author: schedule.metadata?.author || '',
                loops: schedule.loops || 1
            },
            overallVolumeLeft: schedule.overallVolumeLeft ?? 1,
            overallVolumeRight: schedule.overallVolumeRight ?? 1,
            totalDurationSeconds: schedule.totalDurationSeconds ||
                (schedule.voices || []).reduce((max, voice) => {
                    const sum = (voice.entries || []).reduce((acc, entry) => acc + Number(entry.duration || 0), 0);
                    return Math.max(max, sum);
                }, 0),
            voices: (schedule.voices || []).map((voice) => {
                const desc = voice.description || '';
                const looksLikeFile = desc.endsWith('.ogg') || desc.endsWith('.wav');
                return {
                    description: looksLikeFile ? '' : desc,
                    type: voice.type || 0,
                    file: voice.file || (looksLikeFile ? desc : ''),
                    entries: (voice.entries || []).map((entry) => ({
                        duration: entry.duration || 0,
                        basefreq: entry.baseStart || 0,
                        beatfreq: (entry.beatHalfStart || 0) * 2,
                        volL: entry.volLStart ?? 0.5,
                        volR: entry.volRStart ?? 0.5
                    }))
                };
            })
        };
    }

    async applyEditedSchedule(data) {
        const xml = scheduleToXml(data);
        await this.#loadScheduleText(xml, data.metadata?.title || 'Edited Schedule');
        this.#setStatus('Schedule updated');
    }

    generateScheduleXml(data) {
        return scheduleToXml(data);
    }

    async #ensureSampleBuffers(schedule) {
        const voices = schedule.voices || [];
        if (!voices.length) return;
        const loadTasks = voices
            .filter((voice) => Number(voice.type) === 2 && voice.file)
            .map(async (voice) => {
                try {
                    voice.sampleBuffer = await this.#loadSampleBuffer(voice.file);
                } catch (error) {
                    console.warn('Failed to load sample', voice.file, error);
                    voice.sampleBuffer = null;
                }
            });
        if (loadTasks.length) {
            await Promise.all(loadTasks);
        }
    }

    async #loadSampleBuffer(path) {
        if (!path) return null;
        if (this.sampleCache.has(path)) {
            return this.sampleCache.get(path);
        }
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Unable to load sample: ${path}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const context = await this.#getDecodeContext();
        let audioBuffer;
        if (context.decodeAudioData.length === 1) {
            audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
        } else {
            audioBuffer = await new Promise((resolve, reject) => {
                context.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
            });
        }
        const left = new Float32Array(audioBuffer.length);
        if (typeof audioBuffer.copyFromChannel === 'function') {
            audioBuffer.copyFromChannel(left, 0);
        } else {
            left.set(audioBuffer.getChannelData(0));
        }
        let right = null;
        if (audioBuffer.numberOfChannels > 1) {
            right = new Float32Array(audioBuffer.length);
            if (typeof audioBuffer.copyFromChannel === 'function') {
                audioBuffer.copyFromChannel(right, 1);
            } else {
                right.set(audioBuffer.getChannelData(1));
            }
        }
        const data = {
            left,
            right,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate
        };
        this.sampleCache.set(path, data);
        return data;
    }

    async #getDecodeContext() {
        if (this.decodeContext) return this.decodeContext;
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (OfflineContext) {
            this.decodeContext = new OfflineContext(2, 44100, 44100);
            return this.decodeContext;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.decodeContext = new AudioCtx({ latencyHint: 'playback' });
        return this.decodeContext;
    }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
    return `${secs}s`;
};

const formatTimecode = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const rounded = Math.floor(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatBalance = (value) => {
    if (Math.abs(value) < 0.05) return 'Center';
    if (value < 0) return `${Math.abs(value).toFixed(2)}L`;
    return `${value.toFixed(2)}R`;
};

const scheduleToXml = (data) => {
    const metadata = data.metadata || {};
    const voices = data.voices || [];
    const voiceDuration = voices.reduce((max, voice) => {
        const sum = (voice.entries || []).reduce((acc, entry) => acc + Number(entry.duration || 0), 0);
        return Math.max(max, sum);
    }, 0);
    const totalDuration = Math.max(voiceDuration, Number(data.totalDurationSeconds || 0));
    const voiceXml = voices
        .map((voice, index) => {
            const descriptionText =
                Number(voice.type) === 2 && voice.file ? voice.file : (voice.description || '');
            const entries = (voice.entries || [])
                .map((entry) => {
                    const attrs = [
                        `parent="${index}"`,
                        `duration="${Number(entry.duration || 0)}"`,
                        `volume_left="${Number(entry.volL ?? 0.5)}"`,
                        `volume_right="${Number(entry.volR ?? 0.5)}"`,
                        `beatfreq="${Number(entry.beatfreq ?? 0)}"`,
                        `basefreq="${Number(entry.basefreq ?? 0)}"`,
                        `state="1"`
                    ];
                    return `<entry ${attrs.join(' ')} />`;
                })
                .join('\n');
            return `
<voice>
<description>${descriptionText}</description>
<id>${index}</id>
<type>${voice.type || 0}</type>
<voice_state>1</voice_state>
<voice_hide>0</voice_hide>
<voice_mute>0</voice_mute>
${voice.file ? `<voice_file>${voice.file}</voice_file>` : ''}
<entrycount>${(voice.entries || []).length}</entrycount>
<entries>
${entries}
</entries>
</voice>`;
        })
        .join('\n');
    return `<!-- Generated by Gnaural Web -->\n<schedule>
<gnauralfile_version>1.20101006</gnauralfile_version>
<gnaural_version>1.0</gnaural_version>
<date>${new Date().toUTCString()}</date>
<title>${metadata.title || 'Untitled'}</title>
<schedule_description>${metadata.description || ''}</schedule_description>
<author>${metadata.author || ''}</author>
<totaltime>${Math.max(1, Math.round(totalDuration))}</totaltime>
<voicecount>${voices.length}</voicecount>
<totalentrycount>${voices.reduce((acc, voice) => acc + (voice.entries?.length || 0), 0)}</totalentrycount>
<loops>${metadata.loops || 1}</loops>
<overallvolume_left>${data.overallVolumeLeft ?? 1}</overallvolume_left>
<overallvolume_right>${data.overallVolumeRight ?? 1}</overallvolume_right>
<stereoswap>0</stereoswap>
${voiceXml}
</schedule>`;
};



const DEFAULT_SCHEDULE_XML = `
<!-- Default schedule sourced from the original Gnaural project -->
<schedule>
<gnauralfile_version>1.20080225</gnauralfile_version>
<gnaural_version>0.1.20080225</gnaural_version>
<date>Tue Dec  4 00:00:00 2007
</date>
<title>Gnaural Default Schedule</title>
<schedule_description>Basic meditation schedule with descending base frequency and compensating volume</schedule_description>
<author>Gnaural</author>
<totaltime>4410</totaltime>
<voicecount>2</voicecount>
<totalentrycount>46</totalentrycount>
<loops>1</loops>
<overallvolume_left>1</overallvolume_left>
<overallvolume_right>1</overallvolume_right>
<stereoswap>0</stereoswap>
<voice>
<description>Meditative, spiking occasionally to maintain wakefulness</description>
<id>0</id>
<type>0</type>
<voice_state>1</voice_state>
<voice_hide>0</voice_hide>
<voice_mute>0</voice_mute>
<entrycount>45</entrycount>
<entries>
<entry parent="0" duration="9" volume_left="0.72" volume_right="0.72" beatfreq="0" basefreq="262.35" state="1"/>
<entry parent="0" duration="45" volume_left="0.73" volume_right="0.73" beatfreq="12" basefreq="262.1" state="1"/>
<entry parent="0" duration="60" volume_left="0.73" volume_right="0.73" beatfreq="8" basefreq="260.83" state="1"/>
<entry parent="0" duration="60" volume_left="0.73" volume_right="0.73" beatfreq="6" basefreq="259.14" state="1"/>
<entry parent="0" duration="120" volume_left="0.73" volume_right="0.73" beatfreq="5" basefreq="257.45" state="1"/>
<entry parent="0" duration="180" volume_left="0.73" volume_right="0.73" beatfreq="4.3" basefreq="254.07" state="1"/>
<entry parent="0" duration="180" volume_left="0.74" volume_right="0.74" beatfreq="4" basefreq="249" state="1"/>
<entry parent="0" duration="6" volume_left="0.74" volume_right="0.74" beatfreq="3.9" basefreq="243.94" state="1"/>
<entry parent="0" duration="6" volume_left="0.74" volume_right="0.74" beatfreq="7" basefreq="243.77" state="1"/>
<entry parent="0" duration="360" volume_left="0.74" volume_right="0.74" beatfreq="3.9" basefreq="243.6" state="1"/>
<entry parent="0" duration="6" volume_left="0.75" volume_right="0.75" beatfreq="4.2" basefreq="233.47" state="1"/>
<entry parent="0" duration="6" volume_left="0.75" volume_right="0.75" beatfreq="7" basefreq="233.3" state="1"/>
<entry parent="0" duration="180" volume_left="0.75" volume_right="0.75" beatfreq="3.9" basefreq="233.13" state="1"/>
<entry parent="0" duration="180" volume_left="0.76" volume_right="0.76" beatfreq="4" basefreq="228.06" state="1"/>
<entry parent="0" duration="6" volume_left="0.77" volume_right="0.77" beatfreq="3.9" basefreq="222.99" state="1"/>
<entry parent="0" duration="6" volume_left="0.77" volume_right="0.77" beatfreq="7" basefreq="222.82" state="1"/>
<entry parent="0" duration="340" volume_left="0.77" volume_right="0.77" beatfreq="3.9" basefreq="222.66" state="1"/>
<entry parent="0" duration="6" volume_left="0.78" volume_right="0.78" beatfreq="4.2" basefreq="213.08" state="1"/>
<entry parent="0" duration="6" volume_left="0.78" volume_right="0.78" beatfreq="7" basefreq="212.91" state="1"/>
<entry parent="0" duration="180" volume_left="0.78" volume_right="0.78" beatfreq="4" basefreq="212.75" state="1"/>
<entry parent="0" duration="180" volume_left="0.78" volume_right="0.78" beatfreq="4.2" basefreq="207.68" state="1"/>
<entry parent="0" duration="6" volume_left="0.79" volume_right="0.79" beatfreq="3.8" basefreq="202.61" state="1"/>
<entry parent="0" duration="6" volume_left="0.79" volume_right="0.79" beatfreq="7" basefreq="202.44" state="1"/>
<entry parent="0" duration="400" volume_left="0.79" volume_right="0.79" beatfreq="3.9" basefreq="202.27" state="1"/>
<entry parent="0" duration="6" volume_left="0.8" volume_right="0.8" beatfreq="4.2" basefreq="191.01" state="1"/>
<entry parent="0" duration="6" volume_left="0.8" volume_right="0.8" beatfreq="7" basefreq="190.84" state="1"/>
<entry parent="0" duration="180" volume_left="0.8" volume_right="0.8" beatfreq="4.2" basefreq="190.67" state="1"/>
<entry parent="0" duration="180" volume_left="0.8" volume_right="0.8" beatfreq="3.9" basefreq="185.61" state="1"/>
<entry parent="0" duration="6" volume_left="0.81" volume_right="0.81" beatfreq="4" basefreq="180.54" state="1"/>
<entry parent="0" duration="6" volume_left="0.81" volume_right="0.81" beatfreq="7" basefreq="180.37" state="1"/>
<entry parent="0" duration="300" volume_left="0.81" volume_right="0.81" beatfreq="4" basefreq="180.2" state="1"/>
<entry parent="0" duration="6" volume_left="0.82" volume_right="0.82" beatfreq="3.8" basefreq="171.76" state="1"/>
<entry parent="0" duration="6" volume_left="0.82" volume_right="0.82" beatfreq="7" basefreq="171.59" state="1"/>
<entry parent="0" duration="180" volume_left="0.82" volume_right="0.82" beatfreq="3.9" basefreq="171.42" state="1"/>
<entry parent="0" duration="180" volume_left="0.82" volume_right="0.82" beatfreq="4.1" basefreq="166.35" state="1"/>
<entry parent="0" duration="6" volume_left="0.83" volume_right="0.83" beatfreq="3.9" basefreq="161.28" state="1"/>
<entry parent="0" duration="6" volume_left="0.83" volume_right="0.83" beatfreq="7" basefreq="161.11" state="1"/>
<entry parent="0" duration="360" volume_left="0.83" volume_right="0.83" beatfreq="3.9" basefreq="160.94" state="1"/>
<entry parent="0" duration="6" volume_left="0.84" volume_right="0.84" beatfreq="4.1" basefreq="150.81" state="1"/>
<entry parent="0" duration="6" volume_left="0.84" volume_right="0.84" beatfreq="7" basefreq="150.64" state="1"/>
<entry parent="0" duration="180" volume_left="0.84" volume_right="0.84" beatfreq="3.9" basefreq="150.47" state="1"/>
<entry parent="0" duration="180" volume_left="0.84" volume_right="0.84" beatfreq="3.6" basefreq="145.41" state="1"/>
<entry parent="0" duration="6" volume_left="0.85" volume_right="0.85" beatfreq="4" basefreq="140.34" state="1"/>
<entry parent="0" duration="6" volume_left="0.85" volume_right="0.85" beatfreq="7" basefreq="140.17" state="1"/>
<entry parent="0" duration="64" volume_left="0.85" volume_right="0.85" beatfreq="4.3" basefreq="140" state="1"/>
</entries>
</voice>
<voice>
<description>Steady-state, no variation</description>
<id>1</id>
<type>1</type>
<voice_state>0</voice_state>
<voice_hide>0</voice_hide>
<voice_mute>0</voice_mute>
<entrycount>1</entrycount>
<entries>
<entry parent="1" duration="4410" volume_left="0.2" volume_right="0.2" beatfreq="0" basefreq="0" state="1"/>
</entries>
</voice>
</schedule>
`;

new GnauralApp();
