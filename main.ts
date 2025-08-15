import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { PomoTimer, TimerState, PomodoroSettings, DEFAULT_SETTINGS } from './PomoTimer';

export default class PomodoroPlugin extends Plugin {
    settings: PomodoroSettings;
    private timer: PomoTimer;
    private currentMode: TimerState = TimerState.Work;
    private completedPomodoros: number = 0;
    private nextMode: TimerState = TimerState.ShortBreak;
    private isSessionComplete: boolean = false;

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
            (state) => this.onTimerCompletion(state),
            () => this.onTimerComplete()
        );

        this.addSettingTab(new PomodoroSettingTab(this.app, this));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshHeaderButton()));
        this.app.workspace.onLayoutReady(() => this.refreshHeaderButton());

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    onunload() {
        this.removeHeaderButton();
        this.timer.stop();
    }

    async loadSettings() { 
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); 
    }
    
    async saveSettings() { 
        await this.saveData(this.settings); 
        this.timer.updateSettings(this.settings); 
        this.updateUI(0, 0); 
    }

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

        // Event Listeners for Hover and Click
        this.containerEl.addEventListener('mouseenter', this.showPanel);
        this.containerEl.addEventListener('mouseleave', this.hidePanel);
        document.addEventListener('click', this.handleDocumentClick, true);

        const pieButton = this.containerEl.createEl('button', { cls: 'pomodoro-pie-button' });
        pieButton.onclick = (event) => {
            event.stopPropagation();
            if (this.isSessionComplete) {
                this.acknowledgeSessionComplete();
            } else {
                this.isPanelPinned = !this.isPanelPinned;
            }
        };
        
        // SVG Creation
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'pomodoro-pie-chart');
        svg.setAttribute('viewBox', '0 0 20 20');

        const track = document.createElementNS(svgNS, 'circle');
        track.setAttribute('class', 'progress-ring__track');
        track.setAttribute('r', '8'); 
        track.setAttribute('cx', '10'); 
        track.setAttribute('cy', '10');
        track.setAttribute('fill', 'transparent'); 
        track.setAttribute('stroke-width', '3');

        this.pieCircleEl = document.createElementNS(svgNS, 'circle');
        this.pieCircleEl.setAttribute('class', 'progress-ring__circle');
        this.pieCircleEl.setAttribute('r', '8'); 
        this.pieCircleEl.setAttribute('cx', '10'); 
        this.pieCircleEl.setAttribute('cy', '10');
        this.pieCircleEl.setAttribute('fill', 'transparent'); 
        this.pieCircleEl.setAttribute('stroke-width', '3');
        
        svg.append(track, this.pieCircleEl);
        pieButton.appendChild(svg);
        parent.prepend(this.containerEl);
        
        this.createControlPanel();
    }

    private createControlPanel() {
        if (!this.containerEl) return;
        this.controlPanelEl = this.containerEl.createEl('div', { cls: 'pomodoro-control-panel' });
        this.panelModeEl = this.controlPanelEl.createEl('div', { 
            cls: 'pomodoro-panel-mode', 
            attr: { 'title': 'Click to switch mode (only when timer is reset)' } 
        });
        this.panelModeEl.onclick = () => this.handleCycleModeClick();
        
        this.panelTimeEl = this.controlPanelEl.createEl('button', { 
            cls: 'pomodoro-panel-time', 
            attr: { 'title': 'Left click: Play/Pause | Right click: Reset' } 
        });
        this.panelTimeEl.onclick = () => this.handlePauseResumeClick();
        this.panelTimeEl.oncontextmenu = (e) => { 
            e.preventDefault(); 
            this.handleResetClick(); 
        };
    }

    private removeHeaderButton() {
        document.removeEventListener('click', this.handleDocumentClick, true);
        this.containerEl?.remove();
        this.containerEl = this.controlPanelEl = this.pieCircleEl = this.panelTimeEl = this.panelModeEl = null;
        this.isPanelPinned = false;
    }

    private showPanel = () => this.controlPanelEl?.addClass('is-panel-visible');
    private hidePanel = () => { 
        if (!this.isPanelPinned) this.controlPanelEl?.removeClass('is-panel-visible'); 
    };
    private handleDocumentClick = (event: MouseEvent) => {
        if (this.isPanelPinned && this.containerEl && !this.containerEl.contains(event.target as Node)) {
            this.isPanelPinned = false;
            this.hidePanel();
        }
    };

    private updateUI(remainingTime: number, totalTime: number) {
        if (!this.pieCircleEl || !this.panelTimeEl || !this.panelModeEl) return;

        const timerState = this.timer.getState();
        
        // Color logic
        const isWorkMode = this.currentMode === TimerState.Work;
        const color = isWorkMode ? 'var(--interactive-accent)' : '#808080';

        // Update pie chart color and progress
        this.pieCircleEl.style.stroke = color;

        const radius = this.pieCircleEl.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        this.pieCircleEl.style.strokeDasharray = `${circumference} ${circumference}`;

        let offset: number;
        if (timerState === TimerState.Idle) {
            offset = 0;
        } else {
            offset = totalTime > 0 ? circumference * (1 - remainingTime / totalTime) : circumference;
        }
        this.pieCircleEl.style.strokeDashoffset = offset.toString();

        // Add session complete animation
        if (this.isSessionComplete) {
            this.containerEl?.addClass('session-complete');
        } else {
            this.containerEl?.removeClass('session-complete');
        }

        // Update time display
        const minutes = Math.floor(remainingTime / 60).toString().padStart(2, '0');
        const seconds = (remainingTime % 60).toString().padStart(2, '0');
        
        if (timerState === TimerState.Idle) {
            this.panelTimeEl.setText(this.getIdleTimeText());
        } else {
            this.panelTimeEl.setText(`${minutes}:${seconds}`);
        }

        // Update mode display
        this.panelModeEl.setText(this.getModeText());
        this.panelModeEl.style.color = color;

        // Update mode display opacity based on whether it can be changed
        if (timerState === TimerState.Idle && !this.timer.isRunning()) {
            this.panelModeEl.style.opacity = '1';
            this.panelModeEl.style.cursor = 'pointer';
        } else {
            this.panelModeEl.style.opacity = '0.5';
            this.panelModeEl.style.cursor = 'not-allowed';
        }
    }
    
    private getIdleTimeText = (): string => {
        const time = this.currentMode === TimerState.Work 
            ? this.settings.workTime 
            : this.currentMode === TimerState.ShortBreak 
                ? this.settings.shortBreakTime 
                : this.settings.longBreakTime;
        return `${time}:00`;
    };

    private getModeText = (): string => {
        return this.currentMode === TimerState.Work 
            ? 'Focus' 
            : this.currentMode === TimerState.ShortBreak 
                ? 'Short Break' 
                : 'Long Break';
    };

    private handlePauseResumeClick = () => {
        if (this.isSessionComplete) {
            this.acknowledgeSessionComplete();
            return;
        }

        if (this.timer.isRunning() || this.timer.getState() === TimerState.Paused) {
            this.timer.getState() === TimerState.Paused ? this.timer.resume() : this.timer.pause();
        } else {
            this.timer.start(this.currentMode);
        }
    };

    private handleResetClick = () => {
        this.timer.reset();
        this.isSessionComplete = false;
        this.updateUI(0, 0);
    };

    private handleCycleModeClick = () => {
        // Only allow mode change when timer is idle and reset
        if (this.timer.getState() !== TimerState.Idle || this.timer.isRunning()) {
            new Notice('Reset the timer to switch modes');
            return;
        }

        if (this.isSessionComplete) {
            this.acknowledgeSessionComplete();
            return;
        }

        switch (this.currentMode) {
            case TimerState.Work: 
                this.currentMode = TimerState.ShortBreak; 
                break;
            case TimerState.ShortBreak: 
                this.currentMode = TimerState.LongBreak; 
                break;
            case TimerState.LongBreak: 
                this.currentMode = TimerState.Work; 
                break;
        }
        new Notice(`Switched to ${this.getModeText()} mode`);
        this.updateUI(0, 0);
    };

    private onTimerComplete() {
        this.isSessionComplete = true;
        
        // Play sound notification
        if (this.settings.playSound) {
            this.playNotificationSound();
        }

        // Show desktop notification
        if (this.settings.showDesktopNotification) {
            this.showDesktopNotification();
        }

        // Show simple notice without click requirement
        const sessionType = this.getModeText();
        new Notice(`${sessionType} session completed!`, 4000); // 4 second notice

        // Auto-advance to next mode and start if enabled
        this.advanceToNextMode();
        
        // Update UI to show completion state
        this.updateUI(0, 0);

        // Auto-dismiss session complete state after 10 seconds
        setTimeout(() => {
            this.acknowledgeSessionComplete();
        }, 10000);
    }

    

    private playNotificationSound() {
        // Create a more noticeable two-tone sound using Web Audio API
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800 Hz tone
            oscillator.frequency.setValueAtTime(1200, audioContext.currentTime + 0.2); // 1200 Hz tone
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 1);
        } catch (error) {
            console.warn('Could not play notification sound:', error);
        }
    }

    private showDesktopNotification() {
        if ('Notification' in window && Notification.permission === 'granted') {
            const sessionType = this.getModeText();
            const nextSessionType = this.getNextModeText();
            
            const notification = new Notification(`Pomodian - ${sessionType} Complete`, {
                body: `Your ${sessionType.toLowerCase()} session is finished. Next: ${nextSessionType}`,
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIHN0cm9rZT0iIzY2NiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8L3N2Zz4K',
                requireInteraction: false,
                tag: 'pomodoro-timer',
                silent: false
            });

            // Auto-close notification after 5 seconds
            setTimeout(() => {
                notification.close();
            }, 5000);
        }
    }



    private advanceToNextMode() {
        // Calculate next mode based on completed pomodoros
        if (this.currentMode === TimerState.Work) {
            this.completedPomodoros++;
            
            // Check if it's time for a long break
            if (this.completedPomodoros % this.settings.longBreakInterval === 0) {
                this.nextMode = TimerState.LongBreak;
            } else {
                this.nextMode = TimerState.ShortBreak;
            }
        } else {
            // After any break, go back to work
            this.nextMode = TimerState.Work;
        }

        // Auto-start next session if enabled
        if ((this.currentMode === TimerState.Work && this.settings.autoStartBreaks) ||
            (this.currentMode !== TimerState.Work && this.settings.autoStartPomodoros)) {
            
            // Start the next session automatically in the background
            setTimeout(() => {
                if (this.isSessionComplete) {
                    this.currentMode = this.nextMode;
                    this.timer.start(this.currentMode);
                }
            }, 1000);
        }
    }

    private acknowledgeSessionComplete() {
        this.isSessionComplete = false;
        
        // If timer isn't already running (auto-start), switch to next mode
        if (!this.timer.isRunning()) {
            this.currentMode = this.nextMode;
        }
        
        this.updateUI(this.timer.getRemainingTime(), this.timer.getTotalTime());
    }

    private getNextModeText(): string {
        return this.nextMode === TimerState.Work 
            ? 'Focus' 
            : this.nextMode === TimerState.ShortBreak 
                ? 'Short Break' 
                : 'Long Break';
    }

    private onTimerCompletion(state: TimerState) {
        // This method is called when a timer session completes
        // The main logic is now handled in onTimerComplete()
    }
}

