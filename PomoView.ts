import { ItemView, WorkspaceLeaf, TextComponent } from "obsidian";
import PomodoroPlugin from "./main";
import { TimerState, PomodoroSettings } from "./PomoTimer";

export const POMO_VIEW_TYPE = "pomodoro-view";

export class PomoView extends ItemView {
    plugin: PomodoroPlugin;

    private timeEl: HTMLElement;
    private startButton: HTMLButtonElement;
    private resetButton: HTMLButtonElement;
    private modeContainer: HTMLElement;


    constructor(leaf: WorkspaceLeaf, plugin: PomodoroPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return POMO_VIEW_TYPE;
    }

    getDisplayText() {
        return "Pomodoro Timer";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Pomodoro Timer" });

        // Timer display
        this.timeEl = container.createEl("div", { cls: "pomodoro-panel-time" });


        // Controls
        const controlsContainer = container.createEl("div", { cls: "pomodoro-controls" });

        this.startButton = controlsContainer.createEl("button", { text: "Start" });
        this.startButton.onclick = () => {
            this.plugin.handlePauseResumeClick();
        };

        this.resetButton = controlsContainer.createEl("button", { text: "Reset" });
        this.resetButton.onclick = () => {
            this.plugin.handleResetClick();
        };

        // Mode selection
        this.modeContainer = container.createEl("div", { cls: "pomodoro-modes" });


        // Statistics
        const statsContainer = container.createEl("div", { cls: "pomodoro-stats" });
        statsContainer.createEl("h5", { text: "Statistics" });

        const statsToggleContainer = statsContainer.createEl("div", { cls: "pomodoro-stats-toggle" });
        const dailyButton = statsToggleContainer.createEl("button", { text: "Today" });
        const weeklyButton = statsToggleContainer.createEl("button", { text: "This Week" });

        const completedSessionsEl = statsContainer.createEl("div");
        const totalFocusTimeEl = statsContainer.createEl("div");

        const updateStats = (period: 'daily' | 'weekly') => {
            const stats = this.plugin.getStats(period);
            completedSessionsEl.setText(`Completed Sessions: ${stats.completedPomodoros}`);
            totalFocusTimeEl.setText(`Focus Time: ${Math.floor(stats.totalFocusTime / 60)}m`);

            if (period === 'daily') {
                dailyButton.addClass('is-active');
                weeklyButton.removeClass('is-active');
            } else {
                weeklyButton.addClass('is-active');
                dailyButton.removeClass('is-active');
            }
        };

        dailyButton.onclick = () => updateStats('daily');
        weeklyButton.onclick = () => updateStats('weekly');

        this.updateModeButtons();
        updateStats('daily'); // initial view

        // Settings
        const settingsContainer = container.createEl("div", { cls: "pomodoro-settings" });
        settingsContainer.createEl("h5", { text: "Settings" });

        const createSetting = (labelText: string, settingKey: keyof PomodoroSettings) => {
            const settingEl = settingsContainer.createEl("div", { cls: "pomodoro-setting" });
            settingEl.createEl("label", { text: labelText });
            const input = new TextComponent(settingEl);
            input.inputEl.type = "number";
            input.setValue(String(this.plugin.settings[settingKey]));
            input.onChange(async (value) => {
                (this.plugin.settings[settingKey] as number) = Number(value);
                await this.plugin.saveSettings();
            });
        };

        createSetting("Focus minutes", "workTime");
        createSetting("Short break minutes", "shortBreakTime");
        createSetting("Long break minutes", "longBreakTime");

        this.plugin.onPomoViewOpen(this);
    }

    async onClose() {
        this.plugin.onPomoViewClose();
    }

    updateTimer(remainingTime: number, totalTime: number, state: TimerState) {
        const minutes = Math.floor(remainingTime / 60).toString().padStart(2, '0');
        const seconds = (remainingTime % 60).toString().padStart(2, '0');

        if (state === TimerState.Idle) {
            this.timeEl.setText(this.plugin.getIdleTimeText());
        } else {
            this.timeEl.setText(`${minutes}:${seconds}`);
        }

        if (state === TimerState.Paused || state === TimerState.Idle) {
            this.startButton.setText("Start");
        } else {
            this.startButton.setText("Pause");
        }
    }

    updateModeButtons() {
        this.modeContainer.empty();
        const modes = [
            { state: TimerState.Work, text: "Focus" },
            { state: TimerState.ShortBreak, text: "Short Break" },
            { state: TimerState.LongBreak, text: "Long Break" },
        ];

        modes.forEach(mode => {
            const button = this.modeContainer.createEl("button", { text: mode.text });
            if (this.plugin.currentMode === mode.state) {
                button.addClass("is-active");
            }
            button.onclick = () => {
                if (this.plugin.timer.getState() === TimerState.Idle) {
                    this.plugin.setMode(mode.state);
                    this.updateModeButtons();
                }
            };
        });
    }
}
