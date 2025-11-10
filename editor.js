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

const MIN_ENTRY_DURATION = 1;

const ICONS = {
    binaural: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4a5 5 0 0 0-5 5v6a4 4 0 0 0 4 4h1a1 1 0 0 0 1-1V9a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v9a1 1 0 0 0 1 1h1a4 4 0 0 0 4-4V9a5 5 0 0 0-5-5H7z"/></svg>',
    noisePink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 18c2.5-4 5-6 8-6s5.5 2 8 6l-1.6 1.2C16.3 16 14.4 14.8 12 14.8c-2.4 0-4.3 1.2-6.4 4.4z"/><path fill="currentColor" opacity="0.5" d="M4 6c2.5 4 5 6 8 6s5.5-2 8-6l-1.6-1.2C16.3 8 14.4 9.2 12 9.2c-2.4 0-4.3-1.2-6.4-4.4z"/></svg>',
    noiseWhite: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h2l2 6 2-6h2l2 6 2-6h2l-3 16h-2l-2-6-2 6H8z"/></svg>',
    noiseBrown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#c08457" d="M4 18c2.4-3.8 4.8-5.7 8-5.7s5.6 1.9 8 5.7l-2 1.4c-1.8-2.8-3.4-3.9-6-3.9s-4.3 1.2-6 3.9z"/><path fill="#8b5e34" d="M4 10c2.4 3.8 4.8 5.7 8 5.7s5.6-1.9 8-5.7l-2-1.4c-1.8 2.8-3.4 3.9-6 3.9s-4.3-1.2-6-3.9z"/><path fill="#5f3b1f" d="M4 4c2.4 3.2 4.8 4.8 8 4.8s5.6-1.6 8-4.8L18 3c-1.8 2-3.4 3-6 3s-4.3-1-6-3z"/></svg>',
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

const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

const distanceSquared = (a, b) => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
};

const distanceToSegmentSquared = (p, v, w) => {
    const l2 = distanceSquared(v, w);
    if (l2 === 0) return distanceSquared(p, v);
    let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
    return { distance: distanceSquared(p, projection), t };
};

const FIELD_CONFIGS = {
    basefreq: {
        key: 'basefreq',
        label: 'Base Frequency',
        axisGroup: 'base',
        color: '#8fcbff',
        symbol: 'circle',
        supportedTypes: new Set([0]),
        min: 20,
        max: 20000,
        toChart: (value) => value,
        fromChart: (value) => clampValue(Number(value) || 0, 20, 20000),
        format: (value) => clampValue(Number(value) || 0, 20, 20000)
    },
    beatfreq: {
        key: 'beatfreq',
        label: 'Beat Frequency',
        axisGroup: 'beat',
        color: '#c084fc',
        symbol: 'diamond',
        supportedTypes: new Set([0]),
        min: 0,
        max: 25,
        toChart: (value) => value,
        fromChart: (value) => clampValue(Number(value) || 0, 0, 25),
        format: (value) => clampValue(Number(value) || 0, 0, 25)
    },
    volL: {
        key: 'volL',
        label: 'Left Volume',
        axisGroup: 'volume',
        color: '#34d399',
        symbol: 'rect',
        supportedTypes: new Set([0, 1, 2, 3, 4]),
        min: 0,
        max: 100,
        toChart: (value) => volumeToPercent(value),
        fromChart: (value) => percentToVolume(clampValue(Number(value) || 0, 0, 100)),
        format: (value) => clampValue(Number(value) || 0, 0, VOLUME_MAX),
        areaColor: 'rgba(52, 211, 153, 0.12)'
    },
    volR: {
        key: 'volR',
        label: 'Right Volume',
        axisGroup: 'volume',
        color: '#f472b6',
        symbol: 'triangle',
        supportedTypes: new Set([0, 1, 2, 3, 4]),
        min: 0,
        max: 100,
        toChart: (value) => volumeToPercent(value),
        fromChart: (value) => percentToVolume(clampValue(Number(value) || 0, 0, 100)),
        format: (value) => clampValue(Number(value) || 0, 0, VOLUME_MAX),
        areaColor: 'rgba(244, 114, 182, 0.12)'
    }
};

const getFieldConfig = (field) => FIELD_CONFIGS[field];

const ensureEntries = (voice) => {
    const isBinaural = Number(voice.type) === 0;
    const defaultBase = isBinaural ? 220 : 0;
    const defaultBeat = isBinaural ? 4 : 0;
    if (!voice.entries || !voice.entries.length) {
        voice.entries = [
            { time: 0, basefreq: defaultBase, beatfreq: defaultBeat, volL: 0.7, volR: 0.7 }
        ];
    }
    const normalized = [];
    let accumulatedTime = 0;
    (voice.entries || []).forEach((entry, index) => {
        const hasTime = Number.isFinite(Number(entry.time));
        let entryTime = hasTime ? Math.max(0, Number(entry.time)) : accumulatedTime;
        if (index === 0) {
            entryTime = 0;
        } else {
            entryTime = Math.max(accumulatedTime + MIN_ENTRY_DURATION, entryTime);
        }
        const normalizedEntry = {
            time: entryTime,
            basefreq: Number.isFinite(Number(entry.basefreq)) ? Number(entry.basefreq) : defaultBase,
            beatfreq: Number.isFinite(Number(entry.beatfreq)) ? Number(entry.beatfreq) : defaultBeat,
            volL: Number(entry.volL ?? 0.7),
            volR: Number(entry.volR ?? 0.7)
        };
        normalized.push(normalizedEntry);
        const duration = Math.max(0, Number(entry.duration) || 0);
        accumulatedTime = hasTime ? entryTime : entryTime + duration;
    });
    normalized.sort((a, b) => a.time - b.time);
    normalized.forEach((entry, index) => {
        if (index === 0) {
            entry.time = 0;
            return;
        }
        const prev = normalized[index - 1];
        entry.time = Math.max(entry.time, prev.time + MIN_ENTRY_DURATION);
    });
    voice.entries = normalized;
};