class PomodoroSettingTab extends PluginSettingTab {
    plugin: PomodoroPlugin;
    
    constructor(app: App, plugin: PomodoroPlugin) { 
        super(app, plugin); 
        this.plugin = plugin; 
    }
    
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Pomodoro Timer Settings' });
        
        // Time Settings
        new Setting(containerEl)
            .setName('Work time (minutes)')
            .setDesc('Duration of focus sessions')
            .addSlider(slider => slider
                .setLimits(1, 60, 2)
                .setValue(this.plugin.settings.workTime)
                .setDynamicTooltip()
                .onChange(async (value) => { 
                    this.plugin.settings.workTime = value; 
                    await this.plugin.saveSettings(); 
                }));
        
        new Setting(containerEl)
            .setName('Short break time (minutes)')
            .setDesc('Duration of short breaks')
            .addSlider(slider => slider
                .setLimits(1, 30, 1)
                .setValue(this.plugin.settings.shortBreakTime)
                .setDynamicTooltip()
                .onChange(async (value) => { 
                    this.plugin.settings.shortBreakTime = value; 
                    await this.plugin.saveSettings(); 
                }));
        
        new Setting(containerEl)
            .setName('Long break time (minutes)')
            .setDesc('Duration of long breaks')
            .addSlider(slider => slider
                .setLimits(1, 60, 1)
                .setValue(this.plugin.settings.longBreakTime)
                .setDynamicTooltip()
                .onChange(async (value) => { 
                    this.plugin.settings.longBreakTime = value; 
                    await this.plugin.saveSettings(); 
                }));

