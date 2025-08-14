import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { PomoTimer, TimerState, PomodoroSettings, DEFAULT_SETTINGS } from './PomoTimer';

export default class PomodoroPlugin extends Plugin {
    settings: PomodoroSettings;
    private timer: PomoTimer;
    private currentMode: TimerState = TimerState.Work;
    private completedPomodoros: number = 0;

    // UI Elements
    private containerEl: HTMLDivElement | null = null;
    private controlPanelEl: HTMLDivElement | null = null;
    private pieCircleEl: SVGCircleElement | null = null;
    private panelTimeEl: HTMLButtonElement | null = null;
    private panelModeEl: HTMLDivElement | null = null;
    private isPanelPinned = false;

    async onload() {
        await this.loadSettings();
        this.timer = new PomoTimer(
            this.settings,
            (remaining, total) => this.updateUI(remaining, total),
            (state) => this.onTimerCompletion(state)
        );

        this.addSettingTab(new PomodoroSettingTab(this.app, this));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshHeaderButton()));
        this.app.workspace.onLayoutReady(() => this.refreshHeaderButton());
    }

    onunload() {
        this.removeHeaderButton();
        this.timer.stop();
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); this.timer.updateSettings(this.settings); this.updateUI(0, 0); }

    private refreshHeaderButton() {
        this.removeHeaderButton();
        setTimeout(() => {
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const actionsContainer = activeLeaf.view.containerEl.querySelector('.view-actions');
            if (actionsContainer && !actionsContainer.querySelector('.pomodoro-container')) {
                this.createHeaderButton(actionsContainer);
                this.updateUI(0, 0);
            }
        }, 0);
    }

    private createHeaderButton(parent: Element) {
        this.containerEl = parent.createEl('div', { cls: 'pomodoro-container' });

        // --- Event Listeners for Hover and Click ---
        this.containerEl.addEventListener('mouseenter', this.showPanel);
        this.containerEl.addEventListener('mouseleave', this.hidePanel);
        // A global listener to hide the panel when clicking elsewhere
        document.addEventListener('click', this.handleDocumentClick, true); // Use capture phase

        const pieButton = this.containerEl.createEl('button', { cls: 'pomodoro-pie-button' });
        pieButton.onclick = (event) => {
            event.stopPropagation(); // Prevents the document click listener from firing
            this.isPanelPinned = !this.isPanelPinned;
        };
        
        // --- SVG Creation (No Center Text) ---
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'pomodoro-pie-chart');
        svg.setAttribute('viewBox', '0 0 20 20');

        const track = document.createElementNS(svgNS, 'circle');
        track.setAttribute('class', 'progress-ring__track');
        track.setAttribute('r', '8'); track.setAttribute('cx', '10'); track.setAttribute('cy', '10');
        track.setAttribute('fill', 'transparent'); track.setAttribute('stroke-width', '3');

        this.pieCircleEl = document.createElementNS(svgNS, 'circle');
        this.pieCircleEl.setAttribute('class', 'progress-ring__circle');
        this.pieCircleEl.setAttribute('r', '8'); this.pieCircleEl.setAttribute('cx', '10'); this.pieCircleEl.setAttribute('cy', '10');
        this.pieCircleEl.setAttribute('fill', 'transparent'); this.pieCircleEl.setAttribute('stroke-width', '3');
        
        svg.append(track, this.pieCircleEl);
        pieButton.appendChild(svg);
        parent.prepend(this.containerEl);
        
        this.createControlPanel();
    }

    private createControlPanel() {
        if (!this.containerEl) return;
        this.controlPanelEl = this.containerEl.createEl('div', { cls: 'pomodoro-control-panel' });
        this.panelModeEl = this.controlPanelEl.createEl('div', { cls: 'pomodoro-panel-mode', attr: { 'title': 'Click to switch mode' } });
        this.panelModeEl.onclick = () => this.handleCycleModeClick();
        
        this.panelTimeEl = this.controlPanelEl.createEl('button', { cls: 'pomodoro-panel-time', attr: { 'title': 'Left click: Play/Pause | Right click: Reset' } });
        this.panelTimeEl.onclick = () => this.handlePauseResumeClick();
        this.panelTimeEl.oncontextmenu = (e) => { e.preventDefault(); this.handleResetClick(); };
    }

    private removeHeaderButton() {
        document.removeEventListener('click', this.handleDocumentClick, true);
        this.containerEl?.remove();
        this.containerEl = this.controlPanelEl = this.pieCircleEl = this.panelTimeEl = this.panelModeEl = null;
        this.isPanelPinned = false;
    }

    // --- Panel Visibility Logic ---
    private showPanel = () => this.controlPanelEl?.addClass('is-panel-visible');
    private hidePanel = () => { if (!this.isPanelPinned) this.controlPanelEl?.removeClass('is-panel-visible'); };
    private handleDocumentClick = (event: MouseEvent) => {
        if (this.isPanelPinned && this.containerEl && !this.containerEl.contains(event.target as Node)) {
            this.isPanelPinned = false;
            this.hidePanel();
        }
    };

    // In main.ts, replace the entire updateUI function with this one

