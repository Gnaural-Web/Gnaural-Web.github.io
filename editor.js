const VOLUME_MAX = 1.5;
const MIN_TIMELINE_SECONDS = 20;
const AXIS_POINTER_STYLE = {
    show: true,
    lineStyle: {
        color: '#8fcbff',
        width: 1.2,
        type: 'solid',
        opacity: 0.75
    }
};

const ICONS = {
    binaural: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4a5 5 0 0 0-5 5v6a4 4 0 0 0 4 4h1a1 1 0 0 0 1-1V9a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v9a1 1 0 0 0 1 1h1a4 4 0 0 0 4-4V9a5 5 0 0 0-5-5H7z"/></svg>',
    noisePink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 18c2.5-4 5-6 8-6s5.5 2 8 6l-1.6 1.2C16.3 16 14.4 14.8 12 14.8c-2.4 0-4.3 1.2-6.4 4.4z"/><path fill="currentColor" opacity="0.5" d="M4 6c2.5 4 5 6 8 6s5.5-2 8-6l-1.6-1.2C16.3 8 14.4 9.2 12 9.2c-2.4 0-4.3-1.2-6.4-4.4z"/></svg>',
    noiseWhite: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h2l2 6 2-6h2l2 6 2-6h2l-3 16h-2l-2-6-2 6H8z"/></svg>',
    sample: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 1.5V9h3.5z"/></svg>',
    remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h10l-1 15H8z"/><path fill="currentColor" d="M5 5h14v2H5z"/><path fill="currentColor" d="M9 2h6v2H9z"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>'
};

const formatSeconds = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const deepClone = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const volumeToPercent = (value) => {
    const normalized = Math.max(0, Math.min(VOLUME_MAX, Number(value) || 0));
    return Math.round((normalized / VOLUME_MAX) * 10000) / 100;
};

const percentToVolume = (value) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    return (percent / 100) * VOLUME_MAX;
};

const ensureEntries = (voice) => {
    const isBinaural = Number(voice.type) === 0;
    const defaultBase = isBinaural ? 220 : 0;
    const defaultBeat = isBinaural ? 4 : 0;
    if (!voice.entries || !voice.entries.length) {
        voice.entries = [
            { duration: 60, basefreq: defaultBase, beatfreq: defaultBeat, volL: 0.7, volR: 0.7 }
        ];
    }
    voice.entries = voice.entries.map((entry) => ({
        duration: Number(entry.duration) || 0,
        basefreq: Number.isFinite(Number(entry.basefreq)) ? Number(entry.basefreq) : defaultBase,
        beatfreq: Number.isFinite(Number(entry.beatfreq)) ? Number(entry.beatfreq) : defaultBeat,
        volL: Number(entry.volL ?? 0.7),
        volR: Number(entry.volR ?? 0.7)
    }));
};

export class ScheduleEditor {
    constructor({ app, soundLibrary = [] } = {}) {
        this.app = app;
        this.soundLibrary = soundLibrary;
        this.modal = document.getElementById('scheduleEditorModal');
        this.titleInput = document.getElementById('editorTitle');
        this.authorInput = document.getElementById('editorAuthor');
        this.descriptionInput = document.getElementById('editorDescription');
        this.loopsInput = document.getElementById('editorLoops');
        this.lengthInput = document.getElementById('editorLength');
        this.addVoiceButton = document.getElementById('editorAddVoice');
        this.applyButton = document.getElementById('editorApply');
        this.cancelButton = document.getElementById('editorCancel');
        this.downloadButton = document.getElementById('editorDownload');
        this.voiceList = document.getElementById('editorVoiceList');
        this.charts = new Map();
        this.chartGroupId = `voice-editor-${Date.now()}`;
        this.currentData = null;
        this.timelineLength = 600;
        this.mode = 'edit';
        this.openMenu = null;
        this.boundDocumentHandler = (event) => this.#handleDocumentClick(event);
        this.#bindEvents();
    }