        new Setting(containerEl)
            .setName('Sessions until long break')
            .setDesc('Number of focus sessions before a long break')
            .addSlider(slider => slider
                .setLimits(2, 10, 1)
                .setValue(this.plugin.settings.longBreakInterval)
                .setDynamicTooltip()
                .onChange(async (value) => { 
                    this.plugin.settings.longBreakInterval = value; 
                    await this.plugin.saveSettings(); 
                }));

        containerEl.createEl('h3', { text: 'Auto-start Settings' });
        
        new Setting(containerEl)
            .setName('Auto-start breaks')
            .setDesc('Automatically start break sessions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStartBreaks)
                .onChange(async (value) => {
                    this.plugin.settings.autoStartBreaks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-start focus sessions')
            .setDesc('Automatically start focus sessions after breaks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStartPomodoros)
                .onChange(async (value) => {
                    this.plugin.settings.autoStartPomodoros = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Notification Settings' });

        new Setting(containerEl)
            .setName('Play sound')
            .setDesc('Play a sound when sessions end')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.playSound)
                .onChange(async (value) => {
                    this.plugin.settings.playSound = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Desktop notifications')
            .setDesc('Show desktop notifications when sessions end')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDesktopNotification)
                .onChange(async (value) => {
                    this.plugin.settings.showDesktopNotification = value;
                    await this.plugin.saveSettings();
                }));
    }
}