// In main.ts, replace the entire updateUI function with this one.

private updateUI(remainingTime: number, totalTime: number) {
    // Ensure UI elements exist before proceeding
    if (!this.pieCircleEl || !this.panelTimeEl || !this.panelModeEl) return;

    const timerState = this.timer.getState();
    
    // --- FIX: Re-implement the color logic directly here ---
    const isWorkMode = this.currentMode === TimerState.Work;
    const color = isWorkMode ? 'var(--interactive-accent)' : '#808080'; // Use accent for focus, gray for breaks

    // Update pie chart color and progress
    this.pieCircleEl.style.stroke = color;

    const radius = this.pieCircleEl.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    this.pieCircleEl.style.strokeDasharray = `${circumference} ${circumference}`;

    let offset: number;
    if (timerState === TimerState.Idle) {
        offset = 0; // Pie chart is full when idle
    } else {
        // As time passes, the offset increases, "emptying" the circle
        offset = totalTime > 0 ? circumference * (1 - remainingTime / totalTime) : circumference;
    }
    this.pieCircleEl.style.strokeDashoffset = offset.toString();

    // Update time display in the panel
    const minutes = Math.floor(remainingTime / 60).toString().padStart(2, '0');
    const seconds = (remainingTime % 60).toString().padStart(2, '0');
    
    if (timerState === TimerState.Idle) {
        this.panelTimeEl.setText(this.getIdleTimeText());
    } else {
        this.panelTimeEl.setText(`${minutes}:${seconds}`);
    }

    // Update mode display text and color in the panel
    this.panelModeEl.setText(this.getModeText());
    this.panelModeEl.style.color = color;
}
    
    // --- Helper Text & Color Functions ---
    private getIdleTimeText = (): string => `${(this.currentMode === TimerState.Work ? this.settings.workTime : this.currentMode === TimerState.ShortBreak ? this.settings.shortBreakTime : this.settings.longBreakTime)}:00`;
    private getModeText = (): string => this.currentMode === TimerState.Work ? 'Focus' : this.currentMode === TimerState.ShortBreak ? 'Short Break' : 'Long Break';

    // --- Click Handlers ---
    private handlePauseResumeClick = () => {
        if (this.timer.isRunning() || this.timer.getState() === TimerState.Paused) {
            this.timer.getState() === TimerState.Paused ? this.timer.resume() : this.timer.pause();
        } else {
            this.timer.start(this.currentMode);
        }
    };
    private handleResetClick = () => this.timer.stop();
    private handleCycleModeClick = () => {
        if (this.timer.isRunning()) { new Notice('Stop the timer to switch modes'); return; }
        switch (this.currentMode) {
            case TimerState.Work: this.currentMode = TimerState.ShortBreak; break;
            case TimerState.ShortBreak: this.currentMode = TimerState.LongBreak; break;
            case TimerState.LongBreak: this.currentMode = TimerState.Work; break;
        }
        new Notice(`Switched to ${this.getModeText()} mode`);
        this.updateUI(0, 0);
    };
    
    // --- Timer Completion Logic ---
    private onTimerCompletion(state: TimerState) {
        // ... (this function remains the same)
        if (this.settings.playSound) { /* ... play sound ... */ }
    }
}


// --- The PomodoroSettingTab Class remains the same ---
class PomodoroSettingTab extends PluginSettingTab {
    plugin: PomodoroPlugin;
    constructor(app: App, plugin: PomodoroPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Pomodoro Timer Settings' });
        new Setting(containerEl)
            .setName('Work time (minutes)')
            .addSlider(slider => slider.setLimits(1, 60, 1).setValue(this.plugin.settings.workTime).setDynamicTooltip()
            .onChange(async (value) => { this.plugin.settings.workTime = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('Short break time (minutes)')
            .addSlider(slider => slider.setLimits(1, 30, 1).setValue(this.plugin.settings.shortBreakTime).setDynamicTooltip()
            .onChange(async (value) => { this.plugin.settings.shortBreakTime = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('Long break time (minutes)')
            .addSlider(slider => slider.setLimits(1, 60, 1).setValue(this.plugin.settings.longBreakTime).setDynamicTooltip()
            .onChange(async (value) => { this.plugin.settings.longBreakTime = value; await this.plugin.saveSettings(); }));
    }
}