export class ScheduleEditor {
    constructor({ app, soundLibrary = [] } = {}) {
        this.app = app;
        this.soundLibrary = soundLibrary;
        this.soundInfoByFile = new Map(
            (soundLibrary || []).map((item) => [
                item.file,
                {
                    label: item.label,
                    icon: item.icon || this.#inferIconPath(item.file)
                }
            ])
        );
        this.recordedFallbackIcon = 'icons/sound-wave.svg';
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
    this.voiceViews = new Map();
    this.activeHighlight = null;
    this.dragState = null;
    this.lastHighlightAction = null;
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
        const longestVoice = this.#calculateLongestVoice();
        const providedLength = Number(this.currentData.totalDurationSeconds) || 0;
        this.timelineLength = Math.max(
            MIN_TIMELINE_SECONDS,
            Math.max(providedLength, longestVoice + MIN_ENTRY_DURATION)
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
        this.voiceViews.clear();
        this.activeHighlight = null;
        this.dragState = null;
        this.lastHighlightAction = null;
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
        this.voiceViews.clear();
        const voices = this.currentData.voices || [];
        if (!voices.length) {
            const empty = document.createElement('div');
            empty.className = 'editor-empty-state';
            empty.textContent = 'Add a voice to begin sculpting your session.';
            this.voiceList.appendChild(empty);
            return;
        }
        const fragment = document.createDocumentFragment();
        voices.forEach((voice, index) => {
            ensureEntries(voice);
            const view = this.#createVoiceCard(voice, index);
            if (!view) return;
            this.voiceViews.set(index, view);
            fragment.appendChild(view.card);
            if (view.chartElement) {
                this.#renderVoiceChart(view);
            }
        });
        this.voiceList.appendChild(fragment);
        this.#connectCharts();
    }

    #createVoiceCard(voice, index) {
        const view = {
            index,
            voice,
            card: document.createElement('article'),
            chartElement: null,
            entriesContainer: null,
            entryRows: [],
            inputMap: new Map(),
            chart: null,
            dataset: null,
            seriesMeta: new Map()
        };
        const { card } = view;
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
        view.chartElement = chartWrapper;

        const details = document.createElement('details');
        details.className = 'voice-details';
        const summary = document.createElement('summary');
        summary.className = 'voice-details-summary';
        summary.innerHTML = '<span class="summary-icon" aria-hidden="true"></span><span>Details</span>';
        details.appendChild(summary);

        const detailsContent = document.createElement('div');
        detailsContent.className = 'voice-details-content';
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'voice-entries';
        view.entriesContainer = entriesContainer;
        (voice.entries || []).forEach((entry, entryIndex) => {
            const entryView = this.#createEntryRow(view, voice, index, entry, entryIndex);
            entriesContainer.appendChild(entryView.row);
            view.entryRows[entryIndex] = entryView;
        });
        detailsContent.appendChild(entriesContainer);
        details.appendChild(detailsContent);
        detailsContent.style.height = '0px';
        details.addEventListener('toggle', () => this.#animateDetails(details, detailsContent));
        view.detailsElement = details;
        view.detailsContent = detailsContent;
        body.appendChild(details);

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
        return view;
    }

    #createEntryRow(view, voice, voiceIndex, entry, entryIndex) {
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.dataset.entryIndex = String(entryIndex);
        const entryInputs = {};

        const bindFocusHighlight = (input, fieldKey) => {
            input.addEventListener('focus', () => this.#highlightEntry(voiceIndex, entryIndex, { field: fieldKey }));
            input.addEventListener('blur', () => {
                if (this.activeHighlight?.voiceIndex === voiceIndex && this.activeHighlight?.entryIndex === entryIndex) {
                    this.#clearHighlight();
                }
            });
        };

        const timeLabel = document.createElement('label');
        timeLabel.textContent = 'Time (s)';
        const timeInput = document.createElement('input');
        timeInput.type = 'number';
        timeInput.min = '0';
        timeInput.step = '0.1';
        timeInput.value = Number(entry.time || 0).toFixed(1);
        if (entryIndex === 0) {
            timeInput.value = '0.0';
            timeInput.disabled = true;
        }
        bindFocusHighlight(timeInput, 'time');
        timeInput.addEventListener('input', (event) => {
            this.#handleTimeInput(voiceIndex, entryIndex, event.target);
        });
        timeLabel.appendChild(timeInput);
        row.appendChild(timeLabel);
        entryInputs.time = timeInput;

        const volLLabel = document.createElement('label');
        volLLabel.textContent = 'Left Volume (%)';
        const volLInput = document.createElement('input');
        volLInput.type = 'number';
        volLInput.min = '0';
        volLInput.max = '100';
        volLInput.step = '1';
        volLInput.value = Math.round(volumeToPercent(entry.volL));
        bindFocusHighlight(volLInput, 'volL');
        volLInput.addEventListener('input', (event) => {
            this.#handleEntryFieldInput(voiceIndex, entryIndex, 'volL', event.target);
        });
        volLLabel.appendChild(volLInput);
        row.appendChild(volLLabel);
        entryInputs.volL = volLInput;

        const volRLabel = document.createElement('label');
        volRLabel.textContent = 'Right Volume (%)';
        const volRInput = document.createElement('input');
        volRInput.type = 'number';
        volRInput.min = '0';
        volRInput.max = '100';
        volRInput.step = '1';
        volRInput.value = Math.round(volumeToPercent(entry.volR));
        bindFocusHighlight(volRInput, 'volR');
        volRInput.addEventListener('input', (event) => {
            this.#handleEntryFieldInput(voiceIndex, entryIndex, 'volR', event.target);
        });
        volRLabel.appendChild(volRInput);
        row.appendChild(volRLabel);
        entryInputs.volR = volRInput;

        if (Number(voice.type) === 0) {
            const baseLabel = document.createElement('label');
            baseLabel.textContent = 'Base Frequency (Hz)';
            const baseInput = document.createElement('input');
            baseInput.type = 'number';
            baseInput.min = '20';
            baseInput.step = '0.1';
            baseInput.value = Number(entry.basefreq || 0).toFixed(1);
            bindFocusHighlight(baseInput, 'basefreq');
            baseInput.addEventListener('input', (event) => {
                this.#handleEntryFieldInput(voiceIndex, entryIndex, 'basefreq', event.target);
            });
            baseLabel.appendChild(baseInput);
            row.appendChild(baseLabel);
            entryInputs.basefreq = baseInput;

            const beatLabel = document.createElement('label');
            beatLabel.textContent = 'Beat Frequency (Hz)';
            const beatInput = document.createElement('input');
            beatInput.type = 'number';
            beatInput.min = '0';
            beatInput.max = '25';
            beatInput.step = '0.1';
            beatInput.value = Number(entry.beatfreq || 0).toFixed(1);
            bindFocusHighlight(beatInput, 'beatfreq');
            beatInput.addEventListener('input', (event) => {
                this.#handleEntryFieldInput(voiceIndex, entryIndex, 'beatfreq', event.target);
            });
            beatLabel.appendChild(beatInput);
            row.appendChild(beatLabel);
            entryInputs.beatfreq = beatInput;
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

        Object.entries(entryInputs).forEach(([fieldKey, input]) => {
            view.inputMap.set(`${entryIndex}:${fieldKey}`, input);
        });

        return { row, inputs: entryInputs, entryIndex };
    }

    #getVoiceFields(voice) {
        const type = Number(voice?.type ?? 0);
        return Object.values(FIELD_CONFIGS).filter((config) => config.supportedTypes.has(type));
    }

    #getDefaultFieldValue(fieldKey) {
        switch (fieldKey) {
            case 'basefreq':
                return 220;
            case 'beatfreq':
                return 4;
            case 'volL':
            case 'volR':
                return 0.7;
            default:
                return 0;
        }
    }