    open(data, options = {}) {
        if (!this.modal) return;
        this.mode = options.mode || 'edit';
        this.currentData = deepClone(data || {});
        ensureEntriesStructure(this.currentData);
        this.timelineLength = Math.max(
            MIN_TIMELINE_SECONDS,
            Number(this.currentData.totalDurationSeconds) || this.#calculateLongestVoice()
        );
        this.#renderMetadata();
        this.#renderVoices();
        this.modal.classList.add('open');
        this.modal.setAttribute('aria-hidden', 'false');
        document.addEventListener('click', this.boundDocumentHandler);
        setTimeout(() => this.#resizeCharts(), 50);
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove('open');
        this.modal.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', this.boundDocumentHandler);
        this.#disposeCharts();
        this.currentData = null;
        this.timelineLength = 600;
        this.openMenu = null;
    }

    #bindEvents() {
        if (this.addVoiceButton) {
            this.addVoiceButton.addEventListener('click', () => this.#addVoice());
        }
        if (this.applyButton) {
            this.applyButton.addEventListener('click', () => this.#handleApply());
        }
        if (this.cancelButton) {
            this.cancelButton.addEventListener('click', () => this.close());
        }
        if (this.downloadButton) {
            this.downloadButton.addEventListener('click', () => this.#handleDownload());
        }
        if (this.lengthInput) {
            this.lengthInput.addEventListener('input', (event) => {
                const value = Number(event.target.value);
                this.#updateTimelineLength(value);
            });
        }
        window.addEventListener('resize', () => this.#resizeCharts());
    }

    #handleDocumentClick(event) {
        if (!this.modal?.classList.contains('open')) return;
        if (this.openMenu && !this.openMenu.contains(event.target)) {
            this.#closeTypeMenu();
        }
        if (event.target === this.modal) {
            this.close();
        }
    }

    #renderMetadata() {
        if (!this.currentData) return;
        const metadata = this.currentData.metadata || {};
        if (this.titleInput) this.titleInput.value = metadata.title || '';
        if (this.authorInput) this.authorInput.value = metadata.author || '';
        if (this.descriptionInput) this.descriptionInput.value = metadata.description || '';
        if (this.loopsInput) this.loopsInput.value = metadata.loops || 1;
        if (this.lengthInput) this.lengthInput.value = Math.round(this.timelineLength);
    }

    #renderVoices() {
        if (!this.voiceList || !this.currentData) return;
        this.#disposeCharts();
        this.voiceList.innerHTML = '';
        const voices = this.currentData.voices || [];
        if (!voices.length) {
            const empty = document.createElement('div');
            empty.className = 'editor-empty-state';
            empty.textContent = 'Add a voice to begin sculpting your session.';
            this.voiceList.appendChild(empty);
            return;
        }
        voices.forEach((voice, index) => {
            ensureEntries(voice);
            const card = this.#createVoiceCard(voice, index);
            this.voiceList.appendChild(card);
            const chartEl = card.querySelector('.voice-chart');
            if (chartEl) {
                this.#renderVoiceChart(index, voice, chartEl);
            }
        });
        this.#connectCharts();
    }

    #createVoiceCard(voice, index) {
        const card = document.createElement('article');
        card.className = 'voice-card';
        card.dataset.index = String(index);

        const header = document.createElement('div');
        header.className = 'voice-card-header';

        const typeSelector = this.#createVoiceTypeSelector(voice, index);
        header.appendChild(typeSelector);

        const title = document.createElement('div');
        title.className = 'voice-card-title';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = voice.description || `Voice ${index + 1}`;
        nameInput.placeholder = `Voice ${index + 1}`;
        nameInput.addEventListener('input', (event) => {
            voice.description = event.target.value;
        });
        title.appendChild(nameInput);
        const typeLabel = document.createElement('span');
        typeLabel.className = 'voice-type-label';
        typeLabel.textContent = this.#getVoiceTypeLabel(voice);
        title.appendChild(typeLabel);
        header.appendChild(title);

        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'voice-card-body';

        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'voice-chart';
        body.appendChild(chartWrapper);

        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'voice-entries';
        (voice.entries || []).forEach((entry, entryIndex) => {
            const row = this.#createEntryRow(voice, index, entry, entryIndex);
            entriesContainer.appendChild(row);
        });
        body.appendChild(entriesContainer);

        const footer = document.createElement('div');
        footer.className = 'voice-card-footer';
        const addPoint = document.createElement('button');
        addPoint.type = 'button';
        addPoint.className = 'secondary-button';
        addPoint.innerHTML = `${ICONS.add}<span>Add Keyframe</span>`;
        addPoint.addEventListener('click', () => this.#addEntry(index));
        footer.appendChild(addPoint);

        const removeVoice = document.createElement('button');
        removeVoice.type = 'button';
        removeVoice.className = 'secondary-button';
        removeVoice.innerHTML = `${ICONS.remove}<span>Remove Voice</span>`;
        removeVoice.addEventListener('click', () => this.#removeVoice(index));
        footer.appendChild(removeVoice);

        body.appendChild(footer);
        card.appendChild(body);
        return card;
    }

    #createEntryRow(voice, voiceIndex, entry, entryIndex) {
        const row = document.createElement('div');
        row.className = 'entry-row';
        const duration = document.createElement('label');
        duration.textContent = 'Duration (s)';
        const durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.min = '1';
        durationInput.value = Math.max(1, Math.round(entry.duration || 0));
        durationInput.addEventListener('change', (event) => {
            const value = Math.max(1, Number(event.target.value) || 1);
            event.target.value = value;
            this.#updateEntryValue(voiceIndex, entryIndex, 'duration', value);
        });
        duration.appendChild(durationInput);
        row.appendChild(duration);

        const volL = document.createElement('label');
        volL.textContent = 'Left Volume (%)';
        const volLInput = document.createElement('input');
        volLInput.type = 'number';
        volLInput.min = '0';
        volLInput.max = '100';
        volLInput.step = '1';
        volLInput.value = Math.round(volumeToPercent(entry.volL));
        volLInput.addEventListener('change', (event) => {
            const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
            event.target.value = value;
            this.#updateEntryValue(voiceIndex, entryIndex, 'volL', percentToVolume(value));
        });
        volL.appendChild(volLInput);
        row.appendChild(volL);

        const volR = document.createElement('label');
        volR.textContent = 'Right Volume (%)';
        const volRInput = document.createElement('input');
        volRInput.type = 'number';
        volRInput.min = '0';
        volRInput.max = '100';
        volRInput.step = '1';
        volRInput.value = Math.round(volumeToPercent(entry.volR));
        volRInput.addEventListener('change', (event) => {
            const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
            event.target.value = value;
            this.#updateEntryValue(voiceIndex, entryIndex, 'volR', percentToVolume(value));
        });
        volR.appendChild(volRInput);
        row.appendChild(volR);

        if (Number(voice.type) === 0) {
            const baseLabel = document.createElement('label');
            baseLabel.textContent = 'Base Frequency (Hz)';
            const baseInput = document.createElement('input');
            baseInput.type = 'number';
            baseInput.min = '20';
            baseInput.value = Math.max(20, Math.round(entry.basefreq || 0));
            baseInput.addEventListener('change', (event) => {
                const value = Math.max(20, Number(event.target.value) || 20);
                event.target.value = value;
                this.#updateEntryValue(voiceIndex, entryIndex, 'basefreq', value);
            });
            baseLabel.appendChild(baseInput);
            row.appendChild(baseLabel);

            const beatLabel = document.createElement('label');
            beatLabel.textContent = 'Beat Frequency (Hz)';
            const beatInput = document.createElement('input');
            beatInput.type = 'number';
            beatInput.min = '0';
            beatInput.max = '25';
            beatInput.step = '0.1';
            beatInput.value = Number(entry.beatfreq || 0).toFixed(1);
            beatInput.addEventListener('change', (event) => {
                const value = Math.max(0, Math.min(25, Number(event.target.value) || 0));
                event.target.value = value.toFixed(1);
                this.#updateEntryValue(voiceIndex, entryIndex, 'beatfreq', value);
            });
            beatLabel.appendChild(beatInput);
            row.appendChild(beatLabel);
        }

        const actions = document.createElement('div');
        actions.className = 'entry-actions';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'secondary-button';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => this.#removeEntry(voiceIndex, entryIndex));
        actions.appendChild(removeBtn);
        row.appendChild(actions);
        return row;
    }

    #createVoiceTypeSelector(voice, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'voice-type-selector';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'voice-type-button';
        button.innerHTML = this.#getVoiceTypeIcon(voice);
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (this.openMenu && this.openMenu !== wrapper.querySelector('.voice-type-menu')) {
                this.#closeTypeMenu();
            }
            const menu = wrapper.querySelector('.voice-type-menu');
            if (menu) {
                const isOpen = menu.classList.contains('open');
                if (isOpen) {
                    menu.classList.remove('open');
                    this.openMenu = null;
                } else {
                    menu.classList.add('open');
                    this.openMenu = menu;
                }
            }
        });
        wrapper.appendChild(button);

        const menu = document.createElement('div');
        menu.className = 'voice-type-menu';
        const options = this.#buildTypeOptions(voice);
        options.forEach((option) => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'voice-type-option';
            optionButton.innerHTML = `${option.icon}<span>${option.label}</span>`;
            optionButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.#setVoiceType(index, option);
                menu.classList.remove('open');
                this.openMenu = null;
            });
            menu.appendChild(optionButton);
        });
        wrapper.appendChild(menu);
        return wrapper;
    }

    #buildTypeOptions(currentVoice) {
        const options = [
            { type: 0, label: 'Binaural Beat (Generated)', icon: ICONS.binaural },
            { type: 3, label: 'White Noise (Generated)', icon: ICONS.noiseWhite },
            { type: 1, label: 'Pink Noise (Generated)', icon: ICONS.noisePink }
        ];
        const recorded = this.soundLibrary.map((item) => ({
            type: 2,
            label: item.label,
            file: item.file,
            icon: ICONS.sample
        }));
        if (currentVoice?.type === 2 && currentVoice.file) {
            const exists = recorded.some((item) => item.file === currentVoice.file);
            if (!exists) {
                recorded.unshift({
                    type: 2,
                    label: currentVoice.file,
                    file: currentVoice.file,
                    icon: ICONS.sample
                });
            }
        }
        return options.concat(recorded);
    }

    #setVoiceType(index, option) {
        if (!this.currentData?.voices?.[index]) return;
        const voice = this.currentData.voices[index];
        voice.type = option.type;
        if (option.type === 2) {
            voice.file = option.file;
            voice.description = option.label;
        } else {
            voice.file = '';
        }
        if (option.type !== 0) {
            (voice.entries || []).forEach((entry) => {
                entry.basefreq = entry.basefreq ?? 0;
                entry.beatfreq = entry.beatfreq ?? 0;
            });
        }
        ensureEntries(voice);
        this.#renderVoices();
    }

    #closeTypeMenu() {
        if (this.openMenu) {
            this.openMenu.classList.remove('open');
        }
        this.openMenu = null;
    }

    #updateEntryValue(voiceIndex, entryIndex, key, value) {
        if (!this.currentData?.voices?.[voiceIndex]) return;
        const voice = this.currentData.voices[voiceIndex];
        if (!voice.entries?.[entryIndex]) return;
        voice.entries[entryIndex][key] = value;
        this.#renderVoices();
    }

    #addVoice() {
        if (!this.currentData) return;
        const voice = {
            description: 'Binaural Beat',
            type: 0,
            file: '',
            entries: [
                { duration: 120, basefreq: 220, beatfreq: 4, volL: 0.7, volR: 0.7 }
            ]
        };
        this.currentData.voices = this.currentData.voices || [];
        this.currentData.voices.push(voice);
        this.#renderVoices();
    }

    #removeVoice(index) {
        if (!this.currentData?.voices) return;
        this.currentData.voices.splice(index, 1);
        this.#renderVoices();
    }

    #addEntry(index) {
        if (!this.currentData?.voices?.[index]) return;
        const voice = this.currentData.voices[index];
        const last = voice.entries[voice.entries.length - 1];
        voice.entries.push({
            duration: last?.duration || 60,
            basefreq: last?.basefreq || 220,
            beatfreq: last?.beatfreq || 4,
            volL: last?.volL || 0.7,
            volR: last?.volR || 0.7
        });
        this.#renderVoices();
    }

    #removeEntry(voiceIndex, entryIndex) {
        if (!this.currentData?.voices?.[voiceIndex]) return;
        const voice = this.currentData.voices[voiceIndex];
        if (voice.entries.length <= 1) {
            voice.entries[0].duration = Math.max(1, voice.entries[0].duration);
            return;
        }
        voice.entries.splice(entryIndex, 1);
        this.#renderVoices();
    }

    #handleApply() {
        if (!this.currentData) return;
        this.#syncMetadataFromInputs();
        this.currentData.totalDurationSeconds = Math.max(MIN_TIMELINE_SECONDS, this.timelineLength);
        if (this.app?.applyEditedSchedule) {
            this.app.applyEditedSchedule(this.currentData);
        }
        this.close();
    }

    #handleDownload() {
        if (!this.currentData) return;
        this.#syncMetadataFromInputs();
        this.currentData.totalDurationSeconds = Math.max(MIN_TIMELINE_SECONDS, this.timelineLength);
        if (!this.app?.generateScheduleXml) return;
        const xml = this.app.generateScheduleXml(this.currentData);
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = `${(this.currentData.metadata?.title || 'schedule').replace(/[^a-z0-9-_]+/gi, '_')}.gnaural`;
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    #syncMetadataFromInputs() {
        if (!this.currentData) return;
        const metadata = this.currentData.metadata || {};
        metadata.title = this.titleInput?.value?.trim() || '';
        metadata.author = this.authorInput?.value?.trim() || '';
        metadata.description = this.descriptionInput?.value || '';
        metadata.loops = Math.max(1, Number(this.loopsInput?.value) || 1);
        this.currentData.metadata = metadata;
    }

    #updateTimelineLength(value) {
        const normalized = Math.max(MIN_TIMELINE_SECONDS, Number(value) || MIN_TIMELINE_SECONDS);
        this.timelineLength = normalized;
        if (this.lengthInput) {
            this.lengthInput.value = Math.round(normalized);
        }
        this.#renderVoices();
    }

    #calculateLongestVoice() {
        if (!this.currentData?.voices?.length) return MIN_TIMELINE_SECONDS;
        return this.currentData.voices.reduce((max, voice) => {
            const total = (voice.entries || []).reduce((sum, entry) => sum + Number(entry.duration || 0), 0);
            return Math.max(max, total);
        }, MIN_TIMELINE_SECONDS);
    }

    #getVoiceTypeLabel(voice) {
        switch (Number(voice.type)) {
            case 0:
                return 'Binaural Beat';
            case 1:
                return 'Pink Noise';
            case 3:
                return 'White Noise';
            case 2:
                return voice.file ? `Recorded • ${voice.file}` : 'Recorded Sound';
            default:
                return 'Voice';
        }
    }

    #getVoiceTypeIcon(voice) {
        switch (Number(voice.type)) {
            case 0:
                return ICONS.binaural;
            case 1:
                return ICONS.noisePink;
            case 3:
                return ICONS.noiseWhite;
            case 2:
                return ICONS.sample;
            default:
                return ICONS.binaural;
        }
    }

    #buildPoints(voice) {
        const points = [];
        let time = 0;
        let lastBase = 220;
        let lastBeat = 4;
        let lastVolL = 0.7;
        let lastVolR = 0.7;
        (voice.entries || []).forEach((entry) => {
            const base = Number(entry.basefreq ?? lastBase);
            const beat = Number(entry.beatfreq ?? lastBeat);
            const volL = Number(entry.volL ?? lastVolL);
            const volR = Number(entry.volR ?? lastVolR);
            points.push({ time, base, beat, volL, volR });
            time += Number(entry.duration || 0);
            lastBase = base;
            lastBeat = beat;
            lastVolL = volL;
            lastVolR = volR;
        });
        const endTime = Math.max(time, this.timelineLength);
        if (!points.length) {
            points.push({ time: 0, base: 220, beat: 4, volL: 0.7, volR: 0.7 });
        }
        const lastPoint = points[points.length - 1];
        if (!lastPoint || lastPoint.time !== endTime) {
            points.push({
                time: endTime,
                base: lastPoint?.base ?? 220,
                beat: lastPoint?.beat ?? 4,
                volL: lastPoint?.volL ?? 0.7,
                volR: lastPoint?.volR ?? 0.7
            });
        } else if (lastPoint.time < endTime) {
            points.push({
                time: endTime,
                base: lastPoint.base,
                beat: lastPoint.beat,
                volL: lastPoint.volL,
                volR: lastPoint.volR
            });
        }
        return points;
    }

    #renderVoiceChart(index, voice, element) {
        if (typeof echarts === 'undefined' || !element) return;
        const chart = echarts.init(element, null, { renderer: 'canvas' });
        chart.group = this.chartGroupId;
        const points = this.#buildPoints(voice);
        const xMax = points[points.length - 1]?.time || this.timelineLength;
        const baseValues = points.map((p) => Number.isFinite(p.base) ? p.base : 0);
        const beatValues = points.map((p) => Number.isFinite(p.beat) ? p.beat : 0);
        const volLValues = points.map((p) => volumeToPercent(p.volL));
        const volRValues = points.map((p) => volumeToPercent(p.volR));
        let option;
        if (Number(voice.type) === 0) {
            const maxBase = Math.min(20000, Math.max(20, ...baseValues, 20) * 1.1);
            let minBase = Math.max(20, Math.min(...baseValues, maxBase));
            if (maxBase - minBase < 20) {
                minBase = Math.max(20, maxBase - 20);
            }
            option = {
                animation: false,
                grid: { left: 70, right: 70, top: 24, bottom: 36 },
                xAxis: {
                    type: 'value',
                    min: 0,
                    max: Math.max(xMax, MIN_TIMELINE_SECONDS),
                    axisLabel: { formatter: (value) => formatSeconds(value) },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                },
                yAxis: [
                    {
                        type: 'value',
                        min: minBase,
                        max: maxBase,
                        name: 'Base Hz',
                        axisLine: { lineStyle: { color: '#8fcbff' } },
                        axisLabel: { color: 'rgba(255,255,255,0.75)' },
                        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }
                    },
                    {
                        type: 'value',
                        min: 0,
                        max: 25,
                        position: 'right',
                        name: 'Beat Hz',
                        axisLine: { lineStyle: { color: '#c084fc' } },
                        axisLabel: { color: 'rgba(255,255,255,0.75)' },
                        splitLine: { show: false }
                    },
                    {
                        type: 'value',
                        min: 0,
                        max: 100,
                        show: false
                    }
                ],
                tooltip: { show: false },
                axisPointer: {
                    link: [{ xAxisIndex: 'all' }],
                    triggerTooltip: false,
                    ...AXIS_POINTER_STYLE
                },
                series: [
                    {
                        type: 'line',
                        name: 'Base Frequency',
                        yAxisIndex: 0,
                        data: points.map((p) => [p.time, p.base]),
                        step: 'end',
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: { color: '#8fcbff', width: 2 }
                    },
                    {
                        type: 'line',
                        name: 'Beat Frequency',
                        yAxisIndex: 1,
                        data: points.map((p) => [p.time, p.beat]),
                        step: 'end',
                        symbol: 'diamond',
                        symbolSize: 7,
                        lineStyle: { color: '#c084fc', width: 2 }
                    },
                    {
                        type: 'line',
                        name: 'Left Volume',
                        yAxisIndex: 2,
                        data: points.map((p, i) => [p.time, volLValues[i]]),
                        step: 'end',
                        symbol: 'rect',
                        symbolSize: 7,
                        lineStyle: { color: '#34d399', width: 2 },
                        areaStyle: { color: 'rgba(52, 211, 153, 0.12)' }
                    },
                    {
                        type: 'line',
                        name: 'Right Volume',
                        yAxisIndex: 2,
                        data: points.map((p, i) => [p.time, volRValues[i]]),
                        step: 'end',
                        symbol: 'triangle',
                        symbolSize: 7,
                        lineStyle: { color: '#f472b6', width: 2 },
                        areaStyle: { color: 'rgba(244, 114, 182, 0.12)' }
                    }
                ]
            };
        } else {
            option = {
                animation: false,
                grid: { left: 60, right: 40, top: 24, bottom: 36 },
                xAxis: {
                    type: 'value',
                    min: 0,
                    max: Math.max(xMax, MIN_TIMELINE_SECONDS),
                    axisLabel: { formatter: (value) => formatSeconds(value) },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    max: 100,
                    name: 'Volume %',
                    axisLabel: { color: 'rgba(255,255,255,0.75)' },
                    axisLine: { lineStyle: { color: '#34d399' } },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                },
                tooltip: { show: false },
                axisPointer: {
                    link: [{ xAxisIndex: 'all' }],
                    triggerTooltip: false,
                    ...AXIS_POINTER_STYLE
                },
                series: [
                    {
                        type: 'line',
                        name: 'Left Volume',
                        data: points.map((p, i) => [p.time, volLValues[i]]),
                        step: 'end',
                        symbol: 'rect',
                        symbolSize: 7,
                        lineStyle: { color: '#34d399', width: 2 },
                        areaStyle: { color: 'rgba(52, 211, 153, 0.15)' }
                    },
                    {
                        type: 'line',
                        name: 'Right Volume',
                        data: points.map((p, i) => [p.time, volRValues[i]]),
                        step: 'end',
                        symbol: 'triangle',
                        symbolSize: 7,
                        lineStyle: { color: '#f472b6', width: 2 },
                        areaStyle: { color: 'rgba(244, 114, 182, 0.12)' }
                    }
                ]
            };
        }
        chart.setOption(option, true);
        this.charts.set(index, chart);
    }

    #connectCharts() {
        if (typeof echarts === 'undefined') return;
        const instances = [...this.charts.values()];
        if (!instances.length) return;
        echarts.connect(this.chartGroupId);
    }

    #disposeCharts() {
        this.charts.forEach((chart) => chart?.dispose?.());
        this.charts.clear();
    }

    #resizeCharts() {
        this.charts.forEach((chart) => chart?.resize?.());
    }
}

const ensureEntriesStructure = (data) => {
    if (!data) return;
    if (!Array.isArray(data.voices)) {
        data.voices = [];
        return;
    }
    data.voices.forEach((voice) => ensureEntries(voice));
};