    #getEntryFieldValue(entry, fieldKey) {
        if (!entry) return this.#getDefaultFieldValue(fieldKey);
        switch (fieldKey) {
            case 'basefreq':
            case 'beatfreq':
                return Number(entry[fieldKey] ?? this.#getDefaultFieldValue(fieldKey));
            case 'volL':
            case 'volR':
                return Number(entry[fieldKey] ?? 0.7);
            default:
                return Number(entry[fieldKey] ?? 0);
        }
    }

    #calculateEntryStarts(voice) {
        const entries = voice.entries || [];
        const starts = entries.map((entry) => Math.max(0, Number(entry.time) || 0));
        const total = starts.length ? starts[starts.length - 1] : 0;
        return { starts, total };
    }

    #buildVoiceDataset(voice) {
        const fields = this.#getVoiceFields(voice);
        const { starts, total } = this.#calculateEntryStarts(voice);
        const entries = voice.entries || [];
        const timelineEnd = Math.max(this.timelineLength, total + MIN_ENTRY_DURATION);
        const pointsByField = new Map();

        fields.forEach((config) => {
            const points = [];
            if (!entries.length) {
                const fallback = this.#getDefaultFieldValue(config.key);
                points.push({
                    time: 0,
                    value: fallback,
                    chartValue: config.toChart(fallback),
                    entryIndex: 0,
                    isEnd: false
                });
                points.push({
                    time: timelineEnd,
                    value: fallback,
                    chartValue: config.toChart(fallback),
                    entryIndex: 0,
                    isEnd: true
                });
            } else {
                entries.forEach((entry, entryIndex) => {
                    const value = this.#getEntryFieldValue(entry, config.key);
                    points.push({
                        time: starts[entryIndex],
                        value,
                        chartValue: config.toChart(value),
                        entryIndex,
                        isEnd: false
                    });
                });
                const lastIndex = entries.length - 1;
                const lastValue = this.#getEntryFieldValue(entries[lastIndex], config.key);
                points.push({
                    time: timelineEnd,
                    value: lastValue,
                    chartValue: config.toChart(lastValue),
                    entryIndex: lastIndex,
                    isEnd: true
                });
            }
            pointsByField.set(config.key, points);
        });

        return {
            fields,
            pointsByField,
            starts,
            timelineEnd,
            totalDuration: timelineEnd
        };
    }

    #seriesId(index, fieldKey) {
        return `voice-${index}-${fieldKey}`;
    }

    #createVoiceTypeSelector(voice, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'voice-type-selector';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'voice-type-button';
        this.#setElementIcon(button, this.#getVoiceTypeIcon(voice), this.#getVoiceTypeLabel(voice));
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
            const iconWrap = document.createElement('span');
            iconWrap.className = 'voice-type-option-icon';
            const iconEl = this.#createIconElement(option.icon, option.label);
            if (iconEl) {
                iconWrap.appendChild(iconEl);
            }
            optionButton.appendChild(iconWrap);
            const labelSpan = document.createElement('span');
            labelSpan.textContent = option.label;
            optionButton.appendChild(labelSpan);
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
            { type: 0, label: 'Binaural Beat (Generated)', icon: this.#iconSpecFromSvg(ICONS.binaural) },
            { type: 4, label: 'Brown Noise (Generated)', icon: this.#iconSpecFromSvg(ICONS.noiseBrown) },
            { type: 1, label: 'Pink Noise (Generated)', icon: this.#iconSpecFromSvg(ICONS.noisePink) },
            { type: 3, label: 'White Noise (Generated)', icon: this.#iconSpecFromSvg(ICONS.noiseWhite) }
        ];
        const recorded = (this.soundLibrary || [])
            .map((item) => this.#buildRecordedOption(item.file, item.label))
            .filter(Boolean);
        if (currentVoice?.type === 2 && currentVoice.file) {
            const exists = recorded.some((item) => item.file === currentVoice.file);
            if (!exists) {
                const fallbackLabel = currentVoice.description?.trim() || this.#friendlyNameFromFile(currentVoice.file) || currentVoice.file;
                const extra = this.#buildRecordedOption(currentVoice.file, fallbackLabel);
                if (extra) {
                    recorded.unshift(extra);
                }
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
        if (key === 'time') {
            this.#setEntryTime(voice, entryIndex, value);
        } else {
            voice.entries[entryIndex][key] = value;
        }
        this.#updateVoiceView(voiceIndex, { rebuild: key === 'time', keepInputs: false });
    }

    #addVoice() {
        if (!this.currentData) return;
        const voice = {
            description: 'Binaural Beat',
            type: 0,
            file: '',
            entries: [
                { time: 0, basefreq: 220, beatfreq: 4, volL: 0.7, volR: 0.7 }
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
        const lastTime = Number(last?.time) || 0;
        const defaultGap = 60;
        let proposedTime = lastTime + defaultGap;
        if (proposedTime <= lastTime) {
            proposedTime = lastTime + MIN_ENTRY_DURATION;
        }
        if (proposedTime >= this.timelineLength) {
            this.timelineLength = proposedTime + MIN_ENTRY_DURATION;
            if (this.lengthInput) {
                this.lengthInput.value = Math.round(this.timelineLength);
            }
        }
        voice.entries.push({
            time: proposedTime,
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
            return;
        }
        voice.entries.splice(entryIndex, 1);
        this.#renderVoices();
    }

    #handleApply() {
        if (!this.currentData) return;
        this.#syncMetadataFromInputs();
        const exportData = this.#buildExportData();
        if (!exportData) return;
        if (this.app?.applyEditedSchedule) {
            this.app.applyEditedSchedule(exportData);
        }
        this.close();
    }

    #handleDownload() {
        if (!this.currentData) return;
        this.#syncMetadataFromInputs();
        const exportData = this.#buildExportData();
        if (!exportData || !this.app?.generateScheduleXml) return;
        const xml = this.app.generateScheduleXml(exportData);
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
        this.currentData.totalDurationSeconds = Math.max(MIN_TIMELINE_SECONDS, this.timelineLength);
    }

    #buildExportData() {
        if (!this.currentData) return null;
        const timelineEnd = Math.max(MIN_TIMELINE_SECONDS, this.timelineLength);
        const exportData = deepClone(this.currentData);
        let maxTimeline = timelineEnd;
        exportData.voices = (this.currentData.voices || []).map((voice) => {
            const voiceClone = deepClone(voice);
            const normalizedEntries = (voice.entries || [])
                .map((entry) => ({
                    time: Math.max(0, Number(entry.time) || 0),
                    basefreq: Number(entry.basefreq ?? 0),
                    beatfreq: Number(entry.beatfreq ?? 0),
                    volL: Number(entry.volL ?? 0.7),
                    volR: Number(entry.volR ?? 0.7)
                }))
                .sort((a, b) => a.time - b.time);
            const lastTime = normalizedEntries.length ? normalizedEntries[normalizedEntries.length - 1].time : 0;
            const effectiveTimeline = Math.max(timelineEnd, lastTime + MIN_ENTRY_DURATION);
            maxTimeline = Math.max(maxTimeline, effectiveTimeline);
            const convertedEntries = normalizedEntries.map((entry, index) => {
                const nextTime = index + 1 < normalizedEntries.length ? normalizedEntries[index + 1].time : effectiveTimeline;
                const safeNext = Math.max(nextTime, entry.time + MIN_ENTRY_DURATION);
                const duration = Math.max(MIN_ENTRY_DURATION, safeNext - entry.time);
                return {
                    duration,
                    basefreq: entry.basefreq,
                    beatfreq: entry.beatfreq,
                    volL: entry.volL,
                    volR: entry.volR
                };
            });
            voiceClone.entries = convertedEntries;
            return voiceClone;
        });
        exportData.totalDurationSeconds = maxTimeline;
        return exportData;
    }

    #updateTimelineLength(value) {
        const requested = Number(value) || MIN_TIMELINE_SECONDS;
        const longestVoice = this.#calculateLongestVoice();
        const normalized = Math.max(MIN_TIMELINE_SECONDS, longestVoice + MIN_ENTRY_DURATION, requested);
        this.timelineLength = normalized;
        if (this.lengthInput) {
            this.lengthInput.value = Math.round(normalized);
        }
        this.#renderVoices();
    }

    #calculateLongestVoice() {
        if (!this.currentData?.voices?.length) return 0;
        return this.currentData.voices.reduce((max, voice) => {
            const entries = voice.entries || [];
            if (!entries.length) return max;
            const lastTime = Number(entries[entries.length - 1]?.time) || 0;
            return Math.max(max, lastTime);
        }, 0);
    }

    #getVoiceTypeLabel(voice) {
        switch (Number(voice.type)) {
            case 0:
                return 'Binaural Beat';
            case 1:
                return 'Pink Noise';
            case 3:
                return 'White Noise';
            case 4:
                return 'Brown Noise';
            case 2: {
                if (!voice?.file) return 'Recorded Sound';
                const recorded = this.#buildRecordedOption(voice.file, voice.description?.trim());
                const label = recorded?.label || voice.file;
                return `Recorded • ${label}`;
            }
            default:
                return 'Voice';
        }
    }

    #getVoiceTypeIcon(voice) {
        switch (Number(voice.type)) {
            case 0:
                return this.#iconSpecFromSvg(ICONS.binaural);
            case 1:
                return this.#iconSpecFromSvg(ICONS.noisePink);
            case 3:
                return this.#iconSpecFromSvg(ICONS.noiseWhite);
            case 4:
                return this.#iconSpecFromSvg(ICONS.noiseBrown);
            case 2: {
                const recorded = this.#buildRecordedOption(voice.file, voice.description?.trim());
                return recorded?.icon || this.#iconSpecFromSvg(ICONS.sample);
            }
            default:
                return this.#iconSpecFromSvg(ICONS.binaural);
        }
    }

    #setElementIcon(element, iconSpec, altText = '') {
        if (!element) return;
        element.innerHTML = '';
        const iconEl = this.#createIconElement(iconSpec, altText);
        if (iconEl) {
            element.appendChild(iconEl);
        }
    }

    #createIconElement(iconSpec, altText = '') {
        if (!iconSpec) return null;
        if (iconSpec.kind === 'svg' && typeof iconSpec.value === 'string') {
            const template = document.createElement('template');
            template.innerHTML = iconSpec.value.trim();
            return template.content.firstElementChild;
        }
        if (iconSpec.kind === 'img' && iconSpec.value) {
            const img = document.createElement('img');
            img.src = iconSpec.value;
            img.alt = altText || '';
            img.decoding = 'async';
            img.loading = 'lazy';
            return img;
        }
        return null;
    }

    #iconSpecFromSvg(svg) {
        return svg ? { kind: 'svg', value: svg } : null;
    }

    #iconSpecFromPath(path) {
        if (!path) return null;
        return { kind: 'img', value: path };
    }

    #buildRecordedOption(file, preferredLabel) {
        if (!file) return null;
        const info = this.soundInfoByFile?.get?.(file);
        const label = preferredLabel || info?.label || this.#friendlyNameFromFile(file) || file;
        const iconPath = info?.icon || this.#inferIconPath(file) || this.recordedFallbackIcon;
        const iconSpec = this.#iconSpecFromPath(iconPath) || this.#iconSpecFromSvg(ICONS.sample);
        if (!info && this.soundInfoByFile) {
            this.soundInfoByFile.set(file, { label, icon: iconPath });
        }
        return {
            type: 2,
            label,
            file,
            icon: iconSpec
        };
    }

    #inferIconPath(file) {
        if (!file || typeof file !== 'string') return null;
        const name = file.split('/').pop();
        if (!name) return null;
        const base = name.replace(/\.[^/.]+$/, '');
        if (!base) return null;
        return `icons/${base}.svg`;
    }

    #friendlyNameFromFile(file) {
        if (!file || typeof file !== 'string') return '';
        const name = file.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
        if (!name) return '';
        return name
            .split(/[-_\s]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    #renderVoiceChart(view) {
        if (typeof echarts === 'undefined' || !view?.chartElement) return;
        const chart = echarts.init(view.chartElement, null, { renderer: 'canvas' });
        chart.group = this.chartGroupId;
        view.chart = chart;
        this.charts.set(view.index, chart);
        this.#updateVoiceChart(view, { rebuild: true });
        this.#setupChartInteractions(view);
    }

    #updateVoiceChart(view, { rebuild = false } = {}) {
        const voice = this.currentData?.voices?.[view.index];
        if (!voice || !view?.chart) return;
        view.voice = voice;
        const dataset = this.#buildVoiceDataset(voice);
        view.dataset = dataset;

        const option = this.#composeChartOption(view, dataset, { rebuild });
        view.chart.setOption(option, rebuild, true);

        this.#updateSeriesMeta(view, dataset);
        this.#refreshSeriesPixels(view);
        if (this.activeHighlight?.voiceIndex === view.index) {
            this.#applyHighlightState();
        }
    }

    #setupChartInteractions(view) {
        if (!view?.chart) return;
        const zr = view.chart.getZr();
        if (view.interactionHandlers) {
            Object.entries(view.interactionHandlers).forEach(([event, handler]) => {
                zr.off(event, handler);
            });
        }
        const handlers = {
            mousemove: (event) => this.#handleChartMouseMove(view, event),
            mouseout: () => this.#handleChartMouseOut(view),
            mousedown: (event) => this.#handleChartMouseDown(view, event),
            mouseup: (event) => this.#handleChartMouseUp(view, event),
            dblclick: (event) => this.#handleChartDoubleClick(view, event)
        };
        zr.on('mousemove', handlers.mousemove);
        zr.on('mouseout', handlers.mouseout);
        zr.on('mousedown', handlers.mousedown);
        zr.on('mouseup', handlers.mouseup);
        zr.on('dblclick', handlers.dblclick);
        view.interactionHandlers = handlers;
    }

    #handleChartMouseMove(view, event) {
        const pointer = [event.offsetX, event.offsetY];
        if (this.dragState && this.dragState.view === view) {
            this.#performDrag(pointer);
            return;
        }
        const hit = this.#resolveChartHit(view, pointer, { includeSegments: true });
        if (!hit) {
            if (this.activeHighlight?.voiceIndex === view.index) {
                this.#clearHighlight();
            }
            view.chart.getZr().setCursorStyle('default');
            return;
        }
        if (hit.type === 'point') {
            view.chart.getZr().setCursorStyle('grab');
            if (
                this.activeHighlight?.voiceIndex !== view.index ||
                this.activeHighlight?.entryIndex !== hit.entryIndex ||
                this.activeHighlight?.field !== hit.fieldKey
            ) {
                this.#highlightEntry(view.index, hit.entryIndex, { field: hit.fieldKey });
            }
        } else if (hit.type === 'segment') {
            view.chart.getZr().setCursorStyle('grab');
            if (
                this.activeHighlight?.voiceIndex !== view.index ||
                this.activeHighlight?.entryIndex !== hit.startEntryIndex ||
                this.activeHighlight?.field !== hit.fieldKey
            ) {
                this.#highlightEntry(view.index, hit.startEntryIndex, { field: hit.fieldKey });
            }
        }
    }

    #handleChartMouseOut(view) {
        if (this.dragState && this.dragState.view === view) return;
        this.#clearHighlight();
        view.chart.getZr().setCursorStyle('default');
    }

    #handleChartMouseDown(view, event) {
        const pointer = [event.offsetX, event.offsetY];
        const hit = this.#resolveChartHit(view, pointer, { includeSegments: true });
        if (!hit) return;
        view.chart.getZr().setCursorStyle('grabbing');
        if (hit.type === 'point') {
            const meta = view.seriesByField?.get(hit.fieldKey);
            const point = meta?.points?.[hit.pointIndex];
            this.#highlightEntry(view.index, hit.entryIndex, { field: hit.fieldKey });
            this.dragState = {
                type: 'point',
                view,
                fieldKey: hit.fieldKey,
                entryIndex: hit.entryIndex,
                pointIndex: hit.pointIndex,
                startPointer: pointer,
                startValue: point?.value,
                startTime: point?.time,
                startDurations: this.#calculateEntryStarts(view.voice)
            };
        } else if (hit.type === 'segment') {
            const meta = view.seriesByField?.get(hit.fieldKey);
            const config = meta?.config;
            const startChart = config ? config.toChart(hit.startPoint.value) : hit.startPoint.value;
            const endChart = config ? config.toChart(hit.endPoint.value) : hit.endPoint.value;
            const initialPointerChart = startChart + (endChart - startChart) * hit.ratio;
            this.#highlightEntry(view.index, hit.startEntryIndex, { field: hit.fieldKey });
            this.dragState = {
                type: 'segment',
                view,
                fieldKey: hit.fieldKey,
                startEntryIndex: hit.startEntryIndex,
                endEntryIndex: hit.endEntryIndex,
                startPointer: pointer,
                segment: hit,
                initialPointerChart,
                initialPointerActual:
                    config && config.axisGroup === 'volume'
                        ? config.fromChart(initialPointerChart)
                        : initialPointerChart
            };
        }
    }

    #handleChartMouseUp(view) {
        if (this.dragState?.view !== view) return;
        this.dragState = null;
        view.chart.getZr().setCursorStyle('default');
        this.#updateVoiceView(view.index, { rebuild: true, keepInputs: false });
    }

    #handleChartDoubleClick(view, event) {
        const pointer = [event.offsetX, event.offsetY];
        const hit = this.#resolveChartHit(view, pointer, { includeSegments: true, preferSegments: true });
        if (!hit || hit.type !== 'segment') return;
        this.#insertKeyframeAt(view, hit, pointer);
    }

    #resolveChartHit(view, pointer, { includeSegments = false, preferSegments = false } = {}) {
        if (!view?.seriesMeta) return null;
        const pointThreshold = 144; // 12px squared
        const segmentThreshold = 196; // 14px squared
        let bestPoint = null;
        let bestPointDist = pointThreshold;
        view.seriesMeta.forEach((meta, seriesId) => {
            meta.pointPixels?.forEach((pixel, index) => {
                const dataPoint = meta.points[index];
                if (!dataPoint || dataPoint.isEnd) return;
                const dist = distanceSquared(pointer, pixel);
                if (dist <= bestPointDist) {
                    bestPointDist = dist;
                    bestPoint = {
                        type: 'point',
                        seriesId,
                        fieldKey: meta.config.key,
                        entryIndex: dataPoint.entryIndex,
                        pointIndex: index
                    };
                }
            });
        });

        let bestSegment = null;
        let bestSegmentDist = segmentThreshold;
        if (includeSegments) {
            view.seriesMeta.forEach((meta, seriesId) => {
                meta.segments?.forEach((segment) => {
                    const { distance, t } = distanceToSegmentSquared(pointer, segment.startPixel, segment.endPixel);
                    if (distance <= bestSegmentDist) {
                        bestSegmentDist = distance;
                        bestSegment = {
                            type: 'segment',
                            seriesId,
                            fieldKey: meta.config.key,
                            startEntryIndex: segment.startPoint.entryIndex,
                            endEntryIndex: segment.endPoint.entryIndex,
                            startPoint: segment.startPoint,
                            endPoint: segment.endPoint,
                            ratio: t,
                            isTerminal: segment.isTerminal
                        };
                    }
                });
            });
        }

        if (preferSegments && bestSegment) return bestSegment;
        return bestPoint || bestSegment;
    }

    #performDrag(pointer) {
        if (!this.dragState) return;
        const { view } = this.dragState;
        const meta = view.seriesByField?.get(this.dragState.fieldKey);
        if (!meta) return;
        const dataCoord = view.chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: meta.axisIndex }, pointer);
        const [timeValue, chartValue] = dataCoord;
        if (this.dragState.type === 'point') {
            this.#applyPointDrag(timeValue, chartValue);
        } else if (this.dragState.type === 'segment') {
            this.#applySegmentDrag(chartValue);
        }
        this.#updateVoiceView(view.index, { rebuild: false, keepInputs: true });
        this.#highlightEntry(view.index, this.dragState.type === 'point' ? this.dragState.entryIndex : this.dragState.startEntryIndex, { field: this.dragState.fieldKey });
    }

    #applyPointDrag(timeValue, chartValue) {
        const state = this.dragState;
        const voice = state?.view?.voice;
        if (!state || !voice) return;
        const meta = state.view.seriesByField?.get(state.fieldKey);
        const config = meta?.config;
        if (!config) return;

        if (Number.isFinite(timeValue)) {
            this.#setEntryTime(voice, state.entryIndex, timeValue);
        }

        if (Number.isFinite(chartValue)) {
            const bounded = clampValue(chartValue, config.min, config.max);
            const actualValue = config.axisGroup === 'volume' ? config.fromChart(bounded) : config.format(bounded);
            voice.entries[state.entryIndex][state.fieldKey] = actualValue;
        }
    }

    #applySegmentDrag(chartValue) {
        const state = this.dragState;
        const voice = state?.view?.voice;
        if (!state || !voice) return;
        const meta = state.view.seriesByField?.get(state.fieldKey);
        const config = meta?.config;
        if (!config) return;

        if (!Number.isFinite(chartValue)) return;
        const bounded = clampValue(chartValue, config.min, config.max);
        const deltaChart = bounded - state.initialPointerChart;
        const deltaActual =
            config.axisGroup === 'volume'
                ? config.fromChart(state.initialPointerChart + deltaChart) - state.initialPointerActual
                : deltaChart;

        const targets = new Set([state.startEntryIndex, state.endEntryIndex]);
        targets.forEach((entryIndex) => {
            if (!Number.isInteger(entryIndex) || entryIndex < 0) return;
            if (!voice.entries?.[entryIndex]) return;
            if (config.axisGroup === 'volume') {
                const current = voice.entries[entryIndex][state.fieldKey];
                voice.entries[entryIndex][state.fieldKey] = clampValue(current + deltaActual, 0, VOLUME_MAX);
            } else {
                const current = voice.entries[entryIndex][state.fieldKey];
                voice.entries[entryIndex][state.fieldKey] = clampValue(current + deltaChart, config.min, config.max);
            }
        });

        state.initialPointerChart = bounded;
        state.initialPointerActual =
            config.axisGroup === 'volume' ? config.fromChart(bounded) : bounded;
    }

    #insertKeyframeAt(view, segmentHit, pointer) {
        const voice = this.currentData?.voices?.[view.index];
        if (!voice) return;
        const meta = view.seriesByField?.get(segmentHit.fieldKey);
        if (!meta) return;
        const dataCoord = view.chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: meta.axisIndex }, pointer);
        const [timeValue, chartValue] = dataCoord;
        if (!Number.isFinite(timeValue) || !Number.isFinite(chartValue)) return;

        const { starts } = this.#calculateEntryStarts(voice);
        const startTime = starts[segmentHit.startEntryIndex] ?? 0;
        const dataset = view.dataset;
        const timelineEnd = Number(dataset?.timelineEnd) || this.timelineLength;
        let endTime;
        if (segmentHit.isTerminal) {
            endTime = timelineEnd;
        } else if (
            Number.isInteger(segmentHit.endEntryIndex) &&
            segmentHit.endEntryIndex >= 0 &&
            segmentHit.endEntryIndex < starts.length
        ) {
            endTime = starts[segmentHit.endEntryIndex];
        } else {
            endTime = timelineEnd;
        }
        if (!Number.isFinite(endTime)) {
            endTime = timelineEnd;
        }
        if (endTime <= startTime + MIN_ENTRY_DURATION) {
            endTime = startTime + MIN_ENTRY_DURATION * 2;
            if (segmentHit.isTerminal) {
                this.timelineLength = Math.max(this.timelineLength, endTime);
            }
        }
        let minTime = startTime + MIN_ENTRY_DURATION;
        let maxTime = endTime - MIN_ENTRY_DURATION;
        if (minTime >= maxTime) {
            const mid = startTime + (endTime - startTime) / 2;
            minTime = mid;
            maxTime = mid;
        }
        const clampedTime = clampValue(timeValue, minTime, maxTime);
        const span = Math.max(endTime - startTime, MIN_ENTRY_DURATION);
        const ratio = span > 0 ? (clampedTime - startTime) / span : 0;

        const config = meta.config;
        const startValue = segmentHit.startPoint.value;
        const endValue = segmentHit.endPoint.value;
        const interpolatedChart = startValue + (endValue - startValue) * ratio;
        const boundedChart = clampValue(Number.isFinite(chartValue) ? chartValue : interpolatedChart, config.min, config.max);
        const actualValue = config.axisGroup === 'volume' ? config.fromChart(boundedChart) : config.format(boundedChart);
        const startEntry = voice.entries[segmentHit.startEntryIndex];
        const endEntry =
            segmentHit.isTerminal || !Number.isInteger(segmentHit.endEntryIndex)
                ? startEntry
                : voice.entries[segmentHit.endEntryIndex] ?? startEntry;
        const newEntry = { time: clampedTime };
        const fields = this.#getVoiceFields(voice);
        fields.forEach((cfg) => {
            const startVal = this.#getEntryFieldValue(startEntry, cfg.key);
            const endVal = this.#getEntryFieldValue(endEntry, cfg.key);
            const interpolated = startVal + (endVal - startVal) * ratio;
            if (cfg.axisGroup === 'volume') {
                newEntry[cfg.key] = clampValue(interpolated, 0, VOLUME_MAX);
            } else {
                newEntry[cfg.key] = clampValue(interpolated, cfg.min, cfg.max);
            }
        });
        newEntry[segmentHit.fieldKey] = actualValue;
        voice.entries.splice(segmentHit.startEntryIndex + 1, 0, newEntry);

        this.timelineLength = Math.max(this.timelineLength, newEntry.time + MIN_ENTRY_DURATION);
        if (this.lengthInput) {
            this.lengthInput.value = Math.round(this.timelineLength);
        }

        this.#updateVoiceView(view.index, { rebuild: true, keepInputs: false });
        this.#highlightEntry(view.index, segmentHit.startEntryIndex + 1, { field: segmentHit.fieldKey });
    }

    #composeChartOption(view, dataset, { rebuild = false } = {}) {
        const hasTonal = Number(view.voice?.type) === 0;
        const xMax = Math.max(dataset.timelineEnd, MIN_TIMELINE_SECONDS);
        const axisOrder = [];
        dataset.fields.forEach((config) => {
            if (!axisOrder.includes(config.axisGroup)) {
                axisOrder.push(config.axisGroup);
            }
        });
        const axisIndexMap = new Map(axisOrder.map((group, idx) => [group, idx]));
        view.axisIndexMap = axisIndexMap;

        const yAxis = axisOrder.map((group, idx) => this.#buildYAxisConfig(group, dataset, axisOrder.length, idx));
        const series = dataset.fields.map((config) => {
            const seriesId = this.#seriesId(view.index, config.key);
            const dataPoints = dataset.pointsByField.get(config.key) || [];
            const data = dataPoints.map((point) => [point.time, point.chartValue]);
            const axisIndex = axisIndexMap.get(config.axisGroup) ?? 0;
            const baseSeries = {
                id: seriesId,
                name: config.label,
                type: 'line',
                data,
                yAxisIndex: axisIndex,
                symbol: config.symbol,
                symbolSize: 9,
                showSymbol: true,
                smooth: false,
                connectNulls: true,
                lineStyle: { color: config.color, width: 2.2 },
                itemStyle: { color: config.color },
                emphasis: {
                    focus: 'series',
                    scale: 1.35,
                    itemStyle: { color: config.color },
                    lineStyle: { width: 3 }
                },
                animation: false
            };
            if (config.areaColor) {
                baseSeries.areaStyle = { color: config.areaColor };
            }
            return baseSeries;
        });

        const baseOption = rebuild
            ? {
                  animation: false,
                  grid: hasTonal
                      ? { left: 70, right: 80, top: 24, bottom: 44 }
                      : { left: 60, right: 40, top: 24, bottom: 44 },
                  tooltip: { show: false },
                  axisPointer: {
                      link: [{ xAxisIndex: 'all' }],
                      triggerTooltip: false,
                      ...AXIS_POINTER_STYLE
                  }
              }
            : {};

        return Object.assign(baseOption, {
            xAxis: {
                type: 'value',
                min: 0,
                max: xMax,
                axisLabel: { formatter: (value) => formatSeconds(value) },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.25)' } },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
            },
            yAxis: yAxis.length === 1 ? yAxis[0] : yAxis,
            series
        });
    }

    #buildYAxisConfig(group, dataset, groupCount, index) {
        switch (group) {
            case 'base': {
                const points = dataset.pointsByField.get('basefreq') || [];
                const values = points.map((p) => p.chartValue).filter((value) => Number.isFinite(value));
                const maxVal = Math.min(20000, Math.max(20, ...values, 20) * 1.1);
                let minVal = Math.max(20, Math.min(...values, maxVal));
                if (!Number.isFinite(minVal)) {
                    minVal = 20;
                }
                if (maxVal - minVal < 20) {
                    minVal = Math.max(20, maxVal - 20);
                }
                return {
                    type: 'value',
                    min: minVal,
                    max: maxVal,
                    name: 'Base Hz',
                    position: 'left',
                    axisLine: { lineStyle: { color: '#8fcbff' } },
                    axisLabel: { color: 'rgba(255,255,255,0.75)' },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }
                };
            }
            case 'beat':
                return {
                    type: 'value',
                    min: 0,
                    max: 25,
                    name: 'Beat Hz',
                    position: 'right',
                    axisLine: { lineStyle: { color: '#c084fc' } },
                    axisLabel: { color: 'rgba(255,255,255,0.75)' },
                    splitLine: { show: false }
                };
            case 'volume':
            default:
                return {
                    type: 'value',
                    min: 0,
                    max: 100,
                    name: 'Volume %',
                    position: groupCount > 1 ? 'right' : 'left',
                    offset: groupCount > 2 && index > 0 ? 60 : 0,
                    axisLine: { lineStyle: { color: '#34d399' } },
                    axisLabel: {
                        color: groupCount > 1 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)'
                    },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
                    show: !(groupCount > 1 && index > 0)
                };
        }
    }

    #updateSeriesMeta(view, dataset) {
        view.seriesMeta = new Map();
        view.seriesByField = new Map();
        dataset.fields.forEach((config) => {
            const seriesId = this.#seriesId(view.index, config.key);
            const axisIndex = view.axisIndexMap?.get(config.axisGroup) ?? 0;
            const points = dataset.pointsByField.get(config.key) || [];
            const meta = {
                config,
                axisGroup: config.axisGroup,
                axisIndex,
                points,
                pointPixels: [],
                segments: []
            };
            view.seriesMeta.set(seriesId, meta);
            view.seriesByField.set(config.key, meta);
        });
    }

    #refreshSeriesPixels(view) {
        if (!view?.chart || !view.seriesMeta) return;
        view.seriesMeta.forEach((meta) => {
            const axisIndex = meta.axisIndex ?? 0;
            const pixels = meta.points.map((point) =>
                view.chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: axisIndex }, [point.time, point.chartValue])
            );
            meta.pointPixels = pixels;
            const segments = [];
            for (let i = 0; i < pixels.length - 1; i += 1) {
                const startPoint = meta.points[i];
                const endPoint = meta.points[i + 1];
                if (!startPoint || !endPoint) continue;
                segments.push({
                    startIndex: i,
                    endIndex: i + 1,
                    startPoint,
                    endPoint,
                    startPixel: pixels[i],
                    endPixel: pixels[i + 1],
                    isTerminal: Boolean(endPoint.isEnd)
                });
            }
            meta.segments = segments;
        });
    }

    #handleEntryFieldInput(voiceIndex, entryIndex, fieldKey, input) {
        const voice = this.currentData?.voices?.[voiceIndex];
        if (!voice?.entries?.[entryIndex]) return;
        const config = getFieldConfig(fieldKey);
        if (!config) return;
        const raw = String(input.value ?? '').trim();
        if (!raw) return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const boundedChartValue = clampValue(parsed, config.min, config.max);
        if (boundedChartValue !== parsed) {
            input.value = config.axisGroup === 'volume' ? Math.round(boundedChartValue) : boundedChartValue.toFixed(1);
        }
        const actualValue = config.axisGroup === 'volume'
            ? config.fromChart(boundedChartValue)
            : config.format(boundedChartValue);
        voice.entries[entryIndex][fieldKey] = actualValue;
        this.#highlightEntry(voiceIndex, entryIndex, { field: fieldKey });
        this.#updateVoiceView(voiceIndex, { rebuild: false, keepInputs: true });
    }

    #handleTimeInput(voiceIndex, entryIndex, input) {
        if (entryIndex === 0) {
            input.value = '0.0';
            return;
        }
        const voice = this.currentData?.voices?.[voiceIndex];
        if (!voice?.entries?.[entryIndex]) return;
        const raw = String(input.value ?? '').trim();
        if (!raw) return;
        let timeValue = Number(raw);
        if (!Number.isFinite(timeValue)) return;
        timeValue = Math.max(0, timeValue);
        input.value = timeValue.toFixed(1);
        this.#setEntryTime(voice, entryIndex, timeValue);
        this.timelineLength = Math.max(this.timelineLength, this.#calculateLongestVoice() + MIN_ENTRY_DURATION);
        if (this.lengthInput) {
            this.lengthInput.value = Math.round(this.timelineLength);
        }
        this.#highlightEntry(voiceIndex, entryIndex, { field: 'time' });
        this.#updateVoiceView(voiceIndex, { rebuild: true, keepInputs: true });
    }

    #updateVoiceView(voiceIndex, { rebuild = false, keepInputs = false } = {}) {
        const view = this.voiceViews.get(voiceIndex);
        if (!view) {
            this.#renderVoices();
            return;
        }
        const voice = this.currentData?.voices?.[voiceIndex];
        if (!voice) return;
        view.voice = voice;

        const desiredCount = voice.entries?.length || 0;
        if (view.entryRows.length !== desiredCount) {
            view.entriesContainer.innerHTML = '';
            view.entryRows = [];
            view.inputMap.clear();
            (voice.entries || []).forEach((entry, entryIndex) => {
                const entryView = this.#createEntryRow(view, voice, voiceIndex, entry, entryIndex);
                view.entriesContainer.appendChild(entryView.row);
                view.entryRows[entryIndex] = entryView;
            });
            if (view.detailsElement?.open) {
                view.detailsContent.style.height = 'auto';
            }
        }
        this.#updateVoiceChart(view, { rebuild });
        if (!keepInputs) {
            this.#refreshEntryInputs(view);
        }
    }

    #refreshEntryInputs(view) {
        const voice = this.currentData?.voices?.[view.index];
        if (!voice) return;
        view.entryRows.forEach((entryView) => {
            if (!entryView) return;
            const entry = voice.entries?.[entryView.entryIndex];
            if (!entry) return;
            const { inputs } = entryView;
            if (inputs.time) {
                const isFirst = entryView.entryIndex === 0;
                inputs.time.value = Number(entry.time || 0).toFixed(1);
                inputs.time.disabled = isFirst;
            }
            if (inputs.volL) {
                inputs.volL.value = Math.round(volumeToPercent(entry.volL));
            }
            if (inputs.volR) {
                inputs.volR.value = Math.round(volumeToPercent(entry.volR));
            }
            if (inputs.basefreq) {
                inputs.basefreq.value = Number(entry.basefreq || 0).toFixed(1);
            }
            if (inputs.beatfreq) {
                inputs.beatfreq.value = Number(entry.beatfreq || 0).toFixed(1);
            }
        });
    }

    #setEntryTime(voice, entryIndex, targetTime) {
        if (entryIndex <= 0) return;
        const entries = voice.entries || [];
        if (!entries[entryIndex]) return;
        const previous = entries[entryIndex - 1];
        const next = entries[entryIndex + 1];
        const prevTime = Number(previous?.time) || 0;
        const nextTime = Number(next?.time ?? Number.POSITIVE_INFINITY);
        const minAllowed = prevTime + MIN_ENTRY_DURATION;
        let maxAllowed = Number.isFinite(nextTime) ? nextTime - MIN_ENTRY_DURATION : Number.POSITIVE_INFINITY;
        if (maxAllowed <= minAllowed) {
            maxAllowed = minAllowed;
        }
        let clamped = Number.isFinite(targetTime) ? targetTime : minAllowed;
        if (Number.isFinite(maxAllowed)) {
            clamped = clampValue(clamped, minAllowed, maxAllowed);
        } else {
            clamped = Math.max(clamped, minAllowed);
        }
        entries[entryIndex].time = clamped;
        const isLast = entryIndex === entries.length - 1;
        if (isLast) {
            const requiredTimeline = Math.max(this.timelineLength, clamped + MIN_ENTRY_DURATION);
            if (requiredTimeline > this.timelineLength) {
                this.timelineLength = requiredTimeline;
                if (this.lengthInput) {
                    this.lengthInput.value = Math.round(this.timelineLength);
                }
            }
        }
    }

    #highlightEntry(voiceIndex, entryIndex, { field } = {}) {
        this.activeHighlight = { voiceIndex, entryIndex, field: field || null };
        this.#applyHighlightState();
    }

    #clearHighlight() {
        if (!this.activeHighlight) return;
        const highlightVoice = this.voiceViews.get(this.activeHighlight.voiceIndex);
        if (highlightVoice?.chart && highlightVoice.seriesMeta) {
            highlightVoice.seriesMeta.forEach((_, seriesId) => {
                highlightVoice.chart.dispatchAction({ type: 'downplay', seriesId });
            });
        }
        this.voiceViews.forEach((view) => this.#updateHighlightedRowClass(view, null));
        this.activeHighlight = null;
        this.lastHighlightAction = null;
    }

    #applyHighlightState() {
        if (!this.activeHighlight) {
            this.#clearHighlight();
            return;
        }
        const { voiceIndex, entryIndex, field } = this.activeHighlight;
        const view = this.voiceViews.get(voiceIndex);
        if (!view?.chart || !view.seriesMeta) return;

        if (this.lastHighlightAction && this.lastHighlightAction.voiceIndex !== voiceIndex) {
            const lastView = this.voiceViews.get(this.lastHighlightAction.voiceIndex);
            if (lastView?.chart) {
                lastView.chart.dispatchAction({
                    type: 'downplay',
                    seriesId: this.lastHighlightAction.seriesId,
                    dataIndex: this.lastHighlightAction.dataIndex
                });
            }
        }

        view.seriesMeta.forEach((_, seriesId) => {
            view.chart.dispatchAction({ type: 'downplay', seriesId });
        });

        let targetMeta = null;
        if (field && view.seriesByField?.has(field)) {
            targetMeta = view.seriesByField.get(field);
        }
        if (!targetMeta) {
            targetMeta = [...view.seriesMeta.values()][0];
        }
        if (!targetMeta) return;

        const targetSeriesId = this.#seriesId(view.index, targetMeta.config.key);
        const pointIndex = targetMeta.points.findIndex((point) => !point.isEnd && point.entryIndex === entryIndex);
        if (pointIndex >= 0) {
            view.chart.dispatchAction({ type: 'highlight', seriesId: targetSeriesId, dataIndex: pointIndex });
            this.lastHighlightAction = { voiceIndex: view.index, seriesId: targetSeriesId, dataIndex: pointIndex };
        } else {
            this.lastHighlightAction = null;
        }

        this.voiceViews.forEach((voiceView, idx) => {
            this.#updateHighlightedRowClass(voiceView, idx === voiceIndex ? entryIndex : null);
        });
    }

    #updateHighlightedRowClass(view, entryIndex) {
        if (!view?.entryRows) return;
        view.entryRows.forEach((entryView) => {
            if (!entryView?.row) return;
            if (entryIndex !== null && entryIndex === entryView.entryIndex) {
                entryView.row.classList.add('is-highlighted');
            } else {
                entryView.row.classList.remove('is-highlighted');
            }
        });
    }

    #animateDetails(details, content) {
        if (!content) return;
        const startHeight = content.getBoundingClientRect().height;
        const targetHeight = details.open ? content.scrollHeight : 0;
        if (startHeight === targetHeight) {
            content.style.height = details.open ? 'auto' : '0px';
            return;
        }
        content.style.height = `${startHeight}px`;
        requestAnimationFrame(() => {
            content.style.height = `${targetHeight}px`;
        });
        const onTransitionEnd = () => {
            content.style.height = details.open ? 'auto' : '0px';
            content.removeEventListener('transitionend', onTransitionEnd);
        };
        content.addEventListener('transitionend', onTransitionEnd);
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
        this.voiceViews.forEach((view) => {
            view.chart = null;
            view.interactionHandlers = null;
        });
    }

    #resizeCharts() {
        this.voiceViews.forEach((view) => {
            view.chart?.resize?.();
            this.#refreshSeriesPixels(view);
        });
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
